import { useMemo, useState } from 'react';
import { Header } from '../components/Header';
import { ErrorView } from '../components/ErrorView';
import { MonthPicker } from '../components/ui/MonthPicker';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/Modal';
import { DescansoForm } from '../components/DescansoForm';
import { Calendar } from '../components/Calendar';
import {
  useDescansos,
  useEmpleados,
  useFaltas,
  useSendReminderDescansos,
} from '../lib/queries';
import { useAuth } from '../lib/useAuth';
import { isBackendConfigured } from '../lib/config';
import { fmtDate } from '../lib/format';
import type { Descanso } from '../lib/types';
import { isSameMonth } from 'date-fns';

export function Asistencia() {
  const empleados = useEmpleados();
  const descansos = useDescansos();
  const faltas = useFaltas();
  const { can } = useAuth();
  const [ref, setRef] = useState(() => new Date());
  const [editing, setEditing] = useState<Descanso | null>(null);
  const [creating, setCreating] = useState<{ empId?: string; fecha?: Date } | null>(null);

  const reminder = useSendReminderDescansos();

  if (empleados.error) return <ErrorView error={empleados.error} />;
  if (descansos.error) return <ErrorView error={descansos.error} />;

  const canEditDescansos = can('descanso.create');
  const canReminder = can('notify.reminder');

  const descansosDelMes = useMemo(
    () => (descansos.data ?? []).filter((d) => isSameMonth(d.fecha, ref)),
    [descansos.data, ref],
  );

  const faltasDelMes = useMemo(
    () => (faltas.data ?? []).filter((f) => isSameMonth(f.fecha, ref)),
    [faltas.data, ref],
  );

  async function onClickReminder() {
    if (reminder.isPending) return;
    try {
      await reminder.mutateAsync(undefined);
      alert('Recordatorio enviado ✓');
    } catch (e) {
      alert(`Error enviando recordatorio: ${(e as Error).message}`);
    }
  }

  return (
    <div>
      <Header
        title="Asistencia"
        subtitle="Calendario de descansos planificados · registrados desde la plataforma"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <MonthPicker value={ref} onChange={setRef} />
            {canEditDescansos && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setCreating({})}
                disabled={!isBackendConfigured()}
                title={!isBackendConfigured() ? 'Backend no configurado' : undefined}
              >
                + Descanso
              </button>
            )}
            {canReminder && (
              <button
                type="button"
                className="px-3 py-2 rounded-lg text-sm bg-tostado/40 border border-dorado/30 text-dorado hover:bg-tostado/60 disabled:opacity-50"
                onClick={onClickReminder}
                disabled={reminder.isPending || !isBackendConfigured()}
                title="Enviar WhatsApp a Dani recordando registrar descansos"
              >
                {reminder.isPending ? 'Enviando…' : '📣 Recordar a Dani'}
              </button>
            )}
          </div>
        }
      />

      <Calendar
        month={ref}
        empleados={empleados.data ?? []}
        descansos={descansos.data ?? []}
        canEdit={canEditDescansos}
        onDayClick={(empId, fecha) => setCreating({ empId, fecha })}
        onDescansoClick={(d) => setEditing(d)}
      />

      <section className="card mt-6 p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="font-display text-lg tracking-widest text-hueso mb-2">
              DESCANSOS DEL MES ({descansosDelMes.length})
            </div>
            {descansosDelMes.length === 0 ? (
              <div className="text-hueso/50 text-sm">Sin descansos registrados.</div>
            ) : (
              <ul className="divide-y divide-tostado/30 text-sm">
                {descansosDelMes.slice(0, 10).map((d) => (
                  <li key={d.rowId} className="py-2 flex items-center gap-2">
                    <span className="text-hueso/60 text-xs w-16">{fmtDate(d.fecha, 'EEE dd/MM')}</span>
                    <span className="text-hueso flex-1">{d.nombre}</span>
                    <Badge tone="warn">{d.tipo}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="font-display text-lg tracking-widest text-hueso mb-2">
              FALTAS DEL MES ({faltasDelMes.length})
            </div>
            {faltasDelMes.length === 0 ? (
              <div className="text-hueso/50 text-sm">Sin faltas registradas.</div>
            ) : (
              <ul className="divide-y divide-tostado/30 text-sm">
                {faltasDelMes.slice(0, 10).map((f) => (
                  <li key={f.rowId} className="py-2 flex items-center gap-2">
                    <span className="text-hueso/60 text-xs w-16">{fmtDate(f.fecha, 'EEE dd/MM')}</span>
                    <span className="text-hueso flex-1">{f.nombre}</span>
                    <Badge tone="bad">FALTA</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <Modal
        isOpen={!!creating}
        onClose={() => setCreating(null)}
        title="Registrar descanso"
      >
        {creating && (
          <DescansoForm
            empleados={empleados.data ?? []}
            defaultEmpleadoId={creating.empId}
            defaultFecha={creating.fecha}
            onDone={() => setCreating(null)}
          />
        )}
      </Modal>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Editar descanso">
        {editing && (
          <DescansoForm
            empleados={empleados.data ?? []}
            initial={editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}
