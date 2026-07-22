import { useEffect, useMemo, useState } from 'react';
import { Check, Search, Zap } from 'lucide-react';
import type { CatalogComboRef, CatalogItem } from '../../lib/deliveryApi';
import {
  COMBO_MENU_PRESETS,
  COMBO_SLOT_META,
  DEFAULT_COMBO_STRUCTURE,
  buildComboMenuSections,
  catalogProductsForComboSection,
  comboItemsInCatalogSection,
  comboItemsInSlotKind,
  inferComboMenuPresetId,
  isComboMenuComplete,
  normalizeComboItemsForSave,
  pickComboProductInSection,
  totalUnitsInCatalogSection,
  totalUnitsInSlotKind,
  type ComboMenuCatalogSection,
  type ComboSlotKind,
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
  const steps = useMemo(() => {
    const map = new Map<ComboSlotKind, { label: string; emoji: string; quota: number; required: boolean }>();
    for (const s of sections) {
      if (s.slotQuota <= 0) continue;
      if (!map.has(s.slotKind)) {
        map.set(s.slotKind, {
          label: COMBO_SLOT_META[s.slotKind].shortLabel,
          emoji: COMBO_SLOT_META[s.slotKind].emoji,
          quota: s.slotQuota,
          required: s.required,
        });
      }
    }
    return (['main', 'side', 'drink', 'dessert'] as const)
      .filter((k) => map.has(k))
      .map((k) => ({ kind: k, ...map.get(k)! }));
  }, [sections]);

  if (steps.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
      {steps.map((step) => {
        const have = totalUnitsInSlotKind(step.kind, comboItems, catalogItems);
        const done = have >= step.quota;
        return (
          <div
            key={step.kind}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
              done
                ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
            }`}
          >
            <span>{step.emoji}</span>
            <span>{step.label}</span>
            <span className="tabular-nums opacity-80">
              {have}/{step.quota}
            </span>
            {done ? <Check className="w-3.5 h-3.5" /> : null}
          </div>
        );
      })}
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
  const slotSelected = comboItemsInSlotKind(section.slotKind, comboItems, catalogItems);
  const categoryNeed = section.expectedCount;
  const slotNeed = section.slotQuota;
  const categoryHave = totalUnitsInCatalogSection(section, comboItems, catalogItems);
  const slotHave = totalUnitsInSlotKind(section.slotKind, comboItems, catalogItems);
  const categoryDone = categoryNeed > 0 && categoryHave >= categoryNeed;
  const slotDone = slotNeed > 0 && slotHave >= slotNeed;

  const products = useMemo(() => {
    const q = foldTpvSearchText(search);
    return catalogProductsForComboSection(section, catalogItems, excludeItemId).filter((p) => {
      if (!q) return true;
      return foldTpvSearchText(p.name).includes(q) || foldTpvSearchText(p.sku || '').includes(q);
    });
  }, [section, catalogItems, excludeItemId, search]);

  const pickLabel =
    categoryNeed > 1
      ? `Elige ${categoryNeed} de esta sección`
      : slotNeed > 1 && section.slotKind !== 'main'
        ? `Elige ${slotNeed} (${slotHave}/${slotNeed} en total)`
        : slotNeed > 1
          ? `Elige ${categoryNeed || slotNeed} (${categoryHave}/${categoryNeed || slotNeed})`
          : section.required || slotNeed > 0
            ? 'Elige 1'
            : 'Opcional';

  return (
    <section className={`rounded-2xl border-2 ${style.border} ${style.bg} overflow-hidden`}>
      <div className="px-4 py-3 border-b border-inherit flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{style.emoji}</span>
          <div>
            <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">
              {section.catalogCategory}
            </h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {pickLabel}
            </p>
          </div>
        </div>
        {(categoryDone || (slotDone && slotSelected.some((s) => selected.some((x) => x.productId === s.productId)))) && (
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
        {categoryDone ? (
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
  const initialStructure =
    comboStructureProp && comboStructureProp.length > 0
      ? comboStructureProp.map((s) => ({ ...s }))
      : DEFAULT_COMBO_STRUCTURE.map((s) => ({ ...s }));

  const [sizeId, setSizeId] = useState(() => {
    const id = inferComboMenuPresetId(initialStructure);
    return id === 'custom' ? 'estandar' : id || 'estandar';
  });

  useEffect(() => {
    onStructureConfirmedChange?.(true);
  }, [onStructureConfirmedChange]);

  const menuSections = useMemo(
    () => buildComboMenuSections(sizeId, catalogItems),
    [sizeId, catalogItems],
  );

  const visibleSections = menuSections.filter(
    (s) => s.slotQuota > 0 || s.expectedCount > 0,
  );

  const menuComplete = isComboMenuComplete(menuSections, comboItems, catalogItems);

  const emitChange = (next: CatalogComboRef[]) => {
    onChange(normalizeComboItemsForSave(next, catalogItems));
  };

  const applySize = (presetId: string) => {
    const preset = COMBO_MENU_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSizeId(presetId);
    onStructureChange?.(preset.structure.map((s) => ({ ...s })));
    onStructureConfirmedChange?.(true);
    if (comboItems.length > 0) emitChange([]);
  };

  const pickProduct = (section: ComboMenuCatalogSection, product: CatalogItem) => {
    const next = pickComboProductInSection(section, product, comboItems, catalogItems);
    if (next) emitChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Arma el menú</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            Elige pizza, complemento y bebida — las mismas secciones que en tu catálogo.
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

      <div>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Tamaño del menú</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {MENU_SIZES.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applySize(preset.id)}
              className={`p-3 rounded-xl border-2 text-left ${
                sizeId === preset.id
                  ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <span className="block text-sm font-bold">
                {preset.id === 'estandar' && '1 persona'}
                {preset.id === 'duo' && '2 personas'}
                {preset.id === 'familiar' && 'Familia'}
              </span>
              <span className={`block text-xs mt-1 ${sizeId === preset.id ? 'opacity-90' : 'text-gray-500'}`}>
                {preset.hint}
              </span>
            </button>
          ))}
        </div>
      </div>

      <MenuProgressBar sections={menuSections} comboItems={comboItems} catalogItems={catalogItems} />

      <div className="space-y-3">
        {visibleSections.length === 0 ? (
          <p className="text-sm text-amber-800 dark:text-amber-300 rounded-xl border border-amber-200 px-4 py-3">
            No hay secciones de catálogo detectadas. Importa productos en Pizzas, Complementos y Bebidas.
          </p>
        ) : (
          visibleSections.map((section) => (
            <CatalogSectionBlock
              key={`${section.slotKind}-${section.catalogCategory}`}
              section={section}
              comboItems={comboItems}
              catalogItems={catalogItems}
              excludeItemId={excludeItemId}
              compact={compact}
              onPick={pickProduct}
            />
          ))
        )}
      </div>

      {menuComplete && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200 text-center font-medium">
          Menú completo — guarda los cambios
        </div>
      )}
    </div>
  );
}
