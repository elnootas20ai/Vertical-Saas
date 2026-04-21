#!/usr/bin/env node
/**
 * Migration script for delivery orders to new omnichannel schema.
 *
 * Transforms:
 *   - Status: pending/preparing -> nuevo, kitchen -> cocina, assembly -> listo, delivery/delivered -> entregado
 *   - Adds new fields with defaults
 *
 * Usage:
 *   node scripts/migrate-delivery-orders.js                  # dry-run
 *   node scripts/migrate-delivery-orders.js --apply          # execute
 */

import 'dotenv/config';

const COUCHDB_URL = process.env.COUCHDB_URL || 'http://localhost:5984';
const DB_PREFIX = process.env.DB_PREFIX || 'udar';
const DB_NAME = `${DB_PREFIX}-delivery`;
const DRY_RUN = !process.argv.includes('--apply');

const STATUS_MAP = {
  pending: 'nuevo',
  preparing: 'nuevo',
  kitchen: 'cocina',
  assembly: 'listo',
  delivery: 'entregado',
  delivered: 'entregado',
};

const VALID_STATUSES = ['nuevo', 'cocina', 'listo', 'entregado', 'cancelled', 'incident'];

async function couchFetch(path, options = {}) {
  const url = `${COUCHDB_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`CouchDB ${res.status}: ${body}`);
  }
  return res.json();
}

function migrateDocument(doc) {
  let changed = false;
  const updates = {};

  const oldStatus = doc.status;
  if (STATUS_MAP[oldStatus]) {
    updates.status = STATUS_MAP[oldStatus];
    changed = true;
  } else if (!VALID_STATUSES.includes(oldStatus)) {
    updates.status = 'nuevo';
    changed = true;
  }

  const defaults = {
    deliveryType: doc.customerAddress && doc.customerAddress.trim() ? 'domicilio' : 'recogida',
    paymentMethod: '',
    paymentStatus: 'pending',
    paidAmount: 0,
    paidAt: '',
    salesPointId: '',
    salesPointName: '',
    cancelReason: '',
    cancelledAt: '',
    cancelledBy: '',
    reopenedAt: '',
    reopenedBy: '',
    externalOrderId: '',
    observations: '',
    clientId: doc.clientId || '',
    customerZone: doc.customerZone || '',
  };

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (doc[key] === undefined || doc[key] === null) {
      updates[key] = defaultValue;
      changed = true;
    }
  }

  if (Array.isArray(doc.stageHistory)) {
    const migratedHistory = doc.stageHistory.map((event) => {
      if (STATUS_MAP[event.status]) return { ...event, status: STATUS_MAP[event.status] };
      return event;
    });
    if (JSON.stringify(migratedHistory) !== JSON.stringify(doc.stageHistory)) {
      updates.stageHistory = migratedHistory;
      changed = true;
    }
  }

  return { changed, updates, oldStatus, newStatus: updates.status || doc.status };
}

async function main() {
  console.log('');
  console.log('=== Delivery orders migration ===');
  console.log(`  DB: ${DB_NAME}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
  console.log('');

  try {
    await couchFetch(`/${encodeURIComponent(DB_NAME)}`);
  } catch {
    console.log(`  DB "${DB_NAME}" not found. Nothing to migrate.`);
    return;
  }

  const allDocs = await couchFetch(`/${encodeURIComponent(DB_NAME)}/_all_docs?include_docs=true`);
  const orders = allDocs.rows
    .map((r) => r.doc)
    .filter((d) => d && d.type === 'delivery_order' && !d.deletedAt);

  console.log(`  Found ${orders.length} delivery_order docs`);
  console.log('');

  let migrated = 0;
  let skipped = 0;
  const bulkDocs = [];

  for (const doc of orders) {
    const { changed, updates, oldStatus, newStatus } = migrateDocument(doc);
    if (changed) {
      migrated++;
      console.log(`  [MIGRATE] ${doc.orderNumber || doc._id}: "${oldStatus}" -> "${newStatus}" +${Object.keys(updates).length} fields`);
      if (!DRY_RUN) {
        bulkDocs.push({ ...doc, ...updates, updatedAt: new Date().toISOString() });
      }
    } else {
      skipped++;
    }
  }

  if (!DRY_RUN && bulkDocs.length > 0) {
    console.log('');
    console.log(`  Applying ${bulkDocs.length} updates...`);
    const result = await couchFetch(`/${encodeURIComponent(DB_NAME)}/_bulk_docs`, {
      method: 'POST',
      body: JSON.stringify({ docs: bulkDocs }),
    });
    const errors = (result || []).filter((r) => r.error);
    if (errors.length > 0) {
      console.log(`  WARNING: ${errors.length} errors`);
      errors.forEach((e) => console.log(`    ${e.id}: ${e.error}`));
    }
    console.log(`  OK: ${bulkDocs.length - errors.length} docs updated`);
  }

  console.log('');
  console.log(`  Total: ${orders.length} | Migrated: ${migrated} | Skipped: ${skipped}`);
  if (DRY_RUN && migrated > 0) {
    console.log('  Run with --apply to execute.');
  }
  console.log('');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
