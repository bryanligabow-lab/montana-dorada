import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { nominaQuerySchema, portalLoginSchema } from '@asis/shared';
import type { PortalSession } from '@asis/shared';
import { getDb } from '../db';
import { advances, attendance, businesses, employees, punctuality } from '../db/schema';
import { toAdvance, toAttendance } from '../lib/dto';
import { parseDateRange } from '../lib/http';
import { calcularNominaEmpleado } from '../core/payroll';

/** Carga el empleado y su negocio a partir del token del portal. */
async function loadFromToken(req: FastifyRequest) {
  const db = await getDb();
  const emp = (
    await db.select().from(employees).where(eq(employees.id, req.user.employeeId ?? '')).limit(1)
  )[0];
  const biz = emp
    ? (await db.select().from(businesses).where(eq(businesses.id, emp.businessId)).limit(1))[0]
    : undefined;
  return { db, emp, biz };
}

export async function portalRoutes(app: FastifyInstance): Promise<void> {
  // Login del empleado: código + PIN de 4 dígitos. Devuelve un token de solo lectura (30 días).
  app.post('/api/portal/login', async (req, reply) => {
    const parsed = portalLoginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });

    const db = await getDb();
    const matches = await db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.codigo, parsed.data.codigo),
          eq(employees.pin, parsed.data.pin),
          eq(employees.estado, 'ACTIVO'),
        ),
      );
    // Debe haber exactamente una coincidencia (código único por negocio + PIN de 4 dígitos).
    if (matches.length !== 1) return reply.code(401).send({ error: 'credenciales_invalidas' });
    const emp = matches[0]!;

    const biz = (await db.select().from(businesses).where(eq(businesses.id, emp.businessId)).limit(1))[0];
    if (!biz) return reply.code(401).send({ error: 'credenciales_invalidas' });
    if (!biz.activo) return reply.code(403).send({ error: 'negocio_suspendido' });

    const token = await reply.jwtSign(
      // rol/businessIds inertes (businessIds vacío) + kind:'portal' → no da acceso a nada de admin.
      {
        sub: emp.id,
        rol: 'ADMIN',
        nombre: emp.nombre,
        businessIds: [],
        kind: 'portal',
        employeeId: emp.id,
        businessId: emp.businessId,
      },
      { expiresIn: '30d' },
    );

    const result: PortalSession = {
      token,
      employee: { id: emp.id, codigo: emp.codigo, nombre: emp.nombre },
      business: { nombre: biz.nombre, branding: biz.branding },
    };
    return result;
  });

  // Rehidratar la sesión del portal.
  app.get('/api/portal/me', { preHandler: [app.portalAuthenticate] }, async (req, reply) => {
    const { emp, biz } = await loadFromToken(req);
    if (!emp || !biz) return reply.code(404).send({ error: 'no_encontrado' });
    const result: Omit<PortalSession, 'token'> = {
      employee: { id: emp.id, codigo: emp.codigo, nombre: emp.nombre },
      business: { nombre: biz.nombre, branding: biz.branding },
    };
    return result;
  });

  // Asistencia del propio empleado (?month= / ?from=&to=).
  app.get('/api/portal/attendance', { preHandler: [app.portalAuthenticate] }, async (req) => {
    const { from, to } = parseDateRange(req.query as Record<string, unknown>);
    const db = await getDb();
    const rows = await db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.employeeId, req.user.employeeId ?? ''),
          gte(attendance.fecha, from),
          lte(attendance.fecha, to),
        ),
      )
      .orderBy(desc(attendance.fecha));
    return rows.map(toAttendance);
  });

  // Anticipos del propio empleado (?month= / ?from=&to=).
  app.get('/api/portal/advances', { preHandler: [app.portalAuthenticate] }, async (req) => {
    const { from, to } = parseDateRange(req.query as Record<string, unknown>);
    const db = await getDb();
    const rows = await db
      .select()
      .from(advances)
      .where(
        and(
          eq(advances.employeeId, req.user.employeeId ?? ''),
          gte(advances.fecha, from),
          lte(advances.fecha, to),
        ),
      )
      .orderBy(desc(advances.fecha));
    return rows.map(toAdvance);
  });

  // Nómina del propio empleado en un rango (misma lógica que el panel, un solo empleado).
  app.get('/api/portal/nomina', { preHandler: [app.portalAuthenticate] }, async (req, reply) => {
    const parsed = nominaQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });
    const { from, to } = parsed.data;

    const { db, emp, biz } = await loadFromToken(req);
    if (!emp || !biz) return reply.code(404).send({ error: 'no_encontrado' });

    const att = await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.employeeId, emp.id), gte(attendance.fecha, from), lte(attendance.fecha, to)));
    const punt = await db
      .select()
      .from(punctuality)
      .where(and(eq(punctuality.employeeId, emp.id), gte(punctuality.fecha, from), lte(punctuality.fecha, to)));
    const adv = await db
      .select()
      .from(advances)
      .where(and(eq(advances.employeeId, emp.id), gte(advances.fecha, from), lte(advances.fecha, to)));

    return calcularNominaEmpleado(emp, biz, att, punt, from, to, adv);
  });
}
