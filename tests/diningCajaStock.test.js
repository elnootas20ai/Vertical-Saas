/**
 * Smoke de servicios dining (caja/stock) — sin tocar Delivery.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('dining services isolation', () => {
  it('diningCajaService no importa controllers delivery', () => {
    const src = readFileSync(join(process.cwd(), 'services/diningCajaService.js'), 'utf8');
    expect(src).not.toMatch(/deliveryController/);
    expect(src).toMatch(/registerDiningSaleInTpvSession/);
    expect(src).toMatch(/channel: 'sala'/);
  });

  it('diningStockService usa orderType dining_order', () => {
    const src = readFileSync(join(process.cwd(), 'services/diningStockService.js'), 'utf8');
    expect(src).toMatch(/orderType: 'dining_order'/);
    expect(src).toMatch(/deductOrderByRecipe/);
    expect(src).not.toMatch(/WorkerTpvDelivery/);
  });

  it('sala payOrder registra caja nativa', () => {
    const src = readFileSync(join(process.cwd(), 'controllers/salaController.js'), 'utf8');
    expect(src).toMatch(/registerDiningSaleInTpvSession/);
    expect(src).toMatch(/maybeDeductRecipeStockForDiningOrder/);
    expect(src).toMatch(/ensureDiningOrderIncomeServer/);
    expect(src).toMatch(/syncClientAfterDiningOrder/);
  });

  it('sala expone staff-alert y tablet nav de sala no usa Delivery', () => {
    const router = readFileSync(join(process.cwd(), 'routers/salaRouter.js'), 'utf8');
    expect(router).toMatch(/staff-alert/);
    expect(router).toMatch(/emitSalaStaffAlert/);
    const nav = readFileSync(
      join(process.cwd(), 'src/app/verticals/restaurant/RestaurantTabletBottomNav.tsx'),
      'utf8',
    );
    expect(nav).not.toMatch(/from ['"].*WorkerTpvDelivery|from ['"].*WorkerTpvBottomBar|from ['"].*DeliveryOps/);
    expect(nav).toMatch(/lista-espera/);
    expect(nav).toMatch(/RestaurantTabletBottomNav/);
  });
});
