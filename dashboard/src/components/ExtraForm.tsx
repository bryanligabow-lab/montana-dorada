import { useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import {
  useCreateExtra,
  useDeleteExtra,
  useUpdateExtra,
  type ExtraInput,
} from '../lib/queries';
import type { Empleado, Extra } from '../lib/types';
import { PersonPicker } from './PersonPicker';

export function ExtraForm({
  empleados,
  initial,
  defaultEmpleadoId,
  onDone,
}: {
  empleados: Empleado[];
  initial?: Extra;
  defaultEmpleadoId?: string;
  onDone: () => void;
}) {
  const isEdit = !!initial?.rowId;
  const activos = empleados.filter((e) => e.estado === 'ACTIVO');
  const initialId = initial?.id || defaultEmpleadoId || activos[0]?.id || '';
  const initialEmp = empleados.find((e) => e.id === initialId);
  const [person, setPerson] = useState({
    id: initialId,
    nombre: initial?.nombre || initialEmp?.nombre || '',
  });
  const [fecha, setFecha] = useState(() =>
    initial ? format(initial.fecha, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
  );
  const [concepto, setConcepto] = useState(initial?.concepto ?? '');
  const [monto, setMonto] = useState<string>(initial ? String(initial.monto) : '');

  const create = useCreateExtra();
  const update = useUpdateExtra();
  const del = useDeleteExtra();
  const mutation = isEdit ? update : create;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!person.id || !person.nombre) return;
    const input: ExtraInput = {
      id: person.id,
      nombre: person.nombre,
      fecha: new Date(fecha + 'T00:00:00'),
      concepto: concepto.trim(),
      monto: Number(monto) || 0,
    };
    try {
      if (isEdit && initial?.rowId) {
        await update.mutateAsync({ ...input, rowId: initial.rowId });
      } else {
        await create.mutateAsync(input);
      }
      onDone();
    } catch { /* noop */ }
  }

  async function onDelete() {
    if (!initial?.rowId) return;
    if (!confirm('¿Eliminar este extra/bono?')) return;
    try {
      await del.mutateAsync(initial.rowId);
      onDone();
    } catch { /* noop */ }
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
          Monto (USD)
          <input
            type="number"
            step="0.01"
            min="0"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
            className="mt-1 w-full px-3 py-2 rounded-lg bg-bg/70 border border-tostado/60 text-hueso outline-none focus:border-dorado/60"
          />
        </label>
      </div>
      <label className="text-hueso/80 text-sm">
        Concepto
        <input
          type="text"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          required
          placeholder="Bono, horas extra, propina, etc."
          className="mt-1 w-full px-3 py-2 rounded-lg bg-bg/70 border border-tostado/60 text-hueso outline-none focus:border-dorado/60"
        />
      </label>
      {(mutation.error || del.error) && (
        <div className="text-fuego text-sm">
          {String(((mutation.error || del.error) as Error).message)}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 pt-2">
        {isEdit ? (
          <button
            type="button"
            className="text-fuego text-sm hover:underline disabled:opacity-50"
            onClick={onDelete}
            disabled={del.isPending}
          >
            {del.isPending ? 'Eliminando…' : 'Eliminar'}
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={onDone}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? 'Guardando…' : isEdit ? 'Actualizar' : 'Registrar'}
          </button>
        </div>
      </div>
    </form>
  );
}
