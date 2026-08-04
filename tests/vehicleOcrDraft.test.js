import { describe, expect, it } from 'vitest';
import {
  mapOcrResultToVehicleDraft,
  resolveOcrVehicleDocType,
} from '../src/app/lib/vehicleOcrDraft.ts';

describe('vehicleOcrDraft', () => {
  it('mapea permiso de circulación a borrador de vehículo', () => {
    const draft = mapOcrResultToVehicleDraft({
      documentType: 'permiso_circulacion',
      documentTypeLabel: 'Permiso de circulación',
      confidenceScore: 92,
      registrationPlate: '1234-abc',
      vin: 'VF1RJA00X66123456',
      vehicleBrand: 'Renault',
      vehicleModel: 'Clio',
      version: 'Intens',
      vehicleYear: 2019,
      vehicleColor: 'Gris',
      fuelType: 'Gasolina',
      transmission: 'Manual',
      power: 90,
      mileage: null,
      ownerName: 'Ana Pérez',
      ownerNif: '12345678Z',
      notes: null,
      total: null,
    });

    expect(draft.registrationPlate).toBe('1234 ABC');
    expect(draft.vin).toBe('VF1RJA00X66123456');
    expect(draft.brand).toBe('Renault');
    expect(draft.model).toBe('Clio');
    expect(draft.version).toBe('Intens');
    expect(draft.year).toBe('2019');
    expect(draft.color).toBe('Gris');
    expect(draft.fuelType).toBe('gasolina');
    expect(draft.transmission).toBe('manual');
    expect(draft.power).toBe('90');
    expect(draft.notes).toContain('Titular OCR: Ana Pérez');
    expect(draft.confidenceScore).toBe(92);
  });

  it('usa el total del documento como precio de compra si existe', () => {
    const draft = mapOcrResultToVehicleDraft({
      documentType: 'factura_compra',
      documentTypeLabel: 'Factura',
      confidenceScore: 80,
      registrationPlate: '9999ZZZ',
      vehicleBrand: 'Seat',
      vehicleModel: 'Ibiza',
      vehicleYear: 2018,
      total: 8500.4,
    });
    expect(draft.purchasePrice).toBe('8500');
  });

  it('resuelve tipo de documento adjunto', () => {
    expect(resolveOcrVehicleDocType('permiso_circulacion')).toBe('permiso_circulacion');
    expect(resolveOcrVehicleDocType('ficha_tecnica')).toBe('ficha_tecnica');
    expect(resolveOcrVehicleDocType('contrato_venta')).toBe('contrato_compraventa');
    expect(resolveOcrVehicleDocType('otro')).toBe('otro');
  });
});
