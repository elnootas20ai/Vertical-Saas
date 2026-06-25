/**
 * Crea la primera empresa de cuenta a partir del onboarding (idempotente).
 */

import {
  buildBusinessDocument,
  listBusinessesByUser,
  saveBusiness,
} from '../../services/couchdb.js';
import { seedAlertsConfigIfMissing } from '../../controllers/settingsController.js';

export function resolveBusinessNameFromOnboarding(account) {
  const onboarding = account?.onboardingData || {};
  const profile = onboarding.companyProfile || {};
  return String(profile.tradeName || account?.companyName || '').trim();
}

/**
 * @returns {Promise<{ ok: boolean, created?: boolean, business?: object, businessId?: string, reason?: string }>}
 */
export async function provisionBusinessFromOnboarding(req, account) {
  const userId = String(account?.user_id || '').trim();
  if (!userId) return { ok: false, reason: 'no_user' };
  if (account.accountType === 'user') return { ok: false, reason: 'worker_account' };

  const existing = await listBusinessesByUser(req, userId);
  if (existing.length > 0) {
    const first = existing[0];
    const businessId = first.business_id || String(first._id || '').replace(/^business:/, '');
    return { ok: true, created: false, business: first, businessId };
  }

  const name = resolveBusinessNameFromOnboarding(account);
  if (!name) return { ok: false, reason: 'missing_name' };

  const onboarding = account.onboardingData || {};
  const profile = onboarding.companyProfile || {};
  const business = buildBusinessDocument({
    ownerUserId: userId,
    name,
    legalName: profile.legalName || '',
    taxId: profile.taxId || '',
    address: profile.address || '',
    city: profile.city || profile.province || '',
    phone: profile.companyPhone || account.phone || '',
    email: profile.companyEmail || account.email || '',
    businessType: onboarding.businessType || 'delivery',
  });

  if (Array.isArray(business.members) && business.members[0]) {
    business.members[0].fullName = account.fullName || '';
    business.members[0].email = account.email || '';
  }

  const saved = await saveBusiness(req, business);
  const businessId = saved.business_id || String(saved._id || '').replace(/^business:/, '');
  if (businessId) {
    await seedAlertsConfigIfMissing(req, businessId, saved.businessType || onboarding.businessType);
  }

  return { ok: true, created: true, business: saved, businessId };
}
