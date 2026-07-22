/**
 * Verifica combo Individual DISARMINK (estructura + allowlist patatas + pizzas).
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const ID = 'catitem-5a97e7da-8caf-484a-b821-f2d515f32119';

const res = await fetch(`${COUCH}/bbddsaas-catalog/${encodeURIComponent(ID)}`, {
  headers: { Authorization: AUTH, Accept: 'application/json' },
});
const d = await res.json();
if (!res.ok) {
  console.error(d);
  process.exit(1);
}

const allow = d.customFields?.comboSlotAllowlists || null;
console.log(
  JSON.stringify(
    {
      _id: d._id,
      name: d.name,
      itemType: d.itemType,
      active: d.active,
      isStockItem: d.isStockItem,
      unitPrice: d.unitPrice,
      brandIds: d.brandIds,
      comboStructure: d.customFields?.comboStructure,
      comboStructureConfirmed: d.customFields?.comboStructureConfirmed,
      comboSlotAllowlists: allow,
      comboItems: d.comboItems || [],
    },
    null,
    2,
  ),
);
