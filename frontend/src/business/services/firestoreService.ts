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
import { db } from '../../infrastructure/config/firebase';

// User profile model
export interface UserProfile {
  id?: string; // ID del documento (opcional, se asigna automáticamente)
  userId: string; // ID del usuario de Firebase Auth (para vincular)
  displayName: string; // Nombre para mostrar
  email: string; // Correo electrónico
  goals: string[]; // Array de objetivos del usuario (ej: "perder peso", "ganar músculo")
  level: number; // Nivel actual del usuario (sistema de gamificación)
  xp: number; // Puntos de experiencia acumulados
  achievements: string[]; // Array de logros desbloqueados
  createdAt: Timestamp; // Fecha de creación del perfil
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
}

export const workoutService = {
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
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const q = query(
        collection(db, 'workouts'),
        where('userId', '==', userId),
        where('completedAt', '>=', Timestamp.fromDate(weekAgo)),
        where('isActive', '==', false)
      );
      const querySnapshot = await getDocs(q);
      const workouts = querySnapshot.docs.map(doc => doc.data()) as WorkoutSession[];
      return {
        totalDuration: workouts.reduce((sum, w) => sum + w.duration, 0),
        totalWorkouts: workouts.length,
        avgEnergyLevel: workouts.length > 0 ? workouts.reduce((sum, w) => sum + (w.postEnergyLevel ?? w.preEnergyLevel ?? 0), 0) / workouts.length : 0,
        totalCalories: workouts.reduce((sum, w) => sum + (w.totalCaloriesBurned || 0), 0)
      };
    } catch (err: unknown) {
      const msg = (err as { message?: string; code?: string })?.message || '';
      const code = (err as { code?: string })?.code || '';
      if (code === 'failed-precondition' || msg.toLowerCase().includes('requires an index')) {
        // Fallback: trae por userId y filtra en cliente
        const q2 = query(collection(db, 'workouts'), where('userId', '==', userId));
        const qs2 = await getDocs(q2);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const all = qs2.docs.map(d => d.data()) as WorkoutSession[];
        const workouts = all.filter(w => !w.isActive && w.completedAt && (w.completedAt as Timestamp).toDate() >= weekAgo);
        return {
          totalDuration: workouts.reduce((sum, w) => sum + w.duration, 0),
          totalWorkouts: workouts.length,
          avgEnergyLevel: workouts.length > 0 ? workouts.reduce((sum, w) => sum + (w.postEnergyLevel ?? w.preEnergyLevel ?? 0), 0) / workouts.length : 0,
          totalCalories: workouts.reduce((sum, w) => sum + (w.totalCaloriesBurned || 0), 0)
        };
      }
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
    const docRef = await addDoc(collection(db, 'workout_templates'), {
      ...data,
      userId,
      createdAt: Timestamp.now()
    });
    return docRef.id;
  },
  async getUserTemplates(userId: string): Promise<WorkoutTemplate[]> {
    try {
      const q = query(
        collection(db, 'workout_templates'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      const qs = await getDocs(q);
      return qs.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutTemplate));
    } catch (err: unknown) {
      const msg = (err as { message?: string; code?: string })?.message || '';
      const code = (err as { code?: string })?.code || '';
      if (code === 'failed-precondition' || msg.toLowerCase().includes('requires an index')) {
        // Fallback sin orderBy mientras se crea el índice compuesto en Firestore
        const q2 = query(
          collection(db, 'workout_templates'),
          where('userId', '==', userId)
        );
        const qs2 = await getDocs(q2);
        return qs2.docs.map(d => ({ id: d.id, ...d.data() } as WorkoutTemplate));
      }
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