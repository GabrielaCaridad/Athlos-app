// Servicio de alimentos (Firestore)
// Propósito: manejar catálogo de alimentos y registros del usuario.
// Colecciones: 'foodDatabase' (catálogo + registros de consumo unificados).
// Formato de fecha: YYYY-MM-DD LOCAL (clave para consultas por día).
// Índices: userId+date(+createdAt desc) y rangos por date para estadísticas.
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
  increment,
  startAt,
  endAt,
  limit as fsLimit,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { db } from './config';
import { normalizeToLocalDateKey } from '../../utils/date';

// Utilidades
// Qué hace: quita undefined/null antes de escribir en Firestore.
// Por qué: Firestore no acepta undefined y evita errores tontos.

// Pequeña utilidad: limpio las propiedades undefined/null antes de enviar a Firestore.
// Firestore no admite campos undefined, así que los omito para evitar errores.
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

// Tipos (se conservan nombres públicos para no romper la UI)
// Estructura de un alimento en la colección 'foodDatabase'.
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
  source?: 'USDA' | 'custom';
  fdcId?: number;          // ID numérico de USDA cuando exista
  usdaId?: string;         // legacy, mantenido por compatibilidad
  isVerified: boolean;     // true si viene de USDA o fue revisado
  usageCount: number;
  createdBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  alternativeNames?: string[];
}

// Estructura de un registro de consumo en la colección unificada 'foodDatabase'.
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

// Cuando agrego un alimento a la base de datos, recibo estos datos desde la UI.
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

// Función de ayuda para validar coherencia nutricional:
// 1g proteína = 4 kcal, 1g carbos = 4 kcal, 1g grasa = 9 kcal.
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

// Servicio principal para la base de datos de alimentos (colección: foodDatabase)
export const foodDatabaseService = {
  /**
  * Buscar alimentos en Firestore de forma eficiente (server-side):
  * - Si no hay término, traigo los más usados recientes con límite.
  * - Si hay término, hago búsqueda por prefijo en name (startAt/endAt) y
  *   una búsqueda exacta en alternativeNames (array-contains). Siempre con límite.
   */
  async searchFoods(searchTerm: string, limit: number = 20): Promise<DatabaseFood[]> {
    try {
      const trimmed = searchTerm.trim();
      if (!trimmed) {
        // Qué hace: si no hay término, trae top por uso + recientes
        const q = query(
          collection(db, 'foodDatabase'),
          orderBy('usageCount', 'desc'),
          orderBy('createdAt', 'desc'),
          fsLimit(limit)
        );
        const snap = await getDocs(q);
        const base = snap.docs.map(d => ({ id: d.id, ...d.data() })) as DatabaseFood[];
        return base.sort((a, b) => {
          const aVerified = (a.isVerified || a.source === 'USDA') ? 1 : 0;
          const bVerified = (b.isVerified || b.source === 'USDA') ? 1 : 0;
          if (bVerified !== aVerified) return bVerified - aVerified;
          if ((b.usageCount || 0) !== (a.usageCount || 0)) return (b.usageCount || 0) - (a.usageCount || 0);
          return 0;
        }).slice(0, limit);
      }

      // Qué hace: búsqueda por prefijo en name e intento por alternativeNames
      // Ojo: sensible a mayúsculas; para case-insensitive real haría falta nameLower.
      const qByName = query(
        collection(db, 'foodDatabase'),
        orderBy('name'),
        startAt(trimmed),
        endAt(trimmed + '\uf8ff'),
        fsLimit(limit)
      );
      // Coincidencia exacta en alternativeNames vía array-contains (sin prefijos)
      const qByAlt = query(
        collection(db, 'foodDatabase'),
        where('alternativeNames', 'array-contains', trimmed),
        fsLimit(Math.max(1, Math.floor(limit / 2)))
      );

      // Ejecutar en paralelo y fusionar resultados
      const [snapName, snapAlt] = await Promise.allSettled([
        getDocs(qByName),
        getDocs(qByAlt)
      ]);

      const map = new Map<string, DatabaseFood>();
      const addDocs = (docs: QueryDocumentSnapshot<DocumentData>[]) => {
        for (const d of docs) {
          if (!map.has(d.id)) {
            map.set(d.id, { id: d.id, ...d.data() } as DatabaseFood);
          }
        }
      };

      if (snapName.status === 'fulfilled') addDocs(snapName.value.docs);
      if (snapAlt.status === 'fulfilled') addDocs(snapAlt.value.docs);

      let results = Array.from(map.values());

      // Si obtengo pocos resultados, complemento con un top por uso (también limitado)
      if (results.length < limit) {
        try {
          const qTop = query(
            collection(db, 'foodDatabase'),
            orderBy('usageCount', 'desc'),
            fsLimit(Math.max(0, limit - results.length))
          );
          const snapTop = await getDocs(qTop);
          for (const d of snapTop.docs) {
            if (!map.has(d.id)) {
              map.set(d.id, { id: d.id, ...d.data() } as DatabaseFood);
            }
          }
          results = Array.from(map.values());
        } catch {
          // fallback silencioso si falta índice
        }
      }

      // Orden final: USDA/verificados primero, luego por uso
      results.sort((a, b) => {
        const aVerified = (a.isVerified || a.source === 'USDA') ? 1 : 0;
        const bVerified = (b.isVerified || b.source === 'USDA') ? 1 : 0;
        if (bVerified !== aVerified) return bVerified - aVerified;
        if ((b.usageCount || 0) !== (a.usageCount || 0)) return (b.usageCount || 0) - (a.usageCount || 0);
        return 0;
      });

      return results.slice(0, limit);
    } catch (error) {
      console.error('Error searching foods:', error);
      throw error;
    }
  },

  /**
   * Agregar un alimento a la colección foodDatabase.
   * - Si viene desde USDA (fdcId), primero intento reutilizar un documento existente.
   * - Si hay uno parecido (mismo nombre), incremento su uso para evitar duplicados.
   */
  async addToDatabase(foodData: CreateFoodData & { fdcId?: number; source?: DatabaseFood['source'] }, userId: string): Promise<string> {
    try {
      // Qué hace: evita duplicados USDA por fdcId, incrementa uso si existe
      if (foodData.fdcId) {
        const qFdc = query(collection(db, 'foodDatabase'), where('fdcId', '==', foodData.fdcId));
        const qFdcSnap = await getDocs(qFdc);
        if (!qFdcSnap.empty) {
          const docFound = qFdcSnap.docs[0];
          await this.incrementUsage(docFound.id);
          return docFound.id;
        }
      }

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
        source: foodData.source || 'custom',
        fdcId: foodData.fdcId,
        isVerified: (foodData.source === 'USDA') || false,
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
   * Incremento el contador de uso (usageCount) para saber qué alimentos son más frecuentes.
   */
  async incrementUsage(foodId: string): Promise<void> {
    try {
      const foodRef = doc(db, 'foodDatabase', foodId); // Índice no requerido (lookup directo)
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
   * Traigo un documento de foodDatabase por su ID (útil para detalles o edición).
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
};

// Servicio para manejar los registros de consumo por usuario (colección unificada: foodDatabase)
export const userFoodService = {
  /**
  * Registrar un consumo: ahora todo vive en 'foodDatabase' para simplificar el backend/chat.
  * Guardo los macros multiplicados por la cantidad para facilitar resúmenes.
   */
  async addUserFoodEntry(
    userId: string, 
    foodData: CreateFoodData & { fdcId?: number; source?: DatabaseFood['source'] }, 
    date: string,
    quantity: number = 1,
    mealType?: UserFoodEntry['mealType']
  ): Promise<string> {
    try {
      // Normaliza fecha de entrada a clave local YYYY-MM-DD
      const ymdLocal = normalizeToLocalDateKey(date);

      const databaseFoodId = await foodDatabaseService.addToDatabase(foodData, userId);

      const rawEntry = {
        userId,
        databaseFoodId,
        name: foodData.name,
    calories: foodData.calories * quantity,
    serving: foodData.serving,
        quantity,
    // Clave local de fecha (YYYY-MM-DD)
    date: ymdLocal,
        mealType,
        protein: typeof foodData.protein === 'number' ? foodData.protein * quantity : undefined,
        carbs: typeof foodData.carbs === 'number' ? foodData.carbs * quantity : undefined,
        fats: typeof foodData.fats === 'number' ? foodData.fats * quantity : undefined,
        fiber: typeof foodData.fiber === 'number' ? foodData.fiber * quantity : undefined,
        createdAt: Timestamp.now()
      } as Partial<UserFoodEntry> & { userId: string; databaseFoodId: string; name: string; calories: number; serving: string; quantity: number; date: string; createdAt: Timestamp };

      const cleanEntry = removeUndefinedFields(rawEntry);
      // Log diagnóstico (solo dev) para verificar escritura diaria en foodDatabase
      if (typeof console !== 'undefined') {
        console.log('[addFood] wrote', { userId, date: ymdLocal, createdAt: rawEntry.createdAt });
      }

  // (Limpieza) Reemplacé 'userFoodEntries' por 'foodDatabase'.
  const docRef = await addDoc(collection(db, 'foodDatabase'), cleanEntry);
      return docRef.id;
    } catch (error) {
      console.error('Error adding user food entry:', error);
      throw error;
    }
  },

  /**
   * Devuelvo el resumen de macros de un día. Agrupo también por tipo de comida.
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
  // Unifico lecturas en 'foodDatabase'.
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
   * Listo todos los registros de un usuario para una fecha dada, ordenados por creación.
   * Si Firestore exige un índice compuesto y no está creado, hago un fallback en cliente.
   */
  async getUserFoodsByDate(userId: string, date: string): Promise<UserFoodEntry[]> {
    const dateKey = normalizeToLocalDateKey(date);
    try {
      const q = query(
  collection(db, 'foodDatabase'),
        where('userId', '==', userId),
        where('date', '==', dateKey),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as UserFoodEntry[];
    } catch (error: unknown) {
      const msg = (error as { message?: string; code?: string })?.message || '';
      const code = (error as { code?: string })?.code || '';
      console.error('Error getting user foods by date:', error);
      if (code === 'failed-precondition' || msg.toLowerCase().includes('requires an index')) {
        // Ojo: fallback cliente si falta índice compuesto userId+date+createdAt
        console.warn('getUserFoodsByDate: composite index required, falling back to client-side filter');
  const q2 = query(collection(db, 'foodDatabase'), where('userId', '==', userId));
        const qs2 = await getDocs(q2);
        const all = qs2.docs.map(d => ({ id: d.id, ...d.data() })) as UserFoodEntry[];
        return all.filter(f => f.date === dateKey).sort((a, b) => {
          const ta = (a.createdAt as Timestamp)?.toMillis?.() || 0;
          const tb = (b.createdAt as Timestamp)?.toMillis?.() || 0;
          return tb - ta;
        });
      }
      throw error;
    }
  },

  /**
   * Filtro por tipo de comida (breakfast, lunch, dinner, snack) para una fecha.
   * También manejo el caso de índice requerido con un fallback en cliente.
   */
  async getUserFoodsByMealType(
    userId: string, 
    date: string, 
    mealType: UserFoodEntry['mealType']
  ): Promise<UserFoodEntry[]> {
    const dateKey = normalizeToLocalDateKey(date);
    try {
      const q = query(
  collection(db, 'foodDatabase'),
        where('userId', '==', userId),
        where('date', '==', dateKey),
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
        // Ojo: fallback cliente si falta índice userId+date+mealType+createdAt
        console.warn('getUserFoodsByMealType: composite index required, falling back to client-side filter');
  const q2 = query(collection(db, 'foodDatabase'), where('userId', '==', userId));
        const qs2 = await getDocs(q2);
        const all = qs2.docs.map(d => ({ id: d.id, ...d.data() })) as UserFoodEntry[];
        return all.filter(f => f.date === dateKey && f.mealType === mealType).sort((a, b) => {
          const ta = (a.createdAt as Timestamp)?.toMillis?.() || 0;
          const tb = (b.createdAt as Timestamp)?.toMillis?.() || 0;
          return tb - ta;
        });
      }
      throw error;
    }
  },

  /**
   * Actualizar campos de un registro específico en userFoodEntries.
   */
  async updateUserFoodEntry(entryId: string, updates: Partial<UserFoodEntry>): Promise<void> {
    try {
  const entryRef = doc(db, 'foodDatabase', entryId); // (Limpieza) antes userFoodEntries
      await updateDoc(entryRef, updates);
    } catch (error) {
      console.error('Error updating user food entry:', error);
      throw error;
    }
  },

  /**
   * Eliminar un documento de userFoodEntries (por ejemplo, si el usuario deshace un registro).
   */
  async deleteUserFoodEntry(entryId: string): Promise<void> {
    try {
  const entryRef = doc(db, 'foodDatabase', entryId); // (Limpieza) antes userFoodEntries
      await deleteDoc(entryRef);
    } catch (error) {
      console.error('Error deleting user food entry:', error);
      throw error;
    }
  },

  /**
   * Sumo las calorías de un día específico (útil para monitoreo rápido).
   */
  async getDailyCalories(userId: string, date: string): Promise<number> {
    try {
  const foods = await this.getUserFoodsByDate(userId, date); // unificado
  return foods.reduce((total, food) => total + Number(food.calories || 0), 0); // Normalizo a number
    } catch (error) {
      console.error('Error getting daily calories:', error);
      throw error;
    }
  },

  /**
   * Estadísticas en un rango [startDate, endDate]: total, promedio diario
   * y top de alimentos más frecuentes. Manejo fallback si falta índice.
   */
  async getNutritionStats(userId: string, startDate: string, endDate: string): Promise<{
    totalCalories: number;
    averageDaily: number;
    topFoods: Array<{ name: string; count: number; calories: number }>;
  }> {
    const startKey = normalizeToLocalDateKey(startDate);
    const endKey = normalizeToLocalDateKey(endDate);
    try {
      const q = query(
  collection(db, 'foodDatabase'),
        where('userId', '==', userId),
        where('date', '>=', startKey),
        where('date', '<=', endKey),
        orderBy('date', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const entries = querySnapshot.docs.map(doc => doc.data()) as UserFoodEntry[];
      
      const totalCalories = entries.reduce((sum, entry) => sum + entry.calories, 0);
      const days = Math.max(1, Math.ceil((new Date(endKey).getTime() - new Date(startKey).getTime()) / (1000 * 60 * 60 * 24)) + 1);
      
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
        // Ojo: fallback si falta índice userId+date DESC para rango
        console.warn('getNutritionStats: composite index required, falling back to client-side filter');
  const q2 = query(collection(db, 'foodDatabase'), where('userId', '==', userId));
        const qs2 = await getDocs(q2);
        const all = qs2.docs.map(d => d.data()) as UserFoodEntry[];
    const entries = all.filter(e => e.date >= startKey && e.date <= endKey).sort((a, b) => (b.date > a.date ? 1 : -1));

        const totalCalories = entries.reduce((sum, entry) => sum + entry.calories, 0);
    const days = Math.max(1, Math.ceil((new Date(endKey).getTime() - new Date(startKey).getTime()) / (1000 * 60 * 60 * 24)) + 1);
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