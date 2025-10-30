/* eslint-disable @typescript-eslint/no-unused-vars */
/*
  proactiveService (placeholder)
  ------------------------------------------------------------
  Servicio mínimo para mensajes proactivos. Actualmente no-op para
  mantener compatibilidad en Dashboard sin depender de servicios
  eliminados. 
*/

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
