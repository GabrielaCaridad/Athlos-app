
// App: contenedor principal de la interfaz.
// - Muestra login o la aplicación según autenticación.
// - Gestiona navegación entre Alimentación y Entrenamientos.
// - Aplica tema claro/oscuro.
import { useState } from 'react';
import { Home, Utensils, Dumbbell,Menu, X, TrendingUp } from 'lucide-react';
import { Routes, Route, useLocation, Navigate, NavLink } from 'react-router-dom';
import CorrelationsDashboard from './componentes/correlaciones/CorrelationsDashboard';

import PanelProgreso from './componentes/progreso/PanelProgreso';
import { useAuth } from './hooks/useAuth';
import AuthForm from './componentes/auth/AuthForm';       
import LoadingScreen from './componentes/auth/LoadingScreen';
import UserProfile from './componentes/comun/UserProfile'; 
import ThemeToggle from './componentes/comun/ThemeToggle'; 
import FoodTracker from './componentes/alimentacion/FoodTracker';
import WorkoutTracker from './componentes/entrenamiento/WorkoutTracker';
import ToastHost from './componentes/comun/ToastHost';
import ChatBot from './componentes/chatbot/ChatBot';
import Dashboard from './componentes/dashboard/Dashboard';
import ConfiguracionPage from './componentes/configuracion/ConfiguracionPage';

function App() {
  const { loading, isAuthenticated } = useAuth();
  const [isDark, setIsDark] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  if (loading) {
    return <LoadingScreen isDark={isDark} />;
  }
  if (!isAuthenticated) {
    return <AuthForm isDark={isDark} onAuthSuccess={() => {}} />;
  }
  const navigation = [
    { path: '/dashboard', name: 'Dashboard', icon: Home },
    { path: '/food', name: 'Alimentación', icon: Utensils },
    { path: '/progreso', name: 'Mi Progreso', icon: TrendingUp },
    { path: '/correlations', name: 'Correlaciones', icon: TrendingUp },
    { path: '/workouts', name: 'Entrenamientos', icon: Dumbbell },
 
  ] as const;

  return (
    <div className={`min-h-screen transition-all duration-500 ${
      isDark ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      {/* Portal global de toasts */}
      <ToastHost />
      <div className="flex h-screen overflow-hidden">
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        <div className={`${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-64 transition-all duration-300 ${
          isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
        }`}>
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-6 border-b border-opacity-20">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
                  <Dumbbell size={20} className="text-white" />
                </div>
                <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                  Athlos
                </h1>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className={`lg:hidden p-2 rounded-lg ${
                  isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                }`}>
                <X size={20} className={isDark ? 'text-white' : 'text-gray-800'} />
              </button>
            </div>

            <nav className="flex-1 p-4 space-y-2">
              {navigation.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={({ isActive }) => `w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                    isActive
                      ? isDark
                        ? 'bg-purple-600 text-white shadow-dark-neumorph'
                        : 'bg-purple-500 text-white shadow-neumorph'
                      : isDark
                      ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                  }`}
                >
                  <item.icon size={20} />
                  <span className="font-medium">{item.name}</span>
                </NavLink>
              ))}

              {/* Config removido de la lista principal (se mantiene abajo junto al perfil) */}
            </nav>

            <UserProfile isDark={isDark} />

            <div className={`p-4 border-t border-opacity-20 ${
              isDark ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {isDark ? 'Modo Oscuro' : 'Modo Claro'}
                </span>
                {/* ThemeToggle es un componente que recibe el estado y una función para cambiarlo */}
                <ThemeToggle isDark={isDark} toggle={() => setIsDark(!isDark)} />
              </div>
            </div>
          </div>
        </div>

        {/* Contenido principal */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Barra superior */}
          <header className={`${
            isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
          } px-6 py-4 border-b border-opacity-20`}>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className={`lg:hidden p-2 rounded-lg ${
                  isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                }`}>
                <Menu size={20} className={isDark ? 'text-white' : 'text-gray-800'} />
              </button>
              
              {/* Título dinámico según la ruta actual */}
              <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                {location.pathname === '/config'
                  ? 'Configuración'
                  : navigation.find(nav => nav.path === location.pathname)?.name}
              </h2>
              
              <div className="w-10" /> {/* Espacio para centrar el título */}
            </div>
          </header>

          {/* Area de la página donde se muestra el contenido */}
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl mx-auto">
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" />} />
                <Route path="/dashboard" element={<Dashboard isDark={isDark} />} />
                <Route path="/progreso" element={<PanelProgreso isDark={isDark} />} />
                <Route path="/correlations" element={<CorrelationsDashboard isDark={isDark} />} />
                <Route path="/food" element={<FoodTracker isDark={isDark} />} />
                <Route path="/workouts" element={<WorkoutTracker isDark={isDark} />} />
                <Route path="/config" element={<ConfiguracionPage isDark={isDark} />} />
                <Route path="*" element={
                  <div className={`text-center py-20 ${isDark ? 'text-white' : 'text-gray-800'}`}>
                    <h2 className="text-2xl font-bold mb-4">Página no encontrada</h2>
                    <p className={`text-lg ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      La sección que buscas no está disponible
                    </p>
                  </div>
                } />
              </Routes>
            </div>
          </main>
          <ChatBot isDark={isDark} />
        </div>
      </div>
    </div>
  );
}

export default App;
