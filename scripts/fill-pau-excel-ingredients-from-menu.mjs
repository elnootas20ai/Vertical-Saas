/**
 * Rellena SOLO la columna ingredientes del Excel Pau según la carta foto Modomio.
 * NO toca prod. Por defecto NO pisa precios ni el Excel «maestro».
 *
 * node scripts/fill-pau-excel-ingredients-from-menu.mjs
 *   → escribe solo catalogo_pau_ingredientes_carta.xlsx (copia segura)
 *
 * node scripts/fill-pau-excel-ingredients-from-menu.mjs --write-main
 *   → también actualiza catalogo_pizzeria_burger_completo_corregido.xlsx
 *
 * node scripts/fill-pau-excel-ingredients-from-menu.mjs --with-prices
 *   → además escribe precios de la carta (solo si lo pedís)
 *
 * node scripts/fill-pau-excel-ingredients-from-menu.mjs --rename
 *   → renombra Ai Due→Dulce Roquefort, Apericena→Apericina, Modomio→Pizza 3 Ingredientes
 */
import XLSX from 'xlsx';
import fs from 'node:fs';

const EXCEL_PATH = 'C:/Users/Urieel/Desktop/catalogo_pizzeria_burger_completo_corregido.xlsx';
const OUT_PATH = 'C:/Users/Urieel/Desktop/catalogo_pau_ingredientes_carta.xlsx';
const BAK = 'C:/Users/Urieel/Desktop/catalogo_pizzeria_burger_completo_corregido_BACKUP_antes_ingredientes.xlsx';

const WRITE_MAIN = process.argv.includes('--write-main');
const WITH_PRICES = process.argv.includes('--with-prices');
const DO_RENAME = process.argv.includes('--rename');

// Preferir el Excel actual si ya está; backup solo si no hay maestro
const SOURCE = fs.existsSync(EXCEL_PATH) ? EXCEL_PATH : BAK;

function fold(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Ingredientes exactos (o lo más fiel) a la carta impresa. Precios = referencia carta, no se aplican sin --with-prices. */
const BY_NAME = {
  // Combos
  individual: { ingredientes: 'Pizza, Patatas, Refresco', precio: 18.99 },
  pizzeria: { ingredientes: 'Pizza, 1 Complemento, Refresco, Helado/Tiramisu', precio: 22.99 },
  'modomio combo': { ingredientes: 'Pizza, 1 Complemento, Refresco, Helado/Tiramisu', precio: 22.99 },
  duo: { ingredientes: '2 Pizzas, 1 Complemento, 2 Refrescos', precio: 31.99 },
  dúo: { ingredientes: '2 Pizzas, 1 Complemento, 2 Refrescos', precio: 31.99 },
  family: { ingredientes: '3 Pizzas, 2 Complementos, 4 Refrescos', precio: 49.99 },

  // Italiani
  napolitana: { ingredientes: 'Tomate, olivas, orégano', precio: 13.5 },
  margarita: { ingredientes: 'Tomate, mozzarella, bocconcino, albahaca', precio: 14 },

  // Especialidad
  pallesa: {
    ingredientes: 'Tomate, mozzarella, butifarra, cebolla caramelizada, queso brie, miel',
    precio: 15.5,
  },
  sanginaccio: {
    ingredientes: 'Tomate, mozzarella, morcilla, cebolla caramelizada, queso de cabra',
    precio: 16.5,
  },
  'pera al gorgo': {
    ingredientes: 'Base blanca, mozzarella, gorgonzola, pera, cebolla caramelizada, nueces',
    precio: 16.5,
  },
  'carbonara al guanciale': {
    ingredientes: 'Base blanca, mozzarella, guanciale, yema de huevo, queso pecorino, pimienta',
    precio: 16.5,
  },
  'pizza mortadella e pistacchio': {
    ingredientes: 'Base blanca, mozzarella, mortadella italiana, burrata, crema de pistacho, parmesano',
    precio: 16.5,
  },
  'mortadella e pistacchio': {
    ingredientes: 'Base blanca, mozzarella, mortadella italiana, burrata, crema de pistacho, parmesano',
    precio: 16.5,
  },

  // Pizza
  prosciutto: { ingredientes: 'Tomate, mozzarella, jamón york', precio: 14.5 },
  proscuitto: { ingredientes: 'Tomate, mozzarella, jamón york', precio: 14.5 },
  bacon: { ingredientes: 'Tomate, mozzarella, bacon', precio: 14.5 },
  'ai due': { ingredientes: 'Base blanca, mozzarella, roquefort, miel', precio: 15 },
  'dulce roquefort': { ingredientes: 'Base blanca, mozzarella, roquefort, miel', precio: 15 },
  'al dulce roquefort': { ingredientes: 'Base blanca, mozzarella, roquefort, miel', precio: 15 },
  funghi: { ingredientes: 'Tomate, mozzarella, champiñones, nata', precio: 14.5 },
  carbonara: { ingredientes: 'Mozzarella, nata, bacon, huevo, cebolla', precio: 15.5 },
  'al pesto': { ingredientes: 'Tomate, mozzarella, tomate deshidratado, búfala, pesto', precio: 15.5 },
  hawaiana: { ingredientes: 'Tomate, mozzarella, jamón york, piña', precio: 15.5 },
  '4 quesos': { ingredientes: 'Tomate, mozzarella, queso de cabra, parmesano, roquefort', precio: 15.5 },
  iberica: { ingredientes: 'Tomate, mozzarella, queso brie, virutas de jamón ibérico', precio: 15.5 },
  bbq: { ingredientes: 'Mozzarella, carne picada, bacon, salsa BBQ', precio: 15.5 },
  mediterranea: {
    ingredientes: 'Tomate, mozzarella, anchoas, tomate deshidratado, olivas negras',
    precio: 15.5,
  },
  porcavacca: { ingredientes: 'Tomate, mozzarella, parmesano, jamón york, nata', precio: 15.5 },
  mallorquina: { ingredientes: 'Tomate, mozzarella, sobrasada, queso brie, miel', precio: 15.5 },
  'calzone aperta': { ingredientes: 'Tomate, mozzarella, jamón york, champiñones', precio: 15 },
  'calzone abierta': { ingredientes: 'Tomate, mozzarella, jamón york, champiñones', precio: 15 },
  'calzone cerrada': { ingredientes: 'Tomate, mozzarella, jamón york, champiñones', precio: 15 },
  pepperoni: { ingredientes: 'Tomate, mozzarella, champiñones, pepperoni', precio: 15 },
  vegetale: {
    ingredientes: 'Tomate, mozzarella, berenjena, cebolla, calabacín, olivas, pimiento rojo',
    precio: 14.5,
  },
  '4 estaciones': {
    ingredientes: 'Tomate, mozzarella, jamón york, champiñones, alcachofas',
    precio: 15.5,
  },
  contadino: { ingredientes: 'Tomate, mozzarella, bacon, pollo, champiñones', precio: 15.5 },
  apreciena: { ingredientes: 'Tomate, mozzarella, atún, cebolla, olivas', precio: 15.5 },
  apericina: { ingredientes: 'Tomate, mozzarella, atún, cebolla, olivas', precio: 15.5 },
  apericena: { ingredientes: 'Tomate, mozzarella, atún, cebolla, olivas', precio: 15.5 },
  caprichosa: {
    ingredientes: 'Tomate, mozzarella, jamón york, champiñones, alcachofas, olivas',
    precio: 15.5,
  },
  // Al gusto: no listar toppings falsos (el TPV usa build-your-own)
  modomio: { ingredientes: '', precio: 15, descripcion: 'Pizza al gusto — 3 ingredientes' },
  'pizza 3 ingredientes': { ingredientes: '', precio: 15, descripcion: 'Pizza al gusto — 3 ingredientes' },
  vegana: {
    ingredientes: 'Queso vegano, salsa de tomate natural, berenjena, tomate deshidratado, olivas negras, alcachofas',
    precio: 16,
  },
  'la vegana': {
    ingredientes: 'Queso vegano, salsa de tomate natural, berenjena, tomate deshidratado, olivas negras, alcachofas',
    precio: 16,
  },
  berencabra: { ingredientes: 'Tomate, mozzarella, berenjena, queso de cabra, miel', precio: 15 },
  parmegiana: {
    ingredientes: 'Tomate, mozzarella, rúcula, queso parmesano, tomate deshidratado, aceite de oliva',
    precio: 16,
  },

  // Premium
  'primavera premium': {
    ingredientes: 'Tomate, mozzarella, rúcula, tomate deshidratado, jamón ibérico, queso fresco',
    precio: 17,
  },
  'premium primavera': {
    ingredientes: 'Tomate, mozzarella, rúcula, tomate deshidratado, jamón ibérico, queso fresco',
    precio: 17,
  },
  'marinera premium': {
    ingredientes: 'Tomate, mozzarella, gambas, ajo, perejil, atún, cebolla',
    precio: 17,
  },
  'premium marinera': {
    ingredientes: 'Tomate, mozzarella, gambas, ajo, perejil, atún, cebolla',
    precio: 17,
  },
  'mamma mia premium': {
    ingredientes: 'Tomate, mozzarella, jamón york, frankfurt, nata, parmesano',
    precio: 16,
  },
  'premium mamma mia': {
    ingredientes: 'Tomate, mozzarella, jamón york, frankfurt, nata, parmesano',
    precio: 16,
  },
  'mitad y mitad': { ingredientes: '', precio: 17, descripcion: 'Premium mitad y mitad — al gusto' },
  'premium mitad y mitad': { ingredientes: '', precio: 17, descripcion: 'Premium mitad y mitad — al gusto' },
  'trufada premium': {
    ingredientes: 'Mozzarella, champiñones, salsa de trufa, parmesano',
    precio: 17,
  },
  'premium trufada': {
    ingredientes: 'Mozzarella, champiñones, salsa de trufa, parmesano',
    precio: 17,
  },
  'modomio premium': { ingredientes: '', precio: 17, descripcion: 'Premium al gusto — 5 ingredientes' },
  'premium modomio': { ingredientes: '', precio: 17, descripcion: 'Premium al gusto — 5 ingredientes' },
};

function lookup(nombre, categoria, linea) {
  const n = fold(nombre);
  const cat = fold(categoria);
  const line = fold(linea);
  const blob = `${cat} ${line}`;

  // No tocar burgers / sides / postres no-carta
  if (/burger|side|taco|bebida|vino|postre/.test(blob) && !/pizza|calzone|especial|premium|combo|italiani/.test(blob)) {
    if (n.includes('nutella')) return null;
    if (/burger|taco|side/.test(blob)) return null;
  }
  // Vegana burger vs pizza
  if (n === 'vegana' && /burger/.test(blob)) return null;

  // Combo Modomio vs pizza Modomio
  if (n === 'modomio' && (cat.includes('combo') || line.includes('combo'))) {
    return BY_NAME['modomio combo'];
  }
  if ((n === 'modomio' || n === 'pizzeria') && cat.includes('combo')) {
    return BY_NAME.pizzeria;
  }

  if (BY_NAME[n]) return BY_NAME[n];

  const strip = n.replace(/^pizza /, '');
  if (BY_NAME[strip]) return BY_NAME[strip];

  return null;
}

const wb = XLSX.readFile(SOURCE);
const rows = XLSX.utils.sheet_to_json(wb.Sheets.catalogo, { defval: '' });

let updated = 0;
let skipped = 0;
const report = [];

for (const r of rows) {
  const name = String(r.nombre || '').trim();
  if (!name) continue;
  const hit = lookup(name, r.categoria, r.linea);
  if (!hit) {
    skipped++;
    continue;
  }
  const before = String(r.ingredientes || '').trim();
  r.ingredientes = hit.ingredientes;
  if (WITH_PRICES && hit.precio != null) r.precio = hit.precio;
  if (hit.descripcion) r.descripcion = hit.descripcion;
  if (DO_RENAME) {
    if (fold(name) === 'ai due') r.nombre = 'Dulce Roquefort';
    if (fold(name) === 'apericena') r.nombre = 'Apericina';
    if (fold(name) === 'modomio' && fold(r.categoria).includes('pizza')) {
      r.nombre = 'Pizza 3 Ingredientes';
    }
  }
  updated++;
  report.push({
    nombre: r.nombre,
    before: before.slice(0, 50),
    after: String(r.ingredientes).slice(0, 70),
  });
}

// Asegurar filas clave si faltan (solo pizza carta) — no duplicar si ya están renombradas
const mustHave = [
  { nombre: 'Dulce Roquefort', categoria: 'Pizza', linea: 'pizza', ...BY_NAME['dulce roquefort'] },
  { nombre: 'Apericina', categoria: 'Pizza', linea: 'pizza', ...BY_NAME.apericina },
  { nombre: 'Pizza 3 Ingredientes', categoria: 'Pizza', linea: 'pizza', ...BY_NAME['pizza 3 ingredientes'] },
  { nombre: 'Al Pesto', categoria: 'Pizza', linea: 'pizza', ...BY_NAME['al pesto'] },
];
for (const m of mustHave) {
  const exists = rows.some((r) => fold(r.nombre) === fold(m.nombre));
  if (!exists) {
    rows.push({
      nombre: m.nombre,
      codigo: '',
      categoria: m.categoria,
      linea: m.linea,
      precio: m.precio,
      ingredientes: m.ingredientes,
      descripcion: m.descripcion || 'Pizza',
    });
    updated++;
    report.push({ nombre: m.nombre, before: '(nueva)', after: m.ingredientes || '(al gusto)' });
  }
}

wb.Sheets.catalogo = XLSX.utils.json_to_sheet(rows);
XLSX.writeFile(wb, OUT_PATH);
if (WRITE_MAIN) {
  XLSX.writeFile(wb, EXCEL_PATH);
}

console.log('Fuente:', SOURCE);
console.log('Copia (siempre):', OUT_PATH);
console.log(WRITE_MAIN ? `Maestro actualizado: ${EXCEL_PATH}` : 'Maestro NO tocado (usa --write-main si hace falta)');
console.log(WITH_PRICES ? 'Precios: SÍ (--with-prices)' : 'Precios: no (solo ingredientes)');
console.log(DO_RENAME ? 'Renombres: SÍ' : 'Renombres: no');
console.log('Filas actualizadas/añadidas:', updated, '| sin match carta:', skipped);
console.log('\nCambios:');
for (const x of report) {
  console.log(`- ${x.nombre}`);
  console.log(`    ANTES: ${x.before || '(vacío)'}`);
  console.log(`    AHORA: ${x.after || '(vacío / al gusto)'}`);
}
