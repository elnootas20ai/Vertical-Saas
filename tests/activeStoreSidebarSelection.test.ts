import { describe, expect, it } from 'vitest';
import {
  resolveActiveOpsStoreRowId,
  resolveActiveWorkCenterRowId,
} from '../src/app/lib/activeStoreSidebarSelection.ts';
import type { DeliverySidebarStoreRow } from './deliveryApi';

describe('activeStoreSidebarSelection', () => {
  const rows: DeliverySidebarStoreRow[] = [
    {
      rowId: 'pdv-a',
      pdvId: 'pdv-a',
      workCenterId: 'wc-a',
      title: 'Tienda A',
      inactive: false,
      needsPdv: false,
    },
    {
      rowId: 'pdv-b',
      pdvId: 'pdv-b',
      workCenterId: 'wc-b',
      title: 'Tienda B',
      inactive: false,
      needsPdv: false,
    },
  ];

  it('activates exactly one PDV row', () => {
    expect(resolveActiveOpsStoreRowId(rows, 'pdv-a', 'pdv-a')).toBe('pdv-a');
    expect(resolveActiveOpsStoreRowId(rows, 'pdv-b', 'pdv-a')).toBe('pdv-b');
  });

  it('does not activate two rows for wc preference when PDV exists', () => {
    const activeA = resolveActiveOpsStoreRowId(rows, 'pdv-a', 'wc:a');
    const activeB = resolveActiveOpsStoreRowId(rows, 'pdv-a', 'wc:b');
    expect(activeA).toBe('pdv-a');
    expect(activeB).toBe('pdv-a');
  });

  it('activates wc-only row without PDV', () => {
    const wcOnly: DeliverySidebarStoreRow[] = [
      {
        rowId: 'wc-x',
        workCenterId: 'wc-x',
        title: 'Sin PDV',
        inactive: false,
        needsPdv: true,
      },
    ];
    expect(resolveActiveOpsStoreRowId(wcOnly, null, 'wc:wc-x')).toBe('wc-x');
  });

  it('compraventa allows only one work center', () => {
    const ids = ['wc-1', 'wc-2'];
    expect(resolveActiveWorkCenterRowId(ids, 'wc-1')).toBe('wc-1');
    expect(resolveActiveWorkCenterRowId(ids, 'wc-2')).toBe('wc-2');
    expect(resolveActiveWorkCenterRowId(ids, 'wc-3')).toBeNull();
  });
});
