import type { ReactNode } from 'react';

export function KpiCard({
  label,
  value,
  hint,
  icon,
  accent = 'dorado',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  accent?: 'dorado' | 'llama' | 'fuego' | 'brasa';
}) {
  const accentClass: Record<string, string> = {
    dorado: 'text-dorado',
    llama: 'text-llama',
    fuego: 'text-fuego',
    brasa: 'text-brasa',
  };
  return (
    <div className="card p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between text-hueso/60 text-xs uppercase tracking-widest font-semibold">
        <span>{label}</span>
        {icon}
      </div>
      <div className={`font-display tracking-wide text-4xl ${accentClass[accent]}`}>
        {value}
      </div>
      {hint ? <div className="text-hueso/50 text-xs">{hint}</div> : null}
    </div>
  );
}
