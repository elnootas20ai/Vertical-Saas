/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  buildClosingBrandOverlay,
  isOrderReplacedByClosing,
  mergeClosingIntoChannelRows,
} from '../src/app/lib/closingBrandOverlay.ts';

const DAY = '2026-08-10';
const OTHER_DAY = '2026-08-09';

function session(overrides: Record<string, unknown> = {}) {
  return {
    openedAt: `${DAY}T10:00:00.000Z`,
    closedAt: `${DAY}T23:30:00.000Z`,
    status: 'closed',
    ...overrides,
  } as never;
}

describe('buildClosingBrandOverlay', () => {
  it('suma € por marca y canal de lo declarado al cierre', () => {
    const overlay = buildClosingBrandOverlay(
      [
        session({
          aggregatorClosingTotals: { glovo: 120.5, ubereats: 80 },
          aggregatorClosingBrandTotals: {
            glovo: { 'brand-pizza': 90.5, 'brand-burger': 30 },
            ubereats: { 'brand-pizza': 80 },
          },
          closingBrandLabels: { 'brand-pizza': 'Modomio', 'brand-burger': 'Black Burger' },
          productClosingCounts: {
            pizza: 20,
            burger: 8,
            taco: 0,
            byChannel: {
              glovo: { pizza: 6, burger: 2, taco: 0 },
              ubereats: { pizza: 4, burger: 0, taco: 0 },
            },
          },
        }),
      ],
      (d) => d === DAY,
    );

    expect(overlay.hasData).toBe(true);
    expect(overlay.revenueByBrand['brand-pizza']).toBe(170.5);
    expect(overlay.revenueByBrand['brand-burger']).toBe(30);
    expect(overlay.revenueByChannel.glovo).toBe(120.5);
    expect(overlay.revenueByChannel.ubereats).toBe(80);
    expect(overlay.food).toEqual({ pizza: 10, burger: 2, taco: 0 });
    expect(overlay.brandLabels['brand-pizza']).toBe('Modomio');
  });

  it('ignora sesiones fuera del rango y cierres sin declaración manual', () => {
    const overlay = buildClosingBrandOverlay(
      [
        // Fuera de rango.
        session({
          openedAt: `${OTHER_DAY}T10:00:00.000Z`,
          closedAt: `${OTHER_DAY}T23:00:00.000Z`,
          aggregatorClosingTotals: { glovo: 999 },
        }),
        // Sin declaración manual (solo ventas del sistema): pedidos mandan.
        session({
          summary: { salesByChannel: { glovo: 50 } },
        }),
      ],
      (d) => d === DAY,
    );

    expect(overlay.hasData).toBe(false);
    expect(overlay.revenueByChannel.glovo).toBeUndefined();
    expect(overlay.overlaidChannelsByDay.size).toBe(0);
  });

  it("canonicaliza 'app' → 'flipdish' y marca ambos alias como pisados", () => {
    const overlay = buildClosingBrandOverlay(
      [session({ aggregatorClosingTotals: { app: 45 } })],
      (d) => d === DAY,
    );

    expect(overlay.revenueByChannel.flipdish).toBe(45);
    expect(isOrderReplacedByClosing(overlay, DAY, 'app')).toBe(true);
    expect(isOrderReplacedByClosing(overlay, DAY, 'flipdish')).toBe(true);
    expect(isOrderReplacedByClosing(overlay, DAY, 'glovo')).toBe(false);
    expect(isOrderReplacedByClosing(overlay, OTHER_DAY, 'app')).toBe(false);
  });

  it('usa la suma de marcas si no hay total de canal declarado', () => {
    const overlay = buildClosingBrandOverlay(
      [
        session({
          aggregatorClosingBrandTotals: { justeat: { 'brand-a': 25.25, 'brand-b': 10 } },
        }),
      ],
      (d) => d === DAY,
    );

    expect(overlay.revenueByChannel.justeat).toBe(35.25);
    expect(isOrderReplacedByClosing(overlay, DAY, 'justeat')).toBe(true);
  });
});

describe('mergeClosingIntoChannelRows', () => {
  it('suma € del cierre a las filas y recalcula el reparto', () => {
    const rows = [
      { key: 'glovo', revenue: 100, sharePercent: 100 },
      { key: 'ubereats', revenue: 0, sharePercent: 0 },
    ];
    const merged = mergeClosingIntoChannelRows(rows, { ubereats: 100 });
    expect(merged[0].revenue).toBe(100);
    expect(merged[1].revenue).toBe(100);
    expect(merged[0].sharePercent).toBe(50);
    expect(merged[1].sharePercent).toBe(50);
  });

  it('sin importes de cierre devuelve las filas tal cual', () => {
    const rows = [{ key: 'glovo', revenue: 10, sharePercent: 100 }];
    expect(mergeClosingIntoChannelRows(rows, {})).toBe(rows);
  });
});
