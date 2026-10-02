export type EventTimezone = { timezone: string; timezoneWarning?: 'stored' | 'utc' | 'legacy' };

export function validTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || /^[+-]/.test(value)) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; }
  catch { return false; }
}

function detectedTimezone(): string | undefined {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return validTimezone(timezone) ? timezone : undefined;
  } catch { return undefined; }
}

// Independent metadata keeps the existing receipt/history databases and credentials unchanged.
async function rememberTimezone(detected?: string): Promise<string | undefined> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('dana-push-timezone', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('settings');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Zona horaria no disponible.'));
  });
  try {
    return await new Promise<string | undefined>((resolve, reject) => {
      const tx = db.transaction('settings', detected ? 'readwrite' : 'readonly');
      const store = tx.objectStore('settings');
      let previous: string | undefined;
      const request = store.get('lastValidTimezone');
      request.onsuccess = () => {
        // This key is written only after validation; reading must also work if Intl is unavailable.
        previous = typeof request.result === 'string' && request.result.trim() ? request.result : undefined;
        if (detected && detected !== previous) store.put(detected, 'lastValidTimezone');
      };
      tx.oncomplete = () => resolve(previous);
      tx.onerror = tx.onabort = () => reject(new Error('Zona horaria no disponible.'));
    });
  } finally { db.close(); }
}

export async function captureDeviceTimezone(): Promise<EventTimezone> {
  const detected = detectedTimezone();
  let stored: string | undefined;
  try { stored = await rememberTimezone(detected); }
  catch { /* Metadata failure must not prevent receipt persistence or reporting. */ }
  if (detected) return { timezone: detected };
  if (stored) return { timezone: stored, timezoneWarning: 'stored' };
  return { timezone: 'UTC', timezoneWarning: 'utc' };
}

export function storedEventTimezone(event: Partial<EventTimezone>): EventTimezone {
  return typeof event.timezone === 'string' && event.timezone.trim()
    ? { timezone: event.timezone, timezoneWarning: event.timezoneWarning }
    : { timezone: 'UTC', timezoneWarning: 'legacy' };
}

export function formatEventTime(timestamp: string, timezone = detectedTimezone() ?? 'UTC'): string {
  const instant = new Date(timestamp);
  if (!Number.isFinite(instant.getTime())) return '—';
  let parts: Intl.DateTimeFormatPart[];
  try { parts = new Intl.DateTimeFormat('en-US', {
    timeZone: validTimezone(timezone) ? timezone : 'UTC', calendar: 'gregory', numberingSystem: 'latn',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  }).formatToParts(instant); }
  catch { return `${instant.toISOString()} (UTC)`; }
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')} ${part('dayPeriod')}`;
}
