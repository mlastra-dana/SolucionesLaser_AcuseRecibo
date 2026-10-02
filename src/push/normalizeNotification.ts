function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstText(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && Boolean(value.trim()))?.trim();
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
  return { title, body, image };
}
