import { useMemo, useState } from 'react';
import { endOfMonth, isWithinInterval, startOfMonth } from 'date-fns';
import { Header } from '../components/Header';
import { ErrorView } from '../components/ErrorView';
import { SkeletonRows } from '../components/ui/Skeleton';
import { MonthPicker } from '../components/ui/MonthPicker';
import { EmployeePicker } from '../components/ui/EmployeePicker';
import { Badge } from '../components/ui/Badge';
import { useEmpleados, usePuntualidad } from '../lib/queries';
import { fmtDate, fmtMoney } from '../lib/format';

export function Multas() {
  const empleados = useEmpleados();
  const punt = usePuntualidad();
  const [mes, setMes] = useState(() => new Date());
  const [empId, setEmpId] = useState('');

  if (punt.error) return <ErrorView error={punt.error} />;

  const filtered = useMemo(() => {
    if (!punt.data) return [];
    const start = startOfMonth(mes);
    const end = endOfMonth(mes);
    return punt.data.filter((p) => {
      if (!isWithinInterval(p.fecha, { start, end })) return false;
      if (empId && p.id !== empId) return false;
      return true;
    });
  }, [punt.data, mes, empId]);

  // Resumen por empleado
  const porEmpleado = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        nombre: string;
        vecesTarde: number;
        vecesTemprano: number;
        minTarde: number;
        minTemprano: number;
        multaGanada: number;
        multaPagada: number;
        registros: number;
      }
    >();
    for (const p of filtered) {
      const r = map.get(p.id) ?? {
        id: p.id,
        nombre: p.nombre,
        vecesTarde: 0,
        vecesTemprano: 0,
        minTarde: 0,
        minTemprano: 0,
        multaGanada: 0,
        multaPagada: 0,
        registros: 0,
      };
      r.registros++;
      if (p.minTarde > 0) r.vecesTarde++;
      if (p.minTemprano > 0) r.vecesTemprano++;
      r.minTarde += p.minTarde;
      r.minTemprano += p.minTemprano;
      r.multaGanada += p.multaGanada;
      r.multaPagada += p.multaPagada;
      map.set(p.id, r);
    }
    return Array.from(map.values()).sort((a, b) => b.multaGanada - a.multaGanada);
  }, [filtered]);

  const totales = porEmpleado.reduce(
    (a, r) => ({
      vecesTarde: a.vecesTarde + r.vecesTarde,
      minTarde: a.minTarde + r.minTarde,
      minTemprano: a.minTemprano + r.minTemprano,
      multaGanada: a.multaGanada + r.multaGanada,
      multaPagada: a.multaPagada + r.multaPagada,
    }),
    { vecesTarde: 0, minTarde: 0, minTemprano: 0, multaGanada: 0, multaPagada: 0 },
  );
  const pendiente = totales.multaGanada - totales.multaPagada;

  return (
    <div>
      <Header
        title="Multas / Puntualidad"
        subtitle="Tardanzas y multas registradas automáticamente (PUNTUALIDAD del Sheet)"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <MonthPicker value={mes} onChange={setMes} />
            <EmployeePicker
              empleados={empleados.data ?? []}
              value={empId}
              onChange={setEmpId}
              onlyActivos={false}
            />
          </div>
        }
      />

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="card p-4">
          <div className="text-hueso/50 text-[10px] uppercase tracking-widest">Veces tarde</div>
          <div className="font-display text-2xl text-fuego">{totales.vecesTarde}</div>
        </div>
        <div className="card p-4">
          <div className="text-hueso/50 text-[10px] uppercase tracking-widest">Min. tarde totales</div>
          <div className="font-display text-2xl text-llama">{totales.minTarde}</div>
        </div>
        <div className="card p-4">
          <div className="text-hueso/50 text-[10px] uppercase tracking-widest">Min. temprano totales</div>
          <div className="font-display text-2xl text-dorado">{totales.minTemprano}</div>
        </div>
        <div className="card p-4">
          <div className="text-hueso/50 text-[10px] uppercase tracking-widest">Multas ganadas</div>
          <div className="font-display text-2xl text-brasa">{fmtMoney(totales.multaGanada)}</div>
          <div className="text-hueso/40 text-xs">Pagadas: {fmtMoney(totales.multaPagada)}</div>
        </div>
        <div className="card p-4">
          <div className="text-hueso/50 text-[10px] uppercase tracking-widest">Pendiente</div>
          <div className={`font-display text-2xl ${pendiente > 0 ? 'text-fuego' : 'text-doradoBrillo'}`}>
            {fmtMoney(pendiente)}
          </div>
          <div className="text-hueso/40 text-xs">Por descontar de nómina</div>
        </div>
      </section>

      <section className="card overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-tostado/40 font-display text-lg tracking-widest text-hueso">
          RESUMEN POR EMPLEADO
        </div>
        {punt.isLoading ? (
          <div className="p-4">
            <SkeletonRows rows={5} cols={6} />
          </div>
        ) : porEmpleado.length === 0 ? (
          <div className="p-8 text-center text-hueso/50 text-sm">
            Sin registros para el período seleccionado.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-hueso/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Empleado</th>
                <th className="text-right px-4 py-2">Marcaciones</th>
                <th className="text-right px-4 py-2">Veces tarde</th>
                <th className="text-right px-4 py-2">Min. tarde</th>
                <th className="text-right px-4 py-2">Min. temprano</th>
                <th className="text-right px-4 py-2">Multa ganada</th>
                <th className="text-right px-4 py-2">Multa pagada</th>
                <th className="text-right px-4 py-2">Pendiente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tostado/30">
              {porEmpleado.map((r) => {
                const pend = r.multaGanada - r.multaPagada;
                return (
                  <tr key={r.id} className="hover:bg-tostado/20">
                    <td className="px-4 py-2">
                      <div className="font-mono text-dorado text-xs">{r.id}</div>
                      <div className="text-hueso">{r.nombre}</div>
                    </td>
                    <td className="px-4 py-2 text-right text-hueso/80">{r.registros}</td>
                    <td className="px-4 py-2 text-right">
                      {r.vecesTarde > 0 ? (
                        <span className="text-fuego font-semibold">{r.vecesTarde}</span>
                      ) : (
                        <span className="text-hueso/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-llama">{r.minTarde}</td>
                    <td className="px-4 py-2 text-right text-dorado">{r.minTemprano}</td>
                    <td className="px-4 py-2 text-right text-brasa">{fmtMoney(r.multaGanada)}</td>
                    <td className="px-4 py-2 text-right text-hueso/70">{fmtMoney(r.multaPagada)}</td>
                    <td
                      className={`px-4 py-2 text-right font-display text-lg ${
                        pend > 0 ? 'text-fuego' : 'text-hueso/40'
                      }`}
                    >
                      {pend > 0 ? fmtMoney(pend) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-tostado/40 font-display text-lg tracking-widest text-hueso">
          DETALLE DE MARCACIONES
        </div>
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-hueso/50 text-sm">Sin registros.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-hueso/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Fecha</th>
                <th className="text-left px-4 py-2">Empleado</th>
                <th className="text-left px-4 py-2">Hora entrada</th>
                <th className="text-left px-4 py-2">Nivel</th>
                <th className="text-right px-4 py-2">Min. tarde</th>
                <th className="text-right px-4 py-2">Min. temprano</th>
                <th className="text-right px-4 py-2">Multa ganada</th>
                <th className="text-right px-4 py-2">Multa pagada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tostado/30">
              {filtered.map((p, i) => (
                <tr key={`${p.id}-${p.fecha.toISOString()}-${i}`} className="hover:bg-tostado/20">
                  <td className="px-4 py-2 text-hueso/80">{fmtDate(p.fecha)}</td>
                  <td className="px-4 py-2">
                    <div className="font-mono text-dorado text-xs">{p.id}</div>
                    <div className="text-hueso">{p.nombre}</div>
                  </td>
                  <td className="px-4 py-2 font-mono text-hueso/70 text-xs">{p.horaEntrada}</td>
                  <td className="px-4 py-2">
                    <Badge tone={/tarde/i.test(p.nivel) ? 'bad' : /temprano/i.test(p.nivel) ? 'ok' : 'neutral'}>
                      {p.nivel || '—'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right text-llama">{p.minTarde > 0 ? p.minTarde : '—'}</td>
                  <td className="px-4 py-2 text-right text-dorado">{p.minTemprano > 0 ? p.minTemprano : '—'}</td>
                  <td className="px-4 py-2 text-right text-brasa">
                    {p.multaGanada > 0 ? fmtMoney(p.multaGanada) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-hueso/70">
                    {p.multaPagada > 0 ? fmtMoney(p.multaPagada) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
