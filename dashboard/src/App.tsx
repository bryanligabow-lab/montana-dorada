import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PasswordGate } from './components/PasswordGate';
import { Sidebar } from './components/Sidebar';
import { PrivacyBanner } from './components/PrivacyBanner';
import { Resumen } from './sections/Resumen';
import { Asistencia } from './sections/Asistencia';
import { Pagos } from './sections/Pagos';
import { Faltas } from './sections/Faltas';
import { Extras } from './sections/Extras';
import { Multas } from './sections/Multas';
import { Nomina } from './sections/Nomina';
import { Sueldos } from './sections/Sueldos';
import { Empleados } from './sections/Empleados';
import { BRAND } from './lib/config';

export type SectionKey =
  | 'resumen'
  | 'asistencia'
  | 'pagos'
  | 'faltas'
  | 'extras'
  | 'multas'
  | 'nomina'
  | 'sueldos'
  | 'empleados';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Shell() {
  const [active, setActive] = useState<SectionKey>('resumen');
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="min-h-screen md:flex bg-grad-dark">
      <Sidebar
        active={active}
        onChange={setActive}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />
      {/* Topbar móvil */}
      <header className="md:hidden sticky top-0 z-30 bg-bgDeep/90 backdrop-blur-sm border-b border-tostado/40 flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          className="text-hueso text-2xl leading-none px-1"
          onClick={() => setNavOpen(true)}
          aria-label="Abrir menú"
        >
          ☰
        </button>
        <img
          src="./logo.jpg"
          alt=""
          className="w-8 h-8 rounded-full object-cover border border-dorado/50"
        />
        <div className="font-display text-base tracking-widest text-hueso truncate">
          {BRAND.name}
        </div>
      </header>
      <main className="flex-1 p-4 md:p-8 max-w-full overflow-x-hidden">
        <div className="mb-4">
          <PrivacyBanner />
        </div>
        {active === 'resumen' && <Resumen />}
        {active === 'asistencia' && <Asistencia />}
        {active === 'pagos' && <Pagos />}
        {active === 'faltas' && <Faltas />}
        {active === 'extras' && <Extras />}
        {active === 'multas' && <Multas />}
        {active === 'nomina' && <Nomina />}
        {active === 'sueldos' && <Sueldos />}
        {active === 'empleados' && <Empleados />}
      </main>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PasswordGate>
        <Shell />
      </PasswordGate>
    </QueryClientProvider>
  );
}
