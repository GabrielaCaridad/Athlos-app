import React from 'react';
import { Sun, Moon } from 'lucide-react';

// Interfaz que define las props del componente
interface ThemeToggleProps {
  isDark: boolean; // Estado actual del tema (true = oscuro, false = claro)
  toggle: () => void; // Función para alternar entre temas
}

/**
 Componente ThemeToggle 
 botón toggle que permite alternar entre modo claro y oscuro.

 * @param isDark - Booleano que indica el tema actual
 * @param toggle - Función callback para cambiar el tema
 */
export default function ThemeToggle({ isDark, toggle }: ThemeToggleProps) {
  return (
    <button
      onClick={toggle} // Ejecuta la función toggle al hacer click
      className={`relative w-14 h-8 rounded-full p-1 transition-all duration-300 ${
        // Estilos adaptativos: fondo y sombras cambian según el tema
        isDark 
          ? 'bg-gray-700 shadow-dark-neumorph' // Tema oscuro: gris oscuro con sombras para modo oscuro
          : 'bg-gray-200 shadow-neumorph' // Tema claro: gris claro con sombras estándar
      }`}
    >
      {/* Botón deslizante interno que se mueve de un lado a otro */}
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 transform ${
          isDark 
            // En modo oscuro: se desliza a la derecha (translate-x-6) con estilos oscuros
            ? 'translate-x-6 bg-gray-800 shadow-dark-neumorph' 
            // En modo claro: posición inicial (translate-x-0) con estilos claros
            : 'translate-x-0 bg-white shadow-neumorph'
        }`}
      >
        {/* Icono dinámico que cambia según el tema actual */}
        {isDark ? (
          // Modo oscuro: muestra luna púrpura
          <Moon size={14} className="text-purple-400" />
        ) : (
          // Modo claro: muestra sol amarillo
          <Sun size={14} className="text-yellow-500" />
        )}
      </div>
    </button>
  );
}