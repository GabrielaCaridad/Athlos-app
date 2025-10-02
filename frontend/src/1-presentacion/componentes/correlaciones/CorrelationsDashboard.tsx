import { useEffect, useState } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, BarChart, Bar, Legend, Cell } from 'recharts';
import { TrendingUp, AlertCircle } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { workoutService } from '../../../2-logica-negocio/servicios/firestoreService';
import { userFoodService } from '../../../2-logica-negocio/servicios/foodDataService';

interface CorrelationsDashboardProps { isDark: boolean }

type CalorieCategory = 'bajo' | 'optimo' | 'exceso';

interface CorrelationDataPoint {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  performance: number; // 0-100
  energyLevel: number; // 1-10 promedio del día
  category: CalorieCategory;
}

const categorizeCalories = (cal: number): CalorieCategory => (cal < 1800 ? 'bajo' : cal <= 2200 ? 'optimo' : 'exceso');

export default function CorrelationsDashboard({ isDark }: CorrelationsDashboardProps) {
  const { user } = useAuth();
  const [correlationData, setCorrelationData] = useState<CorrelationDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const days = 14;
        const today = new Date();
        const points: CorrelationDataPoint[] = [];

        for (let i = 0; i < days; i++) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          const [foods, workouts] = await Promise.all([
            userFoodService.getUserFoodsByDate(user.uid, dateStr),
            workoutService.getWorkoutsByDate(user.uid, dateStr)
          ]);

          if (!workouts || workouts.length === 0) continue; // solo días con entrenamiento

          const calories = foods.reduce((s, f) => s + (f.calories || 0), 0);
          const protein = Math.round(foods.reduce((s, f) => s + (f.protein || 0), 0));
          const carbs = Math.round(foods.reduce((s, f) => s + (f.carbs || 0), 0));
          const fats = Math.round(foods.reduce((s, f) => s + (f.fats || 0), 0));
          const performance = Math.round((workouts.reduce((s, w) => s + (w.performanceScore || 0), 0) / workouts.length) || 0);
          const energySum = workouts.reduce((s, w) => s + (w.postEnergyLevel !== undefined && w.postEnergyLevel !== null
            ? w.postEnergyLevel
            : (w.preEnergyLevel !== undefined && w.preEnergyLevel !== null ? w.preEnergyLevel : 5)
          ), 0);
          const energyLevel = Math.round((((energySum / workouts.length) || 0) * 10)) / 10;

          points.push({ date: dateStr, calories, protein, carbs, fats, performance, energyLevel, category: categorizeCalories(calories) });
        }

        setCorrelationData(points.reverse());
      } catch (e) {
        console.error('Error loading correlation data:', e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  if (loading) {
    return (
      <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Analizando correlaciones...</p>
          </div>
        </div>
      </div>
    );
  }

  if (correlationData.length < 7) {
    return (
      <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
        <div className="text-center py-10">
          <AlertCircle size={48} className={`mx-auto mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
          <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>Datos Insuficientes</h3>
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Necesitas al menos 7 días con entrenamientos para ver correlaciones. Actualmente: {correlationData.length}.
          </p>
        </div>
      </div>
    );
  }

  const colorFor = (c: CalorieCategory) => (c === 'optimo' ? '#10B981' : c === 'bajo' ? '#F59E0B' : '#EF4444');

  return (
    <div className="space-y-6">
      {/* Scatter: Calorías vs Performance */}
      <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
        <div className="flex items-center space-x-2 mb-4">
          <TrendingUp size={20} className="text-blue-500" />
          <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>Calorías vs Performance</h3>
        </div>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#E5E7EB'} />
              <XAxis type="number" dataKey="calories" name="Calorías" domain={[1200, 3000]} stroke={isDark ? '#9CA3AF' : '#6B7280'} label={{ value: 'Calorías (kcal)', position: 'bottom' }} />
              <YAxis type="number" dataKey="performance" name="Performance" domain={[0, 100]} stroke={isDark ? '#9CA3AF' : '#6B7280'} label={{ value: 'Performance Score (%)', angle: -90, position: 'insideLeft' }} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <ReferenceArea x1={1800} x2={2200} y1={0} y2={100} fill="#10B981" fillOpacity={0.1} stroke="#10B981" strokeOpacity={0.3} strokeDasharray="3 3" />
              <Scatter name="Días de Entrenamiento" data={correlationData}>
                {correlationData.map((e, i) => (
                  <Cell key={i} fill={colorFor(e.category)} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-6 mt-4 text-xs">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-500" /><span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Bajo (&lt;1800 kcal)</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500" /><span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Óptimo (1800-2200 kcal)</span></div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500" /><span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Exceso (&gt;2200 kcal)</span></div>
        </div>
      </div>

      {/* Macros por día */}
      <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
        <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-800'}`}>Comparativa de Macros</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={correlationData}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#374151' : '#E5E7EB'} />
              <XAxis dataKey="date" stroke={isDark ? '#9CA3AF' : '#6B7280'} />
              <YAxis stroke={isDark ? '#9CA3AF' : '#6B7280'} />
              <Tooltip />
              <Legend />
              <Bar dataKey="protein" name="Proteína (g)" fill="#3B82F6" />
              <Bar dataKey="carbs" name="Carbohidratos (g)" fill="#8B5CF6" />
              <Bar dataKey="fats" name="Grasas (g)" fill="#F59E0B" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Insights */}
      <div className={`p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
        <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>Insights</h3>
        <ul className={isDark ? 'text-gray-300' : 'text-gray-700'}>
          <li className="mb-1">• Días en zona óptima: {correlationData.filter(d => d.category === 'optimo').length}</li>
          <li className="mb-1">• Performance promedio: {Math.round(correlationData.reduce((s, d) => s + d.performance, 0) / correlationData.length)}%</li>
          <li>• Energía promedio: {Math.round((correlationData.reduce((s, d) => s + d.energyLevel, 0) / correlationData.length) * 10) / 10}/10</li>
        </ul>
      </div>
    </div>
  );
}