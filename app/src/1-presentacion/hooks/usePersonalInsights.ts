// Propósito: calcular y exponer insights personales (correlaciones simples y patrones) para el usuario.
// Contexto: primero muestra cache local si existe para respuesta rápida, luego recalcula en segundo plano.
// Ojo: no dispara cálculo si falta userId; maneja errores devolviendo mensaje simple para UI.
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
  // UserId: prioriza override externo; si no, el uid de la sesión para flexibilidad (p.e. vista admin).
  const { user } = useAuth();
  const userId: string | null = (userIdOverride ?? user?.uid) ?? null;

  // Estado: insights guardados/recalculados, bandera de carga y error legible.
  const [insights, setInsights] = useState<PersonalInsight[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Refetch: fuerza recomputación manual (botón refrescar) ignorando cache previa en memoria.
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

  // Efecto inicial: mostrar cache si hay para UX rápida; si no, marcar loading durante el primer cálculo.
  // Luego refresca siempre para asegurar datos recientes, sin bloquear si ya había cache.
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
