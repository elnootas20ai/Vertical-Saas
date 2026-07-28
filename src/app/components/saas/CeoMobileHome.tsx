import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  Banknote,
  ChevronRight,
  Clock,
  Package,
  RefreshCw,
  Store,
  Truck,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { Layout } from './Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { isDeliveryBusinessType } from '../../lib/deliverySetup';
import {
  getOpsCenterRequest,
  pointOfSaleDisplayLabel,
  type OpsCenterData,
} from '../../lib/deliveryApi';
import { useDeliveryOrdersLive } from '../../hooks/useDeliveryOrdersLive';
import {
  fetchAlertSummary,
  normalizeAlertSummary,
  type AlertSummary,
} from '../../lib/alertCenterApi';
import { fetchActiveNow, type ActiveMember } from '../../lib/clockinsApi';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';

function eur(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatClockIn(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

/**
 * Home compacto del CEO en móvil / app nativa.
 * Enfoque: tienda, alertas, caja, sin cobrar, resumen del día, equipo fichado.
 */
export function CeoMobileHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const store = useActiveStoreScope();

  const businessId =
    currentBusiness?.business_id?.replace(/^business:/, '')
    || currentBusiness?.id?.replace(/^business:/, '')
    || '';
  const dataUserId = resolveBusinessDataUserId(user, currentBusiness);
  const isDeliveryLike =
    isDeliveryBusinessType(currentBusiness?.businessType)
    || isRestaurantBusinessType(currentBusiness?.businessType);

  const [loading, setLoading] = useState(true);
  const [ops, setOps] = useState<OpsCenterData | null>(null);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [active, setActive] = useState<ActiveMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const salesPointId = store.activeSalesPointId || undefined;
      const [alertRes, activeRes, opsRes] = await Promise.all([
        fetchAlertSummary(businessId).catch(() => null),
        fetchActiveNow(businessId).catch(() => [] as ActiveMember[]),
        isDeliveryLike && dataUserId
          ? getOpsCenterRequest(dataUserId, {
              businessId,
              salesPointId,
            }).catch(() => null)
          : Promise.resolve(null),
      ]);
      setSummary(alertRes ? normalizeAlertSummary(alertRes.summary) : null);
      setActive(activeRes || []);
      setOps(opsRes);
    } catch (e) {
      setError((e as Error).message || 'No se pudo cargar el resumen');
    } finally {
      setLoading(false);
    }
  }, [businessId, dataUserId, isDeliveryLike, store.activeSalesPointId]);

  useEffect(() => {
    void load();
  }, [load]);

  useDeliveryOrdersLive({
    authUserId: user?.user_id || user?.id || null,
    businessId,
    onRefresh: () => {
      void load();
    },
    enabled: !!businessId && isDeliveryLike,
    fallbackPollMs: 45_000,
  });

  const unpaidOrders = useMemo(() => {
    if (!ops?.activeOrders?.length) return [];
    return ops.activeOrders.filter((o) => {
      const st = String(o.paymentStatus || '').toLowerCase();
      return st === 'pending' || st === 'partial';
    });
  }, [ops?.activeOrders]);

  const unpaidCount = unpaidOrders.length;
  const unpaidAmount = unpaidOrders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
  const highAlerts = summary?.byPriority?.high ?? 0;
  const unresolved = summary?.unresolved ?? 0;
  const cash = ops?.cashStatus;
  const openCajas = cash?.openTpvSessions?.length ?? 0;
  const pendingClose = (cash?.pendingClose || 0) + (cash?.pendingValidation || 0);
  const discrepancy = Math.abs(cash?.todayDiscrepancy || 0);
  const byStatus = ops?.kpis?.byStatus;
  const activeOrdersCount =
    (byStatus?.nuevo || 0)
    + (byStatus?.cocina || 0)
    + (byStatus?.listo || 0)
    + (byStatus?.en_reparto || 0);
  const delayed = ops?.deliveryStatus?.delayedCount ?? 0;

  const businessName = currentBusiness?.name || 'Tu negocio';
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 20) return 'Buenas tardes';
    return 'Buenas noches';
  })();

  return (
    <Layout title="Inicio" subtitle={businessName}>
      <div className="mx-auto max-w-lg space-y-3 pb-24">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{greeting}</p>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
              {user?.firstName || user?.fullName || 'CEO'}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="shrink-0 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2.5 text-gray-600 dark:text-gray-300"
            aria-label="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Tienda */}
        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Store className="w-4 h-4 text-gray-500" />
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Tienda</p>
          </div>
          {store.loading ? (
            <p className="text-sm text-gray-400">Cargando tiendas…</p>
          ) : store.pointsOfSale.length <= 1 ? (
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {store.displayLabelForActive
                || (store.pointsOfSale[0] ? pointOfSaleDisplayLabel(store.pointsOfSale[0]) : businessName)}
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-0.5">
              {store.pointsOfSale.map((pdv) => {
                const id = String(pdv.id || pdv._id || '');
                const selected = id === store.activeSalesPointId;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => store.setActiveSalesPoint(id)}
                    className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold border transition-colors ${
                      selected
                        ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                        : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/40'
                    }`}
                  >
                    {pointOfSaleDisplayLabel(pdv)}
                  </button>
                );
              })}
            </div>
          )}
          {businesses.length > 1 && (
            <button
              type="button"
              onClick={() => navigate('/auth/gate')}
              className="mt-2 text-xs font-semibold text-violet-600 dark:text-violet-400"
            >
              Cambiar de empresa →
            </button>
          )}
        </section>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </p>
        )}

        {loading && !ops && !summary ? (
          <div className="flex justify-center py-16">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* Alertas urgentes */}
            <button
              type="button"
              onClick={() => navigate('/saas/alerts')}
              className={`w-full text-left rounded-2xl border-2 p-4 transition-colors ${
                highAlerts > 0
                  ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-5 h-5 ${highAlerts > 0 ? 'text-red-600' : 'text-gray-400'}`} />
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Alertas urgentes</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {highAlerts > 0
                        ? `${highAlerts} prioritaria${highAlerts !== 1 ? 's' : ''} · ${unresolved} abiertas`
                        : unresolved > 0
                          ? `${unresolved} abiertas · sin críticas`
                          : 'Todo en orden'}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
              </div>
            </button>

            {/* Caja */}
            {isDeliveryLike && (
              <button
                type="button"
                onClick={() => navigate('/saas/vertical/delivery/caja')}
                className={`w-full text-left rounded-2xl border-2 p-4 ${
                  pendingClose > 0 || discrepancy >= 20
                    ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-5 h-5 text-amber-700 dark:text-amber-400" />
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Estado de cajas</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-white/70 dark:bg-gray-900/40 p-2.5">
                    <p className="text-lg font-black text-gray-900 dark:text-gray-100 tabular-nums">{openCajas}</p>
                    <p className="text-[10px] text-gray-500 font-semibold">Abiertas</p>
                  </div>
                  <div className="rounded-xl bg-white/70 dark:bg-gray-900/40 p-2.5">
                    <p className={`text-lg font-black tabular-nums ${pendingClose > 0 ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                      {pendingClose}
                    </p>
                    <p className="text-[10px] text-gray-500 font-semibold">Pend. cierre</p>
                  </div>
                  <div className="rounded-xl bg-white/70 dark:bg-gray-900/40 p-2.5">
                    <p className="text-lg font-black text-gray-900 dark:text-gray-100 tabular-nums">
                      {eur(cash?.totalCashInRegisters || 0)}€
                    </p>
                    <p className="text-[10px] text-gray-500 font-semibold">En cajón</p>
                  </div>
                </div>
                {discrepancy >= 20 && (
                  <p className="mt-2 text-xs font-semibold text-red-700 dark:text-red-400">
                    Descuadre hoy: {eur(discrepancy)}€
                  </p>
                )}
              </button>
            )}

            {/* Sin cobrar */}
            {isDeliveryLike && (
              <button
                type="button"
                onClick={() => navigate('/saas/delivery-ops')}
                className={`w-full text-left rounded-2xl border-2 p-4 ${
                  unpaidCount > 0
                    ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/25'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Wallet className={`w-5 h-5 ${unpaidCount > 0 ? 'text-red-600' : 'text-gray-400'}`} />
                    <div>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Sin cobrar</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {unpaidCount > 0
                          ? `${unpaidCount} pedido${unpaidCount !== 1 ? 's' : ''} · ${eur(unpaidAmount)}€`
                          : 'Ningún pedido activo pendiente de cobro'}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>
              </button>
            )}

            {/* Resumen del día */}
            {isDeliveryLike && ops?.kpis && (
              <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Hoy en el local</p>
                  <button
                    type="button"
                    onClick={() => navigate('/saas/delivery-ops')}
                    className="text-xs font-semibold text-violet-600 dark:text-violet-400"
                  >
                    Operativa →
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <StatChip
                    icon={<Package className="w-4 h-4" />}
                    label="Activos"
                    value={String(activeOrdersCount)}
                  />
                  <StatChip
                    icon={<Truck className="w-4 h-4" />}
                    label="En reparto"
                    value={String(byStatus?.en_reparto || 0)}
                  />
                  <StatChip
                    icon={<Clock className="w-4 h-4" />}
                    label="Retrasados"
                    value={String(delayed)}
                    warn={delayed > 0}
                  />
                  <StatChip
                    icon={<Banknote className="w-4 h-4" />}
                    label="Ingresos"
                    value={`${eur(ops.kpis.revenue || 0)}€`}
                  />
                </div>
              </section>
            )}

            {/* Equipo fichado */}
            <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-violet-600" />
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Equipo fichado ({active.length})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/saas/clockins')}
                  className="text-xs font-semibold text-violet-600 dark:text-violet-400"
                >
                  Ver →
                </button>
              </div>
              {active.length === 0 ? (
                <p className="text-xs text-gray-500">Nadie fichado ahora mismo.</p>
              ) : (
                <ul className="space-y-2">
                  {active.slice(0, 6).map((m) => (
                    <li
                      key={m.member_id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="font-semibold text-gray-800 dark:text-gray-200 truncate">
                        {m.member_name}
                      </span>
                      <span className="text-xs text-gray-400 tabular-nums shrink-0">
                        desde {formatClockIn(m.clock_in)}
                      </span>
                    </li>
                  ))}
                  {active.length > 6 && (
                    <p className="text-xs text-gray-400">+{active.length - 6} más</p>
                  )}
                </ul>
              )}
            </section>

            {/* Atajos */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {isDeliveryLike && (
                <QuickLink label="TPV" onClick={() => navigate('/saas/vertical/delivery/tpv')} />
              )}
              <QuickLink label="Alertas" onClick={() => navigate('/saas/alerts')} />
              {isDeliveryLike && (
                <QuickLink label="Caja" onClick={() => navigate('/saas/vertical/delivery/caja')} />
              )}
              <QuickLink label="Documentos OCR" onClick={() => navigate('/saas/documents')} />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function StatChip({
  icon,
  label,
  value,
  warn,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className={`rounded-xl p-3 ${warn ? 'bg-red-50 dark:bg-red-950/30' : 'bg-gray-50 dark:bg-gray-900/50'}`}>
      <div className={`flex items-center gap-1.5 mb-1 ${warn ? 'text-red-600' : 'text-gray-500'}`}>
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-lg font-black tabular-nums ${warn ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
        {value}
      </p>
    </div>
  );
}

function QuickLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-3 text-sm font-semibold text-gray-800 dark:text-gray-100 active:scale-[0.98] transition"
    >
      {label}
    </button>
  );
}
