/**
 * Mock local delivery — testlocal@delivery.com
 * 1 marca, 10 productos con escandallo/merma, proveedor + factura compra, ventas.
 *
 *   node scripts/seed-testlocal-delivery-mock.mjs
 *   node scripts/seed-testlocal-delivery-mock.mjs --purge
 */
import '../config/env.js';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

const ACCOUNTS_DB = 'accounts';
const BUSINESSES_DB = 'businesses';
function dbPrefix() {
  return String(process.env.COUCHDB_DB || 'vertial')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'vertial';
}
const SALES_POINTS_DB = `${dbPrefix()}-sales-points`;
const DELIVERY_DB = `${dbPrefix()}-delivery`;
const CATALOG_DB = `${dbPrefix()}-catalog`;
const FINANCE_DB = 'pay';

const QA_TAG = 'testlocal-delivery-mock';
const EMAIL = String(process.env.TESTLOCAL_EMAIL || 'testlocal@delivery.com')
  .trim()
  .toLowerCase();
const PASSWORD = String(process.env.TESTLOCAL_PASSWORD || 'TestLocal2026!').trim();
const BUSINESS_NAME = 'Test Local Delivery';
const BUSINESS_TYPE = 'delivery';
const BRAND_NAME = 'Marca Test Local';
const SUPPLIER_NAME = 'Proveedor Test Local SL';

const PURGE = process.argv.includes('--purge');

const TEAM_PERMISSION_KEYS = [
  'vehicles', 'clients', 'sales', 'reservations', 'documents', 'finance', 'ancove', 'team',
  'fleet', 'delivery', 'cash_register', 'cleaning_materials', 'acquisitions', 'butcher_waste',
  'butcher_purchases', 'reports', 'scrapyard_docs', 'scrapyard', 'workshop',
];

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function couchBaseUrl() {
  const raw = String(process.env.COUCHDB_URL || '').trim();
  if (!raw) return '';
  try {
    const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw}`;
    const u = new URL(href);
    const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
    return `${u.origin}${pathPart}`.replace(/\/+$/, '');
  } catch {
    return raw.replace(/^(https?:\/\/)(?:[^/@]+)@/i, '$1').replace(/\/+$/, '');
  }
}

const BASE = couchBaseUrl();
const AUTH =
  process.env.COUCHDB_USER && process.env.COUCHDB_PASSWORD
    ? `Basic ${Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64')}`
    : '';

async function couchJson(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: AUTH,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(typeof data === 'object' && data?.reason ? data.reason : `${res.status} ${text}`);
  }
  return data;
}

async function ensureDb(db) {
  try {
    await couchJson('PUT', `/${db}`);
  } catch (e) {
    if (!/already exists|file_exists/i.test(String(e.message))) throw e;
  }
}

function buildAdminPermissions() {
  return Object.fromEntries(TEAM_PERMISSION_KEYS.map((k) => [k, { view: true, edit: true }]));
}

async function allDocs(db) {
  const data = await couchJson('GET', `/${db}/_all_docs?include_docs=true`);
  return (data.rows || []).map((r) => r.doc).filter((d) => d && !String(d._id).startsWith('_design/'));
}

async function hardDelete(db, doc) {
  if (!doc?._id || !doc?._rev) return false;
  await couchJson('DELETE', `/${db}/${encodeURIComponent(doc._id)}?rev=${encodeURIComponent(doc._rev)}`);
  return true;
}

function matchesQa(doc, ownerId, businessId) {
  if (!doc) return false;
  if (doc.qaTag === QA_TAG) return true;
  if (ownerId && String(doc.user_id || '') === ownerId) {
    if (
      [
        'delivery_order',
        'delivery_config',
        'purchase_invoice',
        'catalog_item',
        'brand',
        'point_of_sale',
        'sales_point',
        'tpv_register_session',
        'cobro',
        'pago',
        'stock_movement',
      ].includes(doc.type)
    ) {
      return true;
    }
  }
  if (businessId) {
    const bid = String(doc.business_id || doc.businessId || '').replace(/^business:/, '');
    if (bid === businessId) return true;
  }
  return false;
}

async function purgeAll() {
  const accounts = (await allDocs(ACCOUNTS_DB)).filter(
    (d) => d.type === 'account' && String(d.email || '').toLowerCase() === EMAIL,
  );
  if (!accounts.length) {
    console.log(`No hay cuenta ${EMAIL} — nada que borrar.`);
    return;
  }

  const ownerIds = [...new Set(accounts.map((a) => a.user_id).filter(Boolean))];
  const businesses = (await allDocs(BUSINESSES_DB)).filter(
    (d) =>
      d.type === 'business' &&
      (ownerIds.includes(d.owner_user_id) || d.qaTag === QA_TAG || String(d.email || '').toLowerCase() === EMAIL),
  );
  const businessIds = businesses.map((b) => String(b.business_id || '').replace(/^business:/, '')).filter(Boolean);

  const dbs = [CATALOG_DB, DELIVERY_DB, SALES_POINTS_DB, FINANCE_DB, BUSINESSES_DB, ACCOUNTS_DB];
  console.log(`Purge DBs: ${CATALOG_DB}, ${DELIVERY_DB}, ${SALES_POINTS_DB}`);
  let deleted = 0;
  for (const db of dbs) {
    await ensureDb(db);
    const docs = await allDocs(db);
    for (const doc of docs) {
      const own = ownerIds.some((oid) => matchesQa(doc, oid, businessIds[0]));
      const bizHit = businessIds.some((bid) => matchesQa(doc, null, bid));
      const emailHit = db === ACCOUNTS_DB && String(doc.email || '').toLowerCase() === EMAIL;
      if (!own && !bizHit && !emailHit && doc.qaTag !== QA_TAG) continue;
      // cuentas del email siempre
      if (db === ACCOUNTS_DB && !emailHit && doc.qaTag !== QA_TAG && !ownerIds.includes(doc.user_id)) continue;
      try {
        if (await hardDelete(db, doc)) deleted += 1;
      } catch (e) {
        console.warn(`No se pudo borrar ${db}/${doc._id}:`, e.message);
      }
    }
  }
  console.log(`\n=== PURGE OK ===\nBorrados duros: ${deleted}\nEmail: ${EMAIL}\n`);
}

async function put(db, doc) {
  return couchJson('PUT', `/${db}/${encodeURIComponent(doc._id)}`, doc);
}

async function seed() {
  console.log(`Sembrando en: ${CATALOG_DB}, ${DELIVERY_DB}, ${SALES_POINTS_DB} (prefix=${dbPrefix()})`);
  for (const db of [ACCOUNTS_DB, BUSINESSES_DB, SALES_POINTS_DB, DELIVERY_DB, CATALOG_DB, FINANCE_DB]) {
    await ensureDb(db);
  }

  // Si ya existe, purge primero para recrear limpio
  const existing = (await allDocs(ACCOUNTS_DB)).filter(
    (d) => d.type === 'account' && String(d.email || '').toLowerCase() === EMAIL,
  );
  if (existing.length) {
    console.log('Cuenta previa detectada → purge y recrear…');
    await purgeAll();
  }

  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const periodEnd = new Date(Date.now() + 365 * 86400000).toISOString();
  const ownerId = uuidv4();
  const businessId = uuidv4();
  const brandId = `brand-${QA_TAG}-${businessId.slice(0, 8)}`;
  const wcId = `wc-${QA_TAG}-${businessId.slice(0, 8)}`;
  const pdvId = `pdv-${QA_TAG}-${businessId.slice(0, 8)}`;
  const adminPerms = buildAdminPermissions();

  // Ingredientes (coste ficha €/kg o €/ud)
  const ingredients = [
    { id: `ing-${QA_TAG}-carne`, name: 'Carne vacuno', unit: 'kg', baseCost: 9.5 },
    { id: `ing-${QA_TAG}-pan`, name: 'Pan burger', unit: 'ud', baseCost: 0.35 },
    { id: `ing-${QA_TAG}-queso`, name: 'Queso cheddar', unit: 'kg', baseCost: 8.2 },
    { id: `ing-${QA_TAG}-bacon`, name: 'Bacon', unit: 'kg', baseCost: 11.0 },
    { id: `ing-${QA_TAG}-lechuga`, name: 'Lechuga', unit: 'kg', baseCost: 2.4 },
    { id: `ing-${QA_TAG}-tomate`, name: 'Tomate', unit: 'kg', baseCost: 1.8 },
    { id: `ing-${QA_TAG}-patata`, name: 'Patata', unit: 'kg', baseCost: 1.2 },
    { id: `ing-${QA_TAG}-masa`, name: 'Masa pizza', unit: 'kg', baseCost: 2.0 },
    { id: `ing-${QA_TAG}-mozza`, name: 'Mozzarella', unit: 'kg', baseCost: 7.5 },
    { id: `ing-${QA_TAG}-salsa`, name: 'Salsa tomate', unit: 'kg', baseCost: 1.5 },
    { id: `ing-${QA_TAG}-cola`, name: 'Cola lata', unit: 'ud', baseCost: 0.45 },
    { id: `ing-${QA_TAG}-agua`, name: 'Agua 50cl', unit: 'ud', baseCost: 0.2 },
  ].map((i) => ({
    ...i,
    role: 'escandallo',
    brandIds: [brandId],
  }));

  const ingByKey = Object.fromEntries(
    ingredients.map((i) => [i.id.replace(`ing-${QA_TAG}-`, ''), i]),
  );

  function recipe(...lines) {
    return lines.map((l) => ({
      storeIngredientId: l.id,
      name: l.name,
      quantity: l.qty,
      unit: l.unit,
    }));
  }

  // 10 productos carta
  const productsDef = [
    {
      key: 'burger-clasica',
      name: 'Burger Clásica',
      category: 'burgers',
      price: 9.9,
      mermaPct: 8,
      lines: recipe(
        { id: ingByKey.carne.id, name: ingByKey.carne.name, qty: 150, unit: 'g' },
        { id: ingByKey.pan.id, name: ingByKey.pan.name, qty: 1, unit: 'ud' },
        { id: ingByKey.lechuga.id, name: ingByKey.lechuga.name, qty: 20, unit: 'g' },
        { id: ingByKey.tomate.id, name: ingByKey.tomate.name, qty: 30, unit: 'g' },
      ),
    },
    {
      key: 'burger-bacon',
      name: 'Burger Bacon Cheese',
      category: 'burgers',
      price: 12.5,
      mermaPct: 10,
      lines: recipe(
        { id: ingByKey.carne.id, name: ingByKey.carne.name, qty: 160, unit: 'g' },
        { id: ingByKey.pan.id, name: ingByKey.pan.name, qty: 1, unit: 'ud' },
        { id: ingByKey.queso.id, name: ingByKey.queso.name, qty: 40, unit: 'g' },
        { id: ingByKey.bacon.id, name: ingByKey.bacon.name, qty: 35, unit: 'g' },
      ),
    },
    {
      key: 'burger-doble',
      name: 'Burger Doble',
      category: 'burgers',
      price: 14.9,
      mermaPct: 12,
      lines: recipe(
        { id: ingByKey.carne.id, name: ingByKey.carne.name, qty: 280, unit: 'g' },
        { id: ingByKey.pan.id, name: ingByKey.pan.name, qty: 1, unit: 'ud' },
        { id: ingByKey.queso.id, name: ingByKey.queso.name, qty: 50, unit: 'g' },
      ),
    },
    {
      key: 'patatas',
      name: 'Patatas fritas',
      category: 'sides',
      price: 3.5,
      mermaPct: 15,
      lines: recipe({ id: ingByKey.patata.id, name: ingByKey.patata.name, qty: 200, unit: 'g' }),
    },
    {
      key: 'pizza-margarita',
      name: 'Pizza Margarita',
      category: 'pizzas',
      price: 11.0,
      mermaPct: 5,
      lines: recipe(
        { id: ingByKey.masa.id, name: ingByKey.masa.name, qty: 250, unit: 'g' },
        { id: ingByKey.mozza.id, name: ingByKey.mozza.name, qty: 120, unit: 'g' },
        { id: ingByKey.salsa.id, name: ingByKey.salsa.name, qty: 80, unit: 'g' },
      ),
    },
    {
      key: 'pizza-bacon',
      name: 'Pizza Bacon',
      category: 'pizzas',
      price: 13.5,
      mermaPct: 6,
      lines: recipe(
        { id: ingByKey.masa.id, name: ingByKey.masa.name, qty: 250, unit: 'g' },
        { id: ingByKey.mozza.id, name: ingByKey.mozza.name, qty: 130, unit: 'g' },
        { id: ingByKey.salsa.id, name: ingByKey.salsa.name, qty: 80, unit: 'g' },
        { id: ingByKey.bacon.id, name: ingByKey.bacon.name, qty: 60, unit: 'g' },
      ),
    },
    {
      key: 'menu-burger',
      name: 'Menú Burger + Patatas',
      category: 'combos',
      price: 12.9,
      mermaPct: 8,
      lines: recipe(
        { id: ingByKey.carne.id, name: ingByKey.carne.name, qty: 150, unit: 'g' },
        { id: ingByKey.pan.id, name: ingByKey.pan.name, qty: 1, unit: 'ud' },
        { id: ingByKey.patata.id, name: ingByKey.patata.name, qty: 180, unit: 'g' },
      ),
    },
    {
      key: 'cola',
      name: 'Cola lata',
      category: 'bebidas',
      price: 2.2,
      mermaPct: 0,
      lines: recipe({ id: ingByKey.cola.id, name: ingByKey.cola.name, qty: 1, unit: 'ud' }),
    },
    {
      key: 'agua',
      name: 'Agua 50cl',
      category: 'bebidas',
      price: 1.5,
      mermaPct: 0,
      lines: recipe({ id: ingByKey.agua.id, name: ingByKey.agua.name, qty: 1, unit: 'ud' }),
    },
    {
      key: 'extra-bacon',
      name: 'Extra bacon',
      category: 'extras',
      price: 1.8,
      mermaPct: 5,
      lines: recipe({ id: ingByKey.bacon.id, name: ingByKey.bacon.name, qty: 40, unit: 'g' }),
    },
  ];

  const owner = {
    _id: `account:${ownerId}`,
    type: 'account',
    user_id: ownerId,
    email: EMAIL,
    firstName: 'Test',
    lastName: 'Local',
    fullName: 'Test Local Delivery',
    phone: '+34600111222',
    avatar: '',
    accountType: 'company',
    role: 'Admin',
    status: 'active',
    inviteStatus: 'accepted',
    invitedBy: '',
    companyName: BUSINESS_NAME,
    onboardingCompleted: true,
    onboardingData: { businessType: BUSINESS_TYPE, source: QA_TAG },
    provider: 'email',
    permissions: adminPerms,
    employment: {},
    recentActivity: [],
    lastLoginAt: '',
    emailVerified: true,
    paymentSummary: null,
    subscription: {
      status: 'subscription_active',
      planName: 'Pro',
      selectedPlanId: 'pro',
      trialEndsAt: periodEnd,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      gracePeriodEndsAt: periodEnd,
      lastPaymentAt: now,
      cancelAtPeriodEnd: false,
    },
    landingPage: '/saas/dashboard',
    linkedBusinessId: businessId,
    username: '',
    referralCode: '',
    referredByAffiliateId: '',
    passwordHash: hashPassword(PASSWORD),
    qaTag: QA_TAG,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await put(ACCOUNTS_DB, owner);

  const business = {
    _id: `business:${businessId}`,
    type: 'business',
    business_id: businessId,
    owner_user_id: ownerId,
    group_id: null,
    businessType: BUSINESS_TYPE,
    name: BUSINESS_NAME,
    legalName: BUSINESS_NAME,
    taxId: 'B99990001',
    address: 'Calle Test Local 1',
    city: 'Barcelona',
    phone: owner.phone,
    email: owner.email,
    logo: '',
    companyCode: 'TESTLOC',
    branches: [],
    members: [
      {
        user_id: ownerId,
        fullName: owner.fullName,
        email: owner.email,
        role: 'Admin',
        branch_id: null,
        permissions: adminPerms,
        joinedAt: now,
      },
    ],
    qaTag: QA_TAG,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await put(BUSINESSES_DB, business);

  await put(SALES_POINTS_DB, {
    _id: wcId,
    id: wcId,
    type: 'sales_point',
    user_id: ownerId,
    businessId,
    business_id: businessId,
    name: 'Test Local Tienda',
    centerType: 'punto_de_venta',
    ownership: 'propiedad',
    address: 'Calle Test Local 1',
    city: 'Barcelona',
    active: true,
    expectedStaffCount: 2,
    qaTag: QA_TAG,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });

  await put(DELIVERY_DB, {
    _id: pdvId,
    type: 'point_of_sale',
    user_id: ownerId,
    businessId,
    business_id: businessId,
    workCenterId: wcId,
    name: 'Test Local PDV',
    code: 'TESTPDV',
    active: true,
    address: 'Calle Test Local 1',
    city: 'Barcelona',
    terminals: [{ id: `term-${QA_TAG}`, name: 'Tablet Test', active: true }],
    qaTag: QA_TAG,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });

  await put(CATALOG_DB, {
    _id: brandId,
    type: 'brand',
    id: brandId,
    business_id: businessId,
    user_id: ownerId,
    name: BRAND_NAME,
    description: 'Marca mock para revisar escandallo / merma / ventas',
    logo: '',
    website: '',
    primaryColor: '#0F766E',
    secondaryColor: '',
    shortCode: 'MTL',
    salesPointIds: [wcId],
    deliveryLineKind: '',
    catalogCategories: [],
    isDefault: true,
    active: true,
    qaTag: QA_TAG,
    createdAt: now,
    updatedAt: now,
  });

  await put(DELIVERY_DB, {
    _id: `dlvconf-${ownerId}`,
    type: 'delivery_config',
    id: `dlvconf-${ownerId}`,
    user_id: ownerId,
    hasDineIn: true,
    hasTakeaway: true,
    hasOwnDelivery: true,
    hasPlatformDelivery: false,
    platforms: [],
    hasPhysicalTables: false,
    tableCount: 0,
    hasKitchen: true,
    hasAssemblyStation: true,
    hasCashRegister: true,
    defaultPrepTime: 20,
    maxKitchenCapacity: 15,
    delayThresholdMinutes: 30,
    kitchenSaturationThreshold: 10,
    cashCloseReminder: true,
    cashCloseReminderTime: '23:00',
    activeChannels: ['direct', 'tpv'],
    activeTimeSlots: [],
    storeIngredients: ingredients,
    tpvDeliveryFee: 2.5,
    escandalloInfrastructure: {
      applyToFoodCost: true,
      estimatedMonthlySales: 12000,
      lines: [
        { id: 'infra-alquiler', name: 'Alquiler', amountMonthly: 1200 },
        { id: 'infra-luz', name: 'Luz', amountMonthly: 280 },
      ],
    },
    qaTag: QA_TAG,
    createdAt: now,
    updatedAt: now,
  });

  const productDocs = [];
  for (const p of productsDef) {
    const id = `catitem-${QA_TAG}-${p.key}`;
    const doc = {
      _id: id,
      type: 'catalog_item',
      id,
      sku: `TL-${p.key.toUpperCase().slice(0, 12)}`,
      user_id: ownerId,
      module: 'catalog',
      itemType: 'product',
      vertical: 'delivery',
      name: p.name,
      description: `Mock ${p.name}`,
      category: p.category,
      unitPrice: p.price,
      costPrice: 0,
      taxRate: 10,
      stockQuantity: 0,
      minStock: 0,
      unit: 'ud',
      active: true,
      webVisible: true,
      available: true,
      brandIds: [brandId],
      articles: [],
      comboItems: [],
      salesChannels: [],
      isStockItem: false,
      workCenterId: wcId,
      workCenterName: 'Test Local Tienda',
      business_id: businessId,
      customFields: {
        costingType: 'recipe',
        costingRecipe: p.lines,
        ...(p.mermaPct > 0 ? { mermaPct: p.mermaPct } : {}),
      },
      qaTag: QA_TAG,
      createdAt: now,
      updatedAt: now,
    };
    await put(CATALOG_DB, doc);
    productDocs.push(doc);
  }

  // Stock artículos ligados a ingredientes (para compra / almacén)
  const stockDocs = [];
  for (const ing of ingredients) {
    const id = `catitem-stock-${ing.id}`;
    const qtyBuy = ing.unit === 'ud' ? 100 : 20;
    const doc = {
      _id: id,
      type: 'catalog_item',
      id,
      sku: `STK-${ing.id.slice(-8).toUpperCase()}`,
      user_id: ownerId,
      module: 'stock',
      itemType: 'product',
      vertical: 'delivery',
      name: ing.name,
      description: `Stock ${ing.name}`,
      category: 'ingredient',
      unitPrice: 0,
      costPrice: ing.baseCost,
      lastPurchasePrice: ing.baseCost,
      lastPurchaseDate: today,
      taxRate: 10,
      stockQuantity: qtyBuy,
      minStock: 2,
      unit: ing.unit,
      active: true,
      available: true,
      brandIds: [brandId],
      stockCategory: 'ingredient',
      isStockItem: true,
      workCenterId: wcId,
      workCenterName: 'Test Local Tienda',
      business_id: businessId,
      customFields: { storeIngredientId: ing.id },
      qaTag: QA_TAG,
      createdAt: now,
      updatedAt: now,
    };
    await put(CATALOG_DB, doc);
    stockDocs.push({ ...doc, buyQty: qtyBuy });
  }

  // ── Helpers fechas (últimos 10 días) ──
  function dayOffset(daysAgo, hour = 12, minute = 0) {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    return d;
  }
  function isoDay(daysAgo, hour = 12, minute = 0) {
    return dayOffset(daysAgo, hour, minute).toISOString();
  }
  function dateOnly(daysAgo) {
    return isoDay(daysAgo).slice(0, 10);
  }
  function money(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  async function putFinance({
    id,
    type,
    concept,
    category,
    amountBase,
    taxRate = 21,
    date,
    payMethod = 'transferencia',
    companyName = '',
    reference = '',
    source = 'manual',
    sourceRef = '',
    status = 'paid',
  }) {
    const taxAmount = money(amountBase * (taxRate / 100));
    const totalAmount = money(amountBase + taxAmount);
    const paidAt = status === 'paid' ? `${date}T12:00:00.000Z` : '';
    await put(FINANCE_DB, {
      _id: id,
      id,
      type,
      user_id: ownerId,
      companyName,
      concept,
      reference,
      category,
      categoryIcon: '',
      categoryColor: '',
      amountBase: money(amountBase),
      taxRate,
      taxAmount,
      totalAmount,
      date,
      payMethod,
      notes: 'Mock testlocal',
      status,
      dueDate: date,
      paidAt,
      reconciled: false,
      reconciledBankTxId: '',
      linkedDocuments: [],
      attachmentUrl: '',
      source,
      sourceRef,
      dismissedDuplicates: [],
      businessId,
      businessName: BUSINESS_NAME,
      workCenterId: wcId,
      workCenterName: 'Test Local Tienda',
      pointOfSaleId: pdvId,
      pointOfSaleName: 'Test Local PDV',
      brandId,
      brandName: BRAND_NAME,
      qaTag: QA_TAG,
      createdAt: `${date}T10:00:00.000Z`,
      updatedAt: `${date}T10:00:00.000Z`,
    });
    return totalAmount;
  }

  // Factura compra grande (día -9) + reposición parcial (día -3)
  const invLines = stockDocs.map((s, idx) => {
    const total = money(s.buyQty * s.costPrice);
    return {
      id: `pinvl-${idx}`,
      description: s.name,
      itemName: s.name,
      quantity: s.buyQty,
      unitPrice: s.costPrice,
      total,
      catalogItemId: s._id,
      catalogItemName: s.name,
      sku: s.sku,
    };
  });
  const subtotal = money(invLines.reduce((a, l) => a + l.total, 0));
  const taxRate = 10;
  const taxAmount = money(subtotal * (taxRate / 100));
  const invTotal = money(subtotal + taxAmount);
  const invId = `pinv-${QA_TAG}-001`;
  const invDate = dateOnly(9);
  await put(CATALOG_DB, {
    _id: invId,
    type: 'purchase_invoice',
    id: invId,
    invoiceNumber: 'FC-TESTLOCAL-001',
    user_id: ownerId,
    supplierId: '',
    supplierName: SUPPLIER_NAME,
    date: invDate,
    dueDate: invDate,
    status: 'paid',
    lines: invLines,
    subtotal,
    taxRate,
    taxAmount,
    total: invTotal,
    notes: 'Mock: compra inicial de stock',
    paidAt: isoDay(9, 11),
    businessId,
    business_id: businessId,
    workCenterId: wcId,
    workCenterName: 'Test Local Tienda',
    entryMethod: 'manual',
    documentKind: 'factura_proveedor',
    source: 'manual',
    qaTag: QA_TAG,
    createdAt: isoDay(9, 11),
    updatedAt: isoDay(9, 11),
  });

  const restock = stockDocs.filter((_, i) => i % 3 === 0).map((s, idx) => {
    const qty = s.unit === 'ud' ? 24 : 5;
    const total = money(qty * s.costPrice);
    return {
      id: `pinvl2-${idx}`,
      description: s.name,
      itemName: s.name,
      quantity: qty,
      unitPrice: s.costPrice,
      total,
      catalogItemId: s._id,
      catalogItemName: s.name,
      sku: s.sku,
    };
  });
  const sub2 = money(restock.reduce((a, l) => a + l.total, 0));
  const tax2 = money(sub2 * 0.1);
  const inv2Total = money(sub2 + tax2);
  const inv2Id = `pinv-${QA_TAG}-002`;
  const inv2Date = dateOnly(3);
  await put(CATALOG_DB, {
    _id: inv2Id,
    type: 'purchase_invoice',
    id: inv2Id,
    invoiceNumber: 'FC-TESTLOCAL-002',
    user_id: ownerId,
    supplierId: '',
    supplierName: SUPPLIER_NAME,
    date: inv2Date,
    dueDate: inv2Date,
    status: 'paid',
    lines: restock,
    subtotal: sub2,
    taxRate: 10,
    taxAmount: tax2,
    total: inv2Total,
    notes: 'Mock: reposición mid-week',
    paidAt: isoDay(3, 16),
    businessId,
    business_id: businessId,
    workCenterId: wcId,
    workCenterName: 'Test Local Tienda',
    entryMethod: 'manual',
    documentKind: 'factura_proveedor',
    source: 'manual',
    qaTag: QA_TAG,
    createdAt: isoDay(3, 16),
    updatedAt: isoDay(3, 16),
  });

  // Plantillas de venta por día (reparten productos)
  const daySaleTemplates = [
    { ago: 8, sets: [[0, 2], [3, 2], [7, 3]] },
    { ago: 7, sets: [[1, 2], [4, 1], [8, 2], [9, 1]] },
    { ago: 6, sets: [[2, 1], [5, 2], [6, 1], [7, 2]] },
    { ago: 5, sets: [[0, 3], [3, 3], [7, 4], [8, 2]] },
    { ago: 4, sets: [[1, 1], [4, 2], [5, 1], [9, 2]] },
    { ago: 3, sets: [[2, 2], [6, 2], [3, 2], [7, 2]] },
    { ago: 2, sets: [[0, 2], [1, 1], [4, 1], [8, 3]] },
    { ago: 1, sets: [[5, 1], [2, 1], [6, 1], [3, 2], [7, 2]] },
    { ago: 0, sets: [[0, 1], [1, 1], [3, 1], [7, 2], [9, 1]] },
  ];

  let orderIdx = 0;
  let totalSalesGross = 0;
  const salesByDay = new Map();

  for (const day of daySaleTemplates) {
    // 2–3 pedidos por día
    const chunks = [
      day.sets.slice(0, Math.ceil(day.sets.length / 2)),
      day.sets.slice(Math.ceil(day.sets.length / 2)),
    ].filter((c) => c.length);
    let dayTotal = 0;
    for (const chunk of chunks) {
      orderIdx += 1;
      const hour = 12 + (orderIdx % 6);
      const when = isoDay(day.ago, hour, 15 + (orderIdx % 40));
      const items = chunk.map(([pi, q], i) => {
        const p = productDocs[pi];
        const total = money(p.unitPrice * q);
        return {
          id: `li-${orderIdx}-${i}`,
          name: p.name,
          quantity: q,
          unitPrice: p.unitPrice,
          total,
          catalogItemId: p._id,
          category: p.category,
          brandIds: [brandId],
        };
      });
      const totalAmount = money(items.reduce((a, it) => a + it.total, 0));
      dayTotal = money(dayTotal + totalAmount);
      totalSalesGross = money(totalSalesGross + totalAmount);
      const payMethod = orderIdx % 3 === 0 ? 'cash' : 'card';
      const oid = `dord-${QA_TAG}-${String(orderIdx).padStart(3, '0')}`;
      await put(DELIVERY_DB, {
        _id: oid,
        type: 'delivery_order',
        id: oid,
        orderNumber: `TL-${String(orderIdx).padStart(3, '0')}`,
        user_id: ownerId,
        customerName: `Cliente Mock ${orderIdx}`,
        customerPhone: `+3460099${String(1000 + orderIdx).slice(-4)}`,
        customerEmail: '',
        customerAddress: day.ago % 2 === 0 ? 'Calle Cliente 1' : '',
        channel: orderIdx % 4 === 0 ? 'direct' : 'tpv',
        deliveryType: orderIdx % 5 === 0 ? 'domicilio' : 'recogida',
        status: 'entregado',
        priority: 'normal',
        salesPointId: pdvId,
        salesPointName: 'Test Local PDV',
        business_id: businessId,
        items,
        itemsSubtotal: totalAmount,
        discountAmount: 0,
        deliveryFee: orderIdx % 5 === 0 ? 2.5 : 0,
        totalAmount: money(totalAmount + (orderIdx % 5 === 0 ? 2.5 : 0)),
        paymentMethod: payMethod,
        paymentStatus: 'paid',
        paidAmount: money(totalAmount + (orderIdx % 5 === 0 ? 2.5 : 0)),
        paidAt: when,
        paymentCollected: true,
        paymentCollectedAt: when,
        deliveredAt: when,
        stageHistory: [{ status: 'entregado', date: when, user: ownerId, notes: 'mock' }],
        qaTag: QA_TAG,
        createdAt: when,
        updatedAt: when,
      });
    }
    salesByDay.set(day.ago, dayTotal);
  }

  // Sesiones de caja cerradas (días con ventas)
  for (const [ago, daySales] of salesByDay) {
    if (ago === 0) continue; // hoy sin cerrar
    const openedAt = isoDay(ago, 10, 0);
    const closedAt = isoDay(ago, 23, 30);
    const initial = 100;
    const cashSales = money(daySales * 0.35);
    const cardSales = money(daySales - cashSales);
    const sid = `tpvreg-${QA_TAG}-d${ago}`;
    await put(DELIVERY_DB, {
      _id: sid,
      type: 'tpv_register_session',
      id: sid,
      user_id: ownerId,
      pointOfSaleId: pdvId,
      pointOfSaleName: 'Test Local PDV',
      terminalId: `term-${QA_TAG}`,
      terminalName: 'Tablet Test',
      workerId: ownerId,
      workerName: 'Test Local Delivery',
      status: 'closed',
      openedAt,
      openedBy: ownerId,
      openingCashCount: {},
      initialCashAmount: initial,
      transactions: [
        {
          id: `tx-sale-cash-${ago}`,
          type: 'sale',
          paymentMethod: 'cash',
          amount: cashSales,
          createdAt: isoDay(ago, 14),
        },
        {
          id: `tx-sale-card-${ago}`,
          type: 'sale',
          paymentMethod: 'card',
          amount: cardSales,
          createdAt: isoDay(ago, 15),
        },
        {
          id: `tx-cashout-${ago}`,
          type: 'cash_out',
          amount: 20,
          concept: 'Cambio / propinas',
          createdAt: isoDay(ago, 20),
        },
      ],
      cashCounts: [],
      closedAt,
      closedBy: ownerId,
      closingCashCount: {},
      finalCashAmount: money(initial + cashSales - 20),
      expectedCash: money(initial + cashSales - 20),
      difference: 0,
      closingNotes: `Cierre mock día -${ago}`,
      business_id: businessId,
      qaTag: QA_TAG,
      createdAt: openedAt,
      updatedAt: closedAt,
    });
  }

  // Finanzas por días: cobros ventas + gastos operativos
  let finCount = 0;
  for (const [ago, daySales] of salesByDay) {
    if (!(daySales > 0)) continue;
    finCount += 1;
    const base = money(daySales / 1.1);
    await putFinance({
      id: `finance-${QA_TAG}-ventas-d${ago}`,
      type: 'cobro',
      concept: `Ventas TPV ${dateOnly(ago)}`,
      category: 'ventas',
      amountBase: base,
      taxRate: 10,
      date: dateOnly(ago),
      payMethod: 'tpv',
      companyName: BUSINESS_NAME,
      reference: `VENTAS-${dateOnly(ago)}`,
      source: 'sale',
    });
  }

  // Gasto compra stock (ligado a facturas)
  await putFinance({
    id: `finance-${QA_TAG}-compra-001`,
    type: 'pago',
    concept: `Factura FC-TESTLOCAL-001 — ${SUPPLIER_NAME}`,
    category: 'compras_stock',
    amountBase: subtotal,
    taxRate: 10,
    date: invDate,
    payMethod: 'transferencia',
    companyName: SUPPLIER_NAME,
    reference: 'FC-TESTLOCAL-001',
    source: 'supplier_invoice',
    sourceRef: invId,
  });
  await putFinance({
    id: `finance-${QA_TAG}-compra-002`,
    type: 'pago',
    concept: `Factura FC-TESTLOCAL-002 — ${SUPPLIER_NAME}`,
    category: 'compras_stock',
    amountBase: sub2,
    taxRate: 10,
    date: inv2Date,
    payMethod: 'transferencia',
    companyName: SUPPLIER_NAME,
    reference: 'FC-TESTLOCAL-002',
    source: 'supplier_invoice',
    sourceRef: inv2Id,
  });

  // Gastos fijos / variables repartidos
  const expensePlan = [
    { ago: 9, category: 'alquiler', concept: 'Alquiler local agosto', amount: 1200, tax: 21, method: 'transferencia', company: 'Inmobiliaria Mock SL' },
    { ago: 8, category: 'suministros', concept: 'Factura luz', amount: 145.5, tax: 21, method: 'domiciliacion', company: 'Endesa Mock' },
    { ago: 7, category: 'suministros', concept: 'Agua / basuras', amount: 38.2, tax: 10, method: 'domiciliacion', company: 'Ayuntamiento' },
    { ago: 6, category: 'marketing', concept: 'Ads Instagram', amount: 80, tax: 21, method: 'tarjeta', company: 'Meta Ads' },
    { ago: 5, category: 'transporte', concept: 'Gasolina reparto', amount: 55, tax: 21, method: 'tarjeta', company: 'Gasolinera' },
    { ago: 4, category: 'mantenimiento', concept: 'Reparación horno', amount: 120, tax: 21, method: 'transferencia', company: 'TecnoHorno SL' },
    { ago: 3, category: 'software', concept: 'Suscripción software', amount: 49, tax: 21, method: 'tarjeta', company: 'Vertial' },
    { ago: 2, category: 'personal', concept: 'Anticipo nómina cocina', amount: 400, tax: 0, method: 'transferencia', company: 'Personal' },
    { ago: 1, category: 'otros_gastos', concept: 'Material limpieza', amount: 27.9, tax: 21, method: 'efectivo', company: 'Droguería' },
    { ago: 0, category: 'marketing', concept: 'Flyers zona', amount: 35, tax: 21, method: 'efectivo', company: 'Imprenta Local', status: 'pending' },
  ];

  for (const e of expensePlan) {
    finCount += 1;
    await putFinance({
      id: `finance-${QA_TAG}-gasto-${e.category}-d${e.ago}`,
      type: 'pago',
      concept: e.concept,
      category: e.category,
      amountBase: e.amount,
      taxRate: e.tax,
      date: dateOnly(e.ago),
      payMethod: e.method,
      companyName: e.company,
      reference: `GAS-${e.ago}`,
      status: e.status || 'paid',
    });
  }

  // Coste esperado rápido (g→kg)
  function lineCost(qty, unit, baseCost, ingUnit) {
    let q = qty;
    if (unit === 'g' && ingUnit === 'kg') q = qty / 1000;
    if (unit === 'ml' && ingUnit === 'l') q = qty / 1000;
    return money(q * baseCost);
  }
  const ingMap = new Map(ingredients.map((i) => [i.id, i]));
  console.log('\n=== Mock Test Local listo (ampliado) ===\n');
  console.log(`Email:       ${EMAIL}`);
  console.log(`Contraseña:  ${PASSWORD}`);
  console.log(`Negocio:     ${BUSINESS_NAME}`);
  console.log(`Marca:       ${BRAND_NAME}`);
  console.log(`Proveedor:   ${SUPPLIER_NAME}`);
  console.log(`Facturas:    FC-TESTLOCAL-001 (${invTotal.toFixed(2)} €) + FC-TESTLOCAL-002 (${inv2Total.toFixed(2)} €)`);
  console.log(`Pedidos:     ${orderIdx} entregados (últimos ${daySaleTemplates.length} días)`);
  console.log(`Ventas €:    ${totalSalesGross.toFixed(2)} (aprox productos)`);
  console.log(`Finanzas:    cobros diarios + ${expensePlan.length} gastos + 2 compras stock`);
  console.log(`Cajas:       ${salesByDay.size - 1} sesiones cerradas (hoy abierta/sin cierre)`);
  console.log(`business_id: ${businessId}`);
  console.log('\nEscandallo esperado (ingredientes + merma, sin infra):');
  for (const p of productsDef) {
    let base = 0;
    for (const line of p.lines) {
      const ing = ingMap.get(line.storeIngredientId);
      if (!ing) continue;
      base += lineCost(line.quantity, line.unit, ing.baseCost, ing.unit);
    }
    base = money(base);
    const withMerma = p.mermaPct > 0 ? money(base * (1 + p.mermaPct / 100)) : base;
    const margin = money(p.price - withMerma);
    const fc = p.price > 0 ? Math.round((withMerma / p.price) * 1000) / 10 : 0;
    console.log(
      `  - ${p.name}: coste ${base.toFixed(2)} € → c/merma ${withMerma.toFixed(2)} € | PVP ${p.price.toFixed(2)} € | FC ${fc}% | margen ${margin.toFixed(2)} €`,
    );
  }
  console.log('\nEntra en http://localhost:3015 → login empresa.');
  console.log('Revisa: Carta, Escandallo, Finanzas, Facturas compra, Pedidos/TPV, Caja.');
  console.log('Cuando digas «borra», hago purge duro de TODO esto.\n');
}

async function main() {
  if (!BASE || !AUTH) {
    console.error('Faltan COUCHDB_URL / USER / PASSWORD');
    process.exit(1);
  }
  if (PURGE) {
    await purgeAll();
    return;
  }
  await seed();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
