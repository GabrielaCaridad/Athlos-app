// Firestore services: user profiles, foods, workouts
import { 
  collection, // Para referenciar colecciones
  addDoc, // Para agregar documentos
  updateDoc, // Para actualizar documentos
  deleteDoc, // Para eliminar documentos
  doc, // Para referenciar documentos específicos
  orderBy, // Para ordenar resultados
  getDocs, // Para obtener múltiples documentos
  query, // Para crear consultas
  where, // Para filtros en consultas
  Timestamp // Para manejar fechas de Firebase
} from 'firebase/firestore';
import { db } from './config';
import { calculateAge as calcAgeUtil } from '../../utils/date';

// User profile model
export interface UserProfile {
  id?: string; // ID del documento (opcional, se asigna automáticamente)
  userId: string; // ID del usuario de Firebase Auth (para vincular)
  displayName: string; // Nombre para mostrar
  email: string; // Correo electrónico
  goals: string[]; // Array de objetivos del usuario (ej: "perder peso", "ganar músculo")
  level: number; // Nivel actual del usuario (sistema de gamificación)
  xp: number; // Puntos de experiencia acumulados
  createdAt: Timestamp; // Fecha de creación del perfil

  // 🆕 Datos físicos para personalización
  dateOfBirth?: string; // YYYY-MM-DD format
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  currentWeight?: number; // kg
  height?: number; // cm

  // 🆕 Objetivos del usuario
  primaryGoal?: 'lose_weight' | 'maintain_weight' | 'gain_muscle' | 'improve_performance' | 'general_health';
  targetWeight?: number; // kg, opcional
  activityLevel?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  workoutsPerWeek?: number; // 1-7 días

  // 🆕 Nutrición calculada automáticamente
  dailyCalorieTarget?: number; // kcal calculadas según objetivo
  macroTargets?: {
    protein: number; // gramos
    carbs: number;
    fats: number;
  };

  // 🆕 Preferencias
  dietaryRestrictions?: string[]; // ej: ["vegetariano", "sin gluten"]
  preferredWorkoutTime?: 'morning' | 'afternoon' | 'evening';

  // 🆕 Metadatos
  updatedAt?: Timestamp; // Timestamp de última actualización
}

// User profile CRUD
export const userService = {
  /**
   * Crea un nuevo perfil de usuario en Firestore
   * 
   * @param userId - ID del usuario de Firebase Auth
   * @param profileData - Datos del perfil (sin ID ni fecha de creación)
   * @returns Promise<string> - ID del documento creado
   */
  async createUserProfile(userId: string, profileData: Omit<UserProfile, 'id' | 'userId' | 'createdAt'>) {
    try {
      const docRef = await addDoc(collection(db, 'users'), {
        ...profileData,
        userId,
        createdAt: Timestamp.now()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating user profile:', error);
      throw error;
    }
  },

  /**
   * Calcula la edad a partir de una fecha de nacimiento (YYYY-MM-DD)
   */
  calculateAge(dateOfBirth?: string): number {
    return calcAgeUtil(dateOfBirth, 0);
  },

  /**
   * Calcula BMR usando Mifflin-St Jeor
   */
  calculateBMR(weightKg: number, heightCm: number, age: number, gender: NonNullable<UserProfile['gender']>): number {
    const base = 10 * (weightKg || 0) + 6.25 * (heightCm || 0) - 5 * (age || 0);
    const genderOffset = gender === 'male' ? 5 : gender === 'female' ? -161 : 0;
    return Math.max(0, base + genderOffset);
  },

  /**
   * Aplica multiplicador de actividad para obtener TDEE
   */
  calculateTDEE(bmr: number, activityLevel: NonNullable<UserProfile['activityLevel']>): number {
    const activityMultipliers: Record<NonNullable<UserProfile['activityLevel']>, number> = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };
    const mult = activityMultipliers[activityLevel] ?? 1.55;
    return Math.max(0, bmr * mult);
  },

  /**
   * Ajusta calorías objetivo según el objetivo principal
   */
  calculateCalorieTarget(tdee: number, primaryGoal: NonNullable<UserProfile['primaryGoal']>): number {
    const goalAdjust: Record<NonNullable<UserProfile['primaryGoal']>, number> = {
      lose_weight: -0.15,
      maintain_weight: 0,
      gain_muscle: 0.12,
      improve_performance: 0.05,
      general_health: 0
    };
    const adjust = goalAdjust[primaryGoal] ?? 0;
    return Math.max(1200, Math.round(tdee * (1 + adjust)));
  },

  /**
   * Calcula distribución de macronutrientes en gramos
   * Si no se proporciona peso, usa proporciones sobre calorías como aproximación.
   */
  calculateMacros(
    dailyCalories: number,
    primaryGoal: NonNullable<UserProfile['primaryGoal']>,
    weightKg?: number
  ): { protein: number; carbs: number; fats: number } {
    // Si hay peso, aproximar proteína por kg según objetivo (alineado a initializePersonalization)
    const proteinPerKg: Record<NonNullable<UserProfile['primaryGoal']>, number> = {
      lose_weight: 2.0,
      maintain_weight: 1.6,
      gain_muscle: 1.8,
      improve_performance: 1.7,
      general_health: 1.6
    };

    let proteinG = 0;
    if (typeof weightKg === 'number' && weightKg > 0) {
      proteinG = Math.round(weightKg * (proteinPerKg[primaryGoal] ?? 1.6));
    } else {
      // fallback por porcentaje cuando no hay peso
      const pct = primaryGoal === 'lose_weight' || primaryGoal === 'gain_muscle' ? 0.25 : primaryGoal === 'improve_performance' ? 0.22 : 0.20;
      proteinG = Math.round((dailyCalories * pct) / 4);
    }

    // Grasas por porcentaje según objetivo
    const fatPctByGoal: Record<NonNullable<UserProfile['primaryGoal']>, number> = {
      lose_weight: 0.30,
      maintain_weight: 0.30,
      gain_muscle: 0.25,
      improve_performance: 0.25,
      general_health: 0.30
    };
    const fatCalories = dailyCalories * (fatPctByGoal[primaryGoal] ?? 0.30);
    const fatsG = Math.round(fatCalories / 9);

    const proteinCalories = proteinG * 4;
    const remainingCalories = Math.max(0, dailyCalories - (proteinCalories + fatCalories));
    const carbsG = Math.round(remainingCalories / 4);

    return { protein: Math.max(0, proteinG), carbs: Math.max(0, carbsG), fats: Math.max(0, fatsG) };
  },

  /**
   * Actualiza un perfil de usuario existente
   * 
   * @param userId - ID del usuario de Firebase Auth
   * @param updates - Datos parciales a actualizar
   */
  async updateUserProfile(userId: string, updates: Partial<UserProfile>) {
    try {
      const q = query(collection(db, 'users'), where('userId', '==', userId));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        await updateDoc(userDoc.ref, updates);
      }
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  },

  /**
   * Obtiene el perfil de un usuario específico
   * 
   * @param userId - ID del usuario de Firebase Auth
   * @returns Promise<UserProfile | null> - Perfil del usuario o null si no existe
   */
  async getUserProfile(userId: string) {
    try {
      const q = query(collection(db, 'users'), where('userId', '==', userId));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        return {
          id: userDoc.id,
          ...userDoc.data()
        } as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('Error getting user profile:', error);
      throw error;
    }
  },

  /**
   * Calcula el IMC (Índice de Masa Corporal) y su categoría básica
   */
  calculateBMI(heightCm: number, weightKg: number): { bmi: number; category: 'underweight' | 'normal' | 'overweight' | 'obese' } {
    const h = Math.max(0, heightCm) / 100; // a metros
    const w = Math.max(0, weightKg);
    const bmi = h > 0 ? +(w / (h * h)).toFixed(1) : 0;
    let category: 'underweight' | 'normal' | 'overweight' | 'obese' = 'normal';
    if (bmi < 18.5) category = 'underweight';
    else if (bmi < 25) category = 'normal';
    else if (bmi < 30) category = 'overweight';
    else category = 'obese';
    return { bmi, category };
  },

  /**
   * Inicializa/actualiza los campos de personalización del perfil
   * - Calcula TDEE usando Mifflin-St Jeor + multiplicador de actividad
   * - Ajusta según objetivo (déficit/superávit)
   * - Calcula macros (proteína/fat/carbs)
   * - Actualiza dailyCalorieTarget, macroTargets y updatedAt
   * Devuelve los valores computados para uso inmediato en UI
   */
  async initializePersonalization(
    userId: string,
    overrides?: Partial<UserProfile>
  ): Promise<{ dailyCalorieTarget: number; macroTargets: { protein: number; carbs: number; fats: number } }> {
    const profile = (await this.getUserProfile(userId)) || ({} as UserProfile);
    // fusionar con overrides sin eliminar datos anteriores
    const merged: Partial<UserProfile> = { ...profile, ...overrides };

    // Datos base con defaults razonables
    const gender = merged.gender || 'other';
    const height = typeof merged.height === 'number' && merged.height > 0 ? merged.height : 170; // cm
    const weight = typeof merged.currentWeight === 'number' && merged.currentWeight > 0 ? merged.currentWeight : 70; // kg
    const dob = merged.dateOfBirth; // YYYY-MM-DD
    const activity = merged.activityLevel || 'moderate';
    const goal = merged.primaryGoal || 'general_health';

    // Edad (util compartida)
    const age = calcAgeUtil(dob, 30);

    // BMR (Mifflin-St Jeor)
    // Hombre: BMR = 10*kg + 6.25*cm - 5*edad + 5
    // Mujer:  BMR = 10*kg + 6.25*cm - 5*edad - 161
    // Otros: offset 0 como neutral
    const base = 10 * weight + 6.25 * height - 5 * age;
    const genderOffset = gender === 'male' ? 5 : gender === 'female' ? -161 : 0;
    const bmr = base + genderOffset;

    // Multiplicador de actividad
    const activityMultipliers: Record<NonNullable<UserProfile['activityLevel']>, number> = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };
    const multiplier = activityMultipliers[activity] ?? 1.55;
    const tdee = bmr * multiplier;

    // Ajuste por objetivo
    // lose_weight: -15%, maintain/general_health: 0%, gain_muscle: +12%, improve_performance: +5%
    const goalAdjust: Record<NonNullable<UserProfile['primaryGoal']>, number> = {
      lose_weight: -0.15,
      maintain_weight: 0,
      gain_muscle: 0.12,
      improve_performance: 0.05,
      general_health: 0
    };
    const adjust = goalAdjust[goal] ?? 0;
    const dailyCalorieTarget = Math.max(1200, Math.round(tdee * (1 + adjust))); // clamp mínimo razonable

    // Macros
    // Proteína por kg según objetivo (g/kg)
    const proteinPerKg: Record<NonNullable<UserProfile['primaryGoal']>, number> = {
      lose_weight: 2.0,
      maintain_weight: 1.6,
      gain_muscle: 1.8,
      improve_performance: 1.7,
      general_health: 1.6
    };
    let proteinG = Math.round(weight * (proteinPerKg[goal] ?? 1.6));
    // Fat porcentaje
    const fatPctByGoal: Record<NonNullable<UserProfile['primaryGoal']>, number> = {
      lose_weight: 0.30,
      maintain_weight: 0.30,
      gain_muscle: 0.25,
      improve_performance: 0.25,
      general_health: 0.30
    };
    const fatCalories = dailyCalorieTarget * (fatPctByGoal[goal] ?? 0.30);
  const fatsG = Math.round(fatCalories / 9);

    // Si no hay weight confiable, reparte proteína como 20% de calorías
    if (!merged.currentWeight || merged.currentWeight <= 0) {
      const proteinCalories = dailyCalorieTarget * 0.20;
      proteinG = Math.round(proteinCalories / 4);
    }

    const proteinCalories = proteinG * 4;
    const remainingCalories = Math.max(0, dailyCalorieTarget - (proteinCalories + fatCalories));
    const carbsG = Math.round(remainingCalories / 4);

    const macroTargets = {
      protein: proteinG,
      carbs: Math.max(0, carbsG),
      fats: Math.max(0, fatsG)
    };

    // Persistir solo los campos calculados y timestamp de actualización, más overrides explícitos
    await this.updateUserProfile(userId, {
      ...overrides,
      dailyCalorieTarget,
      macroTargets,
      updatedAt: Timestamp.now()
    });

    return { dailyCalorieTarget, macroTargets };
  }
};

export interface FoodEntry {
  id?: string;
  userId: string;
  name: string;
  calories: number;
  serving: string;
  date: string;
  createdAt: Timestamp;
}

/* Interfaz para los datos de entrada */
interface CreateFoodData {
  name: string;
  calories: number;
  serving: string;
  date: string;
}

export const foodService = {
  /* Agregar un nuevo alimento */
  async addFood(userId: string, foodData: CreateFoodData): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, 'foods'), {
        ...foodData,
        userId,
        createdAt: Timestamp.now()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error adding food:', error);
      throw error;
    }
  },

  /* Obtener alimentos por fecha*/
  async getFoodsByDate(userId: string, date: string): Promise<FoodEntry[]> {
    try {
      const q = query(
        collection(db, 'foods'),
        where('userId', '==', userId),
        where('date', '==', date),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FoodEntry[];
    } catch (error) {
      console.error('Error getting foods by date:', error);
      throw error;
    }
  },

  /*Actualizar un alimento*/
  async updateFood(foodId: string, updates: Partial<CreateFoodData>): Promise<void> {
    try {
      const foodRef = doc(db, 'foods', foodId);
      await updateDoc(foodRef, updates);
    } catch (error) {
      console.error('Error updating food:', error);
      throw error;
    }
  },

  /*Eliminar un alimento*/
  async deleteFood(foodId: string): Promise<void> {
    try {
      const foodRef = doc(db, 'foods', foodId);
      await deleteDoc(foodRef);
    } catch (error) {
      console.error('Error deleting food:', error);
      throw error;
    }
  },

  /* Obtener total de calorías del día */
  async getDailyCalories(userId: string, date: string): Promise<number> {
    try {
      const foods = await this.getFoodsByDate(userId, date);
      return foods.reduce((total, food) => total + food.calories, 0);
    } catch (error) {
      console.error('Error getting daily calories:', error);
      throw error;
    }
  }
};

// Workouts

export interface Exercise {
  id: string;
  name: string;
  sets: number;
  reps: number;
  weight: number;
  completed: boolean;
  restTime?: number; // tiempo de descanso en segundos
  notes?: string;
  setsDetail?: { reps: number; weight: number; done?: boolean }[];
  caloriesBurned?: number;
  totalWeightLifted?: number;
}

export interface WorkoutSession {
  id?: string;
  userId: string;
  name: string;
  duration: number; // en segundos
  isActive: boolean;
  preEnergyLevel?: number; // 1-10 energía antes
  postEnergyLevel?: number; // 1-10 energía después
  exercises: Exercise[];
  createdAt: Timestamp;
  completedAt?: Timestamp;
  totalCaloriesBurned?: number;
  totalWeightLifted?: number;
  // Nuevos campos de performance
  performanceScore?: number;  // 0-100
  volumeLifted?: number;      // kg totales levantados
  completionRate?: number;    // % ejercicios completados
}

export const workoutService = {
  /** Helper: clave de día LOCAL (YYYY-MM-DD) */
  dayKeyLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },
  /** Helper: normaliza una fecha Firebase/Date a Date y toma completedAt si existe */
  getEffectiveDate(w: WorkoutSession): Date | null {
    const d = (w.completedAt?.toDate?.() as Date | undefined) || (w.createdAt?.toDate?.() as Date | undefined);
    return d ?? null;
  },
  
  /**
   * Calcula el Performance Score de un entrenamiento (0-100)
   * Nuevo algoritmo: Completitud (40) + Intensidad (30) + RPE (30)
   * - Completitud: ejercicios completados / totales * 40
   * - Intensidad: promedio de (pesoPromedio/pesoObjetivo) por ejercicio completado, cap 1.5 -> * 30
   * - RPE: basado en caída de energía (pre vs post)
   */
  calculatePerformanceScore(workout: WorkoutSession): number {
    // 1) Completitud (40)
    const ejerciciosTotales = workout.exercises.length;
    const ejerciciosCompletadosArr = workout.exercises.filter(ex => !!ex.completed);
    const ejerciciosCompletados = ejerciciosCompletadosArr.length;
    const puntosCompletitud = ejerciciosTotales > 0 ? (ejerciciosCompletados / ejerciciosTotales) * 40 : 0;

    // 2) Intensidad (30)
    let sumaIntensidad = 0;
    for (const ejercicio of ejerciciosCompletadosArr) {
      if (ejercicio.setsDetail && ejercicio.setsDetail.length > 0) {
        const setsCompletados = ejercicio.setsDetail.filter(s => !!s.done);
        if (setsCompletados.length > 0) {
          const pesoPromedio = setsCompletados.reduce((sum, s) => sum + (s.weight || 0), 0) / setsCompletados.length;
          const pesoObjetivo = (typeof ejercicio.weight === 'number' && ejercicio.weight > 0) ? ejercicio.weight : pesoPromedio || 0;
          const ratio = pesoObjetivo > 0 ? (pesoPromedio / pesoObjetivo) : 1;
          sumaIntensidad += Math.min(ratio, 1.5);
        } else {
          sumaIntensidad += 0;
        }
      } else {
        // Sin setsDetail: considerar intensidad base 1.0 si el ejercicio se marcó como completado
        sumaIntensidad += 1.0;
      }
    }
    const puntosIntensidad = ejerciciosCompletados > 0 ? (sumaIntensidad / ejerciciosCompletados) * 30 : 0;

    // 3) RPE (30) basado en caída de energía
    const energiaPre = typeof workout.preEnergyLevel === 'number' ? workout.preEnergyLevel : 5;
    const energiaPost = typeof workout.postEnergyLevel === 'number' ? workout.postEnergyLevel : 5;
    const caidaEnergia = energiaPre - energiaPost;
    const rpe = Math.abs(caidaEnergia);
    let puntosRPE = 10;
    if (rpe >= 6 && rpe <= 8) {
      puntosRPE = 30;
    } else if (rpe >= 4 && rpe <= 9) {
      puntosRPE = 20;
    }

    const scoreFinal = Math.round(Math.min(puntosCompletitud + puntosIntensidad + puntosRPE, 100));
    return scoreFinal;
  },

  /**
   * Obtiene el promedio histórico de volumen levantado del usuario
   */
  async getUserHistoricalAverageVolume(userId: string): Promise<number> {
    try {
      const workouts = await this.getUserWorkouts(userId);
      const completedWorkouts = workouts.filter(w => !w.isActive && (typeof w.volumeLifted === 'number'));
      if (completedWorkouts.length === 0) return 0;
      const totalVolume = completedWorkouts.reduce((sum, w) => sum + (w.volumeLifted || 0), 0);
      return totalVolume / completedWorkouts.length;
    } catch (error) {
      console.error('Error getting historical average:', error);
      return 0;
    }
  },
  /**
   * Crear una nueva sesión de entrenamiento
   */
  async createWorkout(userId: string, workoutData: Omit<WorkoutSession, 'id' | 'userId' | 'createdAt'>) {
    try {
      const docRef = await addDoc(collection(db, 'workouts'), {
        ...workoutData,
        userId,
        createdAt: Timestamp.now()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating workout:', error);
      throw error;
    }
  },

  /**
   * Actualizar una sesión de entrenamiento existente
   */
  async updateWorkout(workoutId: string, updates: Partial<WorkoutSession>) {
    try {
      const workoutRef = doc(db, 'workouts', workoutId);
      await updateDoc(workoutRef, updates);
    } catch (error) {
      console.error('Error updating workout:', error);
      throw error;
    }
  },

  /**
   * Finalizar un entrenamiento con cálculo de performance
   */
  async finalizeWorkout(workoutId: string, userId: string, postEnergyLevel: number): Promise<void> {
    try {
      const workouts = await this.getUserWorkouts(userId);
      const workout = workouts.find(w => w.id === workoutId);
      if (!workout) throw new Error('Workout not found');

      // Volumen total
      const volumeLifted = workout.exercises.reduce((sum, ex) => {
        if (ex.setsDetail && ex.setsDetail.length > 0) {
          return sum + ex.setsDetail.reduce((setSum, set) => setSum + (set.reps * set.weight), 0);
        }
        return sum + (ex.sets * ex.reps * ex.weight);
      }, 0);

      // Completion rate
      const completionRate = workout.exercises.length > 0
        ? workout.exercises.filter(ex => ex.completed).length / workout.exercises.length
        : 0;

  // Performance score (nuevo algoritmo sin dependencia histórica)
  const performanceScore = this.calculatePerformanceScore({ ...workout, postEnergyLevel });

      await this.updateWorkout(workoutId, {
        isActive: false,
        completedAt: Timestamp.fromDate(new Date()),
        postEnergyLevel,
        performanceScore,
        volumeLifted,
        completionRate
      });
    } catch (error) {
      console.error('Error finalizing workout:', error);
      throw error;
    }
  },

  /**
   * Recalcula opcionalmente los Performance Scores de todos los workouts del usuario
   * Útil como migración si hay datos antiguos inconsistentes.
   */
  async recalculateAllPerformanceScores(userId: string): Promise<{ updated: number }> {
    try {
      const workouts = await this.getUserWorkouts(userId);
      let updated = 0;
      for (const w of workouts) {
        // Solo procesar sesiones no activas (finalizadas) para evitar interferir con sesiones en curso
        if (w.isActive) continue;
        const performanceScore = this.calculatePerformanceScore(w);
        const volumeLifted = (w.exercises || []).reduce((sum, ex) => {
          if (ex.setsDetail && ex.setsDetail.length > 0) {
            return sum + ex.setsDetail.reduce((setSum, set) => setSum + ((set.reps || 0) * (set.weight || 0)), 0);
          }
          return sum + ((ex.sets || 0) * (ex.reps || 0) * (ex.weight || 0));
        }, 0);
        const completionRate = (w.exercises?.length || 0) > 0
          ? (w.exercises.filter(ex => !!ex.completed).length / w.exercises.length)
          : 0;
        await this.updateWorkout(w.id!, {
          performanceScore,
          volumeLifted,
          completionRate
        });
        updated += 1;
      }
      return { updated };
    } catch (e) {
      console.error('Error recalculating performance scores:', e);
      throw e;
    }
  },

  /**
   * Obtener entrenamientos por fecha
   */
  async getWorkoutsByDate(userId: string, date: string): Promise<WorkoutSession[]> {
    try {
      const q = query(
        collection(db, 'workouts'),
        where('userId', '==', userId),
        where('createdAt', '>=', Timestamp.fromDate(new Date(date + 'T00:00:00.000Z'))),
        where('createdAt', '<=', Timestamp.fromDate(new Date(date + 'T23:59:59.999Z'))),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as WorkoutSession[];
    } catch (err: unknown) {
      const msg = (err as { message?: string; code?: string })?.message || '';
      const code = (err as { code?: string })?.code || '';
      if (code === 'failed-precondition' || msg.toLowerCase().includes('requires an index')) {
        // Fallback sin orderBy y con filtros mínimos para evitar índice compuesto
        const q2 = query(
          collection(db, 'workouts'),
          where('userId', '==', userId)
        );
        const qs2 = await getDocs(q2);
        const all = qs2.docs.map(d => ({ id: d.id, ...d.data() })) as WorkoutSession[];
        const start = new Date(date + 'T00:00:00.000Z');
        const end = new Date(date + 'T23:59:59.999Z');
        return all.filter(w => {
          const created = w.createdAt?.toDate?.() as Date | undefined;
          return created && created >= start && created <= end;
        }).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      }
      console.error('Error getting workouts by date:', err);
      throw err;
    }
  },

  /**
   * Obtener todos los entrenamientos del usuario
   */
  async getUserWorkouts(userId: string): Promise<WorkoutSession[]> {
    try {
      const q = query(
        collection(db, 'workouts'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as WorkoutSession[];
    } catch (err: unknown) {
      const msg = (err as { message?: string; code?: string })?.message || '';
      const code = (err as { code?: string })?.code || '';
      if (code === 'failed-precondition' || msg.toLowerCase().includes('requires an index')) {
        // Fallback sin orderBy mientras creamos el índice
        const q2 = query(
          collection(db, 'workouts'),
          where('userId', '==', userId)
        );
        const qs2 = await getDocs(q2);
        const all = qs2.docs.map(d => ({ id: d.id, ...d.data() })) as WorkoutSession[];
        return all.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      }
      console.error('Error getting user workouts:', err);
      throw err;
    }
  },

  /**
   * Eliminar un entrenamiento
   */
  async deleteWorkout(workoutId: string): Promise<void> {
    try {
      const workoutRef = doc(db, 'workouts', workoutId);
      await deleteDoc(workoutRef);
    } catch (error) {
      console.error('Error deleting workout:', error);
      throw error;
    }
  },

  /**
   * Obtener estadísticas semanales
   */
  async getWeeklyStats(userId: string): Promise<{
    totalDuration: number;
    totalWorkouts: number;
    avgEnergyLevel: number;
    totalCalories: number;
  }> {
    try {
      // Traer entrenos del usuario (ordenados desc) y filtrar por la semana CALENDARIO actual (Domingo 00:00 -> Domingo siguiente)
      const all = await this.getUserWorkouts(userId);
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(today.getDate() - today.getDay()); // Domingo
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);

      const workouts = all.filter(w => {
        if (w.isActive) return false;
        const d = this.getEffectiveDate(w);
        if (!d) return false;
        return d >= startOfWeek && d < endOfWeek;
      });

      // Energía promedio solo con muestras válidas (no imputar 0)
      const energySamples = workouts
        .map(w => (typeof w.postEnergyLevel === 'number' ? w.postEnergyLevel : w.preEnergyLevel))
        .filter((e): e is number => typeof e === 'number');
      const avgEnergyLevel = energySamples.length > 0
        ? energySamples.reduce((a, b) => a + b, 0) / energySamples.length
        : 0;

      const totalDuration = workouts.reduce((sum, w) => sum + (w.duration || 0), 0);
      const totalWorkouts = workouts.length;
      const totalCalories = workouts.reduce((sum, w) => sum + (w.totalCaloriesBurned || 0), 0);

      // Debug logs
      console.log('📊 [Métricas Semanales][Service] Semana actual:', {
        startOfWeek: startOfWeek.toISOString(),
        endOfWeek: endOfWeek.toISOString(),
        totalWorkouts,
      });
      console.log('📊 [Métricas Semanales][Service] Entrenamientos filtrados:', workouts.map(w => ({
        id: w.id,
        when: (w.completedAt?.toDate?.() || w.createdAt?.toDate?.())?.toISOString?.(),
        durationSec: w.duration,
        totalCaloriesBurned: w.totalCaloriesBurned,
        energy: typeof w.postEnergyLevel === 'number' ? w.postEnergyLevel : w.preEnergyLevel
      })));
      console.log('📊 [Métricas Semanales][Service] Totales:', { totalDurationSec: totalDuration, totalWorkouts, totalCalories, avgEnergyLevel });

      return {
        totalDuration,
        totalWorkouts,
        avgEnergyLevel,
        totalCalories
      };
    } catch (err) {
      console.error('Error getting weekly stats:', err);
      throw err;
    }
  }
};

// Plantillas de entrenamiento del usuario
export interface TemplateExercise {
  id?: string;
  name: string;
  sets: number;
  reps: number;
  restTime?: number;
  weightKg?: number;
}

export interface WorkoutTemplate {
  id?: string;
  userId: string;
  name: string;
  exercises: TemplateExercise[];
  createdAt: Timestamp;
}

export const workoutTemplateService = {
  async createTemplate(userId: string, data: Omit<WorkoutTemplate, 'id' | 'userId' | 'createdAt'>) {
    try {
      console.debug('[workoutTemplateService] createTemplate called', { userId, data });
      
      const cleanedExercises: TemplateExercise[] = (data.exercises || []).map(ex => {
        const e: TemplateExercise = {
          name: ex.name,
          sets: ex.sets,
          reps: ex.reps
        };
        if (typeof ex.restTime !== 'undefined') e.restTime = ex.restTime;
        if (typeof ex.weightKg === 'number') e.weightKg = ex.weightKg;
        return e;
      });
      const cleanData: Omit<WorkoutTemplate, 'id' | 'userId' | 'createdAt'> & { userId: string; createdAt: Timestamp } = {
        name: data.name,
        exercises: cleanedExercises,
        userId,
        createdAt: Timestamp.now()
      };
      const docRef = await addDoc(collection(db, 'workout_templates'), cleanData);
      console.debug('[workoutTemplateService] template created', { id: docRef.id });
      return docRef.id;
    } catch (error) {
      console.error('[workoutTemplateService] createTemplate error', error, { userId, data });
      throw error;
    }
  },
  async getUserTemplates(userId: string): Promise<WorkoutTemplate[]> {
    try {
      console.debug('[workoutTemplateService] getUserTemplates called', { userId });
      const q = query(
        collection(db, 'workout_templates'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const qs = await getDocs(q);
      console.debug('[workoutTemplateService] getUserTemplates result count', qs.docs.length);
      return qs.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutTemplate));
    } catch (err: unknown) {
      const msg = (err as { message?: string; code?: string })?.message || '';
      const code = (err as { code?: string })?.code || '';
      console.warn('[workoutTemplateService] getUserTemplates fallback triggered', { code, msg });
      if (code === 'failed-precondition' || msg.toLowerCase().includes('requires an index')) {
        // Fallback sin orderBy mientras se crea el índice compuesto en Firestore
        const q2 = query(
          collection(db, 'workout_templates'),
          where('userId', '==', userId)
        );
        const qs2 = await getDocs(q2);
        console.debug('[workoutTemplateService] getUserTemplates fallback result count', qs2.docs.length);
        return qs2.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutTemplate));
      }
      console.error('[workoutTemplateService] getUserTemplates error', err);
      throw err;
    }
  },
  async updateTemplate(id: string, updates: Partial<Omit<WorkoutTemplate, 'id' | 'userId' | 'createdAt'>>) {
    const ref = doc(db, 'workout_templates', id);
    await updateDoc(ref, updates);
  },
  async deleteTemplate(id: string) {
    const ref = doc(db, 'workout_templates', id);
    await deleteDoc(ref);
  }
};