import { describe, expect, it } from 'vitest';
import {
  listMemberSiteLabels,
  resolveEffectiveSalesPointRef,
} from '../src/app/lib/workerStoreAssignment';

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

describe('listMemberSiteLabels', () => {
  it('usa salesPointId cuando no hay assignments (caso Pol / invite)', () => {
    expect(
      listMemberSiteLabels(
        { salesPointId: 'wc-bad' },
        [{ _id: 'wc-bad', name: 'LOCAL BADALONA' }],
      ),
    ).toEqual(['LOCAL BADALONA']);
  });

  it('combina assignments activos y salesPointId sin duplicar', () => {
    expect(
      listMemberSiteLabels(
        {
          salesPointId: 'wc-bad',
          assignments: [
            {
              id: 'a1',
              type: 'work_center',
              entityId: 'wc-bad',
              entityName: 'LOCAL BADALONA',
              startDate: '2026-01-01',
              isPrimary: true,
              status: 'active',
            },
          ],
        },
        [{ _id: 'wc-bad', name: 'LOCAL BADALONA' }],
      ),
    ).toEqual(['LOCAL BADALONA']);
  });

  it('devuelve vacío si no hay sede', () => {
    expect(listMemberSiteLabels({}, [])).toEqual([]);
  });
});
