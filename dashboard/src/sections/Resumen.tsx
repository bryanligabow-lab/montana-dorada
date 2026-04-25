import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Header } from '../components/Header';
import { ErrorView } from '../components/ErrorView';
import { KpiCard } from '../components/ui/KpiCard';
import { Skeleton } from '../components/ui/Skeleton';
import { Modal } from '../components/Modal';
import { kpiSummary, pagosByDayLast30, quienTrabajaHoy } from '../lib/analytics';
import { Badge } from '../components/ui/Badge';
import {
  useAsistencia,
  useDescansos,
  useEmpleados,
  useExtras,
  useFaltas,
  usePagos,
  usePuntualidad,
  useSendInformeFinal,
} from '../lib/queries';
import { fmtMoney } from '../lib/format';
import { buildInforme } from '../lib/report';
import { useAuth } from '../lib/useAuth';
import { isBackendConfigured } from '../lib/config';

export function Resumen() {
  const empleados = useEmpleados();
  const pagos = usePagos();
  const descansos = useDescansos();
  const faltas = useFaltas();
  const extras = useExtras();
  const puntualidad = usePuntualidad();
  const asistencia = useAsistencia();
  const { can } = useAuth();
  const sendInforme = useSendInformeFinal();
  const [preview, setPreview] = useState<string | null>(null);

  const anyError = empleados.error || pagos.error;
  const anyLoading = empleados.isLoading || pagos.isLoading;

  const kpi = useMemo(() => {
    if (!empleados.data || !pagos.data) return null;
    return kpiSummary(
      empleados.data,
      pagos.data,
      descansos.data ?? [],
      faltas.data ?? [],
      extras.data ?? [],
      puntualidad.data ?? [],
      asistencia.data ?? [],
    );
  }, [empleados.data, pagos.data, descansos.data, faltas.data, extras.data, puntualidad.data, asistencia.data]);

  const trabajandoHoy = useMemo(() => {
    if (!empleados.data || !asistencia.data) return [];
    return quienTrabajaHoy(asistencia.data, empleados.data);
  }, [empleados.data, asistencia.data]);

  const chartData = useMemo(() => {
    if (!pagos.data) return [];
    return pagosByDayLast30(pagos.data);
  }, [pagos.data]);

  const canSendInforme = can('notify.informe');

  async function onSendInforme() {
    if (!empleados.data || !pagos.data) return;
    const payload = buildInforme(
      new Date(),
      empleados.data,
      pagos.data,
      descansos.data ?? [],
      faltas.data ?? [],
      extras.data ?? [],
      puntualidad.data ?? [],
      asistencia.data ?? [],
    );
    setPreview(payload.summary);
    try {
      await sendInforme.mutateAsync(payload);
    } catch (e) {
      alert(`Error enviando informe: ${(e as Error).message}`);
    }
  }

  if (anyError) return <ErrorView error={anyError} />;

  return (
    <div>
      <Header
        title="Resumen"
        subtitle="Vista general · personal activo del restaurante"
        actions={
          canSendInforme && (
            <button
              type="button"
              className="px-3 py-2 rounded-lg text-sm bg-grad-gold text-bgDeep font-semibold hover:brightness-110 disabled:opacity-50"
              onClick={onSendInforme}
              disabled={sendInforme.isPending || !isBackendConfigured() || anyLoading}
              title={
                !isBackendConfigured()
                  ? 'Backend no configurado'
                  : 'Enviar WhatsApp a Javier con el informe del mes'
              }
            >
              {sendInforme.isPending ? 'Enviando…' : '📬 Enviar informe a Javier'}
            </button>
          )
        }
      />

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {anyLoading || !kpi ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <KpiCard
              label="Trabajando hoy"
              value={kpi.trabajandoHoy}
              accent="dorado"
              hint={`${kpi.activosCount} activos en total`}
            />
            <KpiCard label="Empleados activos" value={kpi.activosCount} />
            <KpiCard
              label="Pagado este mes"
              value={fmtMoney(kpi.totalPagadoMes)}
              accent="dorado"
              hint={`Anticipos: ${fmtMoney(kpi.anticiposMes)}`}
            />
            <KpiCard
              label="Faltas del mes"
              value={kpi.faltasMes}
              accent="fuego"
              hint="Manuales + auto-detectadas"
            />
            <KpiCard
              label="Multas del mes"
              value={fmtMoney(kpi.multasMes)}
              accent="brasa"
              hint={`${kpi.minTardeMes} min tarde acumulados`}
            />
            <KpiCard
              label="Extras del mes"
              value={fmtMoney(kpi.extrasMes)}
              accent="llama"
              hint="Bonos + horas extra registradas"
            />
            <KpiCard
              label="Neto a pagar (mes)"
              value={fmtMoney(kpi.netoMes)}
              accent="dorado"
              hint="Base + extras − faltas − multas − pagos"
            />
          </>
        )}
      </section>

      <section className="card mt-6 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="font-display text-xl tracking-widest text-hueso">
            TRABAJANDO HOY ({trabajandoHoy.length})
          </div>
          <div className="text-hueso/40 text-xs">Marcaciones de Hoja 1</div>
        </div>
        {asistencia.isLoading ? (
          <Skeleton className="h-24" />
        ) : trabajandoHoy.length === 0 ? (
          <div className="text-hueso/50 text-sm py-4 text-center">
            Aún no hay marcaciones de entrada hoy.
          </div>
        ) : (
          <ul className="divide-y divide-tostado/30">
            {trabajandoHoy.map((t) => (
              <li
                key={t.empleadoId}
                className="py-2 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-dorado text-xs">{t.empleadoId}</span>
                  <span className="text-hueso">{t.nombre}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-hueso/60 font-mono">
                    Entrada {t.horaEntrada}
                  </span>
                  {t.horaSalida && (
                    <span className="text-hueso/60 font-mono">
                      → Salida {t.horaSalida}
                    </span>
                  )}
                  {t.enTurno ? (
                    <Badge tone="ok">EN TURNO</Badge>
                  ) : (
                    <Badge>cerró</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-6 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="font-display text-xl tracking-widest text-hueso">
            PAGOS · ÚLTIMOS 30 DÍAS
          </div>
          <div className="text-hueso/40 text-xs">Total por día ($)</div>
        </div>
        {pagos.isLoading ? (
          <Skeleton className="h-64" />
        ) : chartData.length === 0 ? (
          <div className="text-hueso/50 text-sm py-10 text-center">
            Sin pagos en los últimos 30 días.
          </div>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#3A2416" strokeDasharray="3 3" />
                <XAxis
                  dataKey="fecha"
                  tick={{ fill: '#6B6258', fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fill: '#6B6258', fontSize: 11 }} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,179,71,0.08)' }}
                  contentStyle={{
                    background: '#1A0F0A',
                    border: '1px solid #3A2416',
                    borderRadius: 8,
                    color: '#F5F1EA',
                  }}
                  formatter={(v: number) => [`$${v.toFixed(2)}`, 'Total']}
                />
                <Bar dataKey="total" fill="#F57C00" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <Modal
        isOpen={!!preview}
        onClose={() => setPreview(null)}
        title="Informe enviado"
        maxWidth="max-w-2xl"
      >
        <pre className="whitespace-pre-wrap text-xs text-hueso/80 bg-bg/70 border border-tostado/40 rounded p-3 max-h-[60vh] overflow-auto">
          {preview}
        </pre>
        <div className="flex justify-end">
          <button type="button" className="btn-primary" onClick={() => setPreview(null)}>
            OK
          </button>
        </div>
      </Modal>
    </div>
  );
}
