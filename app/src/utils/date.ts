// Utilidades de fecha compartidas
// ------------------------------------------------------------
// - formatDateYYYYMMDD: genera YYYY-MM-DD en hora LOCAL del dispositivo
//   Ejemplo: 2025-10-29
// - calculateAge: acepta string (YYYY-MM-DD), Date o Timestamp-like { toDate }
//   y devuelve una edad válida con fallback si los datos son inconsistentes.

// YYYY-MM-DD en LOCAL para consistencia visual con el usuario y claves locales
export function formatDateYYYYMMDD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Normaliza cualquier valor a clave local YYYY-MM-DD
// Acepta: string (YYYY-MM-DD o parseable), Date, o Timestamp-like { toDate() }
export function normalizeToLocalDateKey(value?: string | Date | { toDate?: () => Date } | null): string {
  try {
    if (!value) return formatDateYYYYMMDD(new Date());
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) return formatDateYYYYMMDD(parsed);
      return formatDateYYYYMMDD(new Date());
    }
    if (value instanceof Date) {
      return formatDateYYYYMMDD(value);
    }
    if (typeof value === 'object' && typeof value.toDate === 'function') {
      const d = value.toDate();
      return isNaN(d.getTime()) ? formatDateYYYYMMDD(new Date()) : formatDateYYYYMMDD(d);
    }
    return formatDateYYYYMMDD(new Date());
  } catch {
    return formatDateYYYYMMDD(new Date());
  }
}

// Devuelve la clave local de "hoy"
export function getTodayLocalDateKey(): string {
  return formatDateYYYYMMDD(new Date());
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

  if (!birthDate) return fallback; // Formato inválido

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    if (!Number.isFinite(age) || age < 0 || age > 110) return fallback; // Sanitiza edades imposibles
    return age;
  } catch {
    return fallback;
  }
}
