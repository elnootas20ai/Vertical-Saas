import {
  getCatalogDbName,
  buildBrandDocument,
  sanitizeBrand,
  listBrandsByBusiness,
  findBusinessById,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  buildBrandBillingConfigDocument,
  sanitizeBrandBillingConfig,
  getBrandBillingConfigDoc,
} from '../services/couchdb.js';
import { isDefaultCommercialBrandName } from '../shared/brand/constants.js';
import { assertCanCreateCommercialBrand } from '../services/entitlementEnforcement.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureBrandOwner(req, businessId, brandId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, brandId);
  if (!doc || doc.type !== 'brand' || doc.business_id !== businessId || doc.deletedAt) return null;
  return doc;
}

export async function listBrands(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const brands = await listBrandsByBusiness(req, businessId);
    return res.json({ ok: true, brands: brands.map(sanitizeBrand) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cargar marcas',
    });
  }
}

export async function createBrand(req, res) {
  try {
    const { businessId } = req.params;
    const { brand } = req.body || {};

    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!brand || typeof brand !== 'object') return badRequest(res, 'Falta el objeto brand en el body');
    if (!String(brand.name || '').trim()) return badRequest(res, 'El nombre de la marca es obligatorio');

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const actorEmail = req.authUser?.email || '';
    const limitCheck = await assertCanCreateCommercialBrand(req, businessId, brand, actorEmail);
    if (!limitCheck.ok) {
      return res.status(limitCheck.status).json({ ok: false, error: limitCheck.error, code: limitCheck.code });
    }

    const userId = req.authUser?.userId || req.authUser?.user_id || '';
    const db = getCatalogDbName();
    await ensureDatabase(req, db);

    const doc = buildBrandDocument(businessId, userId, brand);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.status(201).json({ ok: true, brand: sanitizeBrand({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al crear marca',
    });
  }
}

export async function updateBrand(req, res) {
  try {
    const { businessId, brandId } = req.params;
    const { brand } = req.body || {};

    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!brandId) return badRequest(res, 'Falta brandId');
    if (!brand || typeof brand !== 'object') return badRequest(res, 'Faltan datos de la marca');

    const existing = await ensureBrandOwner(req, businessId, brandId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Marca no encontrada' });

    const userId = req.authUser?.userId || req.authUser?.user_id || existing.user_id;
    const db = getCatalogDbName();
    const doc = buildBrandDocument(businessId, userId, { ...existing, ...brand }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, brand: sanitizeBrand({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al actualizar marca',
    });
  }
}

export async function deleteBrand(req, res) {
  try {
    const { businessId, brandId } = req.params;

    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!brandId) return badRequest(res, 'Falta brandId');

    const existing = await ensureBrandOwner(req, businessId, brandId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Marca no encontrada' });
    if (existing.isDefault || isDefaultCommercialBrandName(existing.name)) {
      return badRequest(res, 'La línea «General» no se puede eliminar');
    }

    const db = getCatalogDbName();
    await softDeleteDocument(req, db, brandId);

    return res.json({ ok: true, id: brandId });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al eliminar marca',
    });
  }
}

export async function getBrandBillingConfig(req, res) {
  try {
    const { businessId } = req.params;
    if (!businessId) return badRequest(res, 'Falta businessId');

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const existing = await getBrandBillingConfigDoc(req, businessId);
    if (!existing) {
      const empty = buildBrandBillingConfigDocument(businessId, { sheets: [] });
      return res.json({ ok: true, config: sanitizeBrandBillingConfig(empty) });
    }
    return res.json({ ok: true, config: sanitizeBrandBillingConfig(existing) });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al cargar facturación de marcas',
    });
  }
}

export async function putBrandBillingConfig(req, res) {
  try {
    const { businessId } = req.params;
    const { config } = req.body || {};
    if (!businessId) return badRequest(res, 'Falta businessId');
    if (!config || typeof config !== 'object') return badRequest(res, 'Falta config');

    const business = await findBusinessById(req, businessId);
    if (!business) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const db = getCatalogDbName();
    await ensureDatabase(req, db);

    const writeOnce = async (existing) => {
      const doc = buildBrandBillingConfigDocument(businessId, config, existing);
      if (!doc._rev) delete doc._rev;
      const saved = await putDocument(req, db, doc._id, doc);
      return sanitizeBrandBillingConfig({ ...doc, _rev: saved.rev });
    };

    let existing = await getBrandBillingConfigDoc(req, businessId);
    try {
      const out = await writeOnce(existing);
      return res.json({ ok: true, config: out });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || '');
      if (!/conflict/i.test(msg)) throw err;
      const fresh = await getDocument(req, db, existing?._id || `brand-billing-${businessId}`);
      const out = await writeOnce(fresh && fresh.type === 'brand_billing_config' ? fresh : null);
      return res.json({ ok: true, config: out });
    }
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error al guardar facturación de marcas',
    });
  }
}
