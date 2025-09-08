import React from 'react';
import { Dumbbell } from 'lucide-react';

// Interfaz que define las props que recibe el componente
interface LoadingScreenProps {
  isDark: boolean; // Determina si usar el tema oscuro o claro
}

/*
 Pantalla de carga de la aplicación
 Se muestra mientras la aplicación verifica el estado de autenticación
 del usuario al iniciar. Incluye el logo animado y branding de Athlos.
  @param isDark - indica si usar el tema oscuro
 */
export default function LoadingScreen({ isDark }: LoadingScreenProps) {
  return (
    // Container principal que ocupa toda la pantalla
    <div className={`min-h-screen flex items-center justify-center transition-all duration-500 ${
      isDark ? 'bg-gray-900' : 'bg-gray-50' // Fondo adaptativo al tema
    }`}>
      
      {/* Contenedor central con todos los elementos de carga */}
      <div className="text-center">
        
        {/* Logo principal de la aplicación */}
        <div className={`w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg animate-pulse`}>
          {/* Icono de pesas con animación de rebote */}
          <Dumbbell size={32} className="text-white animate-bounce" />
        </div>
        
        {/* Título de la aplicación */}
        <h1 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>
          Athlos
        </h1>
        
        {/* Barra de progreso animada */}
        <div className={`w-32 h-1 mx-auto rounded-full ${
          isDark ? 'bg-gray-700' : 'bg-gray-200' // Fondo de la barra según el tema
        }`}>
          {/* Barra de progreso con gradiente y animación de pulso */}
          <div className="w-full h-1 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 animate-pulse" />
        </div>
      </div>
    </div>
  );
}