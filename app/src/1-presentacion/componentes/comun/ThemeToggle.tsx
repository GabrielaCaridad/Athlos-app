/**
 * Interruptor de tema (claro/oscuro)
 *
 * Uso
 * - Recibe `isDark` y `toggle` desde el contenedor para no acoplarse a ningún store.
 * - No persiste estado: solo dispara `toggle()` cuando se hace click.
 *
 * Accesibilidad
 * - El botón usa un ícono (Sol/Luna) y animación de “thumb” para indicar estado.
 */
// ThemeToggle: interruptor de tema claro/oscuro para la app.
import { Sun, Moon } from 'lucide-react';

interface ThemeToggleProps {
  isDark: boolean;
  toggle: () => void;
}
export default function ThemeToggle({ isDark, toggle }: ThemeToggleProps) {
  return (
    <button
      onClick={toggle}
      className={`relative w-14 h-8 rounded-full p-1 transition-all duration-300 ${
        isDark 
          ? 'bg-gray-700 shadow-dark-neumorph'
          : 'bg-gray-200 shadow-neumorph'
      }`}
    >
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 transform ${
          isDark 
            ? 'translate-x-6 bg-gray-800 shadow-dark-neumorph' 
            : 'translate-x-0 bg-white shadow-neumorph'
        }`}
      >
        {isDark ? (
          <Moon size={14} className="text-purple-400" />
        ) : (
          <Sun size={14} className="text-yellow-500" />
        )}
      </div>
    </button>
  );
}