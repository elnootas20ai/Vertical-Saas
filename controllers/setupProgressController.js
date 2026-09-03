/**
 * Setup Progress Controller — Gestión del onboarding operativo.
 *
 * Gestiona el progreso del setup inicial del negocio tras el registro.
 * Los pasos se calculan dinámicamente según vertical y módulos contratados.
 */

import {
  ACCOUNTS_DB,
  buildSetupProgressDocument,
  ensureDatabase,
  findAccountByUserId,
  findBusinessById,
  findDocuments,
  findSetupProgressByUserId,
  listBusinessesByUser,
  sanitizeSetupProgress,
  saveSetupProgress,
  getCatalogDbName,
  getWorkshopDbName,
} from '../services/couchdb.js';
import { computeSetupSteps, getApplicableStepDefinitions } from '../models/setupSteps.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function recalcOverall(doc) {
  const requiredSteps = doc.steps.filter((s) => s.required);
  const allRequiredDone = requiredSteps.every((s) => s.completed || s.skipped);
  if (allRequiredDone && !doc.overallCompleted) {
    doc.overallCompleted = true;
    doc.overallCompletedAt = new Date().toISOString();
  }
  return doc;
}

async function getOrCreateProgress(req, userId) {
  let doc = await findSetupProgressByUserId(req, userId);
  if (doc && doc.type === 'setup_progress') {
    const account = await findAccountByUserId(req, userId);
    if (!account) return doc;

    let targetBusinessId = String(doc.business_id || account.linkedBusinessId || '').trim();
    if (!targetBusinessId) {
      const businesses = await listBusinessesByUser(req, userId);
      targetBusinessId = String(businesses[0]?.business_id || '').trim();
    }

    let changed = false;
    if (targetBusinessId && doc.business_id !== targetBusinessId) {
      doc.business_id = targetBusinessId;
      changed = true;
    }

    // Ya completado / saltado: no re-escanear DBs en cada GET (load-only).
    if (doc.overallCompleted || doc.skippedAt) {
      if (changed) {
        recalcOverall(doc);
        doc.updatedAt = new Date().toISOString();
        doc = await saveSetupProgress(req, doc);
      }
      return doc;
    }

    const businessScopedStepKeys = [
      'initial_team',
      'locations',
      'initial_clients',
      'catalog_setup',
      'stock_initial',
      'first_operation',
    ];

    const pending = businessScopedStepKeys.filter((stepKey) => {
      const step = doc.steps.find((s) => s.key === stepKey);
      return step && !step.completed && !step.skipped;
    });

    if (pending.length > 0) {
      const results = await Promise.all(
        pending.map(async (stepKey) => ({
          stepKey,
          ok: await verifyStep(req, userId, stepKey, account, targetBusinessId),
        })),
      );
      for (const { stepKey, ok } of results) {
        const step = doc.steps.find((s) => s.key === stepKey);
        if (!step) continue;
        if (step.completed !== ok) {
          step.completed = ok;
          step.completedAt = ok ? step.completedAt || new Date().toISOString() : null;
          changed = true;
        }
      }
    }

    if (changed) {
      recalcOverall(doc);
      doc.updatedAt = new Date().toISOString();
      doc = await saveSetupProgress(req, doc);
    }

    return doc;
  }

  const account = await findAccountByUserId(req, userId);
  if (!account) return null;

  const onb = account.onboardingData || {};
  const businessType = onb.businessType || '';
  const requestedModules = onb.requestedModules || {};
  const businessId = account.linkedBusinessId || '';
  const trial = onb.trial || {};

  const newDoc = buildSetupProgressDocument({ userId, businessId, businessType, requestedModules });
  if (trial.startDate) newDoc.trialStartDate = new Date(trial.startDate).toISOString();
  if (trial.endDate) newDoc.trialEndDate = new Date(trial.endDate).toISOString();

  return saveSetupProgress(req, newDoc);
}

// ─── GET /:userId — Obtener progreso (o crearlo si no existe) ────────────────

export async function getProgress(req, res) {
  try {
    const { userId } = req.params;
    const doc = await getOrCreateProgress(req, userId);
    if (!doc) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const definitions = getApplicableStepDefinitions(doc.businessType, doc.requestedModules);

    return res.json({
      ok: true,
      progress: sanitizeSetupProgress(doc),
      definitions,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al obtener progreso de setup',
    });
  }
}

// ─── GET /:userId/status — Resumen rápido ────────────────────────────────────

export async function getStatus(req, res) {
  try {
    const { userId } = req.params;
    const doc = await getOrCreateProgress(req, userId);
    if (!doc) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const total = doc.steps.length;
    const completed = doc.steps.filter((s) => s.completed || s.skipped).length;
    const pending = doc.steps.filter((s) => !s.completed && !s.skipped).map((s) => s.key);

    let trialDaysRemaining = 0;
    if (doc.trialEndDate) {
      trialDaysRemaining = Math.max(0, Math.ceil((new Date(doc.trialEndDate).getTime() - Date.now()) / 86_400_000));
    }

    return res.json({
      ok: true,
      status: {
        percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
        completedCount: completed,
        totalCount: total,
        pendingSteps: pending,
        trialDaysRemaining,
        overallCompleted: Boolean(doc.overallCompleted),
        skippedAt: doc.skippedAt || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al obtener estado de setup',
    });
  }
}

// ─── PUT /:userId/step/:stepKey — Marcar paso como completado ────────────────

export async function completeStep(req, res) {
  try {
    const { userId, stepKey } = req.params;
    const { metadata } = req.body || {};

    const doc = await getOrCreateProgress(req, userId);
    if (!doc) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const step = doc.steps.find((s) => s.key === stepKey);
    if (!step) return res.status(404).json({ ok: false, error: `Paso "${stepKey}" no encontrado` });

    step.completed = true;
    step.completedAt = new Date().toISOString();
    if (metadata && typeof metadata === 'object') step.metadata = { ...step.metadata, ...metadata };

    recalcOverall(doc);
    doc.updatedAt = new Date().toISOString();
    const saved = await saveSetupProgress(req, doc);

    return res.json({ ok: true, progress: sanitizeSetupProgress(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al completar paso',
    });
  }
}

// ─── PUT /:userId/step/:stepKey/skip — Saltar paso ──────────────────────────

export async function skipStep(req, res) {
  try {
    const { userId, stepKey } = req.params;

    const doc = await getOrCreateProgress(req, userId);
    if (!doc) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const step = doc.steps.find((s) => s.key === stepKey);
    if (!step) return res.status(404).json({ ok: false, error: `Paso "${stepKey}" no encontrado` });

    step.skipped = true;
    step.skippedAt = new Date().toISOString();

    recalcOverall(doc);
    doc.updatedAt = new Date().toISOString();
    const saved = await saveSetupProgress(req, doc);

    return res.json({ ok: true, progress: sanitizeSetupProgress(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al saltar paso',
    });
  }
}

// ─── PUT /:userId/skip-all — Saltar todo el onboarding ──────────────────────

export async function skipAll(req, res) {
  try {
    const { userId } = req.params;

    const doc = await getOrCreateProgress(req, userId);
    if (!doc) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    doc.overallCompleted = true;
    doc.overallCompletedAt = new Date().toISOString();
    doc.skippedAt = new Date().toISOString();
    doc.updatedAt = new Date().toISOString();
    const saved = await saveSetupProgress(req, doc);

    return res.json({ ok: true, progress: sanitizeSetupProgress(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al saltar onboarding',
    });
  }
}

// ─── PUT /:userId/reset — Reiniciar progreso ────────────────────────────────

export async function resetProgress(req, res) {
  try {
    const { userId } = req.params;

    const doc = await getOrCreateProgress(req, userId);
    if (!doc) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const freshSteps = computeSetupSteps(doc.businessType, doc.requestedModules);
    doc.steps = freshSteps;
    doc.overallCompleted = false;
    doc.overallCompletedAt = null;
    doc.skippedAt = null;
    doc.updatedAt = new Date().toISOString();
    const saved = await saveSetupProgress(req, doc);

    return res.json({ ok: true, progress: sanitizeSetupProgress(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al reiniciar setup',
    });
  }
}

// ─── GET /:userId/verify-all — Verificación automática de pasos ──────────────

export async function verifyAll(req, res) {
  try {
    const { userId } = req.params;
    const doc = await getOrCreateProgress(req, userId);
    if (!doc) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    let changed = false;

    for (const step of doc.steps) {
      if (step.completed || step.skipped) continue;

      const wasCompleted = await verifyStep(req, userId, step.key, account, doc.business_id);
      if (wasCompleted) {
        step.completed = true;
        step.completedAt = new Date().toISOString();
        step.metadata = { ...step.metadata, autoVerified: true };
        changed = true;
      }
    }

    if (changed) {
      recalcOverall(doc);
      doc.updatedAt = new Date().toISOString();
      const saved = await saveSetupProgress(req, doc);
      return res.json({ ok: true, progress: sanitizeSetupProgress(saved), updated: true });
    }

    return res.json({ ok: true, progress: sanitizeSetupProgress(doc), updated: false });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al verificar pasos',
    });
  }
}

// ─── Verificación individual de cada paso ────────────────────────────────────

async function verifyStep(req, userId, stepKey, account, businessId) {
  try {
    const targetBusinessId = String(businessId || account?.linkedBusinessId || '').trim();

    switch (stepKey) {
      case 'company_profile': {
        const onb = account.onboardingData || {};
        const profile = onb.companyProfile || {};
        return Boolean(profile.tradeName && profile.legalName && profile.taxId && profile.address);
      }
      case 'initial_team': {
        if (!targetBusinessId) return false;
        const business = await findBusinessById(req, targetBusinessId);
        if (!business || business?.deletedAt) return false;
        const members = Array.isArray(business.members) ? business.members : [];
        const activeMembers = members.filter((m) => m && m.user_id && !m.deletedAt);
        return activeMembers.length >= 2;
      }
      case 'locations': {
        if (!targetBusinessId) return false;
        const locDb = `${process.env.COUCHDB_DB || 'vertial'}-locations`;
        try {
          await ensureDatabase(req, locDb);
          const locs = await findDocuments(
            req,
            locDb,
            { type: 'location', business_id: targetBusinessId },
            { pageSize: 1, maxDocs: 1 },
          );
          return locs.some((d) => d && !d.deletedAt);
        } catch {
          return false;
        }
      }
      case 'initial_clients': {
        if (!targetBusinessId) return false;
        const clientDb = `${process.env.COUCHDB_DB || 'vertial'}-clients`;
        try {
          await ensureDatabase(req, clientDb);
          const clients = await findDocuments(
            req,
            clientDb,
            { business_id: targetBusinessId },
            { pageSize: 1, maxDocs: 1 },
          );
          return clients.some((d) => d && !d.deletedAt);
        } catch {
          return false;
        }
      }
      case 'catalog_setup': {
        if (!targetBusinessId) return false;
        const catDb = getCatalogDbName();
        try {
          await ensureDatabase(req, catDb);
          const items = await findDocuments(
            req,
            catDb,
            { type: 'catalog_item', business_id: targetBusinessId },
            { pageSize: 1, maxDocs: 1 },
          );
          return items.some((d) => d && !d.deletedAt);
        } catch {
          return false;
        }
      }
      case 'stock_initial': {
        if (!targetBusinessId) return false;
        const catDb2 = getCatalogDbName();
        try {
          await ensureDatabase(req, catDb2);
          // Existencia con stock: limit 1 + filtro en memoria de un lote pequeño.
          const items = await findDocuments(
            req,
            catDb2,
            { type: 'catalog_item', business_id: targetBusinessId },
            { pageSize: 50, maxDocs: 50 },
          );
          return items.some(
            (d) => d && !d.deletedAt && (Number(d.stockQuantity) || 0) > 0,
          );
        } catch {
          return false;
        }
      }
      case 'first_operation': {
        if (!targetBusinessId) return false;
        const salesDb = `${process.env.COUCHDB_DB || 'vertial'}-sales`;
        try {
          await ensureDatabase(req, salesDb);
          const sales = await findDocuments(
            req,
            salesDb,
            { business_id: targetBusinessId },
            { pageSize: 1, maxDocs: 1 },
          );
          return sales.some((d) => d && !d.deletedAt);
        } catch {
          return false;
        }
      }
      case 'workshop_config': {
        const workshopDb = getWorkshopDbName();
        try {
          await ensureDatabase(req, workshopDb);
          const orders = await findDocuments(
            req,
            workshopDb,
            { type: 'work_order', user_id: userId },
            { pageSize: 1, maxDocs: 1 },
          );
          return orders.some((d) => d && !d.deletedAt);
        } catch {
          return false;
        }
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}
