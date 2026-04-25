import { addMonths, format } from 'date-fns';
import { es } from 'date-fns/locale';

export function MonthPicker({
  value,
  onChange,
}: {
  value: Date;
  onChange: (d: Date) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="btn-ghost"
        onClick={() => onChange(addMonths(value, -1))}
        aria-label="Mes anterior"
      >
        ←
      </button>
      <div className="px-3 py-2 rounded-lg bg-tostado/40 text-hueso/90 text-sm min-w-[160px] text-center">
        <span className="font-semibold text-dorado">
          {format(value, 'MMMM yyyy', { locale: es })}
        </span>
      </div>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => onChange(addMonths(value, 1))}
        aria-label="Mes siguiente"
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
