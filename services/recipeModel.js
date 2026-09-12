import { v4 as uuidv4 } from 'uuid';
import {
  getCatalogDbName,
  ensureDatabase,
  getAllDocuments,
  findDocuments,
  ensureIndex,
} from './couchdb.js';

const recipeCatalogItemIndexReady = new Set();

async function ensureRecipeCatalogItemIndex(req, dbName) {
  if (recipeCatalogItemIndexReady.has(dbName)) return;
  const safeDb = String(dbName || '').replace(/[^a-z0-9]+/g, '-');
  await ensureIndex(
    req,
    dbName,
    ['type', 'user_id', 'catalogItemId'],
    `idx-${safeDb}-recipe-catalog-item`,
  ).catch(() => null);
  recipeCatalogItemIndexReady.add(dbName);
}

const VALID_RECIPE_STOCK_CATEGORIES = ['ingredient', 'beverage', 'packaging', 'cleaning', 'consumable', 'other'];

export function buildRecipeDocument(userId, data = {}, existing = null) {
  const now = new Date().toISOString();
  const id = existing?._id || `recipe-${uuidv4()}`;

  const sanitizeIngredients = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.filter(a => a && a.catalogItemId).map(a => {
      const quantity = Math.max(0, Number(a.quantity || 0));
      const wastePercent = Math.min(100, Math.max(0, Number(a.wastePercent || 0)));
      // La cantidad física de receta es la que sale de stock. La merma solo incrementa coste.
      const netQuantity = quantity;
      const costPerUnit = Number(a.costPerUnit || 0);
      const stockCategory = VALID_RECIPE_STOCK_CATEGORIES.includes(a.stockCategory)
        ? a.stockCategory
        : 'ingredient';
      const costWastePercent = stockCategory === 'packaging' ? 0 : wastePercent;
      const totalCost = quantity * costPerUnit * (1 + costWastePercent / 100);
      return {
        catalogItemId: String(a.catalogItemId),
        catalogItemName: String(a.catalogItemName || ''),
        quantity,
        unit: String(a.unit || 'ud'),
        wastePercent,
        netQuantity: Math.round(netQuantity * 10000) / 10000,
        costPerUnit,
        totalCost: Math.round(totalCost * 100) / 100,
        stockCategory,
        optional: Boolean(a.optional),
        substitutes: Array.isArray(a.substitutes)
          ? a.substitutes.filter(s => s && s.catalogItemId).map(s => ({
              catalogItemId: String(s.catalogItemId),
              catalogItemName: String(s.catalogItemName || ''),
              conversionFactor: Number(s.conversionFactor || 1),
            }))
          : [],
      };
    });
  };

  const ingredients = sanitizeIngredients(data.ingredients ?? existing?.ingredients);
  const portions = Math.max(1, Number(data.portions ?? existing?.portions ?? 1));
  const totalCost = ingredients.reduce((sum, i) => sum + i.totalCost, 0);
  const costPerPortion = portions > 0 ? Math.round((totalCost / portions) * 100) / 100 : 0;

  return {
    _id: id,
    _rev: existing?._rev,
    type: 'recipe',
    id,
    user_id: userId,
    name: String(data.name || existing?.name || ''),
    catalogItemId: String(data.catalogItemId || existing?.catalogItemId || ''),
    catalogItemName: String(data.catalogItemName || existing?.catalogItemName || ''),
    category: String(data.category || existing?.category || ''),
    portions,
    businessId: String(
      data.businessId || data.business_id || existing?.businessId || existing?.business_id || '',
    ).replace(/^business:/, '').trim(),
    business_id: String(
      data.businessId || data.business_id || existing?.businessId || existing?.business_id || '',
    ).replace(/^business:/, '').trim(),
    workCenterId: String(data.workCenterId || existing?.workCenterId || '').trim(),
    salesPointId: String(data.salesPointId || existing?.salesPointId || '').trim(),
    active: data.active !== undefined ? Boolean(data.active) : (existing?.active ?? true),
    ingredients,
    totalCost: Math.round(totalCost * 100) / 100,
    costPerPortion,
    notes: String(data.notes || existing?.notes || ''),
    preparationTime: Number(data.preparationTime || existing?.preparationTime || 0),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : (existing?.tags || []),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function sanitizeRecipe(doc) {
  if (!doc) return null;
  const ingredients = Array.isArray(doc.ingredients) ? doc.ingredients.map(i => ({
    catalogItemId: i.catalogItemId || '',
    catalogItemName: i.catalogItemName || '',
    quantity: Number(i.quantity || 0),
    unit: i.unit || 'ud',
    wastePercent: Number(i.wastePercent || 0),
    netQuantity: Number(i.netQuantity || 0),
    costPerUnit: Number(i.costPerUnit || 0),
    totalCost: Number(i.totalCost || 0),
    stockCategory: i.stockCategory || 'ingredient',
    optional: Boolean(i.optional),
    substitutes: Array.isArray(i.substitutes) ? i.substitutes : [],
  })) : [];
  return {
    _id: doc._id,
    _rev: doc._rev,
    type: 'recipe',
    id: doc._id,
    user_id: doc.user_id,
    name: doc.name || '',
    catalogItemId: doc.catalogItemId || '',
    catalogItemName: doc.catalogItemName || '',
    category: doc.category || '',
    portions: Number(doc.portions || 1),
    businessId: doc.businessId || doc.business_id || undefined,
    workCenterId: doc.workCenterId || '',
    salesPointId: doc.salesPointId || '',
    active: doc.active !== undefined ? Boolean(doc.active) : true,
    ingredients,
    totalCost: Number(doc.totalCost || 0),
    costPerPortion: Number(doc.costPerPortion || 0),
    notes: doc.notes || '',
    preparationTime: Number(doc.preparationTime || 0),
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    deletedAt: doc.deletedAt || null,
  };
}

export async function listRecipesByUser(req, userId) {
  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  const docs = await getAllDocuments(req, db);
  return docs
    .filter((doc) => doc?.type === 'recipe' && !doc?.deletedAt && doc?.user_id === userId)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
}

export async function findRecipeByCatalogItem(req, userId, catalogItemId) {
  const uid = String(userId || '').trim();
  const cid = String(catalogItemId || '').trim();
  if (!uid || !cid) return [];

  const db = getCatalogDbName();
  await ensureDatabase(req, db);
  await ensureRecipeCatalogItemIndex(req, db);

  let docs;
  try {
    docs = await findDocuments(
      req,
      db,
      { type: 'recipe', user_id: uid, catalogItemId: cid },
      { pageSize: 50, maxDocs: 50 },
    );
  } catch {
    docs = [];
  }

  return docs.filter(
    (doc) =>
      doc?.type === 'recipe' &&
      !doc?.deletedAt &&
      doc?.user_id === uid &&
      doc?.catalogItemId === cid,
  );
}
