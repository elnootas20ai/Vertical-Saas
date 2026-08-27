import { describe, expect, it } from 'vitest';
import { normalizePurchaseListLimit } from '../services/couchdb.js';

describe('normalizePurchaseListLimit', () => {
  it('default 400 cuando falta o es inválido', () => {
    expect(normalizePurchaseListLimit()).toBe(400);
    expect(normalizePurchaseListLimit('')).toBe(400);
    expect(normalizePurchaseListLimit(-5)).toBe(400);
  });

  it('acota entre 1 y 2000', () => {
    expect(normalizePurchaseListLimit(50)).toBe(50);
    expect(normalizePurchaseListLimit(5000)).toBe(2000);
    expect(normalizePurchaseListLimit(1)).toBe(1);
  });

  it('sanitizePurchaseInvoice omite imagen OCR en listados', async () => {
    const { sanitizePurchaseInvoice } = await import('../services/couchdb.js');
    const doc = {
      _id: 'inv-1',
      type: 'purchase_invoice',
      user_id: 'u1',
      ocrImageBase64: 'base64-blob',
    };
    expect(sanitizePurchaseInvoice(doc, { forList: true })?.ocrImageBase64).toBeUndefined();
    expect(sanitizePurchaseInvoice(doc)?.ocrImageBase64).toBe('base64-blob');
  });
});
