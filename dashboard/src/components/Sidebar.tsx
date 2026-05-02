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
  open = false,
  onClose,
}: {
  active: SectionKey;
  onChange: (k: SectionKey) => void;
  /** Estado del drawer en móvil. Ignorado en md+ (siempre visible). */
  open?: boolean;
  onClose?: () => void;
}) {
  const { session, logout } = useAuth();

  function handleNav(k: SectionKey) {
    onChange(k);
    onClose?.();
  }

  return (
    <>
      {/* Overlay mobile */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-60 shrink-0 min-h-screen border-r border-tostado/40 bg-bgDeep/95 md:bg-bgDeep/60 flex flex-col transition-transform md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="p-5 flex items-center gap-3 border-b border-tostado/40">
          <img
            src="./logo.jpg"
            alt=""
            className="w-10 h-10 rounded-full object-cover border border-dorado/50"
          />
          <div className="leading-tight flex-1 min-w-0">
            <div className="font-display text-lg tracking-widest text-hueso truncate">
              {BRAND.name}
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-hueso/40">
              Plataforma
            </div>
          </div>
          {/* Close button (only mobile) */}
          <button
            type="button"
            className="md:hidden text-hueso/60 hover:text-hueso text-xl px-2"
            onClick={onClose}
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>

        <div className="px-4 py-3 border-b border-tostado/40">
          <div className="text-[10px] uppercase tracking-[0.2em] text-hueso/40">Sesión</div>
          <div className="text-dorado font-semibold text-sm mt-1 truncate">{session.nombre}</div>
          <div className="text-hueso/60 text-xs truncate">{session.rol}</div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {ITEMS.map((it) => {
            const isActive = it.key === active;
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => handleNav(it.key)}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
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
    </>
  );
}
