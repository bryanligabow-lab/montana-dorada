const BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

let authToken: string | null = localStorage.getItem('asis_token');

export function setToken(t: string | null): void {
  authToken = t;
  if (t) localStorage.setItem('asis_token', t);
  else localStorage.removeItem('asis_token');
}

export function getToken(): string | null {
  return authToken;
}

export async function api<T>(
  path: string,
  opts: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth && authToken) headers['Authorization'] = `Bearer ${authToken}`;

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
      // respuesta sin JSON
    }
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, code);
  }
  return res.json() as Promise<T>;
}
