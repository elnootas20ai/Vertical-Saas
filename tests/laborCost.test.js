import { describe, expect, it } from 'vitest';
import {
  applyLaborCostToEmployment,
  computeLaborCostBreakdown,
  computePeriodLaborCost,
  parseSalaryToMonthlyGross,
  resolveEmployerSocialSecurityRate,
} from '../src/app/lib/laborCost.ts';

describe('laborCost', () => {
  it('parsea salario mensual en distintos formatos', () => {
    expect(parseSalaryToMonthlyGross('1500')).toBe(1500);
    expect(parseSalaryToMonthlyGross('1.500 €')).toBe(1500);
    expect(parseSalaryToMonthlyGross('1500,50')).toBe(1500.5);
    expect(parseSalaryToMonthlyGross('24000 anual')).toBe(2000);
    expect(parseSalaryToMonthlyGross('')).toBeNull();
  });

  it('calcula SS y coste mensual con 14 pagas (1200 €)', () => {
    const breakdown = computeLaborCostBreakdown({
      salary: '1200',
      contractType: 'indefinido',
      workday: 'completa',
      payPeriodsPerYear: 14,
    });
    expect(breakdown).not.toBeNull();
    expect(breakdown.grossMonthly).toBe(1200);
    expect(breakdown.monthlyAverageGross).toBe(1400);
    expect(breakdown.extraPayCount).toBe(2);
    expect(breakdown.annualGross).toBe(16800);
    expect(breakdown.socialSecurityCost).toBe(441);
    expect(breakdown.totalMonthlyEmployerCost).toBe(1841);
  });

  it('calcula SS empresa y coste hora para contrato general', () => {
    const breakdown = computeLaborCostBreakdown({
      salary: '1800',
      contractType: 'indefinido',
      workday: 'completa',
      payPeriodsPerYear: 14,
    });
    expect(breakdown).not.toBeNull();
    expect(breakdown.grossMonthly).toBe(1800);
    expect(breakdown.socialSecurityCost).toBe(661.5);
    expect(breakdown.hourlyEmployerCost).toBeGreaterThan(0);
  });

  it('autónomo no tiene cuota SS empresa', () => {
    expect(resolveEmployerSocialSecurityRate('', 'autonomo')).toBe(0);
    const breakdown = computeLaborCostBreakdown({
      salary: '2000',
      contractType: 'autonomo',
      workday: 'completa',
    });
    expect(breakdown.socialSecurityCost).toBe(0);
  });

  it('applyLaborCostToEmployment rellena campos en employment', () => {
    const enriched = applyLaborCostToEmployment({
      salary: '1600',
      contractType: 'temporal',
      workday: 'completa',
      payPeriodsPerYear: 14,
    });
    expect(enriched.grossSalary).toBe(1600);
    expect(enriched.payPeriodsPerYear).toBe(14);
    expect(enriched.socialSecurityCost).toBe(588);
    expect(enriched.lastCostReview).toBeTruthy();
  });

  it('estima neto con IRPF y SS trabajador', () => {
    const breakdown = computeLaborCostBreakdown({
      salary: '2000',
      contractType: 'indefinido',
      workday: 'completa',
      payPeriodsPerYear: 12,
      irpfRate: 0.15,
      employeeSsRate: 0.0635,
    });
    expect(breakdown).not.toBeNull();
    expect(breakdown.employeeSocialSecurity).toBe(127);
    expect(breakdown.irpfWithholding).toBe(300);
    expect(breakdown.estimatedNetMonthly).toBe(1573);
  });
});
