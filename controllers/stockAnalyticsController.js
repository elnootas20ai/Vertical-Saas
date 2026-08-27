import {
  getStockAnalyticsKpi,
  getStockAnalyticsBlock,
  getStockAnalyticsOverview,
  getStockAnalyticsInsights,
  getStockAnalyticsReport,
  STOCK_ANALYTICS_KPI_IDS,
  STOCK_ANALYTICS_BLOCK_IDS,
} from '../services/stockAnalyticsService.js';

function bad(res, msg) {
  return res.status(400).json({ ok: false, error: msg });
}

function queryOpts(req) {
  return {
    dateFrom: req.query.dateFrom || req.query.from || '',
    dateTo: req.query.dateTo || req.query.to || '',
    businessId: req.query.businessId || '',
  };
}

export async function getKpi(req, res) {
  try {
    const { userId, kpiId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    if (!STOCK_ANALYTICS_KPI_IDS.includes(kpiId)) {
      return bad(res, `KPI no válido. Disponibles: ${STOCK_ANALYTICS_KPI_IDS.join(', ')}`);
    }
    if (req.callerIsWorker) {
      return res.status(403).json({ ok: false, error: 'Sin acceso a analytics de stock' });
    }
    const kpi = await getStockAnalyticsKpi(req, userId, kpiId, queryOpts(req));
    return res.json({ ok: true, kpi });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Error al calcular KPI',
    });
  }
}

export async function getBlock(req, res) {
  try {
    const { userId, blockId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    if (!STOCK_ANALYTICS_BLOCK_IDS.includes(blockId)) {
      return bad(res, `Bloque no válido. Disponibles: ${STOCK_ANALYTICS_BLOCK_IDS.join(', ')}`);
    }
    if (req.callerIsWorker) {
      return res.status(403).json({ ok: false, error: 'Sin acceso a analytics de stock' });
    }
    const block = await getStockAnalyticsBlock(req, userId, blockId, queryOpts(req));
    return res.json({ ok: true, block });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Error al cargar bloque',
    });
  }
}

export async function getOverview(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    if (req.callerIsWorker) {
      return res.status(403).json({ ok: false, error: 'Sin acceso a analytics de stock' });
    }
    const overview = await getStockAnalyticsOverview(req, userId, queryOpts(req));
    return res.json({ ok: true, overview });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Error al cargar overview',
    });
  }
}

export async function getInsights(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    if (req.callerIsWorker) {
      return res.status(403).json({ ok: false, error: 'Sin acceso a analytics de stock' });
    }
    const insights = await getStockAnalyticsInsights(req, userId, queryOpts(req));
    return res.json({ ok: true, insights });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Error al cargar insights',
    });
  }
}

export async function getReport(req, res) {
  try {
    const { userId, reportId } = req.params;
    if (!userId || !reportId) return bad(res, 'Falta userId o reportId');
    if (!['escandallo', 'reductores', 'gerencial'].includes(reportId)) {
      return bad(res, 'Informe no válido (escandallo | reductores | gerencial)');
    }
    if (req.callerIsWorker) {
      return res.status(403).json({ ok: false, error: 'Sin acceso a analytics de stock' });
    }
    const report = await getStockAnalyticsReport(req, userId, reportId, queryOpts(req));
    return res.json({ ok: true, report });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Error al cargar informe',
    });
  }
}

export async function listMeta(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return bad(res, 'Falta userId');
    return res.json({
      ok: true,
      kpis: STOCK_ANALYTICS_KPI_IDS,
      blocks: STOCK_ANALYTICS_BLOCK_IDS,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || 'Error' });
  }
}
