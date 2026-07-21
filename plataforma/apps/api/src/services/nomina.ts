import { and, eq, gte, lte } from 'drizzle-orm';
import type { NominaRow } from '@asis/shared';
import type { DB } from '../db';
import { advances, attendance, businesses, employees, punctuality } from '../db/schema';
import { calcularNominaEmpleado } from '../core/payroll';

type Biz = typeof businesses.$inferSelect;
type Emp = typeof employees.$inferSelect;

export interface NominaNegocio {
  biz: Biz;
  empleados: Emp[];
  /** Fila de nómina por empleado, en el mismo orden que `empleados`. */
  filas: NominaRow[];
}

/**
 * Calcula la nómina de todos los empleados de un negocio en un rango.
 * Fuente única de verdad usada por el endpoint del panel y por el envío de informes.
 */
export async function calcularNominaNegocio(
  db: DB,
  bizId: string,
  from: string,
  to: string,
): Promise<NominaNegocio | null> {
  const biz = (await db.select().from(businesses).where(eq(businesses.id, bizId)).limit(1))[0];
  if (!biz) return null;

  const emps = await db.select().from(employees).where(eq(employees.businessId, bizId));
  const attRows = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.businessId, bizId), gte(attendance.fecha, from), lte(attendance.fecha, to)));
  const puntRows = await db
    .select()
    .from(punctuality)
    .where(and(eq(punctuality.businessId, bizId), gte(punctuality.fecha, from), lte(punctuality.fecha, to)));
  const advRows = await db
    .select()
    .from(advances)
    .where(and(eq(advances.businessId, bizId), gte(advances.fecha, from), lte(advances.fecha, to)));

  const attByEmp = new Map<string, typeof attRows>();
  for (const a of attRows) attByEmp.set(a.employeeId, [...(attByEmp.get(a.employeeId) ?? []), a]);
  const puntByEmp = new Map<string, typeof puntRows>();
  for (const p of puntRows) puntByEmp.set(p.employeeId, [...(puntByEmp.get(p.employeeId) ?? []), p]);
  const advByEmp = new Map<string, typeof advRows>();
  for (const a of advRows) advByEmp.set(a.employeeId, [...(advByEmp.get(a.employeeId) ?? []), a]);

  const filas = emps.map((e) =>
    calcularNominaEmpleado(
      e,
      biz,
      attByEmp.get(e.id) ?? [],
      puntByEmp.get(e.id) ?? [],
      from,
      to,
      advByEmp.get(e.id) ?? [],
    ),
  );

  return { biz, empleados: emps, filas };
}
