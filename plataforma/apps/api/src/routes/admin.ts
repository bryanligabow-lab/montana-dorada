import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { PunctualitySummary } from '@asis/shared';
import { getDb } from '../db';
import { attendance, auditLog, employees, punctuality } from '../db/schema';
import { toAttendance, toAuditLog } from '../lib/dto';
import { canAccess, parseDateRange } from '../lib/http';

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
