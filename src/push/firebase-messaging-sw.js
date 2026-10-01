import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import { getFirebaseConfig } from './firebaseConfig';
import { recordPushEvent } from './eventStore';

async function track(type, payload) {
  const normalized = { ...payload, messageId: payload.messageId ?? payload.fcmMessageId };
  try { await recordPushEvent(type, 'background', normalized); } catch { /* Tracking must not prevent a notification. */ }
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => client.postMessage({ source: 'DANA_PUSH_WORKER', type, payload }));
}

// Install before getMessaging, so our click handling owns both automatic and data-only notifications.
self.addEventListener('notificationclick', event => {
  const payload = event.notification.data?.FCM_MSG ?? event.notification.data?.danaPayload;
  if (!payload) return;
  event.stopImmediatePropagation();
  event.notification.close();
  event.waitUntil((async () => {
    await track('PUSH_CLICKED', payload);
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = clients.find(item => new URL(item.url).origin === self.location.origin);
    const opened = client ? await client.focus() : await self.clients.openWindow(self.location.origin + '/');
    if (opened) await track('PUSH_OPENED', payload);
  })());
});

const config = getFirebaseConfig();
if (config.apiKey && config.projectId === 'dana-push-demo-vzla' && config.appId && config.messagingSenderId) {
  const messaging = getMessaging(initializeApp(config));
  onBackgroundMessage(messaging, async payload => {
    await track('PUSH_RECEIVED', payload);
    // Firebase displays notification payloads automatically. Only render data-only messages ourselves.
    if (!payload.notification) {
      await self.registration.showNotification(payload.data?.title || 'DANAconnect', {
        body: payload.data?.body || 'Has recibido una nueva notificación.',
        icon: '/push-notification.png',
        tag: payload.messageId,
        data: { danaPayload: payload }
      });
    }
  });
}
