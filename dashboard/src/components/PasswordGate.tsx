import { useState, type ReactNode, type FormEvent } from 'react';
import { login, getSession, clearSession, type Session } from '../lib/auth';
import { AuthContext } from '../lib/useAuth';
import { matchPermission, BRAND } from '../lib/config';

export function PasswordGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => getSession());
  const [username, setUsername] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (session) {
    const ctx = {
      session,
      can: (action: string) => matchPermission(session.permisos, action),
      logout: () => {
        clearSession();
        setSession(null);
      },
    };
    return <AuthContext.Provider value={ctx}>{children}</AuthContext.Provider>;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const s = await login(username, pw);
      if (!s) {
        setError('Usuario o contraseña incorrectos');
        return;
      }
      setSession(s);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-grad-dark p-6">
      <div className="card w-full max-w-md p-8 flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2">
          <img
            src="./logo.jpg"
            alt="Logo"
            className="w-16 h-16 rounded-full object-cover border border-dorado/50"
          />
          <div className="font-display text-3xl tracking-widest text-hueso">{BRAND.name}</div>
          <div className="text-hueso/50 text-xs uppercase tracking-[0.25em]">
            Plataforma Interna
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="text-hueso/80 text-sm font-medium">
            Usuario
            <input
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              className="mt-1 w-full px-3 py-2 rounded-lg bg-bg/70 border border-tostado/60 text-hueso outline-none focus:border-dorado/60"
              placeholder="Tu usuario de la tab CONF"
            />
          </label>
          <label className="text-hueso/80 text-sm font-medium">
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-bg/70 border border-tostado/60 text-hueso outline-none focus:border-dorado/60"
              placeholder="••••••••"
            />
          </label>
          {error && <div className="text-fuego text-sm">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Verificando…' : 'Entrar'}
          </button>
        </form>
        <p className="text-hueso/40 text-xs leading-relaxed">
          Los usuarios y permisos se definen en la tab <code className="text-dorado">CONF</code> del
          Google Sheet.
        </p>
      </div>
    </div>
  );
}
