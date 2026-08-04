/**
 * Solo lectura: pedidos Tiana 2026-07-28 (salesPointId) + split marcas.
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const TIANA_PDV = 'pdv-934ce697-314d-46e5-bc9b-e0a2afee3bf7';
const SESSION_ID = 'tpvreg-b48a8cf0-2982-44a5-a3aa-259177d2d2e3';

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true&limit=120000`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function fold(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function madridDayKey(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function isHalfHalf(category, name) {
  const blob = `${fold(category)} ${fold(name)}`.trim();
  return /mitad\s*y\s*mitad|half\s*(and|&|-)?\s*half|halfhalf/.test(blob);
}

function pizzaUnitsFromLabel(category, name) {
  const blob = `${fold(category)} ${fold(name)}`.trim();
  if (!blob) return null;
  if (/\bfamiliar\b|\bfamily\b/.test(blob)) return 3;
  if (/\bduos?\b/.test(blob)) return 2;
  if (/combo\s*modomm?io|modomm?io\s*combo/.test(blob)) return 1;
  if (/\bindividual(es)?\b|\bestandar\b/.test(blob)) return 1;
  return null;
}

function parseComboExtra(raw) {
  let s = String(raw || '').trim();
  if (!s.startsWith('▸') && !s.startsWith('>')) return null;
  s = s.replace(/^[▸>]\s*/, '').trim();
  if (!s) return null;
  const m = s.match(/^(.*?)\s*[×x]\s*(\d+)\s*$/i);
  if (m) return { name: m[1].trim(), units: Math.max(1, Number(m[2]) || 1) };
  return { name: s, units: 1 };
}

function isSideOrDrink(name) {
  return /bebida|refresco|agua|coca|fanta|sprite|cerveza|vino|cafe|te\b|patata|frita|complemento|acompan|postre|helado|tiramisu|nugget|alita|ensalada|dip|salsa|brownie|cookie|batido|zumo|nestea|aquarius|tequeno|salchipapa|chicken\s*balls?/.test(
    fold(name),
  );
}

function classifyLine(item) {
  const qty = Math.max(1, Number(item.quantity) || 1);
  const cat = fold(item.category);
  const nm = fold(item.name);
  const lineTotal = Number(item.total ?? item.lineTotal ?? item.totalPrice);
  const unit = Number(item.unitPrice ?? item.price ?? 0);
  const amount = Number.isFinite(lineTotal) && lineTotal > 0 ? round2(lineTotal) : round2(unit * qty);
  const out = { brand: 'modomio', pizza: 0, burger: 0, taco: 0, amount, name: item.name, category: item.category };

  if (isHalfHalf(item.category, item.name)) {
    out.pizza += qty;
    return out;
  }

  const sizeUnits = pizzaUnitsFromLabel(item.category, item.name);
  const extras = Array.isArray(item.extras) ? item.extras : [];

  if (/menu\s*taco|combo\s*taco/.test(`${cat} ${nm}`)) {
    out.brand = 'blackburger';
    let tacos = 0;
    for (const ex of extras) {
      const parsed = parseComboExtra(typeof ex === 'string' ? ex : ex?.name || '');
      if (!parsed || isSideOrDrink(parsed.name)) continue;
      tacos += parsed.units * qty;
    }
    out.taco += tacos || qty;
    return out;
  }

  if (sizeUnits != null) {
    out.brand = 'modomio';
    let pizzas = 0;
    for (const ex of extras) {
      const parsed = parseComboExtra(typeof ex === 'string' ? ex : ex?.name || '');
      if (!parsed || isSideOrDrink(parsed.name)) continue;
      if (/burger|taco|hamburg/.test(fold(parsed.name))) {
        // rare
        continue;
      }
      pizzas += parsed.units * qty;
    }
    out.pizza += pizzas || sizeUnits * qty;
    return out;
  }

  if (/taco/.test(cat) || /\btacos?\b/.test(nm)) {
    out.brand = 'blackburger';
    out.taco += qty;
    return out;
  }
  if (/burger|hamburg|smash/.test(cat) || /burger|hamburg|smash/.test(nm)) {
    out.brand = 'blackburger';
    out.burger += qty;
    return out;
  }
  if (/pizza|calzone|premium|especialidad/.test(cat) || /pizza|calzone/.test(nm)) {
    out.brand = 'modomio';
    if (!(/postre|dessert/.test(cat) || (/nutella/.test(nm) && /pizza/.test(nm)))) {
      out.pizza += qty;
    }
    return out;
  }

  // bebidas / resto → modomio
  out.brand = 'modomio';
  return out;
}

function normalizePayMethod(raw) {
  const m = fold(raw);
  if (/efectivo|cash|metalico/.test(m)) return 'efectivo';
  if (/visa|tarjeta|card|tpv|credit|debit/.test(m)) return 'visa';
  if (/bizum/.test(m)) return 'bizum';
  return 'otro';
}

function channelOfOrder(o) {
  const ch = fold(o.channel || o.source || o.platform || '');
  if (/just\s*eat|justeat/.test(ch)) return 'justeat';
  if (/uber/.test(ch)) return 'uber';
  if (/glovo/.test(ch)) return 'glovo';
  if (/flipdish|app|vertial|web/.test(ch)) return 'app';
  return 'tpv';
}

function emptyMoney() {
  return { efectivo: 0, visa: 0, bizum: 0, justeat: 0, uber: 0, glovo: 0, app: 0, otro: 0, total: 0 };
}

function addMoney(a, part) {
  for (const k of Object.keys(a)) a[k] = round2(a[k] + (Number(part[k]) || 0));
  return a;
}

function moneyFromShare(payBucket, share) {
  const m = emptyMoney();
  const s = round2(share);
  if (s <= 0) return m;
  if (['justeat', 'uber', 'glovo', 'app'].includes(payBucket)) m[payBucket] = s;
  else if (payBucket === 'efectivo') m.efectivo = s;
  else if (payBucket === 'visa') m.visa = s;
  else if (payBucket === 'bizum') m.bizum = s;
  else m.otro = s;
  m.total = s;
  return m;
}

const docs = await allDocs('bbddsaas-delivery');
const session = docs.find((d) => d._id === SESSION_ID);
const linked = new Set((session?.linkedOrderIds || []).map(String));

const orders = docs.filter((d) => {
  if (d?.type !== 'delivery_order' || d.deletedAt) return false;
  if (bid(d) !== DISARMINK) return false;
  const st = fold(d.status);
  if (/cancel/.test(st)) return false;
  const created = d.createdAt ? madridDayKey(new Date(d.createdAt)) : '';
  const sp = String(d.salesPointId || d.pointOfSaleId || '');
  const inTiana = sp === TIANA_PDV || linked.has(d._id) || /tiana/i.test(String(d.salesPointName || ''));
  // Incluir también pedidos aggregator del día en Tiana aunque no estén linked al TPV
  return inTiana && created === '2026-07-28';
});

const byCh = {};
for (const o of orders) {
  const ch = channelOfOrder(o);
  byCh[ch] = (byCh[ch] || 0) + 1;
}

const modomio = { money: emptyMoney(), pizza: 0, burger: 0, taco: 0, orders: 0, orderRows: [] };
const black = { money: emptyMoney(), pizza: 0, burger: 0, taco: 0, orders: 0, orderRows: [] };

for (const o of orders) {
  const items = Array.isArray(o.items) ? o.items : [];
  let modAmt = 0;
  let bbAmt = 0;
  let pizza = 0;
  let burger = 0;
  let taco = 0;
  const lines = [];
  for (const it of items) {
    const c = classifyLine(it);
    lines.push(c);
    if (c.brand === 'blackburger') {
      bbAmt = round2(bbAmt + c.amount);
      burger += c.burger;
      taco += c.taco;
    } else {
      modAmt = round2(modAmt + c.amount);
      pizza += c.pizza;
    }
  }

  const orderTotal = round2(Number(o.totalAmount ?? o.total ?? 0) || modAmt + bbAmt);
  const linesSum = round2(modAmt + bbAmt);
  // Scale line amounts to order total if needed
  let modShare = modAmt;
  let bbShare = bbAmt;
  if (linesSum > 0 && orderTotal > 0 && Math.abs(linesSum - orderTotal) > 0.05) {
    const ratio = orderTotal / linesSum;
    modShare = round2(modAmt * ratio);
    bbShare = round2(orderTotal - modShare);
  } else if (linesSum <= 0 && orderTotal > 0) {
    // unknown items — assign all to modomio
    modShare = orderTotal;
  }

  const channel = channelOfOrder(o);
  const payBucket = channel !== 'tpv' ? channel : normalizePayMethod(o.paymentMethod || '');

  if (modShare > 0 || pizza > 0) {
    addMoney(modomio.money, moneyFromShare(payBucket, modShare));
    modomio.pizza += pizza;
    modomio.orders += 1;
    modomio.orderRows.push({
      orderNumber: o.orderNumber || o.ticketNumber || o._id.slice(-6),
      channel,
      payBucket,
      paymentMethod: o.paymentMethod || '',
      amount: modShare,
      pizza,
      money: moneyFromShare(payBucket, modShare),
      status: o.status,
      createdAt: o.createdAt,
    });
  }
  if (bbShare > 0 || burger > 0 || taco > 0) {
    addMoney(black.money, moneyFromShare(payBucket, bbShare));
    black.burger += burger;
    black.taco += taco;
    black.orders += 1;
    black.orderRows.push({
      orderNumber: o.orderNumber || o.ticketNumber || o._id.slice(-6),
      channel,
      payBucket,
      paymentMethod: o.paymentMethod || '',
      amount: bbShare,
      burger,
      taco,
      totalUnits: burger + taco,
      money: moneyFromShare(payBucket, bbShare),
      status: o.status,
      createdAt: o.createdAt,
    });
  }
}

const sessionMoney = {
  efectivo: round2(session?.summary?.salesByMethod?.efectivo || 0),
  visa: round2(session?.summary?.salesByMethod?.tarjeta || 0),
  bizum: round2(session?.summary?.salesByMethod?.bizum || 0),
  justeat: round2(session?.aggregatorClosingTotals?.justeat || 0),
  uber: round2(session?.aggregatorClosingTotals?.ubereats || 0),
  glovo: round2(session?.aggregatorClosingTotals?.glovo || 0),
  app: round2(session?.aggregatorClosingTotals?.flipdish || 0),
};
sessionMoney.total = round2(
  sessionMoney.efectivo +
    sessionMoney.visa +
    sessionMoney.bizum +
    sessionMoney.justeat +
    sessionMoney.uber +
    sessionMoney.glovo +
    sessionMoney.app,
);

const result = {
  day: '2026-07-28',
  pdv: 'MODOMIO TIANA',
  session: {
    id: SESSION_ID,
    status: session?.status,
    openedAt: session?.openedAt,
    closedAt: session?.closedAt,
    productClosingCounts: session?.productClosingCounts,
    sessionMoney,
  },
  ordersCount: orders.length,
  ordersByChannel: byCh,
  modomio: {
    money: modomio.money,
    pizza: modomio.pizza,
    orders: modomio.orders,
    orderRows: modomio.orderRows,
  },
  blackburger: {
    money: black.money,
    burger: black.burger,
    taco: black.taco,
    totalBurgers: black.burger + black.taco,
    orders: black.orders,
    orderRows: black.orderRows,
  },
};

console.log(JSON.stringify(result, null, 2));
