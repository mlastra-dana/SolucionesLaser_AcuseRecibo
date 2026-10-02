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
    unsubscribeCount: 0, events: [], notices: [], clients: [], listeners: {}, apps: [], initializationCount: 0, registrationCount: 0, standalone: false, requests: [], pageMessages: [],
    response: { ok: true, status: 200, async json() { return { success: true, conversationStarted: true, resultId: 47 }; } },
    async record(type, context, payload) { h.events.push({ type, context, payload }); }
  };
  const modules = {
    'firebase/app': 'export const getApps = () => h.apps; export const initializeApp = (config, name = "[DEFAULT]") => { h.initializationCount++; const app = { name, options: config }; h.apps.push(app); return app; };',
    'firebase/messaging': `export const isSupported = async () => h.supported;
      export const getMessaging = app => app;
      export const onMessage = (_app, fn) => { h.foreground = fn; return () => h.unsubscribeCount++; };
      export const getToken = async (_app, options) => { h.options = options; if (h.tokenError) throw h.tokenError; return h.token; };`,
    'firebase/messaging/sw': 'export const getMessaging = app => app; export const onBackgroundMessage = (_app, fn) => { h.background = fn; };',
    'event-store': 'export const recordPushEvent = (...args) => h.record(...args);',
    'workbox-core': 'export const setCacheNameDetails = () => {};',
    'workbox-precaching': 'export const precacheAndRoute = entries => { h.precache = entries; }; export const cleanupOutdatedCaches = () => {}; export const createHandlerBoundToURL = url => url;',
    'workbox-routing': 'export class NavigationRoute { constructor(handler, options) { this.handler = handler; this.options = options; } } export const registerRoute = route => { h.navigationRoute = route; };'
  };
  const result = await build({
    stdin: {
      contents: worker ? "import './src/push/firebase-messaging-sw.js'" : "import * as api from './src/services/pushService'; import * as dana from './src/services/danaService'; import * as support from './src/services/pushCapabilities'; import * as sharedWorker from './src/services/serviceWorkerService'; globalThis.api = api; globalThis.dana = dana; globalThis.support = support; globalThis.sharedWorker = sharedWorker;",
      resolveDir: process.cwd(), loader: 'ts'
    },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env': JSON.stringify({ ...config, ...overrides }), __DANA_PRECACHE__: '[]' },
    plugins: [{ name: 'explicit-test-doubles', setup(builder) {
      builder.onResolve({ filter: /^firebase\// }, args => ({ path: args.path, namespace: 'test-double' }));
      builder.onResolve({ filter: /^workbox-/ }, args => ({ path: args.path, namespace: 'test-double' }));
      builder.onResolve({ filter: /eventStore$/ }, () => ({ path: 'event-store', namespace: 'test-double' }));
      builder.onLoad({ filter: /.*/, namespace: 'test-double' }, args => ({ contents: modules[args.path], loader: 'js' }));
    } }]
  });
  const notification = { permission: 'default', requestPermission: async () => { h.requested++; notification.permission = h.permissionResult; return h.permissionResult; } };
  const context = vm.createContext({
    h, console, setTimeout, clearTimeout, URL, AbortController,
    fetch: async (url, options) => { h.requests.push({ url, options }); if (h.fetchHandler) return h.fetchHandler(url, options); return h.response; },
    Notification: notification,
    window: { isSecureContext: true, Notification: notification, PushManager: {}, setTimeout, matchMedia: () => ({ matches: h.standalone }) },
    navigator: { userAgent: 'Chrome', platform: 'MacIntel', maxTouchPoints: 0, serviceWorker: { getRegistration: async () => h.workerRegistration, register: async (url, options) => { h.registrationCount++; h.registration = { url, options }; return { active: { postMessage: message => h.pageMessages.push(message) } }; } } },
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
  assert.equal(h.pageMessages.length, 1);
  assert.equal(h.pageMessages[0].type, 'SHOW_FOREGROUND_NOTIFICATION');
  assert.equal(h.pageMessages[0].payload.messageId, 'm1');
  await h.foreground({ messageType: 'notification-clicked', messageId: 'm1' });
  assert.equal(received.length, 1);
  assert.equal(h.pageMessages.length, 1);
  registration.unsubscribe();
  assert.equal(h.unsubscribeCount, 1);
  assert.equal(h.requests.length, 0);
});

test('visitor details use one full name plus email and telephone, without external calls', async () => {
  const { context } = await fixture();
  const details = { nombre: '  Demo Nombre Completo  ', email: '  demo@example.com  ', telefono: ' +584121234567 ' };
  assert.equal(context.dana.validateVisitorDetails(details), null);
  for (const [field, value] of [
    ['nombre', ''], ['nombre', 'a'.repeat(121)],
    ['email', ''], ['email', 'demo'], ['email', 'demo @example.com'],
    ['telefono', ''], ['telefono', '123'], ['telefono', 'abc1234567'],
    ['telefono', '+1234567890123456'], ['telefono', '+58 412 123 4567'], ['telefono', '+58(412)1234567']
  ]) {
    const invalid = { ...details, [field]: value };
    assert.equal(context.dana.validateVisitorDetails(invalid).field, field);
    await assert.rejects(context.dana.registerPushVisitor({ ...invalid, token: 'test' }));
  }
  await assert.rejects(context.dana.registerPushVisitor({ ...details, token: '' }), /token FCM/);
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
  context.Notification.permission = 'default';
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

test('DANA registration sends exactly four uppercase fields to the configured HTTPS Lambda', async () => {
  const { h, context } = await fixture(false, { VITE_DANA_PUSH_API_URL: 'https://intermediary.example/register' });
  const result = await context.dana.registerPushVisitor({ nombre: ' A B ', email: ' demo@example.com ', telefono: ' +584121234567 ', token: 'test', source: 'DANA_PUSH_EXPERIENCE' });
  assert.equal(result.success, true);
  assert.equal(result.conversationStarted, true);
  assert.equal(result.resultId, 47);
  assert.equal(h.requests.length, 1);
  const { url, options } = h.requests[0];
  assert.equal(url, 'https://intermediary.example/register');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(options.body), { NOMBRE: 'A B', EMAIL: 'demo@example.com', TELEFONO: '+584121234567', TOKEN: 'test' });
  assert.equal(options.credentials, 'omit');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal);
});

const visitorFixture = { nombre: 'Demo Nombre', email: 'demo@example.com', telefono: '584121234567', token: 'test-token' };

test('DANA registration requires a configured HTTPS endpoint without embedded credentials', async () => {
  for (const url of ['', 'http://intermediary.example', 'https://user:secret@intermediary.example']) {
    const { h, context } = await fixture(false, { VITE_DANA_PUSH_API_URL: url });
    await assert.rejects(context.dana.registerPushVisitor(visitorFixture), error => error.code === 'configuration');
    assert.equal(h.requests.length, 0);
  }
});

test('DANA registration distinguishes HTTP failure, invalid JSON and missing conversation confirmation', async () => {
  const cases = [
    [{ ok: false, status: 503 }, 'unavailable'],
    [{ ok: false, status: 403 }, 'http'],
    [{ ok: true, status: 200, json: async () => { throw new SyntaxError('Invalid JSON'); } }, 'response'],
    [{ ok: true, status: 200, json: async () => ({ success: false, conversationStarted: true }) }, 'response'],
    [{ ok: true, status: 200, json: async () => ({ success: 'true', conversationStarted: true }) }, 'response'],
    [{ ok: true, status: 200, json: async () => ({ success: true, conversationStarted: false }) }, 'conversation'],
    [{ ok: true, status: 200, json: async () => ({ success: true }) }, 'conversation']
  ];
  for (const [response, code] of cases) {
    const { h, context } = await fixture(false, { VITE_DANA_PUSH_API_URL: 'https://intermediary.example' });
    h.response = response;
    await assert.rejects(context.dana.registerPushVisitor(visitorFixture), error => error.code === code);
    assert.equal(h.requests.length, 1);
  }
});

test('explicit Lambda invocation envelopes are unwrapped without assuming resultId is 2', async () => {
  const { h, context } = await fixture(false, { VITE_DANA_PUSH_API_URL: 'https://intermediary.example' });
  h.response.json = async () => ({ statusCode: 200, body: JSON.stringify({ success: true, conversationStarted: true, resultId: 981 }) });
  assert.equal((await context.dana.registerPushVisitor(visitorFixture)).resultId, 981);
  h.response.json = async () => ({ statusCode: 500, body: JSON.stringify({ success: true, conversationStarted: true }) });
  await assert.rejects(context.dana.registerPushVisitor(visitorFixture), error => error.code === 'http');
});

test('network failure and AbortController timeout never retry POST automatically', async () => {
  const { h, context } = await fixture(false, { VITE_DANA_PUSH_API_URL: 'https://intermediary.example' });
  h.fetchHandler = async () => { throw new TypeError('Network fixture'); };
  await assert.rejects(context.dana.registerPushVisitor(visitorFixture), error => error.code === 'network' && /duplicados/.test(error.message));
  assert.equal(h.requests.length, 1);
  context.setTimeout = callback => setTimeout(callback, 5);
  h.fetchHandler = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
  await assert.rejects(context.dana.registerPushVisitor(visitorFixture), error => error.code === 'timeout' && /duplicados/.test(error.message));
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].options.signal.aborted, true);
});

test('Firebase registration reports stages and does not request already granted permissions again', async () => {
  const { h, context } = await fixture();
  context.Notification.permission = 'granted';
  const stages = [];
  await context.api.registerPushBrowser(() => {}, undefined, stage => stages.push(stage));
  assert.deepEqual(stages, ['Conectando con Firebase', 'Registrando dispositivo']);
  assert.equal(h.requested, 0);
});

test('DANA custom data fields are normalized for background display without duplicate automatic notifications', async () => {
  const { h } = await fixture(true);
  const data = { Titulo: 'DANA PUSH', Mensaje: 'Mensaje personalizado', IMAGEN: 'https://example.com/image.png' };
  await h.background({ messageId: 'custom-data', data });
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0][0], 'DANA PUSH');
  assert.equal(h.notices[0][1].body, 'Mensaje personalizado');
  assert.equal(h.notices[0][1].image, data.IMAGEN);
  await h.background({ messageId: 'automatic-data', data, notification: { body: 'Cuerpo automático' } });
  assert.equal(h.notices.length, 1);
  assert.equal(h.events[1].payload.messageId, 'automatic-data');
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

test('PWA installation and FCM share one registration without requesting permission on load', async () => {
  const { h, context } = await fixture();
  const [pwaWorker, parallelWorker] = await Promise.all([
    context.sharedWorker.registerSharedWorker(), context.sharedWorker.registerSharedWorker()
  ]);
  assert.equal(pwaWorker, parallelWorker);
  assert.equal(h.registrationCount, 1);
  assert.equal(h.requested, 0);
  assert.equal(h.options, undefined);
  await context.api.registerPushBrowser(() => {});
  assert.equal(h.registrationCount, 1);
  assert.equal(h.options.serviceWorkerRegistration, pwaWorker);
});

test('iPhone needs Home Screen mode before Push capabilities can be checked', async () => {
  const { h, context } = await fixture();
  context.navigator.userAgent = 'iPhone';
  let capabilities = await context.support.getPushCapabilities();
  assert.equal(capabilities.reason, 'install-required');
  assert.equal(capabilities.supported, false);
  h.standalone = true;
  capabilities = await context.support.getPushCapabilities();
  assert.equal(capabilities.supported, true);
  h.supported = false;
  capabilities = await context.support.getPushCapabilities();
  assert.equal(capabilities.reason, 'firebase');
  assert.match(context.support.pushUnavailableMessage(capabilities.reason), /se instaló correctamente.*no está disponible/);
  assert.equal(h.requested, 0);
});

test('Push permission stays inside the user action when capabilities were preflighted', async () => {
  const { h, context } = await fixture();
  const capabilities = await context.support.getPushCapabilities();
  const registration = context.api.registerPushBrowser(() => {}, capabilities);
  assert.equal(h.requested, 1);
  await registration;
});

test('notification click reuses an app window with a different query instead of creating a duplicate', async () => {
  const { h } = await fixture(true);
  let focused = false, navigated;
  h.clients = [{ url: 'https://demo.example/?previous=true', postMessage() {}, async navigate(url) { navigated = url; return this; }, async focus() { focused = true; return this; } }];
  let completed;
  h.listeners.notificationclick({
    notification: { data: { FCM_MSG: { fcmMessageId: 'reuse-window', data: { url: 'https://demo.example/?push=true' } } }, close() {} },
    stopImmediatePropagation() {}, waitUntil(promise) { completed = promise; }
  });
  await completed;
  assert.equal(navigated, 'https://demo.example/?push=true');
  assert.ok(focused);
  assert.equal(h.openedUrl, undefined);
});

test('data-only notifications include optional image without generating extra receipts or displays', async () => {
  const { h } = await fixture(true);
  await h.background({ messageId: 'image-message', data: { title: 'Fixture', image: 'https://demo.example/image.png' } });
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0][1].image, 'https://demo.example/image.png');
  assert.equal(h.notices[0][1].icon, '/pwa/icon-192.png');
  assert.equal(h.events.length, 1);
});

function foregroundRequest(h, payload, url = 'https://demo.example/') {
  let completed;
  h.listeners.message({
    data: { source: 'DANA_PUSH_PAGE', type: 'SHOW_FOREGROUND_NOTIFICATION', payload },
    source: { url }, waitUntil(promise) { completed = promise; }
  });
  return completed;
}

test('foreground system notification is shown once across concurrent tabs, with normalized content and click recovery', async () => {
  const { h } = await fixture(true);
  const payload = { messageId: 'foreground-real-id-fixture', notification: { body: 'Mensaje DANA' }, data: { Titulo: 'DANA PUSH', IMAGEN: 'https://demo.example/image.png' } };
  await Promise.all([foregroundRequest(h, payload), foregroundRequest(h, payload, 'https://demo.example/?tab=2')]);
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0][0], 'DANA PUSH');
  assert.equal(h.notices[0][1].body, 'Mensaje DANA');
  assert.equal(h.notices[0][1].image, payload.data.IMAGEN);
  assert.equal(h.notices[0][1].icon, '/pwa/icon-192.png');
  assert.equal(h.notices[0][1].tag, payload.messageId);
  assert.equal(h.events.length, 0);
  let completed;
  let closed = false;
  h.listeners.notificationclick({ notification: { data: h.notices[0][1].data, close() { closed = true; } }, stopImmediatePropagation() {}, waitUntil(promise) { completed = promise; } });
  await completed;
  assert.equal(closed, true);
  assert.equal(h.openedUrl, 'https://demo.example/');
  assert.equal(h.events[0].type, 'PUSH_CLICKED');
  assert.equal(h.events[1].type, 'PUSH_OPENED');
  assert.equal(h.events[0].payload.messageId, payload.messageId);
  await foregroundRequest(h, payload);
  assert.equal(h.notices.length, 1);
});

test('foreground display ignores foreign clients and already-visible message tags', async () => {
  const { h, context } = await fixture(true);
  const payload = { messageId: 'existing-tag', data: { Titulo: 'DANA PUSH' } };
  await foregroundRequest(h, payload, 'https://other.example/');
  assert.equal(h.notices.length, 0);
  context.self.registration.getNotifications = async options => {
    assert.equal(options.tag, payload.messageId);
    return [{}];
  };
  await foregroundRequest(h, payload);
  assert.equal(h.notices.length, 0);
});

test('foreground display failure keeps receipt handling intact and does not mark a failed display as shown', async () => {
  const { h, context } = await fixture();
  await context.api.registerPushBrowser(() => {});
  context.Notification.permission = 'denied';
  await h.foreground({ messageId: 'permission-changed', data: { Titulo: 'DANA PUSH' } });
  assert.equal(h.events[0].type, 'PUSH_RECEIVED');
  assert.equal(h.pageMessages.length, 0);
  const worker = await fixture(true);
  const payload = { messageId: 'display-retry', data: { Titulo: 'DANA PUSH' } };
  worker.context.self.registration.showNotification = async () => { throw new Error('Display unavailable'); };
  await foregroundRequest(worker.h, payload);
  worker.context.self.registration.showNotification = async (...args) => worker.h.notices.push(args);
  await foregroundRequest(worker.h, payload);
  assert.equal(worker.h.notices.length, 1);
  assert.equal(worker.h.events.length, 0);
});
