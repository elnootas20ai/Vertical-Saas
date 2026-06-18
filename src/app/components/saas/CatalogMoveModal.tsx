import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRightLeft, X } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';
import type { Brand } from '../../lib/brandsApi';
import type { CatalogItem } from '../../lib/deliveryApi';
import { shouldClearBrandForCategory } from '../../lib/deliveryCatalogImport';
import { catalogCategorySuggestions } from '../../lib/deliveryBrandLineKinds';
import type { CatalogMoveBrandChoice, CatalogMoveTargetInput } from '../../lib/catalogItemMove';

type CatalogMoveModalProps = {
  open: boolean;
  items: CatalogItem[];
  brands: Brand[];
  commercialLines: Brand[];
  categoriesInUse: string[];
  submitting?: boolean;
  onClose: () => void;
  onConfirm: (target: CatalogMoveTargetInput) => Promise<void>;
};

export function CatalogMoveModal({
  open,
  items,
  brands,
  commercialLines,
  categoriesInUse,
  submitting = false,
  onClose,
  onConfirm,
}: CatalogMoveModalProps) {
  const single = items.length === 1 ? items[0] : null;
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [brandChoice, setBrandChoice] = useState<CatalogMoveBrandChoice>('keep');
  const [useCustomCategory, setUseCustomCategory] = useState(false);

  useModalClose(open && !submitting, onClose);

  useEffect(() => {
    if (!open) return;
    const initialCat = String(single?.category || categoriesInUse[0] || '').trim();
    const inList = categoriesInUse.some((c) => c.toLowerCase() === initialCat.toLowerCase());
    setCategory(inList ? initialCat : categoriesInUse[0] || initialCat);
    setCustomCategory(inList ? '' : initialCat);
    setUseCustomCategory(Boolean(initialCat) && !inList);
    const ids = single?.brandIds ?? [];
    if (ids.length === 0) setBrandChoice('clear');
    else if (ids.length === 1) setBrandChoice(ids[0]);
    else setBrandChoice('keep');
  }, [open, single, categoriesInUse]);

  const resolvedCategory = useMemo(() => {
    const raw = useCustomCategory ? customCategory.trim() : category.trim();
    return raw;
  }, [useCustomCategory, customCategory, category]);

  const sharedCategory = useMemo(
    () => Boolean(resolvedCategory && shouldClearBrandForCategory(resolvedCategory)),
    [resolvedCategory],
  );

  const categoryOptions = useMemo(() => {
    const fromBrands = catalogCategorySuggestions(brands, [], categoriesInUse);
    const merged = [...new Set([...categoriesInUse, ...fromBrands].filter(Boolean))];
    return merged.sort((a, b) => a.localeCompare(b, 'es'));
  }, [brands, categoriesInUse]);

  const previewLine = useMemo(() => {
    if (sharedCategory) return 'Pestaña compartida (sin línea)';
    if (brandChoice === 'keep') {
      if (items.length === 1) {
        const names = (single?.brandIds ?? [])
          .map((id) => commercialLines.find((b) => b._id === id)?.name)
          .filter(Boolean);
        return names.length > 0 ? names.join(', ') : 'Sin línea asignada';
      }
      return 'Mantiene la línea de cada producto';
    }
    if (brandChoice === 'clear') return 'Sin línea (compartido)';
    return commercialLines.find((b) => b._id === brandChoice)?.name || 'Línea seleccionada';
  }, [sharedCategory, brandChoice, items.length, single, commercialLines]);

  if (!open || items.length === 0) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!resolvedCategory) return;
    await onConfirm({
      category: resolvedCategory,
      brandChoice: sharedCategory ? 'clear' : brandChoice,
    });
  };

  const inp =
    'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-indigo-500 focus:outline-none text-sm';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-lg w-full border-2 border-indigo-200 dark:border-indigo-900/50 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-indigo-50/80 dark:bg-indigo-950/30">
          <div className="flex items-center gap-2 min-w-0">
            <ArrowRightLeft className="w-5 h-5 text-indigo-600 shrink-0" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
              Mover {items.length} producto{items.length !== 1 ? 's' : ''}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-lg hover:bg-white/80 dark:hover:bg-gray-800 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
            {items.slice(0, 4).map((item) => (
              <div key={item._id} className="truncate">
                · {item.name}
                {item.category ? (
                  <span className="text-gray-500 dark:text-gray-400"> ({item.category})</span>
                ) : null}
              </div>
            ))}
            {items.length > 4 && (
              <div className="text-gray-500 dark:text-gray-400 mt-1">y {items.length - 4} más…</div>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">
              Categoría destino
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                onClick={() => setUseCustomCategory(false)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                  !useCustomCategory
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-800'
                    : 'border-gray-300 text-gray-600'
                }`}
              >
                Existente
              </button>
              <button
                type="button"
                onClick={() => setUseCustomCategory(true)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                  useCustomCategory
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-800'
                    : 'border-gray-300 text-gray-600'
                }`}
              >
                Nueva categoría
              </button>
            </div>
            {useCustomCategory ? (
              <input
                className={inp}
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="Ej. Combos, Burgers, Bebidas…"
                required
                autoFocus
              />
            ) : (
              <select
                className={inp}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              >
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}
          </div>

          {!sharedCategory && (
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">
                Línea TPV (marca)
              </label>
              <select
                className={inp}
                value={brandChoice}
                onChange={(e) => setBrandChoice(e.target.value as CatalogMoveBrandChoice)}
              >
                {items.length === 1 && (
                  <option value="keep">Mantener línea actual</option>
                )}
                {items.length > 1 && <option value="keep">No cambiar (cada uno mantiene la suya)</option>}
                <option value="clear">Sin línea — pestaña compartida</option>
                {commercialLines.map((line) => (
                  <option key={line._id} value={line._id}>
                    {line.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {sharedCategory && (
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-xl px-3 py-2">
              Bebidas, Complementos y Postres van sin línea en el TPV (pestaña compartida).
            </p>
          )}

          <div className="text-sm text-gray-600 dark:text-gray-400 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20 px-3 py-2 border border-indigo-100 dark:border-indigo-900/30">
            Destino: <strong>{resolvedCategory || '…'}</strong>
            {' · '}
            {previewLine}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !resolvedCategory}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold disabled:opacity-50"
            >
              {submitting ? 'Moviendo…' : 'Mover productos'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
