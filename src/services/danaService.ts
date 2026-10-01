export type PushVisitor = { nombre: string; apellido: string; token: string };
export type DanaVisitorPayload = PushVisitor & { source: 'DANA_PUSH_EXPERIENCE' };

// Phase 1 deliberately has no network call, even if a future API URL is configured.
export async function registerPushVisitor(payload: DanaVisitorPayload) {
  if (!payload.nombre.trim() || !payload.apellido.trim() || !payload.token.trim()) {
    throw new Error('El registro requiere nombre, apellido y token FCM.');
  }
  return {
    status: 'pending' as const,
    endpointConfigured: Boolean(import.meta.env.VITE_DANA_PUSH_API_URL),
    message: 'Integración automática con DANA pendiente. El navegador está disponible para una prueba manual.'
  };
}
