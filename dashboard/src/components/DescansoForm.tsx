import { useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import {
  useCreateDescanso,
  useDeleteDescanso,
  useUpdateDescanso,
  type DescansoInput,
} from '../lib/queries';
import type { Descanso, DescansoTipo, Empleado } from '../lib/types';
import { descansoLabel } from '../lib/format';
import { PersonPicker } from './PersonPicker';

const TIPOS: DescansoTipo[] = ['PLANIFICADO', 'VACACIONES', 'PERMISO', 'ENFERMEDAD'];

export function DescansoForm({
  empleados,
  initial,
  defaultEmpleadoId,
  defaultFecha,
  onDone,
}: {
  empleados: Empleado[];
  initial?: Descanso;
  defaultEmpleadoId?: string;
  defaultFecha?: Date;
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
    initial
      ? format(initial.fecha, 'yyyy-MM-dd')
      : format(defaultFecha ?? new Date(), 'yyyy-MM-dd'),
  );
  const [tipo, setTipo] = useState<DescansoTipo>(initial?.tipo ?? 'PLANIFICADO');
  const [motivo, setMotivo] = useState(initial?.motivo ?? '');

  const create = useCreateDescanso();
  const update = useUpdateDescanso();
  const del = useDeleteDescanso();

  const mutation = isEdit ? update : create;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!person.id || !person.nombre) return;
    const input: DescansoInput = {
      id: person.id,
      nombre: person.nombre,
      fecha: new Date(fecha + 'T00:00:00'),
      tipo,
      motivo: motivo.trim() || undefined,
    };
    try {
      if (isEdit && initial?.rowId) {
        await update.mutateAsync({ ...input, rowId: initial.rowId });
      } else {
        await create.mutateAsync(input);
      }
      onDone();
    } catch {
      /* error se muestra abajo */
    }
  }

  async function onDelete() {
    if (!initial?.rowId) return;
    if (!confirm('¿Eliminar este descanso?')) return;
    try {
      await del.mutateAsync(initial.rowId);
      onDone();
    } catch {
      /* error se muestra abajo */
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
          Tipo
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as DescansoTipo)}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-bg/70 border border-tostado/60 text-hueso outline-none focus:border-dorado/60"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {descansoLabel[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="text-hueso/80 text-sm">
        Motivo (opcional)
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          className="mt-1 w-full px-3 py-2 rounded-lg bg-bg/70 border border-tostado/60 text-hueso outline-none focus:border-dorado/60 resize-y"
          placeholder="Opcional"
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
