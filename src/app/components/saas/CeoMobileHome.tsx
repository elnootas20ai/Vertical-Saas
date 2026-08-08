import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  Banknote,
  ChevronRight,
  RefreshCw,
  Store,
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
  listTpvRegisterSessionsRequest,
  pointOfSaleDisplayLabel,
  type TpvRegisterSession,
} from '../../lib/deliveryApi';
import { useDeliveryOrdersLive } from '../../hooks/useDeliveryOrdersLive';
import { fetchActiveNow, type ActiveMember } from '../../lib/clockinsApi';
import { isRestaurantBusinessType } from '../../lib/deliveryOpsTypes';
import { formatMoneyEs } from '../../lib/formatNumberEs';
import {
  VERTIAL_ACCENT_TEXT,
  VERTIAL_SURFACE_STONE,
} from '../../lib/vertialUiTokens';
import {
  DeliveryMobileDashboardBlocks,
  DeliveryMobileHomeAlerts,
} from '../../verticals/delivery';
import { MobileLazySection } from './MobileLazySection';
import { LiveBadge } from './LiveBadge';

function formatClockIn(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function minutesSince(iso: string | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (Date.now() - t) / 60000);
}

function cashInOpenSession(session: TpvRegisterSession): number {
  const txs = session.transactions || [];
  const txTotal = txs
    .filter((t) => String(t.paymentMethod || '') === 'efectivo')
    .reduce((sum, t) => {
      const amt = Number(t.amount || 0) || 0;
      const typ = String(t.type || '');
      return sum + (typ === 'sale' || typ === 'cash_in' || typ === 'staff_consumption' ? amt : -amt);
    }, 0);
  return Number(session.initialCashAmount || 0) + txTotal;
}

/**
 * Home compacto del CEO en móvil / app nativa.
 * Delivery (1 empresa): mismos datos que Dashboard PC, layout táctil.
 * No llama al ops-center completo (pesado): caja con sesiones lite.
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
  const isDelivery = isDeliveryBusinessType(currentBusiness?.businessType);
  const isRestaurant = isRestaurantBusinessType(currentBusiness?.businessType);

  const [cashLoading, setCashLoading] = useState(true);
  const [sessions, setSessions] = useState<TpvRegisterSession[]>([]);
  const [active, setActive] = useState<ActiveMember[]>([]);
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [unpaidAmount, setUnpaidAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onUnpaidSnapshot = useCallback((count: number, amount: number) => {
    setUnpaidCount(count);
    setUnpaidAmount(amount);
  }, []);

  const load = useCallback(async () => {
    if (!businessId) {
      setCashLoading(false);
      return;
    }
    setCashLoading(true);
    setError(null);
    try {
      const salesPointId = store.activeSalesPointId || undefined;
      const [activeRes, sessionList] = await Promise.all([
        fetchActiveNow(businessId).catch(() => [] as ActiveMember[]),
        isDelivery && dataUserId
          ? listTpvRegisterSessionsRequest(dataUserId, {
              businessId,
              lite: true,
              ...(salesPointId ? { salesPointId } : {}),
            }).catch(() => [] as TpvRegisterSession[])
          : Promise.resolve([] as TpvRegisterSession[]),
      ]);
      setActive(activeRes || []);
      setSessions(Array.isArray(sessionList) ? sessionList : []);
    } catch (e) {
      setError((e as Error).message || 'No se pudo cargar el resumen');
    } finally {
      setCashLoading(false);
    }
  }, [businessId, dataUserId, isDelivery, store.activeSalesPointId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { sseOk: liveSseOk } = useDeliveryOrdersLive({
    authUserId: user?.user_id || user?.id || null,
    businessId,
    onRefresh: () => {
      void load();
    },
    enabled: !!businessId && isDelivery,
    fallbackPollMs: 45_000,
  });

  const scopedSessions = useMemo(() => {
    const pdv = store.activeSalesPointId || '';
    if (!pdv) return sessions;
    return sessions.filter((s) => String(s.pointOfSaleId || '').trim() === pdv);
  }, [sessions, store.activeSalesPointId]);

  const openSessions = useMemo(
    () => scopedSessions.filter((s) => String(s.status || '') === 'open'),
    [scopedSessions],
  );
  const openCajas = openSessions.length;
  const pendingCloseLate = openSessions.filter((s) => minutesSince(s.openedAt) / 60 > 14).length;
  const pendingValidation = scopedSessions.filter(
    (s) => String(s.status || '') === 'closed' && String(s.closingValidationStatus || '') === 'pending',
  ).length;
  const cashInDrawer = openSessions.reduce((sum, s) => sum + cashInOpenSession(s), 0);
  const cashNeedsAttention = pendingCloseLate > 0 || pendingValidation > 0;

  const businessName = currentBusiness?.name || 'Tu negocio';
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 20) return 'Buenas tardes';
    return 'Buenas noches';
  })();

  const storeChips = store.pointsOfSale.map((pdv) => ({
    id: String(pdv.id || pdv._id || ''),
    label: pointOfSaleDisplayLabel(pdv),
  })).filter((s) => s.id);

  return (
    <Layout title="Inicio" subtitle={businessName}>
      <div className="mx-auto max-w-lg space-y-3 pb-24 md:max-w-3xl">
        <div className="flex items-start justify-between gap-3 px-0.5">
          <div className="min-w-0">
            <p className="text-xs font-medium text-stone-500">{greeting}</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-bold text-stone-900 dark:text-stone-100">
                {user?.firstName || user?.fullName || 'CEO'}
              </h1>
              {isDelivery ? (
                <LiveBadge live={liveSseOk} refreshing={cashLoading} />
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="shrink-0 rounded-xl border border-stone-200 bg-white p-2.5 text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
            aria-label="Actualizar"
          >
            <RefreshCw className={`h-4 w-4 ${cashLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Tienda */}
        <section className={`${VERTIAL_SURFACE_STONE} p-3.5`}>
          <div className="mb-2 flex items-center gap-2">
            <Store className="h-4 w-4 text-stone-500" />
            <p className="text-xs font-bold uppercase tracking-wide text-stone-500">
              {isRestaurant ? 'Local' : 'Tienda'}
            </p>
          </div>
          {store.loading ? (
            <p className="text-sm text-stone-400">
              {isRestaurant ? 'Cargando locales…' : 'Cargando tiendas…'}
            </p>
          ) : storeChips.length <= 1 ? (
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              {store.displayLabelForActive
                || storeChips[0]?.label
                || businessName}
            </p>
          ) : (
            <div className="-mx-0.5 flex gap-2 overflow-x-auto pb-0.5">
              {storeChips.map((pdv) => {
                const selected = pdv.id === store.activeSalesPointId;
                return (
                  <button
                    key={pdv.id}
                    type="button"
                    onClick={() => store.setActiveSalesPoint(pdv.id)}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                      selected
                        ? 'border-[var(--v-blue,#2563eb)] bg-[var(--v-blue,#2563eb)] text-white'
                        : 'border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-600 dark:bg-stone-950/40 dark:text-stone-200'
                    }`}
                  >
                    {pdv.label}
                  </button>
                );
              })}
            </div>
          )}
          {businesses.length > 1 && (
            <button
              type="button"
              onClick={() => navigate('/auth/gate')}
              className={`mt-2 text-xs font-semibold ${VERTIAL_ACCENT_TEXT}`}
            >
              Cambiar de empresa →
            </button>
          )}
        </section>

        {error && (
          <p className="flex items-center gap-1.5 text-sm text-[var(--v-rose,#e11d48)]">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        <>
            {isDelivery && businessId ? (
              <MobileLazySection
                rootMargin="40px 0px"
                eagerFromMd={false}
                placeholder={
                  <div className={`${VERTIAL_SURFACE_STONE} px-4 py-4 text-center text-[11px] text-stone-400`}>
                    Desliza para ver alertas…
                  </div>
                }
              >
                <DeliveryMobileHomeAlerts
                  businessId={businessId}
                  dataUserId={dataUserId}
                />
              </MobileLazySection>
            ) : null}

            {isDelivery && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => navigate('/saas/vertical/delivery/caja')}
                  className={`w-full rounded-2xl border p-4 text-left ${
                    cashNeedsAttention
                      ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20'
                      : VERTIAL_SURFACE_STONE
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Banknote className="h-5 w-5 text-stone-600 dark:text-stone-300" />
                      <p className="text-sm font-bold text-stone-900 dark:text-stone-100">Estado de cajas</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-stone-400" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <CashStat
                      label="Abiertas"
                      value={cashLoading ? '…' : String(openCajas)}
                    />
                    <CashStat
                      label="Por validar"
                      value={cashLoading ? '…' : String(pendingValidation)}
                      warn={pendingValidation > 0}
                    />
                    <CashStat
                      label="En cajón"
                      value={cashLoading ? '…' : formatMoneyEs(cashInDrawer)}
                    />
                  </div>
                  {pendingCloseLate > 0 && (
                    <p className="mt-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                      {pendingCloseLate} caja{pendingCloseLate !== 1 ? 's' : ''} abierta{pendingCloseLate !== 1 ? 's' : ''} +14 h
                    </p>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/saas/delivery-ops')}
                  className={`flex w-full items-center justify-between gap-2 rounded-2xl border p-4 text-left ${
                    unpaidCount > 0
                      ? 'border-rose-200 bg-rose-50/80 dark:border-rose-900/40 dark:bg-rose-950/20'
                      : VERTIAL_SURFACE_STONE
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Wallet className={`h-5 w-5 ${unpaidCount > 0 ? 'text-[var(--v-rose,#e11d48)]' : 'text-stone-400'}`} />
                    <div>
                      <p className="text-sm font-bold text-stone-900 dark:text-stone-100">Sin cobrar</p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {unpaidCount > 0
                          ? `${unpaidCount} pedido${unpaidCount !== 1 ? 's' : ''} · ${formatMoneyEs(unpaidAmount)}`
                          : 'Ningún pedido activo pendiente de cobro'}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" />
                </button>
              </div>
            )}

            {/* KPIs/marcas en paralelo — no esperan al ops-center */}
            {isDelivery && dataUserId && businessId ? (
              <DeliveryMobileDashboardBlocks
                dataUserId={dataUserId}
                businessId={businessId}
                businessName={businessName}
                salesPointId={store.activeSalesPointId || null}
                opsAlertCount={pendingValidation + pendingCloseLate + unpaidCount}
                onUnpaidSnapshot={onUnpaidSnapshot}
                stores={storeChips.map((s) => ({ id: s.id, name: s.label }))}
                pdvs={store.pointsOfSale.map((pdv) => ({
                  id: String(pdv.id || pdv._id || '').trim(),
                  name: pointOfSaleDisplayLabel(pdv),
                  workCenterId: String(pdv.workCenterId || '').trim() || null,
                })).filter((p) => p.id)}
              />
            ) : null}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {isRestaurant && (
              <section className={`${VERTIAL_SURFACE_STONE} p-4`}>
                <p className="mb-3 text-sm font-bold text-stone-900 dark:text-stone-100">Operativa del local</p>
                <div className="grid grid-cols-2 content-start gap-2">
                  <QuickLink label="Centro ops" onClick={() => navigate('/saas/restaurant-ops')} />
                  <QuickLink label="Sala" onClick={() => navigate('/saas/sala')} />
                  <QuickLink label="TPV sala" onClick={() => navigate('/saas/caja/tpv')} />
                  <QuickLink label="Caja" onClick={() => navigate('/saas/caja')} />
                </div>
              </section>
            )}

            <section className={`${VERTIAL_SURFACE_STONE} p-4`}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-[var(--v-blue,#2563eb)]" />
                  <p className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    Equipo fichado ({active.length})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/saas/clockins')}
                  className={`text-xs font-semibold ${VERTIAL_ACCENT_TEXT}`}
                >
                  Ver →
                </button>
              </div>
              {cashLoading && active.length === 0 ? (
                <div className="animate-pulse space-y-2" aria-label="Cargando equipo fichado">
                  {[0, 1].map((i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <div className="h-3.5 w-32 rounded bg-stone-200 dark:bg-stone-800" />
                      <div className="h-3 w-16 rounded bg-stone-100 dark:bg-stone-900" />
                    </div>
                  ))}
                </div>
              ) : active.length === 0 ? (
                <p className="text-xs text-stone-500">Nadie fichado ahora mismo.</p>
              ) : (
                <ul className="space-y-2">
                  {active.slice(0, 6).map((m) => (
                    <li
                      key={m.member_id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate font-semibold text-stone-800 dark:text-stone-200">
                        {m.member_name}
                      </span>
                      <span className="shrink-0 tabular-nums text-xs text-stone-400">
                        desde {formatClockIn(m.clock_in)}
                      </span>
                    </li>
                  ))}
                  {active.length > 6 && (
                    <p className="text-xs text-stone-400">+{active.length - 6} más</p>
                  )}
                </ul>
              )}
            </section>

            <div className="grid grid-cols-2 content-start gap-2 pt-1 md:pt-0">
              {isDelivery && (
                <QuickLink label="TPV" onClick={() => navigate('/saas/vertical/delivery/tpv')} />
              )}
              {isRestaurant && (
                <QuickLink label="Cocina" onClick={() => navigate('/saas/cocina')} />
              )}
              <QuickLink
                label="Operativa"
                onClick={() => navigate(isDelivery ? '/saas/delivery-ops' : '/saas/restaurant-ops')}
              />
              {isDelivery && (
                <QuickLink label="Caja" onClick={() => navigate('/saas/vertical/delivery/caja')} />
              )}
              {isRestaurant && (
                <QuickLink label="Reservas" onClick={() => navigate('/saas/reservations')} />
              )}
              <QuickLink label="Documentos OCR" onClick={() => navigate('/saas/documents')} />
            </div>
            </div>
          </>
      </div>
    </Layout>
  );
}

function CashStat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white/80 p-2.5 dark:bg-stone-950/40">
      <p
        className={`text-lg font-black tabular-nums ${
          warn ? 'text-[var(--v-rose,#e11d48)]' : 'text-stone-900 dark:text-stone-100'
        }`}
      >
        {value}
      </p>
      <p className="text-[10px] font-semibold text-stone-500">{label}</p>
    </div>
  );
}

function QuickLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm font-semibold text-stone-800 transition active:scale-[0.98] dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
    >
      {label}
    </button>
  );
}
