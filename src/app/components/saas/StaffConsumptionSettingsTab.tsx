import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Percent, Save, Sparkles, UtensilsCrossed, Tablet, Tags, CircleDollarSign,
} from 'lucide-react';
import {
  bulkApplyStaffPricesRequest,
  getDeliveryConfigRequest,
  updateDeliveryConfigRequest,
  type CatalogItem,
  type DeliveryConfig,
} from '../../lib/deliveryApi';
import {
  isCatalogItemEligibleForStaffConsumption,
  normalizeStaffConsumptionConfig,
  staffPriceFromDiscount,
} from '../../lib/staffConsumptionUtils';

interface StaffConsumptionSettingsTabProps {
  userId: string;
  catalogItems: CatalogItem[];
  onCatalogUpdated?: () => void;
}

function SectionCard({
  step,
  title,
  description,
  icon: Icon,
  children,
}: {
  step: number;
  title: string;
  description: string;
  icon: typeof UtensilsCrossed;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/40">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white text-sm font-bold">
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-violet-600 shrink-0" />
            <h3 className="font-bold text-gray-900 dark:text-gray-100">{title}</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

export function StaffConsumptionSettingsTab({
  userId,
  catalogItems,
  onCatalogUpdated,
}: StaffConsumptionSettingsTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfig | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [globalDiscountPercent, setGlobalDiscountPercent] = useState('20');
  const [eligibleCategories, setEligibleCategories] = useState<string[]>([]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of catalogItems) {
      const cat = String(item.category || '').trim();
      if (cat) set.add(cat);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [catalogItems]);

  const tpvProductCount = useMemo(() => {
    const draftConfig = normalizeStaffConsumptionConfig({
      enabled: true,
      eligibleCategories,
    });
    return catalogItems.filter(
      (item) => item.module !== 'stock' && isCatalogItemEligibleForStaffConsumption(item, draftConfig),
    ).length;
  }, [catalogItems, eligibleCategories]);

  const applyTargetCount = useMemo(() => {
    const items = catalogItems.filter((item) => item.active !== false && item.module !== 'stock');
    if (eligibleCategories.length === 0) return items.length;
    const allowed = new Set(eligibleCategories.map((c) => c.trim().toLowerCase()));
    return items.filter((item) => allowed.has(String(item.category || '').trim().toLowerCase())).length;
  }, [catalogItems, eligibleCategories]);

  const previewItem = useMemo(() => {
    const withPrice = catalogItems.find(
      (item) => item.active !== false && item.module !== 'stock' && Number(item.unitPrice) > 0,
    );
    if (!withPrice) return null;
    const pct = Math.max(0, Math.min(100, Number(globalDiscountPercent) || 0));
    const publicPrice = Number(withPrice.unitPrice);
    return {
      name: withPrice.name,
      publicPrice,
      staffPrice: staffPriceFromDiscount(publicPrice, pct),
    };
  }, [catalogItems, globalDiscountPercent]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getDeliveryConfigRequest(userId)
      .then((cfg) => {
        setDeliveryConfig(cfg);
        const staff = normalizeStaffConsumptionConfig(cfg.staffConsumption);
        setEnabled(staff.enabled);
        setGlobalDiscountPercent(String(staff.defaultDiscountPercent || 0));
        setEligibleCategories(staff.eligibleCategories);
      })
      .catch(() => toast.error('No se pudo cargar la configuración de consumos'))
      .finally(() => setLoading(false));
  }, [userId]);

  const toggleCategory = (category: string) => {
    setEligibleCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  const buildStaffPayload = () => {
    const pct = Math.max(0, Math.min(100, Number(globalDiscountPercent) || 0));
    return {
      enabled,
      pricingMode: 'percent_discount' as const,
      defaultDiscountPercent: pct,
      eligibleCategories,
    };
  };

  const handleSaveConfig = async () => {
    if (!userId || !deliveryConfig) return;
    setSaving(true);
    try {
      const updated = await updateDeliveryConfigRequest(userId, {
        ...deliveryConfig,
        staffConsumption: buildStaffPayload(),
      });
      setDeliveryConfig(updated);
      toast.success('Configuración guardada — el TPV usará estas reglas');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyToCatalog = async () => {
    if (!userId || !deliveryConfig) return;
    const pct = Math.max(0, Math.min(100, Number(globalDiscountPercent) || 0));
    if (!Number.isFinite(pct)) {
      toast.error('Indica un porcentaje válido');
      return;
    }
    if (applyTargetCount === 0) {
      toast.error('No hay productos en las categorías seleccionadas');
      return;
    }
    setApplying(true);
    try {
      await updateDeliveryConfigRequest(userId, {
        ...deliveryConfig,
        staffConsumption: buildStaffPayload(),
      });
      const result = await bulkApplyStaffPricesRequest(userId, {
        discountPercent: pct,
        categories: eligibleCategories.length > 0 ? eligibleCategories : undefined,
        enabled,
      });
      setDeliveryConfig(result.config);
      const staff = normalizeStaffConsumptionConfig(result.config.staffConsumption);
      setEnabled(staff.enabled);
      setGlobalDiscountPercent(String(staff.defaultDiscountPercent || 0));
      setEligibleCategories(staff.eligibleCategories);
      onCatalogUpdated?.();
      toast.success(
        `Precio empleado aplicado a ${result.updated} producto(s) · ${result.discountPercent}% de descuento`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo aplicar el descuento');
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="rounded-2xl border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/20 p-5">
        <div className="flex items-start gap-3">
          <UtensilsCrossed className="w-6 h-6 text-violet-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Consumos de equipo</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Configura qué puede consumir el personal y a qué precio. Solo afecta al TPV de trabajadores;
              los clientes siguen viendo el precio público de carta.
            </p>
          </div>
        </div>
      </div>

      <SectionCard
        step={1}
        icon={Tablet}
        title="Activar en la tablet TPV"
        description="Si está desactivado, el botón «Consumo equipo» no aparece en el TPV de trabajadores."
      >
        <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30">
          <div>
            <p className="font-semibold text-gray-900 dark:text-gray-100">Mostrar consumos en TPV</p>
            <p className="text-sm text-gray-500 mt-0.5">
              {enabled ? 'Los trabajadores verán el botón en su tablet.' : 'Oculto hasta que lo actives y guardes.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled((v) => !v)}
            className={`w-11 h-6 rounded-full relative shrink-0 ${enabled ? 'bg-violet-600' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </label>
      </SectionCard>

      <SectionCard
        step={2}
        icon={Tags}
        title="Qué productos puede consumir el equipo"
        description="Elige categorías de carta. Si no seleccionas ninguna, todos los productos activos estarán disponibles."
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 font-semibold">
            {tpvProductCount} producto{tpvProductCount === 1 ? '' : 's'} en la tablet
          </span>
          {eligibleCategories.length > 0 && (
            <button
              type="button"
              onClick={() => setEligibleCategories([])}
              className="text-xs font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 underline"
            >
              Permitir todas las categorías
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.length === 0 ? (
            <p className="text-sm text-gray-500">Aún no hay categorías en el catálogo de carta.</p>
          ) : (
            categories.map((cat) => {
              const active = eligibleCategories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors ${
                    active
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300'
                  }`}
                >
                  {cat}
                </button>
              );
            })
          )}
        </div>
        <p className="text-xs text-gray-500">
          {eligibleCategories.length === 0
            ? 'Sin filtro: bebidas, comidas y demás categorías de carta (productos activos y disponibles).'
            : `Solo productos de: ${eligibleCategories.join(', ')}.`}
        </p>
      </SectionCard>

      <SectionCard
        step={3}
        icon={CircleDollarSign}
        title="Precio para empleados"
        description="Descuento sobre el precio público. Puedes guardar la regla o escribir el precio empleado en cada producto del catálogo."
      >
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Descuento sobre precio público
            </label>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-[160px]">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-violet-500" />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={globalDiscountPercent}
                  onChange={(e) => setGlobalDiscountPercent(e.target.value)}
                  className="w-full pl-10 pr-3 py-3 text-2xl font-bold rounded-xl border-2 border-violet-200 dark:border-violet-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>
              <span className="text-2xl font-bold text-gray-400 pb-1">%</span>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Ejemplo: 20 % → un producto de 5,00 € cuesta 4,00 € al empleado (cliente sigue viendo 5,00 €).
            </p>
          </div>

          {previewItem && (
            <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 px-4 py-3 min-w-[200px]">
              <p className="text-[10px] uppercase font-bold text-violet-600 tracking-wide">Vista previa</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{previewItem.name}</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-lg font-bold text-violet-700 dark:text-violet-300">
                  {previewItem.staffPrice.toFixed(2)} €
                </span>
                <span className="text-sm text-gray-400 line-through">{previewItem.publicPrice.toFixed(2)} €</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">empleado · no cliente</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-dashed border-violet-200 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/10 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Opcional: fijar precio empleado en el catálogo
          </p>
          <p className="text-xs text-gray-500">
            Escribe el campo «precio empleado» en cada producto de carta. Útil si algunos tienen descuento distinto.
            Si prefieres un % único para todos, usa el botón de abajo.
          </p>
          <button
            type="button"
            onClick={() => void handleApplyToCatalog()}
            disabled={applying || applyTargetCount === 0}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold text-sm"
          >
            {applying ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5" />
            )}
            Aplicar {globalDiscountPercent || 0} % al catálogo ({applyTargetCount} producto
            {applyTargetCount === 1 ? '' : 's'})
          </button>
          <p className="text-xs text-gray-500 text-center">
            Guarda también la configuración (paso 4). No cambia el precio que ven los clientes.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        step={4}
        icon={Save}
        title="Guardar configuración"
        description="Activa el TPV, categorías y descuento. Sin este paso, la tablet no recibe los cambios."
      >
        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5 list-disc list-inside">
          <li>
            TPV: <strong className="text-gray-900 dark:text-gray-100">{enabled ? 'activado' : 'desactivado'}</strong>
          </li>
          <li>
            Productos en tablet: <strong className="text-gray-900 dark:text-gray-100">{tpvProductCount}</strong>
          </li>
          <li>
            Descuento referencia: <strong className="text-gray-900 dark:text-gray-100">{globalDiscountPercent || 0} %</strong>
          </li>
        </ul>
        <button
          type="button"
          onClick={() => void handleSaveConfig()}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-sm hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Guardar configuración
        </button>
      </SectionCard>
    </div>
  );
}
