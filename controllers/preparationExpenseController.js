import { v4 as uuidv4 } from 'uuid';
import {
  VEHICLES_DB,
  buildPreparationExpenseDocument,
  sanitizePreparationExpense,
  listPreparationExpensesByUser,
  listPreparationExpensesByVehicle,
  getPreparationExpenseTotalByVehicle,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  writeChangelog,
  buildVehicleDocument,
  sanitizeVehicle,
  PREPARATION_EXPENSE_TYPES,
  PREPARATION_EXPENSE_STATUSES,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function forbidden(res, error) {
  return res.status(403).json({ ok: false, error: error || 'No tienes permiso para realizar esta acción' });
}

async function ensureExpenseOwner(req, userId, expenseId) {
  await ensureDatabase(req, VEHICLES_DB);
  const doc = await getDocument(req, VEHICLES_DB, expenseId);
  if (!doc || doc.type !== 'preparation_expense' || doc.active === false || doc.deletedAt || doc.user_id !== userId) {
    return null;
  }
  return doc;
}

function isManager(account) {
  const role = account?.role || '';
  return ['Admin', 'Gerente'].includes(role);
}

// Recalculates preparation costs on the vehicle document after any expense mutation
async function syncVehiclePreparationCosts(req, userId, vehicleId) {
  try {
    const vehicle = await getDocument(req, VEHICLES_DB, vehicleId);
    if (!vehicle || vehicle.type !== 'car' || vehicle.user_id !== userId) return;

    const expenses = await listPreparationExpensesByVehicle(req, userId, vehicleId);
    const totalPrepCost = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const salePrice = vehicle.salePrice || null;
    const purchasePrice = vehicle.purchasePrice || 0;
    const estimatedMargin = salePrice ? salePrice - purchasePrice - totalPrepCost : null;

    const updated = {
      ...vehicle,
      preparationCostTotal: totalPrepCost,
      estimatedMargin,
      updatedAt: new Date().toISOString(),
    };
    await putDocument(req, VEHICLES_DB, updated._id, updated);
  } catch {
    // Non-critical: don't fail the expense operation if sync fails
  }
}

// ─── LIST ────────────────────────────────────────────────────────────────────

export async function listExpenses(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const businessId = String(req.query.businessId || '').trim() || null;
    let raw = await listPreparationExpensesByUser(req, userId, businessId);

    // Workers only see their own expenses
    if (!isManager(account) && req.query._callerUserId) {
      raw = raw.filter((e) => e.createdBy === req.query._callerUserId);
    }

    // Extra filters
    const { expenseType, status, vehicleId, supplierId, dateFrom, dateTo } = req.query;
    if (expenseType) raw = raw.filter((e) => e.expenseType === expenseType);
    if (status) raw = raw.filter((e) => e.status === status);
    if (vehicleId) raw = raw.filter((e) => e.vehicleId === vehicleId);
    if (supplierId) raw = raw.filter((e) => e.supplierId === supplierId);
    if (dateFrom) raw = raw.filter((e) => e.date >= dateFrom);
    if (dateTo) raw = raw.filter((e) => e.date <= dateTo);

    const { items, meta } = applyQueryOptions(raw.map(sanitizePreparationExpense), req.query);
    return res.json({ ok: true, expenses: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al cargar gastos' });
  }
}

// ─── LIST BY VEHICLE ─────────────────────────────────────────────────────────

export async function listExpensesByVehicle(req, res) {
  try {
    const { userId, vehicleId } = req.params;
    if (!userId || !vehicleId) return badRequest(res, 'Falta userId o vehicleId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const raw = await listPreparationExpensesByVehicle(req, userId, vehicleId);
    const { items, meta } = applyQueryOptions(raw.map(sanitizePreparationExpense), req.query);
    return res.json({ ok: true, expenses: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al cargar gastos del vehículo' });
  }
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────

export async function getExpenseSummary(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const businessId = String(req.query.businessId || '').trim() || null;
    const expenses = await listPreparationExpensesByUser(req, userId, businessId);

    const byVehicle = {};
    const byType = {};
    let grandTotal = 0;
    let pendingReview = 0;
    let withoutDocument = 0;

    for (const exp of expenses) {
      const amt = Number(exp.amount || 0);
      grandTotal += amt;

      if (exp.status === 'pendiente') pendingReview++;
      if (!exp.documentId) withoutDocument++;

      // By vehicle
      const vKey = exp.vehicleId || 'unknown';
      if (!byVehicle[vKey]) {
        byVehicle[vKey] = { vehicleId: vKey, plate: exp.vehiclePlate, label: exp.vehicleLabel, total: 0, count: 0 };
      }
      byVehicle[vKey].total += amt;
      byVehicle[vKey].count++;

      // By type
      const tKey = exp.expenseType || 'otro';
      if (!byType[tKey]) {
        byType[tKey] = { expenseType: tKey, total: 0, count: 0 };
      }
      byType[tKey].total += amt;
      byType[tKey].count++;
    }

    return res.json({
      ok: true,
      summary: {
        grandTotal,
        pendingReview,
        withoutDocument,
        totalExpenses: expenses.length,
        vehiclesWithExpenses: Object.keys(byVehicle).length,
        totalByVehicle: Object.values(byVehicle).sort((a, b) => b.total - a.total),
        totalByType: Object.values(byType).sort((a, b) => b.total - a.total),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al generar resumen' });
  }
}

// ─── CREATE ──────────────────────────────────────────────────────────────────

export async function createExpense(req, res) {
  try {
    const { userId } = req.params;
    const { expense, businessId } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!expense || typeof expense !== 'object') return badRequest(res, 'Falta el objeto expense en el body');
    if (!expense.vehicleId?.trim()) return badRequest(res, 'El vehículo es obligatorio');
    if (!expense.expenseType?.trim()) return badRequest(res, 'El tipo de gasto es obligatorio');
    if (expense.amount === undefined || expense.amount === null || Number(expense.amount) <= 0) {
      return badRequest(res, 'El importe debe ser mayor que 0');
    }
    if (!expense.date?.trim()) return badRequest(res, 'La fecha es obligatoria');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await ensureDatabase(req, VEHICLES_DB);

    // Verify vehicle exists and belongs to user
    const vehicle = await getDocument(req, VEHICLES_DB, expense.vehicleId);
    if (!vehicle || vehicle.type !== 'car' || vehicle.user_id !== userId || vehicle.active === false) {
      return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });
    }

    const expenseData = {
      ...expense,
      vehiclePlate: vehicle.registrationPlate || '',
      vehicleLabel: `${vehicle.brand || ''} ${vehicle.model || ''}`.trim(),
      createdBy: userId,
    };

    const doc = buildPreparationExpenseDocument(userId, expenseData, null, businessId || null);
    const saved = await putDocument(req, VEHICLES_DB, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'preparation_expense',
      action: `Registró gasto de preparación: ${doc.expenseType} ${doc.amount}€ para ${doc.vehicleLabel}`,
      entityId: doc._id,
      entityLabel: `${doc.expenseType} - ${doc.vehicleLabel}`,
      metadata: { expenseType: doc.expenseType, amount: doc.amount, vehicleId: doc.vehicleId },
    });

    await writeChangelog(req, {
      entity: 'preparation_expense',
      entityId: doc._id,
      entityLabel: `${doc.expenseType} - ${doc.vehicleLabel}`,
      action: 'create',
      actorUserId: userId,
      actorName: account.fullName,
      changes: { after: { expenseType: doc.expenseType, amount: doc.amount, vehicleId: doc.vehicleId, status: doc.status } },
    });

    await syncVehiclePreparationCosts(req, userId, doc.vehicleId);

    return res.status(201).json({ ok: true, expense: sanitizePreparationExpense({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al crear gasto' });
  }
}

// ─── UPDATE ──────────────────────────────────────────────────────────────────

export async function updateExpense(req, res) {
  try {
    const { userId, expenseId } = req.params;
    const { expense } = req.body || {};

    if (!expense || typeof expense !== 'object') return badRequest(res, 'Faltan datos del gasto');

    const existing = await ensureExpenseOwner(req, userId, expenseId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Gasto no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    // Workers can only edit their own pending expenses
    if (!isManager(account)) {
      if (existing.createdBy !== userId) return forbidden(res);
      if (existing.status !== 'pendiente') return forbidden(res, 'Solo puedes editar gastos en estado pendiente');
    }

    // Don't allow changing status via this endpoint
    const mergedData = { ...existing, ...expense, status: existing.status };
    const doc = buildPreparationExpenseDocument(userId, mergedData, existing);
    const saved = await putDocument(req, VEHICLES_DB, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'preparation_expense',
      action: `Actualizó gasto de preparación: ${doc.expenseType} ${doc.amount}€`,
      entityId: doc._id,
      entityLabel: `${doc.expenseType} - ${doc.vehicleLabel}`,
      metadata: { expenseType: doc.expenseType, amount: doc.amount },
    });

    await syncVehiclePreparationCosts(req, userId, doc.vehicleId);

    return res.json({ ok: true, expense: sanitizePreparationExpense({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al actualizar gasto' });
  }
}

// ─── VALIDATE / REJECT ───────────────────────────────────────────────────────

export async function validateExpense(req, res) {
  try {
    const { userId, expenseId } = req.params;
    const { status, reason } = req.body || {};

    if (!['validado', 'rechazado'].includes(status)) {
      return badRequest(res, 'El estado debe ser "validado" o "rechazado"');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    if (!isManager(account)) return forbidden(res, 'Solo gerentes pueden validar gastos');

    const existing = await ensureExpenseOwner(req, userId, expenseId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Gasto no encontrado' });

    const now = new Date().toISOString();
    const updateData = {
      ...existing,
      status,
      validatedBy: userId,
      validatedAt: now,
      rejectionReason: status === 'rechazado' ? String(reason || '').trim() : existing.rejectionReason,
    };

    const doc = buildPreparationExpenseDocument(userId, updateData, existing);
    const saved = await putDocument(req, VEHICLES_DB, doc._id, doc);

    const actionLabel = status === 'validado' ? 'Validó' : 'Rechazó';
    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'preparation_expense',
      action: `${actionLabel} gasto de preparación: ${doc.expenseType} ${doc.amount}€`,
      entityId: doc._id,
      entityLabel: `${doc.expenseType} - ${doc.vehicleLabel}`,
      metadata: { expenseType: doc.expenseType, amount: doc.amount, newStatus: status },
    });

    await syncVehiclePreparationCosts(req, userId, doc.vehicleId);

    return res.json({ ok: true, expense: sanitizePreparationExpense({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al validar gasto' });
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function removeExpense(req, res) {
  try {
    const { userId, expenseId } = req.params;

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    if (!isManager(account)) return forbidden(res, 'Solo gerentes pueden eliminar gastos');

    const existing = await ensureExpenseOwner(req, userId, expenseId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Gasto no encontrado' });

    await softDeleteDocument(req, VEHICLES_DB, expenseId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'preparation_expense',
      action: `Eliminó gasto de preparación: ${existing.expenseType} ${existing.amount}€`,
      entityId: existing._id,
      entityLabel: `${existing.expenseType} - ${existing.vehicleLabel}`,
      metadata: { expenseType: existing.expenseType, amount: existing.amount, vehicleId: existing.vehicleId },
    });

    await writeChangelog(req, {
      entity: 'preparation_expense',
      entityId: existing._id,
      entityLabel: `${existing.expenseType} - ${existing.vehicleLabel}`,
      action: 'delete',
      actorUserId: userId,
      actorName: account.fullName,
      changes: { before: { expenseType: existing.expenseType, amount: existing.amount, status: existing.status } },
    });

    await syncVehiclePreparationCosts(req, userId, existing.vehicleId);

    return res.json({ ok: true, id: expenseId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al eliminar gasto' });
  }
}

// ─── ATTACH DOCUMENT ─────────────────────────────────────────────────────────

export async function attachDocument(req, res) {
  try {
    const { userId, expenseId } = req.params;
    const { documentId, documentName } = req.body || {};

    if (!documentId?.trim()) return badRequest(res, 'Falta documentId');

    const existing = await ensureExpenseOwner(req, userId, expenseId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Gasto no encontrado' });

    const updateData = { ...existing, documentId: documentId.trim(), documentName: String(documentName || '').trim() };
    const doc = buildPreparationExpenseDocument(userId, updateData, existing);
    const saved = await putDocument(req, VEHICLES_DB, doc._id, doc);

    return res.json({ ok: true, expense: sanitizePreparationExpense({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al adjuntar documento' });
  }
}

export async function detachDocument(req, res) {
  try {
    const { userId, expenseId } = req.params;

    const existing = await ensureExpenseOwner(req, userId, expenseId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Gasto no encontrado' });

    const updateData = { ...existing, documentId: '', documentName: '' };
    const doc = buildPreparationExpenseDocument(userId, updateData, existing);
    const saved = await putDocument(req, VEHICLES_DB, doc._id, doc);

    return res.json({ ok: true, expense: sanitizePreparationExpense({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al desenlazar documento' });
  }
}

// ─── REGISTER PAYMENT (Finanzas) ─────────────────────────────────────────────

export async function registerPayment(req, res) {
  try {
    const { userId, expenseId } = req.params;

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    if (!isManager(account)) return forbidden(res, 'Solo gerentes pueden registrar pagos');

    const existing = await ensureExpenseOwner(req, userId, expenseId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Gasto no encontrado' });
    if (existing.status !== 'validado') return badRequest(res, 'Solo gastos validados pueden generar un pago');
    if (existing.paymentId) return res.status(409).json({ ok: false, error: 'Este gasto ya tiene un pago registrado' });

    // Lazy import to avoid circular dependency
    const { buildFinanceDocument, getFinanceDbName, sanitizeFinance } = await import('../services/couchdb.js');
    const financeDb = getFinanceDbName();
    await ensureDatabase(req, financeDb);

    const EXPENSE_TYPE_LABELS = {
      taller: 'Taller', limpieza: 'Limpieza', pintura: 'Pintura', transporte: 'Transporte',
      gestoria: 'Gestoría', combustible: 'Combustible', itv: 'ITV', otro: 'Otro',
    };
    const typeLabel = EXPENSE_TYPE_LABELS[existing.expenseType] || existing.expenseType;

    const financeDoc = buildFinanceDocument(userId, {
      type: 'pago',
      concept: `Gasto preparación: ${typeLabel} - ${existing.vehicleLabel}`,
      category: 'preparacion_vehiculo',
      amountBase: existing.amount,
      taxRate: 0,
      reference: existing._id,
      companyName: existing.supplierName || '',
      date: existing.date,
    });
    const savedFinance = await putDocument(req, financeDb, financeDoc._id, financeDoc);

    // Link payment to expense
    const updateData = { ...existing, paymentId: financeDoc._id };
    const updatedExpense = buildPreparationExpenseDocument(userId, updateData, existing);
    const savedExpense = await putDocument(req, VEHICLES_DB, updatedExpense._id, updatedExpense);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'finance',
      action: `Registró pago de preparación: ${typeLabel} ${existing.amount}€ (${existing.vehicleLabel})`,
      entityId: financeDoc._id,
      entityLabel: financeDoc.concept,
      metadata: { expenseId: existing._id, amount: existing.amount },
    });

    return res.status(201).json({
      ok: true,
      expense: sanitizePreparationExpense({ ...updatedExpense, _rev: savedExpense.rev }),
      payment: sanitizeFinance({ ...financeDoc, _rev: savedFinance.rev }),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Error al registrar pago' });
  }
}
