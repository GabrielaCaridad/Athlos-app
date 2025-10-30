// En este hook centralizo la lógica del chat con Apolo.
// Importo hooks de React para manejar estado, efectos y referencias.
import { useCallback, useEffect, useRef, useState } from 'react';
// Uso las Cloud Functions de Firebase para enviar los mensajes al backend.
import { httpsCallable, HttpsCallable } from 'firebase/functions';
// Importo la instancia de Functions inicializada en mi proyecto Firebase.
import { functions } from '../../3-acceso-datos/firebase/config';
// También necesito el usuario actual para validar sesión antes de enviar mensajes.
import { auth } from '../../3-acceso-datos/firebase/config';

export interface Message {
  // Cada mensaje que se muestra en el chat tiene un id, el texto y su metadata.
  // "isUser" me ayuda a diferenciar visualmente si lo envió el usuario o el asistente.
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  type?: 'recommendation' | 'achievement' | 'normal' | 'error';
  isLoading?: boolean;
  wasFromCache?: boolean;
}

type ChatResult = {
  sessionId: string;
  reply: string;
  type: 'normal' | 'recommendation' | 'achievement' | 'error';
  tokensUsed?: number;
  responseTimeMs?: number;
  wasFallback?: boolean;
  wasFromCache?: boolean;
};

// Este es el payload que envío a la Cloud Function: el texto del mensaje y, opcionalmente,
// el identificador de sesión del chat para mantener el contexto.
type ChatPayload = { message: string; sessionId?: string };

export const useChat = () => {
  // Mensajes acumulados en la conversación
  const [messages, setMessages] = useState<Message[]>([]);
  // Estado de carga mientras espero la respuesta del backend
  const [isLoading, setIsLoading] = useState(false);
  // Mensaje de error para mostrar en el UI cuando algo falla
  const [error, setError] = useState<string | null>(null);
  // Identificador de sesión que me permite mantener el contexto del chat en el backend
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Flag para indicar si el usuario alcanzó un límite de uso
  const [isRateLimited, setIsRateLimited] = useState(false);
  // Referencia al último mensaje del usuario aún pendiente (útil para reintentos, etc.)
  const pendingUserMsgRef = useRef<Message | null>(null);
  // Mantengo una referencia a la función callable para evitar recrearla en cada render
  const chatFnRef = useRef<HttpsCallable<ChatPayload, ChatResult> | null>(null);

  // Inicializo la Cloud Function de chat una sola vez al montar el hook.
  useEffect(() => {
  chatFnRef.current = httpsCallable<ChatPayload, ChatResult>(functions, 'chat');
    console.log('✅ Chat function initialized');
  }, []);

  // Agrego un mensaje nuevo al arreglo de mensajes.
  const addMessage = useCallback((m: Message) => {
    setMessages(prev => [...prev, m]);
  }, []);

  // Envía el mensaje al backend, valida sesión y maneja errores comunes.
  const sendMessage = useCallback(async (text: string) => {
    const content = (text || '').trim();
    if (!content) return;
    if (content.length > 500) {
      setError('El mensaje no puede superar 500 caracteres.');
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError('Debes iniciar sesión para usar el chat.');
      addMessage({
        id: `err_${Date.now()}`,
        text: 'Debes iniciar sesión para usar el chat.',
        isUser: false,
        timestamp: new Date(),
        type: 'error',
      });
      return;
    }

    console.log('🚀 Enviando mensaje:', content);
    console.log('🔑 Usuario autenticado:', currentUser.uid);
    console.log('📝 SessionId:', sessionId);

    setError(null);
    setIsRateLimited(false);
    setIsLoading(true);

    const userMsg: Message = {
      id: `local_${Date.now()}`,
      text: content,
      isUser: true,
      timestamp: new Date(),
    };
    addMessage(userMsg);
    pendingUserMsgRef.current = userMsg;

    try {
      const chat = chatFnRef.current;
      if (!chat) {
        throw new Error('Funciones no inicializadas');
      }

      console.log('📡 Llamando a Cloud Function con:', { 
        message: content, 
        sessionId: sessionId || 'nuevo' 
      });

      const result = await chat({ 
        message: content, 
        sessionId: sessionId || undefined 
      });

      console.log('✅ Respuesta recibida:', result.data);

      const res = result.data;
      
      if (res.sessionId && res.sessionId !== sessionId) {
        setSessionId(res.sessionId);
        console.log('📝 SessionId actualizado:', res.sessionId);
      }

      const botMsg: Message = {
        id: `bot_${Date.now()}`,
        text: res.reply,
        isUser: false,
        timestamp: new Date(),
        type: res.type || 'normal',
        wasFromCache: !!res.wasFromCache,
      };
      addMessage(botMsg);

    } catch (e: unknown) {
      // Manejo de errores con mensajes más claros para el usuario final
      const err = e as { code?: string; message?: string };
      console.error('❌ Error completo:', err);
      console.error('❌ Error code:', err?.code);
      console.error('❌ Error message:', err?.message);

      const code: string = err?.code || err?.message || 'unknown';
      let msg = 'Error al enviar el mensaje. Intenta de nuevo.';

      // Manejo mejorado de timeouts
      if (code === 'TIMEOUT' || code.toLowerCase().includes('timeout') || code.toUpperCase().includes('DEADLINE')) {
        msg = 'La respuesta tardó demasiado. Intenta con una pregunta más simple.';
      } else if (code.includes('unauthenticated') || code.includes('UNAUTHENTICATED')) {
        msg = 'Debes iniciar sesión para usar el chat.';
      } else if (code.includes('resource-exhausted') || code.includes('RESOURCE_EXHAUSTED')) {
        msg = 'Has alcanzado el límite de uso. Intenta más tarde.';
        setIsRateLimited(true);
      } else if (code.includes('invalid-argument') || code.includes('INVALID_ARGUMENT')) {
        msg = 'Mensaje inválido. Verifica el contenido.';
      } else if (code.includes('unavailable') || code.includes('UNAVAILABLE')) {
        msg = 'Servicio no disponible temporalmente.';
      } else if (code.includes('internal') || code.includes('INTERNAL')) {
        msg = 'Error interno del servidor. Intenta más tarde.';
      }

      setError(msg);
      addMessage({
        id: `err_${Date.now()}`,
        text: msg,
        isUser: false,
        timestamp: new Date(),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
      pendingUserMsgRef.current = null;
    }
  }, [addMessage, sessionId]);

  // Limpia el historial del chat y estados de error/límite
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setIsRateLimited(false);
  }, []);

  // Reintenta enviando el último mensaje del usuario si existe
  const retryLastMessage = useCallback(() => {
    const lastUser = [...messages].reverse().find(m => m.isUser);
    if (lastUser) {
      sendMessage(lastUser.text);
    }
  }, [messages, sendMessage]);

  return {
    messages,
    isLoading,
    error,
    sessionId,
    sendMessage,
    clearMessages,
    retryLastMessage,
    isRateLimited,
  };
};
