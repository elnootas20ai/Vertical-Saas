import { findAccountByUserId } from '../services/couchdb.js';
import {
  createStoreTransfer,
  receiveStoreTransfer,
  cancelStoreTransfer,
  listStoreTransfersByUser,
  listStoreTransferDestinations,
} from '../services/storeTransferService.js';
import logger from '../services/logger.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

export async function listTransfers(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const { pdvId, status } = req.query;
    const transfers = await listStoreTransfersByUser(req, userId, { pdvId, status });
    return res.json({ ok: true, transfers, total: transfers.length });
  } catch (error) {
    logger.error({ tag: 'STORE_TRANSFER', err: error?.message }, 'Error listando traspasos');
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar traspasos' });
  }
}

export async function listDestinations(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const fromPdvId = String(req.query?.fromPdvId || '').trim();
    const destinations = await listStoreTransferDestinations(req, userId, fromPdvId);
    return res.json({ ok: true, destinations });
  } catch (error) {
    logger.error({ tag: 'STORE_TRANSFER', err: error?.message }, 'Error listando destinos');
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar tiendas destino' });
  }
}

export async function createTransfer(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const { fromPdvId, toPdvId, items, notes, performedBy } = req.body || {};
    const transfer = await createStoreTransfer(req, userId, {
      fromPdvId,
      toPdvId,
      items,
      notes,
      performedBy: performedBy || account.fullName || userId,
    });
    return res.status(201).json({ ok: true, transfer });
  } catch (error) {
    logger.error({ tag: 'STORE_TRANSFER', err: error?.message }, 'Error creando traspaso');
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear traspaso' });
  }
}

export async function receiveTransfer(req, res) {
  try {
    const { userId, transferId } = req.params;
    if (!userId || !transferId) return badRequest(res, 'Faltan userId o transferId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const transfer = await receiveStoreTransfer(req, userId, transferId, {
      performedBy: req.body?.performedBy || account.fullName || userId,
    });
    return res.json({ ok: true, transfer });
  } catch (error) {
    logger.error({ tag: 'STORE_TRANSFER', err: error?.message }, 'Error recibiendo traspaso');
    return res.status(500).json({ ok: false, error: error.message || 'Error al recibir traspaso' });
  }
}

export async function cancelTransfer(req, res) {
  try {
    const { userId, transferId } = req.params;
    if (!userId || !transferId) return badRequest(res, 'Faltan userId o transferId');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const transfer = await cancelStoreTransfer(req, userId, transferId, {
      performedBy: req.body?.performedBy || account.fullName || userId,
    });
    return res.json({ ok: true, transfer });
  } catch (error) {
    logger.error({ tag: 'STORE_TRANSFER', err: error?.message }, 'Error cancelando traspaso');
    return res.status(500).json({ ok: false, error: error.message || 'Error al cancelar traspaso' });
  }
}
