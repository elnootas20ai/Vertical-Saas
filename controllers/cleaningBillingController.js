import { findAccountByUserId } from '../services/couchdb.js';
import {
  runCleaningBillingCycle,
  generateInvoicesFromCompletedServices,
  generateInvoicesFromContracts,
  markOverdueInvoices,
} from '../services/cleaningBillingEngine.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

export async function generateAll(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const result = await runCleaningBillingCycle(req, userId);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error en el ciclo de facturación' });
  }
}

export async function generateFromServices(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const invoices = await generateInvoicesFromCompletedServices(req, userId);
    return res.json({ ok: true, invoices });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error generando facturas desde servicios' });
  }
}

export async function generateFromContractsHandler(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const invoices = await generateInvoicesFromContracts(req, userId);
    return res.json({ ok: true, invoices });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error generando facturas desde contratos' });
  }
}

export async function markOverdue(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const invoices = await markOverdueInvoices(req, userId);
    return res.json({ ok: true, invoices });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error marcando facturas vencidas' });
  }
}
