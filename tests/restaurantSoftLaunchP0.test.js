/**
 * Soft-launch P0 restaurant: offline types, stock gate, loyalty redeem, aislamiento.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  loyaltyDiscountFromPoints,
  loyaltyPointsForDiscount,
  maxRedeemablePoints,
  LOYALTY_EURO_PER_POINT,
} from '../src/app/lib/restaurantLoyalty.ts';
import {
  applyRedeemedPointsToLoyalty,
  loyaltyDiscountFromPoints as beDiscount,
} from '../services/restaurantLoyaltyRedeem.js';
import { unavailableCartLines } from '../src/app/lib/restaurantCatalogAvailability.ts';

describe('restaurant soft-launch P0', () => {
  it('loyalty: 10 pts = 1 €', () => {
    expect(LOYALTY_EURO_PER_POINT).toBe(0.1);
    expect(loyaltyDiscountFromPoints(10)).toBe(1);
    expect(loyaltyPointsForDiscount(1)).toBe(10);
    expect(maxRedeemablePoints(50, 2)).toBe(20);
    expect(beDiscount(25)).toBe(2.5);
  });

  it('loyalty: sync resta redeemedPoints del saldo ganado', () => {
    const loyalty = applyRedeemedPointsToLoyalty(
      { enrolled: true, redeemedPoints: 15, points: 99 },
      40,
    );
    expect(loyalty.points).toBe(25);
    expect(loyalty.redeemedPoints).toBe(15);
  });

  it('offline types dining definidos y sincronizados aparte de delivery', () => {
    const offline = readFileSync(join(process.cwd(), 'src/app/lib/tpvTabletOffline.ts'), 'utf8');
    const sync = readFileSync(join(process.cwd(), 'src/app/lib/tpvOfflineSync.ts'), 'utf8');
    const diningSync = readFileSync(join(process.cwd(), 'src/app/lib/restaurantTpvOfflineSync.ts'), 'utf8');
    expect(offline).toMatch(/dining_comanda_add/);
    expect(offline).toMatch(/dining_pay/);
    expect(sync).toMatch(/syncDiningOfflineItem/);
    expect(diningSync).not.toMatch(/createDeliveryOrderRequest/);
  });

  it('stock: carrito con available:false se bloquea', () => {
    const blocked = unavailableCartLines([
      {
        lineId: '1',
        quantity: 1,
        customization: {},
        catalogItem: { _id: 'a', name: 'Pizza', available: false, active: true },
      },
      {
        lineId: '2',
        quantity: 1,
        customization: {},
        catalogItem: { _id: 'b', name: 'Agua', available: true, active: true },
      },
    ]);
    expect(blocked).toHaveLength(1);
    expect(blocked[0].catalogItem.name).toBe('Pizza');
  });

  it('tpvCatalogNavigation respeta available:false', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/lib/tpvCatalogNavigation.ts'), 'utf8');
    expect(src).toMatch(/available === false/);
  });

  it('sala addComanda valida catálogo y loyalty redeem en updateOrder', () => {
    const src = readFileSync(join(process.cwd(), 'controllers/salaController.js'), 'utf8');
    expect(src).toMatch(/assertComandaCatalogAvailable/);
    expect(src).toMatch(/redeemClientLoyaltyPoints/);
  });

  it('restaurantDiningTpv encola offline sin tocar delivery_order', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/lib/restaurantDiningTpv.ts'), 'utf8');
    expect(src).toMatch(/dining_comanda_add/);
    expect(src).toMatch(/dining_pay/);
    expect(src).not.toMatch(/createDeliveryOrderRequest/);
  });

  it('TPV sala bloquea createDeliveryOrder en modo restaurant', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/pages/saas/TpvRapidoPage.tsx'), 'utf8');
    expect(src).toMatch(/NUNCA crear delivery_order/);
    expect(src).toMatch(/isRestaurantMode && \(embeddedInRestaurantTpv \|\| restaurantTable\)/);
  });

  it('mostrador abre cuenta dining, no panel delivery vacío', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/app/verticals/restaurant/RestaurantTpvFloorBoard.tsx'),
      'utf8',
    );
    expect(src).toMatch(/RESTAURANT_COUNTER_TABLE_ID/);
    expect(src).toMatch(/ensureOpenDiningOrder/);
    expect(src).toMatch(/tableName: 'Mostrador'/);
  });

  it('PDV restaurant usa storage propio (no deliveryOps)', () => {
    const sel = readFileSync(
      join(process.cwd(), 'src/app/verticals/restaurant/restaurantOpsPdvSelection.ts'),
      'utf8',
    );
    expect(sel).toMatch(/vertial\.restaurantOps\.selectedPdv/);
    expect(sel).not.toMatch(/vertial\.deliveryOps/);
    const shell = readFileSync(
      join(process.cwd(), 'src/app/verticals/restaurant/RestaurantSalaTpvShell.tsx'),
      'utf8',
    );
    expect(shell).toMatch(/readRestaurantOpsSelectedPdvId/);
    expect(shell).not.toMatch(/readDeliveryOpsSelectedPdvId/);
    expect(shell).not.toMatch(/notifyDeliveryActiveStoreChanged/);
  });

  it('sala pickups no lee delivery_order', () => {
    const src = readFileSync(join(process.cwd(), 'controllers/salaController.js'), 'utf8');
    const fn = src.slice(src.indexOf('export async function listPickupOrders'));
    const body = fn.slice(0, fn.indexOf('export async function linkClientToOrder'));
    expect(body).toMatch(/pickups: \[\]/);
    expect(body).not.toMatch(/type === ['\"]delivery_order['\"]/);
    expect(body).not.toMatch(/getDeliveryDbName/);
  });

  it('ops PDV preference enruta restaurant fuera de deliveryOps', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/lib/opsPdvPreference.ts'), 'utf8');
    expect(src).toMatch(/readRestaurantOpsSelectedPdvId/);
    expect(src).toMatch(/isRestaurantBusinessType/);
    expect(src).toMatch(/writeRestaurantOpsSelectedPdvId/);
  });

  it('ActiveStoreScope y TpvRegisterGate usan opsPdvPreference', () => {
    const scope = readFileSync(join(process.cwd(), 'src/app/context/ActiveStoreScopeContext.tsx'), 'utf8');
    expect(scope).toMatch(/writeOpsSelectedPdvId/);
    expect(scope).not.toMatch(/writeDeliveryOpsSelectedPdvId/);
    const gate = readFileSync(join(process.cwd(), 'src/app/components/saas/TpvRegisterGate.tsx'), 'utf8');
    expect(gate).toMatch(/writeOpsSelectedPdvId/);
    expect(gate).not.toMatch(/writeDeliveryOpsSelectedPdvId/);
  });

  it('useSalaManager no dispara notifyDeliveryActiveStoreChanged', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/app/components/saas/sala/manager/useSalaManager.ts'),
      'utf8',
    );
    expect(src).toMatch(/notifyOpsActiveStoreChanged/);
    expect(src).not.toMatch(/notifyDeliveryActiveStoreChanged/);
    expect(src).not.toMatch(/notifyDeliveryWorkCentersChanged/);
  });

  it('rutas sala endurecen permiso sala', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/routes.tsx'), 'utf8');
    expect(src).toMatch(/lista-espera[\s\S]*permission="sala"/);
    expect(src).toMatch(/sala\/setup[\s\S]*permission=\{\['sala', 'reservations'\]\}/);
  });
});
