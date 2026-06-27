import { createContext, useContext } from 'react';
import type { Business, User } from '@asis/shared';

export interface AdminCtx {
  user: User;
  businesses: Business[];
  current: Business;
  setCurrentId: (id: string) => void;
  logout: () => void;
}

export const AdminContext = createContext<AdminCtx | null>(null);

export function useAdmin(): AdminCtx {
  const c = useContext(AdminContext);
  if (!c) throw new Error('AdminContext ausente');
  return c;
}
