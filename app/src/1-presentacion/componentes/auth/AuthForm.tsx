/**
 * Formulario de Autenticación (login/registro)
 *
 * Flujo
 * - Login: `signInWithEmailAndPassword` con validaciones básicas.
 * - Registro: crea usuario en Auth, actualiza displayName y genera documento `users/{uid}` en Firestore.
 * - Al finalizar, llama `onAuthSuccess()` para que el contenedor reaccione (navegación/state arriba).
 *
 * Validaciones
 * - Email con regex sencillo.
 * - Password mínimo 6 caracteres.
 * - En registro: nombre requerido y confirmación de password.
 *
 * Notas
 * - Mensajes de error se derivan de `error.code` de Firebase cuando es posible.
 * - No persiste preferencias de tema: `isDark` solo decide el estilo visual de este form.
 */
// AuthForm: login y registro con Firebase Auth.
import React, { useState } from 'react';
import { Eye, EyeOff, Mail, Lock, User, Dumbbell, ArrowRight, Loader } from 'lucide-react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../../3-acceso-datos/firebase/config';

interface AuthFormProps {
  isDark: boolean;
  onAuthSuccess: () => void;
}

export default function AuthForm({ isDark, onAuthSuccess }: AuthFormProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Estado que contiene todos los datos del formulario
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

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
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    setErrors({});

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, formData.email, formData.password);
      } else {
        // Crear usuario en Auth
        const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);

        // Actualizar displayName en Auth
        await updateProfile(userCredential.user, {
          displayName: formData.name
        });

        // Crear documento en Firestore con UID como ID
        try {
          console.log('📝 Creando documento de usuario en Firestore...');
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            email: formData.email,
            displayName: formData.name,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            // Valores por defecto mínimos
            currentWeight: null,
            height: null,
            dateOfBirth: null,
            gender: 'prefer_not_to_say',
            primaryGoal: 'maintenance',
            activityLevel: 'moderate',
            level: 1,
            xp: 0,
            achievements: [],
            goals: []
          });
          console.log('✅ Documento de usuario creado en:', `users/${userCredential.user.uid}`);
        } catch (e) {
          console.error('❌ Error creando documento de usuario en Firestore:', e);
        }
      }
      onAuthSuccess();
    } catch (error: unknown) {
      let errorMessage = 'Error de autenticación';

      if (error && typeof error === 'object' && 'code' in error) {
        const firebaseError = error as { code: string };
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
      setIsLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 transition-all duration-500 ${
      isDark ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      <div className={`w-full max-w-md transition-all duration-300 ${
        isDark ? 'bg-gray-800 shadow-dark-neumorph' : 'bg-white shadow-neumorph'
      } rounded-3xl p-8`}>
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
            <Dumbbell size={28} className="text-white" />
          </div>
          <h1 className={`text-3xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-800'}`}>
            Athlos
          </h1>
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {isLogin ? 'Bienvenido de vuelta' : 'Comienza tu viaje fitness'}
          </p>
        </div>

        {/* Formulario principal */}
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {!isLogin && (
            <div className="space-y-2">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User size={18} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                </div>
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
              {errors.name && (
                <p className="text-red-400 text-sm ml-2">{errors.name}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail size={18} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
              </div>
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

          <div className="space-y-2">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock size={18} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
              </div>
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
            {errors.password && (
              <p className="text-red-400 text-sm ml-2">{errors.password}</p>
            )}
          </div>

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
              {errors.confirmPassword && (
                <p className="text-red-400 text-sm ml-2">{errors.confirmPassword}</p>
              )}
            </div>
          )}

          {errors.general && (
            <div className={`p-4 rounded-2xl ${
              isDark ? 'bg-red-900 bg-opacity-50 border border-red-600' : 'bg-red-50 border border-red-200'
            }`}>
              <p className={`text-sm ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                {errors.general}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-4 rounded-2xl font-semibold text-white transition-all duration-300 flex items-center justify-center space-x-2 ${
              isLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : isDark
                ? 'bg-purple-600 hover:bg-purple-700 shadow-dark-neumorph hover:shadow-dark-neumorph-hover'
                : 'bg-purple-500 hover:bg-purple-600 shadow-neumorph hover:shadow-neumorph-hover'
            } transform hover:scale-105`}
          >
            {isLoading ? (
              <Loader size={20} className="animate-spin" />
            ) : (
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
