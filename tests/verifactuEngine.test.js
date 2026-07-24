import { describe, expect, it } from 'vitest';
import {
  buildHuellaPayload,
  computeHuella,
  buildQrUrl,
  calcLineTotals,
  formatDateEs,
  formatInvoiceNumber,
  VERIFACTU_QR_SANDBOX,
} from '../services/verifactuEngine.js';

describe('verifactuEngine (Fase 1)', () => {
  it('calcula bases e IVA', () => {
    const t = calcLineTotals([
      { description: 'Pizza', quantity: 2, unitPrice: 10, discountPercent: 0, taxRate: 10 },
    ]);
    expect(t.base).toBe(20);
    expect(t.tax).toBe(2);
    expect(t.total).toBe(22);
  });

  it('encadena huellas distintas con anterior', () => {
    const h1 = computeHuella({
      issuerNif: 'B12345678',
      series: 'A',
      number: '0001',
      issueDate: '2026-07-24',
      total: 22,
      huellaAnterior: null,
    });
    const h2 = computeHuella({
      issuerNif: 'B12345678',
      series: 'A',
      number: '0002',
      issueDate: '2026-07-24',
      total: 50,
      huellaAnterior: h1,
    });
    expect(h1).toHaveLength(64);
    expect(h2).toHaveLength(64);
    expect(h1).not.toBe(h2);

    const same = computeHuella({
      issuerNif: 'B12345678',
      series: 'A',
      number: '0001',
      issueDate: '2026-07-24',
      total: 22,
      huellaAnterior: null,
    });
    expect(same).toBe(h1);
  });

  it('arma payload canónico estable', () => {
    expect(
      buildHuellaPayload({
        issuerNif: 'b-12345678',
        series: 'A',
        number: '0001',
        issueDate: '2026-07-24',
        total: 22,
        huellaAnterior: '',
      }),
    ).toBe('B12345678|A0001|2026-07-24|22.00|');
  });

  it('genera URL QR sandbox AEAT', () => {
    const url = buildQrUrl({
      issuerNif: 'B12345678',
      series: 'A',
      number: '0001',
      issueDate: '2026-07-24',
      total: 22.5,
      environment: 'sandbox',
    });
    expect(url.startsWith(VERIFACTU_QR_SANDBOX)).toBe(true);
    expect(url).toContain('nif=B12345678');
    expect(url).toContain('numserie=A0001');
    expect(url).toContain('fecha=24-07-2026');
    expect(url).toContain('importe=22.50');
  });

  it('formatea fecha y número', () => {
    expect(formatDateEs('2026-01-05')).toBe('05-01-2026');
    expect(formatInvoiceNumber('A', 7)).toBe('0007');
  });
});
