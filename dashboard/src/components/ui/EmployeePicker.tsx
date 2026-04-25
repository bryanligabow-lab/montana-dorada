import type { Empleado } from '../../lib/types';

export function EmployeePicker({
  empleados,
  value,
  onChange,
  includeAll = true,
  onlyActivos = true,
}: {
  empleados: Empleado[];
  value: string; // id o '' para todos
  onChange: (id: string) => void;
  includeAll?: boolean;
  onlyActivos?: boolean;
}) {
  const list = onlyActivos ? empleados.filter((e) => e.estado === 'ACTIVO') : empleados;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 rounded-lg bg-tostado/40 text-hueso/90 text-sm border border-tostado/60 outline-none focus:border-dorado/60"
    >
      {includeAll && <option value="">Todos los empleados</option>}
      {list.map((e) => (
        <option key={e.id} value={e.id}>
          {e.nombre}
        </option>
      ))}
    </select>
  );
}
