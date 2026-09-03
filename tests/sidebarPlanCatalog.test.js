import { describe, expect, it } from 'vitest';
import { isSidebarItemUnlockedForPlan } from '../src/app/lib/sidebarPlanCatalog';

describe('sidebar packing Mediano', () => {
  it('Mediano ve operativa + stock/escandallo/compras, no finanzas/chat/RRHH', () => {
    expect(isSidebarItemUnlockedForPlan('tpv', 'normal')).toBe(true);
    expect(isSidebarItemUnlockedForPlan('caja', 'normal')).toBe(true);
    expect(isSidebarItemUnlockedForPlan('catalog-stock', 'normal')).toBe(true);
    expect(isSidebarItemUnlockedForPlan('costing', 'normal')).toBe(true);
    expect(isSidebarItemUnlockedForPlan('suppliers', 'normal')).toBe(true);
    expect(isSidebarItemUnlockedForPlan('team', 'normal')).toBe(true);
    expect(isSidebarItemUnlockedForPlan('billing', 'normal')).toBe(true);

    expect(isSidebarItemUnlockedForPlan('finance', 'normal')).toBe(false);
    expect(isSidebarItemUnlockedForPlan('ebitda', 'normal')).toBe(false);
    expect(isSidebarItemUnlockedForPlan('chat', 'normal')).toBe(false);
    expect(isSidebarItemUnlockedForPlan('calendar', 'normal')).toBe(false);
    expect(isSidebarItemUnlockedForPlan('payroll', 'normal')).toBe(false);
    expect(isSidebarItemUnlockedForPlan('operations', 'normal')).toBe(false);
    expect(isSidebarItemUnlockedForPlan('alertas', 'normal')).toBe(false);
  });

  it('Pro desbloquea finanzas y SVAs de suelo', () => {
    expect(isSidebarItemUnlockedForPlan('finance', 'pro')).toBe(true);
    expect(isSidebarItemUnlockedForPlan('chat', 'pro')).toBe(true);
    expect(isSidebarItemUnlockedForPlan('operations', 'pro')).toBe(true);
  });
});
