import {
  getCleaningContractsDbName,
  buildCleaningContractDocument,
  sanitizeCleaningContract,
  listCleaningContractsByUser,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
} from '../services/couchdb.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureContractOwner(req, userId, contractId) {
  const db = getCleaningContractsDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, contractId);
  if (!doc || doc.type !== 'cleaning_contract' || doc.user_id !== userId) return null;
  return doc;
}

export async function listCleaningContracts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const contracts = await listCleaningContractsByUser(req, userId);
    return res.json({ ok: true, contracts: contracts.map(sanitizeCleaningContract) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar contratos de limpieza' });
  }
}

export async function createCleaningContract(req, res) {
  try {
    const { userId } = req.params;
    const { contract } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!contract || typeof contract !== 'object') return badRequest(res, 'Falta el objeto contract en el body');
    if (!contract.clientId && !contract.clientName?.trim()) return badRequest(res, 'Falta cliente');
    if (!Array.isArray(contract.services) || contract.services.length === 0) {
      return badRequest(res, 'Debe incluir al menos un servicio');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCleaningContractsDbName();
    await ensureDatabase(req, db);
    const doc = buildCleaningContractDocument(userId, contract);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'cleaning_contract',
      action: `Creó contrato ${doc.contractNumber} — ${doc.clientName}`,
      entityId: doc._id,
      entityLabel: `${doc.contractNumber} ${doc.clientName}`.trim(),
      metadata: { status: doc.status, totalMonthly: doc.totalMonthly, billingFrequency: doc.billingFrequency },
    });

    return res.status(201).json({ ok: true, contract: sanitizeCleaningContract({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear contrato de limpieza' });
  }
}

export async function updateCleaningContract(req, res) {
  try {
    const { userId, contractId } = req.params;
    const { contract } = req.body || {};
    if (!contract || typeof contract !== 'object') return badRequest(res, 'Faltan datos del contrato');

    const existing = await ensureContractOwner(req, userId, contractId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Contrato no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCleaningContractsDbName();
    const doc = buildCleaningContractDocument(userId, { ...existing, ...contract }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'cleaning_contract',
      action: `Actualizó contrato ${doc.contractNumber} → ${doc.status}`,
      entityId: doc._id,
      entityLabel: `${doc.contractNumber} ${doc.clientName}`.trim(),
      metadata: { status: doc.status, totalMonthly: doc.totalMonthly },
    });

    return res.json({ ok: true, contract: sanitizeCleaningContract({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar contrato de limpieza' });
  }
}

export async function removeCleaningContract(req, res) {
  try {
    const { userId, contractId } = req.params;
    const existing = await ensureContractOwner(req, userId, contractId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Contrato no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getCleaningContractsDbName();
    await softDeleteDocument(req, db, contractId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'cleaning_contract',
      action: `Eliminó contrato ${existing.contractNumber}`,
      entityId: existing._id,
      entityLabel: existing.contractNumber,
      metadata: {},
    });

    return res.json({ ok: true, id: contractId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar contrato de limpieza' });
  }
}
