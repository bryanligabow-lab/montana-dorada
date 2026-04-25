import { APPS_SCRIPT_URL, API_SECRET, isBackendConfigured } from './config';

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/**
 * Cliente CORS-safe para Apps Script Web App.
 *
 * Usa `Content-Type: text/plain` para que el navegador trate la petición como
 * "simple request" y no dispare preflight OPTIONS (que Apps Script no maneja).
 * El body sigue siendo JSON stringificado.
 */
export async function callApi<T = unknown>(
  action: string,
  data: Record<string, unknown>,
): Promise<T> {
  if (!isBackendConfigured()) {
    throw new Error('backend_no_configurado');
  }
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ secret: API_SECRET, action, data }),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) throw new Error(json.error || 'unknown_error');
  return json.data as T;
}
