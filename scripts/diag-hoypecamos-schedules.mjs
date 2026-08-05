#!/usr/bin/env node
/** Solo lectura: plantillas horario + miembros hoypecamos + cuenta PAU TRABAJADOR */
import '../config/env.js';

function couchBaseUrl() {
  const raw = String(process.env.COUCHDB_URL || '').trim();
  const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw || '127.0.0.1:5984'}`;
  const u = new URL(href);
  const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
  return `${u.origin}${pathPart}`.replace(/\/+$/, '');
}

const BASE = couchBaseUrl();
const AUTH = `Basic ${Buffer.from(
  `${process.env.COUCHDB_USER || ''}:${process.env.COUCHDB_PASSWORD || ''}`,
).toString('base64')}`;
const BID = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const BADALONA = 'wc-16361270-5794-4b95-89e5-644685f36e24';
const prefix = (process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial').toLowerCase();

async function allDocs(db) {
  const res = await fetch(`${BASE}/${encodeURIComponent(db)}/_all_docs?include_docs=true`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

async function main() {
  const accounts = await allDocs('accounts');
  const pauWorker = accounts.find((a) => String(a.email || '').toLowerCase() === 'hoypecamos@gmail.com');
  console.log('=== PAU TRABAJADOR ===');
  console.log(
    JSON.stringify(
      {
        user_id: pauWorker?.user_id,
        linkedBusinessId: pauWorker?.linkedBusinessId,
        employment: pauWorker?.employment,
        invitedBy: pauWorker?.invitedBy,
        landingPage: pauWorker?.landingPage,
        permissions: pauWorker?.permissions ? Object.keys(pauWorker.permissions).slice(0, 5) : null,
      },
      null,
      2,
    ),
  );

  const businesses = await allDocs('businesses');
  const biz = businesses.find((b) => String(b.business_id || '').replace(/^business:/, '') === BID);
  console.log('\n=== members hoypecamos ===');
  for (const m of biz?.members || []) {
    console.log(
      JSON.stringify(
        {
          user_id: m.user_id,
          fullName: m.fullName,
          email: m.email,
          role: m.role,
          employment: m.employment,
        },
        null,
        2,
      ),
    );
  }

  // find shift templates / schedules dbs
  for (const db of [
    `${prefix}-schedules`,
    `${prefix}-shift-templates`,
    'bbddsaas-schedules',
    'schedules',
  ]) {
    try {
      const docs = await allDocs(db);
      const templates = docs.filter(
        (d) =>
          d?.type === 'shift_template' &&
          !d.deletedAt &&
          String(d.business_id || d.businessId || '') === BID,
      );
      const assignments = docs.filter(
        (d) =>
          (d?.type === 'schedule_assignment' || d?.type === 'worker_schedule') &&
          !d.deletedAt &&
          String(d.business_id || d.businessId || '') === BID,
      );
      console.log(`\n=== ${db}: templates=${templates.length} assignments=${assignments.length} ===`);
      for (const t of templates) {
        console.log(
          JSON.stringify(
            {
              _id: t._id,
              name: t.name,
              days: t.days || t.week || t.schedule,
              start: t.start || t.from,
              end: t.end || t.to,
              blocks: t.blocks || t.shifts || t.slots,
              weeklyHours: t.weeklyHours,
            },
            null,
            2,
          ),
        );
      }
      for (const a of assignments.slice(0, 10)) {
        console.log('assignment', JSON.stringify({ _id: a._id, type: a.type, user_id: a.user_id || a.memberId, templateId: a.templateId || a.scheduleTemplateId }, null, 2));
      }
      // also list any doc mentioning 19:00
      const dinnerish = docs.filter(
        (d) =>
          !d.deletedAt &&
          JSON.stringify(d).includes('19:00') &&
          String(d.business_id || d.businessId || '') === BID,
      );
      console.log(`docs con 19:00 en biz: ${dinnerish.length}`);
      for (const d of dinnerish.slice(0, 5)) {
        console.log(JSON.stringify({ _id: d._id, type: d.type, name: d.name }, null, 2));
      }
    } catch (e) {
      console.log(`${db}: ${e.message}`);
    }
  }

  console.log('\nBadalona WC:', BADALONA);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
