import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Minus, Plus, Search, X } from 'lucide-react';
import type { CatalogComboRef, CatalogItem } from '../../../lib/deliveryApi';
import {
  COMBO_SLOT_META,
  catalogProductsForComboSection,
  comboItemsInCatalogSection,
  comboMenuHasMainFamilyChoice,
  comboMenuSectionKey,
  filterComboMenuSectionsForMainFamily,
  inferMainFamilyFromComboSelections,
  isComboMenuComplete,
  isComboMenuSectionDone,
  mainFamilyForCatalogCategory,
  normalizeComboItemsForSave,
  pickComboProductInSection,
  resolveComboRefSlotKind,
  resolveComboSlotAllowlist,
  resolveTpvComboMenuSections,
  type ComboMainFamily,
  type ComboMenuCatalogSection,
  unitsNeededInComboSection,
} from '../../../lib/catalogComboSlots';
import { foldTpvSearchText } from '../../../lib/tpvCatalogNavigation';
import { useModalClose } from '../../../hooks/useModalClose';
import { TpvModalRoot } from './TpvModalRoot';

type TpvComboCustomizeModalProps = {
  item: CatalogItem;
  catalogItems: CatalogItem[];
  initialSelections?: CatalogComboRef[];
  formatPrice: (n: number) => string;
  onClose: () => void;
  onConfirm: (selections: CatalogComboRef[]) => void;
};

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

function firstOpenSection(
  sections: ComboMenuCatalogSection[],
  selections: CatalogComboRef[],
  catalog: CatalogItem[],
): string | null {
  const incomplete = sections.find((s) => !isComboMenuSectionDone(s, selections, catalog));
  return incomplete ? comboMenuSectionKey(incomplete) : null;
}

function defaultMainFamily(sections: ComboMenuCatalogSection[]): ComboMainFamily | null {
  const mains = sections.filter((s) => s.slotKind === 'main' && s.slotQuota > 0);
  const hasPizza = mains.some((s) => mainFamilyForCatalogCategory(s.catalogCategory) === 'pizza');
  const hasBurger = mains.some((s) => mainFamilyForCatalogCategory(s.catalogCategory) === 'burger');
  if (hasPizza && !hasBurger) return 'pizza';
  if (hasBurger && !hasPizza) return 'burger';
  return null;
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

  const needsMainFamilyPick = useMemo(
    () => comboMenuHasMainFamilyChoice(visibleSections),
    [visibleSections],
  );

  const [selections, setSelections] = useState<CatalogComboRef[]>(() => {
    // Al abrir un menú nuevo, no precargar pizza/burger del combo: primero preguntar familia.
    if (!initialSelections?.length) {
      const seed = item.comboItems ?? [];
      const sections = resolveTpvComboMenuSections(item, catalogItems);
      if (comboMenuHasMainFamilyChoice(sections.filter((s) => s.slotQuota > 0 || s.expectedCount > 0))) {
        return normalizeComboItemsForSave(
          seed.filter((ref) => resolveComboRefSlotKind(ref, catalogItems) !== 'main'),
          catalogItems,
        );
      }
      return normalizeComboItemsForSave(seed, catalogItems);
    }
    return normalizeComboItemsForSave(initialSelections, catalogItems);
  });

  const [mainFamily, setMainFamily] = useState<ComboMainFamily | null>(() => {
    if (initialSelections?.length) {
      return (
        inferMainFamilyFromComboSelections(initialSelections, catalogItems) ??
        defaultMainFamily(visibleSections)
      );
    }
    // Menú nuevo con pizza y burger en catálogo → siempre preguntar (no saltar a pizza).
    if (needsMainFamilyPick) return null;
    return defaultMainFamily(visibleSections);
  });

  const displaySections = useMemo(
    () => filterComboMenuSectionsForMainFamily(visibleSections, mainFamily),
    [visibleSections, mainFamily],
  );

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [sectionQuery, setSectionQuery] = useState('');

  useEffect(() => {
    if (needsMainFamilyPick && !mainFamily) return;
    setExpandedKey((prev) => {
      if (prev) {
        const section = displaySections.find((s) => comboMenuSectionKey(s) === prev);
        if (section && !isComboMenuSectionDone(section, selections, catalogItems)) return prev;
      }
      return firstOpenSection(displaySections, selections, catalogItems);
    });
  }, [needsMainFamilyPick, mainFamily, displaySections, selections, catalogItems]);

  useEffect(() => {
    setSectionQuery('');
  }, [expandedKey]);

  const menuComplete = isComboMenuComplete(menuSections, selections, catalogItems);
  const basePrice = Number(item.unitPrice || 0);

  const progress = useMemo(() => {
    const required = displaySections.filter(
      (s) => unitsNeededInComboSection(s) > 0 && s.required,
    );
    if (required.length === 0) return { done: 0, total: 0, pct: 100 };
    let done = 0;
    for (const section of required) {
      if (isComboMenuSectionDone(section, selections, catalogItems)) done += 1;
    }
    return { done, total: required.length, pct: Math.round((done / required.length) * 100) };
  }, [displaySections, selections, catalogItems]);

  const handleMainFamilyPick = useCallback(
    (family: ComboMainFamily) => {
      setMainFamily(family);
      const mainSection = visibleSections.find(
        (s) =>
          s.slotKind === 'main' &&
          (s.groupByMainFamily ?? mainFamilyForCatalogCategory(s.catalogCategory)) === family,
      );
      if (mainSection) {
        setExpandedKey(comboMenuSectionKey(mainSection));
      }
    },
    [visibleSections],
  );

  const handlePick = useCallback(
    (section: ComboMenuCatalogSection, product: CatalogItem) => {
      const key = comboMenuSectionKey(section);
      const wasDone = isComboMenuSectionDone(section, selections, catalogItems);
      const next = pickComboProductInSection(section, product, selections, catalogItems);
      if (!next) return;
      setSelections(next);
      if (!wasDone && isComboMenuSectionDone(section, next, catalogItems)) {
        const idx = displaySections.findIndex((s) => comboMenuSectionKey(s) === key);
        const following = displaySections
          .slice(idx + 1)
          .find((s) => !isComboMenuSectionDone(s, next, catalogItems));
        setExpandedKey(following ? comboMenuSectionKey(following) : null);
      }
    },
    [selections, catalogItems, displaySections],
  );

  const toggleSection = useCallback((section: ComboMenuCatalogSection) => {
    const key = comboMenuSectionKey(section);
    setExpandedKey((prev) => (prev === key ? null : key));
  }, []);

  const handleChangeMainFamily = useCallback(() => {
    setMainFamily(null);
    setSelections((prev) =>
      normalizeComboItemsForSave(
        prev.filter((ref) => resolveComboRefSlotKind(ref, catalogItems) !== 'main'),
        catalogItems,
      ),
    );
    setExpandedKey(null);
  }, [catalogItems]);

  return (
    <TpvModalRoot>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative flex flex-col w-full sm:max-w-4xl h-[94dvh] sm:h-auto sm:max-h-[92dvh] min-h-0 overflow-hidden bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 pb-[env(safe-area-inset-bottom)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tpv-combo-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-4 sm:px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-0.5">
                Menú / combo
              </p>
              <h2
                id="tpv-combo-title"
                className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight"
              >
                {item.name}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">
                <span>Progreso</span>
                <span className="tabular-nums">
                  {progress.done}/{progress.total}
                </span>
              </div>
              <div className="h-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-3 sm:px-4 py-3 space-y-2">
          {needsMainFamilyPick && !mainFamily && (
            <section className="rounded-xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 p-4">
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100 text-center mb-3">
                ¿Pizza o burger?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleMainFamilyPick('pizza')}
                  className="min-h-[72px] flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 font-bold text-gray-900 dark:text-gray-100 touch-manipulation active:scale-[0.98] transition-all"
                >
                  <span className="text-2xl" aria-hidden>
                    🍕
                  </span>
                  <span className="text-sm">Pizza</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleMainFamilyPick('burger')}
                  className="min-h-[72px] flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 font-bold text-gray-900 dark:text-gray-100 touch-manipulation active:scale-[0.98] transition-all"
                >
                  <span className="text-2xl" aria-hidden>
                    🍔
                  </span>
                  <span className="text-sm">Burger</span>
                </button>
              </div>
            </section>
          )}

          {mainFamily && needsMainFamilyPick && (
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Principal
              </span>
              <button
                type="button"
                onClick={handleChangeMainFamily}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-200"
              >
                {mainFamily === 'pizza' ? '🍕 Pizza' : '🍔 Burger'}
                <span className="text-gray-400 font-normal">· cambiar</span>
              </button>
            </div>
          )}

          {displaySections.length === 0 && (!needsMainFamilyPick || mainFamily) ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No hay productos en el catálogo para componer este menú.
            </p>
          ) : (
            displaySections.map((section) => {
              const meta = COMBO_SLOT_META[section.slotKind];
              const need = unitsNeededInComboSection(section);
              const picked = comboItemsInCatalogSection(section, selections, catalogItems);
              const have = picked.reduce((sum, r) => sum + Math.max(1, r.quantity || 1), 0);
              const products = catalogProductsForComboSection(section, catalogItems, item._id, {
                allowlistIds: resolveComboSlotAllowlist(item.customFields, section.slotKind),
              });
              const done = need <= 0 || have >= need;
              const key = comboMenuSectionKey(section);
              const expanded = expandedKey === key;
              const q = foldTpvSearchText(sectionQuery);
              const visibleProducts =
                expanded && q
                  ? products.filter((p) => foldTpvSearchText(`${p.name} ${p.category || ''}`).includes(q))
                  : products;

              return (
                <section
                  key={key}
                  className={`rounded-xl border overflow-hidden transition-colors ${
                    done ? 'border-emerald-200 dark:border-emerald-800' : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(section)}
                    className={`w-full px-3 py-2.5 flex items-center gap-2 text-left touch-manipulation ${
                      done
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/25'
                        : expanded
                          ? 'bg-gray-50 dark:bg-gray-800/80'
                          : 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-gray-900 text-lg border border-gray-100 dark:border-gray-700">
                      {meta.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">
                        {section.catalogCategory}
                      </p>
                      {done ? (
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium truncate mt-0.5">
                          {picked
                            .map((r) => `${r.productName}${r.quantity > 1 ? ` ×${r.quantity}` : ''}`)
                            .join(' · ')}
                        </p>
                      ) : need > 0 ? (
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          Elige {need === 1 ? '1' : need}
                          {section.required ? ' · obligatorio' : ''}
                        </p>
                      ) : null}
                    </div>
                    {done ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-200 shrink-0">
                        <Check className="w-3 h-3" />
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold tabular-nums text-gray-400 shrink-0">
                        {have}/{need}
                      </span>
                    )}
                    {expanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                  </button>

                  {expanded && (
                    <div className="border-t border-gray-100 dark:border-gray-800">
                      {picked.length > 0 && (
                        <div className="px-3 py-2 flex flex-wrap gap-1.5 bg-white dark:bg-gray-900/40">
                          {picked.map((ref) => (
                            <span
                              key={ref.productId}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-[11px] font-semibold text-emerald-900 dark:text-emerald-100"
                            >
                              {ref.productName}
                              {ref.quantity > 1 ? ` ×${ref.quantity}` : ''}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelections((prev) =>
                                    removeFromSection(section, ref, prev, catalogItems),
                                  );
                                }}
                                className="p-0.5 rounded hover:bg-emerald-200 dark:hover:bg-emerald-800"
                                aria-label={`Quitar ${ref.productName}`}
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {products.length > 8 && (
                        <div className="px-2 pt-2">
                          <label className="relative block">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                            <input
                              type="search"
                              value={sectionQuery}
                              onChange={(e) => setSectionQuery(e.target.value)}
                              placeholder={`Buscar en ${section.catalogCategory} (${products.length})`}
                              className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-8 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-emerald-400 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                            />
                          </label>
                        </div>
                      )}

                      <div className="p-2 grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[42vh] overflow-y-auto">
                        {visibleProducts.length === 0 ? (
                          <p className="col-span-full text-center text-xs text-gray-500 py-4">
                            {q ? 'Sin coincidencias' : 'No hay productos en esta sección'}
                          </p>
                        ) : (
                          visibleProducts.map((product) => {
                          const selected = picked.find((r) => r.productId === product._id);
                          const atMax = need > 0 && have >= need && !selected;
                          return (
                            <button
                              key={product._id}
                              type="button"
                              disabled={atMax}
                              onClick={() => handlePick(section, product)}
                              className={`min-h-[44px] px-2 py-2 rounded-lg border text-left text-[11px] sm:text-xs font-semibold transition-all touch-manipulation active:scale-[0.98] ${
                                selected
                                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100'
                                  : atMax
                                    ? 'border-gray-100 dark:border-gray-800 text-gray-400 opacity-50 cursor-not-allowed'
                                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-emerald-400'
                              }`}
                            >
                              <span className="line-clamp-2 leading-snug">{product.name}</span>
                              {product.category && section.groupByMainFamily ? (
                                <span className="mt-0.5 block truncate text-[9px] font-medium text-gray-400">
                                  {product.category}
                                </span>
                              ) : null}
                            </button>
                          );
                        })
                        )}
                      </div>
                    </div>
                  )}
                </section>
              );
            })
          )}
          <div className="h-1 shrink-0" aria-hidden />
        </div>

        <div className="shrink-0 px-3 sm:px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <button
            type="button"
            disabled={!menuComplete || (needsMainFamilyPick && !mainFamily)}
            onClick={() => onConfirm(selections)}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-sm touch-manipulation"
          >
            <Plus className="w-5 h-5" />
            {menuComplete ? 'Continuar' : 'Completa el menú'}
          </button>
        </div>
      </div>
    </TpvModalRoot>
  );
}
