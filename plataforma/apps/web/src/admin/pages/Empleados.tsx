import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import type { Employee, EmployeeCreateInput } from '@asis/shared';
import { useAdmin } from '../ctx';
import {
  useCreateEmployee,
  useDeactivateEmployee,
  useEmployees,
  useRegenerateQr,
  useUpdateEmployee,
} from '../queries';
import { Card, Spinner } from '../ui';

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.6)' }}
      onClick={onClose}
    >
      <div className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Empleados() {
  const { current } = useAdmin();
  const list = useEmployees(current.id);
  const deactivate = useDeactivateEmployee(current.id);
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const [qrFor, setQrFor] = useState<Employee | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black tracking-wide">Empleados</h2>
        <button className="btn-brand px-4 py-2" onClick={() => setEditing('new')}>
          + Nuevo
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
                  <th className="p-2">Código</th>
                  <th className="p-2">Nombre</th>
                  <th className="p-2 text-right">Sueldo</th>
                  <th className="p-2 text-center">Estado</th>
                  <th className="p-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(list.data ?? []).map((e) => (
                  <tr key={e.id} className="border-t border-white/5" style={{ opacity: e.estado === 'INACTIVO' ? 0.5 : 1 }}>
                    <td className="p-2 font-mono text-xs">{e.codigo}</td>
                    <td className="p-2 font-bold">{e.nombre}</td>
                    <td className="p-2 text-right">${e.sueldo.toFixed(2)}</td>
                    <td className="p-2 text-center">{e.estado}</td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <button className="chip px-2 py-1 text-xs mr-1" onClick={() => setQrFor(e)}>
                        QR
                      </button>
                      <button className="chip px-2 py-1 text-xs mr-1" onClick={() => setEditing(e)}>
                        Editar
                      </button>
                      {e.estado === 'ACTIVO' && (
                        <button
                          className="chip px-2 py-1 text-xs"
                          onClick={() => {
                            if (confirm(`¿Desactivar a ${e.nombre}?`)) deactivate.mutate(e.id);
                          }}
                        >
                          Baja
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {list.data?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted">
                      Aún no hay empleados. Crea el primero.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <EmployeeModal
          bizId={current.id}
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {qrFor && <QrModal emp={qrFor} onClose={() => setQrFor(null)} />}
    </div>
  );
}

function EmployeeModal({
  bizId,
  initial,
  onClose,
}: {
  bizId: string;
  initial: Employee | null;
  onClose: () => void;
}) {
  const create = useCreateEmployee(bizId);
  const update = useUpdateEmployee(bizId);
  const [f, setF] = useState({
    codigo: initial?.codigo ?? '',
    nombre: initial?.nombre ?? '',
    sueldo: String(initial?.sueldo ?? 0),
    sueldoFds: String(initial?.sueldoFds ?? 0),
    pin: initial?.pin ?? '',
  });
  const [err, setErr] = useState('');
  const input = 'field w-full px-3 py-2.5 text-sm';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const base = {
      codigo: f.codigo,
      nombre: f.nombre,
      sueldo: Number(f.sueldo),
      sueldoFds: Number(f.sueldoFds),
      pin: f.pin || undefined,
    };
    try {
      if (initial) await update.mutateAsync({ id: initial.id, data: base });
      else await create.mutateAsync(base as EmployeeCreateInput);
      onClose();
    } catch {
      setErr('No se pudo guardar (¿código repetido?).');
    }
  }

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="font-black text-lg">{initial ? 'Editar empleado' : 'Nuevo empleado'}</div>
        <div>
          <span className="block text-xs text-muted mb-1">Código (visible en la lista)</span>
          <input className={input} value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} required />
        </div>
        <div>
          <span className="block text-xs text-muted mb-1">Nombre</span>
          <input className={input} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="block text-xs text-muted mb-1">Sueldo</span>
            <input className={input} type="number" step="0.01" value={f.sueldo} onChange={(e) => setF({ ...f, sueldo: e.target.value })} />
          </div>
          <div>
            <span className="block text-xs text-muted mb-1">Sueldo fin de semana</span>
            <input className={input} type="number" step="0.01" value={f.sueldoFds} onChange={(e) => setF({ ...f, sueldoFds: e.target.value })} />
          </div>
        </div>
        {err && <div className="text-sm" style={{ color: 'var(--c-accent)' }}>{err}</div>}
        <div className="flex gap-2 pt-1">
          <button type="submit" className="btn-brand px-4 py-2 flex-1" disabled={create.isPending || update.isPending}>
            Guardar
          </button>
          <button type="button" className="chip px-4 py-2 flex-1" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Overlay>
  );
}

function QrModal({ emp, onClose }: { emp: Employee; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState('');
  const url = `${window.location.origin}/marcar/${emp.qrToken}`;
  const regen = useRegenerateQr(emp.businessId);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 280, margin: 1 }).then(setDataUrl).catch(() => setDataUrl(''));
  }, [url]);

  return (
    <Overlay onClose={onClose}>
      <div className="text-center">
        <div className="font-black text-lg">{emp.nombre}</div>
        <div className="text-xs text-muted mb-3">{emp.codigo}</div>
        {dataUrl && <img src={dataUrl} alt="QR" className="mx-auto rounded-xl bg-white p-2" width={240} height={240} />}
        <div className="text-xs text-muted break-all mt-3">{url}</div>
        <div className="flex gap-2 mt-4">
          <button className="btn-brand px-4 py-2 flex-1" onClick={() => window.print()}>
            Imprimir
          </button>
          <button
            className="chip px-4 py-2 flex-1"
            onClick={() => {
              if (confirm('Esto invalida el QR anterior. ¿Continuar?')) regen.mutate(emp.id, { onSuccess: onClose });
            }}
          >
            Regenerar
          </button>
        </div>
        <button className="text-xs text-muted mt-3" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Overlay>
  );
}
