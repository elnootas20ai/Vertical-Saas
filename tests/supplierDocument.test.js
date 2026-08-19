import { describe, expect, it } from 'vitest';
import { buildSupplierDocument, sanitizeSupplier } from '../services/couchdb.js';

describe('buildSupplierDocument', () => {
  it('crea ids distintos en cada alta (no reutiliza _id del body)', () => {
    const a = buildSupplierDocument('user-1', {
      name: 'Proveedor A',
      _id: 'sup-fixed',
      id: 'sup-fixed',
      _rev: '1-abc',
    });
    const b = buildSupplierDocument('user-1', {
      name: 'Proveedor B',
      _id: 'sup-fixed',
      id: 'sup-fixed',
      _rev: '1-abc',
    });
    expect(a._id).toMatch(/^sup-/);
    expect(b._id).toMatch(/^sup-/);
    expect(a._id).not.toBe('sup-fixed');
    expect(b._id).not.toBe(a._id);
    expect(a._rev).toBeUndefined();
    expect(b._rev).toBeUndefined();
  });

  it('persiste organizerIds y sanitize los devuelve', () => {
    const doc = buildSupplierDocument('user-1', {
      name: 'Makro',
      organizerIds: ['org-envases', 'org-limpieza', 'org-envases', ''],
    });
    expect(doc.organizerIds).toEqual(['org-envases', 'org-limpieza']);
    const clean = sanitizeSupplier(doc);
    expect(clean.organizerIds).toEqual(['org-envases', 'org-limpieza']);
  });

  it('persiste code de proveedor', () => {
    const doc = buildSupplierDocument('user-1', {
      name: 'Makro',
      code: 'prov-12',
    });
    expect(doc.code).toBe('PROV-12');
    expect(sanitizeSupplier(doc).code).toBe('PROV-12');
  });

  it('en update conserva _id existente', () => {
    const existing = buildSupplierDocument('user-1', { name: 'Uno' });
    const updated = buildSupplierDocument(
      'user-1',
      { name: 'Uno editado', organizerIds: ['org-varios'] },
      { ...existing, _rev: '1-x' },
    );
    expect(updated._id).toBe(existing._id);
    expect(updated._rev).toBe('1-x');
    expect(updated.name).toBe('Uno editado');
    expect(updated.organizerIds).toEqual(['org-varios']);
  });
});
