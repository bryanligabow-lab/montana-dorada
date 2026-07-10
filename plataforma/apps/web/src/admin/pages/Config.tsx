import { useEffect, useState } from 'react';
import type { BusinessUpdateInput } from '@asis/shared';
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

export function Config() {
  const { current } = useAdmin();
  const upd = useUpdateBusiness(current.id);
  const [msg, setMsg] = useState('');

  const [f, setF] = useState(() => init());
  function init() {
    return {
      nombre: current.nombre,
      horaEntradaLv: current.horaEntradaLv,
      horaEntradaFds: current.horaEntradaFds,
      multaPorMin: String(current.multaPorMin),
      radioMetros: String(current.radioMetros),
      lat: current.lat?.toString() ?? '',
      lng: current.lng?.toString() ?? '',
      gpsRequerido: current.gpsRequerido,
      controlAlmuerzo: current.controlAlmuerzo,
      controlMultas: current.controlMultas,
      controlMedallas: current.controlMedallas,
      primary: current.branding.primary,
      accent: current.branding.accent,
      bg: current.branding.bg,
      card: current.branding.card,
      reportEmails: current.reportEmails.join(', '),
    };
  }
  // Resetear el formulario al cambiar de negocio.
  useEffect(() => setF(init()), [current.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof ReturnType<typeof init>, v: string | boolean) =>
    setF((prev) => ({ ...prev, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const data: BusinessUpdateInput = {
      nombre: f.nombre,
      horaEntradaLv: f.horaEntradaLv,
      horaEntradaFds: f.horaEntradaFds,
      multaPorMin: Number(f.multaPorMin),
      radioMetros: Number(f.radioMetros),
      lat: f.lat ? Number(f.lat) : null,
      lng: f.lng ? Number(f.lng) : null,
      gpsRequerido: f.gpsRequerido,
      controlAlmuerzo: f.controlAlmuerzo,
      controlMultas: f.controlMultas,
      controlMedallas: f.controlMedallas,
      branding: { primary: f.primary, accent: f.accent, bg: f.bg, card: f.card },
      reportEmails: f.reportEmails
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hora límite L–V (HH:mm:ss)">
            <input className={input} value={f.horaEntradaLv} onChange={(e) => set('horaEntradaLv', e.target.value)} />
          </Field>
          <Field label="Hora límite Sáb–Dom (HH:mm:ss)">
            <input className={input} value={f.horaEntradaFds} onChange={(e) => set('horaEntradaFds', e.target.value)} />
          </Field>
          <Field label="Multa por minuto ($)">
            <input className={input} type="number" step="0.01" value={f.multaPorMin} onChange={(e) => set('multaPorMin', e.target.value)} />
          </Field>
          <Field label="Radio GPS (metros)">
            <input className={input} type="number" value={f.radioMetros} onChange={(e) => set('radioMetros', e.target.value)} />
          </Field>
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
        <SectionTitle>Marca (colores)</SectionTitle>
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
