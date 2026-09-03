/**
 * Formato puro del resumen CEO (push / campana / panel Caja).
 * Sin I/O — usable desde backend y frontend.
 *
 * Push cierre Delivery PRO (cualquier tienda):
 *   TIANA (02/09/26)
 *   MM 668,28€
 *   P 19
 *   BB 122,95€
 *   BB 4 taco 4
 *   Tarjeta total 207,60€
 *   Efectivo total 254,45€
 *   Tejada 54
 *   Jordi 28
 *   Fondo 91,60
 *   (notas)
 */

export function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function fmtEs(n) {
  return money(n).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Entero sin decimales; si no, formato ES. */
export function fmtPushAmount(n) {
  const m = money(n);
  if (Math.abs(m - Math.round(m)) < 0.001) return String(Math.round(m));
  return fmtEs(m);
}

export function fmtDayEs(dayKey) {
  const m = String(dayKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dayKey;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** 2026-09-02 → 02/09/26 */
export function fmtDayShort(dayKey) {
  const m = String(dayKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}

export function shortStoreLabel(name) {
  let s = String(name || 'Tienda').trim();
  s = s.replace(/^LOCAL\s+/i, '');
  const cut = s.split('·')[0].trim();
  return cut || s || 'Tienda';
}

/** Modomio → MM / MO; Black Burger → BB */
export function shortBrandLabel(name) {
  const s = String(name || '').trim();
  if (!s) return 'M';
  const parts = s.split(/[\s/_·-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return parts
      .map((p) => p.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 4);
  }
  const letters = s.replace(/[^a-zA-ZÀ-ÿ]/g, '');
  if (letters.length >= 2) {
    // Modomio → MM (inicial + siguiente mayúscula interna o 2ª letra)
    const inner = letters.slice(1).match(/[A-ZÀ-Ý]/);
    if (inner) return `${letters[0]}${inner[0]}`.toUpperCase();
    return letters.slice(0, 2).toUpperCase();
  }
  return (letters.charAt(0) || 'M').toUpperCase();
}

function foldName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Qué uds de comida cuelga de cada marca (regla facturación típica). */
export function foodUnitsHintForBrand(brandName) {
  const f = foldName(brandName);
  if (/taco/.test(f) && !/burger|hamburg|black/.test(f)) return ['taco'];
  if (/burger|hamburg|black/.test(f)) return ['burger', 'taco'];
  if (/pizza|modomio|calzone|modo/.test(f)) return ['pizza'];
  return null;
}

function brandEurosFromSession(session) {
  const labels = session.closingBrandLabels || {};
  const brandTpv = session.closingBrandTpvTotals || {};
  const brandApps = session.aggregatorClosingBrandTotals || {};
  const ids = new Set([
    ...Object.keys(brandTpv),
    ...Object.values(brandApps).flatMap((m) => Object.keys(m || {})),
  ]);
  const rows = [];
  for (const id of ids) {
    const tpv = brandTpv[id] || {};
    let euros = money(Number(tpv.efectivo || 0) + Number(tpv.tarjeta || 0));
    for (const ch of Object.values(brandApps)) {
      euros = money(euros + Number(ch?.[id] || 0));
    }
    if (euros <= 0) continue;
    rows.push({
      id,
      name: String(labels[id] || id).trim() || id.slice(0, 8),
      euros,
    });
  }
  rows.sort((a, b) => b.euros - a.euros);
  return rows;
}

/** Asigna P/B/T de la tienda a cada marca según pista de nombre / hoja. */
export function attachBrandFoodUnits(brands, storeUnits) {
  const pizza = Math.max(0, Math.floor(Number(storeUnits?.pizza) || 0));
  const burger = Math.max(0, Math.floor(Number(storeUnits?.burger) || 0));
  const taco = Math.max(0, Math.floor(Number(storeUnits?.taco) || 0));
  const list = Array.isArray(brands) ? brands : [];
  if (!list.length) return [];

  if (list.length === 1) {
    return [{ ...list[0], pizza, burger, taco }];
  }

  const used = { pizza: false, burger: false, taco: false };
  const out = list.map((br) => {
    const hint = foodUnitsHintForBrand(br.name);
    const u = { pizza: 0, burger: 0, taco: 0 };
    if (hint) {
      for (const key of hint) {
        if (key === 'pizza' && !used.pizza) {
          u.pizza = pizza;
          used.pizza = true;
        }
        if (key === 'burger' && !used.burger) {
          u.burger = burger;
          used.burger = true;
        }
        if (key === 'taco' && !used.taco) {
          u.taco = taco;
          used.taco = true;
        }
      }
    }
    return { ...br, ...u };
  });

  // Si alguna ud no se asignó, cuelga en la marca con más €
  const top = out[0];
  if (top) {
    if (!used.pizza && pizza) top.pizza = pizza;
    if (!used.burger && burger) top.burger = burger;
    if (!used.taco && taco) top.taco = taco;
  }
  return out;
}

function sumMap(m) {
  return money(Object.values(m || {}).reduce((a, n) => a + (Number(n) || 0), 0));
}

function sessionDayKeyFromClosed(session) {
  const raw = session?.closedAt || session?.openedAt || session?.createdAt;
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Salidas agrupadas por persona (workerName o descripción). */
export function cashOutsByPersonFromSession(session) {
  const txs = Array.isArray(session?.transactions) ? session.transactions : [];
  const map = new Map();
  for (const t of txs) {
    const type = String(t?.type || '');
    if (type !== 'cash_out' && type !== 'expense') continue;
    const amt = money(t.amount);
    if (amt <= 0) continue;
    let name = String(t.workerName || '').trim();
    if (!name) {
      const d = String(t.description || '').trim();
      const m = d.match(/^pago\s+trabajador\s*[:\-]?\s*(.+)$/i);
      name = m ? String(m[1] || '').trim() : d;
    }
    if (!name) name = 'Salida';
    // Primera palabra / apellido corto (Tejada, Jordi…)
    name = name.split(/\s+/)[0];
    map.set(name, money((map.get(name) || 0) + amt));
  }
  return Array.from(map.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'es'));
}

/**
 * Bloque por tienda (sesión cerrada).
 * @returns {object|null}
 */
export function buildStoreDigestBlock(session) {
  if (!session || session.status !== 'closed') return null;
  const name = shortStoreLabel(
    session.pointOfSaleName || session.salesPointName || session.pdvName || 'Tienda',
  );
  const method = session.summary?.salesByMethod || {};
  const efectivoTpv = money(method.efectivo);
  const tarjetaTpv = money(method.tarjeta);
  const aggCash = sumMap(session.aggregatorClosingCash);
  const aggCard = sumMap(session.aggregatorClosingCard);
  const apps = money(sumMap(session.aggregatorClosingTotals) || aggCash + aggCard);
  const tpv = money(Number(session.summary?.totalSales || 0));
  const cobrado = money(tpv + apps);
  const counts = session.productClosingCounts || {};
  const pizza = Math.max(0, Math.floor(Number(counts.pizza || 0)));
  const burger = Math.max(0, Math.floor(Number(counts.burger || 0)));
  const taco = Math.max(0, Math.floor(Number(counts.taco || 0)));
  const cashIn = money(session.summary?.totalCashIn);
  const cashOut = money(session.summary?.totalCashOut);
  const counted = money(session.finalCashAmount);
  const enLocal = money(
    session.nextDayInitialCash != null && session.nextDayInitialCash !== ''
      ? session.nextDayInitialCash
      : counted,
  );
  const retirado = money(Math.max(0, counted - enLocal));
  const difference = money(session.difference);
  const notes = String(session.closingNotes || session.notes || '').trim();
  const brandsRaw = brandEurosFromSession(session);
  const brands = attachBrandFoodUnits(brandsRaw, { pizza, burger, taco });
  const cashOuts = cashOutsByPersonFromSession(session);
  const dayKey = sessionDayKeyFromClosed(session);

  return {
    name,
    dayKey,
    brands,
    pizza,
    burger,
    taco,
    efectivo: money(efectivoTpv + aggCash),
    tarjeta: money(tarjetaTpv + aggCard),
    cobrado,
    cashIn,
    cashOut,
    cashOuts,
    enLocal,
    retirado,
    difference,
    notes,
  };
}

/** Varios turnos cerrados → un bloque por tienda (suma; enLocal = último). */
export function mergeStoreDigestBlocks(blocks) {
  const acc = new Map();
  for (const block of blocks || []) {
    if (!block) continue;
    const key = String(block.name || 'Tienda').toLowerCase();
    const prev = acc.get(key);
    if (!prev) {
      acc.set(key, {
        ...block,
        brands: [...(block.brands || [])],
        cashOuts: [...(block.cashOuts || [])],
      });
      continue;
    }
    prev.cobrado = money(prev.cobrado + block.cobrado);
    prev.efectivo = money(prev.efectivo + block.efectivo);
    prev.tarjeta = money(prev.tarjeta + block.tarjeta);
    prev.pizza += block.pizza;
    prev.burger += block.burger;
    prev.taco += block.taco;
    prev.cashIn = money(prev.cashIn + block.cashIn);
    prev.cashOut = money(prev.cashOut + block.cashOut);
    prev.enLocal = block.enLocal;
    prev.retirado = money(prev.retirado + block.retirado);
    prev.difference = money(prev.difference + block.difference);
    if (block.dayKey) prev.dayKey = block.dayKey;
    if (block.notes) {
      prev.notes = prev.notes ? `${prev.notes} · ${block.notes}` : block.notes;
    }
    const brandMap = new Map((prev.brands || []).map((b) => [b.name, { ...b }]));
    for (const br of block.brands || []) {
      const ex = brandMap.get(br.name);
      if (ex) {
        ex.euros = money(ex.euros + br.euros);
        ex.pizza = (ex.pizza || 0) + (br.pizza || 0);
        ex.burger = (ex.burger || 0) + (br.burger || 0);
        ex.taco = (ex.taco || 0) + (br.taco || 0);
      } else {
        brandMap.set(br.name, { ...br });
      }
    }
    prev.brands = Array.from(brandMap.values()).sort((a, b) => b.euros - a.euros);
    const outMap = new Map((prev.cashOuts || []).map((c) => [c.name, c.amount]));
    for (const c of block.cashOuts || []) {
      outMap.set(c.name, money((outMap.get(c.name) || 0) + c.amount));
    }
    prev.cashOuts = Array.from(outMap.entries())
      .map(([n, amount]) => ({ name: n, amount }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'es'));
  }
  return Array.from(acc.values());
}

export function buildMergedStoreDigestBlocks(sessions) {
  return mergeStoreDigestBlocks(
    (sessions || []).map((s) => buildStoreDigestBlock(s)).filter(Boolean),
  );
}

export function unitsLine(b) {
  const parts = [];
  if (b.pizza) parts.push(`${b.pizza} pizza${b.pizza === 1 ? '' : 's'}`);
  if (b.burger) parts.push(`${b.burger} burger${b.burger === 1 ? '' : 's'}`);
  if (b.taco) parts.push(`${b.taco} taco${b.taco === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** Línea de uds por marca: "P 19" o "BB 4 taco 4" */
export function brandFoodUnitsLine(brand) {
  const short = shortBrandLabel(brand?.name);
  const pizza = Math.max(0, Math.floor(Number(brand?.pizza) || 0));
  const burger = Math.max(0, Math.floor(Number(brand?.burger) || 0));
  const taco = Math.max(0, Math.floor(Number(brand?.taco) || 0));
  if (!pizza && !burger && !taco) return '';
  if (pizza && !burger && !taco) return `P ${pizza}`;
  if (!pizza && (burger || taco)) {
    if (burger && taco) return `${short} ${burger} taco ${taco}`;
    if (burger) return `${short} ${burger}`;
    return `${short} taco ${taco}`;
  }
  // mezcla rara: P + resto
  const bits = [];
  if (pizza) bits.push(`P ${pizza}`);
  if (burger || taco) {
    if (burger && taco) bits.push(`${short} ${burger} taco ${taco}`);
    else if (burger) bits.push(`${short} ${burger}`);
    else bits.push(`${short} taco ${taco}`);
  }
  return bits.join(' · ');
}

function closeStatusLine(b) {
  const diff = money(b?.difference);
  if (Math.abs(diff) >= 0.01) {
    const sign = diff > 0 ? '+' : '';
    return `Descuadre ${sign}${fmtEs(diff)}€`;
  }
  return '';
}

/**
 * Push Delivery PRO — parte de cierre (cualquier tienda).
 * Una línea por dato, como el mensaje operativo del CEO.
 */
export function formatCeoDailyPushBody(blocks, { emptyMessage, includeCloseStatus = true } = {}) {
  if (!blocks?.length) {
    return emptyMessage || 'Sin cierres de caja hoy';
  }
  return blocks
    .map((b) => {
      const lines = [];
      const day = fmtDayShort(b.dayKey) || '';
      lines.push(day ? `${String(b.name || 'Tienda').toUpperCase()} (${day})` : String(b.name || 'Tienda').toUpperCase());

      const brands = (b.brands || []).filter((br) => Number(br.euros) > 0);
      if (brands.length) {
        for (const br of brands) {
          const short = shortBrandLabel(br.name);
          lines.push(`${short} ${fmtEs(br.euros)}€`);
          const uLine = brandFoodUnitsLine(br);
          if (uLine) lines.push(uLine);
        }
      } else {
        const u = unitsLine(b);
        if (u) lines.push(u);
        if (Number(b.cobrado) > 0) lines.push(`Total ${fmtEs(b.cobrado)}€`);
      }

      lines.push(`Tarjeta total ${fmtEs(b.tarjeta)}€`);
      lines.push(`Efectivo total ${fmtEs(b.efectivo)}€`);

      const outs = Array.isArray(b.cashOuts) ? b.cashOuts : [];
      if (outs.length) {
        for (const o of outs) {
          lines.push(`${o.name} ${fmtPushAmount(o.amount)}`);
        }
      } else if (money(b.cashOut) > 0) {
        lines.push(`Salidas ${fmtEs(b.cashOut)}€`);
      }

      lines.push(`Fondo ${fmtEs(b.enLocal)}`);

      if (includeCloseStatus) {
        const status = closeStatusLine(b);
        if (status) lines.push(status);
      }

      const notes = String(b.notes || '').trim();
      if (notes) {
        lines.push('');
        const clipped = notes.length > 280 ? `${notes.slice(0, 277)}…` : notes;
        lines.push(clipped);
      }

      return lines.join('\n');
    })
    .join('\n\n');
}

/** Campana larga — mismo espíritu PRO, un poco más explícito */
export function formatCeoDailyCampanaBody(blocks, dayKey, { businessName } = {}) {
  if (!blocks?.length) {
    const header = `Resumen del día · ${fmtDayEs(dayKey)}`;
    const biz = businessName ? ` (${businessName})` : '';
    return `${header}\n\nSin cierres de caja registrados hoy${biz}.`;
  }

  // Misma estructura que el push (el CEO quiere el parte operativo).
  const withDay = blocks.map((b) => ({
    ...b,
    dayKey: b.dayKey || dayKey,
  }));
  return formatCeoDailyPushBody(withDay, { includeCloseStatus: true });
}

/** Vista corta para la lista de la campana (1–3 líneas). */
export function formatCeoDailyCampanaPreview(blocks) {
  if (!blocks?.length) return 'Sin cierres de caja';
  const b = blocks[0];
  const day = fmtDayShort(b.dayKey);
  const head = day ? `${b.name} (${day})` : b.name;
  const brands = (b.brands || []).filter((br) => Number(br.euros) > 0).slice(0, 2);
  const brandBit = brands.map((br) => `${shortBrandLabel(br.name)} ${fmtEs(br.euros)}€`).join(' · ');
  return [head, brandBit, `Efectivo ${fmtEs(b.efectivo)}€`].filter(Boolean).join('\n');
}
