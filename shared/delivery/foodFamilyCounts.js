/**
 * Recuento pizzas / burgers / tacos desde líneas de pedido.
 * Misma lógica que src/app/lib/shiftFoodFamilyCounts.ts (para backend Node).
 */

export function emptyFoodFamilyCounts() {
  return { pizza: 0, burger: 0, taco: 0 };
}

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function isHalfHalfFoodLabel(category, name) {
  const blob = `${fold(category || '')} ${fold(name || '')}`.trim();
  return /mitad\s*y\s*mitad|half\s*(and|&|-)?\s*half|halfhalf/.test(blob);
}

export function classifyFoodFamily(category, name) {
  const cat = fold(category || '');
  const nm = fold(name || '');
  if (/taco/.test(cat) || /\btacos?\b/.test(nm)) return 'taco';
  if (/burger|hamburg|smash/.test(cat) || /burger|hamburg|smash/.test(nm)) return 'burger';
  if (/postre|dessert|helado|tiramisu/.test(cat)) return null;
  if (/nutella/.test(nm) && /pizza/.test(nm)) return null;
  if (
    /pizza|calzone|premium|especialidad/.test(cat)
    || /pizza|calzone/.test(nm)
    || isHalfHalfFoodLabel(category, name)
  ) {
    return 'pizza';
  }
  return null;
}

export function pizzaUnitsFromProductLabel(category, name) {
  const blob = `${fold(category || '')} ${fold(name || '')}`.trim();
  if (!blob) return null;
  if (/\bfamiliar\b|\bfamily\b/.test(blob)) return 3;
  if (/\bduos?\b/.test(blob)) return 2;
  if (/combo\s*modomm?io|modomm?io\s*combo/.test(blob)) return 1;
  if (/\bindividual(es)?\b|\bestandar\b/.test(blob)) return 1;
  return null;
}

export function parseComboExtraLine(raw) {
  let s = String(raw || '').trim();
  if (!s.startsWith('▸') && !s.startsWith('>')) return null;
  s = s.replace(/^[▸>]\s*/, '').trim();
  if (!s) return null;
  const m = s.match(/^(.*?)\s*[×x]\s*(\d+)\s*$/i);
  if (m) {
    const name = m[1].trim();
    if (!name) return null;
    return { name, units: Math.max(1, Number(m[2]) || 1) };
  }
  return { name: s, units: 1 };
}

function isLikelyNonMainComboExtra(name) {
  const n = fold(name);
  return /bebida|refresco|agua|coca|fanta|sprite|cerveza|vino|cafe|te\b|patata|frita|complemento|acompan|postre|helado|tiramisu|nugget|alita|ensalada|salad|dip|salsa|brownie|cookie|batido|smoothie|zumo|nestea|aquarius|red.?bull|monster|maiz|pan\b|aros|tequeno|salchipapa|chicken\s*balls?/.test(
    n,
  );
}

function looksLikeMenuProduct(category, name) {
  const blob = fold(`${category || ''} ${name || ''}`);
  return /menu|combo|menus|combos|individual|duo|familiar|family|estandar/.test(blob);
}

function addCounts(target, key, qty) {
  if (qty <= 0) return;
  target[key] += qty;
}

function countItem(item) {
  const out = emptyFoodFamilyCounts();
  const qty = Number(item.quantity || 0);
  if (qty <= 0) return out;

  const family = classifyFoodFamily(item.category, item.name);
  const sizeUnits = pizzaUnitsFromProductLabel(item.category, item.name);
  const extras = Array.isArray(item.extras) ? item.extras : [];
  const comboParts = extras.map((raw) => parseComboExtraLine(raw)).filter(Boolean);

  if (isHalfHalfFoodLabel(item.category, item.name)) {
    addCounts(out, 'pizza', qty);
    return out;
  }

  if (comboParts.length > 0) {
    const pizzaMenu =
      sizeUnits != null
      || family === 'pizza'
      || (looksLikeMenuProduct(item.category, item.name) && family !== 'burger');
    const burgerMenu = family === 'burger';

    for (const part of comboParts) {
      if (isLikelyNonMainComboExtra(part.name)) continue;
      const partFamily = classifyFoodFamily('', part.name);
      if (partFamily === 'taco') {
        addCounts(out, 'taco', part.units * qty);
        continue;
      }
      if (partFamily === 'burger') {
        addCounts(out, 'burger', part.units * qty);
        continue;
      }
      if (partFamily === 'pizza') {
        addCounts(out, 'pizza', part.units * qty);
        continue;
      }
      if (burgerMenu) addCounts(out, 'burger', part.units * qty);
      else if (pizzaMenu) addCounts(out, 'pizza', part.units * qty);
    }

    if (
      out.pizza === 0
      && out.burger === 0
      && sizeUnits != null
      && family !== 'burger'
      && family !== 'taco'
    ) {
      addCounts(out, 'pizza', sizeUnits * qty);
    }
    return out;
  }

  if (sizeUnits != null && family !== 'burger' && family !== 'taco') {
    addCounts(out, 'pizza', qty * sizeUnits);
    return out;
  }
  if (family) addCounts(out, family, qty);
  return out;
}

/** Suma unidades pizza/burger/taco de una lista de pedidos. */
export function buildFoodFamilyCountsFromOrders(orders) {
  const total = emptyFoodFamilyCounts();
  for (const order of orders || []) {
    const status = String(order.status || '').toLowerCase();
    if (status === 'cancelled' || status === 'cancelado') continue;
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const line = countItem(item);
      total.pizza += line.pizza;
      total.burger += line.burger;
      total.taco += line.taco;
    }
  }
  return total;
}
