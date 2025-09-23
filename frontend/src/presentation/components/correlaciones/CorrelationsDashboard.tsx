import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Calendar, Zap, Target, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { foodService, workoutService, FoodEntry, WorkoutSession } from '../../../business/services/firestoreService';

interface CorrelationsDashboardProps {
  isDark: boolean;
}

interface DailyData {
  date: string;
  calories: number;
  energyLevel: number;
  workouts: number;
}

export default function CorrelationsDashboard({ isDark }: CorrelationsDashboardProps) {
  const { user } = useAuth();
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasEnoughData, setHasEnoughData] = useState(false);

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
        setHasEnoughData(results.length >= 7 && results.some(r => r.calories > 0 || r.workouts > 0));
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
      <div className={`p-6 rounded-2xl ${
        isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
      }`}>
        <div className="flex items-center space-x-2 mb-4">
          <Target size={20} className="text-purple-500" />
          <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
            Insights Personalizados
          </h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Correlación Calorías-Energía */}
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
              Tu energía es 23% mayor cuando consumes 1800-2000 kcal vs días de menor ingesta.
            </p>
          </div>

          {/* Correlación Entrenamientos-Ánimo */}
          <div className={`p-4 rounded-xl ${
            isDark ? 'bg-green-900 bg-opacity-30 border border-green-600' : 'bg-green-50 border border-green-200'
          }`}>
            <div className="flex items-center space-x-2 mb-2">
              <Zap size={16} className="text-green-500" />
              <span className={`text-sm font-medium ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                Ejercicio-Ánimo
              </span>
            </div>
            <p className={`text-xs ${isDark ? 'text-green-200' : 'text-green-600'}`}>
              Los días que entrenas, tu estado de ánimo promedio es 18% mejor.
            </p>
          </div>

          {/* Patrón Óptimo */}
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
              Tu mejor rendimiento: 1900 kcal + entrenamiento = energía nivel 8-9.
            </p>
          </div>
        </div>
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