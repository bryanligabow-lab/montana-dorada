import { useEffect, useState } from 'react';
import type { BusinessUpdateInput, WeekSchedule } from '@asis/shared';
import { useAdmin } from '../ctx';
import { useUpdateBusiness } from '../queries';
import { applyBranding } from '../../lib/theme';
import { Card, SectionTitle } from '../ui';

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}

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

export function Config() {
  const { current } = useAdmin();
  const upd = useUpdateBusiness(current.id);
  const [msg, setMsg] = useState('');

  const [f, setF] = useState(() => init());
  function init() {
    return {
      nombre: current.nombre,
      horarios: { ...current.horarios },
      horariosSalida: { ...current.horariosSalida },
      multaMonto: String(current.multaMonto),
      multaIntervaloMin: String(current.multaIntervaloMin),
      radioMetros: String(current.radioMetros),
      lat: current.lat?.toString() ?? '',
      lng: current.lng?.toString() ?? '',
      gpsRequerido: current.gpsRequerido,
      controlAlmuerzo: current.controlAlmuerzo,
      controlMultas: current.controlMultas,
      controlMedallas: current.controlMedallas,
      primary: current.branding.primary || '#43A047',
      accent: current.branding.accent || '#E53935',
      bg: current.branding.bg || '#0A1A0F',
      card: current.branding.card || '#0F2417',
      logoUrl: current.branding.logoUrl ?? '',
      reportEmails: current.reportEmails.join(', '),
      reportWhatsapp: current.reportWhatsapp.join(', '),
      whatsappGrupoId: current.whatsappGrupoId,
    };
  }
  // Resetear el formulario al cambiar de negocio.
  useEffect(() => setF(init()), [current.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: Exclude<keyof ReturnType<typeof init>, 'horarios' | 'horariosSalida'>, v: string | boolean) =>
    setF((prev) => ({ ...prev, [k]: v }));
  const setHorario = (campo: 'horarios' | 'horariosSalida', dia: keyof WeekSchedule, v: string) =>
    setF((prev) => ({ ...prev, [campo]: { ...prev[campo], [dia]: v } }));
  const copiarLunesATodos = (campo: 'horarios' | 'horariosSalida') =>
    setF((prev) => {
      const lunes = prev[campo].lunes;
      const horario = Object.fromEntries(DIAS.map((d) => [d.key, lunes])) as unknown as WeekSchedule;
      return { ...prev, [campo]: horario };
    });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const data: BusinessUpdateInput = {
      nombre: f.nombre,
      horarios: f.horarios,
      horariosSalida: f.horariosSalida,
      multaMonto: Number(f.multaMonto),
      multaIntervaloMin: Number(f.multaIntervaloMin),
      radioMetros: Number(f.radioMetros),
      lat: f.lat ? Number(f.lat) : null,
      lng: f.lng ? Number(f.lng) : null,
      gpsRequerido: f.gpsRequerido,
      controlAlmuerzo: f.controlAlmuerzo,
      controlMultas: f.controlMultas,
      controlMedallas: f.controlMedallas,
      // Nunca guardar un color vacío: si lo está, se usa el valor por defecto (evita que el sistema
      // caiga al color base y parezca que "no se cambia").
      branding: {
        primary: f.primary || '#43A047',
        accent: f.accent || '#E53935',
        bg: f.bg || '#0A1A0F',
        card: f.card || '#0F2417',
        logoUrl: f.logoUrl.trim(),
      },
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
      await upd.mutateAsync(data);
      applyBranding({ primary: f.primary, accent: f.accent, bg: f.bg, card: f.card });
      setMsg('Cambios guardados ✓');
    } catch {
      setMsg('No se pudo guardar (revisa los formatos).');
    }
  }

  const input = 'field w-full px-3 py-2.5 text-sm';

  return (
    <form onSubmit={save} className="space-y-4 max-w-2xl">
      <h2 className="text-lg font-black tracking-wide">Configuración · {current.nombre}</h2>

      <Card className="space-y-3">
        <SectionTitle>General</SectionTitle>
        <Field label="Nombre del negocio">
          <input className={input} value={f.nombre} onChange={(e) => set('nombre', e.target.value)} />
        </Field>
        <Field label="Radio GPS (metros)">
          <input className={input} type="number" value={f.radioMetros} onChange={(e) => set('radioMetros', e.target.value)} />
        </Field>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle>Horario de entrada</SectionTitle>
          <button type="button" className="chip px-3 py-1 text-xs" onClick={() => copiarLunesATodos('horarios')}>
            Copiar Lunes a todos
          </button>
        </div>
        <p className="text-xs text-muted -mt-2">Hora límite de entrada por cada día (no tiene que ser la misma todos los días).</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {DIAS.map((d) => (
            <Field key={d.key} label={d.label}>
              <input
                className={input}
                type="time"
                value={f.horarios[d.key].slice(0, 5)}
                onChange={(e) => setHorario('horarios', d.key, e.target.value ? `${e.target.value}:00` : '00:00:00')}
              />
            </Field>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle>Horario de salida</SectionTitle>
          <button type="button" className="chip px-3 py-1 text-xs" onClick={() => copiarLunesATodos('horariosSalida')}>
            Copiar Lunes a todos
          </button>
        </div>
        <p className="text-xs text-muted -mt-2">Hora de salida esperada por día — define el largo de la jornada para calcular horas extra.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {DIAS.map((d) => (
            <Field key={d.key} label={d.label}>
              <input
                className={input}
                type="time"
                value={f.horariosSalida[d.key].slice(0, 5)}
                onChange={(e) => setHorario('horariosSalida', d.key, e.target.value ? `${e.target.value}:00` : '00:00:00')}
              />
            </Field>
          ))}
        </div>
      </Card>

      <Card className="space-y-2">
        <SectionTitle>¿Qué controla este negocio?</SectionTitle>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.controlAlmuerzo} onChange={(e) => set('controlAlmuerzo', e.target.checked)} />
          Registrar salida y regreso de <b>almuerzo</b>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.controlMultas} onChange={(e) => set('controlMultas', e.target.checked)} />
          Cobrar <b>multa por tardanza</b> (pozo al más temprano)
        </label>
        {f.controlMultas && (
          <div className="grid grid-cols-2 gap-3 pl-6 pt-1">
            <Field label="Monto de la multa ($)">
              <input className={input} type="number" step="0.01" value={f.multaMonto} onChange={(e) => set('multaMonto', e.target.value)} />
            </Field>
            <Field label="Cada cuántos minutos">
              <select className={input} value={f.multaIntervaloMin} onChange={(e) => set('multaIntervaloMin', e.target.value)}>
                {INTERVALOS_MULTA.map((op) => (
                  <option key={op.min} value={op.min}>{op.label}</option>
                ))}
              </select>
            </Field>
            <p className="text-xs text-muted col-span-2 -mt-1">
              Se cobra el bloque completo aunque falte poco: con ${f.multaMonto || '0'} cada {f.multaIntervaloMin} min, llegar 1 min tarde dentro del bloque ya cuesta ${f.multaMonto || '0'}.
            </p>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.controlMedallas} onChange={(e) => set('controlMedallas', e.target.checked)} />
          Dar <b>medallas y puntos</b> por llegar temprano
        </label>
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Ubicación (GPS)</SectionTitle>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.gpsRequerido} onChange={(e) => set('gpsRequerido', e.target.checked)} />
          Exigir que el empleado esté dentro del rango para marcar
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitud">
            <input className={input} value={f.lat} onChange={(e) => set('lat', e.target.value)} placeholder="-3.677506" />
          </Field>
          <Field label="Longitud">
            <input className={input} value={f.lng} onChange={(e) => set('lng', e.target.value)} placeholder="-79.687398" />
          </Field>
        </div>
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Marca (logo y colores)</SectionTitle>
        <Field label="Logo (URL de imagen — se muestra en el panel, portal y marcación)">
          <input className={input} value={f.logoUrl} onChange={(e) => set('logoUrl', e.target.value)} placeholder="https://.../logo.png" />
        </Field>
        {f.logoUrl && (
          <div className="flex items-center gap-3">
            <img src={f.logoUrl} alt="logo" className="h-14 w-14 object-contain rounded-lg bg-white/5 p-1" />
            <span className="text-xs text-muted">Vista previa del logo</span>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['primary', 'accent', 'bg', 'card'] as const).map((k) => (
            <Field key={k} label={k}>
              <div className="flex items-center gap-2">
                <input type="color" value={f[k]} onChange={(e) => set(k, e.target.value)} className="w-9 h-9 rounded" />
                <input className={input} value={f[k]} onChange={(e) => set(k, e.target.value)} />
              </div>
            </Field>
          ))}
        </div>
      </Card>

      <Card className="space-y-3">
        <SectionTitle>Reportes</SectionTitle>
        <Field label="Correos para reportes (separados por coma)">
          <input className={input} value={f.reportEmails} onChange={(e) => set('reportEmails', e.target.value)} />
        </Field>
        <Field label="WhatsApp para informes periódicos (separados por coma)">
          <input className={input} value={f.reportWhatsapp} onChange={(e) => set('reportWhatsapp', e.target.value)} placeholder="0991234567" />
        </Field>
        <Field label="ID del grupo de WhatsApp (avisa en cada marcación)">
          <input className={input} value={f.whatsappGrupoId} onChange={(e) => set('whatsappGrupoId', e.target.value)} placeholder="120363...@g.us" />
        </Field>
        <p className="text-xs text-muted -mt-1">
          Si todavía no tienes el ID del grupo conectado, déjalo vacío — se puede completar después.
        </p>
      </Card>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-brand px-5 py-2.5" disabled={upd.isPending}>
          {upd.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </form>
  );
}
