import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { employeeCreateSchema, employeeUpdateSchema } from '@asis/shared';
import { getDb } from '../db';
import { employees } from '../db/schema';
import { toEmployee } from '../lib/dto';
import { canAccess } from '../lib/http';
import { generateQrToken } from '../lib/qr';
import { generate4DigitPin } from '../lib/pin';
import { writeAudit } from '../lib/audit';

export async function employeeRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/admin/businesses/:id/employees',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!(await canAccess(req, id))) return reply.code(403).send({ error: 'sin_acceso' });
      const db = await getDb();
      const rows = await db.select().from(employees).where(eq(employees.businessId, id));
      return rows.map(toEmployee);
    },
  );

  app.post(
    '/api/admin/businesses/:id/employees',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!(await canAccess(req, id))) return reply.code(403).send({ error: 'sin_acceso' });
      const parsed = employeeCreateSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });

      const db = await getDb();
      const [created] = await db
        .insert(employees)
        .values({
          businessId: id,
          qrToken: generateQrToken(),
          codigo: parsed.data.codigo,
          nombre: parsed.data.nombre,
          sueldo: parsed.data.sueldo,
          sueldoFds: parsed.data.sueldoFds,
          tipoSueldo: parsed.data.tipoSueldo,
          sueldoFijo: parsed.data.sueldoFijo,
          frecuenciaSueldo: parsed.data.frecuenciaSueldo,
          horaExtraTipo: parsed.data.horaExtraTipo,
          horaExtraValor: parsed.data.horaExtraValor,
          estado: parsed.data.estado,
          deudaInicial: parsed.data.deudaInicial,
          // PIN de 4 dígitos para el portal del empleado: se autogenera si no se indicó uno.
          pin: parsed.data.pin || generate4DigitPin(),
          telefono: parsed.data.telefono ?? null,
        })
        .returning();
      await writeAudit(db, {
        businessId: id,
        userId: req.user.sub,
        actorNombre: req.user.nombre,
        accion: 'create',
        entidad: 'employee',
        entidadId: created!.id,
        detalle: { codigo: parsed.data.codigo, nombre: parsed.data.nombre },
      });
      return toEmployee(created!);
    },
  );

  app.patch('/api/admin/employees/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = await getDb();
    const emp = (await db.select().from(employees).where(eq(employees.id, id)).limit(1))[0];
    if (!emp) return reply.code(404).send({ error: 'no_encontrado' });
    if (!(await canAccess(req, emp.businessId))) return reply.code(403).send({ error: 'sin_acceso' });

    const parsed = employeeUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });

    const { pin, ...rest } = parsed.data;
    const patch: Partial<typeof employees.$inferInsert> = { ...rest };
    if (pin !== undefined) patch.pin = pin ?? null;

    await db.update(employees).set(patch).where(eq(employees.id, id));
    await writeAudit(db, {
      businessId: emp.businessId,
      userId: req.user.sub,
      actorNombre: req.user.nombre,
      accion: 'update',
      entidad: 'employee',
      entidadId: id,
      detalle: parsed.data,
    });
    const updated = (await db.select().from(employees).where(eq(employees.id, id)).limit(1))[0]!;
    return toEmployee(updated);
  });

  // Baja lógica: conserva el histórico, marca INACTIVO.
  app.delete('/api/admin/employees/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = await getDb();
    const emp = (await db.select().from(employees).where(eq(employees.id, id)).limit(1))[0];
    if (!emp) return reply.code(404).send({ error: 'no_encontrado' });
    if (!(await canAccess(req, emp.businessId))) return reply.code(403).send({ error: 'sin_acceso' });
    await db.update(employees).set({ estado: 'INACTIVO' }).where(eq(employees.id, id));
    await writeAudit(db, {
      businessId: emp.businessId,
      userId: req.user.sub,
      actorNombre: req.user.nombre,
      accion: 'deactivate',
      entidad: 'employee',
      entidadId: id,
    });
    return { ok: true };
  });

  // Rota el token del QR (por si se filtró un QR viejo).
  app.post(
    '/api/admin/employees/:id/regenerate-qr',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const db = await getDb();
      const emp = (await db.select().from(employees).where(eq(employees.id, id)).limit(1))[0];
      if (!emp) return reply.code(404).send({ error: 'no_encontrado' });
      if (!(await canAccess(req, emp.businessId)))
        return reply.code(403).send({ error: 'sin_acceso' });
      const qrToken = generateQrToken();
      await db.update(employees).set({ qrToken }).where(eq(employees.id, id));
      await writeAudit(db, {
        businessId: emp.businessId,
        userId: req.user.sub,
        actorNombre: req.user.nombre,
        accion: 'regenerate_qr',
        entidad: 'employee',
        entidadId: id,
      });
      return { qrToken };
    },
  );
}
