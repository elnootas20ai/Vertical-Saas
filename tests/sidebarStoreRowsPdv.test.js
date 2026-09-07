/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  buildDeliverySidebarStoreRows,
  collapseSidebarStoreRowsByName,
} from '../src/app/lib/deliveryApi.ts';

function wc(overrides) {
  return {
    _id: overrides._id || 'wc-1',
    name: overrides.name || 'Centro',
    centerType: 'punto_de_venta',
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function pdv(overrides) {
  return {
    _id: overrides._id || 'pdv-1',
    type: 'point_of_sale',
    id: overrides._id || 'pdv-1',
    user_id: 'u1',
    name: overrides.name || 'Centro',
    code: overrides.code || 'CEN-01',
    address: '',
    terminals: [],
    active: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildDeliverySidebarStoreRows — Sin PDV fantasma', () => {
  it('colapsa 2× bodegeta y se queda con el que tiene PDV', () => {
    const rows = buildDeliverySidebarStoreRows(
      [
        wc({ _id: 'wc-old', name: 'bodegeta', businessId: 'biz-bode', createdAt: '2024-01-01' }),
        wc({ _id: 'wc-new', name: 'bodegeta', businessId: 'biz-bode', createdAt: '2025-01-01' }),
      ],
      [
        pdv({
          _id: 'pdv-bode',
          name: 'bodegeta',
          code: 'BOD-17',
          terminalCode: 'UUP443',
          workCenterId: 'wc-new',
          businessId: 'biz-bode',
        }),
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].needsPdv).toBe(false);
    expect(rows[0].code).toBe('BOD-17');
    expect(rows[0].terminalCode).toBe('UUP443');
  });

  it('rematch suave: PDV con workCenterId muerto se muestra en el WC del mismo nombre', () => {
    const rows = buildDeliverySidebarStoreRows(
      [wc({ _id: 'wc-badalona', name: 'badalona', businessId: 'biz-modo' })],
      [
        pdv({
          _id: 'pdv-bad',
          name: 'badalona',
          code: 'BAD-01',
          terminalCode: 'ABC123',
          workCenterId: 'wc-dead',
          businessId: 'biz-modo',
        }),
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].needsPdv).toBe(false);
    expect(rows[0].code).toBe('BAD-01');
    expect(rows[0].pdvId).toBe('pdv-bad');
  });

  it('no enlaza un PDV de otra empresa aunque el nombre coincida', () => {
    const rows = buildDeliverySidebarStoreRows(
      [wc({ _id: 'wc-a', name: 'local', businessId: 'biz-a' })],
      [
        pdv({
          _id: 'pdv-b',
          name: 'local',
          code: 'LOC-B',
          workCenterId: 'wc-dead',
          businessId: 'biz-b',
        }),
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].needsPdv).toBe(true);
  });
});

describe('collapseSidebarStoreRowsByName', () => {
  it('prioriza fila con PDV sobre Sin PDV', () => {
    const out = collapseSidebarStoreRowsByName([
      {
        rowId: 'wc-1',
        workCenterId: 'wc-1',
        title: 'tiana',
        inactive: false,
        needsPdv: true,
      },
      {
        rowId: 'pdv-1',
        pdvId: 'pdv-1',
        workCenterId: 'wc-2',
        title: 'tiana',
        code: 'TIA-01',
        inactive: false,
        needsPdv: false,
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].pdvId).toBe('pdv-1');
  });
});
