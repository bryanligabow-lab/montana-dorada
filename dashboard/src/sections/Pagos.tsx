import { useMemo, useState } from 'react';
import { endOfMonth, isWithinInterval, startOfMonth } from 'date-fns';
import { Header } from '../components/Header';
import { ErrorView } from '../components/ErrorView';
import { SkeletonRows } from '../components/ui/Skeleton';
import { MonthPicker } from '../components/ui/MonthPicker';
import { EmployeePicker } from '../components/ui/EmployeePicker';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PagoForm } from '../components/PagoForm';
import { useDeletePago, useEmpleados, usePagos } from '../lib/queries';
import { fmtDate, fmtMoney } from '../lib/format';
import { useAuth } from '../lib/useAuth';
import type { Pago } from '../lib/types';
import { isBackendConfigured } from '../lib/config';

export function Pagos() {
  const empleados = useEmpleados();
  const pagos = usePagos();
  const del = useDeletePago();
  const { can } = useAuth();
  const [mes, setMes] = useState(() => new Date());
  const [empId, setEmpId] = useState('');
  const [editing, setEditing] = useState<Pago | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Pago | null>(null);

  if (pagos.error) return <ErrorView error={pagos.error} />;

  const filtered = useMemo(() => {
    if (!pagos.data) return [];
    const start = startOfMonth(mes);
    const end = endOfMonth(mes);
    return pagos.data.filter((p) => {
      // Solo filas registradas desde la plataforma (tienen rowId).
      // Las filas "legacy" del Sheet no se muestran acá — la plataforma es
      // la fuente única de pagos.
      if (!p.rowId) return false;
      if (!isWithinInterval(p.fecha, { start, end })) return false;
      if (empId && p.id !== empId) return false;
      return true;
    });
  }, [pagos.data, mes, empId]);

  const total = filtered.reduce((acc, p) => acc + p.monto, 0);
  const canWrite = can('pago.create');

  return (
    <div>
      <Header
        title="Pagos"
        subtitle="Abonos y anticipos registrados"
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
                title={!isBackendConfigured() ? 'Backend no configurado — ver apps-script/README.md' : undefined}
              >
                + Nuevo pago
              </button>
            )}
          </div>
        }
      />

      <section className="card overflow-hidden">
        {pagos.isLoading ? (
          <div className="p-4"><SkeletonRows rows={5} cols={6} /></div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-hueso/50 text-sm">
            Sin pagos para el filtro seleccionado.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-hueso/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Fecha</th>
                <th className="text-left px-4 py-2">Hora</th>
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
                  <td className="px-4 py-2 text-hueso/70 font-mono text-xs">{p.hora}</td>
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
          </table>
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
