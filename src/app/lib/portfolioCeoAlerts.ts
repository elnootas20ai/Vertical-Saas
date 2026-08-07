/**
 * Alertas de Visión general (grupo / CEO).
 * No es el Centro de alertas ni el pack operativo delivery (retrasos, fichaje, etc.).
 */

import type { AlertRecord, AlertSource } from './alertCenterApi';

/** Ruido operativo: va a ops / home tienda, no al panel CEO del grupo. */
const PORTFOLIO_CEO_BLOCKED_RULE_IDS = new Set([
  'delivery_delayed_order',
  'delivery_order_very_delayed',
  'delivery_unpaid_order',
  'delivery_order_cancelled',
  'worker_no_clockin',
  'delivery_register_not_opened',
  'delivery_cash_pending_close',
  'stale_delivery',
  'delivery_unpaid',
  'delivery_unattended',
  'delivery_product_out_of_stock',
  'delivery_order_unattended',
]);

const PORTFOLIO_CEO_ALLOWED_SOURCES = new Set<AlertSource>([
  'documentacion',
  'finanzas',
  'conciliacion',
  'ocr',
  'equipo',
  'sistema',
]);

function alertRuleKey(alert: Pick<AlertRecord, 'category' | 'metadata'>): string {
  return String(alert.category || alert.metadata?.requiredName || '').trim();
}

function isCashDiscrepancy(ruleKey: string): boolean {
  return (
    ruleKey === 'delivery_cash_discrepancy'
    || ruleKey === 'delivery_register_closed_discrepancy'
    || ruleKey.includes('discrepancy')
    || ruleKey.includes('descuadre')
  );
}

function isDocAlert(alert: Pick<AlertRecord, 'source' | 'category' | 'id'>): boolean {
  if (String(alert.source || '') === 'documentacion') return true;
  const cat = String(alert.category || '');
  return (
    cat.includes('document')
    || cat === 'missing_required'
    || cat === 'expired'
    || cat === 'expiring_soon'
    || String(alert.id || '').startsWith('doc:')
  );
}

/**
 * ¿Entra en «Alertas y solicitudes» de Visión general?
 * Sí: docs empresa, finanzas, RRHH (no fichaje), descuadre grave.
 * No: pedido retrasado, sin cobrar, cancelado, caja abrir/cerrar, fichaje…
 */
export function isPortfolioCeoAlert(
  alert: Pick<AlertRecord, 'id' | 'source' | 'category' | 'priority' | 'metadata'>,
): boolean {
  const ruleKey = alertRuleKey(alert);
  if (ruleKey && PORTFOLIO_CEO_BLOCKED_RULE_IDS.has(ruleKey)) return false;

  const source = String(alert.source || '') as AlertSource;

  if (isDocAlert(alert)) return true;
  if (isCashDiscrepancy(ruleKey)) return true;

  if (PORTFOLIO_CEO_ALLOWED_SOURCES.has(source)) {
    if (source === 'equipo') {
      const k = ruleKey.toLowerCase();
      if (k.includes('clockin') || k.includes('fichaje') || k.includes('no_clock')) return false;
    }
    return true;
  }

  // Delivery / sala: solo descuadre (ya cubierto arriba). Nada de retrasos ni cobros.
  return false;
}
