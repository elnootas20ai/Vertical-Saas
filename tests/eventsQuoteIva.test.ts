import { describe, expect, it } from 'vitest';
import {
  EVENTS_QUOTE_IVA_PERCENT,
  EVENTS_QUOTE_IVA_RATE,
  computeEventsQuoteIva,
} from '../shared/events/quoteIva.js';
import { computeQuoteMoney } from '../src/app/lib/eventsFlow';

describe('events quote IVA', () => {
  it('usa 10% en shared y en el front', () => {
    expect(EVENTS_QUOTE_IVA_RATE).toBe(0.1);
    expect(EVENTS_QUOTE_IVA_PERCENT).toBe(10);
    expect(computeEventsQuoteIva(1000)).toEqual({
      subtotal: 1000,
      iva: 100,
      total: 1100,
    });
    expect(computeQuoteMoney([
      { id: '1', concepto: 'Catering', cantidad: 1, precioUnitario: 1000, total: 1000 },
    ])).toEqual({
      subtotal: 1000,
      iva: 100,
      total: 1100,
    });
  });
});
