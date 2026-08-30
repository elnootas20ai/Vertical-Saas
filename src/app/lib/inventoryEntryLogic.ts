import type { CatalogItem } from './deliveryApi';
import type { StoreIngredient, StoreIngredientRecipeLine } from './catalogCustomization';

function foldName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Ingrediente maestro ligado a un artículo de almacén (subreceta / elaborado). */
export function resolveStoreIngredientForStockItem(
  item: Pick<CatalogItem, 'name' | 'customFields'>,
  storeIngredients: StoreIngredient[],
): StoreIngredient | null {
  const linkedId = String(item.customFields?.storeIngredientId || '').trim();
  if (linkedId) {
    const byId = storeIngredients.find((ing) => ing.id === linkedId);
    if (byId) return byId;
  }
  const key = foldName(item.name);
  if (!key) return null;
  return storeIngredients.find((ing) => foldName(ing.name) === key) || null;
}

export function stockItemHasFabricationRecipe(
  item: Pick<CatalogItem, 'name' | 'customFields'>,
  storeIngredients: StoreIngredient[],
): boolean {
  const ing = resolveStoreIngredientForStockItem(item, storeIngredients);
  return Boolean(ing?.recipeLines && ing.recipeLines.length > 0);
}

export type FabricationConsumeLine = {
  storeIngredientId: string;
  name: string;
  quantity: number;
  unit: string;
  catalogItemId?: string;
};

/** Consumo de bases al fabricar `producedQty` unidades del elaborado. */
export function computeFabricationConsumptions(
  recipeLines: StoreIngredientRecipeLine[],
  producedQty: number,
  stockItems: CatalogItem[],
): { lines: FabricationConsumeLine[]; missingNames: string[] } {
  const qty = Number(producedQty);
  if (!(qty > 0) || !Array.isArray(recipeLines)) {
    return { lines: [], missingNames: [] };
  }

  const byIngId = new Map<string, CatalogItem>();
  const byName = new Map<string, CatalogItem>();
  for (const item of stockItems) {
    if (!item || item.deletedAt || item.active === false) continue;
    const sid = String(item.customFields?.storeIngredientId || '').trim();
    if (sid) byIngId.set(sid, item);
    const key = foldName(item.name);
    if (key && !byName.has(key)) byName.set(key, item);
  }

  const lines: FabricationConsumeLine[] = [];
  const missingNames: string[] = [];

  for (const line of recipeLines) {
    const perUnit = Number(line.quantity);
    if (!(perUnit > 0)) continue;
    const need = Math.round(perUnit * qty * 1000) / 1000;
    const catalog =
      byIngId.get(String(line.storeIngredientId || '').trim()) ||
      byName.get(foldName(line.name)) ||
      null;
    if (!catalog) {
      missingNames.push(line.name);
      lines.push({
        storeIngredientId: line.storeIngredientId,
        name: line.name,
        quantity: need,
        unit: line.unit || 'ud',
      });
      continue;
    }
    lines.push({
      storeIngredientId: line.storeIngredientId,
      name: line.name,
      quantity: need,
      unit: line.unit || catalog.unit || 'ud',
      catalogItemId: catalog._id,
    });
  }

  return { lines, missingNames };
}

export function buildPurchaseEntryNotes(opts: {
  quantity: number;
  unit: string;
  supplierName?: string;
  ticketNumber?: string;
  extraNotes?: string;
}): string {
  const ticket = String(opts.ticketNumber || '').trim();
  const ticketBit = ticket ? `ticket ${ticket}` : 'sin ticket';
  const base = opts.supplierName?.trim()
    ? `Compra · ${opts.supplierName.trim()} · ${ticketBit}: +${opts.quantity} ${opts.unit}`
    : `Compra · ${ticketBit}: +${opts.quantity} ${opts.unit}`;
  const extra = String(opts.extraNotes || '').trim();
  return extra ? `${base} — ${extra}` : base;
}

export function isImprovisedPurchase(opts: {
  supplierId?: string;
  supplierName?: string;
}): boolean {
  const hasSupplier = Boolean(
    String(opts.supplierId || '').trim() || String(opts.supplierName || '').trim(),
  );
  return !hasSupplier;
}

/** Aviso UX: entrada compra sin proveedor (= improvisada). No bloquea. */
export function improvisedPurchaseWarning(opts: {
  supplierId?: string;
  supplierName?: string;
}): string | null {
  if (!isImprovisedPurchase(opts)) return null;
  return 'Compra improvisada: sin proveedor. Se registra en Compras para revisar.';
}

export function buildManualStockPurchaseInvoicePayload(opts: {
  item: Pick<CatalogItem, '_id' | 'name' | 'costPrice' | 'unit'>;
  quantity: number;
  supplierId?: string;
  supplierName?: string;
  ticketNumber?: string;
  extraNotes?: string;
  businessId?: string;
  warehouseId?: string;
}): Record<string, unknown> {
  const qty = Number(opts.quantity) || 0;
  const unitPrice = Number(opts.item.costPrice) || 0;
  const lineTotal = Math.round(qty * unitPrice * 100) / 100;
  const ticket = String(opts.ticketNumber || '').trim();
  const supplierName = String(opts.supplierName || '').trim();
  const improvised = isImprovisedPurchase({
    supplierId: opts.supplierId,
    supplierName,
  });
  const noteParts = [
    improvised
      ? 'Compra improvisada desde almacén (sin proveedor).'
      : `Proveedor: ${supplierName}.`,
    ticket ? `Ticket/albarán: ${ticket}.` : 'Sin nº de ticket.',
    'Stock ya cargado en almacén; no volver a cargar.',
    String(opts.extraNotes || '').trim(),
  ].filter(Boolean);

  return {
    documentKind: 'albaran',
    entryMethod: 'manual',
    source: 'inventory_manual_entry',
    invoiceNumber: ticket || undefined,
    supplierId: String(opts.supplierId || '').trim() || undefined,
    supplierName: supplierName || 'Sin proveedor',
    date: new Date().toISOString().slice(0, 10),
    status: 'pending',
    validationStatus: 'pending_validation',
    lines: [
      {
        id: `line-stock-${Date.now()}`,
        itemName: opts.item.name,
        quantity: qty,
        unitPrice,
        total: lineTotal,
        catalogItemId: opts.item._id,
        catalogItemName: opts.item.name,
      },
    ],
    subtotal: lineTotal,
    taxRate: 0,
    taxAmount: 0,
    total: lineTotal,
    notes: noteParts.join(' '),
    businessId: String(opts.businessId || '').trim() || undefined,
    costCenterId: String(opts.warehouseId || '').trim() || undefined,
    loadToWarehouse: false,
    flags: {
      noAttachment: improvised || !ticket,
      manualReview: improvised,
      stockPending: false,
    },
    ocrStockReceivedAt: new Date().toISOString(),
    ocrStockLinesReceived: 1,
  };
}

export function buildFabricationEntryNotes(opts: {
  quantity: number;
  unit: string;
  recipeName: string;
  extraNotes?: string;
}): string {
  const base = `Fabricación «${opts.recipeName}»: +${opts.quantity} ${opts.unit}`;
  const extra = String(opts.extraNotes || '').trim();
  return extra ? `${base} — ${extra}` : base;
}
