import { describe, expect, it } from 'vitest';
import {
  buildPointOfSaleDocument,
  sanitizePointOfSale,
} from '../services/couchdb.js';

describe('point of sale businessId persistence', () => {
  it('guarda businessId al crear', () => {
    const doc = buildPointOfSaleDocument('user-1', {
      name: 'Badalona',
      code: 'BAD-01',
      workCenterId: 'wc-1',
      businessId: 'biz-modomio',
      terminals: [{ id: 't1', code: 'TPV-1', name: 'Principal', active: true }],
    });
    expect(doc.businessId).toBe('biz-modomio');
    expect(doc.business_id).toBe('biz-modomio');
  });

  it('no borra businessId al actualizar otros campos', () => {
    const existing = {
      _id: 'pdv-1',
      _rev: '1-abc',
      user_id: 'user-1',
      workCenterId: 'wc-1',
      name: 'Badalona',
      code: 'BAD-01',
      businessId: 'biz-modomio',
      business_id: 'biz-modomio',
      terminals: [],
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const doc = buildPointOfSaleDocument(
      'user-1',
      { ...existing, name: 'Badalona Centro' },
      existing,
    );
    expect(doc.businessId).toBe('biz-modomio');
    expect(doc.business_id).toBe('biz-modomio');
    expect(doc.name).toBe('Badalona Centro');
  });

  it('sanitize expone businessId al front', () => {
    const sanitized = sanitizePointOfSale({
      _id: 'pdv-1',
      user_id: 'user-1',
      workCenterId: 'wc-1',
      name: 'Badalona',
      code: 'BAD-01',
      business_id: 'biz-modomio',
      terminals: [],
      active: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(sanitized.businessId).toBe('biz-modomio');
    expect(sanitized.business_id).toBe('biz-modomio');
  });
});
