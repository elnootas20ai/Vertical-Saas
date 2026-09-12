import { findAccountByUserId, findBusinessById } from '../services/couchdb.js';
import { accountHasRestaurantFeature } from '../shared/billing/restaurantPlanFeatures.js';

export function requireRestaurantPlanFeature(featureId) {
  return async function restaurantPlanFeatureMiddleware(req, res, next) {
    try {
      const businessId = String(req.params?.businessId || '').replace(/^business:/, '').trim();
      const business = req.businessAccess?.business
        || await findBusinessById(req, businessId);
      if (!business) {
        return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });
      }
      if (String(business.businessType || '').trim() !== 'restaurant') return next();

      const ownerUserId = String(business.owner_user_id || business.user_id || '').trim();
      const account = await findAccountByUserId(req, ownerUserId).catch(() => null);
      if (!accountHasRestaurantFeature(account, featureId)) {
        return res.status(403).json({
          ok: false,
          error: 'Esta función requiere el plan Pro',
          code: 'PLAN_FEATURE_REQUIRED',
          requiredPlan: 'pro',
          featureId,
        });
      }
      return next();
    } catch {
      return res.status(403).json({
        ok: false,
        error: 'No se pudo validar el acceso de tu plan',
        code: 'PLAN_ACCESS_CHECK_FAILED',
      });
    }
  };
}
