export type TrackingVersion = 'v1' | 'v2';

export function getTrackingVersion(payload: Record<string, unknown>): TrackingVersion {
  const data = payload.data;
  return (data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, 'event_auth_token')) || payload.danaTrackingVersion === 'v2' ? 'v2' : 'v1';
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
  if (getTrackingVersion(payload) === 'v2') safe.danaTrackingVersion = 'v2';
  return safe;
}
