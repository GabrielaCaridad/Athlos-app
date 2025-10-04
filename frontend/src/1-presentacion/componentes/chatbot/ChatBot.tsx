import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Zap, Utensils, Dumbbell, TrendingUp, Trash2, RefreshCcw } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useChat, Message } from '../../hooks/useChat';

interface ChatBotProps {
  isDark: boolean;
}

export default function ChatBot({ isDark }: ChatBotProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const { messages, isLoading, error, sendMessage, clearMessages, retryLastMessage, isRateLimited } = useChat();
  const listRef = useRef<HTMLDivElement | null>(null);

  const quickActions = [
    { text: "Registrar comida", icon: Utensils, category: 'nutrition' },
    { text: "Iniciar rutina", icon: Dumbbell, category: 'workout' },
    { text: "Ver progreso", icon: TrendingUp, category: 'progress' }
  ];

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return;
    await sendMessage(inputText.trim());
    setInputText('');
  };

  const handleQuickAction = (actionText: string) => {
    setInputText(actionText);
  };

  const getMessageStyle = (message: Message) => {
    if (message.isUser) return isDark ? 'bg-purple-600 text-white' : 'bg-purple-500 text-white';
    if (message.type === 'recommendation') return isDark ? 'bg-blue-800 text-blue-200' : 'bg-blue-50 text-blue-800';
    if (message.type === 'achievement') return isDark ? 'bg-green-800 text-green-200' : 'bg-green-50 text-green-800';
    if (message.type === 'error') return isDark ? 'bg-red-800 text-red-200' : 'bg-red-50 text-red-800';
    return isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-800';
  };

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  if (!user) {
    return null;
  }

  return (
    <>
      {/* Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full transition-all duration-300 transform hover:scale-110 ${
          isDark 
            ? 'bg-gray-800 shadow-dark-neumorph text-white hover:shadow-dark-neumorph-hover' 
            : 'bg-white shadow-neumorph text-gray-800 hover:shadow-neumorph-hover'
        }`}
      >
        {isOpen ? <X size={28} /> : <MessageCircle size={28} />}
        <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ${
          isDark ? 'bg-purple-600' : 'bg-purple-500'
        }`}>
          <Zap size={12} className="text-white" />
        </div>
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className={`fixed bottom-28 right-6 z-40 w-96 h-[600px] rounded-2xl overflow-hidden transition-all duration-300 flex flex-col ${
          isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
        }`}>
          {/* Header */}
          <div className={`p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
            <div className="flex items-center space-x-3">
              <div className={`relative w-10 h-10 rounded-full flex items-center justify-center ${
                isDark ? 'bg-purple-600' : 'bg-purple-500'
              }`}>
                <Zap size={20} className="text-white" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
              </div>
              <div className="flex-1">
                <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                  Apolo AI
                </h3>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Entrenador Personal Inteligente
                </p>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div ref={listRef} className="flex-1 p-4 space-y-3 overflow-y-auto">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  👋 ¡Hola! Soy Apolo, tu entrenador personal AI.
                  <br />
                  Pregúntame sobre fitness, nutrición o bienestar.
                </div>
              </div>
            )}
            
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm ${getMessageStyle(m)} ${
                  isDark ? 'shadow-dark-neumorph' : 'shadow-neumorph'
                }`}>
                  <div className="whitespace-pre-wrap break-words">{m.text}</div>
                  {!m.isUser && m.type === 'recommendation' && (
                    <div className="mt-2 flex items-center gap-1 text-xs opacity-80">
                      <TrendingUp size={12} /> Recomendación
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className={`px-4 py-3 rounded-2xl text-sm ${
                  isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-800'
                }`}>
                  <span className="inline-block animate-pulse">Apolo está escribiendo...</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className={`p-3 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
            <div className="text-xs font-medium text-gray-500 mb-2">Acciones Rápidas:</div>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickAction(action.text)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm transition-all ${
                    isDark
                      ? 'hover:bg-gray-700 text-gray-300 hover:text-white'
                      : 'hover:bg-gray-50 text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <action.icon size={14} />
                  <span className="truncate">{action.text}</span>
                </button>
              ))}
            </div>
            
            {error && (
              <div className={`mt-2 text-xs ${isDark ? 'text-red-300' : 'text-red-600'}`}>
                {error}
              </div>
            )}
            
            {isRateLimited && (
              <div className={`mt-2 text-xs ${isDark ? 'text-yellow-300' : 'text-yellow-700'}`}>
                Has alcanzado el límite de uso. Intenta más tarde.
              </div>
            )}
          </div>

          {/* Input Area - ESTA ES LA PARTE QUE FALTABA */}
          <div className={`p-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Pregúntame sobre fitness, nutrición o bienestar..."
                disabled={isLoading}
                className={`flex-1 px-4 py-3 rounded-xl text-sm border-none outline-none ${
                  isDark
                    ? 'bg-gray-700 text-white placeholder-gray-400 shadow-dark-neumorph'
                    : 'bg-gray-50 text-gray-800 placeholder-gray-500 shadow-neumorph'
                } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              
              <div className={`text-xs ${inputText.length > 500 ? 'text-red-500' : isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {inputText.length}/500
              </div>
              
              <button 
                onClick={() => clearMessages()} 
                className={`${isDark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-black'} p-2`} 
                title="Limpiar chat"
              >
                <Trash2 size={16} />
              </button>
              
              {error && (
                <button 
                  onClick={retryLastMessage} 
                  className={`${isDark ? 'text-yellow-300 hover:text-yellow-100' : 'text-yellow-700 hover:text-yellow-900'} p-2`} 
                  title="Reintentar"
                >
                  <RefreshCcw size={16} />
                </button>
              )}
              
              <button
                onClick={handleSend}
                disabled={isLoading || !inputText.trim() || inputText.length > 500}
                className={`p-3 rounded-xl transition-all ${
                  isLoading || !inputText.trim() || inputText.length > 500
                    ? 'bg-gray-400 cursor-not-allowed'
                    : isDark
                    ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-dark-neumorph'
                    : 'bg-purple-500 hover:bg-purple-600 text-white shadow-neumorph'
                }`}
              >
                <Send size={16} />
              </button>
            </div>
            
            <div className={`text-[10px] mt-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Apolo es un asistente AI. Consulta profesionales para asesoría médica.
            </div>
          </div>
        </div>
      )}
    </>
  );
}