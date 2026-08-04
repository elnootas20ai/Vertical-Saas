import { describe, expect, it } from 'vitest';
import { resolveEffectiveSalesPointRef } from '../src/app/lib/workerStoreAssignment';

describe('resolveEffectiveSalesPointRef', () => {
  it('prioriza employment.salesPointId', () => {
    expect(
      resolveEffectiveSalesPointRef({
        employmentSalesPointId: 'wc-emp',
        scheduleWorkCenterId: 'wc-sched',
        workCenters: [{ _id: 'wc-only' }],
      }),
    ).toBe('wc-emp');
  });

  it('usa work_center_id del horario si no hay employment', () => {
    expect(
      resolveEffectiveSalesPointRef({
        employmentSalesPointId: '',
        scheduleWorkCenterId: 'wc-sched',
        workCenters: [{ _id: 'wc-only' }],
      }),
    ).toBe('wc-sched');
  });

  it('infiere la única tienda del scope', () => {
    expect(
      resolveEffectiveSalesPointRef({
        employmentSalesPointId: '',
        scheduleWorkCenterId: '',
        workCenters: [{ _id: 'wc-solo', active: true }],
      }),
    ).toBe('wc-solo');
  });

  it('infiere el único PDV si no hay centros', () => {
    expect(
      resolveEffectiveSalesPointRef({
        workCenters: [],
        pointsOfSale: [{ _id: 'pdv-1', workCenterId: 'wc-from-pdv' }],
      }),
    ).toBe('wc-from-pdv');
  });

  it('no inventa asignación con varias tiendas', () => {
    expect(
      resolveEffectiveSalesPointRef({
        workCenters: [{ _id: 'a' }, { _id: 'b' }],
      }),
    ).toBe('');
  });
});
