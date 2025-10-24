/**
 * Chat Cloud Function for ATHLOS
 * - Validates auth
 * - Rate limits (hourly/daily)
 * - Builds user context from Firestore (foods, workouts, weekly stats)
 * - Maintains conversation sessions and message history
 * - Calls OpenAI (gpt-4o-mini) with timeout and fallback
 * - Persists messages and updates analytics
 *
 * Note: Implemented with defensive coding, TypeScript strict, and abundant comments.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';

// Initialize admin (guard against multiple in emulators)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Limpia valores undefined de un objeto recursivamente
 * Firestore no permite undefined, solo null
 */
function removeUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as any;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefined(item)) as any;
  }
  if (typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const key in obj as any) {
      const value = (obj as any)[key];
      if (value !== undefined) {
        cleaned[key] = removeUndefined(value);
      }
    }
    return cleaned as any as T;
  }
  return obj;
}

/**
 * Convierte cualquier valor de fecha a Firestore Timestamp
 */
function toFirestoreTimestamp(value: any): FirebaseFirestore.Timestamp {
  if (!value) {
    return admin.firestore.Timestamp.now();
  }
  // Si ya es un Timestamp de Firestore
  if (value?.toMillis && typeof value.toMillis === 'function') {
    return value as FirebaseFirestore.Timestamp;
  }
  // Si es un objeto Date
  if (value instanceof Date) {
    return admin.firestore.Timestamp.fromDate(value);
  }
  // Si es un número (milisegundos)
  if (typeof value === 'number') {
    return admin.firestore.Timestamp.fromMillis(value);
  }
  // Si es un string ISO
  if (typeof value === 'string') {
    const d = new Date(value);
    return admin.firestore.Timestamp.fromDate(d);
  }
  // Si es un objeto con _seconds y _nanoseconds (Timestamp serializado)
  if (typeof value === 'object' && value._seconds !== undefined) {
    return new admin.firestore.Timestamp(value._seconds, value._nanoseconds || 0);
  }
  // Fallback: ahora
  console.warn('⚠️ Valor de fecha desconocido, usando ahora:', value);
  return admin.firestore.Timestamp.now();
}

// Alias público simple según la convención pedida
function toTimestamp(value: any): FirebaseFirestore.Timestamp {
  return toFirestoreTimestamp(value);
}

export const CONFIG = {
  MAX_CONTEXT_MESSAGES: 10,
  CACHE_TTL_MINUTES: 5,
  RATE_LIMIT_HOURLY: 20,
  RATE_LIMIT_DAILY: 100,
  MAX_RESPONSE_TIME_MS: 12000,
  MODEL: 'gpt-4o-mini',
  MAX_TOKENS: 300,
  TEMPERATURE: 0.7,
  REGION: 'us-central1' as const,
};

// NOTE: Do NOT initialize OpenAI at module scope. Secrets are only available inside the function.

// Types
type Role = 'user' | 'assistant' | 'system';

interface ChatMessage {
  role: Role;
  content: string;
  timestamp: FirebaseFirestore.Timestamp;
  tokensUsed?: number;
  responseTime?: number;
}

interface ChatSessionDoc {
  userId: string;
  sessionId: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  messageCount: number;
  isActive: boolean;
  recentMessages: ChatMessage[];
}

interface RateLimitDoc {
  userId: string;
  hourlyCount: number;
  dailyCount: number;
  windowStart: FirebaseFirestore.Timestamp; // start of current hour window
  lastReset: FirebaseFirestore.Timestamp;   // last daily reset
  isBlocked: boolean;
}

interface ContextCacheDoc {
  userId: string;
  lastUpdated: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
  summary: UserContextSummary;
}

interface UserContextSummary {
  totalCaloriesToday: number;
  targetCalories: number;
  lastMeal: null | {
    name: string;
    calories: number;
    when: string; // ISO date
  };
  lastWorkout: null | {
    name: string;
    duration: number; // seconds
    when: string; // ISO date
    performanceScore?: number;
  };
  weeklyStats: {
    workoutCount: number;
    totalCalories: number; // foods
  };
  // NUEVO: Insights personales
  personalInsights?: Array<{
    type: 'pattern' | 'recommendation' | 'achievement';
    title: string;
    description: string;
    keyEvidence: string; // Resumen de la evidencia más importante
    actionable: string;
  }>;
}

interface ChatRequestPayload {
  message: string;
  sessionId?: string;
}

interface ChatResponsePayload {
  sessionId: string;
  reply: string;
  type: 'normal' | 'recommendation' | 'achievement' | 'error';
  tokensUsed?: number;
  responseTimeMs?: number;
  wasFallback?: boolean;
  wasFromCache?: boolean;
}

// Utilities
// const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const SYSTEM_PROMPT = (context: UserContextSummary) => {
  let insightsSection = '';
  
  if (context.personalInsights && context.personalInsights.length > 0) {
    insightsSection = `\n\nPATRONES PERSONALES IDENTIFICADOS (úsalos en tus respuestas):`;
    context.personalInsights.forEach((insight, idx) => {
      insightsSection += `\n${idx + 1}. ${insight.title}
   - Qué detecté: ${insight.description}
   - Evidencia clave: ${insight.keyEvidence}
   - Recomendación: ${insight.actionable}`;
    });
  }

  return `Eres Apolo, el entrenador personal de ATHLOS. Tu personalidad es:
- Motivador pero realista
- Empático y cercano  
- Profesional pero no rígido
- Claro y conciso (máximo 3-4 oraciones)

CONTEXTO DEL USUARIO HOY:
- Calorías: ${context.totalCaloriesToday}/${context.targetCalories} kcal
- Última comida: ${context.lastMeal ? context.lastMeal.name : 'Ninguna'}
- Último entrenamiento: ${context.lastWorkout ? context.lastWorkout.name : 'Ninguno'}
- Esta semana: ${context.weeklyStats.workoutCount} entrenamientos
${insightsSection}

INSTRUCCIONES CRÍTICAS:
1. Cuando respondas sobre energía, rendimiento o alimentación, USA LOS PATRONES PERSONALES arriba
2. Cita datos concretos: "He notado que en tus 6 días de alta energía, consumías 293g de carbos..."
3. Sé específico con SU historial, no teoría general
4. Si no hay patrones relevantes para la pregunta, usa conocimientos generales
5. NO diagnostiques enfermedades ni prescribas dietas médicas
6. Usa emojis ocasionalmente (1-2 por respuesta)

Ejemplo de buena respuesta:
"Revisé tus registros. En tus días de mayor energía (8-9/10), consumías 
en promedio 293g de carbohidratos. Hoy solo llevas 180g. Esa diferencia 
de 113g podría explicar tu baja energía 🤔

¿Quieres que te sugiera algo antes de entrenar?"`;
};

// Rate limiting helpers
async function checkRateLimit(userId: string) {
  const ref = db.collection('chat_rate_limits').doc(userId);
  const snap = await ref.get();
  const startOfHour = admin.firestore.Timestamp.fromDate(new Date(new Date().setMinutes(0, 0, 0)));
  const startOfDay = admin.firestore.Timestamp.fromDate(new Date(new Date().setHours(0, 0, 0, 0)));

  let doc: RateLimitDoc;
  if (!snap.exists) {
    doc = {
      userId,
      hourlyCount: 0,
      dailyCount: 0,
      windowStart: startOfHour,
      lastReset: startOfDay,
      isBlocked: false,
    };
  } else {
    const raw = snap.data() as any;
    doc = {
      userId: raw.userId,
      hourlyCount: Number(raw.hourlyCount || 0),
      dailyCount: Number(raw.dailyCount || 0),
      windowStart: toFirestoreTimestamp(raw.windowStart),
      lastReset: toFirestoreTimestamp(raw.lastReset),
      isBlocked: Boolean(raw.isBlocked),
    };
  }

  // Reset hourly window if needed
  if (toFirestoreTimestamp(doc.windowStart).toMillis() !== startOfHour.toMillis()) {
    doc.hourlyCount = 0;
    doc.windowStart = startOfHour;
  }
  // Reset daily if day changed
  if (toFirestoreTimestamp(doc.lastReset).toMillis() !== startOfDay.toMillis()) {
    doc.dailyCount = 0;
    doc.lastReset = startOfDay;
  }

  const wouldExceedHour = doc.hourlyCount + 1 > CONFIG.RATE_LIMIT_HOURLY;
  const wouldExceedDay = doc.dailyCount + 1 > CONFIG.RATE_LIMIT_DAILY;
  const limited = wouldExceedHour || wouldExceedDay || doc.isBlocked;

  if (limited) {
    // Compute next allowed in ms
    const nextHour = new Date(startOfHour.toDate().getTime() + 60 * 60 * 1000);
    const msToHour = nextHour.getTime() - Date.now();
    const nextDay = new Date(startOfDay.toDate().getTime() + 24 * 60 * 60 * 1000);
    const msToDay = nextDay.getTime() - Date.now();
    const nextAllowedMs = wouldExceedHour ? msToHour : msToDay;
    return { allowed: false, nextAllowedMs: nextAllowedMs };
  }

  // Increment and persist
  doc.hourlyCount += 1;
  doc.dailyCount += 1;
  await ref.set(removeUndefined(doc), { merge: true });
  return { allowed: true };
}

// Session helpers
async function createChatSession(userId: string): Promise<string> {
  const sessionId = db.collection('chat_sessions').doc().id;
  const now = admin.firestore.Timestamp.now();
  const payload: ChatSessionDoc = {
    userId,
    sessionId,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    isActive: true,
    recentMessages: [],
  };
  await db.collection('chat_sessions').doc(sessionId).set(removeUndefined(payload));
  return sessionId;
}

async function getConversationHistory(sessionId: string): Promise<ChatMessage[]> {
  const doc = await db.collection('chat_sessions').doc(sessionId).get();
  if (!doc.exists) return [];
  const raw = doc.data() as any;
  const recent = (raw.recentMessages || [])
    .slice(-CONFIG.MAX_CONTEXT_MESSAGES)
    .map((m: any) => ({
      ...m,
      timestamp: toTimestamp(m?.timestamp),
    })) as ChatMessage[];
  return recent;
}

// Context helper (with caching)
async function buildUserContext(userId: string): Promise<{ summary: UserContextSummary; wasFromCache: boolean }> {
  const cacheRef = db.collection('chat_context_cache').doc(userId);
  const now = admin.firestore.Timestamp.now();
  const snap = await cacheRef.get();
  if (snap.exists) {
    const raw = snap.data() as any;
    const cached: ContextCacheDoc = {
      userId: raw.userId,
      lastUpdated: toTimestamp(raw.lastUpdated),
      expiresAt: toTimestamp(raw.expiresAt),
      summary: raw.summary as UserContextSummary,
    };
    if (cached.expiresAt.toMillis() > now.toMillis()) {
      return { summary: cached.summary, wasFromCache: true };
    }
  }

  // Compute fresh context
  const todayStr = new Date().toISOString().split('T')[0];
  const foodsSnap = await db.collection('userFoodEntries')
    .where('userId', '==', userId)
    .where('date', '==', todayStr)
    .orderBy('createdAt', 'desc')
    .get();
  const foods = foodsSnap.docs.map(d => d.data());
  const totalCaloriesToday = foods.reduce((sum, f: any) => sum + (f.calories || 0), 0);
  const lastMeal = foods[0] ? {
    name: foods[0].name as string,
    calories: foods[0].calories as number,
    when: new Date((foods[0].createdAt as FirebaseFirestore.Timestamp)?.toDate?.() || Date.now()).toISOString(),
  } : null;

  const workoutsSnap = await db.collection('workouts')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  const lastW = workoutsSnap.docs[0]?.data();
  const lastWorkout = lastW ? {
    name: (lastW.name as string) || 'Entrenamiento',
    duration: (lastW.duration as number) || 0,
    when: new Date((lastW.createdAt as FirebaseFirestore.Timestamp)?.toDate?.() || Date.now()).toISOString(),
    performanceScore: lastW.performanceScore as number | undefined,
  } : null;

  // Weekly stats
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekSnap = await db.collection('workouts')
    .where('userId', '==', userId)
    .where('completedAt', '>=', admin.firestore.Timestamp.fromDate(weekAgo))
    .where('isActive', '==', false)
    .get();
  const workoutCount = weekSnap.docs.length;

  const foodsWeekSnap = await db.collection('userFoodEntries')
    .where('userId', '==', userId)
    .where('date', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
    .get();
  const totalWeekCalories = foodsWeekSnap.docs.reduce((sum, d) => sum + ((d.data() as any).calories || 0), 0);

  const targetCalories = 2200; // TODO: If you store per-user targets in users profile, fetch here

  const summary: UserContextSummary = {
    totalCaloriesToday,
    targetCalories,
    lastMeal,
    lastWorkout,
    weeklyStats: { workoutCount, totalCalories: totalWeekCalories },
  };

  // Obtener insights personales del usuario
  let personalInsights: UserContextSummary['personalInsights'] = undefined;
  try {
    // En funciones, por ahora leemos insights precalculados desde Firestore
    const insightsSnap = await db.collection('user_insights')
      .doc(userId)
      .get();
    
    if (insightsSnap.exists) {
      const data = insightsSnap.data() as any;
      if (data && data.insights && Array.isArray(data.insights)) {
        personalInsights = (data.insights as any[]).slice(0, 3).map((i: any) => ({
          type: i.type,
          title: i.title,
          description: i.description,
          keyEvidence: (i.evidence && Array.isArray(i.evidence) ? i.evidence[0] : '') || '',
          actionable: i.actionable
        }));
      }
    }
  } catch (err) {
    console.error('Error loading personal insights:', err);
    // No bloqueamos el flujo si falla
  }
  if (personalInsights) {
    summary.personalInsights = personalInsights;
  }

  // Eliminar undefined antes de cachear/retornar
  const cleanedSummary = removeUndefined(summary) as UserContextSummary;

  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + CONFIG.CACHE_TTL_MINUTES * 60 * 1000));
  const cacheDoc: ContextCacheDoc = { userId, lastUpdated: now, expiresAt, summary: cleanedSummary };
  await cacheRef.set(removeUndefined(cacheDoc), { merge: true });

  return { summary: cleanedSummary, wasFromCache: false };
}

// OpenAI call with timeout and minimal classification heuristics
async function callOpenAI(message: string, context: UserContextSummary, history: ChatMessage[], openai: OpenAI): Promise<{ reply: string; tokensUsed?: number }> {
  const sysPrompt = SYSTEM_PROMPT(context);
  // Map history to chat messages
  const mapped = history.slice(-CONFIG.MAX_CONTEXT_MESSAGES).map(m => ({ role: m.role, content: m.content as string }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const completion = await openai.chat.completions.create({
      model: CONFIG.MODEL,
      messages: [
        { role: 'system', content: sysPrompt },
        ...mapped,
        { role: 'user', content: message },
      ],
      max_tokens: CONFIG.MAX_TOKENS,
      temperature: CONFIG.TEMPERATURE,
    }, { signal: controller.signal as any });
    const reply = completion.choices?.[0]?.message?.content?.trim() || 'Lo siento, no tengo una respuesta en este momento.';
    const tokensUsed = (completion.usage as any)?.total_tokens as number | undefined;
    return { reply, tokensUsed };
  } finally {
    clearTimeout(timeout);
  }
}

function classifyReply(reply: string): 'normal' | 'recommendation' | 'achievement' {
  const r = reply.toLowerCase();
  if (r.includes('recomiendo') || r.includes('podrías') || r.includes('suger')) return 'recommendation';
  if (r.includes('felic') || r.includes('excelente') || r.includes('gran trabajo')) return 'achievement';
  return 'normal';
}

function getFallbackResponse(message: string, context: UserContextSummary, reason: string): { reply: string; type: 'normal' | 'recommendation' | 'achievement' } {
  // Simple, fast and context-aware fallback
  const cal = `${context.totalCaloriesToday}/${context.targetCalories}`;
  let base = `Estoy teniendo problemas para responder ahora (${reason}). Hoy llevas ${cal} kcal.`;
  if (context.lastWorkout) base += ` Buen progreso con tu entrenamiento "${context.lastWorkout.name}" 💪`;
  const type: 'normal' | 'recommendation' = message.toLowerCase().includes('comer') || message.toLowerCase().includes('comida') ? 'recommendation' : 'normal';
  return { reply: `${base} Intenta una pregunta concreta y breve.`, type };
}

// Lista de palabras clave válidas
// ✅ KEYWORDS VÁLIDAS EXPANDIDAS - Solo responder sobre estos temas
const FITNESS_KEYWORDS = [
  // Ejercicio y entrenamiento
  'ejercicio', 'entrenar', 'entrenamiento', 'rutina', 'workout', 'gym', 'gimnasio',
  'músculo', 'muscular', 'fuerza', 'cardio', 'aeróbico', 'anaeróbico',
  'peso', 'repeticiones', 'reps', 'series', 'sets', 'descanso', 'recuperación',
  'calentamiento', 'estiramiento', 'flexibilidad', 'movilidad',
  'press', 'sentadilla', 'squat', 'deadlift', 'peso muerto', 'bench press',
  'curl', 'extensión', 'flexión', 'plancha', 'abdominales', 'core',
  'dominadas', 'pull up', 'push up', 'lagartija', 'burpee', 'jumping',
  'crossfit', 'yoga', 'pilates', 'running', 'correr', 'caminar', 'nadar',
  'bicicleta', 'spinning', 'zumba', 'box', 'boxeo', 'artes marciales',
  'hiit', 'tabata', 'circuito', 'superserie', 'drop set', 'pirámide',
  'volumen', 'intensidad', 'frecuencia', 'periodización', 'macrociclo',
  'espalda', 'pecho', 'pierna', 'brazo', 'hombro', 'glúteo', 'cuádriceps',
  'bíceps', 'tríceps', 'deltoides', 'trapecio', 'dorsal', 'lumbar',
  
  // Nutrición y alimentación
  'comida', 'alimento', 'comer', 'alimentación', 'nutrición', 'dieta',
  'calorías', 'kcal', 'kilocalorías', 'energía',
  'proteína', 'carbohidrato', 'hidrato', 'grasa', 'lípido', 'fibra',
  'macro', 'macronutriente', 'micronutriente', 'vitamina', 'mineral',
  'déficit', 'superávit', 'mantenimiento', 'recomposición',
  'desayuno', 'almuerzo', 'comida', 'cena', 'merienda', 'snack', 'colación',
  'breakfast', 'lunch', 'dinner',
  'suplemento', 'creatina', 'whey', 'proteína whey', 'caseína', 'bcaa',
  'pre-workout', 'post-workout', 'aminoácido', 'glutamina', 'arginina',
  'agua', 'hidratación', 'hidratar', 'bebida', 'líquido',
  'fruta', 'verdura', 'vegetal', 'carne', 'pollo', 'pescado', 'huevo',
  'arroz', 'pasta', 'pan', 'cereal', 'avena', 'quinoa',
  'lácteo', 'leche', 'yogur', 'queso',
  'ayuno', 'intermitente', 'cetogénica', 'keto', 'paleo', 'vegano',
  'vegetariano', 'flexitariano', 'mediterránea',
  'índice glucémico', 'insulina', 'glucosa', 'azúcar en sangre',
  'sodio', 'sal', 'potasio', 'calcio', 'hierro', 'zinc',
  'omega 3', 'omega 6', 'grasa saturada', 'insaturada', 'trans',
  'colesterol', 'hdl', 'ldl', 'triglicéridos',
  
  // Bienestar y recuperación
  'dormir', 'sueño', 'descanso', 'recuperación', 'regeneración',
  'estrés', 'ansiedad', 'relajación', 'meditación', 'mindfulness',
  'bienestar', 'wellness', 'salud', 'saludable', 'healthy',
  'energía', 'cansancio', 'fatiga', 'agotamiento',
  'dolor', 'lesión', 'injury', 'molestia', 'inflamación',
  'dolor muscular', 'doms', 'agujetas', 'contractura',
  'postura', 'ergonomía', 'columna', 'espalda baja',
  'masaje', 'foam roller', 'rodillo', 'estiramiento',
  'sistema inmune', 'defensas', 'inmunidad',
  'hidratación', 'deshidratación', 'electrolitos',
  
  // Objetivos y progreso
  'objetivo', 'meta', 'goal', 'propósito', 'target',
  'progreso', 'avance', 'mejora', 'resultado', 'logro', 'achievement',
  'adelgazar', 'perder peso', 'bajar', 'quemar grasa', 'definir',
  'ganar', 'aumentar', 'subir peso', 'masa muscular', 'volumen',
  'tonificar', 'marcar', 'definición', 'cutting', 'bulking',
  'recomposición corporal', 'composición', 'porcentaje grasa',
  'peso corporal', 'báscula', 'balanza', 'medida', 'medición',
  'foto', 'fotografía', 'progreso visual', 'before after',
  'índice masa corporal', 'imc', 'bmi', 'peso ideal',
  'rendimiento', 'performance', 'fuerza máxima', '1rm',
  'resistencia', 'endurance', 'stamina', 'aguante',
  'velocidad', 'potencia', 'explosividad', 'agilidad',
  'motivación', 'disciplina', 'constancia', 'hábito',
  'planificación', 'plan', 'programa', 'schedule',
  
  // Términos generales relacionados
  'fitness', 'fit', 'forma física', 'condición física',
  'salud física', 'salud mental', 'vida saludable',
  'estilo de vida', 'lifestyle', 'cambio', 'transformación',
  'coach', 'entrenador', 'nutricionista', 'dietista',
  'app', 'aplicación', 'athlos', 'apolo', 'registro',
  'seguimiento', 'tracking', 'monitor', 'medir',
];

// ❌ KEYWORDS PROHIBIDAS EXPANDIDAS - Rechazar inmediatamente
const OUT_OF_SCOPE_KEYWORDS = [
  // Belleza y estética NO relacionada con fitness
  'pelo', 'cabello', 'tinte', 'teñir', 'pintar pelo', 'color de pelo', 'capilar',
  'maquillaje', 'makeup', 'cosmético', 'crema facial', 'sérum', 'mascarilla facial',
  'uñas', 'manicura', 'pedicura', 'esmaltado', 'gel',
  'pestañas', 'cejas', 'depilar', 'depilación', 'cera', 'láser estético',
  'botox', 'ácido hialurónico', 'relleno', 'lifting',
  'tatuaje', 'tattoo', 'piercing', 'perforación',
  'perfume', 'fragancia', 'colonia', 'aroma',
  
  // Moda y vestimenta
  'ropa', 'vestido', 'pantalón', 'camisa', 'blusa', 'falda',
  'zapatos', 'zapatillas de vestir', 'tacones', 'sandalias',
  'moda', 'fashion', 'outfit', 'look', 'estilo de ropa',
  'accesorio', 'joyería', 'collar', 'pulsera', 'anillo',
  'bolso', 'cartera', 'mochila de moda', 'maleta',
  
  // Relaciones y amor
  'amor', 'enamorar', 'pareja', 'novio', 'novia', 'esposo', 'esposa',
  'cita romántica', 'date', 'ligar', 'seducir', 'conquistar',
  'matrimonio', 'boda', 'casarse', 'divorcio', 'separación',
  'romance', 'romántico', 'beso', 'abrazo amoroso',
  'sexo', 'sexual', 'intimidad', 'erótico',
  'celos', 'infidelidad', 'engaño', 'ex pareja',
  
  // Trabajo y finanzas
  'trabajo', 'empleo', 'job', 'empresa', 'oficina', 'jefe', 'jefa',
  'sueldo', 'salario', 'pago', 'nómina', 'contrato laboral',
  'curriculum', 'cv', 'entrevista laboral', 'ascenso',
  'dinero', 'plata', 'efectivo', 'billete', 'moneda',
  'inversión', 'invertir', 'bolsa', 'acciones', 'trading',
  'banco', 'cuenta bancaria', 'préstamo', 'crédito', 'hipoteca',
  'ahorro', 'ahorrar', 'presupuesto financiero', 'economía personal',
  'impuesto', 'declaración', 'factura no relacionada',
  'negocio', 'emprendimiento', 'startup', 'empresa propia',
  
  // Entretenimiento
  'película', 'movie', 'cine', 'serie', 'netflix', 'streaming',
  'actor', 'actriz', 'famoso', 'celebrity', 'influencer no fitness',
  'música no de entrenamiento', 'canción', 'album', 'concierto',
  'videojuego', 'gaming', 'consola', 'playstation', 'xbox',
  'anime', 'manga', 'comic', 'superhéroe',
  'libro no de fitness', 'novela', 'ficción', 'literatura',
  
  // Tecnología NO relacionada
  'computadora', 'ordenador', 'pc', 'laptop no fitness',
  'celular', 'móvil', 'smartphone', 'iphone', 'android',
  'tablet', 'ipad', 'dispositivo no fitness',
  'software', 'programa', 'código', 'programación',
  'inteligencia artificial', 'ai', 'machine learning',
  'blockchain', 'bitcoin', 'criptomoneda', 'nft',
  
  // Otros temas
  'política', 'político', 'gobierno', 'presidente', 'elección',
  'religión', 'dios', 'iglesia', 'rezo', 'oración religiosa',
  'filosofía', 'existencial', 'metafísica',
  'mascota', 'perro', 'gato', 'animal doméstico',
  'coche', 'auto', 'carro', 'vehículo', 'conducir',
  'viaje', 'vacaciones', 'turismo', 'hotel', 'playa',
  'clima', 'tiempo', 'temperatura ambiente', 'lluvia', 'sol',
  'casa', 'vivienda', 'decoración', 'mueble', 'diseño interior',
  'jardinería', 'planta ornamental', 'jardín',
  'cocinar no fitness', 'receta gourmet', 'restaurante',
  'astrología', 'horóscopo', 'signo zodiacal', 'tarot',
  'chisme', 'gossip', 'rumor', 'escándalo',
];

// FRASES COMPLETAS PROHIBIDAS 
const PROHIBITED_PHRASES = [
  'pintar el pelo',
  'teñir el cabello',
  'color de cabello',
  'cambiar de look',
  'cortarme el pelo',
  'peinado',
  'que ropa',
  'que vestir',
  'como vestir',
  'outfit para',
  'como ligar',
  'conquistar a',
  'me gusta un',
  'enamorado de',
  'mi pareja',
  'mi novio',
  'mi novia',
  'precio de',
  'cuanto cuesta',
  'donde comprar',
  'marca de ropa',
  'marca de zapatos',
];

function isRelevantQuery(message: string): { 
  isRelevant: boolean; 
  confidence: number; 
  reason?: string;
} {
  const lower = message.toLowerCase().trim();
  
  // NIVEL 1: Verificar frases completas prohibidas primero
  for (const phrase of PROHIBITED_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      console.log(`🚫 Blocked by prohibited phrase: "${phrase}"`);
      return { 
        isRelevant: false, 
        confidence: 0.99,
        reason: `prohibited_phrase: ${phrase}`
      };
    }
  }
  
  // NIVEL 2: Check explicit out-of-scope keywords
  const foundOutOfScope: string[] = [];
  for (const keyword of OUT_OF_SCOPE_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) {
      foundOutOfScope.push(keyword);
    }
  }
  
  if (foundOutOfScope.length > 0) {
    console.log(`🚫 Blocked by keywords: ${foundOutOfScope.join(', ')}`);
    return { 
      isRelevant: false, 
      confidence: 0.98,
      reason: `out_of_scope_keywords: ${foundOutOfScope.join(', ')}`
    };
  }
  
  // NIVEL 3: Mensajes muy cortos (saludos, etc) - permitir con precaución
  if (message.length < 15) {
    const greetings = ['hola', 'hey', 'buenas', 'hello', 'hi', 'buenos', 'saludos', 'que tal', 'qué tal'];
    const isGreeting = greetings.some(g => lower.includes(g));
    
    if (isGreeting) {
      return { isRelevant: true, confidence: 0.9 };
    }
    
    // Muy corto pero no saludo - baja confianza
    return { isRelevant: true, confidence: 0.4 };
  }
  
  // NIVEL 4: Buscar palabras clave válidas
  const foundRelevant: string[] = [];
  for (const keyword of FITNESS_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) {
      foundRelevant.push(keyword);
    }
  }
  
  // Si tiene 2+ keywords válidas = muy probablemente relevante
  if (foundRelevant.length >= 2) {
    console.log(`✅ Approved by keywords (${foundRelevant.length}): ${foundRelevant.slice(0, 3).join(', ')}`);
    return { isRelevant: true, confidence: 0.95 };
  }
  
  // Si tiene 1 keyword válida = probablemente relevante
  if (foundRelevant.length === 1) {
    console.log(`✅ Approved by keyword: ${foundRelevant[0]}`);
    return { isRelevant: true, confidence: 0.85 };
  }
  
  // NIVEL 5: Análisis contextual - preguntas genéricas sobre la app
  const appRelated = [
    'athlos', 'apolo', 'app', 'aplicación', 'registrar', 'guardar',
    'borrar', 'eliminar', 'modificar', 'como funciona', 'ayuda',
    'configuración', 'perfil', 'cuenta', 'usuario'
  ];
  
  if (appRelated.some(term => lower.includes(term))) {
    return { isRelevant: true, confidence: 0.7 };
  }
  
  // NIVEL 6: Si NO tiene keywords válidas Y tiene más de 20 caracteres = probablemente fuera de scope
  if (message.length > 20 && foundRelevant.length === 0) {
    console.log(`⚠️ Suspicious query (no fitness keywords, long): "${message}"`);
    // Dar baja confianza para que OpenAI decida, pero registrar
    return { 
      isRelevant: true, 
      confidence: 0.2,
      reason: 'no_fitness_keywords_found'
    };
  }
  
  // Default: permitir pero con confianza media-baja
  return { isRelevant: true, confidence: 0.5 };
}

async function saveMessage(sessionId: string, role: Role, content: string, userId: string, extras?: Partial<ChatMessage>) {
  const now = admin.firestore.Timestamp.now();
  const base: ChatMessage = { role, content, timestamp: now, ...extras } as ChatMessage;
  const msg: ChatMessage = removeUndefined(base) as ChatMessage;
  const sessionRef = db.collection('chat_sessions').doc(sessionId);
  const batch = db.batch();
  batch.set(sessionRef.collection('messages').doc(), msg);
  batch.set(sessionRef, {
    updatedAt: now,
    messageCount: admin.firestore.FieldValue.increment(1),
    recentMessages: admin.firestore.FieldValue.arrayUnion(msg),
    userId,
    sessionId,
  }, { merge: true });
  await batch.commit();
}

async function trimRecentMessages(sessionId: string) {
  const ref = db.collection('chat_sessions').doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const raw = snap.data() as any;
  const trimmed = (raw.recentMessages || [])
    .slice(-CONFIG.MAX_CONTEXT_MESSAGES)
    .map((m: any) => removeUndefined({
      ...m,
      timestamp: toTimestamp(m?.timestamp),
    }));
  await ref.set(removeUndefined({ recentMessages: trimmed }), { merge: true });
}

async function updateAnalytics(userId: string, responseTime: number, tokens?: number, hadError?: boolean, usedFallback?: boolean) {
  const dateStr = new Date().toISOString().split('T')[0];
  const ref = db.collection('chat_analytics').doc(dateStr);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data() as any : {
      date: dateStr,
      totalMessages: 0,
      uniqueUsers: 0,
      avgResponseTime: 0,
      openAICallsCount: 0,
      fallbackCount: 0,
      errorCount: 0,
      totalCost: 0, // TODO: compute via tokens * model price if desired
      users: {} as Record<string, boolean>,
    };
    const users = current.users || {};
    users[userId] = true;
    const newTotal = (current.totalMessages || 0) + 1;
    const prevAvg = current.avgResponseTime || 0;
    const newAvg = prevAvg === 0 ? responseTime : Math.round((prevAvg * current.totalMessages + responseTime) / newTotal);
    tx.set(ref, removeUndefined({
      date: dateStr,
      totalMessages: newTotal,
      uniqueUsers: Object.keys(users).length,
      avgResponseTime: newAvg,
      openAICallsCount: (current.openAICallsCount || 0) + (usedFallback ? 0 : 1),
      fallbackCount: (current.fallbackCount || 0) + (usedFallback ? 1 : 0),
      errorCount: (current.errorCount || 0) + (hadError ? 1 : 0),
      totalCost: current.totalCost || 0,
      users,
    }), { merge: true });
  });
}

// Main function
export const chat = onCall({ region: CONFIG.REGION, timeoutSeconds: 15, memory: '512MiB', secrets: ['OPENAI_API_KEY'] }, async (request): Promise<ChatResponsePayload> => {
    const started = Date.now();
    try {
      // Auth
      const uid = request.auth?.uid;
      if (!uid) {
        throw new HttpsError('unauthenticated', 'Debes iniciar sesión para usar el chat.');
      }

      // Validate input
      const data = request.data as ChatRequestPayload;
      const message = (data?.message || '').toString().trim();
      if (!message) throw new HttpsError('invalid-argument', 'Mensaje vacío.');
      if (message.length > 500) throw new HttpsError('invalid-argument', 'Mensaje demasiado largo (máx. 500 caracteres).');

  // ✅ VALIDACIÓN DE RELEVANCIA
  const relevance = isRelevantQuery(message);
  // ⚠️ THRESHOLD MÁS ESTRICTO: rechazar con confianza > 0.85
  if (!relevance.isRelevant && relevance.confidence > 0.85) {
        // Respuesta inmediata sin llamar a OpenAI
        const outOfScopeReply = "🤔 Esa pregunta está fuera de mi área de expertise en fitness y nutrición. Estoy aquí para ayudarte con:\n\n💪 Entrenamientos y ejercicios\n🥗 Nutrición y alimentación\n📊 Seguimiento de progreso\n💤 Descanso y recuperación\n\n¿En qué puedo ayudarte hoy?";
        
        let sessionId = (data?.sessionId || '').toString();
        if (!sessionId) sessionId = await createChatSession(uid);
        
        await saveMessage(sessionId, 'user', message, uid);
        await saveMessage(sessionId, 'assistant', outOfScopeReply, uid, { 
          responseTime: Date.now() - started 
        });
        
        // Log para análisis (opcional)
        await db.collection('chat_out_of_scope_log').add(removeUndefined({
          userId: uid,
          message,
          reason: relevance.reason,
          timestamp: admin.firestore.Timestamp.now(),
        }));
        
        return {
          sessionId,
          reply: outOfScopeReply,
          type: 'normal',
          responseTimeMs: Date.now() - started,
          wasFallback: false,
          wasFromCache: false,
        };
      }

      // Initialize OpenAI client now that secrets are available
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 7000,
        maxRetries: 1,
      });

      // Rate limiting
      const rl = await checkRateLimit(uid);
      if (!rl.allowed) {
        const seconds = Math.ceil(((rl.nextAllowedMs || 60000) / 1000));
        throw new HttpsError('resource-exhausted', `Has alcanzado el límite. Intenta en ~${seconds} s.`, { nextAllowedMs: rl.nextAllowedMs });
      }

      // Session handling
  let sessionId = (data?.sessionId || '').toString();
      if (!sessionId) sessionId = await createChatSession(uid);

      // Persist user message immediately
      await saveMessage(sessionId, 'user', message, uid);

      // Build context (cached)
      const { summary, wasFromCache } = await buildUserContext(uid);

      // History to include for the model
      const history = await getConversationHistory(sessionId);

      // Prepare timeout/fallback
      const maxMs = CONFIG.MAX_RESPONSE_TIME_MS;
      let usedFallback = false;
      let hadError = false;

      const controller = new AbortController();
      const killer = setTimeout(() => controller.abort(), maxMs);
      let reply = '';
      let tokensUsed: number | undefined = undefined;

      try {
        const result = await Promise.race([
          (async () => {
            const out = await callOpenAI(message, summary, history, openai);
            return out;
          })(),
          (async () => {
            await new Promise((res) => setTimeout(res, maxMs + 200));
            throw new Error('deadline-exceeded');
          })(),
        ]) as { reply: string; tokensUsed?: number };
        reply = result.reply;
        tokensUsed = result.tokensUsed;
      } catch (err: any) {
        hadError = true;
        usedFallback = true;
        const fb = getFallbackResponse(message, summary, err?.message || 'timeout');
        reply = fb.reply;
      } finally {
        clearTimeout(killer);
      }

      const responseTime = Date.now() - started;
      const type = classifyReply(reply);

      // Save assistant message
      await saveMessage(sessionId, 'assistant', reply, uid, { responseTime, tokensUsed });
      await trimRecentMessages(sessionId);

      // Update analytics
      await updateAnalytics(uid, responseTime, tokensUsed, hadError, usedFallback);

      return {
        sessionId,
        reply,
        type,
        tokensUsed,
        responseTimeMs: responseTime,
        wasFallback: usedFallback,
        wasFromCache,
      } satisfies ChatResponsePayload;
    } catch (e: any) {
      console.error('🔴 Error en chat handler:', e);
      // Si ya es HttpsError, lanzarlo directamente
      if (e instanceof HttpsError) {
        throw e;
      }

      // Solo usar códigos válidos de HttpsError
      let errorCode:
        | 'cancelled'
        | 'unknown'
        | 'invalid-argument'
        | 'deadline-exceeded'
        | 'not-found'
        | 'already-exists'
        | 'permission-denied'
        | 'resource-exhausted'
        | 'failed-precondition'
        | 'aborted'
        | 'out-of-range'
        | 'unimplemented'
        | 'internal'
        | 'unavailable'
        | 'data-loss'
        | 'unauthenticated' = 'internal';

      const originalCode = String(e?.code || '');

      // Mapear código numérico 9 de Firestore (FAILED_PRECONDITION)
      if (originalCode === '9' || e?.code === 9) {
        errorCode = 'failed-precondition';
      }
      // Mapear códigos comunes a códigos válidos de HttpsError
      if (originalCode === 'ECONNREFUSED' || originalCode === 'ETIMEDOUT' || originalCode === 'ENOTFOUND') {
        errorCode = 'unavailable';
      } else if (originalCode?.includes('auth') || originalCode === 'unauthenticated') {
        errorCode = 'unauthenticated';
      } else if (originalCode === 'permission-denied' || originalCode === 'PERMISSION_DENIED') {
        errorCode = 'permission-denied';
      } else if (originalCode === 'resource-exhausted' || originalCode === 'RESOURCE_EXHAUSTED') {
        errorCode = 'resource-exhausted';
      } else if (originalCode === 'failed-precondition' || originalCode === 'FAILED_PRECONDITION') {
        errorCode = 'failed-precondition';
      } else if (originalCode === 'deadline-exceeded' || originalCode === 'DEADLINE_EXCEEDED') {
        errorCode = 'deadline-exceeded';
      } else if (originalCode === 'invalid-argument' || originalCode === 'INVALID_ARGUMENT') {
        errorCode = 'invalid-argument';
      } else if (originalCode === 'internal') {
        errorCode = 'internal';
      } else if (originalCode === 'not-found') {
        errorCode = 'not-found';
      } else if (originalCode === 'already-exists') {
        errorCode = 'already-exists';
      } else if (originalCode === 'aborted') {
        errorCode = 'aborted';
      } else if (originalCode === 'unimplemented') {
        errorCode = 'unimplemented';
      } else if (originalCode === 'data-loss') {
        errorCode = 'data-loss';
      } else if (originalCode === 'unknown') {
        errorCode = 'unknown';
      }

      const msg = (e?.message as string) || 'Error interno del servidor';
      throw new HttpsError(errorCode, msg);
    }
  });
