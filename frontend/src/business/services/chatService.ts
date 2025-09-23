// OpenAI API Service - Preparado para integración futura
import { FoodEntry, WorkoutSession } from './firestoreService';

export interface UserData {
  foods: FoodEntry[];
  workouts: WorkoutSession[];
  wellness?: { date: string; mood: number }[];

  totalCaloriesToday: number;
  lastWorkout?: WorkoutSession;
  nextWorkout?: WorkoutSession;
}

export interface ContextualResponse {
  message: string;
  type: 'recommendation' | 'achievement' | 'normal';
  data?: Record<string, unknown>;
}

export const getContextualResponse = async (
  question: string, 
  userData: UserData
): Promise<ContextualResponse> => {
  // TODO: Integrar OpenAI API
  // Por ahora respuestas predefinidas con datos del usuario
  
  const input = question.toLowerCase();
  
  // Análisis contextual basado en datos del usuario
  const { totalCaloriesToday, foods, workouts } = userData;
  
  // Respuestas sobre nutrición con datos reales
  if (input.includes('comida') || input.includes('comer') || input.includes('nutrición')) {
    if (totalCaloriesToday < 1200) {
      return {
        message: `Veo que hoy has consumido ${totalCaloriesToday} calorías. Esto está por debajo de lo recomendado. Te sugiero añadir una comida rica en proteínas y carbohidratos complejos.`,
        type: 'recommendation',
        data: { caloriesNeeded: 1800 - totalCaloriesToday }
      };
    } else if (totalCaloriesToday > 2500) {
      return {
        message: `Has registrado ${totalCaloriesToday} calorías hoy. Si tu objetivo es mantener peso, considera reducir las porciones en la próxima comida o añadir más actividad física.`,
        type: 'recommendation',
        data: { caloriesOver: totalCaloriesToday - 2000 }
      };
    } else {
      return {
        message: `Perfecto, llevas ${totalCaloriesToday} calorías registradas hoy. Estás en un rango saludable. ¿Qué tal si añades más verduras a tu próxima comida?`,
        type: 'normal'
      };
    }
  }
  
  // Respuestas sobre entrenamientos con datos reales
  if (input.includes('rutina') || input.includes('ejercicio') || input.includes('entrenar')) {
    const workoutsThisWeek = workouts.filter(w => {
      const workoutDate = new Date(w.createdAt.toDate());
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return workoutDate > weekAgo;
    }).length;
    
    if (workoutsThisWeek === 0) {
      return {
        message: "No veo entrenamientos registrados esta semana. Te sugiero empezar con una rutina suave de 20 minutos. ¿Qué tal un entrenamiento de cuerpo completo?",
        type: 'recommendation',
        data: { suggestion: 'light_workout' }
      };
    } else if (workoutsThisWeek >= 5) {
      return {
        message: `¡Increíble! Has entrenado ${workoutsThisWeek} veces esta semana. Tu consistencia es admirable. Considera tomar un día de descanso activo para recuperación.`,
        type: 'achievement',
        data: { workoutsCount: workoutsThisWeek }
      };
    } else {
      return {
        message: `Llevas ${workoutsThisWeek} entrenamientos esta semana. Basándome en tu progreso, te sugiero aumentar el peso en un 5% en tus ejercicios principales.`,
        type: 'recommendation',
        data: { currentWorkouts: workoutsThisWeek }
      };
    }
  }
  
  // Respuestas sobre progreso general
  if (input.includes('progreso') || input.includes('avance')) {
    const wellnessArr = userData.wellness ?? [];
    const avgWellness = wellnessArr.length > 0 ? wellnessArr.slice(0, 7).reduce((sum, w) => sum + w.mood, 0) / Math.min(wellnessArr.length, 7) : 0;

    return {
      message: `Tu progreso es sólido: ${workouts.length} entrenamientos registrados, ${foods.length} comidas registradas, y un bienestar promedio de ${avgWellness.toFixed(1)}/5. ¡Sigue así!`,
      type: 'achievement',
      data: {
        workouts: workouts.length,
        foods: foods.length,
        wellness: avgWellness
      }
    };
  }
  
  // Respuesta por defecto contextualizada
  return {
    message: `Basándome en tu actividad reciente (${totalCaloriesToday} kcal hoy, ${workouts.length} entrenamientos totales), estás progresando bien. ¿En qué puedo ayudarte específicamente?`,
    type: 'normal',
    data: { summary: JSON.stringify(userData) }
  };
};

// Preparar estructura para OpenAI cuando se integre
export const prepareOpenAIContext = (userData: UserData) => {
  return {
    userProfile: {
      totalWorkouts: userData.workouts.length,
      avgCalories: userData.foods.reduce((sum, f) => sum + f.calories, 0) / userData.foods.length || 0,
      
      consistency: userData.workouts.length > 0 ? 'good' : 'needs_improvement'
    },
    recentActivity: {
      lastWorkout: userData.lastWorkout,
      todayCalories: userData.totalCaloriesToday,
      recentFoods: userData.foods.slice(0, 3)
    }
  };
};