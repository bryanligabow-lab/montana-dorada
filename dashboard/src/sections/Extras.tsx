import { useMemo, useState } from 'react';
import { endOfMonth, isWithinInterval, startOfMonth } from 'date-fns';
import { Header } from '../components/Header';
import { ErrorView } from '../components/ErrorView';
import { SkeletonRows } from '../components/ui/Skeleton';
import { MonthPicker } from '../components/ui/MonthPicker';
import { EmployeePicker } from '../components/ui/EmployeePicker';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ExtraForm } from '../components/ExtraForm';
import { useDeleteExtra, useEmpleados, useExtras } from '../lib/queries';
import { fmtDate, fmtMoney } from '../lib/format';
import { useAuth } from '../lib/useAuth';
import { isBackendConfigured } from '../lib/config';
import type { Extra } from '../lib/types';

export function Extras() {
  const empleados = useEmpleados();
  const extras = useExtras();
  const del = useDeleteExtra();
  const { can } = useAuth();
  const [mes, setMes] = useState(() => new Date());
  const [empId, setEmpId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Extra | null>(null);
  const [deleting, setDeleting] = useState<Extra | null>(null);

  if (extras.error) return <ErrorView error={extras.error} />;

  const filtered = useMemo(() => {
    if (!extras.data) return [];
    const start = startOfMonth(mes);
    const end = endOfMonth(mes);
    return extras.data.filter((x) => {
      if (!isWithinInterval(x.fecha, { start, end })) return false;
      if (empId && x.id !== empId) return false;
      return true;
    }).sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }, [extras.data, mes, empId]);

  const total = filtered.reduce((acc, x) => acc + x.monto, 0);
  const canWrite = can('extra.create');

  return (
    <div>
      <Header
        title="Extras"
        subtitle="Bonos, horas extra y otros conceptos a sumar al sueldo"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <MonthPicker value={mes} onChange={setMes} />
            <EmployeePicker
              empleados={empleados.data ?? []}
              value={empId}
              onChange={setEmpId}
              onlyActivos
            />
            {canWrite && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setCreating(true)}
                disabled={!isBackendConfigured()}
                title={!isBackendConfigured() ? 'Backend no configurado' : undefined}
              >
                + Nuevo extra
              </button>
            )}
          </div>
        }
      />

      <section className="card overflow-hidden">
        {extras.isLoading ? (
          <div className="p-4"><SkeletonRows rows={5} cols={5} /></div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-hueso/50 text-sm">
            Sin extras registrados en el período.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-hueso/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Fecha</th>
                <th className="text-left px-4 py-2">Empleado</th>
                <th className="text-left px-4 py-2">Concepto</th>
                <th className="text-right px-4 py-2">Monto</th>
                <th className="text-right px-4 py-2 w-32">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tostado/30">
              {filtered.map((x) => (
                <tr key={x.rowId} className="hover:bg-tostado/20">
                  <td className="px-4 py-2 text-hueso">{fmtDate(x.fecha)}</td>
                  <td className="px-4 py-2">
                    <div className="font-mono text-dorado text-xs">{x.id}</div>
                    <div className="text-hueso">{x.nombre}</div>
                  </td>
                  <td className="px-4 py-2 text-hueso/80 text-xs">{x.concepto || '—'}</td>
                  <td className="px-4 py-2 text-right font-display text-lg text-doradoBrillo">
                    {fmtMoney(x.monto)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {canWrite ? (
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          className="btn-ghost text-xs"
                          onClick={() => setEditing(x)}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="btn-ghost text-xs text-fuego"
                          onClick={() => setDeleting(x)}
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
                <td colSpan={3} className="px-4 py-3 text-right text-hueso/60 uppercase text-xs tracking-wider">
                  Total
                </td>
                <td className="px-4 py-3 text-right font-display text-2xl text-doradoBrillo">
                  {fmtMoney(total)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <Modal isOpen={creating} onClose={() => setCreating(false)} title="Registrar extra">
        <ExtraForm
          empleados={empleados.data ?? []}
          defaultEmpleadoId={empId || undefined}
          onDone={() => setCreating(false)}
        />
      </Modal>
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Editar extra">
        {editing && (
          <ExtraForm
            empleados={empleados.data ?? []}
            initial={editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        title="Eliminar extra"
        message={
          deleting
            ? `¿Eliminar el extra "${deleting.concepto}" de ${deleting.nombre} por ${fmtMoney(deleting.monto)}?`
            : ''
        }
        loading={del.isPending}
        onConfirm={async () => {
          if (!deleting?.rowId) return;
          try {
            await del.mutateAsync(deleting.rowId);
            setDeleting(null);
          } catch { /* noop */ }
        }}
      />
    </div>
  );
}
