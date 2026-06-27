import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { AttendanceState, EmployeeStatus } from '@asis/shared';
import { getDb } from '../db';
import { attendance, businesses, employees } from '../db/schema';
import { generateQrToken } from '../lib/qr';
import { env } from '../env';

interface ImportEmployee {
  codigo: string;
  nombre?: string;
  sueldo?: number;
  sueldoFds?: number;
  estado?: string;
}

interface ImportAttendance {
  codigo: string;
  fecha: string; // 'yyyy-MM-dd'
  horaEntrada?: string;
  horaSalida?: string;
  horaAlmuerzoSalida?: string;
  horaAlmuerzoRegreso?: string;
  estado?: string;
  minTarde?: number;
  motivo?: string;
  horas?: string;
}

interface ImportBody {
  businessSlug: string;
  employees?: ImportEmployee[];
  attendance?: ImportAttendance[];
}

/**
 * Importación administrativa de empleados e histórico de asistencia.
 * Protegida por el header `x-import-secret` (igual al JWT_SECRET del servicio).
 * Idempotente: no duplica empleados (por código) ni asistencia (por empleado+fecha).
 */
export async function importRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/admin/import', async (req, reply) => {
    if (req.headers['x-import-secret'] !== env.jwtSecret) {
      return reply.code(401).send({ error: 'no_autorizado' });
    }
    const body = req.body as ImportBody;
    if (!body?.businessSlug) return reply.code(400).send({ error: 'falta_businessSlug' });

    const db = await getDb();
    const biz = (
      await db.select().from(businesses).where(eq(businesses.slug, body.businessSlug)).limit(1)
    )[0];
    if (!biz) return reply.code(404).send({ error: 'negocio_no_encontrado' });

    const empleados: { codigo: string; nombre: string; qrToken: string }[] = [];
    for (const e of body.employees ?? []) {
      const codigo = String(e.codigo ?? '').trim();
      if (!codigo) continue;
      let emp = (
        await db
          .select()
          .from(employees)
          .where(and(eq(employees.businessId, biz.id), eq(employees.codigo, codigo)))
          .limit(1)
      )[0];
      if (!emp) {
        emp = (
          await db
            .insert(employees)
            .values({
              businessId: biz.id,
              codigo,
              qrToken: generateQrToken(),
              nombre: String(e.nombre ?? codigo).trim(),
              sueldo: Number(e.sueldo) || 0,
              sueldoFds: Number(e.sueldoFds) || 0,
              estado: (String(e.estado).toUpperCase() === 'INACTIVO'
                ? 'INACTIVO'
                : 'ACTIVO') as EmployeeStatus,
            })
            .returning()
        )[0]!;
      }
      empleados.push({ codigo: emp.codigo, nombre: emp.nombre, qrToken: emp.qrToken });
    }

    let historial = 0;
    for (const a of body.attendance ?? []) {
      const codigo = String(a.codigo ?? '').trim();
      const fecha = String(a.fecha ?? '').trim();
      if (!codigo || !fecha) continue;
      const emp = (
        await db
          .select()
          .from(employees)
          .where(and(eq(employees.businessId, biz.id), eq(employees.codigo, codigo)))
          .limit(1)
      )[0];
      if (!emp) continue;
      const res = await db
        .insert(attendance)
        .values({
          businessId: biz.id,
          employeeId: emp.id,
          fecha,
          horaEntrada: a.horaEntrada ?? null,
          horaSalida: a.horaSalida ?? null,
          horaAlmuerzoSalida: a.horaAlmuerzoSalida ?? null,
          horaAlmuerzoRegreso: a.horaAlmuerzoRegreso ?? null,
          estado: (a.estado as AttendanceState) ?? null,
          minTarde: Number(a.minTarde) || 0,
          motivoTarde: a.motivo ?? null,
          horasTrabajadas: a.horas ?? null,
        })
        .onConflictDoNothing({ target: [attendance.employeeId, attendance.fecha] })
        .returning({ id: attendance.id });
      if (res.length) historial++;
    }

    return { ok: true, empleados, historialInsertado: historial };
  });
}
