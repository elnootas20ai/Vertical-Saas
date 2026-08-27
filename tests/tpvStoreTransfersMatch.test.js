import test from 'node:test';
import assert from 'node:assert/strict';
import { storeTransferPdvMatches } from '../src/app/lib/tpvStoreTransfers.ts';

test('storeTransferPdvMatches: match exacto por pdvId', () => {
  assert.equal(
    storeTransferPdvMatches('pdv-a', { pdvId: 'pdv-a', workCenterId: 'wc-a' }),
    true,
  );
});

test('storeTransferPdvMatches: match por workCenterId local', () => {
  assert.equal(
    storeTransferPdvMatches('wc-a', { pdvId: 'pdv-a', workCenterId: 'wc-a' }),
    true,
  );
});

test('storeTransferPdvMatches: no match otra tienda', () => {
  assert.equal(
    storeTransferPdvMatches('pdv-b', { pdvId: 'pdv-a', workCenterId: 'wc-a' }),
    false,
  );
});

test('storeTransferPdvMatches: resuelve vía lista PDV (evento pdv, local wc)', () => {
  const points = [
    { _id: 'pdv-a', workCenterId: 'wc-a' },
    { _id: 'pdv-b', workCenterId: 'wc-b' },
  ];
  assert.equal(
    storeTransferPdvMatches('pdv-a', { pdvId: 'wc-a', workCenterId: 'wc-a' }, points),
    true,
  );
  assert.equal(
    storeTransferPdvMatches('pdv-b', { pdvId: 'wc-a', workCenterId: 'wc-a' }, points),
    false,
  );
});
