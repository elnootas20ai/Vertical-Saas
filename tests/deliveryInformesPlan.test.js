import { describe, expect, it } from 'vitest';
import {
  canAccessDeliveryInforme,
  deliveryInformeMinPlanLabel,
} from '../src/app/verticals/delivery/informes/deliveryInformesPlanAccess.ts';
import {
  getEbitdaSectorBenchmarkPct,
} from '../src/app/lib/ebitdaSectorBenchmarks.ts';
import {
  pctChange,
  previousRangeSameLength,
  yearAgoRange,
  shiftInformePeriod,
} from '../src/app/verticals/delivery/informes/loaders/informeTypes.ts';

describe('deliveryInformesPlanAccess', () => {
  const base = {
    id: 'finanzas-ingresos',
    category: 'finanzas',
    title: 'Ingresos',
    description: '',
    kind: 'skeleton',
  };

  it('bloquea PRO si el plan no es pro', () => {
    const entry = { ...base, id: 'finanzas-ebitda', title: 'EBITDA', nivel: 'pro' };
    expect(canAccessDeliveryInforme(entry, 'basic')).toBe(false);
    expect(canAccessDeliveryInforme(entry, 'normal')).toBe(false);
    expect(canAccessDeliveryInforme(entry, 'pro')).toBe(true);
    expect(deliveryInformeMinPlanLabel(entry)).toBe('PRO');
  });

  it('exige NORMAL para P&L', () => {
    const entry = { ...base, id: 'finanzas-cuenta-resultados', nivel: 'normal' };
    expect(canAccessDeliveryInforme(entry, 'basic')).toBe(false);
    expect(canAccessDeliveryInforme(entry, 'normal')).toBe(true);
  });
});

describe('ebitdaSectorBenchmarks', () => {
  it('devuelve % fijo por vertical delivery', () => {
    expect(getEbitdaSectorBenchmarkPct({ verticalId: 'delivery' })).toBe(12);
    expect(getEbitdaSectorBenchmarkPct({ businessType: 'butcherShop' })).toBe(8);
    expect(getEbitdaSectorBenchmarkPct({ businessType: 'unknown' })).toBeNull();
  });
});

describe('informe period helpers', () => {
  it('calcula periodo anterior de misma longitud', () => {
    expect(previousRangeSameLength('2026-03-01', '2026-03-31')).toEqual({
      from: '2026-01-29',
      to: '2026-02-28',
    });
  });

  it('calcula año anterior', () => {
    expect(yearAgoRange('2026-03-01', '2026-03-31')).toEqual({
      from: '2025-03-01',
      to: '2025-03-31',
    });
  });

  it('pctChange y shift mes', () => {
    expect(pctChange(120, 100)).toBe(20);
    expect(pctChange(80, 100)).toBe(-20);
    expect(shiftInformePeriod({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });
});
