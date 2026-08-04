import { describe, it, expect } from 'vitest';
import {
  normalizePlateOrVin,
  matchVehicleByPlateOrVin,
  matchClientByNif,
  resolveDocSubCategory,
  buildOcrDocumentFields,
} from '../src/app/lib/ocrDocumentSave.ts';

describe('ocrDocumentSave', () => {
  it('normalizes plates and vins', () => {
    expect(normalizePlateOrVin('1234 ABC')).toBe('1234ABC');
    expect(normalizePlateOrVin('vin-xx.1')).toBe('VINXX1');
  });

  it('matches vehicle by plate ignoring spaces', () => {
    const vehicles = [
      { id: 'v1', brand: 'Seat', model: 'Leon', registrationPlate: '1234 ABC', vin: 'WVWZZZ' },
    ];
    expect(matchVehicleByPlateOrVin(vehicles, '1234abc', null)?.id).toBe('v1');
    expect(matchVehicleByPlateOrVin(vehicles, null, 'wvwzzz')?.id).toBe('v1');
  });

  it('matches client by nif', () => {
    const clients = [{ id: 'c1', name: 'Ana', nif: '12345678Z' }];
    expect(matchClientByNif(clients, '12345678-z')?.id).toBe('c1');
  });

  it('maps OCR type to expediente subcategory', () => {
    expect(resolveDocSubCategory({ documentType: 'permiso_circulacion' })).toBe('permiso_circulacion');
    expect(resolveDocSubCategory({ documentType: 'itv' })).toBe('itv');
  });

  it('builds document fields linked to vehicle', () => {
    const fields = buildOcrDocumentFields({
      name: 'Permiso',
      ocrData: {
        documentType: 'permiso_circulacion',
        registrationPlate: '1234 ABC',
        confidence: 90,
      },
      vehicles: [{ id: 'v1', brand: 'Seat', model: 'Leon', registrationPlate: '1234ABC' }],
    });
    expect(fields.vehicleId).toBe('v1');
    expect(fields.docSubCategory).toBe('permiso_circulacion');
    expect(fields.relatedTo).toBe('vehicle');
    expect(fields.ocrConfidence).toBe(90);
  });
});
