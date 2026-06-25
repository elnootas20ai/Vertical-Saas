import { useMemo, useState } from 'react';
import { Check, Minus, Plus, X } from 'lucide-react';
import type { CatalogComboRef, CatalogItem } from '../../../lib/deliveryApi';
import {
  COMBO_SLOT_META,
  catalogProductsForComboSection,
  categoriesMatch,
  comboItemsInCatalogSection,
  inferComboSlotKind,
  isComboMenuComplete,
  normalizeComboItemsForSave,
  resolveComboRefSlotKind,
  resolveTpvComboMenuSections,
  totalUnitsInCatalogSection,
  totalUnitsInSlotKind,
  type ComboMenuCatalogSection,
} from '../../../lib/catalogComboSlots';
import { useModalClose } from '../../../hooks/useModalClose';

type TpvComboCustomizeModalProps = {
  item: CatalogItem;
  catalogItems: CatalogItem[];
  initialSelections?: CatalogComboRef[];
  formatPrice: (n: number) => string;
  onClose: () => void;
  onConfirm: (selections: CatalogComboRef[]) => void;
};

function pickProductInSection(
  section: ComboMenuCatalogSection,
  product: CatalogItem,
  comboItems: CatalogComboRef[],
  catalogItems: CatalogItem[],
): CatalogComboRef[] | null {
  const categoryNeed = section.expectedCount;
  const slotNeed = section.slotQuota;
  const slotKind = section.slotKind;
  const refSlotKind = inferComboSlotKind(product.category || '', product.name);

  let next = [...comboItems];

  if (categoryNeed > 0) {
    next = next.filter((ref) => {
      const p = catalogItems.find((c) => c._id === ref.productId);
      if (!p) return true;
      return !categoriesMatch(p.category || '', section.catalogCategory);
    });
  } else if (slotNeed === 1) {
    next = next.filter((ref) => resolveComboRefSlotKind(ref, catalogItems) !== slotKind);
  } else {
    next = next.filter((ref) => {
      const p = catalogItems.find((c) => c._id === ref.productId);
      if (!p) return true;
      return !categoriesMatch(p.category || '', section.catalogCategory);
    });
  }

  const sameIdx = next.findIndex((c) => c.productId === product._id);
  const need = categoryNeed > 0 ? categoryNeed : slotNeed;
  const have =
    categoryNeed > 0
      ? totalUnitsInCatalogSection(section, next, catalogItems)
      : totalUnitsInSlotKind(slotKind, next, catalogItems);

  if (need === 1) {
    next.push({
      productId: product._id,
      productName: product.name,
      quantity: 1,
      slotKind: refSlotKind,
    });
  } else if (sameIdx >= 0) {
    if (have < need) {
      next[sameIdx] = { ...next[sameIdx], quantity: next[sameIdx].quantity + 1, slotKind: refSlotKind };
    } else return null;
  } else {
    if (have >= need) return null;
    next.push({
      productId: product._id,
      productName: product.name,
      quantity: 1,
      slotKind: refSlotKind,
    });
  }

  return normalizeComboItemsForSave(next, catalogItems);
}

function removeFromSection(
  section: ComboMenuCatalogSection,
  ref: CatalogComboRef,
  comboItems: CatalogComboRef[],
  catalogItems: CatalogItem[],
): CatalogComboRef[] {
  const inSection = comboItemsInCatalogSection(section, comboItems, catalogItems);
  const target = inSection.find((r) => r.productId === ref.productId);
  if (!target) return comboItems;

  let next = comboItems.map((r) => ({ ...r }));
  const idx = next.findIndex((r) => r.productId === ref.productId);
  if (idx < 0) return comboItems;

  if (next[idx].quantity > 1) {
    next[idx] = { ...next[idx], quantity: next[idx].quantity - 1 };
  } else {
    next = next.filter((_, i) => i !== idx);
  }
  return normalizeComboItemsForSave(next, catalogItems);
}

export function TpvComboCustomizeModal({
  item,
  catalogItems,
  initialSelections,
  formatPrice,
  onClose,
  onConfirm,
}: TpvComboCustomizeModalProps) {
  useModalClose(true, onClose);

  const menuSections = useMemo(
    () => resolveTpvComboMenuSections(item, catalogItems),
    [item, catalogItems],
  );

  const visibleSections = useMemo(
    () => menuSections.filter((s) => s.slotQuota > 0 || s.expectedCount > 0),
    [menuSections],
  );

  const [selections, setSelections] = useState<CatalogComboRef[]>(() => {
    const seed = initialSelections?.length ? initialSelections : item.comboItems ?? [];
    return normalizeComboItemsForSave(seed, catalogItems);
  });

  const menuComplete = isComboMenuComplete(menuSections, selections, catalogItems);
  const basePrice = Number(item.unitPrice || 0);

  const progress = useMemo(() => {
    const required = visibleSections.filter(
      (s) => (s.expectedCount > 0 ? s.expectedCount : s.slotQuota) > 0 && s.required,
    );
    if (required.length === 0) return { done: 0, total: 0, pct: 100 };
    let done = 0;
    for (const section of required) {
      const need = section.expectedCount > 0 ? section.expectedCount : section.slotQuota;
      const picked = comboItemsInCatalogSection(section, selections, catalogItems);
      const have = picked.reduce((sum, r) => sum + Math.max(1, r.quantity || 1), 0);
      if (have >= need) done += 1;
    }
    return { done, total: required.length, pct: Math.round((done / required.length) * 100) };
  }, [visibleSections, selections, catalogItems]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative flex flex-col w-full sm:max-w-4xl h-[94dvh] sm:h-auto sm:max-h-[92dvh] min-h-0 overflow-hidden bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 pb-[env(safe-area-inset-bottom)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tpv-combo-title"
      >
        <div className="shrink-0 px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">
                Menú / combo
              </p>
              <h2 id="tpv-combo-title" className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {item.name}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Elige los productos incluidos ·{' '}
                <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  {formatPrice(basePrice)}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {progress.total > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                <span>Secciones obligatorias</span>
                <span className="tabular-nums">
                  {progress.done}/{progress.total}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-4 scroll-smooth">
          {visibleSections.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No hay productos en el catálogo para componer este menú.
            </p>
          ) : (
            visibleSections.map((section) => {
              const meta = COMBO_SLOT_META[section.slotKind];
              const need = section.expectedCount > 0 ? section.expectedCount : section.slotQuota;
              const picked = comboItemsInCatalogSection(section, selections, catalogItems);
              const have = picked.reduce((sum, r) => sum + Math.max(1, r.quantity || 1), 0);
              const products = catalogProductsForComboSection(section, catalogItems, item._id);
              const done = need <= 0 || have >= need;

              return (
                <section
                  key={`${section.slotKind}-${section.catalogCategory}`}
                  className={`rounded-2xl border overflow-hidden transition-colors ${
                    done && need > 0
                      ? 'border-emerald-200 dark:border-emerald-800'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div
                    className={`px-4 py-3 flex items-center justify-between gap-3 ${
                      done && need > 0
                        ? 'bg-emerald-50 dark:bg-emerald-950/30'
                        : 'bg-gray-50 dark:bg-gray-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-gray-900 text-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        {meta.emoji}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                          {section.catalogCategory}
                        </p>
                        {need > 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {have}/{need}{' '}
                            {section.required ? (
                              <span className="text-amber-700 dark:text-amber-300 font-semibold">· obligatorio</span>
                            ) : (
                              '· opcional'
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    {done && need > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-200 shrink-0">
                        <Check className="w-3.5 h-3.5" />
                        Listo
                      </span>
                    ) : null}
                  </div>

                  {picked.length > 0 && (
                    <div className="px-4 py-2.5 flex flex-wrap gap-2 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/40">
                      {picked.map((ref) => (
                        <span
                          key={ref.productId}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-xs font-semibold text-emerald-900 dark:text-emerald-100"
                        >
                          {ref.productName}
                          {ref.quantity > 1 ? ` ×${ref.quantity}` : ''}
                          <button
                            type="button"
                            onClick={() =>
                              setSelections((prev) => removeFromSection(section, ref, prev, catalogItems))
                            }
                            className="p-0.5 rounded-md hover:bg-emerald-200 dark:hover:bg-emerald-800"
                            aria-label={`Quitar ${ref.productName}`}
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="p-3 sm:p-4 grid grid-cols-2 lg:grid-cols-3 gap-2">
                    {products.map((product) => {
                      const selected = picked.find((r) => r.productId === product._id);
                      const atMax = need > 0 && have >= need && !selected;
                      return (
                        <button
                          key={product._id}
                          type="button"
                          disabled={atMax}
                          onClick={() => {
                            const next = pickProductInSection(section, product, selections, catalogItems);
                            if (next) setSelections(next);
                          }}
                          className={`min-h-[52px] px-3 py-2.5 rounded-xl border-2 text-left text-xs sm:text-sm font-semibold transition-all touch-manipulation active:scale-[0.98] ${
                            selected
                              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 shadow-sm'
                              : atMax
                                ? 'border-gray-100 dark:border-gray-800 text-gray-400 opacity-50 cursor-not-allowed'
                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-emerald-400 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20'
                          }`}
                        >
                          <span className="line-clamp-3 leading-snug">{product.name}</span>
                          {selected && selected.quantity > 1 ? (
                            <span className="mt-1 inline-block text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                              ×{selected.quantity}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
          <div className="h-2 shrink-0" aria-hidden />
        </div>

        <div className="shrink-0 px-4 sm:px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.35)]">
          <button
            type="button"
            disabled={!menuComplete}
            onClick={() => onConfirm(selections)}
            className="w-full min-h-[52px] flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base touch-manipulation shadow-lg shadow-emerald-600/20"
          >
            <Plus className="w-5 h-5" />
            {menuComplete ? 'Continuar' : 'Completa el menú'}
          </button>
        </div>
      </div>
    </div>
  );
}
