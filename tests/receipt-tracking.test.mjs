import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { build } from 'esbuild';

const endpoint = 'https://lambda.example/register';
const compiled = await build({
  stdin: { contents: "import * as tracking from './src/push/receiptTracking'; import * as dana from './src/services/danaService'; globalThis.tracking = tracking; globalThis.dana = dana;", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  define: { 'import.meta.env': JSON.stringify({ VITE_DANA_PUSH_API_URL: endpoint }) }
});

function fixture(indexedDB = new IDBFactory()) {
  let now = Date.parse('2026-10-02T12:00:00.000Z');
  const requests = [];
  const h = { response: { status: 202, json: async () => ({ success: true, uploadAccepted: true }) } };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = vm.createContext({ indexedDB, Date: Clock, crypto: webcrypto, URL, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => { requests.push({ url, body: JSON.parse(options.body), options }); return h.fetch ? h.fetch(url, options) : h.response; }
  });
  vm.runInContext(compiled.outputFiles[0].text, context);
  return { ...context, context, requests, h, advance: ms => { now += ms; } };
}
const association = (pushRef = 'PUSH-A', token = 'private-fixture-auth') => ({ pushRef, eventAuthToken: token, resultId: 91 });
const payload = (pushRef = 'PUSH-A', messageId = 'firebase-message-1') => ({ messageId, data: { push_ref: pushRef, Titulo: 'DANA PUSH' } });

test('receipt before register waits for matching persisted association and preserves receipt timestamp', async () => {
  const f = fixture();
  await f.tracking.queuePushReceipt(payload());
  await f.tracking.flushPushReceipts();
  assert.equal(f.requests.length, 0);
  assert.equal(await f.tracking.nextReceiptAttempt(), null);
  await f.tracking.saveReceiptAssociation(association('PUSH-B'));
  await f.tracking.flushPushReceipts();
  assert.equal(f.requests.length, 0);
  f.advance(10_000);
  await f.tracking.saveReceiptAssociation(association());
  await f.tracking.flushPushReceipts();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, endpoint);
  assert.deepEqual(f.requests[0].body, { action: 'event', push_ref: 'PUSH-A', eventAuthToken: 'private-fixture-auth', event: 'PUSH_RECEIVED', messageId: 'firebase-message-1', timestamp: '2026-10-02T12:00:00.000Z', accion: '' });
  assert.equal(f.requests[0].options.cache, 'no-store');
  assert.equal(f.requests[0].options.credentials, 'omit');
  assert.equal((await f.tracking.getReceiptDiagnostics()).status, 'accepted');
});

test('deduplication and transaction leases work across independently loaded page and worker contexts', async () => {
  const db = new IDBFactory(), page = fixture(db), worker = fixture(db);
  await page.tracking.saveReceiptAssociation(association());
  await Promise.all([page.tracking.queuePushReceipt(payload()), worker.tracking.queuePushReceipt(payload())]);
  await Promise.all([page.tracking.flushPushReceipts(), worker.tracking.flushPushReceipts()]);
  assert.equal(page.requests.length + worker.requests.length, 1);
  await worker.tracking.queuePushReceipt(payload(), '2026-10-02T14:00:00.000Z');
  await worker.tracking.flushPushReceipts();
  assert.equal(page.requests.length + worker.requests.length, 1);
  assert.equal((await worker.tracking.getReceiptDiagnostics()).pending, 0);
});

test('same Firebase message ID for different references remains independently associated', async () => {
  const f = fixture();
  await f.tracking.saveReceiptAssociation(association());
  await f.tracking.saveReceiptAssociation(association('PUSH-B', 'second-auth'));
  await f.tracking.queuePushReceipt(payload());
  await f.tracking.queuePushReceipt(payload('PUSH-B'));
  await assert.rejects(f.tracking.saveReceiptAssociation(association('PUSH-A', 'replacement')), /original/);
  await f.tracking.flushPushReceipts();
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests.find(item => item.body.push_ref === 'PUSH-A').body.eventAuthToken, 'private-fixture-auth');
  assert.equal(f.requests.find(item => item.body.push_ref === 'PUSH-B').body.eventAuthToken, 'second-auth');
});

test('temporary network failure survives context recreation and is retried only on eligible availability pass', async () => {
  const db = new IDBFactory(), f = fixture(db);
  await f.tracking.saveReceiptAssociation(association());
  await f.tracking.queuePushReceipt(payload());
  f.h.fetch = async () => { throw new Error('Offline'); };
  await f.tracking.flushPushReceipts();
  await f.tracking.flushPushReceipts();
  assert.equal(f.requests.length, 1);
  assert.equal((await f.tracking.getReceiptDiagnostics()).status, 'error');
  assert.equal(await f.tracking.nextReceiptAttempt(), Date.parse('2026-10-02T12:00:30.000Z'));
  const restored = fixture(db);
  restored.advance(30_001);
  await restored.tracking.flushPushReceipts();
  assert.equal(restored.requests.length, 1);
  assert.equal((await restored.tracking.getReceiptDiagnostics()).status, 'accepted');
});

for (const status of [400, 403]) test(`HTTP ${status} is terminal and never retried on later availability`, async () => {
  const f = fixture();
  await f.tracking.saveReceiptAssociation(association());
  await f.tracking.queuePushReceipt(payload());
  f.h.response = { status };
  await f.tracking.flushPushReceipts();
  f.advance(86_400_000);
  await f.tracking.flushPushReceipts();
  assert.equal(f.requests.length, 1);
  const diagnostics = await f.tracking.getReceiptDiagnostics();
  assert.equal(diagnostics.status, 'error');
  assert.equal(diagnostics.pending, 0);
  assert.equal(await f.tracking.nextReceiptAttempt(), null);
});

test('only HTTP 202 with both affirmative flags is accepted; invalid JSON and 503 remain retryable', async () => {
  for (const response of [{ status: 200, json: async () => ({ success: true, uploadAccepted: true }) },
    { status: 202, json: async () => ({ success: true, uploadAccepted: false }) },
    { status: 202, json: async () => { throw new Error('Invalid JSON'); } }, { status: 503 }]) {
    const f = fixture();
    await f.tracking.saveReceiptAssociation(association());
    await f.tracking.queuePushReceipt(payload());
    f.h.response = response;
    await f.tracking.flushPushReceipts();
    assert.equal((await f.tracking.getReceiptDiagnostics()).status, 'error');
    f.advance(30_001);
    f.h.response = { status: 202, json: async () => ({ success: true, uploadAccepted: true }) };
    await f.tracking.flushPushReceipts();
    assert.equal(f.requests.length, 2);
  }
});

test('missing real push_ref or messageId never fabricates a report; diagnostics contain no credentials', async () => {
  const f = fixture();
  await f.tracking.saveReceiptAssociation(association());
  await f.tracking.queuePushReceipt({ data: { push_ref: 'PUSH-A' } });
  await f.tracking.queuePushReceipt({ messageId: 'real-id' });
  await f.tracking.flushPushReceipts();
  assert.equal(f.requests.length, 0);
  const status = await f.tracking.getReceiptDiagnostics();
  assert.equal(status.associated, true);
  assert.equal(status.lastEvent, null);
  assert.equal(JSON.stringify(status).includes('private-fixture-auth'), false);
  assert.equal(JSON.stringify(status).includes('eventAuthToken'), false);
});

test('register stores credentials and resultId durably before returning and flushes the early receipt without another contact', async () => {
  const db = new IDBFactory(), f = fixture(db);
  await f.tracking.queuePushReceipt(payload());
  f.h.fetch = async (_url, options) => JSON.parse(options.body).action === 'event'
    ? { status: 202, json: async () => ({ success: true, uploadAccepted: true }) }
    : { ok: true, status: 200, json: async () => ({ success: true, conversationStarted: true, ...association() }) };
  const result = await f.dana.registerPushVisitor({ nombre: '', email: '', telefono: '', token: 'real-fcm-fixture' });
  assert.equal(result.pushRef, 'PUSH-A');
  assert.equal(result.resultId, 91);
  const request = db.open('dana-push-receipts', 1);
  await new Promise((resolve, reject) => { request.onsuccess = resolve; request.onerror = reject; });
  const lookup = request.result.transaction('associations', 'readonly').objectStore('associations').get('PUSH-A');
  const saved = await new Promise((resolve, reject) => { lookup.onsuccess = () => resolve(lookup.result); lookup.onerror = reject; });
  assert.equal(saved.resultId, 91);
  request.result.close();
  const restored = fixture(db);
  await restored.tracking.flushPushReceipts();
  for (let i = 0; i < 100 && (await restored.tracking.getReceiptDiagnostics()).status !== 'accepted'; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await restored.tracking.getReceiptDiagnostics()).status, 'accepted');
  assert.equal(f.requests.filter(item => !item.body.action).length, 1);
  assert.equal([...f.requests, ...restored.requests].filter(item => item.body.action === 'event').length, 1);
});

test('event request timeout keeps the original timestamp and a retryable persisted receipt', async () => {
  const f = fixture();
  await f.tracking.saveReceiptAssociation(association());
  await f.tracking.queuePushReceipt(payload());
  f.context.setTimeout = callback => setTimeout(callback, 5);
  f.h.fetch = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Aborted'))));
  await f.tracking.flushPushReceipts();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].options.signal.aborted, true);
  assert.equal((await f.tracking.getReceiptDiagnostics()).pending, 1);
  f.h.fetch = undefined;
  f.advance(30_001);
  await f.tracking.flushPushReceipts();
  assert.equal(f.requests[1].body.timestamp, f.requests[0].body.timestamp);
});

test('an expired lease recovers a terminated context and stale completion cannot overwrite accepted state', async () => {
  const db = new IDBFactory(), first = fixture(db), recovered = fixture(db);
  await first.tracking.saveReceiptAssociation(association());
  await first.tracking.queuePushReceipt(payload());
  let release;
  first.h.fetch = () => new Promise(resolve => { release = resolve; });
  const interrupted = first.tracking.flushPushReceipts();
  for (let i = 0; i < 100 && !release; i++) await new Promise(resolve => setTimeout(resolve, 5));
  await recovered.tracking.flushPushReceipts();
  assert.equal(recovered.requests.length, 0);
  recovered.advance(45_001);
  await recovered.tracking.flushPushReceipts();
  assert.equal(recovered.requests.length, 1);
  release({ status: 503 });
  await interrupted;
  assert.equal((await recovered.tracking.getReceiptDiagnostics()).status, 'accepted');
});

test('blocked optional BroadcastChannel does not lose committed associations or receipts', async () => {
  const f = fixture();
  f.context.BroadcastChannel = class { constructor() { throw new Error('Unavailable'); } };
  await f.tracking.saveReceiptAssociation(association());
  await f.tracking.queuePushReceipt(payload());
  await f.tracking.flushPushReceipts();
  assert.equal((await f.tracking.getReceiptDiagnostics()).status, 'accepted');
});
