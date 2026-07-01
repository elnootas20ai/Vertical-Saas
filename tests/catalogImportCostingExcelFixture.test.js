import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyVertialAutoCostingBatch,
  ensureVertialEscandalloBaseStoreIngredients,
  inferImportCostingLineKind,
} from '../src/app/lib/catalogImportCosting.ts';
import {
  applyCatalogImportIngredientEntries,
  collectIngredientEntriesFromCatalogImport,
  normalizeImportCategory,
  resolveCatalogImportBrandIds,
  resolveCommercialLineIdsFromText,
} from '../src/app/lib/deliveryCatalogImportLogic.ts';
import { productCostingStatus, readProductRecipeLines } from '../src/app/lib/catalogCosting.ts';
import { parseIngredientsBulkText } from '../src/app/lib/catalogCustomization.ts';

/** Filas reales del Excel catalogo_pizzeria_burger_completo_corregido-3.xlsx */
const EXCEL_FIXTURE_ROWS = [
  { nombre: 'Napolitana', categoria: 'Pizza', linea: 'Modomio', precio: 9.5, ingredientes: 'Tomate, aceitunas, orégano' },
  { nombre: 'Pallesa', categoria: 'Especialidad', linea: 'Modomio', precio: 14.5, ingredientes: 'Tomate, mozzarella, búfala, cebolla caramelizada, nueces, miel' },
  { nombre: 'Cheese Burger', categoria: 'Burger', linea: 'Blackburger', precio: 8.5, ingredientes: 'Ternera, cheddar, pepinillo' },
  { nombre: 'Black Truffle', categoria: 'Top Burger', linea: 'Blackburger', precio: 12.5, ingredientes: 'Smash, cheddar, bacon, trufa' },
  { nombre: 'Patatas Deluxe', categoria: 'Sides', linea: '', precio: 4.5, ingredientes: 'Patatas' },
];

const brands = [
  {
    _id: 'mod',
    name: 'Modomio',
    active: true,
    deliveryLineKind: 'pizza',
    catalogCategories: ['Pizzas', 'Combos', 'Especialidad', 'Calzone', 'Premium'],
  },
  {
    _id: 'bb',
    name: 'Blackburger',
    active: true,
    deliveryLineKind: 'burger_fastfood',
    catalogCategories: ['Burgers', 'Top Burger', 'Sides'],
  },
];

function mapExcelRow(row) {
  const category = normalizeImportCategory(row.categoria);
  const lineText = String(row.linea || '').trim();
  const explicitBrandIds = lineText ? resolveCommercialLineIdsFromText(lineText, brands).brandIds : [];
  const brandIds = resolveCatalogImportBrandIds(explicitBrandIds, category, brands, row.nombre);
  const ingredientsRaw = String(row.ingredientes || '').trim();
  const parsed = ingredientsRaw ? parseIngredientsBulkText(ingredientsRaw) : [];
  return {
    _id: `test-${row.nombre.replace(/\s+/g, '-').toLowerCase()}`,
    name: row.nombre,
    category,
    brandIds,
    unitPrice: Number(row.precio) || 0,
    costPrice: 0,
    itemType: 'product',
    module: 'catalog',
    customFields: parsed.length > 0 ? { ingredients: parsed.join(', ') } : {},
  };
}

test('excel fixture pizzeria+burger: import pipeline builds escandallo with ingredients', () => {
  const items = EXCEL_FIXTURE_ROWS.map(mapExcelRow);

  for (const item of items) {
    assert.ok(String(item.customFields?.ingredients || '').trim(), `${item.name} debe tener ingredientes`);
  }

  const entries = collectIngredientEntriesFromCatalogImport(items, brands);
  assert.ok(entries.length > 0, 'debe extraer ingredientes del Excel');

  const { merged } = applyCatalogImportIngredientEntries([], entries);
  const { items: storeIngredients } = ensureVertialEscandalloBaseStoreIngredients(merged, brands);

  const results = applyVertialAutoCostingBatch(items, items, storeIngredients, brands, {
    upgradeAutoFixedFood: true,
  });

  const pizza = items.find((i) => i.name === 'Napolitana');
  const burger = items.find((i) => i.name === 'Cheese Burger');
  const pizzaResult = results.find((r) => r.item._id === pizza._id);
  const burgerResult = results.find((r) => r.item._id === burger._id);

  assert.equal(pizzaResult?.mode, 'recipe', 'Napolitana debe tener escandallo');
  assert.equal(burgerResult?.mode, 'recipe', 'Cheese Burger debe tener escandallo');
  assert.ok(readProductRecipeLines(pizzaResult.item).length >= 2);
  assert.ok(readProductRecipeLines(burgerResult.item).length >= 2);
  assert.equal(productCostingStatus(pizzaResult.item), 'recipe');
  assert.equal(productCostingStatus(burgerResult.item), 'recipe');
});

test('excel fixture infers pizza/burger line kinds from real categories', () => {
  const items = EXCEL_FIXTURE_ROWS.map(mapExcelRow);
  const nap = items.find((i) => i.name === 'Napolitana');
  const cheese = items.find((i) => i.name === 'Cheese Burger');

  assert.equal(inferImportCostingLineKind(nap, brands), 'pizza');
  assert.equal(inferImportCostingLineKind(cheese, brands), 'burger_fastfood');
  assert.equal(cheese.brandIds[0], 'bb');
  assert.equal(nap.brandIds[0], 'mod');
});
