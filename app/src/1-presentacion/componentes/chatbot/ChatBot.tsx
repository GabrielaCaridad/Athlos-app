// En esta parte inicial importo los hooks de React, los iconos que uso en la UI
// y mis propios hooks de la app para conectar el componente con la autenticación,
// la lógica del chat y los insights personales del usuario.
import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, X, Send, Zap, Utensils, Dumbbell, TrendingUp, Trash2, RefreshCcw, Sparkles, Award, Target } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useChat, Message } from '../../hooks/useChat';
import { usePersonalInsights } from '../../hooks/usePersonalInsights';

interface ChatBotProps {
  isDark: boolean;
}

export default function ChatBot({ isDark }: ChatBotProps) {
  // Aquí obtengo el usuario autenticado. Si no hay usuario, no muestro el chat.
  const { user } = useAuth();
  // Estado de apertura del chat (la burbuja principal solo abre, el cierre va dentro del chat)
  const [isOpen, setIsOpen] = useState(false);
  // Estado del texto de entrada
  const [inputText, setInputText] = useState('');
  // Hook del chat: mensajes, estados de carga/errores y acciones
  const { messages, isLoading, error, sendMessage, clearMessages, retryLastMessage, isRateLimited } = useChat();
  // Refs para manejar scroll y foco en el input
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Insights personales para contextualizar acciones rápidas
  const { insights } = usePersonalInsights(user?.uid || '');

  // Acciones rápidas: defino atajos que el usuario puede pulsar para rellenar el input.
  // Si el sistema detecta un insight de carbohidratos, adapto el tercer botón para que sea más útil.
  const quickActions = useMemo(() => {
    const baseActions = [
      { text: "¿Qué comer antes de entrenar?", icon: Utensils, category: 'nutrition', gradient: 'from-green-500 to-emerald-600' },
      { text: "Rutina para pecho y tríceps", icon: Dumbbell, category: 'workout', gradient: 'from-blue-500 to-cyan-600' },
      { text: "¿Cómo mejorar mi progreso?", icon: TrendingUp, category: 'progress', gradient: 'from-purple-500 to-pink-600' },
    ];

    // Si hay insight de carbos, reemplazar el tercer botón (progreso) por uno contextual
    const carbsInsight = insights.find(i => i.title.toLowerCase().includes('carbohidrato'));
    if (carbsInsight) {
      baseActions[2] = {
        text: "¿Cómo alcanzar mis 293g de carbos?",
        icon: TrendingUp,
        category: 'progress',
        gradient: 'from-purple-500 to-pink-600'
      };
    }

    return baseActions;
  }, [insights]);

  // Esta función se encarga de enviar el mensaje actual al asistente.
  // Valido que no esté vacío y que no haya una petición en curso.
  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;
    
    // Aquí hago una validación preventiva en el frontend para detectar
    // preguntas fuera de alcance y registrar una advertencia (no bloquea el envío).
    const lower = inputText.toLowerCase();
    const outOfScopeWarnings = [
      'pelo', 'cabello', 'tinte', 'pintar',
      'ropa', 'vestido', 'zapatos',
      'amor', 'pareja', 'novio', 'novia',
      'dinero', 'inversión', 'trabajo',
      'política', 'religión'
    ];
    const hasOutOfScope = outOfScopeWarnings.some(word => lower.includes(word));
    if (hasOutOfScope) {
      console.warn('⚠️ Posible pregunta fuera de scope detectada en frontend');
    }
    
    await sendMessage(inputText.trim());
    setInputText('');
  };

  // Este handler completa el input con el texto de una acción rápida y deja el foco en el campo.
  const handleQuickAction = (actionText: string) => {
    setInputText(actionText);
    inputRef.current?.focus();
  };

  // En esta función defino los estilos visuales de cada mensaje según su tipo.
  // Diferencio mensajes del usuario, recomendaciones, logros, errores y respuestas generales.
  const getMessageStyle = (message: Message) => {
    if (message.isUser) {
      return isDark 
        ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg shadow-purple-500/30' 
        : 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/30';
    }
    
    if (message.type === 'recommendation') {
      return isDark 
        ? 'bg-gradient-to-r from-blue-900/40 to-blue-800/40 text-blue-200 border border-blue-700/30' 
        : 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-900 border border-blue-200';
    }
    
    if (message.type === 'achievement') {
      return isDark 
        ? 'bg-gradient-to-r from-green-900/40 to-green-800/40 text-green-200 border border-green-700/30' 
        : 'bg-gradient-to-r from-green-50 to-green-100 text-green-900 border border-green-200';
    }
    
    if (message.type === 'error') {
      return isDark 
        ? 'bg-gradient-to-r from-red-900/40 to-red-800/40 text-red-200 border border-red-700/30' 
        : 'bg-gradient-to-r from-red-50 to-red-100 text-red-900 border border-red-200';
    }
    
    return isDark 
      ? 'bg-gray-800/90 text-white border border-gray-700/50' 
      : 'bg-white text-gray-800 border border-gray-200 shadow-md shadow-gray-200/50';
  };

  // Este helper agrega una pequeña etiqueta para resaltar si la respuesta es una recomendación o un logro.
  const getMessageBadge = (type: Message['type']) => {
    if (type === 'recommendation') {
      return (
        <div className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 mt-2">
          <Target size={10} />
          <span>Recomendación</span>
        </div>
      );
    }
    if (type === 'achievement') {
      return (
        <div className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 mt-2">
          <Award size={10} />
          <span>¡Logro!</span>
        </div>
      );
    }
    return null;
  };

  // Efecto: cada vez que llegan nuevos mensajes (o abro el chat) hago scroll al final
  // para que el usuario siempre vea lo más reciente.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isOpen]);

  // Efecto: cuando abro el chat, enfoco el input para que pueda escribir de inmediato.
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Efecto: permito que otras partes de la app abran el chat emitiendo un evento global "open-chatbot".
  // Esto facilita que, por ejemplo, un botón en otra pantalla pueda abrir la ventana del chat.
  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener('open-chatbot', handler as EventListener);
    return () => {
      window.removeEventListener('open-chatbot', handler as EventListener);
    };
  }, []);

  // Helper: esta función toma un texto y lo presenta respetando párrafos y saltos de línea,
  // para que la respuesta del asistente sea más legible.
  const formatMessage = (text: string) => {
    const paragraphs = text.split('\n\n').filter(p => p.trim());
    return (
      <div className="space-y-3">
        {paragraphs.map((paragraph, idx) => (
          <p key={idx} className="text-sm leading-normal">
            {paragraph.split('\n').map((line, lineIdx, arr) => (
              <span key={lineIdx}>
                {line}
                {lineIdx < arr.length - 1 && <br />}
              </span>
            ))}
          </p>
        ))}
      </div>
    );
  };

  // Si no hay usuario autenticado, no muestro el componente del chat.
  if (!user) {
    return null;
  }

  return (
    <>
      {/* Botón flotante principal: solo ABRE el chat (no vuelve a cerrarlo).
          Visualmente es una burbuja con un ícono de mensaje y un pequeño brillo.
          Si el chat ya está abierto, no renderizo este botón para evitar confundir al usuario. */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed bottom-6 right-6 z-50 w-16 h-16 rounded-2xl transition-all duration-300 transform hover:scale-110 active:scale-95 ${
            isDark 
              ? 'bg-gradient-to-br from-purple-600 to-purple-700 shadow-2xl shadow-purple-500/50' 
              : 'bg-gradient-to-br from-purple-500 to-purple-600 shadow-2xl shadow-purple-500/30'
          } animate-pulse`}
        >
          <div className="relative w-full h-full flex items-center justify-center">
            <MessageCircle size={28} className="text-white" />
            <div className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center ${
              isDark ? 'bg-yellow-500' : 'bg-yellow-400'
            } shadow-lg animate-bounce`}>
              <Sparkles size={14} className="text-white" />
            </div>
          </div>
        </button>
      )}

      {/* Chat Window con diseño mejorado */}
      {isOpen && (
        <div className={`fixed bottom-4 right-6 z-40 w-[440px] max-w-[95vw] h-[750px] max-h-[85vh] rounded-3xl overflow-hidden transition-all duration-300 flex flex-col backdrop-blur-xl ${
          isDark 
            ? 'bg-gray-900/95 shadow-2xl shadow-black/50 border border-gray-800' 
            : 'bg-white/95 shadow-2xl shadow-gray-900/20 border border-gray-200'
        }`}>
          
          {/* Header del chat (incluye acciones de limpiar y cerrar):
              Aquí muestro el avatar del asistente, su estado “activo”,
              un botón para limpiar la conversación y otro para cerrar la ventana. */}
          <div className={`relative p-5 ${
            isDark 
              ? 'bg-gradient-to-r from-purple-900/50 to-blue-900/50 border-b border-gray-800' 
              : 'bg-gradient-to-r from-purple-50 to-blue-50 border-b border-gray-200'
          }`}>
            <div className="flex items-center space-x-4">
              {/* Avatar de Apolo mejorado */}
              <div className="relative">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                  isDark 
                    ? 'bg-gradient-to-br from-purple-600 to-blue-600' 
                    : 'bg-gradient-to-br from-purple-500 to-blue-500'
                } shadow-lg`}>
                  <Zap size={24} className="text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-4 border-gray-900 animate-pulse shadow-lg" />
              </div>
              
              {/* Info de Apolo */}
              <div className="flex-1">
                <h3 className={`font-bold text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  Apolo AI
                </h3>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Siempre activo · Responde en segundos
                  </p>
                </div>
              </div>
              
              {/* Botones de acción: 
                  - Papelera: limpia los mensajes y deja la conversación en blanco.
                  - X: cierra la ventana del chat (el botón flotante principal no cierra). */}
              <div className="flex gap-2">
                <button
                  onClick={clearMessages}
                  className={`p-2 rounded-xl transition-all hover:scale-110 ${
                    isDark 
                      ? 'hover:bg-gray-800 text-gray-400 hover:text-white' 
                      : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                  }`}
                  title="Limpiar chat"
                >
                  <Trash2 size={18} />
                </button>
                {/* Cerrar ventana del chat */}
                <button
                  onClick={() => setIsOpen(false)}
                  className={`p-2 rounded-xl transition-all hover:scale-110 ${
                    isDark 
                      ? 'hover:bg-gray-800 text-gray-400 hover:text-white' 
                      : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                  }`}
                  title="Cerrar"
                  aria-label="Cerrar chat"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Zona de mensajes con scroll y animaciones:
              Aquí renderizo todos los mensajes (usuario y asistente),
              con un pequeño efecto al aparecer y un timestamp formateado. */}
          <div 
            ref={listRef} 
            className={`flex-1 px-4 py-4 space-y-3 overflow-y-auto ${
              isDark ? 'bg-gray-900/50' : 'bg-gray-50/50'
            }`}
            style={{
              maxHeight: 'calc(100vh - 480px)',
              minHeight: '280px',
              scrollBehavior: 'smooth',
              scrollbarWidth: 'thin',
              scrollbarColor: isDark ? '#4B5563 transparent' : '#D1D5DB transparent'
            }}
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full py-8 animate-fade-in">
                {/* Avatar grande de bienvenida */}
                <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 ${
                  isDark 
                    ? 'bg-gradient-to-br from-purple-600 to-blue-600' 
                    : 'bg-gradient-to-br from-purple-500 to-blue-500'
                } shadow-2xl shadow-purple-500/30 animate-bounce-slow`}>
                  <Zap size={36} className="text-white" />
                </div>
                
                <h4 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  ¡Hola! Soy Apolo 👋
                </h4>
                
                <p className={`text-sm text-center mb-6 px-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Tu entrenador personal con inteligencia artificial
                </p>
                
                {/* Especialidades con iconos */}
                <div className="w-full space-y-3 px-2">
                  <div className={`flex items-center gap-3 p-3 rounded-xl ${
                    isDark ? 'bg-gray-800/50' : 'bg-white/80'
                  } backdrop-blur-sm`}>
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
                      <Utensils size={20} className="text-white" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Nutrición
                      </p>
                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Alimentación y macros
                      </p>
                    </div>
                  </div>
                  
                  <div className={`flex items-center gap-3 p-3 rounded-xl ${
                    isDark ? 'bg-gray-800/50' : 'bg-white/80'
                  } backdrop-blur-sm`}>
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg">
                      <Dumbbell size={20} className="text-white" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Entrenamiento
                      </p>
                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Rutinas y ejercicios
                      </p>
                    </div>
                  </div>
                  
                  <div className={`flex items-center gap-3 p-3 rounded-xl ${
                    isDark ? 'bg-gray-800/50' : 'bg-white/80'
                  } backdrop-blur-sm`}>
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
                      <TrendingUp size={20} className="text-white" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Progreso
                      </p>
                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Seguimiento y análisis
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Aquí recorro los mensajes y los muestro con un pequeño delay para dar sensación de fluidez. */}
            {messages.map((m, index) => (
              <div 
                key={m.id} 
                className={`flex ${m.isUser ? 'justify-end' : 'justify-start'} animate-slide-in`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className={`flex gap-3 max-w-[85%] ${m.isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Avatar: si es el asistente muestro su ícono; si es el usuario, muestro su inicial. */}
                  {!m.isUser && (
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isDark 
                        ? 'bg-gradient-to-br from-purple-600 to-blue-600' 
                        : 'bg-gradient-to-br from-purple-500 to-blue-500'
                    } shadow-lg`}>
                      <Zap size={14} className="text-white" />
                    </div>
                  )}
                  
                  {m.isUser && (
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      isDark 
                        ? 'bg-gradient-to-br from-gray-700 to-gray-800' 
                        : 'bg-gradient-to-br from-gray-300 to-gray-400'
                    } shadow-lg`}>
                      <span className="text-white text-xs font-bold">
                        {user?.displayName?.[0]?.toUpperCase() || 'U'}
                      </span>
                    </div>
                  )}
                  
                  {/* Mensaje: el contenedor se pinta distinto según quién lo envía y el tipo de contenido. */}
                  <div className="flex flex-col gap-1">
                    <div className={`px-5 py-3.5 rounded-2xl text-sm leading-normal ${getMessageStyle(m)} ${
                      m.isUser ? 'rounded-tr-md' : 'rounded-tl-md'
                    } transition-all duration-200 hover:scale-[1.02]`}>
                      {formatMessage(m.text)}
                    </div>
                    
                    {/* Si corresponde, muestro un badge de recomendación o logro. */}
                    {!m.isUser && getMessageBadge(m.type)}
                    
                    {/* Timestamp: aquí formateo la hora en español para cada mensaje. */}
                    <span className={`text-[10px] ${m.isUser ? 'text-right' : 'text-left'} ${
                      isDark ? 'text-gray-600' : 'text-gray-400'
                    }`}>
                      {new Date(m.timestamp).toLocaleTimeString('es-ES', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
            
            {/* Indicador de escritura del asistente: mientras espero la respuesta, muestro puntos animados. */}
            {isLoading && (
              <div className="flex justify-start animate-fade-in">
                <div className="flex gap-3 max-w-[85%]">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isDark 
                      ? 'bg-gradient-to-br from-purple-600 to-blue-600' 
                      : 'bg-gradient-to-br from-purple-500 to-blue-500'
                  } shadow-lg`}>
                    <Zap size={14} className="text-white animate-pulse" />
                  </div>
                  
                  <div className={`px-5 py-4 rounded-2xl rounded-tl-md ${
                    isDark 
                      ? 'bg-gray-800/90 border border-gray-700/50' 
                      : 'bg-white border border-gray-200 shadow-sm'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className="flex gap-2">
                        <div className={`${
                          isDark ? 'bg-purple-400' : 'bg-purple-600'
                        } w-2 h-2 rounded-full animate-bounce`} style={{ animationDelay: '0ms' }} />
                        <div className={`${
                          isDark ? 'bg-purple-400' : 'bg-purple-600'
                        } w-2 h-2 rounded-full animate-bounce`} style={{ animationDelay: '150ms' }} />
                        <div className={`${
                          isDark ? 'bg-purple-400' : 'bg-purple-600'
                        } w-2 h-2 rounded-full animate-bounce`} style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Apolo está pensando...
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Acciones rápidas contextualizadas: botones pequeños que rellenan el input para agilizar consultas. */}
            <div className={`p-4 border-t ${isDark ? 'border-gray-800 bg-gray-900/80' : 'border-gray-200 bg-white/80'} backdrop-blur-sm`}>
            <p className={`text-xs font-semibold mb-3 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              Acciones Rápidas
            </p>
            <div className="grid grid-cols-3 gap-2">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickAction(action.text)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 ${
                    isDark
                      ? 'bg-gray-800 hover:bg-gray-750 border border-gray-700'
                      : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shadow-lg`}>
                    <action.icon size={20} className="text-white" />
                  </div>
                  <span className={`text-[10px] text-center leading-tight ${
                    isDark ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    {action.text.split(' ').slice(0, 3).join(' ')}...
                  </span>
                </button>
              ))}
            </div>
            
              {/* Mensajes de error/estado: si hubo un error al enviar o responder, lo muestro aquí con opción de reintento. */}
            {error && (
              <div className={`mt-3 p-3 rounded-xl text-xs flex items-start gap-2 ${
                isDark ? 'bg-red-900/30 text-red-300 border border-red-800' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                <span className="flex-shrink-0">⚠️</span>
                <span className="flex-1">{error}</span>
                {error && (
                  <button 
                    onClick={retryLastMessage}
                    className="flex-shrink-0 hover:scale-110 transition-transform"
                  >
                    <RefreshCcw size={14} />
                  </button>
                )}
              </div>
            )}
            
              {/* Si se alcanza el límite de mensajes, informo al usuario de forma clara. */}
              {isRateLimited && (
              <div className={`mt-3 p-3 rounded-xl text-xs ${
                isDark ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-800' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
              }`}>
                ⏱️ Has alcanzado el límite de mensajes. Intenta más tarde.
              </div>
            )}
          </div>

          {/* Área de entrada del usuario: aquí escribo el mensaje, muestro un contador de caracteres
              y tengo el botón para enviar al asistente. Enter también envía el mensaje. */}
          <div className={`p-4 border-t ${isDark ? 'border-gray-800 bg-gray-900/80' : 'border-gray-200 bg-white/80'} backdrop-blur-sm`}>
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    // Si presiono Enter (sin Shift), envío el mensaje.
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Pregunta sobre ejercicios, alimentación o tu progreso..."
                  disabled={isLoading}
                  maxLength={500}
                  className={`w-full px-4 py-3 rounded-xl text-sm border-2 outline-none transition-all ${
                    isDark
                      ? 'bg-gray-800 text-white placeholder-gray-500 border-gray-700 focus:border-purple-500'
                      : 'bg-white text-gray-800 placeholder-gray-400 border-gray-200 focus:border-purple-500'
                  } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
                
                {/* Contador de caracteres para no exceder el límite de 500. */}
                <div className={`absolute right-3 bottom-1 text-[10px] ${
                  inputText.length > 450 
                    ? 'text-red-500' 
                    : isDark ? 'text-gray-600' : 'text-gray-400'
                }`}>
                  {inputText.length}/500
                </div>
              </div>
              
              {/* Botón que envía el mensaje al backend del chat a través del hook useChat. */}
              <button
                onClick={handleSend}
                disabled={isLoading || !inputText.trim() || inputText.length > 500}
                className={`p-3 rounded-xl transition-all duration-200 ${
                  isLoading || !inputText.trim() || inputText.length > 500
                    ? 'bg-gray-400 cursor-not-allowed opacity-50'
                    : isDark
                    ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 shadow-lg shadow-purple-500/30 hover:scale-105 active:scale-95'
                    : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 shadow-lg shadow-purple-500/20 hover:scale-105 active:scale-95'
                }`}
              >
                <Send size={20} className="text-white" />
              </button>
            </div>
            
            {/* Disclaimer informativo: aclaro que el asistente es una ayuda y no reemplaza consejo profesional. */}
            <p className={`text-[10px] mt-3 text-center ${isDark ? 'text-gray-600' : 'text-gray-500'}`}>
              🤖 Apolo es un asistente AI. Consulta profesionales para asesoría médica.
            </p>
          </div>
        </div>
      )}
      
      {/* Estilos CSS adicionales (animaciones) que uso en los mensajes, el fade-in
          y un rebote sutil para algunos elementos visuales. */}
      <style>{`
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        @keyframes bounce-slow {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        
        .animate-slide-in {
          animation: slide-in 0.3s ease-out forwards;
        }
        
        .animate-fade-in {
          animation: fade-in 0.5s ease-out forwards;
        }
        
        .animate-bounce-slow {
          animation: bounce-slow 3s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}