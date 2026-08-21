/**
 * Motor de alertas Eventos — cierre de caja obligatorio en PDV portátiles.
 * Reutiliza sesiones TPV compartidas (misma DB delivery) sin meter lógica en deliveryAlertEngine.
 */
import { getDeliveryDbName, findAccountByUserId } from './couchdb.js';
import {
  emitGlobalAlert,
  fetchAllDocsOfType,
  getBusinessesOfType,
  fakeReq,
} from './alertEmitter.js';
import {
  resolveCashRegisterAlertConfig,
  minutesPastCloseDeadline,
} from './cashRegisterAlertConfig.js';
import { canEmitPdvCashAlerts } from './pdvAlertUtils.js';
import { shouldRunBackgroundEngine } from './engineIdleGate.js';
import logger from './logger.js';

const TAG = 'EVENTS_ALERT_ENGINE';
const INTERVAL_MS = 15 * 60_000;
const STARTUP_DELAY_MS = 25_000;
const EVENTS_TPV_ROUTE = '/saas/vertical/eventos/tpv';

function bareBiz(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

function sessionBusinessId(session) {
  return bareBiz(session?.business_id || session?.businessId);
}

async function emit(ctx, opts) {
  return emitGlobalAlert({
    businessId: ctx.businessId || '',
    userId: ctx.userId || '',
    source: 'eventos',
    ruleId: opts.category,
    tag: TAG,
    ...opts,
  });
}

async function checkEventsCashPendingClose(ctx, tpvSessions, cashCfg, pointsOfSale) {
  if (!cashCfg?.cashPendingCloseEnabled || !canEmitPdvCashAlerts(pointsOfSale)) return [];

  const now = new Date();
  const deadline = cashCfg.cashCloseDeadline || '23:30';
  const warnMin = Number(cashCfg.cashWarningMinutes || 30);
  const maxHours = Number(cashCfg.cashMaxOpenHours || 12);
  const pdvIds = new Set(
    (pointsOfSale || []).map((p) => String(p?._id || p?.id || '').trim()).filter(Boolean),
  );
  const alerts = [];

  for (const s of tpvSessions) {
    if (s.status !== 'open') continue;
    const pdvId = String(s.pointOfSaleId || '').trim();
    if (pdvIds.size > 0 && pdvId && !pdvIds.has(pdvId)) continue;
    if (sessionBusinessId(s) && sessionBusinessId(s) !== bareBiz(ctx.businessId)) continue;

    const op = new Date(s.openedAt || s.createdAt);
    if (Number.isNaN(op.getTime())) continue;
    const hrs = (now.getTime() - op.getTime()) / 3_600_000;
    const label = s.pointOfSaleName || s.terminalName || 'PDV evento';

    if (hrs >= maxHours) {
      alerts.push(await emit(ctx, {
        dedupKey: `events-caja-old-${s._id}`,
        level: 'warning',
        category: 'events_cash_pending_close',
        priority: 'high',
        title: 'Caja de evento olvidada',
        message: `${label} lleva ${Math.floor(hrs)}h abierta (máx. ${maxHours}h). Cierre obligatorio.`,
        entityId: s._id,
        entityType: 'tpv_register_session',
        route: EVENTS_TPV_ROUTE,
        metadata: {
          sessionId: s._id,
          hoursOpen: Math.round(hrs * 10) / 10,
          maxHours,
          pointOfSaleName: label,
        },
      }));
      continue;
    }

    const mp = minutesPastCloseDeadline(now, deadline);
    if (mp > 0) {
      let priority = 'low';
      if (mp > warnMin * 2) priority = 'high';
      else if (mp > warnMin) priority = 'medium';
      alerts.push(await emit(ctx, {
        dedupKey: `events-caja-lt-${s._id}`,
        level: 'warning',
        category: 'events_cash_pending_close',
        priority,
        title: 'Caja de evento pendiente de cierre',
        message: `${label} sigue abierta desde ${op.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} (límite ${deadline}).`,
        entityId: s._id,
        entityType: 'tpv_register_session',
        route: EVENTS_TPV_ROUTE,
        metadata: {
          sessionId: s._id,
          hoursOpen: Math.round(hrs * 10) / 10,
          deadline,
          minutesPastDeadline: Math.floor(mp),
          pointOfSaleName: label,
        },
      }));
    }
  }

  return alerts.filter(Boolean);
}

async function runForBusiness(business) {
  const businessId = bareBiz(business.business_id || business._id);
  const userId = String(business.owner_user_id || '').trim();
  if (!businessId || !userId) return 0;

  const account = await findAccountByUserId(fakeReq, userId).catch(() => null);
  const cashCfg = resolveCashRegisterAlertConfig(account, null);

  const [tpvSessions, pointsOfSale] = await Promise.all([
    fetchAllDocsOfType(getDeliveryDbName(), 'tpv_register_session').then((docs) =>
      docs.filter((s) => {
        if (s.user_id && s.user_id !== userId) return false;
        const bid = sessionBusinessId(s);
        return !bid || bid === businessId;
      }),
    ),
    fetchAllDocsOfType(getDeliveryDbName(), 'point_of_sale').then((docs) =>
      docs.filter((p) => {
        if (p.user_id && p.user_id !== userId) return false;
        if (p.active === false || p.deletedAt) return false;
        const bid = bareBiz(p.businessId || p.business_id);
        return !bid || bid === businessId;
      }),
    ),
  ]);

  const ctx = { businessId, userId };
  const emitted = await checkEventsCashPendingClose(ctx, tpvSessions, cashCfg, pointsOfSale);
  return emitted.length;
}

export async function runEventsAlertEngine() {
  const start = Date.now();
  try {
    const businesses = await getBusinessesOfType('events');
    let total = 0;
    for (const biz of businesses) {
      try {
        total += await runForBusiness(biz);
      } catch (err) {
        logger.warn(
          { tag: TAG, businessId: biz?.business_id, err: err?.message },
          'Error alertas eventos en negocio',
        );
      }
    }
    const ms = Date.now() - start;
    if (total > 0 || ms > 4000) {
      logger.info({ tag: TAG, businesses: businesses.length, alerts: total, ms }, 'Ciclo alertas eventos');
    }
    return total;
  } catch (err) {
    logger.error({ tag: TAG, err: err?.message }, 'Error motor alertas eventos');
    return 0;
  }
}

let _timer = null;

export function startEventsAlertEngine() {
  if (_timer || !shouldRunBackgroundEngine()) return;
  const tick = () => {
    void runEventsAlertEngine().catch(() => null);
  };
  setTimeout(() => {
    tick();
    _timer = setInterval(tick, INTERVAL_MS);
  }, STARTUP_DELAY_MS);
  logger.info({ tag: TAG, intervalMin: INTERVAL_MS / 60_000 }, 'Motor alertas eventos arrancado');
}
