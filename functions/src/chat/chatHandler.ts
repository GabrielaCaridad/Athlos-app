// Chat de Apolo
// Usa: chat_sessions, chat_apolo, chat_context_cache, foodDatabase (YYYY-MM-DD UTC), workouts, users.


import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
if (!admin.apps.length) { admin.initializeApp(); }

const db = admin.firestore();

/**
 * Elimina undefined de forma recursiva (Firestore no admite undefined)
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
 * Convierte cualquier fecha a Timestamp de Firestore
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
  // Si es un número (ms)
  if (typeof value === 'number') {
    return admin.firestore.Timestamp.fromMillis(value);
  }
  // Si es un string ISO
  if (typeof value === 'string') {
    const d = new Date(value);
    return admin.firestore.Timestamp.fromDate(d);
  }
  // Si viene serializado con _seconds/_nanoseconds
  if (typeof value === 'object' && value._seconds !== undefined) {
    return new admin.firestore.Timestamp(value._seconds, value._nanoseconds || 0);
  }
  // Por defecto: ahora
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


// Umbrales bajos para activar modo personalizado (demo)
const HISTORY_THRESHOLDS: { mealDays7d: number; workouts14d: number; logic: 'OR' | 'AND' } = {
  mealDays7d: 3,       // antes 7
  workouts14d: 2,      // antes 5
  logic: 'OR'          // 'OR' = basta cumplir uno; 'AND' = ambos
};


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
  windowStart: FirebaseFirestore.Timestamp;
  lastReset: FirebaseFirestore.Timestamp;
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
    when: string;
  };
  lastWorkout: null | {
    name: string;
    duration: number; 
    when: string; 
    performanceScore?: number;
  };
  weeklyStats: {
    workoutCount: number;
    totalCalories: number; 
  };
  // Insights personales
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

// const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));


// Conteos mínimos para decidir el modo
interface HistoryUsageSummary {
  daysWithMeals7d: number;
  totalMeals7d: number;
  totalWorkouts14d: number;
  daysWithWorkouts14d: number;
}

// Umbral flexible: activa personalizado si cumple comidas o entrenos (según lógica)
function hasSufficientHistory(s: HistoryUsageSummary): boolean {
  const tieneComidas = s.daysWithMeals7d >= HISTORY_THRESHOLDS.mealDays7d;   // días con comidas 
  const tieneEntrenos = s.totalWorkouts14d >= HISTORY_THRESHOLDS.workouts14d; // entrenos finalizados 

  const pasa = HISTORY_THRESHOLDS.logic === 'AND'
    ? (tieneComidas && tieneEntrenos)
    : (tieneComidas || tieneEntrenos);

  // Log simple para validar en consola de Functions
  console.log(JSON.stringify({
    event: 'history-threshold-check',
    s, thresholds: HISTORY_THRESHOLDS, pasa
  }));

  return pasa;
}

function asUTCDate(x: any): Date | null {
  if (!x) return null;
  try {
    if (x?.toDate && typeof x.toDate === 'function') return new Date(x.toDate().toISOString());
    if (x?._seconds !== undefined) return new Date((x._seconds * 1000));
    if (x instanceof Date) return new Date(x.toISOString());
    if (typeof x === 'string') {
      const d = new Date(x);
      return isNaN(d.getTime()) ? null : new Date(d.toISOString());
    }
    if (typeof x === 'number') return new Date(new Date(x).toISOString());
  } catch {
    return null;
  }
  return null;
}

// Clave de fecha UTC (YYYY-MM-DD) para alinear con 'foodDatabase'
function toUTCDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function computeUserSummary(userId: string): Promise<HistoryUsageSummary> {
  const now = new Date();
  const startMeals = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  startMeals.setUTCDate(startMeals.getUTCDate() - 6); // inclusive last 7 days (today + previous 6)
  const startWorkouts = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  startWorkouts.setUTCDate(startWorkouts.getUTCDate() - 13); //  14 days

  
  const mealsSnap = await db.collection('foodDatabase')
    .where('userId', '==', userId)
    .where('date', '>=', startMeals.toISOString().slice(0,10))
    .where('date', '<=', new Date().toISOString().slice(0,10))
    .get();
  const mealDocs = mealsSnap.docs.map(d => d.data());
  const totalMeals7d = mealDocs.length;
  const daysMealsSet = new Set<string>();
  for (const m of mealDocs) {
    if (typeof (m as any).date === 'string') daysMealsSet.add((m as any).date);
  }
  const daysWithMeals7d = daysMealsSet.size;


  const workoutsSnap = await db.collection('workouts')
    .where('userId', '==', userId)
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startWorkouts)) 
    .get();
  const workoutDocs = workoutsSnap.docs.map(d => d.data());
  let totalWorkouts14d = 0;
  const workoutDaySet = new Set<string>();
  for (const w of workoutDocs) {
    const isActive = (w as any).isActive;
    const completedAt = asUTCDate((w as any).completedAt) || null;
    const createdAt = asUTCDate((w as any).createdAt) || null;
    const effective = completedAt || createdAt;
    if (!effective) continue;
    if (effective < startWorkouts || effective > now) continue;
    if (isActive === false || completedAt) {
      totalWorkouts14d += 1;
      workoutDaySet.add(effective.toISOString().slice(0,10));
    }
  }
  const daysWithWorkouts14d = workoutDaySet.size;
  return { daysWithMeals7d, totalMeals7d, totalWorkouts14d, daysWithWorkouts14d };
}

function buildSystemPrompt(mode: 'general' | 'personalized', dailyContext: UserContextSummary, historySummary?: HistoryUsageSummary): string {
  // Modo general: se mantiene sin contexto personalizado
  if (mode === 'general') {
    return `Eres Apolo, entrenador personal de ATHLOS.
REGLAS:
- Aún no cuento con suficientes registros tuyos para personalizar; usaré pautas generales.
- No infieras acciones del usuario ("no has comido", "no registraste", etc.).
- NO uses frases como "según tus registros" o "he visto que".
- Da recomendaciones generales (pre-entreno, hidratación, post-entreno) sin referirte a "tus registros".
- Responde con máximo 3-4 oraciones, tono motivador y claro.
- Evita diagnósticos médicos.`;
  }

  // Modo personalizado: usar historial e insights del usuario
  const insights = dailyContext.personalInsights || [];
  let insightsSection = '';

  if (insights.length > 0) {
    insightsSection =
      `\n\nPATRONES PERSONALES IDENTIFICADOS (úsalos en tus respuestas):`;
    insights.forEach((ins, idx) => {
      insightsSection +=
        `\n${idx + 1}. ${ins.title}` +
        `\n- Qué detecté: ${ins.description}` +
        `\n- Evidencia clave: ${ins.keyEvidence}` +
        `\n- Recomendación: ${ins.actionable}`;
    });
  }

  const hist = historySummary
    ? `\n\nHISTORIAL AGREGADO (usa solo estos datos):` +
      `\n- Días con comidas (últimos 7d): ${historySummary.daysWithMeals7d}` +
      `\n- Total comidas (últimos 7d): ${historySummary.totalMeals7d}` +
      `\n- Días con entrenos (últimos 14d): ${historySummary.daysWithWorkouts14d}` +
      `\n- Total entrenos (últimos 14d): ${historySummary.totalWorkouts14d}`
    : '';

  // Construir sección explícita de resumen del usuario si hay datos disponibles
  let userContextSection = '';
  const hasAnyContext =
    (typeof dailyContext.totalCaloriesToday === 'number' &&
      dailyContext.totalCaloriesToday > 0) ||
    (typeof dailyContext.targetCalories === 'number' &&
      dailyContext.targetCalories > 0) ||
    !!dailyContext.lastMeal ||
    !!dailyContext.lastWorkout ||
    (dailyContext.weeklyStats &&
      (dailyContext.weeklyStats.workoutCount > 0 ||
        dailyContext.weeklyStats.totalCalories > 0));

  if (hasAnyContext) {
    const parts: string[] = [];

    if (typeof dailyContext.totalCaloriesToday === 'number') {
      if (
        typeof dailyContext.targetCalories === 'number' &&
        dailyContext.targetCalories > 0
      ) {
        parts.push(
          `• Calorías de hoy: ${dailyContext.totalCaloriesToday}/${dailyContext.targetCalories} kcal`
        );
      } else {
        parts.push(
          `• Calorías de hoy: ${dailyContext.totalCaloriesToday} kcal`
        );
      }
    }

    if (dailyContext.lastMeal) {
      parts.push(
        `• Última comida: ${dailyContext.lastMeal.name} (${dailyContext.lastMeal.calories} kcal) en ${dailyContext.lastMeal.when}`
      );
    }

    if (dailyContext.lastWorkout) {
      const score =
        dailyContext.lastWorkout.performanceScore != null
          ? `, score ${dailyContext.lastWorkout.performanceScore}`
          : '';
      parts.push(
        `• Último entrenamiento: ${dailyContext.lastWorkout.name} (${dailyContext.lastWorkout.duration}s${score}) en ${dailyContext.lastWorkout.when}`
      );
    }

    if (dailyContext.weeklyStats) {
      parts.push(
        `• Semana: ${dailyContext.weeklyStats.workoutCount} entrenos finalizados; ${dailyContext.weeklyStats.totalCalories} kcal registradas`
      );
    }

    userContextSection =
      `\n\nA continuación tienes un resumen del contexto del usuario basado en sus registros recientes. ` +
      `Úsalo para adaptar tus respuestas, evitando inferencias no soportadas por estos datos:\n` +
      parts.join('\n');
  }

  return (
    `Eres Apolo, el entrenador personal de ATHLOS. Tu tono: motivador, empático y claro (máx. 3-4 oraciones).\n\n` +
    `INSTRUCCIONES CRÍTICAS (PERSONALIZADO):\n` +
    `- Usa ÚNICAMENTE las métricas agregadas y el resumen provistos abajo; no inventes ni infieras comidas del día si no están en el contexto.\n` +
    `- Siempre que existan datos numéricos del contexto (p. ej., kcal de hoy, objetivo calórico, última comida, último entrenamiento, estadísticas semanales), menciónalos explícitamente en tu respuesta con sus valores exactos. Ej.: "hoy llevas X kcal de un objetivo de Y kcal".\n` +
    `- Si los datos son insuficientes o faltan (p. ej., pocos días registrados o secciones vacías), dilo explícitamente al inicio y aclara que la recomendación será general. No inventes cifras ni supongas valores.\n` +
    `- Prioriza los datos más útiles al usuario (kcal de hoy/objetivo, última comida/entreno) para evitar respuestas largas; mantén 3–4 oraciones.\n` +
    `- No menciones registros inexistentes ni "hoy" si no está provisto.\n` +
    `- No diagnostiques ni prescribas.\n` +
    `${hist}${userContextSection}${insightsSection}`
  );
}

// Plantilla general sin frases personalizadas ni referencias a registros
function generalStaticTemplate(): string {
  // Por qué: evita “personalizar” cuando falta historial suficiente
  return `⚠️ Aún no cuento con suficientes registros tuyos para personalizar; usaré pautas generales.\n• Pre-entreno (60–90 min): carbohidratos fáciles de digerir + algo de proteína (p. ej., yogur con avena; fruta + frutos secos).\n• Hidratación: 5–7 ml/kg ~4 h antes; sorbos durante el ejercicio según sed.\n• Post-entreno (≤2 h): 20–40 g de proteína + carbohidratos para reponer.\nRegistra al menos 7 días de comidas y 5 entrenamientos finalizados para activar recomendaciones personalizadas.`;
}

function sanitizeGeneralPayload(systemPrompt: string, history: ChatMessage[]): { systemPrompt: string; history: ChatMessage[]; sanitized: boolean } {
  // Limpia historial y líneas personalizadas en modo general
  const forbiddenPatterns = [
    /calor[ií]as/i,
    /[úu]ltima comida/i,
    /[úu]ltimo entrenamiento/i,
    /hoy/i,
    /lastMeal|lastWorkout|todayMeals|recentMeals|recentWorkouts|todayEnergy/i
  ];
  const cleanLines = (systemPrompt || '').split(/\r?\n/).filter(line => !forbiddenPatterns.some(re => re.test(line)));
  return { systemPrompt: cleanLines.join('\n'), history: [], sanitized: true };
}

// Limitador de solicitudes
async function checkRateLimit(userId: string) {
  // Aplica conteo por hora/día; crea doc si falta
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

  // Reset por hora si cambió la ventana
  if (toFirestoreTimestamp(doc.windowStart).toMillis() !== startOfHour.toMillis()) {
    doc.hourlyCount = 0;
    doc.windowStart = startOfHour;
  }
  // Reset diario si cambió el día
  if (toFirestoreTimestamp(doc.lastReset).toMillis() !== startOfDay.toMillis()) {
    doc.dailyCount = 0;
    doc.lastReset = startOfDay;
  }

  const wouldExceedHour = doc.hourlyCount + 1 > CONFIG.RATE_LIMIT_HOURLY;
  const wouldExceedDay = doc.dailyCount + 1 > CONFIG.RATE_LIMIT_DAILY;
  const limited = wouldExceedHour || wouldExceedDay || doc.isBlocked;

  if (limited) {
    // Calcular tiempo hasta el próximo permiso
    const nextHour = new Date(startOfHour.toDate().getTime() + 60 * 60 * 1000);
    const msToHour = nextHour.getTime() - Date.now();
    const nextDay = new Date(startOfDay.toDate().getTime() + 24 * 60 * 60 * 1000);
    const msToDay = nextDay.getTime() - Date.now();
    const nextAllowedMs = wouldExceedHour ? msToHour : msToDay;
    return { allowed: false, nextAllowedMs: nextAllowedMs };
  }

  // Incrementar y guardar
  doc.hourlyCount += 1;
  doc.dailyCount += 1;
  await ref.set(removeUndefined(doc), { merge: true });
  return { allowed: true };
}

async function createChatSession(userId: string): Promise<string> {
  // Crea sesión con historial reciente vacío
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
  // Devuelve historial compacto (recentMessages)
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

// Contexto con caché y versión
async function buildUserContext(userId: string): Promise<{ summary: UserContextSummary; wasFromCache: boolean; userDataVersion: string }> {
  // Calcula versión de datos para invalidar caché cuando haya cambios
  let dailyCalorieTarget: number | undefined = undefined;
  let profileUpdatedMs = 0;
  try {
    const profileSnap = await db.collection('users').doc(userId).get();
    if (profileSnap.exists) {
      const up = (profileSnap.data() as any)?.updatedAt;
      const d = asUTCDate(up);
      if (d) profileUpdatedMs = d.getTime();
      const maybeTarget = (profileSnap.data() as any)?.dailyCalorieTarget;
      if (typeof maybeTarget === 'number' && isFinite(maybeTarget) && maybeTarget > 0) {
        dailyCalorieTarget = Math.round(maybeTarget);
      }
    }
  } catch {/* ignore */}
  let lastMealMs = 0;
  try {
    const lastMealSnap = await db.collection('foodDatabase')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    const lm = lastMealSnap.docs[0]?.data();
    if (lm) {
      const d = asUTCDate((lm as any).createdAt);
      if (d) lastMealMs = d.getTime();
    }
  } catch {/* ignore */}
  let lastWorkoutMs = 0;
  try {
    const lastWorkoutSnap = await db.collection('workouts')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(5) 
      .get();
    for (const doc of lastWorkoutSnap.docs) {
      const w = doc.data();
      const completedAt = asUTCDate((w as any).completedAt);
      const createdAt = asUTCDate((w as any).createdAt);
      const eff = completedAt || createdAt;
      if (eff) {
        lastWorkoutMs = Math.max(lastWorkoutMs, eff.getTime());
      }
    }
  } catch {/* ignore */}
  const versionMs = Math.max(profileUpdatedMs, lastMealMs, lastWorkoutMs);
  const userDataVersion = versionMs > 0 ? String(versionMs) : '0';
  const cacheDocId = `${userId}:${userDataVersion}`;
  const cacheRef = db.collection('chat_context_cache').doc(cacheDocId);
  const nowTs = admin.firestore.Timestamp.now();
  const cacheSnap = await cacheRef.get();
  if (cacheSnap.exists) {
    const raw = cacheSnap.data() as any;
    const expiresAt = toTimestamp(raw.expiresAt);
    if (expiresAt.toMillis() > nowTs.toMillis()) {
      return { summary: raw.summary as UserContextSummary, wasFromCache: true, userDataVersion };
    }
  }

  // Si no hay caché válido, reconstruir contexto
  const todayStr = toUTCDateKey(new Date());
  // Comidas de hoy desde 'foodDatabase'
  const foodsSnap = await db.collection('foodDatabase')
    .where('userId', '==', userId)
    .where('date', '==', todayStr)
    .orderBy('createdAt', 'desc')
    .get();
  // Suma kcal del día y arma última comida
  const foods = foodsSnap.docs.map(d => d.data());
  const totalCaloriesToday = foods.reduce((sum, f: any) => sum + Number((f as any).calories || 0), 0);
  const lastMeal = foods[0] ? {
    name: foods[0].name as string,
    calories: foods[0].calories as number,
    when: new Date((foods[0].createdAt as FirebaseFirestore.Timestamp)?.toDate?.() || Date.now()).toISOString(),
  } : null;

  // Último entreno (createdAt desc)
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

  // Semana: entrenos finalizados últimos 7 días
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekSnap = await db.collection('workouts')
    .where('userId', '==', userId)
    .where('completedAt', '>=', admin.firestore.Timestamp.fromDate(weekAgo))
    .where('isActive', '==', false)
    .get();
  const workoutCount = weekSnap.docs.length;

  // Semana: suma de calorías últimos 7 días
  const foodsWeekSnap = await db.collection('foodDatabase')
    .where('userId', '==', userId)
    .where('date', '>=', toUTCDateKey(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
    .get();
  const totalWeekCalories = foodsWeekSnap.docs.reduce((sum, d) => sum + Number(((d.data() as any).calories || 0)), 0);

  // Objetivo calórico del perfil si existe; si no, 0
  const targetCalories = typeof dailyCalorieTarget === 'number' ? dailyCalorieTarget : 0;

  const summary: UserContextSummary = {
    totalCaloriesToday,
    targetCalories,
    lastMeal,
    lastWorkout,
    weeklyStats: { workoutCount, totalCalories: totalWeekCalories },
  };

  let personalInsights: UserContextSummary['personalInsights'] = undefined;
  try {
    // Insights precalculados desde Firestore (si existen)
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
    // No bloquea el flujo si falla
  }
  if (personalInsights) {
    summary.personalInsights = personalInsights;
  }

  const cleanedSummary = removeUndefined(summary) as UserContextSummary;

  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + CONFIG.CACHE_TTL_MINUTES * 60 * 1000));
  const zeroSummary = cleanedSummary.totalCaloriesToday === 0 && !cleanedSummary.lastMeal && !cleanedSummary.lastWorkout && cleanedSummary.weeklyStats.workoutCount === 0;
  if (!zeroSummary) {
    const cacheDoc: ContextCacheDoc = { userId, lastUpdated: nowTs, expiresAt, summary: cleanedSummary };
    await cacheRef.set(removeUndefined(cacheDoc), { merge: true });
  }
  return { summary: cleanedSummary, wasFromCache: false, userDataVersion };
}

async function callOpenAI(message: string, systemPrompt: string, history: ChatMessage[], openai: OpenAI): Promise<{ reply: string; tokensUsed?: number }> {
  const sysPrompt = systemPrompt;
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

function getFallbackResponse(message: string, context: UserContextSummary, reason: string, mode: 'general' | 'personalized'): { reply: string; type: 'normal' | 'recommendation' | 'achievement' } {
  // Fallback simple y sensible al contexto
  let base: string;
  if (mode === 'general') {
    base = `Estoy teniendo problemas para responder ahora (${reason}). Aún usaré pautas generales (registros insuficientes).`;
  } else {
    const hasTarget = typeof context.targetCalories === 'number' && context.targetCalories > 0;
    const cal = hasTarget ? `${context.totalCaloriesToday}/${context.targetCalories}` : `${context.totalCaloriesToday}`;
    base = `Estoy teniendo problemas para responder ahora (${reason}). Hoy llevas ${cal} kcal.`;
    if (context.lastWorkout) base += ` Buen progreso con tu entrenamiento "${context.lastWorkout.name}" 💪`;
  }
  const type: 'normal' | 'recommendation' = message.toLowerCase().includes('comer') || message.toLowerCase().includes('comida') ? 'recommendation' : 'normal';
  return { reply: `${base} Intenta una pregunta concreta y breve.`, type };
}

// Lista de palabras clave válidas
//  Solo responder sobre estos temas
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

// Palabras clave prohibidas (rechazar)
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

// Frases completas prohibidas
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
  
  // Nivel 1: frases completas prohibidas
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
  
  // Nivel 2: palabras fuera de alcance
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
  
  // Nivel 3: mensajes muy cortos (saludos)
  if (message.length < 15) {
    const greetings = ['hola', 'hey', 'buenas', 'hello', 'hi', 'buenos', 'saludos', 'que tal', 'qué tal'];
    const isGreeting = greetings.some(g => lower.includes(g));
    
    if (isGreeting) {
      return { isRelevant: true, confidence: 0.9 };
    }
    
    // Muy corto pero no saludo: baja confianza
    return { isRelevant: true, confidence: 0.4 };
  }
  
  // Nivel 4: buscar palabras clave válidas
  const foundRelevant: string[] = [];
  for (const keyword of FITNESS_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) {
      foundRelevant.push(keyword);
    }
  }
  
  // 2+ keywords válidas → alta relevancia
  if (foundRelevant.length >= 2) {
    console.log(`✅ Approved by keywords (${foundRelevant.length}): ${foundRelevant.slice(0, 3).join(', ')}`);
    return { isRelevant: true, confidence: 0.95 };
  }
  
  // 1 keyword válida → probable relevancia
  if (foundRelevant.length === 1) {
    console.log(`✅ Approved by keyword: ${foundRelevant[0]}`);
    return { isRelevant: true, confidence: 0.85 };
  }
  
  // Nivel 5: preguntas genéricas sobre la app
  const appRelated = [
    'athlos', 'apolo', 'app', 'aplicación', 'registrar', 'guardar',
    'borrar', 'eliminar', 'modificar', 'como funciona', 'ayuda',
    'configuración', 'perfil', 'cuenta', 'usuario'
  ];
  
  if (appRelated.some(term => lower.includes(term))) {
    return { isRelevant: true, confidence: 0.7 };
  }
  
  // Nivel 6: sin keywords válidas y >20 chars → probablemente fuera de scope
  if (message.length > 20 && foundRelevant.length === 0) {
    console.log(`⚠️ Suspicious query (no fitness keywords, long): "${message}"`);
    return { 
      isRelevant: true, 
      confidence: 0.2,
      reason: 'no_fitness_keywords_found'
    };
  }
  
  // Por defecto: permitir con confianza media-baja
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
      totalCost: 0,
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


// Función callable principal
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

      // Manejo de sesión
  let sessionId = (data?.sessionId || '').toString();
      if (!sessionId) sessionId = await createChatSession(uid);

      // Guardar mensaje del usuario al instante
      await saveMessage(sessionId, 'user', message, uid);

      const { summary, wasFromCache, userDataVersion } = await buildUserContext(uid);

      const historySummary = await computeUserSummary(uid);
      const mode: 'general' | 'personalized' = hasSufficientHistory(historySummary) ? 'personalized' : 'general';

      if (mode === 'general') {
        (summary as any).totalCaloriesToday = undefined;
        (summary as any).lastMeal = undefined;
        (summary as any).lastWorkout = undefined;
      }

      const generalBypass = mode === 'general';
      let payloadSanitized = false;

      if (!mode) {
        console.log(JSON.stringify({ event: 'assistant-mode', userId: uid, mode: 'unset', cacheHit: wasFromCache, userDataVersion, generalBypass: false, traceId: String(Date.now()) }));
        throw new HttpsError('failed-precondition', 'assistant mode not set');
      }
  console.log(JSON.stringify({ event: 'assistant-mode', userId: uid, mode, cacheHit: wasFromCache, userDataVersion, generalBypass, payloadSanitized, traceId: String(Date.now()) }));

      const systemPrompt = buildSystemPrompt(mode, summary, mode === 'personalized' ? historySummary : undefined);

      if (generalBypass) {
        const sanitized = sanitizeGeneralPayload(systemPrompt, await getConversationHistory(sessionId));
        payloadSanitized = sanitized.sanitized;
      }

  // Historial a incluir para el modelo
      const history = await getConversationHistory(sessionId);

      // Preparar timeout/fallback
      const maxMs = CONFIG.MAX_RESPONSE_TIME_MS;
      let usedFallback = false;
      let hadError = false;

      const controller = new AbortController();
      const killer = setTimeout(() => controller.abort(), maxMs);
      let reply = '';
      let tokensUsed: number | undefined = undefined;

      try {
        if (generalBypass) {
          reply = generalStaticTemplate();
          tokensUsed = 0;
        } else {
          const result = await Promise.race([
            (async () => {
              if (generalBypass) {
                throw new Error('GENERAL_MODE_CALL_GUARD');
              }
              const out = await callOpenAI(message, systemPrompt, history, openai);
              return out;
            })(),
            (async () => {
              await new Promise((res) => setTimeout(res, maxMs + 200));
              throw new Error('deadline-exceeded');
            })(),
          ]) as { reply: string; tokensUsed?: number };
          reply = result.reply;
          tokensUsed = result.tokensUsed;
        }
      } catch (err: any) {
        hadError = true;
        usedFallback = true;
        const fb = getFallbackResponse(message, summary, err?.message || 'timeout', mode);
        reply = fb.reply;
      } finally {
        clearTimeout(killer);
      }

      const responseTime = Date.now() - started;
      const type = classifyReply(reply);

      try {
        const logLine = {
          event: 'assistant-mode',
          userId: uid,
          mode,
          daysWithMeals7d: historySummary.daysWithMeals7d,
          totalMeals7d: historySummary.totalMeals7d,
          totalWorkouts14d: historySummary.totalWorkouts14d,
          daysWithWorkouts14d: historySummary.daysWithWorkouts14d,
          cacheHit: wasFromCache,
          userDataVersion,
          generalBypass,
          payloadSanitized,
          traceId: String(Date.now())
        };
        console.log(JSON.stringify(logLine));
      } catch {/* ignore logging errors */}

      await saveMessage(sessionId, 'assistant', reply, uid, { responseTime, tokensUsed });
      await trimRecentMessages(sessionId);

      // Actualizar analíticas
      await updateAnalytics(uid, responseTime, tokensUsed, hadError, usedFallback);

      const payload = {
        sessionId,
        reply,
        type,
        tokensUsed,
        responseTimeMs: responseTime,
        wasFallback: usedFallback,
        wasFromCache,
      } satisfies ChatResponsePayload;

      // Checklist OK (A-E):
      // A) Modo general: disclaimer y sin frases personalizadas (forzado por prompt)
      // B) Modo personalizado incluye métricas agregadas de historySummary en el prompt del sistema
      // C) userDataVersion en la clave de caché asegura invalidación con nuevos datos
      // D) El frontend normaliza fechas de comidas y completado de entrenos (ver archivos relacionados)
      // E) UI sin cambios (solo ajustado el texto del backend)
      return payload;
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
