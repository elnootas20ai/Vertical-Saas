/**
 * Genera Excel de prueba para carta bar (familia → subfamilia).
 * Uso: node scripts/build-bodegeta-catalog-excel.mjs
 * Output: exports/bodegeta-catalogo-prueba.xlsx
 *
 * Columna categoria = subfamilia (Refrescos, Cervezas…).
 * Columna linea = marca (comida); vacía o misma marca en bebidas/postres/cafés.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'exports');
const outFile = path.join(outDir, 'bodegeta-catalogo-prueba.xlsx');

const BRAND = 'Bodegeta';

/** [nombre, codigo, categoria(subfamilia), linea, precio, ingredientes, descripcion] */
const ROWS = [
  // Comida → pestaña marca
  ['Patatas bravas', 'TAP-001', 'Tapas', BRAND, '4.50', 'Patata, Aceite', ''],
  ['Croquetas jamón', 'TAP-002', 'Tapas', BRAND, '5.20', 'Jamón, Bechamel', ''],
  ['Calamares', 'RAC-001', 'Raciones', BRAND, '9.90', 'Calamar, Harina', ''],
  ['Bocadillo serrano', 'BOC-001', 'Bocadillos', BRAND, '6.50', 'Pan, Jamón', ''],
  ['Pincho tortilla', 'PIN-001', 'Pinchos', BRAND, '2.80', 'Huevo, Patata', ''],
  // Bebidas → pestaña Bebidas; abajo subfamilias
  ['Coca-Cola 33cl', 'REF-001', 'Refrescos', BRAND, '2.50', '', ''],
  ['Fanta naranja', 'REF-002', 'Refrescos', BRAND, '2.50', '', ''],
  ['Agua 50cl', 'AGU-001', 'Aguas', BRAND, '1.80', '', ''],
  ['Caña', 'CER-001', 'Cervezas', BRAND, '2.20', '', ''],
  ['Clara', 'CER-002', 'Cervezas', BRAND, '2.40', '', ''],
  ['Rioja vaso', 'VIN-001', 'Vinos', BRAND, '3.50', '', ''],
  ['Cava brut', 'CHA-001', 'Champán', BRAND, '4.00', '', ''],
  ['Whisky ballantines', 'WHI-001', 'Whisky', BRAND, '5.50', '', ''],
  ['Gin tonic', 'COM-001', 'Combinados', BRAND, '8.00', '', ''],
  // Cafés
  ['Café solo', 'CAF-001', 'Café', BRAND, '1.50', '', ''],
  ['Café con leche', 'CAF-002', 'Café', BRAND, '1.80', '', ''],
  ['Croissant', 'BOL-001', 'Bollería', BRAND, '2.20', '', ''],
  // Postres
  ['Tarta queso', 'POS-001', 'Postres', BRAND, '4.80', '', ''],
  ['Helado vainilla', 'HEL-001', 'Helados', BRAND, '3.50', '', ''],
  // Complementos
  ['Pan', 'CMP-001', 'Complementos', BRAND, '1.20', '', ''],
];

const headers = ['nombre', 'codigo', 'categoria', 'linea', 'precio', 'ingredientes', 'descripcion'];

const catalogRows = [headers, ...ROWS];
const wb = XLSX.utils.book_new();
const sheet = XLSX.utils.aoa_to_sheet(catalogRows);
sheet['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 24 }, { wch: 20 }];
XLSX.utils.book_append_sheet(wb, sheet, 'catalogo');

const help = [
  ['Lógica TPV bar (sin hardcode de negocio)'],
  ['1. Pestaña marca = categorias de comida (Tapas, Raciones…)'],
  ['2. Luego familias: Bebidas, Cafés, Postres, Complementos'],
  ['3. Dentro de Bebidas: subfamilias = valor de columna categoria'],
  ['   (Refrescos, Cervezas, Vinos, Champán, Whisky, Combinados, Aguas…)'],
  ['4. Importar en Catálogo del bar con este Excel'],
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(help), 'instrucciones');

fs.mkdirSync(outDir, { recursive: true });
XLSX.writeFile(wb, outFile);
console.log('OK', outFile);
console.log('Filas producto:', ROWS.length);
