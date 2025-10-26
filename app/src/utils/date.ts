// Utilidades de fecha compartidas

// YYYY-MM-DD en UTC para consistencia entre zonas horarias
export function formatDateYYYYMMDD(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Calcula edad a partir de distintos formatos de fecha de nacimiento.
// Permite: string (YYYY-MM-DD), Date o un objeto con toDate() (p.ej. Timestamp de Firestore).
// "fallback" define el valor por defecto en caso de datos inválidos.
export function calculateAge(
  dob?: string | Date | { toDate?: () => Date } | null,
  fallback: number = 25
): number {
  try {
    if (!dob) return fallback;

    let birthDate: Date | null = null;
    if (typeof dob === 'string') {
      const parsed = new Date(dob);
      birthDate = isNaN(parsed.getTime()) ? null : parsed;
    } else if (dob instanceof Date) {
      birthDate = isNaN(dob.getTime()) ? null : dob;
    } else if (typeof dob === 'object' && typeof dob.toDate === 'function') {
      const d = dob.toDate();
      birthDate = isNaN(d.getTime()) ? null : d;
    }

    if (!birthDate) return fallback;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    if (!Number.isFinite(age) || age < 0 || age > 110) return fallback;
    return age;
  } catch {
    return fallback;
  }
}
