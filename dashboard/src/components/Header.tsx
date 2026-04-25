import type { ReactNode } from 'react';

export function Header({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-6 border-b border-tostado/40 mb-6">
      <div>
        <h1 className="section-title">{title}</h1>
        {subtitle && <p className="text-hueso/50 text-sm mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
