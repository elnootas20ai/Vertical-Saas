#!/usr/bin/env node
/**
 * Prueba COUCHDB_* desde tu .env local (o variables ya exportadas).
 * Uso: node scripts/verify-couch.mjs
 */
import '../config/env.js';

function getCouchBase() {
  const url = String(process.env.COUCHDB_URL || '').trim();
  if (url) return url.replace(/\/+$/, '');

  const host = String(process.env.COUCHDB_HOST || '').trim();
  if (!host) return '';

  const protocol = String(process.env.COUCHDB_PROTOCOL || 'http').trim() || 'http';
  const portRaw = String(process.env.COUCHDB_PORT || '5984').trim();
  const port = /^\d+$/.test(portRaw) ? portRaw : '5984';

  return `${protocol}://${host}:${port}`;
}

const base = getCouchBase();
const user = String(process.env.COUCHDB_USER || '').trim();
const pass = String(process.env.COUCHDB_PASSWORD || '').trim();

if (!base) {
  console.error(
    '❌ CouchDB no está configurado. Define COUCHDB_URL (ej: http://51.159.118.39:5984) o COUCHDB_HOST (+ opcional COUCHDB_PROTOCOL/COUCHDB_PORT).',
  );
  process.exit(1);
}

const auth =
  user && pass ? `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` : '';

try {
  const res = await fetch(`${base}/_up`, {
    headers: auth ? { Authorization: auth } : {},
  });
  const text = await res.text();
  if (res.ok) {
    console.log('✅ CouchDB responde OK en', `${base}/_up`, '→', res.status, text.slice(0, 80));
    process.exit(0);
  }
  console.error('❌ Respuesta no OK:', res.status, text.slice(0, 200));
  process.exit(1);
} catch (e) {
  console.error('❌ No se pudo conectar:', e.message);
  console.error('   Revisa URL, puerto abierto, firewall y TLS.');
  process.exit(1);
}
