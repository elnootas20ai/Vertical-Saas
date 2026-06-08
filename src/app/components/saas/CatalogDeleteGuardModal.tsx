import { useState, useEffect, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

/** Expuesto en el bundle del cliente: solo evita borrados accidentales, no seguridad fuerte. */
const PIN_FROM_ENV = String(import.meta.env.VITE_CATALOG_DELETE_PIN ?? '').trim();

const BULK_PHRASE_NO_PIN = 'BORRADO MASIVO';

export type CatalogDeleteGuardPayload =
  | { mode: 'single'; itemName: string }
  | { mode: 'bulk'; count: number };

function normalizePhrase(s: string) {
  return s.trim().replace(/\s+/g, ' ');
}

interface CatalogDeleteGuardModalProps {
  open: boolean;
  payload: CatalogDeleteGuardPayload | null;
  onClose: () => void;
  /** Llamado solo tras validar PIN o frase */
  onVerified: () => void;
}

export function CatalogDeleteGuardModal({
  open,
  payload,
  onClose,
  onVerified,
}: CatalogDeleteGuardModalProps) {
  const [pin, setPin] = useState('');
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);

  useModalClose(open, onClose);

  useEffect(() => {
    if (open) {
      setPin('');
      setPhrase('');
      setError(null);
    }
  }, [open, payload]);

  if (!open || !payload) return null;

  const pinConfigured = PIN_FROM_ENV.length > 0;
  const canSubmit = pinConfigured ? pin.length > 0 : phrase.trim().length > 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (pinConfigured) {
      if (pin !== PIN_FROM_ENV) {
        setError('PIN incorrecto');
        return;
      }
    } else if (payload.mode === 'single') {
      if (normalizePhrase(phrase) !== normalizePhrase(payload.itemName)) {
        setError('El texto no coincide con el nombre del producto');
        return;
      }
    } else if (normalizePhrase(phrase).toUpperCase() !== BULK_PHRASE_NO_PIN) {
      setError(`Escribe exactamente: ${BULK_PHRASE_NO_PIN}`);
      return;
    }

    onVerified();
    onClose();
  };

  const inp =
    'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-red-500 focus:outline-none text-sm';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md w-full border-2 border-red-200 dark:border-red-900/50 p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-delete-guard-title"
      >
        <div className="flex justify-between items-start gap-3 mb-3">
          <h3 id="catalog-delete-guard-title" className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Confirmar eliminación
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {payload.mode === 'single' ? (
            <>
              Vas a eliminar <strong className="text-gray-900 dark:text-gray-100">{payload.itemName}</strong>. Esta acción
              no se puede deshacer.
            </>
          ) : (
            <>
              Vas a eliminar <strong className="text-gray-900 dark:text-gray-100">{payload.count}</strong> artículo
              {payload.count !== 1 ? 's' : ''} seleccionado{payload.count !== 1 ? 's' : ''}.
            </>
          )}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {pinConfigured ? (
            <div>
              <label htmlFor="catalog-delete-pin" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                PIN de seguridad
              </label>
              <input
                id="catalog-delete-pin"
                type="password"
                autoComplete="new-password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className={inp}
                placeholder="Introduce el PIN"
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
                Configurado en el entorno del frontend (<code className="text-[10px]">VITE_CATALOG_DELETE_PIN</code>). Sirve
                contra pulsaciones accidentales.
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="catalog-delete-phrase" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                {payload.mode === 'single'
                  ? 'Escribe el nombre exacto del producto'
                  : `Escribe la frase: ${BULK_PHRASE_NO_PIN}`}
              </label>
              <input
                id="catalog-delete-phrase"
                type="text"
                autoComplete="off"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                className={inp}
                placeholder={payload.mode === 'single' ? payload.itemName : BULK_PHRASE_NO_PIN}
              />
            </div>
          )}

          {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold"
            >
              Eliminar definitivamente
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
