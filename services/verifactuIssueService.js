/**
 * Emisión Verifactu (Fase 1.5): registros locales + QR AEAT.
 * Envío SOAP a Hacienda = Fase 2 (aún no).
 */
import {
  ensureDatabase,
  getDocument,
  putDocument,
  findBusinessById,
  getBrandBillingConfigDoc,
} from './couchdb.js';
import {
  calcLineTotals,
  computeHuella,
  buildQrUrl,
  formatInvoiceNumber,
  buildFullNumber,
  defaultVerifactuSettings,
  sanitizeVerifactuSettings,
  sanitizeVerifactuRecord,
  normalizeNif,
} from './verifactuEngine.js';
import logger from './logger.js';
import { saleLineOptsFromTaxPolicy, normalizeEsTaxPolicy } from '../shared/tax/spainVat.js';

export function getVerifactuDbName() {
  const prefix = String(process.env.COUCHDB_DB || 'vertial')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_$()+/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${prefix}-verifactu`;
}

export async function loadVerifactuSettingsDoc(req, businessId, business) {
  const db = getVerifactuDbName();
  await ensureDatabase(req, db);
  const id = `verifactu-settings:${businessId}`;
  const existing = await getDocument(req, db, id);
  if (existing && existing.type === 'verifactu_settings') return existing;
  const doc = defaultVerifactuSettings(businessId, business || {});
  const saved = await putDocument(req, db, doc._id, doc);
  return { ...doc, _rev: saved.rev };
}

/**
 * Convierte líneas de venta (precio al público, normalmente con IVA) a input Verifactu.
 */
export function linesFromSaleItems(
  items = [],
  { pricesIncludeTax = true, defaultTaxRate = 10 } = {},
) {
  const out = [];
  for (const raw of items) {
    const description = String(raw?.description || raw?.name || '').trim();
    if (!description) continue;
    const quantity = Number(raw?.quantity) || 0;
    if (quantity <= 0) continue;
    const unitGross = Number(raw?.unitPrice ?? raw?.price) || 0;
    if (unitGross < 0) continue;
    const taxRateRaw = Number(raw?.taxRate ?? raw?.vatRate ?? raw?.iva);
    const taxRate = Number.isFinite(taxRateRaw) ? taxRateRaw : defaultTaxRate;
    let unitPrice = unitGross;
    if (pricesIncludeTax && taxRate > 0) {
      unitPrice = Number((unitGross / (1 + taxRate / 100)).toFixed(4));
    }
    out.push({
      description: description.slice(0, 200),
      quantity,
      unitPrice,
      discountPercent: Number(raw?.discountPercent) || 0,
      taxRate,
    });
  }
  return out;
}

/** Líneas desde comanda de sala (precios con IVA incluido). */
export function linesFromDiningOrder(order, opts = {}) {
  const items = [];
  for (const comanda of order?.comandas || []) {
    if (comanda?.status === 'cancelled') continue;
    for (const item of comanda?.items || []) {
      if (item?.status === 'cancelled') continue;
      items.push({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
        taxRate: item.taxRate,
      });
    }
  }
  return linesFromSaleItems(items, opts);
}

/** Líneas desde pedido delivery/TPV. */
export function linesFromDeliveryOrder(order, opts = {}) {
  const items = (order?.items || []).map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice ?? item.price,
    taxRate: item.taxRate ?? item.vatRate,
    discountPercent: item.discountPercent,
  }));
  return linesFromSaleItems(items, opts);
}

/**
 * Emite un registro inmutable. Lanza Error si falta dato obligatorio.
 * @returns {{ record, settings }}
 */
export async function issueVerifactuRecordDoc(req, {
  businessId,
  business,
  settings: settingsIn,
  body = {},
  actorId = '',
}) {
  const settings = settingsIn || await loadVerifactuSettingsDoc(req, businessId, business);
  if (!settings.enabled) {
    throw new Error('Activa Verifactu en los ajustes de la empresa antes de emitir.');
  }
  if (settings.mode === 'no_verifactu') {
    throw new Error('Esta empresa está en modo sin Verifactu.');
  }

  const issuerNif = normalizeNif(body.issuerNif || settings.issuerNif || business?.taxId);
  const issuerName = String(body.issuerName || settings.issuerName || business?.name || '').trim();
  if (!issuerNif || issuerNif.length < 8) throw new Error('NIF/CIF del emisor obligatorio');
  if (!issuerName) throw new Error('Nombre del emisor obligatorio');

  const recipientNif = normalizeNif(body.recipientNif);
  const recipientName = String(body.recipientName || '').trim() || 'Consumidor final';

  const linesInput = Array.isArray(body.lines) ? body.lines : [];
  if (!linesInput.length) throw new Error('Añade al menos una línea');
  if (linesInput.some((l) => !String(l?.description || '').trim())) {
    throw new Error('Todas las líneas necesitan descripción');
  }

  const { lines, base, tax, total } = calcLineTotals(linesInput);
  const series = String(body.series || settings.series || 'A').trim().toUpperCase().slice(0, 8) || 'A';
  const sequenceNumber = Number(settings.nextNumber) || 1;
  const number = formatInvoiceNumber(series, sequenceNumber);
  const fullNumber = buildFullNumber(series, number);
  const issueDate = String(body.issueDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) throw new Error('Fecha de emisión inválida');

  const huellaAnterior = settings.lastHuella || null;
  const huella = computeHuella({
    issuerNif,
    series,
    number,
    issueDate,
    total,
    huellaAnterior,
  });
  const environment = settings.environment === 'production' ? 'production' : 'sandbox';
  const qrUrl = buildQrUrl({
    issuerNif,
    series,
    number,
    issueDate,
    total,
    environment,
  });

  const now = new Date().toISOString();
  const id = `verifactu-record:${businessId}:${series}:${number}`;
  const db = getVerifactuDbName();
  await ensureDatabase(req, db);

  const existing = await getDocument(req, db, id);
  if (existing && existing.type === 'verifactu_record') {
    throw new Error(`Ya existe el registro ${fullNumber}. No se puede reutilizar el número.`);
  }

  const record = {
    _id: id,
    type: 'verifactu_record',
    business_id: businessId,
    mode: settings.mode || 'verifactu',
    status: 'issued',
    aeatStatus: 'pending_local',
    series,
    number,
    fullNumber,
    issueDate,
    issuer: {
      nif: issuerNif,
      name: issuerName,
      address: String(body.issuerAddress || settings.issuerAddress || '').trim(),
      city: String(body.issuerCity || settings.issuerCity || '').trim(),
      postalCode: String(body.issuerPostalCode || settings.issuerPostalCode || '').trim(),
    },
    recipient: {
      nif: recipientNif || null,
      name: recipientName,
      address: String(body.recipientAddress || '').trim(),
      city: String(body.recipientCity || '').trim(),
      postalCode: String(body.recipientPostalCode || '').trim(),
    },
    lines,
    base,
    tax,
    total,
    huella,
    huellaAnterior,
    qrUrl,
    rectifiesId: body.rectifiesId || null,
    source: body.source || { kind: 'manual' },
    notes: String(body.notes || '').trim(),
    createdAt: now,
    createdBy: actorId || null,
    immutable: true,
  };

  const saved = await putDocument(req, db, record._id, record);
  const nextSettings = {
    ...settings,
    nextNumber: sequenceNumber + 1,
    lastHuella: huella,
    lastRecordId: record._id,
    updatedAt: now,
  };
  const settingsSaved = await putDocument(req, db, nextSettings._id, nextSettings);

  return {
    record: sanitizeVerifactuRecord({ ...record, _rev: saved.rev }),
    settings: sanitizeVerifactuSettings({ ...nextSettings, _rev: settingsSaved.rev }),
  };
}

function saleLineOpts(settings, taxPolicy = null) {
  const fromBilling = taxPolicy ? saleLineOptsFromTaxPolicy(taxPolicy) : null;
  const pricesIncludeTax = settings?.pricesIncludeTax !== false;
  const defaultTaxRate = Number.isFinite(Number(settings?.defaultTaxRate))
    ? Number(settings.defaultTaxRate)
    : 10;
  return {
    pricesIncludeTax: fromBilling?.pricesIncludeTax ?? pricesIncludeTax,
    defaultTaxRate: fromBilling?.defaultTaxRate ?? defaultTaxRate,
  };
}

async function loadBusinessTaxPolicy(req, businessId) {
  const bid = String(businessId || '').trim();
  if (!bid) return normalizeEsTaxPolicy(null);
  try {
    const doc = await getBrandBillingConfigDoc(req, bid);
    return normalizeEsTaxPolicy(doc?.taxPolicy);
  } catch {
    return normalizeEsTaxPolicy(null);
  }
}

function shouldAutoIssue(settings) {
  if (!settings?.enabled) return false;
  if (settings.mode === 'no_verifactu') return false;
  if (settings.autoIssueOnSale === false) return false;
  return true;
}

/**
 * Intenta emitir Verifactu al cobrar. No lanza: falla en silencio (log) para no romper el cobro.
 * @returns {null | { record, settings, skipped?: string }}
 */
export async function tryAutoIssueVerifactuForSale(req, {
  businessId,
  source,
  recipientName,
  recipientNif,
  lines,
  notes,
  actorId,
  alreadyIssuedId,
}) {
  const bid = String(businessId || '').replace(/^business:/, '').trim();
  if (!bid) return { skipped: 'no_business' };
  if (alreadyIssuedId) return { skipped: 'already_issued' };

  try {
    const business = await findBusinessById(req, bid);
    if (!business) return { skipped: 'business_not_found' };

    const settings = await loadVerifactuSettingsDoc(req, bid, business);
    if (!shouldAutoIssue(settings)) return { skipped: 'disabled' };

    const nif = normalizeNif(settings.issuerNif || business.taxId);
    if (!nif || nif.length < 8) {
      logger.warn({ businessId: bid }, 'Verifactu auto: falta NIF emisor');
      return { skipped: 'missing_issuer_nif' };
    }

    const lineList = Array.isArray(lines) ? lines.filter((l) => String(l?.description || '').trim()) : [];
    if (!lineList.length) return { skipped: 'no_lines' };

    const result = await issueVerifactuRecordDoc(req, {
      businessId: bid,
      business,
      settings,
      actorId,
      body: {
        recipientName: String(recipientName || '').trim() || 'Consumidor final',
        recipientNif: recipientNif || '',
        lines: lineList,
        notes: notes || '',
        source: source || { kind: 'sale' },
      },
    });
    return result;
  } catch (err) {
    logger.warn({ err, businessId: bid }, 'Verifactu auto-emisión falló');
    return { skipped: 'error', error: err?.message || String(err) };
  }
}

export async function tryAutoIssueForDeliveryOrder(req, order, actorId = '') {
  if (!order || order.verifactuRecordId) {
    return { skipped: order?.verifactuRecordId ? 'already_issued' : 'no_order' };
  }
  const channel = String(order.channel || '').toLowerCase();
  // Solo cobros TPV (ticket local). Pedidos agregadores/delivery externos: no auto aún.
  if (channel !== 'tpv') return { skipped: 'not_tpv_channel' };

  const businessId = String(order.business_id || order.businessId || '').replace(/^business:/, '').trim();
  const [settingsPreview, taxPolicy] = await Promise.all([
    businessId
      ? loadVerifactuSettingsDoc(
        req,
        businessId,
        await findBusinessById(req, businessId).catch(() => null),
      ).catch(() => null)
      : null,
    loadBusinessTaxPolicy(req, businessId),
  ]);
  const opts = saleLineOpts(settingsPreview || {}, taxPolicy);
  const lines = linesFromDeliveryOrder(order, opts);

  return tryAutoIssueVerifactuForSale(req, {
    businessId,
    actorId,
    alreadyIssuedId: order.verifactuRecordId,
    recipientName: order.customerName || 'Consumidor final',
    recipientNif: order.customerTaxId || order.customerNif || '',
    lines,
    notes: `Pedido ${order.orderNumber || order.ticketNumber || order._id || ''}`.trim(),
    source: {
      kind: 'tpv_delivery',
      orderId: order._id,
      orderNumber: order.orderNumber || '',
      ticketNumber: order.ticketNumber || '',
      channel: 'tpv',
    },
  });
}

export async function tryAutoIssueForDiningOrder(req, order, actorId = '') {
  if (!order || order.verifactuRecordId) {
    return { skipped: order?.verifactuRecordId ? 'already_issued' : 'no_order' };
  }
  const businessId = String(order.businessId || order.business_id || '').replace(/^business:/, '').trim();
  const settingsPreview = businessId
    ? await loadVerifactuSettingsDoc(
      req,
      businessId,
      await findBusinessById(req, businessId).catch(() => null),
    ).catch(() => null)
    : null;
  const opts = saleLineOpts(settingsPreview || {});
  const lines = linesFromDiningOrder(order, opts);

  return tryAutoIssueVerifactuForSale(req, {
    businessId,
    actorId,
    alreadyIssuedId: order.verifactuRecordId,
    recipientName: order.clientName || 'Consumidor final',
    recipientNif: '',
    lines,
    notes: `Mesa ${order.tableName || order.tableNumber || ''} · sala`.trim(),
    source: {
      kind: 'tpv_sala',
      orderId: order._id,
      tableId: order.tableId || '',
      tableNumber: order.tableNumber || 0,
    },
  });
}

/** Auto-emisión Verifactu para venta TPV carnicería. */
export async function tryAutoIssueForButcherSale(req, sale, actorId = '') {
  if (!sale || sale.verifactuRecordId) {
    return { skipped: sale?.verifactuRecordId ? 'already_issued' : 'no_sale' };
  }
  if (String(sale.status || '') === 'voided') return { skipped: 'voided' };

  const businessId = String(sale.business_id || sale.businessId || '').replace(/^business:/, '').trim();
  const settingsPreview = businessId
    ? await loadVerifactuSettingsDoc(
      req,
      businessId,
      await findBusinessById(req, businessId).catch(() => null),
    ).catch(() => null)
    : null;
  const opts = saleLineOpts(settingsPreview || {});
  const lines = linesFromSaleItems(
    (sale.items || []).map((it) => ({
      name: it.productName || it.name || '',
      quantity: it.quantity,
      unitPrice: it.pricePerUnit ?? it.unitPrice ?? it.price,
      taxRate: it.taxRate ?? it.vatRate,
    })),
    opts,
  );

  return tryAutoIssueVerifactuForSale(req, {
    businessId,
    actorId,
    alreadyIssuedId: sale.verifactuRecordId,
    recipientName: sale.clientName || 'Consumidor final',
    recipientNif: sale.clientTaxId || sale.clientNif || '',
    lines,
    notes: `Venta carnicería ${sale.ticketNumber || sale._id || ''}`.trim(),
    source: {
      kind: 'tpv_butcher',
      saleId: sale._id,
      ticketNumber: sale.ticketNumber || '',
      pointOfSaleId: sale.pointOfSaleId || sale.pdvId || '',
    },
  });
}

export { sanitizeVerifactuSettings, sanitizeVerifactuRecord };
