import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, ReferenceLine, Line, BarChart, Bar } from 'recharts';
import { useAuth } from '../../hooks/useAuth';
import { obtenerResumenProgreso, calcularTendencia, obtenerHistorialPeso } from '../../../2-logica-negocio/servicios/servicioSegPeso';
import { userService } from '../../../2-logica-negocio/servicios';
import { userFoodService } from '../../../3-acceso-datos/firebase/foodDataService';
import { workoutService } from '../../../3-acceso-datos/firebase/firestoreService';
import { formatDateYYYYMMDD } from '../../../utils/date';
import { hasMinimumDataForAnalysis } from '../../../2-logica-negocio/servicios/metricsService';

type Props = { isDark: boolean };

type Estado = 'loading' | 'insufficient_data' | 'success';

// Reemplazado por util compartida formatDateYYYYMMDD
function addDays(d: Date, days: number) { const x = new Date(d); x.setDate(x.getDate() + days); return x; }
function weekKey(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((x.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${x.getUTCFullYear()}-W${String(weekNo).padStart(2,'0')}`;
}

function linearRegression(y: number[]): { a: number; b: number } {
  const n = y.length;
  if (n === 0) return { a: 0, b: 0 };
  const xs = y.map((_, i) => i);
  const sumX = xs.reduce((s, v) => s + v, 0);
  const sumY = y.reduce((s, v) => s + v, 0);
  const sumXY = xs.reduce((s, v, i) => s + v * y[i], 0);
  const sumX2 = xs.reduce((s, v) => s + v * v, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { a: 0, b: y[0] ?? 0 };
  const a = (n * sumXY - sumX * sumY) / denom; // slope
  const b = (sumY - a * sumX) / n; // intercept
  return { a, b };
}

export default function PanelProgreso({ isDark }: Props) {
  const { user } = useAuth();
  const [estado, setEstado] = useState<Estado>('loading');
  const [error, setError] = useState<string | null>(null);

  const [goal, setGoal] = useState<'lose_weight' | 'maintain_weight' | 'gain_muscle' | 'improve_performance' | 'general_health' | undefined>();
  const [pesoObjetivo, setPesoObjetivo] = useState<number>(0);
  const [pesoInicial, setPesoInicial] = useState<number>(0);
  const [pesoActual, setPesoActual] = useState<number>(0);
  const [porcentaje, setPorcentaje] = useState<number>(0);
  const [faltante, setFaltante] = useState<number>(0);
  const [cambio, setCambio] = useState<number>(0);
  const [tendencia, setTendencia] = useState<'bajando' | 'subiendo' | 'estable'>('estable');
  const [velocidad, setVelocidad] = useState<number>(0);

  const [pesoSemanas, setPesoSemanas] = useState<Array<{ semana: string; peso: number }>>([]);
  const [pesoMin, setPesoMin] = useState<number>(0);
  const [pesoMax, setPesoMax] = useState<number>(0);
  const [tendenciaSerie, setTendenciaSerie] = useState<number[]>([]);
  const [colorLinea, setColorLinea] = useState<string>('#10B981');

  const [heatmap, setHeatmap] = useState<Array<{ fecha: string; completo: boolean; parcial: boolean; detalle: string }>>([]);
  const [racha, setRacha] = useState<number>(0);

  const targetTolerance = 0.1; // ±10%

  useEffect(() => {
    const load = async () => {
      if (!user?.uid) return;
      try {
        setEstado('loading');
        setError(null);

        // Perfil del usuario (objetivo y targetWeight)
        const profile = await userService.getUserProfile(user.uid);
        const objective = profile?.primaryGoal;
        setGoal(objective);
        const tWeight = typeof profile?.targetWeight === 'number' ? profile!.targetWeight! : (profile?.currentWeight || 0);
        setPesoObjetivo(tWeight || 0);

        // Resumen y tendencia de peso
        const resumen = await obtenerResumenProgreso(user.uid);
        setPesoInicial(resumen.pesoInicial);
        setPesoActual(resumen.pesoActual);
        setFaltante(resumen.pesoFaltante);
        setPorcentaje(resumen.porcentajeCompletado);
        setCambio(resumen.pesoPerdido);

        const tend = await calcularTendencia(user.uid);
        setTendencia(tend.tendencia);
        setVelocidad(tend.velocidad);

        // Últimas 12 semanas: promedios semanales
        const hist = await obtenerHistorialPeso(user.uid, 84); // 12*7 días
        if (!hist || hist.length < 7) {
          setEstado('insufficient_data');
        } else {
          const buckets = new Map<string, number[]>();
          for (const r of hist) {
            const dk = weekKey(new Date(r.fecha + 'T00:00:00.000Z'));
            if (!buckets.has(dk)) buckets.set(dk, []);
            buckets.get(dk)!.push(r.peso);
          }
          // Tomar las últimas 12 semanas, ordenadas
          const keys = Array.from(buckets.keys()).sort();
          const last12 = keys.slice(-12);
          const weekly = last12.map(k => ({ semana: k, peso: Math.round((buckets.get(k)!.reduce((a,b)=>a+b,0) / buckets.get(k)!.length) * 10) / 10 }));
          setPesoSemanas(weekly);
          const vals = weekly.map(w => w.peso);
          setPesoMin(Math.min(...vals));
          setPesoMax(Math.max(...vals));

          // Regresión lineal para tendencia visual
          const { a, b } = linearRegression(vals);
          setTendenciaSerie(vals.map((_, i) => Math.round((a * i + b) * 10) / 10));

          // Color de línea: verde si acercándose a objetivo, rojo si alejándose
          const oldDist = Math.abs((vals[0] ?? resumen.pesoActual) - tWeight);
          const newDist = Math.abs((vals[vals.length - 1] ?? resumen.pesoActual) - tWeight);
          setColorLinea(newDist <= oldDist ? '#10B981' : '#EF4444');

          setEstado('success');
        }

        // Heatmap 30 días
        const today = new Date();
        const days: Array<{ fecha: string; completo: boolean; parcial: boolean; detalle: string }> = [];
        let currentStreak = 0;
        let workoutsCount = 0;
        let foodDaysCount = 0;
        for (let i = 29; i >= 0; i--) {
          const day = addDays(today, -i);
          const dateStr = formatDateYYYYMMDD(day);
          const [calories, workouts] = await Promise.all([
            userFoodService.getDailyCalories(user.uid, dateStr).catch(() => 0),
            workoutService.getWorkoutsByDate(user.uid, dateStr).catch(() => [])
          ]);
          const inNutrition = profile?.dailyCalorieTarget ? (Math.abs(calories - profile.dailyCalorieTarget) <= profile.dailyCalorieTarget * targetTolerance) : calories > 0;
          const didWorkout = (workouts?.length || 0) > 0;
          if (didWorkout) workoutsCount += 1;
          if (calories > 0) foodDaysCount += 1;
          const completo = inNutrition && didWorkout;
          const parcial = (!completo) && (inNutrition || didWorkout);
          const detalle = `Calorías: ${calories}${profile?.dailyCalorieTarget ? ` / Obj ${profile.dailyCalorieTarget}` : ''}\nEntrenamientos: ${workouts?.length || 0}`;
          days.push({ fecha: dateStr, completo, parcial, detalle });

          if (completo) currentStreak += 1; else currentStreak = 0;
        }
        setHeatmap(days);
        setRacha(currentStreak);

        // Logs de consistencia de días de datos
        const daysWithData = days.filter(d => d.completo || d.parcial).length;
        console.log('📈 [Progreso] Días de datos (últimos 30):', daysWithData);
        console.log('📈 [Progreso] Registros: { pesoHistorial, entrenamientos, comidas }', {
          weightRecords: hist?.length || 0,
          workoutsDays: workoutsCount,
          foodDays: foodDaysCount
        });
        const minCheck = hasMinimumDataForAnalysis([], [], days.map(d => ({ fecha: d.fecha })), 7);
        console.log('✅ [Validación] Días con datos reales:', minCheck.daysWithData, '/ mínimo:', 7);

      } catch (e) {
        console.error('Error cargando PanelProgreso:', e);
        setError('No se pudo cargar tu progreso');
        setEstado('insufficient_data');
      }
    };
    load();
  }, [user?.uid]);

  const weeklyChartData = useMemo(() => {
    if (pesoSemanas.length === 0) return [] as Array<{ semana: string; peso: number; tendencia: number }>;
    return pesoSemanas.map((w, i) => ({ semana: w.semana, peso: w.peso, tendencia: tendenciaSerie[i] ?? w.peso }));
  }, [pesoSemanas, tendenciaSerie]);

  if (!user) return null;

  if (estado === 'loading') {
    return (
      <div className="space-y-6">
        <div className={`p-8 rounded-3xl ${isDark ? 'bg-gray-800' : 'bg-gray-200'} animate-pulse`} />
        <div className={`h-80 rounded-2xl ${isDark ? 'bg-gray-800' : 'bg-gray-200'} animate-pulse`} />
        <div className={`h-48 rounded-2xl ${isDark ? 'bg-gray-800' : 'bg-gray-200'} animate-pulse`} />
      </div>
    );
  }

  if (estado === 'insufficient_data') {
    return (
      <div className={`p-8 rounded-2xl border ${isDark ? 'bg-blue-900/20 border-blue-800 text-blue-200' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
        <h3 className="text-xl font-bold mb-2">Necesitas al menos 7 días de datos</h3>
        <p>Registra tu peso, alimentación y entrenamientos durante una semana para ver tu progreso visual.</p>
        {error && <p className="mt-2 text-sm opacity-80">{error}</p>}
      </div>
    );
  }

  const progresoPct = Math.max(0, Math.min(100, porcentaje));

  return (
    <div className="space-y-8">
      {/* 1. HERO - Meta principal */}
      <div className="p-8 rounded-3xl bg-gradient-to-br from-purple-500 to-blue-500 text-white shadow-2xl">
        <h2 className="text-2xl font-bold mb-6">
          🎯 Tu Meta: {goal === 'lose_weight' ? 'Bajar a' : 'Llegar a'} {pesoObjetivo}kg
        </h2>

        {/* Escala visual */}
        <div className="relative h-32 mb-6">
          <div className="absolute left-0 top-0">
            <div className="text-xs opacity-80">Inicio</div>
            <div className="text-xl font-bold">{pesoInicial}kg</div>
          </div>
          <div className="absolute top-0 transition-all duration-1000" style={{ left: `${progresoPct}%` }}>
            <div className="text-4xl">📍</div>
            <div className="text-xl font-bold">{pesoActual}kg</div>
            <div className="text-xs">Tú ahora</div>
          </div>
          <div className="absolute right-0 top-0">
            <div className="text-xs opacity-80">Meta</div>
            <div className="text-xl font-bold">{pesoObjetivo}kg</div>
          </div>
          <div className="absolute bottom-0 w-full h-3 bg-white/30 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-1000 shadow-lg" style={{ width: `${progresoPct}%` }} />
          </div>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/10 rounded-xl p-4">
            <div className="text-sm opacity-80">Has perdido/ganado</div>
            <div className="text-3xl font-bold">{Math.abs(cambio)}kg</div>
            <div className="text-xs mt-1">
              {tendencia === 'bajando' ? '📉' : tendencia === 'subiendo' ? '📈' : '➡️'} {velocidad.toFixed(1)}kg/semana
            </div>
          </div>
          <div className="bg-white/10 rounded-xl p-4">
            <div className="text-sm opacity-80">Te falta</div>
            <div className="text-3xl font-bold">{Math.abs(faltante)}kg</div>
            <div className="text-xs mt-1">{porcentaje}% completado</div>
          </div>
        </div>
      </div>

      {/* 2. Gráfico de peso */}
      <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <h3 className={`text-lg font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>📈 Peso (últimas 12 semanas)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={weeklyChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#E5E7EB'} />
            <XAxis dataKey="semana" stroke={isDark ? '#9CA3AF' : '#6B7280'} />
            <YAxis domain={[pesoMin - 5, pesoMax + 5]} stroke={isDark ? '#9CA3AF' : '#6B7280'} />
            <Tooltip contentStyle={{ backgroundColor: isDark ? '#1F2937' : '#ffffff', border: `1px solid ${isDark ? '#374151' : '#E5E7EB'}` }} />
            <ReferenceLine y={pesoObjetivo} stroke="#10B981" strokeDasharray="5 5" label="Meta" />
            <Line type="monotone" dataKey="peso" stroke={colorLinea} strokeWidth={3} dot={{ r: 5 }} />
            <Line type="monotone" dataKey="tendencia" stroke={isDark ? '#9CA3AF' : '#9CA3AF'} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 3. Heatmap de consistencia */}
      <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>📅 Tu Consistencia</h3>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <span className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{racha} días seguidos</span>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {heatmap.map((dia) => (
            <div
              key={dia.fecha}
              className={`aspect-square rounded-lg transition-all hover:scale-110 ${
                dia.completo ? 'bg-green-500' : dia.parcial ? 'bg-yellow-500' : isDark ? 'bg-gray-700' : 'bg-gray-300'
              }`}
              title={`${dia.fecha}\n${dia.detalle}`}
            />
          ))}
        </div>
        <div className="flex gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-green-500" /><span>Entrenamiento + Nutrición ✅</span></div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-yellow-500" /><span>Solo uno de los dos</span></div>
          <div className="flex items-center gap-2"><div className={`w-4 h-4 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`} /><span>Día de descanso</span></div>
        </div>
      </div>

      {/* 4. Volumen levantado (solo si es ganar músculo) */}
      {goal === 'gain_muscle' && (
        <VolumenSemanal isDark={isDark} userId={user.uid} />
      )}
    </div>
  );
}

function VolumenSemanal({ isDark, userId }: { isDark: boolean; userId: string }) {
  const [data, setData] = useState<Array<{ semana: string; volumen: number; crecimiento: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
  const workouts = await workoutService.getUserWorkouts(userId);
        const weeks = new Map<string, number>();
        for (const w of workouts) {
          const when = (w.completedAt || w.createdAt)?.toDate?.() as Date | undefined;
          if (!when) continue;
          const wk = weekKey(when);
          weeks.set(wk, (weeks.get(wk) || 0) + (w.volumeLifted || w.totalWeightLifted || 0));
        }
        const keys = Array.from(weeks.keys()).sort();
        const last12 = keys.slice(-12);
        const arr = last12.map((k, i) => {
          const vol = Math.round((weeks.get(k) || 0));
          const prev = i > 0 ? Math.max(1, Math.round((weeks.get(last12[i - 1]) || 0))) : vol;
          const crecimiento = prev === 0 ? 0 : Math.round(((vol - prev) / prev) * 100);
          return { semana: k, volumen: vol, crecimiento };
        });
        setData(arr);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  if (loading) {
    return <div className={`h-64 rounded-2xl ${isDark ? 'bg-gray-800' : 'bg-gray-200'} animate-pulse`} />;
  }

  return (
    <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
      <h3 className={`text-lg font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>🏋️ Volumen Levantado (semanal)</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#E5E7EB'} />
          <XAxis dataKey="semana" stroke={isDark ? '#9CA3AF' : '#6B7280'} />
          <YAxis stroke={isDark ? '#9CA3AF' : '#6B7280'} />
          <Tooltip contentStyle={{ backgroundColor: isDark ? '#1F2937' : '#ffffff', border: `1px solid ${isDark ? '#374151' : '#E5E7EB'}` }} />
          <Bar dataKey="volumen" fill="#6366F1" />
        </BarChart>
      </ResponsiveContainer>
      <div className={`mt-2 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
        Crecimiento vs semana anterior mostrado en tooltip (% estimado).
      </div>
    </div>
  );
}
