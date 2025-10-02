// foodDataService: servicios de alimentos.
// - foodDatabaseService: base de datos de alimentos de la app (búsqueda, alta, uso, inicialización).
// - userFoodService: entradas de alimentos por usuario (CRUD y estadísticas).
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  orderBy, 
  getDocs, 
  query, 
  where, 
  Timestamp,
  getDoc,
  setDoc,
  increment
} from 'firebase/firestore';
import { db } from './config';

/**
 * Remueve propiedades undefined/null de un objeto para Firestore.
 * Firebase no permite undefined en documentos, solo omitir el campo.
 */
function removeUndefinedFields<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const cleaned: Partial<T> = {};
  for (const key in obj) {
    const value = obj[key as keyof T];
    if (value !== undefined && value !== null) {
      cleaned[key as keyof T] = value as T[keyof T];
    }
  }
  return cleaned;
}

/**
 * Interfaz para alimentos en la base de datos
 */
export interface DatabaseFood {
  id?: string;
  name: string;
  calories: number;
  protein?: number;        // gramos (por porción)
  carbs?: number;          // gramos (por porción)
  fats?: number;           // gramos (por porción)
  fiber?: number;          // gramos (por porción)
  serving: string;
  category: 'fruits' | 'vegetables' | 'grains' | 'proteins' | 'dairy' | 'prepared' | 'beverages' | 'snacks' | 'other';
  usdaId?: string;
  isVerified: boolean;
  usageCount: number;
  createdBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  alternativeNames?: string[];
}

/**
 * Interfaz para el registro de alimentos del usuario
 */
export interface UserFoodEntry {
  id?: string;
  userId: string;
  databaseFoodId: string;
  name: string;
  calories: number;
  protein?: number;        // gramos totales (quantity incluida)
  carbs?: number;          // gramos totales
  fats?: number;           // gramos totales
  fiber?: number;          // gramos totales
  serving: string;
  quantity: number;
  date: string;
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  createdAt: Timestamp;
}

/**
 * Interfaz para datos de entrada al crear un alimento
 */
interface CreateFoodData {
  name: string;
  calories: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  fiber?: number;
  serving: string;
  category?: DatabaseFood['category'];
  alternativeNames?: string[];
}

/**
 * Valida que las calorías declaradas coincidan con los macronutrientes
 * 1g proteína = 4 kcal, 1g carbos = 4 kcal, 1g grasa = 9 kcal
 */
export function validateNutritionalCoherence(
  calories: number,
  protein: number,
  carbs: number,
  fats: number
): { isValid: boolean; message?: string; calculatedCalories: number } {
  const calculatedCalories = Math.round((protein * 4) + (carbs * 4) + (fats * 9));
  const difference = Math.abs(calories - calculatedCalories);
  return {
    isValid: difference <= 20,
    calculatedCalories,
    message: difference > 20
      ? `Calorías declaradas (${calories}) difieren de las calculadas (${calculatedCalories}) por ${difference} kcal`
      : undefined
  };
}

/**
 * Servicio para manejar la base de datos de alimentos
 */
export const foodDatabaseService = {
  /**
   * Buscar alimentos en la base de datos
   */
  async searchFoods(searchTerm: string, limit: number = 20): Promise<DatabaseFood[]> {
    try {
      if (!searchTerm.trim()) {
        const q = query(
          collection(db, 'foodDatabase'),
          orderBy('usageCount', 'desc'),
          orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.slice(0, limit).map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as DatabaseFood[];
      }

      const q = query(collection(db, 'foodDatabase'), orderBy('usageCount', 'desc'));
      const querySnapshot = await getDocs(q);
      
      const searchLower = searchTerm.toLowerCase();
      const results = querySnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }) as DatabaseFood)
        .filter(food => {
          const nameMatch = food.name.toLowerCase().includes(searchLower);
          const altNamesMatch = food.alternativeNames?.some(alt => 
            alt.toLowerCase().includes(searchLower)
          );
          return nameMatch || altNamesMatch;
        })
        .slice(0, limit);

      return results;
    } catch (error) {
      console.error('Error searching foods:', error);
      throw error;
    }
  },

  /**
   * Agregar un nuevo alimento a la base de datos
   */
  async addToDatabase(foodData: CreateFoodData, userId: string): Promise<string> {
    try {
      const existingFoods = await this.searchFoods(foodData.name, 5);
      const similarFood = existingFoods.find(food => 
        food.name.toLowerCase() === foodData.name.toLowerCase()
      );

      if (similarFood) {
        await this.incrementUsage(similarFood.id!);
        return similarFood.id!;
      }

      const now = Timestamp.now();
      const rawDatabaseFood = {
        name: foodData.name,
        calories: foodData.calories,
        protein: foodData.protein,
        carbs: foodData.carbs,
        fats: foodData.fats,
        fiber: foodData.fiber,
        serving: foodData.serving,
        category: foodData.category || 'other',
        isVerified: false,
        usageCount: 1,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
        alternativeNames: foodData.alternativeNames || []
      } as Partial<DatabaseFood> & { name: string; calories: number; serving: string; category: DatabaseFood['category']; isVerified: boolean; usageCount: number; createdAt: Timestamp; updatedAt: Timestamp };

      const cleanDatabaseFood = removeUndefinedFields(rawDatabaseFood);
      const docRef = await addDoc(collection(db, 'foodDatabase'), cleanDatabaseFood);
      return docRef.id;
    } catch (error) {
      console.error('Error adding to food database:', error);
      throw error;
    }
  },

  /**
   * Incrementar el contador de uso de un alimento
   */
  async incrementUsage(foodId: string): Promise<void> {
    try {
      const foodRef = doc(db, 'foodDatabase', foodId);
      await updateDoc(foodRef, {
        usageCount: increment(1),
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Error incrementing food usage:', error);
      throw error;
    }
  },

  /**
   * Obtener un alimento de la base de datos por ID
   */
  async getFoodById(id: string): Promise<DatabaseFood | null> {
    try {
      const docRef = doc(db, 'foodDatabase', id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data()
        } as DatabaseFood;
      }
      
      return null;
    } catch (error) {
      console.error('Error getting food by ID:', error);
      throw error;
    }
  },

  /**
   * Inicializar base de datos con alimentos verificados
   */
  async initializeDatabase(): Promise<void> {
    try {
  const { verifiedFoods } = await import('../datos-locales/VerifiedFoods');
      
      for (const verifiedFood of verifiedFoods) {
        const existingFood = await this.getFoodById(verifiedFood.id);
        
        if (!existingFood) {
          const databaseFood: Omit<DatabaseFood, 'id'> = {
            name: verifiedFood.name,
            calories: verifiedFood.calories,
            serving: verifiedFood.serving,
            category: verifiedFood.category,
            usdaId: verifiedFood.usdaId,
            isVerified: true,
            usageCount: 0,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            alternativeNames: []
          };

          await setDoc(doc(db, 'foodDatabase', verifiedFood.id), databaseFood);
        }
      }
    } catch (error) {
      console.error('Error initializing food database:', error);
      throw error;
    }
  }
};

/**
 * Servicio para el registro de alimentos del usuario
 */
export const userFoodService = {
  /**
   * Registrar un alimento consumido por el usuario
   */
  async addUserFoodEntry(
    userId: string, 
    foodData: CreateFoodData, 
    date: string,
    quantity: number = 1,
    mealType?: UserFoodEntry['mealType']
  ): Promise<string> {
    try {
      const databaseFoodId = await foodDatabaseService.addToDatabase(foodData, userId);

      const rawEntry = {
        userId,
        databaseFoodId,
        name: foodData.name,
        calories: foodData.calories * quantity,
        serving: foodData.serving,
        quantity,
        date,
        mealType,
        protein: typeof foodData.protein === 'number' ? foodData.protein * quantity : undefined,
        carbs: typeof foodData.carbs === 'number' ? foodData.carbs * quantity : undefined,
        fats: typeof foodData.fats === 'number' ? foodData.fats * quantity : undefined,
        fiber: typeof foodData.fiber === 'number' ? foodData.fiber * quantity : undefined,
        createdAt: Timestamp.now()
      } as Partial<UserFoodEntry> & { userId: string; databaseFoodId: string; name: string; calories: number; serving: string; quantity: number; date: string; createdAt: Timestamp };

      const cleanEntry = removeUndefinedFields(rawEntry);

      const docRef = await addDoc(collection(db, 'userFoodEntries'), cleanEntry);
      return docRef.id;
    } catch (error) {
      console.error('Error adding user food entry:', error);
      throw error;
    }
  },

  /**
   * Resumen de macronutrientes por día
   */
  async getDailyMacroSummary(userId: string, date: string): Promise<{
    totalCalories: number;
    totalProtein: number;
    totalCarbs: number;
    totalFats: number;
    totalFiber: number;
    byMealType: {
      breakfast: { calories: number; protein: number; carbs: number; fats: number };
      lunch: { calories: number; protein: number; carbs: number; fats: number };
      dinner: { calories: number; protein: number; carbs: number; fats: number };
      snack: { calories: number; protein: number; carbs: number; fats: number };
    };
  }> {
    const foods = await this.getUserFoodsByDate(userId, date);
    const summary = {
      totalCalories: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFats: 0,
      totalFiber: 0,
      byMealType: {
        breakfast: { calories: 0, protein: 0, carbs: 0, fats: 0 },
        lunch: { calories: 0, protein: 0, carbs: 0, fats: 0 },
        dinner: { calories: 0, protein: 0, carbs: 0, fats: 0 },
        snack: { calories: 0, protein: 0, carbs: 0, fats: 0 }
      }
    };

    for (const food of foods) {
      summary.totalCalories += food.calories;
      summary.totalProtein += food.protein || 0;
      summary.totalCarbs += food.carbs || 0;
      summary.totalFats += food.fats || 0;
      summary.totalFiber += food.fiber || 0;
      if (food.mealType) {
        const bucket = summary.byMealType[food.mealType];
        bucket.calories += food.calories;
        bucket.protein += food.protein || 0;
        bucket.carbs += food.carbs || 0;
        bucket.fats += food.fats || 0;
      }
    }
    return summary;
  },

  /**
   * Obtener alimentos del usuario por fecha
   */
  async getUserFoodsByDate(userId: string, date: string): Promise<UserFoodEntry[]> {
    try {
      const q = query(
        collection(db, 'userFoodEntries'),
        where('userId', '==', userId),
        where('date', '==', date),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as UserFoodEntry[];
    } catch (error: unknown) {
      const msg = (error as { message?: string; code?: string })?.message || '';
      const code = (error as { code?: string })?.code || '';
      console.error('Error getting user foods by date:', error);
      if (code === 'failed-precondition' || msg.toLowerCase().includes('requires an index')) {
        console.warn('getUserFoodsByDate: composite index required, falling back to client-side filter');
        const q2 = query(collection(db, 'userFoodEntries'), where('userId', '==', userId));
        const qs2 = await getDocs(q2);
        const all = qs2.docs.map(d => ({ id: d.id, ...d.data() })) as UserFoodEntry[];
        return all.filter(f => f.date === date).sort((a, b) => {
          const ta = (a.createdAt as Timestamp)?.toMillis?.() || 0;
          const tb = (b.createdAt as Timestamp)?.toMillis?.() || 0;
          return tb - ta;
        });
      }
      throw error;
    }
  },

  /**
   * Obtener alimentos del usuario por tipo de comida
   */
  async getUserFoodsByMealType(
    userId: string, 
    date: string, 
    mealType: UserFoodEntry['mealType']
  ): Promise<UserFoodEntry[]> {
    try {
      const q = query(
        collection(db, 'userFoodEntries'),
        where('userId', '==', userId),
        where('date', '==', date),
        where('mealType', '==', mealType),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as UserFoodEntry[];
    } catch (error: unknown) {
      const msg = (error as { message?: string; code?: string })?.message || '';
      const code = (error as { code?: string })?.code || '';
      console.error('Error getting user foods by meal type:', error);
      if (code === 'failed-precondition' || msg.toLowerCase().includes('requires an index')) {
        console.warn('getUserFoodsByMealType: composite index required, falling back to client-side filter');
        const q2 = query(collection(db, 'userFoodEntries'), where('userId', '==', userId));
        const qs2 = await getDocs(q2);
        const all = qs2.docs.map(d => ({ id: d.id, ...d.data() })) as UserFoodEntry[];
        return all.filter(f => f.date === date && f.mealType === mealType).sort((a, b) => {
          const ta = (a.createdAt as Timestamp)?.toMillis?.() || 0;
          const tb = (b.createdAt as Timestamp)?.toMillis?.() || 0;
          return tb - ta;
        });
      }
      throw error;
    }
  },

  /**
   * Actualizar un registro de alimento del usuario
   */
  async updateUserFoodEntry(entryId: string, updates: Partial<UserFoodEntry>): Promise<void> {
    try {
      const entryRef = doc(db, 'userFoodEntries', entryId);
      await updateDoc(entryRef, updates);
    } catch (error) {
      console.error('Error updating user food entry:', error);
      throw error;
    }
  },

  /**
   * Eliminar un registro de alimento del usuario
   */
  async deleteUserFoodEntry(entryId: string): Promise<void> {
    try {
      const entryRef = doc(db, 'userFoodEntries', entryId);
      await deleteDoc(entryRef);
    } catch (error) {
      console.error('Error deleting user food entry:', error);
      throw error;
    }
  },

  /**
   * Obtener total de calorías por fecha
   */
  async getDailyCalories(userId: string, date: string): Promise<number> {
    try {
      const foods = await this.getUserFoodsByDate(userId, date);
      return foods.reduce((total, food) => total + food.calories, 0);
    } catch (error) {
      console.error('Error getting daily calories:', error);
      throw error;
    }
  },

  /**
   * Obtener estadísticas nutricionales por rango de fechas
   */
  async getNutritionStats(userId: string, startDate: string, endDate: string): Promise<{
    totalCalories: number;
    averageDaily: number;
    topFoods: Array<{ name: string; count: number; calories: number }>;
  }> {
    try {
      const q = query(
        collection(db, 'userFoodEntries'),
        where('userId', '==', userId),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        orderBy('date', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const entries = querySnapshot.docs.map(doc => doc.data()) as UserFoodEntry[];
      
      const totalCalories = entries.reduce((sum, entry) => sum + entry.calories, 0);
      const days = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);
      
      const foodCounts = entries.reduce((acc, entry) => {
        if (!acc[entry.name]) {
          acc[entry.name] = { count: 0, calories: 0 };
        }
        acc[entry.name].count += 1;
        acc[entry.name].calories += entry.calories;
        return acc;
      }, {} as { [key: string]: { count: number; calories: number } });

      const topFoods = Object.entries(foodCounts)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        totalCalories,
        averageDaily: Math.round(totalCalories / days),
        topFoods
      };
    } catch (error: unknown) {
      const msg = (error as { message?: string; code?: string })?.message || '';
      const code = (error as { code?: string })?.code || '';
      console.error('Error getting nutrition stats:', error);
      if (code === 'failed-precondition' || msg.toLowerCase().includes('requires an index')) {
        console.warn('getNutritionStats: composite index required, falling back to client-side filter');
        const q2 = query(collection(db, 'userFoodEntries'), where('userId', '==', userId));
        const qs2 = await getDocs(q2);
        const all = qs2.docs.map(d => d.data()) as UserFoodEntry[];
        const entries = all.filter(e => e.date >= startDate && e.date <= endDate).sort((a, b) => (b.date > a.date ? 1 : -1));

        const totalCalories = entries.reduce((sum, entry) => sum + entry.calories, 0);
        const days = Math.max(1, Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1);
        const foodCounts = entries.reduce((acc, entry) => {
          if (!acc[entry.name]) {
            acc[entry.name] = { count: 0, calories: 0 };
          }
          acc[entry.name].count += 1;
          acc[entry.name].calories += entry.calories;
          return acc;
        }, {} as { [key: string]: { count: number; calories: number } });

        const topFoods = Object.entries(foodCounts)
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        return {
          totalCalories,
          averageDaily: Math.round(totalCalories / days),
          topFoods
        };
      }
      throw error;
    }
  }
};