import { describe, expect, it } from 'vitest';
import { isPortfolioCeoAlert } from '../src/app/lib/portfolioCeoAlerts.js';

function alert(partial) {
  return {
    id: 'a1',
    source: 'delivery',
    category: '',
    priority: 'high',
    metadata: {},
    ...partial,
  };
}

describe('isPortfolioCeoAlert', () => {
  it('bloquea pedido retrasado y ruido de tienda', () => {
    expect(isPortfolioCeoAlert(alert({ category: 'delivery_delayed_order' }))).toBe(false);
    expect(isPortfolioCeoAlert(alert({ category: 'delivery_order_very_delayed' }))).toBe(false);
    expect(isPortfolioCeoAlert(alert({ category: 'delivery_unpaid_order' }))).toBe(false);
    expect(isPortfolioCeoAlert(alert({ category: 'delivery_order_cancelled' }))).toBe(false);
    expect(isPortfolioCeoAlert(alert({ category: 'worker_no_clockin', source: 'equipo' }))).toBe(false);
    expect(isPortfolioCeoAlert(alert({ category: 'delivery_register_not_opened' }))).toBe(false);
    expect(isPortfolioCeoAlert(alert({ category: 'delivery_cash_pending_close' }))).toBe(false);
  });

  it('permite docs, finanzas y descuadre', () => {
    expect(
      isPortfolioCeoAlert(alert({ source: 'documentacion', category: 'document_missing_required' })),
    ).toBe(true);
    expect(isPortfolioCeoAlert(alert({ source: 'finanzas', category: 'payment_overdue' }))).toBe(true);
    expect(
      isPortfolioCeoAlert(alert({ category: 'delivery_cash_discrepancy', source: 'delivery' })),
    ).toBe(true);
  });
});
