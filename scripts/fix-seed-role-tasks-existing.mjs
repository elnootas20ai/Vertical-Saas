#!/usr/bin/env node
/**
 * Siembra tareas «Mi trabajo» por rol a cuentas ya existentes (invites antiguos).
 * Idempotente: ids fijos wtask:{biz}:{member}:tpl:{key}.
 *
 *   node scripts/fix-seed-role-tasks-existing.mjs
 *   node scripts/fix-seed-role-tasks-existing.mjs --apply
 *   node scripts/fix-seed-role-tasks-existing.mjs --apply --business=<id>
 */
import '../config/env.js';
import { getRoleTaskTemplates } from '../services/roleTaskTemplates.js';

const APPLY = process.argv.includes('--apply');
const bizArg = process.argv.find((a) => a.startsWith('--business='));
const ONLY_BIZ = bizArg ? bizArg.slice('--business='.length).trim() : '';

function couchBaseUrl() {
  const raw = String(process.env.COUCHDB_URL || '').trim();
  if (!raw) return '';
  try {
    const href = /^[a-zA-Z][a-zA-Z+\-.]*:\/\//.test(raw) ? raw : `http://${raw}`;
    const u = new URL(href);
    const pathPart = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/+$/, '') : '';
    return `${u.origin}${pathPart}`.replace(/\/+$/, '');
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

const BASE = couchBaseUrl();
const AUTH =
  process.env.COUCHDB_USER && process.env.COUCHDB_PASSWORD
    ? `Basic ${Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64')}`
    : '';

const PREFIX = String(process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial')
  .toLowerCase()
  .replace(/[^a-z0-9_$()+-]+/g, '-')
  .replace(/^-+|-+$/g, '');

const TASKS_DB = `${PREFIX}-worker-tasks`;

function todayIsoLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function couch(method, path, body) {
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
    const err = new Error(
      typeof data === 'object' && data?.reason ? data.reason : `${res.status} ${text}`,
    );
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function ensureDb(name) {
  const res = await fetch(`${BASE}/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  if (res.status === 201 || res.status === 412) return;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`ensureDb ${name}: ${res.status} ${t}`);
  }
}

async function main() {
  if (!BASE || !AUTH) {
    console.error('Faltan COUCHDB_URL / COUCHDB_USER / COUCHDB_PASSWORD');
    process.exit(1);
  }

  console.log(APPLY ? '=== APPLY ===' : '=== DRY (sin escribir) ===');
  console.log('CouchDB', BASE, 'tasksDb', TASKS_DB);
  if (ONLY_BIZ) console.log('Filtro business', ONLY_BIZ);

  const accountsRaw = await couch('GET', '/accounts/_all_docs?include_docs=true');
  const accounts = (accountsRaw.rows || [])
    .map((r) => r.doc)
    .filter((d) => d && !String(d._id).startsWith('_') && (d.email || d.user_id));

  const bizRaw = await couch('GET', '/businesses/_all_docs?include_docs=true');
  const bizById = new Map();
  for (const row of bizRaw.rows || []) {
    const d = row.doc;
    if (!d) continue;
    const id = String(d.business_id || d._id || '')
      .replace(/^business:/, '')
      .trim();
    if (id) bizById.set(id, d);
  }

  const candidates = [];
  for (const acc of accounts) {
    const bid = String(acc.linkedBusinessId || acc.businessId || '')
      .replace(/^business:/, '')
      .trim();
    if (!bid) continue;
    if (ONLY_BIZ && bid !== ONLY_BIZ) continue;
    const mid = String(acc.user_id || acc._id || '')
      .replace(/^account:/, '')
      .trim();
    if (!mid) continue;
    const role = String(acc.role || '').trim();
    const biz = bizById.get(bid);
    const businessType = String(biz?.businessType || biz?.business_type || '').trim();
    const templates = getRoleTaskTemplates(role, businessType);
    candidates.push({
      email: acc.email,
      name: acc.fullName || '',
      memberId: mid,
      businessId: bid,
      role,
      businessType,
      templates,
      bizName: biz?.name || bid,
    });
  }

  console.log(`Cuentas con empresa: ${candidates.length}`);

  if (APPLY) await ensureDb(TASKS_DB);

  let wouldCreate = 0;
  let created = 0;
  let skipped = 0;
  let noTemplate = 0;

  const now = new Date().toISOString();
  const dueDate = todayIsoLocal();

  for (const c of candidates) {
    if (!c.templates.length) {
      noTemplate += 1;
      console.log(`· SKIP (sin plantilla) ${c.email} role="${c.role}" biz=${c.bizName}`);
      continue;
    }
    let memberCreated = 0;
    let memberSkipped = 0;
    for (const tpl of c.templates) {
      const key = String(tpl.key || '').trim();
      if (!key) continue;
      const id = `wtask:${c.businessId}:${c.memberId}:tpl:${key}`;
      let exists = false;
      try {
        const doc = await couch('GET', `/${encodeURIComponent(TASKS_DB)}/${encodeURIComponent(id)}`);
        if (doc && !doc.deletedAt) exists = true;
      } catch (e) {
        if (e.status !== 404) {
          /* db puede no existir aún */
          if (!(e.status === 404 || /not_found/i.test(String(e.message)))) {
            console.warn('  warn get', id, e.message);
          }
        }
      }
      if (exists) {
        memberSkipped += 1;
        skipped += 1;
        continue;
      }
      wouldCreate += 1;
      if (!APPLY) continue;
      const doc = {
        _id: id,
        type: 'worker_task',
        business_id: c.businessId,
        member_id: c.memberId,
        title: String(tpl.title || '').trim(),
        description: String(tpl.description || '').trim(),
        status: 'pending',
        priority: tpl.priority || 'medium',
        dueDate,
        category: 'role_onboarding',
        templateKey: key,
        roleId: c.role,
        timeEntries: [],
        totalSeconds: 0,
        timerRunning: false,
        timerStartedAt: null,
        autoStopAt: null,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await couch('PUT', `/${encodeURIComponent(TASKS_DB)}/${encodeURIComponent(id)}`, doc);
        memberCreated += 1;
        created += 1;
      } catch (e) {
        if (e.status === 409 || /conflict/i.test(String(e.message))) {
          memberSkipped += 1;
          skipped += 1;
        } else {
          console.error('  ERROR put', id, e.message);
        }
      }
    }
    console.log(
      `· ${c.email} [${c.role}] ${c.bizName} → plantillas=${c.templates.length}` +
        (APPLY ? ` created=${memberCreated} skipped=${memberSkipped}` : ` faltan≈${c.templates.length - memberSkipped}`),
    );
  }

  console.log('---');
  console.log('sin plantilla:', noTemplate);
  console.log('ya existían / skip:', skipped);
  console.log(APPLY ? `creadas: ${created}` : `se crearían: ${wouldCreate}`);
  if (!APPLY) console.log('Dry-run OK. Pasa --apply para guardar.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
