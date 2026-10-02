export type PushVisitor = { nombre: string; email: string; telefono: string; token: string };
export type DanaVisitorPayload = PushVisitor;

export function validateVisitorDetails(payload: Pick<PushVisitor, 'nombre' | 'email' | 'telefono'>) {
  if (!payload.nombre.trim() || payload.nombre.trim().length > 120) {
    return { field: 'nombre' as const, message: 'Introduce tu nombre completo (hasta 120 caracteres).' };
  }
  if (payload.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
    return { field: 'email' as const, message: 'Introduce un email válido.' };
  }
  if (!/^\+?\d{7,15}$/.test(payload.telefono.trim())) {
    return { field: 'telefono' as const, message: 'Introduce el teléfono con código de país: de 7 a 15 dígitos, sin espacios, con + inicial opcional.' };
  }
  return null;
}

export type DanaErrorCode = 'configuration' | 'unavailable' | 'http' | 'response' | 'conversation' | 'network' | 'timeout';
export class DanaRegistrationError extends Error {
  constructor(public readonly code: DanaErrorCode, message: string) { super(message); this.name = 'DanaRegistrationError'; }
}

export type DanaRegistrationResult = { success: true; conversationStarted: true; resultId?: string | number };
const uncertainResult = 'El registro podría haberse procesado. Comprueba si llegó la notificación antes de reintentar para evitar duplicados.';

export async function registerPushVisitor(payload: DanaVisitorPayload) {
  const invalid = validateVisitorDetails(payload);
  if (invalid) throw new Error(invalid.message);
  if (!payload.token.trim()) throw new Error('El registro requiere un token FCM.');
  let endpoint: URL;
  try {
    endpoint = new URL(import.meta.env.VITE_DANA_PUSH_API_URL);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw new Error();
  } catch { throw new DanaRegistrationError('configuration', 'La URL HTTPS de Lambda no está configurada correctamente. Revisa VITE_DANA_PUSH_API_URL.'); }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(endpoint.href, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ NOMBRE: payload.nombre.trim(), EMAIL: payload.email.trim(), TELEFONO: payload.telefono.trim(), TOKEN: payload.token.trim() }),
      signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error'
    });
    if (!response.ok) {
      const unavailable = [404, 502, 503, 504].includes(response.status);
      throw new DanaRegistrationError(unavailable ? 'unavailable' : 'http', unavailable
        ? `Lambda no está disponible (HTTP ${response.status}). ${uncertainResult}`
        : `Lambda respondió con error (HTTP ${response.status}). No se confirmó el registro.`);
    }
    let result: unknown;
    try {
      result = await response.json();
      // Function URLs normally return the body directly. Unwrap only an explicit invocation envelope.
      if (isRecord(result) && typeof result.statusCode === 'number' && 'body' in result) {
        if (result.statusCode < 200 || result.statusCode >= 300) throw new DanaRegistrationError('http', 'Lambda respondió con error. No se confirmó el registro.');
        result = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;
      }
    } catch (error) {
      if (controller.signal.aborted || error instanceof DanaRegistrationError) throw error;
      throw new DanaRegistrationError('response', `Lambda devolvió una respuesta no válida. ${uncertainResult}`);
    }
    if (!isRecord(result) || result.success !== true) throw new DanaRegistrationError('response', 'Lambda no confirmó un registro exitoso.');
    if (result.conversationStarted !== true) throw new DanaRegistrationError('conversation', 'DANAconnect no confirmó el inicio de la conversación. No se confirmó el envío.');
    return {
      success: true, conversationStarted: true,
      resultId: typeof result.resultId === 'string' || typeof result.resultId === 'number' ? result.resultId : undefined
    } satisfies DanaRegistrationResult;
  } catch (error) {
    if (controller.signal.aborted) throw new DanaRegistrationError('timeout', `Lambda tardó demasiado en responder. ${uncertainResult}`);
    if (error instanceof DanaRegistrationError) throw error;
    throw new DanaRegistrationError('network', `No pudimos conectar con Lambda. Revisa la conexión y la configuración CORS. ${uncertainResult}`);
  } finally { clearTimeout(timeout); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
