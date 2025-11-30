/**
 * Hook para manejar el chat de Apolo.
 * Envía mensajes a la función remota y gestiona estado y errores.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable, HttpsCallable } from 'firebase/functions'; 
// Instancia de Functions inicializada en config Firebase
import { functions } from '../../3-acceso-datos/firebase/config';
// Usuario actual para validar sesión antes de enviar
import { auth } from '../../3-acceso-datos/firebase/config';
// Toasts globales para feedback visible (z-index alto desde provider)
import { useToast } from '../componentes/comun/ToastProvider';

export interface Message {
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

// Payload enviado al backend: texto + sessionId opcional (contexto)
type ChatPayload = { message: string; sessionId?: string };

export const useChat = () => {
  // Maneja envío, respuestas, errores y límites de uso
  const toast = useToast();
  // Estado: historial de mensajes
  const [messages, setMessages] = useState<Message[]>([]);
  // Estado: bandera de carga
  const [isLoading, setIsLoading] = useState(false);
  // Estado: último error de envío
  const [error, setError] = useState<string | null>(null);
  // Estado: sessionId (contexto persistente en backend)
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Estado: límite alcanzado (rate limit)
  const [isRateLimited, setIsRateLimited] = useState(false);
  // Ref: último mensaje usuario para reintentos
  const pendingUserMsgRef = useRef<Message | null>(null);
  // Ref: Cloud Function callable
  const chatFnRef = useRef<HttpsCallable<ChatPayload, ChatResult> | null>(null);

  // Efecto: inicializa callable solo una vez
  useEffect(() => {
  chatFnRef.current = httpsCallable<ChatPayload, ChatResult>(functions, 'chat');
    console.log('✅ Chat function initialized');
  }, []);

  // Función: agregar mensaje al historial
  const addMessage = useCallback((m: Message) => {
    setMessages(prev => [...prev, m]);
  }, []);

  // Envía el mensaje al backend (valida longitud y auth)
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
      toast.error('Debes iniciar sesión para usar el chat.');
      addMessage({
        id: `err_${Date.now()}`,
        text: 'Debes iniciar sesión para usar el chat.',
        isUser: false,
        timestamp: new Date(),
        type: 'error',
      });
      return;
    }

  // Datos básicos de envío (debug)
  console.log('� [Chat] Enviando', { content, uid: currentUser.uid, sessionId });

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

      // Llamada a la función remota
      console.log('📡 [Chat] Payload', { message: content, sessionId: sessionId || 'nuevo' });

      const result = await chat({ 
        message: content, 
        sessionId: sessionId || undefined 
      });

  // Debug: respuesta principal
  console.log('✅ [Chat] Respuesta', result.data);

  const res = result.data;
      
      if (res.sessionId && res.sessionId !== sessionId) {
        setSessionId(res.sessionId);
  console.log('📝 [Chat] sessionId actualizado:', res.sessionId);
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
  // Mapea errores a mensajes amigables
      const err = e as { code?: string; message?: string };
      console.error('❌ Error completo:', err);
      console.error('❌ Error code:', err?.code);
      console.error('❌ Error message:', err?.message);

      const code: string = err?.code || err?.message || 'unknown';
      let msg = 'Error al enviar el mensaje. Intenta de nuevo.';

  // Timeouts / rate limit / auth
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
      toast.error(msg);
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
  }, [addMessage, sessionId, toast]);

  // Función: limpiar historial y estados
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setIsRateLimited(false);
  }, []);

  // Función: reintenta último mensaje usuario
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
