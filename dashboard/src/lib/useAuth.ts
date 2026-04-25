import { createContext, useContext } from 'react';
import { matchPermission } from './config';
import type { Session } from './auth';

export interface AuthContextValue {
  session: Session;
  can: (action: string) => boolean;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

export { matchPermission };
