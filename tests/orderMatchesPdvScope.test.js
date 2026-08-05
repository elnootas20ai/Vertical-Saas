/**
 * Regresión: empleo con wc-… no debe vaciar pedidos con salesPointId pdv-…
 */
import { describe, expect, it } from 'vitest';
import { orderMatchesPdvScope } from '../controllers/deliveryController.js';

describe('orderMatchesPdvScope', () => {
  const order = {
    salesPointId: 'pdv-594a8503-1515-47b8-9e02-fb8ff09052b6',
    salesPointName: 'BADALONA · BAD-01',
  };
  const wc = 'wc-16361270-5794-4b95-89e5-644685f36e24';
  const pdv = order.salesPointId;

  it('acepta filtro por PDV id', () => {
    expect(orderMatchesPdvScope(order, pdv, pdv, 'BADALONA', wc)).toBe(true);
  });

  it('acepta filtro por centro de trabajo (empleo worker)', () => {
    expect(orderMatchesPdvScope(order, wc, pdv, 'BADALONA', wc)).toBe(true);
  });

  it('rechaza otra tienda', () => {
    expect(orderMatchesPdvScope(order, 'pdv-other', pdv, 'Otra', 'wc-other')).toBe(false);
  });
});
