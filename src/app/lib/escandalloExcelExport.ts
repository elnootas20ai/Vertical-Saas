/**
 * Excel de escandallo — export de productos del catálogo con ingredientes y costes.
 * Hoja nueva (no es la plantilla de importación de catálogo).
 */
import * as XLSX from 'xlsx';
import type { CatalogItem } from './deliveryApi';
import type { StoreIngredient } from './catalogCustomization';
import {
  calculateRecipeTotalCost,
  foodRecipeLines,
  productCostingStatus,
  readProductMermaPct,
  readProductRecipeLines,
  resolveIngredientUnitCost,
  resolveProductUnitCost,
  stockItemsByStoreIngredientId,
  storeIngredientsById,
  type RecipeCostOptions,
} from './catalogCosting';

export const ESCANDALLO_EXPORT_SHEET_NAME = 'escandallo';
export const ESCANDALLO_EXPORT_FILENAME_PREFIX = 'escandallo_productos';

export const ESCANDALLO_EXPORT_HEADERS = [
  'Producto',
  'Categoría',
  'Tipo',
  'Precio venta €',
  'Ingrediente',
  'Cantidad',
  'Unidad',
  'Coste ud. ingrediente €',
  'Coste línea €',
  'Merma %',
  'Coste por venta €',
] as const;

export type EscandalloExportRow = {
  producto: string;
  categoria: string;
  tipo: string;
  precioVenta: number;
  ingrediente: string;
  cantidad: number | '';
  unidad: string;
  costeUdIngrediente: number | '';
  costeLinea: number | '';
  mermaPct: number;
  costePorVenta: number;
};

function tipoLabel(status: ReturnType<typeof productCostingStatus>): string {
  if (status === 'recipe') return 'Escandallo';
  if (status === 'fixed') return 'Coste fijo';
  return 'Sin configurar';
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function costOptionsFor(
  stockItems?: CatalogItem[],
  mermaPct?: number,
): RecipeCostOptions | undefined {
  if (!stockItems?.length && !(mermaPct && mermaPct > 0)) return mermaPct != null ? { mermaPct } : undefined;
  return {
    mermaPct,
    stockByStoreIngredientId: stockItems?.length
      ? stockItemsByStoreIngredientId(stockItems)
      : undefined,
  };
}

/** Filas planas: un producto con escandallo → una fila por ingrediente. */
export function buildEscandalloExportRows(
  products: CatalogItem[],
  storeIngredients: StoreIngredient[],
  brands?: Array<{ _id: string; deliveryLineKind?: string }>,
  stockItems?: CatalogItem[],
): EscandalloExportRow[] {
  const ingredientsById = storeIngredientsById(storeIngredients);
  const stockById = stockItemsByStoreIngredientId(stockItems || []);
  const sorted = [...products].sort((a, b) => {
    const byCat = String(a.category || '').localeCompare(String(b.category || ''), 'es');
    if (byCat !== 0) return byCat;
    return String(a.name || '').localeCompare(String(b.name || ''), 'es');
  });

  const rows: EscandalloExportRow[] = [];

  for (const product of sorted) {
    const status = productCostingStatus(product);
    const salePrice = round2(Number(product.unitPrice) || 0);
    const mermaPct = status === 'recipe' ? readProductMermaPct(product) : 0;
    const opts = costOptionsFor(stockItems, mermaPct);
    const costePorVenta = round2(
      resolveProductUnitCost(product, ingredientsById, brands, undefined, opts),
    );
    const base = {
      producto: String(product.name || '').trim() || 'Sin nombre',
      categoria: String(product.category || '').trim() || 'Sin categoría',
      tipo: tipoLabel(status),
      precioVenta: salePrice,
      mermaPct,
      costePorVenta,
    };

    if (status === 'recipe') {
      const lines = foodRecipeLines(readProductRecipeLines(product));
      const recipeLines = lines.length > 0 ? lines : readProductRecipeLines(product);
      if (recipeLines.length === 0) {
        rows.push({
          ...base,
          ingrediente: '',
          cantidad: '',
          unidad: '',
          costeUdIngrediente: '',
          costeLinea: '',
        });
        continue;
      }
      for (const line of recipeLines) {
        let unitCost = 0;
        if (line.storeIngredientId) {
          const ing = ingredientsById.get(line.storeIngredientId);
          const stock = stockById.get(line.storeIngredientId);
          unitCost = ing ? resolveIngredientUnitCost(ing, stock, brands).effective : 0;
        }
        const qty = Number(line.quantity) || 0;
        rows.push({
          ...base,
          ingrediente: String(line.name || '').trim(),
          cantidad: qty,
          unidad: String(line.unit || 'ud').trim() || 'ud',
          costeUdIngrediente: round2(unitCost),
          costeLinea: round2(qty * unitCost),
        });
      }
      continue;
    }

    rows.push({
      ...base,
      ingrediente: status === 'fixed' ? '—' : '',
      cantidad: '',
      unidad: '',
      costeUdIngrediente: '',
      costeLinea: '',
    });
  }

  return rows;
}

function rowsToSheetMatrix(rows: EscandalloExportRow[]): (string | number)[][] {
  const header = [...ESCANDALLO_EXPORT_HEADERS];
  const body = rows.map((r) => [
    r.producto,
    r.categoria,
    r.tipo,
    r.precioVenta,
    r.ingrediente,
    r.cantidad,
    r.unidad,
    r.costeUdIngrediente,
    r.costeLinea,
    r.mermaPct,
    r.costePorVenta,
  ]);
  return [header, ...body];
}

export function downloadEscandalloProductsExcel(
  products: CatalogItem[],
  storeIngredients: StoreIngredient[],
  brands?: Array<{ _id: string; deliveryLineKind?: string }>,
  stockItems?: CatalogItem[],
): { rows: number; filename: string } {
  const dataRows = buildEscandalloExportRows(products, storeIngredients, brands, stockItems);
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rowsToSheetMatrix(dataRows));
  ws['!cols'] = [
    { wch: 28 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
    { wch: 10 },
    { wch: 8 },
    { wch: 18 },
    { wch: 14 },
    { wch: 10 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws, ESCANDALLO_EXPORT_SHEET_NAME);

  const day = new Date().toISOString().slice(0, 10);
  const filename = `${ESCANDALLO_EXPORT_FILENAME_PREFIX}_${day}.xlsx`;
  XLSX.writeFile(wb, filename);
  return { rows: dataRows.length, filename };
}

/** Expuesto para tests: total de escandallo sin redondeos raros de UI. */
export function sumRecipeCostForProduct(
  product: CatalogItem,
  storeIngredients: StoreIngredient[],
  brands?: Array<{ _id: string; deliveryLineKind?: string }>,
  stockItems?: CatalogItem[],
): number {
  const ingredientsById = storeIngredientsById(storeIngredients);
  const lines = foodRecipeLines(readProductRecipeLines(product));
  return calculateRecipeTotalCost(
    lines.length > 0 ? lines : readProductRecipeLines(product),
    ingredientsById,
    brands,
    undefined,
    costOptionsFor(stockItems, readProductMermaPct(product)),
  );
}
