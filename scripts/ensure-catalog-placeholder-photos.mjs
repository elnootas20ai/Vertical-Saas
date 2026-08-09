#!/usr/bin/env node
/**
 * Regenera fotos placeholder faltantes (mapa CATALOG_PRODUCT_PLACEHOLDER_URLS).
 * Uso: node scripts/ensure-catalog-placeholder-photos.mjs
 */
import { access, mkdir, readdir, writeFile, rename, unlink, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/catalog-placeholders/photos');
const UA = {
  'User-Agent': 'VertialCatalogBot/1.0 (catalog placeholders; contact vertial)',
  Accept: 'image/jpeg,image/png,image/*,*/*',
};

/** name → lista de fuentes (unsplash id o URL absoluta). Primera que funcione gana. */
const SOURCES = {
  'orange-soda': [
    'photo-1624517452488-04869289c4ca',
    'photo-1622597467836-f606f2a6a6d6',
  ],
  aquarius: [
    // botella / refresco naranja (isotónico style)
    'photo-1624517452488-04869289c4ca',
    'photo-1544145945-f90425340c7e',
  ],
  'aquarius-lemon-can': [
    'photo-1513558161293-cdaf765ed2fd',
    'photo-1623065422902-30a2d299bbe4',
  ],
  'fanta-lemon-can': [
    'photo-1513558161293-cdaf765ed2fd',
    'photo-1623065422902-30a2d299bbe4',
  ],
  'fanta-lemon-2l': [
    'photo-1629203851122-3726ecdf080e',
    'photo-1513558161293-cdaf765ed2fd',
  ],
  desperados: [
    'https://upload.wikimedia.org/wikipedia/commons/9/9c/Desperados.jpg',
    'photo-1608270586620-248524c67de9',
  ],
  'cerdos-voladores': [
    // IPA / cerveza artesana genérica (marca local sin foto libre)
    'photo-1618885472179-5e474019f2a9',
    'photo-1608270586620-248524c67de9',
  ],
  'wine-red': [
    'photo-1474722883778-792e7990302f',
    'photo-1510812431407-41d2bd2722f4',
  ],
  'pizza-carbonara': [
    'photo-1565299624946-b28f40a0ae38',
    'photo-1574071318508-1cdbab80d264',
  ],
  'pizza-bacon': [
    'photo-1628840042765-356cda07504e',
    'photo-1565299624946-b28f40a0ae38',
  ],
  'pizza-bbq': [
    'photo-1513104890138-7c749659a591',
    'photo-1565299624946-b28f40a0ae38',
  ],
  'onion-rings': [
    'photo-1626082927389-6cd097cdc6ec',
    'photo-1573080496219-bb080954c856',
  ],
  wings: [
    'photo-1527477396000-e27163b481c2',
    'photo-1567620832904-9fe5cf23db13',
  ],
  'brownie-helado': [
    'photo-1606313564200-e75d5e30476c',
    'photo-1488477181946-6428a0291777',
  ],
};

const REQUIRED = Object.keys(SOURCES);

function unsplashUrl(id) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=640&h=640&q=85&fm=jpg`;
}

async function fetchBuffer(src) {
  const url = src.startsWith('http') ? src : unsplashUrl(src);
  const res = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 4000) throw new Error(`too small (${buf.length})`);
  return buf;
}

async function saveWebp(name, buf) {
  const webp = await sharp(buf)
    .rotate()
    .resize({ width: 320, height: 320, fit: 'cover' })
    .webp({ quality: 72, effort: 6 })
    .toBuffer();
  const out = resolve(DIR, `${name}.webp`);
  const tmp = resolve(DIR, `${name}.new.webp`);
  await writeFile(tmp, webp);
  try {
    await unlink(out).catch(() => {});
    await rename(tmp, out);
  } catch {
    await copyFile(tmp, out);
    await unlink(tmp).catch(() => {});
  }
  return webp.length;
}

async function exists(name) {
  try {
    await access(resolve(DIR, `${name}.webp`));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(DIR, { recursive: true });
  const onlyMissing = !process.argv.includes('--all');
  let ok = 0;
  let fail = 0;

  for (const name of REQUIRED) {
    if (onlyMissing && (await exists(name))) {
      console.log(`SKIP ${name}.webp (ya existe)`);
      ok += 1;
      continue;
    }
    const candidates = SOURCES[name] || [];
    let saved = false;
    for (const src of candidates) {
      try {
        const buf = await fetchBuffer(src);
        const bytes = await saveWebp(name, buf);
        console.log(`OK ${name}.webp (${Math.round(bytes / 1024)} KB) ← ${src}`);
        saved = true;
        ok += 1;
        break;
      } catch (err) {
        console.warn(`  try fail ${name} ← ${src}: ${err.message}`);
      }
    }
    if (!saved) {
      console.error(`FAIL ${name}.webp`);
      fail += 1;
    }
  }

  const disk = new Set(await readdir(DIR));
  const mapFile = resolve(DIR, '../../..', 'src/app/lib/catalogProductPlaceholders.ts');
  // verify via hard-coded list from map (same REQUIRED + known base set checked by tests)
  const stillMissing = REQUIRED.filter((n) => !disk.has(`${n}.webp`));
  console.log(`\nDone: ok=${ok} fail=${fail} stillMissing=${stillMissing.length}`);
  if (stillMissing.length) {
    console.error(stillMissing.join(', '));
    process.exitCode = 1;
  }
}

main();
