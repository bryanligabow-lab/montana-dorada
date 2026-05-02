import { useMemo, useState } from 'react';
import { endOfMonth, format, isWithinInterval, startOfMonth } from 'date-fns';
import { Header } from '../components/Header';
import { ErrorView } from '../components/ErrorView';
import { SkeletonRows } from '../components/ui/Skeleton';
import { MonthPicker } from '../components/ui/MonthPicker';
import { EmployeePicker } from '../components/ui/EmployeePicker';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PagoForm } from '../components/PagoForm';
import {
  useAsistencia,
  useDeletePago,
  useDescansos,
  useEmpleados,
  useExtras,
  useFaltas,
  usePagos,
  usePuntualidad,
} from '../lib/queries';
import { computeDeudasPorPeriodo, type EstadoPagoNomina } from '../lib/analytics';
import { fmtDate, fmtMoney } from '../lib/format';
import { useAuth } from '../lib/useAuth';
import type { Pago } from '../lib/types';
import { isBackendConfigured } from '../lib/config';

function periodoLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number);
  if (!y || !m) return yyyymm;
  const d = new Date(y, m - 1, 1);
  return format(d, "MMM 'de' yyyy");
}

function estadoBadge(estado: EstadoPagoNomina) {
  if (estado === 'PAGADO') return <Badge tone="ok">PAGADO</Badge>;
  if (estado === 'PARCIAL') return <Badge tone="warn">PARCIAL</Badge>;
  return <Badge tone="bad">PENDIENTE</Badge>;
}

export function Pagos() {
  const empleados = useEmpleados();
  const pagos = usePagos();
  const descansos = useDescansos();
  const faltas = useFaltas();
  const extras = useExtras();
  const puntualidad = usePuntualidad();
  const asistencia = useAsistencia();
  const del = useDeletePago();
  const { can } = useAuth();
  const [mes, setMes] = useState(() => new Date());
  const [empId, setEmpId] = useState('');
  const [editing, setEditing] = useState<Pago | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Pago | null>(null);
  // Pre-rellenado del form al pulsar "+ Abono" en una fila de deuda.
  const [presetAbono, setPresetAbono] = useState<{
    empId: string;
    nombre: string;
    periodo: string;
    monto: string;
  } | null>(null);

  if (pagos.error) return <ErrorView error={pagos.error} />;

  const filtered = useMemo(() => {
    if (!pagos.data) return [];
    const start = startOfMonth(mes);
    const end = endOfMonth(mes);
    return pagos.data.filter((p) => {
      // Solo filas registradas desde la plataforma (tienen rowId).
      if (!p.rowId) return false;
      if (!isWithinInterval(p.fecha, { start, end })) return false;
      if (empId && p.id !== empId) return false;
      return true;
    });
  }, [pagos.data, mes, empId]);

  const total = filtered.reduce((acc, p) => acc + p.monto, 0);
  const canWrite = can('pago.create');

  // ─── Deudas por período de nómina (últimos 6 meses) ──────────────────────
  const deudas = useMemo(() => {
    if (!empleados.data || !pagos.data) return [];
    return computeDeudasPorPeriodo(
      mes,
      6,
      empleados.data,
      pagos.data,
      descansos.data ?? [],
      faltas.data ?? [],
      extras.data ?? [],
      puntualidad.data ?? [],
      asistencia.data ?? [],
    ).filter((d) => (empId ? d.empleadoId === empId : true));
  }, [
    mes,
    empleados.data,
    pagos.data,
    descansos.data,
    faltas.data,
    extras.data,
    puntualidad.data,
    asistencia.data,
    empId,
  ]);

  const totalSaldoPendiente = deudas
    .filter((d) => d.estado !== 'PAGADO')
    .reduce((acc, d) => acc + Math.max(0, d.saldo), 0);

  return (
    <div>
      <Header
        title="Pagos"
        subtitle="Pagos por período de nómina · imputación al mes correspondiente"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <MonthPicker value={mes} onChange={setMes} />
            <EmployeePicker
              empleados={empleados.data ?? []}
              value={empId}
              onChange={setEmpId}
              onlyActivos={false}
            />
            {canWrite && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setCreating(true)}
                disabled={!isBackendConfigured()}
                title={!isBackendConfigured() ? 'Backend no configurado' : undefined}
              >
                + Nuevo pago
              </button>
            )}
          </div>
        }
      />

      {/* Sección 1: Deudas por período de nómina */}
      <section className="card overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-tostado/40 flex items-center justify-between flex-wrap gap-2">
          <div className="font-display text-lg tracking-widest text-hueso">
            POR PERÍODO DE NÓMINA
          </div>
          <div className="text-hueso/40 text-xs">
            Últimos 6 meses · saldo pendiente total: <span className="text-fuego font-display text-base">{fmtMoney(totalSaldoPendiente)}</span>
          </div>
        </div>
        {empleados.isLoading || pagos.isLoading ? (
          <div className="p-4"><SkeletonRows rows={6} cols={6} /></div>
        ) : deudas.length === 0 ? (
          <div className="p-6 text-center text-hueso/50 text-sm">Sin datos.</div>
        ) : (
          <div className="table-wrap"><table className="w-full text-sm">
            <thead className="text-hueso/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Período</th>
                <th className="text-left px-4 py-2">Empleado</th>
                <th className="text-right px-4 py-2">Neto</th>
                <th className="text-right px-4 py-2">Pagado</th>
                <th className="text-right px-4 py-2">Saldo</th>
                <th className="text-center px-4 py-2">Estado</th>
                <th className="text-right px-4 py-2 w-32">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tostado/30">
              {deudas.map((d) => (
                <tr key={`${d.empleadoId}-${d.periodo}`} className="hover:bg-tostado/20">
                  <td className="px-4 py-2 text-hueso/80 capitalize">{periodoLabel(d.periodo)}</td>
                  <td className="px-4 py-2">
                    <div className="font-mono text-dorado text-xs">{d.empleadoId}</div>
                    <div className="text-hueso">{d.nombre}</div>
                  </td>
                  <td className="px-4 py-2 text-right text-hueso">{fmtMoney(d.netoMes)}</td>
                  <td className="px-4 py-2 text-right text-hueso/80">{fmtMoney(d.totalPagado)}</td>
                  <td className={`px-4 py-2 text-right font-display text-lg ${d.saldo > 0 ? 'text-fuego' : 'text-hueso/60'}`}>
                    {fmtMoney(Math.max(0, d.saldo))}
                  </td>
                  <td className="px-4 py-2 text-center">{estadoBadge(d.estado)}</td>
                  <td className="px-4 py-2 text-right">
                    {canWrite && d.saldo > 0.01 && (
                      <button
                        type="button"
                        className="text-[11px] px-2 py-1 rounded bg-emerald-700/30 text-emerald-300 hover:bg-emerald-700/50"
                        onClick={() =>
                          setPresetAbono({
                            empId: d.empleadoId,
                            nombre: d.nombre,
                            periodo: d.periodo,
                            monto: String(Math.max(0, d.saldo).toFixed(2)),
                          })
                        }
                        title={`Pagar saldo de ${d.nombre} para ${periodoLabel(d.periodo)}`}
                      >
                        💵 Pagar saldo
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      {/* Sección 2: Listado de pagos del mes (filtra por fecha de registro) */}
      <section className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-tostado/40 flex items-center justify-between flex-wrap gap-2">
          <div className="font-display text-lg tracking-widest text-hueso">
            PAGOS REGISTRADOS
          </div>
          <div className="text-hueso/40 text-xs">
            Filtrado por fecha de registro
          </div>
        </div>
        {pagos.isLoading ? (
          <div className="p-4"><SkeletonRows rows={5} cols={7} /></div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-hueso/50 text-sm">
            Sin pagos para el filtro seleccionado.
          </div>
        ) : (
          <div className="table-wrap"><table className="w-full text-sm">
            <thead className="text-hueso/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Fecha</th>
                <th className="text-left px-4 py-2">Período nómina</th>
                <th className="text-left px-4 py-2">Empleado</th>
                <th className="text-left px-4 py-2">Tipo</th>
                <th className="text-right px-4 py-2">Monto</th>
                <th className="text-right px-4 py-2 w-32">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tostado/30">
              {filtered.map((p, i) => (
                <tr key={`${p.rowId ?? p.id}-${p.fecha.toISOString()}-${i}`} className="hover:bg-tostado/20">
                  <td className="px-4 py-2 text-hueso">{fmtDate(p.fecha)}</td>
                  <td className="px-4 py-2 text-hueso/70 text-xs capitalize">
                    {p.periodoNomina ? periodoLabel(p.periodoNomina) : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-mono text-dorado text-xs">{p.id}</div>
                    <div className="text-hueso">{p.nombre}</div>
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={/anticipo/i.test(p.tipoPago) ? 'warn' : 'gold'}>
                      {p.tipoPago || '—'}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right font-display text-xl text-dorado">
                    {fmtMoney(p.monto)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {canWrite ? (
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          className="btn-ghost text-xs"
                          onClick={() => setEditing(p)}
                          title="Editar"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="btn-ghost text-xs text-fuego"
                          onClick={() => setDeleting(p)}
                          title="Eliminar"
                        >
                          🗑
                        </button>
                      </div>
                    ) : (
                      <span className="text-hueso/30 text-xs">sin permiso</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-tostado/60 bg-tostado/10">
                <td colSpan={4} className="px-4 py-3 text-right text-hueso/60 uppercase text-xs tracking-wider">
                  Total del período
                </td>
                <td className="px-4 py-3 text-right font-display text-2xl text-dorado">
                  {fmtMoney(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table></div>
        )}
      </section>

      <Modal
        isOpen={creating}
        onClose={() => setCreating(false)}
        title="Nuevo pago"
      >
        <PagoForm
          empleados={empleados.data ?? []}
          defaultEmpleadoId={empId || undefined}
          onDone={() => setCreating(false)}
        />
      </Modal>

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title="Editar pago"
      >
        {editing && (
          <PagoForm
            empleados={empleados.data ?? []}
            initial={editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>

      {/* Modal de "+ Abono" pre-rellenado con empleado, período y monto sugerido */}
      <Modal
        isOpen={!!presetAbono}
        onClose={() => setPresetAbono(null)}
        title={presetAbono ? `Pagar saldo · ${presetAbono.nombre}` : 'Pagar saldo'}
      >
        {presetAbono && (
          <PagoForm
            empleados={empleados.data ?? []}
            defaultEmpleadoId={presetAbono.empId}
            defaultPeriodoNomina={presetAbono.periodo}
            defaultTipoPago="ABONO"
            defaultMonto={presetAbono.monto}
            onDone={() => setPresetAbono(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        title="Eliminar pago"
        message={
          deleting
            ? `¿Eliminar el pago de ${deleting.nombre} por ${fmtMoney(deleting.monto)} del ${fmtDate(deleting.fecha)}?`
            : ''
        }
        loading={del.isPending}
        onConfirm={async () => {
          if (!deleting?.rowId) return;
          try {
            await del.mutateAsync(deleting.rowId);
            setDeleting(null);
          } catch { /* el error visible en próxima carga */ }
        }}
      />
    </div>
  );
}
