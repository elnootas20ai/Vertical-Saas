/**
 * Crea la primera empresa de cuenta a partir del onboarding (idempotente).
 */

import {
  buildBusinessDocument,
  findBusinessById,
  listBusinessesByUser,
  saveBusiness,
} from '../../services/couchdb.js';
import { seedAlertsConfigIfMissing } from '../../controllers/settingsController.js';

export function resolveBusinessNameFromOnboarding(account) {
  const onboarding = account?.onboardingData || {};
  const profile = onboarding.companyProfile || {};
  return String(profile.tradeName || account?.companyName || '').trim();
}

function normalizeBusinessMatchText(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Evita altas duplicadas cuando el mismo titular repite nombre (y ciudad o CIF).
 * @param {object[]} existing
 * @param {{ name?: string, city?: string, taxId?: string, ownerUserId?: string }} fields
 * @returns {object|null}
 */
export function findLikelyDuplicateBusiness(existing, fields) {
  const ownerUserId = String(fields?.ownerUserId || '').trim();
  const normName = normalizeBusinessMatchText(fields?.name);
  if (!ownerUserId || !normName || !Array.isArray(existing)) return null;

  const normCity = normalizeBusinessMatchText(fields?.city);
  const normTax = normalizeBusinessMatchText(fields?.taxId);

  return (
    existing.find((business) => {
      if (String(business?.owner_user_id || '').trim() !== ownerUserId) return false;
      if (normalizeBusinessMatchText(business?.name) !== normName) return false;
      if (normTax) {
        const businessTax = normalizeBusinessMatchText(business?.taxId || business?.tax_id);
        if (businessTax && businessTax === normTax) return true;
      }
      if (normCity) {
        return normalizeBusinessMatchText(business?.city) === normCity;
      }
      return true;
    }) || null
  );
}

/**
 * @returns {Promise<{ ok: boolean, created?: boolean, business?: object, businessId?: string, reason?: string }>}
 */
function normalizeLinkedBusinessId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

export { normalizeLinkedBusinessId };

export async function provisionBusinessFromOnboarding(req, account) {
  const userId = String(account?.user_id || '').trim();
  if (!userId) return { ok: false, reason: 'no_user' };
  if (account.accountType === 'user') return { ok: false, reason: 'worker_account' };

  if (account.onboardingData?.suppressAutoProvision) {
    return { ok: false, reason: 'suppress_auto_provision' };
  }

  const linkedId = normalizeLinkedBusinessId(account.onboardingData?.businessId);
  if (linkedId) {
    const linked = await findBusinessById(req, linkedId);
    if (linked && !linked.deletedAt) {
      return { ok: true, created: false, business: linked, businessId: linkedId };
    }
    // Empresa enlazada eliminada o inexistente: no recrear sola (el titular debe dar de alta manual).
    return { ok: false, reason: 'linked_business_unavailable' };
  }

  const existing = await listBusinessesByUser(req, userId);
  const name = resolveBusinessNameFromOnboarding(account);
  if (!name) return { ok: false, reason: 'missing_name' };

  const onboarding = account.onboardingData || {};
  const profile = onboarding.companyProfile || {};
  const duplicate = findLikelyDuplicateBusiness(existing, {
    ownerUserId: userId,
    name,
    city: profile.city || profile.province || '',
    taxId: profile.taxId || '',
  });
  if (duplicate) {
    const businessId = duplicate.business_id || String(duplicate._id || '').replace(/^business:/, '');
    return { ok: true, created: false, business: duplicate, businessId };
  }
  if (existing.length > 0) {
    const first = existing[0];
    const businessId = first.business_id || String(first._id || '').replace(/^business:/, '');
    return { ok: true, created: false, business: first, businessId };
  }

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
    restaurantFormat:
      onboarding.businessType === 'restaurant' ? onboarding.restaurantFormat || 'restaurant' : null,
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
