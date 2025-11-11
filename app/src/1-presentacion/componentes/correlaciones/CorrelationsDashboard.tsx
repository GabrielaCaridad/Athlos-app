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
import { collection, onSnapshot, query, where, Timestamp, orderBy, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../../../3-acceso-datos/firebase/config';
import { userService } from '../../../3-acceso-datos/firebase/firestoreService';
import { formatDateYYYYMMDD } from '../../../utils/date';

// Dataset diario unificado para gráficos e insights
interface DailyPoint {
  date: string; // YYYY-MM-DD (día local)
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  performance?: number; // promedio del día si hubo entrenos
  energy?: number;      // energía percibida promedio (postEnergyLevel o preEnergyLevel)
  durationSec?: number; // suma de duración de entrenos (segundos)
  carbsPct?: number;    // % de calorías provenientes de carbohidratos
}
type FoodEntryLite = { date: string; calories?: number; protein?: number; carbs?: number; fats?: number };
type WorkoutLite = { createdAt?: Timestamp; performanceScore?: number; duration?: number; preEnergyLevel?: number; postEnergyLevel?: number };
type ScatterPoint = { date: string; calories: number; performance: number; category: 'bajo' | 'optimo' | 'exceso'; energy?: number; durationSec?: number };

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
// Clasificación y frases de correlación
function correlationLabel(absR: number): 'débil' | 'moderada' | 'fuerte' {
  if (absR < 0.3) return 'débil';
  if (absR < 0.6) return 'moderada';
  return 'fuerte';
}
function correlationPhrase(r: number, n: number, xLabel: string, yLabel: string): string {
  return `Correlación ${correlationLabel(Math.abs(r))} entre ${xLabel} y ${yLabel} (r=${r.toFixed(2)}, n=${n}, Pearson)`;
}

function generateDerivedInsights(daily: DailyPoint[], userWeightKg: number | undefined, rCalPerf: number): PersonalInsight[] {
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
  const protDeficit = protTarget > 0 && avgP < protTarget * 0.85;
  if (protDeficit) {
    const deficitPct = protTarget > 0 ? ((protTarget - avgP) / protTarget) * 100 : 0;
    insights.push({
      id: 'ins_prot_baja', type: 'recommendation',
      title: '💪 Proteína por debajo del objetivo',
      description: `Promedio ${Math.round(avgP)}g vs objetivo estimado ${Math.round(protTarget)}g (1.6 g/kg). Déficit ~${deficitPct.toFixed(0)}%.`,
      evidence: [
        `Peso usado: ${userWeightKg ?? 'N/D'} kg`,
        `Promedios (g): P ${Math.round(avgP)} / C ${Math.round(avgC)} / G ${Math.round(avgF)}`
      ],
      actionable: deficitPct > 25 ? 'Añade 2 porciones de proteína magra repartidas (ej. claras + yogur + whey).' : 'Añade 1 porción más de proteína magra en comidas principales.',
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
      actionable: 'Sincroniza carbohidratos complejos (avena, arroz, papa) 60–90 min antes de entrenar para mejorar energía.',
      confidence: daily.length >= 7 ? 'medium' : 'low',
      createdAt: new Date()
    });
  }

  if (rCalPerf > 0.4) {
    insights.push({
      id: 'ins_correlacion_cal_perf', type: 'pattern',
      title: '⚙️ Rendimiento ligado a calorías',
      description: 'En días con mayor ingesta calórica tu rendimiento tendió a mejorar.',
      evidence: [
        `r(calorías↔rendimiento) = ${rCalPerf.toFixed(2)}`,
        `Promedio calorías: ${Math.round(avgK)} kcal`
      ],
      actionable: 'Mantén una ingesta estable cerca de tu rango objetivo en días de entrenamiento para sostener el rendimiento.',
      confidence: rCalPerf > 0.6 ? 'high' : 'medium',
      createdAt: new Date()
    });
  }

  // Evita duplicar recomendación proteína por kg si ya está el insight anterior
  if (userWeightKg && userWeightKg > 0 && !protDeficit) {
    const perKg = avgP / userWeightKg;
    if (perKg < 1.6) {
      insights.push({
        id: 'ins_prot_por_kg_baja', type: 'recommendation',
        title: '🍗 Proteína por debajo de 1.6 g/kg',
        description: `Tu promedio es ${perKg.toFixed(2)} g/kg. Un mínimo recomendado general es 1.6 g/kg.`,
        evidence: [
          `Peso estimado: ${userWeightKg} kg`,
          `Proteína promedio: ${Math.round(avgP)} g/día`
        ],
        actionable: 'Añade una porción de 25–30 g de proteína (p.ej. 150 g de pechuga o 1 scoop de whey) en la comida principal.',
        confidence: daily.length >= 7 ? 'high' : 'medium',
        createdAt: new Date()
      });
    }
  }
  return insights.slice(0, 8);
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
      where('createdAt', '<=', Timestamp.fromDate(endDate)),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(qWorkouts, snap => {
      setRawWorkouts(snap.docs.map(d => (d.data() as WorkoutLite)) as WorkoutLite[]);
      setLoadingWorkouts(false);
    }, () => setLoadingWorkouts(false));
    return () => unsub();
  }, [uid, startDate, endDate]);

  // Dataset diario
  const dailyPoints: DailyPoint[] = useMemo(() => {
    const map: Record<string, DailyPoint> = {};
    // Inicializa todos los días del rango para evitar huecos (incluye días sin entreno ni comidas)
    for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + 86400000)) {
      const key = formatDateYYYYMMDD(d);
      map[key] = { date: key, kcal: 0, protein_g: 0, carbs_g: 0, fats_g: 0, durationSec: 0 };
    }
    // Agrega alimentos del rango
    rawFoods.forEach((f) => {
      const key = dateKeyFrom(f.date);
      const dp = map[key]; if (!dp) return;
      dp.kcal = clampCalories(dp.kcal + Number(f.calories || 0));
      dp.protein_g = clampMacro(dp.protein_g + Number(f.protein || 0));
      dp.carbs_g = clampMacro(dp.carbs_g + Number(f.carbs || 0));
      dp.fats_g = clampMacro(dp.fats_g + Number(f.fats || 0));
    });
    // Agrega entrenamientos del rango (performance promedio, energía percibida, duración total)
    const byDayPerf: Record<string, number[]> = {};
    const byDayEnergy: Record<string, number[]> = {};
    rawWorkouts.forEach((w) => {
      const ts: Timestamp | undefined = w.createdAt; if (!ts) return;
      const key = dateKeyFrom(ts);
      const dp = map[key]; if (!dp) return;
      const score = Number(w.performanceScore || 0);
      if (score > 0) { if (!byDayPerf[key]) byDayPerf[key] = []; byDayPerf[key].push(score); }
      const energyVal = typeof w.postEnergyLevel === 'number' ? w.postEnergyLevel : (typeof w.preEnergyLevel === 'number' ? w.preEnergyLevel : undefined);
      if (Number.isFinite(energyVal)) { if (!byDayEnergy[key]) byDayEnergy[key] = []; byDayEnergy[key].push(energyVal as number); }
      const dur = Number(w.duration || 0);
      if (dur > 0) dp.durationSec = (dp.durationSec || 0) + dur;
    });
    Object.entries(byDayPerf).forEach(([k, arr]) => {
      if (map[k]) map[k].performance = Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
    });
    Object.entries(byDayEnergy).forEach(([k, arr]) => {
      if (map[k]) map[k].energy = Math.round(((arr.reduce((s, v) => s + v, 0) / arr.length) || 0) * 10) / 10;
    });
    // Calcula % carbohidratos sobre kcal
    Object.values(map).forEach((dp) => {
      if (dp.kcal > 0) {
        const carbKcal = dp.carbs_g * 4;
        dp.carbsPct = Math.round((carbKcal / dp.kcal) * 1000) / 10; // 1 decimal
      }
    });
    const result = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Correlaciones] días:', result.length, 'foods:', rawFoods.length, 'workouts:', rawWorkouts.length);
    }
    return result;
  }, [rawFoods, rawWorkouts, startDate, endDate]);

  // Dispersión kcal vs performance (días con entreno)
    const scatterData = useMemo<ScatterPoint[]>(() => dailyPoints.filter(d => (d.performance ?? 0) > 0).map(d => ({
      date: d.date,
      calories: d.kcal,
      performance: d.performance!,
      category: d.kcal < 1800 ? 'bajo' as const : d.kcal <= 2200 ? 'optimo' as const : 'exceso' as const,
      energy: d.energy,
      durationSec: d.durationSec
    })), [dailyPoints]);

    // Correlaciones adaptativas (usadas en UI e insights contextuales)
    const caloriesEnergyCorr = useMemo(() => computeAdaptiveCorrelation(
      dailyPoints.filter(d=> Number.isFinite(d.energy) && d.kcal>0).map(d=>d.kcal),
      dailyPoints.filter(d=> Number.isFinite(d.energy) && d.kcal>0).map(d=>d.energy as number),
      `${windowDays}d`
    ), [dailyPoints, windowDays]);
    const carbsPctPerfCorr = useMemo(() => computeAdaptiveCorrelation(
      dailyPoints.filter(d=> Number.isFinite(d.performance) && d.performance!>0 && Number.isFinite(d.carbsPct)).map(d=>d.carbsPct as number),
      dailyPoints.filter(d=> Number.isFinite(d.performance) && d.performance!>0 && Number.isFinite(d.carbsPct)).map(d=>d.performance as number),
      `${windowDays}d`
    ), [dailyPoints, windowDays]);
    const durationEnergyCorr = useMemo(() => computeAdaptiveCorrelation(
      dailyPoints.filter(d=> Number.isFinite(d.energy) && (d.durationSec||0)>0).map(d=>d.durationSec as number),
      dailyPoints.filter(d=> Number.isFinite(d.energy) && (d.durationSec||0)>0).map(d=>d.energy as number),
      `${windowDays}d`
    ), [dailyPoints, windowDays]);
  // Correlaciones
  const { r: rCalPerf, n: nCalPerf } = useMemo(() => pearson(scatterData.map(d => d.calories), scatterData.map(d => d.performance)), [scatterData]);

  // Insights derivados
  const derivedInsights = useMemo(() => generateDerivedInsights(dailyPoints, userWeightKg, rCalPerf), [dailyPoints, userWeightKg, rCalPerf]);

  // Frases adaptativas (correlaciones nuevas)
  const adaptivePhrase = (corr: { r: number; n: number; metodo: string; fuerza: string }, x: string, y: string) => {
    if (corr.metodo === 'Insuficiente' || corr.n < 8) return `Correlación insuficiente entre ${x} y ${y} (n<8).`;
    return `Relación ${corr.fuerza} (${corr.metodo}) ${x}↔${y} (r=${corr.r.toFixed(2)}, n=${corr.n})`;
  };
  const kcalPerfPhrase = useMemo(() => scatterData.length >= 2 ? correlationPhrase(rCalPerf, nCalPerf, 'calorías', 'rendimiento') : 'Correlación no disponible (n<2)', [rCalPerf, nCalPerf, scatterData.length]);
  const caloriesEnergyPhrase = useMemo(() => adaptivePhrase(caloriesEnergyCorr, 'calorías', 'energía percibida'), [caloriesEnergyCorr]);
  const carbsPerfPhrase = useMemo(() => adaptivePhrase(carbsPctPerfCorr, '% carbohidratos', 'rendimiento'), [carbsPctPerfCorr]);
  const durationEnergyPhrase = useMemo(() => adaptivePhrase(durationEnergyCorr, 'duración entreno', 'energía percibida'), [durationEnergyCorr]);

  // Insights derivados + correlaciones (enriquecidos por correlaciones adaptativas)
  const correlationInsights = useMemo<PersonalInsight[]>(() => {
    const arr: PersonalInsight[] = [];
    const pushCorr = (id: string, corr: typeof caloriesEnergyCorr, title: string, desc: string, actionable: string) => {
      if (corr.metodo === 'Insuficiente' || corr.n < 8) return;
      arr.push({
        id,
        type: 'pattern',
        title,
        description: desc.replace('{R}', corr.r.toFixed(2)).replace('{M}', corr.metodo).replace('{N}', String(corr.n)),
        evidence: [
          `Método: ${corr.metodo}`,
          `r=${corr.r.toFixed(2)} (fuerza ${corr.fuerza})`,
          `n=${corr.n}`
        ],
        actionable,
        confidence: corr.n >= 14 ? 'high' : 'medium',
        createdAt: new Date()
      });
    };
    if (caloriesEnergyCorr.r > 0.25) {
      pushCorr('corr_cal_energy', caloriesEnergyCorr, '🔥 Ingesta y energía percibida', 'Mayor ingesta parece asociarse a mejor energía percibida (r={R}, {M}, n={N}).', 'Asegura calorías suficientes las horas previas al entreno para sostener energía.');
    }
    if (carbsPctPerfCorr.r > 0.3) {
      pushCorr('corr_carbs_perf', carbsPctPerfCorr, '⚡ % Carbohidratos y rendimiento', 'Una mayor proporción de carbohidratos se asocia a mejor performance (r={R}, {M}, n={N}).', 'Sincroniza carbohidratos complejos 60–90 min antes de entrenar.');
    }
    if (durationEnergyCorr.r < -0.3) {
      pushCorr('corr_dur_energy', durationEnergyCorr, '⏱️ Duración y caída de energía', 'Entrenos más largos se asocian a menor energía percibida post (r={R}, {M}, n={N}).', 'Evalúa distribución de intensidad o agrega intra-entreno ligero (electrolitos/carbohidratos).');
    }
    return arr.slice(0,3);
  }, [caloriesEnergyCorr, carbsPctPerfCorr, durationEnergyCorr]);

  const allInsights = useMemo(() => [...correlationInsights, ...derivedInsights].slice(0,12), [correlationInsights, derivedInsights]);

  // Persistencia de insights locales + meta de correlaciones adaptativas
  useEffect(() => {
    const persistLocalInsights = async () => {
      try {
        if (!uid || !allInsights.length) return;
        await addDoc(collection(db, 'userInsights'), {
          userId: uid,
            generatedAt: Timestamp.now(),
            startDate: startYmd,
            endDate: endYmd,
            windowDays,
            correlationMeta: {
              caloriesEnergy: caloriesEnergyCorr,
              carbsPctPerformance: carbsPctPerfCorr,
              durationEnergy: durationEnergyCorr
            },
            insights: allInsights.map(i => ({
              ...i,
              createdAt: i.createdAt ? Timestamp.fromDate(i.createdAt) : Timestamp.now()
            }))
        });
      } catch (e) {
        console.warn('No se pudieron persistir los insights locales:', e);
      }
    };
    void persistLocalInsights();
  }, [uid, allInsights, startYmd, endYmd, windowDays, caloriesEnergyCorr, carbsPctPerfCorr, durationEnergyCorr]);

  const loading = (loadingFoods || loadingWorkouts) && dailyPoints.length === 0;
  // Aviso si pocos días -> usado para nota bajo el gráfico
  const showLimitedDataNotice = scatterData.length > 0 && scatterData.length < 7;
  const colorFor = (c: ScatterPoint['category']) => (c === 'optimo' ? '#10B981' : c === 'bajo' ? '#F59E0B' : '#EF4444');

  const CustomScatterTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { date: string; calories: number; performance: number; category: 'bajo' | 'optimo' | 'exceso'; energy?: number; durationSec?: number } }> }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className={`rounded-xl px-3 py-2 border text-xs shadow-sm ${isDark ? 'bg-gray-900/95 border-gray-800 text-gray-200' : 'bg-white/95 border-gray-200 text-gray-800'}`}>
        <div className="font-semibold mb-1">{d.date}</div>
        <div>Calorías: <span className="font-medium">{Math.round(d.calories)} kcal</span></div>
        <div>Performance: <span className="font-medium">{Math.round(d.performance)}%</span></div>
        <div>Categoría: <span className="font-medium capitalize">{d.category}</span></div>
        {Number.isFinite(d.energy) ? (
          <div>Energía percibida: <span className="font-medium">{d.energy}</span></div>
        ) : null}
        {Number.isFinite(d.durationSec) ? (
          <div>Duración entreno: <span className="font-medium">{Math.round((d.durationSec||0)/60)} min</span></div>
        ) : null}
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
        <InsightsPanel insights={allInsights} loading={false} isDark={isDark} hideHeader />
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
                  description="Cada punto es un día con entrenamiento; se relaciona ingesta calórica y rendimiento. Abajo verás frases con método estadístico (Pearson o Spearman) según datos."
                  bullets={[
                    'Pearson: relaciona tendencias lineales y es sensible a outliers',
                    'Spearman: usa rangos, capta relaciones monótonas y es robusto a outliers',
                    'Si hay pocos días (n<8), la correlación se considera insuficiente'
                  ]}
                  legend={[
                    { color: 'bg-yellow-500', label: 'Bajo (<1800 kcal)' },
                    { color: 'bg-green-500', label: 'Óptimo (1800-2200 kcal)' },
                    { color: 'bg-red-500', label: 'Exceso (>2200 kcal)' }
                  ]}
                />
              </div>
              {scatterData.length >= 2 && (
                <div className="text-xs text-right space-y-0.5">
                  <div className={isDark? 'text-gray-300':'text-gray-600'}>{kcalPerfPhrase}</div>
                  <div className={isDark? 'text-gray-400':'text-gray-500'}>{caloriesEnergyPhrase}</div>
                  <div className={isDark? 'text-gray-400':'text-gray-500'}>{carbsPerfPhrase}</div>
                  <div className={isDark? 'text-gray-400':'text-gray-500'}>{durationEnergyPhrase}</div>
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
                  <Tooltip content={<CustomMacrosTooltip isDark={isDark} />} wrapperStyle={{ outline: 'none' }} />
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
              <InfoTooltip
                isDark={isDark}
                title="¿Cómo leer esto?"
                description={`Estadísticas de los últimos ${windowDays} días. El CV (coeficiente de variación) es la variabilidad relativa (desviación/promedio). Puede superar 100% si el promedio es bajo.`}
              />
            </div>
            <ul className={isDark ? 'text-gray-300 space-y-1' : 'text-gray-700 space-y-1'}>
              <li>• Días en zona óptima: {dailyPoints.filter(d => d.kcal >= 1800 && d.kcal <= 2200).length}</li>
              <li>• Performance promedio (sólo días con entreno): {scatterData.length>0 ? Math.round(scatterData.reduce((s,d)=>s+d.performance,0)/scatterData.length) : 0}%</li>
              <li>• CV calorías: {(() => { const arr = dailyPoints.map(d=>d.kcal); const avg = arr.reduce((s,v)=>s+v,0)/(arr.length||1); const std = Math.sqrt(arr.reduce((s,v)=>s+(v-avg)**2,0)/(arr.length||1)); return avg>0 ? (std/avg*100).toFixed(1) : '0.0'; })()}%</li>
              <li>• {kcalPerfPhrase}</li>
              <li>• {caloriesEnergyPhrase}</li>
              <li>• {carbsPerfPhrase}</li>
              <li>• {durationEnergyPhrase}</li>
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

// Tooltip personalizado para barras de macros
function CustomMacrosTooltip({ active, payload, isDark }: { active?: boolean; payload?: Array<{ payload: DailyPoint }>; isDark: boolean }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className={`rounded-xl px-3 py-2 border text-xs shadow-sm ${isDark ? 'bg-gray-900/95 border-gray-800 text-gray-200' : 'bg-white/95 border-gray-200 text-gray-800'}`}>
      <div className="font-semibold mb-1">{d.date}</div>
      <div>Calorías: <span className="font-medium">{Math.round(d.kcal)} kcal</span></div>
      {typeof d.performance === 'number' && (
        <div>Performance: <span className="font-medium">{Math.round(d.performance)}%</span></div>
      )}
      {typeof d.carbsPct === 'number' && (
        <div>% Carbohidratos: <span className="font-medium">{d.carbsPct.toFixed(1)}%</span></div>
      )}
      {typeof d.energy === 'number' && (
        <div>Energía percibida: <span className="font-medium">{d.energy}</span></div>
      )}
      {typeof d.durationSec === 'number' && d.durationSec > 0 && (
        <div>Duración entreno: <span className="font-medium">{Math.round(d.durationSec/60)} min</span></div>
      )}
      <div className="mt-1 grid grid-cols-3 gap-2">
        <div>Proteína: <span className="font-medium">{Math.round(d.protein_g)} g</span></div>
        <div>Carbos: <span className="font-medium">{Math.round(d.carbs_g)} g</span></div>
        <div>Grasas: <span className="font-medium">{Math.round(d.fats_g)} g</span></div>
      </div>
    </div>
  );
}

// Spearman rho (Pearson aplicado a rangos): menos sensible a outliers y detecta relaciones monótonas
function spearman(xs: number[], ys: number[]): { r: number; n: number } {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { r: 0, n };
  const rank = (arr: number[]) => {
    const ordered = arr.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v);
    const ranks: number[] = new Array(arr.length);
    let k=0;
    while(k<ordered.length){
      let j=k; while(j+1<ordered.length && ordered[j+1].v===ordered[k].v) j++;
      const avg=(k+j+2)/2; for(let t=k;t<=j;t++){ ranks[ordered[t].i]=avg; }
      k=j+1;
    }
    return ranks;
  };
  const rx = rank(xs); const ry = rank(ys);
  const { r } = pearson(rx, ry);
  return { r, n };
}

interface AdaptiveCorrelation { r: number; n: number; metodo: 'Pearson' | 'Spearman' | 'Insuficiente'; ventana: string; fuerza: 'débil' | 'moderada' | 'fuerte'; basePearson?: number; baseSpearman?: number }
function computeAdaptiveCorrelation(xs: number[], ys: number[], ventana: string): AdaptiveCorrelation {
  const n = Math.min(xs.length, ys.length);
  if (n < 8) return { r: 0, n, metodo: 'Insuficiente', ventana, fuerza: 'débil' };
  const p = pearson(xs, ys).r;
  const s = spearman(xs, ys).r;
  let metodo: 'Pearson' | 'Spearman';
  if (n >= 12) {
    metodo = (Math.abs(p - s) > 0.15 && Math.abs(s) > Math.abs(p)) ? 'Spearman' : 'Pearson';
  } else {
    metodo = 'Spearman';
  }
  const r = metodo === 'Pearson' ? p : s;
  const absR = Math.abs(r);
  const fuerza: AdaptiveCorrelation['fuerza'] = absR < 0.2 ? 'débil' : absR < 0.4 ? 'moderada' : 'fuerte';
  return { r, n, metodo, ventana, fuerza, basePearson: p, baseSpearman: s };
}