import { useMemo, useState } from 'react';
import { endOfMonth, isWithinInterval, startOfMonth } from 'date-fns';
import { Header } from '../components/Header';
import { ErrorView } from '../components/ErrorView';
import { SkeletonRows } from '../components/ui/Skeleton';
import { MonthPicker } from '../components/ui/MonthPicker';
import { EmployeePicker } from '../components/ui/EmployeePicker';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FaltaForm } from '../components/FaltaForm';
import { DescansoForm } from '../components/DescansoForm';
import { Badge } from '../components/ui/Badge';
import {
  useAsistencia,
  useCreateDescanso,
  useDeleteDescanso,
  useDeleteFalta,
  useDescansos,
  useEmpleados,
  useExtras,
  useFaltas,
  usePagos,
  usePuntualidad,
} from '../lib/queries';
import { computeNominaMes } from '../lib/analytics';
import { descansoLabel, fmtDate, fmtMoney } from '../lib/format';
import { useAuth } from '../lib/useAuth';
import { isBackendConfigured } from '../lib/config';
import type { Descanso, Falta } from '../lib/types';

export function Faltas() {
  const empleados = useEmpleados();
  const faltas = useFaltas();
  const descansos = useDescansos();
  const pagos = usePagos();
  const extras = useExtras();
  const puntualidad = usePuntualidad();
  const asistencia = useAsistencia();
  const del = useDeleteFalta();
  const createDesc = useCreateDescanso();
  const deleteDesc = useDeleteDescanso();
  const { can } = useAuth();
  const [mes, setMes] = useState(() => new Date());
  const [empId, setEmpId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Falta | null>(null);
  const [deleting, setDeleting] = useState<Falta | null>(null);
  const [deletingDesc, setDeletingDesc] = useState<Descanso | null>(null);
  const [markingPresent, setMarkingPresent] = useState<{
    empId: string;
    nombre: string;
    fecha: Date;
  } | null>(null);
  const [convertingToDescanso, setConvertingToDescanso] = useState<{
    empId: string;
    nombre: string;
    fecha: Date;
  } | null>(null);
  const [convertingToFalta, setConvertingToFalta] = useState<{
    empId: string;
    nombre: string;
    fecha: Date;
  } | null>(null);

  if (faltas.error) return <ErrorView error={faltas.error} />;

  const empMap = useMemo(() => {
    const m = new Map<string, { sueldoDiario: number; nombre: string }>();
    for (const e of empleados.data ?? []) {
      m.set(e.id, { sueldoDiario: e.sueldoDiario, nombre: e.nombre });
    }
    return m;
  }, [empleados.data]);

  // Faltas manuales del periodo
  const manualesFiltradas = useMemo(() => {
    if (!faltas.data) return [];
    const start = startOfMonth(mes);
    const end = endOfMonth(mes);
    return faltas.data
      .filter((f) => {
        if (!isWithinInterval(f.fecha, { start, end })) return false;
        if (empId && f.id !== empId) return false;
        return true;
      })
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }, [faltas.data, mes, empId]);

  // Auto-faltas y auto-descansos derivados de la nómina
  const nomina = useMemo(() => {
    if (!empleados.data || !pagos.data) return [];
    return computeNominaMes(
      mes,
      empleados.data,
      pagos.data,
      descansos.data ?? [],
      faltas.data ?? [],
      extras.data ?? [],
      puntualidad.data ?? [],
      asistencia.data ?? [],
    );
  }, [empleados.data, pagos.data, descansos.data, faltas.data, extras.data, puntualidad.data, asistencia.data, mes]);

  interface AutoRow {
    empId: string;
    nombre: string;
    fecha: Date;
    tipo: 'auto-falta' | 'auto-descanso';
    descuento: number;
  }

  const autoRows: AutoRow[] = useMemo(() => {
    const out: AutoRow[] = [];
    for (const r of nomina) {
      if (empId && r.empleadoId !== empId) continue;
      for (const f of r.autoFaltasFechas) {
        out.push({
          empId: r.empleadoId,
          nombre: r.nombre,
          fecha: f,
          tipo: 'auto-falta',
          descuento: r.sueldoDiario,
        });
      }
      for (const d of r.autoDescansosFechas) {
        out.push({
          empId: r.empleadoId,
          nombre: r.nombre,
          fecha: d,
          tipo: 'auto-descanso',
          descuento: 0,
        });
      }
    }
    return out.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }, [nomina, empId]);

  const totalDescuento = manualesFiltradas.reduce(
    (acc, f) => acc + (f.descuento > 0 ? f.descuento : empMap.get(f.id)?.sueldoDiario ?? 0),
    0,
  ) + autoRows.filter((r) => r.tipo === 'auto-falta').reduce((a, r) => a + r.descuento, 0);

  const canWrite = can('falta.create');
  const canDescanso = can('descanso.create');
  // "Asistió sin registrar" + reversibilidad: solo admin (`*`).
  const isAdmin = can('admin');

  // Descansos del mes (todos los tipos), filtrados por empleado si aplica.
  // Esto sirve como vista de "marcados manualmente" con opción de eliminar
  // para revertir cualquier conversión hecha desde esta sección.
  const descansosMes = useMemo(() => {
    if (!descansos.data) return [];
    const start = startOfMonth(mes);
    const end = endOfMonth(mes);
    return descansos.data
      .filter((d) => {
        if (!isWithinInterval(d.fecha, { start, end })) return false;
        if (empId && d.id !== empId) return false;
        return true;
      })
      .sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }, [descansos.data, mes, empId]);

  return (
    <div>
      <Header
        title="Faltas"
        subtitle="Manuales + auto-detectadas (cuota: 4 días libres por mes)"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <MonthPicker value={mes} onChange={setMes} />
            <EmployeePicker
              empleados={empleados.data ?? []}
              value={empId}
              onChange={setEmpId}
              onlyActivos
            />
            {canWrite && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setCreating(true)}
                disabled={!isBackendConfigured()}
                title={!isBackendConfigured() ? 'Backend no configurado' : undefined}
              >
                + Nueva falta
              </button>
            )}
          </div>
        }
      />

      <section className="card overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-tostado/40 flex items-center justify-between">
          <div className="font-display text-lg tracking-widest text-hueso">
            AUTO-DETECTADAS ({autoRows.length})
          </div>
          <div className="text-hueso/40 text-xs">
            Días sin asistencia ni descanso planificado · primeros 4/mes son descanso, el resto son falta
          </div>
        </div>
        {autoRows.length === 0 ? (
          <div className="p-6 text-center text-hueso/50 text-sm">
            Sin días detectados como ausencia automática.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-hueso/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Fecha</th>
                <th className="text-left px-4 py-2">Empleado</th>
                <th className="text-left px-4 py-2">Detectado como</th>
                <th className="text-right px-4 py-2">Descuento</th>
                <th className="text-right px-4 py-2 w-64">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tostado/30">
              {autoRows.map((r, i) => (
                <tr key={`${r.empId}-${r.fecha.toISOString()}-${i}`} className="hover:bg-tostado/20">
                  <td className="px-4 py-2 text-hueso">{fmtDate(r.fecha)}</td>
                  <td className="px-4 py-2">
                    <div className="font-mono text-dorado text-xs">{r.empId}</div>
                    <div className="text-hueso">{r.nombre}</div>
                  </td>
                  <td className="px-4 py-2">
                    {r.tipo === 'auto-falta' ? (
                      <Badge tone="bad">FALTA AUTO</Badge>
                    ) : (
                      <Badge tone="warn">DESCANSO AUTO (cuota)</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.descuento > 0 ? (
                      <span className="font-display text-lg text-fuego">−{fmtMoney(r.descuento)}</span>
                    ) : (
                      <span className="text-hueso/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-1 flex-wrap justify-end">
                      {isAdmin && r.tipo === 'auto-falta' && (
                        <button
                          type="button"
                          className="text-[11px] px-2 py-1 rounded bg-emerald-700/30 text-emerald-300 hover:bg-emerald-700/50 disabled:opacity-50"
                          onClick={() =>
                            setMarkingPresent({ empId: r.empId, nombre: r.nombre, fecha: r.fecha })
                          }
                          disabled={!isBackendConfigured() || createDesc.isPending}
                          title="Asistió pero olvidó registrar (no descuenta, no consume cuota)"
                        >
                          ✓ Asistió sin registrar
                        </button>
                      )}
                      {canDescanso && r.tipo === 'auto-falta' && (
                        <button
                          type="button"
                          className="text-[11px] px-2 py-1 rounded bg-dorado/20 text-dorado hover:bg-dorado/30"
                          onClick={() => setConvertingToDescanso({ empId: r.empId, nombre: r.nombre, fecha: r.fecha })}
                          title="Marcar como descanso planificado"
                        >
                          ↻ Marcar descanso
                        </button>
                      )}
                      {canWrite && r.tipo === 'auto-descanso' && (
                        <button
                          type="button"
                          className="text-[11px] px-2 py-1 rounded bg-fuego/20 text-fuego hover:bg-fuego/30"
                          onClick={() => setConvertingToFalta({ empId: r.empId, nombre: r.nombre, fecha: r.fecha })}
                          title="Confirmar como falta real"
                        >
                          ✗ Marcar falta
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-tostado/40 flex items-center justify-between">
          <div className="font-display text-lg tracking-widest text-hueso">
            DESCANSOS DEL MES ({descansosMes.length})
          </div>
          <div className="text-hueso/40 text-xs">
            Reversibilidad · eliminá un descanso para que el día vuelva a contarse como auto-falta
          </div>
        </div>
        {descansos.isLoading ? (
          <div className="p-4"><SkeletonRows rows={3} cols={4} /></div>
        ) : descansosMes.length === 0 ? (
          <div className="p-6 text-center text-hueso/50 text-sm">
            Sin descansos registrados en el período.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-hueso/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Fecha</th>
                <th className="text-left px-4 py-2">Empleado</th>
                <th className="text-left px-4 py-2">Tipo</th>
                <th className="text-left px-4 py-2">Motivo</th>
                <th className="text-right px-4 py-2 w-32">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tostado/30">
              {descansosMes.map((d) => (
                <tr key={d.rowId} className="hover:bg-tostado/20">
                  <td className="px-4 py-2 text-hueso">{fmtDate(d.fecha)}</td>
                  <td className="px-4 py-2">
                    <div className="font-mono text-dorado text-xs">{d.id}</div>
                    <div className="text-hueso">{d.nombre}</div>
                  </td>
                  <td className="px-4 py-2 text-hueso/80 text-xs">
                    {descansoLabel[d.tipo]}
                    {d.tipo === 'ASISTIO_SIN_REGISTRO' && (
                      <span className="ml-2 text-emerald-400/80">(no descuenta · no consume cuota)</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-hueso/70 text-xs">{d.motivo || '—'}</td>
                  <td className="px-4 py-2 text-right">
                    {canDescanso ? (
                      <button
                        type="button"
                        className="btn-ghost text-xs text-fuego"
                        onClick={() => setDeletingDesc(d)}
                        title="Eliminar (revertir)"
                      >
                        🗑 Revertir
                      </button>
                    ) : (
                      <span className="text-hueso/30 text-xs">sin permiso</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-tostado/40 font-display text-lg tracking-widest text-hueso">
          MANUALES ({manualesFiltradas.length})
        </div>
        {faltas.isLoading ? (
          <div className="p-4"><SkeletonRows rows={3} cols={5} /></div>
        ) : manualesFiltradas.length === 0 ? (
          <div className="p-6 text-center text-hueso/50 text-sm">
            Sin faltas manuales registradas en el período.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-hueso/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2">Fecha</th>
                <th className="text-left px-4 py-2">Empleado</th>
                <th className="text-left px-4 py-2">Motivo</th>
                <th className="text-right px-4 py-2">Descuento</th>
                <th className="text-right px-4 py-2 w-32">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tostado/30">
              {manualesFiltradas.map((f) => {
                const desc = f.descuento > 0 ? f.descuento : empMap.get(f.id)?.sueldoDiario ?? 0;
                return (
                  <tr key={f.rowId} className="hover:bg-tostado/20">
                    <td className="px-4 py-2 text-hueso">{fmtDate(f.fecha)}</td>
                    <td className="px-4 py-2">
                      <div className="font-mono text-dorado text-xs">{f.id}</div>
                      <div className="text-hueso">{f.nombre}</div>
                    </td>
                    <td className="px-4 py-2 text-hueso/70 text-xs">{f.motivo || '—'}</td>
                    <td className="px-4 py-2 text-right font-display text-lg text-fuego">
                      {fmtMoney(desc)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {canWrite ? (
                        <div className="inline-flex gap-1">
                          <button type="button" className="btn-ghost text-xs" onClick={() => setEditing(f)}>✎</button>
                          <button type="button" className="btn-ghost text-xs text-fuego" onClick={() => setDeleting(f)}>🗑</button>
                        </div>
                      ) : (
                        <span className="text-hueso/30 text-xs">sin permiso</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-tostado/60 bg-tostado/10">
                <td colSpan={3} className="px-4 py-3 text-right text-hueso/60 uppercase text-xs tracking-wider">
                  Total descontado del mes (auto + manuales)
                </td>
                <td className="px-4 py-3 text-right font-display text-2xl text-fuego">
                  {fmtMoney(totalDescuento)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      <Modal isOpen={creating} onClose={() => setCreating(false)} title="Registrar falta">
        <FaltaForm
          empleados={empleados.data ?? []}
          defaultEmpleadoId={empId || undefined}
          onDone={() => setCreating(false)}
        />
      </Modal>
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Editar falta">
        {editing && <FaltaForm empleados={empleados.data ?? []} initial={editing} onDone={() => setEditing(null)} />}
      </Modal>
      <Modal
        isOpen={!!convertingToDescanso}
        onClose={() => setConvertingToDescanso(null)}
        title="Marcar como descanso planificado"
      >
        {convertingToDescanso && (
          <DescansoForm
            empleados={empleados.data ?? []}
            defaultEmpleadoId={convertingToDescanso.empId}
            defaultFecha={convertingToDescanso.fecha}
            onDone={() => setConvertingToDescanso(null)}
          />
        )}
      </Modal>
      <Modal
        isOpen={!!convertingToFalta}
        onClose={() => setConvertingToFalta(null)}
        title="Confirmar como falta real"
      >
        {convertingToFalta && (
          <FaltaForm
            empleados={empleados.data ?? []}
            defaultEmpleadoId={convertingToFalta.empId}
            defaultFecha={convertingToFalta.fecha}
            onDone={() => setConvertingToFalta(null)}
          />
        )}
      </Modal>
      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        title="Eliminar falta"
        message={
          deleting ? `¿Eliminar la falta de ${deleting.nombre} del ${fmtDate(deleting.fecha)}?` : ''
        }
        loading={del.isPending}
        onConfirm={async () => {
          if (!deleting?.rowId) return;
          try {
            await del.mutateAsync(deleting.rowId);
            setDeleting(null);
          } catch { /* noop */ }
        }}
      />
      <ConfirmDialog
        isOpen={!!markingPresent}
        onClose={() => setMarkingPresent(null)}
        title="Marcar asistió sin registrar"
        message={
          markingPresent
            ? `Confirmar que ${markingPresent.nombre} sí trabajó el ${fmtDate(markingPresent.fecha)} pero olvidó marcar entrada/salida. No se descontará y no consume cuota de descansos.`
            : ''
        }
        loading={createDesc.isPending}
        onConfirm={async () => {
          if (!markingPresent) return;
          try {
            await createDesc.mutateAsync({
              id: markingPresent.empId,
              nombre: markingPresent.nombre,
              fecha: markingPresent.fecha,
              tipo: 'ASISTIO_SIN_REGISTRO',
              motivo: 'Olvidó registrar asistencia',
            });
            setMarkingPresent(null);
          } catch { /* noop */ }
        }}
      />
      <ConfirmDialog
        isOpen={!!deletingDesc}
        onClose={() => setDeletingDesc(null)}
        title="Revertir descanso"
        message={
          deletingDesc
            ? `¿Eliminar el descanso (${descansoLabel[deletingDesc.tipo]}) de ${deletingDesc.nombre} del ${fmtDate(deletingDesc.fecha)}? El día volverá a evaluarse como auto-falta o auto-descanso.`
            : ''
        }
        loading={deleteDesc.isPending}
        onConfirm={async () => {
          if (!deletingDesc?.rowId) return;
          try {
            await deleteDesc.mutateAsync(deletingDesc.rowId);
            setDeletingDesc(null);
          } catch { /* noop */ }
        }}
      />
    </div>
  );
}
