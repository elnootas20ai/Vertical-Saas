import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import {
  listInventoryOrganizerChoices,
  type InventoryCommercialBrand,
} from '../../lib/inventoryUtils';
import { commercialLineBrands } from '../../lib/deliveryCatalogImportLogic';
import { stockItemsForOrganizer } from '../../lib/purchaseSuggestions';
import type { CatalogItem } from '../../lib/deliveryApi';
import type { StoreIngredient } from '../../lib/catalogCustomization';
import {
  VERTIAL_ACCENT_BG,
  VERTIAL_ACCENT_BORDER,
  VERTIAL_BTN_SECONDARY,
} from '../../lib/vertialUiTokens';
import { CatalogUnitChip } from './CatalogUnitChip';

type BrandLike = {
  _id: string;
  name: string;
  active?: boolean;
  deliveryLineKind?: string;
  catalogCategories?: string[];
  isDefault?: boolean;
};

type Props = {
  organizerIds: string[];
  catalogItemIds: string[];
  itemCosts?: Record<string, string>;
  onChange: (next: {
    organizerIds: string[];
    catalogItemIds: string[];
    itemCosts: Record<string, string>;
  }) => void;
  brands?: BrandLike[];
  catalogItems?: CatalogItem[];
  storeIngredients?: StoreIngredient[];
  labelClassName?: string;
};

/**
 * Alta de proveedor: eliges un organizador del Excel/almacén
 * y marcas los productos que ese proveedor te vende.
 * Seleccionar en el desplegable ya añade el organizador y enseña sus productos.
 * El + es para añadir otro organizador a la lista.
 */
export function SupplierOrganizersField({
  organizerIds,
  catalogItemIds,
  itemCosts = {},
  onChange,
  brands = [],
  catalogItems = [],
  storeIngredients = [],
  labelClassName = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5',
}: Props) {
  const [pickId, setPickId] = useState('');
  const [openOrganizerId, setOpenOrganizerId] = useState('');
  const pickRef = useRef<HTMLSelectElement>(null);

  const commercialBrands = useMemo(
    () => commercialLineBrands(brands) as InventoryCommercialBrand[],
    [brands],
  );
  const choices = useMemo(
    () => listInventoryOrganizerChoices(commercialBrands),
    [commercialBrands],
  );
  const labelById = useMemo(
    () => new Map(choices.map((c) => [c.id, c.label])),
    [choices],
  );
  const selectedOrgs = useMemo(
    () => [...new Set((organizerIds || []).map((id) => String(id || '').trim()).filter(Boolean))],
    [organizerIds],
  );
  const selectedItems = useMemo(
    () => new Set((catalogItemIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
    [catalogItemIds],
  );
  const remaining = useMemo(
    () => choices.filter((c) => !selectedOrgs.includes(c.id)),
    [choices, selectedOrgs],
  );

  // Al editar: abrir el primer organizador para ver productos sin un clic extra.
  useEffect(() => {
    if (!openOrganizerId && selectedOrgs.length > 0) {
      setOpenOrganizerId(selectedOrgs[0]);
    }
  }, [selectedOrgs, openOrganizerId]);

  const emit = (nextOrgs: string[], nextItems: Set<string>, nextCosts = itemCosts) => {
    const costs: Record<string, string> = {};
    for (const id of nextItems) {
      if (nextCosts[id] != null && String(nextCosts[id]).trim() !== '') costs[id] = nextCosts[id];
    }
    onChange({ organizerIds: nextOrgs, catalogItemIds: [...nextItems], itemCosts: costs });
  };

  const addOrganizer = (rawId: string) => {
    const id = String(rawId || '').trim();
    if (!id || selectedOrgs.includes(id)) return;
    emit([...selectedOrgs, id], selectedItems);
    setOpenOrganizerId(id);
    setPickId('');
  };

  const removeOrganizer = (id: string) => {
    const itemsOfOrg = stockItemsForOrganizer(catalogItems, id, storeIngredients, commercialBrands);
    const nextItems = new Set(selectedItems);
    for (const item of itemsOfOrg) nextItems.delete(item._id);
    const nextOrgs = selectedOrgs.filter((x) => x !== id);
    emit(nextOrgs, nextItems);
    if (openOrganizerId === id) setOpenOrganizerId(nextOrgs[0] || '');
  };

  const toggleItem = (item: CatalogItem) => {
    const next = new Set(selectedItems);
    const nextCosts = { ...itemCosts };
    if (next.has(item._id)) {
      next.delete(item._id);
      delete nextCosts[item._id];
    } else {
      next.add(item._id);
      if (nextCosts[item._id] == null || String(nextCosts[item._id]).trim() === '') {
        const n = Number(item.costPrice);
        nextCosts[item._id] = Number.isFinite(n) && n > 0 ? String(n) : '';
      }
    }
    emit(selectedOrgs, next, nextCosts);
  };

  const setItemCost = (itemId: string, raw: string) => {
    emit(selectedOrgs, selectedItems, { ...itemCosts, [itemId]: raw });
  };

  const toggleAllInOrganizer = (_orgId: string, items: CatalogItem[], allOn: boolean) => {
    const next = new Set(selectedItems);
    const nextCosts = { ...itemCosts };
    for (const item of items) {
      if (allOn) {
        next.delete(item._id);
        delete nextCosts[item._id];
      } else {
        next.add(item._id);
        if (nextCosts[item._id] == null || String(nextCosts[item._id]).trim() === '') {
          const n = Number(item.costPrice);
          nextCosts[item._id] = Number.isFinite(n) && n > 0 ? String(n) : '';
        }
      }
    }
    emit(selectedOrgs, next, nextCosts);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClassName}>Qué te vende</label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Elige un grupo del almacén (Ingredientes, Bebidas, Envases…) y marca los artículos con el precio €/ud. Eso es lo que luego sale en el pedido. No es una etiqueta suelta: son los mismos grupos que en Almacén.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            ref={pickRef}
            value={pickId}
            onChange={(e) => {
              const id = e.target.value;
              setPickId(id);
              if (id) addOrganizer(id);
            }}
            className="flex-1 min-h-11 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500"
          >
            <option value="">Elegir grupo de almacén…</option>
            {remaining.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              if (pickId) {
                addOrganizer(pickId);
                return;
              }
              pickRef.current?.focus();
            }}
            disabled={remaining.length === 0}
            className={VERTIAL_BTN_SECONDARY}
            title="Añadir otro grupo de almacén"
          >
            <Plus className="w-4 h-4" />
            Añadir otro
          </button>
        </div>
        {choices.length === 0 ? (
          <p className="text-sm text-gray-400 mt-2">No hay grupos de almacén todavía. Importa el Excel de catálogo/almacén.</p>
        ) : remaining.length === 0 && selectedOrgs.length > 0 ? (
          <p className="text-xs text-gray-400 mt-2">Ya tienes todos los grupos de almacén añadidos.</p>
        ) : null}
      </div>

      {selectedOrgs.length > 0 ? (
        <div className="space-y-2">
          {selectedOrgs.map((orgId) => {
            const items = stockItemsForOrganizer(catalogItems, orgId, storeIngredients, commercialBrands);
            const checkedCount = items.filter((i) => selectedItems.has(i._id)).length;
            const open = openOrganizerId === orgId;
            const allOn = items.length > 0 && checkedCount === items.length;
            return (
              <div
                key={orgId}
                className={`rounded-xl border-2 overflow-hidden ${
                  open ? `${VERTIAL_ACCENT_BORDER} ${VERTIAL_ACCENT_BG}` : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setOpenOrganizerId(open ? '' : orgId)}
                    aria-expanded={open}
                    className="flex-1 min-w-0 flex items-center gap-2 px-2 py-2 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    <ChevronDown
                      className={`w-5 h-5 shrink-0 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
                        open ? 'rotate-0' : '-rotate-90'
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {labelById.get(orgId) || orgId}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {items.length === 0
                          ? 'Sin artículos de almacén en este grupo'
                          : `${checkedCount} de ${items.length} producto${items.length !== 1 ? 's' : ''} marcado${checkedCount !== 1 ? 's' : ''}`}
                      </p>
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 shrink-0 hidden sm:inline">
                      {open ? 'Cerrar' : 'Abrir'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeOrganizer(orgId)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    title="Quitar grupo de almacén"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {open ? (
                  <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
                    {items.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">
                        Este grupo no tiene productos de almacén. Cuando los importes en el Excel, saldrán aquí para marcarlos.
                      </p>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleAllInOrganizer(orgId, items, allOn)}
                          className="text-xs font-semibold text-[var(--v-blue,#2563eb)] mb-2 hover:underline"
                        >
                          {allOn ? 'Quitar todos' : 'Marcar todos'}
                        </button>
                        <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                          {items.map((item) => {
                            const on = selectedItems.has(item._id);
                            return (
                              <li key={item._id} className="py-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleItem(item)}
                                    className="min-w-0 flex-1 flex items-center gap-2 text-left text-sm"
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
                                    <span className="min-w-0 flex-1 truncate font-medium text-gray-900 dark:text-gray-100">
                                      {item.name}
                                    </span>
                                    <CatalogUnitChip unit={item.unit} size="sm" />
                                  </button>
                                  {on ? (
                                    <label className="flex items-center gap-1 shrink-0">
                                      <span className="text-[11px] text-gray-400">€/ud</span>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        inputMode="decimal"
                                        value={itemCosts[item._id] ?? ''}
                                        placeholder="0"
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => setItemCost(item._id, e.target.value)}
                                        className="w-20 px-2 py-1.5 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm tabular-nums text-right text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500"
                                      />
                                    </label>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Etiquetas legibles de los organizadores guardados en un proveedor. */
export function labelsForSupplierOrganizerIds(
  organizerIds: string[] | undefined,
  brands: BrandLike[] = [],
): string[] {
  const ids = (Array.isArray(organizerIds) ? organizerIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  if (ids.length === 0) return [];
  const lines = commercialLineBrands(brands) as InventoryCommercialBrand[];
  const byId = new Map(listInventoryOrganizerChoices(lines).map((c) => [c.id, c.label]));
  return ids.map((id) => byId.get(id) || id);
}

export function initialSupplierCatalogItemIds(
  supplier: { _id?: string; catalogItemIds?: string[] } | null | undefined,
  catalogItems: CatalogItem[],
): string[] {
  const fromDoc = (Array.isArray(supplier?.catalogItemIds) ? supplier!.catalogItemIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  if (fromDoc.length > 0) return [...new Set(fromDoc)];
  const sid = String(supplier?._id || '').trim();
  if (!sid) return [];
  return catalogItems.filter((i) => i.supplierId === sid).map((i) => i._id);
}

export function initialSupplierItemCosts(
  itemIds: string[],
  catalogItems: CatalogItem[],
): Record<string, string> {
  const byId = new Map(catalogItems.map((i) => [i._id, i]));
  const out: Record<string, string> = {};
  for (const id of itemIds) {
    const n = Number(byId.get(id)?.costPrice);
    if (Number.isFinite(n) && n > 0) out[id] = String(n);
  }
  return out;
}

export function parseSupplierItemCosts(raw: Record<string, string> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw || {})) {
    const n = Number(String(value || '').replace(',', '.').trim());
    if (!id || !Number.isFinite(n) || n < 0) continue;
    out[id] = Math.round(n * 10000) / 10000;
  }
  return out;
}
