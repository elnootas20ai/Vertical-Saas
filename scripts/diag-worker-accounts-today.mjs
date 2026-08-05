#!/usr/bin/env node
/**
 * Solo lectura: cuentas trabajador creadas / actualizadas hoy (UTC y Europe/Madrid).
 *   NODE_ENV=production node scripts/diag-worker-accounts-today.mjs
 */
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

function madridDay(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

function todayMadrid() {
  return madridDay(new Date().toISOString());
}

async function allDocs(db) {
  const res = await fetch(`${BASE}/${encodeURIComponent(db)}/_all_docs?include_docs=true`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function isWorkerAccount(a) {
  if (!a || a.type !== 'account' || a.deletedAt) return false;
  if (a.accountType === 'user') return true;
  if (a.invitedBy) return true;
  return false;
}

async function main() {
  const today = todayMadrid();
  console.log(`Couch: ${BASE}`);
  console.log(`Hoy (Europe/Madrid): ${today}\n`);

  const accounts = await allDocs('accounts');
  const workers = accounts.filter(isWorkerAccount);

  const createdToday = workers.filter((a) => madridDay(a.createdAt) === today);
  const invitedPendingToday = workers.filter(
    (a) => a.inviteStatus === 'pending' && madridDay(a.createdAt || a.updatedAt) === today,
  );
  const acceptedToday = workers.filter(
    (a) => a.inviteStatus === 'accepted' && madridDay(a.updatedAt) === today,
  );

  console.log(`Trabajadores totales: ${workers.length}`);
  console.log(`Creados hoy: ${createdToday.length}`);
  for (const a of createdToday) {
    console.log(
      `  + ${a.email || '?'} | ${a.fullName || a.name || '?'} | invite=${a.inviteStatus || '-'} | linked=${a.linkedBusinessId || '-'} | created=${a.createdAt}`,
    );
  }

  console.log(`\nInvitaciones pending tocadas hoy: ${invitedPendingToday.length}`);
  for (const a of invitedPendingToday) {
    console.log(`  ~ ${a.email || '?'} | ${a.fullName || '?'} | created=${a.createdAt}`);
  }

  console.log(`\nAccepted (updated hoy): ${acceptedToday.length}`);
  for (const a of acceptedToday.slice(0, 30)) {
    console.log(
      `  = ${a.email || '?'} | ${a.fullName || '?'} | linked=${a.linkedBusinessId || '-'} | updated=${a.updatedAt}`,
    );
  }

  // Team invitations created today
  try {
    const invites = await allDocs('team_invitations');
    const invToday = invites.filter(
      (d) =>
        d &&
        !d.deletedAt &&
        (d.type === 'team_invitation' || d.docType === 'team_invitation') &&
        madridDay(d.createdAt) === today,
    );
    console.log(`\nTeam invitations creadas hoy: ${invToday.length}`);
    for (const i of invToday) {
      console.log(
        `  > ${i.email || '?'} | biz=${i.businessId || i.business_id || '-'} | status=${i.status || '-'} | store=${i.workCenterId || i.employment?.salesPointId || '-'}`,
      );
    }
  } catch (e) {
    console.log(`\n(team_invitations no legible: ${e.message})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
