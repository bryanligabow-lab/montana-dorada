import { useAuth } from '../lib/useAuth';
import { BRAND } from '../lib/config';
import type { SectionKey } from '../App';

const ITEMS: { key: SectionKey; label: string; icon: string }[] = [
  { key: 'resumen', label: 'Resumen', icon: '◎' },
  { key: 'asistencia', label: 'Asistencia', icon: '✓' },
  { key: 'pagos', label: 'Pagos', icon: '$' },
  { key: 'faltas', label: 'Faltas', icon: '✗' },
  { key: 'extras', label: 'Extras', icon: '+' },
  { key: 'multas', label: 'Multas', icon: '⏱' },
  { key: 'nomina', label: 'Nómina', icon: '∑' },
  { key: 'sueldos', label: 'Sueldos', icon: '¢' },
  { key: 'empleados', label: 'Empleados', icon: '♟' },
];

export function Sidebar({
  active,
  onChange,
}: {
  active: SectionKey;
  onChange: (k: SectionKey) => void;
}) {
  const { session, logout } = useAuth();

  return (
    <aside className="w-60 shrink-0 min-h-screen border-r border-tostado/40 bg-bgDeep/60 flex flex-col">
      <div className="p-5 flex items-center gap-3 border-b border-tostado/40">
        <img
          src="./logo.jpg"
          alt=""
          className="w-10 h-10 rounded-full object-cover border border-dorado/50"
        />
        <div className="leading-tight">
          <div className="font-display text-lg tracking-widest text-hueso">{BRAND.name}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-hueso/40">
            Plataforma
          </div>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-tostado/40">
        <div className="text-[10px] uppercase tracking-[0.2em] text-hueso/40">Sesión</div>
        <div className="text-dorado font-semibold text-sm mt-1">{session.nombre}</div>
        <div className="text-hueso/60 text-xs">{session.rol}</div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {ITEMS.map((it) => {
          const isActive = it.key === active;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onChange(it.key)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition ${
                isActive
                  ? 'bg-grad-fire text-white shadow-glow'
                  : 'text-hueso/70 hover:bg-tostado/40 hover:text-hueso'
              }`}
            >
              <span className="w-6 text-center text-lg">{it.icon}</span>
              <span className="font-medium">{it.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-tostado/40">
        <button
          type="button"
          className="btn-ghost w-full text-left text-sm"
          onClick={logout}
        >
          ⎋ Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
