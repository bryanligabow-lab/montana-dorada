import { Modal } from './Modal';

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Eliminar',
  onConfirm,
  onClose,
  loading = false,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-md">
      <p className="text-hueso/80 text-sm">{message}</p>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>
          Cancelar
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded-lg bg-fuego text-white font-semibold hover:brightness-110 disabled:opacity-50"
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? 'Eliminando…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
