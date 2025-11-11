// userDataService
// ------------------------------------------------------------
// Objetivo: proveer al dashboard y otras vistas una SUSCRIPCIÓN combinada
// (workouts + foods) para una ventana móvil de días recientes, reaccionando
// en tiempo real a cada cambio.
// Qué hace:
// - Calcula un rango [fromStr, toStr] en formato YYYY-MM-DD UTC para foods.
// - Calcula startTs (Timestamp) para workouts (filtra por createdAt >= inicio).
// - Escucha dos snapshots independientes y emite un objeto combinado cada vez.
// Por qué así:
// - Evitamos flicker o estados intermedios (primero workouts, luego foods) al
//   emitir siempre tras actualizar cualquiera.
// - Unificamos la colección de alimentos en 'foodDatabase'.
// Índices necesarios (Firestore):
// - workouts: composite userId+createdAt DESC (ordenado por createdAt)
// - foodDatabase: composite userId+date DESC (rango + orderBy(date,'desc'))
// Ojo:
// - Si falta un índice, Firestore lanzará 'failed-precondition' y debe crearse.
// - Este servicio NO pagina; si la ventana (days) es grande, considerar límites.
//-------------------------------------------------------------
import { collection, onSnapshot, orderBy, query, where, Timestamp, Unsubscribe } from 'firebase/firestore';
import { db } from '../../3-acceso-datos/firebase/config';
import type { WorkoutSession } from '../../3-acceso-datos/firebase/firestoreService';
import type { UserFoodEntry } from '../../3-acceso-datos/firebase/foodDataService';
import { formatDateYYYYMMDD } from '../../utils/date';

export type UserData = {
  workouts: WorkoutSession[];
  foods: UserFoodEntry[];
};

export function subscribeUserData(userId: string, days: number, cb: (data: UserData) => void): Unsubscribe {
  // Ventana móvil desde medianoche local de hoy hacia atrás N días
  // Nota: se usa medianoche local para workouts y claves UTC ISO para foods.
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startBoundary = new Date(todayMidnight);
  startBoundary.setDate(startBoundary.getDate() - Math.max(1, days));
  const startTs = Timestamp.fromDate(startBoundary);
  const fromStr = formatDateYYYYMMDD(startBoundary);
  const toStr = formatDateYYYYMMDD(todayMidnight);

  let workouts: WorkoutSession[] = [];
  let foods: UserFoodEntry[] = [];

  // Emite el estado combinado actual (sincronización simple)
  const maybeEmit = () => cb({ workouts, foods });

  const qWorkouts = query(
    collection(db, 'workouts'),
    where('userId', '==', userId),
    where('createdAt', '>=', startTs),
    orderBy('createdAt', 'desc')
  );
  const unSubWorkouts = onSnapshot(qWorkouts, (snap) => {
    workouts = snap.docs.map(d => {
      const data = d.data() as Record<string, unknown>;
      return { id: d.id, ...data } as WorkoutSession;
    });
    maybeEmit();
  });

  // Lectura de alimentos unificados en 'foodDatabase' (antes otra colección).
  const qFoods = query(
    collection(db, 'foodDatabase'),
    where('userId', '==', userId),
    where('date', '>=', fromStr),
    where('date', '<=', toStr),
    orderBy('date', 'desc')
  );
  const unSubFoods = onSnapshot(qFoods, (snap) => {
    foods = snap.docs.map(d => {
      const data = d.data() as Record<string, unknown>;
      return { id: d.id, ...data } as UserFoodEntry;
    });
    maybeEmit();
  });

  return () => { unSubWorkouts(); unSubFoods(); };
}
