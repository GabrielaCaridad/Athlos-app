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
} from '../../../business/services/foodDataService';
import { Timestamp } from 'firebase/firestore';

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
  const [selectedDatabaseFood, setSelectedDatabaseFood] = useState<DatabaseFood | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  // Estados para el formulario
  const [quantity, setQuantity] = useState(1);
  const [selectedMealType, setSelectedMealType] = useState<MealType>('breakfast');
  const [customFood, setCustomFood] = useState({
    name: '',
    calories: 0,
    serving: '',
    category: 'other' as DatabaseFood['category']
  });

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

  const handleSelectDatabaseFood = (food: DatabaseFood) => {
    setSelectedDatabaseFood(food);
    setCustomFood({
      name: food.name,
      calories: food.calories,
      serving: food.serving,
      category: food.category
    });
  };

  const handleAddFood = async () => {
    if (!customFood.name.trim() || !user) return;

    try {
      const foodData = {
        name: customFood.name,
        calories: customFood.calories,
        serving: customFood.serving,
        category: customFood.category,
        alternativeNames: []
      };
      
      const entryId = await userFoodService.addUserFoodEntry(
      user.uid,
      foodData,
      selectedDate,
      quantity,
      selectedMealType  
      );

      // Agregar al estado local
      const newEntry: UserFoodEntry = {
        id: entryId,
        userId: user.uid,
        databaseFoodId: selectedDatabaseFood?.id || 'custom',
        name: customFood.name,
        calories: customFood.calories * quantity,
        serving: customFood.serving,
        quantity,
        date: selectedDate,
        createdAt: Timestamp.fromDate(new Date()),
      };
      
      setUserFoods([newEntry, ...userFoods]);
      resetModal();
      
      // Recargar estadísticas
      const stats = await userFoodService.getNutritionStats(user.uid, weekAgo, today);
      setWeeklyStats(stats);
    } catch (error) {
      console.error('Error adding food:', error);
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
  setSelectedDatabaseFood(null);
  setSearchTerm('');
  setQuantity(1);
  setSelectedMealType('breakfast'); 
  setCustomFood({ name: '', calories: 0, serving: '', category: 'other' });
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
                      <button
                        key={food.id}
                        type="button"
                        onClick={() => handleSelectDatabaseFood(food)}
                        className={`p-3 rounded-lg text-left transition-all ${
                          selectedDatabaseFood?.id === food.id
                            ? isDark
                              ? 'bg-purple-600 text-white'
                              : 'bg-purple-500 text-white'
                            : isDark
                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        <div className="flex justify-between items-start">
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
                          <span className="text-xs ml-2">{food.calories} kcal</span>
                        </div>
                      </button>
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

              {/* Cantidad */}
              {selectedDatabaseFood && (
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    Cantidad:
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    placeholder="1.0"
                    value={quantity}
                    onChange={(e) => setQuantity(parseFloat(e.target.value) || 1)}
                    className={`w-full px-4 py-3 rounded-lg border-none outline-none ${
                      isDark
                        ? 'bg-gray-700 text-white placeholder-gray-400 shadow-dark-neumorph'
                        : 'bg-gray-50 text-gray-800 placeholder-gray-500 shadow-neumorph'
                    }`}
                  />
                  <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Calorías totales: {Math.round(customFood.calories * quantity)} kcal
                  </p>
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
                  onClick={resetModal}
                  className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                    isDark
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 shadow-dark-neumorph'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 shadow-neumorph'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddFood}
                  disabled={!customFood.name.trim() || customFood.calories <= 0}
                  className={`flex-1 py-3 rounded-lg font-medium text-white transition-all flex items-center justify-center space-x-2 ${
                    !customFood.name.trim() || customFood.calories <= 0
                      ? 'bg-gray-400 cursor-not-allowed'
                      : isDark
                      ? 'bg-purple-600 hover:bg-purple-700 shadow-dark-neumorph'
                      : 'bg-purple-500 hover:bg-purple-600 shadow-neumorph'
                  }`}
                >
                  <Save size={16} />
                  <span>Guardar</span>
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