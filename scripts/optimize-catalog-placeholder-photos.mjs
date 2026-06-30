#!/usr/bin/env node
/**
 * Comprime placeholders de catálogo/TPV (JPG → WebP, max 320px).
 * Uso: node scripts/optimize-catalog-placeholder-photos.mjs
 */
import { readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PHOTOS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/catalog-placeholders/photos');
const MAX_EDGE = 320;
const WEBP_QUALITY = 72;

/** Pizza/burger se ven mucho en TPV: miniaturas pequeñas, peso mínimo. */
const EXTRA_LIGHT = new Set(['pizza', 'burger']);
const EXTRA_LIGHT_MAX_EDGE = 220;
const EXTRA_LIGHT_QUALITY = 55;

async function optimizeToWebp(inputPath, baseName) {
  const quality = EXTRA_LIGHT.has(baseName) ? EXTRA_LIGHT_QUALITY : WEBP_QUALITY;
  const maxEdge = EXTRA_LIGHT.has(baseName) ? EXTRA_LIGHT_MAX_EDGE : MAX_EDGE;
  const before = (await stat(inputPath)).size;

  const buffer = await sharp(inputPath)
    .rotate()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'cover',
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 6, smartSubsample: true })
    .toBuffer();

  const outputPath = EXTRA_LIGHT.has(baseName)
    ? resolve(PHOTOS_DIR, `${baseName}-lite.webp`)
    : inputPath.replace(/\.jpe?g$/i, '.webp');
  await writeFile(outputPath, buffer);

  const after = buffer.length;
  return { baseName, before, after, outputPath };
}

async function main() {
  const entries = await readdir(PHOTOS_DIR);
  const jpgs = entries.filter((name) => /\.jpe?g$/i.test(name));
  const extraLightWebps = entries.filter(
    (name) => /\.webp$/i.test(name) && EXTRA_LIGHT.has(name.replace(/\.webp$/i, '')),
  );

  if (jpgs.length === 0 && extraLightWebps.length === 0) {
    console.log('Nada que optimizar en', PHOTOS_DIR);
    return;
  }

  let totalBefore = 0;
  let totalAfter = 0;

  for (const name of jpgs.sort()) {
    const baseName = name.replace(/\.jpe?g$/i, '');
    const filePath = resolve(PHOTOS_DIR, name);
    try {
      const result = await optimizeToWebp(filePath, baseName);
      totalBefore += result.before;
      totalAfter += result.after;
      console.log(
        `${baseName}: ${Math.round(result.before / 1024)}KB → ${Math.round(result.after / 1024)}KB (.webp)`,
      );
    } catch (err) {
      console.error(`FAIL ${name}:`, err instanceof Error ? err.message : err);
    }
  }

  for (const name of extraLightWebps.sort()) {
    const baseName = name.replace(/\.webp$/i, '');
    const filePath = resolve(PHOTOS_DIR, name);
    try {
      const result = await optimizeToWebp(filePath, baseName);
      totalBefore += result.before;
      totalAfter += result.after;
      console.log(
        `${baseName} (recompress): ${Math.round(result.before / 1024)}KB → ${Math.round(result.after / 1024)}KB`,
      );
    } catch (err) {
      console.error(`FAIL ${name}:`, err instanceof Error ? err.message : err);
    }
  }

  if (totalBefore > 0) {
    console.log(
      `Total: ${Math.round(totalBefore / 1024)}KB → ${Math.round(totalAfter / 1024)}KB WebP`,
    );
  }
}

main();
