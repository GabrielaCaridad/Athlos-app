/**
 * Página de Configuración
 *
 * Qué permite
 * - Editar datos del perfil (nombre, fecha de nacimiento, género, peso/altura).
 * - Definir objetivos, nivel de actividad y peso objetivo (según meta).
 * - Ver métricas calculadas (IMC, calorías objetivo y macros) cuando hay datos suficientes.
 *
 * Flujo de datos
 * - Lee/escribe perfil en Firestore vía userService; maneja perfiles inexistentes creando uno básico.
 * - Al guardar, si hay peso válido, intenta auto-registrarlo.
 * - Si el perfil está completo, inicializa personalización (calorías y macros) y recalcula métricas para mostrar.
 */
import { useState, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { UserProfile } from '../../../3-acceso-datos/firebase/firestoreService';
import { userService, autoRegistroDesdeConfiguracion } from '../../../2-logica-negocio/servicios';

interface Props { isDark: boolean }

export default function ConfiguracionPage({ isDark }: Props) {
  const { user, updateUserProfile, updateUserDisplayName } = useAuth();
  
  // Estados
  const [activeTab, setActiveTab] = useState<'perfil' | 'objetivos' | 'preferencias'>('perfil');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [calculatedMetrics, setCalculatedMetrics] = useState<{
    bmi?: { value: number; category: string };
    dailyCalories?: number;
    macros?: { protein: number; carbs: number; fats: number };
  } | null>(null);
  
  // Cargar datos del usuario (maneja perfiles antiguos y nuevos)
  useEffect(() => {
    if (!user?.uid) return;

    const loadProfile = async () => {
      try {
        setLoading(true);
        console.log('🔍 Cargando perfil para usuario:', user.uid);

        const userProfile = await userService.getUserProfile(user.uid);

        if (userProfile) {
          // ✅ Perfil existe, usarlo
          console.log('✅ Perfil encontrado:', userProfile);
          const __p: Record<string, unknown> = userProfile as unknown as Record<string, unknown>;
          console.log('🎯 [Config] Calorías objetivo del perfil:', __p['dailyCalorieTarget']);
          console.log('🎯 [Config] Perfil completo:', {
            weight: __p['currentWeight'],
            height: __p['height'],
            goal: __p['primaryGoal'],
            activityLevel: __p['activityLevel'],
            dailyCalorieTarget: __p['dailyCalorieTarget']
          });
          setProfile(userProfile);

          // Solo calcular métricas si tiene TODOS los datos necesarios
          const { currentWeight, height, dateOfBirth, gender, activityLevel, primaryGoal } = userProfile;
          if (currentWeight && height && dateOfBirth && gender && activityLevel && primaryGoal) {
            try {
              const age = userService.calculateAge(dateOfBirth);
              const bmr = userService.calculateBMR(currentWeight, height, age, gender);
              const tdee = userService.calculateTDEE(bmr, activityLevel);
              const dailyCalories = userService.calculateCalorieTarget(tdee, primaryGoal);
              const macros = userService.calculateMacros(dailyCalories, primaryGoal, currentWeight);
              const bmiCalc = userService.calculateBMI(height, currentWeight);
              setCalculatedMetrics({ bmi: { value: bmiCalc.bmi, category: bmiCalc.category }, dailyCalories, macros });
              console.log('✅ Métricas calculadas:', { bmi: bmiCalc, dailyCalories, macros });
              // IMC verificación detallada
              const heightInMeters = height / 100;
              const imcRaw = currentWeight / (heightInMeters ** 2);
              const getIMCCategory = (imc: number) => {
                if (imc < 18.5) return 'Bajo peso';
                if (imc < 25) return 'Normal';
                if (imc < 30) return 'Sobrepeso';
                return 'Obesidad';
              };
              console.log('📏 [IMC] Cálculo:', {
                peso: currentWeight,
                altura: height,
                alturaMetros: heightInMeters,
                imc: imcRaw.toFixed(1),
                categoria: getIMCCategory(imcRaw)
              });
            } catch (calcError) {
              console.warn('⚠️ Error calculando métricas (datos incompletos):', calcError);
            }
          } else {
            console.log('ℹ️ Perfil encontrado pero faltan datos para calcular métricas');
          }
        } else {
          // ⚠️ Perfil no existe, crear uno básico
          console.log('⚠️ Perfil no encontrado, creando perfil básico...');
          const basicProfileData: Omit<UserProfile, 'id' | 'userId' | 'createdAt'> = {
            displayName: user.displayName || 'Usuario',
            email: user.email || '',
            goals: [],
            level: 1,
            xp: 0
          };
          try {
            await userService.createUserProfile(user.uid, basicProfileData);
            console.log('✅ Perfil básico creado');
            const created = await userService.getUserProfile(user.uid);
            if (created) setProfile(created);
          } catch (createError) {
            console.error('❌ Error creando perfil:', createError);
            // Fallback: set mínima estructura en memoria para no romper UI
            setProfile({
              userId: user.uid,
              displayName: user.displayName || 'Usuario',
              email: user.email || '',
              goals: [],
              level: 1,
              xp: 0,
              createdAt: Timestamp.now()
            } as UserProfile);
          }
        }
      } catch (error) {
        console.error('❌ Error en loadProfile:', error);
        // Fallback: crear perfil básico en memoria aunque falle la carga
        setProfile({
          userId: user.uid,
          displayName: user.displayName || 'Usuario',
          email: user.email || '',
          goals: [],
          level: 1,
          xp: 0,
          createdAt: Timestamp.now()
        } as UserProfile);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);
  
  // Guardar cambios
  const handleSave = async () => {
    if (!user?.uid || !profile) return;
    
    try {
      setSaving(true);
      setSuccessMessage('');
      
      // Guardar cambios básicos en Firestore
      await userService.updateUserProfile(user.uid, profile);

      // Auto-registro de peso si viene definido
      if (typeof profile.currentWeight === 'number' && profile.currentWeight >= 30 && profile.currentWeight <= 300) {
        try {
          await autoRegistroDesdeConfiguracion(user.uid, profile.currentWeight);
        } catch (e) {
          console.warn('No se pudo auto-registrar el peso desde Configuración:', e);
        }
      }

      // Actualizar inmediatamente el nombre en Firebase Auth + contexto para reflejarse en toda la app
      if (profile.displayName && profile.displayName !== (user.displayName || '')) {
        try {
          if (updateUserDisplayName) {
            await updateUserDisplayName(profile.displayName);
          } else {
            await updateUserProfile({ displayName: profile.displayName });
          }
        } catch (e) {
          console.warn('⚠️ No se pudo actualizar displayName en Auth inmediatamente:', e);
        }
      }
      
      // Si tiene todos los datos, calcular métricas nutricionales
      const { currentWeight, height, dateOfBirth, gender, activityLevel, primaryGoal } = profile;
      
      if (currentWeight && height && dateOfBirth && gender && activityLevel && primaryGoal) {
        // Inicializa valores derivados personalizados (p. ej. targets de calorías) en Firestore
        // Inicializar personalización (calcula calorías y macros)
        await userService.initializePersonalization(user.uid, profile);
        
        // Recalcular métricas para mostrar
        const age = userService.calculateAge(dateOfBirth);
        const bmr = userService.calculateBMR(currentWeight, height, age, gender);
        const tdee = userService.calculateTDEE(bmr, activityLevel);
        const dailyCalories = userService.calculateCalorieTarget(tdee, primaryGoal);
        const macros = userService.calculateMacros(dailyCalories, primaryGoal, currentWeight);
        const bmiCalc = userService.calculateBMI(height, currentWeight);
        
        setCalculatedMetrics({ bmi: { value: bmiCalc.bmi, category: bmiCalc.category }, dailyCalories, macros });
        
        setSuccessMessage('✅ Cambios guardados y métricas calculadas correctamente');
      } else {
        setSuccessMessage('✅ Cambios guardados. Completa todos los campos para ver métricas calculadas.');
      }
      
      setTimeout(() => setSuccessMessage(''), 5000);
      
    } catch (error) {
      console.error('Error guardando perfil:', error);
      alert('Error al guardar cambios');
    } finally {
      setSaving(false);
    }
  };
  
  // Actualizar campo del perfil
  const updateField = <K extends keyof UserProfile>(field: K, value: UserProfile[K]) => {
    setProfile(prev => (prev ? { ...prev, [field]: value } : null));
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }
  
  if (!profile) {
    return (
      <div className="p-8 text-center">
        <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>
          Error cargando perfil
        </p>
      </div>
    );
  }
  
  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
          ⚙️ Configuración
        </h1>
        <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Administra tu perfil y preferencias
        </p>
      </div>
      
      {/* Mensaje de éxito */}
      {successMessage && (
        <div className={`mb-4 p-4 rounded-lg border ${
          isDark 
            ? 'bg-green-900/20 border-green-700 text-green-400' 
            : 'bg-green-100 border-green-200 text-green-800'
        }`}>
          {successMessage}
        </div>
      )}

      {/* Mensaje informativo si el perfil está incompleto */}
      {!calculatedMetrics && !loading && profile && (
        <div className={`mb-4 p-4 rounded-lg border ${
          isDark 
            ? 'bg-blue-900/20 border-blue-700 text-blue-400' 
            : 'bg-blue-100 border-blue-200 text-blue-800'
        }`}>
          ℹ️ Completa todos los campos de tu perfil para ver tus métricas personalizadas (IMC, calorías objetivo, etc.)
        </div>
      )}
      
      {/* Tabs */}
      <div className={`flex gap-2 mb-6 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <button
          onClick={() => setActiveTab('perfil')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'perfil'
              ? isDark
                ? 'border-purple-500 text-purple-400'
                : 'border-purple-600 text-purple-600'
              : isDark
                ? 'border-transparent text-gray-400 hover:text-gray-200'
                : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}>
          👤 Perfil
        </button>
        
        <button
          onClick={() => setActiveTab('objetivos')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            activeTab === 'objetivos'
              ? isDark
                ? 'border-purple-500 text-purple-400'
                : 'border-purple-600 text-purple-600'
              : isDark
                ? 'border-transparent text-gray-400 hover:text-gray-200'
                : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}>
          🎯 Objetivos
        </button>
        
      </div>
      
      {/* Contenido de las pestañas */}
      <div className={`p-6 rounded-2xl ${
        isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
      }`}>
        
        {/* PESTAÑA: PERFIL */}
        {activeTab === 'perfil' && (
          <div className="space-y-6">
            <h2 className={`text-xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Información Personal
            </h2>
            
            {/* Nombre */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Nombre de usuario / Apodo
              </label>
              <input
                type="text"
                value={profile.displayName || ''}
                onChange={(e) => updateField('displayName', e.target.value)}
                className={`w-full px-4 py-2 rounded-lg border ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                } focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                placeholder="¿Cómo quieres que te llame?"
              />
              <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                Este nombre aparecerá en los saludos de la app
              </p>
            </div>
            
            {/* Email (solo lectura) */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Email
              </label>
              <input
                type="email"
                value={profile.email}
                disabled
                className={`w-full px-4 py-2 rounded-lg border ${
                  isDark
                    ? 'bg-gray-900 border-gray-700 text-gray-500'
                    : 'bg-gray-100 border-gray-300 text-gray-500'
                } cursor-not-allowed`}
              />
              <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                El email no se puede modificar
              </p>
            </div>
            
            {/* Fecha de nacimiento */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Fecha de nacimiento
              </label>
              <input
                type="date"
                value={profile.dateOfBirth || ''}
                onChange={(e) => updateField('dateOfBirth', e.target.value)}
                className={`w-full px-4 py-2 rounded-lg border ${
                  isDark
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                } focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
              />
            </div>
            
            {/* Género */}
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Género
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { value: 'male', label: 'Masculino' },
                  { value: 'female', label: 'Femenino' },
                  { value: 'other', label: 'Otro' },
                  { value: 'prefer_not_to_say', label: 'Prefiero no decir' }
                ].map(option => (
                  <button
                    key={option.value}
                    onClick={() => updateField('gender', option.value as UserProfile['gender'])}
                    className={`px-4 py-2 rounded-lg border-2 transition-all ${
                      profile.gender === option.value
                        ? isDark
                          ? 'border-purple-500 bg-purple-900/30 text-purple-400'
                          : 'border-purple-600 bg-purple-50 text-purple-600'
                        : isDark
                          ? 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-500'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Peso y Altura */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Peso actual (kg)
                </label>
                <input
                  type="number"
                  value={profile.currentWeight ?? ''}
                  onChange={(e) => updateField('currentWeight', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                  className={`w-full px-4 py-2 rounded-lg border ${
                    isDark
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  } focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                  placeholder="75"
                  min="30"
                  max="300"
                  step="0.1"
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Altura (cm)
                </label>
                <input
                  type="number"
                  value={profile.height ?? ''}
                  onChange={(e) => updateField('height', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                  className={`w-full px-4 py-2 rounded-lg border ${
                    isDark
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  } focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                  placeholder="170"
                  min="100"
                  max="250"
                />
              </div>
            </div>
            
            {/* Métricas calculadas */}
            {calculatedMetrics && (
              <div className={`p-4 rounded-xl ${
                isDark 
                  ? 'bg-gradient-to-r from-green-900/20 to-blue-900/20 border border-green-700/50' 
                  : 'bg-gradient-to-r from-green-50 to-blue-50 border border-green-200'
              }`}>
                <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  📊 Tus Métricas Calculadas
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* IMC */}
                  {calculatedMetrics.bmi && (
                    <div>
                      <p className={`text-xs mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        IMC (Índice de Masa Corporal)
                      </p>
                      <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {calculatedMetrics.bmi.value}
                      </p>
                      <p className={`text-xs ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                        {calculatedMetrics.bmi.category}
                      </p>
                    </div>
                  )}
                  
                  {/* Calorías diarias */}
                  {calculatedMetrics.dailyCalories && (
                    <div>
                      <p className={`text-xs mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Calorías Objetivo Diario
                      </p>
                      <p className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        {calculatedMetrics.dailyCalories}
                      </p>
                      <p className={`text-xs ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                        kcal/día
                      </p>
                    </div>
                  )}
                  
                  {/* Macros */}
                  {calculatedMetrics.macros && (
                    <div>
                      <p className={`text-xs mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Distribución de Macros
                      </p>
                      <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        💪 Proteína: {calculatedMetrics.macros.protein}g
                      </p>
                      <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        🍞 Carbos: {calculatedMetrics.macros.carbs}g
                      </p>
                      <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        🥑 Grasas: {calculatedMetrics.macros.fats}g
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* PESTAÑA: OBJETIVOS */}
        {activeTab === 'objetivos' && (
          <div className="space-y-6">
            <h2 className={`text-xl font-bold mb-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Mis Objetivos
            </h2>
            
            {/* Objetivo principal */}
            <div>
              <label className={`block text-sm font-medium mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Objetivo principal
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  { value: 'lose_weight', label: '⬇️ Perder peso', desc: 'Déficit calórico' },
                  { value: 'maintain_weight', label: '➡️ Mantener peso', desc: 'Balance calórico' },
                  { value: 'gain_muscle', label: '⬆️ Ganar masa muscular', desc: 'Superávit calórico' },
                  { value: 'improve_performance', label: '🚀 Mejorar rendimiento', desc: 'Optimizar energía' },
                  { value: 'general_health', label: '💚 Salud general', desc: 'Bienestar integral' }
                ].map(option => (
                  <button
                    key={option.value}
                    onClick={() => updateField('primaryGoal', option.value as UserProfile['primaryGoal'])}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      profile.primaryGoal === option.value
                        ? isDark
                          ? 'border-purple-500 bg-purple-900/30'
                          : 'border-purple-600 bg-purple-50'
                        : isDark
                          ? 'border-gray-600 bg-gray-700 hover:border-gray-500'
                          : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}
                  >
                    <div className={`font-semibold ${
                      profile.primaryGoal === option.value
                        ? isDark ? 'text-purple-400' : 'text-purple-600'
                        : isDark ? 'text-white' : 'text-gray-900'
                    }`}>
                      {option.label}
                    </div>
                    <div className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      {option.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Peso objetivo */}
            {(profile.primaryGoal === 'lose_weight' || profile.primaryGoal === 'gain_muscle') && (
              <div>
                <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Peso objetivo (kg)
                </label>
                <input
                  type="number"
                  value={profile.targetWeight ?? ''}
                  onChange={(e) => updateField('targetWeight', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                  className={`w-full px-4 py-2 rounded-lg border ${
                    isDark
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  } focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                  placeholder="70"
                  min="30"
                  max="300"
                  step="0.1"
                />
              </div>
            )}
            
            {/* Nivel de actividad */}
            <div>
              <label className={`block text-sm font-medium mb-3 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Nivel de actividad
              </label>
              <div className="space-y-2">
                {[
                  { value: 'sedentary', label: 'Sedentario', desc: 'Poco o ningún ejercicio' },
                  { value: 'light', label: 'Ligero', desc: '1-3 días de ejercicio por semana' },
                  { value: 'moderate', label: 'Moderado', desc: '3-5 días de ejercicio por semana' },
                  { value: 'active', label: 'Activo', desc: '6-7 días de ejercicio por semana' },
                  { value: 'very_active', label: 'Muy activo', desc: 'Ejercicio intenso diario' }
                ].map(option => (
                  <button
                    key={option.value}
                    onClick={() => updateField('activityLevel', option.value as UserProfile['activityLevel'])}
                    className={`w-full p-3 rounded-lg border transition-all text-left flex justify-between items-center ${
                      profile.activityLevel === option.value
                        ? isDark
                          ? 'border-purple-500 bg-purple-900/30'
                          : 'border-purple-600 bg-purple-50'
                        : isDark
                          ? 'border-gray-600 bg-gray-700 hover:border-gray-500'
                          : 'border-gray-300 bg-white hover:border-gray-400'
                    }`}
                  >
                    <div>
                      <div className={`font-medium ${
                        profile.activityLevel === option.value
                          ? isDark ? 'text-purple-400' : 'text-purple-600'
                          : isDark ? 'text-white' : 'text-gray-900'
                      }`}>
                        {option.label}
                      </div>
                      <div className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {option.desc}
                      </div>
                    </div>
                    {profile.activityLevel === option.value && (
                      <span className={`text-xl ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        
        
      
        
        {/* Botón de guardar */}
        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              saving
                ? 'bg-gray-400 cursor-not-allowed text-white'
                : isDark
                  ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-xl'
                  : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-xl'
            }`}
          >
            {saving ? 'Guardando...' : '💾 Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
