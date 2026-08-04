/**
 * Solo lectura: cierre Tiana hoy → JSON split Modomio vs Black Burger.
 * Remoto: node scripts/remote-run-script.mjs export-tiana-caja-brand-split.mjs
 *
 * Modomio: pizzas + bebidas + complementos/postres/resto
 * Black Burger: burgers + tacos
 */
const COUCH = 'http://127.0.0.1:5984';
const AUTH = 'Basic ' + Buffer.from('vertialadmin:uriel12345').toString('base64');
const DISARMINK = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const TIANA_HINT = /tiana/i;

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

function madridDayKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function dayKeyFromIso(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return madridDayKey(d);
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
  if (/menu\s*taco|combo\s*taco/.test(blob)) return null;
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

function isSideOrDrink(name, category) {
  const blob = `${fold(category)} ${fold(name)}`;
  return /bebida|refresco|agua|coca|fanta|sprite|cerveza|vino|cafe|te\b|patata|frita|complemento|acompan|postre|helado|tiramisu|nugget|alita|ensalada|salad|dip|salsa|brownie|cookie|batido|smoothie|zumo|nestea|aquarius|red.?bull|monster|tequeno|salchipapa|chicken\s*balls?|sides?|entrante/.test(
    blob,
  );
}

/** brand: 'modomio' | 'blackburger' | null (no cuenta unidades) */
function classifyLine(item) {
  const qty = Math.max(1, Number(item.quantity) || 1);
  const cat = fold(item.category);
  const nm = fold(item.name);
  const out = {
    brand: /** @type {'modomio'|'blackburger'|null} */ (null),
    pizza: 0,
    burger: 0,
    taco: 0,
    amount: round2(Number(item.total ?? item.lineTotal ?? item.price ?? item.unitPrice ?? 0) * (item.total != null || item.lineTotal != null ? 1 : qty)),
  };

  // Prefer explicit line total
  const lineTotal = Number(item.total ?? item.lineTotal);
  if (Number.isFinite(lineTotal) && lineTotal > 0) {
    out.amount = round2(lineTotal);
  } else {
    const unit = Number(item.unitPrice ?? item.price ?? 0);
    out.amount = round2(unit * qty);
  }

  if (isHalfHalf(item.category, item.name)) {
    out.brand = 'modomio';
    out.pizza += qty;
    return out;
  }

  const sizeUnits = pizzaUnitsFromLabel(item.category, item.name);
  const extras = Array.isArray(item.extras) ? item.extras : [];

  // Menú Taco / burger combo
  if (/menu\s*taco|combo\s*taco/.test(`${cat} ${nm}`) || (/taco/.test(cat) && /menu|combo/.test(nm))) {
    out.brand = 'blackburger';
    let tacos = 0;
    for (const ex of extras) {
      const parsed = parseComboExtra(typeof ex === 'string' ? ex : ex?.name || '');
      if (!parsed || isSideOrDrink(parsed.name, '')) continue;
      if (/\btacos?\b|pastor|crispy|mixto|steak|hot\s*bbq|vegano/.test(fold(parsed.name))) {
        tacos += parsed.units * qty;
      }
    }
    out.taco += tacos || qty;
    return out;
  }

  if (sizeUnits != null) {
    // Menú pizza Modomio
    out.brand = 'modomio';
    let pizzas = 0;
    for (const ex of extras) {
      const parsed = parseComboExtra(typeof ex === 'string' ? ex : ex?.name || '');
      if (!parsed || isSideOrDrink(parsed.name, '')) continue;
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
  if (/postre|dessert|helado|tiramisu/.test(cat)) {
    out.brand = 'modomio';
    return out;
  }
  if (/nutella/.test(nm) && /pizza/.test(nm)) {
    out.brand = 'modomio';
    return out;
  }
  if (
    /pizza|calzone|premium|especialidad/.test(cat) ||
    /pizza|calzone/.test(nm)
  ) {
    out.brand = 'modomio';
    out.pizza += qty;
    return out;
  }

  // Bebidas, complementos, resto → Modomio (como pidió Uriel)
  out.brand = 'modomio';
  return out;
}

function normalizePayMethod(raw) {
  const m = fold(raw);
  if (/efectivo|cash|metalico/.test(m)) return 'efectivo';
  if (/visa|tarjeta|card|tpv|credit|debit/.test(m)) return 'visa';
  if (/bizum/.test(m)) return 'bizum';
  if (/just\s*eat|justeat/.test(m)) return 'justeat';
  if (/uber/.test(m)) return 'uber';
  if (/glovo/.test(m)) return 'glovo';
  if (/flipdish|app|vertial|web|online/.test(m)) return 'app';
  return 'otro';
}

function channelOfOrder(o) {
  const ch = fold(o.channel || o.source || o.platform || o.salesChannel || '');
  if (/just\s*eat|justeat/.test(ch)) return 'justeat';
  if (/uber/.test(ch)) return 'uber';
  if (/glovo/.test(ch)) return 'glovo';
  if (/flipdish|app|vertial|web/.test(ch)) return 'app';
  return 'tpv';
}

function emptyMoney() {
  return {
    efectivo: 0,
    visa: 0,
    bizum: 0,
    justeat: 0,
    uber: 0,
    glovo: 0,
    app: 0,
    otro: 0,
    total: 0,
  };
}

function addMoney(a, b) {
  for (const k of Object.keys(a)) a[k] = round2(a[k] + (b[k] || 0));
  return a;
}

function allocatePayment(orderTotal, payBucket, share) {
  const money = emptyMoney();
  if (orderTotal <= 0 || share <= 0) return money;
  const ratio = share / orderTotal;
  money[payBucket] = round2(orderTotal * ratio);
  // If payBucket is platform, put full share there; if tpv method, already set
  money.total = round2(share);
  // Fix: for platforms, amount goes to platform column not efectivo
  if (['justeat', 'uber', 'glovo', 'app'].includes(payBucket)) {
    money.efectivo = 0;
    money.visa = 0;
    money.bizum = 0;
    money.otro = 0;
    money[payBucket] = round2(share);
  } else if (payBucket === 'otro') {
    money.otro = round2(share);
  } else {
    // efectivo/visa/bizum already set via money[payBucket]
    money.efectivo = payBucket === 'efectivo' ? round2(share) : 0;
    money.visa = payBucket === 'visa' ? round2(share) : 0;
    money.bizum = payBucket === 'bizum' ? round2(share) : 0;
    money.justeat = 0;
    money.uber = 0;
    money.glovo = 0;
    money.app = 0;
    money.otro = 0;
    money[payBucket] = round2(share);
  }
  money.total = round2(
    money.efectivo + money.visa + money.bizum + money.justeat + money.uber + money.glovo + money.app + money.otro,
  );
  return money;
}

const dayArg = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
// A las 00:xx del día siguiente el cierre "de hoy" suele ser el día laboral anterior.
const nowMadrid = new Date(
  new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }),
);
const defaultDay =
  nowMadrid.getHours() < 5
    ? madridDayKey(new Date(nowMadrid.getTime() - 6 * 3600 * 1000))
    : madridDayKey(nowMadrid);
const TARGET_DAY = dayArg || defaultDay;

const [pdvs, sessions, orders] = await Promise.all([
  allDocs('bbddsaas-points-of-sale').catch(() => allDocs('bbddsaas-pointsofsale').catch(() => [])),
  allDocs('bbddsaas-delivery'),
  allDocs('bbddsaas-delivery'),
]);

// PDVs can live in delivery db or separate
let pdvDocs = pdvs.filter((d) => d?.type === 'point_of_sale' || d?.type === 'punto_de_venta');
if (!pdvDocs.length) {
  pdvDocs = sessions.filter((d) => d?.type === 'point_of_sale');
}
const workCenters = sessions.filter((d) => d?.type === 'work_center' || d?.centerType);

const tianaPdvs = [
  ...pdvDocs.filter((d) => TIANA_HINT.test(String(d.name || '')) && bid(d) === DISARMINK),
  ...workCenters.filter(
    (d) =>
      TIANA_HINT.test(String(d.name || '')) &&
      (bid(d) === DISARMINK || !bid(d)) &&
      (d.centerType === 'punto_de_venta' || !d.centerType),
  ),
];

const tianaPdvIds = new Set();
const tianaWcIds = new Set();
for (const p of tianaPdvs) {
  if (p._id) tianaPdvIds.add(p._id);
  if (p.workCenterId) tianaWcIds.add(p.workCenterId);
  if (p.centerType) tianaWcIds.add(p._id);
}
// Known Tiana WC from promo scripts
tianaWcIds.add('wc-ffdee346-8730-4aeb-961d-24832f17f1c1');

const regSessions = sessions.filter(
  (d) =>
    d?.type === 'tpv_register_session' &&
    !d.deletedAt &&
    (bid(d) === DISARMINK || !bid(d)) &&
    (tianaPdvIds.has(String(d.pointOfSaleId || '')) ||
      TIANA_HINT.test(String(d.pointOfSaleName || '')) ||
      tianaWcIds.has(String(d.workCenterId || ''))),
);

const daySessions = regSessions.filter((s) => {
  const openDay = dayKeyFromIso(s.openedAt);
  return openDay === TARGET_DAY;
});

const orderDocs = orders.filter(
  (d) =>
    d?.type === 'delivery_order' &&
    !d.deletedAt &&
    bid(d) === DISARMINK &&
    String(d.status || '') !== 'cancelled' &&
    String(d.status || '') !== 'canceled',
);

function orderInTiana(o) {
  const pdv = String(o.pointOfSaleId || o.pdvId || '');
  const wc = String(o.workCenterId || o.salesPointId || '');
  const name = String(o.pointOfSaleName || o.storeName || '');
  return (
    tianaPdvIds.has(pdv) ||
    tianaWcIds.has(wc) ||
    tianaWcIds.has(pdv) ||
    TIANA_HINT.test(name)
  );
}

function orderDay(o) {
  return (
    dayKeyFromIso(o.deliveredAt) ||
    dayKeyFromIso(o.closedAt) ||
    dayKeyFromIso(o.completedAt) ||
    dayKeyFromIso(o.createdAt) ||
    dayKeyFromIso(o.orderedAt)
  );
}

const dayOrders = orderDocs.filter((o) => orderInTiana(o) && orderDay(o) === TARGET_DAY);

const modomio = {
  money: emptyMoney(),
  pizza: 0,
  burger: 0,
  taco: 0,
  orders: 0,
};
const black = {
  money: emptyMoney(),
  pizza: 0,
  burger: 0,
  taco: 0,
  orders: 0,
};
const detail = [];

for (const o of dayOrders) {
  const items = Array.isArray(o.items) ? o.items : [];
  let modAmt = 0;
  let bbAmt = 0;
  let pizza = 0;
  let burger = 0;
  let taco = 0;
  for (const it of items) {
    const c = classifyLine(it);
    if (c.brand === 'blackburger') {
      bbAmt = round2(bbAmt + c.amount);
      burger += c.burger;
      taco += c.taco;
    } else if (c.brand === 'modomio') {
      modAmt = round2(modAmt + c.amount);
      pizza += c.pizza;
    }
  }

  const orderTotal = round2(
    Number(o.total ?? o.grandTotal ?? o.amount ?? 0) || modAmt + bbAmt,
  );
  // Prefer sum of lines if totals mismatch slightly
  const linesSum = round2(modAmt + bbAmt);
  const base = linesSum > 0 ? linesSum : orderTotal;

  const channel = channelOfOrder(o);
  let payBucket = channel !== 'tpv' ? channel : normalizePayMethod(o.paymentMethod || o.payMethod || o.payment?.method || '');
  if (payBucket === 'otro' && channel === 'tpv') {
    // paid online markers
    if (o.paidOnline || fold(o.paymentStatus) === 'paid_online') payBucket = 'app';
  }

  const modShare = base > 0 ? round2((modAmt / (modAmt + bbAmt || 1)) * (linesSum || orderTotal)) : 0;
  const bbShare = base > 0 ? round2((bbAmt / (modAmt + bbAmt || 1)) * (linesSum || orderTotal)) : 0;
  // Reconcile rounding
  let modMoney = allocatePayment(modShare + bbShare || 1, payBucket, modShare);
  let bbMoney = allocatePayment(modShare + bbShare || 1, payBucket, bbShare);

  if (modAmt > 0 || pizza > 0) {
    addMoney(modomio.money, modMoney);
    modomio.pizza += pizza;
    modomio.orders += 1;
  }
  if (bbAmt > 0 || burger > 0 || taco > 0) {
    addMoney(black.money, bbMoney);
    black.burger += burger;
    black.taco += taco;
    black.orders += 1;
  }

  detail.push({
    id: o._id,
    code: o.code || o.orderNumber || o.ticketNumber || '',
    channel,
    payBucket,
    paymentMethod: o.paymentMethod || o.payMethod || '',
    total: orderTotal,
    modomio: { amount: modShare, pizza, money: modMoney },
    blackburger: { amount: bbShare, burger, taco, money: bbMoney },
    status: o.status,
    createdAt: o.createdAt,
  });
}

// Session summary for cross-check
const sessionSummaries = daySessions.map((s) => ({
  id: s._id,
  status: s.status,
  openedAt: s.openedAt,
  closedAt: s.closedAt,
  pointOfSaleName: s.pointOfSaleName || s.pointOfSaleId,
  salesByMethod: s.summary?.salesByMethod || s.salesByMethod || null,
  salesByChannel: s.summary?.salesByChannel || s.salesByChannel || null,
  aggregatorClosingTotals: s.aggregatorClosingTotals || null,
  productClosingCounts: s.productClosingCounts || null,
  expectedCash: s.summary?.expectedCash ?? s.expectedCash,
  totalSales: s.summary?.totalSales ?? s.totalSales,
}));

const result = {
  day: TARGET_DAY,
  businessId: DISARMINK,
  tianaPdvs: tianaPdvs.map((p) => ({ id: p._id, name: p.name, workCenterId: p.workCenterId })),
  sessions: sessionSummaries,
  ordersCount: dayOrders.length,
  modomio: {
    ...modomio,
    totalBurgersOrTacos: 0,
    totalPizzas: modomio.pizza,
  },
  blackburger: {
    ...black,
    totalBurgers: black.burger + black.taco,
    totalPizzas: 0,
  },
  detail,
};

console.log(JSON.stringify(result, null, 2));
