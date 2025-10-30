/**
 * Pantalla de carga inicial
 * - Se muestra mientras se resuelve el estado de autenticación (AuthProvider).
 * - Usa animaciones suaves y respeta el modo `isDark`.
 */
// LoadingScreen: pantalla de carga inicial mientras se resuelve la autenticación.
import { Dumbbell } from 'lucide-react';

interface LoadingScreenProps {
  isDark: boolean;
}
export default function LoadingScreen({ isDark }: LoadingScreenProps) {
  return (
    <div className={`min-h-screen flex items-center justify-center transition-all duration-500 ${
      isDark ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      <div className="text-center">
        <div className={`w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg animate-pulse`}>
          <Dumbbell size={32} className="text-white animate-bounce" />
        </div>
        <h1 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Athlos
        </h1>
        <div className={`w-32 h-1 mx-auto rounded-full ${
          isDark ? 'bg-gray-700' : 'bg-gray-200'
        }`}>
          <div className="w-full h-1 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-pulse" />
        </div>
      </div>
    </div>
  );
}