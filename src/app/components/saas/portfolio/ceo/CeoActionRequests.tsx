import { useMemo, useState } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { SOURCE_LABELS } from '../../../../lib/alertCenterApi';
import type { CeoCompanyVision } from './ceoVisionModel';
import type { CeoAlertFeedItem } from './useCeoAlertFeed';

/** Solicitudes pendientes (no alertas del centro). */
export type CeoActionModule = 'rrhh' | 'tpv' | 'finanzas';

export type CeoActionRequest = {
  id: string;
  businessId: string;
  businessName: string;
  brandColor: string;
  module: CeoActionModule;
  priority: 'high' | 'medium';
  title: string;
  detail: string;
  ctaLabel: string;
  route: string;
};

const MODULE_LABEL: Record<CeoActionModule, string> = {
  rrhh: 'RRHH',
  tpv: 'TPV',
  finanzas: 'Ingresos / Gastos',
};

/** Solo solicitudes (RRHH / TPV / finanzas). Las alertas van por el feed del centro. */
export function buildCeoActionRequests(visions: CeoCompanyVision[]): CeoActionRequest[] {
  const out: CeoActionRequest[] = [];

  for (const v of visions) {
    const vac = v.row.team.pendingVacationRequests || 0;
    if (vac > 0) {
      out.push({
        id: `${v.businessId}:vacations`,
        businessId: v.businessId,
        businessName: v.name,
        brandColor: v.brandColor,
        module: 'rrhh',
        priority: 'high',
        title: `${vac} solicitud${vac === 1 ? '' : 'es'} de vacaciones`,
        detail: 'Por aprobar',
        ctaLabel: 'RRHH',
        route: '/saas/equipo/solicitudes',
      });
    }

    const cajas = v.row.metrics.openCashRegisters || 0;
    if ((v.row.isDelivery || v.row.isRestaurant) && cajas > 0) {
      out.push({
        id: `${v.businessId}:caja`,
        businessId: v.businessId,
        businessName: v.name,
        brandColor: v.brandColor,
        module: 'tpv',
        priority: 'medium',
        title: `${cajas} caja${cajas === 1 ? '' : 's'} abierta${cajas === 1 ? '' : 's'}`,
        detail: 'TPV / caja',
        ctaLabel: 'Caja',
        route: v.row.isRestaurant ? '/saas/caja' : '/saas/vertical/delivery/caja',
      });
    }

    if ((v.pending || 0) > 0) {
      out.push({
        id: `${v.businessId}:pending`,
        businessId: v.businessId,
        businessName: v.name,
        brandColor: v.brandColor,
        module: 'finanzas',
        priority: v.pending >= 2000 ? 'high' : 'medium',
        title: 'Pendiente por cobrar / pagar',
        detail: v.name,
        ctaLabel: 'Finanzas',
        route: '/saas/income-expenses',
      });
    }
  }

  return out.sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1));
}

type CompanyBundle = {
  vision: CeoCompanyVision;
  alerts: CeoAlertFeedItem[];
  requests: CeoActionRequest[];
  pendingCount: number;
  criticalAlerts: number;
};

/**
 * Empresas del cliente → al abrir: solicitudes y alertas de esa empresa.
 */
export function CeoActionRequestsPanel({
  visions,
  alerts,
  alertsLoading,
  items,
  onActAlert,
  onAct,
}: {
  visions: CeoCompanyVision[];
  alerts: CeoAlertFeedItem[];
  alertsLoading?: boolean;
  items: CeoActionRequest[];
  onActAlert: (item: CeoAlertFeedItem) => void;
  onAct: (item: CeoActionRequest) => void;
}) {
  const bundles = useMemo<CompanyBundle[]>(() => {
    const alertsByBiz = new Map<string, CeoAlertFeedItem[]>();
    for (const a of alerts) {
      const list = alertsByBiz.get(a.businessId) || [];
      list.push(a);
      alertsByBiz.set(a.businessId, list);
    }
    const reqByBiz = new Map<string, CeoActionRequest[]>();
    for (const r of items) {
      const list = reqByBiz.get(r.businessId) || [];
      list.push(r);
      reqByBiz.set(r.businessId, list);
    }

    return visions.map((v) => {
      let bizAlerts = alertsByBiz.get(v.businessId) || [];
      // Contadores ya vienen filtrados (portfolio CEO). Solo inventar si hay críticas.
      if (bizAlerts.length === 0 && v.alertsHigh > 0) {
        bizAlerts = [
          {
            id: `summary:${v.businessId}`,
            businessId: v.businessId,
            businessName: v.name,
            title: `${v.alertsHigh} crítica${v.alertsHigh === 1 ? '' : 's'} (docs / finanzas)`,
            message: 'Abrir centro de alertas',
            priority: 'high',
            source: 'sistema',
            route: '/saas/alerts',
            createdAt: new Date().toISOString(),
          },
        ];
      }
      const requests = reqByBiz.get(v.businessId) || [];
      const highFromFeed = bizAlerts.filter((a) => a.priority === 'high').length;
      return {
        vision: v,
        alerts: bizAlerts,
        requests,
        pendingCount: bizAlerts.length + requests.length,
        // Número rojo = críticas CEO filtradas (no cola delivery de 164).
        criticalAlerts: highFromFeed || v.alertsHigh || 0,
      };
    });
  }, [visions, alerts, items]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const totalPending = useMemo(
    () => bundles.reduce((n, b) => n + b.pendingCount, 0),
    [bundles],
  );
  const totalCritical = useMemo(
    () => bundles.reduce((n, b) => n + b.criticalAlerts, 0),
    [bundles],
  );

  return (
    <section>
      {/* Un solo botón; encima de Líneas por empresa. Al abrir: empresas + desplegables */}
      <button
        type="button"
        onClick={() => {
          setPanelOpen((v) => {
            if (v) setOpenId(null);
            return !v;
          });
        }}
        aria-expanded={panelOpen}
        className={`flex w-full min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors sm:min-h-0 ${
          panelOpen
            ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 dark:border-blue-600 dark:bg-blue-950/40'
            : 'border-stone-200/80 bg-white hover:border-stone-300 dark:border-stone-800 dark:bg-stone-950 dark:hover:border-stone-700'
        }`}
      >
        <div className="min-w-0 flex-1">
          <p
            className={`text-[13px] font-bold ${
              panelOpen
                ? 'text-[var(--v-blue,#2563eb)]'
                : 'text-stone-900 dark:text-white'
            }`}
          >
            Alertas y solicitudes
          </p>
          <p className="text-[10px] text-stone-500">
            {visions.length} empresa{visions.length !== 1 ? 's' : ''}
            {totalPending > 0
              ? ` · ${totalPending} pendiente${totalPending !== 1 ? 's' : ''} (docs / finanzas)`
              : ' · al día'}
            {alertsLoading ? ' · cargando…' : ''}
          </p>
        </div>
        {totalCritical > 0 ? (
          <span className="rounded-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-white">
            {totalCritical}
          </span>
        ) : totalPending > 0 ? (
          <span className="rounded-md bg-amber-500 px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-white">
            {totalPending}
          </span>
        ) : null}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${panelOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {panelOpen ? (
        <ul className="mt-1.5 overflow-hidden rounded-xl border border-stone-200/80 bg-white dark:border-stone-800 dark:bg-stone-950">
          {bundles.map((b) => {
            const v = b.vision;
            const isOpen = openId === v.businessId;

            return (
              <li
                key={v.businessId}
                className="border-b border-stone-100 last:border-0 dark:border-stone-800"
              >
                <button
                  type="button"
                  onClick={() => setOpenId((prev) => (prev === v.businessId ? null : v.businessId))}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-stone-50 dark:hover:bg-stone-900/50"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: v.brandColor }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-stone-800 dark:text-stone-100">
                    {v.name}
                  </span>
                  {b.criticalAlerts > 0 ? (
                    <span className="text-[10px] font-extrabold tabular-nums text-rose-600">
                      {b.criticalAlerts}
                    </span>
                  ) : b.pendingCount > 0 ? (
                    <span className="text-[10px] font-extrabold tabular-nums text-amber-700 dark:text-amber-400">
                      {b.pendingCount}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold tabular-nums text-stone-300">0</span>
                  )}
                  <ChevronDown
                    className={`h-3 w-3 shrink-0 text-stone-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {isOpen ? (
                  <div className="space-y-2 border-t border-stone-100 bg-stone-50/60 px-2.5 py-2 dark:border-stone-800 dark:bg-stone-900/40">
                    <div>
                      <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-stone-400">
                        Solicitudes
                      </p>
                      {b.requests.length === 0 ? (
                        <p className="text-[10px] text-stone-400">Nada pendiente</p>
                      ) : (
                        <ul className="space-y-0.5">
                          {b.requests.map((item) => (
                            <li key={item.id}>
                              <button
                                type="button"
                                onClick={() => onAct(item)}
                                className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left hover:bg-white dark:hover:bg-stone-950"
                              >
                                <span
                                  className={`h-1 w-1 shrink-0 rounded-full ${
                                    item.priority === 'high' ? 'bg-rose-500' : 'bg-amber-500'
                                  }`}
                                />
                                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-stone-800 dark:text-stone-100">
                                  {item.title}
                                </span>
                                <span className="shrink-0 text-[9px] font-semibold text-stone-400">
                                  {MODULE_LABEL[item.module]}
                                </span>
                                <ArrowRight className="h-3 w-3 shrink-0 text-stone-300" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-stone-400">
                        Alertas
                      </p>
                      {b.alerts.length === 0 ? (
                        <p className="text-[10px] text-stone-400">Sin alertas</p>
                      ) : (
                        <ul className="space-y-0.5">
                          {b.alerts.map((item) => (
                            <li key={`${item.businessId}:${item.id}`}>
                              <button
                                type="button"
                                onClick={() => onActAlert(item)}
                                className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left hover:bg-white dark:hover:bg-stone-950"
                              >
                                <span
                                  className={`h-1 w-1 shrink-0 rounded-full ${
                                    item.priority === 'high'
                                      ? 'bg-rose-500'
                                      : item.priority === 'medium'
                                        ? 'bg-amber-500'
                                        : 'bg-stone-400'
                                  }`}
                                />
                                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-stone-800 dark:text-stone-100">
                                  {item.title}
                                </span>
                                <span className="shrink-0 text-[9px] font-semibold text-stone-400">
                                  {SOURCE_LABELS[item.source] || item.source}
                                </span>
                                <ArrowRight className="h-3 w-3 shrink-0 text-stone-300" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
