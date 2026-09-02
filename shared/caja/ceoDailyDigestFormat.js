/**
 * Formato puro del resumen CEO (push / campana / panel Caja).
 * Sin I/O — usable desde backend y frontend.
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

export function fmtDayEs(dayKey) {
  const m = String(dayKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dayKey;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function shortStoreLabel(name) {
  let s = String(name || 'Tienda').trim();
  s = s.replace(/^LOCAL\s+/i, '');
  const cut = s.split('·')[0].trim();
  return cut || s || 'Tienda';
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

function sumMap(m) {
  return money(Object.values(m || {}).reduce((a, n) => a + (Number(n) || 0), 0));
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

  return {
    name,
    brands: brandEurosFromSession(session),
    pizza,
    burger,
    taco,
    efectivo: money(efectivoTpv + aggCash),
    tarjeta: money(tarjetaTpv + aggCard),
    cobrado,
    cashIn,
    cashOut,
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
      acc.set(key, { ...block, brands: [...(block.brands || [])] });
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
    if (block.notes) {
      prev.notes = prev.notes ? `${prev.notes} · ${block.notes}` : block.notes;
    }
    const brandMap = new Map((prev.brands || []).map((b) => [b.name, b]));
    for (const br of block.brands || []) {
      const ex = brandMap.get(br.name);
      if (ex) ex.euros = money(ex.euros + br.euros);
      else brandMap.set(br.name, { ...br });
    }
    prev.brands = Array.from(brandMap.values()).sort((a, b) => b.euros - a.euros);
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

function closeStatusSuffix(b) {
  const diff = money(b?.difference);
  if (Math.abs(diff) >= 0.01) {
    const sign = diff > 0 ? '+' : '';
    return ` · Descuadre ${sign}${fmtEs(diff)} €`;
  }
  return ' · OK';
}

/** Push: facturación + marcas + salidas (si hay) + OK/descuadre. Compacto para banner. */
export function formatCeoDailyPushBody(blocks, { emptyMessage, includeCloseStatus = true } = {}) {
  if (!blocks?.length) {
    return emptyMessage || 'Sin cierres de caja hoy';
  }
  return blocks
    .map((b) => {
      const lines = [];
      const units = unitsLine(b);
      const head = units
        ? `${b.name} ${units} · ${fmtEs(b.cobrado)} €`
        : `${b.name} ${fmtEs(b.cobrado)} €`;
      lines.push(includeCloseStatus ? `${head}${closeStatusSuffix(b)}` : head);

      const brands = (b.brands || []).filter((br) => Number(br.euros) > 0);
      if (brands.length) {
        lines.push(
          brands
            .map((br) => `${String(br.name || 'Marca').trim()} ${fmtEs(br.euros)} €`)
            .join(' · '),
        );
      }

      const cashOut = money(b.cashOut);
      if (cashOut > 0) {
        lines.push(`Salidas ${fmtEs(cashOut)} €`);
      }

      const notes = String(b.notes || '').trim().replace(/\s+/g, ' ');
      if (notes) {
        const clipped = notes.length > 120 ? `${notes.slice(0, 117)}…` : notes;
        lines.push(`Notas: ${clipped}`);
      }

      return lines.join('\n');
    })
    .join('\n');
}

/** Campana larga — líneas claras para móvil */
export function formatCeoDailyCampanaBody(blocks, dayKey, { businessName } = {}) {
  const header = `Resumen del día · ${fmtDayEs(dayKey)}`;
  if (!blocks?.length) {
    const biz = businessName ? ` (${businessName})` : '';
    return `${header}\n\nSin cierres de caja registrados hoy${biz}.`;
  }

  const out = [header];
  for (const b of blocks) {
    out.push('');
    out.push(String(b.name || 'Tienda').toUpperCase());
    for (const br of b.brands || []) {
      const brand = String(br.name || '').trim() || 'Marca';
      out.push(`· ${brand}  ${fmtEs(br.euros)} €`);
    }
    const units = unitsLine(b);
    if (units) out.push(units);
    out.push(`Cobrado  ${fmtEs(b.cobrado)} €`);
    out.push(`Tarjeta ${fmtEs(b.tarjeta)} € · Efectivo ${fmtEs(b.efectivo)} €`);
    out.push(`En local  ${fmtEs(b.enLocal)} €`);
    if (b.retirado > 0) out.push(`Retirado  ${fmtEs(b.retirado)} €`);
    if (b.cashIn > 0 || b.cashOut > 0) {
      const bits = [];
      if (b.cashIn > 0) bits.push(`Entradas ${fmtEs(b.cashIn)} €`);
      if (b.cashOut > 0) bits.push(`Salidas ${fmtEs(b.cashOut)} €`);
      out.push(bits.join(' · '));
    }
    if (Math.abs(b.difference) >= 0.01) {
      const sign = Number(b.difference) > 0 ? '+' : '';
      out.push(`Descuadre  ${sign}${fmtEs(b.difference)} €`);
    } else {
      out.push('Cierre OK · sin descuadre');
    }
    const notes = String(b.notes || '').trim();
    if (notes) out.push(`Notas  ${notes}`);
  }

  out.push('');
  out.push('TOTAL EMPRESA');
  const facturado = money(blocks.reduce((a, b) => a + Number(b.cobrado || 0), 0));
  out.push(`Facturado  ${fmtEs(facturado)} €`);
  for (const b of blocks) {
    out.push(`En local · ${b.name}  ${fmtEs(b.enLocal)} €`);
  }
  return out.join('\n').trim();
}

/** Vista corta para la lista de la campana (1–3 líneas). */
export function formatCeoDailyCampanaPreview(blocks) {
  if (!blocks?.length) return 'Sin cierres de caja';
  return formatCeoDailyPushBody(blocks);
}
