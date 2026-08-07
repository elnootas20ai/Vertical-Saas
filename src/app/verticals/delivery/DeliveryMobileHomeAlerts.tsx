/**
 * Alertas home Delivery (móvil): 6 bloques compactos.
 * Solo cuenta el pack delivery (nunca el total genérico del centro de alertas).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react';
import { fetchAlerts } from '../../lib/alertCenterApi';
import {
  fetchDocumentAlertsAsRecords,
  mergeAlertLists,
} from '../../lib/documentAlertsApi';
import {
  countAlertsByHomeBlock,
  DELIVERY_HOME_ALERT_BLOCKS,
  type DeliveryHomeAlertBlockId,
} from '../../lib/deliveryHomeAlerts';
import { VERTIAL_SURFACE_STONE } from '../../lib/vertialUiTokens';

type Props = {
  businessId: string;
  dataUserId?: string | null;
};

const BLOCK_ROUTE: Record<DeliveryHomeAlertBlockId, string> = {
  fichaje: '/saas/alerts?source=equipo',
  docs: '/saas/alerts?source=documentacion',
  caja: '/saas/vertical/delivery/caja',
  descuadre: '/saas/vertical/delivery/caja',
  retrasos: '/saas/delivery-ops',
  cobro: '/saas/delivery-ops',
};

export function DeliveryMobileHomeAlerts({
  businessId,
  dataUserId,
}: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<DeliveryHomeAlertBlockId, number>>({
    fichaje: 0,
    docs: 0,
    caja: 0,
    descuadre: 0,
    retrasos: 0,
    cobro: 0,
  });

  const load = useCallback(async () => {
    if (!businessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [alertsRes, docAlerts] = await Promise.all([
        fetchAlerts(businessId, { status: 'new,seen', order: 'desc', page: 1, limit: 80 }).catch(
          () => ({ alerts: [] }),
        ),
        dataUserId
          ? fetchDocumentAlertsAsRecords(dataUserId, businessId).catch(() => [])
          : Promise.resolve([]),
      ]);
      const merged = mergeAlertLists(alertsRes.alerts || [], docAlerts, 100);
      setCounts(countAlertsByHomeBlock(merged));
    } finally {
      setLoading(false);
    }
  }, [businessId, dataUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = useMemo(
    () => DELIVERY_HOME_ALERT_BLOCKS.reduce((s, b) => s + (counts[b.id] || 0), 0),
    [counts],
  );
  const hotBlocks = useMemo(
    () => DELIVERY_HOME_ALERT_BLOCKS.filter((b) => (counts[b.id] || 0) > 0).length,
    [counts],
  );

  return (
    <section className={`${VERTIAL_SURFACE_STONE} overflow-hidden`}>
      <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
        <button
          type="button"
          onClick={() => navigate('/saas/alerts')}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <AlertTriangle
            className={`h-4 w-4 shrink-0 ${total > 0 ? 'text-[var(--v-rose,#e11d48)]' : 'text-stone-400'}`}
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-stone-900 dark:text-stone-100">Alertas ops</p>
            <p className="text-[11px] text-stone-500">
              {loading
                ? 'Cargando pack…'
                : total > 0
                  ? `${total} en ${hotBlocks} bloque${hotBlocks !== 1 ? 's' : ''} · Fichaje · Caja · Cobro…`
                  : 'Todo en orden'}
            </p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Actualizar alertas"
            onClick={() => void load()}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            aria-label="Abrir centro de alertas"
            onClick={() => navigate('/saas/alerts')}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px bg-stone-100 dark:bg-stone-800">
        {DELIVERY_HOME_ALERT_BLOCKS.map((block) => {
          const n = counts[block.id] || 0;
          const hot = n > 0;
          return (
            <button
              key={block.id}
              type="button"
              onClick={() => navigate(BLOCK_ROUTE[block.id])}
              className={`min-h-[4.25rem] bg-white px-2.5 py-2.5 text-left transition-colors active:bg-stone-50 dark:bg-stone-900 dark:active:bg-stone-800 ${
                hot ? 'ring-inset ring-1 ring-rose-200/80 dark:ring-rose-900/50' : ''
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                {block.label}
              </p>
              <p
                className={`mt-1 text-lg font-black tabular-nums ${
                  hot
                    ? 'text-[var(--v-rose,#e11d48)]'
                    : 'text-stone-900 dark:text-stone-100'
                }`}
              >
                {loading ? '—' : n}
              </p>
              <p className="mt-0.5 truncate text-[10px] text-stone-400">{block.short}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
