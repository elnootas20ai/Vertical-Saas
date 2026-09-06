import logger from './logger.js';
import {
  findBusinessById,
  listCatalogItemsByUser,
  listOwnerBusinessesForUser,
} from './couchdb.js';
import {
  getUberEatsAppAccessToken,
  updateUberEatsMenuItem,
  uploadUberEatsMenu,
} from './uberEatsApi.js';

function ml(text) {
  const value = String(text || '').trim() || 'Item';
  return { translations: { es_es: value, en_us: value } };
}

function moneyCents(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function itemVisibleOnUber(item) {
  if (!item || item.deletedAt) return false;
  if (item.active === false || item.available === false) return false;
  const channels = Array.isArray(item.salesChannels) ? item.salesChannels : [];
  if (!channels.length) return true;
  return channels.some((ch) => {
    const id = String(ch.channelId || ch.id || '').toLowerCase();
    const name = String(ch.channelName || ch.name || '').toLowerCase();
    return id.includes('uber') || name.includes('uber');
  });
}

function uberPriceForItem(item) {
  const channels = Array.isArray(item.salesChannels) ? item.salesChannels : [];
  const uberCh = channels.find((ch) => {
    const id = String(ch.channelId || ch.id || '').toLowerCase();
    const name = String(ch.channelName || ch.name || '').toLowerCase();
    return id.includes('uber') || name.includes('uber');
  });
  if (uberCh?.customPrice != null && Number.isFinite(Number(uberCh.customPrice))) {
    return moneyCents(uberCh.customPrice);
  }
  return moneyCents(item.unitPrice);
}

/**
 * Construye MenuConfiguration v2 a partir del catálogo Vertial.
 */
export function buildUberMenuFromCatalogItems(items = [], { storeName = 'Menu' } = {}) {
  const visible = (Array.isArray(items) ? items : []).filter(itemVisibleOnUber);
  const byCategory = new Map();
  for (const item of visible) {
    const cat = String(item.category || 'general').trim() || 'general';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(item);
  }

  const categories = [];
  const menuItems = [];
  const categoryIds = [];

  for (const [catName, catItems] of byCategory.entries()) {
    const catId = `cat-${catName}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 64);
    categoryIds.push(catId);
    const entityIds = [];
    for (const item of catItems) {
      const itemId = String(item.sku || item.id || item._id || '').trim();
      if (!itemId) continue;
      entityIds.push(itemId);
      menuItems.push({
        id: itemId,
        title: ml(item.name || itemId),
        description: item.description ? ml(item.description) : undefined,
        price_info: { price: uberPriceForItem(item) },
        tax_info: {
          tax_rate: Number.isFinite(Number(item.taxRate)) ? Number(item.taxRate) / 100 : 0.1,
        },
        dish_info: {
          classifications: {
            alcoholic_items: 0,
          },
        },
      });
    }
    categories.push({
      id: catId,
      title: ml(catName),
      entities: entityIds.map((id) => ({ id, type: 'ITEM' })),
    });
  }

  const menuId = 'vertial-main';
  const allDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  return {
    menus: [
      {
        id: menuId,
        title: ml(storeName || 'Menu Vertial'),
        service_availability: allDays.map((day_of_week) => ({
          day_of_week,
          time_periods: [{ start_time: '00:00', end_time: '23:59' }],
        })),
        category_ids: categoryIds,
      },
    ],
    categories,
    items: menuItems,
    modifier_groups: [],
    display_options: {},
  };
}

export async function pushUberMenuFromCatalog(req, {
  businessId,
  storeId,
  storeName = '',
}) {
  if (!businessId) throw new Error('Falta businessId');
  if (!storeId) throw new Error('Falta storeId');
  const business = await findBusinessById(req, businessId).catch(() => null);
  const catalogOwnerId = String(
    business?.owner_user_id || business?.user_id || businessId || '',
  ).trim();
  const ownerBusinesses = await listOwnerBusinessesForUser(req, catalogOwnerId).catch(() => []);
  const ownerHasMultipleBusinesses = ownerBusinesses.filter((entry) => !entry.deletedAt).length > 1;
  const ownerItems = await listCatalogItemsByUser(req, catalogOwnerId, { module: 'catalog' });
  const items = ownerItems.filter((item) => {
    const itemBusinessId = String(item.business_id || item.businessId || '').trim();
    if (itemBusinessId) return itemBusinessId === businessId;
    // Catálogo legacy sin business_id solo es inequívoco con una única empresa.
    return !ownerHasMultipleBusinesses;
  });
  const menu = buildUberMenuFromCatalogItems(items, { storeName: storeName || 'Menu Vertial' });
  if (!menu.items.length) {
    throw new Error('No hay productos de catálogo activos para subir a Uber Eats');
  }
  const { accessToken } = await getUberEatsAppAccessToken();
  await uploadUberEatsMenu(accessToken, storeId, menu);
  logger.info(
    { businessId, catalogOwnerId, storeId, items: menu.items.length, categories: menu.categories.length },
    'Uber menu uploaded from Vertial catalog',
  );
  return {
    ok: true,
    storeId,
    itemCount: menu.items.length,
    categoryCount: menu.categories.length,
  };
}

export async function setUberMenuItemSuspension(storeId, itemId, suspended) {
  const { accessToken } = await getUberEatsAppAccessToken();
  await updateUberEatsMenuItem(accessToken, storeId, itemId, {
    suspension_info: suspended
      ? { suspension: { suspend_until: -1, reason: 'OUT_OF_STOCK' } }
      : { suspension: null },
  });
  return { ok: true, storeId, itemId, suspended: Boolean(suspended) };
}
