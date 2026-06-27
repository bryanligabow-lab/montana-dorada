import { useState } from 'react';
import { MEDAL_LEVELS } from '@asis/shared';
import { useAdmin } from '../ctx';
import { useRanking } from '../queries';
import { Card, MonthInput, Spinner, money, thisMonth } from '../ui';

export function Ranking() {
  const { current } = useAdmin();
  const [month, setMonth] = useState(thisMonth());
  const q = useRanking(current.id, { month });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-black tracking-wide">Ranking de puntualidad</h2>
        <MonthInput value={month} onChange={setMonth} />
      </div>

      <Card>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          {MEDAL_LEVELS.map((m) => (
            <div
              key={m.key}
              className="rounded-xl p-3 text-center"
              style={{ background: m.bg, border: `1px solid ${m.color}` }}
            >
              <div className="text-2xl">{m.emoji}</div>
              <div className="font-black text-sm" style={{ color: m.color }}>
                {m.nombre}
              </div>
              <div className="text-xs text-muted">
                {m.minDesde}+ min · {m.puntos} pts
              </div>
            </div>
          ))}
        </div>

        {q.isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-muted text-left text-xs uppercase tracking-wide">
                  <th className="p-2">#</th>
                  <th className="p-2">Empleado</th>
                  <th className="p-2 text-center">Días</th>
                  <th className="p-2 text-center">Temp.</th>
                  <th className="p-2 text-center">Tarde</th>
                  <th className="p-2 text-right">Pagó</th>
                  <th className="p-2 text-right">Ganó</th>
                  <th className="p-2 text-right">Puntos</th>
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((r, i) => (
                  <tr key={r.employeeId} className="border-t border-white/5">
                    <td className="p-2 text-muted">{i + 1}</td>
                    <td className="p-2">
                      <div className="font-bold">{r.nombre}</div>
                      <div className="text-xs text-muted">{r.codigo}</div>
                    </td>
                    <td className="p-2 text-center text-muted">{r.dias}</td>
                    <td className="p-2 text-center font-bold" style={{ color: 'var(--c-primary)' }}>
                      {r.tempranos}
                    </td>
                    <td className="p-2 text-center font-bold" style={{ color: 'var(--c-accent)' }}>
                      {r.tardanzas}
                    </td>
                    <td className="p-2 text-right">{money(r.multaPagada)}</td>
                    <td className="p-2 text-right">{money(r.multaGanada)}</td>
                    <td className="p-2 text-right font-black">{r.puntos}</td>
                  </tr>
                ))}
                {q.data?.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted">
                      Sin datos en el período.
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
