import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { loginSchema } from '@asis/shared';
import type { LoginResult, User } from '@asis/shared';
import { getDb } from '../db';
import { businesses, users } from '../db/schema';
import { accessibleBusinessIds, verifyPassword } from '../lib/auth';
import { toBusiness } from '../lib/dto';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });

    const db = await getDb();
    const u = (
      await db.select().from(users).where(eq(users.email, parsed.data.email.toLowerCase())).limit(1)
    )[0];
    if (!u || !(await verifyPassword(parsed.data.password, u.passwordHash))) {
      return reply.code(401).send({ error: 'credenciales_invalidas' });
    }

    const allBiz = await db.select().from(businesses);
    const ids = accessibleBusinessIds(u, allBiz.map((b) => b.id));
    const token = await reply.jwtSign(
      { sub: u.id, rol: u.rol, nombre: u.nombre, businessIds: ids },
      { expiresIn: '12h' },
    );

    const user: User = { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, businessIds: ids };
    const result: LoginResult = {
      token,
      user,
      businesses: allBiz.filter((b) => ids.includes(b.id)).map(toBusiness),
    };
    return result;
  });

  // Devuelve el usuario actual a partir del token (para rehidratar la sesión).
  app.get('/api/auth/me', { preHandler: [app.authenticate] }, async (req) => {
    const db = await getDb();
    const allBiz = await db.select().from(businesses);
    const ids = req.user.businessIds ?? [];
    const visibles = req.user.rol === 'OWNER' ? allBiz : allBiz.filter((b) => ids.includes(b.id));
    return {
      user: { id: req.user.sub, nombre: req.user.nombre, rol: req.user.rol, businessIds: ids },
      businesses: visibles.map(toBusiness),
    };
  });
}
