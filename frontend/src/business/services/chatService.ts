
export interface UserData {
  foods?: Array<{ name: string; calories?: number }>;
  workouts?: Array<{ name: string; caloriesBurned?: number }>;
  wellness?: Array<{ date: string; mood: number }>;
  totalCaloriesToday?: number;
  lastWorkout?: { name: string } | undefined;
  nextWorkout?: { name: string } | undefined;
}

export interface ContextualResponse {
  message: string;
  type: 'recommendation' | 'achievement' | 'normal';
}

const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;

function getFallbackResponse(_prompt: string, userData: UserData): ContextualResponse {
  const summary = `Hoy: ${userData.totalCaloriesToday ?? 'N/A'} kcal. Último entrenamiento: ${userData.lastWorkout?.name ?? 'N/A'}. Alimentos recientes: ${(userData.foods || []).slice(0,3).map(f=>f.name).join(', ') || 'N/A'}`;
  return {
    message: `Apolo está temporalmente sin conexión a AI. Resumen de contexto: ${summary}. Puedo ayudarte con consejos generales: mantener un déficit/ayuste calórico, priorizar el descanso y la progresión gradual en entrenamiento.`,
    type: 'normal'
  };
}

export async function getContextualResponse(userPrompt: string, userData: UserData): Promise<ContextualResponse> {
  // Build system prompt
  const systemPrompt = `Eres Apolo, entrenador personal AI experto en fitness y nutrición. Eres motivador pero realista, cercano y empático. No diagnosticas enfermedades ni prescribes dietas médicas. Contextualiza tus respuestas con los siguientes datos del usuario cuando estén disponibles.`;

  // Compose full prompt
  const userContext = `- Calorías hoy: ${userData.totalCaloriesToday ?? 'N/A'} kcal\n- Entrenamientos esta semana: ${userData.workouts?.length ?? 0}\n- Último entrenamiento: ${userData.lastWorkout?.name ?? 'N/A'}\n- Alimentos recientes: ${(userData.foods || []).slice(0,3).map(f => f.name).join(', ') || 'N/A'}`;
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `${userContext}\n\nUsuario pregunta: ${userPrompt}` }
  ];

  if (!OPENAI_KEY) {
    return getFallbackResponse(userPrompt, userData);
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 200,
        temperature: 0.7
      })
    });

    if (!res.ok) {
      if (res.status === 429) {
        return { message: 'Límite de cuota alcanzado en el servicio de AI. Intenta más tarde.', type: 'normal' };
      }
      if (res.status === 401) {
        return { message: 'API key inválida para el servicio de AI. Revisa la configuración.', type: 'normal' };
      }
      console.error('OpenAI error status:', res.status, await res.text());
      return getFallbackResponse(userPrompt, userData);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content as string | undefined;
    const text = content || getFallbackResponse(userPrompt, userData).message;

    // Determine type
    const lower = text.toLowerCase();
    let type: ContextualResponse['type'] = 'normal';
    if (/(¡|\b)(excelente|increíble|logro|felicit|bien hecho)/i.test(text)) type = 'achievement';
    if (/(sugiero|recomiendo|prueba|deberías|intenta)/i.test(lower)) type = 'recommendation';

    return { message: text, type };
  } catch (error) {
    console.error('getContextualResponse error:', error);
    return getFallbackResponse(userPrompt, userData);
  }
}

export default {
  getContextualResponse
};
