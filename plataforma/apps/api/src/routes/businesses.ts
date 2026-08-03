import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { businessCreateSchema, businessUpdateSchema } from '@asis/shared';
import { getDb } from '../db';
import { businesses } from '../db/schema';
import { toBusiness } from '../lib/dto';
import { accessibleIds, canAccess } from '../lib/http';
import { writeAudit } from '../lib/audit';

export async function businessRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/businesses', { preHandler: [app.authenticate] }, async (req) => {
    const db = await getDb();
    const ids = await accessibleIds(req);
    const all = await db.select().from(businesses);
    return all.filter((b) => ids.includes(b.id)).map(toBusiness);
  });

  app.get('/api/admin/businesses/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await canAccess(req, id))) return reply.code(403).send({ error: 'sin_acceso' });
    const db = await getDb();
    const b = (await db.select().from(businesses).where(eq(businesses.id, id)).limit(1))[0];
    if (!b) return reply.code(404).send({ error: 'no_encontrado' });
    return toBusiness(b);
  });

  app.patch('/api/admin/businesses/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await canAccess(req, id))) return reply.code(403).send({ error: 'sin_acceso' });
    const parsed = businessUpdateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });

    const db = await getDb();
    const current = (await db.select().from(businesses).where(eq(businesses.id, id)).limit(1))[0];
    if (!current) return reply.code(404).send({ error: 'no_encontrado' });

    const { branding, horarios, horariosSalida, ...rest } = parsed.data;
    const patch: Partial<typeof businesses.$inferInsert> = { ...rest };
    if (branding) patch.branding = { ...current.branding, ...branding };
    if (horarios) patch.horarios = { ...current.horarios, ...horarios };
    if (horariosSalida) patch.horariosSalida = { ...current.horariosSalida, ...horariosSalida };

    await db.update(businesses).set(patch).where(eq(businesses.id, id));
    await writeAudit(db, {
      businessId: id,
      userId: req.user.sub,
      actorNombre: req.user.nombre,
      accion: 'update',
      entidad: 'business',
      entidadId: id,
      detalle: parsed.data,
    });

    const updated = (await db.select().from(businesses).where(eq(businesses.id, id)).limit(1))[0]!;
    return toBusiness(updated);
  });

  // ── Solo OWNER (dueño de la plataforma): crear negocio y suspender/activar ──
  app.post('/api/admin/businesses', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (req.user.rol !== 'OWNER') return reply.code(403).send({ error: 'solo_owner' });
    const parsed = businessCreateSchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: 'datos_invalidos', detalle: parsed.error.flatten() });

    const db = await getDb();
    const existe = (
      await db.select().from(businesses).where(eq(businesses.slug, parsed.data.slug)).limit(1)
    )[0];
    if (existe) return reply.code(409).send({ error: 'slug_existe' });

    const [biz] = await db.insert(businesses).values(parsed.data).returning();
    await writeAudit(db, {
      businessId: biz!.id,
      userId: req.user.sub,
      actorNombre: req.user.nombre,
      accion: 'create',
      entidad: 'business',
      entidadId: biz!.id,
      detalle: { nombre: parsed.data.nombre, slug: parsed.data.slug },
    });
    return toBusiness(biz!);
  });

  app.patch(
    '/api/admin/businesses/:id/estado',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (req.user.rol !== 'OWNER') return reply.code(403).send({ error: 'solo_owner' });
      const { id } = req.params as { id: string };
      const activo = !!(req.body as { activo?: boolean }).activo;
      const db = await getDb();
      await db.update(businesses).set({ activo }).where(eq(businesses.id, id));
      await writeAudit(db, {
        businessId: id,
        userId: req.user.sub,
        actorNombre: req.user.nombre,
        accion: activo ? 'activar' : 'suspender',
        entidad: 'business',
        entidadId: id,
      });
      return { ok: true, activo };
    },
  );
}
