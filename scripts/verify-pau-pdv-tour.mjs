#!/usr/bin/env node
import '../config/env.js';

const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' + Buffer.from(`${process.env.COUCHDB_USER}:${process.env.COUCHDB_PASSWORD}`).toString('base64');

async function get(db, id) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/${encodeURIComponent(id)}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  return res.json();
}

const docs = [
  ['bbddsaas-delivery', 'pdv-594a8503-1515-47b8-9e02-fb8ff09052b6'],
  ['bbddsaas-delivery', 'pdv-934ce697-314d-46e5-bc9b-e0a2afee3bf7'],
  ['bbddsaas-sales-points', 'wc-16361270-5794-4b95-89e5-644685f36e24'],
  ['bbddsaas-sales-points', 'wc-ffdee346-8730-4aeb-961d-24832f17f1c1'],
  ['accounts', 'setup_progress:13e49ef6-183a-4afa-a17b-7730917fe685'],
];

for (const [db, id] of docs) {
  const d = await get(db, id);
  const out = {
    db,
    id,
    name: d.name,
    business_id: d.business_id || d.businessId || null,
    user_id: d.user_id || null,
    type: d.type || null,
    centerType: d.centerType || null,
    active: d.active,
    error: d.error || null,
  };
  if (Array.isArray(d.steps)) {
    out.overallCompleted = d.overallCompleted;
    out.steps = d.steps.map((s) => ({
      key: s.key,
      completed: !!s.completed,
      required: !!s.required,
    }));
  }
  console.log(JSON.stringify(out));
}
