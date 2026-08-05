import test from 'node:test';
import assert from 'node:assert/strict';
import { salesPointRefsSameStore } from '../services/clockinsAccess.js';

test('salesPointRefsSameStore: mismo PDV', () => {
  assert.equal(salesPointRefsSameStore('pdv-1', 'pdv-1', 'wc-1'), true);
});

test('salesPointRefsSameStore: PDV vs centro de trabajo del mismo local', () => {
  assert.equal(salesPointRefsSameStore('wc-1', 'pdv-1', 'wc-1'), true);
  assert.equal(salesPointRefsSameStore('pdv-1', 'wc-1', 'wc-1'), true);
  assert.equal(salesPointRefsSameStore('wc:wc-1', 'pdv-1', 'wc-1'), true);
});

test('salesPointRefsSameStore: tiendas distintas', () => {
  assert.equal(salesPointRefsSameStore('pdv-1', 'pdv-2', 'wc-1'), false);
  assert.equal(salesPointRefsSameStore('wc-1', 'wc-2', ''), false);
});

test('salesPointRefsSameStore: Badalona wc no es Tiana (Pol vs tablet Tiana)', () => {
  const badWc = 'wc-16361270-5794-4b95-89e5-644685f36e24';
  const badPdv = 'pdv-594a8503-1515-47b8-9e02-fb8ff09052b6';
  const tiaWc = 'wc-ffdee346-8730-4aeb-961d-24832f17f1c1';
  const tiaPdv = 'pdv-934ce697-314d-46e5-bc9b-e0a2afee3bf7';
  assert.equal(salesPointRefsSameStore(badWc, tiaWc, tiaWc), false);
  assert.equal(salesPointRefsSameStore(badWc, tiaPdv, tiaWc), false);
  assert.equal(salesPointRefsSameStore(badPdv, tiaPdv, tiaWc), false);
  assert.equal(salesPointRefsSameStore(badWc, badPdv, badWc), true);
  assert.equal(salesPointRefsSameStore(tiaWc, tiaPdv, tiaWc), true);
});

test('salesPointRefsSameStore: vacíos no cuentan como misma tienda', () => {
  assert.equal(salesPointRefsSameStore('', 'pdv-1', 'wc-1'), false);
  assert.equal(salesPointRefsSameStore('pdv-1', '', 'wc-1'), false);
});
