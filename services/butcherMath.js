/**
 * Helpers puros carnicería (testables sin CouchDB).
 */

export function suggestPriceFromCost(costPerKg, marginPct = 30) {
  const cost = Number(costPerKg) || 0;
  const margin = Math.min(90, Math.max(0, Number(marginPct) || 30)) / 100;
  if (!(cost > 0)) return 0;
  return Math.round((cost / (1 - margin)) * 100) / 100;
}

export function cuttingAllocationKg(totalKg, cuts = []) {
  const kg = Math.max(0, Number(totalKg) || 0);
  const applied = [];
  let allocated = 0;
  for (const cut of cuts) {
    const pct = Number(cut.yieldPct || 0);
    if (!(pct > 0)) continue;
    const cutKg = Math.round((kg * pct / 100) * 1000) / 1000;
    allocated += cutKg;
    applied.push({
      productId: cut.productId || '',
      productName: cut.productName || '',
      kg: cutKg,
      yieldPct: pct,
    });
  }
  const mermaKg = Math.max(0, Math.round((kg - allocated) * 1000) / 1000);
  return { applied, mermaKg, allocated };
}

export function formatBatchCodePrefix(entryDate, animalType) {
  const dateRaw = String(entryDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const datePart = dateRaw.replace(/-/g, '');
  const animalMap = {
    vacuno: 'VAC', ternera: 'VAC', cerdo: 'CER', porcino: 'CER',
    pollo: 'POL', ave: 'POL', cordero: 'COR', ovino: 'COR',
    elaborados: 'ELA', mixto: 'MIX',
  };
  const key = String(animalType || '').trim().toLowerCase();
  let animal = animalMap[key];
  if (!animal) {
    animal = String(animalType || 'GEN').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase() || 'GEN';
  }
  return `${animal}-${datePart}-`;
}

export function nextBatchCode(prefix, existingCodes = []) {
  let maxSeq = 0;
  for (const code of existingCodes) {
    const c = String(code || '');
    if (!c.startsWith(prefix)) continue;
    const n = Number(c.slice(prefix.length));
    if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

export function daysUntilExpiry(fechaCaducidad, todayIso = new Date().toISOString().slice(0, 10)) {
  const cad = String(fechaCaducidad || '').slice(0, 10);
  if (!cad) return null;
  const a = new Date(`${cad}T12:00:00`);
  const b = new Date(`${todayIso}T12:00:00`);
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}
