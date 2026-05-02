import { useMemo } from 'react';
import { Header } from '../components/Header';
import { ErrorView } from '../components/ErrorView';
import { SkeletonRows } from '../components/ui/Skeleton';
import { useEmpleados } from '../lib/queries';
import { fmtMoney } from '../lib/format';

export function Sueldos() {
  const empleados = useEmpleados();

  if (empleados.error) return <ErrorView error={empleados.error} />;

  const activos = useMemo(
    () => (empleados.data ?? []).filter((e) => e.estado === 'ACTIVO'),
    [empleados.data],
  );

  const totalMensual = activos.reduce((a, e) => a + e.sueldoMensual, 0);
  const totalDiario = activos.reduce((a, e) => a + e.sueldoDiario, 0);
  const conMensual = activos.filter((e) => e.sueldoMensual > 0).length;

  return (
    <div>
      <Header
        title="Sueldos"
        subtitle="Tarifas actuales por empleado activo (fuente: EMPLEADOS del Sheet)"
      />

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-hueso/60 text-xs uppercase tracking-widest font-semibold mb-1">
            Empleados activos
          </div>
          <div className="font-display text-3xl text-dorado">{activos.length}</div>
          <div className="text-hueso/40 text-xs mt-1">
            {conMensual} con sueldo mensual configurado
          </div>
        </div>
        <div className="card p-4">
          <div className="text-hueso/60 text-xs uppercase tracking-widest font-semibold mb-1">
            Sueldo diario total
          </div>
          <div className="font-display text-3xl text-llama">{fmtMoney(totalDiario)}</div>
          <div className="text-hueso/40 text-xs mt-1">Suma de sueldos diarios</div>
        </div>
        <div className="card p-4">
          <div className="text-hueso/60 text-xs uppercase tracking-widest font-semibold mb-1">
            Sueldo mensual total
          </div>
          <div className="font-display text-3xl text-doradoBrillo">{fmtMoney(totalMensual)}</div>
          <div className="text-hueso/40 text-xs mt-1">Base mensual de toda la nómina</div>
        </div>
      </section>

      <section className="card overflow-hidden">
        {empleados.isLoading ? (
          <div className="p-4">
            <SkeletonRows rows={5} cols={4} />
          </div>
        ) : activos.length === 0 ? (
          <div className="p-6 text-hueso/50 text-sm">Sin empleados activos.</div>
        ) : (
          <div className="table-wrap"><table className="w-full text-sm">
            <thead className="text-hueso/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Código</th>
                <th className="text-left px-4 py-2">Nombre</th>
                <th className="text-right px-4 py-2">Sueldo diario</th>
                <th className="text-right px-4 py-2">Sueldo del mes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tostado/30">
              {activos.map((e) => (
                <tr key={e.id} className="hover:bg-tostado/20">
                  <td className="px-4 py-2 font-mono text-dorado">{e.id}</td>
                  <td className="px-4 py-2 text-hueso">{e.nombre}</td>
                  <td className="px-4 py-2 text-right">{fmtMoney(e.sueldoDiario)}</td>
                  <td className="px-4 py-2 text-right text-doradoBrillo font-semibold">
                    {e.sueldoMensual > 0 ? fmtMoney(e.sueldoMensual) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>

      <p className="text-hueso/40 text-xs mt-4">
        Para modificar un sueldo, editalo directamente en la hoja{' '}
        <code className="text-dorado">EMPLEADOS</code> del Google Sheet. Los cambios se reflejan al
        refrescar.
      </p>
    </div>
  );
}
