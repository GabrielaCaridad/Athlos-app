// Servicio para analizar correlaciones entre nutrición y rendimiento
// Requisitos: importar Timestamp (tipo), userFoodService y workoutService, definir interfaces y clase con métodos solicitados.

import type { Timestamp } from 'firebase/firestore';
import { Timestamp as FsTimestamp, setDoc, doc } from 'firebase/firestore';
import { userFoodService } from './foodDataService';
import { workoutService } from './firestoreService';
import { db } from '../../3-acceso-datos/firebase/config';

// Interfaces públicas
export interface PersonalInsight {
  id: string;
  type: 'pattern' | 'recommendation' | 'achievement';
  title: string;
  description: string;
  evidence: string[];
  actionable: string;
  confidence: 'high' | 'medium' | 'low';
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

// Utilidad local: formateo de fecha a YYYY-MM-DD
function formatDateYYYYMMDD(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Utilidad local: convertir Timestamp (Firestore) a Date de JS de forma segura
function timestampToDate(ts?: Timestamp): Date | undefined {
  try {
    return ts?.toDate?.();
  } catch {
    return undefined;
  }
}

export class CorrelationInsightsService {
  /**
   * Analiza patrones personales del usuario correlacionando alimentación y entrenamientos.
   * Por ahora retorna un array vacío (implementación futura de insights).
   */
  async analyzeUserPatterns(userId: string, daysToAnalyze: number = 14): Promise<PersonalInsight[]> {
    try {
      const insights: PersonalInsight[] = [];
      const data = await this.getCombinedData(userId, daysToAnalyze);

      // Analizar patrón carbohidratos vs energía
      const carbsEnergy = await this.analyzeCarbsEnergyPattern(data);
      if (carbsEnergy) insights.push(carbsEnergy);

      // Analizar patrón proteína vs recuperación (energía del día siguiente)
      const proteinRecovery = await this.analyzeProteinRecoveryPattern(data);
      if (proteinRecovery) insights.push(proteinRecovery);

      // Analizar consistencia calórica y su relación con energía
      const calorieConsistency = await this.analyzeCalorieConsistencyPattern(data);
      if (calorieConsistency) insights.push(calorieConsistency);

      // Guardar insights en Firestore para el chatbot (colección user_insights)
      if (insights.length > 0) {
        await this.saveInsightsToFirestore(userId, insights);
      }
      return insights;
    } catch (error) {
      console.error('[CorrelationInsightsService] analyzeUserPatterns error:', error);
      return [];
    }
  }

  /**
   * Combina datos de nutrición y entrenamientos por día para los últimos N días.
   */
  private async getCombinedData(userId: string, days: number): Promise<CorrelationDataPoint[]> {
    try {
      if (days <= 0) return [];

      // Construir la lista de fechas (de más antiguo a más reciente)
      const today = new Date();
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      const dates: string[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() - i);
        dates.push(formatDateYYYYMMDD(d));
      }

      // Para cada fecha, obtener datos de alimentos y entrenamientos y consolidar
      const points: CorrelationDataPoint[] = [];
      for (const date of dates) {
        // Cargar en paralelo
        const [foods, workouts] = await Promise.all([
          userFoodService.getUserFoodsByDate(userId, date),
          workoutService.getWorkoutsByDate(userId, date)
        ]);

        // Agregados nutricionales del día
        const calories = foods.reduce((sum, f) => sum + (f.calories || 0), 0);
        const protein = foods.reduce((sum, f) => sum + (f.protein || 0), 0);
        const carbs = foods.reduce((sum, f) => sum + (f.carbs || 0), 0);
        const fats = foods.reduce((sum, f) => sum + (f.fats || 0), 0);
        const fiber = foods.reduce((sum, f) => sum + (f.fiber || 0), 0);

        // Entrenamientos del día
        const hadWorkout = workouts.length > 0;
        const workoutDuration = hadWorkout
          ? workouts.reduce((sum, w) => sum + (w.duration || 0), 0)
          : undefined;

        // Promedio de energía del día (prioriza postEnergyLevel, luego pre)
        const energySamples = workouts
          .map(w => (typeof w.postEnergyLevel === 'number' ? w.postEnergyLevel : w.preEnergyLevel))
          .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
        const energyLevel = energySamples.length > 0
          ? Math.max(1, Math.min(10, Math.round(this.calculateAverage(energySamples))))
          : 5; // neutral cuando no hay workouts

        // Score de performance (promedio de los disponibles)
        const perfSamples = workouts
          .map(w => w.performanceScore)
          .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
        const performanceScore = perfSamples.length > 0
          ? Math.round(this.calculateAverage(perfSamples))
          : undefined;

        // Uso de Timestamp (para asegurar el import tipado requerido y orden estable cuando sea útil)
        workouts.sort((a, b) => {
          const ta = timestampToDate(a.createdAt as Timestamp | undefined)?.getTime() || 0;
          const tb = timestampToDate(b.createdAt as Timestamp | undefined)?.getTime() || 0;
          return tb - ta;
        });

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

  // Detecta patrón de relación entre carbohidratos consumidos y nivel de energía reportado en días con entrenamiento
  private async analyzeCarbsEnergyPattern(data: CorrelationDataPoint[]): Promise<PersonalInsight | null> {
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
  private async analyzeProteinRecoveryPattern(data: CorrelationDataPoint[]): Promise<PersonalInsight | null> {
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

  // Calcula desviación estándar de un conjunto de números
  private calculateStdDev(numbers: number[], mean?: number): number {
    if (!numbers || numbers.length === 0) return 0;
    const avg = typeof mean === 'number' ? mean : this.calculateAverage(numbers);
    const variance = this.calculateAverage(numbers.map(n => (n - avg) ** 2));
    return Math.sqrt(variance);
  }

  // Detecta consistencia calórica en días de entrenamiento y su relación con energía
  private async analyzeCalorieConsistencyPattern(data: CorrelationDataPoint[]): Promise<PersonalInsight | null> {
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

      // 6) Alta consistencia y buena energía → achievement
      if (cv < 15 && avgEnergy >= 7) {
        const insight: PersonalInsight = {
          id: this.generateInsightId(),
          type: 'achievement',
          title: '🎯 ¡Excelente consistencia nutricional!',
          description: `Mantienes una ingesta calórica muy consistente (${Math.round(avgCalories)}±${Math.round(stdDev)} kcal) en días de entrenamiento, y tu energía promedio es alta (${avgEnergy.toFixed(1)}/10).`,
          evidence: [
            `📊 ${daysCount} días analizados`,
            `🎯 Promedio: ${Math.round(avgCalories)} kcal/día`,
            `📈 Variabilidad: ${cv.toFixed(1)}% (muy consistente)`,
            `⚡ Energía promedio: ${avgEnergy.toFixed(1)}/10`
          ],
          actionable: `Sigue así. Tu consistencia nutricional está ayudando a mantener tu energía estable.`,
          confidence: 'high',
          createdAt: new Date()
        };
        return insight;
      }

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
      const insightsData = insights.map(i => ({
        id: i.id,
        type: i.type,
        title: i.title,
        description: i.description,
        evidence: i.evidence,
        actionable: i.actionable,
        confidence: i.confidence,
        createdAt: i.createdAt.toISOString()
      }));

      await setDoc(doc(db, 'user_insights', userId), {
        userId,
        insights: insightsData,
        lastUpdated: FsTimestamp.now(),
        version: 1
      });

      console.log(`✅ Insights guardados en Firestore para usuario ${userId}`);
    } catch (err) {
      console.error('Error saving insights to Firestore:', err);
      // No lanzamos error para no romper el flujo
    }
  }
}

// Export por defecto opcional si se prefiere instancia única
export const correlationInsightsService = new CorrelationInsightsService();
