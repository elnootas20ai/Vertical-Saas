// @vitest-environment jsdom
/**
 * Render real del bloque «Resumen operativo» (PortfolioOpsPulse) del dashboard
 * delivery: tabla TIENDAS + detalle día a día + comparativa. Protege contra
 * regresiones que hagan desaparecer el bloque (datos vacíos incluidos).
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PortfolioOpsPulse } from '../src/app/components/saas/PortfolioOpsPulse.tsx';
import {
  buildStoreOpsPulse,
  listMonthToDateDayKeys,
  listTrailingDayKeys,
  rankStoreOpsPulses,
} from '../src/app/lib/portfolioMetrics.ts';

const TODAY = '2026-08-08';

function order({ id, pdv, paidAt, total, items }: {
  id: string;
  pdv: string;
  paidAt: string;
  total: number;
  items: Array<{ name: string; qty?: number }>;
}) {
  return {
    _id: id,
    salesPointId: pdv,
    status: 'entregado',
    paidAt,
    deliveredAt: paidAt,
    createdAt: paidAt,
    paymentStatus: 'paid',
    totalAmount: total,
    paidAmount: total,
    items: items.map((it, i) => ({
      id: `${id}-${i}`,
      name: it.name,
      category: '',
      quantity: it.qty ?? 1,
      unitPrice: 10,
      total: 10 * (it.qty ?? 1),
    })),
  };
}

const ORDERS = [
  order({ id: 'o1', pdv: 'pdv-tiana', paidAt: `${TODAY}T13:00:00`, total: 40, items: [{ name: 'Pizza Margarita', qty: 2 }, { name: 'Burger clásica' }] }),
  order({ id: 'o2', pdv: 'pdv-tiana', paidAt: '2026-08-06T20:30:00', total: 25, items: [{ name: 'Pizza 4 quesos' }, { name: 'Tacos mixtos' }] }),
  order({ id: 'o3', pdv: 'pdv-badalona', paidAt: '2026-08-07T21:00:00', total: 18, items: [{ name: 'Pizza barbacoa' }] }),
] as never[];

function buildPulses(dayKeys: string[]) {
  const opts = { businessId: 'biz-1', businessName: 'Modomio', todayKey: TODAY, dayKeys, sessions: [] };
  return rankStoreOpsPulses([
    buildStoreOpsPulse(ORDERS, { ...opts, storeId: 'wc-tiana', storeName: 'Modomio Tiana', pdvId: 'pdv-tiana' }),
    buildStoreOpsPulse(ORDERS, { ...opts, storeId: 'wc-badalona', storeName: 'Badalona', pdvId: 'pdv-badalona' }),
  ]);
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function renderPulse(props: Record<string, unknown>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      createElement(PortfolioOpsPulse, {
        refreshButton: null,
        singleBusiness: true,
        ...props,
      }),
    );
  });
  return host;
}

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  // recharts ResponsiveContainer necesita ResizeObserver (no existe en jsdom)
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('PortfolioOpsPulse render (dashboard delivery)', () => {
  it('escritorio: tabla TIENDAS + detalle día a día + comparativa visibles', () => {
    const el = renderPulse({
      pulses7d: buildPulses(listTrailingDayKeys(TODAY, 7)),
      pulsesMonth: buildPulses(listMonthToDateDayKeys(TODAY)),
    });
    const html = el.innerHTML;
    expect(html).toContain('Resumen operativo');
    // Estadísticas de caja: total cierre (con integradores) e integraciones
    expect(html).toContain('Total caja');
    expect(html).toContain('Integraciones');
    expect(html).toContain('Tiendas');
    expect(html).toContain('Modomio Tiana');
    expect(html).toContain('Badalona');
    expect(html).toContain('Canales');
    // Tabla completa como la foto (Efectivo/TPV/… + Total + Mix)
    expect(html).toContain('Efectivo');
    expect(html).toContain('Just Eat');
    expect(html).toContain('Glovo');
    expect(html).toContain('Día a día');
    expect(html).toContain('Comparativa');
  });

  it('compact (móvil): cards de tiendas y sin crash', () => {
    const el = renderPulse({
      compact: true,
      pulses7d: buildPulses(listTrailingDayKeys(TODAY, 7)),
      pulsesMonth: buildPulses(listMonthToDateDayKeys(TODAY)),
    });
    const html = el.innerHTML;
    expect(html).toContain('Resumen operativo');
    expect(html).toContain('Modomio Tiana');
    expect(html).toContain('Pulsa total o una tienda');
  });

  it('sin datos (limpieza/BD vacía): muestra aviso y no desaparece', () => {
    const el = renderPulse({ pulses7d: [], pulsesMonth: [] });
    expect(el.innerHTML).toContain('Resumen operativo');
    expect(el.innerHTML).toContain('Sin tiendas con PDV');
  });
});
