import { v4 as uuidv4 } from 'uuid';
import {
  getBankTransactionsDbName,
  buildBankTransaction,
  sanitizeBankTransaction,
  listBankTransactionsByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  bulkPutDocuments,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  listFinanceByUser,
  sanitizeFinance,
  listInvoicesByUser,
  listPurchaseInvoicesByUser,
  buildFinanceDocument,
  getFinanceDbName,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

// ── CSV Parsing ───────────────────────────────────────────────────────────────

const KNOWN_CSV_HEADERS = {
  santander: { date: 'Fecha', description: 'Concepto', amount: 'Importe', balance: 'Saldo', bankName: 'Santander' },
  bbva: { date: 'Fecha', description: 'Descripción', amount: 'Importe', balance: 'Saldo disponible', bankName: 'BBVA' },
  caixabank: { date: 'Data operació', description: 'Descripció', amount: 'Import', balance: 'Saldo', bankName: 'CaixaBank' },
  sabadell: { date: 'Fecha Op.', description: 'Concepto', amount: 'Importe', balance: 'Saldo', bankName: 'Sabadell' },
  generic: { date: 'fecha', description: 'concepto', amount: 'importe', balance: 'saldo', bankName: 'Genérico' },
};

function detectBank(headers) {
  const h = headers.map((s) => s.toLowerCase());
  if (h.includes('saldo disponible')) return KNOWN_CSV_HEADERS.bbva;
  if (h.includes('data operació')) return KNOWN_CSV_HEADERS.caixabank;
  if (h.includes('fecha op.') || h.includes('fecha op')) return KNOWN_CSV_HEADERS.sabadell;
  if (h.some((x) => x === 'fecha') && h.some((x) => x === 'concepto')) return KNOWN_CSV_HEADERS.santander;
  return KNOWN_CSV_HEADERS.generic;
}

function parseLocaleNumber(raw) {
  if (!raw) return 0;
  let cleaned = String(raw).trim();
  const hasDotAndComma = cleaned.includes('.') && cleaned.includes(',');
  if (hasDotAndComma) {
    const lastDot = cleaned.lastIndexOf('.');
    const lastComma = cleaned.lastIndexOf(',');
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parseDateStr(raw) {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const parts = raw.trim().split(/[/\-.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return raw.trim();
}

function parseCsvLine(line, sep) {
  const result = [];
  let inQuotes = false;
  let current = '';
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === sep && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += char; }
  }
  result.push(current.trim());
  return result;
}

function parseBankCsv(csvText, userId) {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return { transactions: [], bankName: 'Desconocido' };

  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = parseCsvLine(lines[0], sep);
  const colMap = detectBank(headers);

  const getIdx = (hint) => {
    const lower = hint.toLowerCase();
    return headers.findIndex((h) => h.toLowerCase() === lower || h.toLowerCase().includes(lower));
  };

  const dateIdx = getIdx(colMap.date);
  const descIdx = getIdx(colMap.description);
  const amountIdx = getIdx(colMap.amount);
  const balanceIdx = colMap.balance ? getIdx(colMap.balance) : -1;

  const transactions = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], sep);
    if (cols.length < 2) continue;

    const now = new Date().toISOString();
    const id = `bank-tx-${uuidv4()}`;
    const date = parseDateStr(dateIdx >= 0 ? cols[dateIdx] : cols[0]);
    const description = (descIdx >= 0 ? cols[descIdx] : cols[1]) || '';
    const amount = parseLocaleNumber(amountIdx >= 0 ? cols[amountIdx] : cols[2]);
    const balance = balanceIdx >= 0 ? parseLocaleNumber(cols[balanceIdx]) : undefined;

    if (!description && amount === 0) continue;

    transactions.push({
      _id: id, id, type: 'bank_transaction', user_id: userId,
      date, description, amount, balance,
      bankName: colMap.bankName,
      status: 'unmatched', source: 'csv',
      createdAt: now, updatedAt: now,
    });
  }
  return { transactions, bankName: colMap.bankName };
}

function parseBankOfx(ofxText, userId) {
  const transactions = [];
  const getTag = (text, tag) => {
    const match = new RegExp(`<${tag}>([^<]+)`, 'i').exec(text);
    return match ? match[1].trim() : '';
  };

  const blocks = ofxText.split(/<\/STMTTRN>/i);
  for (const block of blocks) {
    const dateRaw = getTag(block, 'DTPOSTED');
    if (!dateRaw) continue;

    const y = dateRaw.slice(0, 4);
    const mo = dateRaw.slice(4, 6);
    const d = dateRaw.slice(6, 8);
    const date = `${y}-${mo}-${d}`;
    const amount = parseFloat(getTag(block, 'TRNAMT') || '0');
    const description = getTag(block, 'MEMO') || getTag(block, 'NAME') || '';
    const reference = getTag(block, 'FITID') || undefined;

    const id = `bank-tx-${uuidv4()}`;
    const now = new Date().toISOString();
    transactions.push({
      _id: id, id, type: 'bank_transaction', user_id: userId,
      date, description, amount, reference,
      bankName: 'OFX',
      status: 'unmatched', source: 'ofx',
      createdAt: now, updatedAt: now,
    });
  }
  return { transactions, bankName: 'OFX' };
}

// ── Auto-match algorithm ──────────────────────────────────────────────────────

function computeMatchScore(tx, entity, entityType) {
  let score = 0;
  const reasons = [];

  const entityAmount = entityType === 'movement'
    ? (entity.type === 'cobro' ? entity.totalAmount : -entity.totalAmount)
    : entityType === 'client_invoice'
      ? entity.total
      : -(entity.total || entity.totalAmount || 0);

  const amountDiff = Math.abs(Math.abs(tx.amount) - Math.abs(entityAmount));
  const amountRatio = amountDiff / (Math.abs(entityAmount) + 0.01);

  if (amountRatio < 0.001) { score += 50; reasons.push('importe exacto'); }
  else if (amountRatio < 0.02) { score += 30; reasons.push('importe aproximado'); }
  else if (amountRatio < 0.1) { score += 10; }

  if (entityType === 'movement') {
    if ((tx.amount > 0 && entity.type === 'cobro') || (tx.amount < 0 && entity.type === 'pago')) {
      score += 20; reasons.push('tipo coincide');
    }
  } else if (entityType === 'client_invoice') {
    if (tx.amount > 0) { score += 15; reasons.push('ingreso → factura cliente'); }
  } else if (entityType === 'purchase_invoice') {
    if (tx.amount < 0) { score += 15; reasons.push('gasto → factura proveedor'); }
  }

  const txDate = new Date(tx.date);
  const entityDate = new Date(entity.date);
  const daysDiff = Math.abs((txDate.getTime() - entityDate.getTime()) / 86400000);
  if (daysDiff === 0) { score += 20; reasons.push('misma fecha'); }
  else if (daysDiff <= 2) { score += 12; reasons.push(`${Math.round(daysDiff)} día(s) de diferencia`); }
  else if (daysDiff <= 5) { score += 5; }

  const txDesc = (tx.description || '').toLowerCase();
  const entityDesc = entityType === 'movement'
    ? `${entity.concept} ${entity.reference} ${entity.notes} ${entity.companyName}`.toLowerCase()
    : `${entity.clientName || entity.supplierName || ''} ${entity.number || ''} ${entity.notes || ''}`.toLowerCase();

  const words = txDesc.split(/\s+/).filter((w) => w.length > 3);
  const matched = words.filter((w) => entityDesc.includes(w));
  if (matched.length > 0) {
    score += Math.round((matched.length / Math.max(words.length, 1)) * 15);
    reasons.push('descripción similar');
  }

  if (tx.reference && entityType !== 'movement') {
    const ref = tx.reference.toLowerCase();
    const num = (entity.number || '').toLowerCase();
    if (num && ref.includes(num)) { score += 40; reasons.push('nº factura en referencia'); }
  }

  return { score, reasons };
}

function runAutoMatch(bankTxs, movements, clientInvoices, purchaseInvoices) {
  const results = [];

  for (const tx of bankTxs) {
    if (tx.status !== 'unmatched') continue;
    const suggestions = [];

    for (const mv of movements) {
      const { score, reasons } = computeMatchScore(tx, mv, 'movement');
      if (score >= 40) {
        suggestions.push({
          entityType: 'movement', entityId: mv._id || mv.id,
          entityRef: mv.concept || mv.reference || '',
          score, reasons,
        });
      }
    }

    for (const inv of clientInvoices) {
      const { score, reasons } = computeMatchScore(tx, inv, 'client_invoice');
      if (score >= 40) {
        suggestions.push({
          entityType: 'client_invoice', entityId: inv._id || inv.id,
          entityRef: `Factura ${inv.number || ''} — ${inv.clientName || ''}`.trim(),
          score, reasons,
        });
      }
    }

    for (const pi of purchaseInvoices) {
      const { score, reasons } = computeMatchScore(tx, pi, 'purchase_invoice');
      if (score >= 40) {
        suggestions.push({
          entityType: 'purchase_invoice', entityId: pi._id || pi.id,
          entityRef: `Factura prov. ${pi.number || ''} — ${pi.supplierName || ''}`.trim(),
          score, reasons,
        });
      }
    }

    suggestions.sort((a, b) => b.score - a.score);
    if (suggestions.length > 0) {
      results.push({ bankTransactionId: tx._id, suggestions: suggestions.slice(0, 3) });
    }
  }
  return results;
}

// ── Alerts detection ──────────────────────────────────────────────────────────

function detectAlerts(bankTxs, clientInvoices, movements) {
  const alerts = [];
  const now = Date.now();
  const DAYS_THRESHOLD = 7;

  for (const tx of bankTxs) {
    if (tx.status !== 'unmatched' || tx.deletedAt) continue;
    const age = (now - new Date(tx.createdAt || tx.date).getTime()) / 86400000;
    if (age >= DAYS_THRESHOLD) {
      alerts.push({
        id: `alert-${tx._id}`,
        type: tx.amount < 0 ? 'unidentified_expense' : 'unmatched_movement',
        severity: age >= 14 ? 'error' : 'warning',
        title: tx.amount < 0 ? 'Gasto bancario no identificado' : 'Movimiento sin justificar',
        description: `${tx.description} — ${tx.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€ del ${tx.date}`,
        relatedEntityId: tx._id,
        amount: tx.amount,
        date: tx.date,
        createdAt: new Date().toISOString(),
      });
    }
  }

  const matchedInvoiceIds = new Set(
    bankTxs.filter((t) => t.matchType === 'client_invoice' && t.matchedEntityId).map((t) => t.matchedEntityId),
  );
  const matchedMovementIds = new Set(
    bankTxs.filter((t) => t.status === 'matched' && t.matchedMovementId).map((t) => t.matchedMovementId),
  );

  for (const inv of clientInvoices) {
    if ((inv.status === 'pending' || inv.status === 'overdue') && !matchedInvoiceIds.has(inv._id || inv.id)) {
      const relatedMovement = movements.find(
        (m) => m.type === 'cobro' && Math.abs(m.totalAmount - inv.total) < 0.01 && matchedMovementIds.has(m._id),
      );
      if (!relatedMovement) {
        alerts.push({
          id: `alert-inv-${inv._id || inv.id}`,
          type: 'pending_collection',
          severity: inv.status === 'overdue' ? 'error' : 'warning',
          title: 'Cobro pendiente no conciliado',
          description: `Factura ${inv.number || ''} — ${inv.clientName || ''} — ${(inv.total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€`,
          relatedEntityId: inv._id || inv.id,
          amount: inv.total || 0,
          date: inv.date || inv.dueDate || '',
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  return alerts;
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function findDuplicates(newTxs, existingTxs) {
  const dominated = new Set();
  for (const ntx of newTxs) {
    for (const etx of existingTxs) {
      if (ntx.date === etx.date && Math.abs(ntx.amount - etx.amount) < 0.01) {
        const descA = (ntx.description || '').toLowerCase();
        const descB = (etx.description || '').toLowerCase();
        if (descA === descB || descA.includes(descB) || descB.includes(descA)) {
          dominated.add(ntx._id);
          break;
        }
      }
    }
  }
  return dominated;
}

// ── Controller actions ────────────────────────────────────────────────────────

export async function listBankTransactions(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const raw = await listBankTransactionsByUser(req, userId);
    const { items, meta } = applyQueryOptions(raw.map(sanitizeBankTransaction).filter(Boolean), req.query);
    return res.json({ ok: true, transactions: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar transacciones bancarias' });
  }
}

export async function importBankFile(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const { content, filename, format } = req.body || {};
    if (!content) return badRequest(res, 'Falta el contenido del archivo');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const isOfx = format === 'ofx' || (filename && /\.(ofx|qfx)$/i.test(filename));
    const { transactions, bankName } = isOfx ? parseBankOfx(content, userId) : parseBankCsv(content, userId);

    if (transactions.length === 0) {
      return res.json({ ok: true, imported: 0, duplicates: 0, bankName, transactions: [] });
    }

    const existing = await listBankTransactionsByUser(req, userId);
    const duplicateIds = findDuplicates(transactions, existing);
    const unique = transactions.filter((t) => !duplicateIds.has(t._id));

    if (unique.length > 0) {
      const db = getBankTransactionsDbName();
      await ensureDatabase(req, db);
      await bulkPutDocuments(req, db, unique);
    }

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'bank_reconciliation',
      action: `Importó extracto bancario (${bankName}): ${unique.length} transacciones`,
      entityLabel: bankName,
      metadata: { bankName, imported: unique.length, duplicates: duplicateIds.size },
    });

    return res.status(201).json({
      ok: true,
      imported: unique.length,
      duplicates: duplicateIds.size,
      bankName,
      transactions: unique.map(sanitizeBankTransaction).filter(Boolean),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al importar extracto' });
  }
}

export async function autoMatch(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const [bankTxs, movements, clientInvoices, purchaseInvoices] = await Promise.all([
      listBankTransactionsByUser(req, userId),
      listFinanceByUser(req, userId),
      listInvoicesByUser(req, userId).catch(() => []),
      listPurchaseInvoicesByUser(req, userId).catch(() => []),
    ]);

    const unmatched = bankTxs.filter((t) => t.status === 'unmatched');
    const matches = runAutoMatch(unmatched, movements, clientInvoices, purchaseInvoices);

    return res.json({
      ok: true,
      matches,
      totalMatches: matches.length,
      totalProcessed: unmatched.length,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error en auto-conciliación' });
  }
}

export async function updateBankTransaction(req, res) {
  try {
    const { userId, txId } = req.params;
    const { transaction } = req.body || {};
    if (!transaction || typeof transaction !== 'object') return badRequest(res, 'Faltan datos de la transacción');

    const db = getBankTransactionsDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, txId);
    if (!existing || existing.type !== 'bank_transaction' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Transacción no encontrada' });
    }

    const doc = buildBankTransaction(userId, { ...existing, ...transaction }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, transaction: sanitizeBankTransaction({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar transacción' });
  }
}

export async function reconcileTransaction(req, res) {
  try {
    const { userId, txId } = req.params;
    const { action, targetId, createPayload } = req.body || {};

    if (!action) return badRequest(res, 'Falta action (link_existing | create_movement | link_invoice)');

    const db = getBankTransactionsDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, txId);
    if (!existing || existing.type !== 'bank_transaction' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Transacción no encontrada' });
    }

    const account = await findAccountByUserId(req, userId);

    let matchType, matchedEntityId, matchedEntityRef, matchedMovementId, matchedMovementRef;

    if (action === 'link_existing') {
      if (!targetId) return badRequest(res, 'Falta targetId');
      matchType = 'movement';
      matchedMovementId = targetId;
      const movements = await listFinanceByUser(req, userId);
      const mv = movements.find((m) => (m._id || m.id) === targetId);
      matchedMovementRef = mv ? (mv.concept || mv.reference || '') : targetId;
    } else if (action === 'link_invoice') {
      if (!targetId) return badRequest(res, 'Falta targetId');
      const invoices = await listInvoicesByUser(req, userId).catch(() => []);
      const purchaseInvoices = await listPurchaseInvoicesByUser(req, userId).catch(() => []);
      const clientInv = invoices.find((i) => (i._id || i.id) === targetId);
      const purchaseInv = purchaseInvoices.find((i) => (i._id || i.id) === targetId);

      if (clientInv) {
        matchType = 'client_invoice';
        matchedEntityId = targetId;
        matchedEntityRef = `Factura ${clientInv.number || ''} — ${clientInv.clientName || ''}`.trim();
      } else if (purchaseInv) {
        matchType = 'purchase_invoice';
        matchedEntityId = targetId;
        matchedEntityRef = `Factura prov. ${purchaseInv.number || ''} — ${purchaseInv.supplierName || ''}`.trim();
      } else {
        return res.status(404).json({ ok: false, error: 'Factura no encontrada' });
      }
    } else if (action === 'create_movement') {
      if (!createPayload || typeof createPayload !== 'object') return badRequest(res, 'Falta createPayload');
      const financeDb = getFinanceDbName();
      await ensureDatabase(req, financeDb);
      const finDoc = buildFinanceDocument(userId, {
        type: createPayload.type || (existing.amount >= 0 ? 'cobro' : 'pago'),
        concept: createPayload.concept || existing.description,
        category: createPayload.category || 'Otros',
        amountBase: createPayload.amountBase ?? Math.abs(existing.amount),
        taxRate: createPayload.taxRate ?? 0,
        date: createPayload.date || existing.date,
        payMethod: createPayload.payMethod || 'transferencia',
        companyName: createPayload.companyName || '',
        notes: createPayload.notes || '',
        reconciled: true,
        reconciledBankTxId: existing._id,
      });
      await putDocument(req, financeDb, finDoc._id, finDoc);

      matchType = 'movement';
      matchedMovementId = finDoc._id;
      matchedMovementRef = finDoc.concept;

      if (account) {
        const typeLabel = finDoc.type === 'cobro' ? 'Cobro' : 'Pago';
        await logAccountActivity(req, {
          actorUserId: userId, actorName: account.fullName, targetUserId: userId,
          type: 'finance',
          action: `Creó ${typeLabel} desde conciliación: ${finDoc.concept} (${finDoc.totalAmount}€)`,
          entityId: finDoc._id, entityLabel: finDoc.concept,
          metadata: { type: finDoc.type, totalAmount: finDoc.totalAmount, source: 'bank_reconciliation' },
        });
      }
    } else {
      return badRequest(res, 'Action no válida');
    }

    const updated = buildBankTransaction(userId, {
      ...existing,
      status: 'matched',
      matchType,
      matchedMovementId: matchedMovementId || existing.matchedMovementId,
      matchedMovementRef: matchedMovementRef || existing.matchedMovementRef,
      matchedEntityId: matchedEntityId || existing.matchedEntityId,
      matchedEntityRef: matchedEntityRef || existing.matchedEntityRef,
    }, existing);

    const saved = await putDocument(req, db, updated._id, updated);

    if (account) {
      await logAccountActivity(req, {
        actorUserId: userId, actorName: account.fullName, targetUserId: userId,
        type: 'bank_reconciliation',
        action: `Concilió transacción bancaria: ${existing.description} (${existing.amount}€)`,
        entityId: existing._id, entityLabel: existing.description,
        metadata: { action, matchType, amount: existing.amount },
      });
    }

    return res.json({ ok: true, transaction: sanitizeBankTransaction({ ...updated, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al conciliar' });
  }
}

export async function unlinkTransaction(req, res) {
  try {
    const { userId, txId } = req.params;

    const db = getBankTransactionsDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, txId);
    if (!existing || existing.type !== 'bank_transaction' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Transacción no encontrada' });
    }

    const updated = buildBankTransaction(userId, {
      ...existing,
      status: 'unmatched',
      matchType: undefined,
      matchedMovementId: undefined,
      matchedMovementRef: undefined,
      matchedEntityId: undefined,
      matchedEntityRef: undefined,
    }, existing);

    const saved = await putDocument(req, db, updated._id, updated);
    return res.json({ ok: true, transaction: sanitizeBankTransaction({ ...updated, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al desvincular' });
  }
}

export async function removeBankTransaction(req, res) {
  try {
    const { userId, txId } = req.params;

    const db = getBankTransactionsDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, txId);
    if (!existing || existing.type !== 'bank_transaction' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Transacción no encontrada' });
    }

    await softDeleteDocument(req, db, txId);

    const account = await findAccountByUserId(req, userId);
    if (account) {
      await logAccountActivity(req, {
        actorUserId: userId, actorName: account.fullName, targetUserId: userId,
        type: 'bank_reconciliation',
        action: `Eliminó transacción bancaria: ${existing.description} (${existing.amount}€)`,
        entityId: existing._id, entityLabel: existing.description,
      });
    }

    return res.json({ ok: true, id: txId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar transacción' });
  }
}

export async function getStats(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const txs = await listBankTransactionsByUser(req, userId);
    const total = txs.length;
    const matched = txs.filter((t) => t.status === 'matched').length;
    const unmatched = txs.filter((t) => t.status === 'unmatched').length;
    const ignored = txs.filter((t) => t.status === 'ignored').length;
    const totalIncome = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const totalExpense = txs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

    return res.json({
      ok: true,
      stats: {
        total, matched, unmatched, ignored,
        conciliationPct: total > 0 ? Math.round((matched / total) * 100) : 0,
        totalIncome: Number(totalIncome.toFixed(2)),
        totalExpense: Number(totalExpense.toFixed(2)),
        balance: Number((totalIncome - totalExpense).toFixed(2)),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener estadísticas' });
  }
}

export async function getAlerts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const [bankTxs, clientInvoices, movements] = await Promise.all([
      listBankTransactionsByUser(req, userId),
      listInvoicesByUser(req, userId).catch(() => []),
      listFinanceByUser(req, userId),
    ]);

    const alerts = detectAlerts(bankTxs, clientInvoices, movements);

    return res.json({ ok: true, alerts, total: alerts.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener alertas' });
  }
}
