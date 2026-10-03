import { recordPushEvent } from './eventStore';
import { normalizeNotification } from './normalizeNotification';
import { flushPushReceipts, queuePushEvent } from './receiptTracking';
import { isStandalone } from './platform';

function isInstalledTouchApp() {
  try {
    return navigator.maxTouchPoints > 0 && isStandalone() &&
      (window.matchMedia('(pointer: coarse)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  } catch { return false; }
}

export async function followNotificationCta(payload: Record<string, unknown>) {
  const cta = normalizeNotification(payload).cta;
  if (!cta) return;
  const timestamp = new Date().toISOString();
  const directNavigation = isInstalledTouchApp();
  // Reserve a window while user activation is live; its destination receives neither opener nor credentials.
  let destination: Window | null = null;
  try {
    // Installed mobile apps navigate directly after persistence, without a blank external window.
    if (!directNavigation) destination = window.open('about:blank', '_blank');
    if (destination) destination.opener = null;
  } catch { /* A blocked popup falls back to this tab after durable storage. */ }
  const stored = await Promise.allSettled([
    queuePushEvent('PUSH_CLICKED', payload, timestamp, cta.action),
    recordPushEvent('PUSH_CLICKED', 'foreground', payload, timestamp, cta.action)
  ]);
  // Persist first, start reporting, then navigate without waiting for HTTP acceptance.
  void flushPushReceipts().catch(() => {});
  let navigated = false;
  try {
    if (destination && !destination.closed) destination.location.replace(cta.url);
    else window.location.assign(cta.url);
    navigated = true;
  } catch { destination?.close(); }
  return { stored: stored.every(item => item.status === 'fulfilled'), navigated };
}
