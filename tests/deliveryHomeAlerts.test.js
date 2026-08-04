// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  blockIdForAlert,
  countAlertsByHomeBlock,
  filterDeliveryHomeAlerts,
  isDeliveryHomeCompactAlert,
} from '../src/app/lib/deliveryHomeAlerts.ts';

function alert(partial) {
  return {
    id: 'a1',
    category: 'delivery_delayed_order',
    title: 't',
    message: 'm',
    source: 'delivery',
    priority: 'medium',
    status: 'new',
    ...partial,
  };
}

describe('deliveryHomeAlerts', () => {
  it('clasifica por bloque', () => {
    expect(blockIdForAlert(alert({ category: 'worker_no_clockin' }))).toBe('fichaje');
    expect(blockIdForAlert(alert({ category: 'document_missing_required', source: 'documentacion' }))).toBe('docs');
    expect(blockIdForAlert(alert({ category: 'delivery_cash_discrepancy' }))).toBe('descuadre');
    expect(blockIdForAlert(alert({ category: 'delivery_unpaid_order' }))).toBe('cobro');
  });

  it('cuenta por bloque y filtra pack compacto', () => {
    const list = [
      alert({ id: '1', category: 'worker_no_clockin' }),
      alert({ id: '2', category: 'delivery_delayed_order' }),
      alert({ id: '3', category: 'delivery_order_very_delayed' }),
      alert({ id: '4', category: 'delivery_product_out_of_stock' }),
    ];
    expect(isDeliveryHomeCompactAlert(list[0])).toBe(true);
    expect(isDeliveryHomeCompactAlert(list[3])).toBe(false);
    const counts = countAlertsByHomeBlock(list);
    expect(counts.fichaje).toBe(1);
    expect(counts.retrasos).toBe(2);
    expect(filterDeliveryHomeAlerts(list).map((a) => a.id)).toEqual(['1', '2', '3']);
  });
});
