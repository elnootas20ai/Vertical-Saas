/**
 * Prueba rápida del flujo Stock (API): login → crear ingrediente → cargar stock → inventario.
 * Uso: node scripts/test-stock-tab.mjs
 */
import '../config/env.js';
import { filterStockInventoryItems, isStockInventoryItem } from '../services/stockInventoryScope.js';

const API = 'http://localhost:3001';
const EMAIL = String(process.env.SAAS_LOGIN_EMAIL || 'uriel@admin.com').trim();
const PASSWORD = String(process.env.SAAS_LOGIN_PASSWORD || '').trim();

function fail(msg) {
  console.error('❌', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('✅', msg);
}

async function api(path, { method = 'GET', body, token, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, json, setCookie: res.headers.get('set-cookie') || '' };
}

function cookiesFrom(setCookie) {
  if (!setCookie) return '';
  return setCookie.split(',').map((p) => p.split(';')[0].trim()).join('; ');
}

async function main() {
  if (!PASSWORD) fail('Falta SAAS_LOGIN_PASSWORD en .env / .env.development');

  console.log('--- Stock tab smoke test ---\n');

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  if (login.status !== 200 || !login.json?.ok) {
    fail(`Login falló (${login.status}): ${login.json?.error || 'sin detalle'}`);
  }
  const userId = login.json.user?.user_id || login.json.user?.userId;
  const token = login.json.accessToken || '';
  const cookie = cookiesFrom(login.setCookie);
  if (!userId) fail('Login OK pero sin userId');
  ok(`Login como ${EMAIL} (userId: ${userId.slice(0, 8)}…)`);

  const listBefore = await api(`/api/delivery/catalog/${userId}`, { token, cookie });
  if (listBefore.status !== 200) fail(`List catalog ${listBefore.status}`);
  const itemsBefore = listBefore.json?.items || [];
  const stockBefore = filterStockInventoryItems(itemsBefore);
  ok(`Catálogo: ${itemsBefore.length} items · inventario: ${stockBefore.length}`);

  const testName = `TEST Ingrediente ${Date.now()}`;
  const create = await api(`/api/delivery/catalog/${userId}`, {
    method: 'POST',
    token,
    cookie,
    body: {
      item: {
        name: testName,
        module: 'stock',
        itemType: 'product',
        stockCategory: 'ingredient',
        isStockItem: true,
        unit: 'kg',
        minStock: 5,
        costPrice: 3.5,
        stockQuantity: 0,
        active: true,
      },
    },
  });
  if (create.status !== 201 || !create.json?.item) {
    fail(`Crear ingrediente falló (${create.status}): ${create.json?.error || 'sin detalle'}`);
  }
  const created = create.json.item;
  ok(`Ingrediente creado: "${created.name}" (stock=${created.stockQuantity})`);

  if (!isStockInventoryItem(created)) fail('El item creado no pasa el filtro de inventario');
  ok('Filtro inventario: el nuevo item entra en Stock (no en carta)');

  const bulk = await api(`/api/delivery/catalog/${userId}/bulk-stock`, {
    method: 'POST',
    token,
    cookie,
    body: {
      entries: [{ sku: created.sku, name: created.name, quantity: 12, unit: 'kg' }],
    },
  });
  if (bulk.status !== 200 || !bulk.json?.ok) {
    fail(`Bulk stock falló (${bulk.status}): ${bulk.json?.error || 'sin detalle'}`);
  }
  ok(`Stock inicial cargado: ${bulk.json.updated ?? 0} actualizado(s)`);

  const listAfter = await api(`/api/delivery/catalog/${userId}`, { token, cookie });
  const found = (listAfter.json?.items || []).find((i) => i._id === created._id);
  if (!found) fail('No se encuentra el item tras recargar');
  if (Number(found.stockQuantity) !== 12) {
    fail(`Stock esperado 12, got ${found.stockQuantity}`);
  }
  ok(`Stock en BD: ${found.stockQuantity} ${found.unit} · mínimo ${found.minStock}`);

  const stats = { ok: 0, low: 0, out: 0, negative: 0 };
  filterStockInventoryItems(listAfter.json?.items || []).forEach((item) => {
    const qty = Number(item.stockQuantity || 0);
    const min = Number(item.minStock || 0);
    if (qty < 0) stats.negative += 1;
    else if (qty === 0) stats.out += 1;
    else if (min > 0 && qty <= min) stats.low += 1;
    else stats.ok += 1;
  });
  ok(`Stats inventario → OK:${stats.ok} Bajo:${stats.low} Sin stock:${stats.out} Neg:${stats.negative}`);

  const wh = await api(`/api/warehouses/${userId}`, { token, cookie });
  const warehouses = wh.json?.warehouses || wh.json?.items || [];
  const warehouseId = warehouses.find((w) => w.active)?.id || warehouses.find((w) => w.active)?._id || '';

  const countCreate = await api(`/api/stock-counts/${userId}`, {
    method: 'POST',
    token,
    cookie,
    body: {
      stockCount: {
        name: `Test revisión ${new Date().toLocaleDateString('es-ES')}`,
        countType: 'full',
        warehouseId,
        warehouseName: warehouses[0]?.name || 'Test',
      },
    },
  });
  if (countCreate.status !== 201 && countCreate.status !== 200) {
    fail(`Crear revisión falló (${countCreate.status}): ${countCreate.json?.error || 'sin detalle'}`);
  }
  const count = countCreate.json?.stockCount || countCreate.json?.count;
  const lines = count?.lines?.length ?? 0;
  const hasNew = (count?.lines || []).some((l) => l.catalogItemId === created._id || l.sku === created.sku);
  ok(`Revisión iniciada: ${lines} líneas${hasNew ? ' · incluye el ingrediente de prueba' : ''}`);

  console.log('\n--- Todo OK (API). Abre http://localhost:3015/saas/compras-stock?tab=stock para ver la UI ---');
  console.log(`Ingrediente de prueba: "${testName}"`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
