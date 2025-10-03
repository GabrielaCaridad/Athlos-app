import { useCallback, useEffect, useRef, useState } from 'react';
import { getFunctions, httpsCallable, HttpsCallable } from 'firebase/functions';
import app from '../../3-acceso-datos/firebase/config';

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

  const functions = getFunctions(app as any, 'us-central1');
  const chatFnRef = useRef<HttpsCallable<any, ChatResult> | null>(null);

  useEffect(() => {
    chatFnRef.current = httpsCallable(functions, 'chat');
  }, [functions]);

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
      if (!chat) throw new Error('Funciones no inicializadas');
      const { data } = await chat({ message: content, sessionId });
      const res = data as ChatResult;
      if (res.sessionId && res.sessionId !== sessionId) setSessionId(res.sessionId);

      const botMsg: Message = {
        id: `bot_${Date.now()}`,
        text: res.reply,
        isUser: false,
        timestamp: new Date(),
        type: (res.type as Message['type']) || 'normal',
        wasFromCache: !!res.wasFromCache,
      };
      addMessage(botMsg);
    } catch (e: any) {
      const code: string = e?.code || e?.message || 'unknown';
      let msg = 'Error al enviar el mensaje.';
      if (code.includes('functions/unauthenticated')) msg = 'Inicia sesión para usar el chat.';
      else if (code.includes('functions/resource-exhausted')) {
        msg = 'Has alcanzado el límite de uso. Intenta más tarde.';
        setIsRateLimited(true);
      } else if (code.includes('functions/invalid-argument')) msg = 'Mensaje inválido.';
      else if (code.includes('functions/deadline-exceeded')) msg = 'Tiempo de espera agotado. Intenta de nuevo.';
      else if (code.includes('functions/unavailable')) msg = 'Servicio no disponible temporalmente.';
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
    // mantenemos sessionId para continuar el hilo
  }, []);

  const retryLastMessage = useCallback(() => {
    const lastUser = [...messages].reverse().find(m => m.isUser);
    if (lastUser) sendMessage(lastUser.text);
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
