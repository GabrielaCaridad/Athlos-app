import { useState, useEffect } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';      
import { auth } from '../../infrastructure/config/firebase';
/**
 Hook personalizado para manejar el estado de autenticación
 
  Funcionalidades:
 - Observa cambios en el estado de autenticación de Firebase
 - Proporciona información del usuario actual
 - Maneja el estado de carga inicial
 - Provee función para cerrar sesión
 
 * @returns {Object} Estado y funciones de autenticación
 */
export const useAuth = () => {
  // Estado para almacenar la información del usuario actual (null si no está logueado)
  const [user, setUser] = useState<User | null>(null);
  
  // Estado para controlar si aún se está verificando la autenticación inicial
  const [loading, setLoading] = useState(true);

  // useEffect que se ejecuta una sola vez al montar el componente
  useEffect(() => {
    // onAuthStateChanged es un listener de Firebase que se ejecuta cada vez
    // que el estado de autenticación cambia (login, logout, refresh, etc.)
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user); // Actualiza el usuario (puede ser null si no está logueado)
      setLoading(false); // Ya no está cargando, se tiene la información definitiva
    });

    // Cleanup: se ejecuta cuando el componente se desmonta
    // Importante para evitar memory leaks
    return () => unsubscribe();
  }, []); // Array de dependencias vacío = solo se ejecuta una vez

  /**
   * Función para cerrar la sesión del usuario actual
   * Maneja errores de manera silenciosa (solo los logea)
   */
  const logout = async () => {
    try {
      await signOut(auth); // Función de Firebase para cerrar sesión
      // No necesitamos actualizar el estado manualmente,
      // onAuthStateChanged se encargará de eso automáticamente
    } catch (error) {
      // En caso de error, lo registramos en la consola
      // En producción podrías enviar esto a un servicio de logging
      console.error('Error signing out:', error);
    }
  };

  // Retorna un objeto con todo lo que necesitan los componentes
  return {
    user, // Información del usuario actual (null si no está logueado)
    loading, // true mientras se verifica la autenticación inicial
    logout, // Función para cerrar sesión
    isAuthenticated: !!user // Boolean derivado: true si hay usuario, false si no
  };
};