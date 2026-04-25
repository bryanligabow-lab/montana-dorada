// Configuración de la plataforma.
// ADVERTENCIA: todos los valores en este archivo se compilan al bundle del navegador
// y son visibles en el código fuente servido. No poner secretos reales acá.

export const SHEET_ID = '1iRQzgUAWe7eaVr6hr_BiixMTGTRE4lRMxzET6LZVoiQ';

// Nombres de las tabs del Google Sheet. Usamos el parámetro `sheet=` de gviz
// para no depender de gids numéricos.
export const TABS = {
  empleados: 'EMPLEADOS',
  conf: 'CONF',
  pagos: 'PAGOS',
  descansos: 'DESCANSOS',
  faltas: 'FALTAS',
  extras: 'EXTRAS',
  puntualidad: 'PUNTUALIDAD',
  /** Tab de asistencia del mes en curso (entrada/salida real). */
  asistenciaActual: 'Hoja 1',
  /** Tabs históricas mensuales. Agregar nuevos meses al inicio. */
  asistenciaMeses: ['MAR 2026', 'FEB 2026', 'ENE 2026'],
} as const;

export const BRAND = {
  name: 'Montaña Dorada',
  tagline: 'Lo mejor en asados & mariscos',
};

// ─── Permisos ──────────────────────────────────────────────────────────────
// Los usuarios, roles y permisos se leen de la tab CONF del Sheet.
// Cada fila de CONF debe tener las columnas:
//   key | rol | nombre | numero | nota | username | password | permisos
//
// Formato de permisos: lista separada por comas. Soporta:
//   "*"                    = admin total
//   "read"                 = ver todas las secciones
//   "pago.*"               = CRUD de pagos
//   "descanso.*"           = CRUD de descansos
//   "falta.*"              = CRUD de faltas
//   "extra.*"              = CRUD de extras
//   "notify.reminder"      = mandar WhatsApp recordatorio a Dani
//   "notify.informe"       = mandar WhatsApp informe final a Javier

/** Chequea si una lista de permisos cubre una acción. */
export function matchPermission(permisos: readonly string[], action: string): boolean {
  return permisos.some((p) => {
    if (p === '*') return true;
    if (p === action) return true;
    if (p.endsWith('.*')) {
      const prefix = p.slice(0, -1);
      return action.startsWith(prefix);
    }
    return false;
  });
}

// ─── Backend Apps Script ──────────────────────────────────────────────────

// URL del Web App publicado (ver apps-script/README.md). Hasta que se deploye,
// el dashboard muestra los botones deshabilitados con el motivo.
export const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwJ-AYsq1b98rzb8beeImEMbEqch2D9jrK1o4UusmTuY88i98qFfXx1Cf4B8kU1yPpc/exec';

// Shared secret. Cambiar junto con el de Code.gs.
export const API_SECRET = 'e21bb278877ea9a7888ec61f29e7d901';

export function isBackendConfigured(): boolean {
  return (
    APPS_SCRIPT_URL.indexOf('PEGAR_URL_AQUI') < 0 &&
    (API_SECRET as string) !== 'CAMBIAR_ESTE_VALOR'
  );
}
