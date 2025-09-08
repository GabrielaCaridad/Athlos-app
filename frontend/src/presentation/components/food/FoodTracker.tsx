import React, { useState, useEffect } from 'react';
import { Plus, Utensils, X, Save, Search, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { foodService} from '../../../business/services/firestoreService';
import { verifiedFoods, VerifiedFood, searchFoodByName } from '../../../data/models/VerifiedFoods';

interface FoodEntry {
  id: string;
  userId: string;
  name: string;
  calories: number;
  serving: string;
  date: string;
  createdAt: Date;
}

interface FoodTrackerProps {
  isDark: boolean;
}

export default function FoodTracker({ isDark }: FoodTrackerProps) {
  const { user } = useAuth();
  const [foods, setFoods] = useState<FoodEntry[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFood, setSelectedFood] = useState<VerifiedFood | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [customFood, setCustomFood] = useState({
    name: '',
    calories: 0,
    serving: ''
  });

  // Obtener la fecha actual en formato YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];

  // Cargar alimentos del día actual cuando el componente se monta o cambia el usuario
  useEffect(() => {
    const loadTodaysFoods = async () => {
      if (!user) {
        setFoods([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const todaysFoods = await foodService.getFoodsByDate(user.uid, today);
        
        // Convertir los datos de Firebase al formato esperado
        const formattedFoods: FoodEntry[] = todaysFoods.map(food => ({
          id: food.id!,
          userId: food.userId,
          name: food.name,
          calories: food.calories,
          serving: food.serving,
          date: food.date,
          createdAt: food.createdAt.toDate() // Convertir Timestamp a Date
        }));
        
        setFoods(formattedFoods);
      } catch (error) {
        console.error('Error loading foods:', error);
        setFoods([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadTodaysFoods();
  }, [user, today]); // Se ejecuta cuando cambia el usuario o la fecha

  // Filtrar alimentos según búsqueda
  const filteredFoods = searchTerm 
    ? searchFoodByName(searchTerm)
    : verifiedFoods;

  const totalCalories = foods.reduce((sum, food) => sum + food.calories, 0);

  const handleSelectFood = (food: VerifiedFood) => {
    setSelectedFood(food);
    setCustomFood({
      name: food.name,
      calories: food.calories,
      serving: food.serving
    });
  };

  const handleAddFood = async () => {
    if (!customFood.name.trim() || !user) return;

    try {
      const foodData = {
        name: customFood.name,
        calories: customFood.calories,
        serving: customFood.serving,
        date: today
      };
      
      const foodId = await foodService.addFood(user.uid, foodData);
      const newFoodEntry: FoodEntry = {
        id: foodId,
        userId: user.uid,
        ...foodData,
        createdAt: new Date()
      };
      
      // Agregar el nuevo alimento al estado local
      setFoods([newFoodEntry, ...foods]);
      resetModal();
    } catch (error) {
      console.error('Error adding food:', error);
    }
  };

  const handleDeleteFood = async (foodId: string) => {
    if (!user) return;

    try {
      await foodService.deleteFood(foodId);
      // Remover el alimento del estado local
      setFoods(foods.filter(food => food.id !== foodId));
    } catch (error) {
      console.error('Error deleting food:', error);
    }
  };

  const resetModal = () => {
    setIsModalOpen(false);
    setSelectedFood(null);
    setSearchTerm('');
    setCustomFood({ name: '', calories: 0, serving: '' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Registro de Alimentos
        </h2>
        <div className={`px-4 py-2 rounded-full ${
          isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
        }`}>
          <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            {totalCalories} kcal hoy
          </span>
        </div>
      </div>

      {/* Add Food Button */}
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

      {/* Today's Foods */}
      <div className={`p-6 rounded-2xl ${
        isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
      }`}>
        <h3 className={`text-lg font-semibold mb-4 flex items-center space-x-2 ${
          isDark ? 'text-white' : 'text-gray-800'
        }`}>
          <Utensils size={20} />
          <span>Alimentos de Hoy</span>
        </h3>
        
        {isLoading ? (
          // Indicador de carga
          <div className="text-center py-8">
            <div className={`inline-block animate-spin rounded-full h-8 w-8 border-b-2 ${
              isDark ? 'border-purple-400' : 'border-purple-600'
            }`}></div>
            <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Cargando alimentos...
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {foods.length > 0 ? (
              foods.map((food) => (
                <div key={food.id} className={`flex justify-between items-center p-3 rounded-lg ${
                  isDark ? 'bg-gray-700' : 'bg-gray-50'
                }`}>
                  <div className="flex-1">
                    <span className={`font-medium ${isDark ? 'text-white' : 'text-gray-800'}`}>
                      {food.name}
                    </span>
                    <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {food.serving}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
                      isDark ? 'bg-gray-600 text-gray-200' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {food.calories} kcal
                    </span>
                    <button
                      onClick={() => handleDeleteFood(food.id)}
                      className={`p-1 rounded transition-colors ${
                        isDark
                          ? 'text-gray-400 hover:text-red-400 hover:bg-gray-600'
                          : 'text-gray-500 hover:text-red-500 hover:bg-gray-200'
                      }`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                No hay alimentos registrados hoy
              </p>
            )}
          </div>
        )}

        {foods.length > 0 && !isLoading && (
          <div className={`mt-4 pt-4 border-t ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
            <div className="flex justify-between items-center">
              <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                Total del día:
              </span>
              <span className={`font-bold text-lg ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                {totalCalories} kcal
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 rounded-2xl ${
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
              {/* Search Box */}
              <div className="relative">
                <Search size={18} className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${
                  isDark ? 'text-gray-400' : 'text-gray-500'
                }`} />
                <input
                  type="text"
                  placeholder="Buscar alimento..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full pl-10 pr-4 py-3 rounded-lg border-none outline-none ${
                    isDark
                      ? 'bg-gray-700 text-white placeholder-gray-400 shadow-dark-neumorph'
                      : 'bg-gray-50 text-gray-800 placeholder-gray-500 shadow-neumorph'
                  }`}
                />
              </div>

              {/* Lista de comida */}
              <div>
                <label className={`block text-sm font-medium mb-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  Selecciona un alimento:
                </label>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                  {filteredFoods.map((food) => (
                    <button
                      key={food.id}
                      type="button"
                      onClick={() => handleSelectFood(food)}
                      className={`p-3 rounded-lg text-left transition-all ${
                        selectedFood?.id === food.id
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
                          <div className="text-xs opacity-75 mt-1">{food.serving}</div>
                        </div>
                        <span className="text-xs ml-2">{food.calories} kcal</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Manual Input */}
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

            {/* USDA Citation */}
            <div className={`mt-4 pt-4 border-t text-xs text-center ${
              isDark ? 'border-gray-600 text-gray-500' : 'border-gray-200 text-gray-400'
            }`}>
              Datos nutricionales verificados por USDA FoodData Central
            </div>
          </div>
        </div>
      )}
    </div>
  );
}