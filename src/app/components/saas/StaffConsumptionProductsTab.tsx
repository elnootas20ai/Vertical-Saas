import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Loader2, Package } from 'lucide-react';
import {
  bulkApplyStaffPricesRequest,
  getDeliveryConfigRequest,
  updateCatalogItemRequest,
  updateDeliveryConfigRequest,
  type CatalogItem,
  type DeliveryConfig,
  type StaffConsumptionConfig,
} from '../../lib/deliveryApi';
import { formatMoneyEs } from '../../lib/formatNumberEs';
import {
  normalizeStaffConsumptionConfig,
} from '../../lib/staffConsumptionUtils';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY, VERTIAL_SURFACE } from '../../lib/vertialUiTokens';

interface StaffConsumptionProductsTabProps {
  userId: string;
  catalogItems: CatalogItem[];
  onCatalogUpdated?: () => void;
}

type OrganizerGroup = {
  category: string;
  items: CatalogItem[];
};

function parseEuroInput(raw: string): number | null {
  let s = String(raw || '').trim().replace(/\s/g, '').replace(/€/g, '');
  if (!s) return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function sanitizeEuroTyping(raw: string): string {
  let s = String(raw || '').replace(/[^\d.,]/g, '');
  const sepIdx = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (sepIdx >= 0) {
    const sep = s[sepIdx];
    const intPart = s.slice(0, sepIdx).replace(/[.,]/g, '');
    const decPart = s.slice(sepIdx + 1).replace(/[.,]/g, '').slice(0, 2);
    s = `${intPart}${sep}${decPart}`;
  } else {
    s = s.replace(/[.,]/g, '');
  }
  return s;
}

function formatEuroDraft(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

const euroInputClass =
  'w-28 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm font-semibold tabular-nums text-stone-900 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100';

/** Verde = activo · rojo = desactivado (estado, no CTA azul). */
function ConsumptionToggle({
  checked,
  disabled,
  onChange,
  label,
  compact = false,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 transition-colors disabled:opacity-50 ${
        checked
          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
          : 'border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30'
      }`}
    >
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
          checked ? 'bg-[#22C55E]' : 'bg-[#E11D48]'
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
      {!compact ? (
        <span
          className={`text-[11px] font-bold uppercase tracking-wide ${
            checked
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-rose-700 dark:text-rose-300'
          }`}
        >
          {checked ? 'Activo' : 'Off'}
        </span>
      ) : null}
    </button>
  );
}

export function StaffConsumptionProductsTab({
  userId,
  catalogItems,
  onCatalogUpdated,
}: StaffConsumptionProductsTabProps) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [presetByCategory, setPresetByCategory] = useState<Record<string, string>>({});
  const [applyingCategory, setApplyingCategory] = useState<string | null>(null);
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig | null>(null);
  const [staffConfig, setStaffConfig] = useState<StaffConsumptionConfig>(
    normalizeStaffConsumptionConfig(),
  );
  const [configLoading, setConfigLoading] = useState(true);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const organizers = useMemo((): OrganizerGroup[] => {
    const map = new Map<string, CatalogItem[]>();
    for (const item of catalogItems) {
      if (item.module === 'stock' || item.active === false) continue;
      const cat = String(item.category || '').trim() || 'Sin organizador';
      const list = map.get(cat) || [];
      list.push(item);
      map.set(cat, list);
    }
    return [...map.entries()]
      .map(([category, items]) => ({
        category,
        items: [...items].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es')),
      }))
      .sort((a, b) => a.category.localeCompare(b.category, 'es'));
  }, [catalogItems]);

  const allCategoryLabels = useMemo(
    () => organizers.map((g) => g.category),
    [organizers],
  );

  const loadConfig = useCallback(async () => {
    if (!userId) return;
    setConfigLoading(true);
    try {
      const cfg = await getDeliveryConfigRequest(userId);
      setDeliveryConfig(cfg);
      setStaffConfig(normalizeStaffConsumptionConfig(cfg.staffConsumption));
    } catch {
      toast.error('No se pudo cargar qué productos están activos para consumo');
    } finally {
      setConfigLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const isCategoryEnabled = useCallback(
    (category: string) => {
      const list = staffConfig.eligibleCategories || [];
      if (list.length === 0) return true;
      const fold = category.trim().toLowerCase();
      return list.some((c) => String(c).trim().toLowerCase() === fold);
    },
    [staffConfig.eligibleCategories],
  );

  const isItemEnabled = useCallback(
    (itemId: string) => {
      const excluded = staffConfig.excludedCatalogItemIds || [];
      return !excluded.includes(itemId);
    },
    [staffConfig.excludedCatalogItemIds],
  );

  const persistStaffConfig = async (next: StaffConsumptionConfig) => {
    if (!userId || !deliveryConfig) {
      toast.error('Configuración aún no cargada');
      return;
    }
    const normalized = normalizeStaffConsumptionConfig(next);
    const updated = await updateDeliveryConfigRequest(userId, {
      ...deliveryConfig,
      staffConsumption: normalized,
    });
    setDeliveryConfig(updated);
    setStaffConfig(normalizeStaffConsumptionConfig(updated.staffConsumption));
  };

  const handleToggleCategory = async (category: string) => {
    const currentlyOn = isCategoryEnabled(category);
    setTogglingKey(`cat:${category}`);
    try {
      let nextEligible: string[];
      if (currentlyOn) {
        // Apagar: si estaba «todos», pasar a lista con todos menos este.
        const base =
          staffConfig.eligibleCategories.length === 0
            ? allCategoryLabels
            : staffConfig.eligibleCategories;
        nextEligible = base.filter(
          (c) => String(c).trim().toLowerCase() !== category.trim().toLowerCase(),
        );
      } else {
        const merged = [...staffConfig.eligibleCategories];
        if (!merged.some((c) => c.trim().toLowerCase() === category.trim().toLowerCase())) {
          merged.push(category);
        }
        // Si están todos activos → [] (sin filtro).
        const allOn =
          allCategoryLabels.length > 0
          && allCategoryLabels.every((label) =>
            merged.some((c) => c.trim().toLowerCase() === label.trim().toLowerCase()),
          );
        nextEligible = allOn ? [] : merged;
      }
      await persistStaffConfig({
        ...staffConfig,
        eligibleCategories: nextEligible,
      });
      toast.success(
        currentlyOn
          ? `«${category}» desactivado en consumo de equipo`
          : `«${category}» activo en consumo de equipo`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setTogglingKey(null);
    }
  };

  const handleToggleItem = async (item: CatalogItem) => {
    const id = String(item._id || '').trim();
    if (!id) return;
    const currentlyOn = isItemEnabled(id);
    setTogglingKey(`item:${id}`);
    try {
      const excluded = new Set(staffConfig.excludedCatalogItemIds || []);
      if (currentlyOn) excluded.add(id);
      else excluded.delete(id);
      await persistStaffConfig({
        ...staffConfig,
        excludedCatalogItemIds: [...excluded],
      });
      toast.success(
        currentlyOn
          ? `«${item.name}» fuera del consumo`
          : `«${item.name}» disponible en consumo`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setTogglingKey(null);
    }
  };

  const handleApplyPreset = async (category: string, items: CatalogItem[]) => {
    const price = parseEuroInput(presetByCategory[category] || '');
    if (price == null) {
      toast.error('Indica un precio válido (€)');
      return;
    }
    if (items.length === 0) {
      toast.error('Este organizador no tiene productos');
      return;
    }
    setApplyingCategory(category);
    try {
      if (category === 'Sin organizador') {
        await Promise.all(
          items.map((item) => updateCatalogItemRequest(userId, { ...item, staffPrice: price })),
        );
        onCatalogUpdated?.();
        toast.success(`Precio ${formatMoneyEs(price)} aplicado a ${items.length} producto(s)`);
      } else {
        const result = await bulkApplyStaffPricesRequest(userId, {
          fixedStaffPrice: price,
          categories: [category],
          enabled: true,
        });
        onCatalogUpdated?.();
        toast.success(
          `Precio ${formatMoneyEs(price)} aplicado a ${result.updated} producto(s) · ${category}`,
        );
      }
      setDraftPrices((prev) => {
        const next = { ...prev };
        for (const item of items) delete next[item._id];
        return next;
      });
      await loadConfig();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo aplicar el precio');
    } finally {
      setApplyingCategory(null);
    }
  };

  const handleSaveItem = async (item: CatalogItem) => {
    const raw = draftPrices[item._id];
    const price = parseEuroInput(raw ?? String(item.staffPrice ?? ''));
    if (price == null) {
      toast.error('Precio inválido');
      return;
    }
    setSavingItemId(item._id);
    try {
      await updateCatalogItemRequest(userId, { ...item, staffPrice: price });
      onCatalogUpdated?.();
      toast.success(`Precio empleado actualizado · ${item.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSavingItemId(null);
    }
  };

  if (organizers.length === 0) {
    return (
      <div className={`${VERTIAL_SURFACE} p-6 text-center`}>
        <Package className="mx-auto mb-2 h-8 w-8 text-stone-300" />
        <p className="text-sm font-semibold text-stone-700 dark:text-stone-200">Sin productos de carta</p>
        <p className="mt-1 text-xs text-stone-500">Crea organizadores y productos en Catálogo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Activa o desactiva organizadores/productos para el TPV. Pon precio por organizador o producto a producto.
      </p>

      {configLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-stone-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando activaciones…
        </div>
      ) : null}

      {organizers.map((group) => {
        const open = openCategory === group.category;
        const applying = applyingCategory === group.category;
        const categoryOn = isCategoryEnabled(group.category);
        const togglingCat = togglingKey === `cat:${group.category}`;
        return (
          <div
            key={group.category}
            className={`${VERTIAL_SURFACE} overflow-hidden ${
              categoryOn ? '' : 'opacity-80'
            }`}
          >
            {/* Fila 1: nombre */}
            <button
              type="button"
              onClick={() => setOpenCategory(open ? null : group.category)}
              className="flex w-full min-w-0 items-center gap-2 border-b border-stone-100 px-3 py-2.5 text-left dark:border-stone-800"
            >
              {open ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-stone-400" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-stone-900 dark:text-stone-100">
                  {group.category}
                </p>
                <p className="text-[11px] text-stone-500">
                  {group.items.length} producto{group.items.length === 1 ? '' : 's'}
                  {categoryOn ? '' : ' · no disponible en TPV'}
                </p>
              </div>
            </button>

            {/* Fila 2: consumo | precio (sin solaparse) */}
            <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <ConsumptionToggle
                checked={categoryOn}
                disabled={configLoading || togglingCat || !deliveryConfig}
                onChange={() => void handleToggleCategory(group.category)}
                label={
                  categoryOn
                    ? `Desactivar ${group.category} en consumo`
                    : `Activar ${group.category} en consumo`
                }
              />

              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
                <label className="flex min-w-0 items-center gap-2 text-xs text-stone-500">
                  <span className="shrink-0 font-semibold text-stone-600 dark:text-stone-300">
                    Precio €
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00"
                    disabled={!categoryOn}
                    value={presetByCategory[group.category] ?? ''}
                    onChange={(e) =>
                      setPresetByCategory((prev) => ({
                        ...prev,
                        [group.category]: sanitizeEuroTyping(e.target.value),
                      }))
                    }
                    className={`${euroInputClass} disabled:opacity-40`}
                  />
                </label>
                <button
                  type="button"
                  disabled={applying || !categoryOn}
                  onClick={() => void handleApplyPreset(group.category, group.items)}
                  className={`${VERTIAL_BTN_PRIMARY} min-h-9 shrink-0 px-3 py-1.5 text-xs`}
                >
                  {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Aplicar a todos
                </button>
              </div>
            </div>

            {open ? (
              <div className="border-t border-stone-100 dark:border-stone-800">
                <div className="divide-y divide-stone-100 dark:divide-stone-800">
                  {group.items.map((item) => {
                    const currentStaff =
                      item.staffPrice != null && Number.isFinite(Number(item.staffPrice))
                        ? Number(item.staffPrice)
                        : null;
                    const draft =
                      draftPrices[item._id]
                      ?? (currentStaff != null ? formatEuroDraft(currentStaff) : '');
                    const saving = savingItemId === item._id;
                    const draftNum = parseEuroInput(draft);
                    const dirty =
                      draftPrices[item._id] !== undefined
                      && draftNum != null
                      && draftNum !== (currentStaff ?? -1);
                    const itemOn = isItemEnabled(item._id);
                    const togglingItem = togglingKey === `item:${item._id}`;
                    return (
                      <div
                        key={item._id}
                        className={`flex flex-col gap-2.5 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 ${
                          itemOn && categoryOn ? '' : 'opacity-60'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
                            {item.name}
                          </p>
                          <p className="text-[11px] text-stone-500">
                            Público {formatMoneyEs(item.unitPrice)}
                            {!itemOn ? ' · sin consumo' : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          <ConsumptionToggle
                            compact
                            checked={itemOn && categoryOn}
                            disabled={
                              configLoading
                              || togglingItem
                              || !deliveryConfig
                              || !categoryOn
                            }
                            onChange={() => void handleToggleItem(item)}
                            label={
                              itemOn
                                ? `Quitar ${item.name} del consumo`
                                : `Incluir ${item.name} en consumo`
                            }
                          />
                          <label className="flex items-center gap-2 text-xs text-stone-500">
                            <span className="shrink-0 font-semibold text-stone-600 dark:text-stone-300">
                              Empleado €
                            </span>
                            <input
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              placeholder="0,00"
                              disabled={!itemOn || !categoryOn}
                              value={draft}
                              onChange={(e) =>
                                setDraftPrices((prev) => ({
                                  ...prev,
                                  [item._id]: sanitizeEuroTyping(e.target.value),
                                }))
                              }
                              className={`${euroInputClass} disabled:opacity-40`}
                            />
                          </label>
                          <button
                            type="button"
                            disabled={saving || !dirty || !itemOn || !categoryOn}
                            onClick={() => void handleSaveItem(item)}
                            className={`${VERTIAL_BTN_SECONDARY} min-h-9 shrink-0 px-3 py-1.5 text-xs disabled:opacity-40`}
                          >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
