import {
  getFinanceDbName,
  buildBankAccountDocument,
  sanitizeBankAccount,
  listBankAccountsByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  listFinanceByUser,
} from '../services/couchdb.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureAccountOwner(req, userId, accountId) {
  const db = getFinanceDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, accountId);
  if (!doc || doc.type !== 'bank_account' || doc.user_id !== userId || doc.deletedAt) {
    return null;
  }
  return doc;
}

export async function listAccounts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const raw = await listBankAccountsByUser(req, userId);
    return res.json({ ok: true, accounts: raw.map(sanitizeBankAccount).filter(Boolean) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar cuentas' });
  }
}

export async function getAccount(req, res) {
  try {
    const { userId, accountId } = req.params;
    const doc = await ensureAccountOwner(req, userId, accountId);
    if (!doc) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });
    return res.json({ ok: true, account: sanitizeBankAccount(doc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar cuenta' });
  }
}

export async function createAccount(req, res) {
  try {
    const { userId } = req.params;
    const { account } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!account || typeof account !== 'object') return badRequest(res, 'Falta el objeto account');
    if (!account.name?.trim()) return badRequest(res, 'El nombre es obligatorio');

    const userAccount = await findAccountByUserId(req, userId);
    if (!userAccount) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    if (account.isDefault) {
      const existing = await listBankAccountsByUser(req, userId);
      const db = getFinanceDbName();
      for (const acc of existing) {
        if (acc.isDefault) {
          acc.isDefault = false;
          acc.updatedAt = new Date().toISOString();
          await putDocument(req, db, acc._id, acc);
        }
      }
    }

    const db = getFinanceDbName();
    await ensureDatabase(req, db);
    const doc = buildBankAccountDocument(userId, account);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: userAccount.fullName,
      targetUserId: userId,
      type: 'finance',
      action: `Creó cuenta bancaria: ${doc.name}`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { bankName: doc.bankName, initialBalance: doc.initialBalance },
    });

    return res.status(201).json({ ok: true, account: sanitizeBankAccount({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear cuenta' });
  }
}

export async function updateAccount(req, res) {
  try {
    const { userId, accountId } = req.params;
    const { account } = req.body || {};

    if (!account || typeof account !== 'object') return badRequest(res, 'Faltan datos de la cuenta');

    const existing = await ensureAccountOwner(req, userId, accountId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    if (account.isDefault && !existing.isDefault) {
      const all = await listBankAccountsByUser(req, userId);
      const db = getFinanceDbName();
      for (const acc of all) {
        if (acc._id !== accountId && acc.isDefault) {
          acc.isDefault = false;
          acc.updatedAt = new Date().toISOString();
          await putDocument(req, db, acc._id, acc);
        }
      }
    }

    const db = getFinanceDbName();
    const doc = buildBankAccountDocument(userId, { ...existing, ...account }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, account: sanitizeBankAccount({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar cuenta' });
  }
}

export async function removeAccount(req, res) {
  try {
    const { userId, accountId } = req.params;

    const existing = await ensureAccountOwner(req, userId, accountId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const db = getFinanceDbName();
    await softDeleteDocument(req, db, accountId);

    return res.json({ ok: true, id: accountId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar cuenta' });
  }
}

export async function recalculateBalance(req, res) {
  try {
    const { userId, accountId } = req.params;

    const existing = await ensureAccountOwner(req, userId, accountId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const movements = await listFinanceByUser(req, userId);
    const linked = movements.filter((m) => m.bankAccountId === accountId);

    const income = linked
      .filter((m) => m.type === 'cobro')
      .reduce((s, m) => s + Number(m.totalAmount || 0), 0);
    const expense = linked
      .filter((m) => m.type === 'pago')
      .reduce((s, m) => s + Number(m.totalAmount || 0), 0);

    const newBalance = Number((Number(existing.initialBalance || 0) + income - expense).toFixed(2));

    const db = getFinanceDbName();
    const doc = { ...existing, currentBalance: newBalance, updatedAt: new Date().toISOString() };
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, account: sanitizeBankAccount({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al recalcular saldo' });
  }
}
