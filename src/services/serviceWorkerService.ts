let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

export function registerSharedWorker(): Promise<ServiceWorkerRegistration> {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    return Promise.reject(new Error('El Service Worker requiere HTTPS y un navegador compatible.'));
  }
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/', updateViaCache: 'none'
    }).then(async registration => {
      await waitForActivation(registration);
      return registration;
    }).catch(error => {
      registrationPromise = null;
      throw error;
    });
  }
  return registrationPromise;
}

function waitForActivation(registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.active && !registration.installing && !registration.waiting) return Promise.resolve();
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
