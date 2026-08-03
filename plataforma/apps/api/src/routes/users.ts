import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { userCreateSchema, userResetPasswordSchema, userUpdateSchema } from '@asis/shared';
import type { PlatformUser } from '@asis/shared';
import { getDb } from '../db';
import { users } from '../db/schema';
import { hashPassword } from '../lib/auth';
import { writeAudit } from '../lib/audit';

function toPlatformUser(u: typeof users.$inferSelect): PlatformUser {
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    businessIds: u.businessIds,
    createdAt: u.createdAt.toISOString(),
  };
}

/** Gestión de cuentas de acceso (solo OWNER): a quién le das las credenciales de cada negocio. */
export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/users', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (req.user.rol !== 'OWNER') return reply.code(403).send({ error: 'solo_owner' });
    const db = await getDb();
    const rows = await db.select().from(users).orderBy(desc(users.createdAt));
    return rows.map(toPlatformUser);
  });

  app.post('/api/admin/users', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (req.user.rol !== 'OWNER') return reply.code(403).send({ error: 'solo_owner' });
    const parsed = userCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });

    const db = await getDb();
    const email = parsed.data.email.toLowerCase();
    const existe = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    if (existe) return reply.code(409).send({ error: 'correo_existe' });

    const [created] = await db
      .insert(users)
      .values({
        email,
        nombre: parsed.data.nombre,
        passwordHash: await hashPassword(parsed.data.password),
        rol: 'ADMIN',
        businessIds: parsed.data.businessIds,
      })
      .returning();
    await writeAudit(db, {
      businessId: null,
      userId: req.user.sub,
      actorNombre: req.user.nombre,
      accion: 'create',
      entidad: 'user',
      entidadId: created!.id,
      detalle: { email, nombre: parsed.data.nombre, businessIds: parsed.data.businessIds },
    });
    return toPlatformUser(created!);
  });

  app.patch('/api/admin/users/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (req.user.rol !== 'OWNER') return reply.code(403).send({ error: 'solo_owner' });
    const { id } = req.params as { id: string };
    const parsed = userUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });

    const db = await getDb();
    const target = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
    if (!target) return reply.code(404).send({ error: 'no_encontrado' });

    const patch = { ...parsed.data };
    if (patch.email !== undefined) {
      patch.email = patch.email.toLowerCase();
      const otro = (await db.select().from(users).where(eq(users.email, patch.email)).limit(1))[0];
      if (otro && otro.id !== id) return reply.code(409).send({ error: 'correo_existe' });
    }

    await db.update(users).set(patch).where(eq(users.id, id));
    await writeAudit(db, {
      businessId: null,
      userId: req.user.sub,
      actorNombre: req.user.nombre,
      accion: 'update',
      entidad: 'user',
      entidadId: id,
      detalle: parsed.data,
    });
    const updated = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0]!;
    return toPlatformUser(updated);
  });

  app.patch(
    '/api/admin/users/:id/password',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (req.user.rol !== 'OWNER') return reply.code(403).send({ error: 'solo_owner' });
      const { id } = req.params as { id: string };
      const parsed = userResetPasswordSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });

      const db = await getDb();
      const target = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
      if (!target) return reply.code(404).send({ error: 'no_encontrado' });

      await db
        .update(users)
        .set({ passwordHash: await hashPassword(parsed.data.password) })
        .where(eq(users.id, id));
      await writeAudit(db, {
        businessId: null,
        userId: req.user.sub,
        actorNombre: req.user.nombre,
        accion: 'reset_password',
        entidad: 'user',
        entidadId: id,
      });
      return { ok: true };
    },
  );
}
