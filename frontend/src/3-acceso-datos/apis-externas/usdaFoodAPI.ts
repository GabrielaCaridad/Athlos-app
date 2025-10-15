// usdaFoodAPI.ts - Integración con USDA FoodData Central
const USDA_API_KEY = import.meta.env.VITE_USDA_API_KEY as string | undefined;
const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

// Interfaces
export interface USDAFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients: USDANutrient[];
  brandOwner?: string;
  brandName?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
}

export interface USDANutrient {
  nutrientId: number;
  nutrientName: string;
  nutrientNumber: string;
  unitName: string;
  value: number;
}

export interface AdaptedUSDAFood {
  id: string;
  fdcId: number;
  name: string;
  nameEnglish: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  serving: string;
  servingGrams: number;
  category: 'fruits' | 'vegetables' | 'grains' | 'proteins' | 'dairy' | 'prepared' | 'beverages' | 'snacks' | 'other';
  source: 'USDA';
  isVerified: true;
}

// Mapeo de nutrientes USDA
const NUTRIENT_MAP = {
  ENERGY: 1008,      // Calorías (kcal)
  PROTEIN: 1003,     // Proteína (g)
  CARBS: 1005,       // Carbohidratos totales (g)
  FATS: 1004,        // Grasas totales (g)
  FIBER: 1079,       // Fibra dietética (g)
};

// Traducciones español-inglés (expandible)
const FOOD_TRANSLATIONS: Record<string, string> = {
  // Frutas
  'manzana': 'apple',
  'platano': 'banana',
  'plátano': 'banana',
  'naranja': 'orange',
  'fresa': 'strawberry',
  'uva': 'grape',
  'sandia': 'watermelon',
  'sandía': 'watermelon',
  'piña': 'pineapple',
  'mango': 'mango',
  'pera': 'pear',
  'durazno': 'peach',
  'melon': 'melon',
  'melón': 'melon',
  'kiwi': 'kiwi',
  'limon': 'lemon',
  'limón': 'lemon',
  
  // Verduras
  'tomate': 'tomato',
  'lechuga': 'lettuce',
  'zanahoria': 'carrot',
  'brocoli': 'broccoli',
  'brócoli': 'broccoli',
  'espinaca': 'spinach',
  'papa': 'potato',
  'patata': 'potato',
  'cebolla': 'onion',
  'pepino': 'cucumber',
  'calabaza': 'pumpkin',
  'pimiento': 'pepper',
  'ajo': 'garlic',
  'aguacate': 'avocado',
  'palta': 'avocado',
  
  // Proteínas
  'pollo': 'chicken',
  'carne': 'beef',
  'res': 'beef',
  'cerdo': 'pork',
  'puerco': 'pork',
  'pescado': 'fish',
  'salmon': 'salmon',
  'salmón': 'salmon',
  'atun': 'tuna',
  'atún': 'tuna',
  'huevo': 'egg',
  'huevos': 'eggs',
  'pavo': 'turkey',
  
  // Lácteos
  'leche': 'milk',
  'queso': 'cheese',
  'yogur': 'yogurt',
  'yogurt': 'yogurt',
  'mantequilla': 'butter',
  
  // Granos
  'arroz': 'rice',
  'pan': 'bread',
  'pasta': 'pasta',
  'avena': 'oats',
  'cereal': 'cereal',
  'trigo': 'wheat',
  'maiz': 'corn',
  'maíz': 'corn',
  
  // Términos de preparación
  'crudo': 'raw',
  'cocido': 'cooked',
  'hervido': 'boiled',
  'parrilla': 'grilled',
  'frito': 'fried',
  'fresco': 'fresh',
  'congelado': 'frozen',
  'enlatado': 'canned',
  'entero': 'whole',
  'descremada': 'skim',
  'descremado': 'skim',
};

// Traducciones inglés-español para resultados
const REVERSE_TRANSLATIONS: Record<string, string> = Object.entries(FOOD_TRANSLATIONS).reduce((acc, [es, en]) => {
  acc[en.toLowerCase()] = es;
  return acc;
}, {} as Record<string, string>);

// Categorización automática
function categorizeFood(description: string): AdaptedUSDAFood['category'] {
  const desc = description.toLowerCase();
  
  if (desc.includes('fruit') || desc.includes('apple') || desc.includes('banana') || 
      desc.includes('orange') || desc.includes('berry') || desc.includes('grape') ||
      desc.includes('melon') || desc.includes('pear') || desc.includes('peach')) {
    return 'fruits';
  }
  
  if (desc.includes('vegetable') || desc.includes('broccoli') || desc.includes('carrot') ||
      desc.includes('lettuce') || desc.includes('spinach') || desc.includes('tomato') ||
      desc.includes('pepper') || desc.includes('onion') || desc.includes('cucumber')) {
    return 'vegetables';
  }
  
  if (desc.includes('chicken') || desc.includes('beef') || desc.includes('pork') ||
      desc.includes('fish') || desc.includes('salmon') || desc.includes('tuna') ||
      desc.includes('egg') || desc.includes('meat') || desc.includes('turkey')) {
    return 'proteins';
  }
  
  if (desc.includes('milk') || desc.includes('cheese') || desc.includes('yogurt') ||
      desc.includes('dairy') || desc.includes('butter')) {
    return 'dairy';
  }
  
  if (desc.includes('rice') || desc.includes('bread') || desc.includes('pasta') ||
      desc.includes('cereal') || desc.includes('oat') || desc.includes('grain') ||
      desc.includes('wheat') || desc.includes('corn')) {
    return 'grains';
  }
  
  if (desc.includes('juice') || desc.includes('soda') || desc.includes('water') ||
      desc.includes('drink') || desc.includes('beverage') || desc.includes('coffee') ||
      desc.includes('tea')) {
    return 'beverages';
  }
  
  if (desc.includes('snack') || desc.includes('chip') || desc.includes('cookie') ||
      desc.includes('candy') || desc.includes('chocolate')) {
    return 'snacks';
  }
  
  return 'other';
}

// Traducir de inglés a español (mejorado)
function translateToSpanish(englishName: string): string {
  let translated = englishName.toLowerCase();
  
  // Reemplazar palabras completas
  Object.entries(REVERSE_TRANSLATIONS).forEach(([en, es]) => {
    const regex = new RegExp(`\\b${en}\\b`, 'gi');
    translated = translated.replace(regex, es);
  });
  
  // Si no se tradujo nada significativo, devolver el original con formato
  const significantChange = Object.keys(REVERSE_TRANSLATIONS).some(en => 
    englishName.toLowerCase().includes(en)
  );
  
  if (!significantChange) {
    return englishName
      .split(',')[0] // Tomar solo la primera parte antes de la coma
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  // Capitalizar
  return translated.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Traducir de español a inglés para búsqueda
function translateToEnglish(spanishQuery: string): string {
  let translated = spanishQuery.toLowerCase();
  
  Object.entries(FOOD_TRANSLATIONS).forEach(([es, en]) => {
    const regex = new RegExp(`\\b${es}\\b`, 'gi');
    translated = translated.replace(regex, en);
  });
  
  return translated;
}

// Extraer valor de nutriente
function getNutrientValue(nutrients: USDANutrient[], nutrientId: number): number {
  const nutrient = nutrients.find(n => n.nutrientId === nutrientId);
  return nutrient ? Math.round(nutrient.value * 10) / 10 : 0;
}

// Adaptar alimento de USDA a nuestro formato
function adaptUSDAFood(usdaFood: USDAFood): AdaptedUSDAFood {
  const calories = getNutrientValue(usdaFood.foodNutrients, NUTRIENT_MAP.ENERGY);
  const protein = getNutrientValue(usdaFood.foodNutrients, NUTRIENT_MAP.PROTEIN);
  const carbs = getNutrientValue(usdaFood.foodNutrients, NUTRIENT_MAP.CARBS);
  const fats = getNutrientValue(usdaFood.foodNutrients, NUTRIENT_MAP.FATS);
  const fiber = getNutrientValue(usdaFood.foodNutrients, NUTRIENT_MAP.FIBER);
  
  // Determinar porción
  let serving = '100g';
  let servingGrams = 100;
  
  if (usdaFood.householdServingFullText) {
    serving = usdaFood.householdServingFullText;
    servingGrams = usdaFood.servingSize || 100;
  } else if (usdaFood.servingSize && usdaFood.servingSizeUnit) {
    serving = `${usdaFood.servingSize}${usdaFood.servingSizeUnit}`;
    servingGrams = usdaFood.servingSize;
  }
  
  const nameEnglish = usdaFood.description;
  const nameSpanish = translateToSpanish(nameEnglish);
  
  return {
    id: `usda_${usdaFood.fdcId}`,
    fdcId: usdaFood.fdcId,
    name: nameSpanish,
    nameEnglish,
    calories,
    protein,
    carbs,
    fats,
    fiber,
    serving,
    servingGrams,
    category: categorizeFood(usdaFood.description),
    source: 'USDA',
    isVerified: true,
  };
}

// Cache
interface CacheItem {
  data: AdaptedUSDAFood[];
  timestamp: number;
}

const searchCache = new Map<string, CacheItem>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutos

function getCachedSearch(query: string): AdaptedUSDAFood[] | null {
  const cached = searchCache.get(query.toLowerCase());
  if (!cached) return null;
  
  if (Date.now() - cached.timestamp > CACHE_DURATION) {
    searchCache.delete(query.toLowerCase());
    return null;
  }
  
  return cached.data;
}

function setCachedSearch(query: string, data: AdaptedUSDAFood[]) {
  searchCache.set(query.toLowerCase(), {
    data,
    timestamp: Date.now(),
  });
}

// Servicio principal
export const usdaFoodService = {
  /**
   * Buscar alimentos en USDA (traduce automáticamente)
   */
  async searchFoods(query: string, limit: number = 20): Promise<AdaptedUSDAFood[]> {
    if (!USDA_API_KEY) {
      console.warn('⚠️ VITE_USDA_API_KEY no configurada. Agrega tu API key al .env');
      return [];
    }
    
    if (!query.trim()) return [];
    
    // Verificar cache
    const cached = getCachedSearch(query);
    if (cached) {
      console.log('✅ Cache hit para:', query);
      return cached.slice(0, limit);
    }
    
    try {
      // Traducir query al inglés si es necesario
      const englishQuery = translateToEnglish(query);
      console.log(`🔍 Buscando en USDA: "${query}" → "${englishQuery}"`);
      
      const url = `${USDA_BASE_URL}/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(englishQuery)}&pageSize=${Math.min(limit, 50)}&dataType=Survey (FNDDS),Foundation,SR Legacy`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('API key inválida o sin permisos');
        }
        throw new Error(`USDA API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.foods || data.foods.length === 0) {
        console.log('ℹ️ Sin resultados para:', query);
        return [];
      }
      
      const adaptedFoods = data.foods
        .map((food: USDAFood) => adaptUSDAFood(food))
        .filter((food: AdaptedUSDAFood) => food.calories > 0);
      
      // Guardar en cache
      setCachedSearch(query, adaptedFoods);
      
      console.log(`✅ ${adaptedFoods.length} alimentos encontrados`);
      return adaptedFoods.slice(0, limit);
      
    } catch (error) {
      console.error('❌ Error USDA API:', error);
      return [];
    }
  },
  
  /**
   * Obtener alimento por ID
   */
  async getFoodById(fdcId: number): Promise<AdaptedUSDAFood | null> {
    if (!USDA_API_KEY) return null;
    
    try {
      const url = `${USDA_BASE_URL}/food/${fdcId}?api_key=${USDA_API_KEY}`;
      const response = await fetch(url);
      
      if (!response.ok) return null;
      
      const data = await response.json();
      return adaptUSDAFood(data);
      
    } catch (error) {
      console.error('❌ Error al obtener alimento:', error);
      return null;
    }
  },
  
  /**
   * Verificar configuración
   */
  isConfigured(): boolean {
    return !!USDA_API_KEY;
  },
  
  /**
   * Limpiar cache
   */
  clearCache(): void {
    searchCache.clear();
    console.log('🗑️ Cache limpiado');
  },
};
