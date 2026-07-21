// Cliente del portal del empleado. Token separado del admin (asis_portal_token)
// para que ambos puedan coexistir en el mismo navegador sin pisarse.
const BASE = import.meta.env.VITE_API_URL ?? '';

export class PortalError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

let token: string | null = localStorage.getItem('asis_portal_token');

export function setPortalToken(t: string | null): void {
  token = t;
  if (t) localStorage.setItem('asis_portal_token', t);
  else localStorage.removeItem('asis_portal_token');
}

export function getPortalToken(): string | null {
  return token;
}

export async function portalApi<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth && token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let code = `HTTP_${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) code = j.error;
    } catch {
      // sin JSON
    }
    if (res.status === 401) setPortalToken(null);
    throw new PortalError(res.status, code);
  }
  return res.json() as Promise<T>;
}
