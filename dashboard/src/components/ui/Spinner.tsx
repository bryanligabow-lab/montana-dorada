export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-dorado/30 border-t-dorado"
      style={{ width: size, height: size }}
      aria-label="Cargando"
    />
  );
}
