// Propósito: mostrar progreso diario, resumen semanal y avisos (perfil, análisis proactivo).
// Contexto: usa hooks (useUserData, usePersonalInsights) que requieren índices:
//           foodDatabase(userId+date DESC) y workouts(userId+createdAt DESC).
// Qué hace: deriva métricas locales (calorías hoy, entrenos últimos 7 días, energía media) en efectos.
// Por qué: evitar cálculos pesados en render y mantener reactivo sin reconsultas manuales.
// Ojo: normaliza 'hoy' con claves locales YYYY-MM-DD para coherencia en frontend/servicios.
// Nota: timestamps Firestore pueden venir como Date o Timestamp; se unifican antes de comparar.
import { useEffect, useState } from 'react';
import { Utensils, Dumbbell, Zap, Brain, TrendingUp } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { usePersonalInsights } from '../../hooks/usePersonalInsights';
// Nota: datos centralizados vía useUserData; no se consumen servicios directos aquí.
import { useUserData } from '../../hooks/useUserData';
import { getTodayLocalDateKey } from '../../../utils/date';
import { Link, useNavigate } from 'react-router-dom';
import { userService } from '../../../2-logica-negocio/servicios';
import { getLatestUnreadProactive, markProactiveAsRead, ProactiveMessage } from '../../../2-logica-negocio/servicios';

interface DashboardProps {
  isDark: boolean;
}

// Tipos ligeros para evitar `any`
type FoodEntryLite = { calories?: number };
type FirestoreLikeTimestamp = { toDate?: () => Date };
type WorkoutLite = { createdAt?: Date | FirestoreLikeTimestamp; postEnergyLevel?: number | null };

export default function Dashboard({ isDark }: DashboardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { insights } = usePersonalInsights(user?.uid || '');
  const { workouts, foods, loading: loadingUserData } = useUserData(user?.uid, 30);

  // Estados para métricas
  const [totalCaloriesToday, setTotalCaloriesToday] = useState(0);
  const [mealsTodayCount, setMealsTodayCount] = useState(0);
  const [workoutsThisWeek, setWorkoutsThisWeek] = useState(0);
  const [avgEnergy, setAvgEnergy] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unreadProactive, setUnreadProactive] = useState<ProactiveMessage | null>(null);
  const [profileIncomplete, setProfileIncomplete] = useState(false);

  const [calorieTarget, setCalorieTarget] = useState<number>(2200);
  const targetMeals = 3;
  const insightsCount = insights.length;

  // Load calorie target from user profile (unified source: saved in Firestore)
  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.uid) return;
      try {
        const p = await userService.getUserProfile(user.uid);
        const savedTarget = typeof p?.dailyCalorieTarget === 'number' ? p.dailyCalorieTarget : undefined;
        setCalorieTarget(savedTarget ?? 2200);
        console.log('🎯 [Config] Calorías objetivo del perfil:', savedTarget);
        console.log('🎯 [Config] Perfil completo:', {
          weight: p?.currentWeight,
          height: p?.height,
          goal: p?.primaryGoal,
          activityLevel: p?.activityLevel,
          dailyCalorieTarget: savedTarget
        });
        // Evaluar si el perfil está incompleto (peso/altura/objetivo)
        const weight = p?.currentWeight;
        const height = p?.height;
        const goal = p?.primaryGoal;
        const incomplete = !(typeof weight === 'number' && weight > 0)
          || !(typeof height === 'number' && height > 0)
          || !(typeof goal === 'string' && goal.length > 0);
        setProfileIncomplete(incomplete);
      } catch (e) {
        console.warn('No se pudo cargar el perfil para objetivo calórico:', e);
        // Si no hay perfil, mostrar banner igualmente
        setProfileIncomplete(true);
      }
    };
    loadProfile();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    // Derivar métricas locales cuando los datos cambian (en tiempo real)
    try {
      setLoading(true);
  // 1) Hoy: clave LOCAL consistente con foodDatabase
  const todayStr = getTodayLocalDateKey();
      // Log diagnóstico dev antes de calcular métricas
      // Nota(dev): log de diagnóstico solo para verificar fechas guardadas
      console.log(
        '[Dashboard] todayKey',
        todayStr,
        'foods:',
        foods.length,
        foods.map((f) => (f as { date?: string }).date)
      );
      const todaysFoods = foods.filter(f => f.date === todayStr) as FoodEntryLite[];
      const caloriesSum = todaysFoods.reduce((sum, f) => sum + Number(f.calories || 0), 0); // Normalizo a number
      setTotalCaloriesToday(Math.round(caloriesSum));
      setMealsTodayCount(todaysFoods.length);
      // Calorías objetivo y consumidas hoy
      console.log('📊 [Dashboard] Calorías objetivo:', calorieTarget);
      console.log('📊 [Dashboard] Calorías consumidas hoy:', Math.round(caloriesSum));
      console.log('📊 [Dashboard] Fuente del objetivo:', {
        fromUserData: undefined, // loaded from profile service above
        fromCalculation: undefined,
        used: calorieTarget
      });

  // 2) Últimos 7 días: cantidad entrenos y energía media post-entreno
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const recentWorkouts = workouts.filter((w) => {
        const src = (w as WorkoutLite).createdAt;
        const dt: Date | undefined = src
          ? (src instanceof Date
              ? src
              : typeof (src as FirestoreLikeTimestamp).toDate === 'function'
                ? (src as FirestoreLikeTimestamp).toDate?.()
                : undefined)
          : undefined;
        return dt ? dt >= weekAgo : false;
      }) as WorkoutLite[];
      setWorkoutsThisWeek(recentWorkouts.length);

      const energyLevels = recentWorkouts
        .map(w => w.postEnergyLevel)
        .filter((e): e is number => e !== undefined && e !== null && e > 0);
      const avgEnergyLevel = energyLevels.length > 0
        ? energyLevels.reduce((s, e) => s + e, 0) / energyLevels.length
        : 0;
      setAvgEnergy(avgEnergyLevel);
    } catch (e) {
      console.error('❌ Error derivando métricas del dashboard:', e);
    } finally {
      setLoading(loadingUserData);
    }
  }, [user?.uid, foods, workouts, loadingUserData, calorieTarget]);

  // Insights diagnostics
  useEffect(() => {
    console.log('🔍 [Patrones] Insights cargados:', insights);
    console.log('🔍 [Patrones] Cantidad:', insights?.length || 0);
    console.log('🔍 [Patrones] Tipos:', (insights || []).map(i => ({ type: i.type, title: i.title })));
  }, [insights]);

  useEffect(() => {
    // Fetch latest unread proactive analysis
    const fetchUnread = async () => {
      if (!user?.uid) {
        setUnreadProactive(null);
        return;
      }
      try {
        const latest = await getLatestUnreadProactive(user.uid);
        setUnreadProactive(latest);
      } catch (e) {
        console.warn('No se pudo cargar el análisis semanal proactivo:', e);
      }
    };
    fetchUnread();
  }, [user?.uid]);

  return (
    <div className={`py-4 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
      {/* Banner para completar perfil */}
      {profileIncomplete && (
        <div className={`mb-4 p-4 rounded-2xl border ${isDark ? 'bg-yellow-900/30 border-yellow-700 text-yellow-200' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold">Completa tu perfil para mejorar tus insights</p>
              <p className="text-sm opacity-90">Agrega tu peso, altura y objetivo principal en Configuración.</p>
            </div>
            <button
              onClick={() => navigate('/config')}
              className={`${isDark ? 'bg-yellow-700 hover:bg-yellow-600 text-white' : 'bg-yellow-600 hover:bg-yellow-500 text-white'} px-3 py-2 rounded-lg text-sm font-medium`}
              type="button"
            >
              Ir a Configuración
            </button>
          </div>
        </div>
      )}
      {unreadProactive && (
        <div className={`mb-4 p-4 rounded-xl flex items-start justify-between gap-3 border ${
          isDark
            ? 'bg-gradient-to-r from-amber-900/30 to-orange-900/30 border-amber-700/40'
            : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200'
        }`}>
          <div className="flex-1">
            <p className={`text-sm font-semibold mb-1 ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>
              🔔 Apolo tiene tu análisis semanal
            </p>
            <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              {unreadProactive.message.substring(0, 140)}{unreadProactive.message.length > 140 ? '…' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!unreadProactive) return;
                try {
                  await markProactiveAsRead(unreadProactive.id);
                  setUnreadProactive(null);
                } catch (e) {
                  console.warn('No se pudo marcar como leída la notificación:', e);
                }
                // Open chat via custom event
                window.dispatchEvent(new CustomEvent('open-chatbot'));
              }}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                isDark ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-amber-500 text-white hover:bg-amber-600'
              }`}
            >
              Ver
            </button>
            <button
              onClick={async () => {
                if (!unreadProactive) return;
                try {
                  await markProactiveAsRead(unreadProactive.id);
                  setUnreadProactive(null);
                } catch (e) {
                  console.warn('No se pudo descartar la notificación:', e);
                }
              }}
              className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                isDark ? 'text-amber-200 border-amber-700 hover:bg-amber-900/30' : 'text-amber-800 border-amber-300 hover:bg-amber-100'
              }`}
            >
              Descartar
            </button>
          </div>
        </div>
      )}
      {/* Saludo compacto */}
      <div className={`mb-6 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
        <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          👋 Hola, {user?.displayName || 'Usuario'}
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
          {/* Porcentaje respecto al objetivo calórico diario */}
          <span className={`text-2xl font-bold ${
            totalCaloriesToday >= calorieTarget * 0.9 
              ? 'text-green-500' 
              : 'text-yellow-500'
          }`}>
            {Math.round((totalCaloriesToday / calorieTarget) * 100)}%
          </span>
        </div>
        
        <div className="flex items-center gap-4 mb-2">
          <span className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {Number(totalCaloriesToday).toLocaleString()}
          </span>
          <span className={`text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            / {calorieTarget.toLocaleString()} kcal
          </span>
        </div>
        
        <div className={`w-full rounded-full h-3 ${isDark ? 'bg-gray-700' : 'bg-white/50'}`}>
          <div 
            className="h-3 rounded-full transition-all duration-500 bg-gradient-to-r from-green-500 to-emerald-500" 
            style={{ width: `${Math.min((totalCaloriesToday / calorieTarget) * 100, 100)}%` }}
          />
        </div>
        
  {totalCaloriesToday < calorieTarget * 0.5 && (
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
              {/* Tarjeta: comidas registradas hoy */}
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

              {/* Tarjeta: entrenamientos esta semana */}
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
              {/* Atajo para ver historial completo de entrenamientos */}
              <button
                onClick={() => navigate('/workouts')}
                className={`${isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'} text-xs font-medium mt-1`}
                title="Ir a historial de entrenamientos"
                type="button"
              >
                Ver todos →
              </button>
            </div>

              {/* Tarjeta: energía promedio post-entreno */}
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

              {/* Tarjeta: nº total de insights identificados */}
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
            <button
              onClick={() => navigate('/correlations')}
              className={`text-sm font-medium ${
                isDark ? 'text-purple-400 hover:text-purple-300' : 'text-purple-600 hover:text-purple-700'
              }`}
              title="Ir a Correlaciones"
              type="button"
            >
              Ver todos →
            </button>
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
          <Link
            to="/food"
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
          </Link>
          
          <Link
            to="/workouts"
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
          </Link>
          
          <Link
            to="/correlations"
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
          </Link>
        </div>
      </div>
    </div>
  );
}
