#!/usr/bin/env node
/**
 * SOLO LECTURA — Compara Excel Uriel (Modomio/Tiana ago) vs cierres de caja en prod.
 * Columnas Excel: DIA EFECTIVO TPV X App UBER JUST_EAT GLOVO TOTAL TOTAL_PIZZA
 */
const COUCH = process.env.COUCHDB_URL || 'http://127.0.0.1:5984';
const AUTH =
  'Basic ' +
  Buffer.from(
    `${process.env.COUCHDB_USER || process.env.COUCH_USER || 'vertialadmin'}:${process.env.COUCHDB_PASSWORD || process.env.COUCH_PASSWORD || 'uriel12345'}`,
  ).toString('base64');

const DIS = 'ed846f31-aee7-4568-ac03-fa25ff3ad773';
const MODOMIO = '33821959-ae50-4e52-bfea-ea2b145faeac';
const TIANA_PDV_HINTS = /tiana/i;
const MONTH = '2026-08';

/** Excel Uriel (coma → punto). Vacío = 0. */
const EXCEL = {
  3: { efectivo: 149.2, tpv: 288.6, x: 0, app: 13.18, uber: 0, justEat: 0, glovo: 0, total: 450.98, pizza: 40 },
  4: { efectivo: 78.5, tpv: 187.49, x: 0, app: 18.57, uber: 51.7, justEat: 63.24, glovo: 0, total: 399.5, pizza: 25 },
  5: { efectivo: 148.5, tpv: 289.09, x: 0, app: 0, uber: 0, justEat: 0, glovo: 0, total: 437.59, pizza: 26 },
  6: { efectivo: 200.86, tpv: 382.05, x: 0, app: 282.21, uber: 0, justEat: 120.56, glovo: 0, total: 985.68, pizza: 25 },
  7: { efectivo: 133.85, tpv: 495.19, x: 0, app: 95.6, uber: 87.78, justEat: 178.1, glovo: 0, total: 990.52, pizza: 60 },
  8: { efectivo: 70.65, tpv: 440.88, x: 0, app: 243.3, uber: 93.24, justEat: 157.45, glovo: 0, total: 1005.52, pizza: 61 },
  9: { efectivo: 472.1, tpv: 585.99, x: 0, app: 204.28, uber: 113.04, justEat: 76.95, glovo: 0, total: 1452.36, pizza: 87 },
  10: { efectivo: 31, tpv: 266.1, x: 0, app: 87.4, uber: 35.49, justEat: 100.83, glovo: 0, total: 520.82, pizza: 31 },
  11: { efectivo: 81.5, tpv: 276.59, x: 0, app: 18.6, uber: 17.4, justEat: 91.4, glovo: 0, total: 485.49, pizza: 29 },
  12: { efectivo: 180.25, tpv: 279, x: 0, app: 78.15, uber: 23.35, justEat: 177.08, glovo: 0, total: 737.83, pizza: 44 },
  13: { efectivo: 151.47, tpv: 344.54, x: 0, app: 18.76, uber: 55.88, justEat: 54.26, glovo: 0, total: 624.91, pizza: 42 },
  14: { efectivo: 92.89, tpv: 432.91, x: 0, app: 47.7, uber: 34.89, justEat: 166.52, glovo: 0, total: 774.91, pizza: 50 },
  15: { efectivo: 60.64, tpv: 479.67, x: 0, app: 83.09, uber: 0, justEat: 128.94, glovo: 0, total: 752.34, pizza: 45 },
  16: { efectivo: 111.09, tpv: 427.35, x: 0, app: 103.09, uber: 150.48, justEat: 335.03, glovo: 0, total: 1127.04, pizza: 73 },
  17: { efectivo: 67.45, tpv: 384.14, x: 0, app: 62.2, uber: 57.1, justEat: 59.7, glovo: 0, total: 630.59, pizza: 37 },
  18: { efectivo: 125.05, tpv: 304.51, x: 0, app: 34.19, uber: 57, justEat: 19.65, glovo: 0, total: 540.4, pizza: 29 },
  19: { efectivo: 78.93, tpv: 308.61, x: 0, app: 52.38, uber: 17, justEat: 77.85, glovo: 0, total: 534.77, pizza: 35 },
  20: { efectivo: 140.9, tpv: 387.71, x: 0, app: 115.54, uber: 32.9, justEat: 80.49, glovo: 0, total: 757.54, pizza: 46 },
  21: { efectivo: 306.46, tpv: 845.12, x: 0, app: 140.47, uber: 35.9, justEat: 274.79, glovo: 0, total: 1602.74, pizza: 97 },
};

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function bid(d) {
  return String(d.business_id || d.businessId || '')
    .replace(/^business:/, '')
    .trim();
}

function madridDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function foldDay(iso) {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return String(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return madridDay(d);
}

function sessionDay(s) {
  const raw = s.workDayKey || s.businessDayKey || s.openedAt || s.createdAt || '';
  return foldDay(raw);
}

function channelTotal(s, ch) {
  const a = Number(s.aggregatorClosingTotals?.[ch] || 0);
  if (a > 0) return r2(a);
  return r2(Number(s.summary?.salesByChannel?.[ch] || s.salesByChannel?.[ch] || 0));
}

function excelFromSession(s) {
  const m = s.summary?.salesByMethod || s.salesByMethod || {};
  const efectivo = r2(m.efectivo || m.cash || 0);
  const tpv = r2(m.tarjeta || m.card || 0);
  const x = r2((m.bizum || 0) + (m.otro || 0));
  const app = r2(channelTotal(s, 'flipdish') + channelTotal(s, 'app'));
  const uber = r2(channelTotal(s, 'ubereats'));
  const justEat = r2(channelTotal(s, 'justeat'));
  const glovo = r2(channelTotal(s, 'glovo'));
  const total = r2(efectivo + tpv + x + app + uber + justEat + glovo);
  const pizza = Math.max(0, Math.floor(Number(s.productClosingCounts?.pizza || s.productClosingCounts?.pizzas || 0)));
  return { efectivo, tpv, x, app, uber, justEat, glovo, total, pizza };
}

function empty() {
  return { efectivo: 0, tpv: 0, x: 0, app: 0, uber: 0, justEat: 0, glovo: 0, total: 0, pizza: 0 };
}

function add(a, b) {
  for (const k of Object.keys(a)) a[k] = r2((a[k] || 0) + (b[k] || 0));
  return a;
}

function isTianaSession(s) {
  const name = `${s.pointOfSaleName || ''} ${s.salesPointName || ''} ${s.name || ''}`;
  const id = String(s.pointOfSaleId || s.salesPointId || '');
  return TIANA_PDV_HINTS.test(name) || /tiana/i.test(id);
}

async function allDocs(db) {
  const res = await fetch(`${COUCH}/${encodeURIComponent(db)}/_all_docs?include_docs=true`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${db} ${res.status}`);
  const json = await res.json();
  return (json.rows || []).map((r) => r.doc).filter(Boolean);
}

function fmt(n) {
  return r2(n).toFixed(2);
}

function rowDiff(label, excel, prod) {
  const keys = ['efectivo', 'tpv', 'x', 'app', 'uber', 'justEat', 'glovo', 'total', 'pizza'];
  const diffs = {};
  let any = false;
  for (const k of keys) {
    const d = r2((prod[k] || 0) - (excel[k] || 0));
    if (Math.abs(d) >= 0.02) {
      diffs[k] = d;
      any = true;
    }
  }
  return { label, excel, prod, diffs, ok: !any };
}

async function main() {
  console.log(JSON.stringify({ mode: 'READ_ONLY', month: MONTH, focus: 'Excel vs caja Tiana/Modomio' }, null, 2));

  const [delivery, businesses, pdvs] = await Promise.all([
    allDocs('bbddsaas-delivery'),
    allDocs('businesses').catch(() => []),
    allDocs('bbddsaas-points-of-sale').catch(() => allDocs('points_of_sale').catch(() => [])),
  ]);

  const bizNames = new Map();
  for (const b of businesses) {
    const id = String(b._id || '').replace(/^business:/, '');
    bizNames.set(id, b.name || b.tradeName || id);
  }
  console.log('biz DIS', bizNames.get(DIS) || DIS);
  console.log('biz MODOMIO', bizNames.get(MODOMIO) || MODOMIO);

  const tianaPdvs = pdvs.filter((p) => {
    const id = String(p._id || p.id || '');
    const name = String(p.name || '');
    const b = bid(p);
    return TIANA_PDV_HINTS.test(name) || /tiana/i.test(id);
  });
  console.log(
    'PDVs Tiana:',
    tianaPdvs.map((p) => ({
      id: p._id,
      name: p.name,
      biz: bid(p),
      bizName: bizNames.get(bid(p)) || '',
    })),
  );

  const days = Object.keys(EXCEL).map((d) => `${MONTH}-${String(d).padStart(2, '0')}`);

  const sessions = delivery.filter((d) => {
    if (!d || d.deletedAt) return false;
    if (d.type !== 'tpv_register_session' && d.type !== 'tpv_caja_session') return false;
    const day = sessionDay(d);
    if (!days.includes(day)) return false;
    const b = bid(d);
    return b === DIS || b === MODOMIO || isTianaSession(d);
  });

  console.log('sessions in range (DIS|MODOMIO|name Tiana):', sessions.length);

  // Agrupar por día + tienda
  const byDay = new Map();
  for (const s of sessions) {
    const day = sessionDay(s);
    const pdvName = String(s.pointOfSaleName || s.salesPointName || s.pointOfSaleId || '¿?');
    const key = `${day}|${bid(s)}|${pdvName}`;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push({
      key,
      biz: bid(s),
      bizName: bizNames.get(bid(s)) || bid(s),
      pdv: pdvName,
      status: s.status,
      amounts: excelFromSession(s),
      id: s._id,
    });
  }

  // Preferencia: DIS + Tiana; fallback suma Tiana; fallback MODOMIO
  function pickProdDay(dayNum) {
    const day = `${MONTH}-${String(dayNum).padStart(2, '0')}`;
    const list = byDay.get(day) || [];
    const tianaDis = list.filter((r) => r.biz === DIS && TIANA_PDV_HINTS.test(r.pdv));
    const tianaAny = list.filter((r) => TIANA_PDV_HINTS.test(r.pdv));
    const modomio = list.filter((r) => r.biz === MODOMIO);

    let chosen = tianaDis;
    let source = 'DIS+Tiana';
    if (!chosen.length) {
      chosen = tianaAny;
      source = 'cualquier Tiana';
    }
    if (!chosen.length) {
      chosen = modomio;
      source = 'biz Modomio';
    }

    const sum = empty();
    for (const r of chosen) add(sum, r.amounts);
    // total recalculado
    sum.total = r2(sum.efectivo + sum.tpv + sum.x + sum.app + sum.uber + sum.justEat + sum.glovo);
    return { day, source, sessions: chosen, sum, allThatDay: list };
  }

  const excelMonth = empty();
  const prodMonth = empty();
  const rows = [];

  console.log('\n=== DÍA A DÍA (prod − excel) ===');
  console.log(
    'día | fuente | excelTotal | prodTotal | Δtotal | Δefe | Δtpv | Δapp | Δuber | ΔJE | Δglovo | pizzaE/P | Δpiz',
  );

  for (const dayNum of Object.keys(EXCEL).map(Number).sort((a, b) => a - b)) {
    const excel = EXCEL[dayNum];
    add(excelMonth, excel);
    excelMonth.total = r2(
      excelMonth.efectivo +
        excelMonth.tpv +
        excelMonth.x +
        excelMonth.app +
        excelMonth.uber +
        excelMonth.justEat +
        excelMonth.glovo,
    );

    const picked = pickProdDay(dayNum);
    add(prodMonth, picked.sum);
    prodMonth.total = r2(
      prodMonth.efectivo +
        prodMonth.tpv +
        prodMonth.x +
        prodMonth.app +
        prodMonth.uber +
        prodMonth.justEat +
        prodMonth.glovo,
    );

    const cmp = rowDiff(`día ${dayNum}`, excel, picked.sum);
    rows.push({ dayNum, ...picked, cmp });

    const d = cmp.diffs;
    console.log(
      [
        String(dayNum).padStart(2),
        picked.source.padEnd(16),
        fmt(excel.total),
        fmt(picked.sum.total),
        (d.total != null ? fmt(d.total) : '0.00').padStart(8),
        d.efectivo != null ? fmt(d.efectivo) : '0',
        d.tpv != null ? fmt(d.tpv) : '0',
        d.app != null ? fmt(d.app) : '0',
        d.uber != null ? fmt(d.uber) : '0',
        d.justEat != null ? fmt(d.justEat) : '0',
        d.glovo != null ? fmt(d.glovo) : '0',
        `${excel.pizza}/${picked.sum.pizza}`,
        d.pizza != null ? String(d.pizza) : '0',
      ].join(' | '),
    );

    if (picked.sessions.length) {
      for (const s of picked.sessions) {
        console.log(
          `    · ${s.bizName} / ${s.pdv} [${s.status}] total=${fmt(s.amounts.total)} pizza=${s.amounts.pizza} id=${s.id}`,
        );
      }
    } else {
      console.log('    · SIN sesión de caja ese día en prod (filtros aplicados)');
      if (picked.allThatDay.length) {
        for (const s of picked.allThatDay) {
          console.log(
            `      (otras) ${s.bizName} / ${s.pdv} total=${fmt(s.amounts.total)}`,
          );
        }
      }
    }
  }

  console.log('\n=== TOTAL MES (días 3–21) ===');
  console.log('Excel Uriel:', {
    efectivo: fmt(excelMonth.efectivo),
    tpv: fmt(excelMonth.tpv),
    app: fmt(excelMonth.app),
    uber: fmt(excelMonth.uber),
    justEat: fmt(excelMonth.justEat),
    glovo: fmt(excelMonth.glovo),
    total: fmt(excelMonth.total),
    pizza: excelMonth.pizza,
  });
  console.log('Prod (caja):', {
    efectivo: fmt(prodMonth.efectivo),
    tpv: fmt(prodMonth.tpv),
    app: fmt(prodMonth.app),
    uber: fmt(prodMonth.uber),
    justEat: fmt(prodMonth.justEat),
    glovo: fmt(prodMonth.glovo),
    total: fmt(prodMonth.total),
    pizza: prodMonth.pizza,
  });
  console.log('Δ (prod − excel):', {
    efectivo: fmt(prodMonth.efectivo - excelMonth.efectivo),
    tpv: fmt(prodMonth.tpv - excelMonth.tpv),
    app: fmt(prodMonth.app - excelMonth.app),
    uber: fmt(prodMonth.uber - excelMonth.uber),
    justEat: fmt(prodMonth.justEat - excelMonth.justEat),
    glovo: fmt(prodMonth.glovo - excelMonth.glovo),
    total: fmt(prodMonth.total - excelMonth.total),
    pizza: prodMonth.pizza - excelMonth.pizza,
  });

  const okDays = rows.filter((r) => r.cmp.ok).length;
  const missing = rows.filter((r) => r.sessions.length === 0).length;
  console.log('\nResumen:', {
    diasOk: okDays,
    diasConDiff: rows.length - okDays,
    diasSinCaja: missing,
    excelTotalMesDeclared: 14811.53,
    excelTotalMesSum: fmt(excelMonth.total),
    excelPizzaDeclared: 882,
    excelPizzaSum: excelMonth.pizza,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
