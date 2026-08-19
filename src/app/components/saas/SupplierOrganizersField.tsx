import { useMemo } from 'react';
import {
  listInventoryOrganizerChoices,
  type InventoryCommercialBrand,
} from '../../lib/inventoryUtils';
import { commercialLineBrands } from '../../lib/deliveryCatalogImportLogic';

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  /** Marcas/líneas comerciales del negocio (para armar los organizadores). */
  brands?: Array<{
    _id: string;
    name: string;
    active?: boolean;
    deliveryLineKind?: string;
    catalogCategories?: string[];
    isDefault?: boolean;
  }>;
  labelClassName?: string;
};

/**
 * Multi-selección de organizadores de almacén a los que el proveedor suministra.
 */
export function SupplierOrganizersField({
  value,
  onChange,
  brands = [],
  labelClassName = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5',
}: Props) {
  const choices = useMemo(() => {
    const lines = commercialLineBrands(brands) as InventoryCommercialBrand[];
    return listInventoryOrganizerChoices(lines);
  }, [brands]);

  const selected = useMemo(
    () => new Set((Array.isArray(value) ? value : []).map((id) => String(id || '').trim()).filter(Boolean)),
    [value],
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <div>
      <label className={labelClassName}>Qué suministra</label>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        Elige uno o varios organizadores de tu almacén a los que este proveedor te lleva material.
      </p>
      {choices.length === 0 ? (
        <p className="text-sm text-gray-400">No hay organizadores disponibles todavía.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {choices.map((choice) => {
            const active = selected.has(choice.id);
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => toggle(choice.id)}
                className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-colors min-h-11 ${
                  active
                    ? 'border-sky-400 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
                aria-pressed={active}
              >
                {choice.label}
              </button>
            );
          })}
        </div>
      )}
      {selected.size > 0 ? (
        <p className="text-xs text-gray-400 mt-2">
          {selected.size} organizador{selected.size !== 1 ? 'es' : ''} seleccionado
          {selected.size !== 1 ? 's' : ''}
        </p>
      ) : null}
    </div>
  );
}

/** Etiquetas legibles de los organizadores guardados en un proveedor. */
export function labelsForSupplierOrganizerIds(
  organizerIds: string[] | undefined,
  brands: Array<{
    _id: string;
    name: string;
    active?: boolean;
    deliveryLineKind?: string;
    catalogCategories?: string[];
    isDefault?: boolean;
  }> = [],
): string[] {
  const ids = (Array.isArray(organizerIds) ? organizerIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  if (ids.length === 0) return [];
  const lines = commercialLineBrands(brands) as InventoryCommercialBrand[];
  const byId = new Map(listInventoryOrganizerChoices(lines).map((c) => [c.id, c.label]));
  return ids.map((id) => byId.get(id) || id);
}
