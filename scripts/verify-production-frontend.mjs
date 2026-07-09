#!/usr/bin/env node
/** Comprueba si el bundle JS principal de producción existe (evita pantalla en blanco). */
const ORIGIN = String(process.env.VERIFY_ORIGIN || 'https://vertialapp.com').replace(/\/+$/, '');
const MIN_BYTES = 500_000;

const htmlRes = await fetch(`${ORIGIN}/`);
if (!htmlRes.ok) {
  console.error(`[verify] HTML ${htmlRes.status} en ${ORIGIN}`);
  process.exit(1);
}
const html = await htmlRes.text();
const match = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/);
if (!match) {
  console.error('[verify] index.html no referencia index-*.js');
  process.exit(1);
}

const bundleName = match[1];
const bundleUrl = `${ORIGIN}/assets/${bundleName}`;
const jsRes = await fetch(bundleUrl);
const body = await jsRes.text();

if (!jsRes.ok) {
  console.error(`[verify] ${bundleUrl} -> HTTP ${jsRes.status}`);
  process.exit(1);
}

if (body.trimStart().startsWith('<!DOCTYPE') || body.trimStart().startsWith('<html')) {
  console.error(`[verify] ROTO: ${bundleUrl} devuelve HTML (nginx fallback) — pantalla en blanco`);
  console.error('[verify] Solución: npm run deploy:frontend (sube dist/assets/ completo)');
  process.exit(1);
}

const bytes = Buffer.byteLength(body, 'utf8');
if (bytes < MIN_BYTES) {
  console.error(`[verify] ROTO: ${bundleName} solo ${bytes} bytes (esperado > ${MIN_BYTES})`);
  process.exit(1);
}

console.log(`[verify] OK ${bundleName} (${Math.round(bytes / 1024 / 1024)} MB) en ${ORIGIN}`);
