import { collection, onSnapshot, orderBy, query, where, Timestamp, Unsubscribe } from 'firebase/firestore';
import { db } from '../../3-acceso-datos/firebase/config';
import type { WorkoutSession } from '../../3-acceso-datos/firebase/firestoreService';
import type { UserFoodEntry } from '../../3-acceso-datos/firebase/foodDataService';

export type UserData = {
  workouts: WorkoutSession[];
  foods: UserFoodEntry[];
};

export function subscribeUserData(userId: string, days: number, cb: (data: UserData) => void): Unsubscribe {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - Math.max(1, days));
  const startTs = Timestamp.fromDate(start);
  const fromStr = start.toISOString().slice(0, 10);
  const toStr = new Date().toISOString().slice(0, 10);

  let workouts: WorkoutSession[] = [];
  let foods: UserFoodEntry[] = [];

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

  const qFoods = query(
    collection(db, 'userFoodEntries'),
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
