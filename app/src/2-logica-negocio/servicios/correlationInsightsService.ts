/**
 * Correlaciones entre nutrición y rendimiento.
 * Genera insights personales combinando comidas y entrenos
 */

import { Timestamp as FsTimestamp, setDoc, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import type { UserFoodEntry } from './foodDataService';
import type { WorkoutSession } from './firestoreService';
import { db } from '../../3-acceso-datos/firebase/config';
import { formatDateYYYYMMDD, calculateAge as calcAgeUtil } from '../../utils/date';
import { aggregateMacros } from '../../utils/nutrition';

// Interfaces públicas
export interface PersonalInsight {
  id: string;
  type: 'pattern' | 'recommendation';
  title: string;
  description: string;
  evidence: string[];
  actionable: string;
  confidence: 'high' | 'medium' | 'low';
  // Estimación de impacto (opcional, usada por IA)
  impactEstimated?: 'low' | 'medium' | 'high';
  createdAt: Date;
}

export interface CorrelationDataPoint {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  energyLevel: number; // 1-10
  hadWorkout: boolean;
  workoutDuration?: number;
  performanceScore?: number;
}

// Perfil de usuario desde Firestore
export interface UserProfile {
  weight: number; // kg
  height: number; // cm
  age: number;
  gender: 'male' | 'female' | 'other';
  goal: 'lose_weight' | 'gain_muscle' | 'recomposition' | 'maintenance';
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  workoutsPerWeek: number;
}

export class CorrelationInsightsService {
  /**
   * Analiza patrones personales del usuario correlacionando alimentación y entrenamientos.
   * Usa IA (Firebase Function) y cae a fallback si falla.
   */
  async analyzeUserPatterns(_userId: string, daysToAnalyze: number = 14): Promise<PersonalInsight[]> {
    try {
      // 0) Usar siempre el UID del usuario autenticado (evitar IDs fijos)
      const auth = getAuth();
      console.log('🎯 [analyzeUserPatterns] Analizando para userId:', _userId);
      console.log('🎯 [analyzeUserPatterns] Usuario autenticado:', auth.currentUser?.uid);
      const effectiveUserId = auth.currentUser?.uid;
      if (!effectiveUserId) {
        console.warn('⚠️ [analyzeUserPatterns] No hay usuario autenticado; cancelando análisis');
        return [];
      }

      // 1) Obtener datos combinados
      const data = await this.getCombinedData(effectiveUserId, daysToAnalyze);

      // 2) Validación mínima
      if (!Array.isArray(data) || data.length < 7) {
        console.log('Insuficientes datos para análisis (mínimo 7 días)');
        return [];
      }

      // 3) Obtener perfil del usuario (usa Auth internamente)
  const profile = await this.getUserProfile();
      if (!profile) {
        console.warn('⚠️ [analyzeUserPatterns] No se encontró perfil de usuario, usando fallback');
        console.log('💡 [analyzeUserPatterns] Verifica que exista el documento: users/' + effectiveUserId);
        return this.getFallbackInsights(data);
      }

      // 4) Preparar datos para IA
      const dataForAI = this.prepareDataForAI(data, profile);

      // 5) Llamar a Firebase Function (IA)
      const aiInsights = await this.generateInsightsWithAI(dataForAI, profile);

      // 6) Validar y filtrar insights (prioriza impacto medio/alto)
      const validInsights = aiInsights
        .filter(i => i.impactEstimated !== 'low')
        .slice(0, 6);

      // 7) Guardar en Firestore si hay resultados
      if (validInsights.length > 0) {
        await this.saveInsightsToFirestore(effectiveUserId, validInsights);
        return validInsights;
      }

      // Si IA no devolvió nada útil, usa fallback
      const fallback = this.getFallbackInsights(data).slice(0, 6);
      if (fallback.length > 0) await this.saveInsightsToFirestore(effectiveUserId, fallback);
      return fallback;
    } catch (error) {
      console.error('[CorrelationInsightsService] analyzeUserPatterns error:', error);
      // Fallback a lógica básica si hay errores
      try {
        const auth = getAuth();
        const effectiveUserId = auth.currentUser?.uid;
        if (!effectiveUserId) {
          console.warn('⚠️ [analyzeUserPatterns] No hay usuario autenticado tras error; devolviendo []');
          return [];
        }
        const data = await this.getCombinedData(effectiveUserId, daysToAnalyze);
        return this.getFallbackInsights(data).slice(0, 6);
      } catch {
        return [];
      }
    }
  }

  /** Obtiene el perfil del usuario; si falta, intenta por campo userId */
  private async getUserProfile(): Promise<UserProfile | null> {
    try {
      
      const auth = getAuth();
      const authUserId = auth.currentUser?.uid;
      if (!authUserId) {
        console.warn('⚠️ No hay usuario autenticado en getUserProfile');
        return null;
      }

      const effectiveUserId = authUserId;

      // 2) Intentar acceso directo (usuarios nuevos con UID correcto)
      const directRef = doc(db, 'users', effectiveUserId);
      let userDoc;
      try {
        userDoc = await getDoc(directRef);
      } catch (e) {
        const msg = (e as { message?: string })?.message;
        if (typeof msg === 'string' && msg.includes('Missing or insufficient permissions')) {
          console.warn('⚠️ [getUserProfile] No se pudo leer users/' + effectiveUserId + ' por permisos insuficientes');
          return null;
        }
        throw e;
      }

      if (!userDoc.exists()) {
        // 3) Fallback: Buscar por campo userId (usuarios legacy)
        console.log('🔍 [getUserProfile] No encontrado por UID; buscando por campo userId...');
        const usersCol = collection(db, 'users');
        const q = query(usersCol, where('userId', '==', effectiveUserId));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          userDoc = snapshot.docs[0];
          console.log('✅ [getUserProfile] Perfil encontrado (por query) en:', userDoc.id);
        } else {
          console.warn('⚠️ [getUserProfile] No se encontró perfil de usuario');
          return null;
        }
      } else {
        console.log('✅ [getUserProfile] Perfil encontrado (acceso directo)');
      }

      const data = userDoc.data() as Record<string, unknown>;
  console.log('📦 [getUserProfile] Perfil encontrado para:', effectiveUserId);

      // Mapear campos con nombres diferentes / defaults
      const weightRaw = (data.currentWeight ?? data.weight) as unknown;
      const heightRaw = data.height as unknown;
      const goalRaw = (data.primaryGoal ?? data.goal) as unknown;

      const weight = typeof weightRaw === 'number' && isFinite(weightRaw) ? weightRaw : undefined;
      const height = typeof heightRaw === 'number' && isFinite(heightRaw) ? heightRaw : undefined;
      const goal = typeof goalRaw === 'string' && goalRaw.length > 0 ? goalRaw as UserProfile['goal'] : undefined;

      // Validar campos críticos
      if (!weight || !height || !goal) {
        console.warn('⚠️ [getUserProfile] Perfil incompleto:', {
          weight: !!weight,
          height: !!height,
          primaryGoal: !!goal
        });
        return null;
      }

  // Calcular age desde dateOfBirth (util compartida)
  const age = calcAgeUtil(data.dateOfBirth as string | Date | { toDate?: () => Date } | null | undefined, 25);

      // Mapear gender
      const gender = this.mapGender(data.gender);

      // Inferir experienceLevel desde level
      const experienceLevel = this.inferExperienceLevel(data.level);

      // workoutsPerWeek default 4 si no existe o inválido
      const wRaw = data.workoutsPerWeek as unknown;
      const workoutsPerWeek = typeof wRaw === 'number' && isFinite(wRaw) && wRaw > 0 ? Math.round(wRaw) : 4;

      // activityLevel default 'moderate' si no existe
      const alRaw = data.activityLevel as unknown;
      const activityLevel: UserProfile['activityLevel'] = (typeof alRaw === 'string' &&
        ['sedentary','light','moderate','active','very_active'].includes(alRaw))
        ? (alRaw as UserProfile['activityLevel'])
        : 'moderate';

      // Construir perfil normalizado
      const profile: UserProfile = {
        weight,
        height,
        age,
        gender,
        goal,
        activityLevel,
        experienceLevel,
        workoutsPerWeek
      };
      console.log('✅ [getUserProfile] Perfil construido exitosamente');
  return profile;
    } catch (error) {
      console.error('❌ [getUserProfile] Error:', error);
      return null;
    }
  }

  // Helpers de mapeo y normalización

  private mapGender(gender: unknown): 'male' | 'female' | 'other' {
    if (gender === 'male') return 'male';
    if (gender === 'female') return 'female';
    // Mapea prefer_not_to_say y otros valores a 'other'
    return 'other';
  }

  private inferExperienceLevel(level: unknown): 'beginner' | 'intermediate' | 'advanced' {
    const n = typeof level === 'number' && isFinite(level) ? Math.floor(level) : undefined;
    if (!n || n <= 2) return 'beginner';
    if (n <= 5) return 'intermediate';
    return 'advanced';
  }

  // (sin hasToDate: reemplazado por util calculateAge)

  /**
   * Combina datos de nutrición y entrenamientos por día para los últimos N días.
   */
  private async getCombinedData(userId: string, days: number): Promise<CorrelationDataPoint[]> {
    try {
      console.log('🔍 [getCombinedData] Obteniendo datos para userId:', userId);
      console.log('🔍 [getCombinedData] Días a analizar:', days);
      if (days <= 0) return [];

      // Construir la lista de fechas (de más antiguo a más reciente)
      const today = new Date();
      const startUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      const dates: string[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(startUtc);
        d.setUTCDate(startUtc.getUTCDate() - i);
        dates.push(formatDateYYYYMMDD(d));
      }

      const startDateStr = dates[0];
      const endDateStr = dates[dates.length - 1];
      const startTs = FsTimestamp.fromDate(new Date(startDateStr + 'T00:00:00.000Z'));
      const endTs = FsTimestamp.fromDate(new Date(endDateStr + 'T23:59:59.999Z'));

      // Recuperar TODO el rango en 2 queries (foods, workouts) y agrupar por fecha
      const foodsQ = query(
        collection(db, 'foodDatabase'),
        where('userId', '==', userId),
        where('date', '>=', startDateStr),
        where('date', '<=', endDateStr)
      );
      const workoutsQ = query(
        collection(db, 'workouts'),
        where('userId', '==', userId),
        where('createdAt', '>=', startTs),
        where('createdAt', '<=', endTs)
      );

      const [foodsSnap, workoutsSnap] = await Promise.all([getDocs(foodsQ), getDocs(workoutsQ)]);

      const foodsByDate = new Map<string, UserFoodEntry[]>();
      for (const d of foodsSnap.docs) {
        const data = d.data() as unknown as UserFoodEntry;
        const day = String(data.date || '');
        if (!foodsByDate.has(day)) foodsByDate.set(day, []);
        foodsByDate.get(day)!.push(data);
      }

      const workoutsByDate = new Map<string, WorkoutSession[]>();
      for (const d of workoutsSnap.docs) {
        const data = d.data() as unknown as WorkoutSession;
        const createdTs = (data as unknown as { createdAt?: FsTimestamp }).createdAt;
        const created: Date | undefined = createdTs?.toDate?.();
        const day = created ? formatDateYYYYMMDD(created) : '';
        if (!day) continue;
        if (!workoutsByDate.has(day)) workoutsByDate.set(day, []);
        workoutsByDate.get(day)!.push(data);
      }

      const points: CorrelationDataPoint[] = [];
      for (const date of dates) {
        const foods = foodsByDate.get(date) || [];
        const workouts = workoutsByDate.get(date) || [];

        const calories = foods.reduce((sum, f) => sum + (f.calories || 0), 0);
        const { protein, carbs, fats } = aggregateMacros(foods);
        const fiber = foods.reduce((sum, f) => sum + (f.fiber || 0), 0);

        const hadWorkout = workouts.length > 0;
        const workoutDuration = hadWorkout
          ? workouts.reduce((sum, w) => sum + ((w.duration || 0)), 0)
          : undefined;

        const energySamples = workouts
          .map(w => (typeof w.postEnergyLevel === 'number' ? w.postEnergyLevel : w.preEnergyLevel))
          .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
        const energyLevel = energySamples.length > 0
          ? Math.max(1, Math.min(10, Math.round(this.calculateAverage(energySamples))))
          : 5;

        const perfSamples = workouts
          .map(w => w.performanceScore)
          .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
        const performanceScore = perfSamples.length > 0
          ? Math.round(this.calculateAverage(perfSamples))
          : undefined;

        points.push({
          date,
          calories,
          protein,
          carbs,
          fats,
          fiber,
          energyLevel,
          hadWorkout,
          workoutDuration,
          performanceScore
        });
      }

      console.log('📊 [getCombinedData] Total de días con datos:', points.length);
      console.log('📊 [getCombinedData] Muestra detallada (primeros 3 días):',
        points.slice(0, 3).map(p => ({
          date: p.date,
          calories: p.calories,
          protein: p.protein,
          carbs: p.carbs,
          fats: p.fats,
          energyLevel: p.energyLevel,
          hadWorkout: p.hadWorkout,
          workoutDuration: p.workoutDuration
        }))
      );

      const totalCarbs = points.reduce((sum, p) => sum + p.carbs, 0);
      const avgCarbs = points.length > 0 ? Math.round(totalCarbs / points.length) : 0;
      const highEnergyDays = points.filter(p => p.energyLevel >= 7);
      const lowEnergyDays = points.filter(p => p.energyLevel <= 4);
      const avgCarbsHighEnergy = highEnergyDays.length > 0
        ? Math.round(highEnergyDays.reduce((sum, p) => sum + p.carbs, 0) / highEnergyDays.length)
        : 0;
      const avgCarbsLowEnergy = lowEnergyDays.length > 0
        ? Math.round(lowEnergyDays.reduce((sum, p) => sum + p.carbs, 0) / lowEnergyDays.length)
        : 0;

      console.log('📈 [getCombinedData] Estadísticas:', {
        avgCarbs,
        highEnergyDays: highEnergyDays.length,
        avgCarbsHighEnergy,
        lowEnergyDays: lowEnergyDays.length,
        avgCarbsLowEnergy
      });
      return points;
    } catch (error) {
      console.error('[CorrelationInsightsService] getCombinedData error:', error);
      return [];
    }
  }

  // Promedio numérico con manejo de arreglo vacío
  private calculateAverage(numbers: number[]): number {
    if (!numbers || numbers.length === 0) return 0;
    const sum = numbers.reduce((s, n) => s + n, 0);
    return sum / numbers.length;
  }

  // Calcula desviación estándar de un conjunto de números
  private calculateStdDev(numbers: number[], mean?: number): number {
    if (!numbers || numbers.length === 0) return 0;
    const avg = typeof mean === 'number' ? mean : this.calculateAverage(numbers);
    const variance = this.calculateAverage(numbers.map(n => (n - avg) ** 2));
    return Math.sqrt(variance);
  }

  // Detecta patrón de relación entre carbohidratos consumidos y nivel de energía reportado en días con entrenamiento
  private analyzeCarbsEnergyPatternSync(data: CorrelationDataPoint[]): PersonalInsight | null {
    try {
      // 1) Filtrar solo días con workout
      const workoutDays = data.filter(d => d.hadWorkout === true);
      // 2) Mínimo 7 días con workout
      if (workoutDays.length < 7) return null;

      // 3) Separar por energía alta (>=7) y baja (<=4)
      const highEnergyDays = workoutDays.filter(d => d.energyLevel >= 7);
      const lowEnergyDays = workoutDays.filter(d => d.energyLevel <= 4);

      // 4) Cada grupo debe tener al menos 2 días
      if (highEnergyDays.length < 2 || lowEnergyDays.length < 2) return null;

      // 5) Promedio de carbohidratos por grupo
      const avgCarbsHigh = this.calculateAverage(highEnergyDays.map(d => d.carbs));
      const avgCarbsLow = this.calculateAverage(lowEnergyDays.map(d => d.carbs));

      // 6) Diferencia significativa > 50g y con dirección (más carbos en días de alta energía)
      const difference = avgCarbsHigh - avgCarbsLow;
      if (difference > 50) {
        const insight: PersonalInsight = {
          id: this.generateInsightId(),
          type: 'pattern',
          title: '🔥 Patrón identificado: Carbohidratos y Energía',
          description: `En tus días de mayor energía (7-10), consumes en promedio ${Math.round(avgCarbsHigh)}g de carbohidratos. En días de baja energía (1-4), consumes solo ${Math.round(avgCarbsLow)}g.`,
          evidence: [
            `📊 ${highEnergyDays.length} días de alta energía → promedio ${Math.round(avgCarbsHigh)}g carbos`,
            `📉 ${lowEnergyDays.length} días de baja energía → promedio ${Math.round(avgCarbsLow)}g carbos`,
            `✨ Diferencia de ${Math.round(difference)}g entre ambos grupos`
          ],
          actionable: `Intenta consumir al menos ${Math.round(avgCarbsHigh - 20)}-${Math.round(avgCarbsHigh)}g de carbohidratos los días que entrenas para mantener tu energía alta.`,
          confidence: 'high',
          createdAt: new Date()
        };
        return insight;
      }

      // 7) Sin patrón claro
      return null;
    } catch (error) {
      console.error('[CorrelationInsightsService] analyzeCarbsEnergyPattern error:', error);
      return null;
    }
  }

  // Detecta si una mayor ingesta de proteína mejora la energía del día siguiente (recuperación)
  private analyzeProteinRecoveryPatternSync(data: CorrelationDataPoint[]): PersonalInsight | null {
    try {
      // 1) Días con workout y con energía definida
      const validDays = data.filter(d => d.hadWorkout && Number.isFinite(d.energyLevel));
      // 2) Mínimo 7 días con datos válidos
      if (validDays.length < 7) return null;

      // Ordenar por fecha ascendente para detectar consecutivos
      const toTime = (s: string): number => new Date(`${s}T00:00:00.000Z`).getTime();
      const sorted = [...validDays].sort((a, b) => toTime(a.date) - toTime(b.date));

      // 3) Encontrar pares consecutivos (N y N+1 ambos con workout)
      const oneDayMs = 24 * 60 * 60 * 1000;
      type Pair = { proteinN: number; energyNext: number };
      const consecutivePairs: Pair[] = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const d1 = sorted[i];
        const d2 = sorted[i + 1];
        if (toTime(d2.date) - toTime(d1.date) === oneDayMs) {
          const proteinN = d1.protein;
          const energyNext = d2.energyLevel;
          if (Number.isFinite(proteinN) && Number.isFinite(energyNext)) {
            consecutivePairs.push({ proteinN, energyNext });
          }
        }
      }

      if (consecutivePairs.length === 0) return null;

      // 5) Separar por niveles de proteína del día N
      const highProteinDays = consecutivePairs.filter(p => p.proteinN >= 100);
      const lowProteinDays = consecutivePairs.filter(p => p.proteinN < 80);

      // Se requiere que ambos grupos tengan al menos 1 elemento para comparar
      if (highProteinDays.length === 0 || lowProteinDays.length === 0) return null;

      // 6) Promedios de energía del día siguiente y proteína del día N (para descripciones)
      const avgEnergyAfterHigh = this.calculateAverage(highProteinDays.map(p => p.energyNext));
      const avgEnergyAfterLow = this.calculateAverage(lowProteinDays.map(p => p.energyNext));
      const avgProteinHigh = this.calculateAverage(highProteinDays.map(p => p.proteinN));
      const avgProteinLow = this.calculateAverage(lowProteinDays.map(p => p.proteinN));

      // 7) Diferencia de energía significativa
      if (avgEnergyAfterHigh - avgEnergyAfterLow >= 1.5) {
        const insight: PersonalInsight = {
          id: this.generateInsightId(),
          type: 'pattern',
          title: '💪 Tu recuperación mejora con más proteína',
          description: `Cuando consumes ${Math.round(avgProteinHigh)}g+ de proteína, tu energía al día siguiente es ${avgEnergyAfterHigh.toFixed(1)}/10. Con menos proteína (${Math.round(avgProteinLow)}g), baja a ${avgEnergyAfterLow.toFixed(1)}/10.`,
          evidence: [
            `${highProteinDays.length} días con proteína alta → energía siguiente día: ${avgEnergyAfterHigh.toFixed(1)}/10`,
            `${lowProteinDays.length} días con proteína baja → energía siguiente día: ${avgEnergyAfterLow.toFixed(1)}/10`,
            `📈 Mejora de ${(avgEnergyAfterHigh - avgEnergyAfterLow).toFixed(1)} puntos con más proteína`
          ],
          actionable: `Intenta consumir al menos ${Math.round(avgProteinHigh - 10)}g de proteína los días que entrenas para mejorar tu recuperación.`,
          confidence: highProteinDays.length >= 5 ? 'high' : 'medium',
          createdAt: new Date()
        };
        return insight;
      }

      return null;
    } catch (error) {
      console.error('[CorrelationInsightsService] analyzeProteinRecoveryPattern error:', error);
      return null;
    }
  }

  // Detecta consistencia calórica en días de entrenamiento y su relación con energía
  private analyzeCalorieConsistencyPatternSync(data: CorrelationDataPoint[]): PersonalInsight | null {
    try {
      // 1) Filtrar días con workout
      const workoutDays = data.filter(d => d.hadWorkout);
      // 2) Necesita mínimo 10 días
      const daysCount = workoutDays.length;
      if (daysCount < 10) return null;

      // 3) Promedio de calorías
      const caloriesArr = workoutDays.map(d => d.calories);
      const avgCalories = this.calculateAverage(caloriesArr);
      if (!Number.isFinite(avgCalories) || avgCalories <= 0) return null;

      // 4) Desviación estándar
      const stdDev = this.calculateStdDev(caloriesArr, avgCalories);

      // 5) Coeficiente de variación (CV)
      const cv = (stdDev / avgCalories) * 100;

      // Energía promedio en días de entrenamiento
      const avgEnergy = this.calculateAverage(workoutDays.map(d => d.energyLevel));

      // Rango para evidencia
      const minCal = Math.min(...caloriesArr);
      const maxCal = Math.max(...caloriesArr);

      // 7) Inconsistencia y energía baja → recommendation
      if (cv > 25 && avgEnergy < 6) {
        const insight: PersonalInsight = {
          id: this.generateInsightId(),
          type: 'recommendation',
          title: '⚠️ Tu ingesta calórica varía mucho',
          description: `Hay grandes variaciones en tu consumo calórico (${Math.round(avgCalories)}±${Math.round(stdDev)} kcal), y tu energía promedio es ${avgEnergy.toFixed(1)}/10.`,
          evidence: [
            `📊 ${daysCount} días analizados`,
            `📉 Variabilidad alta: ${cv.toFixed(1)}%`,
            `🔄 Rango: ${Math.round(minCal)}-${Math.round(maxCal)} kcal`,
            `⚡ Energía promedio: ${avgEnergy.toFixed(1)}/10`
          ],
          actionable: `Intenta mantener tu ingesta más estable, cerca de ${Math.round(avgCalories)} kcal los días de entrenamiento. La consistencia puede mejorar tu energía.`,
          confidence: 'medium',
          createdAt: new Date()
        };
        return insight;
      }

      // 8) Sin patrón claro que amerite insight
      return null;
    } catch (error) {
      console.error('[CorrelationInsightsService] analyzeCalorieConsistencyPattern error:', error);
      return null;
    }
  }

  // Genera un id simple para insights
  private generateInsightId(): string {
    try {
      // Acceso seguro y tipado a randomUUID sin usar 'any'
      type MaybeCrypto = { randomUUID?: () => string };
      const maybeCrypto: MaybeCrypto | undefined = (globalThis as unknown as { crypto?: MaybeCrypto }).crypto;
      const randomUUID = maybeCrypto?.randomUUID;
      if (typeof randomUUID === 'function') {
        return randomUUID();
      }
    } catch {
      // ignore
    }
    return `ins_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Guarda los insights en Firestore para que el chatbot pueda acceder
   */
  async saveInsightsToFirestore(userId: string, insights: PersonalInsight[]): Promise<void> {
    try {
      const auth = (await import('firebase/auth')).getAuth();
      const authUid = auth.currentUser?.uid;
      if (!authUid) {
        console.warn('⚠️ [saveInsightsToFirestore] No hay usuario autenticado; omitiendo escritura.');
        return;
      }
      if (authUid !== userId) {
        console.warn('⚠️ [saveInsightsToFirestore] Mismatch de UID. auth.uid != docId', { authUid, docId: userId });
        return;
      }

      const insightsData = insights.map(i => ({
        id: i.id,
        type: i.type,
        title: i.title,
        description: i.description,
        evidence: i.evidence,
        actionable: i.actionable,
        confidence: i.confidence,
        impactEstimated: i.impactEstimated,
        createdAt: i.createdAt.toISOString()
      }));

      const docRef = doc(db, 'user_insights', userId);
      await setDoc(docRef, {
        userId,
        insights: insightsData,
        lastUpdated: FsTimestamp.now(),
        version: 1
      });

      console.log(`✅ Insights guardados en Firestore para usuario ${userId} en doc: user_insights/${userId}`);
    } catch (err) {
      console.error('Error saving insights to Firestore:', err);
      console.error('Sugerencia: Verifica reglas para /user_insights/{userId} y que el docId coincida con auth.uid');
      // No lanzamos error para no romper el flujo
    }
  }

  /** Prepara un resumen con agregados para la función remota */
  private prepareDataForAI(data: CorrelationDataPoint[], profile: UserProfile): string {
    const summary = {
      userProfile: {
        weight: profile.weight,
        goal: profile.goal,
        experienceLevel: profile.experienceLevel,
        workoutsPerWeek: profile.workoutsPerWeek
      },
      historicalData: data.map(d => ({
        date: d.date,
        calories: Math.round(d.calories),
        protein: Math.round(d.protein),
        carbs: Math.round(d.carbs),
        fats: Math.round(d.fats),
        energyLevel: d.energyLevel,
        hadWorkout: d.hadWorkout,
        performanceScore: d.performanceScore
      })),
      aggregates: {
        avgCalories: Math.round(this.calculateAverage(data.map(d => d.calories))),
        avgProtein: Math.round(this.calculateAverage(data.map(d => d.protein))),
        avgCarbs: Math.round(this.calculateAverage(data.map(d => d.carbs))),
        avgEnergy: Math.round(this.calculateAverage(data.map(d => d.energyLevel)) * 10) / 10,
        daysWithWorkout: data.filter(d => d.hadWorkout).length,
        avgPerformance: Math.round(this.calculateAverage(data.filter(d => d.performanceScore).map(d => d.performanceScore!)))
      }
    };

    return JSON.stringify(summary, null, 2);
  }

  /** Llama a la función remota generateInsights */
  private async generateInsightsWithAI(dataJSON: string, profile: UserProfile): Promise<PersonalInsight[]> {
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../../3-acceso-datos/firebase/config');

      type CallableReq = { dataJSON: string; profile: UserProfile };
      type RawInsight = {
        id?: string;
        type?: string;
        confidence?: string;
        title?: string;
        description?: string;
        evidence?: unknown[];
        actionable?: string;
        impactEstimated?: string;
      };
      type CallableRes = { success: boolean; insights: RawInsight[]; count: number; userId: string };

      const generateInsightsFunc = httpsCallable<CallableReq, CallableRes>(functions, 'generateInsights');

      console.log('📡 Llamando a Firebase Function generateInsights...');
      const result = await generateInsightsFunc({ dataJSON, profile });
      console.log('✅ Insights recibidos:', (result.data as CallableRes).count);

      const data = result.data as CallableRes;
      if (!data?.success || !Array.isArray(data?.insights)) {
        console.warn('Firebase Function no retornó insights válidos');
        return [];
      }

      return data.insights.map((raw): PersonalInsight => ({
        id: typeof raw.id === 'string' ? raw.id : this.generateInsightId(),
        type: raw.type === 'achievement' ? 'recommendation' : (raw.type === 'pattern' || raw.type === 'recommendation' ? raw.type : 'recommendation'),
        title: String(raw.title ?? 'Insight sin título'),
        description: String(raw.description ?? ''),
        evidence: Array.isArray(raw.evidence) ? raw.evidence.map((e) => String(e)) : [],
        actionable: String(raw.actionable ?? 'Sigue monitoreando tus datos'),
        confidence: (raw.confidence === 'high' || raw.confidence === 'low') ? raw.confidence : 'medium',
        impactEstimated: (raw.impactEstimated === 'high' || raw.impactEstimated === 'low') ? raw.impactEstimated : 'medium',
        createdAt: new Date()
      }));
    } catch (error) {
      console.error('❌ Error calling Firebase Function generateInsights:', error);
      const err = error as { code?: string; message?: string };
      console.error('Error code:', err?.code);
      console.error('Error message:', err?.message);
      return [];
    }
  }

  /** Fallback: usa los análisis locales ya implementados */
  private getFallbackInsights(data: CorrelationDataPoint[]): PersonalInsight[] {
    const insights: PersonalInsight[] = [];

    const carbsEnergy = this.analyzeCarbsEnergyPatternSync(data);
    if (carbsEnergy) insights.push(carbsEnergy);

    const proteinRecovery = this.analyzeProteinRecoveryPatternSync(data);
    if (proteinRecovery) insights.push(proteinRecovery);

    const calorieConsistency = this.analyzeCalorieConsistencyPatternSync(data);
    if (calorieConsistency) insights.push(calorieConsistency);

    return insights;
  }

  /** Lee insights guardados previamente si existen */
  async getSavedInsights(userId: string): Promise<PersonalInsight[] | null> {
    try {
      const ref = doc(db, 'user_insights', userId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return null;
      const data = snap.data() as Record<string, unknown>;
      const arr = Array.isArray((data as { insights?: unknown[] }).insights) ? (data as { insights: unknown[] }).insights : [];
      const mapped: PersonalInsight[] = arr.map((raw) => ({
        id: String((raw as Record<string, unknown>).id ?? `ins_${Date.now()}`),
        type: ((raw as Record<string, unknown>).type === 'pattern' || (raw as Record<string, unknown>).type === 'recommendation')
          ? (raw as { type: 'pattern' | 'recommendation' }).type
          : 'recommendation',
        title: String((raw as Record<string, unknown>).title ?? 'Insight'),
        description: String((raw as Record<string, unknown>).description ?? ''),
        evidence: Array.isArray((raw as Record<string, unknown>).evidence)
          ? ((raw as { evidence: unknown[] }).evidence.map((e: unknown) => String(e)))
          : [],
        actionable: String((raw as Record<string, unknown>).actionable ?? ''),
        confidence: ((raw as Record<string, unknown>).confidence === 'high' || (raw as Record<string, unknown>).confidence === 'low')
          ? (raw as { confidence: 'high' | 'low' }).confidence
          : 'medium',
        impactEstimated: ((raw as Record<string, unknown>).impactEstimated === 'high' || (raw as Record<string, unknown>).impactEstimated === 'low')
          ? (raw as { impactEstimated: 'high' | 'low' }).impactEstimated
          : 'medium',
        createdAt: new Date(String((raw as Record<string, unknown>).createdAt ?? Date.now()))
      }));
      return mapped;
    } catch (e) {
      console.warn('[CorrelationInsightsService] getSavedInsights error:', e);
      return null;
    }
  }
}
