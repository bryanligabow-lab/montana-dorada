import { useState } from 'react';
import type { NominaRow } from '@asis/shared';
import { useAdmin } from '../ctx';
import { useEnviarNominaDueno, useEnviarNominaEmpleados, useNomina } from '../queries';
import { Card, Spinner, money } from '../ui';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function hoy(): [string, string] {
  const t = iso(new Date());
  return [t, t];
}
function estaSemana(): [string, string] {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // 0 = lunes
  const lunes = new Date(now);
  lunes.setDate(now.getDate() - dow);
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  return [iso(lunes), iso(domingo)];
}
function estaQuincena(): [string, string] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (now.getDate() <= 15) return [iso(new Date(y, m, 1)), iso(new Date(y, m, 15))];
  const ultimo = new Date(y, m + 1, 0).getDate();
  return [iso(new Date(y, m, 16)), iso(new Date(y, m, ultimo))];
}
function esteMes(): [string, string] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const ultimo = new Date(y, m + 1, 0).getDate();
  return [iso(new Date(y, m, 1)), iso(new Date(y, m, ultimo))];
}

const ATAJOS = [
  { label: 'Hoy', fn: hoy },
  { label: 'Esta semana', fn: estaSemana },
  { label: 'Quincena actual', fn: estaQuincena },
  { label: 'Este mes', fn: esteMes },
];

export function Nomina() {
  const { current } = useAdmin();
  const [[from, to], setRango] = useState<[string, string]>(esteMes());
  const q = useNomina(current.id, from, to);

  const rows = q.data ?? [];
  const totalGeneral = rows.reduce((s, r) => s + r.totalARecibir, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-black tracking-wide">Nómina</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            className="field px-3 py-2 text-sm"
            value={from}
            onChange={(e) => setRango([e.target.value, to])}
          />
          <span className="text-muted text-sm">a</span>
          <input
            type="date"
            className="field px-3 py-2 text-sm"
            value={to}
            onChange={(e) => setRango([from, e.target.value])}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {ATAJOS.map((a) => {
          const [af, at] = a.fn();
          const activo = af === from && at === to;
          return (
            <button
              key={a.label}
              className={activo ? 'btn-brand px-3 py-1 text-xs' : 'chip px-3 py-1 text-xs'}
              onClick={() => setRango(a.fn())}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      <EnviarInformes bizId={current.id} from={from} to={to} hayDatos={rows.length > 0} />

      {q.isLoading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Card>
          <div className="p-6 text-center text-muted">Sin datos en el período.</div>
        </Card>
      ) : (
        <>
          {/* Móvil: una tarjeta por empleado. */}
          <div className="space-y-3 md:hidden">
            {rows.map((r) => (
              <NominaCard key={r.employeeId} r={r} />
            ))}
            <Card>
              <div className="flex items-center justify-between">
                <span className="font-bold text-muted">Total nómina del período</span>
                <span className="text-xl font-black" style={{ color: 'var(--c-primary)' }}>
                  {money(totalGeneral)}
                </span>
              </div>
            </Card>
          </div>

          {/* Escritorio: tabla completa. */}
          <Card className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1080px]">
                <thead>
                  <tr className="text-muted text-left text-xs uppercase tracking-wide">
                    <th className="p-2">Empleado</th>
                    <th className="p-2 text-center">Días</th>
                    <th className="p-2 text-center">H. normales</th>
                    <th className="p-2 text-center">H. extra</th>
                    <th className="p-2 text-right">Sueldo base</th>
                    <th className="p-2 text-right">Hora extra ($)</th>
                    <th className="p-2 text-right">Multa atraso</th>
                    <th className="p-2 text-right">Multa manual</th>
                    <th className="p-2 text-right">Anticipos</th>
                    <th className="p-2 text-right">Total a recibir</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.employeeId} className="border-t border-white/5">
                      <td className="p-2">
                        <div className="font-bold">{r.nombre}</div>
                        <div className="text-xs text-muted">
                          {r.codigo} · {r.tipoSueldo === 'FIJO' ? 'fijo' : 'por día'}
                        </div>
                      </td>
                      <td className="p-2 text-center text-muted">{r.diasTrabajados}</td>
                      <td className="p-2 text-center">{r.horasNormales}h</td>
                      <td className="p-2 text-center" style={{ color: r.horasExtra > 0 ? 'var(--c-primary)' : undefined }}>
                        {r.horasExtra}h
                      </td>
                      <td className="p-2 text-right">{money(r.sueldoBase)}</td>
                      <td className="p-2 text-right">{money(r.pagoHoraExtra)}</td>
                      <td className="p-2 text-right" style={{ color: r.multaPagada > 0 ? 'var(--c-accent)' : undefined }}>
                        {r.multaPagada > 0 ? `-${money(r.multaPagada)}` : money(0)}
                      </td>
                      <td className="p-2 text-right" style={{ color: r.multaManual > 0 ? 'var(--c-accent)' : undefined }}>
                        {r.multaManual > 0 ? `-${money(r.multaManual)}` : money(0)}
                      </td>
                      <td className="p-2 text-right" style={{ color: r.anticipos > 0 ? 'var(--c-accent)' : undefined }}>
                        {r.anticipos > 0 ? `-${money(r.anticipos)}` : money(0)}
                      </td>
                      <td className="p-2 text-right font-black">{money(r.totalARecibir)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-white/10">
                    <td colSpan={9} className="p-2 text-right font-bold text-muted">
                      Total nómina del período
                    </td>
                    <td className="p-2 text-right font-black" style={{ color: 'var(--c-primary)' }}>
                      {money(totalGeneral)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-muted">{label}</span>
      <span style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

function NominaCard({ r }: { r: NominaRow }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="font-black">{r.nombre}</div>
          <div className="text-xs text-muted">
            {r.codigo} · {r.tipoSueldo === 'FIJO' ? 'fijo' : 'por día'} · {r.diasTrabajados} días · {r.horasExtra}h extra
          </div>
        </div>
      </div>
      <div className="border-t border-white/5 pt-2">
        <Row label="Sueldo base" value={money(r.sueldoBase)} />
        {r.pagoHoraExtra > 0 && <Row label="Hora extra" value={`+${money(r.pagoHoraExtra)}`} color="var(--c-primary)" />}
        {r.multaGanada > 0 && <Row label="Bono puntualidad" value={`+${money(r.multaGanada)}`} color="var(--c-primary)" />}
        {r.multaPagada > 0 && <Row label="Multa atraso" value={`-${money(r.multaPagada)}`} color="var(--c-accent)" />}
        {r.multaManual > 0 && <Row label="Multa manual" value={`-${money(r.multaManual)}`} color="var(--c-accent)" />}
        {r.anticipos > 0 && <Row label="Anticipos" value={`-${money(r.anticipos)}`} color="var(--c-accent)" />}
        <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/10">
          <span className="font-black">Total a recibir</span>
          <span className="text-lg font-black" style={{ color: 'var(--c-primary)' }}>
            {money(r.totalARecibir)}
          </span>
        </div>
      </div>
    </Card>
  );
}

function EnviarInformes({ bizId, from, to, hayDatos }: { bizId: string; from: string; to: string; hayDatos: boolean }) {
  const dueno = useEnviarNominaDueno(bizId);
  const empleados = useEnviarNominaEmpleados(bizId);
  const [msg, setMsg] = useState('');

  async function alDueno() {
    setMsg('');
    if (!confirm('¿Enviar el informe completo de este período al dueño (WhatsApp de reportes + correos)?')) return;
    try {
      const r = await dueno.mutateAsync({ from, to });
      setMsg(`Informe enviado al dueño: ${r.whatsapp} WhatsApp, ${r.email} correo(s).`);
    } catch (e) {
      setMsg(e instanceof Error && e.message === 'sin_destinos'
        ? 'No hay WhatsApp ni correos de reportes configurados (Configuración → Reportes).'
        : 'No se pudo enviar (¿WhatsApp/correo configurados?).');
    }
  }

  async function aEmpleados() {
    setMsg('');
    if (!confirm('¿Enviar a cada empleado su recibo de nómina en PDF por WhatsApp?')) return;
    try {
      const r = await empleados.mutateAsync({ from, to });
      setMsg(`Recibos enviados: ${r.enviados} de ${r.total}. ${r.sinTelefono > 0 ? `${r.sinTelefono} sin WhatsApp registrado.` : ''}`);
    } catch {
      setMsg('No se pudo enviar (revisa la conexión de WhatsApp).');
    }
  }

  return (
    <Card className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          className="btn-brand px-4 py-2.5 text-sm flex-1"
          onClick={alDueno}
          disabled={!hayDatos || dueno.isPending}
        >
          {dueno.isPending ? 'Enviando…' : '📤 Enviar informe al dueño'}
        </button>
        <button
          className="chip px-4 py-2.5 text-sm flex-1"
          onClick={aEmpleados}
          disabled={!hayDatos || empleados.isPending}
        >
          {empleados.isPending ? 'Enviando…' : '📱 Enviar a cada empleado su nómina (PDF)'}
        </button>
      </div>
      {msg && <div className="text-sm text-muted">{msg}</div>}
    </Card>
  );
}
