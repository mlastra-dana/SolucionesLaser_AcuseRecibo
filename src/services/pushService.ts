import { getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from 'firebase/messaging';
import { validateFirebaseConfig } from '../push/firebaseConfig';
import { recordPushEvent } from '../push/eventStore';

export async function registerPushBrowser(onPayload: (payload: MessagePayload) => void) {
  if (!window.isSecureContext) throw new Error('Las notificaciones requieren HTTPS o localhost. Abre el enlace seguro de la demo.');
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Este navegador no admite notificaciones Push. Prueba con Chrome actualizado.');
  }
  const config = validateFirebaseConfig();
  if (!(await isSupported())) throw new Error('Firebase Messaging no está disponible en este navegador. Prueba con Chrome fuera del modo privado.');
  if (Notification.permission === 'denied') throw new Error('Las notificaciones están bloqueadas. En Chrome, abre los controles del sitio junto a la dirección, permite las notificaciones y recarga la página.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Rechazaste las notificaciones. Para continuar, permite las notificaciones en la configuración de este sitio y vuelve a intentarlo.'
      : 'No concediste el permiso. Vuelve a intentarlo y selecciona Permitir para preparar tu navegador.');
  }
  const app = getApps().find(item => item.name === 'dana-push-experience') ?? initializeApp(config, 'dana-push-experience');
  const messaging = getMessaging(app);
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/', updateViaCache: 'none' });
  await waitForActivation(registration);
  const unsubscribe = onMessage(messaging, async payload => {
    // Firebase can forward a clicked background notification to onMessage. That is not a new receipt.
    if ((payload as MessagePayload & { messageType?: string }).messageType === 'notification-clicked') return;
    await recordPushEvent('PUSH_RECEIVED', 'foreground', payload as unknown as Record<string, unknown>).catch(() => {});
    onPayload(payload);
  });
  try {
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration
    });
    if (!token || /\s/.test(token)) throw new Error('Firebase no devolvió un token válido. Revisa la configuración pública y vuelve a intentarlo.');
    return { token, unsubscribe };
  } catch (error) {
    unsubscribe();
    const code = (error as { code?: string }).code;
    if (code) throw new Error(`No pudimos registrar el navegador en Firebase (${code}). Revisa la clave VAPID, la configuración del proyecto y la conexión.`);
    throw error;
  }
}

function waitForActivation(registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.active) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const worker = registration.installing ?? registration.waiting;
    if (!worker) { reject(new Error('No se pudo iniciar el Service Worker de notificaciones.')); return; }
    const timeout = window.setTimeout(() => finish(new Error('El Service Worker tardó demasiado en activarse. Recarga e inténtalo de nuevo.')), 15000);
    const changed = () => {
      if (worker.state === 'activated') finish();
      if (worker.state === 'redundant') finish(new Error('El Service Worker no pudo activarse.'));
    };
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      worker.removeEventListener('statechange', changed);
      if (error) reject(error); else resolve();
    };
    worker.addEventListener('statechange', changed);
    changed();
  });
}
