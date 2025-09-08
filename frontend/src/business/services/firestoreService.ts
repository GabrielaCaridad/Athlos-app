// Importaciones de Firestore para operaciones CRUD
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

/**
 * Interfaz que define la estructura de un perfil de usuario en Firestore
 * Representa todos los datos que se guardan de cada usuario
 */
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

/**
 * Servicio para manejar operaciones CRUD de perfiles de usuario
 * Agrupa todas las funciones relacionadas con usuarios en un objeto
 */
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
      // addDoc agrega un nuevo documento a la colección 'users'
      const docRef = await addDoc(collection(db, 'users'), {
        ...profileData, // Esparce los datos proporcionados
        userId, // Agrega el ID del usuario de Auth
        createdAt: Timestamp.now() // Agrega timestamp actual
      });
      
      // Retorna el ID del documento recién creado
      return docRef.id;
    } catch (error) {
      // Manejo de errores: logea y re-lanza para que el componente pueda manejar
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
      // Crea una consulta para encontrar el documento del usuario
      // where('userId', '==', userId) busca documentos donde el campo userId coincida
      const q = query(collection(db, 'users'), where('userId', '==', userId));
      const querySnapshot = await getDocs(q);
      
      // Si encuentra el documento del usuario
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0]; // Toma el primer (y debería ser único) resultado
        await updateDoc(userDoc.ref, updates); // Actualiza con los nuevos datos
      }
      // Nota: Si no encuentra el documento, no hace nada (podría lanzar error)
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
      // Busca el documento del usuario usando su ID de Auth
      const q = query(collection(db, 'users'), where('userId', '==', userId));
      const querySnapshot = await getDocs(q);
      
      // Si encuentra el documento
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        
        // Combina el ID del documento con los datos y los tipea correctamente
        return {
          id: userDoc.id,
          ...userDoc.data()
        } as UserProfile;
      }
      
      // Si no encuentra el usuario, retorna null
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

  /* Obtener alimentos por fecha - VERSIÓN OPTIMIZADA CON ÍNDICES */
  async getFoodsByDate(userId: string, date: string): Promise<FoodEntry[]> {
    try {
      // Esta consulta requiere el índice compuesto que estás creando
      const q = query(
        collection(db, 'foods'),
        where('userId', '==', userId),
        where('date', '==', date),
        orderBy('createdAt', 'desc') // Los más recientes primero
      );
      
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FoodEntry[];
      
    } catch (error) {
      console.error('Error getting foods by date:', error);
      
      // Si falla (índice no listo), usar versión simplificada como fallback
      console.log('Intentando con consulta simplificada...');
      return await this.getFoodsByDateSimple(userId, date);
    }
  },

  /* Versión simplificada como fallback */
  async getFoodsByDateSimple(userId: string, date: string): Promise<FoodEntry[]> {
    try {
      // Solo filtrar por userId (no requiere índice)
      const q = query(
        collection(db, 'foods'),
        where('userId', '==', userId)
      );
      
      const querySnapshot = await getDocs(q);
      
      // Filtrar por fecha y ordenar en el cliente
      const allUserFoods = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FoodEntry[];
      
      return allUserFoods
        .filter(food => food.date === date)
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
        
    } catch (error) {
      console.error('Error getting foods by date (simple):', error);
      throw error;
    }
  },

  /* Obtener TODOS los alimentos del usuario (para debug) */
  async getAllUserFoods(userId: string): Promise<FoodEntry[]> {
    try {
      const q = query(
        collection(db, 'foods'),
        where('userId', '==', userId)
      );
      
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FoodEntry[];
    } catch (error) {
      console.error('Error getting all user foods:', error);
      throw error;
    }
  },

  /* Obtener alimentos de múltiples días (útil para estadísticas semanales/mensuales) */
  async getFoodsByDateRange(userId: string, startDate: string, endDate: string): Promise<FoodEntry[]> {
    try {
      // Esta consulta también necesita índices, pero es más útil para analytics
      const q = query(
        collection(db, 'foods'),
        where('userId', '==', userId),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'desc'),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FoodEntry[];
      
    } catch (error) {
      console.error('Error getting foods by date range:', error);
      
      // Fallback: obtener todos los alimentos del usuario y filtrar en cliente
      const allFoods = await this.getAllUserFoods(userId);
      return allFoods
        .filter(food => food.date >= startDate && food.date <= endDate)
        .sort((a, b) => {
          // Primero por fecha (desc), luego por hora de creación (desc)
          if (a.date !== b.date) {
            return b.date.localeCompare(a.date);
          }
          return b.createdAt.toMillis() - a.createdAt.toMillis();
        });
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
  },

  /* Obtener estadísticas de la semana */
  async getWeeklyStats(userId: string): Promise<{
    totalCalories: number;
    avgCalories: number;
    daysWithFood: number;
    totalFoods: number;
  }> {
    try {
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - 6); // Últimos 7 días
      
      const startDate = startOfWeek.toISOString().split('T')[0];
      const endDate = today.toISOString().split('T')[0];
      
      const weekFoods = await this.getFoodsByDateRange(userId, startDate, endDate);
      
      const dailyTotals = new Map<string, number>();
      weekFoods.forEach(food => {
        const current = dailyTotals.get(food.date) || 0;
        dailyTotals.set(food.date, current + food.calories);
      });
      
      const totalCalories = Array.from(dailyTotals.values()).reduce((sum, cal) => sum + cal, 0);
      const daysWithFood = dailyTotals.size;
      const avgCalories = daysWithFood > 0 ? totalCalories / daysWithFood : 0;
      
      return {
        totalCalories,
        avgCalories: Math.round(avgCalories),
        daysWithFood,
        totalFoods: weekFoods.length
      };
    } catch (error) {
      console.error('Error getting weekly stats:', error);
      throw error;
    }
  }
};