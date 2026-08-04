import { describe, expect, it } from 'vitest';
import type { Vehicle } from '../src/app/context/AppContext';
import type { VehicleAcquisition } from '../src/app/lib/vehicleAcquisitionApi';
import { defaultFiscalForm } from '../src/app/lib/compraventaFiscalCalculator';
import { buildFiscalFormFromStock } from '../src/app/lib/compraventaFiscalPrefill';

function vehicle(partial: Partial<Vehicle> & Pick<Vehicle, 'id'>): Vehicle {
  return {
    brand: 'Seat',
    model: 'León',
    registrationPlate: '1234ABC',
    year: 2019,
    mileage: 98000,
    purchasePrice: 8000,
    status: 'disponible',
    ...partial,
  } as Vehicle;
}

function acquisition(
  partial: Partial<VehicleAcquisition> & Pick<VehicleAcquisition, 'id' | 'vehicleId'>,
): VehicleAcquisition {
  return {
    sellerName: 'Juan Particular',
    sellerType: 'particular',
    acquisitionType: 'compra_particular',
    costCompra: 7500,
    acquisitionDate: '2024-06-01',
    createdAt: '2024-06-01T10:00:00.000Z',
    ...partial,
  } as VehicleAcquisition;
}

describe('compraventaFiscalPrefill', () => {
  it('no inventa 1ª matriculación con purchaseDate ni year', () => {
    const form = buildFiscalFormFromStock(
      vehicle({
        id: 'v1',
        purchaseDate: '2024-01-15',
        year: 2019,
      }),
    );
    expect(form.firstRegistration).toBe('');
    expect(form.mileage).toBe('98000');
    expect(form.purchasePrice).toBe('8000');
  });

  it('usa firstRegistrationDate si existe en el vehículo', () => {
    const form = buildFiscalFormFromStock(
      vehicle({
        id: 'v2',
        ...( { firstRegistrationDate: '2019-03-01T00:00:00.000Z' } as Partial<Vehicle>),
      }),
    );
    expect(form.firstRegistration).toBe('2019-03-01');
  });

  it('prioriza precio y vendedor de la adquisición', () => {
    const form = buildFiscalFormFromStock(
      vehicle({ id: 'v1', purchasePrice: 9999 }),
      acquisition({ id: 'a1', vehicleId: 'v1', costCompra: 7500, sellerType: 'particular' }),
    );
    expect(form.purchasePrice).toBe('7500');
    expect(form.acquisitionId).toBe('a1');
    expect(form.origin).toBe('spain');
    expect(form.seller).toBe('private');
  });

  it('defaultFiscalForm arranca en España / particular', () => {
    const form = defaultFiscalForm('ES-CT');
    expect(form.origin).toBe('spain');
    expect(form.seller).toBe('private');
    expect(form.ccaa).toBe('ES-CT');
  });
});
