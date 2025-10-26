import { useEffect, useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import { CorrelationInsightsService, PersonalInsight } from '../../2-logica-negocio/servicios';

export interface UsePersonalInsightsReturn {
  insights: PersonalInsight[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const usePersonalInsights = (userIdOverride?: string): UsePersonalInsightsReturn => {
  const { user } = useAuth();
  const userId: string | null = (userIdOverride ?? user?.uid) ?? null;

  const [insights, setInsights] = useState<PersonalInsight[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
