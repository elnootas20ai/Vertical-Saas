import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoDetectImportField,
  maybeResplitDelimitedRow,
  normalizeHeader,
  normalizeParsedTable,
  stripBom,
} from '../src/app/lib/crmImportParse.ts';

describe('crmImportParse', () => {
  it('stripBom removes UTF-8 BOM from headers', () => {
    assert.equal(normalizeHeader('\ufeffNombre'), 'nombre');
    assert.equal(autoDetectImportField('\ufeffTeléfono', 'clients'), 'phone');
  });

  it('autoDetect recognizes Spanish client headers', () => {
    assert.equal(autoDetectImportField('Teléfono móvil', 'clients'), 'phone');
    assert.equal(autoDetectImportField('Correo electrónico', 'clients'), 'email');
    assert.equal(autoDetectImportField('Código postal', 'clients'), 'postalCode');
  });

  it('resplits semicolon-separated Excel CSV rows', () => {
    const split = maybeResplitDelimitedRow(['Ana López;612345678;ana@test.com']);
    assert.deepEqual(split, ['Ana López', '612345678', 'ana@test.com']);
  });

  it('normalizeParsedTable fixes single-column semicolon files', () => {
    const parsed = normalizeParsedTable([
      ['Nombre;Teléfono;Email'],
      ['Ana;612345678;ana@test.com'],
      ['Luis;698765432;'],
    ]);
    assert.ok(parsed);
    assert.deepEqual(parsed.headers, ['Nombre', 'Teléfono', 'Email']);
    assert.equal(parsed.rows.length, 2);
  });
});
