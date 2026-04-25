import { fetchConfUsers } from './sheets';
import type { ConfUser } from './types';

const SESSION_KEY = 'md_auth_v3';

export interface Session {
  username: string;
  nombre: string;
  rol: string;
  permisos: string[];
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Valida un login contra la tab CONF del Sheet. La password en CONF puede
 * estar en texto plano o como SHA-256 hex (64 chars). Se prueban ambos.
 */
export async function login(username: string, password: string): Promise<Session | null> {
  const uname = username.trim().toLowerCase();
  let users: ConfUser[];
  try {
    users = await fetchConfUsers();
  } catch {
    throw new Error('No pude leer la tab CONF del Sheet. Verificá que el Sheet sea público con link.');
  }
  const match = users.find((u) => u.username === uname);
  if (!match) return null;

  const stored = (match.password ?? '').trim();
  if (!stored) return null;

  let valid = false;
  if (stored === password) {
    // Comparación directa (plain text)
    valid = true;
  } else if (/^[a-f0-9]{64}$/i.test(stored)) {
    // Parece SHA-256 hex; comparar hasheado
    const hashed = await sha256Hex(password);
    valid = hashed.toLowerCase() === stored.toLowerCase();
  }
  if (!valid) return null;

  const session: Session = {
    username: match.username,
    nombre: match.nombre || match.username,
    rol: match.rol,
    permisos: match.permisos,
  };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch { /* ignore */ }
  return session;
}

export function getSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}
