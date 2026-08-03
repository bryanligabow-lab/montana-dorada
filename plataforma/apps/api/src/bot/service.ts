import { eq, inArray } from 'drizzle-orm';
import type { DB } from '../db';
import { botNumbers, botSessions, businesses, employees } from '../db/schema';
import { businessDate, fechaDisplay } from '../core/time';
import { BOT_TOOLS, ejecutarBotTool, type BotToolCtx } from './tools';
import { correrIA, iaConfigurada } from './ia';
import { enviarTextoBot } from './evolution';

/**
 * Servicio del chatbot de WhatsApp: recibe un mensaje entrante, decide si el número está
 * autorizado, arma el contexto (negocio + empleados + historial) y responde vía la IA.
 * Alcance deliberadamente acotado: anticipos, multas manuales, consultarlos y eliminarlos.
 */

/** Últimos 9 dígitos: iguala '0997121766', '593997121766' y '593997121766@s.whatsapp.net'. */
export function normalizarNumero(v: string): string {
  const digits = String(v).replace(/\D/g, '');
  return digits.slice(-9);
}

const MAX_HISTORIAL = 12; // turnos guardados por número
const SESION_TTL_MS = 6 * 3600 * 1000; // historial más viejo que esto se descarta

export interface NumeroResuelto {
  nombre: string;
  negocios: { id: string; nombre: string }[];
}

/** Busca a qué negocios está autorizado un número (comparando por últimos 9 dígitos). */
export async function resolverNumeroBot(db: DB, numeroRaw: string): Promise<NumeroResuelto | null> {
  const objetivo = normalizarNumero(numeroRaw);
  if (objetivo.length < 8) return null;

  const rows = await db
    .select({ n: botNumbers, bizNombre: businesses.nombre, bizId: businesses.id })
    .from(botNumbers)
    .innerJoin(businesses, eq(businesses.id, botNumbers.businessId));

  const mios = rows.filter((r) => r.n.activo && normalizarNumero(r.n.numero) === objetivo);
  if (!mios.length) return null;

  // Dedup de negocios (por si el mismo número está enlazado dos veces).
  const vistos = new Map<string, { id: string; nombre: string }>();
  for (const r of mios) vistos.set(r.bizId, { id: r.bizId, nombre: r.bizNombre });
  return { nombre: mios[0]!.n.nombre || '', negocios: [...vistos.values()] };
}

function buildSystem(opts: {
  nombre: string;
  negocioActivo: { id: string; nombre: string; timezone: string };
  negocios: { id: string; nombre: string }[];
  empleados: { id: string; codigo: string; nombre: string }[];
  hoy: string;
}): string {
  const listaNegocios = opts.negocios.map((b) => `- ${b.nombre} (id=${b.id})${b.id === opts.negocioActivo.id ? ' ← ACTIVO' : ''}`).join('\n');
  const listaEmpleados = opts.empleados.length
    ? opts.empleados.map((e) => `- ${e.nombre} (código ${e.codigo}, id=${e.id})`).join('\n')
    : '(sin empleados activos)';

  return `Eres el asistente de WhatsApp de la Plataforma de Asistencia (empresa Mate AI). Hablas con ${opts.nombre || 'el dueño del negocio'}, dueño/administrador autorizado.

HOY es ${fechaDisplay(opts.hoy)} (${opts.hoy}). Moneda: dólares (USD).

NEGOCIO ACTIVO: ${opts.negocioActivo.nombre}
Negocios autorizados para este número:
${listaNegocios}

EMPLEADOS del negocio activo (usa el id exacto en las herramientas):
${listaEmpleados}

ALCANCE (estricto): SOLO puedes registrar anticipos de sueldo, registrar multas manuales, consultarlos y eliminarlos (deshacer). Todo lo demás (asistencia, nómina completa, horarios, empleados nuevos, configuración) se hace en el panel web — dilo amablemente y no lo intentes.

REGLAS:
- Si el nombre que dan no coincide claramente con UN empleado de la lista, pregunta antes de registrar (nunca adivines entre dos parecidos).
- "Deshacer", "retractar", "elimina la multa/anticipo de X": usa listar_descuentos para ubicar el registro exacto (el más reciente que coincida) y elimínalo con eliminar_descuento. Si hay varios candidatos, pregunta cuál.
- Después de registrar o eliminar, confirma con empleado, tipo, monto y fecha. Menciona que puede responder "deshacer" si se equivocó.
- Los montos deben ser > 0. Si no dan monto, pregúntalo. No inventes fechas: sin fecha = hoy.
- Responde SIEMPRE en español, corto y claro, estilo WhatsApp (puedes usar *negritas* y emojis con moderación). Nada de párrafos largos.
- Nunca reveles ids internos (uuid) al usuario; úsalos solo dentro de las herramientas.
- Si el usuario menciona otro de sus negocios autorizados, usa cambiar_negocio primero.`;
}

export interface ProcesarResultado {
  respuesta: string | null; // null = número no autorizado (se ignora en silencio)
}

/**
 * Procesa un mensaje entrante del webhook y devuelve la respuesta a enviar.
 * `enviar` está separado para poder probar esta función sin red.
 */
export async function procesarMensajeBot(db: DB, numeroRaw: string, texto: string): Promise<ProcesarResultado> {
  const auth = await resolverNumeroBot(db, numeroRaw);
  if (!auth) return { respuesta: null }; // número desconocido: ni responder (evita spam)

  if (!iaConfigurada()) {
    return {
      respuesta:
        '🤖 El asistente todavía no está activo (falta configurar la IA en el servidor). Avisa al administrador de Mate AI.',
    };
  }

  const numero = normalizarNumero(numeroRaw);

  // Sesión: negocio activo + historial corto (con TTL).
  let session = (await db.select().from(botSessions).where(eq(botSessions.numero, numero)).limit(1))[0];
  const vencida = session && Date.now() - new Date(session.updatedAt).getTime() > SESION_TTL_MS;
  const negocioValido = session && auth.negocios.some((b) => b.id === session!.businessId);
  const businessId = (!vencida && negocioValido && session!.businessId) || auth.negocios[0]!.id;
  const historial = session && !vencida ? session.historial : [];

  const biz = (await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1))[0]!;
  const emps = await db
    .select({ id: employees.id, codigo: employees.codigo, nombre: employees.nombre, estado: employees.estado })
    .from(employees)
    .where(
      inArray(
        employees.businessId,
        [businessId], // solo el activo: el roster de otros negocios se carga al cambiar
      ),
    );
  const activos = emps.filter((e) => e.estado === 'ACTIVO').map(({ id, codigo, nombre }) => ({ id, codigo, nombre }));

  const hoy = businessDate(new Date(), biz.timezone, 0);
  const ctx: BotToolCtx = {
    db,
    businessId,
    negociosPermitidos: auth.negocios,
    actorNombre: `Bot WhatsApp · ${auth.nombre || numero}`,
  };

  let respuesta: string;
  try {
    respuesta = await correrIA({
      system: buildSystem({
        nombre: auth.nombre,
        negocioActivo: { id: biz.id, nombre: biz.nombre, timezone: biz.timezone },
        negocios: auth.negocios,
        empleados: activos,
        hoy,
      }),
      historial,
      mensaje: texto,
      tools: BOT_TOOLS as never,
      ejecutar: (name, input) => ejecutarBotTool(ctx, name, input, hoy),
    });
  } catch (e) {
    respuesta = '⚠️ No pude procesar tu mensaje ahora mismo. Intenta de nuevo en un momento.';
  }

  // Guarda la sesión (negocio activo puede haber cambiado vía cambiar_negocio).
  const nuevoHistorial = [...historial, { role: 'user' as const, content: texto }, { role: 'assistant' as const, content: respuesta }].slice(
    -MAX_HISTORIAL,
  );
  await db
    .insert(botSessions)
    .values({ numero, businessId: ctx.businessId, historial: nuevoHistorial, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: botSessions.numero,
      set: { businessId: ctx.businessId, historial: nuevoHistorial, updatedAt: new Date() },
    });

  return { respuesta };
}

/** Procesa y responde por WhatsApp (fire-and-forget desde el webhook). */
export async function atenderMensajeBot(db: DB, remoteJid: string, texto: string): Promise<void> {
  const r = await procesarMensajeBot(db, remoteJid, texto);
  if (r.respuesta) await enviarTextoBot(remoteJid, r.respuesta);
}
