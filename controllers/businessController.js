import {
  buildBusinessDocument,
  buildDefaultPermissionMatrix,
  findAccountByUserId,
  findBusinessById,
  listBusinessesByUser,
  normalizePermissionMatrix,
  sanitizeBusiness,
  saveBusiness,
  softDeleteDocument,
  verifyPassword,
  BUSINESSES_DB,
} from '../services/couchdb.js';
import { seedAlertsConfigIfMissing } from './settingsController.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

export async function createBusiness(req, res) {
  try {
    const { name, legalName, taxId, address, city, phone, email, logo, businessType } = req.body || {};
    const { userId } = req.params;

    if (!userId) return badRequest(res, 'Falta userId');
    if (!String(name || '').trim()) return badRequest(res, 'El nombre de la empresa es obligatorio');

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
    });

    const saved = await saveBusiness(req, business);
    const businessId = saved._id?.replace(/^business:/, '') || saved._id;
    await seedAlertsConfigIfMissing(req, businessId, saved.businessType || businessType);
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

    const businesses = await listBusinessesByUser(req, userId);
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

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    return res.json({ ok: true, business: sanitizeBusiness(business) });
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

    const updates = req.body || {};
    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const now = new Date().toISOString();
    const nextBusiness = {
      ...business,
      businessType: updates.businessType !== undefined ? String(updates.businessType || 'carDealership').trim() : (business.businessType || 'carDealership'),
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

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    await softDeleteDocument(req, BUSINESSES_DB, business._id);
    return res.json({ ok: true });
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

    const { user_id, fullName, email, role, permissions } = req.body || {};
    if (!user_id) return badRequest(res, 'Falta user_id del miembro');

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const members = Array.isArray(business.members) ? business.members : [];
    if (members.some((m) => m.user_id === user_id)) {
      return badRequest(res, 'El usuario ya es miembro de esta empresa');
    }

    const now = new Date().toISOString();
    const newMember = {
      user_id: String(user_id || '').trim(),
      fullName: String(fullName || '').trim(),
      email: String(email || '').trim().toLowerCase(),
      role: String(role || 'Usuario').trim() || 'Usuario',
      permissions: normalizePermissionMatrix(permissions, role || 'Usuario'),
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

    const updates = req.body || {};
    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const members = Array.isArray(business.members) ? business.members : [];
    const idx = members.findIndex((m) => m.user_id === memberId);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Miembro no encontrado' });

    const current = members[idx];
    const nextRole = updates.role || current.role;
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

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    if (business.owner_user_id === memberId) {
      return badRequest(res, 'No puedes eliminar al propietario de la empresa');
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
