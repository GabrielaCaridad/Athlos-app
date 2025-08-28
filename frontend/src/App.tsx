import React, { useState } from 'react';
import { Home, Utensils, Dumbbell, Trophy, Menu, X } from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import AuthForm from './components/AuthForm';
import LoadingScreen from './components/LoadingScreen';
import UserProfile from './components/UserProfile';
/*import Dashboard from './components/Dashboard';
import FoodTracker from './components/FoodTracker';
import WorkoutTracker from './components/WorkoutTracker';
import Gamification from './components/Gamification';
import WellnessTracker from './components/WellnessTracker';
import ChatBot from './components/ChatBot';*/
import ThemeToggle from './components/ThemeToggle';

type ActiveTab = 'dashboard' | 'food' | 'workouts' | 'wellness' | 'achievements';

function App() {
  const { user, loading, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isDark, setIsDark] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Show loading screen while checking authentication
  if (loading) {
    return <LoadingScreen isDark={isDark} />;
  }

  // Show auth form if user is not authenticated
  if (!isAuthenticated) {
    return <AuthForm isDark={isDark} onAuthSuccess={() => {}} />;
  }

  const navigation = [
    { id: 'dashboard', name: 'Dashboard', icon: Home },
    { id: 'food', name: 'Alimentación', icon: Utensils },
    { id: 'workouts', name: 'Entrenamientos', icon: Dumbbell },
    { id: 'wellness', name: 'Bienestar', icon: Trophy },
    { id: 'achievements', name: 'Logros', icon: Trophy },
  ];

  /*const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard isDark={isDark} />;
      case 'food':
        return <FoodTracker isDark={isDark} />;
      case 'workouts':
        return <WorkoutTracker isDark={isDark} />;
      case 'wellness':
        return <WellnessTracker isDark={isDark} />;
      case 'achievements':
        return <Gamification isDark={isDark} />;
      default:
        return <Dashboard isDark={isDark} />;
    }
  };*/

  return (
    <div className={`min-h-screen transition-all duration-500 ${
      isDark ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      <div className="flex h-screen overflow-hidden">
        {/* Mobile Menu Overlay */}
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
            {/* Logo */}
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
                }`}
              >
                <X size={20} className={isDark ? 'text-white' : 'text-gray-800'} />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-2">
              {navigation.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
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
                  }`}
                >
                  <item.icon size={20} />
                  <span className="font-medium">{item.name}</span>
                </button>
              ))}
            </nav>

            {/* User Profile */}
            <UserProfile isDark={isDark} />

            {/* Theme Toggle */}
            <div className={`p-4 border-t border-opacity-20 ${
              isDark ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                  {isDark ? 'Modo Oscuro' : 'Modo Claro'}
                </span>
                <ThemeToggle isDark={isDark} toggle={() => setIsDark(!isDark)} />
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Bar */}
          <header className={`${
            isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
          } px-6 py-4 border-b border-opacity-20`}>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setIsMobileMenuOpen(true)}
                className={`lg:hidden p-2 rounded-lg ${
                  isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                }`}
              >
                <Menu size={20} className={isDark ? 'text-white' : 'text-gray-800'} />
              </button>
              
              <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-800'}`}>
                {navigation.find(nav => nav.id === activeTab)?.name}
              </h2>
              
              <div className="w-10" /> {/* Spacer for centering */}
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-auto p-6">
            <div className="max-w-7xl mx-auto">
              {renderContent()}
            </div>
          </main>
        </div>

        {/* ChatBot */}
       
      </div>
    </div>
  );
}

export default App;