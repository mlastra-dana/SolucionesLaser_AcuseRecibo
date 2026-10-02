import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import sharp from 'sharp';
import { build } from 'esbuild';

test('manifest is standalone with stable identity and correctly sized opaque icons', async () => {
  const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'));
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.name, 'DANA Push Experience');
  assert.equal(manifest.short_name, 'DANA Push');
  assert.equal(manifest.theme_color, '#DD5736');
  for (const icon of manifest.icons) {
    const metadata = await sharp('public' + icon.src).metadata();
    const [width, height] = icon.sizes.split('x').map(Number);
    assert.equal(metadata.width, width);
    assert.equal(metadata.height, height);
    assert.equal(metadata.format, 'png');
    const stats = await sharp('public' + icon.src).stats();
    assert.ok(stats.isOpaque);
  }
  assert.equal(manifest.icons.filter(icon => icon.purpose === 'maskable').length, 1);
  assert.equal((await sharp('public/pwa/apple-touch-icon.png').metadata()).width, 180);
});

test('maskable artwork stays within the central safe circle', async () => {
  const { data, info } = await sharp('public/pwa/icon-maskable-512.png').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let whitePixels = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * info.channels;
    if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) {
      whitePixels++;
      assert.ok(Math.hypot(x - 256, y - 256) < 512 * 0.4);
    }
  }
  assert.ok(whitePixels > 100);
});

test('notification history groups real events and only marks opened after an actual opening event', async () => {
  const result = await build({ stdin: { contents: "import { getNotificationHistory } from './src/push/eventStore'; globalThis.history = getNotificationHistory;", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife' });
  const context = vm.createContext({});
  vm.runInContext(result.outputFiles[0].text, context);
  const base = { id: 'received:one', messageId: 'one', type: 'PUSH_RECEIVED', timestamp: '2026-10-01T12:00:00Z', context: 'background', payload: { messageId: 'one', notification: { title: 'Real fixture', body: 'Message fixture' } } };
  const received = context.history([base]);
  assert.equal(received.length, 1);
  assert.equal(received[0].opened, false);
  assert.equal(received[0].received, true);
  assert.equal(context.history([base, { ...base, id: 'clicked:one', type: 'PUSH_CLICKED' }])[0].opened, false);
  const opened = context.history([base, { ...base, id: 'opened:one', type: 'PUSH_OPENED' }]);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].opened, true);
  assert.equal(opened[0].title, 'Real fixture');
  const clickOnly = context.history([{ ...base, id: 'clicked:one', type: 'PUSH_CLICKED' }]);
  assert.equal(clickOnly[0].received, false);
  const previous = context.history([{ ...base, payload: { messageId: 'one', data: { Titulo: 'DANA PUSH' }, notification: { body: 'Mensaje DANA previo' } } }]);
  assert.equal(previous[0].title, 'DANA PUSH');
  assert.equal(previous[0].body, 'Mensaje DANA previo');
});

test('normalization uses the first nonempty valid DANA field and safe images without mutating payloads', async () => {
  const result = await build({ stdin: { contents: "import { normalizeNotification } from './src/push/normalizeNotification'; globalThis.normalize = normalizeNotification;", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife' });
  const context = vm.createContext({ URL, URLSearchParams });
  vm.runInContext(result.outputFiles[0].text, context);
  const payload = { messageId: 'firebase-real-id-fixture', notification: { title: '  ', body: '', image: 'https://example.com/notification.png' }, data: { Titulo: 'DANA PUSH', titulo: 'Segundo', title: 'Tercero', Mensaje: 'Hola Demo', mensaje: 'Segundo cuerpo', body: 'Tercer cuerpo', IMAGEN: 'https://example.com/dana.png' } };
  const original = JSON.stringify(payload);
  const normalized = context.normalize(payload);
  assert.equal(normalized.title, 'DANA PUSH');
  assert.equal(normalized.body, 'Hola Demo');
  assert.equal(normalized.image, payload.data.IMAGEN);
  assert.equal(JSON.stringify(payload), original);
  assert.equal(context.normalize({ ...payload, notification: { title: 'Principal', body: 'Principal cuerpo' } }).title, 'Principal');
  assert.equal(context.normalize({ data: { Titulo: 4, titulo: '  Minúscula  ', Mensaje: false, mensaje: '  Mensaje  ', IMAGEN: 'javascript:alert(1)', imagen: 'https://example.com/valid.png' } }).image, 'https://example.com/valid.png');
  assert.equal(context.normalize({ data: { titulo: '  Minúscula  ', mensaje: '  Mensaje  ' } }).title, 'Minúscula');
  assert.equal(context.normalize({ data: { titulo: '  Minúscula  ', mensaje: '  Mensaje  ' } }).body, 'Mensaje');
  assert.equal(context.normalize({ data: { title: 'title', body: 'body' } }).title, 'title');
  assert.equal(context.normalize(null).title, 'DANA Push Experience');
  assert.equal(context.normalize({ notification: { title: 44 } }).title, 'DANA Push Experience');
  assert.equal(context.normalize({ data: { IMAGEN: 'http://example.com/image.png' } }).image, undefined);
});

test('CTA normalization requires all dynamic fields, retains the payload and rejects unsafe destinations', async () => {
  const result = await build({ stdin: { contents: "import { normalizeNotification } from './src/push/normalizeNotification'; globalThis.normalize = normalizeNotification;", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife' });
  const context = vm.createContext({ URL, URLSearchParams });
  vm.runInContext(result.outputFiles[0].text, context);
  const payload = { messageId: 'real-id', notification: { body: 'Message body' }, data: { push_ref: 'PUSH-REAL', Titulo: 'DANA PUSH', IMAGEN: 'https://example.com/image.png', cta_label: '  Consultar póliza  ', cta_action: '  CONSULTAR_POLIZA  ', cta_url: 'https://insurer.example/poliza?campaign=demo', extra_parameter: 'retained' } };
  const original = JSON.stringify(payload);
  const normalized = context.normalize(payload);
  assert.equal(normalized.cta.label, 'Consultar póliza');
  assert.equal(normalized.cta.action, 'CONSULTAR_POLIZA');
  assert.equal(normalized.cta.url, payload.data.cta_url);
  assert.equal(normalized.body, payload.notification.body);
  assert.equal(JSON.stringify(payload), original);
  for (const key of ['cta_label', 'cta_action', 'cta_url']) {
    for (const value of [undefined, '', '  ', 42]) assert.equal(context.normalize({ ...payload, data: { ...payload.data, [key]: value } }).cta, undefined);
  }
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/file', 'http://example.com', '/relative', '//example.com', 'https:example.com', 'https://', 'https://user:pass@example.com', 'https://example.com/?eventAuthToken=secret', 'https://example.com/?PUSH_REF=PUSH-REAL', 'https://example.com/PUSH-REAL', 'https://example.com/#token=secret', 'https://example.com/with space']) {
    assert.equal(context.normalize({ ...payload, data: { ...payload.data, cta_url: url } }).cta, undefined, url);
  }
  const htmlText = '<img src=x onerror=alert(1)>';
  assert.equal(context.normalize({ ...payload, data: { ...payload.data, cta_label: htmlText } }).cta.label, htmlText);
});

test('sanitized V2 payloads preserve routing, custom data and version-separated history without credentials', async () => {
  const result = await build({ stdin: { contents: "import { safePushPayload, getTrackingVersion } from './src/push/pushPayload'; import { getNotificationHistory } from './src/push/eventStore'; globalThis.safe = safePushPayload; globalThis.version = getTrackingVersion; globalThis.history = getNotificationHistory;", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife' });
  const context = vm.createContext({ URL, URLSearchParams });
  vm.runInContext(result.outputFiles[0].text, context);
  const v1 = { messageId: 'shared-id', data: { push_ref: 'PUSH-shared', Titulo: 'V1' } };
  const v2 = { messageId: 'shared-id', data: { push_ref: 'PUSH-shared', Titulo: 'V2', event_auth_token: 'signed-fixture', cta_label: 'Explorar novedades', cta_action: 'EXPLORAR_NOVEDADES', cta_url: 'https://destination.example/news' }, nested: [{ eventAuthToken: 'nested-secret', keep: 'custom' }] };
  const original = JSON.stringify(v2);
  const safe = context.safe(v2);
  assert.equal(context.version(v1), 'v1');
  assert.equal(context.version(v2), 'v2');
  assert.equal(context.version(safe), 'v2');
  assert.equal(safe.data.cta_action, 'EXPLORAR_NOVEDADES');
  assert.equal(safe.nested[0].keep, 'custom');
  assert.equal(JSON.stringify(safe).includes('signed-fixture'), false);
  assert.equal(JSON.stringify(safe).includes('nested-secret'), false);
  assert.equal(JSON.stringify(v2), original);
  const event = { type: 'PUSH_RECEIVED', context: 'background', timestamp: '2026-10-02T12:00:00Z', messageId: 'shared-id' };
  assert.equal(context.history([{ ...event, id: 'v1', payload: v1 }, { ...event, id: 'v2', payload: safe }]).length, 2);
});
