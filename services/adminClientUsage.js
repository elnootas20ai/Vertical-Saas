import {
  findAccountByUserId,
  listBusinessesByUser,
  listClockinsByBusiness,
  queryChangelog,
  getCouchConfig,
  buildCouchAuthHeader,
} from './couchdb.js';
import { listClientErrors } from './clientErrorLog.js';

function buildOnboardingSummary(onboardingData) {
  const od = onboardingData && typeof onboardingData === 'object' ? onboardingData : {};
  const imports = od.imports && typeof od.imports === 'object' ? od.imports : {};
  const cp = od.companyProfile && typeof od.companyProfile === 'object' ? od.companyProfile : {};
  const docs = Array.isArray(cp.verificationDocuments) ? cp.verificationDocuments : [];
  const review = cp.verificationReview && typeof cp.verificationReview === 'object'
    ? cp.verificationReview
    : null;
  let verificationStatus = 'none';
  if (review?.status === 'approved' || review?.status === 'rejected' || review?.status === 'pending') {
    verificationStatus = review.status;
  } else if (docs.length > 0) {
    verificationStatus = 'pending';
  }
  return {
    pixelOpened: Boolean(od.pixelOpened),
    pixelClicked: Boolean(od.pixelClicked),
    imports: {
      vehicles: Boolean(imports.vehicles),
      clients: Boolean(imports.clients),
      team: Boolean(imports.team),
      billing: Boolean(imports.billing),
    },
    ancoverAccess: Boolean(od.ancoverAccess),
    verificationStatus,
    onboardingCompleted: Boolean(od.completed),
  };
}

const LOGS_DB = 'activity-logs';
const MS_DAY = 86400000;

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeClientHealth(lastLoginAt, createdAt) {
  const ref = parseDate(lastLoginAt) || parseDate(createdAt);
  if (!ref) {
    return { status: 'inactive', label: 'Sin actividad', daysSince: null };
  }
  const daysSince = Math.floor((Date.now() - ref.getTime()) / MS_DAY);
  if (daysSince <= 7) return { status: 'active', label: 'Activo', daysSince };
  if (daysSince <= 30) return { status: 'at_risk', label: 'En riesgo', daysSince };
  return { status: 'inactive', label: 'Inactivo', daysSince };
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function summarizeSessions(sessions) {
  if (!Array.isArray(sessions)) return [];
  const now = new Date();
  return sessions
    .filter((s) => s?.sessionId)
    .map((s) => ({
      sessionId: String(s.sessionId),
      deviceInfo: s.deviceInfo && typeof s.deviceInfo === 'object' ? s.deviceInfo : {},
      ipAddress: String(s.ipAddress || ''),
      lastActiveAt: String(s.lastActiveAt || s.createdAt || ''),
      createdAt: String(s.createdAt || ''),
      active: Boolean(s.expiry && new Date(s.expiry) > now),
    }))
    .sort((a, b) => String(b.lastActiveAt).localeCompare(String(a.lastActiveAt)))
    .slice(0, 10);
}

function aggregateClockins(records, fromDate) {
  let totalMinutes = 0;
  const activeDates = new Set();
  let sessions = 0;
  for (const r of records) {
    if (fromDate && String(r.date || '') < fromDate) continue;
    sessions += 1;
    totalMinutes += Number(r.totalMinutes) || 0;
    if (r.date) activeDates.add(String(r.date));
  }
  return { totalMinutes, activeDays: activeDates.size, sessions };
}

function isLoginEntry(entry) {
  const entity = String(entry?.entity || '').toLowerCase();
  const action = String(entry?.action || '').toLowerCase();
  const type = String(entry?.type || '').toLowerCase();
  return entity === 'login' || action === 'login' || type === 'login';
}

function groupLoginsByWeek(logins, daysBack = 30) {
  const cutoff = Date.now() - daysBack * MS_DAY;
  const buckets = {};
  for (const entry of logins) {
    const at = parseDate(entry.createdAt);
    if (!at || at.getTime() < cutoff) continue;
    const d = at;
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = weekStart.toISOString().slice(0, 10);
    buckets[key] = (buckets[key] || 0) + 1;
  }
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, count]) => ({ week, count }));
}

function countActiveLoginDays(logins, daysBack = 30) {
  const cutoff = Date.now() - daysBack * MS_DAY;
  const dates = new Set();
  for (const entry of logins) {
    const at = parseDate(entry.createdAt);
    if (!at || at.getTime() < cutoff) continue;
    dates.add(at.toISOString().slice(0, 10));
  }
  return dates.size;
}

async function queryRecentActivityLogs(req, userKeys, sinceMs, limit = 300) {
  try {
    const cfg = getCouchConfig(req);
    if (!cfg.baseUrl) return [];
    const base = cfg.baseUrl.replace(/\/+$/, '');
    const auth = buildCouchAuthHeader(req);
    const headers = auth ? { Authorization: auth } : {};
    const url = `${base}/${LOGS_DB}/_design/logs/_view/by_timestamp?descending=true&include_docs=true&limit=${Math.min(limit * 4, 2000)}`;
    const res = await fetch(url, { headers }).catch(() => null);
    if (!res?.ok) return [];
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const keys = new Set(userKeys.filter(Boolean).map((k) => String(k).toLowerCase()));
    const out = [];
    for (const row of rows) {
      const doc = row.doc;
      if (!doc || doc.type !== 'activity-log') continue;
      const ts = parseDate(doc.timestamp);
      if (!ts || ts.getTime() < sinceMs) continue;
      const userKey = String(doc.user || '').toLowerCase();
      if (!keys.has(userKey)) continue;
      out.push({
        timestamp: doc.timestamp,
        action: doc.action || '',
        details: doc.details || '',
        category: doc.category || '',
        resource: doc.resource || '',
        method: doc.method || '',
        path: doc.path || '',
        level: doc.level || 'info',
        ip: doc.ip || '',
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

function topResourcesFromLogs(logs, limit = 6) {
  const counts = {};
  for (const log of logs) {
    const key = log.resource || log.category || 'otro';
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([resource, count]) => ({ resource, count }));
}

/**
 * Agrega métricas de uso de un cliente SaaS (solo superadmin).
 */
export async function buildAdminClientUsage(req, userId) {
  const account = await findAccountByUserId(req, userId);
  if (!account) return null;

  const email = String(account.email || '').trim();
  const normalizedEmail = email.toLowerCase();
  const from30 = isoDaysAgo(30);
  const from7Ms = Date.now() - 7 * MS_DAY;
  const from30Ms = Date.now() - 30 * MS_DAY;

  const health = computeClientHealth(account.lastLoginAt, account.createdAt);

  const businesses = await listBusinessesByUser(req, userId);
  const ownedBusinesses = businesses.filter((b) => b.owner_user_id === userId);

  let totalClockedMinutes30 = 0;
  let totalClockedDays30 = 0;
  const businessSummaries = [];

  for (const business of ownedBusinesses) {
    const businessId = String(business.business_id || '').replace(/^business:/, '').trim();
    const records = await listClockinsByBusiness(req, businessId);
    const agg = aggregateClockins(records, from30);
    totalClockedMinutes30 += agg.totalMinutes;
    totalClockedDays30 = Math.max(totalClockedDays30, agg.activeDays);
    businessSummaries.push({
      businessId,
      name: business.name || businessId,
      businessType: business.businessType || business.vertical || '',
      memberCount: Array.isArray(business.members) ? business.members.length : 0,
      clockedMinutes30: agg.totalMinutes,
      activeDays30: agg.activeDays,
      clockSessions30: agg.sessions,
    });
  }

  const changelogEntries = await queryChangelog(req, { actorUserId: userId, limit: 400 });
  const loginEntries = changelogEntries.filter(isLoginEntry);
  const logins30 = loginEntries.filter((e) => {
    const at = parseDate(e.createdAt);
    return at && at.getTime() >= from30Ms;
  });

  const userKeys = [userId, email, normalizedEmail];
  const activityLogs7d = await queryRecentActivityLogs(req, userKeys, from7Ms, 150);
  const activityLogs30d = await queryRecentActivityLogs(req, userKeys, from30Ms, 300);

  const tpvErrors = listClientErrors({ userId, limit: 20, all: false });
  const tpvErrors7d = tpvErrors.filter((e) => {
    const at = parseDate(e.at);
    return at && at.getTime() >= from7Ms;
  });

  const sessions = summarizeSessions(account.sessions);
  const recentActivity = Array.isArray(account.recentActivity)
    ? account.recentActivity.slice(0, 15)
    : [];

  return {
    health,
    account: {
      userId: account.user_id,
      email: account.email || '',
      fullName: account.fullName || '',
      companyName: account.companyName || '',
      createdAt: account.createdAt || '',
      lastLoginAt: account.lastLoginAt || '',
      status: account.status || 'active',
      subscriptionStatus: account.subscription?.status || '',
      onboardingCompleted: Boolean(account.onboardingCompleted),
    },
    kpis: {
      daysSinceLastLogin: health.daysSince,
      activeLoginDays30: countActiveLoginDays(loginEntries, 30),
      loginCount30: logins30.length,
      activeSessionCount: sessions.filter((s) => s.active).length,
      totalSessionCount: sessions.length,
      clockedHours30: Math.round((totalClockedMinutes30 / 60) * 10) / 10,
      clockedDays30: totalClockedDays30,
      tpvErrors7d: tpvErrors7d.length,
      apiRequests7d: activityLogs7d.length,
      apiRequests30d: activityLogs30d.length,
    },
    sessions,
    loginsByWeek: groupLoginsByWeek(loginEntries, 30),
    recentLogins: loginEntries.slice(0, 10).map((e) => ({
      at: e.createdAt || '',
      ip: e.metadata?.ip || e.ip || '',
      userAgent: e.metadata?.userAgent || '',
      provider: e.metadata?.provider || '',
    })),
    recentActivity,
    businesses: businessSummaries,
    onboarding: buildOnboardingSummary(account.onboardingData),
    tpvErrors: tpvErrors.slice(0, 8).map((e) => ({
      at: e.at,
      context: e.context || '',
      page: e.page || '',
      message: e.message || '',
    })),
    topApiActivity7d: topResourcesFromLogs(activityLogs7d),
    recentApiActivity: activityLogs7d.slice(0, 12),
  };
}
