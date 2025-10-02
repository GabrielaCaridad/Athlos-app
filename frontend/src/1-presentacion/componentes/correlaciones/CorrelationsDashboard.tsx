import { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Calendar, Zap, Target, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { foodService, workoutService, FoodEntry, WorkoutSession } from '../../../3-acceso-datos/firebase/firestoreService';

interface CorrelationsDashboardProps {
  isDark: boolean;
}

interface DailyData {
  date: string;
  calories: number;
  energyLevel: number;
  workouts: number;
}

interface CorrelationResult {
  exists: boolean;
  improvement: number; // %
  optimalRange: string;
  avgEnergyOptimal: number;
  avgEnergySuboptimal: number;
  sampleSize: number;
  message: string;
}

interface WorkoutCorrelationResult {
  exists: boolean;
  improvement: number;
  avgWithWorkout: number;
  avgWithoutWorkout: number;
  workoutDays: number;
  restDays: number;
  message: string;
}

interface OptimalPattern {
  exists: boolean;
  calorieRange: string;
  avgEnergy: number;
  frequency: number;
  message: string;
}

/**
 * Calcula la correlación entre ingesta calórica y nivel de energía
 */
const calculateNutritionEnergyCorrelation = (data: DailyData[]): CorrelationResult => {
  const validDays = data.filter(d => d.calories > 0 && d.energyLevel > 0);
  if (validDays.length < 7) {
    return {
      exists: false,
      improvement: 0,
      optimalRange: '',
      avgEnergyOptimal: 0,
      avgEnergySuboptimal: 0,
      sampleSize: 0,
      message: 'Necesitas al menos 7 días con datos completos (calorías y energía registradas) para calcular esta correlación.'
    };
  }

  const lowCalDays = validDays.filter(d => d.calories < 1800);
  const optimalCalDays = validDays.filter(d => d.calories >= 1800 && d.calories <= 2200);
  const highCalDays = validDays.filter(d => d.calories > 2200);

  const avg = (arr: DailyData[]) => arr.length ? (arr.reduce((s, d) => s + d.energyLevel, 0) / arr.length) : 0;
  const avgEnergyLow = avg(lowCalDays);
  const avgEnergyOptimal = avg(optimalCalDays);
  const avgEnergyHigh = avg(highCalDays);

  let bestRange = '';
  let bestAvg = 0;
  let comparisonAvg = 0;
  let sampleSize = 0;

  if (avgEnergyOptimal >= avgEnergyLow && avgEnergyOptimal >= avgEnergyHigh && optimalCalDays.length >= 3) {
    bestRange = '1800-2200';
    bestAvg = avgEnergyOptimal;
    comparisonAvg = Math.max(avgEnergyLow, avgEnergyHigh);
    sampleSize = optimalCalDays.length;
  } else if (avgEnergyLow > avgEnergyOptimal && avgEnergyLow > avgEnergyHigh && lowCalDays.length >= 3) {
    bestRange = 'menos de 1800';
    bestAvg = avgEnergyLow;
    comparisonAvg = Math.max(avgEnergyOptimal, avgEnergyHigh);
    sampleSize = lowCalDays.length;
  } else if (avgEnergyHigh > avgEnergyOptimal && avgEnergyHigh > avgEnergyLow && highCalDays.length >= 3) {
    bestRange = 'más de 2200';
    bestAvg = avgEnergyHigh;
    comparisonAvg = Math.max(avgEnergyOptimal, avgEnergyLow);
    sampleSize = highCalDays.length;
  } else {
    return {
      exists: false,
      improvement: 0,
      optimalRange: '',
      avgEnergyOptimal: 0,
      avgEnergySuboptimal: 0,
      sampleSize: validDays.length,
      message: 'No hay suficientes datos en cada rango calórico (mínimo 3 días por rango) para establecer correlaciones confiables.'
    };
  }

  const improvement = comparisonAvg > 0 ? Math.round(((bestAvg - comparisonAvg) / comparisonAvg) * 100) : 0;

  return {
    exists: true,
    improvement: Math.abs(improvement),
    optimalRange: bestRange,
    avgEnergyOptimal: Math.round(bestAvg * 10) / 10,
    avgEnergySuboptimal: Math.round(comparisonAvg * 10) / 10,
    sampleSize,
    message: `Tu energía es ${Math.abs(improvement)}% ${improvement > 0 ? 'mayor' : 'menor'} cuando consumes ${bestRange} kcal (basado en ${sampleSize} días).`
  };
};

/**
 * Calcula la correlación entre días de entrenamiento y nivel de energía
 */
const calculateWorkoutEnergyCorrelation = (data: DailyData[]): WorkoutCorrelationResult => {
  const validDays = data.filter(d => d.energyLevel > 0);
  if (validDays.length < 7) {
    return {
      exists: false,
      improvement: 0,
      avgWithWorkout: 0,
      avgWithoutWorkout: 0,
      workoutDays: 0,
      restDays: 0,
      message: 'Necesitas al menos 7 días con nivel de energía registrado para calcular esta correlación.'
    };
  }

  const workoutDays = validDays.filter(d => d.workouts > 0);
  const restDays = validDays.filter(d => d.workouts === 0);

  if (workoutDays.length < 3 || restDays.length < 3) {
    return {
      exists: false,
      improvement: 0,
      avgWithWorkout: 0,
      avgWithoutWorkout: 0,
      workoutDays: workoutDays.length,
      restDays: restDays.length,
      message: `Necesitas al menos 3 días de entrenamientos (tienes ${workoutDays.length}) y 3 días de descanso (tienes ${restDays.length}) para comparar.`
    };
  }

  const avgWithWorkout = workoutDays.reduce((s, d) => s + d.energyLevel, 0) / workoutDays.length;
  const avgWithoutWorkout = restDays.reduce((s, d) => s + d.energyLevel, 0) / restDays.length;
  const improvement = avgWithoutWorkout > 0 ? Math.round(((avgWithWorkout - avgWithoutWorkout) / avgWithoutWorkout) * 100) : 0;

  return {
    exists: true,
    improvement: Math.abs(improvement),
    avgWithWorkout: Math.round(avgWithWorkout * 10) / 10,
    avgWithoutWorkout: Math.round(avgWithoutWorkout * 10) / 10,
    workoutDays: workoutDays.length,
    restDays: restDays.length,
    message: `Los días que entrenas, tu energía promedio es ${Math.abs(improvement)}% ${improvement > 0 ? 'mayor' : 'menor'} (${workoutDays.length} días con entrenamiento vs ${restDays.length} días de descanso).`
  };
};

/**
 * Identifica el patrón óptimo combinando nutrición y ejercicio
 */
const calculateOptimalPattern = (data: DailyData[]): OptimalPattern => {
  const validDays = data.filter(d => d.calories > 0 && d.workouts > 0 && d.energyLevel > 0);
  if (validDays.length < 5) {
    return {
      exists: false,
      calorieRange: '',
      avgEnergy: 0,
      frequency: 0,
      message: 'Necesitas al menos 5 días combinando nutrición y ejercicio (ambos registrados el mismo día) para identificar tu patrón óptimo.'
    };
  }

  const sortedByEnergy = [...validDays].sort((a, b) => b.energyLevel - a.energyLevel);
  const topCount = Math.max(3, Math.ceil(sortedByEnergy.length * 0.3));
  const topDays = sortedByEnergy.slice(0, topCount);
  const avgCalories = topDays.reduce((s, d) => s + d.calories, 0) / topDays.length;
  const avgEnergy = topDays.reduce((s, d) => s + d.energyLevel, 0) / topDays.length;

  let calorieRange = '';
  if (avgCalories < 1800) calorieRange = 'menos de 1800 kcal';
  else if (avgCalories <= 2200) {
    const lowerBound = Math.round(avgCalories - 200);
    const upperBound = Math.round(avgCalories + 200);
    calorieRange = `${lowerBound}-${upperBound} kcal`;
  } else calorieRange = 'más de 2200 kcal';

  return {
    exists: true,
    calorieRange,
    avgEnergy: Math.round(avgEnergy * 10) / 10,
    frequency: topDays.length,
    message: `Tu mejor rendimiento: ${calorieRange} + entrenamiento = energía nivel ${Math.round(avgEnergy * 10) / 10}/10 (observado en ${topDays.length} días).`
  };
};

export default function CorrelationsDashboard({ isDark }: CorrelationsDashboardProps) {
  const { user } = useAuth();
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasEnoughData, setHasEnoughData] = useState(false);
  const [correlations, setCorrelations] = useState<{
    nutritionEnergy: CorrelationResult;
    workoutEnergy: WorkoutCorrelationResult;
    optimalPattern: OptimalPattern;
  } | null>(null);

  useEffect(() => {
    const loadCorrelationData = async () => {
      if (!user) return;

      try {
        setLoading(true);
        
        // Obtener datos reales de Firestore por día (últimos 14 días)
        const days = 14;
        const dates: string[] = [];
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          dates.push(d.toISOString().split('T')[0]);
        }

        const results = await Promise.all(dates.map(async (date) => {
          const [foods, workouts] = await Promise.all([
            foodService.getFoodsByDate(user.uid, date),
            workoutService.getWorkoutsByDate(user.uid, date)
          ]);

          const foodsTyped = (foods || []) as FoodEntry[];
          const workoutsTyped = (workouts || []) as WorkoutSession[];

          const calories = foodsTyped.reduce((s: number, f: FoodEntry) => s + (f.calories || 0), 0);
          const workoutsCount = workoutsTyped.length;
          const energyArr = workoutsTyped.map((w: WorkoutSession) => (w.postEnergyLevel ?? w.preEnergyLevel ?? 0)).filter((v: number) => v > 0);
          const energyLevel = energyArr.length > 0 ? Math.round((energyArr.reduce((a: number, b: number) => a + b, 0) / energyArr.length) * 10) / 10 : 0;

          return { date, calories, energyLevel, workouts: workoutsCount } as DailyData;
        }));

        setDailyData(results);
        const hasData = results.length >= 7 && results.some(r => r.calories > 0 || r.workouts > 0);
        setHasEnoughData(hasData);

        // Calcular correlaciones si hay datos suficientes
        if (hasData) {
          try {
            const nutritionEnergy = calculateNutritionEnergyCorrelation(results);
            const workoutEnergy = calculateWorkoutEnergyCorrelation(results);
            const optimalPattern = calculateOptimalPattern(results);
            setCorrelations({ nutritionEnergy, workoutEnergy, optimalPattern });
          } catch (e) {
            console.error('Error calculating correlations', e);
            setCorrelations(null);
          }
        } else {
          setCorrelations(null);
        }
      } catch (error) {
        console.error('Error loading correlation data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCorrelationData();
  }, [user]);

  if (loading) {
    return (
      <div className={`p-6 rounded-2xl ${
        isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
      }`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Analizando correlaciones...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!hasEnoughData) {
    return (
      <div className={`p-8 rounded-2xl text-center ${
        isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
      }`}>
        <AlertCircle size={48} className={`mx-auto mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
        <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Datos Insuficientes
        </h3>
        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-4`}>
          Necesitas al menos 7 días de registros para ver correlaciones entre tu nutrición y rendimiento.
        </p>
        <div className={`inline-flex items-center space-x-2 px-4 py-2 rounded-full ${
          isDark ? 'bg-purple-900 text-purple-300' : 'bg-purple-100 text-purple-700'
        }`}>
          <Calendar size={16} />
          <span className="text-sm font-medium">
            Días registrados: {dailyData.length} / 7
          </span>
        </div>
      </div>
    );
  }

  // Preparar datos para gráficos
  const caloriesEnergyData = dailyData.map(day => ({
    date: new Date(day.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
    calories: day.calories,
    energy: day.energyLevel
  }));

  const workoutFrequencyData = dailyData.map(day => ({
    date: new Date(day.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
    workouts: day.workouts,
    energy: day.energyLevel
  }));

  // --- Correlation calculation functions ---
  function calculateNutritionEnergyCorrelation(data: DailyData[]): CorrelationResult {
    const valid = data.filter(d => d.calories > 0 && d.energyLevel > 0);
    if (valid.length < 7) return { exists: false, improvement: 0, optimalRange: '', avgEnergyOptimal: 0, avgEnergySuboptimal: 0, sampleSize: 0, message: 'Datos insuficientes para la correlación nutrición-energía.' };

    const groups = {
      low: valid.filter(d => d.calories < 1800),
      optimal: valid.filter(d => d.calories >= 1800 && d.calories <= 2200),
      high: valid.filter(d => d.calories > 2200)
    };

    const avg = (arr: DailyData[]) => arr.length ? (arr.reduce((s, x) => s + x.energyLevel, 0) / arr.length) : 0;
    const avgLow = Math.round((avg(groups.low) * 10)) / 10;
    const avgOpt = Math.round((avg(groups.optimal) * 10)) / 10;
    const avgHigh = Math.round((avg(groups.high) * 10)) / 10;

    const ranges = [
      { name: 'Bajo (<1800 kcal)', avg: avgLow, size: groups.low.length },
      { name: 'Óptimo (1800-2200 kcal)', avg: avgOpt, size: groups.optimal.length },
      { name: 'Alto (>2200 kcal)', avg: avgHigh, size: groups.high.length }
    ];

    const best = ranges.reduce((a, b) => (b.avg > a.avg ? b : a), ranges[0]);
    const others = ranges.filter(r => r.name !== best.name);
    const avgOthers = others.reduce((s, r) => s + r.avg * r.size, 0) / Math.max(1, others.reduce((s, r) => s + r.size, 0));

    if (best.size === 0) return { exists: false, improvement: 0, optimalRange: '', avgEnergyOptimal: 0, avgEnergySuboptimal: 0, sampleSize: 0, message: 'No hay suficientes días en un rango calórico para determinar el óptimo.' };

    const avgEnergyOptimal = Math.round(best.avg * 10) / 10;
    const avgEnergySuboptimal = Math.round(avgOthers * 10) / 10;

    let improvement = 0;
    if (avgEnergySuboptimal > 0) {
      improvement = Math.round(((avgEnergyOptimal - avgEnergySuboptimal) / avgEnergySuboptimal) * 100);
    } else {
      improvement = 0; // no se puede calcular porcentaje si denominador = 0
    }

    const message = `Tu energía es ${improvement}% mayor cuando consumes ${best.name} (basado en ${best.size} días)`;

    return {
      exists: true,
      improvement,
      optimalRange: best.name,
      avgEnergyOptimal,
      avgEnergySuboptimal,
      sampleSize: best.size,
      message
    };
  }

  function calculateWorkoutEnergyCorrelation(data: DailyData[]): WorkoutCorrelationResult {
    const valid = data.filter(d => d.energyLevel > 0);
    if (valid.length < 7) return { exists: false, improvement: 0, avgWithWorkout: 0, avgWithoutWorkout: 0, workoutDays: 0, restDays: 0, message: 'Datos insuficientes para la correlación entrenamiento-energía.' };

    const withWorkout = valid.filter(d => d.workouts > 0);
    const withoutWorkout = valid.filter(d => d.workouts === 0);
    if (withWorkout.length < 3 || withoutWorkout.length < 3) return { exists: false, improvement: 0, avgWithWorkout: 0, avgWithoutWorkout: 0, workoutDays: withWorkout.length, restDays: withoutWorkout.length, message: 'Se requieren al menos 3 días con y sin entrenamiento para esta correlación.' };

    const avg = (arr: DailyData[]) => arr.length ? (arr.reduce((s, x) => s + x.energyLevel, 0) / arr.length) : 0;
    const avgWith = Math.round(avg(withWorkout) * 10) / 10;
    const avgWithout = Math.round(avg(withoutWorkout) * 10) / 10;

    let improvement = 0;
    if (avgWithout > 0) {
      improvement = Math.round(((avgWith - avgWithout) / avgWithout) * 100);
    } else {
      improvement = 0;
    }

    const message = `Los días que entrenas, tu energía promedio es ${improvement}% mayor (${withWorkout.length} días con entrenamiento vs ${withoutWorkout.length} días de descanso)`;

    return {
      exists: true,
      improvement,
      avgWithWorkout: avgWith,
      avgWithoutWorkout: avgWithout,
      workoutDays: withWorkout.length,
      restDays: withoutWorkout.length,
      message
    };
  }

  function calculateOptimalPattern(data: DailyData[]): OptimalPattern {
    const valid = data.filter(d => d.calories > 0 && d.workouts > 0 && d.energyLevel > 0);
    if (valid.length < 5) return { exists: false, calorieRange: '', avgEnergy: 0, frequency: 0, message: 'No hay suficientes días con calorías y entrenamiento para identificar un patrón óptimo.' };

    const sorted = [...valid].sort((a, b) => b.energyLevel - a.energyLevel);
    const topCount = Math.max(3, Math.ceil(sorted.length * 0.3));
    const top = sorted.slice(0, topCount);

    const avgCalories = Math.round((top.reduce((s, x) => s + x.calories, 0) / top.length));
    const avgEnergy = Math.round((top.reduce((s, x) => s + x.energyLevel, 0) / top.length) * 10) / 10;

    let calorieRange = '';
    if (avgCalories < 1800) calorieRange = 'Bajo (<1800 kcal)';
    else if (avgCalories <= 2200) calorieRange = 'Óptimo (1800-2200 kcal)';
    else calorieRange = 'Alto (>2200 kcal)';

    const message = `Patrón óptimo: ${calorieRange} con energía promedio ${avgEnergy} (basado en ${top.length} días)`;

    return { exists: true, calorieRange, avgEnergy, frequency: top.length, message };
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Análisis de Correlaciones
        </h2>
        <div className={`px-4 py-2 rounded-full ${
          isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
        }`}>
          <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            Últimos {dailyData.length} días
          </span>
        </div>
      </div>

      {/* Calorías vs Energía */}
      <div className={`p-6 rounded-2xl ${
        isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
      }`}>
        <div className="flex items-center space-x-2 mb-4">
          <TrendingUp size={20} className="text-blue-500" />
          <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
            Calorías vs Nivel de Energía
          </h3>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={caloriesEnergyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#E5E7EB'} />
              <XAxis 
                dataKey="date" 
                stroke={isDark ? '#9CA3AF' : '#6B7280'}
                fontSize={12}
              />
              <YAxis 
                yAxisId="calories"
                orientation="left"
                stroke={isDark ? '#9CA3AF' : '#6B7280'}
                fontSize={12}
              />
              <YAxis 
                yAxisId="energy"
                orientation="right"
                stroke={isDark ? '#9CA3AF' : '#6B7280'}
                fontSize={12}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                  border: 'none',
                  borderRadius: '12px',
                  boxShadow: isDark ? '0 8px 16px rgba(0,0,0,0.4)' : '0 8px 16px rgba(0,0,0,0.1)'
                }}
                labelStyle={{ color: isDark ? '#F3F4F6' : '#1F2937' }}
              />
              <Line 
                yAxisId="calories"
                type="monotone" 
                dataKey="calories" 
                stroke="#3B82F6" 
                strokeWidth={3}
                dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                name="Calorías"
              />
              <Line 
                yAxisId="energy"
                type="monotone" 
                dataKey="energy" 
                stroke="#8B5CF6" 
                strokeWidth={3}
                dot={{ fill: '#8B5CF6', strokeWidth: 2, r: 4 }}
                name="Energía (1-10)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Entrenamientos vs Energía */}
        <div className={`p-6 rounded-2xl ${
          isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
        }`}>
            <div className="flex items-center space-x-2 mb-4">
            <Zap size={20} className="text-yellow-500" />
            <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
              Entrenamientos vs Energía
            </h3>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workoutFrequencyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#E5E7EB'} />
                <XAxis 
                  dataKey="date" 
                  stroke={isDark ? '#9CA3AF' : '#6B7280'}
                  fontSize={12}
                />
                <YAxis 
                  stroke={isDark ? '#9CA3AF' : '#6B7280'}
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: isDark ? '0 8px 16px rgba(0,0,0,0.4)' : '0 8px 16px rgba(0,0,0,0.1)'
                  }}
                />
                <Bar 
                  dataKey="workouts" 
                  fill="#8B5CF6" 
                  radius={[4, 4, 0, 0]}
                  name="Entrenamientos"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

  {/* Insights y Correlaciones */}
      {/* Insights Personalizados */}
      <div className={`p-6 rounded-2xl ${
        isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
      }`}>
        <div className="flex items-center space-x-2 mb-4">
          <Target size={20} className="text-purple-500" />
          <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
            Insights Personalizados
          </h3>
        </div>
        
        {correlations ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
              {/* Correlación Nutrición-Energía */}
              {correlations.nutritionEnergy.exists ? (
                <div className={`p-4 rounded-xl ${
                  isDark ? 'bg-blue-900 bg-opacity-30 border border-blue-600' : 'bg-blue-50 border border-blue-200'
                }`}>
                  <div className="flex items-center space-x-2 mb-2">
                    <TrendingUp size={16} className="text-blue-500" />
                    <span className={`text-sm font-medium ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                      Nutrición-Energía
                    </span>
                  </div>
                  <p className={`text-xs ${isDark ? 'text-blue-200' : 'text-blue-600'}`}>
                    {correlations.nutritionEnergy.message}
                  </p>
                  <div className={`mt-2 text-xs ${isDark ? 'text-blue-300' : 'text-blue-500'} font-mono`}>
                    Energía: {correlations.nutritionEnergy.avgEnergyOptimal}/10 vs {correlations.nutritionEnergy.avgEnergySuboptimal}/10
                  </div>
                </div>
              ) : (
                <div className={`p-4 rounded-xl ${
                  isDark ? 'bg-gray-700 border border-gray-600' : 'bg-gray-50 border border-gray-200'
                }`}>
                  <div className="flex items-center space-x-2 mb-2">
                    <TrendingUp size={16} className="text-gray-400" />
                    <span className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Nutrición-Energía
                    </span>
                  </div>
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {correlations.nutritionEnergy.message}
                  </p>
                </div>
              )}

              {/* Correlación Ejercicio-Energía */}
              {correlations.workoutEnergy.exists ? (
                <div className={`p-4 rounded-xl ${
                  isDark ? 'bg-green-900 bg-opacity-30 border border-green-600' : 'bg-green-50 border border-green-200'
                }`}>
                  <div className="flex items-center space-x-2 mb-2">
                    <Zap size={16} className="text-green-500" />
                    <span className={`text-sm font-medium ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                      Ejercicio-Energía
                    </span>
                  </div>
                  <p className={`text-xs ${isDark ? 'text-green-200' : 'text-green-600'}`}>
                    {correlations.workoutEnergy.message}
                  </p>
                  <div className={`mt-2 text-xs ${isDark ? 'text-green-300' : 'text-green-500'} font-mono`}>
                    Con ejercicio: {correlations.workoutEnergy.avgWithWorkout}/10
                  </div>
                </div>
              ) : (
                <div className={`p-4 rounded-xl ${
                  isDark ? 'bg-gray-700 border border-gray-600' : 'bg-gray-50 border border-gray-200'
                }`}>
                  <div className="flex items-center space-x-2 mb-2">
                    <Zap size={16} className="text-gray-400" />
                    <span className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Ejercicio-Energía
                    </span>
                  </div>
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {correlations.workoutEnergy.message}
                  </p>
                </div>
              )}

              {/* Patrón Óptimo */}
              {correlations.optimalPattern.exists ? (
                <div className={`p-4 rounded-xl ${
                  isDark ? 'bg-purple-900 bg-opacity-30 border border-purple-600' : 'bg-purple-50 border border-purple-200'
                }`}>
                  <div className="flex items-center space-x-2 mb-2">
                    <Target size={16} className="text-purple-500" />
                    <span className={`text-sm font-medium ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
                      Patrón Óptimo
                    </span>
                  </div>
                  <p className={`text-xs ${isDark ? 'text-purple-200' : 'text-purple-600'}`}>
                    {correlations.optimalPattern.message}
                  </p>
                </div>
              ) : (
                <div className={`p-4 rounded-xl ${
                  isDark ? 'bg-gray-700 border border-gray-600' : 'bg-gray-50 border border-gray-200'
                }`}>
                  <div className="flex items-center space-x-2 mb-2">
                    <Target size={16} className="text-gray-400" />
                    <span className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Patrón Óptimo
                    </span>
                  </div>
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {correlations.optimalPattern.message}
                  </p>
                </div>
              )}
              
          </div>
        ) : (
          <div className="text-center py-4">
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Calculando correlaciones...
            </p>
          </div>
        )}
      </div>

      {/* Tendencias Detalladas */}
      <div className={`p-6 rounded-2xl ${
        isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
      }`}>
        <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Tendencias de Bienestar
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={caloriesEnergyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#E5E7EB'} />
              <XAxis 
                dataKey="date" 
                stroke={isDark ? '#9CA3AF' : '#6B7280'}
                fontSize={12}
              />
              <YAxis 
                stroke={isDark ? '#9CA3AF' : '#6B7280'}
                fontSize={12}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: isDark ? '#1F2937' : '#FFFFFF',
                  border: 'none',
                  borderRadius: '12px',
                  boxShadow: isDark ? '0 8px 16px rgba(0,0,0,0.4)' : '0 8px 16px rgba(0,0,0,0.1)'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="energy" 
                stroke="#8B5CF6" 
                strokeWidth={3}
                dot={{ fill: '#8B5CF6', strokeWidth: 2, r: 4 }}
                name="Nivel de Energía"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}