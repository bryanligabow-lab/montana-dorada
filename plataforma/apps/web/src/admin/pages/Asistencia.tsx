import { useState, type ReactNode } from 'react';
import { useAdmin } from '../ctx';
import {
  useAprobarSalida,
  useAttendance,
  useDeleteAttendance,
  useSalidasPendientes,
  useUpdateAttendance,
  type AttendanceRow,
} from '../queries';
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

      <SalidasPorAprobar bizId={current.id} />

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
                    <td className="p-2">
                      {r.horaSalida ?? '–'}
                      {r.salidaManual && <SalidaBadge estado={r.salidaAprob} />}
                    </td>
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

/** Etiqueta del estado de una salida registrada manualmente por el empleado. */
function SalidaBadge({ estado }: { estado: AttendanceRow['salidaAprob'] }) {
  const map = {
    PENDIENTE: { txt: 'por aprobar', bg: 'rgba(245,158,11,.18)', fg: '#F59E0B' },
    APROBADA: { txt: 'manual ✓', bg: 'rgba(67,160,71,.18)', fg: 'var(--c-primary)' },
    RECHAZADA: { txt: 'rechazada', bg: 'rgba(229,57,53,.15)', fg: 'var(--c-accent)' },
  } as const;
  const s = map[estado ?? 'PENDIENTE'] ?? map.PENDIENTE;
  return (
    <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold align-middle" style={{ background: s.bg, color: s.fg }}>
      {s.txt}
    </span>
  );
}

/** Bandeja de salidas que los empleados registraron manualmente (olvidos) y esperan aprobación. */
function SalidasPorAprobar({ bizId }: { bizId: string }) {
  const q = useSalidasPendientes(bizId);
  const rows = q.data ?? [];
  if (!rows.length) return null;

  return (
    <div
      className="card p-4 space-y-3"
      style={{ border: '1px solid rgba(245,158,11,.35)', background: 'rgba(245,158,11,.06)' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">⚠️</span>
        <h3 className="font-black">Salidas por aprobar ({rows.length})</h3>
      </div>
      <p className="text-xs text-muted -mt-1">
        Un empleado olvidó marcar su salida y la registró después. Verifica que la hora sea correcta; si no,
        corrígela antes de aprobar. Una salida rechazada no cuenta horas extra.
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <SalidaPendienteRow key={r.id} bizId={bizId} row={r} />
        ))}
      </div>
    </div>
  );
}

function SalidaPendienteRow({ bizId, row }: { bizId: string; row: AttendanceRow }) {
  const aprobar = useAprobarSalida(bizId);
  const [hora, setHora] = useState(toInputTime(row.horaSalida));
  const [err, setErr] = useState('');

  async function decidir(ok: boolean) {
    setErr('');
    try {
      await aprobar.mutateAsync({
        id: row.id,
        // Al aprobar se manda la hora (por si el admin la corrigió). Al rechazar no hace falta.
        data: ok ? { aprobar: true, horaSalida: toStoredTime(hora) ?? undefined } : { aprobar: false },
      });
    } catch {
      setErr('No se pudo guardar.');
    }
  }

  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="font-bold text-sm">{row.empNombre}</div>
          <div className="text-xs text-muted">
            {row.empCodigo} · {row.fecha} · entró {toInputTime(row.horaEntrada) || '—'}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-muted">Salida</label>
          <input
            className="field px-2 py-1.5 text-sm"
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
          />
          <button
            className="btn-brand px-3 py-1.5 text-xs"
            disabled={aprobar.isPending || !hora}
            onClick={() => decidir(true)}
          >
            {aprobar.isPending ? '…' : 'Aprobar'}
          </button>
          <button
            className="chip px-3 py-1.5 text-xs"
            disabled={aprobar.isPending}
            onClick={() => {
              if (confirm(`¿Rechazar la salida de ${row.empNombre} del ${row.fecha}? No contará horas extra.`)) decidir(false);
            }}
          >
            Rechazar
          </button>
        </div>
      </div>
      {err && <div className="text-xs mt-1" style={{ color: 'var(--c-accent)' }}>{err}</div>}
    </div>
  );
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
