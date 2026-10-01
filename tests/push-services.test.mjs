import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const config = {
  VITE_FIREBASE_API_KEY: 'test-public-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'dana-push-demo-vzla.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'dana-push-demo-vzla',
  VITE_FIREBASE_STORAGE_BUCKET: 'test-bucket',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
  VITE_FIREBASE_APP_ID: 'test-app',
  VITE_FIREBASE_VAPID_KEY: 'test-public-vapid'
};

async function fixture(worker = false, overrides = {}) {
  const h = {
    supported: true, requested: 0, permissionResult: 'granted', token: 'test-fcm-token',
    unsubscribeCount: 0, events: [], notices: [], clients: [], listeners: {}, apps: [], initializationCount: 0,
    async record(type, context, payload) { h.events.push({ type, context, payload }); }
  };
  const modules = {
    'firebase/app': 'export const getApps = () => h.apps; export const initializeApp = (config, name = "[DEFAULT]") => { h.initializationCount++; const app = { name, options: config }; h.apps.push(app); return app; };',
    'firebase/messaging': `export const isSupported = async () => h.supported;
      export const getMessaging = app => app;
      export const onMessage = (_app, fn) => { h.foreground = fn; return () => h.unsubscribeCount++; };
      export const getToken = async (_app, options) => { h.options = options; if (h.tokenError) throw h.tokenError; return h.token; };`,
    'firebase/messaging/sw': 'export const getMessaging = app => app; export const onBackgroundMessage = (_app, fn) => { h.background = fn; };',
    'event-store': 'export const recordPushEvent = (...args) => h.record(...args);'
  };
  const result = await build({
    stdin: {
      contents: worker ? "import './src/push/firebase-messaging-sw.js'" : "import * as api from './src/services/pushService'; import * as dana from './src/services/danaService'; globalThis.api = api; globalThis.dana = dana;",
      resolveDir: process.cwd(), loader: 'ts'
    },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env': JSON.stringify({ ...config, ...overrides }) },
    plugins: [{ name: 'explicit-test-doubles', setup(builder) {
      builder.onResolve({ filter: /^firebase\// }, args => ({ path: args.path, namespace: 'test-double' }));
      builder.onResolve({ filter: /eventStore$/ }, () => ({ path: 'event-store', namespace: 'test-double' }));
      builder.onLoad({ filter: /.*/, namespace: 'test-double' }, args => ({ contents: modules[args.path], loader: 'js' }));
    } }]
  });
  const notification = { permission: 'default', requestPermission: async () => { h.requested++; return h.permissionResult; } };
  const context = vm.createContext({
    h, console, setTimeout, clearTimeout, URL,
    Notification: notification,
    window: { isSecureContext: true, Notification: notification, PushManager: {}, setTimeout },
    navigator: { serviceWorker: { getRegistration: async () => h.workerRegistration, register: async (url, options) => { h.registration = { url, options }; return { active: {} }; } } },
    self: {
      skipWaiting: async () => { h.skippedWaiting = true; },
      location: { origin: 'https://demo.example' },
      addEventListener: (type, fn) => { h.listeners[type] = fn; },
      registration: { showNotification: async (...args) => h.notices.push(args) },
      clients: { claim: async () => { h.claimed = true; }, matchAll: async () => h.clients, openWindow: async url => { h.openedUrl = url; return {}; } }
    }
  });
  vm.runInContext(result.outputFiles[0].text, context);
  return { h, context };
}

test('FCM registration uses permission, explicit worker and VAPID, with no DANA call', async () => {
  const { h, context } = await fixture();
  const received = [];
  const registration = await context.api.registerPushBrowser(payload => received.push(payload));
  assert.equal(registration.token, 'test-fcm-token');
  assert.equal(h.requested, 1);
  assert.equal(h.registration.url, '/firebase-messaging-sw.js');
  assert.equal(h.options.vapidKey, config.VITE_FIREBASE_VAPID_KEY);
  assert.ok(h.options.serviceWorkerRegistration.active);
  assert.equal(h.initializationCount, 1);
  await h.foreground({ messageId: 'm1', notification: { title: 'Real callback fixture' } });
  assert.equal(h.events[0].type, 'PUSH_RECEIVED');
  assert.equal(h.events[0].context, 'foreground');
  assert.equal(received.length, 1);
  await h.foreground({ messageType: 'notification-clicked', messageId: 'm1' });
  assert.equal(received.length, 1);
  registration.unsubscribe();
  assert.equal(h.unsubscribeCount, 1);
  const result = await context.dana.registerPushVisitor({ nombre: 'Maria', apellido: 'Lastra', token: registration.token, source: 'DANA_PUSH_EXPERIENCE' });
  assert.equal(result.status, 'pending');
});

test('missing Firebase configuration never prompts permission', async () => {
  const { h, context } = await fixture(false, { VITE_FIREBASE_API_KEY: '' });
  await assert.rejects(context.api.registerPushBrowser(() => {}), /configuración de Firebase está pendiente/);
  assert.equal(h.requested, 0);
});

test('insecure and unsupported browsers never prompt permission', async () => {
  const { h, context } = await fixture();
  context.window.isSecureContext = false;
  await assert.rejects(context.api.registerPushBrowser(() => {}), /HTTPS/);
  context.window.isSecureContext = true;
  h.supported = false;
  await assert.rejects(context.api.registerPushBrowser(() => {}), /no está disponible/);
  assert.equal(h.requested, 0);
});

test('blocked, rejected and dismissed permissions return actionable errors', async () => {
  const { h, context } = await fixture();
  context.Notification.permission = 'denied';
  await assert.rejects(context.api.registerPushBrowser(() => {}), /bloqueadas/);
  assert.equal(h.requested, 0);
  context.Notification.permission = 'default';
  h.permissionResult = 'denied';
  await assert.rejects(context.api.registerPushBrowser(() => {}), /Rechazaste/);
  h.permissionResult = 'default';
  await assert.rejects(context.api.registerPushBrowser(() => {}), /No concediste/);
});

test('empty token and SDK errors clean up the foreground listener', async () => {
  const { h, context } = await fixture();
  h.token = '';
  await assert.rejects(context.api.registerPushBrowser(() => {}), /token válido/);
  assert.equal(h.unsubscribeCount, 1);
  h.tokenError = { code: 'messaging/token-subscribe-failed' };
  await assert.rejects(context.api.registerPushBrowser(() => {}), /messaging\/token-subscribe-failed/);
  assert.equal(h.unsubscribeCount, 2);
});

test('background notification payload is tracked without a duplicate display', async () => {
  const { h } = await fixture(true);
  await h.background({ messageId: 'm1', notification: { title: 'Notification fixture' } });
  assert.equal(h.events[0].type, 'PUSH_RECEIVED');
  assert.equal(h.events[0].context, 'background');
  assert.equal(h.notices.length, 0);
});

test('data-only background payload shows one notification and remains clickable', async () => {
  const { h } = await fixture(true);
  const payload = { messageId: 'm2', data: { title: 'Data fixture', body: 'Test' } };
  await h.background(payload);
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0][0], 'Data fixture');
  assert.equal(h.notices[0][1].data.danaPayload.messageId, 'm2');
  let completed;
  let stopped = false;
  h.listeners.notificationclick({
    notification: { data: h.notices[0][1].data, close() {} },
    stopImmediatePropagation() { stopped = true; }, waitUntil(promise) { completed = promise; }
  });
  await completed;
  assert.ok(stopped);
  assert.equal(h.openedUrl, 'https://demo.example/');
  assert.deepEqual(h.events.map(item => item.type), ['PUSH_RECEIVED', 'PUSH_CLICKED', 'PUSH_OPENED']);
});

test('automatic FCM notification click normalizes message ID and focuses existing window', async () => {
  const { h } = await fixture(true);
  let focused = false;
  h.clients = [{ url: 'https://demo.example/', postMessage() {}, async focus() { focused = true; return this; } }];
  let completed;
  h.listeners.notificationclick({
    notification: { data: { FCM_MSG: { fcmMessageId: 'm3', notification: { title: 'Automatic fixture' } } }, close() {} },
    stopImmediatePropagation() {}, waitUntil(promise) { completed = promise; }
  });
  await completed;
  assert.ok(focused);
  assert.equal(h.events[0].payload.messageId, 'm3');
  assert.equal(h.events[1].type, 'PUSH_OPENED');
});

test('failed local tracking does not suppress data-only notifications', async () => {
  const { h } = await fixture(true);
  h.record = async () => { throw new Error('Storage unavailable'); };
  await h.background({ messageId: 'm4', data: { title: 'Fixture' } });
  assert.equal(h.notices.length, 1);
});

test('future DANA URL still cannot initiate a conversation in phase 1', async () => {
  const { context } = await fixture(false, { VITE_DANA_PUSH_API_URL: 'https://intermediary.example' });
  const result = await context.dana.registerPushVisitor({ nombre: 'A', apellido: 'B', token: 'test', source: 'DANA_PUSH_EXPERIENCE' });
  assert.equal(result.status, 'pending');
  assert.equal(result.endpointConfigured, true);
  await assert.rejects(context.dana.registerPushVisitor({ nombre: '', apellido: 'B', token: 'test' }), /requiere/);
});

test('already granted browsers reconnect foreground reception without permission or token requests', async () => {
  const { h, context } = await fixture();
  assert.equal(await context.api.listenForPushMessages(() => {}), null);
  assert.equal(h.initializationCount, 0);
  context.Notification.permission = 'granted';
  const received = [];
  const stop = await context.api.listenForPushMessages(payload => received.push(payload));
  await h.foreground({ messageId: 'reopened', notification: { title: 'Reopened fixture' } });
  assert.equal(received.length, 1);
  assert.equal(h.requested, 0);
  assert.equal(h.options, undefined);
  await context.api.registerPushBrowser(() => {});
  assert.equal(h.initializationCount, 1);
  stop();
});

test('conflicting Firebase app is rejected without adding another initialization', async () => {
  const { h, context } = await fixture();
  h.apps.push({ name: 'dana-push-experience', options: { appId: 'old-app', projectId: config.VITE_FIREBASE_PROJECT_ID } });
  await assert.rejects(context.api.registerPushBrowser(() => {}), /configuración Firebase cambió/);
  assert.equal(h.initializationCount, 0);
});

test('diagnostics describe the current permission, worker script and scope', async () => {
  const { h, context } = await fixture();
  h.workerRegistration = { scope: 'https://demo.example/', active: { state: 'activated', scriptURL: 'https://demo.example/firebase-messaging-sw.js' } };
  context.Notification.permission = 'granted';
  const result = await context.api.getPushDiagnostics();
  assert.equal(result.permission, 'granted');
  assert.equal(result.workerState, 'activated');
  assert.equal(result.workerScope, 'https://demo.example/');
  assert.equal(result.workerScript, 'https://demo.example/firebase-messaging-sw.js');
  assert.equal(h.requested, 0);
});

test('data-only icon and HTTPS destination are honored', async () => {
  const { h } = await fixture(true);
  const payload = { messageId: 'with-url', data: { title: 'Fixture', icon: 'https://demo.example/icon.png', url: 'https://demo.example/?from=push' } };
  await h.background(payload);
  assert.equal(h.notices[0][1].icon, payload.data.icon);
  let completed;
  h.listeners.notificationclick({
    notification: { data: h.notices[0][1].data, close() {} },
    stopImmediatePropagation() {}, waitUntil(promise) { completed = promise; }
  });
  await completed;
  assert.equal(h.openedUrl, payload.data.url);
});

test('unsafe notification destination falls back to landing; FCM link supports HTTPS', async () => {
  const { h } = await fixture(true);
  async function click(payload) {
    let completed;
    h.listeners.notificationclick({
      notification: { data: { FCM_MSG: payload }, close() {} },
      stopImmediatePropagation() {}, waitUntil(promise) { completed = promise; }
    });
    await completed;
  }
  await click({ fcmMessageId: 'url-1', data: { url: 'javascript:alert(1)' } });
  assert.equal(h.openedUrl, 'https://demo.example/');
  await click({ fcmMessageId: 'url-2', fcm_options: { link: 'https://demo.example/?from=fcm' } });
  assert.equal(h.openedUrl, 'https://demo.example/?from=fcm');
});

test('worker activates updated deployment configuration without waiting for all tabs to close', async () => {
  const { h } = await fixture(true);
  let install, activate;
  h.listeners.install({ waitUntil(promise) { install = promise; } });
  h.listeners.activate({ waitUntil(promise) { activate = promise; } });
  await Promise.all([install, activate]);
  assert.ok(h.skippedWaiting);
  assert.ok(h.claimed);
});

test('cancelled page effects cannot overwrite the active foreground listener', async () => {
  const { h, context } = await fixture();
  context.Notification.permission = 'granted';
  assert.equal(await context.api.listenForPushMessages(() => {}, () => false), null);
  assert.equal(h.foreground, undefined);
  assert.equal(h.initializationCount, 0);
});
