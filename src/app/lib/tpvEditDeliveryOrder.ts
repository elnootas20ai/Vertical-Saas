/**
 * Helpers para editar un pedido delivery ya en montaje o reparto desde el TPV.
 * No acopla a restaurante ni heladería.
 */
import { EMPTY_CART_CUSTOMIZATION, type CartLineCustomization } from './catalogCustomization';
import type { CatalogItem, DeliveryOrder, DeliveryOrderItem } from './deliveryApi';
import { isTpvMontajeBoardOrder, isTpvRepartoBoardOrder } from './tpvCajaScope';
import { v4 as uuidv4 } from 'uuid';

export type TpvEditCartSeed = {
  lineId: string;
  catalogItem: CatalogItem;
  quantity: number;
  customization: CartLineCustomization;
};

function stubCatalogItemFromOrderLine(item: DeliveryOrderItem, userId: string): CatalogItem {
  const id = String(item.catalogItemId || item.id || uuidv4()).trim();
  const now = new Date().toISOString();
  return {
    _id: id,
    id,
    type: 'catalog_item',
    sku: '',
    user_id: userId,
    module: 'catalog',
    itemType: 'product',
    vertical: 'delivery',
    name: String(item.name || 'Producto'),
    description: '',
    category: String(item.category || ''),
    unitPrice: Number(item.unitPrice) || 0,
    costPrice: 0,
    taxRate: 10,
    stockQuantity: 0,
    minStock: 0,
    reorderQuantity: 0,
    autoReorder: false,
    unit: 'ud',
    supplierId: '',
    supplierName: '',
    allergens: [],
    image: '',
    images: [],
    active: true,
    webVisible: false,
    available: true,
    notes: '',
    barcode: '',
    brandIds: Array.isArray(item.brandIds) ? item.brandIds : [],
    articles: [],
    comboItems: [],
    salesChannels: [],
    stockCategory: 'finished_product',
    stockSubcategory: '',
    isStockItem: false,
    customFields: {},
    createdAt: now,
    updatedAt: now,
  };
}

function customizationFromOrderItem(item: DeliveryOrderItem): CartLineCustomization {
  const extras = Array.isArray(item.extras) ? item.extras.filter(Boolean) : [];
  const noteParts = [String(item.notes || '').trim(), ...extras.map(String)].filter(Boolean);
  return {
    ...EMPTY_CART_CUSTOMIZATION,
    notes: noteParts.join(' · '),
  };
}

/** Reconstruye el carrito TPV a partir de las líneas del pedido. */
export function seedTpvCartFromDeliveryOrder(
  order: DeliveryOrder,
  catalogById: Record<string, CatalogItem>,
  userId: string,
): TpvEditCartSeed[] {
  const lines = Array.isArray(order.items) ? order.items : [];
  return lines.map((item) => {
    const catalogId = String(item.catalogItemId || '').trim();
    const fromCatalog = catalogId ? catalogById[catalogId] : undefined;
    const catalogItem =
      fromCatalog && fromCatalog.active !== false
        ? fromCatalog
        : stubCatalogItemFromOrderLine(item, userId);
    // Conservar precio cobrado en el pedido si el catálogo cambió.
    const pricedItem =
      Number(item.unitPrice) > 0 &&
      Math.abs(Number(catalogItem.unitPrice) - Number(item.unitPrice)) > 0.009
        ? { ...catalogItem, unitPrice: Number(item.unitPrice) }
        : catalogItem;
    return {
      lineId: String(item.id || uuidv4()),
      catalogItem: pricedItem,
      quantity: Math.max(1, Number(item.quantity) || 1),
      customization: customizationFromOrderItem(item),
    };
  });
}

/**
 * Editable desde el tablero TPV:
 * - Domicilio: montaje o reparto
 * - Recogida local: montaje (hasta Entregar)
 * No entregado / cancelado / historial.
 */
export function isDeliveryOrderEditableOnTpvBoard(
  order: Parameters<typeof isTpvMontajeBoardOrder>[0] | null | undefined,
): boolean {
  if (!order) return false;
  const dtype = String(order.deliveryType || '').toLowerCase();
  // Recogida solo vive en montaje (nunca columna reparto).
  if (dtype === 'recogida') {
    return isTpvMontajeBoardOrder(order);
  }
  return isTpvMontajeBoardOrder(order) || isTpvRepartoBoardOrder(order);
}

/** @deprecated Preferir isDeliveryOrderEditableOnTpvBoard (montaje + reparto). */
export function isDeliveryOrderEditableInMontaje(
  order: Parameters<typeof isTpvMontajeBoardOrder>[0] | null | undefined,
): boolean {
  return isDeliveryOrderEditableOnTpvBoard(order);
}
