/**
 * Exporta docs/Vertial-Presentacion.html → docs/Vertial-Presentacion.pdf
 * node scripts/export-vertial-presentacion-pdf.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(__dirname, '..', 'docs', 'Vertial-Presentacion.html');
const outPath = join(__dirname, '..', 'docs', 'Vertial-Presentacion.pdf');

mkdirSync(dirname(outPath), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  if (document.fonts?.ready) await document.fonts.ready;
});
await page.pdf({
  path: outPath,
  width: '297mm',
  height: '210mm',
  printBackground: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
  preferCSSPageSize: false,
});
await browser.close();
console.log(`OK → ${outPath}`);
