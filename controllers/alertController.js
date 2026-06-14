import { findAccountByUserId, saveAccount } from '../services/couchdb.js';
import { getAlertSummary, getAlertConfig } from '../services/alertEngine.js';
import { runAllAlertMotors } from '../services/alertMotorOrchestrator.js';
import { getButcherAlertConfig } from '../services/butcherAlertEngine.js';
import { getDeliveryAlertConfig } from '../services/deliveryAlertEngine.js';
import { getConstructionAlertConfig } from '../services/constructionAlertEngine.js';
import { getCompraventaAlertConfig } from '../services/compraventaAlertEngine.js';

const fakeReq = { headers: {} };

export async function getAlerts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const summary = await getAlertSummary(userId);
    return res.json({ ok: true, ...summary });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error obteniendo resumen de alertas',
    });
  }
}

export async function triggerAlertCheck(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const summary = await getAlertSummary(userId);
    const motors = await runAllAlertMotors();

    return res.json({
      ok: true,
      message: 'Motores de alertas ejecutados (global, delivery, limpieza, carnicería, construcción)',
      totals: summary.totals,
      motors,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error ejecutando chequeo de alertas',
    });
  }
}

export async function getAlertSettings(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const account = await findAccountByUserId(fakeReq, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const config = { ...getAlertConfig(account), ...getButcherAlertConfig(account), delivery: getDeliveryAlertConfig(account), construction: getConstructionAlertConfig(account), compraventa: getCompraventaAlertConfig(account) };
    return res.json({ ok: true, config });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error obteniendo configuración de alertas',
    });
  }
}

export async function updateAlertSettings(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

    const account = await findAccountByUserId(fakeReq, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada' });

    const body = req.body || {};
    const allowedKeys = [
      'lowStockEnabled', 'outOfStockEnabled', 'partsLowStockEnabled',
      'overdueInvoicesEnabled', 'highPayablesEnabled', 'highPayablesThreshold',
      'staleWebOrdersEnabled', 'staleWebOrderDays', 'staleDeliveryEnabled', 'staleDeliveryMinutes',
      'lowSalesEnabled', 'lowSalesThreshold',
      'vehicleStockAlertEnabled', 'vehicleStockAlertDays',
      'staleWorkOrderEnabled', 'staleWorkOrderDays',
      'pendingOrderEnabled', 'pendingOrderDaysThreshold', 'negativeStockEnabled',
      // Equipo
      'noClockInEnabled', 'noClockInCheckHour',
      'lateClockInEnabled', 'lateClockInToleranceMinutes',
      'overtimeEnabled', 'overtimeWeeklyMaxHours',
      'contractExpiringEnabled', 'contractExpiringDays',
      // Documentación
      'documentExpiryEnabled', 'documentExpiryDays',
      'fleetItvAlertEnabled', 'fleetInsuranceAlertEnabled',
      // Finanzas avanzado
      'clientPaymentOverdueEnabled', 'negativeCashFlowEnabled',
      // Pedidos de compra
      'purchaseOrderDelayedEnabled',
      // Carniceria
      'butcherStockAlertEnabled', 'butcherStockCriticalPct',
      'butcherBatchAlertEnabled', 'butcherBatchExpiringDays',
      'butcherWasteAlertEnabled', 'butcherWasteWarningPct', 'butcherWasteCriticalPct',
      'butcherPriceAlertEnabled', 'butcherPriceStaleDays',
      'butcherScaleAlertEnabled', 'butcherScaleTimeoutMinutes',
      'butcherRegisterAlertEnabled', 'butcherRegisterMaxHours', 'butcherTicketUnpaidMinutes',
      'butcherInventoryAlertEnabled', 'butcherInventoryWarningPct', 'butcherInventoryCriticalPct',
      // Construcción
      'constructionAlertsEnabled',
      'constructionBudgetNoResponseEnabled', 'constructionBudgetNoResponseDays',
      'constructionProjectNoResponsibleEnabled',
      'constructionProjectInactiveEnabled', 'constructionProjectInactiveDays',
      'constructionWorkerNoReportEnabled', 'constructionWorkerNoReportCheckHour',
      'constructionCollectionOverdueEnabled',
      'constructionPaymentOverdueEnabled', 'constructionPaymentOverdueDays',
      'constructionPaymentUnjustifiedEnabled', 'constructionPaymentUnjustifiedDays',
      'constructionDocumentPendingEnabled',
      'constructionDocumentExpiredEnabled', 'constructionDocumentExpiryDays',
      'constructionIncidentCriticalEnabled', 'constructionIncidentUnreviewedHours',
      'constructionCostOverrunEnabled', 'constructionCostWarningPct', 'constructionCostCriticalPct',
      'constructionProjectUnclosedEnabled', 'constructionProjectUnclosedDays',
      'constructionTaskOverdueEnabled',
    ];

    const current = account.alertConfig || {};
    const updated = { ...current };
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        updated[key] = body[key];
      }
    }

    const updatedAccount = { ...account, alertConfig: updated, updatedAt: new Date().toISOString() };
    await saveAccount(req, updatedAccount);

    return res.json({ ok: true, config: getAlertConfig(updatedAccount) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error actualizando configuración de alertas',
    });
  }
}
