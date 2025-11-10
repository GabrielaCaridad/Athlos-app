/**
 * Propósito: exponer en la UI los datos combinados del usuario (workouts + foods) con un único hook.
 * Contexto: suscribe vía capa de negocio a una ventana reciente (por defecto 30 días) y devuelve loading.
 * Ojo: depende de userId; si falta, limpia y marca loading=false para no bloquear la UI.
 */
import { useEffect, useState } from 'react';
import { subscribeUserData, type UserData } from '../../2-logica-negocio/servicios/userDataService';

export function useUserData(userId?: string, days: number = 30) {
  const [data, setData] = useState<UserData>({ workouts: [], foods: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Qué hace: inicia/cancela la suscripción cuando cambian userId o days.
    // Por qué: mantener datos en tiempo real con el perfil activo sin fugas de memoria.
    // Nota: la capa de negocio ya usa claves de fecha UTC y requiere índices compuestos en Firestore.
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
