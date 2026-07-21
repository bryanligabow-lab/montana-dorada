import { useState, type ReactNode } from 'react';
import type { AdvanceCreateInput } from '@asis/shared';
import { useAdmin } from '../ctx';
import { useAdvances, useCreateAdvance, useDeleteAdvance, useEmployees, type AdvanceRow } from '../queries';
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
  const [creando, setCreando] = useState<'ANTICIPO' | 'MULTA' | null>(null);

  const rows = q.data ?? [];
  const anticipos = rows.filter((r) => r.tipo === 'ANTICIPO');
  const multas = rows.filter((r) => r.tipo === 'MULTA');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-black tracking-wide">Anticipos y multas</h2>
        <MonthInput value={month} onChange={setMonth} />
      </div>

      <p className="text-muted text-sm">
        Los anticipos y las multas se descuentan automáticamente del total a recibir en la Nómina del período en que cae su fecha.
      </p>

      {q.isLoading ? (
        <Spinner />
      ) : (
        <>
          <Seccion
            titulo="Anticipos"
            descripcion="Adelantos de sueldo entregados al empleado."
            rows={anticipos}
            bizId={current.id}
            onNuevo={() => setCreando('ANTICIPO')}
          />
          <Seccion
            titulo="Multas"
            descripcion="Sanciones manuales (además de las multas automáticas por tardanza)."
            rows={multas}
            bizId={current.id}
            onNuevo={() => setCreando('MULTA')}
          />
        </>
      )}

      {creando && <RegistrarDescuento bizId={current.id} tipo={creando} onClose={() => setCreando(null)} />}
    </div>
  );
}

function Seccion({
  titulo,
  descripcion,
  rows,
  bizId,
  onNuevo,
}: {
  titulo: string;
  descripcion: string;
  rows: AdvanceRow[];
  bizId: string;
  onNuevo: () => void;
}) {
  const del = useDeleteAdvance(bizId);
  const total = rows.reduce((s, r) => s + r.monto, 0);
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-black">{titulo}</h3>
          <p className="text-xs text-muted">{descripcion}</p>
        </div>
        <button className="btn-brand px-3 py-1.5 text-sm" onClick={onNuevo}>
          + Registrar {titulo === 'Multas' ? 'multa' : 'anticipo'}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
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
                      if (confirm(`¿Eliminar ${money(r.monto)} de ${r.empNombre}?`)) del.mutate(r.id);
                    }}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-muted text-sm">
                  Sin {titulo.toLowerCase()} en el período.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-white/10">
                <td colSpan={2} className="p-2 text-right font-bold text-muted">
                  Total {titulo.toLowerCase()}
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
    </Card>
  );
}

function RegistrarDescuento({
  bizId,
  tipo,
  onClose,
}: {
  bizId: string;
  tipo: 'ANTICIPO' | 'MULTA';
  onClose: () => void;
}) {
  const empleados = useEmployees(bizId);
  const create = useCreateAdvance(bizId);
  const activos = (empleados.data ?? []).filter((e) => e.estado === 'ACTIVO');
  const [f, setF] = useState({ employeeId: '', fecha: hoyISO(), monto: '', nota: '' });
  const [err, setErr] = useState('');
  const input = 'field w-full px-3 py-2.5 text-sm';
  const esMulta = tipo === 'MULTA';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    const monto = Number(f.monto);
    if (!f.employeeId) return setErr('Elige un empleado.');
    if (!(monto > 0)) return setErr('El monto debe ser mayor a 0.');
    try {
      await create.mutateAsync({
        employeeId: f.employeeId,
        tipo,
        fecha: f.fecha,
        monto,
        nota: f.nota || undefined,
      } as AdvanceCreateInput);
      onClose();
    } catch {
      setErr('No se pudo registrar.');
    }
  }

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="font-black text-lg">Registrar {esMulta ? 'multa' : 'anticipo'}</div>
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
          <input className={input} value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} maxLength={200} placeholder={esMulta ? 'p. ej. daño de producto' : 'p. ej. adelanto quincena'} />
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
