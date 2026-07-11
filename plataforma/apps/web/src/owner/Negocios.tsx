import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { BusinessCreateInput, WeekSchedule } from '@asis/shared';
import { useBusinesses, useCreateBusiness, useToggleBusiness } from '../admin/queries';
import { Card, Spinner } from '../admin/ui';

const DIAS: { key: keyof WeekSchedule; label: string }[] = [
  { key: 'lunes', label: 'Lunes' },
  { key: 'martes', label: 'Martes' },
  { key: 'miercoles', label: 'Miércoles' },
  { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' },
  { key: 'sabado', label: 'Sábado' },
  { key: 'domingo', label: 'Domingo' },
];

const INTERVALOS_MULTA = [
  { min: 1, label: '1 min (por minuto exacto)' },
  { min: 5, label: '5 min' },
  { min: 10, label: '10 min' },
  { min: 15, label: '15 min' },
  { min: 30, label: '30 min' },
  { min: 60, label: '60 min (por hora)' },
];

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,.6)' }}
      onClick={onClose}
    >
      <div className="card w-full max-w-lg p-5 my-8" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function Negocios() {
  const list = useBusinesses();
  const toggle = useToggleBusiness();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-black tracking-wide">Negocios</h2>
          <p className="text-muted text-sm">Alta, suspensión y control de cada empresa.</p>
        </div>
        <button className="btn-brand px-4 py-2" onClick={() => setCreating(true)}>
          + Nuevo negocio
        </button>
      </div>

      <Card>
        {list.isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-muted text-left text-xs uppercase tracking-wide">
                  <th className="p-2">Negocio</th>
                  <th className="p-2 text-center">GPS</th>
                  <th className="p-2 text-center">Estado</th>
                  <th className="p-2 text-right">Panel</th>
                  <th className="p-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {(list.data ?? []).map((b) => (
                  <tr key={b.id} className="border-t border-white/5">
                    <td className="p-2">
                      <div className="font-bold" style={{ color: b.branding.primary }}>
                        {b.nombre}
                      </div>
                      <div className="text-xs text-muted font-mono">{b.slug}</div>
                    </td>
                    <td className="p-2 text-center">{b.gpsRequerido ? `${b.radioMetros} m` : '–'}</td>
                    <td className="p-2 text-center">
                      <span
                        className="chip px-2 py-1 text-xs"
                        style={{
                          background: b.activo ? 'rgba(67,160,71,.15)' : 'rgba(229,57,53,.15)',
                          color: b.activo ? '#81C784' : '#EF9A9A',
                        }}
                      >
                        {b.activo ? '● Activo' : '⏸ Suspendido'}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      <Link to={`/admin?biz=${b.slug}`} className="chip px-3 py-1 text-xs inline-block">
                        Entrar →
                      </Link>
                    </td>
                    <td className="p-2 text-right">
                      <button
                        className="chip px-3 py-1 text-xs"
                        disabled={toggle.isPending}
                        onClick={() => {
                          const msg = b.activo
                            ? `¿Suspender "${b.nombre}"? Sus empleados no podrán marcar.`
                            : `¿Reactivar "${b.nombre}"?`;
                          if (confirm(msg)) toggle.mutate({ id: b.id, activo: !b.activo });
                        }}
                      >
                        {b.activo ? 'Suspender' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && <CrearNegocio onClose={() => setCreating(false)} />}
    </div>
  );
}

function CrearNegocio({ onClose }: { onClose: () => void }) {
  const create = useCreateBusiness();
  const [err, setErr] = useState('');
  const [f, setF] = useState({
    nombre: '',
    slug: '',
    slugTouched: false,
    horarios: Object.fromEntries(DIAS.map((d) => [d.key, '08:00:00'])) as unknown as WeekSchedule,
    multaMonto: '0.10',
    multaIntervaloMin: '1',
    gpsRequerido: true,
    controlAlmuerzo: true,
    controlMultas: true,
    controlMedallas: true,
    lat: '',
    lng: '',
    radioMetros: '80',
    primary: '#43A047',
    accent: '#E53935',
    bg: '#0A1A0F',
    card: '#0F2417',
    reportEmails: '',
    reportWhatsapp: '',
    whatsappGrupoId: '',
  });
  const set = (k: Exclude<keyof typeof f, 'horarios'>, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const setHorario = (dia: keyof WeekSchedule, v: string) =>
    setF((p) => ({ ...p, horarios: { ...p.horarios, [dia]: v } }));
  const copiarLunesATodos = () =>
    setF((p) => ({
      ...p,
      horarios: Object.fromEntries(DIAS.map((d) => [d.key, p.horarios.lunes])) as unknown as WeekSchedule,
    }));
  const input = 'field w-full px-3 py-2.5 text-sm';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const data: BusinessCreateInput = {
      nombre: f.nombre,
      slug: f.slug || slugify(f.nombre),
      timezone: 'America/Guayaquil',
      horarios: f.horarios,
      multaMonto: Number(f.multaMonto),
      multaIntervaloMin: Number(f.multaIntervaloMin),
      dayCutoffHour: 2,
      gpsRequerido: f.gpsRequerido,
      controlAlmuerzo: f.controlAlmuerzo,
      controlMultas: f.controlMultas,
      controlMedallas: f.controlMedallas,
      lat: f.lat ? Number(f.lat) : null,
      lng: f.lng ? Number(f.lng) : null,
      radioMetros: Number(f.radioMetros),
      branding: { primary: f.primary, accent: f.accent, bg: f.bg, card: f.card },
      reportEmails: f.reportEmails
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      reportWhatsapp: f.reportWhatsapp
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      whatsappGrupoId: f.whatsappGrupoId.trim(),
    };
    try {
      await create.mutateAsync(data);
      onClose();
    } catch {
      setErr('No se pudo crear (¿código repetido o datos inválidos?).');
    }
  }

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="font-black text-lg">Nuevo negocio</div>

        <label className="block">
          <span className="block text-xs text-muted mb-1">Nombre</span>
          <input
            className={input}
            value={f.nombre}
            onChange={(e) => {
              const nombre = e.target.value;
              setF((p) => ({ ...p, nombre, slug: p.slugTouched ? p.slug : slugify(nombre) }));
            }}
            required
          />
        </label>
        <label className="block">
          <span className="block text-xs text-muted mb-1">Código (URL, sin espacios)</span>
          <input
            className={input}
            value={f.slug}
            onChange={(e) => setF((p) => ({ ...p, slug: slugify(e.target.value), slugTouched: true }))}
            required
          />
        </label>

        <label className="block">
          <span className="block text-xs text-muted mb-1">Radio GPS (m)</span>
          <input className={input} type="number" value={f.radioMetros} onChange={(e) => set('radioMetros', e.target.value)} />
        </label>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="block text-xs text-muted">Horario de entrada por día</span>
            <button type="button" className="chip px-2 py-0.5 text-xs" onClick={copiarLunesATodos}>
              Copiar Lunes a todos
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {DIAS.map((d) => (
              <label key={d.key} className="block">
                <span className="block text-xs text-muted mb-1">{d.label}</span>
                <input
                  className={input}
                  type="time"
                  value={f.horarios[d.key].slice(0, 5)}
                  onChange={(e) => setHorario(d.key, e.target.value ? `${e.target.value}:00` : '00:00:00')}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <span className="block text-xs text-muted">¿Qué controla?</span>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.controlAlmuerzo} onChange={(e) => set('controlAlmuerzo', e.target.checked)} />
            Almuerzo (salida/regreso)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.controlMultas} onChange={(e) => set('controlMultas', e.target.checked)} />
            Multa por tardanza
          </label>
          {f.controlMultas && (
            <div className="grid grid-cols-2 gap-3 pl-6">
              <label className="block">
                <span className="block text-xs text-muted mb-1">Monto ($)</span>
                <input className={input} type="number" step="0.01" value={f.multaMonto} onChange={(e) => set('multaMonto', e.target.value)} />
              </label>
              <label className="block">
                <span className="block text-xs text-muted mb-1">Cada cuántos minutos</span>
                <select className={input} value={f.multaIntervaloMin} onChange={(e) => set('multaIntervaloMin', e.target.value)}>
                  {INTERVALOS_MULTA.map((op) => (
                    <option key={op.min} value={op.min}>{op.label}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.controlMedallas} onChange={(e) => set('controlMedallas', e.target.checked)} />
            Medallas y puntos
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.gpsRequerido} onChange={(e) => set('gpsRequerido', e.target.checked)} />
          Exigir GPS (marcar solo dentro del local)
        </label>
        {f.gpsRequerido && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-muted mb-1">Latitud</span>
              <input className={input} value={f.lat} onChange={(e) => set('lat', e.target.value)} placeholder="-3.677506" />
            </label>
            <label className="block">
              <span className="block text-xs text-muted mb-1">Longitud</span>
              <input className={input} value={f.lng} onChange={(e) => set('lng', e.target.value)} placeholder="-79.687398" />
            </label>
          </div>
        )}

        <div>
          <span className="block text-xs text-muted mb-1">Colores de marca</span>
          <div className="grid grid-cols-4 gap-2">
            {(['primary', 'accent', 'bg', 'card'] as const).map((k) => (
              <input key={k} type="color" value={f[k]} onChange={(e) => set(k, e.target.value)} className="w-full h-9 rounded" title={k} />
            ))}
          </div>
        </div>

        <label className="block">
          <span className="block text-xs text-muted mb-1">Correos para avisos (coma)</span>
          <input className={input} value={f.reportEmails} onChange={(e) => set('reportEmails', e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-xs text-muted mb-1">WhatsApp para informes (coma)</span>
          <input className={input} value={f.reportWhatsapp} onChange={(e) => set('reportWhatsapp', e.target.value)} placeholder="0991234567" />
        </label>
        <label className="block">
          <span className="block text-xs text-muted mb-1">ID del grupo de WhatsApp (opcional, se puede completar después)</span>
          <input className={input} value={f.whatsappGrupoId} onChange={(e) => set('whatsappGrupoId', e.target.value)} placeholder="120363...@g.us" />
        </label>

        {err && <div className="text-sm" style={{ color: 'var(--c-accent)' }}>{err}</div>}
        <div className="flex gap-2 pt-1">
          <button type="submit" className="btn-brand px-4 py-2 flex-1" disabled={create.isPending}>
            {create.isPending ? 'Creando…' : 'Crear negocio'}
          </button>
          <button type="button" className="chip px-4 py-2 flex-1" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Overlay>
  );
}
