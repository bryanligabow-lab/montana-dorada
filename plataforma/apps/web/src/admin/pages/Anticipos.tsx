import { useState, type ReactNode } from 'react';
import type { AdvanceCreateInput } from '@asis/shared';
import { useAdmin } from '../ctx';
import { useAdvances, useCreateAdvance, useDeleteAdvance, useEmployees } from '../queries';
import { Card, MonthInput, Spinner, money, thisMonth } from '../ui';

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,.6)' }}
      onClick={onClose}
    >
      <div className="card w-full max-w-sm p-5 my-8" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function Anticipos() {
  const { current } = useAdmin();
  const [month, setMonth] = useState(thisMonth());
  const q = useAdvances(current.id, { month });
  const del = useDeleteAdvance(current.id);
  const [creating, setCreating] = useState(false);

  const rows = q.data ?? [];
  const total = rows.reduce((s, r) => s + r.monto, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-black tracking-wide">Anticipos</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <MonthInput value={month} onChange={setMonth} />
          <button className="btn-brand px-4 py-2" onClick={() => setCreating(true)}>
            + Registrar anticipo
          </button>
        </div>
      </div>

      <p className="text-muted text-sm">
        Cada anticipo se descuenta automáticamente del total a recibir en la Nómina del período en que cae su fecha.
      </p>

      <Card>
        {q.isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-muted text-left text-xs uppercase tracking-wide">
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Empleado</th>
                  <th className="p-2 text-right">Monto</th>
                  <th className="p-2">Nota</th>
                  <th className="p-2 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="p-2 text-muted">{r.fecha}</td>
                    <td className="p-2">
                      <div className="font-bold">{r.empNombre}</div>
                      <div className="text-xs text-muted">{r.empCodigo}</div>
                    </td>
                    <td className="p-2 text-right font-bold" style={{ color: 'var(--c-accent)' }}>
                      -{money(r.monto)}
                    </td>
                    <td className="p-2 text-xs text-muted">{r.nota || '—'}</td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <button
                        className="chip px-3 py-1 text-xs"
                        onClick={() => {
                          if (confirm(`¿Eliminar el anticipo de ${money(r.monto)} a ${r.empNombre}?`)) del.mutate(r.id);
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted">
                      Sin anticipos en el período.
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-white/10">
                    <td colSpan={2} className="p-2 text-right font-bold text-muted">
                      Total anticipos del período
                    </td>
                    <td className="p-2 text-right font-black" style={{ color: 'var(--c-accent)' }}>
                      -{money(total)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>

      {creating && <RegistrarAnticipo bizId={current.id} onClose={() => setCreating(false)} />}
    </div>
  );
}

function RegistrarAnticipo({ bizId, onClose }: { bizId: string; onClose: () => void }) {
  const empleados = useEmployees(bizId);
  const create = useCreateAdvance(bizId);
  const activos = (empleados.data ?? []).filter((e) => e.estado === 'ACTIVO');
  const [f, setF] = useState({ employeeId: '', fecha: hoyISO(), monto: '', nota: '' });
  const [err, setErr] = useState('');
  const input = 'field w-full px-3 py-2.5 text-sm';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const monto = Number(f.monto);
    if (!f.employeeId) return setErr('Elige un empleado.');
    if (!(monto > 0)) return setErr('El monto debe ser mayor a 0.');
    try {
      await create.mutateAsync({
        employeeId: f.employeeId,
        fecha: f.fecha,
        monto,
        nota: f.nota || undefined,
      } as AdvanceCreateInput);
      onClose();
    } catch {
      setErr('No se pudo registrar el anticipo.');
    }
  }

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="font-black text-lg">Registrar anticipo</div>
        <div>
          <span className="block text-xs text-muted mb-1">Empleado</span>
          <select className={input} value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} required>
            <option value="">— Elige —</option>
            {activos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre} ({e.codigo})
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="block text-xs text-muted mb-1">Fecha</span>
            <input className={input} type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} required />
          </div>
          <div>
            <span className="block text-xs text-muted mb-1">Monto ($)</span>
            <input className={input} type="number" step="0.01" min="0" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} required />
          </div>
        </div>
        <div>
          <span className="block text-xs text-muted mb-1">Nota (opcional)</span>
          <input className={input} value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} maxLength={200} placeholder="p. ej. adelanto quincena" />
        </div>
        {err && <div className="text-sm" style={{ color: 'var(--c-accent)' }}>{err}</div>}
        <div className="flex gap-2 pt-1">
          <button type="submit" className="btn-brand px-4 py-2 flex-1" disabled={create.isPending}>
            {create.isPending ? 'Guardando…' : 'Registrar'}
          </button>
          <button type="button" className="chip px-4 py-2 flex-1" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Overlay>
  );
}
