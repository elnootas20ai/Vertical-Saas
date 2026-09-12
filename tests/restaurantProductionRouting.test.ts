import { describe, expect, it } from 'vitest';
import { buildCatalogItemDocument, sanitizeCatalogItemForTpv } from '../services/couchdb.js';
import {
  buildDiningOrderDocument,
  routeDraftComandasToProductionAreas,
} from '../services/salaService.js';
import {
  normalizeRestaurantProductionArea,
  resolveRestaurantProductionArea,
} from '../shared/restaurant/productionArea.js';
import {
  buildAccessibleKitchenTickets,
  buildKitchenTickets,
} from '../src/app/verticals/restaurant/restaurantKitchen';

function mixedDraftOrder() {
  return buildDiningOrderDocument('owner-1', {
    businessId: 'business-1',
    status: 'open',
    comandas: [{
      id: 'draft-1',
      status: 'draft',
      items: [
        { id: 'food', productId: 'food-1', name: 'Tapa', price: 8, quantity: 1 },
        { id: 'drink', productId: 'drink-1', name: 'Refresco', price: 3, quantity: 2 },
      ],
    }],
  });
}

const catalog = new Map([
  ['food-1', { _id: 'food-1', category: 'Tapas', productionArea: 'kitchen' }],
  ['drink-1', { _id: 'drink-1', category: 'Bebidas', productionArea: 'bar' }],
]);

describe('ruteo profesional Cocina y Barra', () => {
  it('normaliza valores de alta manual y Excel y aplica fallback seguro', () => {
    expect(normalizeRestaurantProductionArea('Cocina')).toBe('kitchen');
    expect(normalizeRestaurantProductionArea('barra')).toBe('bar');
    expect(resolveRestaurantProductionArea({ category: 'Bebidas' })).toBe('bar');
    expect(resolveRestaurantProductionArea({
      category: 'Bebidas',
      customFields: { ingredients: 'Café, leche' },
    })).toBe('kitchen');
    expect(resolveRestaurantProductionArea({ category: 'Tapas' })).toBe('kitchen');
  });

  it('persiste el destino en catálogo y lo entrega al TPV', () => {
    const doc = buildCatalogItemDocument('owner-1', {
      name: 'Agua',
      category: 'Bebidas',
      productionArea: 'bar',
    });
    expect(doc.productionArea).toBe('bar');
    expect(sanitizeCatalogItemForTpv(doc)?.productionArea).toBe('bar');
  });

  it('en plan normal fuerza una única comanda de Cocina', () => {
    const routed = routeDraftComandasToProductionAreas(mixedDraftOrder(), {
      catalogByProductId: catalog,
      hasProAccess: false,
      sentAt: '2026-09-11T20:00:00.000Z',
    });
    expect(routed.sentComandas).toHaveLength(1);
    expect(routed.sentComandas[0].productionArea).toBe('kitchen');
    expect(routed.sentComandas[0].items).toHaveLength(2);
    expect(routed.total).toBe(15.4);
  });

  it('en PRO divide atómicamente el borrador y el KDS no mezcla estaciones', () => {
    const order = mixedDraftOrder();
    const routed = routeDraftComandasToProductionAreas(order, {
      catalogByProductId: catalog,
      hasProAccess: true,
      sentAt: '2026-09-11T20:00:00.000Z',
    });
    expect(routed.sentComandas.map((row) => row.productionArea)).toEqual(['kitchen', 'bar']);
    expect(routed.sentComandas.map((row) => row.items.length)).toEqual([1, 1]);

    const saved = buildDiningOrderDocument('owner-1', { ...order, comandas: routed.comandas }, order);
    expect(buildKitchenTickets([saved], 'business-1', 'kitchen')).toHaveLength(1);
    expect(buildKitchenTickets([saved], 'business-1', 'bar')).toHaveLength(1);
    expect(buildAccessibleKitchenTickets([saved], 'business-1', 'kitchen', false)).toHaveLength(2);
  });

  it('trata comandas históricas sin estación como Cocina', () => {
    const order = mixedDraftOrder();
    const sent = buildDiningOrderDocument('owner-1', {
      ...order,
      comandas: order.comandas.map((comanda) => ({
        ...comanda,
        status: 'sent_to_kitchen',
        sentToKitchenAt: '2026-09-11T20:00:00.000Z',
      })),
    }, order);
    expect(buildKitchenTickets([sent], 'business-1', 'kitchen')).toHaveLength(1);
    expect(buildKitchenTickets([sent], 'business-1', 'bar')).toHaveLength(0);
  });
});
