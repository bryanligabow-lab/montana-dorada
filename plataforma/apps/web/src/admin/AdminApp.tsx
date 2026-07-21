import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Business, User } from '@asis/shared';
import { api, getToken, setToken } from '../lib/api';
import { applyBranding } from '../lib/theme';
import { AdminContext, useAdmin } from './ctx';
import { Login } from './Login';
import { Ranking } from './pages/Ranking';
import { Asistencia } from './pages/Asistencia';
import { Empleados } from './pages/Empleados';
import { Nomina } from './pages/Nomina';
import { Anticipos } from './pages/Anticipos';
import { Auditoria } from './pages/Auditoria';
import { Config } from './pages/Config';

export function AdminApp() {
  const [token, setTok] = useState(getToken());
  if (!token) return <Login onLogin={() => setTok(getToken())} />;
  return (
    <Shell
      onLogout={() => {
        setToken(null);
        setTok(null);
      }}
    />
  );
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: User; businesses: Business[] }>('/api/auth/me', { auth: true }),
  });
  const [params] = useSearchParams();
  const [currentId, setCurrentId] = useState<string | null>(null);

  const businesses = me.data?.businesses ?? [];
  const current = businesses.find((b) => b.id === currentId) ?? businesses[0];

  useEffect(() => {
    if (!businesses.length || currentId) return;
    const wanted = params.get('biz');
    const match = wanted ? businesses.find((b) => b.slug === wanted) : undefined;
    setCurrentId((match ?? businesses[0])!.id);
  }, [businesses, currentId, params]);

  useEffect(() => {
    if (current) applyBranding(current.branding);
  }, [current]);

  if (me.isLoading)
    return <div className="min-h-screen flex items-center justify-center text-muted">Cargando…</div>;
  if (me.isError || !me.data) {
    onLogout();
    return null;
  }
  if (!current)
    return (
      <div className="min-h-screen flex items-center justify-center text-muted p-6 text-center">
        No tienes negocios asignados.
      </div>
    );

  return (
    <AdminContext.Provider value={{ user: me.data.user, current, logout: onLogout }}>
      <Layout />
    </AdminContext.Provider>
  );
}

const NAV = [
  { to: '', label: 'Ranking', end: true },
  { to: 'asistencia', label: 'Asistencia', end: false },
  { to: 'empleados', label: 'Empleados', end: false },
  { to: 'nomina', label: 'Nómina', end: false },
  { to: 'anticipos', label: 'Anticipos', end: false },
  { to: 'auditoria', label: 'Auditoría', end: false },
  { to: 'config', label: 'Configuración', end: false },
];

function Layout() {
  const { current, logout, user } = useAdmin();
  return (
    <div className="min-h-screen md:flex">
      <aside className="md:w-60 md:min-h-screen border-b md:border-b-0 md:border-r border-white/10 p-4">
        <div className="font-black text-lg mb-3" style={{ color: 'var(--c-primary)' }}>
          {current.nombre}
        </div>
        {user.rol === 'OWNER' && (
          <Link to="/owner" className="block text-xs mb-3 text-muted hover:text-ink">
            👑 Panel de dueño
          </Link>
        )}
        <nav className="flex md:flex-col gap-1 flex-wrap">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm ${isActive ? 'btn-brand' : 'text-ink hover:bg-white/5'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={logout} className="mt-4 text-xs text-muted hover:text-ink">
          Salir ({user.nombre})
        </button>
      </aside>
      <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
        <Routes>
          <Route index element={<Ranking />} />
          <Route path="asistencia" element={<Asistencia />} />
          <Route path="empleados" element={<Empleados />} />
          <Route path="nomina" element={<Nomina />} />
          <Route path="anticipos" element={<Anticipos />} />
          <Route path="auditoria" element={<Auditoria />} />
          <Route path="config" element={<Config />} />
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </main>
    </div>
  );
}
