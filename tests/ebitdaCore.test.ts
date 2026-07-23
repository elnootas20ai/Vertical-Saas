import { describe, expect, it } from 'vitest';
import {
  computeCoreEbitdaForMonth,
  coreEbitdaSubtitle,
  resolveCoreEbitdaBusinessScope,
} from '../src/app/lib/ebitdaMetrics';

describe('core EBITDA', () => {
  it('resta cogs y opex; deja fuera intereses/impuestos', () => {
    const month = '2026-07';
    const movs = [
      { type: 'cobro', category: 'ventas', totalAmount: 1000, date: `${month}-01`, businessId: 'biz-a' },
      { type: 'pago', category: 'compras_stock', totalAmount: 300, date: `${month}-02`, businessId: 'biz-a' },
      { type: 'pago', category: 'alquiler', totalAmount: 200, date: `${month}-03`, businessId: 'biz-a' },
      { type: 'pago', category: 'intereses', totalAmount: 50, date: `${month}-04`, businessId: 'biz-a' },
      { type: 'pago', category: 'impuestos', totalAmount: 80, date: `${month}-05`, businessId: 'biz-a' },
    ] as any;

    const snap = computeCoreEbitdaForMonth(
      movs,
      month,
      resolveCoreEbitdaBusinessScope('biz-a', { multiBusiness: true }),
    );
    expect(snap.income).toBe(1000);
    expect(snap.cogs).toBe(300);
    expect(snap.opex).toBe(200);
    expect(snap.operatingCosts).toBe(500);
    expect(snap.ebitda).toBe(500);
    expect(snap.ebitdaMargin).toBe(50);
    expect(snap.quality).toBe('ok');
    expect(snap.nonOperating).toBe(130);
  });

  it('marca income_only si solo hay cobros', () => {
    const month = '2026-07';
    const movs = [
      { type: 'cobro', category: 'ventas', totalAmount: 454, date: `${month}-10`, businessId: 'modomio' },
    ] as any;
    const snap = computeCoreEbitdaForMonth(
      movs,
      month,
      resolveCoreEbitdaBusinessScope('modomio', { multiBusiness: true }),
    );
    expect(snap.ebitda).toBe(454);
    expect(snap.quality).toBe('income_only');
    expect(coreEbitdaSubtitle(snap, 'modomio')).toContain('Solo cobros');
  });

  it('con una sola empresa incluye movimientos legacy sin businessId', () => {
    const month = '2026-07';
    const movs = [
      { type: 'cobro', category: 'ventas', totalAmount: 100, date: `${month}-01`, businessId: 'solo' },
      { type: 'pago', category: 'personal', totalAmount: 40, date: `${month}-01` },
    ] as any;
    const snap = computeCoreEbitdaForMonth(
      movs,
      month,
      resolveCoreEbitdaBusinessScope('solo', { multiBusiness: false }),
    );
    expect(snap.ebitda).toBe(60);
    expect(snap.quality).toBe('ok');
  });
});
