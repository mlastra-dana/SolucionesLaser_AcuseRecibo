export type PushVisitor = { nombre: string; email: string; telefono: string; token: string };
export type DanaVisitorPayload = PushVisitor & { source?: 'DANA_PUSH_EXPERIENCE' };

export function validateVisitorDetails(payload: Pick<PushVisitor, 'nombre' | 'email' | 'telefono'>) {
  if (!payload.nombre.trim() || payload.nombre.trim().length > 120) {
    return { field: 'nombre' as const, message: 'Introduce tu nombre completo (hasta 120 caracteres).' };
  }
  if (payload.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
    return { field: 'email' as const, message: 'Introduce un email válido.' };
  }
  const phone = payload.telefono.trim();
  const digits = phone.replace(/\D/g, '');
  if (phone.length > 40 || !/^\+?[\d\s().-]+$/.test(phone) || digits.length < 7 || digits.length > 15) {
    return { field: 'telefono' as const, message: 'Introduce un teléfono válido, con código de país si corresponde.' };
  }
  return null;
}

// Phase 1 deliberately has no network call, even if a future API URL is configured.
export async function registerPushVisitor(payload: DanaVisitorPayload) {
  const invalid = validateVisitorDetails(payload);
  if (invalid) throw new Error(invalid.message);
  if (!payload.token.trim()) throw new Error('El registro requiere un token FCM.');
  return {
    status: 'pending' as const,
    endpointConfigured: Boolean(import.meta.env.VITE_DANA_PUSH_API_URL),
    message: 'Integración automática con DANA pendiente. El navegador está disponible para una prueba manual.'
  };
}
