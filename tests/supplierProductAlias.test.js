import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeSupplierProductAlias,
  normalizeSupplierProductKey,
  scoreSupplierAliasMatch,
} from '../shared/purchases/supplierProductAlias.js';
import {
  matchOcrLineToCatalog,
  scoreLineToCatalogItem,
} from '../services/ocrCatalogLineMatcher.js';

test('normalizeSupplierProductKey folds accents and punctuation', () => {
  assert.equal(
    normalizeSupplierProductKey('LECHUGA ICEBERG — bandeja 2u.'),
    'lechuga iceberg bandeja 2u',
  );
});

test('mergeSupplierProductAlias remembers Makro label per supplier', () => {
  const merged = mergeSupplierProductAlias([], {
    supplierId: 'sup-makro',
    label: 'LECHUGA ICEBERG BANDEJA 2U',
    sku: '8412345',
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].key, 'lechuga iceberg bandeja 2u');
  assert.equal(merged[0].sku, '8412345');
});

test('scoreSupplierAliasMatch links Makro text to Vertial item', () => {
  const item = {
    _id: 'cat-lechuga',
    name: 'Lechuga',
    supplierProductAliases: [
      {
        supplierId: 'sup-makro',
        key: 'lechuga iceberg bandeja 2u',
        label: 'LECHUGA ICEBERG BANDEJA 2U',
        sku: '8412345',
      },
    ],
  };
  const hit = scoreSupplierAliasMatch(
    'LECHUGA ICEBERG BANDEJA 2U',
    '',
    item,
    'sup-makro',
  );
  assert.ok(hit);
  assert.equal(hit.method, 'supplier_alias');
  assert.equal(hit.score, 1);
});

test('matchOcrLineToCatalog prefers remembered alias over fuzzy name', () => {
  const catalog = [
    {
      _id: 'cat-lechuga',
      name: 'Lechuga',
      sku: 'LEC-01',
      supplierId: 'sup-makro',
      supplierProductAliases: [
        {
          supplierId: 'sup-makro',
          key: 'lechuga iceberg bandeja 2u',
          label: 'LECHUGA ICEBERG BANDEJA 2U',
        },
      ],
    },
    { _id: 'cat-other', name: 'Tomate', sku: 'TOM-01', supplierId: 'sup-makro' },
  ];
  const match = matchOcrLineToCatalog(
    { description: 'LECHUGA ICEBERG BANDEJA 2U' },
    catalog,
    { supplierId: 'sup-makro' },
  );
  assert.ok(match);
  assert.equal(match.catalogItemId, 'cat-lechuga');
  assert.equal(match.matchMethod, 'supplier_alias');
});

test('scoreLineToCatalogItem without alias still matches by name', () => {
  const result = scoreLineToCatalogItem('Salsa tomate triturada', {
    name: 'Salsa tomate triturada',
    sku: 'TOM-5kg',
  });
  assert.ok(result.score >= 0.9);
});
