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
});
