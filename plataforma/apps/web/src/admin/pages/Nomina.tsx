import { useState } from 'react';
import { useAdmin } from '../ctx';
import { useNomina } from '../queries';
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

      <Card>
        {q.isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[960px]">
              <thead>
                <tr className="text-muted text-left text-xs uppercase tracking-wide">
                  <th className="p-2">Empleado</th>
                  <th className="p-2 text-center">Días</th>
                  <th className="p-2 text-center">Horas normales</th>
                  <th className="p-2 text-center">Horas extra</th>
                  <th className="p-2 text-right">Sueldo base</th>
                  <th className="p-2 text-right">Hora extra ($)</th>
                  <th className="p-2 text-right">Multa pagó</th>
                  <th className="p-2 text-right">Multa ganó</th>
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
                    <td className="p-2 text-right" style={{ color: r.multaGanada > 0 ? 'var(--c-primary)' : undefined }}>
                      {r.multaGanada > 0 ? `+${money(r.multaGanada)}` : money(0)}
                    </td>
                    <td className="p-2 text-right font-black">{money(r.totalARecibir)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted">
                      Sin datos en el período.
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-white/10">
                    <td colSpan={8} className="p-2 text-right font-bold text-muted">
                      Total nómina del período
                    </td>
                    <td className="p-2 text-right font-black" style={{ color: 'var(--c-primary)' }}>
                      {money(totalGeneral)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
