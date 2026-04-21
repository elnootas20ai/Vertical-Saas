import {
  getClientsDbName,
  buildClientDocument,
  sanitizeClient,
  listClientsByUser,
  findDuplicateClients,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  getSalesDbName,
  getInvoicesDbName,
  getAllDocuments,
  buildClientNoteDocument,
  sanitizeClientNote,
  listClientNotesByClient,
  buildClientPromotionDocument,
  sanitizeClientPromotion,
  listClientPromotionsByClient,
  searchClientsByPhone,
} from '../services/couchdb.js';
import { applyQueryOptions } from '../middleware/queryOptions.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureClientOwner(req, userId, clientId) {
  const db = getClientsDbName();
  await ensureDatabase(req, db);
  const client = await getDocument(req, db, clientId);
  if (!client || client.type !== 'client' || client.user_id !== userId) {
    return null;
  }
  return client;
}

export async function listClients(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const raw = await listClientsByUser(req, userId);
    const { items, meta } = applyQueryOptions(raw.map(sanitizeClient), req.query);
    return res.json({ ok: true, clients: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar clientes' });
  }
}

export async function createClient(req, res) {
  try {
    const { userId } = req.params;
    const { client } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!client || typeof client !== 'object') return badRequest(res, 'Falta el objeto client en el body');
    if (!client.name?.trim()) return badRequest(res, 'El nombre del cliente es obligatorio');
    if (!client.phone?.trim()) return badRequest(res, 'El teléfono del cliente es obligatorio');

    const cleanPhone = String(client.phone || '').replace(/\D/g, '');
    if (cleanPhone.length < 9) {
      return res.status(400).json({ ok: false, error: 'El teléfono debe tener al menos 9 dígitos', field: 'phone' });
    }
    if (!/^[\d\s+\-().]+$/.test(client.phone.trim())) {
      return res.status(400).json({ ok: false, error: 'El teléfono contiene caracteres no válidos', field: 'phone' });
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await ensureDatabase(req, db);
    const doc = buildClientDocument(userId, client);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Creó cliente ${doc.name}`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { phone: doc.phone, email: doc.email },
    });

    const warnings = [];
    if (doc.address && !doc.city) warnings.push({ field: 'city', message: 'Ciudad no especificada en la dirección' });
    if (doc.address && !doc.postalCode) warnings.push({ field: 'postalCode', message: 'Código postal no especificado' });
    if (!doc.email) warnings.push({ field: 'email', message: 'Sin email — no se podrán enviar comunicaciones' });

    const duplicates = await findDuplicateClients(req, userId, doc).catch(() => []);
    return res.status(201).json({ ok: true, client: sanitizeClient({ ...doc, _rev: saved.rev }), duplicates, warnings });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear cliente' });
  }
}

export async function updateClient(req, res) {
  try {
    const { userId, clientId } = req.params;
    const { client } = req.body || {};

    if (!client || typeof client !== 'object') return badRequest(res, 'Faltan datos del cliente');

    const existing = await ensureClientOwner(req, userId, clientId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    const doc = buildClientDocument(userId, { ...existing, ...client }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Actualizó cliente ${doc.name}`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { status: doc.status },
    });

    return res.json({ ok: true, client: sanitizeClient({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar cliente' });
  }
}

export async function removeClient(req, res) {
  try {
    const { userId, clientId } = req.params;

    const existing = await ensureClientOwner(req, userId, clientId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await softDeleteDocument(req, db, clientId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Eliminó cliente ${existing.name}`,
      entityId: existing._id,
      entityLabel: existing.name,
      metadata: {},
    });

    return res.json({ ok: true, id: clientId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar cliente' });
  }
}

// ─── CLIENT DETAIL + RESUMEN ─────────────────────────────────────────────────

export async function getClientDetail(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return badRequest(res, 'Falta userId o clientId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const client = await ensureClientOwner(req, userId, clientId);
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const [salesDocs, invoiceDocs] = await Promise.all([
      ensureDatabase(req, getSalesDbName()).then(() => getAllDocuments(req, getSalesDbName())),
      ensureDatabase(req, getInvoicesDbName()).then(() => getAllDocuments(req, getInvoicesDbName())),
    ]);

    const clientSales = salesDocs.filter(
      (s) => s?.type === 'sale' && !s?.deletedAt && s?.user_id === userId && s?.clientId === clientId,
    );
    const clientInvoices = invoiceDocs.filter(
      (i) => i?.type === 'client_invoice' && !i?.deletedAt && i?.user_id === userId && i?.clientId === clientId,
    );

    const totalInvoiced = clientInvoices.reduce((s, inv) => s + Number(inv.total || 0), 0);
    const totalSalesRevenue = clientSales.reduce((s, sale) => s + Number(sale.totalPrice || 0), 0);
    const totalOrders = clientSales.length + clientInvoices.length;
    const totalRevenue = totalSalesRevenue + totalInvoiced;
    const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const allDates = [...clientSales, ...clientInvoices]
      .map((r) => r.date || r.createdAt || '')
      .filter(Boolean)
      .sort();

    const lastPurchaseDate = allDates.length > 0 ? allDates[allDates.length - 1] : null;

    return res.json({
      ok: true,
      client: sanitizeClient(client),
      summary: {
        totalInvoiced: Number(totalRevenue.toFixed(2)),
        totalOrders,
        avgTicket: Number(avgTicket.toFixed(2)),
        lastPurchase: lastPurchaseDate,
        totalSalesRevenue: Number(totalSalesRevenue.toFixed(2)),
        totalInvoicesRevenue: Number(totalInvoiced.toFixed(2)),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener detalle del cliente' });
  }
}

// ─── CLV ─────────────────────────────────────────────────────────────────────

export async function getClientCLV(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return badRequest(res, 'Falta userId o clientId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await ensureDatabase(req, db);
    const client = await getDocument(req, db, clientId);
    if (!client || client.type !== 'client' || client.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    }

    const [salesDocs, invoiceDocs] = await Promise.all([
      ensureDatabase(req, getSalesDbName()).then(() => getAllDocuments(req, getSalesDbName())),
      ensureDatabase(req, getInvoicesDbName()).then(() => getAllDocuments(req, getInvoicesDbName())),
    ]);

    const clientSales = salesDocs.filter(
      (s) => s?.type === 'sale' && !s?.deletedAt && s?.user_id === userId && s?.clientId === clientId,
    );
    const clientInvoices = invoiceDocs.filter(
      (i) => i?.type === 'client_invoice' && !i?.deletedAt && i?.user_id === userId && i?.clientId === clientId,
    );

    const totalSalesRevenue = clientSales.reduce((s, sale) => s + Number(sale.totalPrice || 0), 0);
    const totalInvoicesRevenue = clientInvoices.reduce((s, inv) => s + Number(inv.total || 0), 0);
    const totalRevenue = totalSalesRevenue + totalInvoicesRevenue;

    const firstSale = [...clientSales, ...clientInvoices]
      .map((r) => String(r.createdAt || '')).filter(Boolean).sort()[0];
    const lastSale = [...clientSales, ...clientInvoices]
      .map((r) => String(r.updatedAt || r.createdAt || '')).filter(Boolean).sort().reverse()[0];

    const relationshipDays = firstSale
      ? Math.max(0, Math.floor((Date.now() - new Date(firstSale).getTime()) / 86400000))
      : 0;
    const relationshipMonths = Math.max(1, Math.ceil(relationshipDays / 30));
    const avgMonthlyRevenue = totalRevenue / relationshipMonths;
    const projectedCLV = avgMonthlyRevenue * 36;

    const vehiclesPurchasedCount = Array.isArray(client.vehiclesPurchased) ? client.vehiclesPurchased.length : 0;
    const vehiclesSoldCount = Array.isArray(client.vehiclesSold) ? client.vehiclesSold.length : 0;

    return res.json({
      ok: true,
      clv: {
        clientId,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalSalesRevenue: Number(totalSalesRevenue.toFixed(2)),
        totalInvoicesRevenue: Number(totalInvoicesRevenue.toFixed(2)),
        totalTransactions: clientSales.length + clientInvoices.length,
        vehiclesPurchasedCount,
        vehiclesSoldCount,
        firstTransaction: firstSale || null,
        lastTransaction: lastSale || null,
        relationshipDays,
        avgMonthlyRevenue: Number(avgMonthlyRevenue.toFixed(2)),
        projectedCLV: Number(projectedCLV.toFixed(2)),
        segment: projectedCLV >= 50000 ? 'vip' : projectedCLV >= 20000 ? 'high' : projectedCLV >= 5000 ? 'medium' : 'low',
        calculatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error calculando CLV' });
  }
}

// ─── CLIENT INVOICES ─────────────────────────────────────────────────────────

export async function getClientInvoices(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return badRequest(res, 'Falta userId o clientId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const client = await ensureClientOwner(req, userId, clientId);
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const invoicesDb = getInvoicesDbName();
    await ensureDatabase(req, invoicesDb);
    const invoiceDocs = await getAllDocuments(req, invoicesDb);
    const clientInvoices = invoiceDocs
      .filter((i) => i?.type === 'client_invoice' && !i?.deletedAt && i?.user_id === userId && i?.clientId === clientId)
      .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')));

    const { items, meta } = applyQueryOptions(clientInvoices, req.query);
    return res.json({ ok: true, invoices: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar facturas del cliente' });
  }
}

// ─── CLIENT CONTACTS ─────────────────────────────────────────────────────────

export async function updateClientContacts(req, res) {
  try {
    const { userId, clientId } = req.params;
    const { contacts } = req.body || {};

    if (!Array.isArray(contacts)) return badRequest(res, 'Se esperaba un array de contactos');

    const existing = await ensureClientOwner(req, userId, clientId);
    if (!existing) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    const doc = buildClientDocument(userId, { ...existing, contacts }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Actualizó contactos de ${doc.name} (${contacts.length})`,
      entityId: doc._id,
      entityLabel: doc.name,
      metadata: { contactsCount: contacts.length },
    });

    const sanitized = sanitizeClient({ ...doc, _rev: saved.rev });
    return res.json({ ok: true, contacts: sanitized.contacts });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar contactos' });
  }
}

// ─── CLIENT NOTES ────────────────────────────────────────────────────────────

export async function listClientNotes(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return badRequest(res, 'Falta userId o clientId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const client = await ensureClientOwner(req, userId, clientId);
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const raw = await listClientNotesByClient(req, userId, clientId);
    const { items, meta } = applyQueryOptions(raw.map(sanitizeClientNote), req.query);
    return res.json({ ok: true, notes: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar notas' });
  }
}

export async function createClientNote(req, res) {
  try {
    const { userId, clientId } = req.params;
    const { note } = req.body || {};

    if (!note || typeof note !== 'object') return badRequest(res, 'Falta el objeto note');
    if (!note.text?.trim() && !note.texto?.trim()) return badRequest(res, 'El texto de la nota es obligatorio');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const client = await ensureClientOwner(req, userId, clientId);
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const db = getClientsDbName();
    const doc = buildClientNoteDocument(userId, clientId, {
      ...note,
      authorId: req.authUser?.userId || userId,
      authorName: note.authorName || account.fullName || 'Usuario',
    });
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Añadió nota al cliente ${client.name}`,
      entityId: doc._id,
      entityLabel: client.name,
      metadata: { important: doc.important },
    });

    return res.status(201).json({ ok: true, note: sanitizeClientNote({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear nota' });
  }
}

export async function updateClientNote(req, res) {
  try {
    const { userId, clientId, noteId } = req.params;
    const { note } = req.body || {};

    if (!note || typeof note !== 'object') return badRequest(res, 'Faltan datos de la nota');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, noteId);
    if (!existing || existing.type !== 'client_note' || existing.user_id !== userId || existing.clientId !== clientId) {
      return res.status(404).json({ ok: false, error: 'Nota no encontrada' });
    }

    const doc = buildClientNoteDocument(userId, clientId, { ...existing, ...note }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, note: sanitizeClientNote({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar nota' });
  }
}

export async function removeClientNote(req, res) {
  try {
    const { userId, clientId, noteId } = req.params;

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, noteId);
    if (!existing || existing.type !== 'client_note' || existing.user_id !== userId || existing.clientId !== clientId) {
      return res.status(404).json({ ok: false, error: 'Nota no encontrada' });
    }

    await softDeleteDocument(req, db, noteId);
    return res.json({ ok: true, id: noteId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar nota' });
  }
}

// ─── CLIENT PROMOTIONS ───────────────────────────────────────────────────────

export async function listClientPromotions(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return badRequest(res, 'Falta userId o clientId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const client = await ensureClientOwner(req, userId, clientId);
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const raw = await listClientPromotionsByClient(req, userId, clientId);
    const { items, meta } = applyQueryOptions(raw.map(sanitizeClientPromotion), req.query);
    return res.json({ ok: true, promotions: items, meta });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar promociones' });
  }
}

export async function createClientPromotion(req, res) {
  try {
    const { userId, clientId } = req.params;
    const { promotion } = req.body || {};

    if (!promotion || typeof promotion !== 'object') return badRequest(res, 'Falta el objeto promotion');
    if (!promotion.nombre?.trim()) return badRequest(res, 'El nombre de la promoción es obligatorio');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const client = await ensureClientOwner(req, userId, clientId);
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const db = getClientsDbName();
    const doc = buildClientPromotionDocument(userId, clientId, promotion);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Creó promoción "${doc.nombre}" para ${client.name}`,
      entityId: doc._id,
      entityLabel: client.name,
      metadata: { tipo: doc.tipo, codigo: doc.codigo },
    });

    return res.status(201).json({ ok: true, promotion: sanitizeClientPromotion({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear promoción' });
  }
}

export async function updateClientPromotion(req, res) {
  try {
    const { userId, clientId, promotionId } = req.params;
    const { promotion } = req.body || {};

    if (!promotion || typeof promotion !== 'object') return badRequest(res, 'Faltan datos de la promoción');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, promotionId);
    if (!existing || existing.type !== 'client_promotion' || existing.user_id !== userId || existing.clientId !== clientId) {
      return res.status(404).json({ ok: false, error: 'Promoción no encontrada' });
    }

    const doc = buildClientPromotionDocument(userId, clientId, { ...existing, ...promotion }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Actualizó promoción "${doc.nombre}"`,
      entityId: doc._id,
      entityLabel: doc.nombre,
      metadata: { estado: doc.estado },
    });

    return res.json({ ok: true, promotion: sanitizeClientPromotion({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar promoción' });
  }
}

export async function removeClientPromotion(req, res) {
  try {
    const { userId, clientId, promotionId } = req.params;

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await ensureDatabase(req, db);
    const existing = await getDocument(req, db, promotionId);
    if (!existing || existing.type !== 'client_promotion' || existing.user_id !== userId || existing.clientId !== clientId) {
      return res.status(404).json({ ok: false, error: 'Promoción no encontrada' });
    }

    await softDeleteDocument(req, db, promotionId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Eliminó promoción "${existing.nombre}"`,
      entityId: existing._id,
      entityLabel: existing.nombre,
      metadata: {},
    });

    return res.json({ ok: true, id: promotionId });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar promoción' });
  }
}

// ─── CLIENT ACTIVITY ─────────────────────────────────────────────────────────

export async function getClientActivity(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return badRequest(res, 'Falta userId o clientId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const client = await ensureClientOwner(req, userId, clientId);
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const [salesDocs, invoiceDocs, notesDocs] = await Promise.all([
      ensureDatabase(req, getSalesDbName()).then(() => getAllDocuments(req, getSalesDbName())),
      ensureDatabase(req, getInvoicesDbName()).then(() => getAllDocuments(req, getInvoicesDbName())),
      listClientNotesByClient(req, userId, clientId),
    ]);

    const clientSales = salesDocs.filter(
      (s) => s?.type === 'sale' && !s?.deletedAt && s?.user_id === userId && s?.clientId === clientId,
    );
    const clientInvoices = invoiceDocs.filter(
      (i) => i?.type === 'client_invoice' && !i?.deletedAt && i?.user_id === userId && i?.clientId === clientId,
    );

    const activities = [];

    for (const sale of clientSales) {
      activities.push({
        id: sale._id,
        tipo: 'pedido',
        titulo: `Venta ${sale.vehicleName || sale._id}`,
        descripcion: sale.vehiclePlate ? `Placa: ${sale.vehiclePlate}` : '',
        fecha: sale.date || sale.createdAt,
        referencia: sale._id,
        monto: Number(sale.totalPrice || 0),
        estado: sale.stage === 'completed' ? 'completado' : sale.stage === 'cancelled' ? 'cancelado' : 'pendiente',
      });
    }

    for (const inv of clientInvoices) {
      activities.push({
        id: inv._id,
        tipo: 'factura',
        titulo: `Factura ${inv.number || inv._id}`,
        descripcion: inv.vehicleName ? `Vehículo: ${inv.vehicleName}` : '',
        fecha: inv.date || inv.createdAt,
        referencia: inv.number || inv._id,
        monto: Number(inv.total || 0),
        estado: inv.status === 'paid' ? 'pagado' : inv.status === 'overdue' ? 'vencido' : 'pendiente',
      });
    }

    for (const note of notesDocs) {
      activities.push({
        id: note._id,
        tipo: 'nota',
        titulo: 'Nota añadida',
        descripcion: (note.text || '').substring(0, 100),
        fecha: note.createdAt,
        autor: note.authorName || '',
      });
    }

    activities.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));

    const totalRevenue = clientSales.reduce((s, sale) => s + Number(sale.totalPrice || 0), 0)
      + clientInvoices.reduce((s, inv) => s + Number(inv.total || 0), 0);
    const totalOrders = clientSales.length + clientInvoices.length;
    const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const firstDate = [...clientSales, ...clientInvoices]
      .map((r) => r.createdAt || '').filter(Boolean).sort()[0];
    const relationshipDays = firstDate
      ? Math.max(0, Math.floor((Date.now() - new Date(firstDate).getTime()) / 86400000))
      : 0;

    const { items, meta } = applyQueryOptions(activities, req.query);

    return res.json({
      ok: true,
      activities: items,
      meta,
      kpis: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalOrders,
        avgTicket: Number(avgTicket.toFixed(2)),
        totalInvoices: clientInvoices.length,
        totalSales: clientSales.length,
        totalNotes: notesDocs.length,
        relationshipDays,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar actividad' });
  }
}

// ─── PHONE SEARCH ────────────────────────────────────────────────────────────

export async function searchByPhone(req, res) {
  try {
    const { userId } = req.params;
    const { q, limit } = req.query;
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const clients = await searchClientsByPhone(req, userId, q, limit);
    return res.json({ ok: true, clients });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al buscar clientes' });
  }
}

// ─── DUPLICATES / BULK / MERGE ───────────────────────────────────────────────

export async function checkClientDuplicates(req, res) {
  try {
    const { userId } = req.params;
    const { client, field, value } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    if (field && value) {
      const allowed = ['phone', 'email', 'dni'];
      if (!allowed.includes(field)) return badRequest(res, `Campo no válido: ${field}. Usa: ${allowed.join(', ')}`);
      const duplicates = await findDuplicateClients(req, userId, { [field]: value });
      return res.json({ ok: true, duplicates, matchedField: field });
    }

    if (client && typeof client === 'object') {
      const duplicates = await findDuplicateClients(req, userId, client);
      return res.json({ ok: true, duplicates });
    }

    return badRequest(res, 'Falta client o field+value');
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al buscar duplicados' });
  }
}

export async function bulkCreateClients(req, res) {
  try {
    const { userId } = req.params;
    const { clients } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!Array.isArray(clients) || clients.length === 0) {
      return badRequest(res, 'Se esperaba un array de clientes en clients[]');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await ensureDatabase(req, db);

    const created = [];
    const errors = [];

    for (const client of clients) {
      try {
        if (!client.name?.trim() || !client.phone?.trim()) {
          errors.push({ client, error: 'Nombre y teléfono son obligatorios' });
          continue;
        }
        const doc = buildClientDocument(userId, client);
        const saved = await putDocument(req, db, doc._id, doc);
        created.push(sanitizeClient({ ...doc, _rev: saved.rev }));
      } catch (err) {
        errors.push({ client, error: err.message });
      }
    }

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Importación masiva: ${created.length} clientes creados`,
      entityId: userId,
      entityLabel: 'Importación masiva',
      metadata: { created: created.length, errors: errors.length },
    });

    return res.status(201).json({ ok: true, clients: created, errors, total: created.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error en importación masiva' });
  }
}

export async function mergeClient(req, res) {
  try {
    const { userId } = req.params;
    const { keepId, deleteId } = req.body || {};

    if (!userId) return badRequest(res, 'Falta userId');
    if (!keepId || !deleteId) return badRequest(res, 'Faltan keepId y deleteId');
    if (keepId === deleteId) return badRequest(res, 'keepId y deleteId deben ser distintos');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getClientsDbName();
    await ensureDatabase(req, db);

    const [keepClient, deleteClient] = await Promise.all([
      getDocument(req, db, keepId),
      getDocument(req, db, deleteId),
    ]);

    if (!keepClient || keepClient.type !== 'client' || keepClient.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Cliente a conservar no encontrado' });
    }
    if (!deleteClient || deleteClient.type !== 'client' || deleteClient.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Cliente a eliminar no encontrado' });
    }

    const mergedInteractions = [
      ...(Array.isArray(keepClient.interactions) ? keepClient.interactions : []),
      ...(Array.isArray(deleteClient.interactions) ? deleteClient.interactions : []),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const mergedTags = [...new Set([
      ...(Array.isArray(keepClient.tags) ? keepClient.tags : []),
      ...(Array.isArray(deleteClient.tags) ? deleteClient.tags : []),
    ])];

    const mergedVehiclesPurchased = [...new Set([
      ...(Array.isArray(keepClient.vehiclesPurchased) ? keepClient.vehiclesPurchased : []),
      ...(Array.isArray(deleteClient.vehiclesPurchased) ? deleteClient.vehiclesPurchased : []),
    ])];
    const mergedVehiclesSold = [...new Set([
      ...(Array.isArray(keepClient.vehiclesSold) ? keepClient.vehiclesSold : []),
      ...(Array.isArray(deleteClient.vehiclesSold) ? deleteClient.vehiclesSold : []),
    ])];

    const mergedDocuments = [
      ...(Array.isArray(keepClient.documentsList) ? keepClient.documentsList : []),
      ...(Array.isArray(deleteClient.documentsList) ? deleteClient.documentsList : []),
    ];

    const mergedContacts = [
      ...(Array.isArray(keepClient.contacts) ? keepClient.contacts : []),
      ...(Array.isArray(deleteClient.contacts) ? deleteClient.contacts : []),
    ];

    const mergedAddresses = [
      ...(Array.isArray(keepClient.addresses) ? keepClient.addresses : []),
      ...(Array.isArray(deleteClient.addresses) ? deleteClient.addresses : []),
    ];

    const mergedSocialLinks = [
      ...(Array.isArray(keepClient.socialLinks) ? keepClient.socialLinks : []),
      ...(Array.isArray(deleteClient.socialLinks) ? deleteClient.socialLinks : []),
    ];

    const mergedDoc = buildClientDocument(userId, {
      ...keepClient,
      email: keepClient.email || deleteClient.email || '',
      dni: keepClient.dni || deleteClient.dni || '',
      legalName: keepClient.legalName || deleteClient.legalName || '',
      fiscalId: keepClient.fiscalId || deleteClient.fiscalId || '',
      address: keepClient.address || deleteClient.address || '',
      city: keepClient.city || deleteClient.city || '',
      notes: [keepClient.notes, deleteClient.notes].filter(Boolean).join('\n\n') || '',
      interactions: mergedInteractions,
      tags: mergedTags,
      vehiclesPurchased: mergedVehiclesPurchased,
      vehiclesSold: mergedVehiclesSold,
      documentsList: mergedDocuments,
      contacts: mergedContacts,
      addresses: mergedAddresses,
      socialLinks: mergedSocialLinks,
      mergedFrom: deleteId,
    }, keepClient);

    await putDocument(req, db, keepId, mergedDoc);
    await softDeleteDocument(req, db, deleteId);

    await logAccountActivity(req, {
      actorUserId: userId,
      actorName: account.fullName,
      targetUserId: userId,
      type: 'client',
      action: `Fusionó clientes: conservó ${keepClient.name}, eliminó ${deleteClient.name}`,
      entityId: keepId,
      entityLabel: keepClient.name,
      metadata: { mergedFrom: deleteId },
    });

    return res.json({ ok: true, client: sanitizeClient(mergedDoc) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error fusionando clientes' });
  }
}
