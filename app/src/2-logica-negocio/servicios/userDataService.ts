// Suscripción combinada de workouts + foods para días recientes.
// Emite en tiempo real un objeto unificado evitando estados intermedios.

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
  // Ventana móvil: desde medianoche local hacia atrás N días
  // Workouts usan medianoche local; foods usan claves ISO UTC (YYYY-MM-DD)
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startBoundary = new Date(todayMidnight);
  startBoundary.setDate(startBoundary.getDate() - Math.max(1, days));
  const startTs = Timestamp.fromDate(startBoundary);
  const fromStr = formatDateYYYYMMDD(startBoundary);
  const toStr = formatDateYYYYMMDD(todayMidnight);

  let workouts: WorkoutSession[] = [];
  let foods: UserFoodEntry[] = [];

  // Emite el estado combinado actual
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

  // Lectura de alimentos en 'foodDatabase'
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
