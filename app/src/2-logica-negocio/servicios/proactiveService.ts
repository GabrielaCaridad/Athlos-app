/* eslint-disable @typescript-eslint/no-unused-vars */
// Servicio mínimo para mensajes proactivos (placeholder)
// Implementación no-op para mantener compatibilidad del Dashboard sin depender de chatService/apoloService eliminados.

export type ProactiveMessage = {
  id: string;
  title: string;
  message: string;
  createdAt?: string | Date;
};

export async function getLatestUnreadProactive(_userId: string): Promise<ProactiveMessage | null> {
  // Placeholder: sin backend, no hay mensajes pendientes
  return null;
}

export async function markProactiveAsRead(_id: string): Promise<void> {
  // Placeholder: no-op
}
