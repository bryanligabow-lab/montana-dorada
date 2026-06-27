import type { BusinessBranding } from '@asis/shared';

export function applyBranding(b: BusinessBranding): void {
  const r = document.documentElement.style;
  r.setProperty('--c-primary', b.primary);
  r.setProperty('--c-accent', b.accent);
  r.setProperty('--c-bg', b.bg);
  r.setProperty('--c-card', b.card);
}
