import { v4 as uuidv4 } from 'uuid';
import {
  ensureDatabase,
  getAllDocuments,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  getDeliveryDbName,
  getClientsDbName,
  listDeliveryOrdersByUser,
  listClientsByUser,
  listBusinessesByUser,
  listScopedPointsOfSaleForBusiness,
  sanitizeDeliveryOrder,
  sanitizeClient,
} from '../services/couchdb.js';
import { orderMatchesBusinessPdvs } from './deliveryController.js';

const DELIVERY_CRM_DB = 'delivery-crm';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

function normalizeBusinessScopeId(value) {
  return String(value || '').replace(/^business:/, '').trim();
}

async function resolveDeliveryCrmScope(req, userId) {
  const businessId = normalizeBusinessScopeId(req.query?.businessId || req.query?.business_id || '');
  if (!businessId) return { businessId: '', listOptions: {}, businessPdvs: null };
  const businesses = await listBusinessesByUser(req, userId);
  const count = businesses.filter((b) => !b?.deletedAt).length;
  const listOptions = { businessId, legacySingleBusiness: count <= 1 };
  const businessPdvs = await listScopedPointsOfSaleForBusiness(req, userId, businessId, {
    includeInactive: true,
  });
  return { businessId, listOptions, businessPdvs };
}

async function filterOrdersForBusinessScope(req, userId, orders, scope) {
  if (!scope.businessId) return orders;
  if (scope.businessPdvs && scope.businessPdvs.length > 0) {
    return orders.filter((o) => orderMatchesBusinessPdvs(o, scope.businessPdvs));
  }
  return [];
}

// ─── ANALYTICS: métricas cruzadas pedidos × clientes ─────────────────────────

export async function getDeliveryCrmDashboard(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const scope = await resolveDeliveryCrmScope(req, userId);
    const [allOrders, clients] = await Promise.all([
      listDeliveryOrdersByUser(req, userId),
      listClientsByUser(req, userId, scope.listOptions),
    ]);
    const orders = await filterOrdersForBusinessScope(req, userId, allOrders, scope);

    const delivered = orders.filter((o) => o.status === 'delivered');
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000).toISOString();

    const recentOrders = delivered.filter((o) => o.createdAt >= thirtyDaysAgo);
    const totalRevenue = delivered.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
    const recentRevenue = recentOrders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
    const avgTicket = delivered.length ? totalRevenue / delivered.length : 0;

    const clientOrderMap = {};
    for (const o of delivered) {
      const cid = o.clientId || o.customerPhone || o.customerName;
      if (!cid) continue;
      if (!clientOrderMap[cid]) clientOrderMap[cid] = { orders: [], totalSpent: 0, lastOrder: '' };
      clientOrderMap[cid].orders.push(o);
      clientOrderMap[cid].totalSpent += Number(o.totalAmount || 0);
      if (o.createdAt > clientOrderMap[cid].lastOrder) clientOrderMap[cid].lastOrder = o.createdAt;
    }

    const uniqueClients = Object.keys(clientOrderMap).length;
    const repeatClients = Object.values(clientOrderMap).filter((c) => c.orders.length > 1).length;
    const repeatRate = uniqueClients ? (repeatClients / uniqueClients) * 100 : 0;

    const vipClients = Object.entries(clientOrderMap)
      .filter(([, v]) => v.orders.length >= 5 || v.totalSpent >= avgTicket * 10)
      .length;

    const inactiveClients = Object.entries(clientOrderMap)
      .filter(([, v]) => v.lastOrder < ninetyDaysAgo)
      .length;

    const incidents = orders.filter((o) => o.status === 'incident' || o.incidentType);

    const zoneMap = {};
    for (const o of delivered) {
      const zone = o.customerZone || o.customerAddress?.split(',').pop()?.trim() || 'Sin zona';
      if (!zoneMap[zone]) zoneMap[zone] = { orders: 0, revenue: 0 };
      zoneMap[zone].orders += 1;
      zoneMap[zone].revenue += Number(o.totalAmount || 0);
    }
    const topZones = Object.entries(zoneMap)
      .map(([zone, data]) => ({ zone, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const channelMap = {};
    for (const o of delivered) {
      const ch = o.channel || 'direct';
      if (!channelMap[ch]) channelMap[ch] = { orders: 0, revenue: 0 };
      channelMap[ch].orders += 1;
      channelMap[ch].revenue += Number(o.totalAmount || 0);
    }

    return res.json({
      ok: true,
      dashboard: {
        totalOrders: delivered.length,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        recentRevenue: Math.round(recentRevenue * 100) / 100,
        avgTicket: Math.round(avgTicket * 100) / 100,
        uniqueClients,
        repeatClients,
        repeatRate: Math.round(repeatRate * 10) / 10,
        vipClients,
        inactiveClients,
        totalIncidents: incidents.length,
        topZones,
        channels: channelMap,
        totalRegisteredClients: clients.length,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error cargando dashboard CRM delivery' });
  }
}

// ─── CLIENTES DELIVERY: ficha enriquecida con métricas delivery ──────────────

export async function listDeliveryCrmClients(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const scope = await resolveDeliveryCrmScope(req, userId);
    const [allOrders, clients] = await Promise.all([
      listDeliveryOrdersByUser(req, userId),
      listClientsByUser(req, userId, scope.listOptions),
    ]);
    const orders = await filterOrdersForBusinessScope(req, userId, allOrders, scope);

    const delivered = orders.filter((o) => o.status === 'delivered');
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000).toISOString();

    const ordersByClient = {};
    for (const o of orders) {
      const cid = o.clientId || '';
      if (!cid) continue;
      if (!ordersByClient[cid]) ordersByClient[cid] = [];
      ordersByClient[cid].push(o);
    }

    const enrichedClients = clients.map((c) => {
      const sc = sanitizeClient(c);
      const clientOrders = ordersByClient[sc.id] || [];
      const deliveredOrders = clientOrders.filter((o) => o.status === 'delivered');
      const totalSpent = deliveredOrders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
      const avgTicket = deliveredOrders.length ? totalSpent / deliveredOrders.length : 0;
      const lastOrder = clientOrders.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const incidents = clientOrders.filter((o) => o.status === 'incident' || o.incidentType);

      const zones = [...new Set(clientOrders.map((o) => o.customerZone || '').filter(Boolean))];

      let frequency = 'none';
      if (deliveredOrders.length >= 12) frequency = 'weekly';
      else if (deliveredOrders.length >= 4) frequency = 'biweekly';
      else if (deliveredOrders.length >= 1) frequency = 'monthly';

      const isVip = deliveredOrders.length >= 5 || totalSpent >= avgTicket * 10;
      const isInactive = !lastOrder || lastOrder.createdAt < ninetyDaysAgo;
      const isAtRisk = lastOrder && lastOrder.createdAt < thirtyDaysAgo && lastOrder.createdAt >= ninetyDaysAgo;

      const productMap = {};
      for (const o of deliveredOrders) {
        for (const item of o.items || []) {
          const name = item.name || 'Desconocido';
          if (!productMap[name]) productMap[name] = { qty: 0, revenue: 0 };
          productMap[name].qty += Number(item.quantity || 1);
          productMap[name].revenue += Number(item.total || 0);
        }
      }
      const topProducts = Object.entries(productMap)
        .map(([name, d]) => ({ name, ...d }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      return {
        ...sc,
        delivery: {
          totalOrders: clientOrders.length,
          deliveredOrders: deliveredOrders.length,
          totalSpent: Math.round(totalSpent * 100) / 100,
          avgTicket: Math.round(avgTicket * 100) / 100,
          lastOrderDate: lastOrder?.createdAt || null,
          lastOrderStatus: lastOrder?.status || null,
          frequency,
          isVip,
          isInactive,
          isAtRisk,
          incidents: incidents.length,
          zones,
          topProducts,
          preferredChannel: clientOrders.length
            ? Object.entries(
                clientOrders.reduce((acc, o) => { acc[o.channel || 'direct'] = (acc[o.channel || 'direct'] || 0) + 1; return acc; }, {})
              ).sort(([, a], [, b]) => b - a)[0]?.[0] || 'direct'
            : 'direct',
        },
      };
    });

    return res.json({ ok: true, clients: enrichedClients });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error cargando clientes CRM delivery' });
  }
}

// ─── HISTORIAL DE PEDIDOS POR CLIENTE ────────────────────────────────────────

export async function getClientDeliveryHistory(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return badRequest(res, 'Falta userId o clientId');

    const scope = await resolveDeliveryCrmScope(req, userId);
    const allOrders = await listDeliveryOrdersByUser(req, userId);
    const scopedOrders = await filterOrdersForBusinessScope(req, userId, allOrders, scope);
    const clientOrders = scopedOrders
      .filter((o) => o.clientId === clientId)
      .map(sanitizeDeliveryOrder)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return res.json({ ok: true, orders: clientOrders });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error cargando historial' });
  }
}

// ─── CAMPAÑAS AUTOMÁTICAS ────────────────────────────────────────────────────

function sanitizeCampaign(doc) {
  return {
    id: doc._id,
    _rev: doc._rev,
    name: doc.name || '',
    description: doc.description || '',
    type: doc.campaignType || 'manual',
    trigger: doc.trigger || 'manual',
    triggerConfig: doc.triggerConfig || {},
    status: doc.status || 'draft',
    targetSegment: doc.targetSegment || 'all',
    targetFilters: doc.targetFilters || {},
    channel: doc.channel || 'push',
    message: doc.message || '',
    promotionId: doc.promotionId || '',
    discountPercent: Number(doc.discountPercent || 0),
    startDate: doc.startDate || '',
    endDate: doc.endDate || '',
    stats: doc.stats || { sent: 0, opened: 0, converted: 0, revenue: 0 },
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
    user_id: doc.user_id || '',
  };
}

export async function listCampaigns(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await ensureDatabase(req, DELIVERY_CRM_DB);
    const docs = await getAllDocuments(req, DELIVERY_CRM_DB);
    const campaigns = docs
      .filter((d) => d?.type === 'delivery_campaign' && d?.user_id === userId && !d?.deletedAt)
      .map(sanitizeCampaign)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({ ok: true, campaigns });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error cargando campañas' });
  }
}

export async function createCampaign(req, res) {
  try {
    const { userId } = req.params;
    const { campaign } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!campaign?.name?.trim()) return badRequest(res, 'El nombre de la campaña es obligatorio');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    await ensureDatabase(req, DELIVERY_CRM_DB);
    const now = new Date().toISOString();
    const id = `dcampaign-${uuidv4()}`;
    const doc = {
      _id: id,
      type: 'delivery_campaign',
      user_id: userId,
      name: campaign.name.trim(),
      description: (campaign.description || '').trim(),
      campaignType: campaign.type || 'manual',
      trigger: campaign.trigger || 'manual',
      triggerConfig: campaign.triggerConfig || {},
      status: campaign.status || 'draft',
      targetSegment: campaign.targetSegment || 'all',
      targetFilters: campaign.targetFilters || {},
      channel: campaign.channel || 'push',
      message: (campaign.message || '').trim(),
      promotionId: campaign.promotionId || '',
      discountPercent: Number(campaign.discountPercent || 0),
      startDate: campaign.startDate || '',
      endDate: campaign.endDate || '',
      stats: { sent: 0, opened: 0, converted: 0, revenue: 0 },
      createdAt: now,
      updatedAt: now,
    };

    const saved = await putDocument(req, DELIVERY_CRM_DB, id, doc);
    return res.status(201).json({ ok: true, campaign: sanitizeCampaign({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error creando campaña' });
  }
}

export async function updateCampaign(req, res) {
  try {
    const { userId, campaignId } = req.params;
    const { campaign } = req.body || {};

    await ensureDatabase(req, DELIVERY_CRM_DB);
    const existing = await getDocument(req, DELIVERY_CRM_DB, campaignId);
    if (!existing || existing.type !== 'delivery_campaign' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Campaña no encontrada' });
    }

    const updatedDoc = {
      ...existing,
      name: campaign?.name?.trim() || existing.name,
      description: campaign?.description?.trim() ?? existing.description,
      campaignType: campaign?.type || existing.campaignType,
      trigger: campaign?.trigger || existing.trigger,
      triggerConfig: campaign?.triggerConfig || existing.triggerConfig,
      status: campaign?.status || existing.status,
      targetSegment: campaign?.targetSegment ?? existing.targetSegment,
      targetFilters: campaign?.targetFilters || existing.targetFilters,
      channel: campaign?.channel || existing.channel,
      message: campaign?.message?.trim() ?? existing.message,
      promotionId: campaign?.promotionId ?? existing.promotionId,
      discountPercent: campaign?.discountPercent !== undefined ? Number(campaign.discountPercent) : existing.discountPercent,
      startDate: campaign?.startDate ?? existing.startDate,
      endDate: campaign?.endDate ?? existing.endDate,
      stats: campaign?.stats || existing.stats,
      updatedAt: new Date().toISOString(),
    };

    const saved = await putDocument(req, DELIVERY_CRM_DB, campaignId, updatedDoc);
    return res.json({ ok: true, campaign: sanitizeCampaign({ ...updatedDoc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error actualizando campaña' });
  }
}

export async function deleteCampaign(req, res) {
  try {
    const { userId, campaignId } = req.params;
    await ensureDatabase(req, DELIVERY_CRM_DB);
    const existing = await getDocument(req, DELIVERY_CRM_DB, campaignId);
    if (!existing || existing.type !== 'delivery_campaign' || existing.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Campaña no encontrada' });
    }
    await softDeleteDocument(req, DELIVERY_CRM_DB, campaignId);
    return res.json({ ok: true, id: campaignId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error eliminando campaña' });
  }
}

// ─── ALERTAS DELIVERY CRM ───────────────────────────────────────────────────

export async function getDeliveryCrmAlerts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const scope = await resolveDeliveryCrmScope(req, userId);
    const [allOrders, clients] = await Promise.all([
      listDeliveryOrdersByUser(req, userId),
      listClientsByUser(req, userId, scope.listOptions),
    ]);
    const orders = await filterOrdersForBusinessScope(req, userId, allOrders, scope);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000).toISOString();
    const prevThirtyStart = new Date(now.getTime() - 60 * 86400000).toISOString();

    const delivered = orders.filter((o) => o.status === 'delivered');
    const ordersByClient = {};
    for (const o of orders) {
      const cid = o.clientId || '';
      if (!cid) continue;
      if (!ordersByClient[cid]) ordersByClient[cid] = [];
      ordersByClient[cid].push(o);
    }

    const alerts = [];

    for (const c of clients) {
      const sc = sanitizeClient(c);
      const co = ordersByClient[sc.id] || [];
      const dord = co.filter((o) => o.status === 'delivered');
      const totalSpent = dord.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
      const isVip = dord.length >= 5 || totalSpent >= 500;
      if (!isVip) continue;
      const last = co.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (last && last.createdAt < thirtyDaysAgo) {
        alerts.push({
          id: `vip-inactive-${sc.id}`,
          type: 'vip_no_purchase',
          severity: 'warning',
          title: 'Cliente VIP sin compra reciente',
          description: `${sc.name} no realiza un pedido desde ${new Date(last.createdAt).toLocaleDateString('es-ES')}`,
          clientId: sc.id,
          clientName: sc.name,
          lastOrderDate: last.createdAt,
          totalSpent,
          totalOrders: dord.length,
        });
      }
    }

    const zoneRecent = {};
    const zonePrev = {};
    for (const o of delivered) {
      const zone = o.customerZone || 'Sin zona';
      if (o.createdAt >= thirtyDaysAgo) {
        zoneRecent[zone] = (zoneRecent[zone] || 0) + Number(o.totalAmount || 0);
      } else if (o.createdAt >= prevThirtyStart && o.createdAt < thirtyDaysAgo) {
        zonePrev[zone] = (zonePrev[zone] || 0) + Number(o.totalAmount || 0);
      }
    }
    for (const zone of new Set([...Object.keys(zoneRecent), ...Object.keys(zonePrev)])) {
      const recent = zoneRecent[zone] || 0;
      const prev = zonePrev[zone] || 0;
      if (prev > 0 && recent < prev * 0.7) {
        const drop = Math.round((1 - recent / prev) * 100);
        alerts.push({
          id: `zone-drop-${zone}`,
          type: 'zone_sales_drop',
          severity: 'warning',
          title: 'Caída de ventas en zona',
          description: `La zona "${zone}" ha bajado un ${drop}% en ventas respecto al mes anterior`,
          zone,
          recentRevenue: Math.round(recent * 100) / 100,
          previousRevenue: Math.round(prev * 100) / 100,
          dropPercent: drop,
        });
      }
    }

    for (const c of clients) {
      const sc = sanitizeClient(c);
      const co = ordersByClient[sc.id] || [];
      const incidents = co.filter((o) => o.status === 'incident' || o.incidentType);
      if (incidents.length >= 2) {
        alerts.push({
          id: `repeat-incidents-${sc.id}`,
          type: 'repeat_incidents',
          severity: incidents.length >= 3 ? 'warning' : 'info',
          title: 'Cliente con incidencias repetidas',
          description: `${sc.name} acumula ${incidents.length} incidencias en sus pedidos`,
          clientId: sc.id,
          clientName: sc.name,
          incidentCount: incidents.length,
          lastIncident: incidents.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.createdAt || '',
        });
      }
    }

    for (const c of clients) {
      const sc = sanitizeClient(c);
      const co = ordersByClient[sc.id] || [];
      if (co.length === 0) continue;
      const last = co.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (last && last.createdAt < ninetyDaysAgo) {
        const dord = co.filter((o) => o.status === 'delivered');
        const totalSpent = dord.reduce((s, o) => s + Number(o.totalAmount || 0), 0);
        alerts.push({
          id: `inactive-${sc.id}`,
          type: 'inactive_client',
          severity: 'info',
          title: 'Cliente inactivo',
          description: `${sc.name} lleva más de 90 días sin pedir (último pedido: ${new Date(last.createdAt).toLocaleDateString('es-ES')})`,
          clientId: sc.id,
          clientName: sc.name,
          lastOrderDate: last.createdAt,
          totalSpent,
        });
      }
    }

    const summary = {
      total: alerts.length,
      vipNoPurchase: alerts.filter((a) => a.type === 'vip_no_purchase').length,
      zoneDrop: alerts.filter((a) => a.type === 'zone_sales_drop').length,
      repeatIncidents: alerts.filter((a) => a.type === 'repeat_incidents').length,
      inactiveClients: alerts.filter((a) => a.type === 'inactive_client').length,
    };

    return res.json({ ok: true, alerts, summary });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error cargando alertas CRM delivery' });
  }
}
