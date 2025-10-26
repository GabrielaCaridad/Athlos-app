import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { User, onAuthStateChanged, signOut, updateProfile } from 'firebase/auth';
import { auth } from '../../3-acceso-datos/firebase/config';
import { AuthContext, type AuthContextValue } from './AuthContext.ts';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
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

  // Actualiza el perfil en Firebase Auth y propaga el cambio a todo el árbol
  const updateUserProfile = useCallback(async (updates: { displayName?: string | null; photoURL?: string | null }) => {
    try {
      if (!auth.currentUser) return;
      await updateProfile(auth.currentUser, updates);
      const updated = auth.currentUser as User;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cloned = { ...(updated as unknown as Record<string, any>) } as unknown as User;
      setUser(cloned);
    } catch (error) {
      console.error('Error actualizando perfil de usuario (Auth):', error);
    }
  }, []);

  const updateUserDisplayName = useCallback(async (newDisplayName: string) => {
    await updateUserProfile({ displayName: newDisplayName });
  }, [updateUserProfile]);

  const value: AuthContextValue = {
    user,
    loading,
    isAuthenticated: !!user,
    logout,
    updateUserProfile,
    updateUserDisplayName,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
