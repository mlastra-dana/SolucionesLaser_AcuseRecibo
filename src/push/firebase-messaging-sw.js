import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import { getFirebaseConfig } from './firebaseConfig';
import { recordPushEvent } from './eventStore';
import { setCacheNameDetails } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

// Vite injects only the app shell and public icons. No Firebase requests, tokens or visitor data are cached.
const precache = __DANA_PRECACHE__;
if (precache.length) {
  setCacheNameDetails({ prefix: 'dana-push' });
  precacheAndRoute(precache);
  cleanupOutdatedCaches();
  registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    allowlist: [/^\/(?:\?.*)?$/]
  }));
}

// Activate the newly compiled Firebase configuration instead of retaining a worker from the previous deployment.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

async function track(type, payload) {
  const normalized = { ...payload, messageId: payload.messageId ?? payload.fcmMessageId };
  try { await recordPushEvent(type, 'background', normalized); } catch { /* Tracking must not prevent a notification. */ }
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => client.postMessage({ source: 'DANA_PUSH_WORKER', type, payload: normalized }));
}

function notificationUrl(payload) {
  const link = payload.fcmOptions?.link ?? payload.fcm_options?.link ?? payload.data?.url ?? payload.data?.link ?? payload.data?.click_action ?? payload.notification?.click_action;
  try {
    const url = new URL(link || '/', self.location.origin);
    if (url.protocol === 'https:') return url.href;
  } catch { /* Fall back to the landing if the supplied URL is invalid. */ }
  return self.location.origin + '/';
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
    const target = notificationUrl(payload);
    const client = clients.find(item => new URL(item.url).origin === new URL(target).origin);
    let opened;
    if (client) {
      if (client.url !== target && client.navigate) await client.navigate(target);
      opened = await client.focus();
    } else opened = await self.clients.openWindow(target);
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
        icon: payload.data?.icon || '/pwa/icon-192.png',
        ...(payload.data?.image ? { image: payload.data.image } : {}),
        tag: payload.messageId,
        data: { danaPayload: payload }
      });
    }
  });
}
