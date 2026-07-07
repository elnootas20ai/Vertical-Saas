import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  Car,
  CheckCircle2,
  ChevronRight,
  History,
  Loader2,
  Printer,
  RotateCcw,
  Save,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../../context/AuthContext';
import { useApp } from '../../../../context/AppContext';
import { useBusiness } from '../../../../context/BusinessContext';
import {
  ORIGIN_OPTIONS,
  SALE_CLIENT_OPTIONS,
  SELLERS_BY_ORIGIN,
  computeFiscalResult,
  computeVehicleVatStatus,
  defaultFiscalForm,
  defaultSellerForOrigin,
  formatEuro,
  salePriceHint,
  sellerPriceLabel,
  type FiscalFormInput,
  type PurchaseOrigin,
  type SellerId,
} from '../../../../lib/compraventaFiscalCalculator';
import {
  buildFiscalFormFromStock,
  buildFiscalPrefillOptions,
  ensureSellerMatchesOrigin,
  type FiscalPrefillOption,
} from '../../../../lib/compraventaFiscalPrefill';
import { CCAA_TPO_RATES, getTpoForCcaa, inferCcaaFromAddress } from '../../../../lib/compraventaFiscalTpoRates';
import {
  createFiscalConsultationRequest,
  deleteFiscalConsultationRequest,
  listFiscalConsultationsRequest,
  type FiscalConsultationRecord,
} from '../../../../lib/fiscalConsultationApi';
import { listAcquisitionsRequest } from '../../../../lib/vehicleAcquisitionApi';
import type { VehicleAcquisition } from '../../../../lib/vehicleAcquisitionApi';

const inputClass =
  'w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-emerald-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

type Props = {
  initialVehicleId?: string | null;
  initialAcquisitionId?: string | null;
};

function toneClasses(tone: 'neutral' | 'success' | 'warning' | 'danger') {
  if (tone === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100';
  if (tone === 'danger') return 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100';
  return 'border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';
}

function SelectCard({
  active,
  title,
  hint,
  tag,
  onClick,
}: {
  active: boolean;
  title: string;
  hint: string;
  tag?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full min-w-0 rounded-xl border-2 p-3.5 text-left transition-all ${
        active
          ? 'border-emerald-500 bg-emerald-50/80 shadow-sm ring-1 ring-emerald-500/20 dark:border-emerald-600 dark:bg-emerald-950/30'
          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">{title}</span>
        {tag ? (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              tag === 'REBU'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100'
                : tag === 'R. General'
                  ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100'
            }`}
          >
            {tag}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{hint}</p>
    </button>
  );
}

export function FiscalCalculatorShell({ initialVehicleId, initialAcquisitionId }: Props) {
  const { user } = useAuth();
  const { vehicles } = useApp();
  const { currentBusiness } = useBusiness();
  const userId = user?.userId || user?._id || '';
  const businessId = currentBusiness?.business_id || null;
  const defaultCcaa = useMemo(
    () => inferCcaaFromAddress(currentBusiness?.address),
    [currentBusiness?.address],
  );

  const [form, setForm] = useState<FiscalFormInput>(() => defaultFiscalForm(defaultCcaa));
  const [history, setHistory] = useState<FiscalConsultationRecord[]>([]);
  const [acquisitions, setAcquisitions] = useState<VehicleAcquisition[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prefillKey, setPrefillKey] = useState('');
  const [initialApplied, setInitialApplied] = useState(false);

  const prefillOptions = useMemo(
    () => buildFiscalPrefillOptions(vehicles ?? [], acquisitions),
    [vehicles, acquisitions],
  );

  const loadHistory = useCallback(async () => {
    if (!userId) return;
    setLoadingHistory(true);
    try {
      const items = await listFiscalConsultationsRequest(userId, businessId);
      setHistory(items);
    } catch {
      toast.error('No se pudo cargar el histórico');
    } finally {
      setLoadingHistory(false);
    }
  }, [userId, businessId]);

  useEffect(() => {
    if (!userId) return;
    void listAcquisitionsRequest(userId)
      .then((res) => setAcquisitions(res.items || []))
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    setForm((prev) => ({ ...prev, ccaa: prev.ccaa || defaultCcaa }));
  }, [defaultCcaa]);

  useEffect(() => {
    if (initialApplied || !initialVehicleId || !vehicles?.length) return;
    const vehicle = vehicles.find((v) => v.id === initialVehicleId);
    if (!vehicle) return;
    const acquisition = initialAcquisitionId
      ? acquisitions.find((a) => a.id === initialAcquisitionId)
      : acquisitions.find((a) => a.vehicleId === initialVehicleId);
    const next = ensureSellerMatchesOrigin(
      buildFiscalFormFromStock(vehicle, acquisition, defaultCcaa),
    );
    setForm(next);
    setPrefillKey(
      acquisition ? `${vehicle.id}:${acquisition.id}` : vehicle.id,
    );
    setInitialApplied(true);
  }, [
    initialApplied,
    initialVehicleId,
    initialAcquisitionId,
    vehicles,
    acquisitions,
    defaultCcaa,
  ]);

  const patch = useCallback((partial: Partial<FiscalFormInput>) => {
    setForm((prev) => ({ ...prev, ...partial }));
    setSavedId(null);
  }, []);

  const result = useMemo(() => computeFiscalResult(form), [form]);
  const vatBadge = useMemo(
    () => computeVehicleVatStatus(form.firstRegistration, form.mileage),
    [form.firstRegistration, form.mileage],
  );
  const ccaaInfo = useMemo(() => getTpoForCcaa(form.ccaa), [form.ccaa]);

  const handleOriginChange = (origin: PurchaseOrigin) => {
    patch({
      origin,
      seller: defaultSellerForOrigin(origin),
    });
  };

  const handlePrefill = (option: FiscalPrefillOption) => {
    const vehicle = vehicles?.find((v) => v.id === option.vehicleId);
    if (!vehicle) return;
    const acquisition = option.acquisitionId
      ? acquisitions.find((a) => a.id === option.acquisitionId)
      : undefined;
    const next = ensureSellerMatchesOrigin(
      buildFiscalFormFromStock(vehicle, acquisition, form.ccaa || defaultCcaa),
    );
    setForm(next);
    setPrefillKey(option.key);
    setSavedId(null);
    toast.message(`Datos cargados: ${option.label}`);
  };

  const handleReset = () => {
    setForm(defaultFiscalForm(defaultCcaa));
    setPrefillKey('');
    setSavedId(null);
  };

  const buildSummary = () => {
    const originLabel = ORIGIN_OPTIONS.find((o) => o.id === form.origin)?.label ?? form.origin;
    const sellerLabel =
      SELLERS_BY_ORIGIN[form.origin].find((s) => s.id === form.seller)?.label ?? form.seller;
    return {
      vehicleLabel: result.vehicleLabel,
      origin: originLabel,
      seller: sellerLabel,
      regimeLabel: result.sale?.regimeLabel ?? result.purchase?.operationLabel ?? 'Consulta compra',
      invoiceTotal: result.sale?.invoiceTotal ?? null,
      vat303: result.sale?.vatQuota303 ?? null,
      rebuEligible: result.purchase?.rebuEligible ?? false,
    };
  };

  const handleSave = async () => {
    if (!userId || !result.purchase) {
      toast.error('Indica al menos el precio de compra');
      return;
    }
    setSaving(true);
    try {
      const item = await createFiscalConsultationRequest(userId, {
        businessId,
        vehicleId: form.vehicleId || undefined,
        acquisitionId: form.acquisitionId || undefined,
        form,
        result,
        summary: buildSummary(),
      });
      setSavedId(item.id);
      await loadHistory();
      toast.success('Consulta guardada en la nube');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadHistory = (entry: FiscalConsultationRecord) => {
    setForm(
      ensureSellerMatchesOrigin({
        ...defaultFiscalForm(defaultCcaa),
        ...entry.form,
        ccaa: entry.form.ccaa || defaultCcaa,
        vehicleId: entry.form.vehicleId || entry.vehicleId || '',
        acquisitionId: entry.form.acquisitionId || entry.acquisitionId || '',
      }),
    );
    setSavedId(entry.id);
    setPrefillKey(
      entry.vehicleId
        ? entry.acquisitionId
          ? `${entry.vehicleId}:${entry.acquisitionId}`
          : entry.vehicleId
        : '',
    );
  };

  const handleDeleteHistory = async (entryId: string) => {
    if (!userId) return;
    try {
      await deleteFiscalConsultationRequest(userId, entryId);
      if (savedId === entryId) setSavedId(null);
      await loadHistory();
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const sellerTag = (rebuTag: 'yes' | 'no' | 'depends') => {
    if (rebuTag === 'yes') return 'REBU';
    if (rebuTag === 'no') return 'R. General';
    return 'Depende';
  };

  return (
    <div className="fiscal-calculator-print-root flex min-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950 md:min-h-[calc(100dvh-6.5rem)]">
      <div className="shrink-0 border-b border-gray-200/80 px-4 py-3 md:px-5 dark:border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                Calculadora fiscal
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                IVA · REBU · TPO por CCAA · histórico en la nube
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!result.purchase || saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {savedId ? 'Guardada' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!result.purchase}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900 disabled:opacity-40"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Nueva
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(240px,280px)_minmax(420px,1fr)_minmax(300px,380px)]">
        <aside className="hidden border-b border-gray-200/80 xl:flex xl:flex-col xl:border-b-0 xl:border-r dark:border-gray-800 print:hidden">
          <div className="flex items-center gap-2 border-b border-gray-200/80 px-4 py-3 dark:border-gray-800">
            <History className="h-4 w-4 text-gray-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Consultas ({history.length})
            </span>
            {loadingHistory ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" /> : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {history.length === 0 ? (
              <p className="px-1 text-xs text-gray-400">Las consultas guardadas se sincronizan por negocio.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <div
                      className={`rounded-xl border p-3 ${
                        savedId === entry.id
                          ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
                          : 'border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleLoadHistory(entry)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                            {entry.summary.vehicleLabel}
                          </p>
                          <p className="mt-0.5 text-[11px] text-gray-500">
                            {new Date(entry.updatedAt).toLocaleString('es-ES')}
                          </p>
                          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                            {entry.summary.regimeLabel}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteHistory(entry.id)}
                          className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <div className="min-h-0 min-w-0 overflow-y-auto border-b border-gray-200/80 p-4 md:p-5 xl:border-b-0 xl:border-r dark:border-gray-800">
          <div className="mx-auto w-full max-w-2xl space-y-6 xl:max-w-none">
            <section className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-900/40">
              <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                <Car className="h-3.5 w-3.5" />
                Cargar desde stock
              </h2>
              <select
                className={inputClass}
                value={prefillKey}
                onChange={(e) => {
                  const option = prefillOptions.find((o) => o.key === e.target.value);
                  if (option) handlePrefill(option);
                  else {
                    setPrefillKey('');
                  }
                }}
              >
                <option value="">Selecciona un vehículo o compra…</option>
                {prefillOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label} — {option.subtitle}
                  </option>
                ))}
              </select>
            </section>

            <section>
              <div className="mb-3">
                <label className="text-xs font-medium text-gray-500">Comunidad autónoma (TPO)</label>
                <select
                  className={`${inputClass} mt-1.5`}
                  value={form.ccaa}
                  onChange={(e) => patch({ ccaa: e.target.value })}
                >
                  {CCAA_TPO_RATES.map((ccaa) => (
                    <option key={ccaa.code} value={ccaa.code}>
                      {ccaa.label} — {(ccaa.rate * 100).toFixed(1).replace('.0', '')}%
                    </option>
                  ))}
                </select>
                {ccaaInfo.note ? (
                  <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">{ccaaInfo.note}</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/30">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">1 · Origen</h2>
              <div className="flex flex-col gap-2 xl:grid xl:grid-cols-3">
                {ORIGIN_OPTIONS.map((opt) => (
                  <SelectCard
                    key={opt.id}
                    active={form.origin === opt.id}
                    title={opt.label}
                    hint={opt.hint}
                    onClick={() => handleOriginChange(opt.id)}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/30">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">2 · Vendedor</h2>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {SELLERS_BY_ORIGIN[form.origin].map((seller) => (
                  <SelectCard
                    key={seller.id}
                    active={form.seller === seller.id}
                    title={seller.label}
                    hint={seller.hint}
                    tag={sellerTag(seller.rebuTag)}
                    onClick={() => patch({ seller: seller.id as SellerId })}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/30">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">3 · Vehículo</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs text-gray-500">Marca</label>
                  <input
                    className={`${inputClass} mt-1`}
                    value={form.brand}
                    onChange={(e) => patch({ brand: e.target.value })}
                    placeholder="BMW"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Modelo</label>
                  <input
                    className={`${inputClass} mt-1`}
                    value={form.model}
                    onChange={(e) => patch({ model: e.target.value })}
                    placeholder="Serie 1"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Matrícula (opcional)</label>
                  <input
                    className={`${inputClass} mt-1`}
                    value={form.plate}
                    onChange={(e) => patch({ plate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">1ª matriculación</label>
                  <input
                    type="date"
                    className={`${inputClass} mt-1`}
                    value={form.firstRegistration}
                    onChange={(e) => patch({ firstRegistration: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Kilómetros</label>
                  <input
                    className={`${inputClass} mt-1`}
                    value={form.mileage}
                    onChange={(e) => patch({ mileage: e.target.value })}
                    placeholder="3500"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">{sellerPriceLabel(form)}</label>
                  <input
                    className={`${inputClass} mt-1`}
                    value={form.purchasePrice}
                    onChange={(e) => patch({ purchasePrice: e.target.value })}
                    placeholder="25000"
                    inputMode="decimal"
                  />
                </div>
              </div>
              <div className={`mt-3 rounded-xl border px-3 py-2 text-sm font-semibold ${toneClasses(vatBadge.tone)}`}>
                {vatBadge.label}
                {vatBadge.status === 'new' ? (
                  <span className="ml-1 text-xs font-normal opacity-90">
                    — &lt;6 meses o ≤6.000 km (art. 13.2ª LIVA)
                  </span>
                ) : null}
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/30">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">4 · Venta (opcional)</h2>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={form.includeSale}
                    onChange={(e) => patch({ includeSale: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  Simular venta
                </label>
              </div>
              {form.includeSale ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {SALE_CLIENT_OPTIONS.map((client) => (
                      <SelectCard
                        key={client.id}
                        active={form.saleClient === client.id}
                        title={client.label}
                        hint={client.hint}
                        onClick={() => patch({ saleClient: client.id })}
                      />
                    ))}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">{salePriceHint(form, result)}</label>
                    <input
                      className={`${inputClass} mt-1`}
                      value={form.salePrice}
                      onChange={(e) => patch({ salePrice: e.target.value })}
                      placeholder="10000"
                      inputMode="decimal"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">
                  Activa la simulación para ver régimen de factura e IVA del modelo 303.
                </p>
              )}
            </section>
          </div>
        </div>

        <aside className="min-h-0 overflow-y-auto bg-gray-50/80 p-4 md:p-5 xl:sticky xl:top-0 xl:self-start xl:max-h-[calc(100dvh-8rem)] dark:bg-gray-900/40">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-500">Resultado</h2>

          {!result.purchase ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-950">
              Introduce el precio de compra para ver el análisis fiscal al instante.
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`rounded-xl border p-4 ${toneClasses(result.purchase.operationTone)}`}>
                <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Compra</p>
                <p className="mt-1 text-sm font-bold">{result.purchase.operationLabel}</p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
                <dl className="space-y-2 text-sm">
                  {result.purchase.vatSupported > 0 ? (
                    <>
                      <div className="flex justify-between gap-2">
                        <dt className="text-gray-500">IVA soportado</dt>
                        <dd className="font-medium">{formatEuro(result.purchase.vatSupported)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-gray-500">IVA deducible</dt>
                        <dd className="font-medium">{formatEuro(result.purchase.vatDeductible)}</dd>
                      </div>
                    </>
                  ) : null}
                  {result.purchase.tpoEstimate > 0 ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-500">
                        TPO orientativo ({result.purchase.tpoRateLabel})
                      </dt>
                      <dd className="font-medium">{formatEuro(result.purchase.tpoEstimate)}</dd>
                    </div>
                  ) : null}
                  {result.purchase.tpoEstimate > 0 && result.purchase.rebuEligible ? (
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      Exento en caja si revendes como profesional — el coste real no incluye este TPO.
                    </p>
                  ) : null}
                  {result.purchase.tariffEstimate > 0 ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-500">Arancel estimado (~10%)</dt>
                      <dd className="font-medium">{formatEuro(result.purchase.tariffEstimate)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-2 border-t border-gray-100 pt-2 dark:border-gray-800">
                    <dt className="font-semibold text-gray-700 dark:text-gray-200">Coste real compra</dt>
                    <dd className="font-bold text-emerald-700 dark:text-emerald-300">
                      {formatEuro(result.purchase.realPurchaseCost)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div
                className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${
                  result.purchase.rebuEligible
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
                    : 'border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'
                }`}
              >
                {result.purchase.rebuEligible ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <div>
                  <p className="font-semibold">
                    {result.purchase.rebuEligible ? 'REBU posible en venta' : 'Sin REBU — régimen general'}
                  </p>
                  <p className="mt-0.5 text-xs opacity-90">{result.purchase.rebuReason}</p>
                </div>
              </div>

              {result.sale ? (
                <>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      Venta · {result.sale.regimeLabel}
                    </p>
                    <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {formatEuro(result.sale.invoiceTotal)}
                    </p>
                    {result.sale.margin != null && result.sale.margin > 0 ? (
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                        Margen {formatEuro(result.sale.margin)} → IVA interno{' '}
                        {formatEuro(result.sale.marginVat ?? 0)} (no va en factura)
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                      Modelo 303: {result.sale.model303Hint}
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vista previa factura</p>
                    <p className="mt-2 text-sm font-medium">{result.sale.invoiceConcept}</p>
                    <ul className="mt-2 space-y-1 text-xs italic text-gray-600 dark:text-gray-300">
                      {result.sale.invoiceNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                    <p className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2 text-sm font-bold dark:border-gray-800">
                      <span>TOTAL</span>
                      <span>{formatEuro(result.sale.invoiceTotal)}</span>
                    </p>
                  </div>
                </>
              ) : null}

              {(result.purchase.reminders.length > 0 || (result.sale?.reminders.length ?? 0) > 0) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                  <p className="text-xs font-bold uppercase text-amber-800 dark:text-amber-200">Recuerda</p>
                  <ul className="mt-1 space-y-1 text-xs text-amber-900 dark:text-amber-100">
                    {[...result.purchase.reminders, ...(result.sale?.reminders ?? [])].map((r) => (
                      <li key={r} className="flex gap-1">
                        <ChevronRight className="mt-0.5 h-3 w-3 shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[11px] leading-relaxed text-gray-400">
                Herramienta orientativa (LIVA / TRLITP). TPO según tipo orientativo por CCAA; pueden aplicar tablas oficiales.
              </p>
            </div>
          )}
        </aside>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .fiscal-calculator-print-root, .fiscal-calculator-print-root * { visibility: visible; }
          .fiscal-calculator-print-root {
            position: absolute; left: 0; top: 0; width: 100%;
            border: none; box-shadow: none;
          }
        }
      `}</style>
    </div>
  );
}
