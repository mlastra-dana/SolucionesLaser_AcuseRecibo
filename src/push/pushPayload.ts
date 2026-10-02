export type TrackingVersion = 'v1' | 'v2';

export function trackingFields(payload: Record<string, unknown>) {
  const data = payload.data && typeof payload.data === 'object' ? payload.data as Record<string, unknown> : {};
  const text = (keys: string[]) => keys.map(key => data[key]).find(value => typeof value === 'string' && value.trim()) as string | undefined;
  const credentialPresent = ['event_auth_token', 'EVENT_AUTH_TOKEN', 'eventAuthToken'].some(key => Object.prototype.hasOwnProperty.call(data, key));
  return { pushRef: text(['push_ref', 'PUSH_REF', 'pushRef']) ?? '',
    eventAuthToken: text(['event_auth_token', 'EVENT_AUTH_TOKEN', 'eventAuthToken']), credentialPresent };
}

export function getTrackingVersion(payload: Record<string, unknown>): TrackingVersion {
  return trackingFields(payload).credentialPresent || payload.danaTrackingVersion === 'v2' ? 'v2' : 'v1';
}

function withoutCredentials(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutCredentials);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key.toLowerCase().replace(/_/g, '') !== 'eventauthtoken')
    .map(([key, child]) => [key, withoutCredentials(child)]));
  return value;
}

// History and UI retain correlation and CTA data, but never the signed credential.
export function safePushPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const safe = withoutCredentials(payload) as Record<string, unknown>;
  if (!safe.messageId && typeof payload.fcmMessageId === 'string') safe.messageId = payload.fcmMessageId;
  const fields = trackingFields(payload);
  if (fields.pushRef) safe.data = { ...(safe.data as Record<string, unknown>), push_ref: fields.pushRef };
  if (getTrackingVersion(payload) === 'v2') {
    safe.danaTrackingVersion = 'v2';
    safe.danaCredentialDetected = Boolean(fields.eventAuthToken) || payload.danaCredentialDetected === true;
  }
  return safe;
}
