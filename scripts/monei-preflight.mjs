#!/usr/bin/env node
/**
 * Comprueba que el entorno está listo para activar MONEI.
 * Uso: node scripts/monei-preflight.mjs
 */
import '../config/env.js';

const mode = String(process.env.MONEI_MODE || 'test').toLowerCase() === 'live' ? 'live' : 'test';
const skipMonei = ['1', 'true', 'yes'].includes(
  String(process.env.SKIP_MONEI_SUBSCRIPTION || '').trim().toLowerCase(),
);
const skipVerify = ['1', 'true', 'yes'].includes(
  String(process.env.MONEI_WEBHOOK_SKIP_VERIFY || '').trim().toLowerCase(),
);

function readKey(...names) {
  for (const n of names) {
    const v = String(process.env[n] || '').trim();
    if (v) return v;
  }
  return '';
}

const liveKey = readKey('TOKEN_API_KEY', 'MONEI_API_KEY');
const testKey = readKey('TOKEN_API_KEY_TEST', 'MONEI_API_KEY_TEST');
const appUrl = String(process.env.APP_URL || '').trim();

const checks = [];
const warn = (msg) => checks.push({ level: 'warn', msg });
const ok = (msg) => checks.push({ level: 'ok', msg });
const fail = (msg) => checks.push({ level: 'fail', msg });

ok(`MONEI_MODE=${mode}`);

if (skipMonei) {
  warn('SKIP_MONEI_SUBSCRIPTION está activo — los pagos no irán a MONEI');
} else {
  ok('SKIP_MONEI_SUBSCRIPTION desactivado');
}

if (skipVerify) {
  warn('MONEI_WEBHOOK_SKIP_VERIFY activo — firmas webhook NO se validan (solo dev)');
} else {
  ok('Verificación de firma webhook activa');
}

if (mode === 'live') {
  if (liveKey.startsWith('pk_live_')) ok('TOKEN_API_KEY (live) configurada');
  else fail('Falta TOKEN_API_KEY / MONEI_API_KEY (pk_live_…) para modo live');
} else {
  if (testKey.startsWith('pk_test_')) ok('TOKEN_API_KEY_TEST configurada');
  else fail('Falta TOKEN_API_KEY_TEST / MONEI_API_KEY_TEST (pk_test_…) para modo test');
}

if (!appUrl) {
  fail('Falta APP_URL (ej. https://vertialapp.com)');
} else if (appUrl.includes('localhost') && mode === 'live') {
  warn(`APP_URL=${appUrl} — en live debe ser HTTPS público para redirects/webhooks`);
} else {
  ok(`APP_URL=${appUrl}`);
  const base = appUrl.replace(/\/$/, '');
  ok(`Webhook status: ${base}/api/subscriptions/webhook/status`);
  ok(`Webhook payment: ${base}/api/subscriptions/webhook/payment`);
  ok(`Return URL: ${base}/saas/settings/facturacion?subscription_complete=true&...`);
}

const fails = checks.filter((c) => c.level === 'fail');
const warns = checks.filter((c) => c.level === 'warn');

console.log('\n=== MONEI preflight ===\n');
for (const c of checks) {
  const icon = c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '✗';
  console.log(` ${icon} ${c.msg}`);
}
console.log('');

if (fails.length) {
  console.log(`Resultado: ${fails.length} error(es). Corrige .env antes de activar MONEI.\n`);
  process.exit(1);
}
if (warns.length) {
  console.log(`Resultado: OK con ${warns.length} aviso(s). Revisa antes de producción.\n`);
  process.exit(0);
}
console.log('Resultado: listo para pruebas MONEI.\n');
