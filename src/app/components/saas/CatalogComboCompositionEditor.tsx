import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Minus, Plus, Search, Trash2, Zap } from 'lucide-react';
import type { CatalogComboRef, CatalogItem } from '../../lib/deliveryApi';
import {
  COMBO_MENU_PRESETS,
  COMBO_SLOT_META,
  DEFAULT_COMBO_STRUCTURE,
  buildComboMenuSections,
  catalogProductsForCategory,
  catalogProductsForComboSection,
  comboItemsInCatalogSection,
  comboMenuSectionKey,
  inferComboSlotKind,
  isComboMenuComplete,
  normalizeComboItemsForSave,
  pickComboProductInSection,
  totalUnitsInCatalogSection,
  uniqueCatalogCategoriesForComboParts,
  unitsNeededInComboSection,
  type ComboMenuCatalogSection,
  type ComboStructureSlot,
} from '../../lib/catalogComboSlots';
import { foldTpvSearchText } from '../../lib/tpvCatalogNavigation';

type CatalogComboCompositionEditorProps = {
  comboItems: CatalogComboRef[];
  catalogItems: CatalogItem[];
  excludeItemId?: string;
  comboStructure?: ComboStructureSlot[];
  structureConfirmed?: boolean;
  onChange: (items: CatalogComboRef[]) => void;
  onStructureChange?: (structure: ComboStructureSlot[]) => void;
  onStructureConfirmedChange?: (confirmed: boolean) => void;
  onImportIngredients?: () => void;
  compact?: boolean;
};

const MENU_SIZES = COMBO_MENU_PRESETS.filter((p) =>
  ['estandar', 'duo', 'familiar'].includes(p.id),
);

const SECTION_HEADER: Record<string, { emoji: string; bg: string; border: string }> = {
  Pizzas: { emoji: '🍕', bg: 'bg-red-50 dark:bg-red-950/25', border: 'border-red-200 dark:border-red-900' },
  Burgers: { emoji: '🍔', bg: 'bg-orange-50 dark:bg-orange-950/25', border: 'border-orange-200 dark:border-orange-900' },
  'Top Burgers': { emoji: '🍔', bg: 'bg-orange-50 dark:bg-orange-950/25', border: 'border-orange-200 dark:border-orange-900' },
  Hamburguesas: { emoji: '🍔', bg: 'bg-orange-50 dark:bg-orange-950/25', border: 'border-orange-200 dark:border-orange-900' },
  Sides: { emoji: '🍟', bg: 'bg-amber-50 dark:bg-amber-950/25', border: 'border-amber-200 dark:border-amber-900' },
  Complementos: { emoji: '🍟', bg: 'bg-amber-50 dark:bg-amber-950/25', border: 'border-amber-200 dark:border-amber-900' },
  Bebidas: { emoji: '🥤', bg: 'bg-blue-50 dark:bg-blue-950/25', border: 'border-blue-200 dark:border-blue-900' },
  Postres: { emoji: '🍰', bg: 'bg-pink-50 dark:bg-pink-950/25', border: 'border-pink-200 dark:border-pink-900' },
};

function sectionHeaderStyle(section: ComboMenuCatalogSection) {
  const byCat = SECTION_HEADER[section.catalogCategory];
  if (byCat) return byCat;
  const meta = COMBO_SLOT_META[section.slotKind];
  return {
    emoji: meta.emoji,
    bg: 'bg-gray-50 dark:bg-gray-900',
    border: 'border-gray-200 dark:border-gray-700',
  };
}

function MenuProgressBar({
  sections,
  comboItems,
  catalogItems,
}: {
  sections: ComboMenuCatalogSection[];
  comboItems: CatalogComboRef[];
  catalogItems: CatalogItem[];
}) {
  const steps = sections
    .filter((s) => s.slotQuota > 0 || s.expectedCount > 0)
    .map((s) => ({
      key: comboMenuSectionKey(s),
      label: s.catalogCategory,
      emoji: sectionHeaderStyle(s).emoji,
      quota: unitsNeededInComboSection(s),
      have: totalUnitsInCatalogSection(s, comboItems, catalogItems),
    }));

  if (steps.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
      {steps.map((step) => {
        const done = step.quota > 0 && step.have >= step.quota;
        return (
          <div
            key={step.key}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
              done
                ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
          >
            <span>{step.emoji}</span>
            <span>{step.label}</span>
            <span className="tabular-nums opacity-80">
              {step.have}/{step.quota}
            </span>
            {done ? <Check className="w-3.5 h-3.5" /> : null}
          </div>
        );
      })}
    </div>
  );
}

function ComboPartRow({
  slot,
  categories,
  catalogItems,
  excludeItemId,
  onPatch,
  onRemove,
}: {
  slot: ComboStructureSlot;
  categories: string[];
  catalogItems: CatalogItem[];
  excludeItemId?: string;
  onPatch: (patch: Partial<ComboStructureSlot>) => void;
  onRemove: () => void;
}) {
  const category = String(slot.catalogCategory || '').trim();
  const count = Math.max(1, slot.expectedCount ?? 1);
  const allowed = slot.allowedProductIds || [];
  const [pickOpen, setPickOpen] = useState(allowed.length > 0);

  const products = useMemo(
    () => (category ? catalogProductsForCategory(category, catalogItems, excludeItemId) : []),
    [category, catalogItems, excludeItemId],
  );

  const applyCategory = (nextCategory: string) => {
    const cat = nextCategory.trim();
    if (!cat) return;
    onPatch({
      catalogCategory: cat,
      slotKind: inferComboSlotKind(cat),
      label: count > 1 ? `${cat} (×${count})` : cat,
      allowedProductIds: [],
    });
    setPickOpen(false);
  };

  const applyCount = (nextCount: number) => {
    const n = Math.max(1, Math.min(20, nextCount));
    onPatch({
      expectedCount: n,
      ...(category ? { label: n > 1 ? `${category} (×${n})` : category } : {}),
    });
  };

  const toggleAllowed = (productId: string) => {
    // Lista vacía = todos permitidos; al desmarcar uno, quedan todos menos ese.
    if (allowed.length === 0) {
      onPatch({
        allowedProductIds: products.filter((p) => p._id !== productId).map((p) => p._id),
      });
      return;
    }
    let next = allowed.includes(productId)
      ? allowed.filter((id) => id !== productId)
      : [...allowed, productId];
    if (next.length >= products.length) next = [];
    onPatch({ allowedProductIds: next });
  };

  return (
    <div className="rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={category}
          onChange={(e) => applyCategory(e.target.value)}
          className="flex-1 min-w-[10rem] px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500"
        >
          <option value="">
            {slot.label ? `${slot.label} — elegir organizador…` : 'Elegir organizador…'}
          </option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 rounded-xl border-2 border-gray-200 dark:border-gray-700 px-1 py-0.5">
          <button
            type="button"
            onClick={() => applyCount(count - 1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
            title="Una unidad menos"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="w-8 text-center text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">
            {count}
          </span>
          <button
            type="button"
            onClick={() => applyCount(count + 1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
            title="Una unidad más"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          title="Quitar parte"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {category ? (
        <div>
          <button
            type="button"
            onClick={() => setPickOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${pickOpen ? 'rotate-0' : '-rotate-90'}`}
            />
            {allowed.length > 0
              ? `${allowed.length} de ${products.length} productos elegibles`
              : `Todos los productos de «${category}» (${products.length})`}
          </button>
          {pickOpen ? (
            products.length === 0 ? (
              <p className="text-xs text-gray-400 mt-1.5">Sin productos en esta categoría todavía.</p>
            ) : (
              <div className="mt-1.5 space-y-1.5">
                <button
                  type="button"
                  onClick={() => onPatch({ allowedProductIds: [] })}
                  className="text-xs font-semibold text-[var(--v-blue,#2563eb)] hover:underline"
                >
                  Permitir todos
                </button>
                <ul className="max-h-40 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  {products.map((p) => {
                    const on = allowed.length === 0 || allowed.includes(p._id);
                    return (
                      <li key={p._id}>
                        <button
                          type="button"
                          onClick={() => toggleAllowed(p._id)}
                          className="w-full flex items-center gap-2 px-2.5 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <span
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                              on
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-gray-300 dark:border-gray-600'
                            }`}
                          >
                            {on ? <Check className="w-3.5 h-3.5" /> : null}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-gray-900 dark:text-gray-100">
                            {p.name}
                          </span>
                          <span className="text-xs text-gray-500 shrink-0">{p.unitPrice.toFixed(2)} €</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {allowed.length > 0 ? (
                  <p className="text-[11px] text-gray-500">
                    Solo los marcados se podrán elegir en esta parte del menú.
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-500">
                    Todos permitidos. Marca productos para limitar la elección.
                  </p>
                )}
              </div>
            )
          ) : null}
        </div>
      ) : (
        <p className="text-[11px] text-gray-500">
          Parte clásica ({slot.label}). Elige un organizador para usar tus categorías reales.
        </p>
      )}
    </div>
  );
}

function CatalogSectionBlock({
  section,
  comboItems,
  catalogItems,
  excludeItemId,
  compact,
  onPick,
}: {
  section: ComboMenuCatalogSection;
  comboItems: CatalogComboRef[];
  catalogItems: CatalogItem[];
  excludeItemId?: string;
  compact?: boolean;
  onPick: (section: ComboMenuCatalogSection, product: CatalogItem) => void;
}) {
  const [search, setSearch] = useState('');
  const style = sectionHeaderStyle(section);
  const selected = comboItemsInCatalogSection(section, comboItems, catalogItems);
  const need = unitsNeededInComboSection(section);
  const have = totalUnitsInCatalogSection(section, comboItems, catalogItems);
  const done = need > 0 && have >= need;

  const products = useMemo(() => {
    const q = foldTpvSearchText(search);
    return catalogProductsForComboSection(section, catalogItems, excludeItemId).filter((p) => {
      if (!q) return true;
      return foldTpvSearchText(p.name).includes(q) || foldTpvSearchText(p.sku || '').includes(q);
    });
  }, [section, catalogItems, excludeItemId, search]);

  const pickLabel = need > 1 ? `Elige ${need} (${have}/${need})` : need === 1 ? 'Elige 1' : 'Opcional';

  return (
    <section className={`rounded-2xl border-2 ${style.border} ${style.bg} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-inherit flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{style.emoji}</span>
          <div>
            <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">
              {section.catalogCategory}
            </h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">{pickLabel}</p>
          </div>
        </div>
        {done && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-white/80 dark:bg-gray-900/80 px-2 py-1 rounded-lg">
            <Check className="w-4 h-4" /> OK
          </span>
        )}
      </div>

      {selected.length > 0 && (
        <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-inherit bg-white/50 dark:bg-gray-900/30">
          {selected.map((ref) => (
            <span
              key={ref.productId}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-gray-900 border text-xs font-bold text-gray-900 dark:text-gray-100"
            >
              {ref.productName}
              {ref.quantity > 1 ? ` ×${ref.quantity}` : ''}
            </span>
          ))}
        </div>
      )}

      <div className="p-4 space-y-2">
        {done ? (
          <p className="text-sm text-center text-emerald-700 dark:text-emerald-400 py-1 font-medium">
            Completo — toca otro producto para cambiar
          </p>
        ) : null}
        {products.length === 0 ? (
          <p className="text-sm text-center text-gray-500 py-3">
            No hay productos en «{section.catalogCategory}». Revísalo en el catálogo.
          </p>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Buscar en ${section.catalogCategory}…`}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-900"
              />
            </div>
            <p className="text-[11px] text-gray-500">{products.length} productos</p>
            <div
              className={`grid gap-2 max-h-44 overflow-y-auto pr-1 ${
                compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
              }`}
            >
              {products.map((p) => {
                const picked = selected.find((i) => i.productId === p._id);
                return (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => onPick(section, p)}
                    className={`p-2.5 rounded-xl border-2 text-left text-sm transition-all active:scale-[0.98] ${
                      picked
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 font-bold'
                        : 'border-white dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300'
                    }`}
                  >
                    <span className="block leading-snug">{p.name}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {p.unitPrice.toFixed(2)} €
                      {picked ? ` · ×${picked.quantity}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function CatalogComboCompositionEditor({
  comboItems,
  catalogItems,
  excludeItemId,
  comboStructure: comboStructureProp,
  onChange,
  onStructureChange,
  onStructureConfirmedChange,
  onImportIngredients,
  compact = false,
}: CatalogComboCompositionEditorProps) {
  const structure = useMemo(
    () =>
      comboStructureProp && comboStructureProp.length > 0
        ? comboStructureProp
        : DEFAULT_COMBO_STRUCTURE.map((s) => ({ ...s })),
    [comboStructureProp],
  );

  useEffect(() => {
    onStructureConfirmedChange?.(true);
  }, [onStructureConfirmedChange]);

  const categories = useMemo(
    () => uniqueCatalogCategoriesForComboParts(catalogItems, excludeItemId),
    [catalogItems, excludeItemId],
  );

  const emitStructure = (next: ComboStructureSlot[]) => {
    onStructureChange?.(next);
    onStructureConfirmedChange?.(true);
  };

  const patchPart = (idx: number, patch: Partial<ComboStructureSlot>) => {
    emitStructure(structure.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const removePart = (idx: number) => {
    emitStructure(structure.filter((_, i) => i !== idx));
  };

  const addPart = () => {
    emitStructure([
      ...structure,
      { slotKind: 'other', label: 'Nueva parte', required: true, expectedCount: 1 },
    ]);
  };

  const applyPreset = (presetId: string) => {
    const preset = COMBO_MENU_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    emitStructure(preset.structure.map((s) => ({ ...s })));
    if (comboItems.length > 0) emitChange([]);
  };

  const menuSections = useMemo(
    () => buildComboMenuSections('estandar', catalogItems, structure),
    [catalogItems, structure],
  );

  const visibleSections = menuSections.filter((s) => s.slotQuota > 0 || s.expectedCount > 0);

  const menuComplete = isComboMenuComplete(menuSections, comboItems, catalogItems);

  const emitChange = (next: CatalogComboRef[]) => {
    onChange(normalizeComboItemsForSave(next, catalogItems));
  };

  const pickProduct = (section: ComboMenuCatalogSection, product: CatalogItem) => {
    const next = pickComboProductInSection(section, product, comboItems, catalogItems);
    if (next) emitChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Partes del menú</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            Cada parte es un organizador de tu carta: cuántas unidades y qué productos se pueden elegir.
          </p>
        </div>
        {onImportIngredients && comboItems.length > 0 && (
          <button
            type="button"
            onClick={onImportIngredients}
            className="inline-flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-600 text-white shrink-0"
          >
            <Zap className="w-3.5 h-3.5" />
            Ingredientes TPV
          </button>
        )}
      </div>

      <div className="space-y-2">
        {structure.map((slot, idx) => (
          <ComboPartRow
            key={`${idx}-${slot.catalogCategory || slot.slotKind}`}
            slot={slot}
            categories={categories}
            catalogItems={catalogItems}
            excludeItemId={excludeItemId}
            onPatch={(patch) => patchPart(idx, patch)}
            onRemove={() => removePart(idx)}
          />
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addPart}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Plus className="w-4 h-4" />
            Añadir parte
          </button>
          <span className="text-[11px] text-gray-400">Plantillas:</span>
          {MENU_SIZES.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              title={preset.hint}
            >
              {preset.id === 'estandar' && '1 persona'}
              {preset.id === 'duo' && '2 personas'}
              {preset.id === 'familiar' && 'Familia'}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
            Contenido por defecto (opcional)
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Si lo dejas vacío, el cliente elige al pedir. Si marcas productos, salen preseleccionados.
          </p>
        </div>
        <MenuProgressBar sections={menuSections} comboItems={comboItems} catalogItems={catalogItems} />
        {visibleSections.length === 0 ? (
          <p className="text-sm text-amber-800 dark:text-amber-300 rounded-xl border border-amber-200 px-4 py-3">
            Añade al menos una parte con organizador para componer el menú.
          </p>
        ) : (
          visibleSections.map((section) => (
            <CatalogSectionBlock
              key={comboMenuSectionKey(section)}
              section={section}
              comboItems={comboItems}
              catalogItems={catalogItems}
              excludeItemId={excludeItemId}
              compact={compact}
              onPick={pickProduct}
            />
          ))
        )}
        {menuComplete && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200 text-center font-medium">
            Menú completo — guarda los cambios
          </div>
        )}
      </div>
    </div>
  );
}
