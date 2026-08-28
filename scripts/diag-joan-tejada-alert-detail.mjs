/**
 * Detalle negocio + reglas de alerta email para Joan Tejada.
 */
const COUCH =
  process.env.COUCHDB_URL ||
  process.env.COUCH_URL ||
  'http://127.0.0.1:5984';
const user = process.env.COUCHDB_USER || process.env.COUCH_USER || 'admin';
const pass = process.env.COUCHDB_PASSWORD || process.env.COUCH_PASSWORD || '';
const AUTH = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

const BID = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const UID = '666152f5-405a-44b6-ac0e-44e28f171a56';
const INVITER = '13e49ef6-183a-4afa-a17b-7730917fe685';

async function couch(path) {
  const res = await fetch(`${COUCH}${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}

const inviter = await couch(`/accounts/account:${INVITER}`);
console.log(
  'inviter',
  JSON.stringify(
    {
      email: inviter.email,
      name: inviter.fullName || inviter.name,
      accountType: inviter.accountType,
      businessName: inviter.businessName,
      userId: inviter.userId,
      role: inviter.role,
    },
    null,
    2,
  ),
);

const joan = await couch(`/accounts/account:${UID}`);
console.log(
  'joan_full_flags',
  JSON.stringify(
    {
      email: joan.email,
      role: joan.role,
      accountType: joan.accountType,
      inviteStatus: joan.inviteStatus,
      emailVerified: joan.emailVerified,
      workerWelcomeEmailSentAt: joan.workerWelcomeEmailSentAt,
      landingPage: joan.landingPage,
      notificationPreferences: joan.notificationPreferences || null,
      pushSubscriptionsCount: Array.isArray(joan.pushSubscriptions)
        ? joan.pushSubscriptions.length
        : joan.pushSubscription
          ? 1
          : 0,
    },
    null,
    2,
  ),
);

const setDb = await couch('/settings/_all_docs?include_docs=true');
const related = (setDb.rows || [])
  .map((r) => r.doc)
  .filter((d) => d && !d._id?.startsWith('_design') && JSON.stringify(d).includes(BID));

console.log('settings_related_count', related.length);
for (const d of related) {
  const rules = Array.isArray(d.rules) ? d.rules : Array.isArray(d.alertRules) ? d.alertRules : [];
  const emailOn = rules.filter(
    (r) => r && r.enabled !== false && Array.isArray(r.channels) && r.channels.includes('email'),
  );
  console.log(
    JSON.stringify(
      {
        id: d._id,
        type: d.type,
        quietHours: d.quietHours || null,
        mutedCategories: d.mutedCategories || d.muted || null,
        totalRules: rules.length,
        emailEnabledCount: emailOn.length,
        emailEnabledRules: emailOn.map((r) => ({
          id: r.id || r.ruleId,
          name: r.name || r.title || r.label || null,
          channels: r.channels,
          priority: r.priority || null,
        })),
        keys: Object.keys(d).filter((k) => !k.startsWith('_')).slice(0, 40),
      },
      null,
      2,
    ),
  );
}

// Also try common alert doc ids
for (const path of [`/settings/alerts:${BID}`, `/settings/alert-settings:${BID}`]) {
  const s = await couch(path);
  if (!s.error) {
    console.log('direct_settings', path, Object.keys(s).filter((k) => !k.startsWith('_')));
  }
}

const dbs = await couch('/_all_dbs');
const teamHits = [];
for (const db of (dbs || []).filter((d) => !String(d).startsWith('_') && d !== 'accounts')) {
  try {
    const all = await couch(`/${db}/_all_docs?include_docs=true&limit=80000`);
    for (const row of all.rows || []) {
      const doc = row.doc;
      if (!doc) continue;
      const blob = JSON.stringify(doc);
      if (blob.includes(UID) || blob.includes('jotebe4@icloud.com') || (blob.includes(BID) && /member|team|invite/i.test(doc.type || doc._id || ''))) {
        if (blob.includes(UID) || blob.includes('jotebe4@icloud.com')) {
          teamHits.push({
            db,
            id: doc._id,
            type: doc.type,
            role: doc.role,
            name: doc.fullName || doc.name,
            email: doc.email,
            businessId: doc.businessId || doc.business_id || doc.user_id,
          });
        }
      }
    }
  } catch {
    /* skip */
  }
}
console.log('refs_to_joan', JSON.stringify(teamHits.slice(0, 50), null, 2));
