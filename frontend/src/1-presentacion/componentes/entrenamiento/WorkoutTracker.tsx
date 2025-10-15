import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  StopCircle,
  Check,
  CheckSquare,
  Square,
  Clock,
  TrendingUp,
  Calendar,
  Flame,
  Plus,
  Search,
  X,
  Save,
  Trash2,
  ListPlus,
  Dumbbell,
  Target,
  Zap
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
  workoutService,
  WorkoutSession,
  Exercise,
  workoutTemplateService,
  WorkoutTemplate,
  TemplateExercise
} from '../../../2-logica-negocio/servicios/firestoreService';
import { exerciseAPIService, BODY_PARTS_SPANISH } from '../../../2-logica-negocio/servicios/exerciseAPI';

interface WorkoutTrackerProps {
  isDark: boolean;
}

// Utilidad para formatear duración
function formatDuration(seconds: number | undefined): string {
  const s = Math.max(0, seconds || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// Traducciones ES -> EN para chips de grupos musculares
const BODY_PARTS_ES_EN: Record<string, string> = Object.entries(BODY_PARTS_SPANISH)
  .reduce((acc, [en, es]) => { acc[es.toLowerCase()] = en; return acc; }, {} as Record<string, string>);
const DEFAULT_BODY_PART_CHIPS_ES = [
  'Pecho', 'Espalda', 'Hombros', 'Brazos superiores', 'Cintura', 'Piernas superiores', 'Piernas inferiores', 'Cardio'
];

// Tipos internos de UI
type ToastType = 'success' | 'error' | 'info';
interface ToastItem { id: string; type: ToastType; message: string }

interface RestTimerState { running: boolean; remaining: number; initial: number }

// Adapted exercise shape for selection list in create modal
interface AdaptedExercise {
  id?: string;
  name: string;
  equipment?: string;
  difficulty?: string;
  defaultSets?: number;
  defaultReps?: number;
  restTimeSeconds?: number;
}

// Deducción de color por score
const scoreColor = (score?: number) => {
  if (score == null) return 'text-gray-500';
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
};

// Mensaje motivacional por score
const scoreMessage = (score: number) => {
  if (score >= 90) return '¡Brutal! Rendimiento de élite.';
  if (score >= 80) return '¡Excelente trabajo! Sigue así.';
  if (score >= 70) return 'Muy bien, progreso sólido.';
  if (score >= 60) return 'Bien hecho, puedes ir por más.';
  return 'Cada paso cuenta. ¡No te rindas!';
};

// Componente principal
export default function WorkoutTracker({ isDark }: WorkoutTrackerProps) {
  const { user } = useAuth();

  // Estados base de datos
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutSession | null>(null);
  const [history, setHistory] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [weeklyStats, setWeeklyStats] = useState<{ totalDuration: number; totalWorkouts: number; avgEnergyLevel: number; totalCalories: number } | null>(null);

  // Timers
  const [workoutStartEpoch, setWorkoutStartEpoch] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [workoutPaused, setWorkoutPaused] = useState(false);
  const restTimers = useRef<Record<string, RestTimerState>>({});
  const intervalRef = useRef<number | null>(null);
  const [, setRestTick] = useState(0);

  // UI/Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState<null | string>(null); // workoutId para modal de historial
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showCelebrateModal, setShowCelebrateModal] = useState<null | { score: number }>(null);
  const [selectedEnergy, setSelectedEnergy] = useState<number | null>(null);

  // Búsqueda/API ejercicios
  const [searchTerm, setSearchTerm] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [popularExercises, setPopularExercises] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Carrito y entrada manual
  // Reemplazado por lista de ejercicios seleccionados (sin edición en el modal)
  const [selectedExercises, setSelectedExercises] = useState<AdaptedExercise[]>([]);
  // Simplificado: solo nombre + aviso
  const [manualExerciseName, setManualExerciseName] = useState('');
  const [manualAddNotice, setManualAddNotice] = useState<string | null>(null);
  const [saveAsTemplate, setSaveAsTemplate] = useState(true);
  const [routineName, setRoutineName] = useState('Nueva rutina');

  // Filtros e historial
  const [dateFilter, setDateFilter] = useState<string>('');
  // const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set()); // expansión inline (reemplazado por modal)

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pushToast = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts(t => [...t, { id, type, message }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  // Carga inicial de datos
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!user?.uid) return;
      try {
        setLoading(true);
        const [ws, ts, stats] = await Promise.all([
          workoutService.getUserWorkouts(user.uid),
          workoutTemplateService.getUserTemplates(user.uid),
          workoutService.getWeeklyStats(user.uid)
        ]);
        if (!mounted) return;
        setTemplates(ts);
        setHistory(ws);
        setWeeklyStats(stats);
        // No establecer activeWorkout automáticamente
      } catch (e) {
        console.error('Error loading workouts/templates/stats', e);
        pushToast('error', 'No se pudieron cargar datos de entrenamiento.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [user?.uid]);

  // Ticker de cronómetro principal
  useEffect(() => {
    if (!activeWorkout || workoutPaused || !workoutStartEpoch) {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }
    intervalRef.current = window.setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      setElapsedSeconds(now - workoutStartEpoch);
    }, 1000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [activeWorkout, workoutPaused, workoutStartEpoch]);

  // Auto-guardado: persiste progreso del workout activo (throttled)
  const lastSaveRef = useRef<number>(0);
  useEffect(() => {
    const save = async () => {
      if (!activeWorkout?.id) return;
      try {
        await workoutService.updateWorkout(activeWorkout.id, {
          duration: elapsedSeconds,
          exercises: activeWorkout.exercises
        });
      } catch (e) {
        console.error('Auto-save error', e);
      }
    };
    const now = Date.now();
    if (now - lastSaveRef.current > 1500) {
      save();
      lastSaveRef.current = now;
    }
  }, [elapsedSeconds, activeWorkout?.exercises]);

  // Helpers derivados
  const sortedHistory = useMemo(() => {
    const list = history.filter(w => !w.isActive);
    if (dateFilter) {
      const start = new Date(dateFilter + 'T00:00:00.000Z');
      const end = new Date(dateFilter + 'T23:59:59.999Z');
      return list.filter(w => {
        const d = w.createdAt?.toDate?.() as Date | undefined;
        return d && d >= start && d <= end;
      }).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    }
    return [...list].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  }, [history, dateFilter]);

  const lastWeightByExercise = useMemo(() => {
    const map = new Map<string, number>();
    history.filter(w => !w.isActive).forEach(w => {
      w.exercises.forEach(ex => {
        // Tomar último peso visto
        if (typeof ex.weight === 'number') map.set(ex.name, ex.weight);
        if (ex.setsDetail && ex.setsDetail.length > 0) {
          const lw = ex.setsDetail[ex.setsDetail.length - 1]?.weight;
          if (typeof lw === 'number') map.set(ex.name, lw);
        }
      });
    });
    return map;
  }, [history]);

  // Mapa del ejercicio más reciente por nombre (para obtener "Anterior" sin filtrar/ordenar por fila)
  const prevExerciseByName = useMemo(() => {
    const map = new Map<string, Exercise>();
    // Iterar historial de más reciente a más antiguo, y setear solo la primera coincidencia por nombre
    const completed = history.filter(w => !w.isActive);
    const sorted = [...completed].sort((a, b) => (b.completedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0) - (a.completedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0));
    for (const w of sorted) {
      for (const ex of w.exercises) {
        if (!map.has(ex.name)) map.set(ex.name, ex);
      }
    }
    return map;
  }, [history]);

  // Ejercicio: sets add/remove y toggle done
  const toggleSetDone = useCallback((exerciseId: string, setIndex: number) => {
    setActiveWorkout(w => {
      if (!w) return w;
      const exIndex = w.exercises.findIndex(e => e.id === exerciseId);
      if (exIndex < 0) return w;
      const ex = w.exercises[exIndex];
  const setsDetail = (ex.setsDetail?.slice() || Array.from({ length: ex.sets }, () => ({ reps: ex.reps, weight: ex.weight }))) as NonNullable<Exercise['setsDetail']>;
  const prevDone = Boolean((setsDetail[setIndex] as any)?.done);
  setsDetail[setIndex] = { ...setsDetail[setIndex], done: !prevDone } as any;
  const completed = setsDetail.every(s => Boolean((s as any).done));
      const nextExercises = w.exercises.slice();
      nextExercises[exIndex] = { ...ex, setsDetail, completed };
      return { ...w, exercises: nextExercises };
    });
  }, []);

  const updateSetValue = useCallback((exerciseId: string, setIndex: number, field: 'reps' | 'weight', value: number) => {
    setActiveWorkout(w => {
      if (!w) return w;
      const exIndex = w.exercises.findIndex(e => e.id === exerciseId);
      if (exIndex < 0) return w;
      const ex = w.exercises[exIndex];
      const setsDetail = ex.setsDetail?.slice() || Array.from({ length: ex.sets }, () => ({ reps: ex.reps, weight: ex.weight }));
      setsDetail[setIndex] = { ...setsDetail[setIndex], [field]: value } as any;
      const nextExercises = w.exercises.slice();
      nextExercises[exIndex] = { ...ex, setsDetail } as Exercise;
      return { ...w, exercises: nextExercises };
    });
  }, []);

  const addSet = useCallback((exerciseId: string) => {
    setActiveWorkout(w => {
      if (!w) return w;
      const exIndex = w.exercises.findIndex(e => e.id === exerciseId);
      if (exIndex < 0) return w;
      const ex = w.exercises[exIndex];
      // Asegurar base de setsDetail con tipo y numeración por defecto
      const baseList = (ex.setsDetail?.slice() || Array.from({ length: ex.sets }, (_, i) => ({ reps: ex.reps, weight: ex.weight, done: false, type: 'N', serieNumber: i + 1 }))) as any[];
      const setsDetail = [...baseList];
      // Lógica inteligente: si última serie es normal (N), incrementar su serieNumber, sino continuar con el siguiente número
      const last = setsDetail[setsDetail.length - 1];
      const existingNormals = setsDetail.filter(s => s?.type === 'N');
      const maxSerie = existingNormals.length > 0 ? Math.max(...existingNormals.map(s => Number(s.serieNumber || 0))) : 0;
      const nextSerieNumber = last?.type === 'N' ? (Number(last.serieNumber || maxSerie) + 1) : (maxSerie + 1);
  setsDetail.push({ reps: ex.reps, weight: ex.weight, done: false, type: 'N', serieNumber: nextSerieNumber } as any);
  const nextExercises = w.exercises.slice();
  // Actualizar conteo de sets al total actual y marcar como no completado (se agregó una serie pendiente)
  nextExercises[exIndex] = { ...ex, sets: setsDetail.length, setsDetail, completed: false } as Exercise;
      return { ...w, exercises: nextExercises };
    });
  }, []);

  const removeSet = useCallback((exerciseId: string, setIndex: number) => {
    setActiveWorkout(w => {
      if (!w) return w;
      const exIndex = w.exercises.findIndex(e => e.id === exerciseId);
      if (exIndex < 0) return w;
      const ex = w.exercises[exIndex];
      const setsDetail = (ex.setsDetail?.slice() || Array.from({ length: ex.sets }, () => ({ reps: ex.reps, weight: ex.weight })));
      // Enforce mínimo 1 serie
      if (setsDetail.length <= 1) return w;
      // Remove target set
      setsDetail.splice(setIndex, 1);
      const newSets = Math.max(1, setsDetail.length);
      const completed = setsDetail.length > 0 && setsDetail.every(s => Boolean((s as any)?.done));
      const nextExercises = w.exercises.slice();
      nextExercises[exIndex] = { ...ex, sets: newSets, setsDetail, completed } as Exercise;
      return { ...w, exercises: nextExercises };
    });
  }, []);

  // Timers de descanso por ejercicio
  const startRestTimer = useCallback((exerciseId: string, seconds: number) => {
    const state = restTimers.current[exerciseId] || { running: false, remaining: seconds, initial: seconds };
    state.remaining = seconds;
    state.initial = seconds;
    state.running = true;
    restTimers.current[exerciseId] = state;
  }, []);
  const pauseRestTimer = useCallback((exerciseId: string) => {
    const state = restTimers.current[exerciseId];
    if (state) state.running = false;
  }, []);
  const resetRestTimer = useCallback((exerciseId: string) => {
    const state = restTimers.current[exerciseId];
    if (state) { state.running = false; state.remaining = state.initial; }
  }, []);
  // Tick de descanso
  useEffect(() => {
    const id = window.setInterval(() => {
      const timers = restTimers.current;
      const keys = Object.keys(timers);
      if (keys.length === 0) return;
      let changed = false;
      keys.forEach(k => {
        const st = timers[k];
        if (st.running && st.remaining > 0) {
          st.remaining -= 1; changed = true;
          if (st.remaining <= 0) st.running = false;
        }
      });
      if (changed) { restTimers.current = { ...timers }; setRestTick(x => x + 1); }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Iniciar desde plantilla
  const startFromTemplate = useCallback(async (tpl: WorkoutTemplate) => {
    if (!user?.uid) return;
    try {
      const exercises: Exercise[] = (tpl.exercises || []).map((e, idx) => ({
        id: `${e.id || 'ex'}_${idx}_${Date.now()}`,
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        weight: typeof e.weightKg === 'number' ? e.weightKg : 0,
        completed: false,
        restTime: e.restTime || 60,
        setsDetail: Array.from({ length: e.sets }, (_, i) => ({ reps: e.reps, weight: typeof e.weightKg === 'number' ? e.weightKg : 0, done: false, type: 'N', serieNumber: i + 1 }))
      }));
      const newWorkout: Omit<WorkoutSession, 'id' | 'userId' | 'createdAt'> = {
        name: tpl.name,
        duration: 0,
        isActive: true,
        exercises
      };
      const id = await workoutService.createWorkout(user.uid, newWorkout);
      setActiveWorkout({ ...newWorkout, id, userId: user.uid, createdAt: ({} as any) });
      const start = Math.floor(Date.now() / 1000);
      setWorkoutStartEpoch(start);
      setElapsedSeconds(0);
      pushToast('success', 'Entrenamiento iniciado desde plantilla');
    } catch (e) {
      console.error('Error starting workout', e);
      pushToast('error', 'No se pudo iniciar el entrenamiento');
    }
  }, [user?.uid]);

  // Pausar/Reanudar entrenamiento
  const togglePauseWorkout = useCallback(() => {
    setWorkoutPaused(p => !p);
  }, []);

  const resetWorkoutTimer = useCallback(() => {
    if (!activeWorkout) return;
    const start = Math.floor(Date.now() / 1000);
    setWorkoutStartEpoch(start);
    setElapsedSeconds(0);
  }, [activeWorkout]);

  // Finalización flujo
  const finishWorkout = useCallback(() => {
    if (!activeWorkout) return;
    setShowFinishModal(true);
  }, [activeWorkout]);

  const confirmFinish = useCallback(async () => {
    if (!user?.uid || !activeWorkout?.id || selectedEnergy == null) return;
    try {
      await workoutService.updateWorkout(activeWorkout.id, { postEnergyLevel: selectedEnergy, duration: elapsedSeconds });
      await workoutService.finalizeWorkout(activeWorkout.id, user.uid, selectedEnergy);
      setActiveWorkout(null);
      setShowFinishModal(false);
      setSelectedEnergy(null);
      const [ws, stats] = await Promise.all([
        workoutService.getUserWorkouts(user.uid),
        workoutService.getWeeklyStats(user.uid)
      ]);
      setHistory(ws);
      setWeeklyStats(stats);
      const finished = ws.find(w => w.id === activeWorkout.id);
      if (finished?.performanceScore != null) {
        setShowCelebrateModal({ score: finished.performanceScore });
      }
      pushToast('success', '¡Entrenamiento finalizado!');
    } catch (e) {
      console.error('Error finalizing workout', e);
      pushToast('error', 'No se pudo finalizar el entrenamiento');
    }
  }, [user?.uid, activeWorkout?.id, selectedEnergy, elapsedSeconds]);

  // Búsqueda y API
  const loadPopular = useCallback(async () => {
    try {
      setSearchLoading(true);
      setApiError(null);
      const list = await exerciseAPIService.getAllExercises(20, 0);
      setPopularExercises(list);
    } catch (e: any) {
      setApiError(e?.message || 'Error al cargar ejercicios populares');
    } finally { setSearchLoading(false); }
  }, []);

  const searchByBodyPartES = useCallback(async (es: string) => {
    const en = BODY_PARTS_ES_EN[es.toLowerCase()] || es.toLowerCase();
    try {
      setSearchLoading(true);
      setApiError(null);
      const list = await exerciseAPIService.getExercisesByBodyPart(en);
      setSearchResults(list);
    } catch (e: any) {
      setApiError(e?.message || 'Error al buscar por grupo muscular');
    } finally { setSearchLoading(false); }
  }, []);

  const runSearch = useCallback(async () => {
    try {
      setSearchLoading(true);
      setApiError(null);
      if (searchTerm.trim().length === 0) {
        const list = await exerciseAPIService.getAllExercises(20, 0);
        setSearchResults(list);
      } else {
        const list = await exerciseAPIService.searchExercises(searchTerm.trim());
        setSearchResults(list);
      }
    } catch (e: any) {
      const msg = e?.message || 'Error de API';
      setApiError(msg || 'Error al buscar ejercicios');
    } finally { setSearchLoading(false); }
  }, [searchTerm]);

  // Carrito
  // API items se agregan/quitan directamente desde la lista (toggle), no se usa ya un botón dedicado de "Agregar".


  const removeSelectedByIndex = useCallback((idx: number) => {
    setSelectedExercises(list => list.filter((_, i) => i !== idx));
  }, []);

  const estimatedSelectedCalories = useMemo(() => {
    // Estimación simple: 5 kcal por set, usando defaults si existen
    return selectedExercises.reduce((sum, ex) => sum + ((ex.defaultSets ?? 3) * 5), 0);
  }, [selectedExercises]);

  const saveCartAll = useCallback(async () => {
    if (!user?.uid) return;
    if (selectedExercises.length === 0) { pushToast('info', 'Agrega ejercicios a la lista'); return; }
    try {
      // Mapear a TemplateExercise[] con defaults
      const tplExercises: TemplateExercise[] = selectedExercises.map(ex => ({
        name: ex.name,
        sets: ex.defaultSets ?? 3,
        reps: ex.defaultReps ?? 10,
        restTime: ex.restTimeSeconds ?? 60,
        weightKg: 0,
      }));
      if (saveAsTemplate) {
        await workoutTemplateService.createTemplate(user.uid, { name: routineName || 'Mi rutina', exercises: tplExercises });
        pushToast('success', 'Plantilla guardada');
        const ts = await workoutTemplateService.getUserTemplates(user.uid);
        setTemplates(ts);
      }
      // También opción de iniciar inmediatamente el workout con el carrito
      const exercises: Exercise[] = tplExercises.map((e, idx) => ({
        id: `ex_${idx}_${Date.now()}`,
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        weight: e.weightKg || 0,
        completed: false,
        restTime: e.restTime || 60,
        setsDetail: Array.from({ length: e.sets }, (_, i) => ({ reps: e.reps, weight: e.weightKg || 0, done: false, type: 'N', serieNumber: i + 1 }))
      }));
      const newWorkout: Omit<WorkoutSession, 'id' | 'userId' | 'createdAt'> = { name: routineName || 'Mi rutina', duration: 0, isActive: true, exercises };
      const id = await workoutService.createWorkout(user.uid, newWorkout);
      setActiveWorkout({ ...newWorkout, id, userId: user.uid, createdAt: ({} as any) });
      setWorkoutStartEpoch(Math.floor(Date.now() / 1000));
      setElapsedSeconds(0);
      setShowCreateModal(false);
      setSelectedExercises([]);
      pushToast('success', 'Entrenamiento iniciado');
    } catch (e) {
      console.error('Save cart error', e);
      pushToast('error', 'No se pudo guardar/iniciar la rutina');
    }
  }, [user?.uid, selectedExercises, saveAsTemplate, routineName]);

  // UI subcomponentes (internos) para mantener el archivo manejable
  const RestTimerBadge: React.FC<{ exerciseId: string; defaultSeconds?: number }>
    = ({ exerciseId, defaultSeconds = 60 }) => {
      const st = restTimers.current[exerciseId] || { running: false, remaining: defaultSeconds, initial: defaultSeconds };
      const mm = Math.floor(st.remaining / 60).toString().padStart(2, '0');
      const ss = Math.floor(st.remaining % 60).toString().padStart(2, '0');
      return (
        <div className={`${isDark ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-900'} rounded-lg px-2 py-1 text-xs flex items-center gap-1`}>
          <Clock size={14} /> {mm}:{ss}
          {st.running ? (
            <button className="ml-2 hover:opacity-80" onClick={() => pauseRestTimer(exerciseId)} title="Pausar">
              <Pause size={14} />
            </button>
          ) : (
            <button className="ml-2 hover:opacity-80" onClick={() => startRestTimer(exerciseId, st.remaining || defaultSeconds)} title="Iniciar">
              <Play size={14} />
            </button>
          )}
          <button className="ml-1 hover:opacity-80" onClick={() => resetRestTimer(exerciseId)} title="Reiniciar">
            <RotateCcw size={14} />
          </button>
          <button
            className="ml-1 underline-offset-2 hover:underline"
            title="Editar mm:ss"
            onClick={() => {
              const input = window.prompt('Nuevo tiempo de descanso (mm:ss o segundos):', `${mm}:${ss}`);
              if (!input) return;
              let total = 0;
              if (/^\d{1,2}:\d{2}$/.test(input)) {
                const [m, s] = input.split(':').map(Number);
                total = (m * 60) + s;
              } else if (/^\d+$/.test(input)) {
                total = Number(input);
              } else {
                pushToast('error', 'Formato inválido. Usa mm:ss o segundos.');
                return;
              }
              const state = restTimers.current[exerciseId] || { running: false, remaining: total, initial: total };
              state.initial = total; state.remaining = total; state.running = false;
              restTimers.current[exerciseId] = { ...state };
              setRestTick(x => x + 1);
            }}
          >Editar</button>
        </div>
      );
    };

  const ExerciseRow: React.FC<{ ex: Exercise; index?: number }> = ({ ex }) => {
    const lastWeight = lastWeightByExercise.get(ex.name);
    const sd = ex.setsDetail && ex.setsDetail.length > 0 ? ex.setsDetail : Array.from({ length: ex.sets }, () => ({ reps: ex.reps, weight: ex.weight, done: false }));
    const completedCls = ex.completed
      ? (isDark ? 'bg-green-900/20 border border-green-500/30' : 'bg-green-50 border border-green-200')
      : (isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200');
    return (
      <div className={`relative overflow-hidden rounded-lg p-4 transition-all ${completedCls} ${isDark ? 'shadow-dark-neumorph' : 'shadow-neumorph'}`}>
        {ex.completed && (
          <div className="absolute top-4 right-4">
            <div className="p-2 rounded-full bg-green-500 text-white animate-bounce">
              <Check size={20} />
            </div>
          </div>
        )}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1">
            <h4 className={`text-base font-bold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{ex.name}</h4>
            <div className="flex items-center gap-3 text-xs">
              <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'} flex items-center gap-1`}>
                <Target size={16} /> {sd.length} series
              </span>
              <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'} flex items-center gap-1`}>
                <Clock size={16} /> {ex.restTime || 60}s descanso
              </span>
              {typeof lastWeight === 'number' && (
                <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>último: {lastWeight}kg</span>
              )}
            </div>
          </div>
          <RestTimerBadge exerciseId={ex.id} defaultSeconds={ex.restTime || 60} />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className={`w-full text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            <thead>
              <tr className={`${isDark ? 'bg-gray-900 text-gray-400' : 'bg-gray-100 text-gray-600'} text-xs uppercase`}>
                <th className="px-3 py-2 text-left font-semibold">Serie</th>
                <th className="px-3 py-2 text-center font-semibold">Anterior</th>
                <th className="px-3 py-2 text-center font-semibold">Kg</th>
                <th className="px-3 py-2 text-center font-semibold">Reps</th>
                <th className="px-3 py-2 text-center font-semibold">✓</th>
                <th className="px-3 py-2 text-center font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ex.setsDetail?.length ?? ex.sets }).map((_, setIdx) => {
                const detail: any = ex.setsDetail?.[setIdx] ?? { reps: ex.reps, weight: ex.weight, done: false, type: 'N', serieNumber: (setIdx + 1) };
                // Obtener el ejercicio previo de forma memoizada
                const prevExercise = prevExerciseByName.get(ex.name);
                const prevWeight = (prevExercise?.setsDetail?.[setIdx]?.weight ?? prevExercise?.weight ?? null) as number | null;
                return (
                  <tr key={setIdx} className={`border-b transition-colors ${
                    detail.done
                      ? isDark ? 'bg-green-900/20 border-green-800' : 'bg-green-50 border-green-200'
                      : isDark ? 'border-gray-800 hover:bg-gray-800/50' : 'border-gray-200 hover:bg-gray-50'
                  }`}>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => {
                          const types: Array<'N' | 'W' | 'F' | 'D'> = ['N', 'W', 'F', 'D'];
                          const currentType: 'N' | 'W' | 'F' | 'D' = (detail.type as any) || 'N';
                          const currentIndex = types.indexOf(currentType);
                          const nextType = types[(currentIndex + 1) % types.length];
                          setActiveWorkout(w => {
                            if (!w) return w;
                            const exIndex = w.exercises.findIndex(e => e.id === ex.id);
                            if (exIndex < 0) return w;
                            const exItem = w.exercises[exIndex];
                            const base = { reps: exItem.reps, weight: exItem.weight, done: false, type: 'N', serieNumber: (setIdx + 1) } as any;
                            const sdLocal = (exItem.setsDetail && exItem.setsDetail.length === exItem.sets)
                              ? [...(exItem.setsDetail as any[])]
                              : Array.from({ length: exItem.sets }, () => ({ ...base }));
                            // Conservar serieNumber al cambiar de tipo
                            const prevSerieNumber = sdLocal[setIdx]?.serieNumber ?? (setIdx + 1);
                            sdLocal[setIdx] = { ...sdLocal[setIdx], type: nextType, serieNumber: prevSerieNumber };
                            const nextExercises = w.exercises.slice();
                            nextExercises[exIndex] = { ...exItem, setsDetail: sdLocal } as Exercise;
                            return { ...w, exercises: nextExercises };
                          });
                        }}
                        className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
                          detail.type === 'W' ? 'bg-purple-400 text-white hover:bg-purple-500' :
                          detail.type === 'F' ? 'bg-gray-300 text-gray-700 hover:bg-gray-400' :
                          detail.type === 'D' ? 'bg-orange-500 text-white hover:bg-orange-600' :
                          'bg-gray-600 text-white hover:bg-gray-700'
                        }`}
                        title={
                          detail.type === 'W' ? 'Calentamiento (click para cambiar)' :
                          detail.type === 'F' ? 'Serie fallada (click para cambiar)' :
                          detail.type === 'D' ? 'Drop set (click para cambiar)' :
                          'Serie normal (click para cambiar)'
                        }
                      >
                        {detail.type === 'N' ? (detail.serieNumber ?? (setIdx + 1)) : detail.type}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{prevWeight != null ? `${prevWeight}kg` : '-'}</span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        id={`set-weight-${ex.id}-${setIdx}`}
                        name={`set-weight-${ex.id}-${setIdx}`}
                        type="number"
                        step={0.5}
                        min={0}
                        value={detail.weight}
                        onChange={(e) => updateSetValue(ex.id, setIdx, 'weight', Math.max(0, Number(e.target.value)))}
                        className={`w-20 px-2 py-1 rounded text-center text-sm font-semibold ${isDark ? 'bg-gray-900 text-white border border-gray-700' : 'bg-white text-gray-900 border border-gray-300'} focus:ring-2 ring-purple-500/30 focus:border-purple-500`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        id={`set-reps-${ex.id}-${setIdx}`}
                        name={`set-reps-${ex.id}-${setIdx}`}
                        type="number"
                        min={0}
                        value={detail.reps}
                        onChange={(e) => updateSetValue(ex.id, setIdx, 'reps', Math.max(0, Number(e.target.value)))}
                        className={`w-16 px-2 py-1 rounded text-center text-sm font-semibold ${isDark ? 'bg-gray-900 text-white border border-gray-700' : 'bg-white text-gray-900 border border-gray-300'} focus:ring-2 ring-purple-500/30 focus:border-purple-500`}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => toggleSetDone(ex.id, setIdx)} className="transition-transform hover:scale-110">
                        {detail.done ? (
                          <CheckSquare className="text-green-500" size={18} />
                        ) : (
                          <Square className={`${isDark ? 'text-gray-600' : 'text-gray-400'}`} size={18} />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        aria-label="Eliminar serie"
                        onClick={() => removeSet(ex.id, setIdx)}
                        disabled={(ex.setsDetail?.length ?? ex.sets) <= 1}
                        className={`px-2 py-1 rounded text-xs ${
                          (ex.setsDetail?.length ?? ex.sets) <= 1
                            ? 'opacity-50 cursor-not-allowed '
                            : ''
                        }${isDark ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/20' : 'text-gray-500 hover:text-red-600 hover:bg-red-50'}`}
                        title={(ex.setsDetail?.length ?? ex.sets) <= 1 ? 'Debe quedar al menos 1 serie' : 'Eliminar serie'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2">
            <button
              onClick={() => addSet(ex.id)}
              className={`w-full px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${isDark ? 'bg-gray-800 hover:bg-gray-700 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'}`}
            >
              <Plus size={16} /> Agregar serie
            </button>
          </div>
          <div className={`mt-3 text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} flex flex-wrap gap-3`}>
            <span className="flex items-center gap-1"><span className="px-2 py-0.5 rounded bg-gray-600 text-white font-bold">N</span> Normal</span>
            <span className="flex items-center gap-1"><span className="px-2 py-0.5 rounded bg-purple-400 text-white font-bold">W</span> Calentamiento</span>
            <span className="flex items-center gap-1"><span className="px-2 py-0.5 rounded bg-gray-300 text-gray-700 font-bold">F</span> Fallada</span>
            <span className="flex items-center gap-1"><span className="px-2 py-0.5 rounded bg-orange-500 text-white font-bold">D</span> Drop set</span>
          </div>
        </div>
      </div>
    );
  };

  // Vista de entrenamiento activo
  const ActiveWorkoutView = useMemo(() => {
    const isRunning = !!activeWorkout && !workoutPaused;
    return (
      <div className="space-y-5">
        <div className={`relative overflow-hidden rounded-xl p-5 mb-1 ${isDark ? 'bg-gray-800 border border-gray-700 shadow-dark-neumorph' : 'bg-white border border-gray-200 shadow-neumorph'}`}>
          <div className="relative z-10">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className={`p-2 rounded-lg ${isDark ? 'bg-purple-600' : 'bg-purple-500'} text-white`}>
                    <Dumbbell size={20} />
                  </div>
                  <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{activeWorkout?.name || 'Entrenamiento activo'}</h2>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}>
                    <Clock className={`${isDark ? 'text-purple-400' : 'text-purple-600'}`} size={18} />
                    <span className="text-xl font-bold font-mono">{formatDuration(elapsedSeconds)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                    <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'} text-xs font-medium`}>{isRunning ? 'En progreso' : 'Pausado'}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (!user?.uid || !activeWorkout) return;
                    try {
                      const toTpl = activeWorkout.exercises.map<TemplateExercise>((ex) => ({
                        name: ex.name,
                        sets: ex.setsDetail?.length || ex.sets,
                        reps: ex.setsDetail && ex.setsDetail[0] ? ex.setsDetail[0].reps : ex.reps,
                        restTime: ex.restTime || 60,
                        weightKg: ex.setsDetail && ex.setsDetail[0] ? ex.setsDetail[0].weight : ex.weight
                      }));
                      await workoutTemplateService.createTemplate(user.uid, { name: `${activeWorkout.name} (plantilla)`, exercises: toTpl });
                      const ts = await workoutTemplateService.getUserTemplates(user.uid);
                      setTemplates(ts);
                      pushToast('success', 'Plantilla guardada desde entrenamiento activo');
                    } catch (e) {
                      console.error('save template from active workout', e);
                      pushToast('error', 'No se pudo guardar la plantilla');
                    }
                  }}
                  className={`px-3 py-3 rounded-lg text-sm font-semibold bg-purple-400 hover:bg-purple-500 text-white`}
                >
                  Guardar como plantilla
                </button>
                <button
                  onClick={togglePauseWorkout}
                  className={`px-3 py-3 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                    isRunning
                      ? 'bg-purple-400 hover:bg-purple-500 text-white'
                      : (isDark ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-green-500 hover:bg-green-600 text-white')
                  }`}
                >
                  {isRunning ? (<><Pause size={18} /> Pausar</>) : (<><Play size={18} /> Reanudar</>)}
                </button>
                <button
                  onClick={resetWorkoutTimer}
                  className={`px-3 py-3 rounded-lg text-sm font-semibold flex items-center gap-2 ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-900'}`}
                >
                  <RotateCcw size={18} /> Reiniciar
                </button>
                <button
                  onClick={finishWorkout}
                  className={`bg-gray-300 hover:bg-gray-400 text-gray-700 px-3 py-3 rounded-lg text-sm font-semibold flex items-center gap-2`}
                >
                  <StopCircle size={18} /> Finalizar
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          {(activeWorkout?.exercises || []).map(ex => (
            <ExerciseRow key={ex.id} ex={ex} />
          ))}
        </div>
      </div>
    );
  }, [activeWorkout, elapsedSeconds, workoutPaused, isDark, lastWeightByExercise, user?.uid, finishWorkout, togglePauseWorkout, resetWorkoutTimer]);

  // Vista Dashboard (stats, plantillas, historial)
  const DashboardView = useMemo(() => (
    <div className="space-y-8">
      {/* Cards de estadísticas compactas */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Tiempo semanal */}
        <div className={`${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'} rounded-xl p-4 border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className={`${isDark ? 'bg-purple-600/20' : 'bg-purple-100'} p-2 rounded-lg`}>
              <Clock className={`${isDark ? 'text-purple-300' : 'text-purple-600'}`} size={20} />
            </div>
            <TrendingUp className={`${isDark ? 'text-green-400' : 'text-green-600'} opacity-60`} size={18} />
          </div>
          <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'} text-xs font-medium mb-1`}>Tiempo semanal</p>
          <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{formatDuration(weeklyStats?.totalDuration || 0)}</p>
        </div>
        {/* Entrenamientos */}
        <div className={`${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'} rounded-xl p-4 border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className={`${isDark ? 'bg-purple-600/20' : 'bg-purple-100'} p-2 rounded-lg`}>
              <Dumbbell className={`${isDark ? 'text-purple-300' : 'text-purple-600'}`} size={20} />
            </div>
            <TrendingUp className={`${isDark ? 'text-green-400' : 'text-green-600'} opacity-60`} size={18} />
          </div>
          <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'} text-xs font-medium mb-1`}>Entrenamientos</p>
          <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{weeklyStats?.totalWorkouts || 0}</p>
        </div>
        {/* Calorías */}
        <div className={`${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'} rounded-xl p-4 border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className={`${isDark ? 'bg-purple-600/20' : 'bg-purple-100'} p-2 rounded-lg`}>
              <Flame className={`${isDark ? 'text-purple-300' : 'text-purple-600'}`} size={20} />
            </div>
            <TrendingUp className={`${isDark ? 'text-green-400' : 'text-green-600'} opacity-60`} size={18} />
          </div>
          <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'} text-xs font-medium mb-1`}>Calorías (semana)</p>
          <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{Math.round(weeklyStats?.totalCalories || 0)} kcal</p>
        </div>
        {/* Energía promedio */}
        <div className={`${isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'} rounded-xl p-4 border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className={`${isDark ? 'bg-purple-600/20' : 'bg-purple-100'} p-2 rounded-lg`}>
              <Zap className={`${isDark ? 'text-purple-300' : 'text-purple-600'}`} size={20} />
            </div>
            <TrendingUp className={`${isDark ? 'text-green-400' : 'text-green-600'} opacity-60`} size={18} />
          </div>
          <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'} text-xs font-medium mb-1`}>Energía prom.</p>
          <p className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{weeklyStats ? weeklyStats.avgEnergyLevel.toFixed(1) : '0.0'}</p>
        </div>
      </section>

      {/* Plantillas */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Rutinas</h3>
          <button onClick={() => { setShowCreateModal(true); loadPopular(); }} className={`${isDark ? 'bg-gray-900 hover:bg-gray-800 text-white' : 'bg-white hover:bg-gray-100 text-gray-900'} border ${isDark ? 'border-gray-700' : 'border-gray-300'} px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2`}>
            <ListPlus size={16} /> Crear rutina
          </button>
        </div>
        {templates.length === 0 ? (
          <div className={`${isDark ? 'bg-gray-900' : 'bg-white'} p-6 rounded-2xl border ${isDark ? 'border-gray-800' : 'border-gray-200'} shadow-xl ${isDark ? 'shadow-black/50' : 'shadow-gray-200/50'}`}>
            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Crea tu primera rutina con el botón "Crear rutina".</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {templates.map(tpl => (
              <div key={tpl.id} className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-xl p-4 border ${isDark ? 'border-gray-700' : 'border-gray-200'} ${isDark ? 'shadow-dark-neumorph' : 'shadow-neumorph'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`${isDark ? 'bg-purple-600/20' : 'bg-purple-100'} p-2 rounded-lg`}>
                        <Dumbbell className={`${isDark ? 'text-purple-300' : 'text-purple-600'}`} size={18} />
                      </div>
                      <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{tpl.name}</h3>
                    </div>
                    <div className="flex items-center gap-3 text-xs mb-3">
                      <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'} flex items-center gap-1`}>
                        <ListPlus size={14} /> {tpl.exercises.length} ejercicios
                      </span>
                      <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'} flex items-center gap-1`}>
                        <Clock size={14} /> ~45 min
                      </span>
                    </div>
                    <div className={`${isDark ? 'bg-gray-800/50' : 'bg-gray-50'} rounded-lg p-2 space-y-1`}>
                      {tpl.exercises.slice(0, 3).map((e, i) => (
                        <div key={i} className={`${isDark ? 'text-gray-400' : 'text-gray-600'} text-xs`}>
                          • {e.name} · {e.sets}×{e.reps}
                        </div>
                      ))}
                      {tpl.exercises.length > 3 && (
                        <div className="text-xs text-purple-500 font-medium">+{tpl.exercises.length - 3} más</div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => startFromTemplate(tpl)}
                      className={`${isDark ? 'bg-purple-600 hover:bg-purple-700' : 'bg-purple-500 hover:bg-purple-600'} text-white px-3 py-3 rounded-lg text-sm font-semibold`}
                    >
                      <span className="flex items-center gap-2"><Play size={14} /> Iniciar</span>
                    </button>
                    {tpl.id && (
                      <button
                        onClick={async () => {
                          await workoutTemplateService.deleteTemplate(tpl.id!);
                          const ts = await workoutTemplateService.getUserTemplates(user!.uid);
                          setTemplates(ts);
                          pushToast('info', 'Plantilla eliminada');
                        }}
                        className={`bg-gray-300 text-gray-700 hover:bg-gray-400 px-3 py-3 rounded-lg text-sm transition-colors flex items-center gap-2`}
                      >
                        <Trash2 size={14} /> Eliminar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Historial */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Historial</h3>
          <div className="flex items-center gap-2">
            <input id="history-date-filter" name="history-date-filter" type="date" className={`${isDark ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'} rounded-xl px-3 py-2 border ${isDark ? 'border-gray-700' : 'border-gray-300'}`} value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
            <button onClick={() => setDateFilter('')} className={`${isDark ? 'bg-gray-900 hover:bg-gray-800 text-white' : 'bg-white hover:bg-gray-100 text-gray-900'} border ${isDark ? 'border-gray-700' : 'border-gray-300'} px-3 py-2 rounded-xl text-sm`}>Mostrar todos</button>
          </div>
        </div>
        {sortedHistory.length === 0 ? (
          <div className={`${isDark ? 'bg-gray-900' : 'bg-white'} p-6 rounded-2xl border ${isDark ? 'border-gray-800' : 'border-gray-200'} shadow-xl ${isDark ? 'shadow-black/50' : 'shadow-gray-200/50'}`}>
            <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Aún no tienes entrenamientos completados.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedHistory.slice(0, 20).map(w => {
              return (
                <div key={w.id} className={`${isDark ? 'bg-gray-900' : 'bg-white'} p-4 rounded-2xl border ${isDark ? 'border-gray-800' : 'border-gray-200'} shadow-xl ${isDark ? 'shadow-black/50' : 'shadow-gray-200/50'} transition-all duration-300 hover:shadow-2xl`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold flex items-center gap-2">{w.name} {typeof w.performanceScore === 'number' && (<span className={`text-xs ${scoreColor(w.performanceScore)} flex items-center gap-1`}><TrendingUp size={12}/> {w.performanceScore}%</span>)}
                      </div>
                      <div className={`text-xs flex items-center gap-3 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        <span className="flex items-center gap-1"><Calendar size={12}/> {w.createdAt && new Date((w.createdAt as any).toDate()).toLocaleDateString('es-ES')}</span>
                        <span className="flex items-center gap-1"><Clock size={12}/> {formatDuration(w.duration)}</span>
                        {!!w.totalCaloriesBurned && (<span className="flex items-center gap-1 text-orange-600"><Flame size={12}/> {Math.round(w.totalCaloriesBurned)} kcal</span>)}
                        {typeof w.totalWeightLifted === 'number' && (<span className="flex items-center gap-1">Peso: {Math.round(w.totalWeightLifted)}kg</span>)}
                      </div>
                    </div>
                    <button onClick={() => setShowHistoryModal(w.id!)} className={`${isDark ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} px-3 py-1 rounded-lg text-xs transition-transform hover:scale-105`}>
                      Ver detalle
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  ), [templates, sortedHistory, isDark, weeklyStats]);

  if (!user) {
    return (
      <div className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Inicia sesión para ver tus entrenamientos.</div>
    );
  }

  return (
    <div className={`${isDark ? 'bg-gray-950' : 'bg-gray-50'} min-h-screen p-3 md:p-6 transition-colors`}>
      {loading ? (
        <div className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Cargando…</div>
      ) : (
        activeWorkout ? ActiveWorkoutView : DashboardView
      )}

      {/* Toasts */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(t => (
          <div key={t.id} className={`rounded-xl px-4 py-2 shadow ${t.type === 'success' ? 'bg-green-600 text-white' : t.type === 'error' ? 'bg-red-600 text-white' : isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'} border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            {t.message}
          </div>
        ))}
      </div>

      {/* Modal crear rutina / carrito */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
  <div className={`${isDark ? 'bg-gray-900 border border-gray-800 shadow-dark-neumorph' : 'bg-white border border-gray-200 shadow-neumorph'} w-full max-w-5xl rounded-3xl p-6 md:p-8 relative`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ListPlus />
                <div className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Crear rutina</div>
              </div>
              <button onClick={() => setShowCreateModal(false)} className={`${isDark ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} px-3 py-2 rounded-xl transition-transform hover:scale-105 active:scale-95`}>
                <X />
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Panel de búsqueda y sugerencias */}
              <div>
                <div className="flex gap-2 mb-2">
                  <label htmlFor="exercise-search" className="sr-only">Buscar ejercicios</label>
                  <input id="exercise-search" name="exercise-search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar ejercicios (nombre, músculo, equipo)" className={`${isDark ? 'bg-gray-800 text-white border-gray-700 ring-offset-gray-900' : 'bg-gray-100 text-gray-900 border-gray-300 ring-offset-white'} flex-1 rounded-xl px-3 py-2 border focus:ring-2 ring-purple-500 ring-offset-2`} />
                  <button onClick={runSearch} className={`${isDark ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} px-3 py-2 rounded-xl flex items-center gap-1 transition-transform hover:scale-105 active:scale-95`}>
                    <Search size={16} /> Buscar
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {DEFAULT_BODY_PART_CHIPS_ES.map(chip => (
                    <button key={chip} onClick={() => searchByBodyPartES(chip)} className={`${isDark ? 'bg-gray-800 hover:bg-gray-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} px-3 py-1 rounded-full text-xs transition-transform hover:scale-105 active:scale-95`}>{chip}</button>
                  ))}
                </div>
                {apiError && (
                  <div className={`${isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'} rounded-xl p-3 text-sm mb-2`}>
                    {apiError.includes('Clave API') || apiError.includes('Límite') ? apiError : `No se pudo consultar la API. ${apiError}`}
                  </div>
                )}
                <div>
                  <div className={`text-sm mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{searchLoading ? 'Cargando…' : searchResults.length > 0 ? 'Resultados' : 'Populares'}</div>
                  <div className="max-h-80 overflow-auto pr-1 space-y-2">
                    {(searchResults.length > 0 ? searchResults : popularExercises).map((exercise: any) => {
                      const isSelected = !!selectedExercises.find(ex => (ex.id && exercise.id && ex.id === exercise.id) || (!ex.id && ex.name === exercise.name));
                      return (
                        <button
                          key={exercise.id || exercise.name}
                          onClick={() => {
                            const adapted: AdaptedExercise = {
                              id: exercise.id,
                              name: exercise.name,
                              equipment: exercise.equipment,
                              difficulty: exercise.difficulty,
                              defaultSets: exercise.defaultSets ?? 3,
                              defaultReps: exercise.defaultReps ?? 10,
                              restTimeSeconds: exercise.restTimeSeconds ?? 60,
                            };
                            setSelectedExercises(list => {
                              const exists = list.find(ex => (ex.id && adapted.id && ex.id === adapted.id) || (!ex.id && ex.name === adapted.name));
                              if (exists) return list.filter(ex => (ex.id && adapted.id && ex.id === adapted.id) ? false : (!ex.id && ex.name === adapted.name) ? false : true);
                              return [...list, adapted];
                            });
                          }}
                          className={`w-full p-3 rounded-lg text-left transition-all ${
                            isSelected
                              ? isDark ? 'bg-purple-600 text-white' : 'bg-purple-500 text-white'
                              : isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{exercise.name}</div>
                              <div className="text-xs opacity-75 mt-0.5">{exercise.equipment}</div>
                            </div>
                            <div className={`${isSelected ? 'bg-white/20' : isDark ? 'bg-gray-800' : 'bg-gray-200'} px-2 py-0.5 rounded text-xs font-medium`}>
                              {exercise.difficulty}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Panel Carrito */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label htmlFor="custom-workout-name" className="sr-only">Nombre de la rutina</label>
                  <input id="custom-workout-name" name="custom-workout-name" value={routineName} onChange={(e) => setRoutineName(e.target.value)} className={`${isDark ? 'bg-gray-800 text-white border-gray-700 ring-offset-gray-900' : 'bg-gray-100 text-gray-900 border-gray-300 ring-offset-white'} flex-1 rounded-lg px-3 py-2 border focus:ring-2 ring-purple-500 ring-offset-2`} placeholder="Nombre de la rutina" />
                </div>
                <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} rounded-lg p-3 mb-3`}>
                  <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>Agregar ejercicio manual</h4>
                  <div className="flex gap-2">
                    <label htmlFor="manual-exercise-name" className="sr-only">Nombre del ejercicio (manual)</label>
                    <input
                      id="manual-exercise-name"
                      name="manual-exercise-name"
                      type="text"
                      value={manualExerciseName}
                      onChange={(e) => setManualExerciseName(e.target.value)}
                      placeholder="Nombre del ejercicio (ej: Press banca)"
                      className={`flex-1 px-3 py-2 rounded-lg text-sm ${isDark ? 'bg-gray-900 text-white placeholder-gray-500' : 'bg-white text-gray-900 placeholder-gray-400'} border ${isDark ? 'border-gray-700' : 'border-gray-300'}`}
                    />
                    <button
                      onClick={() => {
                        if (!manualExerciseName.trim()) return;
                        const item: AdaptedExercise = { name: manualExerciseName.trim(), defaultSets: 3, defaultReps: 10, restTimeSeconds: 60 };
                        setSelectedExercises(list => [...list, item]);
                        setManualExerciseName('');
                        setManualAddNotice('Ejercicio agregado');
                        setTimeout(() => setManualAddNotice(null), 1500);
                      }}
                      className={`${isDark ? 'bg-green-600 hover:bg-green-700' : 'bg-green-500 hover:bg-green-600'} text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors`}
                    >
                      Agregar
                    </button>
                  </div>
                  {manualAddNotice && (
                    <p className={`text-xs mt-2 ${isDark ? 'text-green-300' : 'text-green-700'}`}>{manualAddNotice}</p>
                  )}
                </div>
                <div>
                  <div className={`text-sm font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Ejercicios añadidos ({selectedExercises.length})
                  </div>
                  {selectedExercises.length === 0 ? (
                    <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-100'} rounded-lg p-4 text-center`}>
                      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        No hay ejercicios añadidos
                      </p>
                    </div>
                  ) : (
                    <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-100'} rounded-lg p-3 max-h-64 overflow-y-auto space-y-2`}>
                      {selectedExercises.map((ex, idx) => (
                        <div key={ex.id || idx} className={`flex items-center justify-between p-2 rounded ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
                          <div className="flex-1">
                            <div className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{ex.name}</div>
                            <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{ex.equipment} • {ex.difficulty}</div>
                          </div>
                          <button onClick={() => removeSelectedByIndex(idx)} className={`${isDark ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/20' : 'text-gray-500 hover:text-red-600 hover:bg-red-50'} p-1.5 rounded transition-colors`} title="Quitar ejercicio">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Calorías estimadas: {Math.round(estimatedSelectedCalories)} kcal</div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input id="save-as-template" name="save-as-template" type="checkbox" checked={saveAsTemplate} onChange={e => setSaveAsTemplate(e.target.checked)} /> Guardar como plantilla
                    </label>
                    <button onClick={saveCartAll} className={`${isDark ? 'bg-purple-600 hover:bg-purple-700' : 'bg-purple-500 hover:bg-purple-600'} text-white px-2 py-2 rounded-lg text-xs font-semibold flex items-center gap-1`}>
                      <Save size={14} /> Guardar todo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de finalización: selector energía */}
      {showFinishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowFinishModal(false); setSelectedEnergy(null); }} />
          <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} w-full max-w-md rounded-xl p-6 relative ${isDark ? 'shadow-dark-neumorph' : 'shadow-neumorph'}`}>
            <div className="mb-4">
              <div className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>¿Cómo te sientes ahora?</div>
              <div className={`${isDark ? 'text-gray-400' : 'text-gray-600'} text-sm`}>Selecciona tu nivel de energía (1-10)</div>
            </div>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {Array.from({ length: 10 }).map((_, i) => {
                const val = i + 1;
                const active = selectedEnergy === val;
                const bg = val >= 8 ? 'bg-green-600' : val >= 6 ? 'bg-yellow-500' : 'bg-red-500';
                return (
                  <button key={val} onClick={() => setSelectedEnergy(val)} className={`${active ? `${bg} text-white` : (isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-900')} rounded-lg py-2 text-sm font-semibold`}>
                    {val}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => { setShowFinishModal(false); setSelectedEnergy(null); }} className={`bg-purple-400 hover:bg-purple-500 text-white flex-1 py-2 rounded-lg text-sm font-medium`}>Continuar</button>
              <button onClick={confirmFinish} disabled={selectedEnergy == null} className={`flex-1 py-2 rounded-lg text-sm font-semibold ${selectedEnergy == null ? 'opacity-60 cursor-not-allowed' : ''} bg-gray-300 hover:bg-gray-400 text-gray-700`}>
                Finalizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Historial Detalle */}
      {showHistoryModal && (() => {
        const w = history.find(h => h.id === showHistoryModal);
        if (!w) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowHistoryModal(null)} />
            <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} w-full max-w-3xl rounded-xl p-6 relative ${isDark ? 'shadow-dark-neumorph' : 'shadow-neumorph'}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{w.name}</div>
                  <div className={`text-xs flex items-center gap-3 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    <span className="flex items-center gap-1"><Calendar size={12}/> {w.createdAt && new Date((w.createdAt as any).toDate()).toLocaleDateString('es-ES')}</span>
                    <span className="flex items-center gap-1"><Clock size={12}/> {formatDuration(w.duration)}</span>
                    {typeof w.performanceScore === 'number' && (<span className={`flex items-center gap-1 ${scoreColor(w.performanceScore)}`}><TrendingUp size={12}/> {w.performanceScore}%</span>)}
                  </div>
                </div>
                <button onClick={() => setShowHistoryModal(null)} className={`bg-purple-400 hover:bg-purple-500 text-white px-3 py-2 rounded-lg text-sm`}>
                  <X />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 max-h-[60vh] overflow-auto pr-1">
                {w.exercises.map((ex, i) => (
                  <div key={`${w.id}_exm_${i}`} className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} rounded-lg p-4 shadow`}>
                    <div className="font-medium">{ex.name}</div>
                    <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Series: {ex.setsDetail?.length || ex.sets} x {ex.reps} @ {ex.weight}kg</div>
                    {ex.setsDetail && ex.setsDetail.length > 0 && (
                      <ul className={`mt-2 text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'} grid grid-cols-2 gap-1`}>
                        {ex.setsDetail.map((s, idx) => (
                          <li key={idx} className="flex items-center gap-1">
                            {s.done ? <Check size={12} className="text-green-600" /> : <Square size={12} />}
                            Set {idx + 1}: {s.reps} x {s.weight}kg
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal de celebración */}
      {!!showCelebrateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCelebrateModal(null)} />
          <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} w-full max-w-sm rounded-xl p-6 text-center relative ${isDark ? 'shadow-dark-neumorph' : 'shadow-neumorph'}`}>
            <div className={`text-xl font-bold ${scoreColor(showCelebrateModal.score)}`}>Score: {showCelebrateModal.score}%</div>
            <div className={`${isDark ? 'text-gray-300' : 'text-gray-700'} mt-2`}>{scoreMessage(showCelebrateModal.score)}</div>
            <button onClick={() => setShowCelebrateModal(null)} className={`${isDark ? 'bg-purple-600 hover:bg-purple-700' : 'bg-purple-500 hover:bg-purple-600'} mt-4 px-3 py-3 rounded-lg text-sm font-semibold text-white`}>
              ¡A seguir!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}