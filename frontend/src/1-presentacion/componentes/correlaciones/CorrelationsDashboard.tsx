import { useEffect, useState } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, BarChart, Bar, Legend, Cell } from 'recharts';
import { TrendingUp, AlertCircle, BarChart3 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { userFoodService, workoutService } from '../../../2-logica-negocio/servicios';
import { usePersonalInsights } from '../../hooks/usePersonalInsights';
import InsightsPanel from './InsightsPanel';
import { Timestamp } from 'firebase/firestore';

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

type CalorieCategory = 'bajo' | 'optimo' | 'exceso';

interface CorrelationDataPoint {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  performance: number; // 0-100
  energyLevel: number; // 1-10 promedio del día
  category: CalorieCategory;
}

const categorizeCalories = (cal: number): CalorieCategory => (cal < 1800 ? 'bajo' : cal <= 2200 ? 'optimo' : 'exceso');

export default function CorrelationsDashboard({ isDark }: CorrelationsDashboardProps) {
  const { user } = useAuth();
  const [correlationData, setCorrelationData] = useState<CorrelationDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const { insights, loading: loadingInsights, refetch } = usePersonalInsights(user?.uid || '');

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

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const days = 14;
        const today = new Date();
        const points: CorrelationDataPoint[] = [];

        for (let i = 0; i < days; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          const [foods, workouts] = await Promise.all([
            userFoodService.getUserFoodsByDate(user.uid, dateStr),
            workoutService.getWorkoutsByDate(user.uid, dateStr)
          ]);

          if (!workouts || workouts.length === 0) continue; // solo días con entrenamiento

          const calories = foods.reduce((s, f) => s + (f.calories || 0), 0);
          const protein = Math.round(foods.reduce((s, f) => s + (f.protein || 0), 0));
          const carbs = Math.round(foods.reduce((s, f) => s + (f.carbs || 0), 0));
          const fats = Math.round(foods.reduce((s, f) => s + (f.fats || 0), 0));
          const performance = Math.round((workouts.reduce((s, w) => s + (w.performanceScore || 0), 0) / workouts.length) || 0);
          const energySum = workouts.reduce((s, w) => s + (w.postEnergyLevel !== undefined && w.postEnergyLevel !== null
            ? w.postEnergyLevel
            : (w.preEnergyLevel !== undefined && w.preEnergyLevel !== null ? w.preEnergyLevel : 5)
          ), 0);
          const energyLevel = Math.round((((energySum / workouts.length) || 0) * 10)) / 10;

          points.push({ date: dateStr, calories, protein, carbs, fats, performance, energyLevel, category: categorizeCalories(calories) });
        }

        setCorrelationData(points.reverse());
      } catch (e) {
        console.error('Error loading correlation data:', e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  if (loading) {
    return (
      <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Analizando correlaciones...</p>
          </div>
        </div>
        {/* BOTÓN TEMPORAL - Generar datos de prueba (visible también en loading) */}
        <button
          onClick={async () => {
            if (!user?.uid) { alert('❌ Debes estar autenticado'); return; }
            if (!window.confirm('¿Generar 10 días de datos de prueba?\n\nEsto creará entrenamientos y comidas fake para probar los insights.')) { return; }
            try {
              console.log('🎲 Generando datos de prueba...');
              for (let i = 0; i < 10; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                const isHighEnergy = i < 5;
                const carbos = isHighEnergy ? 300 + Math.random()*20 : 180 + Math.random()*20;
                const protein = isHighEnergy ? 120 : 90;
                const fats = isHighEnergy ? 70 : 50;
                const calories = (carbos * 4) + (protein * 4) + (fats * 9);
                await userFoodService.addUserFoodEntry(user.uid, {
                  name: `Comida de prueba día ${i+1}`,
                  calories: Math.round(calories),
                  protein: Math.round(protein),
                  carbs: Math.round(carbos),
                  fats: Math.round(fats),
                  fiber: 25,
                  serving: '1 día completo',
                  category: 'prepared'
                }, dateStr, 1, 'lunch');
                const energyPre = isHighEnergy ? 7 : 5;
                const energyPost = isHighEnergy ? (8 + Math.random()) : (3 + Math.random());
                const workoutId = await workoutService.createWorkout(user.uid, {
                  name: `Entrenamiento día ${i+1}`,
                  duration: isHighEnergy ? 2700 : 1800,
                  isActive: false,
                  preEnergyLevel: energyPre,
                  postEnergyLevel: Math.round(energyPost),
                  exercises: [
                    { id: `ex_${i}_${Date.now()}`, name: 'Ejercicio de prueba', sets: 3, reps: 10, weight: 50, completed: true, restTime: 60 }
                  ]
                });
                await workoutService.updateWorkout(workoutId, { createdAt: Timestamp.fromDate(date), completedAt: Timestamp.fromDate(date) });
              }
              alert('✅ Datos generados!\n\nRecarga la página para ver los insights.');
            } catch (err) {
              const message = (err as Error)?.message || String(err);
              console.error('❌ Error:', err);
              alert('Error generando datos: ' + message);
            }
          }}
          className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 z-50 shadow-lg"
        >
          🎲 Generar Datos de Prueba
        </button>
        {/* BOTÓN TEMPORAL - Guardar insights para Apolo (visible también en loading) */}
        <button
          onClick={async () => {
            if (!user?.uid) { alert('❌ Debes estar autenticado'); return; }
            try {
              console.log('🔄 Refrescando insights y guardando en Firestore...');
              await refetch();
              alert('✅ Insights actualizados y guardados en Firestore!\n\nAhora Apolo puede acceder a ellos.');
            } catch (err) {
              const message = (err as Error)?.message || String(err);
              console.error('Error:', err);
              alert('❌ Error: ' + message);
            }
          }}
          className="fixed bottom-4 right-48 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 z-50 shadow-lg"
        >
          💾 Guardar Insights para Apolo
        </button>
      </div>
    );
  }

  if (correlationData.length < 7 && (!insights || insights.length === 0)) {
    return (
      <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
        <div className="text-center py-10">
          <AlertCircle size={48} className={`mx-auto mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
          <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>Datos Insuficientes</h3>
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Necesitas al menos 7 días con entrenamientos para ver correlaciones. Actualmente: {correlationData.length}.
          </p>
        </div>
        {/* BOTÓN TEMPORAL - Generar datos de prueba (visible también con datos insuficientes) */}
        <button
          onClick={async () => {
            if (!user?.uid) { alert('❌ Debes estar autenticado'); return; }
            if (!window.confirm('¿Generar 10 días de datos de prueba?\n\nEsto creará entrenamientos y comidas fake para probar los insights.')) { return; }
            try {
              console.log('🎲 Generando datos de prueba...');
              for (let i = 0; i < 10; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                const isHighEnergy = i < 5;
                const carbos = isHighEnergy ? 300 + Math.random()*20 : 180 + Math.random()*20;
                const protein = isHighEnergy ? 120 : 90;
                const fats = isHighEnergy ? 70 : 50;
                const calories = (carbos * 4) + (protein * 4) + (fats * 9);
                await userFoodService.addUserFoodEntry(user.uid, {
                  name: `Comida de prueba día ${i+1}`,
                  calories: Math.round(calories),
                  protein: Math.round(protein),
                  carbs: Math.round(carbos),
                  fats: Math.round(fats),
                  fiber: 25,
                  serving: '1 día completo',
                  category: 'prepared'
                }, dateStr, 1, 'lunch');
                const energyPre = isHighEnergy ? 7 : 5;
                const energyPost = isHighEnergy ? (8 + Math.random()) : (3 + Math.random());
                const workoutId = await workoutService.createWorkout(user.uid, {
                  name: `Entrenamiento día ${i+1}`,
                  duration: isHighEnergy ? 2700 : 1800,
                  isActive: false,
                  preEnergyLevel: energyPre,
                  postEnergyLevel: Math.round(energyPost),
                  exercises: [
                    { id: `ex_${i}_${Date.now()}`, name: 'Ejercicio de prueba', sets: 3, reps: 10, weight: 50, completed: true, restTime: 60 }
                  ]
                });
                await workoutService.updateWorkout(workoutId, { createdAt: Timestamp.fromDate(date), completedAt: Timestamp.fromDate(date) });
              }
              alert('✅ Datos generados!\n\nRecarga la página para ver los insights.');
            } catch (err) {
              const message = (err as Error)?.message || String(err);
              console.error('❌ Error:', err);
              alert('Error generando datos: ' + message);
            }
          }}
          className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 z-50 shadow-lg"
        >
          🎲 Generar Datos de Prueba
        </button>
        {/* BOTÓN TEMPORAL - Guardar insights para Apolo (visible también con datos insuficientes) */}
        <button
          onClick={async () => {
            if (!user?.uid) { alert('❌ Debes estar autenticado'); return; }
            try {
              console.log('🔄 Refrescando insights y guardando en Firestore...');
              await refetch();
              alert('✅ Insights actualizados y guardados en Firestore!\n\nAhora Apolo puede acceder a ellos.');
            } catch (err) {
              const message = (err as Error)?.message || String(err);
              console.error('Error:', err);
              alert('❌ Error: ' + message);
            }
          }}
          className="fixed bottom-4 right-48 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 z-50 shadow-lg"
        >
          💾 Guardar Insights para Apolo
        </button>
      </div>
    );
  }

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
              'Achievement (verde): Reconocimiento de algo que estás haciendo bien',
              'La evidencia muestra los datos reales que respaldan cada insight'
            ]}
          />
        </div>
        <InsightsPanel insights={insights} loading={loadingInsights} isDark={isDark} hideHeader />
      </section>

      {/* Sección de Estadísticas Semanales - MANTENER */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Mantener las cards de stats actuales: totalDuration, totalWorkouts, avgEnergyLevel, totalCalories */}
      </section>

      {/* Sección de Gráficos Tradicionales - MANTENER pero más abajo */}
      {correlationData.length >= 7 && (
        <>
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

      {/* BOTÓN TEMPORAL - Generar datos de prueba */}
      <button
        onClick={async () => {
          if (!user?.uid) {
            alert('❌ Debes estar autenticado');
            return;
          }
          
          if (!window.confirm('¿Generar 10 días de datos de prueba?\n\nEsto creará entrenamientos y comidas fake para probar los insights.')) {
            return;
          }
          
          try {
            console.log('🎲 Generando datos de prueba...');
            
            // Generar últimos 10 días
            for (let i = 0; i < 10; i++) {
              const date = new Date();
              date.setDate(date.getDate() - i);
              const dateStr = date.toISOString().split('T')[0];
              
              // Patrón: primeros 5 días = alta energía + muchos carbos
              //         últimos 5 días = baja energía + pocos carbos
              const isHighEnergy = i < 5;
              
              const carbos = isHighEnergy ? 300 + Math.random()*20 : 180 + Math.random()*20;
              const protein = isHighEnergy ? 120 : 90;
              const fats = isHighEnergy ? 70 : 50;
              const calories = (carbos * 4) + (protein * 4) + (fats * 9);
              
              // Crear comida del día
              await userFoodService.addUserFoodEntry(
                user.uid,
                {
                  name: `Comida de prueba día ${i+1}`,
                  calories: Math.round(calories),
                  protein: Math.round(protein),
                  carbs: Math.round(carbos),
                  fats: Math.round(fats),
                  fiber: 25,
                  serving: '1 día completo',
                  category: 'prepared'
                },
                dateStr,
                1,
                'lunch'
              );
              
              // Crear workout del día
              const energyPre = isHighEnergy ? 7 : 5;
              const energyPost = isHighEnergy ? (8 + Math.random()) : (3 + Math.random());
              
              const workoutId = await workoutService.createWorkout(user.uid, {
                name: `Entrenamiento día ${i+1}`,
                duration: isHighEnergy ? 2700 : 1800, // 45min o 30min en segundos
                isActive: false,
                preEnergyLevel: energyPre,
                postEnergyLevel: Math.round(energyPost),
                exercises: [
                  {
                    id: `ex_${i}_${Date.now()}`,
                    name: 'Ejercicio de prueba',
                    sets: 3,
                    reps: 10,
                    weight: 50,
                    completed: true,
                    restTime: 60
                  }
                ]
              });
              // Backdate createdAt y completedAt al día simulado para que el filtro por fecha funcione
              await workoutService.updateWorkout(workoutId, {
                createdAt: Timestamp.fromDate(date),
                completedAt: Timestamp.fromDate(date)
              });
              
              console.log(`✅ Día ${i+1}/10 creado`);
            }
            
            alert('✅ Datos generados!\n\nRecarga la página para ver los insights.');
            
          } catch (err) {
            const message = (err as Error)?.message || String(err);
            console.error('❌ Error:', err);
            alert('Error generando datos: ' + message);
          }
        }}
        className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 z-50 shadow-lg"
      >
        🎲 Generar Datos de Prueba
      </button>
      {/* BOTÓN TEMPORAL - Guardar insights para Apolo */}
      <button
        onClick={async () => {
          if (!user?.uid) { alert('❌ Debes estar autenticado'); return; }
          try {
            console.log('🔄 Refrescando insights y guardando en Firestore...');
            await refetch();
            alert('✅ Insights actualizados y guardados en Firestore!\n\nAhora Apolo puede acceder a ellos.');
          } catch (err) {
            const message = (err as Error)?.message || String(err);
            console.error('Error:', err);
            alert('❌ Error: ' + message);
          }
        }}
        className="fixed bottom-4 right-48 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 z-50 shadow-lg"
      >
        💾 Guardar Insights para Apolo
      </button>
    </div>
  );
}