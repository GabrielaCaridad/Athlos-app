/**
 * Tarjeta de Perfil
 
 * Propósito
 * - Mostrar nombre y correo del usuario autenticado.
 * - Accesos rápidos: ir a Configuración y cerrar sesión.
 */

// UserProfile: muestra info del usuario en la barra lateral y permite cerrar sesión.
import { LogOut, User, Settings } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Link } from 'react-router-dom';

interface UserProfileProps {
  isDark: boolean;
}
export default function UserProfile({ isDark }: UserProfileProps) {
  const { user, logout } = useAuth();

  return (
    <div className={`p-4 border-t border-opacity-20 ${
      isDark ? 'border-gray-700' : 'border-gray-200'
    }`}>
      <div className="flex items-center space-x-3 mb-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
          isDark ? 'bg-purple-600' : 'bg-purple-500'
        }`}>
          <User size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <p className={`font-medium text-sm ${isDark ? 'text-white' : 'text-gray-800'}`}>
            {user?.displayName || 'Usuario'}
          </p>
          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {user?.email}
          </p>
        </div>
      </div>
      <div className="flex space-x-2">
        <Link
          to="/config"
          className={`flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-sm transition-all ${
            isDark
              ? 'hover:bg-gray-700 text-gray-300 hover:text-white'
              : 'hover:bg-gray-100 text-gray-600 hover:text-gray-800'
          }`}
        >
          <Settings size={14} />
          <span>Config</span>
        </Link>
        <button
          onClick={logout}
          className={`flex-1 flex items-center justify-center space-x-2 py-2 px-3 rounded-lg text-sm transition-all ${
            isDark
              ? 'hover:bg-red-900 text-gray-300 hover:text-red-300'
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
