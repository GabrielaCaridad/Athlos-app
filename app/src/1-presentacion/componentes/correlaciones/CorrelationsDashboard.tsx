/**
 * Panel de Correlaciones e Insights personales
 *
 * - Reemplaza lógicas mock por datos reales (Firestore) en tiempo real.
 * - Agrega dataset diario (incluye días sin entrenar) y calcula correlaciones simples.
 */
import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, BarChart, Bar, Legend, Cell } from 'recharts';
// Importación de íconos (removido AlertCircle que no se utilizaba)
import { TrendingUp, BarChart3 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import InsightsPanel from './InsightsPanel';
import type { PersonalInsight } from '../../../2-logica-negocio/servicios/correlationInsightsService';
import { collection, onSnapshot, query, where, Timestamp, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../../3-acceso-datos/firebase/config';
import { userService } from '../../../3-acceso-datos/firebase/firestoreService';
import { formatDateYYYYMMDD } from '../../../utils/date';

// Dataset diario unificado para gráficos e insights
interface DailyPoint {
  date: string; // YYYY-MM-DD (día local Chile)
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  performance?: number; // promedio del día si hubo entrenos
}
type FoodEntryLite = { date: string; calories?: number; protein?: number; carbs?: number; fats?: number };
type WorkoutLite = { createdAt?: Timestamp; performanceScore?: number };
type ScatterPoint = { date: string; calories: number; performance: number; category: 'bajo' | 'optimo' | 'exceso' };

// Util local para claves de fecha (acepta string, Date o Timestamp)
const dateKeyFrom = (v: string | Date | Timestamp | undefined | null): string => {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (v instanceof Date) return formatDateYYYYMMDD(v);
  if (typeof v.toDate === 'function') return formatDateYYYYMMDD(v.toDate());
  try {
    // último intento si llega algo extraño
    return formatDateYYYYMMDD(new Date(String(v)));
  } catch {
    return '';
  }
};

// Sanitización y límites
const clampMacro = (n: number): number => (!Number.isFinite(n) || n < 0 ? 0 : Math.min(n, 1000));
const clampCalories = (n: number): number => (!Number.isFinite(n) || n < 0 ? 0 : Math.min(n, 6000));

// Pearson r
function pearson(xs: number[], ys: number[]): { r: number; n: number } {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { r: 0, n };
  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const mx = mean(xs); const my = mean(ys);
  let num = 0, dxSum = 0, dySum = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx; const dy = ys[i] - my; num += dx * dy; dxSum += dx * dx; dySum += dy * dy; }
  const den = Math.sqrt(dxSum) * Math.sqrt(dySum);
  return { r: den === 0 ? 0 : num / den, n };
}

// Insights derivados (sin IA) con evidencia y acción
function generateDerivedInsights(daily: DailyPoint[], userWeightKg?: number): PersonalInsight[] {
  const insights: PersonalInsight[] = [];
  if (!daily || daily.length < 3) return insights;
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
  const kcalArr = daily.map(d => d.kcal);
  const proteinArr = daily.map(d => d.protein_g);
  const carbsArr = daily.map(d => d.carbs_g);
  const fatsArr = daily.map(d => d.fats_g);
  const avgK = avg(kcalArr); const avgP = avg(proteinArr); const avgC = avg(carbsArr); const avgF = avg(fatsArr);
  const stdK = Math.sqrt(avg(kcalArr.map(k => (k - avgK) ** 2)));
  const cvK = avgK > 0 ? (stdK / avgK) * 100 : 0;
  const protTarget = userWeightKg ? userWeightKg * 1.6 : 0;

  if (avgK > 0 && avgK < 1800) {
    insights.push({
      id: 'ins_cal_baja', type: 'recommendation',
      title: '⚠️ Posible insuficiencia calórica',
      description: `Promedio ${Math.round(avgK)} kcal, por debajo del rango general (1800–2200 kcal).`,
      evidence: [
        `Promedio ${daily.length} días: ${Math.round(avgK)} kcal`,
        `Rango: ${Math.min(...kcalArr)}–${Math.max(...kcalArr)} kcal`,
      ],
      actionable: 'Aumenta +150–200 kcal priorizando carbohidratos complejos y proteína magra.',
      confidence: daily.length >= 7 ? 'high' : 'medium',
      createdAt: new Date()
    });
  }
  if (protTarget > 0 && avgP < protTarget * 0.85) {
    insights.push({
      id: 'ins_prot_baja', type: 'recommendation',
      title: '💪 Proteína por debajo del objetivo',
      description: `Promedio ${Math.round(avgP)}g vs objetivo estimado ${Math.round(protTarget)}g (1.6 g/kg).`,
      evidence: [
        `Peso usado: ${userWeightKg ?? 'N/D'} kg`,
        `Promedios (g): P ${Math.round(avgP)} / C ${Math.round(avgC)} / G ${Math.round(avgF)}`
      ],
      actionable: 'Añade 1 porción más de proteína magra en comidas principales.',
      confidence: daily.length >= 7 ? 'high' : 'medium',
      createdAt: new Date()
    });
  }
  if (cvK > 25 && avgK >= 1700) {
    insights.push({
      id: 'ins_var_cal', type: 'pattern',
      title: '🔄 Alta variabilidad de calorías',
      description: `Tu ingesta fluctúa (CV ${cvK.toFixed(1)}%). La consistencia favorece rendimiento.`,
      evidence: [
        `Promedio: ${Math.round(avgK)} kcal`,
        `Desviación: ${Math.round(stdK)} kcal`,
      ],
      actionable: 'Apunta a que la mayoría de días quede dentro de ±10% del promedio actual.',
      confidence: cvK > 35 ? 'high' : 'medium',
      createdAt: new Date()
    });
  }
  if (avgC < 150) {
    insights.push({
      id: 'ins_carbs_bajos', type: 'recommendation',
      title: '🥖 Carbohidratos posiblemente bajos',
      description: `Promedio de carbohidratos ${Math.round(avgC)}g/día.`,
      evidence: [
        `Proteína ${Math.round(avgP)}g, Grasas ${Math.round(avgF)}g`
      ],
      actionable: 'Incluye fuentes complejas (avena, arroz, papa) especialmente pre-entreno.',
      confidence: daily.length >= 7 ? 'medium' : 'low',
      createdAt: new Date()
    });
  }
  return insights.slice(0, 6);
}

// Tooltip informativo compacto
function InfoTooltip({ title, description, bullets, legend, isDark }: { title: string; description: string; bullets?: string[]; legend?: { color: string; label: string }[]; isDark: boolean }) {
  return (
    <div className="relative group">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center cursor-help transition-all ${isDark ? 'bg-purple-900/40 text-purple-400 hover:bg-purple-900/60' : 'bg-purple-100 text-purple-600 hover:bg-purple-200'}`}>
        <span className="text-xs font-bold">?</span>
      </div>
      <div className={`absolute left-0 top-8 w-80 p-4 rounded-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 shadow-2xl ${isDark ? 'bg-gray-800 border border-gray-700 text-gray-200' : 'bg-white border border-gray-200 text-gray-700'}`}>
        <p className="text-sm font-semibold mb-2">💡 {title}</p>
        <p className="text-xs leading-relaxed mb-3">{description}</p>
        {bullets?.length ? (
          <ul className="text-xs space-y-1 mb-3 ml-3">{bullets.map((b, i) => (<li key={i}>• {b}</li>))}</ul>
        ) : null}
        {legend?.length ? (
          <div className="space-y-1.5 pt-2 border-t border-gray-600">{legend.map((l, i) => (
            <div key={i} className="flex items-center gap-2 text-xs"><div className={`w-3 h-3 rounded-full ${l.color}`} /> <span>{l.label}</span></div>
          ))}</div>
        ) : null}
      </div>
    </div>
  );
}

interface CorrelationsDashboardProps { isDark: boolean }

export default function CorrelationsDashboard({ isDark }: CorrelationsDashboardProps) {
  const { user } = useAuth();
  const uid = user?.uid;

  // Ventana: 14 / 28 / 90 / LT (aprox 180)
  const [windowKey, setWindowKey] = useState<'14' | '28' | '90' | 'LT'>('14');
  const windowDays = windowKey === 'LT' ? 180 : Number(windowKey);

  // Datos crudos realtime
  const [rawFoods, setRawFoods] = useState<FoodEntryLite[]>([]);
  const [rawWorkouts, setRawWorkouts] = useState<WorkoutLite[]>([]);
  const [loadingFoods, setLoadingFoods] = useState(true);
  const [loadingWorkouts, setLoadingWorkouts] = useState(true);
  const [userWeightKg, setUserWeightKg] = useState<number | undefined>(undefined);

  // Perfil (peso) – lectura única
  useEffect(() => {
    if (!uid) return;
    (async () => {
      try { const profile = await userService.getUserProfile(uid); setUserWeightKg(profile?.currentWeight); } catch (e) { console.warn('Perfil no disponible', e); }
    })();
  }, [uid]);

  // Fechas límite
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000);
    return { startDate: start, endDate: end };
  }, [windowDays]);
  const startYmd = formatDateYYYYMMDD(startDate);
  const endYmd = formatDateYYYYMMDD(endDate);

  // Snapshot alimentos
  useEffect(() => {
    if (!uid) return;
    setLoadingFoods(true);
    const foodsCol = collection(db, 'foodDatabase');
    const qFoods = query(
      foodsCol,
      where('userId', '==', uid),
      where('date', '>=', startYmd),
      where('date', '<=', endYmd),
      orderBy('date', 'desc')
    );
    const unsub = onSnapshot(qFoods, snap => {
      // Forzar el shape esperado sin usar any
      setRawFoods(snap.docs.map(d => (d.data() as FoodEntryLite)) as FoodEntryLite[]);
      setLoadingFoods(false);
    }, async () => {
      // Fallback si falta índice compuesto
      const qAll = query(foodsCol, where('userId', '==', uid));
      const s = await getDocs(qAll);
      const all = s.docs.map(d => (d.data() as FoodEntryLite)) as FoodEntryLite[];
      setRawFoods(all.filter((f) => f.date >= startYmd && f.date <= endYmd));
      setLoadingFoods(false);
    });
    return () => unsub();
  }, [uid, startYmd, endYmd]);

  // Snapshot workouts (por createdAt)
  useEffect(() => {
    if (!uid) return;
    setLoadingWorkouts(true);
    const workoutsCol = collection(db, 'workouts');
    const qWorkouts = query(
      workoutsCol,
      where('userId', '==', uid),
      where('createdAt', '>=', Timestamp.fromDate(startDate)),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(qWorkouts, snap => {
      setRawWorkouts(snap.docs.map(d => (d.data() as WorkoutLite)) as WorkoutLite[]);
      setLoadingWorkouts(false);
    }, () => setLoadingWorkouts(false));
    return () => unsub();
  }, [uid, startDate]);

  // Dataset diario
  const dailyPoints: DailyPoint[] = useMemo(() => {
    const map: Record<string, DailyPoint> = {};
    for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + 86400000)) {
      const key = formatDateYYYYMMDD(d);
      map[key] = { date: key, kcal: 0, protein_g: 0, carbs_g: 0, fats_g: 0 };
    }
    rawFoods.forEach((f) => {
      const key = dateKeyFrom(f.date);
      const dp = map[key]; if (!dp) return;
      dp.kcal = clampCalories(dp.kcal + Number(f.calories || 0));
      dp.protein_g = clampMacro(dp.protein_g + Number(f.protein || 0));
      dp.carbs_g = clampMacro(dp.carbs_g + Number(f.carbs || 0));
      dp.fats_g = clampMacro(dp.fats_g + Number(f.fats || 0));
    });
    const byDayPerf: Record<string, number[]> = {};
    rawWorkouts.forEach((w) => {
      const ts: Timestamp | undefined = w.createdAt; if (!ts) return;
      const key = dateKeyFrom(ts);
      if (!byDayPerf[key]) byDayPerf[key] = [];
      const score = Number(w.performanceScore || 0);
      if (score > 0) byDayPerf[key].push(score);
    });
    Object.entries(byDayPerf).forEach(([k, arr]) => {
      if (map[k]) map[k].performance = Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [rawFoods, rawWorkouts, startDate, endDate]);

  // Dispersión kcal vs performance (días con entreno)
  const scatterData = useMemo<ScatterPoint[]>(() => dailyPoints.filter(d => (d.performance ?? 0) > 0).map(d => ({
    date: d.date,
    calories: d.kcal,
    performance: d.performance!,
    category: d.kcal < 1800 ? 'bajo' as const : d.kcal <= 2200 ? 'optimo' as const : 'exceso' as const
  })), [dailyPoints]);

  // Correlaciones
  const { r: rCalPerf, n: nCalPerf } = useMemo(() => pearson(scatterData.map(d => d.calories), scatterData.map(d => d.performance)), [scatterData]);
  const { r: rProtPerf } = useMemo(() => pearson(scatterData.map(d => dailyPoints.find(p => p.date === d.date)?.protein_g || 0), scatterData.map(d => d.performance)), [scatterData, dailyPoints]);

  // Insights derivados
  const derivedInsights = useMemo(() => generateDerivedInsights(dailyPoints, userWeightKg), [dailyPoints, userWeightKg]);

  const loading = (loadingFoods || loadingWorkouts) && dailyPoints.length === 0;
  // Aviso si pocos días -> usado para nota bajo el gráfico
  const showLimitedDataNotice = scatterData.length > 0 && scatterData.length < 7;
  const colorFor = (c: ScatterPoint['category']) => (c === 'optimo' ? '#10B981' : c === 'bajo' ? '#F59E0B' : '#EF4444');

  const CustomScatterTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { date: string; calories: number; performance: number; category: 'bajo' | 'optimo' | 'exceso' } }> }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className={`rounded-xl px-3 py-2 border text-xs shadow-sm ${isDark ? 'bg-gray-900/95 border-gray-800 text-gray-200' : 'bg-white/95 border-gray-200 text-gray-800'}`}>
        <div className="font-semibold mb-1">{d.date}</div>
        <div>Calorías: <span className="font-medium">{Math.round(d.calories)} kcal</span></div>
        <div>Performance: <span className="font-medium">{Math.round(d.performance)}%</span></div>
        <div>Categoría: <span className="font-medium capitalize">{d.category}</span></div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Cargando datos reales...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Encabezado de insights (derivados locales del dataset) */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>🧠 Tu Autoconocimiento</h2>
          <InfoTooltip
            isDark={isDark}
            title="¿Qué son estos insights?"
            description="Patrones detectados automáticamente a partir de tus datos reales (comidas + entrenos)."
            bullets={[
              'Pattern: relación consistente en tus hábitos',
              'Recommendation: ajuste accionable para mejorar',
              'La evidencia incluye promedios y rangos de tus días'
            ]}
          />
        </div>
        <InsightsPanel insights={derivedInsights} loading={false} isDark={isDark} hideHeader />
      </section>

      {/* Selector de ventana y nota realtime */}
      <div className="flex gap-2 flex-wrap">
        {(['14','28','90','LT'] as const).map(w => (
          <button key={w} onClick={() => setWindowKey(w)} className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${windowKey===w ? (isDark?'bg-purple-600 text-white border-purple-500':'bg-purple-600 text-white border-purple-600') : (isDark?'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600':'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200')}`}>
            {w==='LT' ? 'Lifetime' : `${w}d`}
          </button>
        ))}
        <span className={`text-xs ${isDark?'text-gray-400':'text-gray-500'}`}>Actualización en tiempo real</span>
      </div>

      {/* Gráfico: Calorías vs Performance */}
      {dailyPoints.length > 0 && (
        <section>
          <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <TrendingUp className={`${isDark ? 'text-purple-400' : 'text-purple-600'}`} size={20} />
                <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Calorías vs Performance</h3>
                <InfoTooltip
                  isDark={isDark}
                  title="¿Qué muestra este gráfico?"
                  description="Cada punto es un día con entrenamiento; se relaciona ingesta calórica y rendimiento."
                  legend={[
                    { color: 'bg-yellow-500', label: 'Bajo (<1800 kcal)' },
                    { color: 'bg-green-500', label: 'Óptimo (1800-2200 kcal)' },
                    { color: 'bg-red-500', label: 'Exceso (>2200 kcal)' }
                  ]}
                />
              </div>
              {scatterData.length >= 2 && (
                <div className="text-xs text-right">
                  <div className={isDark? 'text-gray-300':'text-gray-600'}>r(kcal↔perf): <strong>{rCalPerf.toFixed(2)}</strong> (n={nCalPerf})</div>
                  <div className={isDark? 'text-gray-400':'text-gray-500'}>r(prot↔perf): <strong>{rProtPerf.toFixed(2)}</strong></div>
                </div>
              )}
            </div>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#E5E7EB'} />
                  <XAxis type="number" dataKey="calories" name="Calorías" domain={[1200, 3000]} stroke={isDark ? '#9CA3AF' : '#6B7280'} tick={{ fill: isDark ? '#D1D5DB' : '#374151' }} label={{ value: 'Calorías (kcal)', position: 'bottom', fill: isDark ? '#D1D5DB' : '#374151' }} />
                  <YAxis type="number" dataKey="performance" name="Performance" domain={[0, 100]} stroke={isDark ? '#9CA3AF' : '#6B7280'} tick={{ fill: isDark ? '#D1D5DB' : '#374151' }} label={{ value: 'Performance Score (%)', angle: -90, position: 'insideLeft', fill: isDark ? '#D1D5DB' : '#374151' }} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomScatterTooltip />} wrapperStyle={{ outline: 'none' }} />
                  <ReferenceArea x1={1800} x2={2200} y1={0} y2={100} fill="#10B981" fillOpacity={0.1} stroke="#10B981" strokeOpacity={0.3} strokeDasharray="3 3" />
                  <Scatter name="Días de Entrenamiento" data={scatterData}>
                    {scatterData.map((e, i) => (<Cell key={i} fill={colorFor(e.category)} />))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-center gap-6 mt-4 text-xs">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500" /><span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Bajo (&lt;1800 kcal)</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500" /><span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Óptimo (1800-2200 kcal)</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500" /><span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Exceso (&gt;2200 kcal)</span></div>
            </div>
            {showLimitedDataNotice && (
              <p className={`mt-3 text-xs ${isDark?'text-gray-400':'text-gray-500'}`}>Nota: menos de 7 días con entrenos → correlaciones preliminares.</p>
            )}
            {scatterData.length === 0 && (
              <p className={`mt-3 text-xs ${isDark?'text-gray-400':'text-gray-500'}`}>No hay entrenamientos en la ventana seleccionada para calcular correlaciones.</p>
            )}
          </div>
        </section>
      )}

      {/* Gráfico: Macros por día (incluye días sin entreno) */}
      {dailyPoints.length > 0 && (
        <section>
          <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <BarChart3 className={`${isDark ? 'text-blue-400' : 'text-blue-600'}`} size={20} />
                <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Comparativa de Macros</h3>
                <InfoTooltip
                  isDark={isDark}
                  title="¿Qué ves aquí?"
                  description="Distribución diaria de macronutrientes registrada. Busca consistencia."
                />
              </div>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyPoints}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#E5E7EB'} />
                  <XAxis dataKey="date" stroke={isDark ? '#9CA3AF' : '#6B7280'} />
                  <YAxis stroke={isDark ? '#9CA3AF' : '#6B7280'} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="protein_g" name="Proteína (g)" fill="#3B82F6" />
                  <Bar dataKey="carbs_g" name="Carbohidratos (g)" fill="#8B5CF6" />
                  <Bar dataKey="fats_g" name="Grasas (g)" fill="#F59E0B" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* Resumen numérico */}
      {dailyPoints.length > 0 && (
        <section>
          <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
            <div className="flex items-center gap-3 mb-4">
              <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Resumen Numérico</h3>
              <InfoTooltip isDark={isDark} title="¿Cómo leer esto?" description={`Estadísticas de los últimos ${windowDays} días.`} />
            </div>
            <ul className={isDark ? 'text-gray-300 space-y-1' : 'text-gray-700 space-y-1'}>
              <li>• Días en zona óptima: {dailyPoints.filter(d => d.kcal >= 1800 && d.kcal <= 2200).length}</li>
              <li>• Performance promedio (sólo días con entreno): {scatterData.length>0 ? Math.round(scatterData.reduce((s,d)=>s+d.performance,0)/scatterData.length) : 0}%</li>
              <li>• CV calorías: {(() => { const arr = dailyPoints.map(d=>d.kcal); const avg = arr.reduce((s,v)=>s+v,0)/(arr.length||1); const std = Math.sqrt(arr.reduce((s,v)=>s+(v-avg)**2,0)/(arr.length||1)); return avg>0 ? (std/avg*100).toFixed(1) : '0.0'; })()}%</li>
              <li>• r(kcal↔perf): {scatterData.length>=2 ? rCalPerf.toFixed(2) : 'N/D'} {scatterData.length>=2 && (<span className="opacity-70">(n={nCalPerf})</span>)}</li>
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}