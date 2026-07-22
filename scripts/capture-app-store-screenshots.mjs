/**
 * Genera capturas App Store Connect en tamaños exactos:
 * - iPhone 6,5": 1284 × 2778  (CSS 428×926 @3x)
 * - iPad 13":    2064 × 2752  (CSS 1032×1376 @2x)
 *
 * Uso:
 *   node scripts/capture-app-store-screenshots.mjs
 *
 * Credenciales (en orden):
 *   APPLE_REVIEW_EMAIL / APPLE_REVIEW_PASSWORD
 *   SAAS_LOGIN_EMAIL / SAAS_LOGIN_PASSWORD
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
try {
  require('dotenv').config({ path: '.env.development' });
  require('dotenv').config({ path: '.env' });
} catch {
  /* optional */
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'app-store-screenshots');

const BASE = process.env.APP_STORE_SHOT_URL || 'http://localhost:3015';
const EMAIL = String(
  process.env.APPLE_REVIEW_EMAIL || process.env.SAAS_LOGIN_EMAIL || 'apple-review@vertialapp.com',
).trim();
const PASSWORD = String(
  process.env.APPLE_REVIEW_PASSWORD || process.env.SAAS_LOGIN_PASSWORD || 'VertialApple2026!',
).trim();

/**
 * viewport = CSS points; deviceScaleFactor hace que el PNG salga en px físicos Apple.
 */
const DEVICES = [
  {
    id: 'iphone-65',
    label: 'iPhone 6.5"',
    width: 428,
    height: 926,
    deviceScaleFactor: 3,
    expectW: 1284,
    expectH: 2778,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  {
    id: 'ipad-13',
    label: 'iPad 13"',
    width: 1032,
    height: 1376,
    deviceScaleFactor: 2,
    expectW: 2064,
    expectH: 2752,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
];

/** Solo pantallas en uso (Apple 2.3.3: sin splash/login). Genérico SaaS. */
const SCENES = [
  { slug: '01-dashboard', path: '/saas/dashboard', needsAuth: true },
  { slug: '02-clients', path: '/saas/clients', needsAuth: true },
  { slug: '03-team', path: '/saas/team', needsAuth: true },
  { slug: '04-settings', path: '/saas/settings', needsAuth: true },
];

async function settle(page, ms = 1200) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(ms);
  await acceptCookies(page);
}

async function acceptCookies(page) {
  await page.getByRole('button', { name: /Aceptar todas/i }).click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(250);
}

async function login(page) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(800);
  await acceptCookies(page);

  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);

  const loginResponse = page.waitForResponse(
    (res) => res.url().includes('/api/auth/login') && res.request().method() === 'POST',
    { timeout: 45_000 },
  );
  await page.locator('button[type="submit"]').first().click();
  const res = await loginResponse;
  if (!res.ok()) {
    const body = await res.text().catch(() => '');
    throw new Error(`Login API ${res.status()}: ${body.slice(0, 200)}`);
  }

  await page.waitForURL(
    (url) => {
      const p = url.pathname;
      return p.includes('/auth/gate') || p.startsWith('/saas') || p.includes('/native');
    },
    { timeout: 60_000 },
  );
  await page.waitForTimeout(1500);
  await acceptCookies(page);

  const cookies = await page.context().cookies();
  const hasAuth = cookies.some((c) => c.name === 'access_token' || c.name === 'refresh_token');
  console.log(`[ok] Sesión → ${page.url()} (authCookie=${hasAuth})`);
  if (!hasAuth) {
    throw new Error(`Login sin access_token. url=${page.url()}`);
  }
}

async function shot(page, device, scene) {
  const dir = path.join(OUT, device.id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${scene.slug}.png`);

  // Si ya estamos en la ruta (p.ej. gate tras login), no forzar reload
  const current = new URL(page.url()).pathname;
  if (current !== scene.path && !(scene.path === '/saas' && current.startsWith('/saas'))) {
    await page.goto(`${BASE}${scene.path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  }
  await settle(page, 1600);

  for (let i = 0; i < 12; i++) {
    if (!page.url().includes('/auth/gate') || scene.path.includes('gate')) break;
    await page.waitForTimeout(400);
  }
  await settle(page, 600);

  if (scene.needsAuth && page.url().includes('/auth/login')) {
    console.warn(`[skip] ${device.id}/${scene.slug} — sin sesión (url=${page.url()})`);
    return null;
  }

  await page.screenshot({ path: file, fullPage: false, type: 'png' });

  const buf = fs.readFileSync(file);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const ok = w === device.expectW && h === device.expectH;
  console.log(
    `[${ok ? 'ok' : '!!'}] ${device.label} ${scene.slug}: ${w}×${h} (esperado ${device.expectW}×${device.expectH}) → ${path.relative(ROOT, file)}`,
  );
  return file;
}

async function captureDevice(browser, device) {
  console.log(`\n=== ${device.label} CSS ${device.width}×${device.height} @${device.deviceScaleFactor}x → ${device.expectW}×${device.expectH} ===`);

  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
    userAgent: device.userAgent,
    colorScheme: 'light',
    locale: 'es-ES',
  });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /Aceptar todas/i }).click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(400);

    await login(page);

    // Saltar gate/onboarding si aparece
    if (page.url().includes('/auth/gate')) {
      await page.getByRole('button', { name: /Continuar|Entrar|Empezar|Ir al panel/i }).click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(800);
    }

    for (const scene of SCENES) {
      await shot(page, device, scene);
    }
  } finally {
    await context.close();
  }
}

async function main() {
  if (fs.existsSync(OUT)) {
    fs.rmSync(OUT, { recursive: true, force: true });
  }
  fs.mkdirSync(OUT, { recursive: true });

  console.log(`Base: ${BASE}`);
  console.log(`Usuario: ${EMAIL}`);
  console.log(`Salida: ${OUT}`);

  const browser = await chromium.launch({ headless: true });
  try {
    for (const device of DEVICES) {
      await captureDevice(browser, device);
    }
  } finally {
    await browser.close();
  }

  console.log('\nListo. Sube en App Store Connect (sin login/splash):');
  console.log(`  iPhone 6,5" → ${path.join(OUT, 'iphone-65')}`);
  console.log(`  iPad 13"    → ${path.join(OUT, 'ipad-13')}`);
  console.log('Orden sugerido: dashboard → clients → team → settings.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
