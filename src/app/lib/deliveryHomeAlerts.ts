/**
 * Home alertas Delivery — 6 bloques compactos (texto de gerente).
 * Alineado con DELIVERY_COMPACT_VISIBLE_RULE_IDS.
 */

import type { AlertRecord } from './alertCenterApi';
import { DELIVERY_COMPACT_VISIBLE_RULE_IDS } from './deliveryAlertsReview';

export type DeliveryHomeAlertBlockId =
  | 'fichaje'
  | 'docs'
  | 'caja'
  | 'descuadre'
  | 'retrasos'
  | 'cobro';

export type DeliveryHomeAlertBlock = {
  id: DeliveryHomeAlertBlockId;
  label: string;
  short: string;
  ruleIds: readonly string[];
};

export const DELIVERY_HOME_ALERT_BLOCKS: DeliveryHomeAlertBlock[] = [
  {
    id: 'fichaje',
    label: 'Fichaje',
    short: 'Si no fichan',
    ruleIds: ['worker_no_clockin'],
  },
  {
    id: 'docs',
    label: 'Docs',
    short: 'Empresa',
    ruleIds: ['document_missing_required', 'document_expired', 'document_expiring_soon'],
  },
  {
    id: 'caja',
    label: 'Caja',
    short: 'Abrir / cerrar',
    ruleIds: ['delivery_register_not_opened', 'delivery_cash_pending_close'],
  },
  {
    id: 'descuadre',
    label: 'Descuadre',
    short: 'Caja',
    ruleIds: ['delivery_cash_discrepancy', 'delivery_register_closed_discrepancy'],
  },
  {
    id: 'retrasos',
    label: 'Retrasos',
    short: 'Pedidos',
    ruleIds: ['delivery_delayed_order', 'delivery_order_very_delayed'],
  },
  {
    id: 'cobro',
    label: 'Cobro',
    short: 'Sin pagar / cancelado',
    ruleIds: ['delivery_unpaid_order', 'delivery_order_cancelled'],
  },
];

const COMPACT_SET = new Set<string>(DELIVERY_COMPACT_VISIBLE_RULE_IDS);

function alertRuleKey(alert: AlertRecord): string {
  return String(alert.category || alert.metadata?.requiredName || '').trim();
}

/** ¿Esta alerta pertenece al pack compacto delivery? */
export function isDeliveryHomeCompactAlert(alert: AlertRecord): boolean {
  const key = alertRuleKey(alert);
  if (COMPACT_SET.has(key)) return true;
  // docs sintéticos
  if (String(alert.source || '') === 'documentacion' && String(alert.id || '').startsWith('doc:')) {
    const t = String(alert.category || '');
    return (
      t === 'missing_required'
      || t === 'document_missing_required'
      || t === 'expired'
      || t === 'document_expired'
      || t === 'expiring_soon'
      || t === 'document_expiring_soon'
    );
  }
  return false;
}

export function blockIdForAlert(alert: AlertRecord): DeliveryHomeAlertBlockId | null {
  const key = alertRuleKey(alert);
  const cat = String(alert.category || '');

  for (const block of DELIVERY_HOME_ALERT_BLOCKS) {
    if (block.ruleIds.includes(key) || block.ruleIds.includes(cat)) return block.id;
  }

  if (String(alert.source || '') === 'documentacion' || cat.includes('document') || cat.includes('missing_required') || cat === 'expired' || cat === 'expiring_soon') {
    return 'docs';
  }
  if (cat.includes('clockin') || cat.includes('worker_no')) return 'fichaje';
  if (cat.includes('discrepancy') || cat.includes('descuadre')) return 'descuadre';
  if (cat.includes('register') || cat.includes('cash_pending') || cat.includes('not_opened')) return 'caja';
  if (cat.includes('delayed') || cat.includes('retras')) return 'retrasos';
  if (cat.includes('unpaid') || cat.includes('cancel')) return 'cobro';
  return null;
}

export function countAlertsByHomeBlock(alerts: AlertRecord[]): Record<DeliveryHomeAlertBlockId, number> {
  const counts: Record<DeliveryHomeAlertBlockId, number> = {
    fichaje: 0,
    docs: 0,
    caja: 0,
    descuadre: 0,
    retrasos: 0,
    cobro: 0,
  };
  for (const alert of alerts) {
    if (!isDeliveryHomeCompactAlert(alert) && blockIdForAlert(alert) === null) continue;
    const id = blockIdForAlert(alert);
    if (id) counts[id] += 1;
  }
  return counts;
}

export function filterDeliveryHomeAlerts(alerts: AlertRecord[], limit = 6): AlertRecord[] {
  return alerts
    .filter((a) => isDeliveryHomeCompactAlert(a) || blockIdForAlert(a) != null)
    .slice(0, limit);
}
