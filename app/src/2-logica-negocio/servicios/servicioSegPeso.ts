import { collection, getDocs, query, where, orderBy, limit, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../../3-acceso-datos/firebase/config';
import { userService } from '../../3-acceso-datos/firebase/firestoreService';

export interface RegistroPeso {
  id?: string;
  userId: string;
  peso: number; // kg
  fecha: string; // YYYY-MM-DD
  notas?: string;
  registradoEn: Timestamp;
}

export interface TendenciaPeso {
  actual: number;
  cambio7dias: number;
  cambio30dias: number;
  tendencia: 'bajando' | 'subiendo' | 'estable';
  velocidad: number; // kg/semana
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

async function getLastRecordBeforeOrOn(userId: string, dateStr: string): Promise<RegistroPeso | null> {
  const col = collection(db, 'registros_peso');
  const qy = query(
    col,
    where('userId', '==', userId),
    where('fecha', '<=', dateStr),
    orderBy('fecha', 'desc'),
    limit(1)
  );
  const snap = await getDocs(qy);
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data() as Record<string, unknown>;
  return {
    id: d.id,
    userId: String(data.userId || ''),
    peso: Number(data.peso || 0),
    fecha: String(data.fecha || ''),
    notas: typeof data.notas === 'string' ? data.notas : undefined,
    registradoEn: (data.registradoEn as Timestamp) || Timestamp.now()
  };
}

export async function registrarPeso(userId: string, peso: number, fecha: string, notas?: string): Promise<void> {
  // Validaciones
  if (!userId) throw new Error('userId requerido');
  if (typeof peso !== 'number' || Number.isNaN(peso)) throw new Error('peso inválido');
  if (peso < 30 || peso > 300) throw new Error('peso fuera de rango (30-300 kg)');
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(fecha)) throw new Error('fecha inválida (YYYY-MM-DD)');

  const col = collection(db, 'registros_peso');

  // verificar si existe registro para esa fecha
  const qExist = query(col, where('userId', '==', userId), where('fecha', '==', fecha), limit(1));
  const existSnap = await getDocs(qExist);

  // advertencia por salto brusco (>10kg en 7 días)
  const prev7 = await getLastRecordBeforeOrOn(userId, daysAgoStr(7));
  if (prev7) {
    const diff = peso - prev7.peso;
    if (Math.abs(diff) > 10) {
      console.warn('⚠️ Posible error en registro de peso: variación > 10kg en 7 días');
    }
  }

  if (!existSnap.empty) {
    // actualizar
    const docId = existSnap.docs[0].id;
    await updateDoc(doc(db, 'registros_peso', docId), {
      peso,
      notas,
      registradoEn: Timestamp.now()
    });
  } else {
    // crear
    await addDoc(col, {
      userId,
      peso,
      fecha,
      notas,
      registradoEn: Timestamp.now()
    });
  }

  // actualizar peso actual en perfil
  await userService.updateUserProfile(userId, { currentWeight: peso, updatedAt: Timestamp.now() });
}

export async function obtenerHistorialPeso(userId: string, dias: number): Promise<RegistroPeso[]> {
  if (!userId) return [];
  const from = daysAgoStr(clamp(dias, 1, 365));
  const col = collection(db, 'registros_peso');
  const qy = query(
    col,
    where('userId', '==', userId),
    where('fecha', '>=', from),
    orderBy('fecha', 'desc')
  );
  const snap = await getDocs(qy);
  return snap.docs.map(d => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      userId: String(data.userId || ''),
      peso: Number(data.peso || 0),
      fecha: String(data.fecha || ''),
      notas: typeof data.notas === 'string' ? data.notas : undefined,
      registradoEn: (data.registradoEn as Timestamp) || Timestamp.now()
    } as RegistroPeso;
  });
}

export async function calcularTendencia(userId: string): Promise<TendenciaPeso> {
  const registros = await obtenerHistorialPeso(userId, 60); // suficiente para 30 días
  if (registros.length === 0) {
    return {
      actual: 0,
      cambio7dias: 0,
      cambio30dias: 0,
      tendencia: 'estable',
      velocidad: 0
    };
  }

  const latest = registros[0];
  const target7 = daysAgoStr(7);
  const target30 = daysAgoStr(30);

  const atOrBefore = (target: string) => {
    // registros está en desc; buscamos primero con fecha <= target
    return registros.find(r => r.fecha <= target) || registros[registros.length - 1];
  };

  const rec7 = atOrBefore(target7);
  const rec30 = atOrBefore(target30);

  const cambio7 = latest.peso - (rec7?.peso ?? latest.peso);
  const cambio30 = latest.peso - (rec30?.peso ?? latest.peso);

  let velocidad = 0; // kg/semana
  if (rec30 && rec30 !== latest) {
    velocidad = cambio30 / (30 / 7);
  } else if (rec7 && rec7 !== latest) {
    velocidad = cambio7 / 1; // 7 días = 1 semana
  }

  const tendencia: TendenciaPeso['tendencia'] = velocidad < -0.2 ? 'bajando' : velocidad > 0.2 ? 'subiendo' : 'estable';

  return {
    actual: latest.peso,
    cambio7dias: +(cambio7.toFixed(1)),
    cambio30dias: +(cambio30.toFixed(1)),
    tendencia,
    velocidad: +((velocidad)).toFixed(2)
  };
}

export async function obtenerResumenProgreso(userId: string): Promise<{ pesoInicial: number; pesoActual: number; pesoObjetivo: number; pesoPerdido: number; pesoFaltante: number; porcentajeCompletado: number; }> {
  const col = collection(db, 'registros_peso');
  const qAsc = query(col, where('userId', '==', userId), orderBy('fecha', 'asc'), limit(1));
  const qDesc = query(col, where('userId', '==', userId), orderBy('fecha', 'desc'), limit(1));

  const [firstSnap, lastSnap] = await Promise.all([getDocs(qAsc), getDocs(qDesc)]);

  const first = firstSnap.empty ? null : (firstSnap.docs[0].data() as Record<string, unknown>);
  const last = lastSnap.empty ? null : (lastSnap.docs[0].data() as Record<string, unknown>);

  const profile = await userService.getUserProfile(userId);

  const pesoInicial = first ? Number(first.peso || 0) : Number(profile?.currentWeight || 0);
  const pesoActual = last ? Number(last.peso || 0) : Number(profile?.currentWeight || 0);
  const pesoObjetivo = typeof profile?.targetWeight === 'number' ? profile!.targetWeight! : pesoActual;

  const totalPorPerder = pesoInicial - pesoObjetivo;
  const perdido = pesoInicial - pesoActual; // puede ser negativo si está subiendo

  const porcentaje = totalPorPerder === 0 ? 0 : clamp(Math.round((perdido / totalPorPerder) * 100), -100, 100);
  const faltante = +(pesoActual - pesoObjetivo).toFixed(1);

  return {
    pesoInicial: +pesoInicial.toFixed(1),
    pesoActual: +pesoActual.toFixed(1),
    pesoObjetivo: +pesoObjetivo.toFixed(1),
    pesoPerdido: +perdido.toFixed(1),
    pesoFaltante: faltante,
    porcentajeCompletado: porcentaje
  };
}

// Helper para auto-registro desde configuración
export async function autoRegistroDesdeConfiguracion(userId: string, currentWeight?: number, fecha?: string) {
  if (!userId || typeof currentWeight !== 'number') return;
  const f = fecha || todayStr();
  await registrarPeso(userId, currentWeight, f, 'Actualizado desde Configuración');
}
