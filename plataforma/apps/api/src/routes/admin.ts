import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { attendanceUpdateSchema, nominaQuerySchema, salidaAprobarSchema } from '@asis/shared';
import type { PunctualitySummary } from '@asis/shared';
import { getDb } from '../db';
import { attendance, auditLog, employees, punctuality } from '../db/schema';
import { toAttendance, toAuditLog } from '../lib/dto';
import { canAccess, parseDateRange } from '../lib/http';
import { writeAudit } from '../lib/audit';
import { calcularNominaNegocio } from '../services/nomina';
import { aprobarSalida, deleteAttendanceRecord, findAttendance, updateAttendanceRecord } from '../services/attendance';
import { sendWhatsApp } from '../reports/whatsapp';
import { fechaDisplay } from '../core/time';

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Asistencia (entradas/salidas) con nombre del empleado.
  app.get(
    '/api/admin/businesses/:id/attendance',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!(await canAccess(req, id))) return reply.code(403).send({ error: 'sin_acceso' });
      const { from, to } = parseDateRange(req.query as Record<string, unknown>);
      const db = await getDb();
      const rows = await db
        .select({ a: attendance, empNombre: employees.nombre, empCodigo: employees.codigo })
        .from(attendance)
        .innerJoin(employees, eq(employees.id, attendance.employeeId))
        .where(and(eq(attendance.businessId, id), gte(attendance.fecha, from), lte(attendance.fecha, to)))
        .orderBy(desc(attendance.fecha));
      return rows.map((r) => ({ ...toAttendance(r.a), empNombre: r.empNombre, empCodigo: r.empCodigo }));
    },
  );

  // Editar un registro de asistencia (corrige horas cargadas mal o dejadas incompletas).
  app.patch('/api/admin/attendance/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = await getDb();
    const row = await findAttendance(db, id);
    if (!row) return reply.code(404).send({ error: 'no_encontrado' });
    if (!(await canAccess(req, row.businessId))) return reply.code(403).send({ error: 'sin_acceso' });

    const parsed = attendanceUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });

    const updated = await updateAttendanceRecord(db, row, parsed.data);
    const emp = (await db.select().from(employees).where(eq(employees.id, row.employeeId)).limit(1))[0];
    await writeAudit(db, {
      businessId: row.businessId,
      userId: req.user.sub,
      actorNombre: req.user.nombre,
      accion: 'update',
      entidad: 'attendance',
      entidadId: id,
      detalle: { fecha: row.fecha, empleado: emp?.nombre, cambios: parsed.data },
    });
    return toAttendance(updated);
  });

  // Elimina un registro de asistencia (y su fila de puntualidad asociada, ver services/attendance.ts).
  app.delete('/api/admin/attendance/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = await getDb();
    const row = await findAttendance(db, id);
    if (!row) return reply.code(404).send({ error: 'no_encontrado' });
    if (!(await canAccess(req, row.businessId))) return reply.code(403).send({ error: 'sin_acceso' });
    const emp = (await db.select().from(employees).where(eq(employees.id, row.employeeId)).limit(1))[0];

    await deleteAttendanceRecord(db, row);
    await writeAudit(db, {
      businessId: row.businessId,
      userId: req.user.sub,
      actorNombre: req.user.nombre,
      accion: 'delete',
      entidad: 'attendance',
      entidadId: id,
      detalle: { fecha: row.fecha, empleado: emp?.nombre ?? row.employeeId, horaEntrada: row.horaEntrada },
    });
    return { ok: true };
  });

  // Salidas registradas manualmente por los empleados (olvidos) que esperan aprobación.
  app.get(
    '/api/admin/businesses/:id/salidas-pendientes',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!(await canAccess(req, id))) return reply.code(403).send({ error: 'sin_acceso' });
      const db = await getDb();
      const rows = await db
        .select({ a: attendance, empNombre: employees.nombre, empCodigo: employees.codigo })
        .from(attendance)
        .innerJoin(employees, eq(employees.id, attendance.employeeId))
        .where(
          and(
            eq(attendance.businessId, id),
            eq(attendance.salidaManual, true),
            eq(attendance.salidaAprob, 'PENDIENTE'),
          ),
        )
        .orderBy(desc(attendance.fecha));
      return rows.map((r) => ({ ...toAttendance(r.a), empNombre: r.empNombre, empCodigo: r.empCodigo }));
    },
  );

  // Aprobar (opcionalmente corrigiendo la hora) o rechazar una salida manual.
  app.post('/api/admin/attendance/:id/aprobar-salida', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = await getDb();
    const row = await findAttendance(db, id);
    if (!row) return reply.code(404).send({ error: 'no_encontrado' });
    if (!(await canAccess(req, row.businessId))) return reply.code(403).send({ error: 'sin_acceso' });
    const parsed = salidaAprobarSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });

    const updated = await aprobarSalida(db, row, parsed.data.aprobar, parsed.data.horaSalida);
    const emp = (await db.select().from(employees).where(eq(employees.id, row.employeeId)).limit(1))[0];
    await writeAudit(db, {
      businessId: row.businessId,
      userId: req.user.sub,
      actorNombre: req.user.nombre,
      accion: parsed.data.aprobar ? 'aprobar_salida' : 'rechazar_salida',
      entidad: 'attendance',
      entidadId: id,
      detalle: { fecha: row.fecha, empleado: emp?.nombre, horaSalida: updated.horaSalida },
    });

    // Avisa al empleado la decisión (si tiene teléfono).
    if (emp?.telefono) {
      const texto = parsed.data.aprobar
        ? `✅ Tu salida del ${fechaDisplay(row.fecha)} (${updated.horaSalida?.slice(0, 5) ?? ''}) fue APROBADA.`
        : `❌ Tu salida del ${fechaDisplay(row.fecha)} fue RECHAZADA. Consulta con administración.`;
      void sendWhatsApp(texto, emp.telefono.trim()).catch(() => {});
    }
    return toAttendance(updated);
  });

  // Ranking de puntualidad (medallas y multas) agregado por empleado.
  app.get(
    '/api/admin/businesses/:id/ranking',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!(await canAccess(req, id))) return reply.code(403).send({ error: 'sin_acceso' });
      const { from, to } = parseDateRange(req.query as Record<string, unknown>);
      const db = await getDb();
      const emps = await db.select().from(employees).where(eq(employees.businessId, id));
      const punts = await db
        .select()
        .from(punctuality)
        .where(and(eq(punctuality.businessId, id), gte(punctuality.fecha, from), lte(punctuality.fecha, to)));

      const byId = new Map<string, PunctualitySummary>();
      for (const e of emps) {
        byId.set(e.id, {
          employeeId: e.id,
          codigo: e.codigo,
          nombre: e.nombre,
          dias: 0,
          tempranos: 0,
          tardanzas: 0,
          puntos: 0,
          multaPagada: 0,
          multaGanada: 0,
        });
      }
      for (const p of punts) {
        const s = byId.get(p.employeeId);
        if (!s) continue;
        s.dias++;
        s.puntos += p.puntos;
        s.multaPagada += p.multaPagada;
        s.multaGanada += p.multaGanada;
        if (p.minTarde > 0) s.tardanzas++;
        if (p.minTemprano > 0) s.tempranos++;
      }
      return [...byId.values()].sort((a, b) => b.puntos - a.puntos);
    },
  );

  // Anomalías: marcaciones fuera del rango GPS permitido.
  app.get(
    '/api/admin/businesses/:id/anomalies',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!(await canAccess(req, id))) return reply.code(403).send({ error: 'sin_acceso' });
      const { from, to } = parseDateRange(req.query as Record<string, unknown>);
      const db = await getDb();
      const rows = await db
        .select({ a: attendance, empNombre: employees.nombre, empCodigo: employees.codigo })
        .from(attendance)
        .innerJoin(employees, eq(employees.id, attendance.employeeId))
        .where(
          and(
            eq(attendance.businessId, id),
            gte(attendance.fecha, from),
            lte(attendance.fecha, to),
            eq(attendance.gpsValido, false),
          ),
        )
        .orderBy(desc(attendance.fecha));
      return rows.map((r) => ({ ...toAttendance(r.a), empNombre: r.empNombre, empCodigo: r.empCodigo }));
    },
  );

  // Nómina: sueldo + horas extra + multas por empleado, en un rango de fechas.
  app.get(
    '/api/admin/businesses/:id/nomina',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!(await canAccess(req, id))) return reply.code(403).send({ error: 'sin_acceso' });
      const parsed = nominaQuerySchema.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });
      const { from, to } = parsed.data;

      const db = await getDb();
      const res = await calcularNominaNegocio(db, id, from, to);
      if (!res) return reply.code(404).send({ error: 'no_encontrado' });
      return res.filas;
    },
  );

  // Bitácora de cambios manuales (auditoría).
  app.get(
    '/api/admin/businesses/:id/audit',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!(await canAccess(req, id))) return reply.code(403).send({ error: 'sin_acceso' });
      const db = await getDb();
      const rows = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.businessId, id))
        .orderBy(desc(auditLog.createdAt))
        .limit(200);
      return rows.map(toAuditLog);
    },
  );
}
