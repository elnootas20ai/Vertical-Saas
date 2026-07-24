/**
 * Actualiza SOLO customFields.ingredients en catálogo Pau (DISARMINK)
 * según la carta foto. No borra, no mueve, no toca escandallo/costingRecipe.
 *
 * En VPS: node scripts/apply-pau-ingredients-from-menu.mjs
 *          node scripts/apply-pau-ingredients-from-menu.mjs --apply
 */
const APPLY = process.argv.includes('--apply');
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const couchUser = process.env.COUCHDB_USER || 'vertialadmin';
const couchPass = process.env.COUCHDB_PASSWORD;
if (!couchPass) {
  console.error('Falta COUCHDB_PASSWORD en el entorno');
  process.exit(1);
}
const AUTH = 'Basic ' + Buffer.from(`${couchUser}:${couchPass}`).toString('base64');
const BIZ = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const DB = 'bbddsaas-catalog';

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Carta foto → ingredientes completos */
const MENU = [
  { keys: ['individual'], catHint: 'combo', ingredientes: 'Pizza, Patatas, Refresco' },
  { keys: ['pizzeria', 'modomio'], catHint: 'combo', ingredientes: 'Pizza, 1 Complemento, Refresco, Helado/Tiramisu' },
  { keys: ['duo', 'dúo'], catHint: 'combo', ingredientes: '2 Pizzas, 1 Complemento, 2 Refrescos' },
  { keys: ['family'], catHint: 'combo', ingredientes: '3 Pizzas, 2 Complementos, 4 Refrescos' },

  { keys: ['napolitana'], ingredientes: 'Tomate, olivas, orégano' },
  { keys: ['margarita'], ingredientes: 'Tomate, mozzarella, bocconcino, albahaca' },

  { keys: ['pallesa'], ingredientes: 'Tomate, mozzarella, butifarra, cebolla caramelizada, queso brie, miel' },
  { keys: ['sanginaccio'], ingredientes: 'Tomate, mozzarella, morcilla, cebolla caramelizada, queso de cabra' },
  { keys: ['pera al gorgo'], ingredientes: 'Base blanca, mozzarella, gorgonzola, pera, cebolla caramelizada, nueces' },
  { keys: ['carbonara al guanciale'], ingredientes: 'Base blanca, mozzarella, guanciale, yema de huevo, queso pecorino, pimienta' },
  {
    keys: ['mortadella e pistacchio', 'pizza mortadella e pistacchio'],
    ingredientes: 'Base blanca, mozzarella, mortadella italiana, burrata, crema de pistacho, parmesano',
  },

  { keys: ['prosciutto', 'proscuitto'], ingredientes: 'Tomate, mozzarella, jamón york' },
  { keys: ['bacon'], catHint: 'pizza', ingredientes: 'Tomate, mozzarella, bacon' },
  { keys: ['ai due', 'dulce roquefort', 'al dulce roquefort'], ingredientes: 'Base blanca, mozzarella, roquefort, miel' },
  { keys: ['funghi'], ingredientes: 'Tomate, mozzarella, champiñones, nata' },
  { keys: ['carbonara'], catHint: 'exact-carbonara', ingredientes: 'Mozzarella, nata, bacon, huevo, cebolla' },
  { keys: ['al pesto'], ingredientes: 'Tomate, mozzarella, tomate deshidratado, búfala, pesto' },
  { keys: ['hawaiana'], ingredientes: 'Tomate, mozzarella, jamón york, piña' },
  { keys: ['4 quesos'], ingredientes: 'Tomate, mozzarella, queso de cabra, parmesano, roquefort' },
  { keys: ['iberica'], catHint: 'pizza', ingredientes: 'Tomate, mozzarella, queso brie, virutas de jamón ibérico' },
  { keys: ['bbq'], catHint: 'pizza', ingredientes: 'Mozzarella, carne picada, bacon, salsa BBQ' },
  { keys: ['mediterranea'], ingredientes: 'Tomate, mozzarella, anchoas, tomate deshidratado, olivas negras' },
  { keys: ['porcavacca'], ingredientes: 'Tomate, mozzarella, parmesano, jamón york, nata' },
  { keys: ['mallorquina'], ingredientes: 'Tomate, mozzarella, sobrasada, queso brie, miel' },
  { keys: ['calzone aperta', 'calzone abierta'], ingredientes: 'Tomate, mozzarella, jamón york, champiñones' },
  { keys: ['calzone cerrada'], ingredientes: 'Tomate, mozzarella, jamón york, champiñones' },
  { keys: ['pepperoni'], ingredientes: 'Tomate, mozzarella, champiñones, pepperoni' },
  { keys: ['vegetale'], ingredientes: 'Tomate, mozzarella, berenjena, cebolla, calabacín, olivas, pimiento rojo' },
  { keys: ['4 estaciones'], ingredientes: 'Tomate, mozzarella, jamón york, champiñones, alcachofas' },
  { keys: ['contadino'], ingredientes: 'Tomate, mozzarella, bacon, pollo, champiñones' },
  { keys: ['apreciena', 'apericina', 'apericena'], ingredientes: 'Tomate, mozzarella, atún, cebolla, olivas' },
  { keys: ['caprichosa'], ingredientes: 'Tomate, mozzarella, jamón york, champiñones, alcachofas, olivas' },
  // al gusto: no inventar toppings; dejar vacío o texto corto no-placeholder problemático
  { keys: ['pizza 3 ingredientes', 'modomio'], catHint: 'pizza-al-gusto', ingredientes: '' },
  {
    keys: ['vegana', 'la vegana'],
    catHint: 'pizza',
    ingredientes: 'Queso vegano, salsa de tomate natural, berenjena, tomate deshidratado, olivas negras, alcachofas',
  },
  { keys: ['berencabra'], ingredientes: 'Tomate, mozzarella, berenjena, queso de cabra, miel' },
  {
    keys: ['parmegiana'],
    ingredientes: 'Tomate, mozzarella, rúcula, queso parmesano, tomate deshidratado, aceite de oliva',
  },

  {
    keys: ['primavera premium', 'premium primavera'],
    ingredientes: 'Tomate, mozzarella, rúcula, tomate deshidratado, jamón ibérico, queso fresco',
  },
  {
    keys: ['marinera premium', 'premium marinera'],
    ingredientes: 'Tomate, mozzarella, gambas, ajo, perejil, atún, cebolla',
  },
  {
    keys: ['mamma mia premium', 'premium mamma mia'],
    ingredientes: 'Tomate, mozzarella, jamón york, frankfurt, nata, parmesano',
  },
  { keys: ['mitad y mitad', 'premium mitad y mitad'], ingredientes: '' },
  {
    keys: ['trufada premium', 'premium trufada'],
    ingredientes: 'Mozzarella, champiñones, salsa de trufa, parmesano',
  },
  { keys: ['modomio premium', 'premium modomio'], ingredientes: '' },
];

function bizId(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function catBlob(d) {
  return fold(`${d.category || ''} ${d.linea || ''} ${d.line || ''} ${d.name || ''}`);
}

function matchMenu(d) {
  const name = fold(d.name);
  const blob = catBlob(d);

  // no burgers/tacos
  if (/\bburger\b|\btaco\b/.test(blob) && !/pizza|calzone|especial|premium|combo/.test(blob)) {
    return null;
  }

  for (const m of MENU) {
    for (const k of m.keys) {
      const key = fold(k);
      const nameOk = name === key || name === `pizza ${key}` || name.replace(/^pizza /, '') === key;
      if (!nameOk) continue;

      if (m.catHint === 'combo') {
        if (!/combo|menu|menú/.test(blob) && name !== 'individual' && name !== 'family' && name !== 'duo' && name !== 'dúo' && name !== 'pizzeria') {
          // Modomio pizza vs combo
          if (key === 'modomio' && !/combo/.test(blob)) continue;
        }
        if (key === 'modomio' && /pizza/.test(fold(d.category)) && !/combo/.test(blob)) continue;
      }
      if (m.catHint === 'pizza' || m.catHint === 'pizza-al-gusto') {
        if (/burger/.test(blob)) continue;
      }
      if (m.catHint === 'exact-carbonara') {
        if (name.includes('guanciale')) continue;
        if (name !== 'carbonara' && name !== 'pizza carbonara') continue;
      }
      if (m.catHint === 'pizza-al-gusto') {
        // Pizza 3 ingredientes / Modomio pizza (no combo)
        if (key === 'modomio' && /combo/.test(blob)) continue;
        if (name === 'modomio' && /combo/.test(blob)) continue;
      }
      return m;
    }
  }
  return null;
}

async function allDocs() {
  const res = await fetch(`${COUCH}/${encodeURIComponent(DB)}/_all_docs?include_docs=true&limit=50000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

async function putDoc(doc) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(DB)}/${encodeURIComponent(doc._id)}`, {
    method: 'PUT',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.reason || data.error || res.statusText);
  return data;
}

async function main() {
  const docs = await allDocs();
  const items = docs.filter((d) => bizId(d) === BIZ && !d.deletedAt && d.name);
  console.log(`Pau DISARMINK docs: ${items.length} | modo=${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const changes = [];
  for (const d of items) {
    // no tocar "Receta …" ni stock
    if (/^receta\s/i.test(d.name)) continue;
    if (d.isStockItem === true) continue;
    if ((d.module || 'catalog') !== 'catalog') continue;

    const m = matchMenu(d);
    if (!m) continue;

    const prev = String(d.customFields?.ingredients || d.ingredients || '').trim();
    const next = String(m.ingredientes || '').trim();
    if (prev === next) continue;

    changes.push({
      id: d._id,
      name: d.name,
      category: d.category,
      prev: prev || '(vacío)',
      next: next || '(vacío / al gusto)',
      doc: d,
      ingredientes: next,
    });
  }

  console.log(`Cambios pendientes: ${changes.length}`);
  for (const c of changes) {
    console.log(`- ${c.name} [${c.category || ''}]`);
    console.log(`    ANTES: ${c.prev}`);
    console.log(`    AHORA: ${c.next}`);
  }

  if (!APPLY) {
    console.log('\nDry-run OK. Para aplicar: node scripts/apply-pau-ingredients-from-menu.mjs --apply');
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const c of changes) {
    try {
      const d = c.doc;
      const cf = { ...(d.customFields || {}) };
      cf.ingredients = c.ingredientes;
      // No tocar costingRecipe / storeIngredients
      const nextDoc = {
        ...d,
        customFields: cf,
        updatedAt: new Date().toISOString(),
      };
      // quitar campo ingredients suelto si existía inconsistente
      if ('ingredients' in nextDoc && typeof nextDoc.ingredients === 'string') {
        nextDoc.ingredients = c.ingredientes;
      }
      const saved = await putDoc(nextDoc);
      c.doc._rev = saved.rev;
      ok++;
    } catch (e) {
      fail++;
      console.error('FAIL', c.name, e.message || e);
    }
  }
  console.log(`\nAplicado: ${ok} | Fallos: ${fail}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
