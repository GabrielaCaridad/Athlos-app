/**
 * Hook para obtener insights personales.
 * Usa cache inicial y refresca en segundo plano.
 */
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
  // Prioriza override externo; si no, usa el uid de la sesión
  const { user } = useAuth();
  const userId: string | null = (userIdOverride ?? user?.uid) ?? null;

  // Estado de insights, carga y error
  const [insights, setInsights] = useState<PersonalInsight[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Refetch manual ignorando cache en memoria
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

  // Carga inicial: muestra cache si hay y luego refresca
  useEffect(() => {
    let canceled = false;
    const run = async () => {
      if (!userId) return;
      setError(null);
      try {
        const service = new CorrelationInsightsService();
        // 1) Cargar insights guardados para mostrar algo al instante
        const cached = await service.getSavedInsights(userId);
        if (!canceled && Array.isArray(cached) && cached.length > 0) {
          setInsights(cached);
        }

        // 2) Si no había cache, indicar loading durante el primer cálculo
        if (!cached || cached.length === 0) {
          if (!canceled) setLoading(true);
        }

        // 3) Refrescar en segundo plano (no bloquear la UI si había cache)
        const fresh = await service.analyzeUserPatterns(userId, 14);
        if (!canceled) setInsights(fresh);
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
