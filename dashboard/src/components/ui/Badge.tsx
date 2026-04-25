import type { ReactNode } from 'react';

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'gold';
}) {
  const map: Record<string, string> = {
    neutral: 'bg-tostado/40 text-hueso/80',
    ok: 'bg-green-900/40 text-green-300 border border-green-700/40',
    warn: 'bg-llama/20 text-dorado border border-llama/40',
    bad: 'bg-fuego/20 text-fuego border border-fuego/40',
    gold: 'bg-dorado/10 text-dorado border border-dorado/40',
  };
  return <span className={`chip ${map[tone]}`}>{children}</span>;
}
