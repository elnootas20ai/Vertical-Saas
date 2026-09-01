/**
 * Pedidos de HOY (varios estados) + algunos entregados hoy para testlocal.
 *   node scripts/qa-testlocal-orders-today.mjs
 */
import '../config/env.js';

const API = 'http://127.0.0.1:3001';
const EMAIL = 'testlocal@delivery.com';
const PASS = 'TestLocal2026!';

function money(n) {
  return Math.round(Number(n) * 100) / 100;
}

function isoToday(hour, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

async function main() {
  const login = await (
    await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASS }),
    })
  ).json();
  if (!login.ok) throw new Error(JSON.stringify(login));
  const uid = login.user.user_id;
  const token = login.accessToken;
  const h = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const biz = await (await fetch(`${API}/api/businesses/user/${uid}`, { headers: h })).json();
  const bid = (biz.businesses || [])[0]?.business_id;

  const cat = await (
    await fetch(`${API}/api/delivery/catalog/${uid}?businessId=${encodeURIComponent(bid)}`, {
      headers: h,
    })
  ).json();
  const products = (cat.items || []).filter(
    (i) => i.module !== 'stock' && i.active !== false && Number(i.unitPrice) > 0,
  );
  if (products.length < 3) throw new Error('pocos productos carta');

  const AUTH = `Basic ${Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64')}`;
  const base = String(process.env.COUCHDB_URL || '').replace(/\/$/, '');
  const prefix = String(process.env.COUCHDB_DB || 'urielsaas').toLowerCase();
  const DELIVERY = `${prefix}-delivery`;

  async function couchGet(path) {
    const r = await fetch(`${base}${path}`, { headers: { Authorization: AUTH } });
    return r.json();
  }
  async function couchPut(db, doc) {
    const r = await fetch(`${base}/${encodeURIComponent(db)}/${encodeURIComponent(doc._id)}`, {
      method: 'PUT',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j));
    return j;
  }

  const all = await couchGet(`/${DELIVERY}/_all_docs?include_docs=true`);
  const docs = (all.rows || []).map((r) => r.doc).filter(Boolean);
  const pdv = docs.find((d) => d.type === 'point_of_sale' && d.user_id === uid && !d.deletedAt);
  if (!pdv) throw new Error('sin PDV');

  // borrar pedidos "today mock" previos
  for (const d of docs) {
    if (d.type !== 'delivery_order' || d.user_id !== uid) continue;
    if (!String(d._id || '').includes('dord-testlocal-today-')) continue;
    await fetch(
      `${base}/${encodeURIComponent(DELIVERY)}/${encodeURIComponent(d._id)}?rev=${encodeURIComponent(d._rev)}`,
      { method: 'DELETE', headers: { Authorization: AUTH } },
    );
  }

  const pick = (...idxs) =>
    idxs.map((i) => products[i % products.length]).filter(Boolean);

  const plans = [
    {
      id: 'dord-testlocal-today-001',
      status: 'nuevo',
      hour: 10,
      channel: 'tpv',
      deliveryType: 'recogida',
      paymentMethod: 'card',
      items: pick(0, 3, 7),
      qty: [1, 1, 2],
    },
    {
      id: 'dord-testlocal-today-002',
      status: 'cocina',
      hour: 11,
      channel: 'tpv',
      deliveryType: 'recogida',
      paymentMethod: 'cash',
      items: pick(1, 4),
      qty: [2, 1],
    },
    {
      id: 'dord-testlocal-today-003',
      status: 'listo',
      hour: 12,
      channel: 'direct',
      deliveryType: 'domicilio',
      paymentMethod: 'card',
      deliveryFee: 2.5,
      items: pick(4, 5, 8),
      qty: [1, 1, 1],
    },
    {
      id: 'dord-testlocal-today-004',
      status: 'en_reparto',
      hour: 13,
      channel: 'direct',
      deliveryType: 'domicilio',
      paymentMethod: 'card',
      deliveryFee: 2.5,
      items: pick(2, 6, 7),
      qty: [1, 1, 2],
    },
    {
      id: 'dord-testlocal-today-005',
      status: 'entregado',
      hour: 9,
      channel: 'tpv',
      deliveryType: 'recogida',
      paymentMethod: 'card',
      items: pick(0, 1, 3),
      qty: [1, 1, 1],
    },
    {
      id: 'dord-testlocal-today-006',
      status: 'entregado',
      hour: 14,
      channel: 'tpv',
      deliveryType: 'recogida',
      paymentMethod: 'cash',
      items: pick(5, 9, 7),
      qty: [1, 2, 2],
    },
    {
      id: 'dord-testlocal-today-007',
      status: 'cocina',
      hour: 15,
      channel: 'tpv',
      deliveryType: 'recogida',
      paymentMethod: 'card',
      items: pick(4, 0),
      qty: [2, 1],
    },
    {
      id: 'dord-testlocal-today-008',
      status: 'nuevo',
      hour: 16,
      channel: 'direct',
      deliveryType: 'domicilio',
      paymentMethod: 'card',
      deliveryFee: 2.5,
      items: pick(1, 3, 8),
      qty: [1, 2, 1],
    },
  ];

  const brandId = Array.isArray(products[0]?.brandIds) ? products[0].brandIds[0] : '';
  let n = 0;
  for (const plan of plans) {
    n += 1;
    const when = isoToday(plan.hour, 10 + n);
    const lines = plan.items.map((p, i) => {
      const q = plan.qty[i] || 1;
      const total = money(p.unitPrice * q);
      return {
        id: `li-today-${n}-${i}`,
        name: p.name,
        quantity: q,
        unitPrice: p.unitPrice,
        total,
        catalogItemId: p._id,
        category: p.category || '',
        brandIds: brandId ? [brandId] : p.brandIds || [],
      };
    });
    const itemsSubtotal = money(lines.reduce((a, l) => a + l.total, 0));
    const deliveryFee = money(plan.deliveryFee || 0);
    const totalAmount = money(itemsSubtotal + deliveryFee);
    const paid = plan.status === 'entregado' || plan.status === 'en_reparto';

    const doc = {
      _id: plan.id,
      type: 'delivery_order',
      id: plan.id,
      orderNumber: `HOY-${String(n).padStart(3, '0')}`,
      user_id: uid,
      customerName: `Cliente Hoy ${n}`,
      customerPhone: `+34611${String(1000 + n).slice(-4)}000`.slice(0, 12),
      customerEmail: '',
      customerAddress: plan.deliveryType === 'domicilio' ? `Calle Hoy ${n}, Barcelona` : '',
      channel: plan.channel,
      deliveryType: plan.deliveryType,
      status: plan.status,
      priority: 'normal',
      salesPointId: pdv._id,
      salesPointName: pdv.name || 'Test Local PDV',
      business_id: bid,
      items: lines,
      itemsSubtotal,
      discountAmount: 0,
      deliveryFee,
      totalAmount,
      paymentMethod: plan.paymentMethod,
      paymentStatus: paid ? 'paid' : 'pending',
      paidAmount: paid ? totalAmount : 0,
      paidAt: paid ? when : '',
      paymentCollected: paid,
      paymentCollectedAt: paid ? when : '',
      deliveredAt: plan.status === 'entregado' ? when : '',
      departedAt: plan.status === 'en_reparto' || plan.status === 'entregado' ? when : '',
      kitchenStartedAt: ['cocina', 'listo', 'en_reparto', 'entregado'].includes(plan.status) ? when : '',
      kitchenCompletedAt: ['listo', 'en_reparto', 'entregado'].includes(plan.status) ? when : '',
      assemblyStartedAt: ['listo', 'en_reparto', 'entregado'].includes(plan.status) ? when : '',
      assemblyCompletedAt: ['en_reparto', 'entregado'].includes(plan.status) ? when : '',
      stageHistory: [{ status: plan.status, date: when, user: uid, notes: 'mock hoy' }],
      qaTag: 'testlocal-delivery-mock',
      createdAt: when,
      updatedAt: when,
    };
    await couchPut(DELIVERY, doc);
    console.log(`OK ${doc.orderNumber} ${doc.status} ${doc.totalAmount}€`);
  }

  // verificar API con filtro hoy
  const today = new Date();
  const dateFrom = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const ord = await (
    await fetch(
      `${API}/api/delivery/orders/${uid}?businessId=${encodeURIComponent(bid)}&dateFrom=${encodeURIComponent(dateFrom)}`,
      { headers: h },
    )
  ).json();
  const list = ord.orders || [];
  const byStatus = {};
  for (const o of list) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
  console.log('\nPedidos desde hoy (API):', list.length, byStatus);
  console.log('Estados activos (no entregado):', list.filter((o) => o.status !== 'entregado').length);
  console.log('UI Ops: mira el día de HOY en Pedidos / Ops.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
