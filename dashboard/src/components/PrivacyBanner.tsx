import { useState } from 'react';

const KEY = 'md_privacy_dismissed';

export function PrivacyBanner() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  return (
    <div className="card border-llama/40 p-3 flex items-start gap-3 text-sm">
      <span className="text-llama">⚠</span>
      <div className="flex-1 text-hueso/80">
        El Google Sheet origen es <strong className="text-hueso">público con link</strong>. La
        contraseña protege esta interfaz, no los datos. Para más seguridad, restringí el Sheet a
        usuarios específicos (afectará la carga de datos) o migrá la fuente a un backend privado.
      </div>
      <button
        type="button"
        className="text-hueso/50 hover:text-hueso px-2"
        onClick={() => {
          try {
            sessionStorage.setItem(KEY, '1');
          } catch { /* ignore */ }
          setDismissed(true);
        }}
        aria-label="Ocultar aviso"
      >
        ✕
      </button>
    </div>
  );
}
