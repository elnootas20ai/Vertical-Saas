#!/usr/bin/env node
/**
 * Solo lectura: detalle cuenta Pol + tiendas/empresas Badalona.
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
const prefix = (process.env.VITE_COUCHDB_DB || process.env.COUCHDB_DB || 'vertial').toLowerCase();

async function allDocs(db) {
  const res = await fetch(`${BASE}/${encodeURIComponent(db)}/_all_docs?include_docs=true`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  if (data.error) throw new Error(`${db}: ${data.error}`);
  return (data.rows || []).map((r) => r.doc).filter(Boolean);
}

function pick(a) {
  return {
    _id: a._id,
    email: a.email,
    fullName: a.fullName || a.name,
    accountType: a.accountType,
    inviteStatus: a.inviteStatus,
    invitedBy: a.invitedBy,
    linkedBusinessId: a.linkedBusinessId,
    pendingTeamInvite: a.pendingTeamInvite,
    employment: a.employment,
    role: a.role,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    user_id: a.user_id,
  };
}

async function main() {
  const accounts = await allDocs('accounts');
  const pol = accounts.filter(
    (a) =>
      a?.type === 'account' &&
      (String(a.email || '').toLowerCase().includes('munozluis.pol') ||
        /pol\s*muñoz|pol\s*munoz/i.test(String(a.fullName || a.name || ''))),
  );
  console.log('=== Cuentas Pol ===');
  for (const a of pol) console.log(JSON.stringify(pick(a), null, 2));

  const businesses = await allDocs('businesses');
  const biz = businesses.filter((b) => b?.type === 'business' && !b.deletedAt);
  console.log('\n=== Empresas (nombre) ===');
  for (const b of biz) {
    const members = Array.isArray(b.members) ? b.members : [];
    const polMember = members.find((m) => pol.some((p) => p.user_id === m.user_id));
    console.log(
      `  ${b.name} | id=${b.business_id || b._id} | owner=${b.owner_user_id} | members=${members.length}${polMember ? ' | POL ES MIEMBRO' : ''}`,
    );
  }

  // sales points / work centers with Badalona
  for (const db of [`${prefix}-sales-points`, `${prefix}-work-centers`, 'sales-points', 'work-centers']) {
    try {
      const docs = await allDocs(db);
      const hits = docs.filter((d) => {
        const name = String(d.name || d.label || '');
        return /badalona/i.test(name) && !d.deletedAt;
      });
      if (hits.length) {
        console.log(`\n=== ${db} con Badalona (${hits.length}) ===`);
        for (const h of hits) {
          console.log(
            JSON.stringify(
              {
                _id: h._id,
                id: h.id,
                type: h.type,
                name: h.name,
                businessId: h.businessId || h.business_id,
                user_id: h.user_id,
                active: h.active,
              },
              null,
              2,
            ),
          );
        }
      }
    } catch {
      /* db missing */
    }
  }

  try {
    const invites = await allDocs('team_invitations');
    const forPol = invites.filter(
      (i) =>
        i &&
        !i.deletedAt &&
        String(i.email || '').toLowerCase().includes('munozluis.pol'),
    );
    console.log(`\n=== Invitaciones Pol: ${forPol.length} ===`);
    for (const i of forPol) {
      console.log(
        JSON.stringify(
          {
            _id: i._id,
            email: i.email,
            status: i.status,
            businessId: i.businessId || i.business_id,
            workCenterId: i.workCenterId,
            scheduleTemplateId: i.scheduleTemplateId,
            role: i.role,
            createdAt: i.createdAt,
            updatedAt: i.updatedAt,
          },
          null,
          2,
        ),
      );
    }
  } catch (e) {
    console.log(`invites: ${e.message}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
