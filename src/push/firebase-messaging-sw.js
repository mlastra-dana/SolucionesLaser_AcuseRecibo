import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import { getFirebaseConfig } from './firebaseConfig';
import { recordPushEvent } from './eventStore';
import { normalizeNotification } from './normalizeNotification';
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

const shownMessageIds = new Set();
async function showObservedNotification(payload) {
  const messageId = payload.messageId ?? payload.fcmMessageId;
  if (messageId && shownMessageIds.has(messageId)) return;
  // One worker arbitrates requests from all tabs, including concurrent foreground callbacks.
  if (messageId) {
    shownMessageIds.add(messageId);
    if (shownMessageIds.size > 100) shownMessageIds.delete(shownMessageIds.values().next().value);
  }
  try {
    if (messageId && self.registration.getNotifications) {
      const existing = await self.registration.getNotifications({ tag: messageId });
      if (existing.length) return;
    }
    const details = normalizeNotification(payload);
    await self.registration.showNotification(details.title, {
      body: details.body,
      icon: payload.notification?.icon || payload.data?.icon || '/pwa/icon-192.png',
      ...(details.image ? { image: details.image } : {}),
      tag: messageId,
      data: { danaPayload: payload }
    });
  } catch (error) {
    if (messageId) shownMessageIds.delete(messageId);
    throw error;
  }
}

self.addEventListener('message', event => {
  if (event.data?.source !== 'DANA_PUSH_PAGE' || event.data?.type !== 'SHOW_FOREGROUND_NOTIFICATION') return;
  const payload = event.data.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  try {
    if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
  } catch { return; }
  // Receipt was already recorded by onMessage. Displaying it is not another delivery event.
  event.waitUntil(showObservedNotification(payload).catch(() => {}));
});

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
      await showObservedNotification(payload);
    }
  });
}
