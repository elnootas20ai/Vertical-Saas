import fs from 'fs';

const GATE = 'src/app/components/saas/TpvRegisterGate.tsx';

function replaceOnce(s, oldStr, newStr, label) {
  const i = s.indexOf(oldStr);
  if (i < 0) {
    console.error('FAIL', label);
    process.exit(1);
  }
  if (s.indexOf(oldStr, i + 1) >= 0) {
    console.error('AMBIGUOUS', label);
    process.exit(1);
  }
  console.log('OK', label);
  return s.slice(0, i) + newStr + s.slice(i + oldStr.length);
}

let gate = fs.readFileSync(GATE, 'utf8');

gate = replaceOnce(
  gate,
  `/** Si el snapshot de apps no trae marcas, arma channel→brand desde filas ya calculadas. */
function brandTotalsByChannelFromAppsRows(
  rows: Array<{ brandId: string; revenue: number }>,
  channelKeys: string[],
): Record<string, Record<string, number>> {
  const positive = rows.filter((r) => (Number(r.revenue) || 0) > 0 && String(r.brandId || '').trim());
  if (positive.length === 0) return {};
  const channels = channelKeys.map((c) => String(c || '').trim()).filter(Boolean);
  const bucket = channels[0] || '_apps';
  const byBrand: Record<string, number> = {};
  for (const r of positive) {
    const id = String(r.brandId).trim();
    byBrand[id] = Math.round(((byBrand[id] || 0) + (Number(r.revenue) || 0)) * 100) / 100;
  }
  return { [bucket]: byBrand };
}`,
  `/**
 * Si el snapshot de apps no trae marcas, reparte totales de marca en CADA canal
 * con peso del € del canal (nunca todo al primer canal).
 */
function brandTotalsByChannelFromAppsRows(
  rows: Array<{ brandId: string; revenue: number }>,
  channelKeys: string[],
  channelAmounts: Record<string, number> = {},
): Record<string, Record<string, number>> {
  const positive = rows.filter((r) => (Number(r.revenue) || 0) > 0 && String(r.brandId || '').trim());
  if (positive.length === 0) return {};
  const channels = channelKeys.map((c) => String(c || '').trim()).filter(Boolean);
  if (channels.length === 0) return {};
  const byBrand: Record<string, number> = {};
  for (const r of positive) {
    const id = String(r.brandId).trim();
    byBrand[id] = Math.round(((byBrand[id] || 0) + (Number(r.revenue) || 0)) * 100) / 100;
  }
  const weights: Record<string, number> = {};
  let weightSum = 0;
  for (const ch of channels) {
    const w = Math.max(0, Number(channelAmounts[ch]) || 0);
    weights[ch] = w;
    weightSum += w;
  }
  if (weightSum <= 0) {
    const eq = 1 / channels.length;
    for (const ch of channels) weights[ch] = eq;
    weightSum = 1;
  }
  const out: Record<string, Record<string, number>> = {};
  for (const ch of channels) {
    const scale = weights[ch] / weightSum;
    const per: Record<string, number> = {};
    for (const [id, amt] of Object.entries(byBrand)) {
      const v = Math.round(amt * scale * 100) / 100;
      if (v > 0) per[id] = v;
    }
    if (Object.keys(per).length > 0) out[ch] = per;
  }
  return out;
}`,
  'fallback fn proportional',
);

gate = replaceOnce(
  gate,
  `                    const fallbackBrandTotals = hasSnapBrands
                      ? snapBrands
                      : brandTotalsByChannelFromAppsRows(
                        scaleAppsBrandTotalsToAppTotal(
                          appsBrandBilling.rows,
                          appsBrandBilling.unbranded,
                          hechoAppsTotal,
                        ).rows,
                        finalAggregatorRows
                          .filter((r) => (Number(r.totalSales) || 0) > 0)
                          .map((r) => r.platform.channel),
                      );`,
  `                    const fallbackChannels = finalAggregatorRows
                      .filter((r) => (Number(r.totalSales) || 0) > 0);
                    const fallbackBrandTotals = hasSnapBrands
                      ? snapBrands
                      : brandTotalsByChannelFromAppsRows(
                        scaleAppsBrandTotalsToAppTotal(
                          appsBrandBilling.rows,
                          appsBrandBilling.unbranded,
                          hechoAppsTotal,
                        ).rows,
                        fallbackChannels.map((r) => r.platform.channel),
                        Object.fromEntries(
                          fallbackChannels.map((r) => [
                            r.platform.channel,
                            Number(r.totalSales) || 0,
                          ]),
                        ),
                      );`,
  'fallback call with channel €',
);

gate = replaceOnce(
  gate,
  `                        brandTotalsByChannel: fallbackBrandTotals,
                        unpaidCashByBrandByChannel: appsSnapshot?.unpaidCashByBrandByChannel,
                        unpaidCardByBrandByChannel: appsSnapshot?.unpaidCardByBrandByChannel,
                        closingBrandLabels: labelMap,
                        brandTpvTotals: Object.fromEntries(`,
  `                        brandTotalsByChannel: fallbackBrandTotals,
                        unpaidCashByBrandByChannel: appsSnapshot?.unpaidCashByBrandByChannel,
                        unpaidCardByBrandByChannel: appsSnapshot?.unpaidCardByBrandByChannel,
                        closingBrandLabels: labelMap,
                        closingBrandSheetIds: (() => {
                          const map: Record<string, string> = {};
                          for (const slot of closingBrands) {
                            const sid = String(slot.sheetId || '').trim();
                            if (!sid) continue;
                            for (const id of brandIdAliases(slot.brandId)) map[id] = sid;
                            for (const mid of slot.memberBrandIds || []) {
                              for (const id of brandIdAliases(mid)) map[id] = sid;
                            }
                          }
                          return map;
                        })(),
                        brandTpvTotals: Object.fromEntries(`,
  'extras closingBrandSheetIds',
);

gate = replaceOnce(
  gate,
  `    appsClosingExtras?: {
      brandTotalsByChannel?: Record<string, Record<string, number>>;
      unpaidCashByBrandByChannel?: Record<string, Record<string, number>>;
      unpaidCardByBrandByChannel?: Record<string, Record<string, number>>;
      closingBrandLabels?: Record<string, string>;
      /** Caja 1 efectivo/tarjeta por marca (Excel = finales de caja). */
      brandTpvTotals?: Record<string, { efectivo: number; tarjeta: number }>;
    },`,
  `    appsClosingExtras?: {
      brandTotalsByChannel?: Record<string, Record<string, number>>;
      unpaidCashByBrandByChannel?: Record<string, Record<string, number>>;
      unpaidCardByBrandByChannel?: Record<string, Record<string, number>>;
      closingBrandLabels?: Record<string, string>;
      /** Total MM/BB → id hoja Excel (mismas 4 pestañas marca×tienda). */
      closingBrandSheetIds?: Record<string, string>;
      /** Caja 1 efectivo/tarjeta por marca (Excel = finales de caja). */
      brandTpvTotals?: Record<string, { efectivo: number; tarjeta: number }>;
    },`,
  'type closingBrandSheetIds',
);

gate = replaceOnce(
  gate,
  `    const closingBrandLabels = appsClosingExtras?.closingBrandLabels;
    const brandTpvTotals = appsClosingExtras?.brandTpvTotals;`,
  `    const closingBrandLabels = appsClosingExtras?.closingBrandLabels;
    const closingBrandSheetIds = appsClosingExtras?.closingBrandSheetIds;
    const brandTpvTotals = appsClosingExtras?.brandTpvTotals;`,
  'read closingBrandSheetIds',
);

gate = replaceOnce(
  gate,
  `    const hasClosingLabels = Boolean(
      closingBrandLabels && Object.keys(closingBrandLabels).length > 0,
    );
    const hasBrandTpvTotals = Boolean(`,
  `    const hasClosingLabels = Boolean(
      closingBrandLabels && Object.keys(closingBrandLabels).length > 0,
    );
    const hasClosingSheetIds = Boolean(
      closingBrandSheetIds && Object.keys(closingBrandSheetIds).length > 0,
    );
    const hasBrandTpvTotals = Boolean(`,
  'hasClosingSheetIds',
);

gate = replaceOnce(
  gate,
  `      ...(hasClosingLabels ? { closingBrandLabels } : {}),
      ...(hasBrandTpvTotals ? { closingBrandTpvTotals: brandTpvTotals } : {}),`,
  `      ...(hasClosingLabels ? { closingBrandLabels } : {}),
      ...(hasClosingSheetIds ? { closingBrandSheetIds } : {}),
      ...(hasBrandTpvTotals ? { closingBrandTpvTotals: brandTpvTotals } : {}),`,
  'persist closingBrandSheetIds',
);

fs.writeFileSync(GATE, gate);
console.log('DONE gate');
