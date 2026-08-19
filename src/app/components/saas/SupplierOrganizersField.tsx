import { useMemo, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
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
  onChange: (next: { organizerIds: string[]; catalogItemIds: string[] }) => void;
  brands?: BrandLike[];
  catalogItems?: CatalogItem[];
  storeIngredients?: StoreIngredient[];
  labelClassName?: string;
};

/**
 * Alta de proveedor: eliges un organizador del Excel/almacén (no todos a la vez)
 * y marcas los productos que ese proveedor te vende.
 */
export function SupplierOrganizersField({
  organizerIds,
  catalogItemIds,
  onChange,
  brands = [],
  catalogItems = [],
  storeIngredients = [],
  labelClassName = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5',
}: Props) {
  const [pickId, setPickId] = useState('');
  const [openOrganizerId, setOpenOrganizerId] = useState('');

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

  const emit = (nextOrgs: string[], nextItems: Set<string>) => {
    onChange({ organizerIds: nextOrgs, catalogItemIds: [...nextItems] });
  };

  const addOrganizer = () => {
    const id = String(pickId || '').trim();
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

  const toggleItem = (itemId: string) => {
    const next = new Set(selectedItems);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    emit(selectedOrgs, next);
  };

  const toggleAllInOrganizer = (orgId: string, items: CatalogItem[], allOn: boolean) => {
    const next = new Set(selectedItems);
    for (const item of items) {
      if (allOn) next.delete(item._id);
      else next.add(item._id);
    }
    emit(selectedOrgs, next);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClassName}>Qué te vende</label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Elige un organizador (los del Excel / almacén) y marca solo los productos que este proveedor te lleva. Puedes añadir varios, uno a uno.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={pickId}
            onChange={(e) => setPickId(e.target.value)}
            className="flex-1 min-h-11 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-blue-500"
          >
            <option value="">Elegir organizador…</option>
            {remaining.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addOrganizer}
            disabled={!pickId}
            className={VERTIAL_BTN_SECONDARY}
          >
            <Plus className="w-4 h-4" />
            Añadir
          </button>
        </div>
        {choices.length === 0 ? (
          <p className="text-sm text-gray-400 mt-2">No hay organizadores todavía. Importa el Excel de catálogo/almacén.</p>
        ) : remaining.length === 0 && selectedOrgs.length > 0 ? (
          <p className="text-xs text-gray-400 mt-2">Ya tienes todos los organizadores añadidos.</p>
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
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpenOrganizerId(open ? '' : orgId)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {labelById.get(orgId) || orgId}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {items.length === 0
                        ? 'Sin artículos de almacén en este organizador'
                        : `${checkedCount} de ${items.length} producto${items.length !== 1 ? 's' : ''} marcado${checkedCount !== 1 ? 's' : ''}`}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeOrganizer(orgId)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    title="Quitar organizador"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {open ? (
                  <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2">
                    {items.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">
                        Este organizador no tiene productos de almacén. Cuando los importes en el Excel, saldrán aquí para marcarlos.
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
                        <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                          {items.map((item) => {
                            const on = selectedItems.has(item._id);
                            return (
                              <li key={item._id}>
                                <button
                                  type="button"
                                  onClick={() => toggleItem(item._id)}
                                  className="w-full flex items-center gap-2 py-2 text-left text-sm"
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
                                  <span className="min-w-0 truncate font-medium text-gray-900 dark:text-gray-100">
                                    {item.name}
                                  </span>
                                </button>
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
