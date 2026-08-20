import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  VERTIAL_SERVICE_AGREEMENT_VERSION,
  buildServiceAgreementClauses,
  buildServiceAgreementParty,
} from '../src/app/lib/vertialServiceAgreement.ts';

describe('vertialServiceAgreement', () => {
  it('rellena datos de empresa en el party', () => {
    const party = buildServiceAgreementParty({
      companyProfile: {
        tradeName: 'Demo Bar',
        legalName: 'Demo Bar SL',
        taxId: 'B12345678',
        address: 'Calle 1',
        city: 'Madrid',
        province: 'Madrid',
        companyEmail: 'demo@test.local',
        companyPhone: '600000000',
      },
      businessType: 'restaurant',
      planId: 'pro',
      billingMode: 'monthly',
      signerName: 'Uriel Test',
      signerEmail: 'uriel@test.local',
    });
    assert.equal(party.legalName, 'Demo Bar SL');
    assert.equal(party.taxId, 'B12345678');
    assert.equal(party.signerName, 'Uriel Test');
    assert.equal(party.planId, 'pro');
  });

  it('genera cláusulas con CIF y nombre del cliente', () => {
    const party = buildServiceAgreementParty({
      companyProfile: {
        tradeName: 'Maika',
        legalName: 'Maika Hosteleria SL',
        taxId: 'B87654321',
        address: 'Av. Test 9',
        province: 'Barcelona',
        companyEmail: 'maika@test.local',
        companyPhone: '611111111',
      },
      signerName: 'Ana',
    });
    const clauses = buildServiceAgreementClauses(party);
    assert.ok(clauses.length >= 10);
    assert.equal(clauses[0].id, '1');
    assert.match(clauses[0].body, /Maika Hosteleria SL/);
    assert.match(clauses[0].body, /B87654321/);
    assert.match(clauses.find((c) => c.id === '11')?.body || '', new RegExp(VERTIAL_SERVICE_AGREEMENT_VERSION));
  });
});
