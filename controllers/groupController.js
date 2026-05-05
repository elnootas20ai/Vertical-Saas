import {
  buildBranchObject,
  buildGroupDocument,
  findBusinessById,
  findGroupById,
  listGroupsByUser,
  sanitizeBusiness,
  sanitizeGroup,
  saveBusiness,
  saveGroup,
  softDeleteDocument,
  BUSINESSES_DB,
  GROUPS_DB,
  getAllDocuments,
  ensureDatabase,
  couchRequest,
} from '../services/couchdb.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

// ─── Group CRUD ───────────────────────────────────────────────────────────────

export async function createGroup(req, res) {
  try {
    const { userId } = req.params;
    const { name, description, logo } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!String(name || '').trim()) return badRequest(res, 'El nombre del grupo es obligatorio');

    const group = buildGroupDocument({ ownerUserId: userId, name, description, logo });
    const saved = await saveGroup(req, group);
    return res.status(201).json({ ok: true, group: sanitizeGroup(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al crear el grupo',
    });
  }
}

export async function listGroups(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const groups = await listGroupsByUser(req, userId);
    return res.json({ ok: true, groups: groups.map(sanitizeGroup) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al listar grupos',
    });
  }
}

export async function getGroup(req, res) {
  try {
    const { groupId } = req.params;
    if (!groupId) return badRequest(res, 'Falta groupId');

    const group = await findGroupById(req, groupId);
    if (!group) return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });

    return res.json({ ok: true, group: sanitizeGroup(group) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al obtener el grupo',
    });
  }
}

export async function updateGroup(req, res) {
  try {
    const { groupId } = req.params;
    if (!groupId) return badRequest(res, 'Falta groupId');

    const updates = req.body || {};
    const group = await findGroupById(req, groupId);
    if (!group) return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });

    const nextGroup = {
      ...group,
      name: updates.name !== undefined ? String(updates.name || '').trim() : group.name,
      description: updates.description !== undefined ? String(updates.description || '').trim() : group.description,
      logo: updates.logo !== undefined ? String(updates.logo || '').trim() : group.logo,
      updatedAt: new Date().toISOString(),
    };

    const saved = await saveGroup(req, nextGroup);
    return res.json({ ok: true, group: sanitizeGroup(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al actualizar el grupo',
    });
  }
}

export async function deleteGroup(req, res) {
  try {
    const { groupId } = req.params;
    if (!groupId) return badRequest(res, 'Falta groupId');

    const group = await findGroupById(req, groupId);
    if (!group) return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });

    await softDeleteDocument(req, GROUPS_DB, group._id);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al eliminar el grupo',
    });
  }
}

// ─── Group ↔ Business linkage ─────────────────────────────────────────────────

export async function addBusinessToGroup(req, res) {
  try {
    const { groupId } = req.params;
    const { businessId } = req.body || {};

    if (!groupId) return badRequest(res, 'Falta groupId');
    if (!businessId) return badRequest(res, 'Falta businessId');

    const [group, business] = await Promise.all([
      findGroupById(req, groupId),
      findBusinessById(req, businessId),
    ]);

    if (!group) return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const businessIds = Array.isArray(group.business_ids) ? group.business_ids : [];
    if (businessIds.includes(businessId)) {
      return badRequest(res, 'La empresa ya pertenece a este grupo');
    }

    const now = new Date().toISOString();
    const nextGroup = {
      ...group,
      business_ids: [...businessIds, businessId],
      updatedAt: now,
    };
    const nextBusiness = { ...business, group_id: groupId, updatedAt: now };

    const [savedGroup, savedBusiness] = await Promise.all([
      saveGroup(req, nextGroup),
      saveBusiness(req, nextBusiness),
    ]);

    return res.json({
      ok: true,
      group: sanitizeGroup(savedGroup),
      business: sanitizeBusiness(savedBusiness),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al añadir empresa al grupo',
    });
  }
}

export async function removeBusinessFromGroup(req, res) {
  try {
    const { groupId, businessId } = req.params;

    if (!groupId) return badRequest(res, 'Falta groupId');
    if (!businessId) return badRequest(res, 'Falta businessId');

    const [group, business] = await Promise.all([
      findGroupById(req, groupId),
      findBusinessById(req, businessId),
    ]);

    if (!group) return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const now = new Date().toISOString();
    const nextGroup = {
      ...group,
      business_ids: (Array.isArray(group.business_ids) ? group.business_ids : []).filter((id) => id !== businessId),
      updatedAt: now,
    };
    const nextBusiness = { ...business, group_id: null, updatedAt: now };

    const [savedGroup, savedBusiness] = await Promise.all([
      saveGroup(req, nextGroup),
      saveBusiness(req, nextBusiness),
    ]);

    return res.json({
      ok: true,
      group: sanitizeGroup(savedGroup),
      business: sanitizeBusiness(savedBusiness),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al quitar empresa del grupo',
    });
  }
}

// ─── Group admins ─────────────────────────────────────────────────────────────

export async function addGroupAdmin(req, res) {
  try {
    const { groupId } = req.params;
    const { user_id, fullName, email, role } = req.body || {};

    if (!groupId) return badRequest(res, 'Falta groupId');
    if (!user_id) return badRequest(res, 'Falta user_id');

    const group = await findGroupById(req, groupId);
    if (!group) return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });

    const admins = Array.isArray(group.admins) ? group.admins : [];
    if (admins.some((a) => a.user_id === user_id)) {
      return badRequest(res, 'El usuario ya es administrador de este grupo');
    }

    const now = new Date().toISOString();
    const newAdmin = {
      user_id: String(user_id || '').trim(),
      fullName: String(fullName || '').trim(),
      email: String(email || '').trim().toLowerCase(),
      role: String(role || 'GerenteGrupo').trim(),
      joinedAt: now,
    };

    const nextGroup = { ...group, admins: [...admins, newAdmin], updatedAt: now };
    const saved = await saveGroup(req, nextGroup);
    return res.json({ ok: true, group: sanitizeGroup(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al añadir administrador',
    });
  }
}

export async function removeGroupAdmin(req, res) {
  try {
    const { groupId, adminId } = req.params;

    if (!groupId) return badRequest(res, 'Falta groupId');
    if (!adminId) return badRequest(res, 'Falta adminId');

    const group = await findGroupById(req, groupId);
    if (!group) return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });

    if (group.owner_user_id === adminId) {
      return badRequest(res, 'No puedes eliminar al propietario del grupo');
    }

    const nextGroup = {
      ...group,
      admins: (Array.isArray(group.admins) ? group.admins : []).filter((a) => a.user_id !== adminId),
      updatedAt: new Date().toISOString(),
    };

    const saved = await saveGroup(req, nextGroup);
    return res.json({ ok: true, group: sanitizeGroup(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al eliminar administrador',
    });
  }
}

// ─── Branch (sede) management on Business ────────────────────────────────────

export async function addBranch(req, res) {
  try {
    const { businessId } = req.params;
    const { name, address, city, phone, managerUserId } = req.body || {};

    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!String(name || '').trim()) return badRequest(res, 'El nombre de la sede es obligatorio');

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const branch = buildBranchObject({ name, address, city, phone, managerUserId });
    const branches = Array.isArray(business.branches) ? business.branches : [];

    const nextBusiness = {
      ...business,
      branches: [...branches, branch],
      updatedAt: new Date().toISOString(),
    };

    const saved = await saveBusiness(req, nextBusiness);
    return res.status(201).json({ ok: true, business: sanitizeBusiness(saved), branch });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al crear la sede',
    });
  }
}

export async function updateBranch(req, res) {
  try {
    const { businessId, branchId } = req.params;
    const updates = req.body || {};

    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!branchId) return badRequest(res, 'Falta branchId');

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const branches = Array.isArray(business.branches) ? business.branches : [];
    const idx = branches.findIndex((b) => b.branch_id === branchId);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Sede no encontrada' });

    const current = branches[idx];
    const updatedBranch = {
      ...current,
      name: updates.name !== undefined ? String(updates.name || '').trim() : current.name,
      address: updates.address !== undefined ? String(updates.address || '').trim() : current.address,
      city: updates.city !== undefined ? String(updates.city || '').trim() : current.city,
      phone: updates.phone !== undefined ? String(updates.phone || '').trim() : current.phone,
      managerUserId: updates.managerUserId !== undefined ? String(updates.managerUserId || '').trim() : current.managerUserId,
    };

    const nextBranches = [...branches];
    nextBranches[idx] = updatedBranch;

    const nextBusiness = { ...business, branches: nextBranches, updatedAt: new Date().toISOString() };
    const saved = await saveBusiness(req, nextBusiness);
    return res.json({ ok: true, business: sanitizeBusiness(saved), branch: updatedBranch });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al actualizar la sede',
    });
  }
}

export async function deleteBranch(req, res) {
  try {
    const { businessId, branchId } = req.params;

    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!branchId) return badRequest(res, 'Falta branchId');

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const branches = Array.isArray(business.branches) ? business.branches : [];
    const nextBusiness = {
      ...business,
      branches: branches.filter((b) => b.branch_id !== branchId),
      members: (Array.isArray(business.members) ? business.members : []).map((m) =>
        m.branch_id === branchId ? { ...m, branch_id: null } : m,
      ),
      updatedAt: new Date().toISOString(),
    };

    const saved = await saveBusiness(req, nextBusiness);
    return res.json({ ok: true, business: sanitizeBusiness(saved) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al eliminar la sede',
    });
  }
}

// ─── Consolidated Group KPIs (G-01) ──────────────────────────────────────────

export async function getGroupKpis(req, res) {
  try {
    const { groupId } = req.params;
    if (!groupId) return badRequest(res, 'Falta groupId');

    const group = await findGroupById(req, groupId);
    if (!group) return res.status(404).json({ ok: false, error: 'Grupo no encontrado' });

    const businessIds = Array.isArray(group.business_ids) ? group.business_ids : [];

    function normalizeDbName(name) {
      return String(name || '').toLowerCase().replace(/[^a-z0-9_$()+/-]/g, '_');
    }

    const vehiclesDb = 'vehicles';
    const salesDb = normalizeDbName(
      process.env.VITE_SALES_DB || `${process.env.VITE_COUCHDB_DB || 'vertial'}-sales`,
    );
    const leadsDb = normalizeDbName(
      process.env.VITE_CRM_LEADS_DB || `${process.env.VITE_COUCHDB_DB || 'vertial'}-leads`,
    );

    async function fetchAllDocs(dbName) {
      const resp = await couchRequest(req, `/${encodeURIComponent(dbName)}/_all_docs?include_docs=true`);
      if (!resp.ok) return [];
      const body = await resp.json().catch(() => ({ rows: [] }));
      return (body.rows || [])
        .map((row) => row.doc)
        .filter((d) => d && !String(d._id || '').startsWith('_design/'));
    }

    const [vehicleDocs, leadDocs, saleDocs] = await Promise.all([
      fetchAllDocs(vehiclesDb).catch(() => []),
      fetchAllDocs(leadsDb).catch(() => []),
      fetchAllDocs(salesDb).catch(() => []),
    ]);

    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const groupVehicles = vehicleDocs.filter(
      (v) => v.active !== false && v.type === 'car' && businessIds.includes(v.business_id),
    );
    const groupLeads = leadDocs.filter(
      (l) => l.type === 'lead' && businessIds.includes(l.business_id),
    );
    const groupSales = saleDocs.filter((s) => businessIds.includes(s.business_id));

    const stockCount = groupVehicles.filter((v) => v.status === 'available').length;
    const reservedCount = groupVehicles.filter((v) => v.status === 'reserved').length;
    const totalVehicles = groupVehicles.length;
    const enPreparacion = groupVehicles.filter((v) => v.status === 'preparation').length;

    const soldThisMonth = groupVehicles.filter((v) => {
      if (v.status !== 'sold' || !v.soldAt) return false;
      return String(v.soldAt) >= firstOfMonth;
    });

    const salesVolume = soldThisMonth.reduce((s, v) => s + Number(v.salePrice || 0), 0);
    const marginTotal = soldThisMonth.reduce(
      (s, v) => s + (Number(v.salePrice || 0) - Number(v.purchasePrice || 0)),
      0,
    );
    const marginPct = salesVolume > 0 ? Math.round((marginTotal / salesVolume) * 100) : 0;

    const pendingSales = groupSales.filter((s) => s.status === 'pending');
    const cobrosPendientes = pendingSales.reduce((sum, s) => sum + Number(s.totalAmount || s.salePrice || 0), 0);
    const cobrosCount = pendingSales.length;
    const oportunidades = groupLeads.filter((l) => l.status !== 'won' && l.status !== 'lost').length;

    const funnelStages = ['new', 'contacted', 'appointment', 'reserved', 'negotiation', 'won', 'lost'];
    const funnel = {};
    funnelStages.forEach((stage) => {
      funnel[stage] = groupLeads.filter((l) => l.status === stage).length;
    });

    const kpisByBusiness = businessIds.map((bId) => {
      const bVehicles = groupVehicles.filter((v) => v.business_id === bId);
      const bSoldThisMonth = bVehicles.filter((v) => v.status === 'sold' && String(v.soldAt || '') >= firstOfMonth);
      return {
        business_id: bId,
        stockCount: bVehicles.filter((v) => v.status === 'available').length,
        totalVehicles: bVehicles.length,
        soldThisMonthCount: bSoldThisMonth.length,
        salesVolume: bSoldThisMonth.reduce((s, v) => s + Number(v.salePrice || 0), 0),
        marginTotal: bSoldThisMonth.reduce(
          (s, v) => s + (Number(v.salePrice || 0) - Number(v.purchasePrice || 0)),
          0,
        ),
      };
    });

    return res.json({
      ok: true,
      group: sanitizeGroup(group),
      kpis: {
        stockCount,
        reservedCount,
        totalVehicles,
        enPreparacion,
        soldThisMonthCount: soldThisMonth.length,
        salesVolume,
        marginTotal,
        marginPct,
        cobrosPendientes,
        cobrosCount,
        oportunidades,
      },
      funnel,
      kpisByBusiness,
      updatedAt: now.toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al calcular KPIs del grupo',
    });
  }
}
