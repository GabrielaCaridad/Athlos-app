import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, X, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { 
  foodDatabaseService, 
  userFoodService, 
  DatabaseFood, 
  UserFoodEntry 
} from '../../../2-logica-negocio/servicios/foodDataService';
import { usdaFoodService, AdaptedUSDAFood } from '../../../3-acceso-datos/apis-externas/usdaFoodAPI';

interface FoodTrackerProps {
  isDark: boolean;
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_CONFIG = {
  breakfast: { label: 'Desayuno', emoji: '☀️' },
  lunch: { label: 'Almuerzo', emoji: '🌤️' },
  dinner: { label: 'Cena', emoji: '🌙' },
  snack: { label: 'Snacks', emoji: '🍎' },
} as const;

export default function FoodTracker({ isDark }: FoodTrackerProps) {
  const { user } = useAuth();
  // Permitir decimales con coma o punto en los inputs
  const parseDecimal = useCallback((v: string) => {
    if (!v) return 0;
    const normalized = v.replace(',', '.').trim();
    const n = parseFloat(normalized);
    return isNaN(n) ? 0 : n;
  }, []);
  
  // Estados principales
  const [userFoods, setUserFoods] = useState<UserFoodEntry[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedMeals, setExpandedMeals] = useState<Record<MealType, boolean>>({
    breakfast: true,
    lunch: true,
    dinner: true,
    snack: true,
  });
  
  // Estados para búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [databaseFoods, setDatabaseFoods] = useState<DatabaseFood[]>([]);
  const [usdaResults, setUsdaResults] = useState<AdaptedUSDAFood[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState<MealType>('breakfast');
  // Registro manual
  const [showManual, setShowManual] = useState(false);
  const [customFood, setCustomFood] = useState<{
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
    fiber: number;
    serving: string;
    category: DatabaseFood['category'];
  }>({
    name: '',
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
    fiber: 0,
    serving: '',
    category: 'other'
  });
  
  // Estados para carrito
  interface CartItem {
    id: string;
    food: CommonFood;
    quantity: number;
    isFromDatabase: boolean;
    fdcId?: number;
  }
  type CommonFood = {
    name: string;
    calories: number;
    protein?: number;
    carbs?: number;
    fats?: number;
    fiber?: number;
    serving: string;
    category: DatabaseFood['category'];
    fdcId?: number;
  };
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isProcessingCart, setIsProcessingCart] = useState(false);

  // Totales del día
  const totalCalories = userFoods.reduce((sum, food) => sum + food.calories, 0);
  const totalProtein = Math.round(userFoods.reduce((sum, f) => sum + (f.protein || 0), 0));
  const totalCarbs = Math.round(userFoods.reduce((sum, f) => sum + (f.carbs || 0), 0));
  const totalFats = Math.round(userFoods.reduce((sum, f) => sum + (f.fats || 0), 0));

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  useEffect(() => {
    const loadData = async () => {
      if (!user) {
        setUserFoods([]);
        return;
      }
      try {
        const foods = await userFoodService.getUserFoodsByDate(user.uid, selectedDate);
        setUserFoods(foods);
        // Prefetch semanal silencioso (no usado directamente aquí)
        userFoodService.getNutritionStats(user.uid, weekAgo, today).catch(() => {});
      } catch (error) {
        console.error('Error loading foods:', error);
        setUserFoods([]);
      }
    };
    loadData();
  }, [user, selectedDate, today, weekAgo]);

  // Búsqueda
  const handleSearch = useCallback(async (term?: string) => {
    const searchValue = (term ?? searchTerm).trim();
    if (!searchValue) {
      setDatabaseFoods([]);
      setUsdaResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const [localResults, usdaFoods] = await Promise.all([
        foodDatabaseService.searchFoods(searchValue, 10),
        usdaFoodService.isConfigured() ? usdaFoodService.searchFoods(searchValue, 10) : Promise.resolve([])
      ]);
      setDatabaseFoods(localResults);
      setUsdaResults(usdaFoods);
    } catch (error) {
      console.error('Error searching:', error);
      setDatabaseFoods([]);
      setUsdaResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchTerm]);

  // Carrito
  const handleAddToCart = (food: CommonFood, isFromDatabase: boolean, fdcId?: number) => {
    const cartItem: CartItem = {
      id: `cart_${Date.now()}_${Math.random()}`,
      food: { ...food, fdcId },
      quantity: 1,
      isFromDatabase,
      fdcId
    };
    setCart((prev) => [...prev, cartItem]);
  };

  const updateCartQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity < 0.1) return;
    setCart((prev) => prev.map((it) => (it.id === itemId ? { ...it, quantity: Math.round(newQuantity * 10) / 10 } : it)));
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((it) => it.id !== itemId));
  };

  const saveCart = async () => {
    if (!user || cart.length === 0) return;
    try {
      setIsProcessingCart(true);
      await Promise.all(cart.map(async (item) => {
        const base = item.food;
        const foodData: {
          name: string;
          calories: number;
          protein?: number;
          carbs?: number;
          fats?: number;
          fiber?: number;
          serving: string;
          category: DatabaseFood['category'];
          source?: 'USDA' | 'custom';
          fdcId?: number;
          alternativeNames: string[];
        } = {
          name: base.name,
          calories: base.calories,
          protein: base.protein,
          carbs: base.carbs,
          fats: base.fats,
          fiber: base.fiber,
          serving: base.serving,
          category: base.category || 'other',
          source: (base.fdcId ? 'USDA' : 'custom') as 'USDA' | 'custom',
          fdcId: base.fdcId,
          alternativeNames: [] as string[]
        };
        return userFoodService.addUserFoodEntry(
          user.uid,
          foodData,
          selectedDate,
          item.quantity,
          selectedMealType
        );
      }));

      const updatedFoods = await userFoodService.getUserFoodsByDate(user.uid, selectedDate);
      setUserFoods(updatedFoods);
      setCart([]);
      setIsModalOpen(false);
      setSearchTerm('');
      setDatabaseFoods([]);
      setUsdaResults([]);
    } catch (err) {
      console.error('Error saving cart:', err);
    } finally {
      setIsProcessingCart(false);
    }
  };

  const deleteFood = async (entryId: string) => {
    if (!user) return;
    try {
      await userFoodService.deleteUserFoodEntry(entryId);
      setUserFoods(userFoods.filter(food => food.id !== entryId));
    } catch (error) {
      console.error('Error deleting food:', error);
    }
  };

  const getFoodsByMeal = (mealType: MealType) => userFoods.filter(food => food.mealType === mealType);
  const getCaloriesByMeal = (mealType: MealType) => getFoodsByMeal(mealType).reduce((sum, food) => sum + food.calories, 0);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header Compacto con KPIs */}
      <div className={`sticky top-0 z-10 backdrop-blur-xl border-b ${
        isDark ? 'bg-gray-900/80 border-gray-800' : 'bg-white/80 border-gray-200'
      }`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Nutrición</h1>
              <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{totalCalories} / 2200 kcal</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className={`px-4 py-2 rounded-xl border-none text-sm font-medium ${isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'}`}
              />
            </div>
          </div>

          {/* Macros Bar Minimalista */}
          <div className="grid grid-cols-3 gap-4">
            <div className={`text-center p-3 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
              <div className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Proteína</div>
              <div className={`text-xl font-bold mt-1 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{totalProtein}g</div>
            </div>
            <div className={`text-center p-3 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
              <div className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Carbohidratos</div>
              <div className={`text-xl font-bold mt-1 ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>{totalCarbs}g</div>
            </div>
            <div className={`text-center p-3 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
              <div className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Grasas</div>
              <div className={`text-xl font-bold mt-1 ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>{totalFats}g</div>
            </div>
          </div>
        </div>
      </div>

      {/* Listado de Comidas - Formato Tabla */}
      <div className="p-6 space-y-4">
        {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((mealType) => {
          const config = MEAL_CONFIG[mealType];
          const foods = getFoodsByMeal(mealType);
          const calories = getCaloriesByMeal(mealType);
          const isExpanded = expandedMeals[mealType];
          
          return (
            <div key={mealType} className={`rounded-2xl overflow-hidden ${isDark ? 'bg-gray-800' : 'bg-white border border-gray-200'}`}>
              {/* Header de Comida */}
              <button
                onClick={() => setExpandedMeals(prev => ({ ...prev, [mealType]: !prev[mealType] }))}
                className={`w-full px-6 py-4 flex items-center justify-between transition-colors ${isDark ? 'hover:bg-gray-750' : 'hover:bg-gray-50'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{config.emoji}</span>
                  <div className="text-left">
                    <div className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{config.label}</div>
                    <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{foods.length} {foods.length === 1 ? 'alimento' : 'alimentos'} • {calories} kcal</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-lg font-bold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{calories}</span>
                  {isExpanded ? (
                    <ChevronUp size={20} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                  ) : (
                    <ChevronDown size={20} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                  )}
                </div>
              </button>

              {/* Tabla de Alimentos */}
              {isExpanded && foods.length > 0 && (
                <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                  <table className="w-full">
                    <thead>
                      <tr className={`text-xs ${isDark ? 'bg-gray-750 text-gray-400' : 'bg-gray-50 text-gray-600'}`}>
                        <th className="text-left px-6 py-3 font-medium">Alimento</th>
                        <th className="text-center px-4 py-3 font-medium">Cantidad</th>
                        <th className="text-right px-4 py-3 font-medium">P</th>
                        <th className="text-right px-4 py-3 font-medium">C</th>
                        <th className="text-right px-4 py-3 font-medium">G</th>
                        <th className="text-right px-6 py-3 font-medium">Kcal</th>
                        <th className="w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {foods.map((food) => (
                        <tr key={food.id} className={`border-t transition-colors ${isDark ? 'border-gray-700 hover:bg-gray-750' : 'border-gray-100 hover:bg-gray-50'}`}>
                          <td className="px-6 py-3">
                            <div className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{food.name}</div>
                            <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{food.serving}</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{food.quantity}×</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-sm font-medium ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{Math.round(food.protein || 0)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-sm font-medium ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>{Math.round(food.carbs || 0)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-sm font-medium ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>{Math.round(food.fats || 0)}</span>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <span className={`font-bold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{food.calories}</span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => deleteFood(food.id!)}
                              className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-red-900/30 text-gray-400 hover:text-red-400' : 'hover:bg-red-50 text-gray-500 hover:text-red-600'}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Empty State */}
              {isExpanded && foods.length === 0 && (
                <div className={`px-6 py-8 text-center border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                  <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No hay alimentos registrados</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Botón Flotante para Agregar */}
      <button
        onClick={() => setIsModalOpen(true)}
        className={`fixed z-40 w-16 h-16 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 
          bottom-24 right-5 md:bottom-8 md:right-28 
          ${isDark ? 'bg-purple-600 hover:bg-purple-700' : 'bg-purple-500 hover:bg-purple-600'}`}
      >
        <Plus size={28} className="text-white" />
      </button>

      {/* Modal Full-Screen para Agregar */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto backdrop-blur-sm">
          <div className={`w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl ${isDark ? 'bg-gray-900' : 'bg-white'} flex flex-col my-auto`}>
            {/* Header del Modal */}
            <div className={`px-8 py-6 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'} flex-shrink-0`}>
              <div className="flex items-center justify-between mb-6">
                <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Agregar Alimento</h2>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setCart([]);
                    setSearchTerm('');
                    setDatabaseFoods([]);
                    setUsdaResults([]);
                  }}
                  className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
                >
                  <X size={24} />
                </button>
              </div>

              {/* Selector de Comida */}
              <div className="grid grid-cols-4 gap-2">
                {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((meal) => (
                  <button
                    key={meal}
                    onClick={() => setSelectedMealType(meal)}
                    className={`p-3 rounded-xl text-sm font-medium transition-all ${
                      selectedMealType === meal
                        ? isDark
                          ? 'bg-purple-600 text-white'
                          : 'bg-purple-500 text-white'
                        : isDark
                        ? 'bg-gray-800 text-gray-300 hover:bg-gray-750'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {MEAL_CONFIG[meal].emoji} {MEAL_CONFIG[meal].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Búsqueda */}
            <div className={`px-8 py-6 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'} flex flex-col flex-shrink-0`}>
              <div className="relative">
                <Search className={`absolute left-4 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} size={20} />
                <input
                  type="text"
                  placeholder="Buscar alimento..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    if (e.target.value.length >= 2) {
                      handleSearch(e.target.value);
                    }
                  }}
                  className={`w-full pl-12 pr-4 py-4 rounded-xl border-none text-lg ${isDark ? 'bg-gray-800 text-white placeholder-gray-500' : 'bg-gray-100 text-gray-900 placeholder-gray-400'}`}
                />
              </div>
            </div>

            {/* Contenido scrollable: resultados + registro manual */}
            <div className={`flex-1 overflow-y-auto ${cart.length > 0 ? 'pb-40' : 'pb-6'}`}>
              {/* Resultados */}
              <div className="px-8 py-6">
              {isSearching ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full" />
                </div>
              ) : (
                <div className="space-y-2">
                  {/* USDA Results */}
                  {usdaResults.map((food) => (
                    <button
                      key={food.id}
                      onClick={() => handleAddToCart(food, false, parseInt(food.id.replace('usda_', '')))}
                      className={`w-full p-4 rounded-xl text-left transition-all ${isDark ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{food.name}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500 text-white font-medium">USDA</span>
                          </div>
                          <div className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                            {food.calories} kcal • P: {food.protein}g • C: {food.carbs}g • G: {food.fats}g
                          </div>
                        </div>
                        <Plus size={20} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                      </div>
                    </button>
                  ))}

                  {/* Local Results */}
                  {databaseFoods.map((food) => (
                    <button
                      key={food.id}
                      onClick={() => handleAddToCart(food, true)}
                      className={`w-full p-4 rounded-xl text-left transition-all ${isDark ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{food.name}</span>
                          <div className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{food.calories} kcal • {food.serving}</div>
                        </div>
                        <Plus size={20} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
              </div>

              {/* Registro manual */}
              <div className="px-8 pb-4">
              <button
                onClick={() => setShowManual(v => !v)}
                className={`w-full text-left px-4 py-3 rounded-xl transition-colors font-medium ${isDark ? 'bg-gray-800 hover:bg-gray-750 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'}`}
              >
                {showManual ? '▼' : '►'} Añadir manualmente
              </button>
              {showManual && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Nombre del alimento"
                      value={customFood.name}
                      onChange={(e) => setCustomFood({ ...customFood, name: e.target.value })}
                      className={`w-full px-3 py-2 rounded-lg border-none outline-none ${isDark ? 'bg-gray-800 text-white placeholder-gray-500' : 'bg-gray-100 text-gray-900 placeholder-gray-500'}`}
                    />
                    <input
                      type="text"
                      placeholder="Porción (ej: 1 taza, 100 g)"
                      value={customFood.serving}
                      onChange={(e) => setCustomFood({ ...customFood, serving: e.target.value })}
                      className={`w-full px-3 py-2 rounded-lg border-none outline-none ${isDark ? 'bg-gray-800 text-white placeholder-gray-500' : 'bg-gray-100 text-gray-900 placeholder-gray-500'}`}
                    />
                  </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        placeholder="Calorías"
                        value={customFood.calories || ''}
                        onChange={(e) => setCustomFood({ ...customFood, calories: parseDecimal(e.target.value) })}
                        className={`w-full px-3 py-2 rounded-lg border-none outline-none ${isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'}`}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        placeholder="Proteína (g)"
                        value={customFood.protein || ''}
                        onChange={(e) => setCustomFood({ ...customFood, protein: parseDecimal(e.target.value) })}
                        className={`w-full px-3 py-2 rounded-lg border-none outline-none ${isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'}`}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        placeholder="Carbohidratos (g)"
                        value={customFood.carbs || ''}
                        onChange={(e) => setCustomFood({ ...customFood, carbs: parseDecimal(e.target.value) })}
                        className={`w-full px-3 py-2 rounded-lg border-none outline-none ${isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'}`}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        placeholder="Grasas (g)"
                        value={customFood.fats || ''}
                        onChange={(e) => setCustomFood({ ...customFood, fats: parseDecimal(e.target.value) })}
                        className={`w-full px-3 py-2 rounded-lg border-none outline-none ${isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'}`}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.,]?[0-9]*"
                        placeholder="Fibra (g)"
                        value={customFood.fiber || ''}
                        onChange={(e) => setCustomFood({ ...customFood, fiber: parseDecimal(e.target.value) })}
                        className={`w-full px-3 py-2 rounded-lg border-none outline-none ${isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'}`}
                      />
                    </div>
                  <div>
                    <select
                      value={customFood.category}
                      onChange={(e) => setCustomFood({ ...customFood, category: e.target.value as DatabaseFood['category'] })}
                      className={`w-full px-3 py-2 rounded-lg border-none outline-none ${isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'}`}
                    >
                      <option value="other">Otro</option>
                      <option value="fruits">Frutas</option>
                      <option value="vegetables">Vegetales</option>
                      <option value="grains">Granos</option>
                      <option value="proteins">Proteínas</option>
                      <option value="dairy">Lácteos</option>
                      <option value="prepared">Comida preparada</option>
                      <option value="beverages">Bebidas</option>
                      <option value="snacks">Snacks</option>
                    </select>
                  </div>
                  {(customFood.protein || customFood.carbs || customFood.fats) ? (
                    <div className={`text-xs px-3 py-2 rounded ${isDark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
                      {(() => {
                        const calc = Math.round((customFood.protein * 4) + (customFood.carbs * 4) + (customFood.fats * 9));
                        const diff = Math.abs((customFood.calories || 0) - calc);
                        return (
                          <div className="flex justify-between">
                            <span>Calorías calculadas por macros: <strong>{calc} kcal</strong></span>
                            <span className={diff > 20 ? 'text-yellow-500' : 'text-green-500'}>
                              {diff > 20 ? `Diferencia ${diff} kcal` : 'Coherente'}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setCustomFood({ name: '', calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, serving: '', category: 'other' })}
                      className={`flex-1 px-4 py-3 rounded-lg ${isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-750' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      Limpiar
                    </button>
                    <button
                      onClick={() => {
                        if (!customFood.name.trim() || !customFood.serving.trim() || customFood.calories <= 0) return;
                        const toAdd: CommonFood = { ...customFood };
                        handleAddToCart(toAdd, false);
                        setCustomFood({ name: '', calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, serving: '', category: 'other' });
                      }}
                      className={`flex-1 px-4 py-3 rounded-lg text-white ${isDark ? 'bg-green-600 hover:bg-green-700' : 'bg-green-500 hover:bg-green-600'}`}
                    >
                      Agregar al carrito
                    </button>
                  </div>
                </div>
              )}
              </div>
            </div>

            {/* Cart Footer */}
            {cart.length > 0 && (
              <div className={`px-8 py-6 border-t ${isDark ? 'border-gray-800 bg-gray-800/50' : 'border-gray-200 bg-gray-50'} flex-shrink-0`}>
                <div className="mb-4">
                  <p className={`text-sm font-medium mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Carrito ({cart.length})</p>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {cart.map((item) => (
                      <div key={item.id} className={`flex items-center gap-3 p-2 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
                        <span className={`flex-1 text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{item.food.name}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*[.,]?[0-9]*"
                          value={String(item.quantity)}
                          onChange={(e) => {
                            const val = e.target.value.replace(',', '.');
                            const num = parseFloat(val);
                            updateCartQuantity(item.id, isNaN(num) ? 0.1 : num);
                          }}
                          className={`w-24 px-2 py-1 text-center rounded ${isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'}`}
                        />
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-red-900/30 text-gray-400' : 'hover:bg-red-50 text-gray-500'}`}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                
                <button
                  onClick={saveCart}
                  disabled={isProcessingCart}
                  className={`w-full py-4 rounded-xl font-semibold text-white transition-all ${isProcessingCart ? 'bg-gray-400 cursor-not-allowed' : isDark ? 'bg-purple-600 hover:bg-purple-700' : 'bg-purple-500 hover:bg-purple-600'}`}
                >
                  {isProcessingCart ? 'Guardando...' : `Guardar ${cart.length} ${cart.length === 1 ? 'alimento' : 'alimentos'}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
 