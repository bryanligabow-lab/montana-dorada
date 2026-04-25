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
  return (
    <div className="min-h-screen flex bg-grad-dark">
      <Sidebar active={active} onChange={setActive} />
      <main className="flex-1 p-6 md:p-8 max-w-full overflow-hidden">
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
