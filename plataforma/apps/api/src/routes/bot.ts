import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { botNumberCreateSchema } from '@asis/shared';
import { getDb } from '../db';
import { botNumbers, businesses } from '../db/schema';
import { writeAudit } from '../lib/audit';
import { env } from '../env';
import { atenderMensajeBot } from '../bot/service';
import { conectarBot, desconectarBot, estadoBot } from '../bot/evolution';
import { iaConfigurada } from '../bot/ia';

/**
 * Chatbot de WhatsApp:
 * - POST /api/bot/webhook: recibe los mensajes entrantes desde Evolution API (instancia del bot).
 * - /api/admin/chatbot/*: gestión (solo OWNER) — estado/conexión del número del bot y números autorizados.
 */

/** Dedup de mensajes reenviados por Evolution (reintentos). */
const vistos = new Set<string>();
function yaVisto(id: string): boolean {
  if (!id) return false;
  if (vistos.has(id)) return true;
  vistos.add(id);
  if (vistos.size > 2000) {
    // poda simple: conserva la mitad más reciente
    for (const v of [...vistos].slice(0, 1000)) vistos.delete(v);
  }
  return false;
}

interface EvolutionMessage {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    message?: { conversation?: string; extendedTextMessage?: { text?: string } };
  };
}

/** Extrae (jid, texto, id) de un payload MESSAGES_UPSERT; null si no es un texto entrante 1:1. */
export function parseWebhookMessage(body: EvolutionMessage): { jid: string; texto: string; id: string } | null {
  const key = body?.data?.key;
  const msg = body?.data?.message;
  if (!key?.remoteJid || key.fromMe) return null;
  if (!key.remoteJid.endsWith('@s.whatsapp.net')) return null; // ni grupos ni estados
  const texto = (msg?.conversation ?? msg?.extendedTextMessage?.text ?? '').trim();
  if (!texto) return null;
  return { jid: key.remoteJid, texto: texto.slice(0, 1000), id: key.id ?? '' };
}

export async function botRoutes(app: FastifyInstance): Promise<void> {
  // ── Webhook de Evolution (público, protegido por secreto en query/header) ────
  app.post('/api/bot/webhook', async (req, reply) => {
    const secret = (req.query as Record<string, string>).secret ?? (req.headers['x-bot-secret'] as string);
    if (!env.evolution.key || secret !== env.evolution.key) {
      return reply.code(401).send({ error: 'no_autorizado' });
    }

    const parsed = parseWebhookMessage(req.body as EvolutionMessage);
    if (!parsed || yaVisto(parsed.id)) return { ok: true };

    // Fire-and-forget: la IA puede tardar segundos y Evolution no debe esperar.
    const db = await getDb();
    void atenderMensajeBot(db, parsed.jid, parsed.texto).catch((e) =>
      req.log.error({ err: e }, 'Error atendiendo mensaje del bot'),
    );
    return { ok: true };
  });

  // ── Gestión (solo OWNER) ─────────────────────────────────────────────────────
  app.get('/api/admin/chatbot/estado', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (req.user.rol !== 'OWNER') return reply.code(403).send({ error: 'solo_owner' });
    const st = await estadoBot();
    return { ...st, iaConfigurada: iaConfigurada(), modelo: env.anthropic.model };
  });

  app.post('/api/admin/chatbot/conectar', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (req.user.rol !== 'OWNER') return reply.code(403).send({ error: 'solo_owner' });
    const r = await conectarBot();
    await writeAudit(await getDb(), {
      userId: req.user.sub,
      actorNombre: req.user.nombre,
      accion: 'chatbot_conectar',
      entidad: 'chatbot',
      detalle: { estado: r.estado },
    });
    return r;
  });

  app.post('/api/admin/chatbot/desconectar', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (req.user.rol !== 'OWNER') return reply.code(403).send({ error: 'solo_owner' });
    const ok = await desconectarBot();
    await writeAudit(await getDb(), {
      userId: req.user.sub,
      actorNombre: req.user.nombre,
      accion: 'chatbot_desconectar',
      entidad: 'chatbot',
      detalle: { ok },
    });
    return { ok };
  });

  // Números autorizados (quién puede hablar con el bot y de qué negocio).
  app.get('/api/admin/chatbot/numeros', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (req.user.rol !== 'OWNER') return reply.code(403).send({ error: 'solo_owner' });
    const db = await getDb();
    const rows = await db
      .select({ n: botNumbers, bizNombre: businesses.nombre })
      .from(botNumbers)
      .innerJoin(businesses, eq(businesses.id, botNumbers.businessId))
      .orderBy(desc(botNumbers.createdAt));
    return rows.map((r) => ({
      id: r.n.id,
      businessId: r.n.businessId,
      negocio: r.bizNombre,
      numero: r.n.numero,
      nombre: r.n.nombre,
      activo: r.n.activo,
      createdAt: r.n.createdAt.toISOString(),
    }));
  });

  app.post('/api/admin/chatbot/numeros', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (req.user.rol !== 'OWNER') return reply.code(403).send({ error: 'solo_owner' });
    const parsed = botNumberCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });

    const db = await getDb();
    const biz = (await db.select().from(businesses).where(eq(businesses.id, parsed.data.businessId)).limit(1))[0];
    if (!biz) return reply.code(404).send({ error: 'negocio_no_existe' });

    try {
      const [row] = await db
        .insert(botNumbers)
        .values({
          businessId: parsed.data.businessId,
          numero: parsed.data.numero.trim(),
          nombre: (parsed.data.nombre ?? '').trim(),
        })
        .returning();
      await writeAudit(db, {
        businessId: parsed.data.businessId,
        userId: req.user.sub,
        actorNombre: req.user.nombre,
        accion: 'create',
        entidad: 'bot_numero',
        entidadId: row!.id,
        detalle: { numero: parsed.data.numero, nombre: parsed.data.nombre, negocio: biz.nombre },
      });
      return { id: row!.id };
    } catch {
      return reply.code(409).send({ error: 'numero_ya_enlazado' }); // unique(businessId, numero)
    }
  });

  app.delete('/api/admin/chatbot/numeros/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    if (req.user.rol !== 'OWNER') return reply.code(403).send({ error: 'solo_owner' });
    const { id } = req.params as { id: string };
    const db = await getDb();
    const row = (await db.select().from(botNumbers).where(eq(botNumbers.id, id)).limit(1))[0];
    if (!row) return reply.code(404).send({ error: 'no_encontrado' });
    await db.delete(botNumbers).where(eq(botNumbers.id, id));
    await writeAudit(db, {
      businessId: row.businessId,
      userId: req.user.sub,
      actorNombre: req.user.nombre,
      accion: 'delete',
      entidad: 'bot_numero',
      entidadId: id,
      detalle: { numero: row.numero, nombre: row.nombre },
    });
    return { ok: true };
  });
}
