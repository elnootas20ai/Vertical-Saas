import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock, Receipt, Save, Scale, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Brand } from '../../../lib/brandApi';
import {
  getBrandBillingConfigRequest,
  saveBrandBillingConfigRequest,
} from '../../../lib/brandBillingApi';
import {
  assignBrandToSheetExclusive,
  brandsForBilling,
  emptyBrandBillingConfig,
  isBrandBillingUnlocked,
  removeBrandFromSheet,
  resolveBrandFoodUnitKey,
  suggestBillingSheetsFromBrands,
  syncBillingSheetsWithBrands,
  type BrandBillingConfig,
  type BrandBillingSheet,
} from '../../../lib/brandBillingConfig';
import { deliveryBrandLineKindLabel } from '../../../lib/deliveryBrandLineKinds';

const saveBtnClass =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-900 bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900';

export function BrandBillingSettingsPanel({
  businessId,
  brands,
}: {
  businessId: string;
  brands: Brand[];
}) {
  const unlocked = isBrandBillingUnlocked(brands);
  const selectableBrands = useMemo(() => brandsForBilling(brands), [brands]);
  const brandSyncKey = useMemo(
    () =>
      brands
        .map(
          (b) =>
            `${b._id || b.id}:${b.name}:${b.deliveryLineKind || ''}:${b.active !== false ? 1 : 0}`,
        )
        .join('|'),
    [brands],
  );
  const brandsRef = useRef(brands);
  brandsRef.current = brands;

  const [config, setConfig] = useState<BrandBillingConfig>(() => emptyBrandBillingConfig(businessId));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lockedHint, setLockedHint] = useState(false);

  const load = useCallback(async () => {
    if (!businessId || !unlocked) return;
    const brandsNow = brandsRef.current;
    setLoading(true);
    try {
      const remote = await getBrandBillingConfigRequest(businessId);
      if (remote.sheets.length === 0) {
        setConfig({
          ...remote,
          sheets: suggestBillingSheetsFromBrands(brandsNow),
        });
      } else {
        setConfig({
          ...remote,
          sheets: syncBillingSheetsWithBrands(remote.sheets, brandsNow),
        });
      }
    } catch (err) {
      console.error(err);
      toast.error('No se pudo cargar Facturación de marcas');
      setConfig({
        ...emptyBrandBillingConfig(businessId),
        sheets: suggestBillingSheetsFromBrands(brandsNow),
      });
    } finally {
      setLoading(false);
    }
  }, [businessId, unlocked, brandSyncKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateSheet = (sheetId: string, patch: Partial<BrandBillingSheet>) => {
    setConfig((prev) => ({
      ...prev,
      sheets: prev.sheets.map((s) => (s.id === sheetId ? { ...s, ...patch } : s)),
    }));
  };

  const toggleBrand = (sheetId: string, brandId: string) => {
    setConfig((prev) => {
      const sheet = prev.sheets.find((s) => s.id === sheetId);
      const has = sheet?.brandIds.includes(brandId);
      const sheets = has
        ? removeBrandFromSheet(prev.sheets, sheetId, brandId, brands)
        : assignBrandToSheetExclusive(prev.sheets, sheetId, brandId, brands);
      return { ...prev, sheets };
    });
  };

  const sheetOwningBrand = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of config.sheets) {
      for (const id of s.brandIds) {
        if (!map.has(id)) map.set(id, s.label || s.id);
      }
    }
    return map;
  }, [config.sheets]);

  const removeSheet = (sheetId: string) => {
    setConfig((prev) => ({
      ...prev,
      sheets: prev.sheets.filter((s) => s.id !== sheetId),
    }));
  };

  const handleSave = async () => {
    if (!businessId) {
      toast.error('Falta la empresa activa');
      return;
    }
    setSaving(true);
    try {
      const sheets =
        config.sheets.length === 0
          ? suggestBillingSheetsFromBrands(brands)
          : syncBillingSheetsWithBrands(config.sheets, brands);
      const toSave = { ...config, sheets, sharedSplitMode: 'majority' as const };
      const saved = await saveBrandBillingConfigRequest(businessId, toSave);
      setConfig({
        ...saved,
        sheets: syncBillingSheetsWithBrands(saved.sheets, brands),
      });
      toast.success('Facturación entre marcas guardada');
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  if (!unlocked) {
    return (
      <section className="rounded-2xl border border-dashed border-gray-300 bg-gray-50/80 p-4 dark:border-gray-600 dark:bg-gray-900/40">
        <button
          type="button"
          onClick={() => setLockedHint(true)}
          className="flex w-full items-start gap-3 text-left"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            <Lock className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-gray-400" />
              Facturación
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Reparto de ingresos entre marcas (Excel de cierre y pedidos mezclados).
            </p>
            {lockedHint ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                Necesitas 2 o más marcas para gestionar esto
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-gray-400">Pulsa para más info</p>
            )}
          </div>
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5 text-gray-500" />
            Facturación
          </p>
          <p className="mt-0.5 max-w-xl text-[11px] leading-snug text-gray-500 dark:text-gray-400">
            Hojas Excel y reglas de cruce. Cada marca solo en una hoja.
          </p>
        </div>
        <button type="button" onClick={() => void handleSave()} className={saveBtnClass} disabled={loading || saving}>
          <Save className="h-3.5 w-3.5" />
          {saving ? '…' : 'Guardar'}
        </button>
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-gray-500">Cargando…</p>
      ) : (
        <div className="mt-3 space-y-2">
          {config.sheets.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500 dark:border-gray-600">
              Sin hojas. Pulsa Guardar para crear una por marca.
            </p>
          ) : (
            config.sheets.map((sheet) => (
              <div
                key={sheet.id}
                className="rounded-lg border border-gray-200 bg-gray-50/50 p-2.5 dark:border-gray-700 dark:bg-gray-800/40"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    className="min-w-[8rem] flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-900 outline-none focus:border-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    value={sheet.label}
                    onChange={(e) => updateSheet(sheet.id, { label: e.target.value })}
                    placeholder="Nombre hoja"
                  />
                  <button
                    type="button"
                    onClick={() => removeSheet(sheet.id)}
                    className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                    title="Quitar hoja"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Marcas</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectableBrands.map((b) => {
                      const id = b._id || b.id;
                      const on = sheet.brandIds.includes(id);
                      const ownedElsewhere = !on ? sheetOwningBrand.get(id) : undefined;
                      const unitKey = resolveBrandFoodUnitKey(b);
                      const typeHint = b.deliveryLineKind
                        ? deliveryBrandLineKindLabel(b.deliveryLineKind)
                        : unitKey === 'pizza'
                          ? 'Pizza'
                          : unitKey === 'burger'
                            ? 'Burger'
                            : unitKey === 'taco'
                              ? 'Tacos'
                              : null;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleBrand(sheet.id, id)}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                            on
                              ? 'bg-indigo-600 text-white'
                              : ownedElsewhere
                                ? 'bg-gray-50 text-gray-400 ring-1 ring-dashed ring-gray-300 dark:bg-gray-800/50 dark:text-gray-500 dark:ring-gray-600'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                          }`}
                          title={
                            ownedElsewhere
                              ? `Ahora en «${ownedElsewhere}». Pulsa para moverla aquí.`
                              : typeHint || 'Sin tipo de producto'
                          }
                        >
                          {b.name}
                          {typeHint ? (
                            <span className={`ml-1 ${on ? 'text-indigo-100' : 'text-gray-400'}`}>
                              · {typeHint}
                            </span>
                          ) : null}
                          {ownedElsewhere ? (
                            <span className="ml-1 text-[9px]">→ {ownedElsewhere}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(() => {
                  const sheetName = (sheet.label || 'esta hoja').trim() || 'esta hoja';
                  const hasBrands = sheet.brandIds.length > 0;
                  const hasUnits = sheet.unitColumns.length > 0;
                  if (hasBrands && hasUnits) {
                    return (
                      <p className="mt-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                        Excel: {sheet.unitColumns.map((c) => c.header).join(' · ')}
                      </p>
                    );
                  }
                  if (!hasBrands) {
                    return (
                      <p className="mt-1.5 text-[10px] leading-snug text-amber-700 dark:text-amber-300">
                        Sin marcas en esta hoja: no se facturará nada a nombre de «{sheetName}».
                        Pulsa una marca de arriba para asignarla aquí.
                      </p>
                    );
                  }
                  return (
                    <p className="mt-1.5 text-[10px] leading-snug text-amber-700 dark:text-amber-300">
                      Esta hoja no tiene tipo de producto (Pizza / Burger / Tacos): no se
                      facturará a nombre de «{sheetName}» hasta que edites la marca en Empresa
                      → Marca.
                    </p>
                  );
                })()}
              </div>
            ))
          )}

          <div className="mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-start gap-2.5 border-b border-gray-100 px-3 py-2.5 dark:border-gray-800">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900">
                <Scale className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-900 dark:text-gray-100">
                  Pedido con varias marcas
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                  Bebidas y postres sin marca van enteros a la marca con más unidades en el
                  ticket. Si empatan, a la que más factura.
                </p>
              </div>
            </div>

            <div className="grid gap-0 sm:grid-cols-2">
              <div className="border-b border-gray-100 px-3 py-2.5 sm:border-b-0 sm:border-r dark:border-gray-800">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Ejemplo
                </p>
                <p className="mt-1 text-[11px] leading-snug text-gray-700 dark:text-gray-300">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">2 de A</span>
                  {' + '}
                  <span className="font-medium">1 de B</span>
                  {' + bebida 2,50 €'}
                </p>
                <p className="mt-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  → 2,50 € enteros a A
                </p>
                <p className="mt-0.5 text-[10px] text-gray-400">No se parte el producto</p>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 dark:border-gray-600 dark:text-gray-100"
                  checked={config.monoBrandTakesAll !== false}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setConfig((prev) => ({
                      ...prev,
                      monoBrandTakesAll: checked,
                      sharedSplitMode: 'majority',
                    }));
                  }}
                />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-gray-900 dark:text-gray-100">
                    Solo una marca → todo a esa
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-gray-500 dark:text-gray-400">
                    Si el ticket no mezcla marcas, la bebida entera va a esa marca.
                  </span>
                </span>
              </label>
            </div>

            <p className="border-t border-gray-100 px-3 py-2 text-[10px] text-gray-400 dark:border-gray-800 dark:text-gray-500">
              3 o más marcas: agrúpalas en las hojas de arriba para facturarlas juntas.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
