import { useState } from 'react';
import type { LoginResult } from '@asis/shared';
import { api, ApiError, setToken } from '../lib/api';

export function Login({
  onLogin,
  title = 'Panel de Asistencia',
  subtitle = 'Ingresa con tu cuenta de administrador.',
}: {
  onLogin: () => void;
  title?: string;
  subtitle?: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await api<LoginResult>('/api/auth/login', { method: 'POST', body: { email, password } });
      setToken(r.token);
      onLogin();
    } catch (e2) {
      setErr(e2 instanceof ApiError && e2.code === 'credenciales_invalidas' ? 'Correo o contraseña incorrectos.' : 'No se pudo iniciar sesión.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <div className="text-xl font-black mb-1">{title}</div>
        <p className="text-muted text-sm mb-5">{subtitle}</p>
        <label className="block text-xs text-muted mb-1">Usuario o correo</label>
        <input
          type="text"
          className="field w-full px-3 py-2.5 mb-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          required
        />
        <label className="block text-xs text-muted mb-1">Contraseña</label>
        <input
          type="password"
          className="field w-full px-3 py-2.5 mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        {err && <div className="text-sm mb-3" style={{ color: 'var(--c-accent)' }}>{err}</div>}
        <button type="submit" className="btn-brand w-full py-3" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
