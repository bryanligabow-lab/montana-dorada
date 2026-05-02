import { Fragment, useMemo, useState } from 'react';
import { Header } from '../components/Header';
import { ErrorView } from '../components/ErrorView';
import { SkeletonRows } from '../components/ui/Skeleton';
import { MonthPicker } from '../components/ui/MonthPicker';
import {
  useAsistencia,
  useDescansos,
  useEmpleados,
  useExtras,
  useFaltas,
  usePagos,
  usePuntualidad,
} from '../lib/queries';
import { computeNominaMes } from '../lib/analytics';
import { fmtDate, fmtMoney, descansoColor, descansoLabel } from '../lib/format';
import type { DescansoTipo } from '../lib/types';

const TIPOS: DescansoTipo[] = ['PLANIFICADO', 'VACACIONES', 'PERMISO', 'ENFERMEDAD'];

export function Nomina() {
  const empleados = useEmpleados();
  const pagos = usePagos();
  const descansos = useDescansos();
  const faltas = useFaltas();
  const extras = useExtras();
  const puntualidad = usePuntualidad();
  const asistencia = useAsistencia();
  const [mes, setMes] = useState(() => new Date());
  const [openId, setOpenId] = useState<string | null>(null);

  const anyError = empleados.error || pagos.error || faltas.error || extras.error;
  const anyLoading =
    empleados.isLoading ||
    pagos.isLoading ||
    faltas.isLoading ||
    extras.isLoading ||
    descansos.isLoading;

  const resumen = useMemo(() => {
    if (!empleados.data || !pagos.data) return [];
    return computeNominaMes(
      mes,
      empleados.data,
      pagos.data,
      descansos.data ?? [],
      faltas.data ?? [],
      extras.data ?? [],
      puntualidad.data ?? [],
      asistencia.data ?? [],
    );
  }, [empleados.data, pagos.data, descansos.data, faltas.data, extras.data, puntualidad.data, asistencia.data, mes]);

  const totales = resumen.reduce(
    (acc, r) => ({
      base: acc.base + r.baseMensual,
      extras: acc.extras + r.extras,
      faltas: acc.faltas + r.faltas,
      descuento: acc.descuento + r.descuentoFaltas,
      multas: acc.multas + r.multasGanadas,
      anticipos: acc.anticipos + r.anticipos,
      pagado: acc.pagado + r.totalPagado,
      neto: acc.neto + r.netoMes,
    }),
    { base: 0, extras: 0, faltas: 0, descuento: 0, multas: 0, anticipos: 0, pagado: 0, neto: 0 },
  );

  if (anyError) return <ErrorView error={anyError} />;

  return (
    <div>
      <Header
        title="Nómina"
        subtitle="Base mensual + extras − faltas − anticipos = neto a pagar"
        actions={<MonthPicker value={mes} onChange={setMes} />}
      />

      <section className="grid grid-cols-2 md:grid-cols-7 gap-3 mb-6">
        <div className="card p-3">
          <div className="text-hueso/50 text-[10px] uppercase tracking-widest">Base mensual</div>
          <div className="font-display text-xl text-dorado">{fmtMoney(totales.base)}</div>
        </div>
        <div className="card p-3">
          <div className="text-hueso/50 text-[10px] uppercase tracking-widest">Extras</div>
          <div className="font-display text-xl text-doradoBrillo">+{fmtMoney(totales.extras)}</div>
        </div>
        <div className="card p-3">
          <div className="text-hueso/50 text-[10px] uppercase tracking-widest">Faltas</div>
          <div className="font-display text-xl text-fuego">
            {totales.faltas}
            <span className="text-sm"> · −{fmtMoney(totales.descuento)}</span>
          </div>
        </div>
        <div className="card p-3">
          <div className="text-hueso/50 text-[10px] uppercase tracking-widest">Multas</div>
          <div className="font-display text-xl text-brasa">−{fmtMoney(totales.multas)}</div>
        </div>
        <div className="card p-3">
          <div className="text-hueso/50 text-[10px] uppercase tracking-widest">Anticipos</div>
          <div className="font-display text-xl text-brasa">−{fmtMoney(totales.anticipos)}</div>
        </div>
        <div className="card p-3">
          <div className="text-hueso/50 text-[10px] uppercase tracking-widest">Pagado</div>
          <div className="font-display text-xl text-llama">−{fmtMoney(totales.pagado)}</div>
        </div>
        <div className="card p-3">
          <div className="text-hueso/50 text-[10px] uppercase tracking-widest">Neto del mes</div>
          <div
            className={`font-display text-2xl ${
              totales.neto >= 0 ? 'text-doradoBrillo' : 'text-fuego'
            }`}
          >
            {fmtMoney(totales.neto)}
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        {anyLoading ? (
          <div className="p-4"><SkeletonRows rows={5} cols={7} /></div>
        ) : resumen.length === 0 ? (
          <div className="p-8 text-center text-hueso/50 text-sm">Sin empleados activos.</div>
        ) : (
          <div className="table-wrap"><table className="w-full text-sm">
            <thead className="text-hueso/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2">Empleado</th>
                <th className="text-right px-3 py-2">Base</th>
                <th className="text-right px-3 py-2">Extras</th>
                <th className="text-right px-3 py-2">Faltas</th>
                <th className="text-right px-3 py-2">Tarde</th>
                <th className="text-right px-3 py-2">Multas</th>
                <th className="text-right px-3 py-2">Anticipos</th>
                <th className="text-right px-3 py-2">Pagado</th>
                <th className="text-right px-3 py-2">Neto</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tostado/30">
              {resumen.map((r) => {
                const open = openId === r.empleadoId;
                return (
                  <Fragment key={r.empleadoId}>
                    <tr
                      className="hover:bg-tostado/20 cursor-pointer"
                      onClick={() => setOpenId(open ? null : r.empleadoId)}
                    >
                      <td className="px-3 py-2">
                        <div className="font-mono text-dorado text-xs">{r.empleadoId}</div>
                        <div className="text-hueso">{r.nombre}</div>
                        <div className="text-hueso/40 text-[10px]">
                          {fmtMoney(r.sueldoDiario)}/día
                          {r.sueldoMensual > 0 && <> · obj {fmtMoney(r.sueldoMensual)}</>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-dorado">
                        {r.baseMensual > 0 ? fmtMoney(r.baseMensual) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-doradoBrillo">
                        {r.extras > 0 ? '+' + fmtMoney(r.extras) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.faltas > 0 ? (
                          <span className="text-fuego">
                            {r.faltas}
                            {r.autoFaltas > 0 && (
                              <span className="text-hueso/50 text-[10px]"> ({r.autoFaltas} auto)</span>
                            )}
                            <br />
                            <span className="text-[10px]">−{fmtMoney(r.descuentoFaltas)}</span>
                          </span>
                        ) : (
                          <span className="text-hueso/40">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.vecesTarde > 0 ? (
                          <span className="text-llama">
                            {r.vecesTarde}×
                            <br />
                            <span className="text-[10px]">{r.minTardeTotal} min</span>
                          </span>
                        ) : (
                          <span className="text-hueso/40">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-brasa">
                        {r.multasGanadas > 0 ? '−' + fmtMoney(r.multasGanadas) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-brasa">
                        {r.anticipos > 0 ? '−' + fmtMoney(r.anticipos) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-llama">
                        {r.totalPagado > 0 ? '−' + fmtMoney(r.totalPagado) : '—'}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-display text-lg ${
                          r.netoMes >= 0 ? 'text-doradoBrillo' : 'text-fuego'
                        }`}
                      >
                        {fmtMoney(r.netoMes)}
                      </td>
                      <td className="px-3 py-2 text-right text-hueso/40">{open ? '▲' : '▼'}</td>
                    </tr>
                    {open && (
                      <tr className="bg-bg/40">
                        <td colSpan={10} className="px-3 py-3">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <Box title={`Faltas (${r.faltas})`}>
                              {r.faltasDetalle.length === 0 ? (
                                <Empty />
                              ) : (
                                <ul className="space-y-1 text-xs">
                                  {r.faltasDetalle.map((f) => (
                                    <li key={f.rowId} className="flex justify-between">
                                      <span className="text-hueso/70">{fmtDate(f.fecha, 'dd/MM')}</span>
                                      <span className="text-fuego">
                                        −{fmtMoney(f.descuento > 0 ? f.descuento : r.sueldoDiario)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </Box>
                            <Box title={`Extras (${r.extrasDetalle.length})`}>
                              {r.extrasDetalle.length === 0 ? (
                                <Empty />
                              ) : (
                                <ul className="space-y-1 text-xs">
                                  {r.extrasDetalle.map((x) => (
                                    <li key={x.rowId} className="flex justify-between gap-2">
                                      <span className="text-hueso/70">
                                        {fmtDate(x.fecha, 'dd/MM')} · {x.concepto}
                                      </span>
                                      <span className="text-doradoBrillo">+{fmtMoney(x.monto)}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </Box>
                            <Box title={`Anticipos (${r.anticiposDetalle.length})`}>
                              {r.anticiposDetalle.length === 0 ? (
                                <Empty />
                              ) : (
                                <ul className="space-y-1 text-xs">
                                  {r.anticiposDetalle.map((p, i) => (
                                    <li
                                      key={p.rowId ?? `${p.id}-${i}`}
                                      className="flex justify-between gap-2"
                                    >
                                      <span className="text-hueso/70">
                                        {fmtDate(p.fecha, 'dd/MM')} · {p.tipoPago}
                                      </span>
                                      <span className="text-llama">−{fmtMoney(p.monto)}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </Box>
                            <Box title={`Descansos (${r.descansos})`}>
                              {r.descansosDetalle.length === 0 ? (
                                <Empty />
                              ) : (
                                <ul className="space-y-1 text-xs">
                                  {r.descansosDetalle.map((d) => (
                                    <li key={d.rowId} className="flex items-center gap-2">
                                      <span className="text-hueso/70">{fmtDate(d.fecha, 'dd/MM')}</span>
                                      <span className={`px-1 rounded text-[10px] ${descansoColor[d.tipo]}`}>
                                        {descansoLabel[d.tipo]}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </Box>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-hueso/50">
                            {TIPOS.map((t) => (
                              <span key={t} className={`px-2 py-0.5 rounded ${descansoColor[t]}`}>
                                {descansoLabel[t]}: {r.descansosPorTipo[t]}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bgDeep/60 border border-tostado/30 rounded-lg p-3">
      <div className="text-hueso/50 text-[10px] uppercase tracking-widest mb-2">{title}</div>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="text-hueso/30 text-xs">Sin registros.</div>;
}
