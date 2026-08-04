/**
 * Genera Excel INGRESOS Tiana 28-jul: hoja Modomio + hoja Black Burger.
 * 1) Baja datos del VPS (solo lectura)
 * 2) Escribe Excel en Desktop/uriel/Vertial/exports/
 *
 *   node scripts/build-tiana-ingresos-excel.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';
import { loadLocalValues, LOCAL_VALUES_PATH } from './deploy-env.mjs';
import { sshRunScript } from './remote-ssh.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const OUT_DIR = path.join(root, 'exports');
const DAY = '2026-07-28';
const CACHED = path.join(OUT_DIR, `tiana-caja-split-${DAY}.json`);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function emptyMoney() {
  return { efectivo: 0, visa: 0, bizum: 0, justeat: 0, uber: 0, glovo: 0, app: 0, otro: 0, total: 0 };
}

function addMoney(a, b) {
  const out = { ...a };
  for (const k of Object.keys(out)) out[k] = round2(out[k] + (Number(b[k]) || 0));
  return out;
}

/** Reparte importe de plataforma por unidades comida (pizza vs burger+taco). */
function splitAggMoney(amount, pizza, burger, taco) {
  const bbUnits = (burger || 0) + (taco || 0);
  const modUnits = pizza || 0;
  const total = modUnits + bbUnits;
  if (amount <= 0) return { mod: 0, bb: 0 };
  if (total <= 0) return { mod: round2(amount), bb: 0 };
  const mod = round2((modUnits / total) * amount);
  const bb = round2(amount - mod);
  return { mod, bb };
}

function moneyRow(m, units) {
  return {
    EFECTIVO: m.efectivo || '',
    VISA: m.visa || '',
    B: m.bizum || '',
    'JUST EAT': m.justeat || '',
    UBER: m.uber || '',
    GLOVVO: m.glovo || '',
    APP: m.app || '',
    TOTAL: m.total || 0,
    UNITS: units || 0,
  };
}

function fetchRemoteJson() {
  const values = loadLocalValues();
  if (!values) throw new Error(`No existe ${LOCAL_VALUES_PATH}`);
  const scriptPath = path.join(__dirname, 'export-tiana-caja-brand-split-v2.mjs');
  const b64 = fs.readFileSync(scriptPath).toString('base64');
  const repo = values.REPO_PATH_ON_VPS?.trim();
  const bash = `set -e
cd '${repo.replace(/'/g, `'\\''`)}'
mkdir -p scripts
echo '${b64}' | base64 -d > scripts/export-tiana-caja-brand-split-v2.mjs
node scripts/export-tiana-caja-brand-split-v2.mjs
`;
  const r = sshRunScript(
    values.DEPLOY_USER || values.SSH_USER,
    values.DEPLOY_HOST || values.VPS_IP,
    values.SSH_IDENTITY_FILE?.trim(),
    bash,
  );
  const text = `${r.stdout || ''}\n${r.stderr || ''}`;
  if (r.status) {
    process.stderr.write(r.stderr || '');
    throw new Error(`remote exit ${r.status}`);
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON en salida remota');
  return JSON.parse(text.slice(start, end + 1));
}

function buildSheetRows(orderRows, unitKey, aggExtraRows, title) {
  const headers = ['#', 'EFECTIVO', 'VISA', 'B', 'JUST EAT', 'UBER', 'GLOVVO', 'APP', 'TOTAL', unitKey];
  const aoa = [[title], headers];
  let i = 1;
  const total = emptyMoney();
  let units = 0;

  for (const r of orderRows) {
    const m = r.money || emptyMoney();
    const u = unitKey.includes('BURGER') ? r.totalUnits || (r.burger || 0) + (r.taco || 0) : r.pizza || 0;
    Object.assign(total, addMoney(total, m));
    units += u;
    aoa.push([
      i++,
      m.efectivo || '',
      m.visa || '',
      m.bizum || '',
      m.justeat || '',
      m.uber || '',
      m.glovo || '',
      m.app || '',
      m.total || '',
      u || '',
    ]);
  }

  for (const extra of aggExtraRows) {
    const m = extra.money;
    Object.assign(total, addMoney(total, m));
    units += extra.units || 0;
    aoa.push([
      i++,
      m.efectivo || '',
      m.visa || '',
      m.bizum || '',
      m.justeat || '',
      m.uber || '',
      m.glovo || '',
      m.app || '',
      m.total || '',
      extra.units || '',
    ]);
  }

  aoa.push([]);
  aoa.push([
    'TOTAL DÍA',
    total.efectivo || 0,
    total.visa || 0,
    total.bizum || 0,
    total.justeat || 0,
    total.uber || 0,
    total.glovo || 0,
    total.app || 0,
    total.total || 0,
    units,
  ]);
  return { aoa, total, units };
}

function loadData() {
  if (process.argv.includes('--cached') && fs.existsSync(CACHED)) {
    return JSON.parse(fs.readFileSync(CACHED, 'utf8'));
  }
  try {
    return fetchRemoteJson();
  } catch (err) {
    if (fs.existsSync(CACHED)) {
      console.error('Remote falló, uso caché:', err.message);
      return JSON.parse(fs.readFileSync(CACHED, 'utf8'));
    }
    throw err;
  }
}

const data = loadData();
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(CACHED, JSON.stringify(data, null, 2));

const byCh = data.session?.productClosingCounts?.byChannel || {};
const sessionMoney = data.session?.sessionMoney || {};

// Aggregators: no hay pedidos en BD → reparto proporcional por unidades del cierre
const aggChannels = [
  { key: 'justeat', col: 'justeat', label: 'JUST EAT', counts: byCh.justeat, amount: sessionMoney.justeat },
  { key: 'uber', col: 'uber', label: 'UBER', counts: byCh.ubereats, amount: sessionMoney.uber },
  { key: 'glovo', col: 'glovo', label: 'GLOVO', counts: byCh.glovo, amount: sessionMoney.glovo },
  { key: 'app', col: 'app', label: 'APP/Flipdish', counts: byCh.flipdish, amount: sessionMoney.app },
];

const modAggRows = [];
const bbAggRows = [];

for (const ch of aggChannels) {
  const pizza = Number(ch.counts?.pizza || 0);
  const burger = Number(ch.counts?.burger || 0);
  const taco = Number(ch.counts?.taco || 0);
  const amount = round2(ch.amount || 0);
  if (amount <= 0 && pizza + burger + taco <= 0) continue;
  const split = splitAggMoney(amount, pizza, burger, taco);

  if (split.mod > 0 || pizza > 0) {
    const money = emptyMoney();
    money[ch.col] = split.mod;
    money.total = split.mod;
    modAggRows.push({ label: ch.label, money, units: pizza });
  }
  if (split.bb > 0 || burger + taco > 0) {
    const money = emptyMoney();
    money[ch.col] = split.bb;
    money.total = split.bb;
    bbAggRows.push({ label: ch.label, money, units: burger + taco });
  }
}

// Mapear "otro" TPV del split a columna B si parece bizum; si no, dejar en APP nota.
// En el cierre: salesByMethod.otro ≈ 47.49 — lo dejamos en B (Bizum) solo si bizum session=0 y el usuario usa B para extras.
// Mejor: poner "otro" en columna B del Excel (como en la plantilla).
function remapOtroToB(rows) {
  return rows.map((r) => {
    const m = { ...(r.money || emptyMoney()) };
    if (m.otro > 0) {
      m.bizum = round2((m.bizum || 0) + m.otro);
      m.otro = 0;
      m.total = round2(
        m.efectivo + m.visa + m.bizum + m.justeat + m.uber + m.glovo + m.app,
      );
    }
    return { ...r, money: m };
  });
}

const modRows = remapOtroToB(data.modomio.orderRows || []);
const bbRows = remapOtroToB(
  (data.blackburger.orderRows || []).map((r) => ({
    ...r,
    totalUnits: r.totalUnits ?? (r.burger || 0) + (r.taco || 0),
  })),
);

// Igual que la foto: 2 hojas. 1ª = BB (TOTAL BURGERS). 2ª = Modomio (PIZZAS MODOMIO).
const bbSheet = buildSheetRows(bbRows, 'TOTAL BURGERS', bbAggRows, `INGRESOS BB BDN · ${DAY}`);
const modSheet = buildSheetRows(modRows, 'PIZZAS MODOMIO', modAggRows, `INGRESOS MODOMIO · ${DAY}`);

const wb = XLSX.utils.book_new();
const wsBb = XLSX.utils.aoa_to_sheet(bbSheet.aoa);
const wsMod = XLSX.utils.aoa_to_sheet(modSheet.aoa);
const cols = [
  { wch: 12 },
  { wch: 10 },
  { wch: 10 },
  { wch: 8 },
  { wch: 10 },
  { wch: 10 },
  { wch: 10 },
  { wch: 10 },
  { wch: 10 },
  { wch: 16 },
];
wsBb['!cols'] = cols;
wsMod['!cols'] = cols;
XLSX.utils.book_append_sheet(wb, wsBb, 'BB BDN');
XLSX.utils.book_append_sheet(wb, wsMod, 'PIZZAS MODOMIO');

const outPath = path.join(OUT_DIR, `INGRESOS_TIANA_${DAY}.xlsx`);
XLSX.writeFile(wb, outPath);

// Copia en Escritorio para abrir fácil
const desktopCopy = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Desktop',
  `INGRESOS_TIANA_${DAY}.xlsx`,
);
try {
  if (desktopCopy && path.dirname(desktopCopy) !== OUT_DIR) {
    fs.copyFileSync(outPath, desktopCopy);
  }
} catch {
  /* ignore */
}

console.log(
  JSON.stringify(
    {
      outPath,
      day: DAY,
      sessionTotal: sessionMoney.total,
      sheets: ['BB BDN', 'PIZZAS MODOMIO'],
      blackburger: { total: bbSheet.total.total, burgers: bbSheet.units },
      modomio: { total: modSheet.total.total, pizzas: modSheet.units },
      tpvOrders: data.ordersCount,
    },
    null,
    2,
  ),
);
