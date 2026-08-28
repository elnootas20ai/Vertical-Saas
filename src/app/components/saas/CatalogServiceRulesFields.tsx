import { CheckCircle2 } from 'lucide-react';
import type { Brand } from '../../lib/brandsApi';
import {
  CATALOG_SERVICE_APPLICATION_OPTIONS,
  CATALOG_SERVICE_DELIVERY_TYPE_OPTIONS,
  type CatalogServiceRules,
} from '../../lib/catalogServiceRules';
import {
  deliveryBrandLineKindLabel,
  getDeliveryBrandLinePreset,
  DELIVERY_BRAND_LINE_ICON_BOX,
} from '../../lib/deliveryBrandLineKinds';
import { sortBrandsForDisplay } from '../../lib/brandUtils';

const labelClass =
  'block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1';

export function CatalogServiceRulesFields({
  rules,
  onChange,
  brands,
  showValidation,
}: {
  rules: CatalogServiceRules;
  onChange: (next: CatalogServiceRules) => void;
  brands: Brand[];
  showValidation?: boolean;
}) {
  const activeBrands = sortBrandsForDisplay(brands.filter((b) => b.active !== false));
  const needsWhen = rules.applicationMode === 'automatic' || rules.applicationMode === 'both';
  const showDeliveryTypesError =
    showValidation && needsWhen && rules.deliveryTypes.length === 0;
  const showBrandError =
    showValidation && rules.brandScope === 'selected' && rules.brandIds.length === 0;

  const toggleDeliveryType = (value: (typeof CATALOG_SERVICE_DELIVERY_TYPE_OPTIONS)[number]['value']) => {
    const has = rules.deliveryTypes.includes(value);
    onChange({
      ...rules,
      deliveryTypes: has
        ? rules.deliveryTypes.filter((d) => d !== value)
        : [...rules.deliveryTypes, value],
    });
  };

  const toggleBrand = (brandId: string) => {
    const has = rules.brandIds.includes(brandId);
    onChange({
      ...rules,
      brandIds: has ? rules.brandIds.filter((id) => id !== brandId) : [...rules.brandIds, brandId],
    });
  };

  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-800/60 bg-violet-50/50 dark:bg-violet-950/20 p-3 space-y-3">
      <div>
        <p className="text-xs font-bold text-violet-900 dark:text-violet-200">Reglas del servicio</p>
        <p className="text-[11px] text-violet-800/80 dark:text-violet-300/80 mt-0.5">
          Nombre y precio arriba; aquí defines si entra solo, automático, o ambos.
        </p>
      </div>

      <div>
        <label className={labelClass}>Cómo entra en el pedido</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
          {CATALOG_SERVICE_APPLICATION_OPTIONS.map((opt) => {
            const active = rules.applicationMode === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ ...rules, applicationMode: opt.value })}
                className={`rounded-xl border px-2.5 py-2 text-left transition-colors ${
                  active
                    ? 'border-violet-600 bg-violet-600 text-white'
                    : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 hover:border-violet-300'
                }`}
              >
                <div className="text-xs font-bold leading-tight">{opt.label}</div>
                <div
                  className={`mt-0.5 text-[10px] leading-tight ${
                    active ? 'text-white/80' : 'text-stone-500 dark:text-stone-400'
                  }`}
                >
                  {opt.desc}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {needsWhen ? (
        <div>
          <label className={labelClass}>Cuándo se aplica automáticamente</label>
          <div className="flex flex-wrap gap-1.5">
            {CATALOG_SERVICE_DELIVERY_TYPE_OPTIONS.map((opt) => {
              const selected = rules.deliveryTypes.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleDeliveryType(opt.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                    selected
                      ? 'border-violet-600 bg-violet-100 dark:bg-violet-900/40 text-violet-900 dark:text-violet-100'
                      : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400 hover:border-violet-300'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {showDeliveryTypesError ? (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Elige al menos un tipo de pedido.
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <label className={labelClass}>Aplica en</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(
            [
              { value: 'all' as const, label: 'Todas las marcas' },
              { value: 'selected' as const, label: 'Solo estas marcas' },
            ] as const
          ).map((opt) => {
            const active = rules.brandScope === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  onChange({
                    ...rules,
                    brandScope: opt.value,
                    brandIds: opt.value === 'all' ? [] : rules.brandIds,
                  })
                }
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                  active
                    ? 'border-violet-600 bg-violet-600 text-white'
                    : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-400'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {rules.brandScope === 'selected' ? (
          activeBrands.length === 0 ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Crea marcas comerciales en Ajustes para acotar el servicio.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-32 overflow-y-auto pr-1">
              {activeBrands.map((b) => {
                const selected = rules.brandIds.includes(b._id);
                const preset = getDeliveryBrandLinePreset(b.deliveryLineKind);
                const accent = b.primaryColor || preset?.primaryColor || '#7c3aed';
                const lineLabel = b.deliveryLineKind
                  ? deliveryBrandLineKindLabel(b.deliveryLineKind)
                  : null;
                return (
                  <button
                    key={b._id}
                    type="button"
                    onClick={() => toggleBrand(b._id)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-all ${
                      selected
                        ? 'border-violet-600 bg-violet-50 dark:bg-violet-950/40 ring-1 ring-violet-500/20'
                        : 'border-stone-200 dark:border-stone-700 hover:border-violet-300'
                    }`}
                  >
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                      style={{ background: `linear-gradient(145deg, ${accent}, ${accent}cc)` }}
                    >
                      {b.name.trim().charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold truncate leading-tight">{b.name}</div>
                      {lineLabel ? (
                        <span
                          className={`inline-block mt-0.5 text-[9px] font-semibold px-1 py-px rounded ${
                            preset
                              ? DELIVERY_BRAND_LINE_ICON_BOX[
                                  preset.id as keyof typeof DELIVERY_BRAND_LINE_ICON_BOX
                                ]
                              : 'bg-stone-100 text-stone-600'
                          }`}
                        >
                          {lineLabel}
                        </span>
                      ) : null}
                    </div>
                    {selected ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          )
        ) : null}
        {showBrandError ? (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            Elige al menos una marca o usa «Todas las marcas».
          </p>
        ) : null}
      </div>

      <div className="space-y-2 pt-1 border-t border-violet-200/80 dark:border-violet-800/40">
        <button
          type="button"
          onClick={() => onChange({ ...rules, cashierCanRemove: !rules.cashierCanRemove })}
          className={`w-full p-3 rounded-xl border text-left transition-all ${
            rules.cashierCanRemove
              ? 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900'
              : 'border-violet-400 bg-violet-100/60 dark:bg-violet-900/30'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-stone-900 dark:text-stone-100">
                El cajero puede quitarlo
              </div>
              <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-0.5">
                {needsWhen
                  ? 'Si está desactivado, el cargo automático no se puede eliminar en TPV.'
                  : 'Solo aplica si el servicio entra automáticamente.'}
              </p>
            </div>
            <div
              className={`w-10 h-5 rounded-full relative shrink-0 transition-colors ${
                rules.cashierCanRemove ? 'bg-stone-300 dark:bg-stone-600' : 'bg-violet-600'
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  rules.cashierCanRemove ? 'translate-x-0.5' : 'translate-x-5'
                }`}
              />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChange({ ...rules, tpvOnly: !rules.tpvOnly })}
          className={`w-full p-3 rounded-xl border text-left transition-all ${
            rules.tpvOnly
              ? 'border-violet-400 bg-violet-100/60 dark:bg-violet-900/30'
              : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-stone-900 dark:text-stone-100">Solo TPV</div>
              <p className="text-[10px] text-stone-500 dark:text-stone-400 mt-0.5">
                No aparece en la web para que el cliente lo pida a mano.
              </p>
            </div>
            <div
              className={`w-10 h-5 rounded-full relative shrink-0 transition-colors ${
                rules.tpvOnly ? 'bg-violet-600' : 'bg-stone-300 dark:bg-stone-600'
              }`}
            >
              <div
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  rules.tpvOnly ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
