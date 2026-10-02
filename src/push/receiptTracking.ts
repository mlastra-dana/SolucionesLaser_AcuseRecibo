export type ReceiptAssociation = { pushRef: string; eventAuthToken: string; resultId?: string | number };
type Association = ReceiptAssociation & { savedAt: string };
export type TrackingEventType = 'PUSH_RECEIVED' | 'PUSH_OPENED' | 'PUSH_CLICKED';
type Receipt = {
  id: string; pushRef: string; messageId: string; timestamp: string;
  eventType?: TrackingEventType; accion?: string;
  status: 'pending' | 'sending' | 'accepted' | 'error' | 'superseded'; attempts: number; retryAt: number;
  lastAttemptAt?: string; acceptedAt?: string;
  terminal: boolean; leaseUntil: number; owner?: string;
};
export type ReceiptDiagnostics = {
  associated: boolean; lastEvent: TrackingEventType | null;
  status: Receipt['status'] | null; pending: number;
  events: { id: string; eventType: TrackingEventType; messageId: string; timestamp: string; status: Receipt['status']; sent: boolean; accepted: boolean; accion: string }[];
};

const rank = { PUSH_RECEIVED: 0, PUSH_OPENED: 1, PUSH_CLICKED: 2 };
const eventType = (item: Receipt) => item.eventType ?? 'PUSH_RECEIVED';
const outstanding = (item: Receipt) => item.status !== 'accepted' && !item.terminal;
const advanced = (item: Receipt, all: Receipt[]) => all.some(other => other.pushRef === item.pushRef && rank[eventType(other)] > rank[eventType(item)] && (other.status === 'accepted' || (other.attempts > 0 && !other.terminal)));
const blocked = (item: Receipt, all: Receipt[]) => all.some(other => other.id !== item.id && other.pushRef === item.pushRef &&
  (other.leaseUntil > Date.now() || (outstanding(other) && rank[eventType(other)] < rank[eventType(item)])));

// Separate from the clearable, capped visual history. Credentials never enter payloads or diagnostics.
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dana-push-receipts', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('associations', { keyPath: 'pushRef' });
      request.result.createObjectStore('receipts', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('El almacenamiento de recepción no está disponible.'));
  });
}

async function transaction<T>(mode: IDBTransactionMode, run: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(['associations', 'receipts'], mode);
      let value: T;
      run(tx, result => { value = result; });
      tx.oncomplete = () => {
        if (mode === 'readwrite') {
          try {
            globalThis.dispatchEvent?.(new Event('dana-receipt-change'));
            if (typeof BroadcastChannel !== 'undefined') {
              const channel = new BroadcastChannel('dana-receipt-status');
              channel.postMessage('changed');
              channel.close();
            }
          } catch { /* Optional UI updates must not invalidate a committed receipt. */ }
        }
        resolve(value);
      };
      tx.onerror = tx.onabort = () => reject(new Error('No pudimos guardar el seguimiento de recepción.'));
    });
  } finally { db.close(); }
}

export async function saveReceiptAssociation(association: ReceiptAssociation) {
  if (!association.pushRef.trim() || !association.eventAuthToken.trim()) throw new Error('Faltan credenciales de recepción.');
  const saved = await transaction<boolean>('readwrite', (tx, result) => {
    const store = tx.objectStore('associations');
    const request = store.get(association.pushRef);
    request.onsuccess = () => {
      const previous = request.result as Association | undefined;
      // References are immutable: even a resend cannot steal credentials from an older pending receipt.
      if (previous) { result(previous.eventAuthToken === association.eventAuthToken); return; }
      store.add({ ...association, savedAt: new Date().toISOString() });
      result(true);
    };
  });
  if (!saved) throw new Error('La referencia ya tiene otra asociación; se conservó la original.');
}

export async function queuePushReceipt(payload: Record<string, unknown>, timestamp = new Date().toISOString()) {
  return queuePushEvent('PUSH_RECEIVED', payload, timestamp);
}

export async function queuePushEvent(type: TrackingEventType, payload: Record<string, unknown>, timestamp = new Date().toISOString(), accion = '') {
  if (!Object.prototype.hasOwnProperty.call(rank, type) || (type === 'PUSH_CLICKED' ? accion !== 'CONOCER_MAS' : accion !== '')) return;
  const data = payload.data as Record<string, unknown> | undefined;
  const pushRef = typeof data?.push_ref === 'string' ? data.push_ref : '';
  const messageId = typeof payload.messageId === 'string' ? payload.messageId : '';
  if (!pushRef.trim() || !messageId.trim()) return;
  const id = JSON.stringify([pushRef, messageId, type, accion]);
  await transaction<void>('readwrite', (tx, result) => {
    const store = tx.objectStore('receipts');
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result as Receipt[];
      // Includes phase-one keys (three parts) without migrating or deleting existing records.
      if (!all.some(item => item.pushRef === pushRef && item.messageId === messageId && eventType(item) === type && (item.accion ?? '') === accion)) {
        const item: Receipt = { id, pushRef, messageId, eventType: type, accion, timestamp, status: 'pending', attempts: 0, retryAt: 0, terminal: false, leaseUntil: 0 };
        if (advanced(item, all)) { item.status = 'superseded'; item.terminal = true; }
        store.add(item);
      }
      result();
    };
  });
}

async function claimReceipt(id: string) {
  return transaction<{ receipt: Receipt; association: Association } | null>('readwrite', (tx, result) => {
    result(null);
    const store = tx.objectStore('receipts');
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result as Receipt[];
      const receipt = all.find(item => item.id === id);
      const now = Date.now();
      if (!receipt || receipt.status === 'accepted' || receipt.terminal || receipt.retryAt > now || receipt.leaseUntil > now) return;
      if (advanced(receipt, all)) { store.put({ ...receipt, status: 'superseded', terminal: true }); return; }
      if (blocked(receipt, all)) return;
      const credentials = tx.objectStore('associations').get(receipt.pushRef);
      credentials.onsuccess = () => {
        const association = credentials.result as Association | undefined;
        if (!association) return;
        const claimed: Receipt = { ...receipt, status: 'sending', lastAttemptAt: new Date().toISOString(), owner: crypto.randomUUID(), leaseUntil: now + 45_000, attempts: receipt.attempts + 1 };
        store.put(claimed);
        result({ receipt: claimed, association });
      };
    };
  });
}

async function finishReceipt(receipt: Receipt, accepted: boolean, terminal: boolean) {
  await transaction<void>('readwrite', (tx, result) => {
    const store = tx.objectStore('receipts');
    const request = store.get(receipt.id);
    request.onsuccess = () => {
      const current = request.result as Receipt;
      if (current?.owner === receipt.owner) store.put({
        ...current, status: accepted ? 'accepted' : 'error', terminal, leaseUntil: 0, owner: undefined,
        acceptedAt: accepted ? new Date().toISOString() : undefined,
        retryAt: accepted || terminal ? 0 : Date.now() + Math.min(900_000, 30_000 * 2 ** Math.min(current.attempts - 1, 5))
      });
      result();
    };
  });
}

export async function flushPushReceipts() {
  let endpoint: URL;
  try {
    endpoint = new URL(import.meta.env.VITE_DANA_PUSH_API_URL);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) return;
  } catch { return; }
  const receipts = await transaction<Receipt[]>('readonly', (tx, result) => {
    const request = tx.objectStore('receipts').getAll();
    request.onsuccess = () => result(request.result);
  });
  // One bounded pass, never a retry loop. Later availability signals resume eligible receipts.
  for (const item of receipts.sort((a, b) => rank[eventType(a)] - rank[eventType(b)] || a.timestamp.localeCompare(b.timestamp))) {
    const claimed = await claimReceipt(item.id);
    if (!claimed) continue;
    const { receipt, association } = claimed;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let accepted = false, terminal = false;
    try {
      const response = await fetch(endpoint.href, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal,
        body: JSON.stringify({ action: 'event', push_ref: receipt.pushRef, eventAuthToken: association.eventAuthToken,
          event: eventType(receipt), messageId: receipt.messageId, timestamp: receipt.timestamp, accion: receipt.accion ?? '' })
      });
      terminal = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
      if (response.status === 202) {
        const body = await response.json();
        accepted = body?.success === true && body?.uploadAccepted === true;
      }
    } catch { /* Keep only sanitized state, never server responses or authorization tokens. */ }
    finally { clearTimeout(timer); }
    await finishReceipt(receipt, accepted, terminal);
  }
}

export async function getReceiptDiagnostics(): Promise<ReceiptDiagnostics> {
  return transaction<ReceiptDiagnostics>('readonly', (tx, result) => {
    let associated = false;
    const associations = tx.objectStore('associations').count();
    associations.onsuccess = () => { associated = associations.result > 0; };
    const receipts = tx.objectStore('receipts').getAll();
    receipts.onsuccess = () => {
      const items = (receipts.result as Receipt[]).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      result({ associated, lastEvent: items[0] ? eventType(items[0]) : null,
        status: items[0]?.status ?? null, pending: items.filter(outstanding).length,
        events: items.slice(0, 20).map(item => ({ id: item.id, eventType: eventType(item), messageId: item.messageId, timestamp: item.timestamp,
          status: item.status, sent: item.attempts > 0, accepted: item.status === 'accepted', accion: item.accion ?? '' })) });
    };
  });
}

export async function nextReceiptAttempt(): Promise<number | null> {
  return transaction<number | null>('readonly', (tx, result) => {
    let references: string[] = [];
    const associations = tx.objectStore('associations').getAllKeys();
    associations.onsuccess = () => { references = associations.result as string[]; };
    const receipts = tx.objectStore('receipts').getAll();
    receipts.onsuccess = () => {
      const all = receipts.result as Receipt[];
      const times = all
        .filter(item => outstanding(item) && references.includes(item.pushRef) && !blocked(item, all))
        .map(item => Math.max(item.retryAt, item.leaseUntil));
      result(times.length ? times.reduce((minimum, at) => Math.min(minimum, at)) : null);
    };
  });
}
