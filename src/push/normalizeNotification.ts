function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstText(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && Boolean(value.trim()))?.trim();
}

export type NotificationCta = { label: string; action: string; url: string };

function notificationCta(data: Record<string, unknown>): NotificationCta | undefined {
  const label = firstText(data.cta_label);
  const action = firstText(data.cta_action);
  const destination = firstText(data.cta_url);
  if (!label || !action || !destination || !/^https:\/\//i.test(destination) || /[\u0000-\u0020\u007f]/.test(destination)) return;
  try {
    const url = new URL(destination);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return;
    const sensitive = (key: string) => /^(pushref|eventauthtoken|token|accesstoken|authorization|credentials?)$/.test(key.toLowerCase().replace(/[_-]/g, ''));
    for (const params of [url.searchParams, new URLSearchParams(url.hash.slice(1))]) {
      if ([...params.keys()].some(sensitive)) return;
    }
    const pushRef = firstText(data.push_ref);
    if (pushRef && decodeURIComponent(url.href).includes(pushRef)) return;
    return { label, action, url: url.href };
  } catch { /* Invalid or credential-bearing destinations never become actions. */ }
}

export function normalizeNotification(payload: unknown) {
  const root = record(payload);
  const notification = record(root.notification);
  const data = record(root.data);
  const title = firstText(notification.title, data.Titulo, data.titulo, data.title) ?? 'DANA Push Experience';
  const body = firstText(notification.body, data.Mensaje, data.mensaje, data.body) ?? '';
  let image: string | undefined;
  for (const candidate of [data.IMAGEN, data.imagen, notification.image, data.image]) {
    const text = firstText(candidate);
    if (!text) continue;
    try {
      const url = new URL(text);
      if (url.protocol === 'https:' && !url.username && !url.password) { image = url.href; break; }
    } catch { /* Ignore malformed image URLs without hiding the message. */ }
  }
  return { title, body, image, cta: notificationCta(data) };
}
