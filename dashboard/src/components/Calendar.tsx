import { useMemo } from 'react';
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isToday,
  isWeekend,
  startOfMonth,
} from 'date-fns';
import { es } from 'date-fns/locale';
import type { Descanso, Empleado } from '../lib/types';
import { descansoColor, descansoLabel } from '../lib/format';

/**
 * Calendario mensual: filas = empleados activos, columnas = días del mes.
 * Click en celda vacía → onDayClick(empleadoId, fecha)
 * Click en chip de descanso → onDescansoClick(descanso)
 */
export function Calendar({
  month,
  empleados,
  descansos,
  onDayClick,
  onDescansoClick,
  canEdit = true,
}: {
  month: Date;
  empleados: Empleado[];
  descansos: Descanso[];
  onDayClick?: (empleadoId: string, date: Date) => void;
  onDescansoClick?: (d: Descanso) => void;
  canEdit?: boolean;
}) {
  const days = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    return eachDayOfInterval({ start, end });
  }, [month]);

  const activos = useMemo(
    () => empleados.filter((e) => e.estado === 'ACTIVO'),
    [empleados],
  );

  const descansoIndex = useMemo(() => {
    const map = new Map<string, Descanso>();
    for (const d of descansos) {
      const key = `${d.id}|${format(d.fecha, 'yyyy-MM-dd')}`;
      map.set(key, d);
    }
    return map;
  }, [descansos]);

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-hueso/50">
            <th className="sticky left-0 z-10 bg-bgDeep/95 px-3 py-2 text-left min-w-[160px]">
              Empleado
            </th>
            {days.map((d) => (
              <th
                key={d.toISOString()}
                className={`px-1 py-2 text-center min-w-[32px] ${
                  isWeekend(d) ? 'text-dorado/70' : ''
                } ${isToday(d) ? 'bg-tostado/40' : ''}`}
                title={format(d, 'EEEE d/MM/yyyy')}
              >
                <div className="text-[10px] uppercase">{format(d, 'EEEEE', { locale: es })}</div>
                <div className="font-semibold">{format(d, 'd')}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-tostado/30">
          {activos.map((e) => (
            <tr key={e.id} className="hover:bg-tostado/10">
              <td className="sticky left-0 z-10 bg-bgDeep/95 px-3 py-2">
                <div className="font-mono text-dorado text-[10px]">{e.id}</div>
                <div className="text-hueso text-xs">{e.nombre}</div>
              </td>
              {days.map((d) => {
                const key = `${e.id}|${format(d, 'yyyy-MM-dd')}`;
                const descanso = descansoIndex.get(key);
                const clickable = canEdit;

                let content: React.ReactNode;
                let classes =
                  'w-full h-7 rounded text-center flex items-center justify-center text-[10px] transition ';

                if (descanso) {
                  classes += descansoColor[descanso.tipo] + ' font-semibold cursor-pointer';
                  content = descansoLabel[descanso.tipo].slice(0, 3).toUpperCase();
                } else {
                  classes += 'text-hueso/30 cursor-pointer hover:bg-tostado/30';
                  content = '';
                }

                return (
                  <td key={d.toISOString()} className="px-0.5 py-1 align-middle">
                    <button
                      type="button"
                      className={classes}
                      disabled={!clickable}
                      title={
                        descanso
                          ? `${descansoLabel[descanso.tipo]}${descanso.motivo ? ' · ' + descanso.motivo : ''} · ${format(d, 'dd/MM/yyyy')}`
                          : format(d, 'EEEE d/MM')
                      }
                      onClick={() => {
                        if (descanso && onDescansoClick) onDescansoClick(descanso);
                        else if (onDayClick) onDayClick(e.id, d);
                      }}
                    >
                      {content}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
          {activos.length === 0 && (
            <tr>
              <td colSpan={days.length + 1} className="p-6 text-center text-hueso/50">
                Sin empleados activos.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="px-4 py-3 border-t border-tostado/40 flex flex-wrap items-center gap-3 text-[11px] text-hueso/60">
        <span>Leyenda:</span>
        {(['PLANIFICADO', 'VACACIONES', 'PERMISO', 'ENFERMEDAD'] as const).map((t) => (
          <span key={t} className={`px-2 py-0.5 rounded ${descansoColor[t]}`}>
            {descansoLabel[t]}
          </span>
        ))}
      </div>
    </div>
  );
}
