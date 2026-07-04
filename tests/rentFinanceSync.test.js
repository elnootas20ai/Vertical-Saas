import { describe, expect, it } from 'vitest';
import {
  isRentalOcrDocument,
  parseMonthlyRentFromOcr,
  rentAmountsFromMonthlyTotal,
  resolveDocumentFinanceCategory,
} from '../services/rentFinanceSync.js';

describe('rentFinanceSync', () => {
  it('calculates base and IVA from monthly rent gross', () => {
    const amounts = rentAmountsFromMonthlyTotal(1210);
    expect(amounts).toEqual({
      amountBase: 1000,
      taxRate: 21,
      taxAmount: 210,
      totalAmount: 1210,
    });
  });

  it('detects rental OCR documents', () => {
    expect(isRentalOcrDocument({ documentType: 'contrato_alquiler' })).toBe(true);
    expect(isRentalOcrDocument({
      documentType: 'contrato_comercial',
      notes: 'Contrato de arrendamiento de local comercial',
    })).toBe(true);
  });

  it('parses monthly rent from OCR lines', () => {
    const monthly = parseMonthlyRentFromOcr({
      lines: [{ description: 'Renta mensual local', quantity: 1, unitPrice: 1500, total: 1500 }],
    });
    expect(monthly).toBe(1500);
  });

  it('maps tax documents to impuestos category', () => {
    expect(resolveDocumentFinanceCategory({
      documentTypeLabel: 'Modelo 303 IVA trimestral',
      total: 3200,
    }, 'financial')).toBe('impuestos');
  });

  it('maps society documents to asesoria category', () => {
    expect(resolveDocumentFinanceCategory({
      documentTypeLabel: 'Escritura de constitución',
      notes: 'Notaría registro mercantil',
      total: 850,
    }, 'society')).toBe('asesoria');
  });
});
