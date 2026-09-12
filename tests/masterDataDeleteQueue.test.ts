// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MASTER_DATA_DELETE_QUEUE_STORAGE_KEY,
  completeMasterDataDeletes,
  enqueueMasterDataDeletes,
  listMasterDataDeleteQueue,
  subscribeMasterDataDeleteQueue,
  withMasterDataDeleteFlushLock,
} from '../src/app/lib/masterDataDeleteQueue';

describe('masterDataDeleteQueue', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('permanece inactiva hasta que se encola un borrado', () => {
    expect(window.localStorage.getItem(MASTER_DATA_DELETE_QUEUE_STORAGE_KEY)).toBeNull();
    expect(listMasterDataDeleteQueue({ userId: 'u1' })).toEqual([]);
    expect(window.localStorage.getItem(MASTER_DATA_DELETE_QUEUE_STORAGE_KEY)).toBeNull();
  });

  it('persiste, notifica y deduplica por cuenta, negocio, tipo e id', () => {
    const changed = vi.fn();
    const unsubscribe = subscribeMasterDataDeleteQueue(changed);
    const first = enqueueMasterDataDeletes([
      { userId: 'u1', businessId: 'b1', kind: 'carta', targetId: 'p1' },
      { userId: 'u1', businessId: 'b1', kind: 'carta', targetId: 'p1' },
    ]);

    expect(first).toHaveLength(2);
    expect(listMasterDataDeleteQueue({ userId: 'u1', businessId: 'b1' })).toHaveLength(1);
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('aísla ámbitos y conserva los fallos hasta confirmación explícita', () => {
    const [carta] = enqueueMasterDataDeletes([
      { userId: 'u1', businessId: 'b1', kind: 'carta', targetId: 'p1' },
      { userId: 'u1', businessId: 'b2', kind: 'almacen', targetId: 's1' },
    ]);

    expect(listMasterDataDeleteQueue({ userId: 'u1', businessId: 'b1' })).toHaveLength(1);
    expect(listMasterDataDeleteQueue({ userId: 'u1', businessId: 'b2' })).toHaveLength(1);
    expect(listMasterDataDeleteQueue({ userId: 'u1', kinds: ['carta'] })).toHaveLength(1);

    completeMasterDataDeletes([carta.id]);
    expect(listMasterDataDeleteQueue({ userId: 'u1', businessId: 'b1' })).toEqual([]);
    expect(listMasterDataDeleteQueue({ userId: 'u1', businessId: 'b2' })).toHaveLength(1);
  });

  it('comparte un único flush concurrente por ámbito', async () => {
    let resolve!: () => void;
    const run = vi.fn(
      () => new Promise<void>((done) => {
        resolve = done;
      }),
    );
    const a = withMasterDataDeleteFlushLock('u1:b1:carta', run);
    const b = withMasterDataDeleteFlushLock('u1:b1:carta', run);

    expect(a).toBe(b);
    expect(run).toHaveBeenCalledTimes(1);
    resolve();
    await Promise.all([a, b]);
  });
});
