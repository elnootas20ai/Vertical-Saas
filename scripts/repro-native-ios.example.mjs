/**
 * Plantilla para probar la app como iPhone (WebKit) en tu PC, sin compilar iOS.
 *
 * 1. Copia este archivo a scripts/repro-native-ios.mjs (está en .gitignore).
 * 2. Arranca backend local: npm run backend:dev
 * 3. Arranca frontend: npm run dev:3016  (o el puerto que uses)
 * 4. npm run repro:ios
 *
 * Variables de entorno opcionales:
 *   REPRO_BASE=http://127.0.0.1:3016
 *   REPRO_EMAIL=tu@email.com
 *   REPRO_PASSWORD=tu-clave
 *   REPRO_WEB=1   (modo web normal, sin simular Capacitor nativo)
 */
import { webkit } from 'playwright';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = !process.argv.includes('--web') && process.env.REPRO_WEB !== '1';
const BASE = String(process.env.REPRO_BASE || 'http://127.0.0.1:3016').replace(/\/$/, '');
const EMAIL = process.env.REPRO_EMAIL || 'tu@email.com';
const PASSWORD = process.env.REPRO_PASSWORD || 'tu-clave';

const browser = await webkit.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
});

if (NATIVE) {
  await context.addInitScript(() => {
    window.Capacitor = {
      getPlatform: () => 'ios',
      isNativePlatform: () => true,
    };
    window.webkit = window.webkit || {};
    window.webkit.messageHandlers = window.webkit.messageHandlers || {};
    window.webkit.messageHandlers.bridge = { postMessage: () => {} };
  });
}

const page = await context.newPage();
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));

console.log(`Modo: ${NATIVE ? 'NATIVO simulado (JS)' : 'WEB'}`);
console.log(`URL: ${BASE}`);
console.log('NOTA: la impresión WiFi real solo funciona en iPhone con la app nativa; aquí validas UI y que no se quede colgado.');

await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

try {
  await page.fill('input[type="email"]', EMAIL, { timeout: 8000 });
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
} catch (err) {
  console.error('Login falló — revisa REPRO_EMAIL / REPRO_PASSWORD:', err.message);
}

await page.waitForTimeout(5000);
console.log('URL tras login:', page.url());

for (const path of [
  '/saas/settings?tab=impresion-tpv',
  '/saas/vertical/delivery/tpv',
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const name = path.includes('settings') ? 'settings-tickets' : 'tpv';
  const outDir = dirname(fileURLToPath(import.meta.url));
  await page.screenshot({ path: join(outDir, `repro-${name}.png`) });
  console.log(`OK screenshot: repro-${name}.png`);
}

if (errors.length) {
  console.log('\nErrores JS capturados:');
  for (const e of errors) console.log('-', e);
} else {
  console.log('\nSin errores JS en consola.');
}

await browser.close();
