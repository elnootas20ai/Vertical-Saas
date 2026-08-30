/**
 * Filas de coste por ingrediente para Escandallo → pestaña Ingredientes.
 * Une lista maestra + almacén (última compra / proveedor).
 */
import type { CatalogItem } from './deliveryApi';
import type { StoreIngredient } from './catalogCustomization';
import {
  resolveIngredientUnitCost,
  stockItemsByStoreIngredientId,
} from './catalogCosting';

export type EscandalloIngredientCostRow = {
  ingredientId: string;
  name: string;
  unit: string;
  fichaCost: number;
  purchaseCost: number;
  effectiveCost: number;
  source: 'purchase' | 'ficha' | 'zero';
  supplierName: string;
  stockQty: number | null;
  linkedStock: boolean;
  stockItemId: string | null;
};

export function buildEscandalloIngredientCostRows(
  storeIngredients: StoreIngredient[],
  stockItems: Array<CatalogItem & { lastPurchasePrice?: number }>,
  brands?: Array<{ _id: string; deliveryLineKind?: string }>,
): EscandalloIngredientCostRow[] {
  const byIng = stockItemsByStoreIngredientId(stockItems);
  const rows: EscandalloIngredientCostRow[] = [];

  for (const ing of storeIngredients) {
    const id = String(ing.id || '').trim();
    if (!id) continue;
    const stock = byIng.get(id) || null;
    const unitRes = resolveIngredientUnitCost(ing, stock, brands);
    const supplierName = String(stock?.supplierName || '').trim()
      || (stock?.supplierId ? 'Proveedor enlazado' : '');
    const qty = stock != null && Number.isFinite(Number(stock.stockQuantity))
      ? Number(stock.stockQuantity)
      : null;

    rows.push({
      ingredientId: id,
      name: String(ing.name || '').trim() || 'Sin nombre',
      unit: String(ing.unit || stock?.unit || 'ud').trim() || 'ud',
      fichaCost: unitRes.fromFicha,
      purchaseCost: unitRes.fromPurchase,
      effectiveCost: unitRes.effective,
      source: unitRes.source,
      supplierName,
      stockQty: qty,
      linkedStock: Boolean(stock),
      stockItemId: stock?._id || null,
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
