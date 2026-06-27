import { useState } from 'react';
import { useAdmin } from '../ctx';
import { useAttendance } from '../queries';
import { Card, MonthInput, Spinner, thisMonth } from '../ui';

function gpsCell(v: boolean | null) {
  if (v === true) return <span style={{ color: 'var(--c-primary)' }}>✓ ok</span>;
  if (v === false) return <span style={{ color: 'var(--c-accent)' }}>✗ fuera</span>;
  return <span className="text-muted">–</span>;
}

export function Asistencia() {
  const { current } = useAdmin();
  const [month, setMonth] = useState(thisMonth());
  const q = useAttendance(current.id, { month });

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
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-muted text-left text-xs uppercase tracking-wide">
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Empleado</th>
                  <th className="p-2">Entrada</th>
                  <th className="p-2">Salida</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2 text-center">Min tarde</th>
                  <th className="p-2">Horas</th>
                  <th className="p-2 text-center">GPS</th>
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
                  </tr>
                ))}
                {q.data?.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted">
                      Sin marcaciones en el período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
