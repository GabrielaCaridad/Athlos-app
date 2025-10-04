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

export const CONFIG = {
  MAX_CONTEXT_MESSAGES: 10,
  CACHE_TTL_MINUTES: 5,
  RATE_LIMIT_HOURLY: 20,
  RATE_LIMIT_DAILY: 100,
  MAX_RESPONSE_TIME_MS: 8000,
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

const SYSTEM_PROMPT = (context: UserContextSummary) => `Eres Apolo, el asistente virtual de ATHLOS, una app de fitness y nutrición. Tu personalidad es:
- Motivador pero realista
- Empático y cercano
- Profesional pero no rígido
- Claro y conciso (máximo 2-3 oraciones)

CONTEXTO DEL USUARIO:
- Calorías hoy: ${context.totalCaloriesToday}/${context.targetCalories} kcal
- Última comida: ${context.lastMeal ? context.lastMeal.name : 'Ninguna'}
- Último entrenamiento: ${context.lastWorkout ? context.lastWorkout.name : 'Ninguno'}
- Esta semana: ${context.weeklyStats.workoutCount} entrenamientos

REGLAS IMPORTANTES:
1. NO diagnostiques enfermedades ni prescribas dietas médicas
2. Si te preguntan sobre patologías, deriva a un profesional
3. Usa los datos del contexto para personalizar tus respuestas
4. Sé breve: máximo 2-3 oraciones
5. Incluye emojis ocasionalmente (1-2 por respuesta)
6. Si no sabes algo, admítelo honestamente
7. Enfócate en motivación, hábitos y progreso gradual`;

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
    doc = snap.data() as RateLimitDoc;
  }

  // Reset hourly window if needed
  if (doc.windowStart.toMillis() !== startOfHour.toMillis()) {
    doc.hourlyCount = 0;
    doc.windowStart = startOfHour;
  }
  // Reset daily if day changed
  if (doc.lastReset.toMillis() !== startOfDay.toMillis()) {
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
  await ref.set(doc, { merge: true });
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
  await db.collection('chat_sessions').doc(sessionId).set(payload);
  return sessionId;
}

async function getConversationHistory(sessionId: string): Promise<ChatMessage[]> {
  const doc = await db.collection('chat_sessions').doc(sessionId).get();
  if (!doc.exists) return [];
  const data = doc.data() as ChatSessionDoc;
  return (data.recentMessages || []).slice(-CONFIG.MAX_CONTEXT_MESSAGES);
}

// Context helper (with caching)
async function buildUserContext(userId: string): Promise<{ summary: UserContextSummary; wasFromCache: boolean }> {
  const cacheRef = db.collection('chat_context_cache').doc(userId);
  const now = admin.firestore.Timestamp.now();
  const snap = await cacheRef.get();
  if (snap.exists) {
    const data = snap.data() as ContextCacheDoc;
    if (data.expiresAt.toMillis() > now.toMillis()) {
      return { summary: data.summary, wasFromCache: true };
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

  const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + CONFIG.CACHE_TTL_MINUTES * 60 * 1000));
  const cacheDoc: ContextCacheDoc = { userId, lastUpdated: now, expiresAt, summary };
  await cacheRef.set(cacheDoc, { merge: true });

  return { summary, wasFromCache: false };
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

async function saveMessage(sessionId: string, role: Role, content: string, userId: string, extras?: Partial<ChatMessage>) {
  const now = admin.firestore.Timestamp.now();
  const msg: ChatMessage = { role, content, timestamp: now, ...extras } as ChatMessage;
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
  const data = snap.data() as ChatSessionDoc;
  const trimmed = (data.recentMessages || []).slice(-CONFIG.MAX_CONTEXT_MESSAGES);
  await ref.set({ recentMessages: trimmed }, { merge: true });
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
    tx.set(ref, {
      date: dateStr,
      totalMessages: newTotal,
      uniqueUsers: Object.keys(users).length,
      avgResponseTime: newAvg,
      openAICallsCount: (current.openAICallsCount || 0) + (usedFallback ? 0 : 1),
      fallbackCount: (current.fallbackCount || 0) + (usedFallback ? 1 : 0),
      errorCount: (current.errorCount || 0) + (hadError ? 1 : 0),
      totalCost: current.totalCost || 0,
      users,
    }, { merge: true });
  });
}

// Main function
export const chat = onCall({ region: CONFIG.REGION, timeoutSeconds: 10, memory: '256MiB', secrets: ['OPENAI_API_KEY'] }, async (request): Promise<ChatResponsePayload> => {
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
