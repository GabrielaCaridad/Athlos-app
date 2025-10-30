/**
 * Tarjeta de Insight
 *
 * Qué renderiza
 * - Título + descripción del insight.
 * - Evidencia (lista breve) y una acción sugerida (“Qué hacer”).
 * - Estilos y colores cambian según el tipo: pattern, recommendation, achievement.
 *
 * Detalles
 * - `typeStyles` define borde, fondo e icono por tipo y tema (oscuro/claro).
 * - `confidenceBg` colorea el bloque de acción según la confianza (high/medium/low).
 * - `HeaderIcon` elige un ícono representativo por tipo.
 */
import type { PersonalInsight } from '../../../2-logica-negocio/servicios/correlationInsightsService';
import { TrendingUp, Award, Lightbulb, CheckCircle } from 'lucide-react';

interface InsightCardProps {
  insight: PersonalInsight;
  isDark: boolean;
}

// Utilidades para estilos según tipo y tema
function typeStyles(type: PersonalInsight['type'], isDark: boolean): { border: string; bg: string; iconColor: string } {
  switch (type) {
    case 'pattern':
      return {
        border: 'border-l-4 border-purple-500',
        bg: isDark ? 'bg-purple-900/20' : 'bg-purple-50',
        iconColor: isDark ? 'text-purple-400' : 'text-purple-600'
      };
    case 'recommendation':
      return {
        border: 'border-l-4 border-blue-500',
        bg: isDark ? 'bg-blue-900/20' : 'bg-blue-50',
        iconColor: isDark ? 'text-blue-400' : 'text-blue-600'
      };
    default:
      return {
        border: 'border-l-4 border-green-500',
        bg: isDark ? 'bg-green-900/20' : 'bg-green-50',
        iconColor: isDark ? 'text-green-400' : 'text-green-600'
      };
  }
}

function confidenceBg(conf: PersonalInsight['confidence'], isDark: boolean): string {
  if (conf === 'high') return isDark ? 'bg-green-900 text-green-100' : 'bg-green-100 text-green-900';
  if (conf === 'medium') return isDark ? 'bg-yellow-900 text-yellow-100' : 'bg-yellow-100 text-yellow-900';
  return isDark ? 'bg-gray-800 text-gray-100' : 'bg-gray-100 text-gray-900';
}

function HeaderIcon({ type, className }: { type: PersonalInsight['type']; className?: string }) {
  if (type === 'pattern') return <TrendingUp className={className} />;
  if (type === 'recommendation') return <Lightbulb className={className} />;
  return <Award className={className} />;
}

// Componente principal
export default function InsightCard({ insight, isDark }: InsightCardProps) {
  const t = typeStyles(insight.type, isDark);

  return (
    <div
      className={[
        'rounded-xl border',
        isDark ? 'border-gray-700' : 'border-gray-200',
        t.border,
        t.bg,
        // toque neumórfico suave
        'shadow-md',
        isDark ? 'shadow-black/30' : 'shadow-black/5',
        'p-4 sm:p-5'
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className={[
          'rounded-full p-2',
          isDark ? 'bg-gray-900/50' : 'bg-white/70',
          t.iconColor
        ].join(' ')}>
          <HeaderIcon type={insight.type} className="w-5 h-5" />
        </div>
        <h3 className={['text-lg font-semibold', isDark ? 'text-gray-100' : 'text-gray-900'].join(' ')}>
          {insight.title}
        </h3>
      </div>

      {/* Descripción */}
      <p className={['text-sm mb-4', isDark ? 'text-gray-200' : 'text-gray-700'].join(' ')}>
        {insight.description}
      </p>

      {/* Evidencia: lista de puntos que respaldan el insight */}
      <div className={[
        'rounded-lg border',
        isDark ? 'border-gray-700' : 'border-gray-200',
        isDark ? 'bg-gray-800' : 'bg-white',
        'p-3 mb-4'
      ].join(' ')}>
        <div className={['text-xs font-medium uppercase tracking-wide mb-2', isDark ? 'text-gray-400' : 'text-gray-500'].join(' ')}>
          Evidencia
        </div>
        <ul className="list-disc pl-5 space-y-1">
          {insight.evidence.map((ev, idx) => (
            <li key={idx} className={['text-sm', isDark ? 'text-gray-200' : 'text-gray-700'].join(' ')}>
              {ev}
            </li>
          ))}
        </ul>
      </div>

      {/* Acción / Qué hacer: recomendación accionable con color según confianza */}
      <div className={['rounded-lg p-3', confidenceBg(insight.confidence, isDark)].join(' ')}>
        <div className="flex items-start gap-2">
          <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-xs font-medium uppercase tracking-wide opacity-80 mb-1">
              Qué hacer
            </div>
            <div className="text-sm leading-relaxed">
              {insight.actionable}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
