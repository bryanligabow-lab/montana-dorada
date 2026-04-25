import { useState, useEffect, useMemo } from 'react';
import type { Empleado } from '../lib/types';

const CUSTOM_KEY = '__custom__';

export interface PersonValue {
  id: string;
  nombre: string;
}

/**
 * Selector de persona para los formularios. Permite elegir:
 * - Cualquier empleado ACTIVO o PASIVO
 * - Una persona manual (no listada en EMPLEADOS) escribiendo ID + nombre
 */
export function PersonPicker({
  empleados,
  value,
  onChange,
}: {
  empleados: Empleado[];
  value: PersonValue;
  onChange: (v: PersonValue) => void;
}) {
  const activos = useMemo(() => empleados.filter((e) => e.estado === 'ACTIVO'), [empleados]);
  const pasivos = useMemo(() => empleados.filter((e) => e.estado === 'PASIVO'), [empleados]);

  const matchedEmp = empleados.find((e) => e.id === value.id);
  const isCustom = !!value.id && !matchedEmp;

  // selección actual del <select>
  const selectValue = isCustom ? CUSTOM_KEY : value.id;

  const [customId, setCustomId] = useState(isCustom ? value.id : '');
  const [customNombre, setCustomNombre] = useState(isCustom ? value.nombre : '');

  // Si se cambian los inputs custom, propagar
  useEffect(() => {
    if (selectValue === CUSTOM_KEY) {
      onChange({ id: customId.trim(), nombre: customNombre.trim() });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customId, customNombre, selectValue]);

  function onSelectChange(v: string) {
    if (v === CUSTOM_KEY) {
      onChange({ id: customId.trim(), nombre: customNombre.trim() });
    } else {
      const emp = empleados.find((e) => e.id === v);
      if (emp) onChange({ id: emp.id, nombre: emp.nombre });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        value={selectValue}
        onChange={(e) => onSelectChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-bg/70 border border-tostado/60 text-hueso outline-none focus:border-dorado/60"
      >
        {activos.length > 0 && (
          <optgroup label="Activos">
            {activos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </optgroup>
        )}
        {pasivos.length > 0 && (
          <optgroup label="Pasivos">
            {pasivos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label="Otro">
          <option value={CUSTOM_KEY}>+ Persona no listada (manual)</option>
        </optgroup>
      </select>

      {selectValue === CUSTOM_KEY && (
        <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-bgDeep/60 border border-dorado/30">
          <label className="text-hueso/70 text-xs">
            Código / ID
            <input
              type="text"
              value={customId}
              onChange={(e) => setCustomId(e.target.value.toUpperCase())}
              placeholder="Ej: TMP001"
              required
              className="mt-1 w-full px-2 py-1.5 rounded bg-bg/70 border border-tostado/60 text-hueso text-sm outline-none focus:border-dorado/60 font-mono"
            />
          </label>
          <label className="text-hueso/70 text-xs">
            Nombre completo
            <input
              type="text"
              value={customNombre}
              onChange={(e) => setCustomNombre(e.target.value)}
              placeholder="Nombre y apellido"
              required
              className="mt-1 w-full px-2 py-1.5 rounded bg-bg/70 border border-tostado/60 text-hueso text-sm outline-none focus:border-dorado/60"
            />
          </label>
          <p className="text-hueso/40 text-[10px] col-span-2">
            Esta persona se guarda con el ID y nombre que escribas pero no se agrega a la hoja
            EMPLEADOS. Si querés que aparezca en otras secciones, agregala manualmente al Sheet.
          </p>
        </div>
      )}
    </div>
  );
}
