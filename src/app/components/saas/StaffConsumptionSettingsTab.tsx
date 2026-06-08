import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Percent, Save, Sparkles, UtensilsCrossed } from 'lucide-react';
import {
  bulkApplyStaffPricesRequest,
  getDeliveryConfigRequest,
  updateDeliveryConfigRequest,
  type CatalogItem,
  type DeliveryConfig,
} from '../../lib/deliveryApi';
import { normalizeStaffConsumptionConfig, staffPriceFromDiscount } from '../../lib/staffConsumptionUtils';

interface StaffConsumptionSettingsTabProps {
  userId: string;
  catalogItems: CatalogItem[];
  onCatalogUpdated?: () => void;
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

  const activeCatalogCount = useMemo(
    () => catalogItems.filter((item) => item.active !== false).length,
    [catalogItems],
  );

  const previewItem = useMemo(() => {
    const withPrice = catalogItems.find((item) => item.active !== false && Number(item.unitPrice) > 0);
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

  const handleSaveRules = async () => {
    if (!userId || !deliveryConfig) return;
    setSaving(true);
    try {
      const pct = Math.max(0, Math.min(100, Number(globalDiscountPercent) || 0));
      const updated = await updateDeliveryConfigRequest(userId, {
        ...deliveryConfig,
        staffConsumption: {
          enabled,
          pricingMode: 'percent_discount',
          defaultDiscountPercent: pct,
          eligibleCategories,
        },
      });
      setDeliveryConfig(updated);
      toast.success('Reglas guardadas');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyToAll = async () => {
    if (!userId) return;
    const pct = Math.max(0, Math.min(100, Number(globalDiscountPercent) || 0));
    if (!Number.isFinite(pct)) {
      toast.error('Indica un porcentaje válido');
      return;
    }
    setApplying(true);
    try {
      const result = await bulkApplyStaffPricesRequest(userId, {
        discountPercent: pct,
        categories: eligibleCategories.length > 0 ? eligibleCategories : undefined,
      });
      setDeliveryConfig(result.config);
      setEnabled(true);
      setGlobalDiscountPercent(String(result.discountPercent));
      onCatalogUpdated?.();
      toast.success(
        `Descuento del ${result.discountPercent}% aplicado a ${result.updated} producto(s)`,
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
    <div className="max-w-3xl space-y-6">
      <div className="rounded-2xl border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/20 p-5">
        <div className="flex items-start gap-3">
          <UtensilsCrossed className="w-6 h-6 text-violet-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Precio empleado — descuento general</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Pon un % de descuento y aplícalo a todo el catálogo de un clic. Es la forma más rápida.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border-2 border-violet-300 dark:border-violet-800 bg-white dark:bg-gray-900 p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
              Descuento general para empleados
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
              Ejemplo: 20 % → un producto de 5,00 € cuesta 4,00 € al empleado.
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
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleApplyToAll()}
          disabled={applying || activeCatalogCount === 0}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-violet-900/20"
        >
          {applying ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Sparkles className="w-5 h-5" />
          )}
          Aplicar {globalDiscountPercent || 0} % a todos los productos ({activeCatalogCount})
        </button>
        <p className="text-xs text-gray-500 text-center">
          Actualiza el precio empleado de cada producto y activa la regla en la tablet TPV.
        </p>
      </div>

      <label className="flex items-center justify-between p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div>
          <p className="font-semibold text-gray-900 dark:text-gray-100">Consumos en tablet TPV</p>
          <p className="text-sm text-gray-500">Muestra el botón «Consumo equipo» en el TPV de trabajadores.</p>
        </div>
        <button
          type="button"
          onClick={() => setEnabled((v) => !v)}
          className={`w-11 h-6 rounded-full relative ${enabled ? 'bg-violet-600' : 'bg-gray-300'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </label>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 space-y-3">
        <div>
          <p className="font-semibold text-gray-900 dark:text-gray-100">Categorías (opcional)</p>
          <p className="text-sm text-gray-500">
            Si marcas categorías, el descuento masivo y la tablet solo afectan a esas. Si no marcas ninguna, valen todas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.length === 0 ? (
            <p className="text-sm text-gray-500">Aún no hay categorías en el catálogo.</p>
          ) : (
            categories.map((cat) => {
              const active = eligibleCategories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 ${
                    active
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {cat}
                </button>
              );
            })
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handleSaveRules()}
        disabled={saving}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Guardar solo reglas (sin recalcular catálogo)
      </button>
    </div>
  );
}
