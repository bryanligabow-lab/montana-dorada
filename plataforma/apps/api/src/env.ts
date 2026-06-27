// Carga variables de .env si existe (en EasyPanel vienen del entorno del servicio).
try {
  process.loadEnvFile();
} catch {
  // sin archivo .env: se usan las variables del proceso
}

function list(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = {
  port: Number(process.env.PORT ?? 8080),
  nodeEnv,
  isProd: nodeEnv === 'production',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-cambia-esto-en-produccion',
  /** Si está vacío se usa PGlite embebido (desarrollo sin Docker). */
  databaseUrl: process.env.DATABASE_URL ?? '',
  pgliteDir: process.env.PGLITE_DIR ?? '.pglite',
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
  },
  mailFrom: process.env.MAIL_FROM ?? 'Asistencia <no-reply@localhost>',
  reportEmails: list(process.env.REPORT_EMAILS),
  evolution: {
    url: process.env.EVOLUTION_URL ?? '',
    key: process.env.EVOLUTION_KEY ?? '',
    instance: process.env.EVOLUTION_INSTANCE ?? '',
    /** JID del grupo de WhatsApp destino (…@g.us) o número. */
    group: process.env.WHATSAPP_GROUP ?? '',
  },
};
