import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2/options';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';

// Ensure admin is initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export const ANALISIS_CONFIG = {
  REGION: 'us-central1' as const,
  MODEL: 'gpt-4o-mini',
  MAX_TOKENS: 300,
  TEMPERATURE: 0.6,
};

setGlobalOptions({ maxInstances: 10 });

type WeeklyContext = {
  userId: string;
  semanaTag: string; // e.g. 2025-W09
  rango: { inicioISO: string; finISO: string };
  resumen: {
    caloriasPromedio: number;
    comidasRegistradas: number;
    entrenamientos: number;
    energiaPromedio: number | null;
  };
  insights?: Array<{
    title: string;
    description?: string;
    evidence?: string;
    actionable?: string;
  }>;
};

function startOfWeek(d: Date) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day; // ISO week starts Monday
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function isoWeekTag(date: Date) {
  // Clone to UTC midnight
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Set to nearest Thursday
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const weekStr = String(weekNo).padStart(2, '0');
  return `${d.getUTCFullYear()}-W${weekStr}`;
}

async function buildWeeklyContext(userId: string): Promise<WeeklyContext> {
  const now = new Date();
  const start = startOfWeek(now);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);

  const semanaTag = isoWeekTag(now);
  const inicioISO = start.toISOString();
  const finISO = end.toISOString();

  // Foods in last 7 days (by date string >= start date)
  const startDateStr = inicioISO.split('T')[0];
  const foodsSnap = await db.collection('userFoodEntries')
    .where('userId', '==', userId)
    .where('date', '>=', startDateStr)
    .get();

  let totalCalories = 0;
  let mealCount = 0;
  for (const doc of foodsSnap.docs) {
    const data = doc.data() as any;
    totalCalories += Number(data.calories || 0);
    mealCount += 1;
  }

  // Workouts in the last week
  const workoutsSnap = await db.collection('workouts')
    .where('userId', '==', userId)
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(start))
    .get();

  let entrenamientos = 0;
  let energiaSuma = 0;
  let energiaCount = 0;
  for (const doc of workoutsSnap.docs) {
    const w = doc.data() as any;
    entrenamientos += 1;
    const energia = Number(w.postEnergyLevel || 0);
    if (energia > 0) {
      energiaSuma += energia;
      energiaCount += 1;
    }
  }

  const energiaPromedio = energiaCount > 0 ? Math.round((energiaSuma / energiaCount) * 10) / 10 : null;
  const caloriasPromedio = mealCount > 0 ? Math.round((totalCalories / 7) /* per day */) : 0;

  // Insights
  let insights: WeeklyContext['insights'] = undefined;
  try {
    const ins = await db.collection('user_insights').doc(userId).get();
    if (ins.exists) {
      const d = ins.data() as any;
      if (Array.isArray(d?.insights)) {
        insights = (d.insights as any[]).slice(0, 3).map((i: any) => ({
          title: String(i.title || ''),
          description: i.description,
          evidence: Array.isArray(i.evidence) ? String(i.evidence[0] || '') : undefined,
          actionable: i.actionable,
        }));
      }
    }
  } catch (e) {
    console.warn('Insights load failed (non-blocking):', e);
  }

  return {
    userId,
    semanaTag,
    rango: { inicioISO, finISO },
    resumen: {
      caloriasPromedio,
      comidasRegistradas: mealCount,
      entrenamientos,
      energiaPromedio,
    },
    insights,
  };
}

function weeklySystemPrompt(ctx: WeeklyContext) {
  const ins = (ctx.insights || []).map((i, idx) => `- ${idx + 1}. ${i.title}${i.actionable ? ` → ${i.actionable}` : ''}${i.evidence ? ` (evidencia: ${i.evidence})` : ''}`).join('\n');
  return `Eres Apolo, el entrenador AI de ATHLOS. Genera un mensaje breve (máx. 6 oraciones) y claro para el usuario RESUMIENDO su semana. Estilo: motivador, profesional, cercano, con 1 emoji si encaja.

Semana ${ctx.semanaTag} (${ctx.rango.inicioISO.slice(0,10)} a ${ctx.rango.finISO.slice(0,10)}):
- Entrenamientos: ${ctx.resumen.entrenamientos}
- Energía promedio post-entreno: ${ctx.resumen.energiaPromedio ?? 'N/D'}/10
- Calorías promedio diarias (estimado): ${ctx.resumen.caloriasPromedio} kcal
- Comidas registradas: ${ctx.resumen.comidasRegistradas}

Patrones/insights relevantes:
${ins || '- (sin insights relevantes esta semana)'}

Instrucciones:
1) Personaliza con los datos anteriores. 2) Si detectas señales críticas (0 entrenos por 2ª semana, energía <5, adherencia nula), abre con una alerta amable. 3) Cierra con una pregunta o llamada a la acción concreta.`;
}

async function generateWeeklyMessage(ctx: WeeklyContext, openai: OpenAI): Promise<{ content: string; problemasCriticos: string[] }> {
  const prompt = weeklySystemPrompt(ctx);
  const completion = await openai.chat.completions.create({
    model: ANALISIS_CONFIG.MODEL,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Genera el mensaje semanal proactivo.' },
    ],
    max_tokens: ANALISIS_CONFIG.MAX_TOKENS,
    temperature: ANALISIS_CONFIG.TEMPERATURE,
  });
  const content = completion.choices?.[0]?.message?.content?.trim() || 'Tu resumen semanal está listo.';

  const criticos: string[] = [];
  if (ctx.resumen.entrenamientos === 0) criticos.push('sin_entrenamientos');
  if ((ctx.resumen.energiaPromedio ?? 10) < 5) criticos.push('energia_baja');
  if (ctx.resumen.comidasRegistradas < 5) criticos.push('baja_adherencia_registros');

  return { content, problemasCriticos: criticos };
}

async function alreadyGenerated(userId: string, semanaTag: string) {
  const snap = await db.collection('chat_apolo')
    .where('userId', '==', userId)
    .where('semana', '==', semanaTag)
    .where('esProactivo', '==', true)
    .limit(1)
    .get();
  return !snap.empty;
}

async function persistProactiveMessage(userId: string, semana: string, content: string, ctx: WeeklyContext, problemasCriticos: string[]) {
  const payload = {
    userId,
    content,
    esProactivo: true,
    leido: false,
    semana,
    createdAt: admin.firestore.Timestamp.now(),
    contextoAnalisis: {
      caloriasPromedio: ctx.resumen.caloriasPromedio,
      entrenamientos: ctx.resumen.entrenamientos,
      energiaPromedio: ctx.resumen.energiaPromedio ?? null,
      problemasCriticos,
    },
  };
  await db.collection('chat_apolo').add(payload);
}

export const analisisSemanalGenerar = onCall({ region: ANALISIS_CONFIG.REGION, timeoutSeconds: 30, memory: '512MiB', secrets: ['OPENAI_API_KEY'] }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const ctx = await buildWeeklyContext(uid);
  if (await alreadyGenerated(uid, ctx.semanaTag)) {
    return { status: 'exists', semana: ctx.semanaTag };
  }
  const { content, problemasCriticos } = await generateWeeklyMessage(ctx, openai);
  await persistProactiveMessage(uid, ctx.semanaTag, content, ctx, problemasCriticos);
  return { status: 'ok', semana: ctx.semanaTag };
});

export const analisisSemanalProgramado = onSchedule({
  schedule: 'every monday 08:00',
  timeZone: 'America/Mexico_City',
}, async (_event) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  // Fetch a batch of users (basic implementation)
  const usersSnap = await db.collection('users').limit(100).get();
  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data() as { userId?: string } | undefined;
    const userId = data?.userId;
    if (!userId) {
      console.warn('Skipping user without userId field in users doc:', userDoc.id);
      continue;
    }
    try {
      const ctx = await buildWeeklyContext(userId);
      if (await alreadyGenerated(userId, ctx.semanaTag)) continue;
      const { content, problemasCriticos } = await generateWeeklyMessage(ctx, openai);
      await persistProactiveMessage(userId, ctx.semanaTag, content, ctx, problemasCriticos);
    } catch (e) {
      console.error('Weekly generation failed for user', userId, e);
    }
  }
  // no return needed
});
