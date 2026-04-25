import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="card p-10 flex flex-col items-center justify-center text-center gap-3">
      {icon ? <div className="text-3xl">{icon}</div> : null}
      <div className="font-display text-2xl text-hueso">{title}</div>
      {description ? <div className="text-hueso/60 text-sm max-w-md">{description}</div> : null}
    </div>
  );
}
