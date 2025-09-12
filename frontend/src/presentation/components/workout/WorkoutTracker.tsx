import { useState, useEffect } from 'react';
import { Play, Pause, Square, Plus, Clock, Flame, Target, Dumbbell, Search, Save, Trash2, Calendar, Filter, CheckCircle, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { workoutService, WorkoutSession, Exercise } from '../../../business/services/firestoreService';
import { exerciseAPIService, AdaptedExercise } from '../../../business/services/exerciseAPI';
import { Timestamp } from 'firebase/firestore';

interface WorkoutTrackerProps {
  isDark: boolean;
}

// Mapa de grupos musculares (ES -> API target EN)
const MUSCLE_TARGETS_ES_TO_EN: Record<string, string> = {
  'pecho': 'pectorals',
  'espalda': 'lats',
  'hombros': 'delts',
  'deltoides': 'delts',
  'biceps': 'biceps',
  'bíceps': 'biceps',
  'triceps': 'triceps',
  'tríceps': 'triceps',
  'abdominales': 'abs',
  'abs': 'abs',
  'core': 'abs',
  'gluteos': 'glutes',
  'glúteos': 'glutes',
  'cuadriceps': 'quads',
  'cuádriceps': 'quads',
  'isquiotibiales': 'hamstrings',
  'femorales': 'hamstrings',
  'pantorrillas': 'calves',
  'gemelos': 'calves',
  'antebrazos': 'forearms',
  'trapecio': 'traps',
  'trapecios': 'traps',
  'espalda alta': 'upper back',
  'espalda baja': 'spine'
};

const translateMuscleTarget = (term: string): string => {
  const t = term.trim().toLowerCase();
  return MUSCLE_TARGETS_ES_TO_EN[t] ?? t;
};

// Fallback de ejercicios si la API no está disponible
const DEFAULT_EXERCISES: AdaptedExercise[] = [
  {
    id: 'fallback_pushups',
    name: 'Push-ups',
    category: 'strength',
    primaryMuscles: ['Pectorales'],
    secondaryMuscles: ['Tríceps', 'Deltoides'],
    equipment: 'Peso corporal',
    difficulty: 'beginner',
    instructions: ['Coloca las manos al ancho de hombros', 'Mantén el cuerpo recto', 'Desciende y empuja hacia arriba'],
    gifUrl: '',
    caloriesPerMinute: 6,
    defaultSets: 3,
    defaultReps: 12,
    restTimeSeconds: 60,
    bodyPart: 'chest',
    target: 'pectorals'
  },
  {
    id: 'fallback_squats',
    name: 'Bodyweight Squat',
    category: 'strength',
    primaryMuscles: ['Cuádriceps'],
    secondaryMuscles: ['Glúteos', 'Isquiotibiales'],
    equipment: 'Peso corporal',
    difficulty: 'beginner',
    instructions: ['Pies al ancho de hombros', 'Mantén la espalda recta', 'Baja hasta 90° y sube'],
    gifUrl: '',
    caloriesPerMinute: 6,
    defaultSets: 3,
    defaultReps: 15,
    restTimeSeconds: 60,
    bodyPart: 'upper legs',
    target: 'quads'
  },
  {
    id: 'fallback_plank',
    name: 'Plank',
    category: 'core',
    primaryMuscles: ['Abdominales'],
    secondaryMuscles: ['Espalda baja'],
    equipment: 'Peso corporal',
    difficulty: 'beginner',
    instructions: ['Apoya antebrazos', 'Mantén cuerpo en línea recta', 'Activa el core'],
    gifUrl: '',
    caloriesPerMinute: 5,
    defaultSets: 3,
    defaultReps: 30,
    restTimeSeconds: 60,
    bodyPart: 'waist',
    target: 'abs'
  }
];

interface WorkoutStats {
  totalDuration: number;
  totalWorkouts: number;
  avgEnergyLevel: number;
  totalCalories: number;
}

export default function WorkoutTracker({ isDark }: WorkoutTrackerProps) {
  const { user } = useAuth();
  
  // Estados principales
  const [activeWorkout, setActiveWorkout] = useState<WorkoutSession | null>(null);
  const [timer, setTimer] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [workoutStats, setWorkoutStats] = useState<WorkoutStats>({
    totalDuration: 0,
    totalWorkouts: 0,
    avgEnergyLevel: 0,
    totalCalories: 0
  });

  // Estados para historial y ejercicios
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutSession[]>([]);
  const [availableExercises, setAvailableExercises] = useState<AdaptedExercise[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Estados para modales y UI
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingExercises, setIsLoadingExercises] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  
  // Estados para crear workout personalizado
  const [customWorkoutName, setCustomWorkoutName] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<AdaptedExercise[]>([]);
  const [manualExerciseName, setManualExerciseName] = useState('');
  const [manualSets, setManualSets] = useState<number>(3);
  const [manualReps, setManualReps] = useState<number>(12);
  const [manualRest, setManualRest] = useState<number>(60);
  const [manualAddNotice, setManualAddNotice] = useState<string | null>(null);

  // Estados para historial filtrado
  const [filteredHistory, setFilteredHistory] = useState<WorkoutSession[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  
  const [isCreatingWorkout, setIsCreatingWorkout] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Efecto para el cronómetro
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    
    if (isRunning && activeWorkout) {
      interval = setInterval(() => {
        setTimer(prevTimer => prevTimer + 1);
      }, 1000);
    } else if (!isRunning && interval) {
      clearInterval(interval);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, activeWorkout]);

  // Cargar datos iniciales
  useEffect(() => {
    const loadInitialData = async () => {
      if (!user) return;

      try {
        // Cargar estadísticas semanales
        const stats = await workoutService.getWeeklyStats(user.uid);
        setWorkoutStats(stats);

        // Cargar historial de entrenamientos
        const history = await workoutService.getUserWorkouts(user.uid);
        setWorkoutHistory(history);
        setFilteredHistory(history);

        // Intentar cargar ejercicios de la API con fallback
        setIsLoadingExercises(true);
        try {
          const exercises = await exerciseAPIService.getAllExercises();
          setAvailableExercises(exercises);
          setApiError(null);
        } catch (error) {
          console.error('Error loading exercises from API:', error);
          setApiError('No se pudo conectar con la API de ejercicios. Verifica tu configuración.');
          setAvailableExercises(DEFAULT_EXERCISES);
        } finally {
          setIsLoadingExercises(false);
        }
      } catch (error) {
        console.error('Error loading workout data:', error);
      }
    };

    loadInitialData();
  }, [user]);

  // Función para formatear tiempo
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Funciones de control del workout
  const startWorkout = (workout: WorkoutSession) => {
    setActiveWorkout(workout);
    setTimer(0);
    setIsRunning(true);
  };

  const pauseWorkout = () => setIsRunning(false);
  const resumeWorkout = () => setIsRunning(true);

  const stopWorkout = async () => {
    if (!activeWorkout || !user) return;

    try {
      // Calcular estadísticas finales
      const completedExercises = activeWorkout.exercises.filter(ex => ex.completed);
      const totalCalories = completedExercises.reduce((sum, ex) => {
        const exercise = availableExercises.find(ae => ae.name === ex.name);
        return sum + ((exercise?.caloriesPerMinute || 6) * (timer / 60));
      }, 0);

      // Actualizar el workout en la base de datos
      const finalWorkout: Partial<WorkoutSession> = {
        duration: timer,
        completedAt: Timestamp.fromDate(new Date()),
        totalCaloriesBurned: Math.round(totalCalories)
      };

      await workoutService.updateWorkout(activeWorkout.id!, finalWorkout);

      // Actualizar historial local
      const updatedWorkout = { ...activeWorkout, ...finalWorkout };
      const updatedHistory = workoutHistory.map(w => 
        w.id === activeWorkout.id 
          ? updatedWorkout
          : w
      );
      setWorkoutHistory(updatedHistory);
      setFilteredHistory(updatedHistory);

      // Recargar estadísticas
      const newStats = await workoutService.getWeeklyStats(user.uid);
      setWorkoutStats(newStats);

    } catch (error) {
      console.error('Error stopping workout:', error);
    }

    // Reset UI
    setActiveWorkout(null);
    setIsRunning(false);
    setTimer(0);
  };

  const toggleExerciseComplete = (exerciseIndex: number) => {
    if (!activeWorkout) return;
    
    const updatedWorkout = {
      ...activeWorkout,
      exercises: activeWorkout.exercises.map((exercise, index) =>
        index === exerciseIndex 
          ? { ...exercise, completed: !exercise.completed }
          : exercise
      )
    };
    
    setActiveWorkout(updatedWorkout);
  };

  // Buscar ejercicios por grupo muscular (target)
  const handleSearchExercises = async () => {
    const term = searchTerm.trim();
    if (!term) {
      try {
        const exercises = await exerciseAPIService.getAllExercises(20);
        setAvailableExercises(exercises);
      } catch (error) {
        console.error('Error loading all exercises:', error);
      }
      return;
    }

    setIsLoadingExercises(true);
    try {
      const target = translateMuscleTarget(term);
      const exercises = await exerciseAPIService.getExercisesByTarget(target);
      setAvailableExercises(exercises);
    } catch (error) {
      console.error('Error searching exercises by target:', error);
      setAvailableExercises([]);
    } finally {
      setIsLoadingExercises(false);
    }
  };

  // Crear workout personalizado
  const createCustomWorkout = async () => {
    if (selectedExercises.length === 0) return;

    try {
      setIsCreatingWorkout(true);
      setCreateError(null);
      const exercises: Exercise[] = selectedExercises.map((ex, index) => ({
        id: `${ex.id}_${index}`,
        name: ex.name,
        sets: ex.defaultSets,
        reps: ex.defaultReps,
        weight: 0,
        completed: false,
        restTime: ex.restTimeSeconds,
        notes: ''
      }));

      const newWorkout: Omit<WorkoutSession, 'id' | 'userId' | 'createdAt'> = {
        name: customWorkoutName.trim() || 'Rutina personalizada',
        duration: 0,
        isActive: true,
        exercises,
        totalCaloriesBurned: 0
      };

      let createdWorkout: WorkoutSession;
      if (user) {
        const workoutId = await workoutService.createWorkout(user.uid, newWorkout);
        createdWorkout = {
          ...newWorkout,
          id: workoutId,
          userId: user.uid,
          createdAt: Timestamp.fromDate(new Date())
        };
      } else {
        // Modo invitado: crear sesión local sin guardar en Firestore
        createdWorkout = {
          ...newWorkout,
          id: `local_${Date.now()}`,
          userId: 'guest',
          createdAt: Timestamp.fromDate(new Date())
        };
      }

      // Agregar al historial local
      setWorkoutHistory([createdWorkout, ...workoutHistory]);
      setFilteredHistory([createdWorkout, ...filteredHistory]);

      startWorkout(createdWorkout);
      
      // Reset modal
      setShowExerciseModal(false);
      setCustomWorkoutName('');
      setSelectedExercises([]);
    } catch (error) {
      console.error('Error creating custom workout:', error);
      setCreateError('No se pudo crear el entrenamiento. Inténtalo de nuevo.');
    } finally {
      setIsCreatingWorkout(false);
    }
  };

  // Cargar entrenamientos por fecha
  const loadWorkoutsByDate = async (date: string) => {
    if (!user) return;
    
    setIsLoadingHistory(true);
    try {
      const workouts = await workoutService.getWorkoutsByDate(user.uid, date);
      setFilteredHistory(workouts);
    } catch (error) {
      console.error('Error loading workouts by date:', error);
      setFilteredHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Rutinas predefinidas mejoradas
  const sampleWorkouts: Omit<WorkoutSession, 'id' | 'userId' | 'createdAt'>[] = [
    {
      name: "Rutina de Pecho",
      exercises: [
        { id: "1", name: "Push-ups", sets: 3, reps: 15, weight: 0, completed: false, restTime: 60 },
        { id: "2", name: "Bench Press", sets: 3, reps: 10, weight: 60, completed: false, restTime: 90 },
        { id: "3", name: "Incline Press", sets: 3, reps: 8, weight: 50, completed: false, restTime: 90 }
      ],
      duration: 0,
      isActive: true,
      totalCaloriesBurned: 0
    },
    {
      name: "Rutina de Piernas",
      exercises: [
        { id: "4", name: "Squats", sets: 4, reps: 12, weight: 80, completed: false, restTime: 120 },
        { id: "5", name: "Lunges", sets: 3, reps: 10, weight: 20, completed: false, restTime: 90 },
        { id: "6", name: "Deadlifts", sets: 3, reps: 8, weight: 100, completed: false, restTime: 120 }
      ],
      duration: 0,
      isActive: true,
      totalCaloriesBurned: 0
    },
    {
      name: "Cardio HIIT",
      exercises: [
        { id: "7", name: "Burpees", sets: 4, reps: 10, weight: 0, completed: false, restTime: 30 },
        { id: "8", name: "Mountain Climbers", sets: 4, reps: 20, weight: 0, completed: false, restTime: 30 },
        { id: "9", name: "Jump Squats", sets: 4, reps: 15, weight: 0, completed: false, restTime: 30 }
      ],
      duration: 0,
      isActive: true,
      totalCaloriesBurned: 0
    }
  ];

  const startSampleWorkout = async (sampleWorkout: Omit<WorkoutSession, 'id' | 'userId' | 'createdAt'>) => {
    if (!user) return;

    try {
      const workoutId = await workoutService.createWorkout(user.uid, sampleWorkout);
      const workout: WorkoutSession = {
        ...sampleWorkout,
        id: workoutId,
        userId: user.uid,
        createdAt: Timestamp.fromDate(new Date())
      };
      
      // Agregar al historial local
      setWorkoutHistory([workout, ...workoutHistory]);
      setFilteredHistory([workout, ...filteredHistory]);
      
      startWorkout(workout);
    } catch (error) {
      console.error('Error starting sample workout:', error);
    }
  };

  

  return (
    <div className="space-y-6">
      

      {/* Sección de Estadísticas Rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
          <div className="flex items-center gap-3">
            <Clock className="text-blue-500" size={20} />
            <div>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Esta Semana</p>
              <p className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {formatDuration(workoutStats.totalDuration)}
              </p>
            </div>
          </div>
        </div>

        <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
          <div className="flex items-center gap-3">
            <Dumbbell className="text-green-500" size={20} />
            <div>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Entrenamientos</p>
              <p className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{workoutStats.totalWorkouts}</p>
            </div>
          </div>
        </div>

        <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
          <div className="flex items-center gap-3">
            <Flame className="text-orange-500" size={20} />
            <div>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Calorías</p>
              <p className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{Math.round(workoutStats.totalCalories)}</p>
            </div>
          </div>
        </div>

        <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
          <div className="flex items-center gap-3">
            <Target className="text-purple-500" size={20} />
            <div>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Energía Promedio</p>
              <p className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                {workoutStats.avgEnergyLevel > 0 ? `${workoutStats.avgEnergyLevel.toFixed(1)}/10` : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="flex gap-4">
        <button
          onClick={() => setShowExerciseModal(true)}
          className={`flex-1 p-4 rounded-xl flex items-center justify-center gap-3 transition-all ${
            isDark
              ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-dark-neumorph'
              : 'bg-purple-500 hover:bg-purple-600 text-white shadow-neumorph'
          }`}
        >
          <Plus size={20} />
          <span className="font-medium">Crear Rutina</span>
        </button>
        
        <button
          onClick={() => setShowHistoryModal(true)}
          className={`flex-1 p-4 rounded-xl flex items-center justify-center gap-3 transition-all ${
            isDark
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-dark-neumorph'
              : 'bg-blue-500 hover:bg-blue-600 text-white shadow-neumorph'
          }`}
        >
          <Calendar size={20} />
          <span className="font-medium">Ver Historial</span>
        </button>
      </div>

      {/* API Error Display */}
      {apiError && (
        <div className={`p-4 rounded-xl border-l-4 border-yellow-500 ${
          isDark ? 'bg-yellow-900/20 text-yellow-300' : 'bg-yellow-50 text-yellow-800'
        }`}>
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">Problema con la API de Ejercicios</p>
              <p className="text-sm">{apiError}</p>
              <p className="text-xs mt-2">
                Para solucionarlo: Crea un archivo .env con VITE_RAPIDAPI_KEY=tu_clave_aqui
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Sección de Entrenamiento Activo */}
      {activeWorkout && (
        <div className={`p-6 rounded-xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {activeWorkout.name}
            </h3>
            
            <div className="flex items-center gap-4">
              <div className="text-2xl font-mono font-bold text-blue-500">
                {formatTime(timer)}
              </div>
              
              <div className="flex gap-2">
                {!isRunning ? (
                  <button
                    onClick={resumeWorkout}
                    className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                    title="Reanudar entrenamiento"
                  >
                    <Play size={20} />
                  </button>
                ) : (
                  <button
                    onClick={pauseWorkout}
                    className="p-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors"
                    title="Pausar entrenamiento"
                  >
                    <Pause size={20} />
                  </button>
                )}
                
                <button
                  onClick={stopWorkout}
                  className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  title="Detener entrenamiento"
                >
                  <Square size={20} />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {activeWorkout.exercises.map((exercise, index) => (
              <div
                key={exercise.id}
                className={`flex items-center gap-3 p-3 rounded-lg ${
                  exercise.completed
                    ? isDark ? 'bg-green-900/50' : 'bg-green-100'
                    : isDark ? 'bg-gray-700' : 'bg-gray-50'
                }`}
              >
                <button
                  onClick={() => toggleExerciseComplete(index)}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    exercise.completed
                      ? 'bg-green-500 border-green-500 text-white'
                      : isDark ? 'border-gray-500' : 'border-gray-300'
                  }`}
                  title={exercise.completed ? "Marcar como pendiente" : "Marcar como completado"}
                >
                  {exercise.completed && <CheckCircle size={14} />}
                </button>
                
                <div className="flex-1">
                  <p className={`font-medium ${
                    exercise.completed
                      ? isDark ? 'text-green-300 line-through' : 'text-green-700 line-through'
                      : isDark ? 'text-white' : 'text-gray-900'
                  }`}>
                    {exercise.name}
                  </p>
                  <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {exercise.sets} series × {exercise.reps} reps
                    {exercise.weight > 0 && ` - ${exercise.weight}kg`}
                    {exercise.restTime && ` - ${exercise.restTime}s descanso`}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>Progreso</span>
              <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>
                {activeWorkout.exercises.filter(e => e.completed).length} / {activeWorkout.exercises.length}
              </span>
            </div>
            <div className={`w-full bg-gray-200 rounded-full h-2 ${isDark ? 'bg-gray-700' : ''}`}>
              <div 
                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                style={{ 
                  width: `${(activeWorkout.exercises.filter(e => e.completed).length / activeWorkout.exercises.length) * 100}%` 
                }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {/* Sección de Rutinas Disponibles */}
      {!activeWorkout && (
        <div className={`p-6 rounded-xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
          <h3 className={`text-lg font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Rutinas Disponibles
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sampleWorkouts.map((workout, index) => (
              <button
                key={index}
                onClick={() => startSampleWorkout(workout)}
                className={`p-4 rounded-xl text-left transition-all ${
                  isDark
                    ? 'bg-gray-700 hover:bg-gray-600 shadow-dark-neumorph'
                    : 'bg-white hover:bg-gray-50 shadow-neumorph'
                }`}
                title={`Comenzar ${workout.name}`}
              >
                <h4 className={`font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {workout.name}
                </h4>
                <p className={`text-sm mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  {workout.exercises.length} ejercicios
                </p>
                <div className="space-y-1 mb-3">
                  {workout.exercises.slice(0, 3).map((exercise, exerciseIndex) => (
                    <p key={exerciseIndex} className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                      • {exercise.name}
                    </p>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Play size={16} className="text-green-500" />
                  <span className="text-sm text-green-500">Comenzar</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modal para crear rutina personalizada */}
      {showExerciseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl ${
            isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
          }`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                Crear Rutina Personalizada
              </h3>
              <button
                onClick={() => setShowExerciseModal(false)}
                className={`p-2 rounded-lg transition-all ${
                  isDark ? 'hover:bg-gray-700 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                }`}
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Nombre del workout */}
              <input
                type="text"
                placeholder="Nombre de la rutina..."
                value={customWorkoutName}
                onChange={(e) => setCustomWorkoutName(e.target.value)}
                className={`w-full px-4 py-3 rounded-lg border-none outline-none ${
                  isDark
                    ? 'bg-gray-700 text-white placeholder-gray-400 shadow-dark-neumorph'
                    : 'bg-gray-50 text-gray-800 placeholder-gray-500 shadow-neumorph'
                }`}
              />

              {/* Búsqueda de ejercicios */}
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Search size={18} className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${
                    isDark ? 'text-gray-400' : 'text-gray-500'
                  }`} />
                  <input
                    type="text"
                    placeholder="Buscar ejercicios..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearchExercises()}
                    className={`w-full pl-10 pr-4 py-3 rounded-lg border-none outline-none ${
                      isDark
                        ? 'bg-gray-700 text-white placeholder-gray-400 shadow-dark-neumorph'
                        : 'bg-gray-50 text-gray-800 placeholder-gray-500 shadow-neumorph'
                    }`}
                  />
                </div>
                <button
                  onClick={handleSearchExercises}
                  disabled={isLoadingExercises}
                  className={`px-6 py-3 rounded-lg font-medium transition-all ${
                    isLoadingExercises
                      ? 'bg-gray-400 cursor-not-allowed'
                      : isDark
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-dark-neumorph'
                      : 'bg-blue-500 hover:bg-blue-600 text-white shadow-neumorph'
                  }`}
                >
                  {isLoadingExercises ? 'Buscando...' : 'Buscar'}
                </button>
              </div>

              {/* Lista de ejercicios disponibles */}
              <div>
                <h4 className={`text-md font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                  Ejercicios Disponibles ({availableExercises.length})
                </h4>
                {/* Agregar ejercicio manualmente */}
                <div className="flex flex-col gap-2 mb-3">
                  <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="Agregar ejercicio manual (p. ej., Sentadillas)"
                    value={manualExerciseName}
                    onChange={(e) => setManualExerciseName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && manualExerciseName.trim()) {
                        const nowId = `manual_${Date.now()}`;
                        const manual: AdaptedExercise = {
                          id: nowId,
                          name: manualExerciseName.trim(),
                          category: 'strength',
                          primaryMuscles: [],
                          secondaryMuscles: [],
                          equipment: 'Peso corporal',
                          difficulty: 'beginner',
                          instructions: [],
                          gifUrl: '',
                          caloriesPerMinute: 6,
                          defaultSets: manualSets,
                          defaultReps: manualReps,
                          restTimeSeconds: manualRest,
                          bodyPart: 'waist',
                          target: 'abs'
                        };
                        setSelectedExercises([...selectedExercises, manual]);
                        setManualExerciseName('');
                        setManualAddNotice('Ejercicio agregado');
                        setTimeout(() => setManualAddNotice(null), 1500);
                      }
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg border-none outline-none ${
                      isDark ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-800'
                    }`}
                  />
                    <input
                      type="number"
                      min={1}
                      value={manualSets}
                      onChange={(e) => setManualSets(Math.max(1, Number(e.target.value) || 1))}
                      className={`w-20 px-3 py-2 rounded-lg border-none outline-none ${
                        isDark ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-800'
                      }`}
                      placeholder="Sets"
                      title="Series"
                    />
                    <input
                      type="number"
                      min={1}
                      value={manualReps}
                      onChange={(e) => setManualReps(Math.max(1, Number(e.target.value) || 1))}
                      className={`w-24 px-3 py-2 rounded-lg border-none outline-none ${
                        isDark ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-800'
                      }`}
                      placeholder="Reps"
                      title="Repeticiones"
                    />
                    <input
                      type="number"
                      min={0}
                      value={manualRest}
                      onChange={(e) => setManualRest(Math.max(0, Number(e.target.value) || 0))}
                      className={`w-28 px-3 py-2 rounded-lg border-none outline-none ${
                        isDark ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-800'
                      }`}
                      placeholder="Descanso (s)"
                      title="Descanso en segundos"
                    />
                  <button
                    onClick={() => {
                      if (!manualExerciseName.trim()) return;
                      const nowId = `manual_${Date.now()}`;
                      const manual: AdaptedExercise = {
                        id: nowId,
                        name: manualExerciseName.trim(),
                        category: 'strength',
                        primaryMuscles: [],
                        secondaryMuscles: [],
                        equipment: 'Peso corporal',
                        difficulty: 'beginner',
                        instructions: [],
                        gifUrl: '',
                        caloriesPerMinute: 6,
                        defaultSets: manualSets,
                        defaultReps: manualReps,
                        restTimeSeconds: manualRest,
                        bodyPart: 'waist',
                        target: 'abs'
                      };
                      setSelectedExercises([...selectedExercises, manual]);
                      setManualExerciseName('');
                      setManualAddNotice('Ejercicio agregado');
                      setTimeout(() => setManualAddNotice(null), 1500);
                    }}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      isDark ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-500 hover:bg-green-600 text-white'
                    }`}
                  >
                    Agregar
                  </button>
                  </div>
                  {manualAddNotice && (
                    <span className={`text-xs ${isDark ? 'text-green-300' : 'text-green-700'}`}>{manualAddNotice}</span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                  {isLoadingExercises ? (
                    <div className="col-span-full text-center py-8">
                      <div className={`inline-block animate-spin rounded-full h-8 w-8 border-b-2 ${
                        isDark ? 'border-purple-400' : 'border-purple-600'
                      }`}></div>
                      <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Cargando ejercicios...
                      </p>
                    </div>
                  ) : availableExercises.length > 0 ? (
                    availableExercises.map((exercise) => (
                      <button
                        key={exercise.id}
                        onClick={() => {
                          if (selectedExercises.find(ex => ex.id === exercise.id)) {
                            setSelectedExercises(selectedExercises.filter(ex => ex.id !== exercise.id));
                          } else {
                            setSelectedExercises([...selectedExercises, exercise]);
                          }
                        }}
                        className={`p-3 rounded-lg text-left transition-all ${
                          selectedExercises.find(ex => ex.id === exercise.id)
                            ? isDark
                              ? 'bg-purple-600 text-white'
                              : 'bg-purple-500 text-white'
                            : isDark
                            ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium text-sm">{exercise.name}</span>
                          <span className="text-xs opacity-75">{exercise.difficulty}</span>
                        </div>
                        <div className="text-xs opacity-75 mb-1">
                          {exercise.primaryMuscles.join(', ')}
                        </div>
                        <div className="text-xs opacity-75">
                          {exercise.equipment} • {exercise.defaultSets} sets × {exercise.defaultReps} reps
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="col-span-full text-center py-8">
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {apiError ? 'Error al cargar ejercicios. Verifica tu conexión a internet y configuración de API.' : 'No se encontraron ejercicios.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Ejercicios seleccionados */}
              {selectedExercises.length > 0 && (
                <div>
                  <h4 className={`text-md font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                    Ejercicios Seleccionados ({selectedExercises.length})
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selectedExercises.map((exercise, index) => (
                      <div 
                        key={`selected-${exercise.id}-${index}`}
                        className={`p-2 rounded-lg ${
                          isDark ? 'bg-purple-900/50' : 'bg-purple-100'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className={`text-sm font-medium ${isDark ? 'text-purple-200' : 'text-purple-800'}`}>
                            {exercise.name}
                          </span>
                          <button
                            onClick={() => setSelectedExercises(selectedExercises.filter((_, i) => i !== index))}
                            className={`text-sm ${isDark ? 'text-purple-300 hover:text-red-300' : 'text-purple-600 hover:text-red-600'}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs ${isDark ? 'text-purple-200' : 'text-purple-700'}`}>Series</span>
                            <input
                              type="number"
                              min={1}
                              value={exercise.defaultSets}
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value) || 1);
                                const copy = [...selectedExercises];
                                copy[index] = { ...copy[index], defaultSets: val };
                                setSelectedExercises(copy);
                              }}
                              className={`w-20 px-2 py-1 rounded ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-800'}`}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs ${isDark ? 'text-purple-200' : 'text-purple-700'}`}>Reps</span>
                            <input
                              type="number"
                              min={1}
                              value={exercise.defaultReps}
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value) || 1);
                                const copy = [...selectedExercises];
                                copy[index] = { ...copy[index], defaultReps: val };
                                setSelectedExercises(copy);
                              }}
                              className={`w-20 px-2 py-1 rounded ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-800'}`}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs ${isDark ? 'text-purple-200' : 'text-purple-700'}`}>Descanso</span>
                            <input
                              type="number"
                              min={0}
                              value={exercise.restTimeSeconds}
                              onChange={(e) => {
                                const val = Math.max(0, Number(e.target.value) || 0);
                                const copy = [...selectedExercises];
                                copy[index] = { ...copy[index], restTimeSeconds: val };
                                setSelectedExercises(copy);
                              }}
                              className={`w-24 px-2 py-1 rounded ${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-800'}`}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botones de acción */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowExerciseModal(false);
                    setCustomWorkoutName('');
                    setSelectedExercises([]);
                    setSearchTerm('');
                    setCreateError(null);
                  }}
                  className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                    isDark
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 shadow-dark-neumorph'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 shadow-neumorph'
                  }`}
                >
                  Cancelar
                </button>
                <button
                  onClick={createCustomWorkout}
                  disabled={isCreatingWorkout || selectedExercises.length === 0}
                  className={`flex-1 py-3 rounded-lg font-medium text-white transition-all flex items-center justify-center gap-2 ${
                    isCreatingWorkout || selectedExercises.length === 0
                      ? 'bg-gray-400 cursor-not-allowed'
                      : isDark
                      ? 'bg-purple-600 hover:bg-purple-700 shadow-dark-neumorph'
                      : 'bg-purple-500 hover:bg-purple-600 shadow-neumorph'
                  }`}
                >
                  <Save size={16} />
                  <span>{isCreatingWorkout ? 'Creando…' : 'Crear e Iniciar'}</span>
                </button>
              </div>
              {createError && (
                <p className={`mt-3 text-sm ${isDark ? 'text-red-300' : 'text-red-600'}`}>{createError}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de historial */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl ${
            isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
          }`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                Historial de Entrenamientos
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className={`p-2 rounded-lg transition-all ${
                  isDark ? 'hover:bg-gray-700 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                }`}
              >
                <X size={20} />
              </button>
            </div>

            {/* Filtro por fecha */}
            <div className="mb-6">
              <div className="flex gap-3 items-center">
                <Calendar size={20} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className={`px-4 py-2 rounded-lg border-none outline-none ${
                    isDark
                      ? 'bg-gray-700 text-white shadow-dark-neumorph'
                      : 'bg-gray-50 text-gray-800 shadow-neumorph'
                  }`}
                />
                <button
                  onClick={() => loadWorkoutsByDate(selectedDate)}
                  disabled={isLoadingHistory}
                  className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                    isLoadingHistory
                      ? 'bg-gray-400 cursor-not-allowed'
                      : isDark
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-dark-neumorph'
                      : 'bg-blue-500 hover:bg-blue-600 text-white shadow-neumorph'
                  }`}
                >
                  <Filter size={16} />
                  {isLoadingHistory ? 'Cargando...' : 'Filtrar'}
                </button>
                <button
                  onClick={() => {
                    setFilteredHistory(workoutHistory);
                    setSelectedDate(new Date().toISOString().split('T')[0]);
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    isDark
                      ? 'bg-gray-600 hover:bg-gray-500 text-white shadow-dark-neumorph'
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-700 shadow-neumorph'
                  }`}
                >
                  Mostrar Todos
                </button>
              </div>
            </div>

            {/* Lista del historial */}
            <div className="space-y-4">
              {isLoadingHistory ? (
                <div className="text-center py-8">
                  <div className={`inline-block animate-spin rounded-full h-8 w-8 border-b-2 ${
                    isDark ? 'border-purple-400' : 'border-purple-600'
                  }`}></div>
                  <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Cargando entrenamientos...
                  </p>
                </div>
              ) : filteredHistory.length > 0 ? (
                filteredHistory.map((workout) => (
                  <div 
                    key={workout.id}
                    className={`p-4 rounded-lg border ${
                      isDark 
                        ? 'bg-gray-700 border-gray-600' 
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {workout.name}
                        </h4>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          {workout.createdAt && new Date(workout.createdAt.toDate()).toLocaleDateString('es-ES', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-medium ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                          {formatTime(workout.duration)}
                        </div>
                        {workout.totalCaloriesBurned && (
                          <div className={`text-xs ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                            {workout.totalCaloriesBurned} cal
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-1 mb-3">
                      {workout.exercises.map((exercise, index) => (
                        <div key={index} className="flex justify-between items-center">
                          <span className={`text-sm ${
                            exercise.completed 
                              ? isDark ? 'text-green-400' : 'text-green-600'
                              : isDark ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            {exercise.completed ? '✓' : '○'} {exercise.name}
                          </span>
                          <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            {exercise.sets} × {exercise.reps}
                            {exercise.weight > 0 && ` (${exercise.weight}kg)`}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                        {workout.exercises.filter(e => e.completed).length} / {workout.exercises.length} ejercicios completados
                      </span>
                      <span className={`px-2 py-1 rounded ${
                        workout.isActive 
                          ? isDark ? 'bg-yellow-900 text-yellow-300' : 'bg-yellow-100 text-yellow-800'
                          : isDark ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-800'
                      }`}>
                        {workout.isActive ? 'En progreso' : 'Completado'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <Dumbbell size={48} className={`mx-auto mb-4 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
                  <p className={`text-lg font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {selectedDate !== new Date().toISOString().split('T')[0] 
                      ? `No hay entrenamientos para ${new Date(selectedDate).toLocaleDateString('es-ES')}`
                      : 'No hay entrenamientos registrados'
                    }
                  </p>
                  <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    {selectedDate !== new Date().toISOString().split('T')[0]
                      ? 'Prueba con otra fecha o crea un nuevo entrenamiento'
                      : '¡Comienza tu primer entrenamiento para ver el historial aquí!'
                    }
                  </p>
                </div>
              )}
            </div>

            {/* Resumen de estadísticas del historial */}
            {filteredHistory.length > 0 && !isLoadingHistory && (
              <div className={`mt-6 p-4 rounded-lg ${
                isDark ? 'bg-gray-700' : 'bg-gray-100'
              }`}>
                <h4 className={`text-md font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                  Resumen del Período
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                      {filteredHistory.length}
                    </div>
                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Entrenamientos
                    </div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                      {formatDuration(filteredHistory.reduce((sum, w) => sum + w.duration, 0))}
                    </div>
                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Tiempo Total
                    </div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                      {Math.round(filteredHistory.reduce((sum, w) => sum + (w.totalCaloriesBurned || 0), 0))}
                    </div>
                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Calorías
                    </div>
                  </div>
                  <div className="text-center">
                    <div className={`text-2xl font-bold ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                      {Math.round((filteredHistory.reduce((sum, w) => {
                        const completed = w.exercises.filter(e => e.completed).length;
                        const total = w.exercises.length;
                        return sum + (total > 0 ? (completed / total) * 100 : 0);
                      }, 0) / Math.max(1, filteredHistory.length)))}%
                    </div>
                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Completado
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Estado de carga inicial */}
      {!user && (
        <div className="text-center py-12">
          <div className={`inline-block animate-spin rounded-full h-8 w-8 border-b-2 ${
            isDark ? 'border-purple-400' : 'border-purple-600'
          }`}></div>
          <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Cargando datos del usuario...
          </p>
        </div>
      )}
    </div>
  );
}