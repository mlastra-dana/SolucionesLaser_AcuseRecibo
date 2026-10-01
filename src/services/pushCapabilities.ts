import { isSupported } from 'firebase/messaging';
import { isAppleMobile, isStandalone } from '../push/platform';

export type PushCapabilities = {
  notifications: boolean;
  pushApi: boolean;
  serviceWorker: boolean;
  firebase: boolean;
  supported: boolean;
  reason?: 'insecure' | 'install-required' | 'browser' | 'firebase';
};

// Capability checks stay separate from registration so a standard Web Push adapter can be added later.
export async function getPushCapabilities(): Promise<PushCapabilities> {
  const capabilities: PushCapabilities = {
    notifications: 'Notification' in window,
    pushApi: 'PushManager' in window,
    serviceWorker: 'serviceWorker' in navigator,
    firebase: false, supported: false
  };
  if (!window.isSecureContext) return { ...capabilities, reason: 'insecure' };
  if (isAppleMobile() && !isStandalone()) return { ...capabilities, reason: 'install-required' };
  if (!capabilities.notifications || !capabilities.pushApi || !capabilities.serviceWorker) return { ...capabilities, reason: 'browser' };
  try { capabilities.firebase = await isSupported(); } catch { capabilities.firebase = false; }
  capabilities.supported = capabilities.firebase;
  return { ...capabilities, reason: capabilities.supported ? undefined : 'firebase' };
}

export function pushUnavailableMessage(reason?: PushCapabilities['reason']) {
  if (reason === 'insecure') return 'Las notificaciones requieren HTTPS o localhost. Abre el enlace seguro de la demo.';
  if (reason === 'install-required') return 'En iPhone o iPad, añade esta página a la pantalla de inicio y abre la aplicación instalada para comprobar la compatibilidad Push.';
  if (isStandalone()) return 'Tu aplicación se instaló correctamente, pero el registro Push mediante Firebase no está disponible en este entorno.';
  return 'El registro Push mediante Firebase no está disponible en este navegador. Prueba con Chrome actualizado fuera del modo privado.';
}
