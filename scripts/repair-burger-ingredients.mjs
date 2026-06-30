const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const USER = '4e1a9f0b-7687-47f7-a366-9c5c766398ea';

const DEFAULT_BURGER = 'Pan brioche, Carne, Queso cheddar, Lechuga, Tomate, Salsa';
const DEFAULT_CHICKEN = 'Pan brioche, Pollo crujiente, Lechuga, Tomate, Salsa';
const DEFAULT_VEGAN = 'Beyond, Queso vegano, Pan, Lechuga, Tomate';
const DEFAULT_IBERICA = 'Pan brioche, Carne, Queso manchego, Jamón ibérico, Lechuga, Tomate';

const BY_NAME = {
  'doble vegan': 'Beyond, Queso vegano',
  'top vegan': 'Beyond, Queso vegano',
  'vegana': DEFAULT_VEGAN,
  'doble black': 'Doble carne, Queso cheddar, Pan, Lechuga, Tomate, Salsa',
  'doble pollo': 'Doble pollo, Queso, Pan, Lechuga, Tomate, Salsa',
  'cheese burger': DEFAULT_BURGER,
  'simple': 'Pan brioche, Carne, Lechuga, Tomate',
  'goodsex burger': DEFAULT_BURGER,
  'crispy chicken': DEFAULT_CHICKEN,
  'black bbq': 'Pan brioche, Carne, Queso cheddar, Bacon, Salsa BBQ, Lechuga',
  'americana': 'Pan brioche, Carne, Queso cheddar, Bacon, Huevo, Lechuga, Tomate',
  'bacon cheeseburger': 'Pan brioche, Carne, Queso cheddar, Bacon, Lechuga, Tomate',
  'black truffle': 'Pan brioche, Carne, Queso, Trufa, Lechuga, Tomate',
  'ibérica': DEFAULT_IBERICA,
  'pulledpork burger': 'Pan brioche, Pulled pork, Coleslaw, Salsa BBQ, Lechuga',
  'típica': DEFAULT_BURGER,
  'tipica': DEFAULT_BURGER,
  'pear & cheese': 'Pan brioche, Carne, Queso, Pera, Lechuga',
  'burger clásica': 'Pan brioche, Carne, Queso cheddar, Lechuga, Tomate',
  'burger doble': 'Pan brioche, Doble carne, Queso cheddar, Lechuga',
  'burger crispy': 'Pan brioche, Pollo crujiente, Lechuga, Mayonesa',
  'burger bbq': 'Pan brioche, Carne, Queso cheddar, Bacon, Salsa BBQ',
};

function isPlaceholder(text) {
  const t = String(text || '').trim().toLowerCase();
  return !t || t === 'ver carta' || t === 'ver menú' || t === 'ver menu';
}

async function main() {
  const APPLY = process.argv.includes('--apply');
  const res = await fetch(`${COUCH}/bbddsaas-catalog/_all_docs?include_docs=true&limit=50000`, {
    headers: { Authorization: AUTH },
  });
  const docs = ((await res.json()).rows || []).map((r) => r.doc).filter(Boolean);
  const targets = docs.filter(
    (d) =>
      d.type === 'catalog_item' &&
      String(d.user_id || '') === USER &&
      /burger/i.test(d.category || '') &&
      isPlaceholder(d.customFields?.ingredients),
  );

  console.log(`\n${targets.length} burger(s) sin ingredientes reales\n`);
  for (const doc of targets) {
    const key = String(doc.name || '').trim().toLowerCase();
    const next = BY_NAME[key] || DEFAULT_BURGER;
    console.log(`• ${doc.name} → ${next}`);
    if (!APPLY) continue;
    const patch = {
      ...doc,
      deletedAt: null,
      active: true,
      customFields: { ...(doc.customFields || {}), ingredients: next },
      updatedAt: new Date().toISOString(),
    };
    const put = await fetch(`${COUCH}/bbddsaas-catalog/${encodeURIComponent(doc._id)}`, {
      method: 'PUT',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    console.log(put.ok ? '  OK' : '  FAIL');
  }
  console.log(APPLY ? '\nHecho.\n' : '\nSimulación (--apply para guardar)\n');
}

main();
