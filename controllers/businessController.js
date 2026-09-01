import {
  buildBusinessDocument,
  findAccountByUserId,
  findBusinessById,
  listBusinessesByUser,
  normalizePermissionMatrix,
  sanitizeBusiness,
  saveAccount,
  saveBusiness,
  softDeleteDocument,
  verifyPassword,
  BUSINESSES_DB,
} from '../services/couchdb.js';
import { cascadeSoftDeleteBusinessData } from '../services/businessDeleteCascade.js';
import { seedAlertsConfigIfMissing } from './settingsController.js';
import { assertCanCreateBusiness } from '../services/entitlementEnforcement.js';
import { findLikelyDuplicateBusiness, normalizeLinkedBusinessId } from '../shared/billing/onboardingBusiness.js';
import {
  assertBusinessOwner,
  assertBusinessTeamAccess,
  assertBusinessTeamManage,
  assertTenantAccountOwnerSelf,
  canChangeBusinessMemberRole,
  canRemoveBusinessMember,
  isBusinessOwner,
} from '../services/businessAccess.js';
import { getAuthUserId } from '../services/clockinsAccess.js';
import { isVertialSuperAdminEmail } from '../utils/superAdmin.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

export async function createBusiness(req, res) {
  try {
    const { name, legalName, taxId, address, city, phone, email, logo, businessType, restaurantFormat } = req.body || {};
    const { userId } = req.params;

    if (!userId) return badRequest(res, 'Falta userId');
    if (!String(name || '').trim()) return badRequest(res, 'El nombre de la empresa es obligatorio');

    const ownerGate = await assertTenantAccountOwnerSelf(req, userId);
    if (!ownerGate.ok) {
      return res.status(ownerGate.status).json({
        ok: false,
        error: ownerGate.error,
        code: ownerGate.code,
      });
    }

    const actorEmail = req.authUser?.email || '';
    const limitCheck = await assertCanCreateBusiness(req, userId, actorEmail);
    if (!limitCheck.ok) {
      return res.status(limitCheck.status).json({ ok: false, error: limitCheck.error, code: limitCheck.code });
    }

    const existingBusinesses = await listBusinessesByUser(req, userId);
    const duplicate = findLikelyDuplicateBusiness(existingBusinesses, {
      ownerUserId: userId,
      name,
      city,
      taxId,
    });
    if (duplicate) {
      return res.json({ ok: true, business: sanitizeBusiness(duplicate), deduplicated: true });
    }

    const business = buildBusinessDocument({
      ownerUserId: userId,
      name,
      legalName,
      taxId,
      address,
      city,
      phone,
      email,
      logo,
      businessType,
      restaurantFormat: businessType === 'restaurant' ? restaurantFormat : null,
    });

    const saved = await saveBusiness(req, business);
    const businessId = saved._id?.replace(/^business:/, '') || saved._id;
    await seedAlertsConfigIfMissing(req, businessId, saved.businessType || businessType);

    const ownerAccount = await findAccountByUserId(req, userId);
    if (ownerAccount) {
      await saveAccount(req, {
        ...ownerAccount,
        onboardingData: {
          ...(ownerAccount.onboardingData || {}),
          businessId: saved.business_id || businessId,
          suppressAutoProvision: false,
        },
        updatedAt: new Date().toISOString(),
      });
    }

    return res.status(201).json({ ok: true, business: sanitizeBusiness(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al crear la empresa',
    });
  }
}

export async function listBusinesses(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const actorId = getAuthUserId(req);
    if (!actorId) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }
    const requested = String(userId || '').replace(/^account:/, '').trim();
    const isSelf = actorId === requested;
    const isSuper = isVertialSuperAdminEmail(req.authUser?.email);
    if (!isSelf && !isSuper) {
      return res.status(403).json({
        ok: false,
        error: 'Solo puedes listar tus propias empresas',
        code: 'FORBIDDEN_BUSINESS_LIST',
      });
    }

    // Solo empresas donde el userId es dueño o miembro (invitado no ve las otras del titular).
    const businesses = await listBusinessesByUser(req, requested);
    return res.json({ ok: true, businesses: businesses.map(sanitizeBusiness) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al listar empresas',
    });
  }
}

export async function getBusiness(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const access = await assertBusinessTeamAccess(req, businessId);
    if (!access.ok) {
      return res.status(access.status).json({
        ok: false,
        error: access.error,
        code: access.code || 'FORBIDDEN_BUSINESS',
      });
    }

    return res.json({ ok: true, business: sanitizeBusiness(access.business) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al obtener la empresa',
    });
  }
}

export async function updateBusiness(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const ownerGate = await assertBusinessOwner(req, businessId);
    if (!ownerGate.ok) {
      return res.status(ownerGate.status).json({
        ok: false,
        error: ownerGate.error,
        code: ownerGate.code,
      });
    }

    const updates = req.body || {};
    const business = ownerGate.business;

    // No permitir transferir propiedad por esta vía.
    if (
      updates.owner_user_id !== undefined
      && String(updates.owner_user_id || '').trim()
      && String(updates.owner_user_id).trim() !== String(business.owner_user_id || '').trim()
    ) {
      return res.status(403).json({
        ok: false,
        error: 'No se puede transferir la propiedad de la empresa desde aquí',
        code: 'OWNER_ONLY',
      });
    }

    const now = new Date().toISOString();
    const nextBusiness = {
      ...business,
      businessType: updates.businessType !== undefined ? String(updates.businessType || 'carDealership').trim() : (business.businessType || 'carDealership'),
      restaurantFormat: (() => {
        const bt =
          updates.businessType !== undefined
            ? String(updates.businessType || 'carDealership').trim()
            : (business.businessType || 'carDealership');
        if (bt !== 'restaurant') return null;
        if (updates.restaurantFormat !== undefined) {
          const rf = String(updates.restaurantFormat || '').trim();
          return rf || null;
        }
        return business.restaurantFormat || null;
      })(),
      ownDeliveryEnabled: updates.ownDeliveryEnabled !== undefined
        ? Boolean(updates.ownDeliveryEnabled)
        : Boolean(business.ownDeliveryEnabled),
      butcherTargetMarginPct: updates.butcherTargetMarginPct !== undefined
        ? Math.max(0, Math.min(90, Number(updates.butcherTargetMarginPct) || 30))
        : Number(business.butcherTargetMarginPct ?? 30),
      name: updates.name !== undefined ? String(updates.name || '').trim() : business.name,
      legalName: updates.legalName !== undefined ? String(updates.legalName || '').trim() : business.legalName,
      taxId: updates.taxId !== undefined ? String(updates.taxId || '').trim() : business.taxId,
      address: updates.address !== undefined ? String(updates.address || '').trim() : business.address,
      city: updates.city !== undefined ? String(updates.city || '').trim() : business.city,
      phone: updates.phone !== undefined ? String(updates.phone || '').trim() : business.phone,
      email: updates.email !== undefined ? String(updates.email || '').trim().toLowerCase() : business.email,
      logo: updates.logo !== undefined ? String(updates.logo || '').trim() : business.logo,
      updatedAt: now,
    };

    const saved = await saveBusiness(req, nextBusiness);
    return res.json({ ok: true, business: sanitizeBusiness(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al actualizar la empresa',
    });
  }
}

export async function deleteBusiness(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const { password } = req.body || {};
    if (!password) return badRequest(res, 'Debes confirmar tu contraseña para eliminar la empresa');

    const userId = req.authUser?.userId || req.authUser?.user_id;
    if (!userId) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    if (!verifyPassword(password, account.passwordHash)) {
      return res.status(403).json({ ok: false, error: 'La contraseña no es correcta' });
    }

    const ownerGate = await assertBusinessOwner(req, businessId);
    if (!ownerGate.ok) {
      return res.status(ownerGate.status).json({
        ok: false,
        error: ownerGate.error,
        code: ownerGate.code,
      });
    }
    const business = ownerGate.business;

    const deletedBusinessId = business.business_id || String(business._id || '').replace(/^business:/, '');
    const ownerUserId = String(business.owner_user_id || '').trim();

    await softDeleteDocument(req, BUSINESSES_DB, business._id);

    // Cascada: no dejar PDV/cajas/catálogo colgando de la empresa borrada
    let cascade = null;
    try {
      cascade = await cascadeSoftDeleteBusinessData(req, deletedBusinessId, ownerUserId);
    } catch (cascadeErr) {
      console.error('[deleteBusiness] cascade error:', cascadeErr?.message || cascadeErr);
    }

    if (ownerUserId && ownerUserId === userId) {
      const ownerAccount = await findAccountByUserId(req, userId);
      if (ownerAccount) {
        const prevOnboarding = ownerAccount.onboardingData || {};
        await saveAccount(req, {
          ...ownerAccount,
          onboardingData: {
            ...prevOnboarding,
            businessId:
              normalizeLinkedBusinessId(prevOnboarding.businessId) === deletedBusinessId
                ? null
                : prevOnboarding.businessId,
            suppressAutoProvision: true,
          },
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return res.json({ ok: true, cascade: cascade || undefined });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al eliminar la empresa',
    });
  }
}

export async function addMember(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const manageGate = await assertBusinessTeamManage(req, businessId);
    if (!manageGate.ok) {
      return res.status(manageGate.status).json({ ok: false, error: manageGate.error });
    }

    const { user_id, fullName, email, role, permissions } = req.body || {};
    if (!user_id) return badRequest(res, 'Falta user_id del miembro');

    const business = manageGate.business;
    const nextRole = String(role || 'Usuario').trim() || 'Usuario';
    if (!canChangeBusinessMemberRole(business, manageGate.userId, '', nextRole)) {
      return res.status(403).json({
        ok: false,
        error: 'Solo el propietario puede asignar roles de administración',
        code: 'OWNER_ONLY',
      });
    }

    const members = Array.isArray(business.members) ? business.members : [];
    if (members.some((m) => m.user_id === user_id)) {
      return badRequest(res, 'El usuario ya es miembro de esta empresa');
    }

    const now = new Date().toISOString();
    const newMember = {
      user_id: String(user_id || '').trim(),
      fullName: String(fullName || '').trim(),
      email: String(email || '').trim().toLowerCase(),
      role: nextRole,
      permissions: normalizePermissionMatrix(permissions, nextRole),
      joinedAt: now,
    };

    const nextBusiness = {
      ...business,
      members: [...members, newMember],
      updatedAt: now,
    };

    const saved = await saveBusiness(req, nextBusiness);
    return res.json({ ok: true, business: sanitizeBusiness(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al añadir miembro',
    });
  }
}

export async function updateMember(req, res) {
  try {
    const { businessId, memberId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!memberId) return badRequest(res, 'Falta memberId');

    const manageGate = await assertBusinessTeamManage(req, businessId);
    if (!manageGate.ok) {
      return res.status(manageGate.status).json({ ok: false, error: manageGate.error });
    }

    const updates = req.body || {};
    const business = manageGate.business;

    const members = Array.isArray(business.members) ? business.members : [];
    const idx = members.findIndex((m) => m.user_id === memberId);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Miembro no encontrado' });

    const current = members[idx];
    const nextRole = updates.role || current.role;
    if (!canChangeBusinessMemberRole(business, manageGate.userId, current.role, nextRole)) {
      return res.status(403).json({
        ok: false,
        error: 'Solo el propietario puede cambiar roles de administración',
        code: 'OWNER_ONLY',
      });
    }
    const updatedMember = {
      ...current,
      role: nextRole,
      permissions: updates.permissions
        ? normalizePermissionMatrix(updates.permissions, nextRole)
        : current.permissions,
    };

    const nextMembers = [...members];
    nextMembers[idx] = updatedMember;

    const nextBusiness = { ...business, members: nextMembers, updatedAt: new Date().toISOString() };
    const saved = await saveBusiness(req, nextBusiness);
    return res.json({ ok: true, business: sanitizeBusiness(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al actualizar miembro',
    });
  }
}

export async function removeMember(req, res) {
  try {
    const { businessId, memberId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!memberId) return badRequest(res, 'Falta memberId');

    const manageGate = await assertBusinessTeamManage(req, businessId);
    if (!manageGate.ok) {
      return res.status(manageGate.status).json({ ok: false, error: manageGate.error });
    }
    const business = manageGate.business;

    if (isBusinessOwner(business, memberId)) {
      return badRequest(res, 'No puedes eliminar al propietario de la empresa');
    }
    if (!canRemoveBusinessMember(business, manageGate.userId, memberId)) {
      return res.status(403).json({
        ok: false,
        error: 'Solo el propietario puede expulsar a un Admin u otro rol de administración',
        code: 'OWNER_ONLY',
      });
    }

    const members = Array.isArray(business.members) ? business.members : [];
    const nextBusiness = {
      ...business,
      members: members.filter((m) => m.user_id !== memberId),
      updatedAt: new Date().toISOString(),
    };

    const saved = await saveBusiness(req, nextBusiness);
    return res.json({ ok: true, business: sanitizeBusiness(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al eliminar miembro',
    });
  }
}
