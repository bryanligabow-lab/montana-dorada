import { Link, Route, Routes } from 'react-router-dom';
import { MarcarPage } from './marcar/MarcarPage';
import { AdminApp } from './admin/AdminApp';

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
      </div>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/marcar/:token" element={<MarcarPage />} />
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
