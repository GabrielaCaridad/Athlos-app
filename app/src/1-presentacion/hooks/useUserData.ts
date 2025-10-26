import { useEffect, useState } from 'react';
import { subscribeUserData, type UserData } from '../../2-logica-negocio/servicios/userDataService';

export function useUserData(userId?: string, days: number = 30) {
  const [data, setData] = useState<UserData>({ workouts: [], foods: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setData({ workouts: [], foods: [] }); setLoading(false); return; }
    setLoading(true);
    const unsub = subscribeUserData(userId, days, (d) => {
      setData(d);
      setLoading(false);
    });
    return () => unsub();
  }, [userId, days]);

  return { ...data, loading };
}
