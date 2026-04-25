import { addWeeks, format, startOfISOWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { weekKey, weekRange } from '../../lib/analytics';

export function WeekPicker({
  value,
  onChange,
}: {
  value: Date;
  onChange: (d: Date) => void;
}) {
  const { start, end } = weekRange(value);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="btn-ghost"
        onClick={() => onChange(startOfISOWeek(addWeeks(value, -1)))}
        aria-label="Semana anterior"
      >
        ←
      </button>
      <div className="px-3 py-2 rounded-lg bg-tostado/40 text-hueso/90 text-sm min-w-[220px] text-center">
        <span className="text-dorado font-semibold">{weekKey(start)}</span>
        <span className="text-hueso/50">
          {' · '}
          {format(start, "d 'de' MMM", { locale: es })} – {format(end, "d 'de' MMM", { locale: es })}
        </span>
      </div>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => onChange(startOfISOWeek(addWeeks(value, 1)))}
        aria-label="Semana siguiente"
      >
        →
      </button>
      <button
        type="button"
        className="btn-ghost text-xs"
        onClick={() => onChange(new Date())}
      >
        Hoy
      </button>
    </div>
  );
}
