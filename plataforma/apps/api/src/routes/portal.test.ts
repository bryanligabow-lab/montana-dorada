import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { NominaRow, PortalSession } from '@asis/shared';
import { getDb, runMigrations, schema } from '../db';
import { buildServer } from '../server';
import { generateQrToken } from '../lib/qr';

let app: FastifyInstance;
let businessId: string;

beforeAll(async () => {
  await runMigrations();
  const db = await getDb();

  const biz = (
    await db
      .insert(schema.businesses)
      .values({ slug: 'portal-test', nombre: 'Portal Test', gpsRequerido: false })
      .returning()
  )[0]!;
  businessId = biz.id;

  const emp = (
    await db
      .insert(schema.employees)
      .values({
        businessId: biz.id,
        codigo: 'PORT1',
        qrToken: generateQrToken(),
        nombre: 'Empleado Portal',
        tipoSueldo: 'DIARIO',
        sueldo: 20,
        pin: '4242',
      })
      .returning()
  )[0]!;

  // Un día trabajado exactamente la jornada (08:00–16:00 = 8h, sin hora extra) → sueldo $20,
  // más un anticipo de $8 en el mismo mes.
  await db.insert(schema.attendance).values({
    businessId: biz.id,
    employeeId: emp.id,
    fecha: '2026-07-06',
    horaEntrada: '08:00:00',
    entradaAt: new Date('2026-07-06T13:00:00Z'),
    horaSalida: '16:00:00',
    salidaAt: new Date('2026-07-06T21:00:00Z'),
    estado: 'A_TIEMPO',
  });
  await db.insert(schema.advances).values({
    businessId: biz.id,
    employeeId: emp.id,
    fecha: '2026-07-10',
    monto: 8,
  });

  app = await buildServer();
});

describe('portal del empleado', () => {
  it('login con código + PIN correctos devuelve token y datos del negocio', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/portal/login',
      payload: { codigo: 'PORT1', pin: '4242' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<PortalSession>();
    expect(body.token).toBeTruthy();
    expect(body.employee.codigo).toBe('PORT1');
    expect(body.business.nombre).toBe('Portal Test');
  });

  it('login con PIN incorrecto es rechazado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/portal/login',
      payload: { codigo: 'PORT1', pin: '0000' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('la nómina del portal descuenta los anticipos del propio empleado', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/portal/login',
      payload: { codigo: 'PORT1', pin: '4242' },
    });
    const { token } = login.json<PortalSession>();
    const res = await app.inject({
      method: 'GET',
      url: '/api/portal/nomina?from=2026-07-01&to=2026-07-31',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const row = res.json<NominaRow>();
    expect(row.sueldoBase).toBe(20);
    expect(row.anticipos).toBe(8);
    expect(row.totalARecibir).toBe(12); // 20 - 8
  });

  it('un token del portal NO sirve para endpoints de admin', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/portal/login',
      payload: { codigo: 'PORT1', pin: '4242' },
    });
    const { token } = login.json<PortalSession>();
    const res = await app.inject({
      method: 'GET',
      url: `/api/admin/businesses/${businessId}/employees`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
