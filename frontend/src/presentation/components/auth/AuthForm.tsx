import React, { useState } from 'react';
import { Eye, EyeOff, Mail, Lock, User, Dumbbell, ArrowRight, Loader } from 'lucide-react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth } from '../../../infrastructure/config/firebase';

// Interfaz que define las props que recibe el componente
interface AuthFormProps {
  isDark: boolean; // Determina cuando usar tema oscuro
  onAuthSuccess: () => void; // Función callback cuando la autenticación es exitosa
}

export default function AuthForm({ isDark, onAuthSuccess }: AuthFormProps) {
  // Estados del componente para manejar la UI y datos del formulario
  const [isLogin, setIsLogin] = useState(true); // Alterna entre modo login y registro
  const [showPassword, setShowPassword] = useState(false); // Controla visibilidad de contraseña
  const [isLoading, setIsLoading] = useState(false); // Estado de carga durante autenticación
  
  // Estado que contiene todos los datos del formulario
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  
  // Estado para manejar errores de validación y autenticación
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Función que valida todos los campos del formulario
  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    // Validación del email
    if (!formData.email) {
      newErrors.email = 'El email es requerido';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }

    // Validación de la contraseña
    if (!formData.password) {
      newErrors.password = 'La contraseña es requerida';
    } else if (formData.password.length < 6) {
      newErrors.password = 'La contraseña debe tener al menos 6 caracteres';
    }

    // Validaciones adicionales para el registro
    if (!isLogin) {
      if (!formData.name) {
        newErrors.name = 'El nombre es requerido';
      }
      if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Las contraseñas no coinciden';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0; // Retorna true si no hay errores
  };

  // Función que maneja el envío del formulario
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); // Previene el comportamiento por defecto del form
    
    // Solo procede si la validación es exitosa
    if (!validateForm()) return;

    setIsLoading(true); // Activa estado de carga
    setErrors({}); // Limpia errores previos

    try {
      if (isLogin) {
        // Proceso de inicio de sesión
        await signInWithEmailAndPassword(auth, formData.email, formData.password);
      } else {
        // Proceso de registro
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
        // Actualiza el perfil del usuario con su nombre
        await updateProfile(userCredential.user, {
          displayName: formData.name
        });
      }
      // Llama al callback de éxito
      onAuthSuccess();
    } catch (error: unknown) {
      // Manejo de errores de Firebase con mensajes personalizados
      let errorMessage = 'Error de autenticación';

      if (error && typeof error === 'object' && 'code' in error) {
        const firebaseError = error as { code: string };
        // Mapeo de códigos de error de Firebase a mensajes 
        errorMessage = firebaseError.code === 'auth/user-not-found' 
          ? 'Usuario no encontrado'
          : firebaseError.code === 'auth/wrong-password'
          ? 'Contraseña incorrecta'
          : firebaseError.code === 'auth/email-already-in-use'
          ? 'Este email ya está registrado'
          : firebaseError.code === 'auth/weak-password'
          ? 'La contraseña es muy débil'
          : 'Error de autenticación';
      }
      
      setErrors({ general: errorMessage });
    } finally {
      setIsLoading(false); // Desactiva estado de carga
    }
  };

  // Función para manejar cambios en los campos del formulario
  const handleInputChange = (field: string, value: string) => {
    // Actualiza el valor del campo
    setFormData(prev => ({ ...prev, [field]: value }));
    // Limpia el error del campo si existe
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    // Container principal con transiciones suaves y tema adaptativo
    <div className={`min-h-screen flex items-center justify-center p-4 transition-all duration-500 ${
      isDark ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      {/* Card principal del formulario con efectos neumórficos */}
      <div className={`w-full max-w-md transition-all duration-300 ${
        isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
      } rounded-3xl p-8`}>
        
        {/* Sección del logo y encabezado */}
        <div className="text-center mb-8">
          {/* Logo de la aplicación */}
          <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
            <Dumbbell size={28} className="text-white" />
          </div>
          {/* Título de la aplicación */}
          <h1 className={`text-3xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>
            Athlos
          </h1>
          {/* Subtítulo dinámico según el modo */}
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {isLogin ? 'Bienvenido de vuelta' : 'Comienza tu viaje fitness'}
          </p>
        </div>

        {/* Formulario principal */}
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Campo de nombre (solo visible en modo registro) */}
          {!isLogin && (
            <div className="space-y-2">
              <div className="relative">
                {/* Icono de usuario */}
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User size={18} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                </div>
                {/* Input de nombre con estilos neumórficos */}
                <input
                  type="text"
                  placeholder="Nombre completo"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className={`w-full pl-12 pr-4 py-4 rounded-2xl border-none outline-none transition-all ${
                    isDark
                      ? 'bg-gray-700 text-white placeholder-gray-400 shadow-dark-neumorph focus:shadow-dark-neumorph-hover'
                      : 'bg-gray-50 text-gray-800 placeholder-gray-500 shadow-neumorph focus:shadow-neumorph-hover'
                  } ${errors.name ? 'ring-2 ring-red-400' : ''}`}
                />
              </div>
              {/* Mensaje de error para el campo nombre */}
              {errors.name && (
                <p className="text-red-400 text-sm ml-2">{errors.name}</p>
              )}
            </div>
          )}

          {/* Campo de email */}
          <div className="space-y-2">
            <div className="relative">
              {/* Icono de email */}
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail size={18} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
              </div>
              {/* Input de email */}
              <input
                type="email"
                placeholder="Correo electrónico"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className={`w-full pl-12 pr-4 py-4 rounded-2xl border-none outline-none transition-all ${
                  isDark
                    ? 'bg-gray-700 text-white placeholder-gray-400 shadow-dark-neumorph focus:shadow-dark-neumorph-hover'
                    : 'bg-gray-50 text-gray-800 placeholder-gray-500 shadow-neumorph focus:shadow-neumorph-hover'
                } ${errors.email ? 'ring-2 ring-red-400' : ''}`}
              />
            </div>
            {/* Mensaje de error para email */}
            {errors.email && (
              <p className="text-red-400 text-sm ml-2">{errors.email}</p>
            )}
          </div>

          {/* Campo de contraseña */}
          <div className="space-y-2">
            <div className="relative">
              {/* Icono de candado */}
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock size={18} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
              </div>
              {/* Input de contraseña con toggle de visibilidad */}
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Contraseña"
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                className={`w-full pl-12 pr-12 py-4 rounded-2xl border-none outline-none transition-all ${
                  isDark
                    ? 'bg-gray-700 text-white placeholder-gray-400 shadow-dark-neumorph focus:shadow-dark-neumorph-hover'
                    : 'bg-gray-50 text-gray-800 placeholder-gray-500 shadow-neumorph focus:shadow-neumorph-hover'
                } ${errors.password ? 'ring-2 ring-red-400' : ''}`}
              />
              {/* Botón para mostrar/ocultar contraseña */}
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center"
              >
                {showPassword ? (
                  <EyeOff size={18} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                ) : (
                  <Eye size={18} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                )}
              </button>
            </div>
            {/* Mensaje de error para contraseña */}
            {errors.password && (
              <p className="text-red-400 text-sm ml-2">{errors.password}</p>
            )}
          </div>

          {/* Campo de confirmar contraseña (solo en registro) */}
          {!isLogin && (
            <div className="space-y-2">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock size={18} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirmar contraseña"
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  className={`w-full pl-12 pr-4 py-4 rounded-2xl border-none outline-none transition-all ${
                    isDark
                      ? 'bg-gray-700 text-white placeholder-gray-400 shadow-dark-neumorph focus:shadow-dark-neumorph-hover'
                      : 'bg-gray-50 text-gray-800 placeholder-gray-500 shadow-neumorph focus:shadow-neumorph-hover'
                  } ${errors.confirmPassword ? 'ring-2 ring-red-400' : ''}`}
                />
              </div>
              {/* Error para confirmación de contraseña */}
              {errors.confirmPassword && (
                <p className="text-red-400 text-sm ml-2">{errors.confirmPassword}</p>
              )}
            </div>
          )}

          {/* Mensaje de error general (errores de Firebase) */}
          {errors.general && (
            <div className={`p-4 rounded-2xl ${
              isDark ? 'bg-red-900 bg-opacity-50 border border-red-600' : 'bg-red-50 border border-red-200'
            }`}>
              <p className={`text-sm ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                {errors.general}
              </p>
            </div>
          )}

          {/* Botón de envío del formulario */}
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-4 rounded-2xl font-semibold text-white transition-all duration-300 flex items-center justify-center space-x-2 ${
              isLoading
                ? 'bg-gray-400 cursor-not-allowed' // Estado deshabilitado
                : isDark
                ? 'bg-purple-600 hover:bg-purple-700 shadow-dark-neumorph hover:shadow-dark-neumorph-hover'
                : 'bg-purple-500 hover:bg-purple-600 shadow-neumorph hover:shadow-neumorph-hover'
            } transform hover:scale-105`}
          >
            {isLoading ? (
              // Spinner de carga
              <Loader size={20} className="animate-spin" />
            ) : (
              // Texto y flecha normales
              <>
                <span>{isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        {/* Sección para alternar entre login y registro */}
        <div className="mt-8 text-center">
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
          </p>
          <button
            onClick={() => {
              setIsLogin(!isLogin); // Cambia el modo
              setErrors({}); // Limpia errores
              setFormData({ name: '', email: '', password: '', confirmPassword: '' }); // Reset form
            }}
            className={`mt-2 font-semibold transition-all ${
              isDark
                ? 'text-purple-400 hover:text-purple-300'
                : 'text-purple-600 hover:text-purple-700'
            }`}
          >
            {isLogin ? 'Crear cuenta nueva' : 'Iniciar sesión'}
          </button>
        </div>

        {/* Credenciales demo para pruebas */}
        <div className={`mt-6 p-4 rounded-2xl ${
          isDark ? 'bg-gray-700 bg-opacity-50' : 'bg-gray-50'
        }`}>
          <p className={`text-xs text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Demo: demo@athlos.com / demo123
          </p>
        </div>
      </div>
    </div>
  );
}
