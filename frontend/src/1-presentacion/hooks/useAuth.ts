import { useState, useEffect, useCallback } from 'react';
import { User, onAuthStateChanged, signOut, updateProfile } from 'firebase/auth';
import { auth } from '../../3-acceso-datos/firebase/config';
// useAuth: expone usuario actual, loading inicial y logout
export const useAuth = (): {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  updateUserProfile: (updates: { displayName?: string | null; photoURL?: string | null }) => Promise<void>;
} => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);
  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }, []);

  // Actualiza el perfil en Firebase Auth y fuerza refresco del estado local
  const updateUserProfile = useCallback(async (updates: { displayName?: string | null; photoURL?: string | null }) => {
    try {
      if (!auth.currentUser) return;
      await updateProfile(auth.currentUser, updates);
  const updated = auth.currentUser as User;
  // Crear un clon superficial para forzar re-render sin alterar métodos usados en UI
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cloned = { ...(updated as unknown as Record<string, any>) } as unknown as User;
      setUser(cloned);
    } catch (error) {
      console.error('Error actualizando perfil de usuario (Auth):', error);
    }
  }, []);
  return {
    user,
    loading,
    logout,
    isAuthenticated: !!user,
    updateUserProfile
  };
};