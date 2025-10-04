import { useCallback, useEffect, useRef, useState } from 'react';
import { httpsCallable, HttpsCallable } from 'firebase/functions';
import { functions } from '../../3-acceso-datos/firebase/config';
import { auth } from '../../3-acceso-datos/firebase/config';

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

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const pendingUserMsgRef = useRef<Message | null>(null);
  const chatFnRef = useRef<HttpsCallable<any, ChatResult> | null>(null);

  useEffect(() => {
    chatFnRef.current = httpsCallable<any, ChatResult>(functions, 'chat');
    console.log('✅ Chat function initialized');
  }, []);

  const addMessage = useCallback((m: Message) => {
    setMessages(prev => [...prev, m]);
  }, []);

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

    } catch (e: any) {
      console.error('❌ Error completo:', e);
      console.error('❌ Error code:', e?.code);
      console.error('❌ Error message:', e?.message);

      const code: string = e?.code || e?.message || 'unknown';
      let msg = 'Error al enviar el mensaje. Intenta de nuevo.';

      if (code.includes('unauthenticated') || code.includes('UNAUTHENTICATED')) {
        msg = 'Debes iniciar sesión para usar el chat.';
      } else if (code.includes('resource-exhausted') || code.includes('RESOURCE_EXHAUSTED')) {
        msg = 'Has alcanzado el límite de uso. Intenta más tarde.';
        setIsRateLimited(true);
      } else if (code.includes('invalid-argument') || code.includes('INVALID_ARGUMENT')) {
        msg = 'Mensaje inválido. Verifica el contenido.';
      } else if (code.includes('deadline-exceeded') || code.includes('DEADLINE_EXCEEDED')) {
        msg = 'Tiempo de espera agotado. Intenta de nuevo.';
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

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setIsRateLimited(false);
  }, []);

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
