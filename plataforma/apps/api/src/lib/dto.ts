import type { Attendance, AuditLog, Business, Employee, Punctuality } from '@asis/shared';
import type { attendance, auditLog, businesses, employees, punctuality } from '../db/schema';

export function toBusiness(b: typeof businesses.$inferSelect): Business {
  return { ...b, createdAt: b.createdAt.toISOString() };
}

export function toEmployee(e: typeof employees.$inferSelect): Employee {
  return { ...e, createdAt: e.createdAt.toISOString() };
}

export function toAttendance(a: typeof attendance.$inferSelect): Attendance {
  return {
    ...a,
    entradaAt: a.entradaAt ? a.entradaAt.toISOString() : null,
    salidaAt: a.salidaAt ? a.salidaAt.toISOString() : null,
  };
}

export function toPunctuality(p: typeof punctuality.$inferSelect): Punctuality {
  return { ...p, createdAt: p.createdAt.toISOString() };
}

export function toAuditLog(l: typeof auditLog.$inferSelect): AuditLog {
  return { ...l, createdAt: l.createdAt.toISOString() };
}
