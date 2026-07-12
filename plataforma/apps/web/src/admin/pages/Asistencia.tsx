import { useState, type ReactNode } from 'react';
import { useAdmin } from '../ctx';
import { useAttendance, useDeleteAttendance, useUpdateAttendance, type AttendanceRow } from '../queries';
import { Card, MonthInput, Spinner, thisMonth } from '../ui';

function gpsCell(v: boolean | null) {
  if (v === true) return <span style={{ color: 'var(--c-primary)' }}>✓ ok</span>;
  if (v === false) return <span style={{ color: 'var(--c-accent)' }}>✗ fuera</span>;
  return <span className="text-muted">–</span>;
}

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

export function Asistencia() {
  const { current } = useAdmin();
  const [month, setMonth] = useState(thisMonth());
  const q = useAttendance(current.id, { month });
  const del = useDeleteAttendance(current.id);
  const [editing, setEditing] = useState<AttendanceRow | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-black tracking-wide">Asistencia</h2>
        <MonthInput value={month} onChange={setMonth} />
      </div>

      <Card>
        {q.isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="text-muted text-left text-xs uppercase tracking-wide">
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Empleado</th>
                  <th className="p-2">Entrada</th>
                  <th className="p-2">Almuerzo</th>
                  <th className="p-2">Salida</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2 text-center">Min tarde</th>
                  <th className="p-2">Horas</th>
                  <th className="p-2 text-center">GPS</th>
                  <th className="p-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="p-2 text-muted">{r.fecha}</td>
                    <td className="p-2">
                      <div className="font-bold">{r.empNombre}</div>
                      <div className="text-xs text-muted">{r.empCodigo}</div>
                    </td>
                    <td className="p-2">{r.horaEntrada ?? '–'}</td>
                    <td className="p-2 text-xs text-muted">
                      {r.horaAlmuerzoSalida
                        ? `${r.horaAlmuerzoSalida.slice(0, 5)}–${r.horaAlmuerzoRegreso?.slice(0, 5) ?? '…'}`
                        : '–'}
                    </td>
                    <td className="p-2">{r.horaSalida ?? '–'}</td>
                    <td
                      className="p-2 font-bold"
                      style={{
                        color:
                          r.estado === 'TARDE'
                            ? 'var(--c-accent)'
                            : r.estado === 'TEMPRANO'
                              ? 'var(--c-primary)'
                              : undefined,
                      }}
                    >
                      {r.estado ?? '–'}
                    </td>
                    <td className="p-2 text-center">{r.minTarde || ''}</td>
                    <td className="p-2">{r.horasTrabajadas ?? '–'}</td>
                    <td className="p-2 text-center">{gpsCell(r.gpsValido)}</td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <button className="chip px-2 py-1 text-xs mr-1" onClick={() => setEditing(r)}>
                        Editar
                      </button>
                      <button
                        className="chip px-2 py-1 text-xs"
                        onClick={() => {
                          if (confirm(`¿Eliminar la marcación de ${r.empNombre} del ${r.fecha}?`)) del.mutate(r.id);
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
                {q.data?.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-muted">
                      Sin marcaciones en el período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && <EditarAsistencia bizId={current.id} row={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function toInputTime(v: string | null): string {
  return v ? v.slice(0, 5) : '';
}
function toStoredTime(v: string): string | null {
  return v ? `${v}:00` : null;
}

function EditarAsistencia({ bizId, row, onClose }: { bizId: string; row: AttendanceRow; onClose: () => void }) {
  const update = useUpdateAttendance(bizId);
  const [f, setF] = useState({
    horaEntrada: toInputTime(row.horaEntrada),
    horaAlmuerzoSalida: toInputTime(row.horaAlmuerzoSalida),
    horaAlmuerzoRegreso: toInputTime(row.horaAlmuerzoRegreso),
    horaSalida: toInputTime(row.horaSalida),
  });
  const [err, setErr] = useState('');
  const input = 'field w-full px-3 py-2.5 text-sm';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await update.mutateAsync({
        id: row.id,
        data: {
          horaEntrada: toStoredTime(f.horaEntrada)!,
          horaAlmuerzoSalida: toStoredTime(f.horaAlmuerzoSalida),
          horaAlmuerzoRegreso: toStoredTime(f.horaAlmuerzoRegreso),
          horaSalida: toStoredTime(f.horaSalida),
        },
      });
      onClose();
    } catch {
      setErr('No se pudo guardar.');
    }
  }

  return (
    <Overlay onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="font-black text-lg">Editar marcación</div>
        <div className="text-xs text-muted">
          {row.empNombre} · {row.fecha}
        </div>
        <div>
          <span className="block text-xs text-muted mb-1">Entrada</span>
          <input
            className={input}
            type="time"
            value={f.horaEntrada}
            onChange={(e) => setF({ ...f, horaEntrada: e.target.value })}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="block text-xs text-muted mb-1">Salida a almuerzo</span>
            <input
              className={input}
              type="time"
              value={f.horaAlmuerzoSalida}
              onChange={(e) => setF({ ...f, horaAlmuerzoSalida: e.target.value })}
            />
          </div>
          <div>
            <span className="block text-xs text-muted mb-1">Regreso de almuerzo</span>
            <input
              className={input}
              type="time"
              value={f.horaAlmuerzoRegreso}
              onChange={(e) => setF({ ...f, horaAlmuerzoRegreso: e.target.value })}
            />
          </div>
        </div>
        <div>
          <span className="block text-xs text-muted mb-1">Salida</span>
          <input
            className={input}
            type="time"
            value={f.horaSalida}
            onChange={(e) => setF({ ...f, horaSalida: e.target.value })}
          />
        </div>
        {row.estado === 'TARDE' && (
          <p className="text-xs text-muted">
            Si cambias la entrada, la puntualidad (multa/medalla) del día se recalcula automáticamente.
          </p>
        )}
        {err && (
          <div className="text-sm" style={{ color: 'var(--c-accent)' }}>
            {err}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button type="submit" className="btn-brand px-4 py-2 flex-1" disabled={update.isPending}>
            {update.isPending ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className="chip px-4 py-2 flex-1" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Overlay>
  );
}
