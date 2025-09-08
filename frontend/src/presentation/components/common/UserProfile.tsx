
import { LogOut, User, Settings } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

// Interfaz que define las props del componente
interface UserProfileProps {
  isDark: boolean; // Determina si usar el tema oscuro
}

/*
 Componente UserProfile - Widget del perfil de usuario
  @param isDark - Booleano que indica si usar tema oscuro
 */
export default function UserProfile({ isDark }: UserProfileProps) {
  // Obtiene información y funciones del usuario actual usando el hook personalizado
  const { user, logout } = useAuth();

  return (
    // Container principal con borde superior sutil
    <div className={`p-4 border-t border-opacity-20 ${
      isDark ? 'border-gray-700' : 'border-gray-200' // Color del borde según tema
    }`}>
      
      {/* Sección de información del usuario */}
      <div className="flex items-center space-x-3 mb-3">
        
        {/* Avatar circular  */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          isDark ? 'bg-purple-600' : 'bg-purple-500' // Color del avatar según tema
        }`}>
          {/* Icono de usuario dentro del avatar */}
          <User size={18} className="text-white" />
        </div>
        
        {/* Información textual del usuario */}
        <div className="flex-1">
          {/* Nombre del usuario (con fallback si no tiene displayName) */}
          <p className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-800'}`}>
            {user?.displayName || 'Usuario'}
          </p>
          
          {/* Email del usuario */}
          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {user?.email}
          </p>
        </div>
      </div>
      
      {/* Sección de botones de acción */}
      <div className="flex space-x-2">
        
        {/* Botón de configuración (placeholder - no implementado aún) */}
        <button
          className={`flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-sm transition-all ${
            isDark
              ? 'hover:bg-gray-700 text-gray-300 hover:text-white' // Estilos hover tema oscuro
              : 'hover:bg-gray-100 text-gray-600 hover:text-gray-800' // Estilos hover tema claro
          }`}
        >
          <Settings size={14} />
          <span>Config</span>
        </button>
        
        {/* Botón de logout */}
        <button
          onClick={logout} // Ejecuta la función logout del hook useAuth
          className={`flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-sm transition-all ${
            isDark
              // Tema oscuro: hover rojo oscuro
              ? 'hover:bg-red-900 text-gray-300 hover:text-red-300'
              // Tema claro: hover rojo claro
              : 'hover:bg-red-50 text-gray-600 hover:text-red-600'
          }`}
        >
          <LogOut size={14} />
          <span>Salir</span>
        </button>
      </div>
    </div>
  );
}
