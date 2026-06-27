import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card p-4 md:p-5 ${className}`}>{children}</div>;
}

export function Spinner() {
  return <div className="text-muted text-sm p-6 text-center">Cargando…</div>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-black tracking-wide mb-3">{children}</h2>;
}

export function MonthInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="month"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="field px-3 py-2 text-sm"
    />
  );
}

export function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function money(n: number): string {
  return `$${n.toFixed(2)}`;
}
