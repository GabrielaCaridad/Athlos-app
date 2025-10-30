// En este hook calculo y expongo insights personales del usuario (patrones útiles).
// Importo hooks de React para manejar estado, efectos y callbacks memoizados.
import { useEffect, useState, useCallback } from 'react';
// Traigo la sesión actual para conocer el userId si no me lo pasan desde fuera.
import { useAuth } from './useAuth';
// Uso el servicio de negocio que analiza correlaciones y devuelve insights listos para mostrar.
import { CorrelationInsightsService, PersonalInsight } from '../../2-logica-negocio/servicios';

export interface UsePersonalInsightsReturn {
  insights: PersonalInsight[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const usePersonalInsights = (userIdOverride?: string): UsePersonalInsightsReturn => {
  // Si no me entregan un userId explícito, ocupo el que viene de la sesión.
  const { user } = useAuth();
  const userId: string | null = (userIdOverride ?? user?.uid) ?? null;

  // Estados del hook: lista de insights, bandera de carga y error a mostrar en UI.
  const [insights, setInsights] = useState<PersonalInsight[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Esta función vuelve a consultar los insights (útil para un botón "Refrescar").
  const fetchInsights = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const service = new CorrelationInsightsService();
      const result = await service.analyzeUserPatterns(userId, 14);
      setInsights(result);
    } catch (err: unknown) {
      console.error('[usePersonalInsights] refetch error:', err);
      const message = (err as { message?: string })?.message || 'Error al obtener insights';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Al montar (y cuando cambia el userId) hago una primera consulta de insights.
  useEffect(() => {
    let canceled = false;
    const run = async () => {
      if (!userId) return;
      setLoading(true);
      setError(null);
      try {
        const service = new CorrelationInsightsService();
        const result = await service.analyzeUserPatterns(userId, 14);
        if (!canceled) {
          setInsights(result);
        }
      } catch (err: unknown) {
        console.error('[usePersonalInsights] initial fetch error:', err);
        if (!canceled) {
          const message = (err as { message?: string })?.message || 'Error al obtener insights';
          setError(message);
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    };
    run();
    return () => {
      canceled = true;
    };
  }, [userId]);

  return { insights, loading, error, refetch: fetchInsights };
};
