import { useState } from 'react';
import { MessageCircle, X, Send, Zap, Utensils, Dumbbell,TrendingUp, Award } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getContextualResponse, UserData } from '../../../business/services/chatService';

interface Message {
  id: number;
  text: string;
  isUser: boolean;
  timestamp: Date;
  type?: 'recommendation' | 'achievement' | 'normal';
}

interface ChatBotProps {
  isDark: boolean;
}

export default function ChatBot({ isDark }: ChatBotProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: "¡Hola! Soy Apolo, tu entrenador personal AI. Analizo tus datos de fitness y bienestar para darte recomendaciones personalizadas. ¿En qué puedo ayudarte hoy?",
      isUser: false,
      timestamp: new Date(),
      type: 'normal'
    }
  ]);
  const [inputText, setInputText] = useState('');

  const quickActions = [
    { text: "//Registrar comida", icon: Utensils, category: 'nutrition' },
    { text: "//Iniciar rutina", icon: Dumbbell, category: 'workout' },
    { text: "//Ver progreso", icon: TrendingUp, category: 'progress' }
  ];

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const userMessage: Message = {
      id: messages.length + 1,
      text: inputText,
      isUser: true,
      timestamp: new Date(),
      type: 'normal'
    };

    // Simular datos del usuario para el contexto (shape esperado)
    const mockUserData: UserData = {
      foods: [], // En producción vendría de Firestore
      workouts: [],
      wellness: [],
      totalCaloriesToday: Math.floor(Math.random() * 800) + 1200,
      lastWorkout: undefined,
      nextWorkout: undefined
    };

    try {
      const response = await getContextualResponse(inputText, mockUserData);
      const botMessage: Message = {
        id: messages.length + 2,
        text: response.message,
        isUser: false,
        timestamp: new Date(),
        type: response.type
      };
      
      setMessages(prev => [...prev, userMessage, botMessage]);
    } catch (error) {
      console.error('Error getting contextual response:', error);
      // Fallback response
      const fallbackMessage: Message = {
        id: messages.length + 2,
        text: "Disculpa, estoy procesando mucha información. ¿Podrías repetir tu pregunta?",
        isUser: false,
        timestamp: new Date(),
        type: 'normal'
      };
      setMessages(prev => [...prev, userMessage, fallbackMessage]);
    }

    setInputText('');
  };

  const handleQuickAction = (action: string) => {
    setInputText(action);
  };

  const getMessageStyle = (message: Message) => {
    if (message.isUser) {
      return isDark
        ? 'bg-purple-600 text-white shadow-dark-neumorph'
        : 'bg-purple-500 text-white shadow-neumorph';
    }
    
    switch (message.type) {
      case 'recommendation':
        return isDark
          ? 'bg-blue-800 bg-opacity-50 text-blue-200 shadow-dark-neumorph border border-blue-600'
          : 'bg-blue-50 text-blue-800 shadow-neumorph border border-blue-200';
      case 'achievement':
        return isDark
          ? 'bg-green-800 bg-opacity-50 text-green-200 shadow-dark-neumorph border border-green-600'
          : 'bg-green-50 text-green-800 shadow-neumorph border border-green-200';
      default:
        return isDark
          ? 'bg-gray-700 text-white shadow-dark-neumorph'
          : 'bg-gray-100 text-gray-800 shadow-neumorph';
    }
  };

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
        {/* AI Indicator */}
        <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ${
          isDark ? 'bg-purple-600' : 'bg-purple-500'
        }`}>
          <Zap size={12} className="text-white" />
        </div>
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className={`fixed bottom-28 right-6 z-40 w-96 h-[500px] rounded-2xl overflow-hidden transition-all duration-300 ${
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
              <div>
                <h3 className={`font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                  Apolo AI
                </h3>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Entrenador Personal Inteligente
                </p>
              </div>
              <div className="ml-auto">
                <Award size={16} className="text-yellow-500" />
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 p-4 space-y-4 overflow-y-auto h-80">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-xs px-4 py-3 rounded-2xl text-sm ${getMessageStyle(message)}`}>
                  {message.text}
                  {message.type === 'recommendation' && (
                    <div className="mt-2 flex items-center space-x-1">
                      <TrendingUp size={12} />
                      <span className="text-xs opacity-75">Recomendación AI</span>
                    </div>
                  )}
                  {message.type === 'achievement' && (
                    <div className="mt-2 flex items-center space-x-1">
                      <Award size={12} />
                      <span className="text-xs opacity-75">¡Logro desbloqueado!</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="p-3 space-y-2 border-t border-opacity-20">
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
                  <span className="truncate">{action.text.replace('//', '')}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className={`p-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Pregúntame sobre fitness, nutrición o bienestar..."
                className={`flex-1 px-4 py-3 rounded-xl text-sm border-none outline-none ${
                  isDark
                    ? 'bg-gray-700 text-white placeholder-gray-400 shadow-dark-neumorph'
                    : 'bg-gray-50 text-gray-800 placeholder-gray-500 shadow-neumorph'
                }`}
              />
              <button
                onClick={sendMessage}
                className={`p-3 rounded-xl transition-all ${
                  isDark
                    ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-dark-neumorph'
                    : 'bg-purple-500 hover:bg-purple-600 text-white shadow-neumorph'
                }`}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}