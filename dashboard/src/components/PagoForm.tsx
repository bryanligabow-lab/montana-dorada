import { useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { useCreatePago, useUpdatePago, type PagoInput } from '../lib/queries';
import type { Empleado, Pago } from '../lib/types';
import { PersonPicker } from './PersonPicker';

const TIPOS_PAGO = ['ANTICIPO', 'ABONO', 'SEMANAL', 'BONO', 'OTRO'];

export function PagoForm({
  empleados,
  initial,
  defaultEmpleadoId,
  defaultPeriodoNomina,
  defaultTipoPago,
  defaultMonto,
  onDone,
}: {
  empleados: Empleado[];
  initial?: Pago;
  defaultEmpleadoId?: string;
  defaultPeriodoNomina?: string;
  defaultTipoPago?: string;
  defaultMonto?: string;
  onDone: () => void;
}) {
  const isEdit = !!initial?.rowId;

  const initialId = initial?.id || defaultEmpleadoId || empleados[0]?.id || '';
  const initialEmp = empleados.find((e) => e.id === initialId);
  const [person, setPerson] = useState({
    id: initialId,
    nombre: initial?.nombre || initialEmp?.nombre || '',
  });
  const [fecha, setFecha] = useState(() =>
    initial ? format(initial.fecha, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
  );
  const [hora, setHora] = useState(() =>
    initial?.hora || format(new Date(), 'HH:mm:ss'),
  );
  const [tipoPago, setTipoPago] = useState(
    () => initial?.tipoPago || defaultTipoPago || 'ANTICIPO',
  );
  const [monto, setMonto] = useState<string>(() =>
    initial ? String(initial.monto) : defaultMonto ?? '',
  );
  // Período de nómina al que se imputa el pago. Por defecto, el mes de la fecha.
  const [periodoNomina, setPeriodoNomina] = useState(() => {
    if (initial?.periodoNomina) return initial.periodoNomina;
    if (defaultPeriodoNomina) return defaultPeriodoNomina;
    const f = initial?.fecha ?? new Date();
    return format(f, 'yyyy-MM');
  });

  const create = useCreatePago();
  const update = useUpdatePago();
  const mutation = isEdit ? update : create;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!person.id || !person.nombre) return;
    const input: PagoInput = {
      id: person.id,
      nombre: person.nombre,
      fecha: new Date(fecha + 'T00:00:00'),
      hora,
      tipoPago,
      monto: Number(monto) || 0,
      periodoNomina,
    };
    try {
      if (isEdit && initial?.rowId) {
        await update.mutateAsync({ ...input, rowId: initial.rowId });
      } else {
        await create.mutateAsync(input);
      }
      onDone();
    } catch {
      // el error se muestra abajo via mutation.error
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="text-hueso/80 text-sm">
        <div className="mb-1">Empleado</div>
        <PersonPicker empleados={empleados} value={person} onChange={setPerson} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-hueso/80 text-sm">
          Fecha
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
            className="mt-1 w-full px-3 py-2 rounded-lg bg-bg/70 border border-tostado/60 text-hueso outline-none focus:border-dorado/60"
          />
        </label>
        <label className="text-hueso/80 text-sm">
          Hora
          <input
            type="time"
            step="1"
            value={hora.slice(0, 8)}
            onChange={(e) => setHora(e.target.value)}
            required
            className="mt-1 w-full px-3 py-2 rounded-lg bg-bg/70 border border-tostado/60 text-hueso outline-none focus:border-dorado/60"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-hueso/80 text-sm">
          Tipo de pago
          <select
            value={tipoPago}
            onChange={(e) => setTipoPago(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-bg/70 border border-tostado/60 text-hueso outline-none focus:border-dorado/60"
          >
            {TIPOS_PAGO.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="text-hueso/80 text-sm">
          Período de nómina
          <input
            type="month"
            value={periodoNomina}
            onChange={(e) => setPeriodoNomina(e.target.value)}
            required
            className="mt-1 w-full px-3 py-2 rounded-lg bg-bg/70 border border-tostado/60 text-hueso outline-none focus:border-dorado/60"
            title="Mes al que se imputa este pago en la nómina"
          />
        </label>
      </div>
      <label className="text-hueso/80 text-sm">
        Monto (USD)
        <input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          required
          className="mt-1 w-full px-3 py-2 rounded-lg bg-bg/70 border border-tostado/60 text-hueso outline-none focus:border-dorado/60"
        />
      </label>

      {mutation.error && (
        <div className="text-fuego text-sm">{String((mutation.error as Error).message)}</div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Guardando…' : isEdit ? 'Actualizar' : 'Registrar'}
        </button>
      </div>
    </form>
  );
}
