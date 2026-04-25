export function ErrorView({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="card p-6 border-fuego/40">
      <div className="font-display text-2xl text-fuego mb-2">Error al cargar datos</div>
      <div className="text-hueso/70 text-sm font-mono break-all">{msg}</div>
      <div className="text-hueso/50 text-xs mt-3">
        Verificá que el Google Sheet siga siendo público con link y que los nombres de tabs en{' '}
        <code className="text-dorado">src/lib/config.ts</code> coincidan con los del Sheet.
      </div>
    </div>
  );
}
