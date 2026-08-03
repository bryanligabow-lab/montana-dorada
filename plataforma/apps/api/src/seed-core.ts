import { eq, isNull, or } from 'drizzle-orm';
import { getDb } from './db';
import { businesses, employees, users } from './db/schema';
import { hashPassword } from './lib/auth';
import { generateQrToken } from './lib/qr';
import { generate4DigitPin } from './lib/pin';
import type { BusinessBranding, WeekSchedule } from '@asis/shared';

interface SeedBiz {
  slug: string;
  nombre: string;
  lat: number | null;
  lng: number | null;
  radioMetros: number;
  horarios: WeekSchedule;
  multaMonto: number;
  multaIntervaloMin: number;
  gpsRequerido: boolean;
  branding: BusinessBranding;
  reportEmails: string[];
  ejemploCodigo: string;
  ejemploNombre: string;
}

const todosLosDias = (hora: string): WeekSchedule => ({
  lunes: hora,
  martes: hora,
  miercoles: hora,
  jueves: hora,
  viernes: hora,
  sabado: hora,
  domingo: hora,
});

const SEED: SeedBiz[] = [
  {
    slug: 'ginitafruits',
    nombre: 'Comisariato GinitaFruits',
    lat: -3.677506,
    lng: -79.687398,
    radioMetros: 80,
    horarios: todosLosDias('08:00:00'),
    multaMonto: 0.1,
    multaIntervaloMin: 1,
    gpsRequerido: true,
    branding: { primary: '#43A047', accent: '#E53935', bg: '#0A1A0F', card: '#0F2417' },
    reportEmails: ['ginaapolo91@gmail.com', 'bryanligabow@gmail.com', 'javiercarrion591@gmail.com'],
    ejemploCodigo: 'GF-001',
    ejemploNombre: 'Empleado Ejemplo GF',
  },
  {
    slug: 'montana-dorada',
    nombre: 'Montaña Dorada',
    lat: null,
    lng: null,
    radioMetros: 150,
    horarios: {
      ...todosLosDias('11:05:00'),
      sabado: '10:35:00',
      domingo: '10:35:00',
    },
    multaMonto: 0.1,
    multaIntervaloMin: 1,
    gpsRequerido: false,
    branding: { primary: '#F57C00', accent: '#FFB347', bg: '#0A0A0A', card: '#1A0F0A' },
    reportEmails: ['bryanligabow@gmail.com'],
    ejemploCodigo: 'MD-001',
    ejemploNombre: 'Empleado Ejemplo MD',
  },
];

/** Crea los negocios, empleados de ejemplo y el usuario OWNER. Idempotente. */
export async function runSeed(): Promise<void> {
  const db = await getDb();

  const ownerEmail = (process.env.SEED_OWNER_EMAIL ?? 'owner@asis.local').toLowerCase();
  const ownerPass = process.env.SEED_OWNER_PASSWORD ?? 'cambia1234';

  const businessIds: string[] = [];

  for (const s of SEED) {
    let biz = (await db.select().from(businesses).where(eq(businesses.slug, s.slug)).limit(1))[0];
    if (!biz) {
      [biz] = await db
        .insert(businesses)
        .values({
          slug: s.slug,
          nombre: s.nombre,
          lat: s.lat,
          lng: s.lng,
          radioMetros: s.radioMetros,
          horarios: s.horarios,
          multaMonto: s.multaMonto,
          multaIntervaloMin: s.multaIntervaloMin,
          gpsRequerido: s.gpsRequerido,
          branding: s.branding,
          reportEmails: s.reportEmails,
        })
        .returning();
      console.log(`✓ Negocio creado: ${s.nombre}`);
    }
    businessIds.push(biz!.id);

    let emp = (
      await db.select().from(employees).where(eq(employees.codigo, s.ejemploCodigo)).limit(1)
    )[0];
    if (!emp) {
      emp = (
        await db
          .insert(employees)
          .values({
            businessId: biz!.id,
            codigo: s.ejemploCodigo,
            qrToken: generateQrToken(),
            nombre: s.ejemploNombre,
          })
          .returning()
      )[0]!;
      console.log(`  · ${s.ejemploCodigo} (${s.ejemploNombre}) — QR token: ${emp.qrToken}`);
    }
  }

  // Backfill: cualquier empleado sin PIN recibe uno de 4 dígitos (para el portal del empleado).
  const sinPin = await db
    .select({ id: employees.id })
    .from(employees)
    .where(or(isNull(employees.pin), eq(employees.pin, '')));
  for (const e of sinPin) {
    await db.update(employees).set({ pin: generate4DigitPin() }).where(eq(employees.id, e.id));
  }
  if (sinPin.length) console.log(`✓ PIN asignado a ${sinPin.length} empleado(s) sin PIN`);

  const owner = (await db.select().from(users).where(eq(users.email, ownerEmail)).limit(1))[0];
  if (!owner) {
    await db.insert(users).values({
      email: ownerEmail,
      nombre: 'Dueño',
      passwordHash: await hashPassword(ownerPass),
      rol: 'OWNER',
      businessIds,
    });
    console.log(`✓ Usuario OWNER creado: ${ownerEmail} / ${ownerPass}`);
  }

  console.log('✓ Seed completo');
}
