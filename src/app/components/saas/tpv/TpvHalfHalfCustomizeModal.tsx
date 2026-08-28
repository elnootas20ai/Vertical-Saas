import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { CatalogItem } from '../../../lib/deliveryApi';
import {
  catalogProductsForHalfHalf,
  normalizeHalfHalfAllowedProductIds,
  resolveHalfHalfScopeBrandId,
  type HalfHalfPizzaSelection,
} from '../../../lib/catalogCustomization';
import { useModalClose } from '../../../hooks/useModalClose';
import { dismissTpvKeyboard, TpvModalRoot } from './TpvModalRoot';

type TpvHalfHalfCustomizeModalProps = {
  item: CatalogItem;
  catalogItems: CatalogItem[];
  brands?: Array<{ _id: string; deliveryLineKind?: string; catalogCategories?: string[] }>;
  initial?: HalfHalfPizzaSelection;
  formatPrice: (n: number) => string;
  onClose: () => void;
  onConfirm: (selection: HalfHalfPizzaSelection) => void;
};

type ActiveHalf = 'first' | 'second';

export function TpvHalfHalfCustomizeModal({
  item,
  catalogItems,
  brands: _brands,
  initial,
  formatPrice,
  onClose,
  onConfirm,
}: TpvHalfHalfCustomizeModalProps) {
  useModalClose(true, onClose);

  const scopeBrandId = useMemo(() => resolveHalfHalfScopeBrandId(item), [item]);

  const flavorProducts = useMemo(
    () =>
      catalogProductsForHalfHalf(catalogItems, item._id, {
        allowedProductIds: normalizeHalfHalfAllowedProductIds(
          item.customFields?.halfHalfAllowedProductIds,
        ),
        scopeBrandId,
      }),
    [catalogItems, item._id, item.customFields?.halfHalfAllowedProductIds, scopeBrandId],
  );

  const [activeHalf, setActiveHalf] = useState<ActiveHalf>('first');
  const [firstId, setFirstId] = useState(initial?.firstProductId || '');
  const [secondId, setSecondId] = useState(initial?.secondProductId || '');

  const first = flavorProducts.find((p) => p._id === firstId);
  const second = flavorProducts.find((p) => p._id === secondId);
  const complete = Boolean(first && second);

  const pickProduct = (product: CatalogItem) => {
    if (activeHalf === 'first') {
      setFirstId(product._id);
      if (!secondId) setActiveHalf('second');
      return;
    }
    setSecondId(product._id);
  };

  const handleConfirm = () => {
    if (!first || !second) return;
    onConfirm({
      firstProductId: first._id,
      firstProductName: first.name,
      secondProductId: second._id,
      secondProductName: second.name,
    });
  };

  return (
    <TpvModalRoot>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={dismissTpvKeyboard} />
      <div
        className="relative bg-white dark:bg-gray-900 w-full sm:max-w-lg h-[92dvh] sm:h-auto sm:max-h-[92dvh] min-h-0 sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Mitad y mitad
            </p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{item.name}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Elige 2 productos · {formatPrice(Number(item.unitPrice || 0))}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActiveHalf('first')}
              className={`rounded-xl border-2 p-3 text-left transition-colors ${
                activeHalf === 'first'
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
                Mitad 1
              </span>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1 truncate">
                {first?.name || 'Toca un producto abajo'}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setActiveHalf('second')}
              className={`rounded-xl border-2 p-3 text-left transition-colors ${
                activeHalf === 'second'
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
                Mitad 2
              </span>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1 truncate">
                {second?.name || 'Toca un producto abajo'}
              </p>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-4">
          {flavorProducts.length === 0 ? (
            <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-8">
              No hay productos de esta marca en el catálogo. Configura mitad y mitad en el catálogo primero.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {flavorProducts.map((product) => {
                const isFirst = product._id === firstId;
                const isSecond = product._id === secondId;
                const selected = isFirst || isSecond;
                return (
                  <button
                    key={product._id}
                    type="button"
                    onClick={() => pickProduct(product)}
                    className={`rounded-xl border-2 p-3 text-left transition-all touch-manipulation ${
                      selected
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 ring-1 ring-emerald-500/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                      {product.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 tabular-nums">
                      {formatPrice(Number(product.unitPrice || 0))}
                    </p>
                    {selected ? (
                      <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                        <Check className="w-3 h-3" />
                        {isFirst && isSecond ? 'Mitad 1 y 2' : isFirst ? 'Mitad 1' : 'Mitad 2'}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 shrink-0 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-300"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!complete}
            onClick={handleConfirm}
            className="flex-1 py-3 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Añadir al pedido
          </button>
        </div>
      </div>
    </TpvModalRoot>
  );
}
