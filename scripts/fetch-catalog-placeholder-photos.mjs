#!/usr/bin/env node
/**
 * Descarga fotos realistas (Unsplash, licencia libre) para placeholders de catálogo/TPV.
 * Uso: node scripts/fetch-catalog-placeholder-photos.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/catalog-placeholders/photos');

/** photo-{timestamp}-{hash} de Unsplash → JPG 480×480 recortado */
const PHOTOS = {
  cola: 'photo-1622483767028-3f66f32aef97',
  'lemon-soda': 'photo-1513558161293-cdaf765ed2fd',
  'orange-soda': 'photo-1624517452488-04869289c4ca',
  water: 'photo-1523362628743-f0fcb9a2b8b1',
  beer: 'photo-1761315413964-f8f01e105dde',
  juice: 'photo-1600275666443-68d9b0862fc4',
  energy: 'photo-1622547746555-75bf0c7a5e7a',
  wine: 'photo-1510812431407-41d2bd2722f4',
  drink: 'photo-1546173159-315724a3167f',
  pizza: 'photo-1565299624946-b28f40a0ae38',
  burger: 'photo-1568901346375-23c9450c58cd',
  side: 'photo-1573080496219-bb080954c856',
  dessert: 'photo-1488477181946-6428a0291777',
  // Menú burger+patatas+refresco (no usar la misma que burger solo)
  combo: 'photo-1594212699903-ec8a3eca50f5',
  food: 'photo-1546069901-ba9599a7e63c',
  kebab: 'photo-1529006557810-274b1b4c1087',
  tapas: 'photo-1414235077428-338989a2e8c0',
  sushi: 'photo-1579584425558-c3ce17fd1871',
  cafe: 'photo-1495474472287-4d71bcdd2085',
  kitchen: 'photo-1504674900247-0877df9cc836',
  grocery: 'photo-1542838132-92c53300491e',
  restaurant: 'photo-1517248135460-4c3edb5e4f8f',
  'generic-brand': 'photo-1476224203421-9ac684bcb28f',
};

function photoUrl(id) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=480&h=480&q=85&fm=jpg`;
}

async function download(name, id) {
  const url = photoUrl(id);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000) throw new Error(`${name}: respuesta demasiado pequeña (${buf.length} B)`);
  await writeFile(resolve(OUT, `${name}.jpg`), buf);
  console.log(`OK ${name}.jpg (${Math.round(buf.length / 1024)} KB)`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  let failed = 0;
  for (const [name, id] of Object.entries(PHOTOS)) {
    try {
      await download(name, id);
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${name}:`, err.message);
    }
  }
  if (failed > 0) process.exitCode = 1;
}

main();
