/*
  exerciseAPI
  ------------------------------------------------------------
  Integración con ExerciseDB (RapidAPI). Adapta los ejercicios al formato
  interno, traduce equipamiento/músculos a español y estima dificultad,
  categoría y calorías por minuto. Incluye caché en memoria y manejo de
  errores específico por códigos HTTP.

*/

// Configuración de la API
const RAPIDAPI_KEY = import.meta.env.VITE_RAPIDAPI_KEY as string | undefined;
const RAPIDAPI_HOST = 'exercisedb.p.rapidapi.com';
const BASE_URL = 'https://exercisedb.p.rapidapi.com';

// Interfaces para los datos de ExerciseDB
export interface ExerciseDBExercise {
  bodyPart: string;
  equipment: string;
  gifUrl: string;
  id: string;
  name: string;
  target: string;
  secondaryMuscles: string[];
  instructions: string[];
}

// Interfaz adaptada para el sistema
export interface AdaptedExercise {
  id: string;
  name: string;
  category: 'strength' | 'cardio' | 'flexibility' | 'functional' | 'core';
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  instructions: string[];
  gifUrl: string;
  caloriesPerMinute: number;
  defaultSets: number;
  defaultReps: number;
  restTimeSeconds: number;
  bodyPart: string;
  target: string;
}

// Interfaz para el cache
interface CacheItem {
  data: unknown;
  timestamp: number;
}

// Headers para las requests
const getHeaders = () => ({
  'X-RapidAPI-Key': RAPIDAPI_KEY ?? '',
  'X-RapidAPI-Host': RAPIDAPI_HOST,
  'Accept': 'application/json'
});

// Cache simple en memoria para evitar requests repetidas
const cache = new Map<string, CacheItem>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

const getCacheKey = (endpoint: string, params?: string) => {
  return `${endpoint}_${params || ''}`;
};

const setCache = (key: string, data: unknown) => {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
};

const getCache = (key: string): unknown => {
  const cached = cache.get(key);
  if (!cached) return null;
  
  if (Date.now() - cached.timestamp > CACHE_DURATION) {
    cache.delete(key);
    return null;
  }
  
  return cached.data;
};

// Mapeo de equipamiento de inglés a español
const equipmentMapping: { [key: string]: string } = {
  'body weight': 'Peso corporal',
  'barbell': 'Barra',
  'dumbbell': 'Mancuernas',
  'cable': 'Polea',
  'machine': 'Máquina',
  'kettlebell': 'Pesa rusa',
  'resistance band': 'Banda elástica',
  'stability ball': 'Pelota de estabilidad',
  'medicine ball': 'Balón medicinal',
  'foam roller': 'Rodillo de espuma',
  'ez barbell': 'Barra EZ',
  'olympic barbell': 'Barra olímpica',
  'assisted': 'Asistido',
  'leverage machine': 'Máquina de palanca',
  'skierg machine': 'Máquina de esquí',
  'upper body ergometer': 'Ergómetro de tren superior',
  'stationary bike': 'Bicicleta estática',
  'elliptical machine': 'Máquina elíptica',
  'stepmill machine': 'Máquina de escalones'
};

// Mapeo de músculos de inglés a español
const muscleMapping: { [key: string]: string } = {
  'abductors': 'Abductores',
  'abs': 'Abdominales',
  'adductors': 'Aductores',
  'biceps': 'Bíceps',
  'calves': 'Gemelos',
  'cardiovascular system': 'Sistema cardiovascular',
  'delts': 'Deltoides',
  'forearms': 'Antebrazos',
  'glutes': 'Glúteos',
  'hamstrings': 'Isquiotibiales',
  'lats': 'Dorsales',
  'levator scapulae': 'Elevador de la escápula',
  'pectorals': 'Pectorales',
  'quads': 'Cuádriceps',
  'serratus anterior': 'Serrato anterior',
  'spine': 'Columna vertebral',
  'traps': 'Trapecio',
  'triceps': 'Tríceps',
  'upper back': 'Espalda superior',
  'lower back': 'Espalda baja'
};

// Función para determinar dificultad basada en el equipamiento y tipo de ejercicio
const determineDifficulty = (equipment: string, name: string): 'beginner' | 'intermediate' | 'advanced' => {
  const nameLower = name.toLowerCase();
  
  // Ejercicios avanzados
  if (nameLower.includes('muscle up') || 
      nameLower.includes('pistol') || 
      nameLower.includes('handstand') ||
      nameLower.includes('one arm') ||
      nameLower.includes('single arm')) {
    return 'advanced';
  }
  
  // Ejercicios de peso corporal tienden a ser principiante/intermedio
  if (equipment === 'body weight') {
    if (nameLower.includes('pull up') || 
        nameLower.includes('dip') || 
        nameLower.includes('burpee')) {
      return 'intermediate';
    }
    return 'beginner';
  }
  
  // Ejercicios con barra/mancuernas = intermedio por defecto
  if (equipment.includes('barbell') || equipment.includes('dumbbell')) {
    return 'intermediate';
  }
  
  // Máquinas = principiante por defecto
  if (equipment.includes('machine')) {
    return 'beginner';
  }
  
  return 'intermediate';
};

// Función para determinar categoría basada en bodyPart
const determineCategory = (bodyPart: string, target: string): 'strength' | 'cardio' | 'flexibility' | 'functional' | 'core' => {
  if (bodyPart === 'cardio' || target === 'cardiovascular system') {
    return 'cardio';
  }
  
  if (bodyPart === 'waist' || target === 'abs') {
    return 'core';
  }
  
  // Por ahora, la mayoría serán de fuerza
  return 'strength';
};

// Función para estimar calorías por minuto basada en tipo de ejercicio
const estimateCaloriesPerMinute = (equipment: string, category: string): number => {
  if (category === 'cardio') return 10;
  if (category === 'core') return 5;
  
  // Ejercicios de fuerza
  if (equipment.includes('barbell') || equipment.includes('dumbbell')) return 7;
  if (equipment === 'body weight') return 6;
  if (equipment.includes('machine')) return 5;
  
  return 6; 
};

// Función para convertir ejercicio de ExerciseDB a nuestro formato
const adaptExercise = (exercise: ExerciseDBExercise): AdaptedExercise => {
  const category = determineCategory(exercise.bodyPart, exercise.target);
  const difficulty = determineDifficulty(exercise.equipment, exercise.name);
  const caloriesPerMinute = estimateCaloriesPerMinute(exercise.equipment, category);
  
  return {
    id: exercise.id,
    name: exercise.name,
    category,
    primaryMuscles: [muscleMapping[exercise.target] || exercise.target],
    secondaryMuscles: exercise.secondaryMuscles.map(m => muscleMapping[m] || m),
    equipment: equipmentMapping[exercise.equipment] || exercise.equipment,
    difficulty,
    instructions: exercise.instructions,
    gifUrl: exercise.gifUrl,
    caloriesPerMinute,
    defaultSets: difficulty === 'beginner' ? 3 : difficulty === 'intermediate' ? 4 : 5,
    defaultReps: category === 'strength' ? 10 : 15,
    restTimeSeconds: difficulty === 'beginner' ? 60 : difficulty === 'intermediate' ? 90 : 120,
    bodyPart: exercise.bodyPart,
    target: exercise.target
  };
};

// Realiza peticiones HTTP con manejo de errores (429/401/403) y logging básico
const makeRequest = async (url: string): Promise<unknown> => {
  if (!RAPIDAPI_KEY) {
    // Sin clave -> error explícito para guiar configuración
    throw new Error('RAPIDAPI_KEY no configurada');
  }
  console.log('Making request to:', url);
  
  const response = await fetch(url, { 
    headers: getHeaders(),
    method: 'GET'
  });
  
  console.log('Response status:', response.status);
  
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Límite de API alcanzado. Intenta de nuevo más tarde.');
    } else if (response.status === 401) {
      throw new Error('Clave API inválida. Verifica tu configuración.');
    } else if (response.status === 403) {
      throw new Error('Acceso denegado. Verifica tu suscripción a RapidAPI.');
    } else {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      throw new Error(`Error HTTP: ${response.status} - ${response.statusText}`);
    }
  }
  
  const data = await response.json();
  console.log('Response data sample:', Array.isArray(data) ? data.slice(0, 2) : data);
  return data;
};


export const exerciseAPIService = {
  /**
   * Obtener todos los ejercicios
   */
  async getAllExercises(limit: number = 50, offset: number = 0): Promise<AdaptedExercise[]> {
    const cacheKey = getCacheKey('all_exercises', `${limit}_${offset}`);
    const cached = getCache(cacheKey);
    if (cached) return cached as AdaptedExercise[];

    try {
      
      const url = `${BASE_URL}/exercises` + (limit ? `?limit=${limit}&offset=${offset}` : '');
      const exercises = await makeRequest(url) as ExerciseDBExercise[];
      
      const adaptedExercises = exercises.map(adaptExercise);
      
      setCache(cacheKey, adaptedExercises);
      return adaptedExercises;
    } catch (error) {
      console.error('Error fetching all exercises:', error);
      throw new Error(`No se pudieron obtener los ejercicios: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  },

  /**
   * Obtener ejercicios por parte del cuerpo
   */
  async getExercisesByBodyPart(bodyPart: string): Promise<AdaptedExercise[]> {
    const cacheKey = getCacheKey('bodyPart', bodyPart);
    const cached = getCache(cacheKey);
    if (cached) return cached as AdaptedExercise[];

    try {
      // Endpoint correcto: /exercises/bodyPart/{bodyPart}
      const exercises = await makeRequest(
        `${BASE_URL}/exercises/bodyPart/${encodeURIComponent(bodyPart)}`
      ) as ExerciseDBExercise[];
      
      const adaptedExercises = exercises.map(adaptExercise);
      
      setCache(cacheKey, adaptedExercises);
      return adaptedExercises;
    } catch (error) {
      console.error('Error fetching exercises by body part:', error);
      throw new Error(`No se pudieron obtener ejercicios para ${bodyPart}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  },

  /**
   * Obtener ejercicios por equipamiento
   */
  async getExercisesByEquipment(equipment: string): Promise<AdaptedExercise[]> {
    const cacheKey = getCacheKey('equipment', equipment);
    const cached = getCache(cacheKey);
    if (cached) return cached as AdaptedExercise[];

    try {
      const exercises = await makeRequest(
        `${BASE_URL}/exercises/equipment/${encodeURIComponent(equipment)}`
      ) as ExerciseDBExercise[];
      
      const adaptedExercises = exercises.map(adaptExercise);
      
      setCache(cacheKey, adaptedExercises);
      return adaptedExercises;
    } catch (error) {
      console.error('Error fetching exercises by equipment:', error);
      throw new Error(`No se pudieron obtener ejercicios para equipamiento: ${equipment}`);
    }
  },

  /**
   * Obtener ejercicios por músculo objetivo
   */
  async getExercisesByTarget(target: string): Promise<AdaptedExercise[]> {
    const cacheKey = getCacheKey('target', target);
    const cached = getCache(cacheKey);
    if (cached) return cached as AdaptedExercise[];

    try {
      // Endpoint correcto: /exercises/target/{target}
      const url = `${BASE_URL}/exercises/target/${encodeURIComponent(target)}`;
      const exercises = await makeRequest(url) as ExerciseDBExercise[];
      
      const adaptedExercises = exercises.map(adaptExercise);
      
      setCache(cacheKey, adaptedExercises);
      return adaptedExercises;
    } catch (error) {
      console.error('Error fetching exercises by target:', error);
      throw new Error(`No se pudieron obtener ejercicios para músculo: ${target}`);
    }
  },

  /**
   * Buscar ejercicios por nombre 
   */
  async searchExercises(searchTerm: string): Promise<AdaptedExercise[]> {
    if (!searchTerm.trim()) {
      return this.getAllExercises(20); // Obtener algunos ejercicios por defecto
    }

    const cacheKey = getCacheKey('search', searchTerm);
    const cached = getCache(cacheKey);
    if (cached) return cached as AdaptedExercise[];

    try {
      
      const exercises = await makeRequest(
        `${BASE_URL}/exercises/name/${encodeURIComponent(searchTerm)}`
      ) as ExerciseDBExercise[];
      
      const adaptedExercises = exercises.map(adaptExercise);
      
      setCache(cacheKey, adaptedExercises);
      return adaptedExercises;
    } catch (error) {
      // Si falla la búsqueda específica, fallback a búsqueda local
      console.warn('Name search failed, trying local search:', error);
      try {
        const allExercises = await this.getAllExercises(100); // Obtener más ejercicios para buscar
        const searchLower = searchTerm.toLowerCase();
        const filtered = allExercises.filter(exercise => 
          exercise.name.toLowerCase().includes(searchLower) ||
          exercise.primaryMuscles.some(muscle => muscle.toLowerCase().includes(searchLower)) ||
          exercise.equipment.toLowerCase().includes(searchLower)
        );
        
        setCache(cacheKey, filtered);
        return filtered;
      } catch (fallbackError) {
        console.error('Error in fallback search:', fallbackError);
        throw new Error(`No se pudieron buscar ejercicios para "${searchTerm}"`);
      }
    }
  },

  /**
   * Obtener ejercicio específico por ID
   */
  async getExerciseById(id: string): Promise<AdaptedExercise | null> {
    const cacheKey = getCacheKey('exercise', id);
    const cached = getCache(cacheKey);
    if (cached) return cached as AdaptedExercise;

    try {
      
      const exercise = await makeRequest(
        `${BASE_URL}/exercises/exercise/${encodeURIComponent(id)}`
      ) as ExerciseDBExercise;
      
      const adaptedExercise = adaptExercise(exercise);
      
      setCache(cacheKey, adaptedExercise);
      return adaptedExercise;
    } catch (error) {
      console.error('Error fetching exercise by ID:', error);
      return null;
    }
  },

  /**
   * Obtener lista de partes del cuerpo disponibles
   */
  async getBodyPartsList(): Promise<string[]> {
    const cacheKey = getCacheKey('bodyPartsList');
    const cached = getCache(cacheKey);
    if (cached) return cached as string[];

    try {
      
      const bodyParts = await makeRequest(`${BASE_URL}/exercises/bodyPartList`) as string[];
      setCache(cacheKey, bodyParts);
      return bodyParts;
    } catch (error) {
      console.error('Error fetching body part list:', error);
      throw new Error('No se pudo obtener la lista de partes del cuerpo');
    }
  },

  /**
   * Obtener lista de equipamientos disponibles
   */
  async getEquipmentList(): Promise<string[]> {
    const cacheKey = getCacheKey('equipmentList');
    const cached = getCache(cacheKey);
    if (cached) return cached as string[];

    try {
      
      const equipment = await makeRequest(`${BASE_URL}/exercises/equipmentList`) as string[];
      setCache(cacheKey, equipment);
      return equipment;
    } catch (error) {
      console.error('Error fetching equipment list:', error);
      throw new Error('No se pudo obtener la lista de equipamiento');
    }
  },

  /**
   * Obtener lista de músculos objetivo disponibles
   */
  async getTargetList(): Promise<string[]> {
    const cacheKey = getCacheKey('targetList');
    const cached = getCache(cacheKey);
    if (cached) return cached as string[];

    try {
      
      const targets = await makeRequest(`${BASE_URL}/exercises/targetList`) as string[];
      setCache(cacheKey, targets);
      return targets;
    } catch (error) {
      console.error('Error fetching target list:', error);
      throw new Error('No se pudo obtener la lista de músculos objetivo');
    }
  }
};
/** 
// Función de utilidad para verificar si la API está configurada correctamente
export const checkAPIConfiguration = (): boolean => {
  if (!RAPIDAPI_KEY) {
    console.error('RAPIDAPI_KEY no está configurada.');
    return false;
  }
  return true;
};

// Función para verificar la conectividad con la API
export const testAPIConnection = async (): Promise<boolean> => {
  try {
    await makeRequest(`${BASE_URL}/exercises/bodyPartList`);
    return true;
  } catch (error) {
    console.error('API connection test failed:', error);
    return false;
  }
};
*/
// Constantes útiles para la UI
export const BODY_PARTS_SPANISH: { [key: string]: string } = {
  'back': 'Espalda',
  'cardio': 'Cardio',
  'chest': 'Pecho',
  'lower arms': 'Antebrazos',
  'lower legs': 'Piernas inferiores',
  'neck': 'Cuello',
  'shoulders': 'Hombros',
  'upper arms': 'Brazos superiores',
  'upper legs': 'Piernas superiores',
  'waist': 'Cintura'
};