import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { env } from './env';
import { authRoutes } from './routes/auth';
import { clockRoutes } from './routes/clock';
import { businessRoutes } from './routes/businesses';
import { employeeRoutes } from './routes/employees';
import { adminRoutes } from './routes/admin';
import { importRoutes } from './routes/import';
import { userRoutes } from './routes/users';
import { advanceRoutes } from './routes/advances';
import { portalRoutes } from './routes/portal';

export async function buildServer() {
  const app = Fastify({ logger: { level: env.isProd ? 'info' : 'warn' }, bodyLimit: 15 * 1024 * 1024 });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: env.jwtSecret });

  app.decorate('authenticate', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'no_autorizado' });
      return;
    }
    // Un token del portal (empleado, solo lectura) nunca sirve para el panel de admin.
    if (req.user.kind === 'portal') reply.code(401).send({ error: 'no_autorizado' });
  });

  app.decorate('portalAuthenticate', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'no_autorizado' });
      return;
    }
    if (req.user.kind !== 'portal') reply.code(401).send({ error: 'no_autorizado' });
  });

  app.get('/health', async () => ({ ok: true, ts: new Date().toISOString() }));

  await app.register(authRoutes);
  await app.register(clockRoutes);
  await app.register(businessRoutes);
  await app.register(employeeRoutes);
  await app.register(adminRoutes);
  await app.register(advanceRoutes);
  await app.register(portalRoutes);
  await app.register(importRoutes);
  await app.register(userRoutes);

  return app;
}
