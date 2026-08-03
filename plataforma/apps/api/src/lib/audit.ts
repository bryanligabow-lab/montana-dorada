import type { DB } from '../db';
import { auditLog } from '../db/schema';

export interface AuditEntry {
  businessId?: string | null;
  userId?: string | null;
  actorNombre: string;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  detalle?: unknown;
}

export async function writeAudit(db: DB, e: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    businessId: e.businessId ?? null,
    userId: e.userId ?? null,
    actorNombre: e.actorNombre,
    accion: e.accion,
    entidad: e.entidad,
    entidadId: e.entidadId ?? null,
    detalle: e.detalle ?? null,
  });
}
