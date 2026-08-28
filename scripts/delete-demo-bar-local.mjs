/**
 * Elimina por completo la cuenta demo bar local y sus datos asociados.
 *
 * Uso:
 *   node scripts/delete-demo-bar-local.mjs
 *   BAR_DEMO_EMAIL=prueba-bar@test.local node scripts/delete-demo-bar-local.mjs
 */
import '../config/env.js';

const ACCOUNTS_DB = 'accounts';
const BUSINESSES_DB = 'businesses';
const SALES_POINTS_DB = 'bbddsaas-sales-points';
const DELIVERY_DB = 'bbddsaas-delivery';
const RESTAURANT_DB = 'bbddsaas-restaurant';

const BAR_EMAIL = String(process.env.BAR_DEMO_EMAIL || 'prueba-bar@test.local')
  .trim()
  .toLowerCase();

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

async function findAccountsByEmail(email) {
  const data = await couchJson('POST', `/${ACCOUNTS_DB}/_find`, {
    selector: { type: 'account', email },
    limit: 25,
  });
  return data?.docs || [];
}

async function findBusinessesForOwner(ownerId) {
  const data = await couchJson('POST', `/${BUSINESSES_DB}/_find`, {
    selector: { type: 'business', owner_user_id: ownerId },
    limit: 50,
  });
  return data?.docs || [];
}

async function softDeleteDoc(db, doc, now) {
  if (!doc?._id || doc.deletedAt) return false;
  await couchJson('PUT', `/${db}/${encodeURIComponent(doc._id)}`, {
    ...doc,
    deletedAt: now,
    updatedAt: now,
  });
  return true;
}

async function hardDeleteDoc(db, doc) {
  if (!doc?._id || !doc._rev) return false;
  await couchJson('DELETE', `/${db}/${encodeURIComponent(doc._id)}?rev=${encodeURIComponent(doc._rev)}`);
  return true;
}

function normUserId(id) {
  return String(id || '').replace(/^account:/, '').trim();
}

async function findDocsByUserId(db, userId, limit = 500) {
  const uid = normUserId(userId);
  if (!uid) return [];
  const data = await couchJson('POST', `/${db}/_find`, {
    selector: {
      $or: [
        { user_id: uid },
        { userId: uid },
        { dataUserId: uid },
        { owner_user_id: uid },
      ],
    },
    limit,
  });
  return (data?.docs || []).filter((d) => !d.deletedAt);
}

async function findDocsByBusinessIds(db, businessIds, limit = 500) {
  const ids = [...new Set(businessIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return [];
  const data = await couchJson('POST', `/${db}/_find`, {
    selector: {
      $or: [
        { businessId: { $in: ids } },
        { business_id: { $in: ids } },
      ],
    },
    limit,
  });
  return (data?.docs || []).filter((d) => !d.deletedAt);
}

async function main() {
  if (!BASE || !AUTH) {
    console.error('Faltan COUCHDB_URL, COUCHDB_USER o COUCHDB_PASSWORD');
    process.exit(1);
  }

  const accounts = await findAccountsByEmail(BAR_EMAIL);
  if (!accounts.length) {
    console.log(`No hay cuenta con email ${BAR_EMAIL}. Nada que borrar.`);
    return;
  }

  const now = new Date().toISOString();
  let stats = {
    accounts: 0,
    businesses: 0,
    salesPoints: 0,
    pdvs: 0,
    deliveryDocs: 0,
    restaurantDocs: 0,
  };

  for (const acc of accounts) {
    const ownerId = normUserId(acc.user_id);
    console.log(`\nBorrando cuenta: ${acc.email} (${acc.fullName || '—'}) user_id=${ownerId}`);

    const businesses = await findBusinessesForOwner(ownerId);
    const businessIds = businesses.map((b) => b.business_id).filter(Boolean);

    for (const b of businesses) {
      if (await softDeleteDoc(BUSINESSES_DB, b, now)) {
        stats.businesses += 1;
        console.log(`  · empresa soft-delete: ${b.name} (${b.business_id})`);
      }
    }

    for (const db of [SALES_POINTS_DB, DELIVERY_DB]) {
      const byUser = await findDocsByUserId(db, ownerId);
      const byBiz = await findDocsByBusinessIds(db, businessIds);
      const seen = new Set();
      for (const doc of [...byUser, ...byBiz]) {
        if (seen.has(doc._id)) continue;
        seen.add(doc._id);
        if (await softDeleteDoc(db, doc, now)) {
          if (doc.type === 'sales_point') stats.salesPoints += 1;
          else if (doc.type === 'point_of_sale') stats.pdvs += 1;
          else stats.deliveryDocs += 1;
          console.log(`  · ${db}: ${doc.type || 'doc'} ${doc._id} (${doc.name || '—'})`);
        }
      }
    }

    try {
      const restaurantDocs = await findDocsByUserId(RESTAURANT_DB, ownerId);
      for (const doc of restaurantDocs) {
        if (await softDeleteDoc(RESTAURANT_DB, doc, now)) {
          stats.restaurantDocs += 1;
        }
      }
      if (restaurantDocs.length) {
        console.log(`  · ${RESTAURANT_DB}: ${restaurantDocs.length} doc(s) soft-delete`);
      }
    } catch (e) {
      console.warn(`  · ${RESTAURANT_DB}: skip (${e.message})`);
    }

    if (await hardDeleteDoc(ACCOUNTS_DB, acc)) {
      stats.accounts += 1;
      console.log(`  · cuenta eliminada (hard delete)`);
    }
  }

  console.log('\n=== Demo bar eliminada ===');
  console.log(JSON.stringify(stats, null, 2));
  console.log(`\nYa no puedes entrar con ${BAR_EMAIL}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
