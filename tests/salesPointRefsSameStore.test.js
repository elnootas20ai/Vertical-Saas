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
