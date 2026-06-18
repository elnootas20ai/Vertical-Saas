import { useEffect, useMemo, useState } from 'react';
import { X, Plus, Minus, MessageSquare } from 'lucide-react';
import type { CatalogItem } from '../../../lib/deliveryApi';
import {
  type CartLineCustomization,
  type CatalogSupplement,
  cartLineUnitPrice,
  isCustomizableCatalogItem,
  parseCatalogIngredients,
  parseCatalogSupplements,
  type StoreIngredient,
} from '../../../lib/catalogCustomization';
import { useModalClose } from '../../../hooks/useModalClose';

type TpvItemCustomizeModalProps = {
  item: CatalogItem;
  initial?: CartLineCustomization;
  formatPrice: (n: number) => string;
  templates?: import('../../../lib/catalogCustomization').TpvCategoryTemplates;
  storeIngredients?: StoreIngredient[];
  brandIngredientSelection?: import('../../../lib/catalogCustomization').TpvBrandIngredientSelection;
  brandSupplements?: import('../../../lib/catalogCustomization').TpvBrandSupplements;
  defaultExtraPrice?: number;
  brands?: Array<{ _id: string; deliveryLineKind?: string; catalogCategories?: string[] }>;
  onClose: () => void;
  onConfirm: (customization: CartLineCustomization) => void;
};

export function TpvItemCustomizeModal({
  item,
  initial,
  formatPrice,
  templates,
  storeIngredients,
  brandIngredientSelection,
  brandSupplements,
  defaultExtraPrice,
  brands,
  onClose,
  onConfirm,
}: TpvItemCustomizeModalProps) {
  useModalClose(true, onClose);

  const customizable = isCustomizableCatalogItem(item, brands);
  const tpvResolveOptions = useMemo(
    () => ({ productIngredientsOnly: true, storeExtrasOnly: true }),
    [],
  );
  const ingredients = useMemo(
    () =>
      parseCatalogIngredients(
        item,
        templates,
        storeIngredients,
        brandIngredientSelection,
        undefined,
        brands,
        tpvResolveOptions,
      ),
    [item, templates, storeIngredients, brandIngredientSelection, brands, tpvResolveOptions],
  );
  const supplements = useMemo(
    () =>
      parseCatalogSupplements(
        item,
        templates,
        brandSupplements,
        undefined,
        storeIngredients,
        defaultExtraPrice,
        brands,
        tpvResolveOptions,
      ),
    [item, templates, brandSupplements, storeIngredients, defaultExtraPrice, brands, tpvResolveOptions],
  );

  const [removed, setRemoved] = useState<string[]>(initial?.removedIngredients || []);
  const [added, setAdded] = useState<CatalogSupplement[]>(initial?.addedSupplements || []);
  const [notes, setNotes] = useState(initial?.notes || '');

  useEffect(() => {
    setRemoved(initial?.removedIngredients || []);
    setAdded(initial?.addedSupplements || []);
    setNotes(initial?.notes || '');
  }, [item._id, initial]);

  const customization: CartLineCustomization = {
    removedIngredients: removed,
    addedSupplements: added,
    notes: notes.trim(),
  };

  const unitTotal = cartLineUnitPrice(item.unitPrice, customization);

  const toggleIngredient = (name: string) => {
    setRemoved((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };

  const toggleSupplement = (sup: CatalogSupplement) => {
    setAdded((prev) => {
      const exists = prev.some((s) => s.id === sup.id);
      return exists ? prev.filter((s) => s.id !== sup.id) : [...prev, sup];
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md max-h-[92vh] overflow-hidden bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col">
        <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {customizable ? 'Personalizar' : 'Añadir al pedido'}
            </p>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{item.name}</h2>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
              {formatPrice(unitTotal)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {!customizable && (
            <section>
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                <MessageSquare className="w-3.5 h-3.5" />
                Notas
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: sin cebolla, para llevar, poco hecha, alergia…"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none focus:border-gray-900 dark:focus:border-gray-400 outline-none"
                autoFocus
              />
            </section>
          )}

          {customizable && ingredients.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Ingredientes
              </h3>
              <div className="flex flex-wrap gap-2">
                {ingredients.map((name) => {
                  const isRemoved = removed.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleIngredient(name)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors ${
                        isRemoved
                          ? 'border-red-300 bg-red-50 text-red-700 line-through dark:bg-red-950/30 dark:border-red-800 dark:text-red-300'
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {isRemoved ? <Minus className="w-3 h-3 inline mr-1" /> : null}
                      {name}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {customizable && supplements.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Suplementos
              </h3>
              <div className="space-y-2">
                {supplements.map((sup) => {
                  const active = added.some((s) => s.id === sup.id);
                  return (
                    <button
                      key={sup.id}
                      type="button"
                      onClick={() => toggleSupplement(sup)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-colors ${
                        active
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                      }`}
                    >
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {active ? <Plus className="w-3.5 h-3.5 inline mr-1 text-emerald-600" /> : null}
                        {sup.name}
                      </span>
                      <span className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                        +{formatPrice(sup.price)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {customizable && (
            <section>
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                <MessageSquare className="w-3.5 h-3.5" />
                Notas para cocina
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: poco hecha, sin sal, cortar en 4…"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 resize-none focus:border-gray-900 dark:focus:border-gray-400 outline-none"
              />
            </section>
          )}
        </div>

        <div className="shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <button
            type="button"
            onClick={() => onConfirm(customization)}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors"
          >
            Añadir al pedido · {formatPrice(unitTotal)}
          </button>
        </div>
      </div>
    </div>
  );
}
