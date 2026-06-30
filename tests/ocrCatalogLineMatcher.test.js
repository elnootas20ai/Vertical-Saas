import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichOcrLinesWithCatalog,
  matchOcrLineToCatalog,
  scoreLineToCatalogItem,
  summarizeCatalogMatches,
} from '../services/ocrCatalogLineMatcher.js';

const catalog = [
  { _id: 'cat-mozzarella', name: 'Mozzarella fior di latte', sku: 'MOZ-01', supplierId: 'sup-1' },
  { _id: 'cat-tomate', name: 'Salsa tomate triturada', sku: 'TOM-5kg', supplierId: 'sup-1' },
  { _id: 'cat-bolsa', name: 'Bolsa delivery', sku: 'BOL-DEL', supplierId: 'sup-2' },
];

test('scoreLineToCatalogItem matches by sku', () => {
  const result = scoreLineToCatalogItem('Compra MOZ-01 caja', catalog[0]);
  assert.equal(result.method, 'sku');
  assert.ok(result.score >= 0.95);
});

test('matchOcrLineToCatalog links similar product names', () => {
  const match = matchOcrLineToCatalog(
    { description: 'Mozzarella fior di latte 2kg' },
    catalog,
    { supplierId: 'sup-1' },
  );
  assert.ok(match);
  assert.equal(match.catalogItemId, 'cat-mozzarella');
});

test('enrichOcrLinesWithCatalog adds catalogItemId', () => {
  const lines = enrichOcrLinesWithCatalog(
    [
      { description: 'Salsa tomate triturada', quantity: 2, unitPrice: 3.5, total: 7 },
      { description: 'Producto desconocido xyz', quantity: 1, unitPrice: 1, total: 1 },
    ],
    catalog,
    { supplierId: 'sup-1' },
  );
  assert.equal(lines.length, 2);
  assert.equal(lines[0].catalogItemId, 'cat-tomate');
  assert.equal(lines[1].catalogItemId, '');
  const summary = summarizeCatalogMatches(lines);
  assert.equal(summary.matchedLines, 1);
  assert.equal(summary.totalLines, 2);
});
