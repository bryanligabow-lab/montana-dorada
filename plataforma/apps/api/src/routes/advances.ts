import type { FastifyInstance } from 'fastify';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { advanceCreateSchema } from '@asis/shared';
import { getDb } from '../db';
import { advances, employees } from '../db/schema';
import { toAdvance } from '../lib/dto';
import { canAccess, parseDateRange } from '../lib/http';
import { writeAudit } from '../lib/audit';

export async function advanceRoutes(app: FastifyInstance): Promise<void> {
  // Lista de anticipos del negocio en un rango (?from=&to= / ?month= / ?date=), con nombre del empleado.
  app.get(
    '/api/admin/businesses/:id/advances',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!(await canAccess(req, id))) return reply.code(403).send({ error: 'sin_acceso' });
      const { from, to } = parseDateRange(req.query as Record<string, unknown>);
      const db = await getDb();
      const rows = await db
        .select({ a: advances, empNombre: employees.nombre, empCodigo: employees.codigo })
        .from(advances)
        .innerJoin(employees, eq(employees.id, advances.employeeId))
        .where(and(eq(advances.businessId, id), gte(advances.fecha, from), lte(advances.fecha, to)))
        .orderBy(desc(advances.fecha));
      return rows.map((r) => ({ ...toAdvance(r.a), empNombre: r.empNombre, empCodigo: r.empCodigo }));
    },
  );

  // Registrar un anticipo para un empleado del negocio.
  app.post(
    '/api/admin/businesses/:id/advances',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!(await canAccess(req, id))) return reply.code(403).send({ error: 'sin_acceso' });
      const parsed = advanceCreateSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });

      const db = await getDb();
      // El empleado tiene que pertenecer a este negocio (no se puede anticipar a un empleado ajeno).
      const emp = (
        await db.select().from(employees).where(eq(employees.id, parsed.data.employeeId)).limit(1)
      )[0];
      if (!emp || emp.businessId !== id) return reply.code(400).send({ error: 'empleado_invalido' });

      const [created] = await db
        .insert(advances)
        .values({
          businessId: id,
          employeeId: parsed.data.employeeId,
          fecha: parsed.data.fecha,
          monto: parsed.data.monto,
          nota: parsed.data.nota ?? null,
          createdBy: req.user.sub,
        })
        .returning();
      await writeAudit(db, {
        businessId: id,
        userId: req.user.sub,
        actorNombre: req.user.nombre,
        accion: 'create',
        entidad: 'advance',
        entidadId: created!.id,
        detalle: { empleado: emp.nombre, monto: parsed.data.monto, fecha: parsed.data.fecha },
      });
      return toAdvance(created!);
    },
  );

  // Eliminar un anticipo (registrado por error).
  app.delete('/api/admin/advances/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = await getDb();
    const row = (await db.select().from(advances).where(eq(advances.id, id)).limit(1))[0];
    if (!row) return reply.code(404).send({ error: 'no_encontrado' });
    if (!(await canAccess(req, row.businessId))) return reply.code(403).send({ error: 'sin_acceso' });
    await db.delete(advances).where(eq(advances.id, id));
    await writeAudit(db, {
      businessId: row.businessId,
      userId: req.user.sub,
      actorNombre: req.user.nombre,
      accion: 'delete',
      entidad: 'advance',
      entidadId: id,
      detalle: { monto: row.monto, fecha: row.fecha },
    });
    return { ok: true };
  });
}
