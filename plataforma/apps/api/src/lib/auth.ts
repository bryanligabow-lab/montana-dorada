import bcrypt from 'bcryptjs';
import type { Role } from '@asis/shared';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface JwtPayload {
  sub: string;
  rol: Role;
  nombre: string;
  businessIds: string[];
}

/** Negocios a los que el usuario puede acceder (OWNER ve todos). */
export function accessibleBusinessIds(
  user: { rol: Role; businessIds: string[] },
  allBusinessIds: string[],
): string[] {
  return user.rol === 'OWNER' ? allBusinessIds : user.businessIds;
}
