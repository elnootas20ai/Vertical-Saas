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
    assert.ok(clauses.length >= 12);
    assert.equal(clauses[0].id, '1');
    assert.match(clauses[0].body, /Maika Hosteleria SL/);
    assert.match(clauses[0].body, /B87654321/);
    assert.match(clauses[0].body, /Uriel Arnau Ruiz/);
    assert.match(clauses[0].body, /48216687Q/);
    assert.match(clauses[0].body, /647779812/);
    assert.match(clauses[0].body, /vertial\.noreply@gmail\.com/);
    assert.match(clauses[0].body, /Prestador del servicio: VERTIAL/);
    assert.match(clauses[0].body, /Cliente: Maika Hosteleria SL/);
    assert.equal(/Proveedor|en adelante|poder suficiente|«|»/.test(clauses[0].body), false);
    assert.match(clauses.find((c) => c.id === '14')?.body || '', new RegExp(VERTIAL_SERVICE_AGREEMENT_VERSION));
  });

  it('incluye periodo de cobro y modificación de condiciones', () => {
    const party = buildServiceAgreementParty({
      companyProfile: { tradeName: 'Demo', taxId: 'B11111111' },
      billingMode: 'annual',
    });
    const clauses = buildServiceAgreementClauses(party);
    const pricing = clauses.find((c) => c.id === '4');
    assert.match(pricing?.body || '', /anual/);
    assert.match(pricing?.body || '', /por anticipado/);
    assert.match(pricing?.body || '', /día 1 y el día 5/);
    const changes = clauses.find((c) => c.id === '6');
    assert.match(changes?.body || '', /30 días naturales/);
    const term = clauses.find((c) => c.id === '13');
    assert.match(term?.body || '', /2 meses/);
    // Sin ruido tipográfico: no "siete (7)" ni listas (i)/(ii).
    const joined = clauses.map((c) => c.body).join('\n');
    assert.equal(/\(\d+\)/.test(joined), false);
    assert.equal(/\(i\)|\(ii\)|\(iii\)/.test(joined), false);
  });
});
