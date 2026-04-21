import crypto from 'node:crypto';
import {
  getClientsDbName,
  getDocument,
  putDocument,
  getAllDocuments,
  ensureDatabase,
  findAccountByUserId,
  getSalesDbName,
  getInvoicesDbName,
  getDocumentsDbName,
  getAppointmentsDbName,
  buildClientDocument,
} from '../services/couchdb.js';

const PORTAL_TOKENS_DB = 'crm-portal-tokens';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

/**
 * Generates a cryptographically secure token for client portal access.
 * Token format: {clientId}:{randomHex}
 * Stored in a separate DB with TTL-like field.
 */
function generatePortalToken(clientId) {
  const randomPart = crypto.randomBytes(24).toString('hex');
  return `${clientId}.${randomPart}`;
}

function buildTokenDocument(clientId, userId, token) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 90 * 24 * 3600000); // 90 days
  return {
    _id: `portal-token-${clientId}`,
    type: 'portal_token',
    token,
    clientId,
    user_id: userId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    lastAccessedAt: null,
  };
}

// ─── Generate / Refresh portal token ─────────────────────────────────────────

export async function generateClientPortalToken(req, res) {
  try {
    const { userId, clientId } = req.params;
    if (!userId || !clientId) return badRequest(res, 'Falta userId o clientId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const clientsDb = getClientsDbName();
    await ensureDatabase(req, clientsDb);
    const client = await getDocument(req, clientsDb, clientId);
    if (!client || client.type !== 'client' || client.user_id !== userId) {
      return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    }

    await ensureDatabase(req, PORTAL_TOKENS_DB);
    const token = generatePortalToken(clientId);
    const tokenDoc = buildTokenDocument(clientId, userId, token);

    const existingTokenDoc = await getDocument(req, PORTAL_TOKENS_DB, tokenDoc._id);
    if (existingTokenDoc && existingTokenDoc._rev) {
      tokenDoc._rev = existingTokenDoc._rev;
    }
    await putDocument(req, PORTAL_TOKENS_DB, tokenDoc._id, tokenDoc);

    // Store token reference in client document
    const updatedClient = buildClientDocument(userId, { ...client, portalToken: token, portalTokenGeneratedAt: new Date().toISOString() }, client);
    await putDocument(req, clientsDb, client._id, updatedClient);

    const portalUrl = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}/portal/${encodeURIComponent(token)}`;

    return res.json({ ok: true, token, portalUrl, expiresAt: tokenDoc.expiresAt });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}

// ─── Public: access portal by token ──────────────────────────────────────────

export async function getPortalData(req, res) {
  try {
    const { token } = req.params;
    if (!token) return badRequest(res, 'Token requerido');

    await ensureDatabase(req, PORTAL_TOKENS_DB);

    // Find token document by iterating (small table)
    const tokenDocs = await getAllDocuments(req, PORTAL_TOKENS_DB);
    const tokenDoc = tokenDocs.find((d) => d?.type === 'portal_token' && d?.token === decodeURIComponent(token));

    if (!tokenDoc) {
      return res.status(404).json({ ok: false, error: 'Enlace de portal no válido o expirado' });
    }

    if (tokenDoc.expiresAt && new Date(tokenDoc.expiresAt) < new Date()) {
      return res.status(410).json({ ok: false, error: 'El enlace del portal ha expirado' });
    }

    const { clientId, user_id: userId } = tokenDoc;

    // Load client
    const clientsDb = getClientsDbName();
    await ensureDatabase(req, clientsDb);
    const client = await getDocument(req, clientsDb, clientId);
    if (!client || client.type !== 'client' || client.deletedAt) {
      return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    }

    // Load dealer info
    const dealer = await findAccountByUserId(req, userId);

    // Load sales for this client
    const salesDb = getSalesDbName();
    await ensureDatabase(req, salesDb);
    const allSales = await getAllDocuments(req, salesDb);
    const clientSales = allSales
      .filter((s) => s?.type === 'sale' && !s?.deletedAt && s?.user_id === userId && s?.clientId === clientId)
      .map((s) => ({
        id: s._id,
        vehicleName: s.vehicleName || '',
        vehiclePlate: s.vehiclePlate || '',
        stage: s.stage || '',
        totalPrice: Number(s.totalPrice || 0),
        expectedDelivery: s.expectedDelivery || '',
        deliveredAt: s.deliveredAt || '',
        createdAt: s.createdAt || '',
        paymentMethod: s.paymentMethod || '',
      }));

    // Load invoices
    const invoicesDb = getInvoicesDbName();
    await ensureDatabase(req, invoicesDb);
    const allInvoices = await getAllDocuments(req, invoicesDb);
    const clientInvoices = allInvoices
      .filter((i) => i?.type === 'client_invoice' && !i?.deletedAt && i?.user_id === userId && i?.clientId === clientId)
      .map((i) => ({
        id: i._id,
        number: i.number || '',
        vehicleName: i.vehicleName || '',
        total: Number(i.total || 0),
        paid: Number(i.paid || 0),
        status: i.status || '',
        date: i.date || '',
        dueDate: i.dueDate || '',
      }));

    // Load documents for this client
    const docsDb = getDocumentsDbName();
    await ensureDatabase(req, docsDb);
    const allDocs = await getAllDocuments(req, docsDb);
    const clientDocuments = allDocs
      .filter((d) => d?.type === 'document' && !d?.deletedAt && d?.user_id === userId && d?.clientId === clientId)
      .map((d) => ({
        id: d._id,
        name: d.name || '',
        category: d.category || '',
        status: d.status || '',
        createdAt: d.createdAt || '',
        signedAt: d.signedAt || '',
      }));

    // C-12: Load appointments for this client
    const appointmentsDb = getAppointmentsDbName();
    await ensureDatabase(req, appointmentsDb);
    const allAppointments = await getAllDocuments(req, appointmentsDb);
    const clientAppointments = allAppointments
      .filter((a) =>
        a?.type === 'appointment' && !a?.deletedAt &&
        a?.user_id === userId &&
        (a?.clientId === clientId || a?.clientPhone === client.phone || a?.clientEmail === client.email),
      )
      .map((a) => ({
        id: a._id,
        title: a.title || a.reason || 'Cita',
        date: a.date || a.scheduledAt || '',
        status: a.status || 'pending',
        notes: a.notes || '',
        vehicleName: a.vehicleName || '',
        type: a.appointmentType || a.type_label || 'general',
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Update last accessed
    await putDocument(req, PORTAL_TOKENS_DB, tokenDoc._id, {
      ...tokenDoc,
      lastAccessedAt: new Date().toISOString(),
    }).catch(() => null);

    return res.json({
      ok: true,
      portal: {
        client: {
          id: client._id,
          name: client.name || '',
          email: client.email || '',
          phone: client.phone || '',
          dni: client.dni || '',
          address: client.address || '',
          city: client.city || '',
          vehiclesPurchased: Array.isArray(client.vehiclesPurchased) ? client.vehiclesPurchased : [],
        },
        dealer: {
          name: dealer?.businessName || dealer?.fullName || 'Concesionario',
          email: dealer?.email || '',
          phone: dealer?.phone || '',
          logo: dealer?.logo || null,
        },
        sales: clientSales,
        invoices: clientInvoices,
        documents: clientDocuments,
        appointments: clientAppointments,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
