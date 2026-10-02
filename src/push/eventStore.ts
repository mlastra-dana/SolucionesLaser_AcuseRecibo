import { normalizeNotification } from './normalizeNotification';

export type PushEventType = 'PUSH_RECEIVED' | 'PUSH_OPENED' | 'PUSH_CLICKED';
export type PushEvent = {
  id: string;
  type: PushEventType;
  messageId?: string;
  timestamp: string;
  context: 'foreground' | 'background';
  title?: string;
  body?: string;
  accion?: string;
  payload: Record<string, unknown>;
};

export function getMessageDetails(payload: Record<string, unknown>) {
  return normalizeNotification(payload);
}

export type ObservedNotification = {
  id: string; messageId?: string; title?: string; body?: string;
  timestamp: string; opened: boolean; received: boolean;
  context: PushEvent['context']; payload: Record<string, unknown>;
};

export function getNotificationHistory(events: PushEvent[]): ObservedNotification[] {
  const messages = new Map<string, ObservedNotification>();
  for (const event of [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    const id = event.messageId || event.id;
    const previous = messages.get(id);
    const details = getMessageDetails(event.payload);
    messages.set(id, {
      id, messageId: event.messageId, ...details,
      timestamp: previous?.timestamp ?? event.timestamp,
      received: Boolean(previous?.received || event.type === 'PUSH_RECEIVED'),
      opened: Boolean(previous?.opened || event.type === 'PUSH_OPENED'),
      context: event.context, payload: event.payload
    });
  }
  return [...messages.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// Only diagnostic events are kept locally, capped at 50. Visitor names and tokens are not stored here.
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dana-push-events', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('events', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readPushEvents(): Promise<PushEvent[]> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('events', 'readonly');
      const request = tx.objectStore('events').getAll();
      tx.oncomplete = () => resolve((request.result as PushEvent[]).sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function recordPushEvent(type: PushEventType, context: PushEvent['context'], payload: Record<string, unknown>, timestamp = new Date().toISOString(), accion = ''): Promise<PushEvent> {
  const messageId = typeof payload.messageId === 'string' ? payload.messageId : undefined;
  const event: PushEvent = {
    id: messageId ? `${type}:${messageId}${accion ? `:${accion}` : ''}` : crypto.randomUUID(),
    type, context, messageId, timestamp, accion, ...getMessageDetails(payload), payload
  };
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('events', 'readwrite');
      const store = tx.objectStore('events');
      const existing = store.get(event.id);
      existing.onsuccess = () => {
        if (!existing.result) store.put(event);
        const all = store.getAll();
        all.onsuccess = () => {
          const sorted = (all.result as PushEvent[]).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
          sorted.slice(50).forEach(item => store.delete(item.id));
        };
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
  return event;
}

export async function clearPushEvents() {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('events', 'readwrite');
      tx.objectStore('events').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
