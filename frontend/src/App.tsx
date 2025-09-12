import React, { useState } from 'react'; 
import { Home, Utensils, Dumbbell, Trophy, Menu, X } from 'lucide-react';
import { useAuth } from './presentation/hooks/useAuth';
import AuthForm from './presentation/components/auth/AuthForm';       
import LoadingScreen from './presentation/components/auth/LoadingScreen';
import UserProfile from './presentation/components/common/UserProfile'; 
import ThemeToggle from './presentation/components/common/ThemeToggle'; 
import FoodTracker from './presentation/components/food/FoodTracker';
import WorkoutTracker from './presentation/components/workout/WorkoutTracker';

type ActiveTab = 'dashboard' | 'food' | 'workouts' | 'wellness' | 'achievements';

function App() {
  // useAuth es un hook personalizado que controla la autenticación.
  // Devuelve el usuario (user), si está cargando (loading) y si está autenticado (isAuthenticated).
  const { user, loading, isAuthenticated } = useAuth();

  // Estado local para saber qué pestaña está activa (dashboard por defecto).
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // Estado para modo oscuro/clare (true = oscuro).
  const [isDark, setIsDark] = useState(false);

  // Estado para controlar si el menú lateral en mobile está abierto.
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Si todavía estamos comprobando la autenticación, mostramos pantalla de carga.
  if (loading) {
    return <LoadingScreen isDark={isDark} />;
  }

  // Si no está autenticado, mostramos el formulario de login y no renderizamos la app.
  if (!isAuthenticated) {
    return <AuthForm isDark={isDark} onAuthSuccess={() => {}} />;
  }

  // Lista de navegación para el sidebar. Cada entrada tiene un id (coincide con ActiveTab), un nombre y un icono.
  const navigation = [
    { id: 'dashboard', name: 'Dashboard', icon: Home },
    { id: 'food', name: 'Alimentación', icon: Utensils },
    { id: 'workouts', name: 'Entrenamientos', icon: Dumbbell },
    { id: 'wellness', name: 'Bienestar', icon: Trophy },
    { id: 'achievements', name: 'Logros', icon: Trophy },
  ];

  // Función que renderiza el contenido principal según la pestaña activa.
  const renderContent = () => {
    switch (activeTab) {
      case 'food':
        // Muestra el componente encargado del seguimiento de alimentación.
        return <FoodTracker isDark={isDark} />;
      
      case 'dashboard':
        // Vista principal / bienvenida con información básica del usuario.
        return (
          <div className={`text-center py-20 ${isDark ? 'text-white' : 'text-gray-800'}`}>
            {/* Contenedor con icono grande */}
            <div className={`w-16 h-16 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg`}>
              <Home size={28} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-4">
              Bienvenido a Athlos, {user?.displayName || 'Usuario'}
            </h2>
            <p className={`text-lg mb-6 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              Tu centro de control para una vida saludable
            </p>

            {/* Tarjeta con información del usuario */}
            <div className={`max-w-md mx-auto p-6 rounded-2xl ${
              isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
            }`}>
              <h3 className="text-lg font-semibold mb-3">Información del Usuario</h3>
              <p className={`text-sm mb-2 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                <strong>Nombre:</strong> {user?.displayName || 'No disponible'}
              </p>
              <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                <strong>Email:</strong> {user?.email}
              </p>
            </div>
          </div>
        );
      
      case 'workouts':
        return <WorkoutTracker isDark={isDark} />;
      
      case 'wellness':
        // Placeholder para la sección de bienestar.
        return (
          <div className={`text-center py-20 ${isDark ? 'text-white' : 'text-gray-800'}`}>
            <div className={`w-16 h-16 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center shadow-lg`}>
              <Trophy size={28} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-4">Bienestar</h2>
            <p className={`text-lg ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              Esta sección estará disponible próximamente
            </p>
          </div>
        );
      
      case 'achievements':
        // Placeholder para logros.
        return (
          <div className={`text-center py-20 ${isDark ? 'text-white' : 'text-gray-800'}`}>
            <div className={`w-16 h-16 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center shadow-lg`}>
              <Trophy size={28} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-4">Logros</h2>
            <p className={`text-lg ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              Esta sección estará disponible próximamente
            </p>
          </div>
        );
      
      default:
        // Mensaje por si `activeTab` no coincide con ninguno (defensa).
        return (
          <div className={`text-center py-20 ${isDark ? 'text-white' : 'text-gray-800'}`}>
            <h2 className="text-2xl font-bold mb-4">Página no encontrada</h2>
            <p className={`text-lg ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
              La sección que buscas no está disponible
            </p>
          </div>
        );
    }
  };

  return (
    // Contenedor principal que cambia el fondo según `isDark`.
    <div className={`min-h-screen transition-all duration-500 ${
      isDark ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      <div className="flex h-screen overflow-hidden">
        {/* Overlay que aparece cuando el menú móvil está abierto. */}
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-64 transition-all duration-300 ${
          isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
        }`}>
          <div className="flex flex-col h-full">
            {/* Logo y botón de cerrar en mobile */}
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

            {/* Navegación: mapeamos el array `navigation` para generar botones */}
            <nav className="flex-1 p-4 space-y-2">
              {navigation.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    // Cambiamos la pestaña activa y cerramos el menú móvil si corresponde.
                    setActiveTab(item.id as ActiveTab);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${
                    activeTab === item.id
                      ? isDark
                        ? 'bg-purple-600 text-white shadow-dark-neumorph'
                        : 'bg-purple-500 text-white shadow-neumorph'
                      : isDark
                      ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                  }`}>
                  {/* Cada item tiene un icono dinámico */}
                  <item.icon size={20} />
                  <span className="font-medium">{item.name}</span>
                </button>
              ))}
            </nav>

            {/* Perfil de usuario (componente separado) */}
            <UserProfile isDark={isDark} />

            {/* Toggle de tema */}
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
              
              {/* Título dinámico según la pestaña activa */}
              <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                {navigation.find(nav => nav.id === activeTab)?.name}
              </h2>
              
              <div className="w-10" /> {/* Espacio para centrar el título */}
            </div>
          </header>

          {/* Area de la página donde se muestra el contenido */}
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl mx-auto">
              {renderContent()}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
