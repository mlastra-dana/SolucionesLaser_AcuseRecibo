import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { build } from 'esbuild';

const endpoint = 'https://lambda.example/register';
const compiled = await build({
  stdin: { contents: "import * as tracking from './src/push/receiptTracking'; import * as dana from './src/services/danaService'; import * as timezones from './src/push/eventTimezone'; globalThis.tracking = tracking; globalThis.dana = dana; globalThis.timezones = timezones;", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  define: { 'import.meta.env': JSON.stringify({ VITE_DANA_PUSH_API_URL: endpoint }) }
});

function fixture(indexedDB = new IDBFactory()) {
  let now = Date.parse('2026-10-02T12:00:00.000Z');
  const requests = [];
  const h = { timezone: 'America/Caracas', timezoneFailure: false, response: { status: 202, json: async () => ({ success: true, uploadAccepted: true }) } };
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  function DateTimeFormat(locale, options) {
    if (locale === undefined && options === undefined) {
      if (h.timezoneFailure) throw new Error('Timezone unavailable');
      return { resolvedOptions: () => ({ timeZone: h.timezone }) };
    }
    return new Intl.DateTimeFormat(locale, options);
  }
  const context = vm.createContext({ indexedDB, Intl: { DateTimeFormat }, Date: Clock, crypto: webcrypto, URL, AbortController, setTimeout, clearTimeout,
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
  assert.deepEqual(f.requests[0].body, { action: 'event', push_ref: 'PUSH-A', eventAuthToken: 'private-fixture-auth', event: 'PUSH_RECEIVED', messageId: 'firebase-message-1', timestamp: '2026-10-02T12:00:00.000Z', timezone: 'America/Caracas', accion: '' });
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

test('three event types use exact contract and original timestamps, ordered by stage even when queued out of order', async () => {
  const f = fixture();
  await f.tracking.saveReceiptAssociation(association());
  await f.tracking.queuePushEvent('PUSH_CLICKED', payload(), '2026-10-02T12:03:00.000Z', 'CONOCER_MAS');
  await f.tracking.queuePushEvent('PUSH_OPENED', payload(), '2026-10-02T12:02:00.000Z');
  await f.tracking.queuePushReceipt(payload(), '2026-10-02T12:01:00.000Z');
  await f.tracking.flushPushReceipts();
  assert.deepEqual(f.requests.map(item => item.body.event), ['PUSH_RECEIVED', 'PUSH_OPENED', 'PUSH_CLICKED']);
  assert.deepEqual(f.requests.map(item => item.body.accion), ['', '', 'CONOCER_MAS']);
  assert.deepEqual(f.requests.map(item => item.body.timestamp), ['2026-10-02T12:01:00.000Z', '2026-10-02T12:02:00.000Z', '2026-10-02T12:03:00.000Z']);
  for (const { body } of f.requests) {
    assert.deepEqual(Object.keys(body).sort(), ['action', 'push_ref', 'eventAuthToken', 'event', 'messageId', 'timestamp', 'timezone', 'accion'].sort());
    assert.equal(body.timezone, 'America/Caracas');
    assert.equal(new Date(body.timestamp).toISOString(), body.timestamp);
  }
  assert.equal((await f.tracking.getReceiptDiagnostics()).events.length, 3);
});

test('transient receipt failure holds opened and clicked until receipt acceptance, without spin retries', async () => {
  const f = fixture();
  await f.tracking.saveReceiptAssociation(association());
  await f.tracking.queuePushReceipt(payload());
  await f.tracking.queuePushEvent('PUSH_OPENED', payload());
  await f.tracking.queuePushEvent('PUSH_CLICKED', payload(), undefined, 'CONOCER_MAS');
  f.h.response = { status: 503 };
  await f.tracking.flushPushReceipts();
  await f.tracking.flushPushReceipts();
  assert.equal(f.requests.length, 1);
  assert.equal(await f.tracking.nextReceiptAttempt(), Date.parse('2026-10-02T12:00:30.000Z'));
  f.advance(30_001);
  f.h.response = { status: 202, json: async () => ({ success: true, uploadAccepted: true }) };
  await f.tracking.flushPushReceipts();
  assert.deepEqual(f.requests.map(item => item.body.event), ['PUSH_RECEIVED', 'PUSH_RECEIVED', 'PUSH_OPENED', 'PUSH_CLICKED']);
});

test('late lower event remains locally detected but cannot regress a previously attempted advanced state', async () => {
  const f = fixture();
  await f.tracking.saveReceiptAssociation(association());
  await f.tracking.queuePushEvent('PUSH_OPENED', payload());
  await f.tracking.flushPushReceipts();
  await f.tracking.queuePushReceipt(payload());
  await f.tracking.flushPushReceipts();
  assert.equal(f.requests.length, 1);
  const status = await f.tracking.getReceiptDiagnostics();
  assert.equal(status.events.find(item => item.eventType === 'PUSH_RECEIVED').status, 'superseded');
  assert.equal(status.pending, 0);
  assert.equal(await f.tracking.nextReceiptAttempt(), null);
});

test('deduplication is event/action aware across contexts, without converting body opening into clicked', async () => {
  const db = new IDBFactory(), first = fixture(db), second = fixture(db);
  await first.tracking.saveReceiptAssociation(association());
  await Promise.all([first, second].map(f => f.tracking.queuePushEvent('PUSH_OPENED', payload())));
  await first.tracking.queuePushEvent('PUSH_CLICKED', payload());
  await first.tracking.queuePushEvent('PUSH_CLICKED', payload(), undefined, 'UNKNOWN_ACTION');
  await Promise.all([first, second].map(f => f.tracking.queuePushEvent('PUSH_CLICKED', payload(), undefined, 'CONOCER_MAS')));
  await Promise.all([first.tracking.flushPushReceipts(), second.tracking.flushPushReceipts()]);
  await first.tracking.flushPushReceipts();
  const requests = [...first.requests, ...second.requests];
  assert.equal(requests.filter(item => item.body.event === 'PUSH_OPENED').length, 1);
  assert.equal(requests.filter(item => item.body.event === 'PUSH_CLICKED').length, 1);
});

test('phase-one stored receipts and dedup keys remain valid without database version or store changes', async () => {
  const db = new IDBFactory(), f = fixture(db);
  await f.tracking.saveReceiptAssociation(association());
  const request = db.open('dana-push-receipts', 1);
  await new Promise((resolve, reject) => { request.onsuccess = resolve; request.onerror = reject; });
  const connection = request.result;
  assert.equal(connection.version, 1);
  assert.deepEqual([...connection.objectStoreNames], ['associations', 'receipts']);
  const tx = connection.transaction('receipts', 'readwrite');
  tx.objectStore('receipts').add({ id: JSON.stringify(['PUSH-A', 'firebase-message-1', 'PUSH_RECEIVED']), pushRef: 'PUSH-A', messageId: 'firebase-message-1', timestamp: '2026-10-02T10:00:00.000Z', status: 'pending', attempts: 0, retryAt: 0, leaseUntil: 0, terminal: false });
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = reject; });
  connection.close();
  await f.tracking.queuePushReceipt(payload());
  await f.tracking.queuePushEvent('PUSH_OPENED', payload());
  await f.tracking.flushPushReceipts();
  assert.deepEqual(f.requests.map(item => item.body.event), ['PUSH_RECEIVED', 'PUSH_OPENED']);
  assert.equal(f.requests[0].body.timestamp, '2026-10-02T10:00:00.000Z');
  assert.equal(f.requests[0].body.timezone, 'UTC');
  assert.equal((await f.tracking.getReceiptDiagnostics()).events.find(item => item.eventType === 'PUSH_RECEIVED').timezoneWarning, 'legacy');
});

test('all pending events persist their UTC instant and event-time timezone across retries and duplicates', async () => {
  const db = new IDBFactory(), page = fixture(db);
  await page.tracking.saveReceiptAssociation(association());
  for (const [type, action] of [['PUSH_RECEIVED', ''], ['PUSH_OPENED', ''], ['PUSH_CLICKED', 'CONOCER_MAS']]) {
    await page.tracking.queuePushEvent(type, payload(), '2026-10-02T20:02:15.000Z', action);
  }
  page.h.response = { status: 503 };
  await page.tracking.flushPushReceipts();
  const worker = fixture(db);
  worker.h.timezone = 'America/New_York';
  worker.advance(30_001);
  await worker.tracking.queuePushReceipt(payload(), '2026-10-03T12:00:00.000Z');
  await worker.tracking.flushPushReceipts();
  assert.equal(worker.requests.length, 3);
  for (const { body } of [...page.requests, ...worker.requests]) {
    assert.equal(body.timezone, 'America/Caracas');
    assert.equal(body.timestamp, '2026-10-02T20:02:15.000Z');
  }
  const request = db.open('dana-push-receipts', 1);
  await new Promise((resolve, reject) => { request.onsuccess = resolve; request.onerror = reject; });
  const read = request.result.transaction('receipts').objectStore('receipts').getAll();
  const stored = await new Promise((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = reject; });
  request.result.close();
  assert.equal(stored.length, 3);
  assert.ok(stored.every(item => item.timezone === 'America/Caracas' && item.timestamp === '2026-10-02T20:02:15.000Z'));
});

test('worker without timezone detection uses last valid PWA timezone without window or document', async () => {
  const db = new IDBFactory(), page = fixture(db);
  page.h.timezone = 'America/Lima';
  assert.equal((await page.tracking.getReceiptDiagnostics()).timezone, 'America/Lima');
  const worker = fixture(db);
  worker.h.timezoneFailure = true;
  assert.equal(worker.context.window, undefined);
  assert.equal(worker.context.document, undefined);
  await worker.tracking.saveReceiptAssociation(association());
  await worker.tracking.queuePushReceipt(payload());
  await worker.tracking.flushPushReceipts();
  assert.equal(worker.requests[0].body.timezone, 'America/Lima');
  const diagnostics = await worker.tracking.getReceiptDiagnostics();
  assert.equal(diagnostics.timezoneWarning, 'stored');
  assert.equal(diagnostics.events[0].timezoneWarning, 'stored');
});

test('unavailable or invalid IANA timezone falls back explicitly to UTC with sanitized diagnostics', async () => {
  for (const timezone of [undefined, '', 'Invalid/Timezone', '+04:00']) {
    const f = fixture();
    f.h.timezone = timezone;
    await f.tracking.saveReceiptAssociation(association());
    await f.tracking.queuePushReceipt(payload());
    await f.tracking.flushPushReceipts();
    assert.equal(f.requests[0].body.timezone, 'UTC');
    const diagnostics = await f.tracking.getReceiptDiagnostics();
    assert.equal(diagnostics.timezone, 'UTC');
    assert.equal(diagnostics.timezoneWarning, 'utc');
    assert.equal(diagnostics.events[0].timezoneWarning, 'utc');
    assert.equal(JSON.stringify(diagnostics).includes('eventAuthToken'), false);
  }
});

test('missing Intl in a worker cannot overwrite previously validated event timezone', async () => {
  const db = new IDBFactory(), page = fixture(db);
  await page.tracking.saveReceiptAssociation(association());
  await page.tracking.queuePushReceipt(payload());
  const worker = fixture(db);
  worker.context.Intl = undefined;
  await worker.tracking.queuePushEvent('PUSH_OPENED', payload());
  await worker.tracking.flushPushReceipts();
  assert.equal(worker.requests.length, 2);
  assert.ok(worker.requests.every(item => item.body.timezone === 'America/Caracas'));
  assert.equal((await worker.tracking.getReceiptDiagnostics()).timezoneWarning, 'stored');
  assert.equal(worker.timezones.formatEventTime('2026-10-02T12:00:00Z'), '2026-10-02T12:00:00.000Z (UTC)');
});

test('UTC fallback captured offline is not replaced when timezone detection becomes available', async () => {
  const f = fixture();
  f.h.timezoneFailure = true;
  await f.tracking.queuePushReceipt(payload());
  f.h.timezoneFailure = false;
  f.advance(60_000);
  await f.tracking.saveReceiptAssociation(association());
  await f.tracking.flushPushReceipts();
  assert.equal(f.requests[0].body.timezone, 'UTC');
  assert.equal(f.requests[0].body.timestamp, '2026-10-02T12:00:00.000Z');
  assert.equal((await f.tracking.getReceiptDiagnostics()).timezone, 'America/Caracas');
});

test('metadata storage failure does not discard a valid timezone or prevent event reporting', async () => {
  const db = new IDBFactory();
  const f = fixture({ open(name, version) {
    if (name === 'dana-push-timezone') throw new Error('Metadata blocked');
    return db.open(name, version);
  } });
  await f.tracking.saveReceiptAssociation(association());
  await f.tracking.queuePushReceipt(payload());
  await f.tracking.flushPushReceipts();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].body.timezone, 'America/Caracas');
  assert.equal((await f.tracking.getReceiptDiagnostics()).status, 'accepted');
});

test('device set explicitly to UTC is valid and does not show a fallback warning', async () => {
  const f = fixture();
  f.h.timezone = 'UTC';
  await f.tracking.queuePushReceipt(payload());
  const diagnostics = await f.tracking.getReceiptDiagnostics();
  assert.equal(diagnostics.timezone, 'UTC');
  assert.equal(diagnostics.timezoneWarning, undefined);
  assert.equal(diagnostics.events[0].timezoneWarning, undefined);
});

test('local rendering uses explicit AM/PM, midnight/noon and DST without changing UTC timestamps', () => {
  const f = fixture();
  const timestamp = '2026-10-02T20:02:15Z';
  assert.equal(f.timezones.formatEventTime(timestamp, 'America/Caracas'), '2026-10-02 04:02:15 PM');
  assert.equal(f.timezones.formatEventTime('2026-10-02T04:00:00Z', 'America/Caracas'), '2026-10-02 12:00:00 AM');
  assert.equal(f.timezones.formatEventTime('2026-10-02T16:00:00Z', 'America/Caracas'), '2026-10-02 12:00:00 PM');
  assert.equal(f.timezones.formatEventTime('2026-01-02T20:02:15Z', 'America/New_York'), '2026-01-02 03:02:15 PM');
  assert.equal(f.timezones.formatEventTime(timestamp, 'America/New_York'), '2026-10-02 04:02:15 PM');
  assert.equal(timestamp, '2026-10-02T20:02:15Z');
});

test('separate contexts cannot send opened while receipt is leased, and diagnostics distinguish sending from accepted', async () => {
  const db = new IDBFactory(), first = fixture(db), second = fixture(db);
  await first.tracking.saveReceiptAssociation(association());
  await first.tracking.queuePushReceipt(payload());
  let release;
  first.h.fetch = () => new Promise(resolve => { release = resolve; });
  const sending = first.tracking.flushPushReceipts();
  for (let i = 0; i < 100 && !release; i++) await new Promise(resolve => setTimeout(resolve, 5));
  const status = await second.tracking.getReceiptDiagnostics();
  assert.equal(status.events[0].status, 'sending');
  assert.equal(status.events[0].sent, true);
  assert.equal(status.events[0].accepted, false);
  await second.tracking.queuePushEvent('PUSH_OPENED', payload());
  await second.tracking.flushPushReceipts();
  assert.equal(second.requests.length, 0);
  release({ status: 202, json: async () => ({ success: true, uploadAccepted: true }) });
  await sending;
  await second.tracking.flushPushReceipts();
  assert.equal(second.requests[0].body.event, 'PUSH_OPENED');
});

test('terminal receipt rejection does not cause endless retries or prevent later explicit interactions', async () => {
  const f = fixture();
  await f.tracking.saveReceiptAssociation(association());
  await f.tracking.queuePushReceipt(payload());
  f.h.response = { status: 403 };
  await f.tracking.flushPushReceipts();
  f.h.response = { status: 202, json: async () => ({ success: true, uploadAccepted: true }) };
  await f.tracking.queuePushEvent('PUSH_OPENED', payload());
  await f.tracking.flushPushReceipts();
  f.advance(86_400_000);
  await f.tracking.flushPushReceipts();
  assert.deepEqual(f.requests.map(item => item.body.event), ['PUSH_RECEIVED', 'PUSH_OPENED']);
});

test('a rejected terminal advanced event is not treated as an accepted state advancement', async () => {
  const f = fixture();
  await f.tracking.saveReceiptAssociation(association());
  await f.tracking.queuePushEvent('PUSH_OPENED', payload());
  f.h.response = { status: 403 };
  await f.tracking.flushPushReceipts();
  await f.tracking.queuePushReceipt(payload());
  f.h.response = { status: 202, json: async () => ({ success: true, uploadAccepted: true }) };
  await f.tracking.flushPushReceipts();
  assert.deepEqual(f.requests.map(item => item.body.event), ['PUSH_OPENED', 'PUSH_RECEIVED']);
});
