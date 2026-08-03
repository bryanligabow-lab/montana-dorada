import { and, desc, eq, gte, lte } from 'drizzle-orm';
import type { DB } from '../db';
import { advances, employees } from '../db/schema';
import { writeAudit } from '../lib/audit';
import { fechaDisplay } from '../core/time';

/**
 * Herramientas que el chatbot puede ejecutar. Son el LÍMITE DURO de lo que la IA puede
 * hacer en el sistema: solo anticipos y multas manuales (registrar, consultar, eliminar)
 * y cambiar el negocio activo. Todo queda en la auditoría con el número que lo pidió.
 */

const MONTO_MAXIMO = 10000; // tope de seguridad por registro ($)

/** Definiciones para la API de Anthropic (JSON Schema). */
export const BOT_TOOLS = [
  {
    name: 'registrar_descuento',
    description:
      'Registra un ANTICIPO de sueldo o una MULTA manual a un empleado del negocio activo. El monto se descuenta de su nómina en el período de la fecha. Usa el employeeId exacto de la lista de empleados del sistema.',
    input_schema: {
      type: 'object' as const,
      properties: {
        employeeId: { type: 'string', description: 'ID (uuid) del empleado, tomado de la lista de empleados.' },
        tipo: { type: 'string', enum: ['ANTICIPO', 'MULTA'], description: 'ANTICIPO = adelanto de sueldo. MULTA = sanción manual.' },
        monto: { type: 'number', description: 'Monto en dólares, mayor a 0.' },
        nota: { type: 'string', description: 'Motivo o nota corta (opcional).' },
        fecha: { type: 'string', description: "Fecha 'yyyy-MM-dd' del descuento. Si no se indica, usa la fecha de hoy." },
      },
      required: ['employeeId', 'tipo', 'monto'],
    },
  },
  {
    name: 'listar_descuentos',
    description:
      'Lista los anticipos y multas manuales registrados en el negocio activo (con su id, fecha, tipo, monto, nota y empleado). Úsalo para consultar totales, o para encontrar el registro exacto antes de eliminar/deshacer uno.',
    input_schema: {
      type: 'object' as const,
      properties: {
        desde: { type: 'string', description: "Fecha inicial 'yyyy-MM-dd' (opcional; por defecto últimos 45 días)." },
        hasta: { type: 'string', description: "Fecha final 'yyyy-MM-dd' (opcional)." },
        employeeId: { type: 'string', description: 'Filtrar por un empleado (opcional).' },
        tipo: { type: 'string', enum: ['ANTICIPO', 'MULTA'], description: 'Filtrar por tipo (opcional).' },
      },
      required: [],
    },
  },
  {
    name: 'eliminar_descuento',
    description:
      'Elimina (retracta) un anticipo o multa manual por su id. Sirve para deshacer un registro equivocado o quitar una multa. Busca antes el id con listar_descuentos si no lo tienes.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'ID (uuid) del registro a eliminar, tomado de listar_descuentos.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'cambiar_negocio',
    description:
      'Cambia el negocio activo de esta conversación (solo entre los negocios autorizados para este número). Úsalo cuando el usuario mencione otro de sus negocios.',
    input_schema: {
      type: 'object' as const,
      properties: {
        businessId: { type: 'string', description: 'ID (uuid) del negocio, tomado de la lista de negocios autorizados.' },
      },
      required: ['businessId'],
    },
  },
];

export interface BotToolCtx {
  db: DB;
  /** Negocio activo de la conversación (mutable: cambiar_negocio lo actualiza). */
  businessId: string;
  /** Negocios a los que este número tiene acceso. */
  negociosPermitidos: { id: string; nombre: string }[];
  /** Para la auditoría: "Bot WhatsApp · <nombre> (<numero>)". */
  actorNombre: string;
}

const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
const money = (n: number): string => `$${n.toFixed(2)}`;

/** Ejecuta una herramienta del bot. Devuelve SIEMPRE un string (el resultado que ve la IA). */
export async function ejecutarBotTool(
  ctx: BotToolCtx,
  name: string,
  input: Record<string, unknown>,
  hoy: string,
): Promise<string> {
  const { db } = ctx;

  if (name === 'cambiar_negocio') {
    const target = ctx.negociosPermitidos.find((b) => b.id === input.businessId);
    if (!target) return 'Error: ese negocio no está autorizado para este número.';
    ctx.businessId = target.id;
    return `Negocio activo cambiado a: ${target.nombre}. Recuerda: la lista de empleados del sistema corresponde al negocio anterior; pide al usuario confirmar el nombre del empleado si vas a registrar algo aquí, y usa listar_descuentos para consultar.`;
  }

  if (name === 'registrar_descuento') {
    const employeeId = String(input.employeeId ?? '');
    const tipo = input.tipo === 'MULTA' ? 'MULTA' : input.tipo === 'ANTICIPO' ? 'ANTICIPO' : null;
    const monto = Number(input.monto);
    const fecha = typeof input.fecha === 'string' && fechaRegex.test(input.fecha) ? input.fecha : hoy;
    const nota = typeof input.nota === 'string' ? input.nota.slice(0, 200) : null;

    if (!tipo) return 'Error: tipo inválido (debe ser ANTICIPO o MULTA).';
    if (!Number.isFinite(monto) || monto <= 0) return 'Error: el monto debe ser mayor a 0.';
    if (monto > MONTO_MAXIMO) return `Error: el monto supera el máximo permitido por el bot (${money(MONTO_MAXIMO)}). Regístralo desde el panel.`;

    const emp = (
      await db
        .select()
        .from(employees)
        .where(and(eq(employees.id, employeeId), eq(employees.businessId, ctx.businessId)))
        .limit(1)
    )[0];
    if (!emp) return 'Error: empleado no encontrado en el negocio activo. Revisa la lista de empleados.';

    const [row] = await db
      .insert(advances)
      .values({ businessId: ctx.businessId, employeeId: emp.id, tipo, fecha, monto, nota })
      .returning();
    await writeAudit(db, {
      businessId: ctx.businessId,
      actorNombre: ctx.actorNombre,
      accion: 'create',
      entidad: tipo === 'MULTA' ? 'multa_manual' : 'advance',
      entidadId: row!.id,
      detalle: { via: 'whatsapp_bot', empleado: emp.nombre, tipo, monto, fecha, nota },
    });
    return `OK. ${tipo === 'MULTA' ? 'Multa' : 'Anticipo'} registrado: ${emp.nombre} — ${money(monto)} — ${fechaDisplay(fecha)}${nota ? ` — "${nota}"` : ''}. id=${row!.id}. Se descontará en su nómina.`;
  }

  if (name === 'listar_descuentos') {
    const desde =
      typeof input.desde === 'string' && fechaRegex.test(input.desde)
        ? input.desde
        : new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
    const hasta = typeof input.hasta === 'string' && fechaRegex.test(input.hasta) ? input.hasta : '9999-12-31';

    const conds = [eq(advances.businessId, ctx.businessId), gte(advances.fecha, desde), lte(advances.fecha, hasta)];
    if (typeof input.employeeId === 'string' && input.employeeId) conds.push(eq(advances.employeeId, input.employeeId));
    if (input.tipo === 'ANTICIPO' || input.tipo === 'MULTA') conds.push(eq(advances.tipo, input.tipo));

    const rows = await db
      .select({ a: advances, empNombre: employees.nombre, empCodigo: employees.codigo })
      .from(advances)
      .innerJoin(employees, eq(employees.id, advances.employeeId))
      .where(and(...conds))
      .orderBy(desc(advances.fecha))
      .limit(60);

    if (!rows.length) return `Sin registros entre ${desde} y ${hasta === '9999-12-31' ? 'hoy' : hasta}.`;
    const total = rows.reduce((s, r) => s + r.a.monto, 0);
    const lineas = rows.map(
      (r) =>
        `${r.a.fecha} · ${r.a.tipo} · ${r.empNombre} (${r.empCodigo}) · ${money(r.a.monto)}${r.a.nota ? ` · "${r.a.nota}"` : ''} · id=${r.a.id}`,
    );
    return `${rows.length} registro(s), total ${money(total)}:\n${lineas.join('\n')}`;
  }

  if (name === 'eliminar_descuento') {
    const id = String(input.id ?? '');
    // Solo del negocio activo: un número jamás borra registros de un negocio ajeno.
    const row = (
      await db
        .select({ a: advances, empNombre: employees.nombre })
        .from(advances)
        .innerJoin(employees, eq(employees.id, advances.employeeId))
        .where(and(eq(advances.id, id), eq(advances.businessId, ctx.businessId)))
        .limit(1)
    )[0];
    if (!row) return 'Error: no existe ese registro en el negocio activo (¿id equivocado?). Usa listar_descuentos.';

    await db.delete(advances).where(eq(advances.id, id));
    await writeAudit(db, {
      businessId: ctx.businessId,
      actorNombre: ctx.actorNombre,
      accion: 'delete',
      entidad: row.a.tipo === 'MULTA' ? 'multa_manual' : 'advance',
      entidadId: id,
      detalle: { via: 'whatsapp_bot', empleado: row.empNombre, tipo: row.a.tipo, monto: row.a.monto, fecha: row.a.fecha },
    });
    return `OK. Eliminado: ${row.a.tipo} de ${row.empNombre} por ${money(row.a.monto)} (${fechaDisplay(row.a.fecha)}).`;
  }

  return `Error: herramienta desconocida "${name}".`;
}
