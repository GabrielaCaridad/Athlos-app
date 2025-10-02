// FoodTracker: registra alimentos, totales diarios y estadísticas semanales.
// Secciones: estados (usuario/búsqueda/formulario/estadísticas), efectos de carga, handlers y UI.
import { useState, useEffect, useCallback } from 'react';
import { Plus, Utensils, X, Save, Search, Trash2, Clock, TrendingUp, Target, Calendar } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { 
  foodDatabaseService, 
  userFoodService, 
  DatabaseFood, 
  UserFoodEntry 
} from '../../../2-logica-negocio/servicios/foodDataService';
// import { Timestamp } from 'firebase/firestore';

interface FoodTrackerProps {
  isDark: boolean;
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export default function FoodTracker({ isDark }: FoodTrackerProps) {
  const { user } = useAuth();
  
  // Estados principales
  const [userFoods, setUserFoods] = useState<UserFoodEntry[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Estados para la búsqueda de alimentos
  const [searchTerm, setSearchTerm] = useState('');
  const [databaseFoods, setDatabaseFoods] = useState<DatabaseFood[]>([]);
  // Selección directa ya no se usa con el carrito
  const [isSearching, setIsSearching] = useState(false);
  
  // Estados para el formulario
  // Cantidad individual ya no se usa con el carrito
  const [selectedMealType, setSelectedMealType] = useState<MealType>('breakfast');
  const [customFood, setCustomFood] = useState({
    name: '',
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
    fiber: 0,
    serving: '',
    category: 'other' as DatabaseFood['category']
  });

  // Carrito de alimentos (multi-add)
  interface LocalCreateFood {
    name: string;
    calories: number;
    protein?: number;
    carbs?: number;
    fats?: number;
    fiber?: number;
    serving: string;
    category: DatabaseFood['category'];
  }
  interface CartItem {
    id: string;
    food: DatabaseFood | LocalCreateFood;
    quantity: number;
    isFromDatabase: boolean;
  }
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isProcessingCart, setIsProcessingCart] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);

  // Estados para estadísticas
  const [weeklyStats, setWeeklyStats] = useState({
    totalCalories: 0,
    averageDaily: 0,
    topFoods: [] as Array<{ name: string; count: number; calories: number }>
  });

  // Obtener la fecha actual y fechas relevantes
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Inicializar base de datos en el primer uso
  useEffect(() => {
    const initializeDatabase = async () => {
      try {
        await foodDatabaseService.initializeDatabase();
      } catch (error) {
        console.error('Error initializing food database:', error);
      }
    };

    if (user) {
      initializeDatabase();
    }
  }, [user]);

  // Cargar alimentos del día seleccionado
  useEffect(() => {
    const loadUserFoods = async () => {
      if (!user) {
        setUserFoods([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const foods = await userFoodService.getUserFoodsByDate(user.uid, selectedDate);
        setUserFoods(foods);
        
        // Cargar estadísticas semanales
        const stats = await userFoodService.getNutritionStats(user.uid, weekAgo, today);
        setWeeklyStats(stats);
      } catch (error) {
        console.error('Error loading user foods:', error);
        setUserFoods([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadUserFoods();
  }, [user, selectedDate, today, weekAgo]);

  // Buscar alimentos en la base de datos
  

  const handleSearchDatabaseFoods = useCallback(async (searchValue?: string) => {
    const term = searchValue || searchTerm;
    if (!term.trim()) {
      try {
        setIsSearching(true);
        const popular = await foodDatabaseService.searchFoods('', 20);
        setDatabaseFoods(popular);
      } catch (error) {
        console.error('Error loading popular foods:', error);
      } finally {
        setIsSearching(false);
      }
      return;
    }

    try {
      setIsSearching(true);
      const results = await foodDatabaseService.searchFoods(term, 20);
      setDatabaseFoods(results);
    } catch (error) {
      console.error('Error searching database foods:', error);
      setDatabaseFoods([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchTerm]);

  // Cargar alimentos populares al abrir el modal
  useEffect(() => {
    if (isModalOpen && databaseFoods.length === 0) {
      handleSearchDatabaseFoods('');
    }
  }, [isModalOpen, databaseFoods.length, handleSearchDatabaseFoods]);

  // Buscar automáticamente mientras el usuario escribe
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (isModalOpen) {
        handleSearchDatabaseFoods();
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, isModalOpen, handleSearchDatabaseFoods]);

  const totalCalories = userFoods.reduce((sum, food) => sum + food.calories, 0);
  const totalProtein = Math.round(userFoods.reduce((sum, f) => sum + (f.protein || 0), 0));
  const totalCarbs = Math.round(userFoods.reduce((sum, f) => sum + (f.carbs || 0), 0));
  const totalFats = Math.round(userFoods.reduce((sum, f) => sum + (f.fats || 0), 0));

  // Nota: selección directa ya no es necesaria con carrito; conservamos utilidades de formulario manual.

  // Guardado individual ya no se usa con carrito (se preserva comportamiento mediante handleSaveAllFromCart)

  // --- Carrito: agregar, actualizar, eliminar, guardar ---
  const handleAddToCart = (food: DatabaseFood | LocalCreateFood, isFromDatabase: boolean) => {
    const cartItem: CartItem = {
      id: `cart_${Date.now()}_${Math.random()}`,
      food,
      quantity: 1,
      isFromDatabase
    };
    setCart((prev) => [...prev, cartItem]);
  };

  const handleUpdateCartQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity < 0.1) return;
    const q = Math.round(newQuantity * 10) / 10;
    setCart((prev) => prev.map((it) => (it.id === itemId ? { ...it, quantity: q } : it)));
  };

  const handleRemoveFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((it) => it.id !== itemId));
  };

  const handleSaveAllFromCart = async () => {
    if (!user || cart.length === 0) return;
    try {
      setIsProcessingCart(true);
      setCartError(null);
      const savePromises = cart.map(async (item) => {
        const base = item.food;
        const foodData = {
          name: base.name,
          calories: (base as DatabaseFood | LocalCreateFood).calories ?? 0,
          protein: (base as DatabaseFood | LocalCreateFood).protein,
          carbs: (base as DatabaseFood | LocalCreateFood).carbs,
          fats: (base as DatabaseFood | LocalCreateFood).fats,
          fiber: (base as DatabaseFood | LocalCreateFood).fiber,
          serving: base.serving,
          category: base.category || 'other',
          alternativeNames: [] as string[]
        };
        return userFoodService.addUserFoodEntry(
          user.uid,
          foodData,
          selectedDate,
          item.quantity,
          selectedMealType
        );
      });
      await Promise.all(savePromises);
      // Recargar alimentos y stats
      const updatedFoods = await userFoodService.getUserFoodsByDate(user.uid, selectedDate);
      setUserFoods(updatedFoods);
      const stats = await userFoodService.getNutritionStats(user.uid, weekAgo, today);
      setWeeklyStats(stats);
      // Limpieza y cerrar
      setCart([]);
      setIsModalOpen(false);
      setSearchTerm('');
    } catch (err) {
      console.error('Error saving foods from cart:', err);
      setCartError('No se pudieron guardar los alimentos');
    } finally {
      setIsProcessingCart(false);
    }
  };

  const handleDeleteFood = async (entryId: string) => {
    if (!user) return;

    try {
      await userFoodService.deleteUserFoodEntry(entryId);
      setUserFoods(userFoods.filter(food => food.id !== entryId));
      
      // Recargar estadísticas
      const stats = await userFoodService.getNutritionStats(user.uid, weekAgo, today);
      setWeeklyStats(stats);
    } catch (error) {
      console.error('Error deleting food:', error);
    }
  };

  const resetModal = () => {
  setIsModalOpen(false);
  setSearchTerm('');
  setSelectedMealType('breakfast'); 
  setCustomFood({ name: '', calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, serving: '', category: 'other' });
};

  const getMealTypeLabel = (mealType: MealType) => {
    const labels = {
      breakfast: 'Desayuno',
      lunch: 'Almuerzo',
      dinner: 'Cena',
      snack: 'Merienda'
    };
    return labels[mealType];
  };

  const getFoodsByMealType = (mealType: MealType) => {
  return userFoods.filter(food => food.mealType === mealType);
};

const getCaloriesByMealType = (mealType: MealType) => {
  return getFoodsByMealType(mealType).reduce((sum, food) => sum + food.calories, 0);
};

  return (
    <div className="space-y-6">
      {/* Header con estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
          <div className="flex items-center gap-3">
            <Target className="text-blue-500" size={20} />
            <div>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Hoy</p>
              <p className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {totalCalories} kcal
              </p>
            </div>
          </div>
        </div>

        <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
          <div className="flex items-center gap-3">
            <TrendingUp className="text-green-500" size={20} />
            <div>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Promedio Semanal</p>
              <p className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {weeklyStats.averageDaily} kcal
              </p>
            </div>
          </div>
        </div>

        <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
          <div className="flex items-center gap-3">
            <Clock className="text-orange-500" size={20} />
            <div>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Total Semanal</p>
              <p className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {weeklyStats.totalCalories} kcal
              </p>
            </div>
          </div>
        </div>

        <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
          <div className="flex items-center gap-3">
            <Utensils className="text-purple-500" size={20} />
            <div>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Alimentos Hoy</p>
              <p className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {userFoods.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Resumen diario de macronutrientes */}
      <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Macros de hoy:</span>
          <span className={`${isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-700'} px-3 py-1 rounded-full text-xs font-medium`}>Proteína: {totalProtein} g</span>
          <span className={`${isDark ? 'bg-purple-900 text-purple-200' : 'bg-purple-100 text-purple-700'} px-3 py-1 rounded-full text-xs font-medium`}>Carbohidratos: {totalCarbs} g</span>
          <span className={`${isDark ? 'bg-orange-900 text-orange-200' : 'bg-orange-100 text-orange-700'} px-3 py-1 rounded-full text-xs font-medium`}>Grasas: {totalFats} g</span>
        </div>
      </div>

      {/* Selector de fecha */}
      <div className="flex justify-between items-center">
        <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Registro de Alimentos
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={18} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className={`px-3 py-2 rounded-lg border-none outline-none text-sm ${
                isDark
                  ? 'bg-gray-800 text-white shadow-dark-neumorph'
                  : 'bg-white text-gray-800 shadow-neumorph'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Botón para agregar alimento */}
      <button
        onClick={() => setIsModalOpen(true)}
        className={`w-full p-4 rounded-2xl flex items-center justify-center space-x-3 transition-all ${
          isDark
            ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-dark-neumorph'
            : 'bg-purple-500 hover:bg-purple-600 text-white shadow-neumorph'
        }`}
      >
        <Plus size={20} />
        <span className="font-medium">Registrar Alimento</span>
      </button>

      {/* Alimentos por tipo de comida */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((mealType) => (
          <div key={mealType} className={`p-6 rounded-2xl ${
            isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
          }`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                {getMealTypeLabel(mealType)}
              </h3>
              <span className={`text-sm font-medium px-3 py-1 rounded-full ${
                isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
              }`}>
                {getCaloriesByMealType(mealType)} kcal
              </span>
            </div>
            
            <div className="space-y-2">
              {getFoodsByMealType(mealType).length > 0 ? (
                getFoodsByMealType(mealType).map((food) => (
                  <div key={food.id} className={`flex justify-between items-center p-3 rounded-lg ${
                    isDark ? 'bg-gray-700' : 'bg-gray-50'
                  }`}>
                    <div className="flex-1">
                      <span className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-800'}`}>
                        {food.name}
                      </span>
                      <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {food.serving} {food.quantity > 1 && `× ${food.quantity}`}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                        isDark ? 'bg-gray-600 text-gray-200' : 'bg-gray-200 text-gray-700'
                      }`}>
                        {food.calories} kcal
                      </span>
                      {(food.protein || food.carbs || food.fats) && (
                        <div className="flex gap-1 text-xs">
                          {food.protein ? (
                            <span className={`${isDark ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-700'} px-1.5 py-0.5 rounded`}>P: {Math.round(food.protein)}g</span>
                          ) : null}
                          {food.carbs ? (
                            <span className={`${isDark ? 'bg-purple-900 text-purple-200' : 'bg-purple-100 text-purple-700'} px-1.5 py-0.5 rounded`}>C: {Math.round(food.carbs)}g</span>
                          ) : null}
                          {food.fats ? (
                            <span className={`${isDark ? 'bg-orange-900 text-orange-200' : 'bg-orange-100 text-orange-700'} px-1.5 py-0.5 rounded`}>G: {Math.round(food.fats)}g</span>
                          ) : null}
                        </div>
                      )}
                      <button
                        onClick={() => handleDeleteFood(food.id!)}
                        className={`p-1 rounded transition-colors ${
                          isDark
                            ? 'text-gray-400 hover:text-red-400 hover:bg-gray-600'
                            : 'text-gray-500 hover:text-red-500 hover:bg-gray-200'
                        }`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className={`text-center py-4 text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  No hay alimentos registrados para {getMealTypeLabel(mealType).toLowerCase()}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Resumen diario */}
      {userFoods.length > 0 && !isLoading && (
        <div className={`p-6 rounded-2xl ${
          isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
        }`}>
          <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>
            Resumen del Día
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((mealType) => (
              <div key={mealType} className="text-center">
                <div className={`text-2xl font-bold ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                  {getCaloriesByMealType(mealType)}
                </div>
                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  {getMealTypeLabel(mealType)}
                </div>
              </div>
            ))}
          </div>
          <div className={`mt-4 pt-4 border-t ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
            <div className="flex justify-between items-center">
              <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                Total del día:
              </span>
              <span className={`font-bold text-xl ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                {totalCalories} kcal
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Modal para registrar alimento */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl ${
            isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
          }`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                Registrar Alimento
              </h3>
              <button
                onClick={resetModal}
                className={`p-2 rounded-lg transition-all ${
                  isDark
                    ? 'hover:bg-gray-700 text-gray-400 hover:text-white'
                    : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                }`}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Tipo de comida */}
              <div>
                <label className={`block text-sm font-medium mb-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  Tipo de comida:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((mealType) => (
                    <button
                      key={mealType}
                      type="button"
                      onClick={() => setSelectedMealType(mealType)}
                      className={`p-2 rounded-lg text-sm font-medium transition-all ${
                        selectedMealType === mealType
                          ? isDark
                            ? 'bg-purple-600 text-white'
                            : 'bg-purple-500 text-white'
                          : isDark
                          ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      {getMealTypeLabel(mealType)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Búsqueda de alimentos */}
              <div className="relative">
                <Search size={18} className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${
                  isDark ? 'text-gray-400' : 'text-gray-500'
                }`} />
                <input
                  type="text"
                  placeholder="Buscar alimento en la base de datos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full pl-10 pr-4 py-3 rounded-lg border-none outline-none ${
                    isDark
                      ? 'bg-gray-700 text-white placeholder-gray-400 shadow-dark-neumorph'
                      : 'bg-gray-50 text-gray-800 placeholder-gray-500 shadow-neumorph'
                  }`}
                />
              </div>

              {/* Lista de alimentos de la base de datos */}
              <div>
                <label className={`block text-sm font-medium mb-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {searchTerm ? 'Resultados de búsqueda:' : 'Alimentos populares:'}
                </label>
                <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                  {isSearching ? (
                    <div className="text-center py-8">
                      <div className={`inline-block animate-spin rounded-full h-6 w-6 border-b-2 ${
                        isDark ? 'border-purple-400' : 'border-purple-600'
                      }`}></div>
                      <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Buscando...
                      </p>
                    </div>
                  ) : databaseFoods.length > 0 ? (
                    databaseFoods.map((food) => (
                      <div
                        key={food.id}
                        className={`p-3 rounded-lg text-left transition-all ${
                          isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        <div className="flex justify-between items-center gap-3">
                          <div className="flex-1">
                            <span className="text-sm font-medium">{food.name}</span>
                            <div className="text-xs opacity-75 mt-1">
                              {food.serving} • {food.category}
                            </div>
                            {food.isVerified && (
                              <div className="text-xs text-green-500 mt-1">✓ Verificado USDA</div>
                            )}
                            {food.usageCount > 0 && (
                              <div className="text-xs opacity-75 mt-1">
                                Usado {food.usageCount} veces
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs">{food.calories} kcal</span>
                            <button
                              type="button"
                              onClick={() => handleAddToCart({ ...food }, true)}
                              className={`${isDark ? 'bg-purple-600 hover:bg-purple-700' : 'bg-purple-500 hover:bg-purple-600'} text-white px-3 py-1 rounded text-xs`}
                            >
                              + Agregar
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {searchTerm ? 'No se encontraron alimentos. Puedes agregarlo manualmente abajo.' : 'Cargando alimentos...'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Carrito temporal */}
              {cart.length > 0 && (
                <div className={`mt-2 p-4 rounded-xl border-2 ${isDark ? 'border-purple-600 bg-purple-900 bg-opacity-20' : 'border-purple-400 bg-purple-50'}`}>
                  <div className="flex justify-between items-center mb-3">
                    <h4 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                      Carrito ({cart.length} {cart.length === 1 ? 'alimento' : 'alimentos'})
                    </h4>
                    <button onClick={() => setCart([])} className={`text-xs ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                      Vaciar
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {cart.map((item) => (
                      <div key={item.id} className={`flex items-center justify-between p-2 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-white'}`}>
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-800'}`}>{item.food.name}</p>
                          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {('calories' in item.food ? (item.food as DatabaseFood).calories : (item.food as LocalCreateFood).calories)} kcal × {item.quantity}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleUpdateCartQuantity(item.id, item.quantity - 0.5)} disabled={item.quantity <= 0.5} className={`w-6 h-6 rounded flex items-center justify-center ${isDark ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-200 hover:bg-gray-300'} disabled:opacity-30`}>-</button>
                          <input type="number" min="0.1" step="0.5" value={item.quantity} onChange={(e) => handleUpdateCartQuantity(item.id, parseFloat(e.target.value) || 0.5)} className={`w-16 text-center px-2 py-1 rounded text-sm ${isDark ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-800'}`} />
                          <button onClick={() => handleUpdateCartQuantity(item.id, item.quantity + 0.5)} className={`w-6 h-6 rounded flex items-center justify-center ${isDark ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-200 hover:bg-gray-300'}`}>+</button>
                          <button onClick={() => handleRemoveFromCart(item.id)} className={`ml-2 p-1 rounded ${isDark ? 'text-red-400 hover:bg-red-900' : 'text-red-500 hover:bg-red-50'}`}><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className={`mt-3 pt-3 border-t ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                    <div className="flex justify-between text-sm">
                      <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>Total:</span>
                      <span className={`font-bold ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
                        {cart.reduce((sum, item) => {
                          const c = 'calories' in item.food ? (item.food as DatabaseFood).calories : (item.food as LocalCreateFood).calories;
                          return sum + c * item.quantity;
                        }, 0)} kcal
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {cartError && (
                <div className={`p-3 rounded-lg text-sm ${isDark ? 'bg-red-900 text-red-200' : 'bg-red-50 text-red-700'}`}>
                  {cartError}
                </div>
              )}

              {/* Entrada manual */}
              <div className="space-y-4">
                <div className={`h-px ${isDark ? 'bg-gray-600' : 'bg-gray-200'}`} />
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  O ingresa manualmente:
                </label>
                
                <input
                  type="text"
                  placeholder="Nombre del alimento"
                  value={customFood.name}
                  onChange={(e) => setCustomFood({ ...customFood, name: e.target.value })}
                  className={`w-full px-4 py-3 rounded-lg border-none outline-none ${
                    isDark
                      ? 'bg-gray-700 text-white placeholder-gray-400 shadow-dark-neumorph'
                      : 'bg-gray-50 text-gray-800 placeholder-gray-500 shadow-neumorph'
                  }`}
                />

                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    placeholder="Calorías"
                    value={customFood.calories || ''}
                    onChange={(e) => setCustomFood({ ...customFood, calories: parseInt(e.target.value) || 0 })}
                    className={`px-4 py-3 rounded-lg border-none outline-none ${
                      isDark
                        ? 'bg-gray-700 text-white placeholder-gray-400 shadow-dark-neumorph'
                        : 'bg-gray-50 text-gray-800 placeholder-gray-500 shadow-neumorph'
                    }`}
                  />
                  <input
                    type="text"
                    placeholder="Porción (ej: 1 taza)"
                    value={customFood.serving}
                    onChange={(e) => setCustomFood({ ...customFood, serving: e.target.value })}
                    className={`px-4 py-3 rounded-lg border-none outline-none ${
                      isDark
                        ? 'bg-gray-700 text-white placeholder-gray-400 shadow-dark-neumorph'
                        : 'bg-gray-50 text-gray-800 placeholder-gray-500 shadow-neumorph'
                    }`}
                  />
                </div>

                {/* Macros */}
                <div>
                  <h4 className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    Información Nutricional
                  </h4>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="Proteína (g)"
                      value={customFood.protein || ''}
                      onChange={(e) => setCustomFood({ ...customFood, protein: parseFloat(e.target.value) || 0 })}
                      className={`px-4 py-3 rounded-lg border-none outline-none ${
                        isDark ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-800'
                      }`}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="Carbohidratos (g)"
                      value={customFood.carbs || ''}
                      onChange={(e) => setCustomFood({ ...customFood, carbs: parseFloat(e.target.value) || 0 })}
                      className={`px-4 py-3 rounded-lg border-none outline-none ${
                        isDark ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-800'
                      }`}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="Grasas (g)"
                      value={customFood.fats || ''}
                      onChange={(e) => setCustomFood({ ...customFood, fats: parseFloat(e.target.value) || 0 })}
                      className={`px-4 py-3 rounded-lg border-none outline-none ${
                        isDark ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-800'
                      }`}
                    />
                  </div>
                  {customFood.protein > 0 && customFood.carbs > 0 && customFood.fats > 0 && (
                    <div className={`text-xs p-2 mt-2 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                      <div className="flex justify-between items-center">
                        <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>
                          Calorías calculadas:
                        </span>
                        <span className={`font-mono ${
                          Math.abs(customFood.calories - ((customFood.protein * 4) + (customFood.carbs * 4) + (customFood.fats * 9))) > 20
                            ? 'text-yellow-500'
                            : 'text-green-500'
                        }`}>
                          {Math.round((customFood.protein * 4) + (customFood.carbs * 4) + (customFood.fats * 9))} kcal
                        </span>
                      </div>
                      {Math.abs(customFood.calories - ((customFood.protein * 4) + (customFood.carbs * 4) + (customFood.fats * 9))) > 20 && (
                        <div className="text-yellow-500 mt-1 flex items-center gap-1">
                          <span>⚠️</span>
                          <span>Discrepancia detectada entre calorías y macros</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <select
                  value={customFood.category}
                  onChange={(e) => setCustomFood({ ...customFood, category: e.target.value as DatabaseFood['category'] })}
                  className={`w-full px-4 py-3 rounded-lg border-none outline-none ${
                    isDark
                      ? 'bg-gray-700 text-white shadow-dark-neumorph'
                      : 'bg-gray-50 text-gray-800 shadow-neumorph'
                  }`}
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
              
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={() => { resetModal(); setCart([]); setSearchTerm(''); }}
                  className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                    isDark
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 shadow-dark-neumorph'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 shadow-neumorph'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (!customFood.name.trim() || customFood.calories <= 0) return;
                    handleAddToCart({ ...customFood }, false);
                    setCustomFood({ name: '', calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, serving: '', category: 'other' });
                  }}
                  className={`${isDark ? 'bg-green-600 hover:bg-green-700' : 'bg-green-500 hover:bg-green-600'} text-white px-3 py-3 rounded-lg font-medium`}
                >
                  + Agregar al Carrito
                </button>
                <button
                  onClick={handleSaveAllFromCart}
                  disabled={cart.length === 0 || isProcessingCart}
                  className={`flex-1 py-3 rounded-lg font-medium text-white transition-all flex items-center justify-center gap-2 ${
                    cart.length === 0 || isProcessingCart
                      ? 'bg-gray-400 cursor-not-allowed'
                      : isDark
                      ? 'bg-purple-600 hover:bg-purple-700 shadow-dark-neumorph'
                      : 'bg-purple-500 hover:bg-purple-600 shadow-neumorph'
                  }`}
                >
                  <Save size={16} />
                  <span>{isProcessingCart ? 'Guardando…' : `Guardar ${cart.length > 0 ? `(${cart.length})` : 'Todo'}`}</span>
                </button>
              </div>
            </div>

            {/* Nota sobre la base de datos */}
            <div className={`mt-4 pt-4 border-t text-xs text-center ${
              isDark ? 'border-gray-600 text-gray-500' : 'border-gray-200 text-gray-400'
            }`}>
              Los alimentos que agregues se guardarán en tu base de datos personal para uso futuro
            </div>
          </div>
        </div>
      )}
    </div>
  );
}