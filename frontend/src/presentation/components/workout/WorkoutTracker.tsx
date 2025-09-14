// WorkoutTracker: gestiona creación, ejecución e historial de entrenamientos.
// Incluye: búsqueda por grupo muscular, plantillas de usuario, pesos por ejercicio,


import { useEffect, useState } from 'react';
import { Play, Pause, Square, Plus, Clock, Flame, Target, Dumbbell, Search, Save, Trash2, Calendar, Filter, AlertCircle, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { workoutService, WorkoutSession, Exercise, workoutTemplateService, WorkoutTemplate } from '../../../business/services/firestoreService';
import { exerciseAPIService, AdaptedExercise } from '../../../business/services/exerciseAPI';
import { Timestamp } from 'firebase/firestore';

interface WorkoutTrackerProps {
  isDark: boolean;
}

type WeightedExercise = AdaptedExercise & { defaultWeightKg?: number };

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

const translateMuscleTarget = (term: string): string => MUSCLE_TARGETS_ES_TO_EN[term.trim().toLowerCase()] ?? term.trim().toLowerCase();

const SUGGESTED_GROUPS = [
  'Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps',
  'Abdominales', 'Glúteos', 'Cuádriceps', 'Isquiotibiales', 'Pantorrillas'
];

export default function WorkoutTracker({ isDark }: WorkoutTrackerProps) {
  const { user } = useAuth();

  // Estado general
  const [workoutStats, setWorkoutStats] = useState({ totalDuration: 0, totalWorkouts: 0, avgEnergyLevel: 0, totalCalories: 0 });
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutSession[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<WorkoutSession[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [expandedWorkouts, setExpandedWorkouts] = useState<Record<string | number, boolean>>({});

  // Activo
  const [activeWorkout, setActiveWorkout] = useState<WorkoutSession | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [timer, setTimer] = useState(0);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [preEnergy, setPreEnergy] = useState(5);
  const [postEnergy, setPostEnergy] = useState(5);

  // Búsqueda/creación
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [availableExercises, setAvailableExercises] = useState<AdaptedExercise[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<AdaptedExercise[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingExercises, setIsLoadingExercises] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [customWorkoutName, setCustomWorkoutName] = useState('');
  const [isCreatingWorkout, setIsCreatingWorkout] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [saveAsTemplateChecked, setSaveAsTemplateChecked] = useState(false);
  const [exerciseTimers, setExerciseTimers] = useState<Record<string, { remaining: number; running: boolean }>>({});
  const [timerEditors, setTimerEditors] = useState<Record<string, { open: boolean; m: number; s: number }>>({});

  // Campos manuales
  const [manualExerciseName, setManualExerciseName] = useState('');
  const [manualSets, setManualSets] = useState(3);
  const [manualReps, setManualReps] = useState(10);
  const [manualRest, setManualRest] = useState(60);
  const [manualWeight, setManualWeight] = useState(0);
  const [manualAddNotice, setManualAddNotice] = useState<string | null>(null);

  // Plantillas
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setExerciseTimers(prev => {
        let changed = false;
        const next: typeof prev = { ...prev };
        Object.keys(next).forEach(k => {
          const t = next[k];
          if (t.running && t.remaining > 0) {
            next[k] = { ...t, remaining: t.remaining - 1 };
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  type ExerciseWithId = Exercise & { id?: string };
  const getTimerKey = (exercise: ExerciseWithId, index: number) => (exercise?.id ? String(exercise.id) : String(index));
  const getTimerRemaining = (exercise: ExerciseWithId, index: number) => {
    const key = getTimerKey(exercise, index);
    return exerciseTimers[key]?.remaining ?? (exercise.restTime ?? 60);
  };
  const startTimer = (exercise: ExerciseWithId, index: number) => {
    const key = getTimerKey(exercise, index);
    setExerciseTimers(prev => ({
      ...prev,
      [key]: { remaining: prev[key]?.remaining ?? (exercise.restTime ?? 60), running: true }
    }));
  };
  const pauseTimer = (exercise: ExerciseWithId, index: number) => {
    const key = getTimerKey(exercise, index);
    setExerciseTimers(prev => prev[key] ? { ...prev, [key]: { ...prev[key], running: false } } : prev);
  };
  const resetTimer = (exercise: ExerciseWithId, index: number) => {
    const key = getTimerKey(exercise, index);
    setExerciseTimers(prev => ({ ...prev, [key]: { remaining: (exercise.restTime ?? 60), running: false } }));
  };
  const toggleTimerEditor = (exercise: ExerciseWithId, index: number) => {
    const key = getTimerKey(exercise, index);
    const current = getTimerRemaining(exercise, index);
    const m = Math.floor(current / 60);
    const s = current % 60;
    setTimerEditors(prev => ({
      ...prev,
      [key]: { open: !prev[key]?.open, m, s }
    }));
  };
  const applyTimerEditor = (exercise: ExerciseWithId, index: number) => {
    const key = getTimerKey(exercise, index);
    const ed = timerEditors[key];
    if (!ed) return;
    const total = Math.max(0, (ed.m || 0) * 60 + (ed.s || 0));
    setExerciseTimers(prev => ({
      ...prev,
      [key]: { remaining: total, running: false }
    }));

    if (activeWorkout) {
      const updated = { ...activeWorkout } as WorkoutSession;
      updated.exercises[index] = { ...updated.exercises[index], restTime: total };
      setActiveWorkout(updated);
    }
    setTimerEditors(prev => ({ ...prev, [key]: { ...prev[key], open: false } }));
  };

  // Carga inicial
  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        const stats = await workoutService.getWeeklyStats(user.uid);
        setWorkoutStats(stats);
        const all = await workoutService.getUserWorkouts(user.uid);
        setWorkoutHistory(all);
        setFilteredHistory(all);
        const tpl = await workoutTemplateService.getUserTemplates(user.uid);
        setTemplates(tpl);
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [user]);

  // Cronómetro
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setTimer(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const formatTime = (total: number) => {
    const mm = Math.floor(total / 60).toString().padStart(2, '0');
    const ss = Math.floor(total % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  // Buscar ejercicios (target por grupo muscular)
  const handleSearchExercises = async (termOverride?: string) => {
    const term = (termOverride ?? searchTerm).trim();
    setApiError(null);
    setIsLoadingExercises(true);
    try {
      let exercises: AdaptedExercise[] = [];
      if (!term) {
        exercises = await exerciseAPIService.getAllExercises(20);
      } else {
        exercises = await exerciseAPIService.getExercisesByTarget(translateMuscleTarget(term));
      }
      setAvailableExercises(exercises);
    } catch (e: unknown) {
      console.error(e);
      setApiError('No se pudieron cargar ejercicios. Verifica tu API Key.');
      setAvailableExercises([]);
    } finally {
      setIsLoadingExercises(false);
    }
  };

  // Crear rutina personalizada
  const startWorkout = (workout: WorkoutSession) => {
    setActiveWorkout(workout);
    setTimer(0);
    setIsRunning(true);
  };

  const createCustomWorkout = async () => {
    if (selectedExercises.length === 0) return;
    try {
      setIsCreatingWorkout(true);
      setCreateError(null);
      const exercises: Exercise[] = selectedExercises.map((ex, index) => {
        const w = ex as WeightedExercise;
        return {
          id: `${ex.id}_${index}`,
          name: ex.name,
          sets: ex.defaultSets,
          reps: ex.defaultReps,
          weight: Math.max(0, w.defaultWeightKg ?? 0),
          completed: false,
          restTime: ex.restTimeSeconds,
          notes: ''
        };
      });

      const payload: Omit<WorkoutSession, 'id' | 'userId' | 'createdAt'> = {
        name: customWorkoutName.trim() || 'Rutina personalizada',
        duration: 0,
        isActive: true,
        exercises,
        totalCaloriesBurned: 0,
        preEnergyLevel: preEnergy
      };

      let created: WorkoutSession;
      if (user) {
        const id = await workoutService.createWorkout(user.uid, payload);
        created = { ...payload, id, userId: user.uid, createdAt: Timestamp.fromDate(new Date()) };
      } else {
        created = { ...payload, id: `local_${Date.now()}`, userId: 'guest', createdAt: Timestamp.fromDate(new Date()) };
      }

      setWorkoutHistory([created, ...workoutHistory]);
      setFilteredHistory([created, ...filteredHistory]);
      startWorkout(created);

      setShowExerciseModal(false);
      setCustomWorkoutName('');
      setSelectedExercises([]);
      setSearchTerm('');
    } catch (e) {
      console.error(e);
      setCreateError('No se pudo crear el entrenamiento.');
    } finally {
      setIsCreatingWorkout(false);
    }
  };

  // Completar/pausar/detener
  const pauseWorkout = () => setIsRunning(false);
  const resumeWorkout = () => setIsRunning(true);

  // Botón de completar ejercicio a nivel de título eliminado según nueva UI

  const stopWorkout = async () => {
    if (!activeWorkout || !user) return;
    if (!showFinalizeConfirm) { setShowFinalizeConfirm(true); return; }
    try {
      const completed = activeWorkout.exercises.filter(e => e.completed);
      const totalCalories = completed.reduce((sum, ex) => {
        const ae = availableExercises.find(a => a.name === ex.name);
        return sum + ((ae?.caloriesPerMinute || 6) * (timer / 60));
      }, 0);
      const updates: Partial<WorkoutSession> = {
        duration: timer,
        isActive: false,
        postEnergyLevel: postEnergy,
        completedAt: Timestamp.fromDate(new Date()),
        totalCaloriesBurned: Math.round(totalCalories),
        exercises: activeWorkout.exercises
      };
      await workoutService.updateWorkout(activeWorkout.id!, updates);
      const merged = { ...activeWorkout, ...updates } as WorkoutSession;
      const hist = workoutHistory.map(w => w.id === merged.id ? merged : w);
      setWorkoutHistory(hist);
      setFilteredHistory(hist);
      const stats = await workoutService.getWeeklyStats(user.uid);
      setWorkoutStats(stats);
    } catch (e) {
      console.error(e);
    }
    setActiveWorkout(null);
    setIsRunning(false);
    setTimer(0);
    setShowFinalizeConfirm(false);
  };

  // Plantillas
  const refreshTemplates = async () => {
    if (!user) return;
    setIsLoadingTemplates(true);
    try {
      const tpl = await workoutTemplateService.getUserTemplates(user.uid);
      setTemplates(tpl);
    } finally { setIsLoadingTemplates(false); }
  };

  const applyTemplate = (tpl: WorkoutTemplate) => {
    const mapped: AdaptedExercise[] = tpl.exercises.map((te, i) => ({
      id: `template_${tpl.id || 'local'}_${i}`,
      name: te.name,
      category: 'strength',
      primaryMuscles: [],
      secondaryMuscles: [],
      equipment: 'Peso corporal',
      difficulty: 'beginner',
      instructions: [],
      gifUrl: '',
      caloriesPerMinute: 6,
      defaultSets: te.sets,
      defaultReps: te.reps,
      restTimeSeconds: te.restTime ?? 60,
      bodyPart: 'waist',
      target: 'abs',
      ...(typeof te.weightKg === 'number' ? ({ defaultWeightKg: te.weightKg } as unknown as WeightedExercise) : {})
    }));
    setCustomWorkoutName(tpl.name);
    setSelectedExercises(mapped);
    setShowExerciseModal(true);
  };

  const deleteTemplate = async (id: string) => {
    try { await workoutTemplateService.deleteTemplate(id); setTemplates(t => t.filter(x => x.id !== id)); }
    catch (e) { console.error(e); }
  };

  const loadWorkoutsByDate = async (date: string) => {
    if (!user) return;
    setIsLoadingHistory(true);
    try {
      const ws = await workoutService.getWorkoutsByDate(user.uid, date);
      setFilteredHistory(ws);
    } catch (e) { console.error(e); setFilteredHistory([]); }
    finally { setIsLoadingHistory(false); }
  };

  // UI
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
          <div className="flex items-center gap-3">
            <Clock className="text-blue-500" size={20} />
            <div>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Tiempo (semana)</p>
              <p className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{formatDuration(workoutStats.totalDuration)}</p>
            </div>
          </div>
        </div>
        <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
          <div className="flex items-center gap-3">
            <Dumbbell className="text-green-500" size={20} />
            <div>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Entrenamientos (semana)</p>
              <p className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{workoutStats.totalWorkouts}</p>
            </div>
          </div>
        </div>
        <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
          <div className="flex items-center gap-3">
            <Flame className="text-orange-500" size={20} />
            <div>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Calorías (semana)</p>
              <p className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{Math.round(workoutStats.totalCalories)}</p>
            </div>
          </div>
        </div>
        <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
          <div className="flex items-center gap-3">
            <Target className="text-purple-500" size={20} />
            <div>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Energía Promedio</p>
              <p className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{workoutStats.avgEnergyLevel > 0 ? `${workoutStats.avgEnergyLevel.toFixed(1)}/10` : 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex gap-4">
        <button onClick={() => setShowExerciseModal(true)} className={`flex-1 p-4 rounded-xl flex items-center justify-center gap-3 transition-all ${isDark ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-dark-neumorph' : 'bg-purple-500 hover:bg-purple-600 text-white shadow-neumorph'}`}>
          <Plus size={20} />
          <span className="font-medium">Crear Rutina</span>
        </button>
        <button onClick={() => setShowHistoryModal(true)} className={`flex-1 p-4 rounded-xl flex items-center justify-center gap-3 transition-all ${isDark ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-dark-neumorph' : 'bg-blue-500 hover:bg-blue-600 text-white shadow-neumorph'}`}>
          <Calendar size={20} />
          <span className="font-medium">Ver Historial</span>
        </button>
      </div>

      {/* Mis plantillas */}
      <div className="mt-2">
        <h3 className={`${isDark ? 'text-white' : 'text-gray-900'} text-lg font-semibold mb-2`}>Mis Plantillas</h3>
        {isLoadingTemplates ? (
          <div className={`${isDark ? 'text-gray-400' : 'text-gray-600'} text-sm`}>Cargando plantillas…</div>
        ) : templates.length === 0 ? (
          <div className={`${isDark ? 'text-gray-400' : 'text-gray-600'} text-sm`}>Aún no tienes plantillas. Crea una rutina y guárdala como plantilla.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {templates.map(tpl => (
              <div key={tpl.id} className={`p-4 rounded-xl flex flex-col justify-between ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
                <div>
                  <div className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{tpl.name}</div>
                  <div className={`${isDark ? 'text-gray-400' : 'text-gray-600'} text-sm`}>{tpl.exercises.length} ejercicios</div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => applyTemplate(tpl)} className={`${isDark ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'} flex-1 py-2 rounded-lg text-sm`}>Usar</button>
                  <button onClick={() => tpl.id && deleteTemplate(tpl.id)} className={`${isDark ? 'bg-red-700 hover:bg-red-800 text-white' : 'bg-red-500 hover:bg-red-600 text-white'} px-3 rounded-lg text-sm`} title="Eliminar plantilla">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* API error */}
      {apiError && (
        <div className={`p-4 rounded-xl border-l-4 border-yellow-500 ${isDark ? 'bg-yellow-900/20 text-yellow-300' : 'bg-yellow-50 text-yellow-800'}`}>
          <div className="flex">
            <div className="flex-shrink-0"><AlertCircle className="h-5 w-5 text-yellow-500" /></div>
            <div className="ml-3">
              <p className="text-sm font-medium">Problema con la API de Ejercicios</p>
              <p className="text-sm">{apiError}</p>
              <p className="text-xs mt-2">Para solucionarlo: Crea un archivo .env con VITE_RAPIDAPI_KEY=tu_clave_aqui</p>
            </div>
          </div>
        </div>
      )}

      {/* Entrenamiento activo */}
      {activeWorkout && (
        <div className={`p-6 rounded-xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
          <div className="flex justify-between items-center mb-4">
            <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{activeWorkout.name}</h3>
            <div className="flex items-center gap-4">
              <div className="text-2xl font-mono font-bold text-blue-500">{formatTime(timer)}</div>
              <div className="flex gap-2">
                {!isRunning ? (
                  <button onClick={resumeWorkout} className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors" title="Reanudar entrenamiento"><Play size={20} /></button>
                ) : (
                  <button onClick={pauseWorkout} className="p-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors" title="Pausar entrenamiento"><Pause size={20} /></button>
                )}
                <button onClick={() => setShowFinalizeConfirm(true)} className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors" title="Finalizar">
                  <Square size={20} />
                </button>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {activeWorkout.exercises.map((exercise, index) => (
              <div key={exercise.id} className={`flex items-start gap-3 p-3 rounded-lg ${exercise.completed ? (isDark ? 'bg-green-900/50' : 'bg-green-100') : (isDark ? 'bg-gray-700' : 'bg-gray-50')}`}>
                <div className="flex-1">
                  <p className={`font-medium ${exercise.completed ? (isDark ? 'text-green-300 line-through' : 'text-green-700 line-through') : (isDark ? 'text-white' : 'text-gray-900')}`}>{exercise.name}</p>
                  <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'} flex flex-col gap-2`}>
                    <span className="flex items-center gap-2">
                      <button type="button" onClick={() => toggleTimerEditor(exercise as ExerciseWithId, index)} className={`${isDark ? 'text-gray-300 hover:text-white' : 'text-gray-700 hover:text-black'} p-1 rounded`} title="Ajustar temporizador">
                        <Clock size={16} />
                      </button>
                      <span className="font-mono">{formatTime(getTimerRemaining(exercise as ExerciseWithId, index))}</span>
                      {exerciseTimers[getTimerKey(exercise as ExerciseWithId, index)]?.running ? (
                        <button onClick={() => pauseTimer(exercise as ExerciseWithId, index)} className={`${isDark ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-yellow-500 hover:bg-yellow-400'} text-white text-xs px-2 py-0.5 rounded`}>Pausar</button>
                      ) : (
                        <button onClick={() => startTimer(exercise as ExerciseWithId, index)} className={`${isDark ? 'bg-green-700 hover:bg-green-600' : 'bg-green-600 hover:bg-green-500'} text-white text-xs px-2 py-0.5 rounded`}>Iniciar</button>
                      )}
                      <button onClick={() => resetTimer(exercise as ExerciseWithId, index)} className={`${isDark ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-300 hover:bg-gray-400'} text-white text-xs px-2 py-0.5 rounded`}>Reiniciar</button>
                    </span>
                    {(() => { const key = getTimerKey(exercise as ExerciseWithId, index); const ed = timerEditors[key]; return ed?.open ? (
                      <span className="flex items-center gap-1 text-xs">
                        <span className="opacity-70">Duración:</span>
                        <input type="number" min={0} max={59} value={ed.m} onChange={(e)=>{
                          const v = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                          setTimerEditors(prev=>({ ...prev, [key]: { ...(prev[key]||{open:true,m:0,s:0}), m: v } }));
                        }} className={`${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-800'} w-12 px-2 py-1 rounded`} />
                        <span>:</span>
                        <input type="number" min={0} max={59} value={ed.s} onChange={(e)=>{
                          const v = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                          setTimerEditors(prev=>({ ...prev, [key]: { ...(prev[key]||{open:true,m:0,s:0}), s: v } }));
                        }} className={`${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-800'} w-12 px-2 py-1 rounded`} />
                        <button onClick={() => applyTimerEditor(exercise as ExerciseWithId, index)} className={`${isDark ? 'bg-blue-700 hover:bg-blue-600' : 'bg-blue-600 hover:bg-blue-500'} text-white text-xs px-2 py-1 rounded`}>Aplicar</button>
                      </span>
                    ) : null; })()}
                  </div>
                  {}
                  <div className="mt-2 space-y-2">
                    {Array.from({ length: exercise.sets }).map((_, setIdx) => {
                      const detail = exercise.setsDetail?.[setIdx] ?? { reps: exercise.reps, weight: exercise.weight, done: false };
                      const prevWorkout = workoutHistory
                        .filter(w => !w.isActive && w.exercises.some(e => e.name === exercise.name))
                        .sort((a, b) => (b.completedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0) - (a.completedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0))[0];
                      const prevExercise = prevWorkout?.exercises.find(e => e.name === exercise.name);
                      const prevWeight = prevExercise?.setsDetail?.[setIdx]?.weight ?? prevExercise?.weight ?? null;
                      return (
                        <div key={setIdx} className={`flex flex-wrap items-center gap-3 text-sm p-2 rounded transition-colors ${detail.done
                          ? (isDark ? 'bg-green-900/50 text-green-200' : 'bg-green-100 text-green-800')
                          : (isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-800')}`}>
                          <span className="text-xs font-medium">Serie {setIdx + 1}</span>
                          <span className="text-xs opacity-70">Anterior: {prevWeight != null ? `${prevWeight} kg` : '-'}</span>
                          <span className="text-xs">Kg</span>
                          <input type="number" min={0} value={detail.weight} onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            const updated = { ...activeWorkout } as WorkoutSession;
                            const base = { reps: updated.exercises[index].reps, weight: updated.exercises[index].weight, done: false };
                            const sd = updated.exercises[index].setsDetail && updated.exercises[index].setsDetail!.length === updated.exercises[index].sets
                              ? [...(updated.exercises[index].setsDetail as NonNullable<typeof updated.exercises[number]['setsDetail']>)]
                              : Array.from({ length: updated.exercises[index].sets }, () => ({ ...base }));
                            sd[setIdx] = { ...sd[setIdx], weight: val };
                            updated.exercises[index] = { ...updated.exercises[index], setsDetail: sd };
                            setActiveWorkout(updated);
                          }} className={`${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-800'} w-20 px-2 py-1 rounded`} />
                          <span className="text-xs">Reps</span>
                          <input type="number" min={0} value={detail.reps} onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            const updated = { ...activeWorkout } as WorkoutSession;
                            const base = { reps: updated.exercises[index].reps, weight: updated.exercises[index].weight, done: false };
                            const sd = updated.exercises[index].setsDetail && updated.exercises[index].setsDetail!.length === updated.exercises[index].sets
                              ? [...(updated.exercises[index].setsDetail as NonNullable<typeof updated.exercises[number]['setsDetail']>)]
                              : Array.from({ length: updated.exercises[index].sets }, () => ({ ...base }));
                            sd[setIdx] = { ...sd[setIdx], reps: val };
                            updated.exercises[index] = { ...updated.exercises[index], setsDetail: sd };
                            setActiveWorkout(updated);
                          }} className={`${isDark ? 'bg-gray-700 text-white' : 'bg-white text-gray-800'} w-16 px-2 py-1 rounded`} />
                          <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" checked={!!detail.done} onChange={() => {
                              const updated = { ...activeWorkout } as WorkoutSession;
                              const base = { reps: updated.exercises[index].reps, weight: updated.exercises[index].weight, done: false };
                              const sd = updated.exercises[index].setsDetail && updated.exercises[index].setsDetail!.length === updated.exercises[index].sets
                                ? [...(updated.exercises[index].setsDetail as NonNullable<typeof updated.exercises[number]['setsDetail']>)]
                                : Array.from({ length: updated.exercises[index].sets }, () => ({ ...base }));
                              sd[setIdx] = { ...sd[setIdx], done: !sd[setIdx]?.done };
                              updated.exercises[index] = { ...updated.exercises[index], setsDetail: sd };
                              setActiveWorkout(updated);
                            }} />
                            <span>Completada</span>
                          </label>
                          <button type="button" aria-label="Eliminar serie" onClick={() => {
                            const updated = { ...activeWorkout } as WorkoutSession;
                            const ex = updated.exercises[index];
                            if (ex.sets <= 1) return;
                            const sd = (ex.setsDetail && ex.setsDetail.length) ? [...ex.setsDetail] : [];
                            sd.splice(setIdx, 1);
                            updated.exercises[index] = { ...ex, sets: ex.sets - 1, setsDetail: sd };
                            setActiveWorkout(updated);
                          }} className={`${isDark ? 'text-gray-300 hover:text-red-300' : 'text-gray-700 hover:text-red-600'} text-sm px-2`}>X</button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3">
                    <button onClick={() => {
                      const updated = { ...activeWorkout } as WorkoutSession;
                      const ex = updated.exercises[index];
                      const base = { reps: ex.reps, weight: ex.weight, done: false };
                      const sd = ex.setsDetail && ex.setsDetail.length === ex.sets ? [...ex.setsDetail] : Array.from({ length: ex.sets }, () => ({ ...base }));
                      sd.push({ ...base });
                      updated.exercises[index] = { ...ex, sets: ex.sets + 1, setsDetail: sd };
                      setActiveWorkout(updated);
                    }} className={`${isDark ? 'bg-purple-700 hover:bg-purple-600 text-white' : 'bg-purple-600 hover:bg-purple-500 text-white'} px-3 py-1 rounded`}>+ Agregar serie</button>
                  </div>
                </div>
              </div>
              ))}
            </div>
          {}
        </div>
      )}

      {/* Modal crear rutina */}
      {showExerciseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>Crear Rutina Personalizada</h3>
              <button onClick={() => setShowExerciseModal(false)} className={`p-2 rounded-lg transition-all ${isDark ? 'hover:bg-gray-700 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}`}><X size={20} /></button>
            </div>
            <div className="space-y-6">
              <input type="text" placeholder="Nombre de la rutina..." value={customWorkoutName} onChange={(e) => setCustomWorkoutName(e.target.value)} className={`w-full px-4 py-3 rounded-lg border-none outline-none ${isDark ? 'bg-gray-700 text-white placeholder-gray-400 shadow-dark-neumorph' : 'bg-gray-50 text-gray-800 placeholder-gray-500 shadow-neumorph'}`} />
              <div>
                <label className={`${isDark ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Energía antes (1-10)</label>
                <input type="range" min={1} max={10} value={preEnergy} onChange={(e) => setPreEnergy(Number(e.target.value))} className="w-full" />
                <div className={`${isDark ? 'text-gray-300' : 'text-gray-700'} text-xs mt-1`}>{preEnergy}/10</div>
              </div>
              {/* Búsqueda */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <Search size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                    <input type="text" placeholder="Buscar por grupo muscular (p. ej., pecho, espalda, hombros)..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearchExercises()} className={`w-full pl-10 pr-4 py-3 rounded-lg border-none outline-none ${isDark ? 'bg-gray-700 text-white placeholder-gray-400 shadow-dark-neumorph' : 'bg-gray-50 text-gray-800 placeholder-gray-500 shadow-neumorph'}`} />
                  </div>
                  <button onClick={() => handleSearchExercises()} disabled={isLoadingExercises} className={`px-6 py-3 rounded-lg font-medium transition-all ${isLoadingExercises ? 'bg-gray-400 cursor-not-allowed' : isDark ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-dark-neumorph' : 'bg-blue-500 hover:bg-blue-600 text-white shadow-neumorph'}`}>
                    {isLoadingExercises ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
                {}
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_GROUPS.map(g => (
                    <button key={g} type="button" onClick={() => { setSearchTerm(g); handleSearchExercises(g); }} className={`px-3 py-1 rounded-full text-xs border ${isDark ? 'border-gray-600 text-gray-200 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-200'}`} title={`Buscar ${g}`}>{g}</button>
                  ))}
                </div>
              </div>
              {/* Lista disponibles + agregar manual */}
              <div>
                {}
                <div className="flex flex-col gap-2 mb-3">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div className="flex flex-col">
                      <label className={`text-xs mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Nombre</label>
                      <input type="text" placeholder="Ej. Sentadillas" value={manualExerciseName} onChange={(e) => setManualExerciseName(e.target.value)} className={`w-full px-4 py-2 rounded-lg border-none outline-none ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-800'}`} />
                    </div>
                    <div className="flex flex-col">
                      <label className={`text-xs mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Series</label>
                      <input type="number" min={1} value={manualSets} onChange={(e) => setManualSets(Math.max(1, Number(e.target.value) || 1))} className={`w-full px-3 py-2 rounded-lg border-none outline-none ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-800'}`} />
                    </div>
                    <div className="flex flex-col">
                      <label className={`text-xs mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Reps</label>
                      <input type="number" min={1} value={manualReps} onChange={(e) => setManualReps(Math.max(1, Number(e.target.value) || 1))} className={`w-full px-3 py-2 rounded-lg border-none outline-none ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-800'}`} />
                    </div>
                    <div className="flex flex-col">
                      <label className={`text-xs mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Descanso (s)</label>
                      <input type="number" min={0} value={manualRest} onChange={(e) => setManualRest(Math.max(0, Number(e.target.value) || 0))} className={`w-full px-3 py-2 rounded-lg border-none outline-none ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-800'}`} />
                    </div>
                    <div className="flex flex-col">
                      <label className={`text-xs mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Peso (kg)</label>
                      <input type="number" min={0} value={manualWeight} onChange={(e) => setManualWeight(Math.max(0, Number(e.target.value) || 0))} className={`w-full px-3 py-2 rounded-lg border-none outline-none ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-800'}`} />
                    </div>
                    <button onClick={() => {
                      if (!manualExerciseName.trim()) return;
                      const nowId = `manual_${Date.now()}`;
                      const manual: AdaptedExercise = {
                        id: nowId,
                        name: manualExerciseName.trim(),
                        category: 'strength', primaryMuscles: [], secondaryMuscles: [],
                        equipment: 'Peso corporal', difficulty: 'beginner', instructions: [], gifUrl: '',
                        caloriesPerMinute: 6, defaultSets: manualSets, defaultReps: manualReps, restTimeSeconds: manualRest,
                        bodyPart: 'waist', target: 'abs',
                        // @ts-expect-error UI-extended
                        defaultWeightKg: manualWeight
                      };
                      setSelectedExercises([...selectedExercises, manual]);
                      setManualExerciseName('');
                      setManualAddNotice('Ejercicio agregado');
                      setTimeout(() => setManualAddNotice(null), 1500);
                    }} className={`${isDark ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-500 hover:bg-green-600 text-white'} px-4 py-2 rounded-lg font-medium`}>Agregar</button>
                  </div>
                  {manualAddNotice && (<span className={`text-xs ${isDark ? 'text-green-300' : 'text-green-700'}`}>{manualAddNotice}</span>)}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                  {isLoadingExercises ? (
                    <div className="col-span-full text-center py-8">
                      <div className={`inline-block animate-spin rounded-full h-8 w-8 border-b-2 ${isDark ? 'border-purple-400' : 'border-purple-600'}`}></div>
                      <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Cargando ejercicios...</p>
                    </div>
                  ) : availableExercises.length > 0 ? (
                    availableExercises.map(exercise => (
                      <button key={exercise.id} onClick={() => {
                        if (selectedExercises.find(ex => ex.id === exercise.id)) {
                          setSelectedExercises(selectedExercises.filter(ex => ex.id !== exercise.id));
                        } else {
                          setSelectedExercises([...selectedExercises, exercise]);
                        }
                      }} className={`p-3 rounded-lg text-left transition-all ${selectedExercises.find(ex => ex.id === exercise.id) ? (isDark ? 'bg-purple-600 text-white' : 'bg-purple-500 text-white') : (isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700')}`}>
                        <div className="flex justify-between items-start mb-1"><span className="font-medium text-sm">{exercise.name}</span><span className="text-xs opacity-75">{exercise.difficulty}</span></div>
                        <div className="text-xs opacity-75 mb-1">{exercise.primaryMuscles.join(', ')}</div>
                        <div className="text-xs opacity-75">{exercise.equipment} • {exercise.defaultSets} sets × {exercise.defaultReps} reps</div>
                      </button>
                    ))
                  ) : (
                    <div className="col-span-full text-center py-8"><p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{apiError ? 'Error al cargar ejercicios. Verifica tu conexión y API.' : 'No se encontraron ejercicios.'}</p></div>
                  )}
                </div>
              </div>

              {/* Bloque de ejercicios seleccionados eliminado: configuración se hará en el editor por serie al iniciar */}

              {/* Acciones del modal */}
              <div className="flex flex-col md:flex-row gap-3 pt-4">
                <div className="flex items-center gap-2">
                  <input id="saveAsTemplate" type="checkbox" className="w-4 h-4" checked={saveAsTemplateChecked} onChange={(e) => setSaveAsTemplateChecked(e.target.checked)} />
                  <label htmlFor="saveAsTemplate" className={`${isDark ? 'text-gray-300' : 'text-gray-700'} text-sm`}>Guardar como plantilla al crear</label>
                </div>
                <button onClick={() => { setShowExerciseModal(false); setCustomWorkoutName(''); setSelectedExercises([]); setSearchTerm(''); setCreateError(null); setSaveAsTemplateChecked(false); }} className={`flex-1 py-3 rounded-lg font-medium transition-all ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 shadow-dark-neumorph' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 shadow-neumorph'}`}>Cancelar</button>
                <button onClick={async () => {
                  if (saveAsTemplateChecked && selectedExercises.length > 0) {
                    if (!user) {
                      setTemplateNotice('Inicia sesión para guardar plantillas');
                      setTimeout(() => setTemplateNotice(null), 2000);
                    } else {
                      try {
                        const name = (customWorkoutName.trim() || 'Plantilla sin título');
                        await workoutTemplateService.createTemplate(user.uid, {
                          name,
                          exercises: selectedExercises.map(se => ({
                            name: se.name, sets: se.defaultSets, reps: se.defaultReps, restTime: se.restTimeSeconds,
                            weightKg: (se as WeightedExercise).defaultWeightKg
                          }))
                        });
                        setTemplateNotice('Plantilla guardada');
                        setTimeout(() => setTemplateNotice(null), 1500);
                        await refreshTemplates();
                      } catch (e) {
                        console.error('No se pudo guardar la plantilla:', e);
                        setTemplateNotice('No se pudo guardar la plantilla');
                        setTimeout(() => setTemplateNotice(null), 2000);
                      }
                    }
                  }
                  await createCustomWorkout();
                  setSaveAsTemplateChecked(false);
                }} disabled={isCreatingWorkout || selectedExercises.length === 0} className={`flex-1 py-3 rounded-lg font-medium text-white transition-all flex items-center justify-center gap-2 ${isCreatingWorkout || selectedExercises.length === 0 ? 'bg-gray-400 cursor-not-allowed' : isDark ? 'bg-purple-600 hover:bg-purple-700 shadow-dark-neumorph' : 'bg-purple-500 hover:bg-purple-600 shadow-neumorph'}`}>
                  <Save size={16} />
                  <span>{isCreatingWorkout ? 'Creando…' : 'Guardar plantilla e iniciar'}</span>
                </button>
              </div>
              {templateNotice && (<p className={`mt-2 text-xs ${isDark ? 'text-green-300' : 'text-green-700'}`}>{templateNotice}</p>)}
              {createError && (<p className={`mt-3 text-sm ${isDark ? 'text-red-300' : 'text-red-600'}`}>{createError}</p>)}
            </div>
          </div>
        </div>
      )}

      {/* Confirmar finalización */}
      {showFinalizeConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-md p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
            <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>Finalizar rutina</h3>
            <p className={`${isDark ? 'text-gray-300' : 'text-gray-700'} text-sm mb-3`}>Indica tu energía después del entrenamiento:</p>
            <input type="range" min={1} max={10} value={postEnergy} onChange={(e) => setPostEnergy(Number(e.target.value))} className="w-full" />
            <div className={`${isDark ? 'text-gray-300' : 'text-gray-700'} text-xs mt-1`}>{postEnergy}/10</div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setShowFinalizeConfirm(false)} className={`${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} flex-1 py-2 rounded-lg`}>Cancelar</button>
              <button onClick={stopWorkout} className={`${isDark ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'} flex-1 py-2 rounded-lg`}>Finalizar</button>
            </div>
          </div>
        </div>
      )}

      {/* Historial */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl ${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>Historial de Entrenamientos</h3>
              <button onClick={() => setShowHistoryModal(false)} className={`p-2 rounded-lg transition-all ${isDark ? 'hover:bg-gray-700 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'}`}><X size={20} /></button>
            </div>
            <div className="mb-6">
              <div className="flex gap-3 items-center">
                <Calendar size={20} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className={`px-4 py-2 rounded-lg border-none outline-none ${isDark ? 'bg-gray-700 text-white shadow-dark-neumorph' : 'bg-gray-50 text-gray-800 shadow-neumorph'}`} />
                <button onClick={() => loadWorkoutsByDate(selectedDate)} disabled={isLoadingHistory} className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${isLoadingHistory ? 'bg-gray-400 cursor-not-allowed' : isDark ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-dark-neumorph' : 'bg-blue-500 hover:bg-blue-600 text-white shadow-neumorph'}`}>
                  <Filter size={16} />{isLoadingHistory ? 'Cargando...' : 'Filtrar'}
                </button>
                <button onClick={() => { setFilteredHistory(workoutHistory); setSelectedDate(new Date().toISOString().split('T')[0]); }} className={`px-4 py-2 rounded-lg font-medium transition-all ${isDark ? 'bg-gray-600 hover:bg-gray-500 text-white shadow-dark-neumorph' : 'bg-gray-200 hover:bg-gray-300 text-gray-700 shadow-neumorph'}`}>Mostrar Todos</button>
              </div>
            </div>
            <div className="space-y-4">
              {isLoadingHistory ? (
                <div className="text-center py-8">
                  <div className={`inline-block animate-spin rounded-full h-8 w-8 border-b-2 ${isDark ? 'border-purple-400' : 'border-purple-600'}`}></div>
                  <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Cargando entrenamientos...</p>
                </div>
              ) : filteredHistory.length > 0 ? (
                filteredHistory.map((workout, wIdx) => (
                  <div key={workout.id || wIdx} className={`p-4 rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{workout.name}</h4>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          {workout.createdAt && new Date(workout.createdAt.toDate()).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                        {workout.duration > 0 && (
                          <div className={`text-xs mt-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}><strong>Duración:</strong> {formatDuration(workout.duration)}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Flame className={`${isDark ? 'text-orange-400' : 'text-orange-600'}`} size={14} />
                          <div>
                            <span className={`${(workout.totalCaloriesBurned ?? 0) === 0 ? 'text-[10px] text-gray-400' : 'text-xs'}`}>{workout.totalCaloriesBurned ?? 0} <span className="text-[10px]">cal</span></span>
                          </div>
                        </div>
                      </div>
                    </div>
                    { !expandedWorkouts[workout.id ?? wIdx] ? (
                      <div className="space-y-1 mb-3">
                        {workout.exercises.map((exercise, index) => (
                          <div key={index} className="flex justify-between items-center">
                            <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{exercise.name}</span>
                            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{exercise.sets} × {exercise.reps}{exercise.weight > 0 && ` (${exercise.weight}kg)`}</span>
                          </div>
                        ))}
                        <div className="mt-2">
                          <span onClick={() => setExpandedWorkouts(prev => ({ ...prev, [workout.id ?? wIdx]: true }))} role="button" className={`text-sm underline cursor-pointer ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>Ver detalle</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 mb-3 max-h-64 overflow-y-auto">
                        {workout.exercises.map((exercise, exIdx) => (
                          <div key={exIdx} className={`p-2 rounded ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
                            <div className="flex justify-between items-center">
                              <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{exercise.name}</div>
                              <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{exercise.sets} sets</div>
                            </div>
                            <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-2`}>
                              <ul className="list-disc list-inside">
                                {(exercise.setsDetail && exercise.setsDetail.length > 0 ? exercise.setsDetail : Array.from({ length: exercise.sets }, () => ({ weight: exercise.weight, reps: exercise.reps }))).map((s, i) => (
                                  <li key={i} className="py-0.5">Serie {i + 1}: {s.weight}kg x {s.reps} rep</li>
                                ))}
                              </ul>
                              {exercise.totalWeightLifted !== undefined && (<div className="mt-2"><strong>Peso total levantado:</strong> {exercise.totalWeightLifted} kg</div>)}
                              {exercise.caloriesBurned !== undefined && (<div className="mt-1"><strong>Calorías quemadas:</strong> {exercise.caloriesBurned} cal</div>)}
                            </div>
                          </div>
                        ))}
                        <div className="mt-2">
                          <span onClick={() => setExpandedWorkouts(prev => ({ ...prev, [workout.id ?? wIdx]: false }))} role="button" className={`text-sm underline cursor-pointer ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>Ocultar detalle</span>
                        </div>
                      </div>
                    )}
                    {/* Estado oculto por solicitud */}
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <Dumbbell size={48} className={`mx-auto mb-4 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
                  <p className={`text-lg font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{selectedDate !== new Date().toISOString().split('T')[0] ? `No hay entrenamientos para ${new Date(selectedDate).toLocaleDateString('es-ES')}` : 'No hay entrenamientos registrados'}</p>
                  <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{selectedDate !== new Date().toISOString().split('T')[0] ? 'Prueba con otra fecha o crea un nuevo entrenamiento' : '¡Comienza tu primer entrenamiento para ver el historial aquí!'}</p>
                </div>
              )}
            </div>
            {/* Resumen periodo */}
            {filteredHistory.length > 0 && !isLoadingHistory && (
              <div className={`mt-6 p-4 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                <h4 className={`text-md font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-800'}`}>Resumen del Período</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center"><div className={`text-2xl font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{filteredHistory.length}</div><div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Entrenamientos</div></div>
                  <div className="text-center"><div className={`text-2xl font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>{formatDuration(filteredHistory.reduce((s, w) => s + w.duration, 0))}</div><div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Tiempo Total</div></div>
                  <div className="text-center"><div className={`text-2xl font-bold ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>{Math.round(filteredHistory.reduce((s, w) => s + (w.totalCaloriesBurned || 0), 0))}</div><div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Calorías</div></div>
                  <div className="text-center"><div className={`text-2xl font-bold ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>{Math.round((filteredHistory.reduce((sum, w) => { const c = w.exercises.filter(e => e.completed).length; const t = w.exercises.length; return sum + (t > 0 ? (c / t) * 100 : 0); }, 0) / Math.max(1, filteredHistory.length)))}%</div><div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Completado</div></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Estado de carga usuario */}
      {!user && (
        <div className="text-center py-12">
          <div className={`inline-block animate-spin rounded-full h-8 w-8 border-b-2 ${isDark ? 'border-purple-400' : 'border-purple-600'}`}></div>
          <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Cargando datos del usuario...</p>
        </div>
      )}
    </div>
  );
}