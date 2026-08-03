import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import type { DB } from '../db';
import { advances, auditLog, botNumbers, businesses, employees } from '../db/schema';
import * as schema from '../db/schema';
import { ejecutarBotTool, type BotToolCtx } from './tools';
import { normalizarNumero, resolverNumeroBot } from './service';
import { parseWebhookMessage } from '../routes/bot';

async function setup(): Promise<DB> {
  const client = new PGlite();
  await client.waitReady;
  const db = drizzle(client, { schema }) as unknown as DB;
  await migrate(db as never, { migrationsFolder: path.resolve('drizzle') });
  return db;
}

async function seed(db: DB) {
  const [biz1] = await db.insert(businesses).values({ slug: 'bot-a', nombre: 'Negocio A' }).returning();
  const [biz2] = await db.insert(businesses).values({ slug: 'bot-b', nombre: 'Negocio B' }).returning();
  const [emp] = await db
    .insert(employees)
    .values({ businessId: biz1!.id, codigo: 'BA-1', qrToken: 'tokenBOTA0001', nombre: 'Kerly Prueba' })
    .returning();
  const [empB] = await db
    .insert(employees)
    .values({ businessId: biz2!.id, codigo: 'BB-1', qrToken: 'tokenBOTB0001', nombre: 'Empleado B' })
    .returning();
  return { biz1: biz1!, biz2: biz2!, emp: emp!, empB: empB! };
}

describe('chatbot · normalización y autorización de números', () => {
  it('iguala el número local, el internacional y el JID de WhatsApp', () => {
    expect(normalizarNumero('0997121766')).toBe('997121766');
    expect(normalizarNumero('593997121766')).toBe('997121766');
    expect(normalizarNumero('593997121766@s.whatsapp.net')).toBe('997121766');
    expect(normalizarNumero('+593 99 712 1766')).toBe('997121766');
  });

  it('resuelve los negocios del número autorizado y rechaza desconocidos', async () => {
    const db = await setup();
    const { biz1, biz2 } = await seed(db);
    await db.insert(botNumbers).values({ businessId: biz1.id, numero: '0997121766', nombre: 'Bryan' });
    await db.insert(botNumbers).values({ businessId: biz2.id, numero: '593997121766', nombre: 'Bryan' });

    // El mismo número escrito distinto en cada negocio → ambos negocios autorizados.
    const auth = await resolverNumeroBot(db, '593997121766@s.whatsapp.net');
    expect(auth).not.toBeNull();
    expect(auth!.negocios.map((b) => b.nombre).sort()).toEqual(['Negocio A', 'Negocio B']);

    // Número no registrado → null (el bot lo ignora en silencio).
    expect(await resolverNumeroBot(db, '593999999999@s.whatsapp.net')).toBeNull();
  });
});

describe('chatbot · herramientas (registrar / listar / eliminar, con alcance por negocio)', () => {
  it('registra un anticipo, lo lista, lo elimina y deja auditoría', async () => {
    const db = await setup();
    const { biz1, biz2, emp } = await seed(db);
    const ctx: BotToolCtx = {
      db,
      businessId: biz1.id,
      negociosPermitidos: [
        { id: biz1.id, nombre: biz1.nombre },
        { id: biz2.id, nombre: biz2.nombre },
      ],
      actorNombre: 'Bot WhatsApp · Test',
    };

    // Registrar
    const r1 = await ejecutarBotTool(ctx, 'registrar_descuento', { employeeId: emp.id, tipo: 'ANTICIPO', monto: 20, nota: 'prueba' }, '2026-08-03');
    expect(r1).toContain('OK');
    expect(r1).toContain('Kerly');
    const filas = await db.select().from(advances).where(eq(advances.businessId, biz1.id));
    expect(filas).toHaveLength(1);
    expect(filas[0]!.monto).toBe(20);
    expect(filas[0]!.tipo).toBe('ANTICIPO');

    // Listar (encuentra el registro con su id)
    const r2 = await ejecutarBotTool(ctx, 'listar_descuentos', {}, '2026-08-03');
    expect(r2).toContain('Kerly');
    expect(r2).toContain(filas[0]!.id);

    // Eliminar (deshacer)
    const r3 = await ejecutarBotTool(ctx, 'eliminar_descuento', { id: filas[0]!.id }, '2026-08-03');
    expect(r3).toContain('OK');
    expect(await db.select().from(advances).where(eq(advances.businessId, biz1.id))).toHaveLength(0);

    // Auditoría: create + delete con el actor del bot
    const audit = await db.select().from(auditLog);
    const acciones = audit.filter((a) => a.actorNombre === 'Bot WhatsApp · Test').map((a) => a.accion);
    expect(acciones).toContain('create');
    expect(acciones).toContain('delete');
  });

  it('valida montos y NO permite tocar empleados/registros de otro negocio', async () => {
    const db = await setup();
    const { biz1, biz2, emp, empB } = await seed(db);
    const ctx: BotToolCtx = {
      db,
      businessId: biz1.id,
      negociosPermitidos: [{ id: biz1.id, nombre: biz1.nombre }],
      actorNombre: 'Bot WhatsApp · Test',
    };

    // Monto inválido
    expect(await ejecutarBotTool(ctx, 'registrar_descuento', { employeeId: emp.id, tipo: 'MULTA', monto: 0 }, '2026-08-03')).toContain('Error');
    expect(await ejecutarBotTool(ctx, 'registrar_descuento', { employeeId: emp.id, tipo: 'MULTA', monto: 99999 }, '2026-08-03')).toContain('Error');

    // Empleado de OTRO negocio → rechazado
    const cruzado = await ejecutarBotTool(ctx, 'registrar_descuento', { employeeId: empB.id, tipo: 'ANTICIPO', monto: 10 }, '2026-08-03');
    expect(cruzado).toContain('Error');

    // Registro de otro negocio → no se puede eliminar desde este contexto
    const [ajeno] = await db
      .insert(advances)
      .values({ businessId: biz2.id, employeeId: empB.id, tipo: 'MULTA', fecha: '2026-08-01', monto: 5 })
      .returning();
    const del = await ejecutarBotTool(ctx, 'eliminar_descuento', { id: ajeno!.id }, '2026-08-03');
    expect(del).toContain('Error');
    expect(await db.select().from(advances).where(eq(advances.id, ajeno!.id))).toHaveLength(1);

    // cambiar_negocio a uno NO autorizado → rechazado
    expect(await ejecutarBotTool(ctx, 'cambiar_negocio', { businessId: biz2.id }, '2026-08-03')).toContain('Error');
    expect(ctx.businessId).toBe(biz1.id);
  });
});

describe('chatbot · parser del webhook de Evolution', () => {
  const base = (over: Record<string, unknown>) => ({
    event: 'messages.upsert',
    instance: 'asistencia-bot',
    data: {
      key: { remoteJid: '593997121766@s.whatsapp.net', fromMe: false, id: 'MSG1', ...(over.key as object) },
      message: over.message ?? { conversation: 'ponle un anticipo de 20 a Kerly' },
    },
  });

  it('acepta textos entrantes 1:1 (conversation y extendedTextMessage)', () => {
    expect(parseWebhookMessage(base({}))?.texto).toBe('ponle un anticipo de 20 a Kerly');
    expect(parseWebhookMessage(base({ message: { extendedTextMessage: { text: 'hola' } } }))?.texto).toBe('hola');
  });

  it('ignora mensajes propios, grupos y payloads sin texto', () => {
    expect(parseWebhookMessage(base({ key: { fromMe: true } }))).toBeNull();
    expect(parseWebhookMessage(base({ key: { remoteJid: '120363423953185265@g.us' } }))).toBeNull();
    expect(parseWebhookMessage(base({ message: { imageMessage: {} } }))).toBeNull();
    expect(parseWebhookMessage({} as never)).toBeNull();
  });
});
