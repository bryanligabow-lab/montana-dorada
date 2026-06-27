import type { FastifyInstance } from 'fastify';
import { clockMotivoSchema, clockRequestSchema } from '@asis/shared';
import { getDb } from '../db';
import { clock, clockMotivo, getClockContext } from '../services/clock';

export async function clockRoutes(app: FastifyInstance): Promise<void> {
  // Contexto para pintar la PWA al abrir el QR.
  app.get('/api/clock/context', async (req, reply) => {
    const token = (req.query as Record<string, string>).token;
    if (!token) return reply.code(400).send({ error: 'token_requerido' });
    const ctx = await getClockContext(await getDb(), token);
    if (!ctx) return reply.code(404).send({ error: 'qr_invalido' });
    return ctx;
  });

  // Marcar entrada o salida.
  app.post('/api/clock', async (req, reply) => {
    const parsed = clockRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });
    const result = await clock(
      { db: await getDb(), ip: req.ip, ua: req.headers['user-agent'] ?? null },
      parsed.data,
    );
    if (!result) return reply.code(404).send({ error: 'qr_invalido' });
    return result;
  });

  // Completar una tardanza con el motivo elegido.
  app.post('/api/clock/motivo', async (req, reply) => {
    const parsed = clockMotivoSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });
    const result = await clockMotivo(
      { db: await getDb(), ip: req.ip, ua: req.headers['user-agent'] ?? null },
      parsed.data,
    );
    if (!result) return reply.code(404).send({ error: 'qr_invalido' });
    return result;
  });
}
