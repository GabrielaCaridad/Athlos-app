import { useEffect, useState } from 'react';
import { Utensils, Dumbbell, Zap, Brain, TrendingUp } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePersonalInsights } from '../../hooks/usePersonalInsights';
import { userFoodService, workoutService } from '../../../2-logica-negocio/servicios';

interface DashboardProps {
  isDark: boolean;
}

// Tipos ligeros para evitar `any`
type FoodEntryLite = { calories?: number };
type FirestoreLikeTimestamp = { toDate?: () => Date };
type WorkoutLite = { createdAt?: Date | FirestoreLikeTimestamp; postEnergyLevel?: number | null };

export default function Dashboard({ isDark }: DashboardProps) {
  const { user } = useAuth();
  const { insights } = usePersonalInsights(user?.uid || '');

  // Estados para métricas
  const [totalCaloriesToday, setTotalCaloriesToday] = useState(0);
  const [mealsTodayCount, setMealsTodayCount] = useState(0);
  const [workoutsThisWeek, setWorkoutsThisWeek] = useState(0);
  const [avgEnergy, setAvgEnergy] = useState(0);
  const [loading, setLoading] = useState(true);

  const targetCalories = 2200;
  const targetMeals = 3;
  const insightsCount = insights.length;

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const loadDashboardData = async () => {
      try {
        setLoading(true);

        // 1. Calorías de hoy
        const today = new Date().toISOString().split('T')[0];
  const foods = await userFoodService.getUserFoodsByDate(user.uid, today) as FoodEntryLite[];
        const caloriesSum = foods.reduce((sum, food) => sum + (food.calories || 0), 0);
        setTotalCaloriesToday(Math.round(caloriesSum));
  setMealsTodayCount(foods.length);

        // 2. Entrenamientos de esta semana
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const allWorkouts = await workoutService.getUserWorkouts(user.uid) as WorkoutLite[];
        const recentWorkouts = allWorkouts.filter((workout) => {
          const src = workout?.createdAt;
          const workoutDate: Date | undefined = src
            ? (src instanceof Date
                ? src
                : typeof (src as FirestoreLikeTimestamp).toDate === 'function'
                  ? (src as FirestoreLikeTimestamp).toDate?.()
                  : undefined)
            : undefined;
          return workoutDate ? workoutDate >= weekAgo : false;
        });
        setWorkoutsThisWeek(recentWorkouts.length);

        // 3. Energía promedio
        const energyLevels = recentWorkouts
          .map((w) => w.postEnergyLevel)
          .filter((e): e is number => e !== undefined && e !== null && e > 0);
        const avgEnergyLevel = energyLevels.length > 0
          ? energyLevels.reduce((sum, e) => sum + e, 0) / energyLevels.length
          : 0;
        setAvgEnergy(avgEnergyLevel);
      } catch (error) {
        console.error('❌ Error cargando datos del dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [user?.uid]);

  return (
    <div className={`py-4 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
      {/* Saludo compacto */}
      <div className={`mb-6 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
        <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          👋 Hola, {user?.displayName || 'Demo'}
        </h1>
        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          {new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Tarjeta de progreso principal */}
      <div className={`mb-6 p-6 rounded-2xl ${
        isDark 
          ? 'bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-700/50' 
          : 'bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            🎯 Progreso de Hoy
          </h3>
          <span className={`text-2xl font-bold ${
            totalCaloriesToday >= targetCalories * 0.9 
              ? 'text-green-500' 
              : 'text-yellow-500'
          }`}>
            {Math.round((totalCaloriesToday / targetCalories) * 100)}%
          </span>
        </div>
        
        <div className="flex items-center gap-4 mb-2">
          <span className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {totalCaloriesToday.toLocaleString()}
          </span>
          <span className={`text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            / {targetCalories.toLocaleString()} kcal
          </span>
        </div>
        
        <div className={`w-full rounded-full h-3 ${isDark ? 'bg-gray-700' : 'bg-white/50'}`}>
          <div 
            className="h-3 rounded-full transition-all duration-500 bg-gradient-to-r from-green-500 to-emerald-500" 
            style={{ width: `${Math.min((totalCaloriesToday / targetCalories) * 100, 100)}%` }}
          />
        </div>
        
        {totalCaloriesToday < targetCalories * 0.5 && (
          <p className={`text-xs mt-2 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
            ⚠️ Recuerda registrar todas tus comidas del día
          </p>
        )}
      </div>

      {/* Resumen de la Semana (compacto) */}
      <div className="mb-6">
        <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          📊 Resumen de la Semana
        </h3>
        
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className={`p-4 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-gray-200'} animate-pulse`}>
                <div className="h-5 w-20 bg-gray-400/40 rounded mb-3"></div>
                <div className="h-7 w-24 bg-gray-400/40 rounded mb-1"></div>
                <div className="h-3 w-16 bg-gray-400/30 rounded"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Comidas registradas hoy */}
            <div className={`p-4 rounded-xl ${
              isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <Utensils className={`${isDark ? 'text-green-400' : 'text-green-600'}`} size={20} />
                <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Comidas
                </span>
              </div>
              <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {mealsTodayCount}/{targetMeals}
              </p>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                Registradas hoy
              </p>
            </div>

            {/* Entrenamientos semana */}
            <div className={`p-4 rounded-xl ${
              isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <Dumbbell className={`${isDark ? 'text-blue-400' : 'text-blue-600'}`} size={20} />
                <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Entrenamientos
                </span>
              </div>
              <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {workoutsThisWeek}
              </p>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                Esta semana
              </p>
            </div>

            {/* Energía */}
            <div className={`p-4 rounded-xl ${
              isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <Zap className={`${isDark ? 'text-purple-400' : 'text-purple-600'}`} size={20} />
                <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Energía
                </span>
              </div>
              <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {avgEnergy > 0 ? avgEnergy.toFixed(1) : '--'}/10
              </p>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                Promedio
              </p>
            </div>

            {/* Insights */}
            <div className={`p-4 rounded-xl ${
              isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <Brain className={`${isDark ? 'text-pink-400' : 'text-pink-600'}`} size={20} />
                <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Patrones
                </span>
              </div>
              <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {insightsCount}
              </p>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                Identificados
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Último insight destacado */}
      {insights.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              💡 Insight Reciente
            </h3>
            {/* Navegación: en esta app no usamos router; este es un placeholder visual */}
            <span 
              className={`text-sm font-medium cursor-pointer ${
                isDark ? 'text-purple-400 hover:text-purple-300' : 'text-purple-600 hover:text-purple-700'
              }`}
              title="Ir a Correlaciones"
            >
              Ver todos →
            </span>
          </div>
          
          <div className={`p-5 rounded-xl ${
            isDark 
              ? 'bg-purple-900/20 border border-purple-700/50' 
              : 'bg-purple-50 border border-purple-200'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                isDark ? 'bg-purple-800/50' : 'bg-purple-100'
              }`}>
                <TrendingUp className={`${isDark ? 'text-purple-400' : 'text-purple-600'}`} size={20} />
              </div>
              <div className="flex-1">
                <h4 className={`font-semibold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {insights[0].title}
                </h4>
                <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  {(insights[0].description || '').substring(0, 120)}...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Acciones rápidas (placeholders de navegación) */}
      <div>
        <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          ⚡ Acciones Rápidas
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <button
            type="button"
            className={`p-4 rounded-xl flex items-center gap-3 transition-all hover:scale-105 ${
              isDark 
                ? 'bg-green-900/30 hover:bg-green-900/40 border border-green-700' 
                : 'bg-green-50 hover:bg-green-100 border border-green-200'
            }`}
            title="Ir a Alimentación"
          >
            <Utensils className={`${isDark ? 'text-green-400' : 'text-green-600'}`} size={24} />
            <div>
              <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Registrar Comida
              </p>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Añadir alimento
              </p>
            </div>
          </button>
          
          <button
            type="button"
            className={`p-4 rounded-xl flex items-center gap-3 transition-all hover:scale-105 ${
              isDark 
                ? 'bg-blue-900/30 hover:bg-blue-900/40 border border-blue-700' 
                : 'bg-blue-50 hover:bg-blue-100 border border-blue-200'
            }`}
            title="Ir a Entrenamientos"
          >
            <Dumbbell className={`${isDark ? 'text-blue-400' : 'text-blue-600'}`} size={24} />
            <div>
              <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Nuevo Entreno
              </p>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Iniciar rutina
              </p>
            </div>
          </button>
          
          <button
            type="button"
            className={`p-4 rounded-xl flex items-center gap-3 transition-all hover:scale-105 ${
              isDark 
                ? 'bg-purple-900/30 hover:bg-purple-900/40 border border-purple-700' 
                : 'bg-purple-50 hover:bg-purple-100 border border-purple-200'
            }`}
            title="Ir a Correlaciones"
          >
            <TrendingUp className={`${isDark ? 'text-purple-400' : 'text-purple-600'}`} size={24} />
            <div>
              <p className={`font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Ver Insights
              </p>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Mis patrones
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
