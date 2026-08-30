import type { StockCategory } from './deliveryApi';

export type VertialStockTemplate = {
  templateId: string;
  name: string;
  stockCategory: StockCategory;
  unit: string;
  minStock: number;
  reorderQuantity: number;
  autoReorder: boolean;
  costPrice: number;
  categoryLabel: string;
};

/** Artículos base de almacén para delivery (envases + consumibles típicos). */
export const VERTIAL_DELIVERY_STOCK_TEMPLATES: VertialStockTemplate[] = [
  {
    templateId: 'box-pizza-m',
    name: 'Caja pizza M',
    stockCategory: 'packaging',
    unit: 'ud',
    minStock: 20,
    reorderQuantity: 50,
    autoReorder: true,
    costPrice: 0.32,
    categoryLabel: 'Envases',
  },
  {
    templateId: 'box-pizza-l',
    name: 'Caja pizza L',
    stockCategory: 'packaging',
    unit: 'ud',
    minStock: 20,
    reorderQuantity: 50,
    autoReorder: true,
    costPrice: 0.38,
    categoryLabel: 'Envases',
  },
  {
    templateId: 'box-pizza-xl',
    name: 'Caja pizza XL',
    stockCategory: 'packaging',
    unit: 'ud',
    minStock: 15,
    reorderQuantity: 40,
    autoReorder: true,
    costPrice: 0.45,
    categoryLabel: 'Envases',
  },
  {
    templateId: 'box-burger',
    name: 'Caja burger',
    stockCategory: 'packaging',
    unit: 'ud',
    minStock: 20,
    reorderQuantity: 50,
    autoReorder: true,
    costPrice: 0.18,
    categoryLabel: 'Envases',
  },
  {
    templateId: 'bag-delivery',
    name: 'Bolsa para llevar',
    stockCategory: 'packaging',
    unit: 'ud',
    minStock: 24,
    reorderQuantity: 100,
    autoReorder: true,
    costPrice: 0.08,
    categoryLabel: 'Envases',
  },
  {
    templateId: 'film-aluminio',
    name: 'Film aluminio',
    stockCategory: 'packaging',
    unit: 'ud',
    minStock: 5,
    reorderQuantity: 10,
    autoReorder: true,
    costPrice: 2.5,
    categoryLabel: 'Envases',
  },
  {
    templateId: 'servilletas-pack',
    name: 'Servilletas (pack)',
    stockCategory: 'consumable',
    unit: 'ud',
    minStock: 5,
    reorderQuantity: 10,
    autoReorder: true,
    costPrice: 1.2,
    categoryLabel: 'Consumibles',
  },
];

const MIN_STOCK_BY_CATEGORY: Record<StockCategory, number> = {
  ingredient: 5,
  beverage: 24,
  packaging: 20,
  cleaning: 5,
  consumable: 5,
  finished_product: 12,
  other: 5,
};

const REORDER_BY_CATEGORY: Record<StockCategory, number> = {
  ingredient: 10,
  beverage: 48,
  packaging: 50,
  cleaning: 10,
  consumable: 10,
  finished_product: 24,
  other: 10,
};

export function resolveVertialMinStock(stockCategory: StockCategory): number {
  return MIN_STOCK_BY_CATEGORY[stockCategory] ?? 5;
}

export function resolveVertialReorderQuantity(stockCategory: StockCategory): number {
  return REORDER_BY_CATEGORY[stockCategory] ?? 10;
}

export function findVertialStockTemplate(templateId: string): VertialStockTemplate | undefined {
  return VERTIAL_DELIVERY_STOCK_TEMPLATES.find((t) => t.templateId === templateId);
}

function fold(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

export type DeliveryOrderChannel = 'domicilio' | 'recogida' | 'sala';

export type OrderChannelStockRule = {
  deliveryType: DeliveryOrderChannel;
  templateId: string;
  quantity: number;
};

/** Consumo por pedido (no por producto): bolsa en domicilio, etc. */
export const VERTIAL_ORDER_CHANNEL_STOCK_RULES: OrderChannelStockRule[] = [
  { deliveryType: 'domicilio', templateId: 'bag-delivery', quantity: 1 },
];

/** @deprecated Envases se eligen a mano en el alta del producto; no hay reglas auto. */
export type ProductPackagingRule = {
  match: (foldedName: string, foldedCategory: string, lineKind: string) => boolean;
  templateId: string;
  quantity: number;
};

/** Siempre vacío: el packaging va en la composición del producto (Carta). */
export function resolveProductPackagingLines(
  _item: { name?: string; category?: string },
  _lineKind: string,
): Array<{ templateId: string; quantity: number }> {
  return [];
}

export function resolveOrderChannelStockRules(
  deliveryType: string,
): Array<{ templateId: string; quantity: number }> {
  const dt = String(deliveryType || 'domicilio') as DeliveryOrderChannel;
  return VERTIAL_ORDER_CHANNEL_STOCK_RULES.filter((r) => r.deliveryType === dt).map((r) => ({
    templateId: r.templateId,
    quantity: r.quantity,
  }));
}

export function isCatalogResaleStockProduct(item: {
  name?: string;
  category?: string;
  stockCategory?: StockCategory;
  module?: string;
  itemType?: string;
}): boolean {
  if (item.module === 'stock') return false;
  if (item.itemType && item.itemType !== 'product') return false;
  const cat = fold(item.category || '');
  const name = fold(item.name || '');
  // Carta de bar/restaurante con escandallo — no tratar como reventa de stock envasado.
  if (/tapas?|raciones?|pinchos?|montaditos?|bocadillos?|bocatas?|sandwich|kebab|principales|platos|cocina|carte/.test(cat)) {
    return false;
  }
  if (/bocadillo|bocata|sandwich/.test(name)) {
    return false;
  }
  if (/bebida|refresco|cerveza|agua|zumo|postre|helado|dulce|complemento|side|guarnicion|patata|nugget|tequeño|entrante/.test(cat)) {
    return true;
  }
  if (/coca|pepsi|fanta|agua|cerveza|bebida|refresco|nestea|postre|tarta|helado|patata|nugget|tequeño/.test(name)) {
    if (/tapas?|raciones?|pinchos?|bravas|iberico|ibérico|calamares|pulpo|gamba/.test(name)) {
      return false;
    }
    return true;
  }
  return item.stockCategory === 'beverage' || item.stockCategory === 'finished_product';
}

export function inferResaleStockCategory(item: {
  name?: string;
  category?: string;
}): StockCategory {
  const cat = fold(item.category || '');
  const name = fold(item.name || '');
  if (/bebida|refresco|cerveza|agua|zumo/.test(cat) || /coca|pepsi|fanta|agua|cerveza|bebida/.test(name)) {
    return 'beverage';
  }
  return 'finished_product';
}
