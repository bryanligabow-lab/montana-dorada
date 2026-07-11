import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { nominaQuerySchema } from '@asis/shared';
import type { PunctualitySummary } from '@asis/shared';
import { getDb } from '../db';
import { attendance, auditLog, businesses, employees, punctuality } from '../db/schema';
import { toAttendance, toAuditLog } from '../lib/dto';
import { canAccess, parseDateRange } from '../lib/http';
import { calcularNominaEmpleado } from '../core/payroll';

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
      const biz = (await db.select().from(businesses).where(eq(businesses.id, id)).limit(1))[0];
      if (!biz) return reply.code(404).send({ error: 'no_encontrado' });

      const emps = await db.select().from(employees).where(eq(employees.businessId, id));
      const attRows = await db
        .select()
        .from(attendance)
        .where(and(eq(attendance.businessId, id), gte(attendance.fecha, from), lte(attendance.fecha, to)));
      const puntRows = await db
        .select()
        .from(punctuality)
        .where(and(eq(punctuality.businessId, id), gte(punctuality.fecha, from), lte(punctuality.fecha, to)));

      const attByEmp = new Map<string, typeof attRows>();
      for (const a of attRows) attByEmp.set(a.employeeId, [...(attByEmp.get(a.employeeId) ?? []), a]);
      const puntByEmp = new Map<string, typeof puntRows>();
      for (const p of puntRows) puntByEmp.set(p.employeeId, [...(puntByEmp.get(p.employeeId) ?? []), p]);

      return emps.map((e) =>
        calcularNominaEmpleado(e, biz, attByEmp.get(e.id) ?? [], puntByEmp.get(e.id) ?? [], from, to),
      );
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
