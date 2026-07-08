import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import {
  Building2,
  Calculator,
  Car,
  CheckCircle2,
  ChevronRight,
  FileText,
  Globe,
  History,
  Info,
  Loader2,
  MapPin,
  Printer,
  Receipt,
  RotateCcw,
  Save,
  Ship,
  Store,
  Trash2,
  User,
  Users,
  Wallet,
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
  'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition-all placeholder:text-gray-400 hover:border-gray-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-gray-600';

type IconType = ComponentType<{ className?: string }>;

type Props = {
  initialVehicleId?: string | null;
  initialAcquisitionId?: string | null;
};

const ORIGIN_ICONS: Record<string, IconType> = {
  spain: MapPin,
  eu: Globe,
  outside_eu: Ship,
};

const SELLER_ICONS: Record<string, IconType> = {
  private: User,
  company_vat: Building2,
  company_exempt: Building2,
  reseller_rebu: Store,
  eu_private: User,
  eu_company_vat: Building2,
  eu_reseller_margin: Store,
  import_any: Ship,
};

const CLIENT_ICONS: Record<string, IconType> = {
  private_spain: User,
  company_spain: Building2,
  reseller_spain: Store,
  eu_business: Globe,
  eu_private: Users,
  outside_eu: Ship,
};

function toneClasses(tone: 'neutral' | 'success' | 'warning' | 'danger') {
  if (tone === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100';
  if (tone === 'warning') return 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100';
  if (tone === 'danger') return 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100';
  return 'border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';
}

function StepHeader({
  step,
  title,
  hint,
  className = 'mb-3.5',
}: {
  step: number;
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-[11px] font-bold text-white shadow-sm shadow-emerald-500/30">
        {step}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        {hint ? <p className="text-[11px] text-gray-400">{hint}</p> : null}
      </div>
    </div>
  );
}

function tagClasses(tag: string) {
  if (tag === 'REBU') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-100';
  if (tag === 'R. General') return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200';
  return 'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-100';
}

function SelectCard({
  active,
  title,
  hint,
  tag,
  icon: Icon,
  onClick,
}: {
  active: boolean;
  title: string;
  hint: string;
  tag?: string;
  icon?: IconType;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`group relative w-full min-w-0 rounded-2xl border p-3.5 text-left transition-all active:scale-[0.98] ${
        active
          ? 'border-emerald-500 bg-emerald-50/70 shadow-sm ring-1 ring-emerald-500/30 dark:border-emerald-500/70 dark:bg-emerald-950/30'
          : 'border-gray-200 bg-white hover:border-emerald-300 hover:shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
              active
                ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/30'
                : 'bg-gray-100 text-gray-500 group-hover:bg-emerald-100 group-hover:text-emerald-600 dark:bg-gray-800 dark:text-gray-400'
            }`}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
              <span className="truncate">{title}</span>
              {active ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : null}
            </span>
            {tag ? (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tagClasses(tag)}`}>
                {tag}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{hint}</p>
        </div>
      </div>
    </button>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: 'default' | 'emerald' | 'amber';
}) {
  const valueColor =
    accent === 'emerald'
      ? 'text-emerald-700 dark:text-emerald-300'
      : accent === 'amber'
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-gray-900 dark:text-gray-100';
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white px-3.5 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-1 truncate text-lg font-bold tabular-nums tracking-tight ${valueColor}`}>{value}</p>
      {sub ? <p className="mt-0.5 truncate text-[10px] text-gray-400">{sub}</p> : null}
    </div>
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
      <div className="shrink-0 border-b border-gray-200/80 bg-gradient-to-r from-white to-emerald-50/40 px-4 py-3.5 md:px-5 dark:border-gray-800 dark:from-gray-950 dark:to-emerald-950/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/30">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
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
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all active:scale-[0.97] disabled:opacity-40 ${
                savedId
                  ? 'bg-emerald-500 shadow-emerald-500/20'
                  : 'bg-emerald-600 shadow-emerald-600/25 hover:bg-emerald-700'
              }`}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : savedId ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {savedId ? 'Guardada' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!result.purchase}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.97] disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.97] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
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
              <div className="mt-6 flex flex-col items-center gap-2 px-3 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-900">
                  <History className="h-5 w-5" />
                </span>
                <p className="text-xs text-gray-400">Las consultas guardadas se sincronizan por negocio.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <div
                      className={`rounded-2xl border p-3 transition-colors ${
                        savedId === entry.id
                          ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20'
                          : 'border-gray-200 bg-gray-50/50 hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleLoadHistory(entry)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {entry.summary.vehicleLabel}
                            </p>
                            {entry.summary.invoiceTotal != null ? (
                              <span className="shrink-0 text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                                {formatEuro(entry.summary.invoiceTotal)}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 truncate text-xs text-gray-600 dark:text-gray-300">
                            {entry.summary.regimeLabel}
                          </p>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <span
                              className={`rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${tagClasses(
                                entry.summary.rebuEligible ? 'REBU' : 'R. General',
                              )}`}
                            >
                              {entry.summary.rebuEligible ? 'REBU' : 'General'}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {new Date(entry.updatedAt).toLocaleString('es-ES', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteHistory(entry.id)}
                          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
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

        <div className="min-h-0 min-w-0 overflow-y-auto border-b border-gray-200/80 p-4 md:p-5 xl:border-b-0 xl:border-r dark:border-gray-800 print:hidden">
          <div className="mx-auto w-full max-w-2xl space-y-5 xl:max-w-none">
            <section className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-900/40">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <Car className="h-3.5 w-3.5" />
                    Cargar desde stock
                  </label>
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
                    <option value="">Selecciona un vehículo…</option>
                    {prefillOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label} — {option.subtitle}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <MapPin className="h-3.5 w-3.5" />
                    Comunidad autónoma (TPO)
                  </label>
                  <select
                    className={inputClass}
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
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/30">
              <StepHeader step={1} title="Origen del vehículo" hint="¿De dónde procede la compra?" />
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {ORIGIN_OPTIONS.map((opt) => (
                  <SelectCard
                    key={opt.id}
                    active={form.origin === opt.id}
                    title={opt.label}
                    hint={opt.hint}
                    icon={ORIGIN_ICONS[opt.id]}
                    onClick={() => handleOriginChange(opt.id)}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/30">
              <StepHeader step={2} title="Vendedor" hint="Determina el régimen de IVA / REBU" />
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {SELLERS_BY_ORIGIN[form.origin].map((seller) => (
                  <SelectCard
                    key={seller.id}
                    active={form.seller === seller.id}
                    title={seller.label}
                    hint={seller.hint}
                    tag={sellerTag(seller.rebuTag)}
                    icon={SELLER_ICONS[seller.id]}
                    onClick={() => patch({ seller: seller.id as SellerId })}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/30">
              <StepHeader step={3} title="Datos del vehículo" hint="Fecha y km deciden nuevo/usado" />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-gray-500">Marca</label>
                  <input
                    className={`${inputClass} mt-1`}
                    value={form.brand}
                    onChange={(e) => patch({ brand: e.target.value })}
                    placeholder="BMW"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Modelo</label>
                  <input
                    className={`${inputClass} mt-1`}
                    value={form.model}
                    onChange={(e) => patch({ model: e.target.value })}
                    placeholder="Serie 1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Matrícula (opcional)</label>
                  <input
                    className={`${inputClass} mt-1`}
                    value={form.plate}
                    onChange={(e) => patch({ plate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">1ª matriculación</label>
                  <input
                    type="date"
                    className={`${inputClass} mt-1`}
                    value={form.firstRegistration}
                    onChange={(e) => patch({ firstRegistration: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Kilómetros</label>
                  <input
                    className={`${inputClass} mt-1`}
                    value={form.mileage}
                    onChange={(e) => patch({ mileage: e.target.value })}
                    placeholder="3500"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {sellerPriceLabel(form)}
                  </label>
                  <div className="relative mt-1">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">€</span>
                    <input
                      className={`${inputClass} pl-7`}
                      value={form.purchasePrice}
                      onChange={(e) => patch({ purchasePrice: e.target.value })}
                      placeholder="25.000"
                      inputMode="decimal"
                    />
                  </div>
                </div>
              </div>
              <div className={`mt-3 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold ${toneClasses(vatBadge.tone)}`}>
                {vatBadge.status === 'new' ? (
                  <XCircle className="h-4 w-4 shrink-0" />
                ) : vatBadge.status === 'used' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <Info className="h-4 w-4 shrink-0" />
                )}
                <span>
                  {vatBadge.label}
                  {vatBadge.status === 'new' ? (
                    <span className="ml-1 text-xs font-normal opacity-90">
                      — &lt;6 meses o ≤6.000 km (art. 13.2ª LIVA)
                    </span>
                  ) : null}
                </span>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/30">
              <div className="mb-3.5 flex items-center justify-between gap-2">
                <StepHeader step={4} title="Venta (opcional)" className="" />
                <label
                  className={`flex cursor-pointer select-none items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    form.includeSale
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.includeSale}
                    onChange={(e) => patch({ includeSale: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  Simular venta
                </label>
              </div>
              {form.includeSale ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                    {SALE_CLIENT_OPTIONS.map((client) => (
                      <SelectCard
                        key={client.id}
                        active={form.saleClient === client.id}
                        title={client.label}
                        hint={client.hint}
                        icon={CLIENT_ICONS[client.id]}
                        onClick={() => patch({ saleClient: client.id })}
                      />
                    ))}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      {salePriceHint(form, result)}
                    </label>
                    <div className="relative mt-1">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">€</span>
                      <input
                        className={`${inputClass} pl-7`}
                        value={form.salePrice}
                        onChange={(e) => patch({ salePrice: e.target.value })}
                        placeholder="10.000"
                        inputMode="decimal"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-gray-200 px-3.5 py-3 text-xs text-gray-400 dark:border-gray-700">
                  Activa la simulación para ver el régimen de factura y el IVA del modelo 303.
                </p>
              )}
            </section>
          </div>
        </div>

        <aside className="min-h-0 overflow-y-auto border-t border-gray-200/80 bg-gray-50/80 p-4 md:p-5 xl:sticky xl:top-0 xl:self-start xl:max-h-[calc(100dvh-6.5rem)] xl:border-t-0 dark:border-gray-800 dark:bg-gray-900/40">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500">Resultado en directo</h2>
            </div>
            {result.purchase && result.vehicleLabel !== 'Sin identificar' ? (
              <span className="inline-flex max-w-[55%] items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                <Car className="h-3 w-3 shrink-0 text-gray-400" />
                <span className="truncate">{result.vehicleLabel}</span>
              </span>
            ) : null}
          </div>

          {!result.purchase ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-12 text-center dark:border-gray-700 dark:bg-gray-950">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 text-emerald-500 ring-1 ring-emerald-100 dark:from-emerald-950/40 dark:to-teal-950/20 dark:ring-emerald-900/50">
                <Wallet className="h-6 w-6" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Todo listo para calcular</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Introduce el precio de compra en el paso 3 y verás aquí el análisis fiscal al instante.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5">
                <KpiCard
                  label="Coste real compra"
                  value={formatEuro(result.purchase.realPurchaseCost)}
                  sub={result.purchase.vatDeductible > 0 ? 'IVA recuperable descontado' : undefined}
                  accent="emerald"
                />
                {result.sale ? (
                  <KpiCard label="Factura de venta" value={formatEuro(result.sale.invoiceTotal)} sub={result.sale.regimeLabel} />
                ) : (
                  <KpiCard
                    label="Régimen en venta"
                    value={result.purchase.rebuEligible ? 'REBU' : 'General'}
                    sub={result.purchase.rebuEligible ? 'IVA solo del margen' : 'IVA 21% sobre base'}
                  />
                )}
                {result.sale ? (
                  <KpiCard label="IVA modelo 303" value={formatEuro(result.sale.vatQuota303)} accent="amber" />
                ) : null}
                {result.sale && result.sale.margin != null ? (
                  <KpiCard label="Margen bruto" value={formatEuro(result.sale.margin)} />
                ) : null}
              </div>

              <div className={`rounded-2xl border p-4 ${toneClasses(result.purchase.operationTone)}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Compra</p>
                <p className="mt-1 text-sm font-bold leading-snug">{result.purchase.operationLabel}</p>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950">
                <p className="mb-2.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  <Wallet className="h-3.5 w-3.5" />
                  Desglose de compra
                </p>
                <dl className="space-y-2 text-sm">
                  {result.purchase.vatSupported > 0 ? (
                    <>
                      <div className="flex justify-between gap-2">
                        <dt className="text-gray-500">IVA soportado</dt>
                        <dd className="font-medium tabular-nums">{formatEuro(result.purchase.vatSupported)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-gray-500">IVA deducible</dt>
                        <dd className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatEuro(result.purchase.vatDeductible)}
                        </dd>
                      </div>
                    </>
                  ) : null}
                  {result.purchase.tpoEstimate > 0 ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-500">TPO orientativo ({result.purchase.tpoRateLabel})</dt>
                      <dd className="font-medium tabular-nums">{formatEuro(result.purchase.tpoEstimate)}</dd>
                    </div>
                  ) : null}
                  {result.purchase.tpoEstimate > 0 && result.purchase.rebuEligible ? (
                    <p className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                      Exento en caja si revendes como profesional — el coste real no incluye este TPO.
                    </p>
                  ) : null}
                  {result.purchase.tariffEstimate > 0 ? (
                    <div className="flex justify-between gap-2">
                      <dt className="text-gray-500">Arancel estimado (~10%)</dt>
                      <dd className="font-medium tabular-nums">{formatEuro(result.purchase.tariffEstimate)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-2 border-t border-gray-100 pt-2.5 dark:border-gray-800">
                    <dt className="font-semibold text-gray-700 dark:text-gray-200">Coste real</dt>
                    <dd className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                      {formatEuro(result.purchase.realPurchaseCost)}
                    </dd>
                  </div>
                  {result.purchase.vatDeductible > 0 ? (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      IVA deducible ya descontado — es lo que realmente te cuesta el vehículo.
                    </p>
                  ) : null}
                </dl>
              </div>

              <div
                className={`flex items-start gap-2.5 rounded-2xl border p-3.5 text-sm ${
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
                  <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/60 p-4 dark:border-emerald-900/70 dark:from-emerald-950/40 dark:to-teal-950/20">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      Venta · {result.sale.regimeLabel}
                    </p>
                    <p className="mt-1.5 text-3xl font-bold tabular-nums tracking-tight text-gray-900 dark:text-gray-50">
                      {formatEuro(result.sale.invoiceTotal)}
                    </p>
                    {result.sale.margin != null && result.sale.margin > 0 && result.sale.invoiceTotal > 0 ? (
                      <div className="mt-2.5">
                        <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/70 ring-1 ring-emerald-200/60 dark:bg-black/30 dark:ring-emerald-900/40">
                          <div
                            className="bg-gray-300 dark:bg-gray-600"
                            style={{
                              width: `${Math.min(100, Math.max(0, ((result.sale.invoiceTotal - result.sale.margin) / result.sale.invoiceTotal) * 100))}%`,
                            }}
                          />
                          <div
                            className="bg-gradient-to-r from-emerald-500 to-teal-500"
                            style={{
                              width: `${Math.min(100, Math.max(0, (result.sale.margin / result.sale.invoiceTotal) * 100))}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-300">
                          Margen <span className="font-semibold text-emerald-700 dark:text-emerald-300">{formatEuro(result.sale.margin)}</span>{' '}
                          → IVA interno {formatEuro(result.sale.marginVat ?? 0)} (no va en factura)
                        </p>
                      </div>
                    ) : null}
                    <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-white/60 px-2.5 py-1.5 text-xs font-medium text-emerald-800 dark:bg-black/20 dark:text-emerald-200">
                      <Receipt className="h-3.5 w-3.5 shrink-0" />
                      Modelo 303: {result.sale.model303Hint}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      <FileText className="h-3.5 w-3.5" />
                      Vista previa factura
                    </p>
                    <p className="mt-2.5 text-sm font-semibold text-gray-900 dark:text-gray-100">{result.sale.invoiceConcept}</p>
                    <ul className="mt-2 space-y-1 text-xs italic text-gray-500 dark:text-gray-400">
                      {result.sale.invoiceNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                    <p className="mt-3 flex items-center justify-between border-t border-dashed border-gray-200 pt-2.5 text-sm font-bold tabular-nums dark:border-gray-700">
                      <span className="text-xs uppercase tracking-wide text-gray-500">Total factura</span>
                      <span className="text-base">{formatEuro(result.sale.invoiceTotal)}</span>
                    </p>
                  </div>
                </>
              ) : null}

              {(result.purchase.reminders.length > 0 || (result.sale?.reminders.length ?? 0) > 0) && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-900 dark:bg-amber-950/20">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                    <Info className="h-3.5 w-3.5" />
                    Recuerda
                  </p>
                  <ul className="mt-1.5 space-y-1.5 text-xs text-amber-900 dark:text-amber-100">
                    {[...result.purchase.reminders, ...(result.sale?.reminders ?? [])].map((r) => (
                      <li key={r} className="flex gap-1.5">
                        <ChevronRight className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="flex items-start gap-1.5 rounded-xl bg-gray-100/70 px-3 py-2 text-[11px] leading-relaxed text-gray-400 dark:bg-gray-900/60">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
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
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .fiscal-calculator-print-root [class*="grid-cols"] { display: block; }
          .fiscal-calculator-print-root aside { max-height: none !important; overflow: visible !important; position: static !important; }
        }
      `}</style>
    </div>
  );
}
