import { createContext } from 'react';
import type { User } from 'firebase/auth';

export type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  updateUserProfile: (updates: { displayName?: string | null; photoURL?: string | null }) => Promise<void>;
  updateUserDisplayName: (newDisplayName: string) => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
