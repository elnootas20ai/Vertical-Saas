/**
 * Lista combos Modomio (solo lectura).
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const MODOMIO_BIZ = '33821959-ae50-4e52-bfea-ea2b145faeac';

async function main() {
  const res = await fetch(`${COUCH}/bbddsaas-catalog/_all_docs?include_docs=true&limit=50000`, {
    headers: { Authorization: AUTH },
  });
  const docs = ((await res.json()).rows || []).map((r) => r.doc).filter(Boolean);
  const items = docs.filter((d) => {
    if (d.deletedAt) return false;
    const bid = String(d.business_id || d.businessId || '').replace(/^business:/, '').trim();
    if (bid !== MODOMIO_BIZ) return false;
    const cat = String(d.category || '').toLowerCase();
    return (
      d.itemType === 'combo' ||
      /combo|menu|menú/.test(cat) ||
      /combo|menu|pizzer/i.test(String(d.name || ''))
    );
  });
  for (const i of items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'))) {
    console.log(
      JSON.stringify({
        name: i.name,
        category: i.category,
        itemType: i.itemType,
        structure: i.customFields?.comboStructure?.length || 0,
        confirmed: i.customFields?.comboStructureConfirmed,
        _id: i._id,
      }),
    );
  }
  console.log('total', items.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
