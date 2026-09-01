/**
 * Añade 3 subrecetas al mock testlocal y las aplica a pizzas. Prueba el flujo.
 *   node scripts/qa-testlocal-subrecipes.mjs
 */
import '../config/env.js';

function foldName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function computeFabricationConsumptions(recipeLines, producedQty, stockItems) {
  const qty = Number(producedQty);
  if (!(qty > 0) || !Array.isArray(recipeLines)) return { lines: [], missingNames: [] };
  const byIngId = new Map();
  const byName = new Map();
  for (const item of stockItems) {
    if (!item || item.deletedAt || item.active === false) continue;
    const sid = String(item.customFields?.storeIngredientId || '').trim();
    if (sid) byIngId.set(sid, item);
    const key = foldName(item.name);
    if (key && !byName.has(key)) byName.set(key, item);
  }
  const lines = [];
  const missingNames = [];
  for (const line of recipeLines) {
    const perUnit = Number(line.quantity);
    if (!(perUnit > 0)) continue;
    const need = Math.round(perUnit * qty * 1000) / 1000;
    const catalog =
      byIngId.get(String(line.storeIngredientId || '').trim()) || byName.get(foldName(line.name)) || null;
    if (!catalog) {
      missingNames.push(line.name);
      lines.push({
        storeIngredientId: line.storeIngredientId,
        name: line.name,
        quantity: need,
        unit: line.unit || 'ud',
      });
      continue;
    }
    lines.push({
      storeIngredientId: line.storeIngredientId,
      name: line.name,
      quantity: need,
      unit: line.unit || catalog.unit || 'ud',
      catalogItemId: catalog._id,
    });
  }
  return { lines, missingNames };
}

const API = 'http://127.0.0.1:3001';

function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

function lineCost(qty, unit, baseCost, ingUnit) {
  let q = qty;
  if (unit === 'g' && (ingUnit === 'kg' || !ingUnit)) q = qty / 1000;
  if (unit === 'ml' && (ingUnit === 'l' || !ingUnit)) q = qty / 1000;
  if (unit === 'g' && ingUnit === 'g') q = qty;
  if (unit === 'ml' && ingUnit === 'ml') q = qty;
  // convert line qty into ingredient cost unit
  const from = String(unit || 'ud');
  const to = String(ingUnit || 'ud');
  if (from === to) q = qty;
  else if (from === 'g' && to === 'kg') q = qty / 1000;
  else if (from === 'kg' && to === 'g') q = qty * 1000;
  else if (from === 'ml' && to === 'l') q = qty / 1000;
  else if (from === 'l' && to === 'ml') q = qty * 1000;
  else q = qty;
  return money(q * (Number(baseCost) || 0));
}

function readRecipe(item) {
  const raw = item?.customFields?.costingRecipe;
  if (!Array.isArray(raw)) return [];
  return raw.filter((l) => l && l.name && Number(l.quantity) > 0);
}

function calcCost(lines, byId, mermaPct = 0) {
  let total = 0;
  for (const line of lines) {
    const ing = byId.get(String(line.storeIngredientId || ''));
    if (!ing) continue;
    total += lineCost(line.quantity, line.unit || 'ud', ing.baseCost, ing.unit);
  }
  total = money(total);
  if (mermaPct > 0) total = money(total * (1 + mermaPct / 100));
  return total;
}

async function main() {
  const login = await (
    await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'testlocal@delivery.com', password: 'TestLocal2026!' }),
    })
  ).json();
  if (!login.ok) throw new Error(`login: ${JSON.stringify(login)}`);
  const uid = login.user.user_id;
  const token = login.accessToken;
  const h = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const biz = await (await fetch(`${API}/api/businesses/user/${uid}`, { headers: h })).json();
  const bid = (biz.businesses || [])[0]?.business_id;

  async function get(path) {
    const r = await fetch(`${API}${path}`, { headers: h });
    return { status: r.status, ...(await r.json()) };
  }
  async function put(path, body) {
    const r = await fetch(`${API}${path}`, { method: 'PUT', headers: h, body: JSON.stringify(body) });
    return { status: r.status, ...(await r.json()) };
  }
  async function post(path, body) {
    const r = await fetch(`${API}${path}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    return { status: r.status, ...(await r.json()) };
  }

  const cfg = await get(`/api/delivery/config/${uid}`);
  let ings = [...(cfg.config?.storeIngredients || [])];
  const byName = (n) => ings.find((i) => String(i.name).toLowerCase() === n.toLowerCase());

  function ensureBase(id, name, unit, baseCost) {
    let ing = ings.find((i) => i.id === id) || byName(name);
    if (ing) return ing;
    ing = {
      id,
      name,
      unit,
      baseCost,
      role: 'escandallo',
      escandalloOnly: true,
      tpvChargeExtra: false,
      tpvAllowRemove: false,
      brandIds: [],
    };
    ings.push(ing);
    return ing;
  }

  const harina = ensureBase('ing-testlocal-harina', 'Harina', 'kg', 0.85);
  const agua = ensureBase('ing-testlocal-agua-fab', 'Agua fab.', 'l', 0);
  const aceite = ensureBase('ing-testlocal-aceite', 'Aceite oliva', 'l', 6.5);
  const tomate = byName('Tomate');
  const salsa = byName('Salsa tomate');
  const mozza = byName('Mozzarella');
  const bacon = byName('Bacon');
  if (!tomate || !salsa || !mozza || !bacon) throw new Error('faltan bases mock');

  function makeSub({ id, name, usageQtyG, composition }) {
    let batchCost = 0;
    const recipeLines = composition.map((c) => {
      batchCost += lineCost(c.qty, c.unit, c.ing.baseCost, c.ing.unit);
      return {
        storeIngredientId: c.ing.id,
        name: c.ing.name,
        quantity: c.qty,
        unit: c.unit,
      };
    });
    batchCost = money(batchCost);
    const usageKg = money(usageQtyG / 1000);
    // €/kg (2 decimales): evita baseCost 0 €/g por redondeo
    const perKg = usageKg > 0 ? money(batchCost / usageKg) : 0;
    return {
      id,
      name,
      unit: 'kg',
      baseCost: perKg,
      usageQtyPerUnit: usageQtyG,
      usageUnit: 'g',
      recipeLines,
      role: 'escandallo',
      escandalloOnly: true,
      tpvChargeExtra: false,
      tpvAllowRemove: false,
      brandIds: [],
    };
  }

  ings = ings.filter((i) => !String(i.id).startsWith('ing-testlocal-sub-'));

  const subMasa = makeSub({
    id: 'ing-testlocal-sub-masa',
    name: 'Masa elaborada',
    usageQtyG: 250,
    composition: [
      { ing: harina, qty: 160, unit: 'g' },
      { ing: agua, qty: 90, unit: 'ml' },
      { ing: aceite, qty: 5, unit: 'ml' },
    ],
  });
  const subSalsa = makeSub({
    id: 'ing-testlocal-sub-salsa',
    name: 'Salsa pizza elab.',
    usageQtyG: 80,
    composition: [
      { ing: tomate, qty: 60, unit: 'g' },
      { ing: salsa, qty: 20, unit: 'g' },
    ],
  });
  const subMix = makeSub({
    id: 'ing-testlocal-sub-mix',
    name: 'Mix mozzarella elab.',
    usageQtyG: 120,
    composition: [{ ing: mozza, qty: 120, unit: 'g' }],
  });
  ings.push(subMasa, subSalsa, subMix);

  const saveCfg = await put(`/api/delivery/config/${uid}`, {
    config: {
      ...cfg.config,
      storeIngredients: ings,
    },
  });
  if (!saveCfg.ok) throw new Error(`config: ${JSON.stringify(saveCfg)}`);

  console.log('SUBRECETAS');
  for (const s of [subMasa, subSalsa, subMix]) {
    console.log(
      ` - ${s.name}: venta ${s.usageQtyPerUnit}${s.usageUnit} · baseCost ${s.baseCost} €/${s.unit} · ${s.recipeLines.map((l) => `${l.name} ${l.quantity}${l.unit}`).join(' + ')}`,
    );
  }

  const cat = await get(`/api/delivery/catalog/${uid}?businessId=${bid}`);
  const pizzas = (cat.items || []).filter((p) => p.module !== 'stock' && /pizza/i.test(p.name));
  const byId = new Map(ings.map((i) => [i.id, i]));
  const baseIdsToStrip = new Set(
    [byName('Masa pizza')?.id, salsa.id, mozza.id, tomate.id].filter(Boolean),
  );

  console.log('\nAPLICAR A PIZZAS');
  for (const pizza of pizzas) {
    const prev = readRecipe(pizza);
    const kept = prev.filter((l) => {
      const id = String(l.storeIngredientId || '');
      if (baseIdsToStrip.has(id)) return false;
      if (id.startsWith('ing-testlocal-sub-')) return false;
      return true;
    });
    const incoming = [
      {
        storeIngredientId: subMasa.id,
        name: subMasa.name,
        quantity: subMasa.usageQtyPerUnit,
        unit: subMasa.usageUnit,
        stockCategory: 'ingredient',
      },
      {
        storeIngredientId: subSalsa.id,
        name: subSalsa.name,
        quantity: subSalsa.usageQtyPerUnit,
        unit: subSalsa.usageUnit,
        stockCategory: 'ingredient',
      },
      {
        storeIngredientId: subMix.id,
        name: subMix.name,
        quantity: subMix.usageQtyPerUnit,
        unit: subMix.usageUnit,
        stockCategory: 'ingredient',
      },
    ];
    const merged = [...kept];
    for (const line of incoming) {
      const i = merged.findIndex((x) => x.storeIngredientId === line.storeIngredientId);
      if (i >= 0) merged[i] = line;
      else merged.push(line);
    }
    const merma = Number(pizza.customFields?.mermaPct) || 0;
    const costPrice = calcCost(merged, byId, merma);
    const patched = {
      ...pizza,
      costPrice,
      customFields: {
        ...(pizza.customFields || {}),
        costingType: 'recipe',
        costingRecipe: merged,
        ...(merma > 0 ? { mermaPct: merma } : {}),
      },
    };

    let upd = await put(`/api/delivery/catalog/${uid}/${encodeURIComponent(pizza._id)}`, {
      item: patched,
    });
    if (!upd.ok) {
      upd = await put(`/api/delivery/catalog/${uid}/${encodeURIComponent(pizza._id)}`, patched);
    }
    console.log({
      name: pizza.name,
      ok: Boolean(upd.ok),
      err: upd.error,
      costAntes: pizza.costPrice,
      costAhora: costPrice,
      lines: merged.map((l) => `${l.name} ${l.quantity}${l.unit}`),
    });
  }

  for (const base of [harina, agua, aceite, subMasa, subSalsa, subMix]) {
    const existing = (cat.items || []).find(
      (i) => String(i.customFields?.storeIngredientId || '') === base.id,
    );
    if (existing) continue;
    const created = await post(`/api/delivery/catalog/${uid}`, {
      item: {
        name: base.name,
        module: 'stock',
        itemType: 'product',
        unit: base.unit,
        costPrice: base.baseCost,
        lastPurchasePrice: base.baseCost,
        stockQuantity: String(base.id).startsWith('ing-testlocal-sub-') ? 5000 : 50,
        stockCategory: 'ingredient',
        isStockItem: true,
        business_id: bid,
        active: true,
        customFields: { storeIngredientId: base.id },
      },
    });
    console.log('STOCK', base.name, created.ok ? 'ok' : created.error || created.status);
  }

  const cat2 = await get(`/api/delivery/catalog/${uid}?businessId=${bid}`);
  const cfg2 = await get(`/api/delivery/config/${uid}`);
  const map2 = new Map((cfg2.config?.storeIngredients || []).map((i) => [i.id, i]));
  const stock = (cat2.items || []).filter((i) => i.module === 'stock' || i.isStockItem);

  console.log('\nVERIFICACIÓN ESCANDALLO');
  const report = [];
  for (const pizza of (cat2.items || []).filter((p) => p.module !== 'stock' && /pizza/i.test(p.name))) {
    const lines = readRecipe(pizza);
    const cost = calcCost(lines, map2, Number(pizza.customFields?.mermaPct) || 0);
    const subs = lines.filter((l) => String(l.storeIngredientId || '').startsWith('ing-testlocal-sub-'));
    const zero = lines.filter((l) => !(Number(map2.get(l.storeIngredientId)?.baseCost) > 0));
    const row = {
      name: pizza.name,
      storedCost: pizza.costPrice,
      recomputed: cost,
      match: money(pizza.costPrice) === money(cost),
      subLines: subs.length,
      zeroCost: zero.map((l) => l.name),
      lines: lines.map((l) => `${l.name} ${l.quantity}${l.unit}`),
    };
    report.push(row);
    console.log(row);
  }

  const fab = computeFabricationConsumptions(subMasa.recipeLines, 10, stock);
  console.log('\nFABRICACIÓN 10× Masa elaborada');
  console.log(
    fab.lines.map((l) => `${l.name}: ${l.quantity}${l.unit}${l.catalogItemId ? ' ✓stock' : ' ✗sin stock'}`),
  );
  console.log('missingNames', fab.missingNames);

  const { resolveVirtualRecipeFromCatalogCosting } = await import('../services/recipeCostingFallback.js');
  console.log('\nDEDUCCIÓN VENTA (recipe fallback)');
  let saleOk = true;
  for (const pizza of (cat2.items || []).filter((p) => p.module !== 'stock' && /pizza/i.test(p.name))) {
    try {
      const recipe = await resolveVirtualRecipeFromCatalogCosting({ headers: {} }, uid, pizza._id, stock);
      const ingsR = recipe?.ingredients || [];
      if (!recipe || ingsR.length < 3) saleOk = false;
      console.log(pizza.name, {
        hasRecipe: Boolean(recipe),
        count: ingsR.length,
        ingredients: ingsR.map((i) => `${i.catalogItemName || i.name}×${i.quantity}${i.unit || ''}`),
      });
    } catch (e) {
      saleOk = false;
      console.log(pizza.name, 'ERR', e.message);
    }
  }

  const allOk =
    report.length >= 2 &&
    report.every((r) => r.match && r.subLines >= 3) &&
    fab.missingNames.length === 0 &&
    saleOk;

  console.log('\n=== VEREDICTO ===');
  if (allOk) {
    console.log('OK: subrecetas en pizzas, coste escandallo cuadra, fabricación y deducción venta OK.');
  } else {
    console.log('REVISAR: fallos en coste / sublíneas / fabricación / deducción.');
  }
  const zeroIssue = report.some((r) => r.zeroCost.length > 0);
  if (zeroIssue) {
    console.log('AVISO: alguna subreceta quedó con baseCost 0 (revisar unidad €/kg).');
  }
  console.log('UI: Ingredientes → pestaña Subrecetas · Escandallo → pizzas.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
