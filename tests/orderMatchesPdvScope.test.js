/**
 * Regresión: empleo con wc-… no debe vaciar pedidos con salesPointId pdv-…
 * (Badalona, Tiana y cualquier invitado).
 */
import { describe, expect, it } from 'vitest';
import { orderMatchesPdvScope } from '../controllers/deliveryController.js';

describe('orderMatchesPdvScope', () => {
  const badalona = {
    salesPointId: 'pdv-594a8503-1515-47b8-9e02-fb8ff09052b6',
    salesPointName: 'BADALONA · BAD-01',
  };
  const tiana = {
    salesPointId: 'pdv-934ce697-314d-46e5-bc9b-e0a2afee3bf7',
    salesPointName: 'MODOMIO TIANA · MOD-04',
  };
  const badWc = 'wc-16361270-5794-4b95-89e5-644685f36e24';
  const tianaWc = 'wc-ffdee346-8730-4aeb-961d-24832f17f1c1';

  it('Badalona: filtro por PDV id', () => {
    expect(orderMatchesPdvScope(badalona, badalona.salesPointId, badalona.salesPointId, 'BADALONA', badWc)).toBe(true);
  });

  it('Badalona: filtro por centro de trabajo (empleo worker)', () => {
    expect(orderMatchesPdvScope(badalona, badWc, badalona.salesPointId, 'BADALONA', badWc)).toBe(true);
  });

  it('Tiana: filtro por centro de trabajo (empleo worker)', () => {
    expect(orderMatchesPdvScope(tiana, tianaWc, tiana.salesPointId, 'MODOMIO TIANA', tianaWc)).toBe(true);
  });

  it('rechaza otra tienda', () => {
    expect(orderMatchesPdvScope(badalona, tiana.salesPointId, badalona.salesPointId, 'Tiana', tianaWc)).toBe(false);
  });
});
