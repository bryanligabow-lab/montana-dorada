import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DescansoTipo } from './types';

export function fmtDate(d: Date | null | undefined, pattern = 'dd/MM/yyyy'): string {
  if (!d) return '—';
  return format(d, pattern, { locale: es });
}

export function fmtMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function fmtDow(d: Date): string {
  return format(d, 'EEE', { locale: es }).replace('.', '');
}

export const descansoColor: Record<DescansoTipo, string> = {
  PLANIFICADO: 'bg-dorado/90 text-bgDeep',
  VACACIONES: 'bg-doradoBrillo text-bgDeep',
  PERMISO: 'bg-llama text-hueso',
  ENFERMEDAD: 'bg-fuego text-hueso',
};

export const descansoLabel: Record<DescansoTipo, string> = {
  PLANIFICADO: 'Planificado',
  VACACIONES: 'Vacaciones',
  PERMISO: 'Permiso',
  ENFERMEDAD: 'Enfermedad',
};
