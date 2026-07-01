/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { scopeCompraventaWorkCenters } from '../src/app/lib/compraventaSetup.ts';

const VENEAUTOS = 'biz-veneautos';
const BADALONA_BIZ = 'biz-badalona-legacy';

function wc(
  id,
  name,
  businessId,
  centerType = 'punto_de_venta',
) {
  return {
    _id: id,
    id,
    type: 'sales_point',
    user_id: 'user-1',
    name,
    centerType,
    ownership: 'propiedad',
    active: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...(businessId ? { businessId, business_id: businessId } : {}),
  };
}

describe('scopeCompraventaWorkCenters', () => {
  it('solo muestra centros de la empresa activa', () => {
    const all = [
      wc('wc-1', 'veneautos', VENEAUTOS),
      wc('wc-2', 'Badalona', BADALONA_BIZ),
      wc('wc-3', 'Badalona', BADALONA_BIZ),
      wc('wc-4', 'Badalona huérfana'),
    ];
    const scoped = scopeCompraventaWorkCenters(all, VENEAUTOS);
    expect(scoped.map((s) => s.name)).toEqual(['veneautos']);
  });

  it('no incluye huérfanos sin businessId', () => {
    const all = [wc('wc-1', 'veneautos', VENEAUTOS), wc('wc-2', 'Badalona')];
    expect(scopeCompraventaWorkCenters(all, VENEAUTOS).map((s) => s.name)).toEqual(['veneautos']);
  });

  it('incluye oficina y expositor de la misma empresa', () => {
    const all = [
      wc('wc-1', 'veneautos', VENEAUTOS, 'punto_de_venta'),
      wc('wc-2', 'Oficina central', VENEAUTOS, 'oficina'),
    ];
    expect(scopeCompraventaWorkCenters(all, VENEAUTOS)).toHaveLength(2);
  });

  it('devuelve vacío sin businessId', () => {
    expect(scopeCompraventaWorkCenters([wc('wc-1', 'x', VENEAUTOS)], '')).toEqual([]);
  });
});
