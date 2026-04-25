import { useState } from 'react';
import { Header } from '../components/Header';
import { ErrorView } from '../components/ErrorView';
import { SkeletonRows } from '../components/ui/Skeleton';
import { Badge } from '../components/ui/Badge';
import { useEmpleados } from '../lib/queries';
import { fmtMoney } from '../lib/format';

export function Empleados() {
  const { data, isLoading, error } = useEmpleados();
  const [showPasivos, setShowPasivos] = useState(false);

  if (error) return <ErrorView error={error} />;

  const activos = data?.filter((e) => e.estado === 'ACTIVO') ?? [];
  const pasivos = data?.filter((e) => e.estado === 'PASIVO') ?? [];

  return (
    <div>
      <Header
        title="Empleados"
        subtitle={`${activos.length} activos · ${pasivos.length} pasivos`}
      />

      <section className="card overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-tostado/40">
          <div className="font-display text-lg tracking-widest text-dorado">ACTIVOS</div>
          <Badge tone="ok">{activos.length}</Badge>
        </div>
        {isLoading ? (
          <div className="p-4"><SkeletonRows rows={5} cols={5} /></div>
        ) : activos.length === 0 ? (
          <div className="p-6 text-hueso/50 text-sm">Sin empleados activos.</div>
        ) : (
          <table className="w-full text-sm">
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
          </table>
        )}
      </section>

      <section className="card overflow-hidden mt-6">
        <button
          type="button"
          onClick={() => setShowPasivos((v) => !v)}
          className="w-full px-4 py-3 flex items-center justify-between border-b border-tostado/40 hover:bg-tostado/10"
        >
          <div className="font-display text-lg tracking-widest text-humo">PASIVOS</div>
          <div className="flex items-center gap-2">
            <Badge>{pasivos.length}</Badge>
            <span className="text-hueso/40">{showPasivos ? '▲' : '▼'}</span>
          </div>
        </button>
        {showPasivos && (
          pasivos.length === 0 ? (
            <div className="p-6 text-hueso/50 text-sm">Sin pasivos.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-hueso/50 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-4 py-2">Código</th>
                  <th className="text-left px-4 py-2">Nombre</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tostado/30">
                {pasivos.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2 font-mono text-humo">{e.id}</td>
                    <td className="px-4 py-2 text-hueso/70">{e.nombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </section>
    </div>
  );
}
