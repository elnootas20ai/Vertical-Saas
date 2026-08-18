/**
 * Genera Excel de prueba para carta bar/restaurante (familia → subfamilia).
 * Uso: node scripts/build-restaurant-catalog-excel.mjs
 * Opcional: BRAND="Mi Bar" node scripts/build-restaurant-catalog-excel.mjs
 * Output: exports/plantilla_catalogo_bar_restaurante_prueba.xlsx
 *
 * Columna categoria = subfamilia (Refrescos, Cervezas…).
 * Columna linea = nombre de tu marca en Ajustes (no un local concreto).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'exports');
const outFile = path.join(outDir, 'plantilla_catalogo_bar_restaurante_prueba.xlsx');

/** Nombre genérico o el que pases por env — nunca un local concreto hardcodeado. */
const BRAND = String(process.env.BRAND || 'Tu marca').trim() || 'Tu marca';

/** [nombre, codigo, categoria(subfamilia), linea, precio, ingredientes, descripcion] */
const ROWS = [
  ['Patatas bravas', 'TAP-001', 'Tapas', BRAND, '4.50', 'Patata, Aceite', ''],
  ['Croquetas jamón', 'TAP-002', 'Tapas', BRAND, '5.20', 'Jamón, Bechamel', ''],
  ['Calamares', 'RAC-001', 'Raciones', BRAND, '9.90', 'Calamar, Harina', ''],
  ['Bocadillo serrano', 'BOC-001', 'Bocadillos', BRAND, '6.50', 'Pan, Jamón', ''],
  ['Pincho tortilla', 'PIN-001', 'Pinchos', BRAND, '2.80', 'Huevo, Patata', ''],
  ['Coca-Cola 33cl', 'REF-001', 'Refrescos', BRAND, '2.50', '', ''],
  ['Fanta naranja', 'REF-002', 'Refrescos', BRAND, '2.50', '', ''],
  ['Agua 50cl', 'AGU-001', 'Aguas', BRAND, '1.80', '', ''],
  ['Caña', 'CER-001', 'Cervezas', BRAND, '2.20', '', ''],
  ['Clara', 'CER-002', 'Cervezas', BRAND, '2.40', '', ''],
  ['Rioja vaso', 'VIN-001', 'Vinos', BRAND, '3.50', '', ''],
  ['Cava brut', 'CHA-001', 'Champán', BRAND, '4.00', '', ''],
  ['Whisky ballantines', 'WHI-001', 'Whisky', BRAND, '5.50', '', ''],
  ['Gin tonic', 'COM-001', 'Combinados', BRAND, '8.00', '', ''],
  ['Café solo', 'CAF-001', 'Café', BRAND, '1.50', '', ''],
  ['Café con leche', 'CAF-002', 'Café', BRAND, '1.80', '', ''],
  ['Croissant', 'BOL-001', 'Bollería', BRAND, '2.20', '', ''],
  ['Tarta queso', 'POS-001', 'Postres', BRAND, '4.80', '', ''],
  ['Helado vainilla', 'HEL-001', 'Helados', BRAND, '3.50', '', ''],
  ['Pan', 'CMP-001', 'Complementos', BRAND, '1.20', '', ''],
];

const headers = ['nombre', 'codigo', 'categoria', 'linea', 'precio', 'ingredientes', 'descripcion'];

const catalogRows = [headers, ...ROWS];
const wb = XLSX.utils.book_new();
const sheet = XLSX.utils.aoa_to_sheet(catalogRows);
sheet['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 24 }, { wch: 20 }];
XLSX.utils.book_append_sheet(wb, sheet, 'catalogo');

const help = [
  ['Plantilla prueba bar/restaurante (sin hardcode de un local concreto)'],
  [`1. Columna linea = «${BRAND}» — debe coincidir con Ajustes → Marca`],
  ['2. Cambia BRAND=… al generar, o edita la columna linea en Excel'],
  ['3. categoria = subfamilia TPV (Tapas, Refrescos, Cervezas…)'],
  ['4. Importar en Catálogo del bar/restaurante (hoja catalogo)'],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(help), 'instrucciones');

fs.mkdirSync(outDir, { recursive: true });
XLSX.writeFile(wb, outFile);
console.log('OK', outFile);
console.log('Marca (linea):', BRAND);
console.log('Filas producto:', ROWS.length);
