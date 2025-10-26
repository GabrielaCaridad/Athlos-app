import { onCall, HttpsError } from 'firebase-functions/v2/https';
import OpenAI from 'openai';
import * as admin from 'firebase-admin';

// Ensure admin initialized (mirrors chat handler convention)
if (!admin.apps.length) {
  admin.initializeApp();
}

export interface GenerateInsightsRequest {
  dataJSON: string;
  profile: {
    weight: number;
    goal: string;
    experienceLevel: string;
    workoutsPerWeek: number;
  };
}

export interface InsightResponse {
  id: string;
  type: 'pattern' | 'recommendation' | 'achievement';
  confidence: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  evidence: string[];
  actionable: string;
  impactEstimated?: 'low' | 'medium' | 'high';
}

export const generateInsights = onCall({ region: 'us-central1', timeoutSeconds: 60, memory: '512MiB', secrets: ['OPENAI_API_KEY'] }, async (request) => {
  try {
    // 1. Auth required
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Usuario debe estar autenticado');
    }

    const { dataJSON, profile } = (request.data || {}) as GenerateInsightsRequest;

    // 2. Validate payload
    if (!dataJSON || !profile) {
      throw new HttpsError('invalid-argument', 'Se requieren dataJSON y profile');
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'OpenAI API key no configurada');
    }

    const systemPrompt = `Eres un sistema experto de análisis nutricional y de rendimiento deportivo especializado en entrenamiento de FUERZA/HIPERTROFIA (GYM), NO atletas de resistencia.

## PERFIL DEL USUARIO:
- Peso: ${profile.weight}kg
- Objetivo: ${profile.goal}
- Nivel: ${profile.experienceLevel}
- Frecuencia: ${profile.workoutsPerWeek}x/semana

## VALORES CIENTÍFICOS PARA ENTRENAMIENTO DE FUERZA:

### Proteína:
- Óptimo: 1.6-2.0 g/kg/día
- Mínimo efectivo: 1.2 g/kg/día
- Máximo útil: 2.2 g/kg/día

### Carbohidratos:
- Entrenamiento moderado (3-4x/semana, 1h/sesión): 3-5 g/kg/día
- Entrenamiento intenso (5-6x/semana, 1-2h/sesión): 5-7 g/kg/día
- Mínimo funcional: 2-3 g/kg/día

### Calorías:
- Ganancia muscular: +200-400 kcal sobre mantenimiento
- Pérdida de grasa: -300-500 kcal bajo mantenimiento
- Déficit crítico: >500 kcal reduce rendimiento

### Timing:
- Pre-entrenamiento (1-2h antes): 1-2 g/kg carbos + 0.3-0.4 g/kg proteína
- Post-entrenamiento (dentro 2h): 0.8-1.2 g/kg carbos + 0.3-0.5 g/kg proteína

Analiza los datos y genera máximo 6 insights personalizados en formato JSON.

Estructura de cada insight:
{
  "id": "insight_[timestamp]",
  "type": "pattern" | "recommendation" | "achievement",
  "confidence": "high" | "medium" | "low",
  "title": "Título corto (<60 chars)",
  "description": "Explicación con números específicos del usuario (1-2 oraciones)",
  "evidence": ["Punto 1 con datos", "Punto 2 con datos", "Punto 3"],
  "actionable": "Acción concreta HOY (1-2 oraciones)",
  "impactEstimated": "low" | "medium" | "high"
}

REGLAS:
1. Usa SOLO números reales del usuario
2. Contextualiza según objetivo (${profile.goal})
3. Solo insights con impacto medium/high
4. Máximo 6 insights
5. 2-3 puntos de evidencia con números
6. No inventes datos

Responde SOLO con un objeto JSON que tenga la key "insights" con el array.`;

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `DATOS HISTÓRICOS:\n${dataJSON}` }
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices?.[0]?.message?.content || '{"insights": []}';

    let insightsArray: InsightResponse[] = [];
    try {
      const parsed = JSON.parse(content) as { insights?: unknown };
      const maybe = parsed?.insights;
      if (Array.isArray(maybe)) {
        insightsArray = maybe.map((raw: any) => ({
          id: typeof raw.id === 'string' ? raw.id : `insight_${Date.now()}`,
          type: (raw.type === 'pattern' || raw.type === 'recommendation' || raw.type === 'achievement') ? raw.type : 'recommendation',
          confidence: (raw.confidence === 'high' || raw.confidence === 'low') ? raw.confidence : 'medium',
          title: String(raw.title ?? 'Insight'),
          description: String(raw.description ?? ''),
          evidence: Array.isArray(raw.evidence) ? raw.evidence.map((e: any) => String(e)) : [],
          actionable: String(raw.actionable ?? ''),
          impactEstimated: (raw.impactEstimated === 'high' || raw.impactEstimated === 'low') ? raw.impactEstimated : 'medium',
        }));
      }
    } catch (e) {
      console.warn('No se pudo parsear la respuesta JSON de OpenAI:', e);
      throw new HttpsError('internal', 'Respuesta inválida de OpenAI');
    }

    console.log(`✅ Generados ${insightsArray.length} insights para usuario ${request.auth.uid}`);

    return {
      success: true,
      insights: insightsArray,
      count: insightsArray.length,
      userId: request.auth.uid,
    };
  } catch (error: any) {
    console.error('Error generando insights:', error);
    if (error?.code && typeof error.code === 'string') {
      // Already an HttpsError
      throw error;
    }
    throw new HttpsError('internal', 'Error al generar insights con OpenAI');
  }
});
