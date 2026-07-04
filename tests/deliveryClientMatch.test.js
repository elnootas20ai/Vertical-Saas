import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deliveryOrderMatchesClient,
  deliveryPhonesMatch,
} from '../shared/clients/deliveryClientMatch.js';

describe('deliveryPhonesMatch', () => {
  it('empareja teléfonos exactos y con prefijo 34', () => {
    assert.equal(deliveryPhonesMatch('612345678', '612345678'), true);
    assert.equal(deliveryPhonesMatch('+34 612 345 678', '612345678'), true);
    assert.equal(deliveryPhonesMatch('34612345678', '612345678'), true);
  });

  it('no empareja sufijos cortos que generaban falsos positivos', () => {
    assert.equal(deliveryPhonesMatch('45678', '612345678'), false);
    assert.equal(deliveryPhonesMatch('612345678', '45678'), false);
    assert.equal(deliveryPhonesMatch('12345678', '612345678'), false);
  });
});

describe('deliveryOrderMatchesClient', () => {
  it('prioriza clientId sobre teléfono', () => {
    const order = { clientId: 'client-a', customerPhone: '699999999' };
    assert.equal(deliveryOrderMatchesClient(order, 'client-a', '611111111'), true);
    assert.equal(deliveryOrderMatchesClient(order, 'client-b', '699999999'), false);
  });

  it('empareja por teléfono cuando no hay clientId', () => {
    const order = { customerPhone: '+34 612 345 678' };
    assert.equal(deliveryOrderMatchesClient(order, 'client-x', '612345678'), true);
  });
});
