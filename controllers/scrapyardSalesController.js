import { v4 as uuidv4 } from 'uuid';
import {
  getScrapyardSalesDbName,
  getFinanceDbName,
  buildScrapyardSaleDocument,
  buildFinanceDocument,
  sanitizeScrapyardSale,
  listScrapyardSalesByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  getAllDocuments,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

const VALID_CHANNELS = ['mostrador', 'telefono', 'web', 'talleres', 'marketplace'];
const VALID_STATUSES = ['borrador', 'confirmada', 'preparando', 'lista', 'enviada', 'entregada', 'cancelada'];
const VALID_PAYMENT_METHODS = ['efectivo', 'tarjeta', 'transferencia', 'bizum', 'financiacion', 'contrareembolso'];

async function ensureSaleOwner(req, userId, saleId) {
  const db = getScrapyardSalesDbName();
  await ensureDatabase(req, db);
  const sale = await getDocument(req, db, saleId);
  if (!sale || sale.type !== 'scrapyard_sale' || sale.user_id !== userId) return null;
  return sale;
}

async function getNextSaleNumber(req, userId) {
  const db = getScrapyardSalesDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  const userSales = docs.filter(d => d?.type === 'scrapyard_sale' && d?.user_id === userId && !d?.deletedAt);
  const year = new Date().getFullYear();
  const prefix = `VPZ-${year}-`;
  let maxNum = 0;
  for (const s of userSales) {
    const num = String(s.numVenta || '');
    if (num.startsWith(prefix)) {
      const n = parseInt(num.slice(prefix.length), 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return `${prefix}${String(maxNum + 1).padStart(5, '0')}`;
}

// ─── LIST ────────────────────────────────────────────────────────────────────

export async function listScrapyardSales(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const raw = await listScrapyardSalesByUser(req, userId);
    const { items, meta } = applyQueryOptions(raw.map(sanitizeScrapyardSale), req.query);
    return res.json({ ok: true, sales: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar ventas de piezas' });
  }
}

// ─── GET ONE ─────────────────────────────────────────────────────────────────

export async function getScrapyardSale(req, res) {
  try {
    const { userId, saleId } = req.params;
    const existing = await ensureSaleOwner(req, userId, saleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Venta no encontrada' });
    return res.json({ ok: true, sale: sanitizeScrapyardSale(existing) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar venta' });
  }
}

// ─── CREATE ──────────────────────────────────────────────────────────────────

export async function createScrapyardSale(req, res) {
  try {
    const { userId } = req.params;
    const { sale } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!sale || typeof sale !== 'object') return badRequest(res, 'Falta el objeto sale en el body');
    if (!Array.isArray(sale.lineas) || sale.lineas.length === 0) return badRequest(res, 'Se requiere al menos una pieza');
    if (!sale.clientName && !sale.clientId) return badRequest(res, 'Se requiere un cliente');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const numVenta = await getNextSaleNumber(req, userId);

    const lineas = sale.lineas.map(l => {
      const cantidad = Number(l.cantidad || 1);
      const precioUnitario = Number(l.precioUnitario || 0);
      const descuento = Number(l.descuento || 0);
      const coste = Number(l.coste || 0);
      const subtotal = cantidad * precioUnitario * (1 - descuento / 100);
      return {
        id: uuidv4(),
        piezaId: String(l.piezaId || ''),
        referencia: String(l.referencia || ''),
        nombre: String(l.nombre || ''),
        cantidad,
        precioUnitario,
        coste,
        descuento,
        subtotal: Math.round(subtotal * 100) / 100,
      };
    });

    const importeTotal = lineas.reduce((s, l) => s + l.subtotal, 0);
    const descuentoGlobal = Number(sale.descuentoGlobal || 0);
    const importeNeto = Math.round(importeTotal * (1 - descuentoGlobal / 100) * 100) / 100;
    const iva = Number(sale.iva ?? 21);
    const importeConIva = Math.round(importeNeto * (1 + iva / 100) * 100) / 100;
    const margen = lineas.reduce((s, l) => s + (l.precioUnitario - l.coste) * l.cantidad, 0);

    const pagos = [];
    let estadoPago = 'pendiente';
    if (Number(sale.importeInicial) > 0) {
      pagos.push({
        id: uuidv4(),
        importe: Number(sale.importeInicial),
        metodo: VALID_PAYMENT_METHODS.includes(sale.formaPago) ? sale.formaPago : 'efectivo',
        fecha: new Date().toISOString(),
        nota: 'Cobro inicial al crear la venta',
      });
      const totalPagado = Number(sale.importeInicial);
      estadoPago = totalPagado >= importeConIva ? 'cobrada' : 'parcial';
    }

    const now = new Date().toISOString();
    const reservaExpira = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const db = getScrapyardSalesDbName();
    await ensureDatabase(req, db);
    const doc = buildScrapyardSaleDocument(userId, {
      ...sale,
      numVenta,
      lineas,
      importeTotal,
      descuentoGlobal,
      importeNeto,
      iva,
      importeConIva,
      margen: Math.round(margen * 100) / 100,
      estadoPago,
      pagos,
      reservaExpira,
      estado: sale.estado || 'confirmada',
      historial: [{
        id: uuidv4(),
        accion: 'Venta creada',
        fecha: now,
        usuario: sale.responsable || account.fullName,
        detalle: `Venta ${numVenta} creada por canal ${sale.canal || 'mostrador'}`,
      }],
    });

    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'scrapyard_sale',
      action: `Creó venta de piezas ${numVenta} para ${doc.clientName}`,
      entityId: doc._id,
      entityLabel: `${numVenta} → ${doc.clientName}`,
      metadata: { canal: doc.canal, importeConIva: doc.importeConIva, lineas: doc.lineas.length },
    });

    return res.status(201).json({ ok: true, sale: sanitizeScrapyardSale({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear venta de piezas' });
  }
}

// ─── UPDATE ──────────────────────────────────────────────────────────────────

export async function updateScrapyardSale(req, res) {
  try {
    const { userId, saleId } = req.params;
    const { sale } = req.body || {};
    if (!sale || typeof sale !== 'object') return badRequest(res, 'Faltan datos de la venta');

    const existing = await ensureSaleOwner(req, userId, saleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Venta no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getScrapyardSalesDbName();
    const doc = buildScrapyardSaleDocument(userId, { ...existing, ...sale }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'scrapyard_sale',
      action: `Actualizó venta ${doc.numVenta}`,
      entityId: doc._id,
      entityLabel: `${doc.numVenta} → ${doc.clientName}`,
      metadata: { estado: doc.estado },
    });

    return res.json({ ok: true, sale: sanitizeScrapyardSale({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar venta' });
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function removeScrapyardSale(req, res) {
  try {
    const { userId, saleId } = req.params;
    const existing = await ensureSaleOwner(req, userId, saleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Venta no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getScrapyardSalesDbName();
    await softDeleteDocument(req, db, saleId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'scrapyard_sale',
      action: `Eliminó venta ${existing.numVenta}`,
      entityId: existing._id,
      entityLabel: `${existing.numVenta} → ${existing.clientName}`,
      metadata: {},
    });

    return res.json({ ok: true, id: saleId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar venta' });
  }
}

// ─── REGISTER PAYMENT ────────────────────────────────────────────────────────

export async function registerScrapyardPayment(req, res) {
  try {
    const { userId, saleId } = req.params;
    const { payment } = req.body || {};
    if (!payment || !payment.importe) return badRequest(res, 'Faltan datos del cobro');

    const existing = await ensureSaleOwner(req, userId, saleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Venta no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const newPayment = {
      id: uuidv4(),
      importe: Number(payment.importe),
      metodo: VALID_PAYMENT_METHODS.includes(payment.metodo) ? payment.metodo : 'efectivo',
      fecha: new Date().toISOString(),
      nota: String(payment.nota || ''),
    };

    const pagos = [...(existing.pagos || []), newPayment];
    const totalPagado = pagos.reduce((s, p) => s + Number(p.importe || 0), 0);
    const estadoPago = totalPagado >= (existing.importeConIva || 0) ? 'cobrada' : 'parcial';

    const historial = [...(existing.historial || []), {
      id: uuidv4(),
      accion: 'Cobro registrado',
      fecha: new Date().toISOString(),
      usuario: account.fullName,
      detalle: `Cobro de ${newPayment.importe.toLocaleString('es-ES')}€ via ${newPayment.metodo}`,
    }];

    const db = getScrapyardSalesDbName();
    const doc = buildScrapyardSaleDocument(userId, { ...existing, pagos, estadoPago, historial }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, sale: sanitizeScrapyardSale({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al registrar cobro' });
  }
}

// ─── CHANGE STATUS ───────────────────────────────────────────────────────────

export async function changeScrapyardStatus(req, res) {
  try {
    const { userId, saleId } = req.params;
    const { status, numSeguimiento, transportista, cancelMotivo } = req.body || {};
    if (!VALID_STATUSES.includes(status)) return badRequest(res, `Estado inválido: ${status}`);

    const existing = await ensureSaleOwner(req, userId, saleId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Venta no encontrada' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const updates = { estado: status };
    if (status === 'cancelada' && cancelMotivo) updates.cancelMotivo = cancelMotivo;
    if (status === 'enviada') {
      if (numSeguimiento) updates.envio = { ...(existing.envio || {}), numSeguimiento, transportista: transportista || existing.envio?.transportista || '' };
    }

    const historial = [...(existing.historial || []), {
      id: uuidv4(),
      accion: `Estado → ${status}`,
      fecha: new Date().toISOString(),
      usuario: account.fullName,
      detalle: status === 'cancelada' ? `Cancelada: ${cancelMotivo || 'Sin motivo'}` : `Cambio de estado a ${status}`,
    }];

    if (status === 'entregada') {
      updates.financeIncomeCreated = true;
    }

    const db = getScrapyardSalesDbName();
    const doc = buildScrapyardSaleDocument(userId, { ...existing, ...updates, historial }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    if (status === 'entregada') {
      await runCloseAutomations(req, userId, { ...doc, _rev: saved.rev }, account.fullName);
    }

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'scrapyard_sale',
      action: `Cambió estado de ${existing.numVenta} a ${status}`,
      entityId: doc._id,
      entityLabel: `${doc.numVenta} → ${status}`,
      metadata: { previousStatus: existing.estado, newStatus: status },
    });

    return res.json({ ok: true, sale: sanitizeScrapyardSale({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cambiar estado' });
  }
}

// ─── AUTOMATIONS ON CLOSE ────────────────────────────────────────────────────

async function runCloseAutomations(req, userId, sale, accountName) {
  const now = new Date().toISOString();

  // 1) Create finance income
  if (!sale.financeIncomeCreated && sale.importeConIva > 0) {
    try {
      const finDb = getFinanceDbName();
      await ensureDatabase(req, finDb);
      const piezasDesc = (sale.lineas || []).map(l => l.nombre).join(', ');
      const finDoc = buildFinanceDocument(userId, {
        type: 'cobro',
        companyName: sale.clientName,
        concept: `Venta piezas: ${sale.numVenta} — ${piezasDesc}`.slice(0, 200),
        reference: sale.numVenta,
        category: 'venta_piezas',
        amountBase: sale.importeNeto || 0,
        taxRate: sale.iva || 21,
        date: now.slice(0, 10),
        payMethod: sale.formaPago || 'efectivo',
        status: sale.estadoPago === 'cobrada' ? 'paid' : 'pending',
        source: 'scrapyard_sale',
        sourceRef: sale._id,
      });
      await putDocument(req, finDb, finDoc._id, finDoc);
    } catch { /* non-critical */ }
  }

  // 2) Log in client history
  try {
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: accountName,
      targetUserId: userId,
      type: 'scrapyard_sale',
      action: `Venta entregada ${sale.numVenta} — ${sale.importeConIva}€`,
      entityId: sale._id,
      entityLabel: `${sale.numVenta} → ${sale.clientName}`,
      metadata: {
        clientId: sale.clientId,
        clientName: sale.clientName,
        piezas: (sale.lineas || []).length,
        importe: sale.importeConIva,
      },
    });
  } catch { /* non-critical */ }
}

// ─── METRICS ─────────────────────────────────────────────────────────────────

export async function getScrapyardSalesMetrics(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const sales = await listScrapyardSalesByUser(req, userId);
    const active = sales.filter(s => !s.deletedAt);

    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);

    const ventasHoy = active.filter(s => (s.createdAt || '').startsWith(today)).length;
    const ventasMes = active.filter(s => (s.createdAt || '').startsWith(month)).length;
    const ingresosMes = active
      .filter(s => (s.createdAt || '').startsWith(month) && s.estadoPago === 'cobrada')
      .reduce((sum, s) => sum + Number(s.importeConIva || 0), 0);
    const ticketMedio = ventasMes > 0 ? Math.round(ingresosMes / ventasMes) : 0;
    const margenMes = active
      .filter(s => (s.createdAt || '').startsWith(month))
      .reduce((sum, s) => sum + Number(s.margen || 0), 0);

    const porCanal = {};
    const porEstado = {};
    for (const s of active) {
      porCanal[s.canal || 'mostrador'] = (porCanal[s.canal || 'mostrador'] || 0) + 1;
      porEstado[s.estado || 'borrador'] = (porEstado[s.estado || 'borrador'] || 0) + 1;
    }

    const pendientesCobro = active.filter(s => s.estadoPago !== 'cobrada' && s.estado !== 'cancelada').length;

    return res.json({
      ok: true,
      ventasHoy,
      ventasMes,
      ingresosMes: Math.round(ingresosMes * 100) / 100,
      ticketMedio,
      margenMes: Math.round(margenMes * 100) / 100,
      porCanal,
      porEstado,
      pendientesCobro,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular métricas' });
  }
}
