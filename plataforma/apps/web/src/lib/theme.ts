import type { BusinessBranding } from '@asis/shared';

// Valores base (coinciden con :root en index.css). Se usan si un color viene vacío,
// para que un branding incompleto no deje el sistema con un color en blanco.
const DEFAULTS = { primary: '#43A047', accent: '#E53935', bg: '#0A1A0F', card: '#0F2417' };

export function applyBranding(b: BusinessBranding): void {
  const r = document.documentElement.style;
  r.setProperty('--c-primary', b.primary || DEFAULTS.primary);
  r.setProperty('--c-accent', b.accent || DEFAULTS.accent);
  r.setProperty('--c-bg', b.bg || DEFAULTS.bg);
  r.setProperty('--c-card', b.card || DEFAULTS.card);
}
