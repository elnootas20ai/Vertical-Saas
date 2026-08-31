import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyInfrastructureToUnitCost,
  escandalloInfrastructureMonthlyTotal,
  escandalloInfrastructureSalesPercent,
  normalizeEscandalloInfrastructure,
} from '../src/app/lib/escandalloInfrastructure.ts';

test('normalize defaults to off and empty', () => {
  const s = normalizeEscandalloInfrastructure(null);
  assert.equal(s.applyToFoodCost, false);
  assert.equal(s.estimatedMonthlySales, 0);
  assert.deepEqual(s.lines, []);
});

test('monthly total and sales percent', () => {
  const s = normalizeEscandalloInfrastructure({
    applyToFoodCost: true,
    estimatedMonthlySales: 10000,
    lines: [
      { id: '1', name: 'Alquiler', amountMonthly: 2000 },
      { id: '2', name: 'Luz', amountMonthly: 500 },
    ],
  });
  assert.equal(escandalloInfrastructureMonthlyTotal(s), 2500);
  assert.equal(escandalloInfrastructureSalesPercent(s), 25);
});

test('applyInfrastructureToUnitCost only when enabled', () => {
  const off = normalizeEscandalloInfrastructure({
    applyToFoodCost: false,
    estimatedMonthlySales: 10000,
    lines: [{ id: '1', name: 'Alquiler', amountMonthly: 2500 }],
  });
  assert.equal(applyInfrastructureToUnitCost(2, 10, off), 2);

  const on = { ...off, applyToFoodCost: true };
  // 25% of PVP 10 = 2.5 → total 4.5
  assert.equal(applyInfrastructureToUnitCost(2, 10, on), 4.5);
});
