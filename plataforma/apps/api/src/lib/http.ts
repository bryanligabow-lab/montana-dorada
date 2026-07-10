import type { FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { businesses } from '../db/schema';

export async function allBusinessIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select({ id: businesses.id }).from(businesses);
  return rows.map((r) => r.id);
}

export async function accessibleIds(req: FastifyRequest): Promise<string[]> {
  const u = req.user;
  if (u.rol === 'OWNER') return allBusinessIds();
  return u.businessIds ?? [];
}

export async function canAccess(req: FastifyRequest, businessId: string): Promise<boolean> {
  const ids = await accessibleIds(req);
  if (!ids.includes(businessId)) return false;
  if (req.user.rol === 'OWNER') return true;
  // Un ADMIN no accede a un negocio suspendido; el OWNER siempre puede (para gestionarlo).
  const db = await getDb();
  const b = (
    await db.select({ activo: businesses.activo }).from(businesses).where(eq(businesses.id, businessId)).limit(1)
  )[0];
  return !!b?.activo;
}

export interface DateRange {
  from: string;
  to: string;
}

/** Interpreta ?date= / ?month=yyyy-MM / ?from=&to= a un rango de fechas 'yyyy-MM-dd'. */
export function parseDateRange(q: Record<string, unknown>): DateRange {
  if (q.date) return { from: String(q.date), to: String(q.date) };
  if (q.month) {
    const m = String(q.month);
    return { from: `${m}-01`, to: `${m}-31` };
  }
  if (q.from && q.to) return { from: String(q.from), to: String(q.to) };
  return { from: '0000-01-01', to: '9999-12-31' };
}
