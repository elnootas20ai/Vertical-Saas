#!/usr/bin/env node
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const IDS = [
  'catitem-ad978a8e-7ee8-4599-98e4-32cf2e83b6ec', // Coca 2L
  'catitem-895dfa3b-40b0-438a-89c7-90ba95f2e77c', // Coca
  'catitem-3dd0f2f2-6381-4e0c-9d5a-a82697a92a70', // Fanta Naranja 2L
  'catitem-16ac976d-90a1-4dd1-bc22-56565c73ebe0', // Fanta Limon 2L
];

async function get(id) {
  const res = await fetch(`${COUCH}/bbddsaas-catalog/${encodeURIComponent(id)}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}

for (const id of IDS) {
  const d = await get(id);
  console.log(
    JSON.stringify(
      {
        id: d._id,
        name: d.name,
        category: d.category,
        brandId: d.brandId || d.brand_id || null,
        brandName: d.brandName || d.brand || null,
        price: d.unitPrice ?? d.price,
        active: d.active,
        deletedAt: d.deletedAt || null,
        isStockItem: d.isStockItem,
        itemType: d.itemType,
        visible: d.visible,
        tpvVisible: d.tpvVisible,
        hideInTpv: d.hideInTpv,
        showInTpv: d.showInTpv,
        available: d.available,
        salesPointIds: d.salesPointIds || d.sales_point_ids || null,
        workCenterId: d.workCenterId || d.work_center_id || null,
        tags: d.tags || null,
      },
      null,
      2,
    ),
  );
}
