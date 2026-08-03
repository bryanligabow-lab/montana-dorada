import { useState } from 'react';
import { useAdmin } from '../ctx';
import { useAnomalies, useAudit } from '../queries';
import { Card, MonthInput, SectionTitle, Spinner, thisMonth } from '../ui';

export function Auditoria() {
  const { current } = useAdmin();
  const [month, setMonth] = useState(thisMonth());
  const anomalies = useAnomalies(current.id, { month });
  const audit = useAudit(current.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-black tracking-wide">Auditoría</h2>
        <MonthInput value={month} onChange={setMonth} />
      </div>

      <Card>
        <SectionTitle>Marcaciones fuera de rango GPS</SectionTitle>
        {anomalies.isLoading ? (
          <Spinner />
        ) : anomalies.data?.length === 0 ? (
          <div className="text-muted text-sm">Ninguna anomalía en el período. 👍</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-muted text-left text-xs uppercase tracking-wide">
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Empleado</th>
                  <th className="p-2">Entrada</th>
                  <th className="p-2 text-right">Distancia</th>
                </tr>
              </thead>
              <tbody>
                {(anomalies.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="p-2 text-muted">{r.fecha}</td>
                    <td className="p-2 font-bold">{r.empNombre}</td>
                    <td className="p-2">{r.horaEntrada ?? '–'}</td>
                    <td className="p-2 text-right" style={{ color: 'var(--c-accent)' }}>
                      {r.gpsDist != null ? `${r.gpsDist} m` : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Bitácora de cambios</SectionTitle>
        {audit.isLoading ? (
          <Spinner />
        ) : audit.data?.length === 0 ? (
          <div className="text-muted text-sm">Sin cambios registrados.</div>
        ) : (
          <ul className="divide-y divide-white/5 text-sm">
            {(audit.data ?? []).map((l) => (
              <li key={l.id} className="py-2 flex items-center gap-3">
                <span className="text-xs text-muted w-36 shrink-0">
                  {new Date(l.createdAt).toLocaleString('es-EC')}
                </span>
                <span className="font-bold">{l.actorNombre}</span>
                <span className="text-muted">
                  {l.accion} · {l.entidad}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
