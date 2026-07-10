import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Business, User } from '@asis/shared';
import { api, getToken, setToken } from '../lib/api';
import { applyBranding } from '../lib/theme';
import { Login } from '../admin/Login';
import { Negocios } from './Negocios';

// Tema fijo del Panel de Dueño: no depende de la marca de ningún negocio.
const OWNER_THEME = { primary: '#D4AF37', accent: '#E53935', bg: '#0A0A0F', card: '#15151F' };

export function OwnerApp() {
  const [token, setTok] = useState(getToken());
  useEffect(() => applyBranding(OWNER_THEME), []);

  if (!token) {
    return (
      <Login
        title="👑 Panel de Dueño"
        subtitle="Acceso exclusivo para administrar tus negocios."
        onLogin={() => setTok(getToken())}
      />
    );
  }
  return (
    <OwnerShell
      onLogout={() => {
        setToken(null);
        setTok(null);
      }}
    />
  );
}

function OwnerShell({ onLogout }: { onLogout: () => void }) {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: User; businesses: Business[] }>('/api/auth/me', { auth: true }),
  });

  if (me.isLoading)
    return <div className="min-h-screen flex items-center justify-center text-muted">Cargando…</div>;
  if (me.isError || !me.data) {
    onLogout();
    return null;
  }

  if (me.data.user.rol !== 'OWNER') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="card p-8 max-w-sm">
          <div className="text-lg font-black mb-2">Acceso restringido</div>
          <p className="text-muted text-sm mb-5">
            Esta cuenta no tiene permisos de dueño de la plataforma. Usa el panel de tu negocio.
          </p>
          <div className="flex flex-col gap-2">
            <Link to="/admin" className="btn-brand py-2.5">
              Ir a mi panel →
            </Link>
            <button onClick={onLogout} className="text-xs text-muted hover:text-ink">
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen md:flex">
      <aside className="md:w-60 md:min-h-screen border-b md:border-b-0 md:border-r border-white/10 p-4">
        <div className="font-black text-lg mb-1" style={{ color: 'var(--c-primary)' }}>
          👑 Panel de Dueño
        </div>
        <p className="text-muted text-xs mb-4">{me.data.user.nombre}</p>
        <button onClick={onLogout} className="text-xs text-muted hover:text-ink">
          Salir
        </button>
      </aside>
      <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
        <Negocios />
      </main>
    </div>
  );
}
