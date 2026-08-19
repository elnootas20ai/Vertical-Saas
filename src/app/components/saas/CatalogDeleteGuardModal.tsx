import { useState, useEffect, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

/** Expuesto en el bundle del cliente: solo evita borrados accidentales, no seguridad fuerte. */
const PIN_FROM_ENV = String(import.meta.env.VITE_CATALOG_DELETE_PIN ?? '').trim();

const BULK_PHRASE_NO_PIN = 'BORRADO MASIVO';

export type CatalogDeleteGuardPayload =
  | {
      mode: 'single';
      itemName: string;
      /** Borrado de Carta (venta). */
      kind?: 'carta' | 'generic';
      /** Si true, este producto de carta también controla stock / Almacén. */
      alsoAffectsWarehouse?: boolean;
    }
  | {
      mode: 'bulk';
      count: number;
      organizerLabel?: string;
      confirmPhrase?: string;
      /** Borrado de Carta (venta). Si no se indica, texto genérico (p. ej. CRM). */
      kind?: 'carta' | 'generic';
      /** Productos de carta que también salen en Almacén. */
      warehouseOverlapCount?: number;
      cartaOnlyCount?: number;
    };

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
  const bulkPhrase =
    payload.mode === 'bulk' && payload.confirmPhrase?.trim()
      ? payload.confirmPhrase.trim().toUpperCase()
      : BULK_PHRASE_NO_PIN;

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
    } else if (normalizePhrase(phrase).toUpperCase() !== bulkPhrase) {
      setError(`Escribe exactamente: ${bulkPhrase}`);
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

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          {payload.mode === 'single' ? (
            payload.kind === 'carta' ? (
              <>
                Vas a eliminar de la <strong className="text-gray-900 dark:text-gray-100">Carta</strong>{' '}
                <strong className="text-gray-900 dark:text-gray-100">{payload.itemName}</strong>. Esta acción
                no se puede deshacer.
              </>
            ) : (
              <>
                Vas a eliminar <strong className="text-gray-900 dark:text-gray-100">{payload.itemName}</strong>. Esta acción
                no se puede deshacer.
              </>
            )
          ) : payload.organizerLabel ? (
            payload.kind === 'carta' ? (
              <>
                Vas a eliminar de la <strong className="text-gray-900 dark:text-gray-100">Carta</strong> el
                organizador{' '}
                <strong className="text-gray-900 dark:text-gray-100">«{payload.organizerLabel}»</strong> y sus{' '}
                <strong className="text-gray-900 dark:text-gray-100">{payload.count}</strong> producto
                {payload.count !== 1 ? 's' : ''}. Esta acción no se puede deshacer.
              </>
            ) : (
              <>
                Vas a eliminar el organizador{' '}
                <strong className="text-gray-900 dark:text-gray-100">«{payload.organizerLabel}»</strong> y sus{' '}
                <strong className="text-gray-900 dark:text-gray-100">{payload.count}</strong> producto
                {payload.count !== 1 ? 's' : ''}. Esta acción no se puede deshacer.
              </>
            )
          ) : payload.kind === 'carta' ? (
            <>
              Vas a eliminar de la <strong className="text-gray-900 dark:text-gray-100">Carta</strong>{' '}
              <strong className="text-gray-900 dark:text-gray-100">{payload.count}</strong> producto
              {payload.count !== 1 ? 's' : ''} de venta. Esto <strong>no</strong> es el borrado del Almacén
              (artículos de stock puro).
            </>
          ) : (
            <>
              Vas a eliminar <strong className="text-gray-900 dark:text-gray-100">{payload.count}</strong> artículo
              {payload.count !== 1 ? 's' : ''} seleccionado{payload.count !== 1 ? 's' : ''}.
            </>
          )}
        </p>

        {payload.mode === 'single' && payload.kind === 'carta' && payload.alsoAffectsWarehouse ? (
          <div className="mb-4 rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
            Este producto también controla stock: al borrarlo <strong>saldrá del Almacén</strong> (mismo
            documento).
          </div>
        ) : null}

        {payload.mode === 'bulk' && payload.kind === 'carta' && (payload.warehouseOverlapCount || 0) > 0 ? (
          <div className="mb-4 rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
            <p className="font-semibold">Carta ≠ Almacén puro</p>
            <p className="mt-1 text-xs leading-relaxed">
              {payload.warehouseOverlapCount} de {payload.count} también controlan stock / aparecen en
              Almacén: al borrarlos saldrán de ahí. Los otros{' '}
              {payload.cartaOnlyCount ?? Math.max(0, payload.count - (payload.warehouseOverlapCount || 0))}{' '}
              son solo Carta.
            </p>
          </div>
        ) : payload.mode === 'bulk' && payload.kind === 'carta' ? (
          <div className="mb-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
            Solo Carta (venta). El Almacén se gestiona en su pestaña; aquí no se borran ingredientes de
            almacén puro.
          </div>
        ) : null}

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
                  : `Escribe la frase: ${bulkPhrase}`}
              </label>
              <input
                id="catalog-delete-phrase"
                type="text"
                autoComplete="off"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                className={inp}
                placeholder={payload.mode === 'single' ? payload.itemName : bulkPhrase}
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
