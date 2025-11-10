/**
 * Panel de Correlaciones e Insights personales
 *
 * Objetivo
 * - Visualizar patrones entre nutrición (calorías y macros) y rendimiento de entrenamientos.
 * - Mostrar insights generados automáticamente a partir de datos reales del usuario.
 *
 * Fuentes de datos
 * - useUserData(uid, 30): comidas y entrenamientos recientes en tiempo real (30 días).
 * - buildCorrelationData(workouts, foods, 14): agrega y calcula métricas en una ventana de 14 días.
 * - usePersonalInsights(uid): lista de insights/patrones detectados (con evidencia).
 *
 * UI
 * - Encabezado de insights con un panel que permite navegar la evidencia.
 * - Gráfico de dispersión (calorías vs performance) con zona óptima (1800-2200 kcal).
 * - Barras comparativas de macros por día.
 * - “Resumen numérico” con KPIs agregados rápidos.
 *
 * Notas
 * - No modifica datos: es un panel puramente de lectura/visualización.
 * - Para mantener la performance, los datos derivados se memorizan con useMemo.
 */
import { useEffect, useMemo } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, BarChart, Bar, Legend, Cell } from 'recharts';
import { TrendingUp, AlertCircle, BarChart3 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useUserData } from '../../hooks/useUserData';
import { buildCorrelationData, type CorrelationDataPoint, type CalorieCategory } from '../../../2-logica-negocio/servicios/metricsService';
import { usePersonalInsights } from '../../hooks/usePersonalInsights';
import InsightsPanel from './InsightsPanel';

/**
 * Componente de tooltip informativo reutilizable
 */
interface InfoTooltipProps {
  title: string;
  description: string;
  bullets?: string[];
  legend?: { color: string; label: string }[];
  isDark: boolean;
}

const InfoTooltip = ({ title, description, bullets, legend, isDark }: InfoTooltipProps) => (
  <div className="relative group">
    <div className={`w-5 h-5 rounded-full flex items-center justify-center cursor-help transition-all ${
      isDark 
        ? 'bg-purple-900/40 text-purple-400 hover:bg-purple-900/60' 
        : 'bg-purple-100 text-purple-600 hover:bg-purple-200'
    }`}>
      <span className="text-xs font-bold">?</span>
    </div>
    
    {/* Contenido del tooltip */}
    <div className={`absolute left-0 top-8 w-80 p-4 rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-2xl ${
      isDark 
        ? 'bg-gray-800 border border-gray-700 text-gray-200' 
        : 'bg-white border border-gray-200 text-gray-700'
    }`}>
      <p className="text-sm font-semibold mb-2">💡 {title}</p>
      <p className="text-xs leading-relaxed mb-3">
        {description}
      </p>
      
      {bullets && bullets.length > 0 && (
        <ul className="text-xs space-y-1 mb-3 ml-3">
          {bullets.map((bullet, idx) => (
            <li key={idx}>• {bullet}</li>
          ))}
        </ul>
      )}
      
      {legend && legend.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-gray-600">
          {legend.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

interface CorrelationsDashboardProps { isDark: boolean }

export default function CorrelationsDashboard({ isDark }: CorrelationsDashboardProps) {
  const { user } = useAuth();
  const { workouts, foods, loading: loadingUserData } = useUserData(user?.uid, 30);
  // Derivamos datos de correlación en ventana de 14 días a partir de workouts+foods
  const correlationData: CorrelationDataPoint[] = useMemo(() => buildCorrelationData(workouts, foods, 14), [workouts, foods]);
  // Logs: días y rango de fechas
  useEffect(() => {
    if (!correlationData || correlationData.length === 0) return;
    const first = correlationData[0]?.date;
    const last = correlationData[correlationData.length - 1]?.date;
    console.log('📊 [Correlaciones] Días de datos para correlaciones:', correlationData.length);
    console.log('📊 [Correlaciones] Rango de fechas:', { desde: first, hasta: last });
  }, [correlationData]);
  const loading = loadingUserData;
  const { insights, loading: loadingInsights, error: insightsError } = usePersonalInsights(user?.uid || '');

  // Patrones (insights) logs
  useEffect(() => {
    console.log('🔍 [Patrones] Insights cargados (correlaciones):', insights);
    console.log('🔍 [Patrones] Cantidad (correlaciones):', insights?.length || 0);
    console.log('🔍 [Patrones] Tipos (correlaciones):', (insights || []).map(i => ({ type: i.type, title: i.title })));
  }, [insights]);

  // Tooltip personalizado para el scatter (Calorías vs Performance)
  type TooltipProps = { active?: boolean; payload?: Array<{ payload: CorrelationDataPoint }> };
  const CustomScatterTooltip = ({ active, payload }: TooltipProps) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload as CorrelationDataPoint;
    return (
      <div className={`rounded-xl px-3 py-2 border text-xs shadow-sm ${isDark ? 'bg-gray-900/95 border-gray-800 text-gray-200' : 'bg-white/95 border-gray-200 text-gray-800'}`}>
        <div className="font-semibold mb-1">{d.date}</div>
        <div>Calorías: <span className="font-medium">{Math.round(d.calories)} kcal</span></div>
        <div>Performance: <span className="font-medium">{Math.round(d.performance)}%</span></div>
        <div>Energía: <span className="font-medium">{Math.round(d.energyLevel * 10) / 10}/10</span></div>
        <div>Categoría: <span className="font-medium capitalize">{d.category}</span></div>
      </div>
    );
  };

  // correlationData is derived from real-time userData via useMemo

  if (loading) {
    // Estado de carga (mientras llega userData)
    return (
      <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Analizando correlaciones...</p>
          </div>
        </div>
        
      </div>
    );
  }

  // Aviso suave si hay pocos días (mostramos gráficos pero avisamos)
  const showLimitedDataNotice = correlationData.length > 0 && correlationData.length < 7;

  // Helper de color por categoría calórica
  const colorFor = (c: CalorieCategory) => (c === 'optimo' ? '#10B981' : c === 'bajo' ? '#F59E0B' : '#EF4444');

  return (
    <div className="space-y-8">
      {/* Sección de Insights - NUEVA */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            🧠 Tu Autoconocimiento
          </h2>
          <InfoTooltip
            isDark={isDark}
            title="¿Qué son estos insights?"
            description="Son patrones personales que la app identificó automáticamente analizando TUS datos específicos. No son consejos genéricos."
            bullets={[
              'Pattern (morado): Relación clara identificada en tus hábitos',
              'Recommendation (azul): Sugerencia basada en tus datos para mejorar',
              'Destacado (verde): Reconocimiento de algo que estás haciendo bien',
              'La evidencia muestra los datos reales que respaldan cada insight'
            ]}
          />
        </div>
        {insightsError && (
          <div className={`mb-3 p-3 rounded-xl text-sm ${isDark ? 'bg-red-900/30 border border-red-700 text-red-200' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {insightsError}
          </div>
        )}
        <InsightsPanel insights={insights} loading={loadingInsights} isDark={isDark} hideHeader />
      </section>

      {/* Sección de Estadísticas Semanales - MANTENER */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Mantener las cards de stats actuales: totalDuration, totalWorkouts, avgEnergyLevel, totalCalories */}
      </section>

      {/* Sección de Gráficos Tradicionales */}
      {correlationData.length >= 1 && (
        <>
          {showLimitedDataNotice && (
            <div className={`${isDark ? 'bg-amber-900/20 border border-amber-700 text-amber-200' : 'bg-amber-50 border border-amber-200 text-amber-700'} p-4 rounded-xl mb-2 flex items-start gap-3`}>
              <AlertCircle size={18} className="mt-0.5" />
              <div>
                <p className="text-sm font-medium">Datos limitados</p>
                <p className="text-xs opacity-90">Tienes {correlationData.length} día(s) con entrenamientos en la ventana analizada. Los gráficos se muestran, pero las conclusiones pueden ser menos confiables. Registra más días para ver tendencias claras.</p>
              </div>
            </div>
          )}
          {/* Scatter: Calorías vs Performance */}
          <section>
            <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <TrendingUp className={`${isDark ? 'text-purple-400' : 'text-purple-600'}`} size={20} />
                  <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Calorías vs Performance
                  </h3>
                  <InfoTooltip
                    isDark={isDark}
                    title="¿Qué muestra este gráfico?"
                    description="Este gráfico relaciona tu consumo calórico diario con tu rendimiento en entrenamientos. Cada punto representa un día con entrenamiento."
                    bullets={[
                      'Performance Score combina completitud, volumen y energía post-workout',
                      'Busca la zona óptima (verde) donde tu rendimiento es mejor',
                      'Si estás en rojo/amarillo, considera ajustar tu ingesta calórica'
                    ]}
                    legend={[
                      { color: 'bg-yellow-500', label: 'Bajo (<1800 kcal)' },
                      { color: 'bg-green-500', label: 'Óptimo (1800-2200 kcal)' },
                      { color: 'bg-red-500', label: 'Exceso (>2200 kcal)' }
                    ]}
                  />
                </div>
              </div>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#E5E7EB'} />
                    <XAxis
                      type="number"
                      dataKey="calories"
                      name="Calorías"
                      domain={[1200, 3000]}
                      stroke={isDark ? '#9CA3AF' : '#6B7280'}
                      tick={{ fill: isDark ? '#D1D5DB' : '#374151' }}
                      label={{ value: 'Calorías (kcal)', position: 'bottom', fill: isDark ? '#D1D5DB' : '#374151' }}
                    />
                    <YAxis
                      type="number"
                      dataKey="performance"
                      name="Performance"
                      domain={[0, 100]}
                      stroke={isDark ? '#9CA3AF' : '#6B7280'}
                      tick={{ fill: isDark ? '#D1D5DB' : '#374151' }}
                      label={{ value: 'Performance Score (%)', angle: -90, position: 'insideLeft', fill: isDark ? '#D1D5DB' : '#374151' }}
                    />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomScatterTooltip />} wrapperStyle={{ outline: 'none' }} />
                    <ReferenceArea x1={1800} x2={2200} y1={0} y2={100} fill="#10B981" fillOpacity={0.1} stroke="#10B981" strokeOpacity={0.3} strokeDasharray="3 3" />
                    <Scatter name="Días de Entrenamiento" data={correlationData}>
                      {correlationData.map((e, i) => (
                        <Cell key={i} fill={colorFor(e.category)} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-6 mt-4 text-xs">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500" /><span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Bajo (&lt;1800 kcal)</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500" /><span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Óptimo (1800-2200 kcal)</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500" /><span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Exceso (&gt;2200 kcal)</span></div>
              </div>
            </div>
          </section>

          {/* Macros por día */}
          <section>
            <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <BarChart3 className={`${isDark ? 'text-blue-400' : 'text-blue-600'}`} size={20} />
                  <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Comparativa de Macros
                  </h3>
                  <InfoTooltip
                    isDark={isDark}
                    title="¿Qué son los macronutrientes?"
                    description="Los macronutrientes son los nutrientes que tu cuerpo necesita en grandes cantidades. Este gráfico muestra tu distribución diaria."
                    bullets={[
                      'Carbohidratos (morado): Principal fuente de energía, especialmente importante antes de entrenar',
                      'Proteína (azul): Esencial para construir y reparar músculos, recuperación post-workout',
                      'Grasas (naranja): Necesarias para hormonas y absorción de vitaminas',
                      'Busca consistencia día a día para mejores resultados'
                    ]}
                  />
                </div>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={correlationData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#E5E7EB'} />
                    <XAxis dataKey="date" stroke={isDark ? '#9CA3AF' : '#6B7280'} />
                    <YAxis stroke={isDark ? '#9CA3AF' : '#6B7280'} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="protein" name="Proteína (g)" fill="#3B82F6" />
                    <Bar dataKey="carbs" name="Carbohidratos (g)" fill="#8B5CF6" />
                    <Bar dataKey="fats" name="Grasas (g)" fill="#F59E0B" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Sección insights antiguos - MANTENER al final */}
      {correlationData.length > 0 && (
        <section>
          <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
            <div className="flex items-center gap-3 mb-4">
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Resumen Numérico
              </h3>
              <InfoTooltip
                isDark={isDark}
                title="¿Cómo interpretar estas métricas?"
                description="Estas son estadísticas calculadas en base a tus registros de los últimos 14 días."
                bullets={[
                  'Días en zona óptima: Días donde consumiste 1800-2200 kcal (ideal para la mayoría)',
                  'Performance promedio: Tu score de rendimiento general (0-100%), mayor es mejor',
                  'Energía promedio: Tu nivel de energía reportado después de entrenar (escala 1-10)',
                  'Usa estos números para entender si vas por buen camino'
                ]}
              />
            </div>
            <ul className={isDark ? 'text-gray-300' : 'text-gray-700'}>
              <li className="mb-1">• Días en zona óptima: {correlationData.filter(d => d.category === 'optimo').length}</li>
              <li className="mb-1">• Performance promedio: {Math.round(correlationData.reduce((s, d) => s + d.performance, 0) / correlationData.length)}%</li>
              <li>• Energía promedio: {Math.round((correlationData.reduce((s, d) => s + d.energyLevel, 0) / correlationData.length) * 10) / 10}/10</li>
            </ul>
          </div>
        </section>
      )}
      
    </div>
  );
}