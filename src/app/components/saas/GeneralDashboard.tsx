import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Building2, RefreshCw } from 'lucide-react';
import { Layout } from './Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { usePortfolioOverview } from '../../hooks/usePortfolioOverview';
import { useDashboardPlanAccess } from '../../hooks/useDashboardPlanAccess';
import { usePortfolioPlanAccess } from '../../hooks/usePortfolioPlanAccess';
import { PortfolioPlanBanner } from './PortfolioPlanBanner';
import { companyGeneratedMonth } from './portfolio/portfolioCompanyPulse';
import { buildCeoCompanyVisions } from './portfolio/ceo/ceoVisionModel';
import { useCeoAlertFeed, type CeoAlertFeedItem } from './portfolio/ceo/useCeoAlertFeed';
import {
  CeoCompanyDrawer,
  CeoCompanyTable,
  CeoVisionTopBar,
} from './portfolio/ceo/CeoVisionDashboard';
import { CeoGroupApartados } from './portfolio/ceo/CeoGroupApartados';
import { useCeoLaborCosts } from './portfolio/ceo/useCeoLaborCosts';
import {
  buildCeoActionRequests,
  CeoActionRequestsPanel,
  type CeoActionRequest,
} from './portfolio/ceo/CeoActionRequests';
import { MobileLazySection } from './MobileLazySection';

interface GeneralDashboardProps {
  onSelectBusiness: (businessId: string) => void;
}

/** Visión general CEO: alertas + apartados de grupo + líneas por empresa. */
export function GeneralDashboard({ onSelectBusiness }: GeneralDashboardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { businesses, switchBusiness } = useBusiness();
  const portfolioPlan = usePortfolioPlanAccess();
  const { canViewEbitda } = useDashboardPlanAccess();

  const { rows, finance, loading, isRefreshing, lastUpdatedAt, liveSseOk, error, reload } =
    usePortfolioOverview(user, businesses, { live: true });

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => companyGeneratedMonth(b) - companyGeneratedMonth(a)),
    [rows],
  );

  const {
    feed,
    statsByBiz,
    totals: alertTotals,
    loading: alertsLoading,
    reload: reloadAlerts,
  } = useCeoAlertFeed(sortedRows);

  const visions = useMemo(
    () => buildCeoCompanyVisions(sortedRows, statsByBiz),
    [sortedRows, statsByBiz],
  );

  const businessIds = useMemo(() => visions.map((v) => v.businessId), [visions]);
  const { laborByBiz, laborLoading } = useCeoLaborCosts(businessIds);

  const actionRequests = useMemo(
    () => buildCeoActionRequests(visions),
    [visions],
  );

  const [drawerBizId, setDrawerBizId] = useState<string | null>(null);
  const [drawerAlert, setDrawerAlert] = useState<CeoAlertFeedItem | null>(null);

  const drawerVision = useMemo(
    () => visions.find((v) => v.businessId === drawerBizId) || null,
    [visions, drawerBizId],
  );

  const liveStatusText = liveSseOk
    ? 'En vivo'
    : isRefreshing
      ? 'Actualizando…'
      : lastUpdatedAt
        ? `Actualizado ${lastUpdatedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
        : null;

  const handleRefresh = useCallback(async () => {
    await Promise.all([reload({ force: true }), reloadAlerts()]);
  }, [reload, reloadAlerts]);

  const openBusinessDrawer = (businessId: string, alert?: CeoAlertFeedItem | null) => {
    setDrawerBizId(businessId);
    setDrawerAlert(alert || null);
  };

  const enterBusiness = (businessId: string) => {
    switchBusiness(businessId);
    onSelectBusiness(businessId);
  };

  const openOps = (businessId: string) => {
    switchBusiness(businessId);
    navigate('/saas/delivery-ops');
  };

  const actOnRequest = (item: CeoActionRequest) => {
    switchBusiness(item.businessId);
    navigate(item.route);
  };

  const actOnAlert = (item: CeoAlertFeedItem) => {
    switchBusiness(item.businessId);
    navigate(item.route || '/saas/alerts');
  };

  return (
    <Layout
      title="Visión general"
      subtitle={`Todas las empresas (${businesses.length})`}
    >
      <div className="vsaas-page flex flex-col gap-3 -mt-1 sm:gap-5 md:gap-6">
        <PortfolioPlanBanner
          planLabel={portfolioPlan.planLabel}
          planTier={portfolioPlan.planTier}
          maxBusinesses={portfolioPlan.maxBusinesses}
          currentBusinesses={portfolioPlan.currentBusinesses}
          canUsePortfolioView={portfolioPlan.canUsePortfolioView}
          portfolioLocked={portfolioPlan.portfolioLocked}
        />

        <CeoVisionTopBar
          companyCount={visions.length || businesses.length}
          critical={alertTotals.critical}
          liveLabel={liveStatusText}
          refreshing={isRefreshing || loading || alertsLoading}
          onRefresh={() => void handleRefresh()}
        />

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        {loading && visions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-stone-500">
            <RefreshCw className="mb-3 h-8 w-8 animate-spin" />
            <p className="text-sm font-medium">Cargando visión del grupo…</p>
          </div>
        ) : visions.length === 0 ? (
          <EmptyPortfolio onCreate={() => navigate('/saas/settings/empresas')} />
        ) : (
          <>
            <CeoActionRequestsPanel
              visions={visions}
              alerts={feed}
              alertsLoading={alertsLoading}
              items={actionRequests}
              onActAlert={actOnAlert}
              onAct={actOnRequest}
            />

            <MobileLazySection
              rootMargin="120px 0px"
              placeholder={
                <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-8 text-center text-[11px] text-stone-400 dark:border-stone-800">
                  Desliza para ver dinero y clientes del grupo…
                </div>
              }
            >
              <CeoGroupApartados
                visions={visions}
                rows={sortedRows}
                finance={finance}
                canViewEbitda={canViewEbitda}
                laborByBiz={laborByBiz}
                laborLoading={laborLoading}
                onOpen={(id) => openBusinessDrawer(id)}
              />
            </MobileLazySection>

            <MobileLazySection
              rootMargin="160px 0px"
              placeholder={
                <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-8 text-center text-[11px] text-stone-400 dark:border-stone-800">
                  Desliza para ver empresas…
                </div>
              }
            >
              <CeoCompanyTable
                visions={visions}
                canViewEbitda={canViewEbitda}
                onOpen={(id) => openBusinessDrawer(id)}
                laborByBiz={laborByBiz}
                laborLoading={laborLoading}
              />
            </MobileLazySection>
          </>
        )}

        <CeoCompanyDrawer
          open={Boolean(drawerBizId && drawerVision)}
          vision={drawerVision}
          alert={drawerAlert}
          onClose={() => {
            setDrawerBizId(null);
            setDrawerAlert(null);
          }}
          onEnter={enterBusiness}
          onOpenOps={openOps}
          onOpenAlerts={() => navigate('/saas/alerts')}
        />
      </div>
    </Layout>
  );
}

function EmptyPortfolio({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-stone-200 py-16 text-center dark:border-stone-800">
      <Building2 className="mb-3 h-10 w-10 text-stone-300" />
      <p className="text-sm font-semibold text-stone-700 dark:text-stone-200">Sin empresas todavía</p>
      <p className="mt-1 max-w-sm text-xs text-stone-500">
        Crea la primera empresa para ver aquí los totales del grupo.
      </p>
      <button type="button" onClick={onCreate} className="vsaas-btn-advance mt-4">
        Ir a empresas
      </button>
    </div>
  );
}
