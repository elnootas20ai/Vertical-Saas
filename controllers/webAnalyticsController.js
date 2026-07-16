import { isVertialSuperAdminEmail } from '../utils/superAdmin.js';
import {
  getWebAnalyticsSummary,
  safeRecordWebAnalyticsEvent,
} from '../services/webAnalytics.js';
import { listAccounts } from '../services/couchdb.js';

function requireSuperAdmin(req, res) {
  const email = String(req.authUser?.email || '').trim();
  if (!isVertialSuperAdminEmail(email)) {
    res.status(403).json({ ok: false, error: 'Solo superadmin Vertial' });
    return false;
  }
  return true;
}

const ALLOWED_EVENTS = new Set([
  'pageview',
  'cta_register',
  'cta_sales',
  'cta_login',
  'cta_plan',
  'cta_worker',
  'cta_tablet',
  'section_view',
]);

export async function trackWebAnalyticsEvent(req, res) {
  try {
    const name = String(req.body?.name || '').trim();
    if (!ALLOWED_EVENTS.has(name)) {
      return res.status(400).json({ ok: false, error: 'Evento no permitido' });
    }

    // Responder ya; persistir en background.
    res.status(202).json({ ok: true });
    void safeRecordWebAnalyticsEvent(req, {
      name,
      path: req.body?.path,
      referrer: req.body?.referrer,
      visitorId: req.body?.visitorId,
    });
  } catch {
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: 'No se pudo registrar' });
    }
  }
}

function daysAgoIso(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export async function getWebAnalyticsAdmin(req, res) {
  try {
    if (!requireSuperAdmin(req, res)) return;

    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const summary = await getWebAnalyticsSummary(req, { days });

    const since = daysAgoIso(days);
    let newAccounts = 0;
    let newCompanies = 0;
    try {
      const accounts = await listAccounts(req);
      for (const a of accounts || []) {
        const created = String(a.createdAt || a.created_at || '');
        if (!created || created < since) continue;
        if (a.deletedAt || a.status === 'deleted') continue;
        newAccounts += 1;
        if (String(a.accountType || '').toLowerCase() === 'company') {
          newCompanies += 1;
        }
      }
    } catch {
      /* optional enrichment */
    }

    return res.json({
      ok: true,
      analytics: summary,
      signups: {
        days,
        newAccounts,
        newCompanies,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cargar analytics',
    });
  }
}
