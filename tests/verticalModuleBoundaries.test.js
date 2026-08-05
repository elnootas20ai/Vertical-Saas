/**
 * Comprueba que delivery y compraventa no importen lógica de negocio del otro vertical.
 * Ejecutar: npm run test:verticals
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SRC = join(ROOT, 'src', 'app');

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(full, acc);
    } else if (/\.(tsx?|jsx?)$/.test(name)) {
      acc.push(full);
    }
  }
  return acc;
}

function rel(p) {
  return relative(ROOT, p).replace(/\\/g, '/');
}

function fileBelongsToVertical(filePath, moduleDef) {
  const r = rel(filePath);
  if (moduleDef.codeRoots.some((root) => r.startsWith(root.replace(/\\/g, '/')))) {
    return true;
  }
  if (moduleDef.id === 'delivery') {
    const base = r.split('/').pop() || '';
    if (r.startsWith('src/app/pages/saas/') && /^Delivery/i.test(base)) return true;
  }
  if (moduleDef.id === 'restaurant') {
    if (r.startsWith('src/app/lib/restaurant')) return true;
    if (r.startsWith('src/app/lib/sala')) return true;
  }
  if (moduleDef.id === 'compraventa' && r.startsWith('src/app/lib/compraventa')) {
    return true;
  }
  if (moduleDef.id === 'butcher') {
    const base = r.split('/').pop() || '';
    if (r.startsWith('src/app/pages/saas/') && /^Butcher/i.test(base)) return true;
    if (r.startsWith('src/app/pages/saas/worker/') && /Butcher/i.test(base)) return true;
    if (r.startsWith('src/app/lib/butcher')) return true;
    if (r.startsWith('src/app/pages/saas/dashboards/Butcher')) return true;
  }
  if (moduleDef.id === 'heladeria') {
    if (r.startsWith('src/app/verticals/heladeria')) return true;
    const base = r.split('/').pop() || '';
    if (r.startsWith('src/app/pages/saas/') && /^Heladeria/i.test(base)) return true;
  }
  return false;
}

const DELIVERY_ONLY_IMPORT_PATTERNS = [
  /\/pages\/saas\/Delivery/,
  /\/pages\/saas\/delivery\//,
  /\/pages\/saas\/TpvRapidoPage/,
  /\/pages\/saas\/worker\/WorkerTpvDelivery/,
  /\/components\/delivery\//,
  /\/lib\/deliveryCatalog/,
  /\/lib\/deliveryTicket/,
  /\/lib\/deliveryCrm/,
  /\/lib\/deliveryKitchen/,
  /\/lib\/deliveryReparto/,
  /\/lib\/deliveryMontaje/,
  /\/lib\/deliveryIntegrations/,
  /\/lib\/deliveryAlert/,
  /\/lib\/deliveryOps/,
  /\/lib\/deliveryStock/,
  /\/lib\/deliveryActa/,
  /\/verticals\/delivery\//,
];

const RESTAURANT_ONLY_IMPORT_PATTERNS = [
  /\/verticals\/restaurant\//,
  /\/pages\/saas\/restaurant\//,
  /\/components\/saas\/restaurant\//,
  /\/components\/saas\/sala\//,
  /\/lib\/restaurantCajaApi/,
  /\/lib\/restaurantCloseWarnings/,
  /\/lib\/restaurantFloorReservations/,
  /\/lib\/restaurantReservationsApi/,
  /\/lib\/salaApi/,
  /\/lib\/salaRoom/,
  /\/lib\/salaStoreTpv/,
  /\/lib\/salaTpvLaunch/,
];

const COMPRAVENTA_ONLY_IMPORT_PATTERNS = [
  /\/pages\/saas\/vertical\/compraventa\//,
  /\/components\/saas\/compraventa\//,
  /\/lib\/compraventa/,
  /\/lib\/vehicleAcquisition/,
  /\/verticals\/compraventa\//,
];

const BUTCHER_ONLY_IMPORT_PATTERNS = [
  /\/pages\/saas\/Butcher/,
  /\/pages\/saas\/dashboards\/Butcher/,
  /\/lib\/butcher/,
  /\/verticals\/butcher\//,
  /\/pages\/saas\/worker\/WorkerTpvButcherShop/,
  /\/pages\/saas\/worker\/WorkerButcher/,
];

const HELADERIA_ONLY_IMPORT_PATTERNS = [
  /\/verticals\/heladeria\//,
  /\/pages\/saas\/Heladeria/,
];

const IMPORT_RE =
  /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function collectImports(source) {
  const out = [];
  let m;
  while ((m = IMPORT_RE.exec(source)) !== null) {
    out.push(m[1] || m[2]);
  }
  return out;
}

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return spec;
  if (spec.startsWith('@/')) {
    return join(SRC, spec.slice(2)).replace(/\\/g, '/');
  }
  const dir = join(fromFile, '..');
  return join(dir, spec).replace(/\\/g, '/');
}

function scanCrossVerticalViolations(ownerModule, forbiddenPatterns, isLegacyShared) {
  const files = walk(SRC).filter((f) => fileBelongsToVertical(f, ownerModule));
  const violations = [];

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const spec of collectImports(src)) {
      const resolved = resolveImport(file, spec);
      if (forbiddenPatterns.some((re) => re.test(resolved) || re.test(spec))) {
        if (isLegacyShared(spec) || isLegacyShared(resolved)) continue;
        violations.push({ file: rel(file), import: spec });
      }
    }
  }

  return violations;
}

describe('vertical module boundaries', () => {
  it('registro delivery, restaurant, compraventa, butcher y heladeria tienen ids distintos', async () => {
    const { DELIVERY_MODULE } = await import('../src/app/verticals/delivery/module.ts');
    const { RESTAURANT_MODULE } = await import('../src/app/verticals/restaurant/module.ts');
    const { COMPRAVENTA_MODULE } = await import('../src/app/verticals/compraventa/module.ts');
    const { BUTCHER_MODULE } = await import('../src/app/verticals/butcher/module.ts');
    const { HELADERIA_MODULE } = await import('../src/app/verticals/heladeria/module.ts');
    expect(DELIVERY_MODULE.id).toBe('delivery');
    expect(RESTAURANT_MODULE.id).toBe('restaurant');
    expect(COMPRAVENTA_MODULE.id).toBe('compraventa');
    expect(BUTCHER_MODULE.id).toBe('butcher');
    expect(HELADERIA_MODULE.id).toBe('heladeria');
    expect(BUTCHER_MODULE.businessType).toBe('butcherShop');
    expect(HELADERIA_MODULE.businessType).toBe('iceCreamShop');
    expect(DELIVERY_MODULE.businessType).not.toBe(HELADERIA_MODULE.businessType);
  });

  it('compraventa no importa lógica de negocio delivery (solo legacy PDV permitido)', async () => {
    const { COMPRAVENTA_MODULE } = await import('../src/app/verticals/compraventa/module.ts');
    const { isLegacySharedCrossVerticalImport } = await import('../src/app/verticals/registry.ts');
    const violations = scanCrossVerticalViolations(
      COMPRAVENTA_MODULE,
      DELIVERY_ONLY_IMPORT_PATTERNS,
      isLegacySharedCrossVerticalImport,
    );
    expect(violations).toEqual([]);
  });

  it('delivery no importa lógica de negocio compraventa', async () => {
    const { DELIVERY_MODULE } = await import('../src/app/verticals/delivery/module.ts');
    const { isLegacySharedCrossVerticalImport } = await import('../src/app/verticals/registry.ts');
    const violations = scanCrossVerticalViolations(
      DELIVERY_MODULE,
      COMPRAVENTA_ONLY_IMPORT_PATTERNS,
      isLegacySharedCrossVerticalImport,
    );
    expect(violations).toEqual([]);
  });

  it('legacySharedImports incluye deliverySetup y deliveryApi', async () => {
    const { isLegacySharedCrossVerticalImport } = await import('../src/app/verticals/registry.ts');
    expect(isLegacySharedCrossVerticalImport('./deliverySetup')).toBe(true);
    expect(isLegacySharedCrossVerticalImport('../lib/deliveryApi')).toBe(true);
    expect(isLegacySharedCrossVerticalImport('../lib/deliveryCatalogImport')).toBe(false);
  });

  it('delivery no reclama rutas de sala/caja restaurant', async () => {
    const { isDeliveryModuleRoute } = await import('../src/app/verticals/delivery/module.ts');
    const { isRestaurantModuleRoute } = await import('../src/app/verticals/restaurant/module.ts');
    expect(isDeliveryModuleRoute('/saas/caja')).toBe(false);
    expect(isDeliveryModuleRoute('/saas/sala')).toBe(false);
    expect(isDeliveryModuleRoute('/saas/cocina')).toBe(false);
    expect(isDeliveryModuleRoute('/saas/vertical/delivery/caja')).toBe(true);
    expect(isRestaurantModuleRoute('/saas/caja')).toBe(true);
    expect(isRestaurantModuleRoute('/saas/sala')).toBe(true);
    expect(isRestaurantModuleRoute('/saas/vertical/delivery/caja')).toBe(false);
  });

  it('restaurant no importa pantallas/lib de negocio delivery', async () => {
    const { RESTAURANT_MODULE } = await import('../src/app/verticals/restaurant/module.ts');
    const { isLegacySharedCrossVerticalImport } = await import('../src/app/verticals/registry.ts');
    const violations = scanCrossVerticalViolations(
      RESTAURANT_MODULE,
      DELIVERY_ONLY_IMPORT_PATTERNS,
      isLegacySharedCrossVerticalImport,
    );
    expect(violations).toEqual([]);
  });

  it('delivery no importa pantallas/lib de negocio restaurant', async () => {
    const { DELIVERY_MODULE } = await import('../src/app/verticals/delivery/module.ts');
    const { isLegacySharedCrossVerticalImport } = await import('../src/app/verticals/registry.ts');
    const violations = scanCrossVerticalViolations(
      DELIVERY_MODULE,
      RESTAURANT_ONLY_IMPORT_PATTERNS,
      isLegacySharedCrossVerticalImport,
    );
    expect(violations).toEqual([]);
  });

  it('butcher no importa pantallas/lib de negocio delivery', async () => {
    const { BUTCHER_MODULE } = await import('../src/app/verticals/butcher/module.ts');
    const { isLegacySharedCrossVerticalImport } = await import('../src/app/verticals/registry.ts');
    const violations = scanCrossVerticalViolations(
      BUTCHER_MODULE,
      DELIVERY_ONLY_IMPORT_PATTERNS,
      isLegacySharedCrossVerticalImport,
    );
    expect(violations).toEqual([]);
  });

  it('delivery no importa pantallas/lib de negocio butcher', async () => {
    const { DELIVERY_MODULE } = await import('../src/app/verticals/delivery/module.ts');
    const { isLegacySharedCrossVerticalImport } = await import('../src/app/verticals/registry.ts');
    const violations = scanCrossVerticalViolations(
      DELIVERY_MODULE,
      BUTCHER_ONLY_IMPORT_PATTERNS,
      isLegacySharedCrossVerticalImport,
    );
    expect(violations).toEqual([]);
  });

  it('heladeria no importa pantallas/lib de negocio delivery', async () => {
    const { HELADERIA_MODULE } = await import('../src/app/verticals/heladeria/module.ts');
    const { isLegacySharedCrossVerticalImport } = await import('../src/app/verticals/registry.ts');
    const violations = scanCrossVerticalViolations(
      HELADERIA_MODULE,
      DELIVERY_ONLY_IMPORT_PATTERNS,
      isLegacySharedCrossVerticalImport,
    );
    expect(violations).toEqual([]);
  });

  it('delivery no importa pantallas/lib de negocio heladeria', async () => {
    const { DELIVERY_MODULE } = await import('../src/app/verticals/delivery/module.ts');
    const { isLegacySharedCrossVerticalImport } = await import('../src/app/verticals/registry.ts');
    const violations = scanCrossVerticalViolations(
      DELIVERY_MODULE,
      HELADERIA_ONLY_IMPORT_PATTERNS,
      isLegacySharedCrossVerticalImport,
    );
    expect(violations).toEqual([]);
  });
});
