import { getApps, initializeApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from 'firebase/messaging';
import { validateFirebaseConfig } from '../push/firebaseConfig';
import { recordPushEvent } from '../push/eventStore';
import { queuePushReceipt, flushPushReceipts } from '../push/receiptTracking';
import { registerSharedWorker } from './serviceWorkerService';
import { getPushCapabilities, pushUnavailableMessage, type PushCapabilities } from './pushCapabilities';

function getPushMessaging() {
  const config = validateFirebaseConfig();
  const existing = getApps().find(item => item.name === 'dana-push-experience');
  if (existing && (existing.options.appId !== config.appId || existing.options.projectId !== config.projectId)) {
    throw new Error('La configuración Firebase cambió. Recarga la página para conectar con la aplicación actual.');
  }
  return getMessaging(existing ?? initializeApp(config, 'dana-push-experience'));
}

function subscribe(onPayload: (payload: MessagePayload) => void) {
  return onMessage(getPushMessaging(), async payload => {
    if ((payload as MessagePayload & { messageType?: string }).messageType === 'notification-clicked') return;
    const receivedAt = new Date().toISOString();
    await queuePushReceipt(payload as unknown as Record<string, unknown>, receivedAt).catch(() => {});
    await recordPushEvent('PUSH_RECEIVED', 'foreground', payload as unknown as Record<string, unknown>).catch(() => {});
    onPayload(payload);
    if (Notification.permission === 'granted') {
      // Forward only onMessage receipts, never worker click events or restored history entries.
      try {
        const registration = await registerSharedWorker();
        registration.active?.postMessage({ source: 'DANA_PUSH_PAGE', type: 'SHOW_FOREGROUND_NOTIFICATION', payload });
      } catch { /* Keep the observed message available in the app if system display is unavailable. */ }
    }
    void flushPushReceipts().catch(() => {});
  });
}

// Reconnect an already authorized browser without requesting permission or generating a token on page load.
export async function listenForPushMessages(onPayload: (payload: MessagePayload) => void, shouldSubscribe = () => true) {
  if (!window.isSecureContext || !('Notification' in window) || Notification.permission !== 'granted') return null;
  if (!(await isSupported())) return null;
  if (!shouldSubscribe()) return null;
  return subscribe(onPayload);
}

export async function getPushDiagnostics() {
  let registration: ServiceWorkerRegistration | undefined;
  if ('serviceWorker' in navigator) {
    registration = await navigator.serviceWorker.getRegistration('/');
  }
  const worker = registration?.active ?? registration?.installing ?? registration?.waiting;
  return {
    permission: 'Notification' in window ? Notification.permission : 'unsupported',
    workerState: worker?.state ?? 'not-registered',
    workerScript: worker?.scriptURL,
    workerScope: registration?.scope
  };
}
export type PushDiagnostics = Awaited<ReturnType<typeof getPushDiagnostics>>;

export async function registerPushBrowser(onPayload: (payload: MessagePayload) => void, knownCapabilities?: PushCapabilities, onStage?: (stage: 'Conectando con Firebase' | 'Registrando dispositivo') => void) {
  onStage?.('Conectando con Firebase');
  const capabilities = knownCapabilities ?? await getPushCapabilities();
  if (!capabilities.supported) throw new Error(pushUnavailableMessage(capabilities.reason));
  validateFirebaseConfig();
  if (Notification.permission === 'denied') throw new Error('Las notificaciones están bloqueadas. En Chrome, abre los controles del sitio junto a la dirección, permite las notificaciones y recarga la página.');
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Rechazaste las notificaciones. Para continuar, permite las notificaciones en la configuración de este sitio y vuelve a intentarlo.'
      : 'No concediste el permiso. Vuelve a intentarlo y selecciona Permitir para preparar tu navegador.');
  }
  onStage?.('Registrando dispositivo');
  const registration = await registerSharedWorker();
  const messaging = getPushMessaging();
  const unsubscribe = subscribe(onPayload);
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
