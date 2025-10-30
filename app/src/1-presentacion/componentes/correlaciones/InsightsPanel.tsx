/**
 * Panel de Insights personales
 *
 * Propósito
 * - Mostrar una lista de insights generados a partir de los datos del usuario.
 * - Gestiona estados: cargando, vacío (sin datos suficientes) y lista ordenada.
 *
 * Detalles
 * - Orden de prioridad: logro (achievement) → patrón (pattern) → recomendación (recommendation).
 *   En empate, se muestran primero los más recientes.
 * - Modo oscuro/claro: clases de Tailwind condicionadas por `isDark`.
 * - `hideHeader` permite reusar el panel sin encabezado externo.
 */
import type { PersonalInsight } from '../../../2-logica-negocio/servicios/correlationInsightsService';
import InsightCard from './InsightCard';
import { Brain } from 'lucide-react';

interface InsightsPanelProps {
  insights: PersonalInsight[];
  loading: boolean;
  isDark: boolean;
  hideHeader?: boolean;
}

function sortInsights(a: PersonalInsight, b: PersonalInsight): number {
  const rank = { achievement: 0, pattern: 1, recommendation: 2 } as const;
  const ra = rank[a.type];
  const rb = rank[b.type];
  if (ra !== rb) return ra - rb;
  // Optional secondary: newer first
  return (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0);
}

export default function InsightsPanel({ insights, loading, isDark, hideHeader }: InsightsPanelProps) {
  // Estado de carga: spinner compacto con mensaje
  if (loading) {
    return (
      <div className={[
        'flex flex-col items-center justify-center gap-3 p-6 rounded-xl border shadow-md',
        isDark ? 'border-gray-700 bg-gray-900 shadow-black/30' : 'border-gray-200 bg-white shadow-black/5'
      ].join(' ')}>
        <div className={[
          'w-8 h-8 rounded-full border-4 border-t-blue-500 animate-spin',
          isDark ? 'border-gray-700' : 'border-gray-200'
        ].join(' ')} />
        <div className={[
          'text-sm',
          isDark ? 'text-gray-200' : 'text-gray-700'
        ].join(' ')}>Analizando tus patrones...</div>
      </div>
    );
  }

  // Estado vacío: CTA para incentivar registro (placeholder de acción)
  if (!insights || insights.length === 0) {
    return (
      <div className={[
        'p-6 rounded-xl border border-dashed shadow-md text-center',
        isDark ? 'border-gray-700 bg-gray-900 shadow-black/30' : 'border-gray-300 bg-white shadow-black/5'
      ].join(' ')}>
        <div className={[
          'mx-auto mb-3 w-10 h-10 flex items-center justify-center rounded-full',
          isDark ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-600'
        ].join(' ')}>
          <Brain className="w-6 h-6" />
        </div>
        <h3 className={[
          'text-lg font-semibold',
          isDark ? 'text-gray-100' : 'text-gray-900'
        ].join(' ')}>Aún no tenemos suficientes datos</h3>
        <p className={[
          'text-sm mt-1',
          isDark ? 'text-gray-300' : 'text-gray-600'
        ].join(' ')}>
          Registra al menos 7 días con entrenamientos para ver tus patrones personales
        </p>
        <div className="mt-4">
          <button
            type="button"
            className={[
              'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-white shadow-md shadow-black/10',
              isDark ? 'bg-blue-500 hover:bg-blue-600' : 'bg-blue-600 hover:bg-blue-700'
            ].join(' ')}
          >
            Registrar entrenamiento ahora
          </button>
        </div>
      </div>
    );
  }

  // Orden estable y determinista antes de renderizar
  const sorted = [...insights].sort(sortInsights);

  return (
    <section>
      {!hideHeader && (
        <header className="mb-4">
          <h2 className={[
            'text-xl font-semibold',
            isDark ? 'text-gray-100' : 'text-gray-900'
          ].join(' ')}>🧠 Tu Autoconocimiento</h2>
          <p className={['text-sm', isDark ? 'text-gray-300' : 'text-gray-600'].join(' ')}>Patrones identificados en base a tus registros</p>
        </header>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sorted.map((insight) => (
          <InsightCard key={insight.id} insight={insight} isDark={isDark} />
        ))}
      </div>
    </section>
  );
}
