import fs from 'fs';

const EXCEL = 'src/app/lib/cajaFacturacionExcelExport.ts';
const GATE = 'src/app/components/saas/TpvRegisterGate.tsx';

function nl(fileText, block) {
  const useCrlf = fileText.includes('\r\n');
  return useCrlf ? block.replace(/\n/g, '\r\n') : block;
}

function replaceOnce(s, oldStr, newStr, label) {
  const oldN = nl(s, oldStr);
  const newN = nl(s, newStr);
  const i = s.indexOf(oldN);
  if (i < 0) {
    console.error('FAIL', label);
    process.exit(1);
  }
  if (s.indexOf(oldN, i + 1) >= 0) {
    console.error('AMBIGUOUS', label);
    process.exit(1);
  }
  console.log('OK', label);
  return s.slice(0, i) + newN + s.slice(i + oldN.length);
}

let excel = fs.readFileSync(EXCEL, 'utf8');

excel = replaceOnce(
  excel,
  `/** Marca del cierre → hoja Excel (brandIds, id, nombre, o pista pizza/burger). */
function sheetIdForClosingBrand(
  brandId: string,
  sheets: BrandBillingSheet[],
  labels?: Record<string, string> | null,
): string | null {
  const aliases = new Set(brandIdAliases(brandId).map((a) => a.toLowerCase()));
  if (aliases.size === 0) return null;
  for (const sheet of sheets) {`,
  `/**
 * Marca del cierre → hoja Excel.
 * 1) closingBrandSheetIds (Total MM → hoja MM, Total BB → hoja BB)
 * 2) brandIds / id / nombre / pista comida
 */
function sheetIdForClosingBrand(
  brandId: string,
  sheets: BrandBillingSheet[],
  labels?: Record<string, string> | null,
  sheetIds?: Record<string, string> | null,
): string | null {
  const aliases = new Set(brandIdAliases(brandId).map((a) => a.toLowerCase()));
  if (aliases.size === 0) return null;
  const sheetIdSet = new Set(sheets.map((s) => String(s.id || '').trim()).filter(Boolean));
  if (sheetIds && typeof sheetIds === 'object') {
    for (const key of brandIdAliases(brandId)) {
      const mapped = String(sheetIds[key] || '').trim();
      if (mapped && sheetIdSet.has(mapped)) return mapped;
    }
    for (const [rawId, rawSheet] of Object.entries(sheetIds)) {
      const mapped = String(rawSheet || '').trim();
      if (!mapped || !sheetIdSet.has(mapped)) continue;
      for (const alias of brandIdAliases(rawId)) {
        if (aliases.has(alias.toLowerCase())) return mapped;
      }
    }
  }
  for (const sheet of sheets) {`,
  'sheetIdForClosingBrand+map',
);

excel = replaceOnce(
  excel,
  `  const labels = session.closingBrandLabels || {};
  for (const perBrand of Object.values(session.aggregatorClosingBrandTotals || {})) {
    if (!perBrand || typeof perBrand !== 'object') continue;
    for (const [brandId, raw] of Object.entries(perBrand)) {
      if (Number(raw) <= 0) continue;
      if (sheetIdForClosingBrand(brandId, sheets, labels)) return true;
    }
  }
  return false;
}`,
  `  const labels = session.closingBrandLabels || {};
  const sheetIds = session.closingBrandSheetIds || {};
  for (const perBrand of Object.values(session.aggregatorClosingBrandTotals || {})) {
    if (!perBrand || typeof perBrand !== 'object') continue;
    for (const [brandId, raw] of Object.entries(perBrand)) {
      if (Number(raw) <= 0) continue;
      if (sheetIdForClosingBrand(brandId, sheets, labels, sheetIds)) return true;
    }
  }
  return false;
}`,
  'canMap use sheetIds',
);

excel = replaceOnce(
  excel,
  `  const labels = session.closingBrandLabels || {};
  const shares = sheetMoneyShares(countsFromAmounts(amounts), allSheets);
  const share = shares[billingSheet.id] ?? 0;
  const out = { app: 0, uber: 0, justEat: 0, glovo: 0 };
  for (const key of ['app', 'uber', 'justEat', 'glovo'] as const) {
    const channels = EXCEL_APP_CHANNEL_GROUPS[key];
    const channelAmt = round2(channels.reduce((s, ch) => s + channelTotal(session, ch), 0));
    const byBrand = brandTotalsForChannels(session, channels);
    const attributed: Record<string, number> = {};
    let attributedSum = 0;
    for (const [brandId, amt] of Object.entries(byBrand)) {
      const sheetId = sheetIdForClosingBrand(brandId, allSheets, labels);
      if (!sheetId) continue;
      attributed[sheetId] = round2((attributed[sheetId] || 0) + amt);
      attributedSum = round2(attributedSum + amt);
    }
    let value = attributed[billingSheet.id] || 0;
    if (attributedSum <= 0) {
      value = round2(channelAmt * share);
    } else {
      const leftover = round2(channelAmt - attributedSum);
      if (leftover >= 0.01) value = round2(value + leftover * share);
    }
    out[key] = value;
  }
  return out;
}`,
  `  const labels = session.closingBrandLabels || {};
  const sheetIds = session.closingBrandSheetIds || {};
  const shares = sheetMoneyShares(countsFromAmounts(amounts), allSheets);
  const share = shares[billingSheet.id] ?? 0;
  const out = { app: 0, uber: 0, justEat: 0, glovo: 0 };
  for (const key of ['app', 'uber', 'justEat', 'glovo'] as const) {
    const channels = EXCEL_APP_CHANNEL_GROUPS[key];
    const channelAmt = round2(channels.reduce((s, ch) => s + channelTotal(session, ch), 0));
    const byBrand = brandTotalsForChannels(session, channels);
    const attributed: Record<string, number> = {};
    let attributedSum = 0;
    for (const [brandId, amt] of Object.entries(byBrand)) {
      const sheetId = sheetIdForClosingBrand(brandId, allSheets, labels, sheetIds);
      if (!sheetId) continue;
      attributed[sheetId] = round2((attributed[sheetId] || 0) + amt);
      attributedSum = round2(attributedSum + amt);
    }
    let value = attributed[billingSheet.id] || 0;
    if (attributedSum <= 0) {
      value = round2(channelAmt * share);
    } else {
      const leftover = round2(channelAmt - attributedSum);
      if (leftover >= 0.01) {
        const sheetAttr = attributed[billingSheet.id] || 0;
        value = round2(value + leftover * (sheetAttr / attributedSum));
      }
    }
    out[key] = value;
  }
  return out;
}`,
  'appsAmounts leftover by MM/BB weight',
);

excel = replaceOnce(
  excel,
  `  const labels = session.closingBrandLabels || {};
  const attributedEf: Record<string, number> = {};
  const attributedTj: Record<string, number> = {};
  let sumEf = 0;
  let sumTj = 0;
  for (const [brandId, pay] of Object.entries(session.closingBrandTpvTotals || {})) {
    if (!pay || typeof pay !== 'object') continue;
    const ef = round2(pay.efectivo);
    const tj = round2(pay.tarjeta);
    if (ef <= 0 && tj <= 0) continue;
    const sheetId = sheetIdForClosingBrand(brandId, allSheets, labels);
    if (!sheetId) continue;`,
  `  const labels = session.closingBrandLabels || {};
  const sheetIds = session.closingBrandSheetIds || {};
  const attributedEf: Record<string, number> = {};
  const attributedTj: Record<string, number> = {};
  let sumEf = 0;
  let sumTj = 0;
  for (const [brandId, pay] of Object.entries(session.closingBrandTpvTotals || {})) {
    if (!pay || typeof pay !== 'object') continue;
    const ef = round2(pay.efectivo);
    const tj = round2(pay.tarjeta);
    if (ef <= 0 && tj <= 0) continue;
    const sheetId = sheetIdForClosingBrand(brandId, allSheets, labels, sheetIds);
    if (!sheetId) continue;`,
  'tpvAmounts use sheetIds',
);

fs.writeFileSync(EXCEL, excel);
console.log('wrote', EXCEL);

// Probe gate names
let gate = fs.readFileSync(GATE, 'utf8');
const markers = [
  'brandTotalsByChannelFromAppsRows',
  'brandTotalsByChannelFromAppsRows',
  'brandTotalsByChannelFromAppsRows',
  'fallbackBrandTotals',
  'closingBrandSheetIds',
  'brandIdAliases',
  'brandIdAliases',
];
for (const m of markers) {
  console.log(m, gate.indexOf(m));
}
const idx = gate.search(/function brandTotals\w*FromAppsRows/);
console.log('fn idx', idx);
console.log(JSON.stringify(gate.slice(idx - 100, idx + 450)));
