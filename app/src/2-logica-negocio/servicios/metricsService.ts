// metricsService
// ------------------------------------------------------------
// Construye series de datos para correlacionar nutrición y rendimiento
// de entrenamientos. No realiza IO: recibe foods y workouts ya cargados,
// agrega por día y clasifica por rangos de calorías.
// Edge cases considerados:
// - Días sin entrenamientos: se omiten (no aportan a correlación rendimiento).
// - Fechas: se unifican a YYYY-MM-DD a partir de createdAt/completedAt.
// - Macros: se agregan con util compartida y se redondean donde tiene sentido.
//-------------------------------------------------------------
import type { WorkoutSession } from '../../3-acceso-datos/firebase/firestoreService';
import type { UserFoodEntry } from '../../3-acceso-datos/firebase/foodDataService';
import { aggregateMacros } from '../../utils/nutrition';
import { formatDateYYYYMMDD } from '../../utils/date';

export type CalorieCategory = 'bajo' | 'optimo' | 'exceso';

export interface CorrelationDataPoint {
  date: string; // YYYY-MM-DD
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  performance: number; // 0-100
  energyLevel: number; // 1-10 promedio del día
  category: CalorieCategory;
}

// Etiqueta simple por zona calórica (ajustable según objetivos)
const categorizeCalories = (cal: number): CalorieCategory => (cal < 1800 ? 'bajo' : cal <= 2200 ? 'optimo' : 'exceso');

function getWorkoutDateString(w: WorkoutSession): string | null {
  const when = (w.completedAt?.toDate?.() as Date | undefined) || (w.createdAt?.toDate?.() as Date | undefined);
  if (!when) return null;
  return formatDateYYYYMMDD(when);
}

export function buildCorrelationData(workouts: WorkoutSession[], foods: UserFoodEntry[], days: number = 14): CorrelationDataPoint[] {
  // Punto de inicio: medianoche local de hoy
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayMs = 24 * 60 * 60 * 1000;

  // Agrupar foods por fecha (YYYY-MM-DD)
  const foodsByDate = new Map<string, UserFoodEntry[]>();
  for (const f of foods) {
    const d = f.date; // already YYYY-MM-DD
    if (!d) continue;
    const arr = foodsByDate.get(d) || [];
    arr.push(f);
    foodsByDate.set(d, arr);
  }

  // Agrupar workouts por fecha (usando completedAt > createdAt)
  const workoutsByDate = new Map<string, WorkoutSession[]>();
  for (const w of workouts) {
    const d = getWorkoutDateString(w);
    if (!d) continue;
    const arr = workoutsByDate.get(d) || [];
    arr.push(w);
    workoutsByDate.set(d, arr);
  }

  const result: CorrelationDataPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() - i * dayMs);
    const dateStr = formatDateYYYYMMDD(d);
    const dayWorkouts = workoutsByDate.get(dateStr) || [];
    if (dayWorkouts.length === 0) continue; // Solo días con workouts para correlación

    const dayFoods = foodsByDate.get(dateStr) || [];
    const calories = dayFoods.reduce((s, f) => s + (f.calories || 0), 0);
    const { protein: pSum, carbs: cSum, fats: fSum } = aggregateMacros(dayFoods);
    const protein = Math.round(pSum);
    const carbs = Math.round(cSum);
    const fats = Math.round(fSum);

    const perfAvg = dayWorkouts.reduce((s, w) => s + (w.performanceScore || 0), 0) / (dayWorkouts.length || 1);
    const performance = Math.round(perfAvg || 0);

    const energySum = dayWorkouts.reduce((s, w) => {
      const e = (w.postEnergyLevel ?? w.preEnergyLevel ?? 5);
      return s + (typeof e === 'number' ? e : 5);
    }, 0);
    const energyLevel = Math.round((((energySum / (dayWorkouts.length || 1)) || 0) * 10)) / 10;

    result.push({
      date: dateStr,
      calories,
      protein,
      carbs,
      fats,
      performance,
      energyLevel,
      category: categorizeCalories(calories)
    });
  }

  // Orden cronológico ascendente
  return result.reverse();
}

/**
 * Cuenta días únicos con datos reales (al menos un registro de foods, workouts o peso)
 * y valida si cumple un mínimo de días.
 */
export function hasMinimumDataForAnalysis(
  foods: UserFoodEntry[],
  workouts: WorkoutSession[],
  weights: Array<{ fecha: string }> = [],
  minDays: number = 7
): { daysWithData: number; ok: boolean } {
  // Conjunto de fechas únicas con al menos un dato (foods/workouts/peso)
  const uniqueDates = new Set<string>();
  for (const f of foods) {
    if (f?.date) uniqueDates.add(f.date);
  }
  for (const w of workouts) {
    const d = getWorkoutDateString(w);
    if (d) uniqueDates.add(d);
  }
  for (const w of weights) {
    if (w?.fecha) uniqueDates.add(w.fecha);
  }
  const daysWithData = uniqueDates.size;
  return { daysWithData, ok: daysWithData >= minDays };
}
