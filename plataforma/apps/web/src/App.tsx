import { Link, Route, Routes } from 'react-router-dom';
import { MarcarPage } from './marcar/MarcarPage';
import { AdminApp } from './admin/AdminApp';
import { OwnerApp } from './owner/OwnerApp';
import { PortalApp } from './portal/PortalApp';

function Landing() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div className="card p-8 max-w-md">
        <div className="text-2xl font-extrabold mb-2">Plataforma de Asistencia</div>
        <p className="text-muted mb-6">
          Los empleados marcan escaneando su QR personal. Los administradores entran al panel.
        </p>
        <Link to="/admin" className="btn-brand inline-block px-5 py-3">
          Ir al panel
        </Link>
        <div className="mt-4 space-y-1">
          <Link to="/portal" className="block text-sm text-muted hover:text-ink">
            ¿Eres empleado? Consulta tu asistencia y sueldo →
          </Link>
          <Link to="/owner" className="block text-xs text-muted hover:text-ink">
            ¿Eres el dueño de la plataforma? Entra aquí →
          </Link>
        </div>
      </div>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/marcar/:token" element={<MarcarPage />} />
      <Route path="/portal/*" element={<PortalApp />} />
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="/owner/*" element={<OwnerApp />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
