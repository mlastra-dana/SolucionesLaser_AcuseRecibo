import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import { getFirebaseConfig } from './firebaseConfig';
import { recordPushEvent } from './eventStore';
import { normalizeNotification } from './normalizeNotification';
import { getTrackingVersion, notificationIdentity, safePushPayload, trackingFields } from './pushPayload';
import { queuePushReceipt, queuePushEvent, flushPushReceipts } from './receiptTracking';
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
function supportsNotificationActions() {
  try { return typeof Notification !== 'undefined' && Number.isFinite(Notification.maxActions) && Notification.maxActions > 0; }
  catch { return false; }
}

// Credentials live in IndexedDB. Native data contains only correlation and display/CTA fields.
function nativePayload(payload, details) {
  const safe = safePushPayload(payload);
  return {
    messageId: payload.messageId ?? payload.fcmMessageId,
    danaTrackingVersion: getTrackingVersion(payload),
    danaCredentialDetected: safe.danaCredentialDetected === true,
    notification: { title: details.title, body: details.body },
    data: { push_ref: trackingFields(payload).pushRef,
      ...(details.image ? { IMAGEN: details.image } : {}),
      ...(details.cta ? { cta_label: details.cta.label, cta_action: details.cta.action, cta_url: details.cta.url } : {}) }
  };
}

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
      ...(details.cta && supportsNotificationActions()
        ? { actions: [{ action: details.cta.action, title: details.cta.label }] } : {}),
      data: { danaPayload: nativePayload(payload, details) }
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

async function track(type, payload, timestamp, accion = '') {
  const normalized = { ...payload, messageId: payload.messageId ?? payload.fcmMessageId };
  try { await recordPushEvent(type, 'background', normalized, timestamp, accion); } catch { /* Tracking must not prevent a notification. */ }
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach(client => client.postMessage({ source: 'DANA_PUSH_WORKER', type, payload: safePushPayload(normalized) }));
}

function notificationUrl(payload) {
  const url = new URL('/', self.location.origin);
  const identity = notificationIdentity(payload);
  if (identity) url.searchParams.set('notification', identity);
  return url.href;
}

// Install before getMessaging, so our click handling owns both automatic and data-only notifications.
self.addEventListener('notificationclick', event => {
  const payload = event.notification.data?.FCM_MSG ?? event.notification.data?.danaPayload;
  if (!payload) return;
  event.stopImmediatePropagation();
  event.notification.close();
  const timestamp = new Date().toISOString();
  const details = normalizeNotification(payload);
  const cta = details.cta && event.action === details.cta.action ? details.cta : undefined;
  const normalized = { ...payload, messageId: payload.messageId ?? payload.fcmMessageId };
  event.waitUntil((async () => {
    const persistence = (async () => {
      const type = cta ? 'PUSH_CLICKED' : 'PUSH_OPENED';
      const action = cta?.action ?? '';
      await queuePushEvent(type, normalized, timestamp, action).catch(() => {});
      await track(type, normalized, timestamp, action).catch(() => {});
    })();
    const reporting = persistence.then(() => flushPushReceipts().catch(() => {}));
    const navigation = (async () => {
      // The app must find the matching persisted detail before it is opened, too.
      await persistence;
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const target = cta ? cta.url : notificationUrl(payload);
      const client = clients.find(item => new URL(item.url).origin === new URL(target).origin);
      if (client) {
        try { if (client.url !== target && client.navigate) await client.navigate(target); }
        finally { await client.focus(); }
      } else await self.clients.openWindow(target);
    })();
    // Navigation never waits for the network; waitUntil keeps durable reporting alive independently.
    await Promise.allSettled([reporting, navigation]);
  })());
});

const config = getFirebaseConfig();
if (config.apiKey && config.projectId === 'dana-push-demo-vzla' && config.appId && config.messagingSenderId) {
  const messaging = getMessaging(initializeApp(config));
  onBackgroundMessage(messaging, async payload => {
    const receivedAt = new Date().toISOString();
    const normalized = { ...payload, messageId: payload.messageId ?? payload.fcmMessageId };
    await queuePushReceipt(normalized, receivedAt).catch(() => {});
    await track('PUSH_RECEIVED', payload, receivedAt);
    // Firebase displays notification payloads automatically. Only render data-only messages ourselves.
    if (!payload.notification) {
      await showObservedNotification(payload);
    }
    // Keep the worker alive for reporting, after preserving the existing notification display.
    await flushPushReceipts().catch(() => {});
  });
}
