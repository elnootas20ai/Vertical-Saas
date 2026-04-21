import {
  getConstructionDbName,
  ensureDatabase,
  getDocument,
  putDocument,
  softDeleteDocument,
  findAccountByUserId,
  logAccountActivity,
  buildConstructionClientDocument,
  sanitizeConstructionClient,
  buildConstructionGuildDocument,
  sanitizeConstructionGuild,
  buildConstructionProjectDocument,
  sanitizeConstructionProject,
  buildConstructionBudgetDocument,
  sanitizeConstructionBudget,
  buildConstructionBudgetTemplateDocument,
  sanitizeConstructionBudgetTemplate,
  buildConstructionWorkerDocument,
  sanitizeConstructionWorker,
  buildConstructionTaskDocument,
  sanitizeConstructionTask,
  buildConstructionDailyReportDocument,
  sanitizeConstructionDailyReport,
  buildConstructionIncidentDocument,
  sanitizeConstructionIncident,
  buildConstructionObraDocument,
  sanitizeConstructionObraDocument,
  seedDefaultObraDocumentsForProject,
  buildConstructionPaymentDocument,
  sanitizeConstructionPayment,
  listConstructionDocsByType,
  CONSTRUCTION_PROJECT_TYPES,
  CONSTRUCTION_GUILDS,
  CONSTRUCTION_GUILD_LABELS,
  CONSTRUCTION_UNITS,
  buildConstructionPredefinedPartidaDocument,
  sanitizeConstructionPredefinedPartida,
  getClockinsDbName,
  getAllDocuments,
  buildConstructionCollectionDocument,
  sanitizeConstructionCollection,
  getFinanceDbName,
  buildFinanceDocument,
  getLeadsDbName,
  getClientsDbName,
  getInvoicesDbName,
  buildClientDocument,
  sanitizeClient,
} from '../services/couchdb.js';
import { broadcastToBusiness, broadcastToUser } from '../services/sseService.js';
import { buildNotificationDocument, saveNotification, sanitizeNotification } from '../services/couchdb.js';
import { sendPushToUser } from '../services/pushService.js';

function badRequest(res, error) {
  return res.status(400).json({ ok: false, error });
}

async function ensureOwner(req, userId, docId, expectedType) {
  const db = getConstructionDbName();
  await ensureDatabase(req, db);
  const doc = await getDocument(req, db, docId);
  if (!doc || doc.type !== expectedType || doc.user_id !== userId) return null;
  return doc;
}

async function emitConstructionEvent(req, userId, event, payload) {
  try {
    const account = await findAccountByUserId(req, userId);
    const bid = account?.business_id || account?.businessId;
    if (bid) broadcastToBusiness(bid, event, { ...payload, userId }, userId);
    else broadcastToUser(userId, event, { ...payload, userId });
  } catch {
    /* ignore */
  }
}

// ─── CONFIG ────────────────────────────────────────────────────────────────────

export async function getConstructionConfig(req, res) {
  return res.json({
    ok: true,
    projectTypes: CONSTRUCTION_PROJECT_TYPES,
    guilds: CONSTRUCTION_GUILDS,
    guildLabels: CONSTRUCTION_GUILD_LABELS,
    units: CONSTRUCTION_UNITS,
  });
}

const MANAGER_ROLES = ['owner', 'admin', 'manager', 'gerente'];
function isManager(req) {
  const role = req.authUser?.role || req.authUser?.teamRole || '';
  return MANAGER_ROLES.includes(role);
}

// ─── CLIENTS ───────────────────────────────────────────────────────────────────

export async function listClients(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    let items = await listConstructionDocsByType(req, userId, 'construction_client');

    const { q, estadoComercial, tipoCliente, responsableId, tags, conObrasActivas, conImpagos, workerId, sortBy, sortOrder } = req.query || {};

    if (q) {
      const query = q.toLowerCase();
      items = items.filter(c => `${c.nombre} ${c.cif} ${c.email} ${c.telefono} ${c.razonSocial}`.toLowerCase().includes(query));
    }
    if (estadoComercial) items = items.filter(c => c.estadoComercial === estadoComercial);
    if (tipoCliente) items = items.filter(c => c.tipoCliente === tipoCliente);
    if (responsableId) items = items.filter(c => c.responsableId === responsableId);
    if (tags) {
      const tagList = tags.split(',').map(t => t.trim().toLowerCase());
      items = items.filter(c => (c.tags || []).some(t => tagList.includes(t.toLowerCase())));
    }

    if (conObrasActivas === 'true' || conImpagos === 'true' || workerId) {
      const [projects, budgets] = await Promise.all([
        listConstructionDocsByType(req, userId, 'construction_project'),
        listConstructionDocsByType(req, userId, 'construction_budget'),
      ]);

      if (conObrasActivas === 'true') {
        const activeClientIds = new Set(projects.filter(p => p.estado === 'en_obra').map(p => p.clienteId));
        items = items.filter(c => activeClientIds.has(c._id));
      }

      if (conImpagos === 'true') {
        const today = new Date().toISOString().slice(0, 10);
        const clientsConImpago = new Set();
        for (const b of budgets) {
          if (b.estado === 'aceptado' && b.clienteId && Array.isArray(b.pagos)) {
            if (b.pagos.some(p => !p.pagado && p.fecha && p.fecha < today)) clientsConImpago.add(b.clienteId);
          }
        }
        items = items.filter(c => clientsConImpago.has(c._id));
      }

      if (workerId) {
        const workerProjects = new Set(projects.filter(p => {
          const workers = (p.trabajadoresIds || []);
          return workers.includes(workerId) || p.responsableId === workerId;
        }).map(p => p.clienteId));
        items = items.filter(c => workerProjects.has(c._id));
      }
    }

    const order = sortOrder === 'asc' ? 1 : -1;
    if (sortBy === 'nombre') items.sort((a, b) => order * (a.nombre || '').localeCompare(b.nombre || ''));
    else if (sortBy === 'estadoComercial') items.sort((a, b) => order * (a.estadoComercial || '').localeCompare(b.estadoComercial || ''));
    else items.sort((a, b) => order * (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    return res.json({ ok: true, clients: items.map(sanitizeConstructionClient) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar clientes' });
  }
}

export async function createClient(req, res) {
  try {
    const { userId } = req.params;
    const { client } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!client || typeof client !== 'object') return badRequest(res, 'Falta el objeto client');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const doc = buildConstructionClientDocument(userId, client);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'construction_client', action: `Creó cliente ${doc.nombre}`,
      entityId: doc._id, entityLabel: doc.nombre, metadata: {},
    });
    return res.status(201).json({ ok: true, client: sanitizeConstructionClient({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear cliente' });
  }
}

export async function updateClient(req, res) {
  try {
    const { userId, id } = req.params;
    const { client } = req.body || {};
    if (!client) return badRequest(res, 'Faltan datos');
    const existing = await ensureOwner(req, userId, id, 'construction_client');
    if (!existing) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    const db = getConstructionDbName();
    const doc = buildConstructionClientDocument(userId, { ...existing, ...client }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, client: sanitizeConstructionClient({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar cliente' });
  }
}

export async function removeClient(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_client');
    if (!existing) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    const db = getConstructionDbName();
    await softDeleteDocument(req, db, id);
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar cliente' });
  }
}

// ─── CLIENT DETAIL, NOTES, HISTORY, DUPLICATES, SEARCH, QUICK CREATE ────────

export async function getClientDetail(req, res) {
  try {
    const { userId, id } = req.params;
    if (!userId || !id) return badRequest(res, 'Falta userId o id');
    const client = await ensureOwner(req, userId, id, 'construction_client');
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const [projects, budgets] = await Promise.all([
      listConstructionDocsByType(req, userId, 'construction_project'),
      listConstructionDocsByType(req, userId, 'construction_budget'),
    ]);

    const obras = projects.filter(p => p.clienteId === id);
    const presupuestos = budgets.filter(b => b.clienteId === id);

    const totalPresupuestado = presupuestos.reduce((s, b) => s + Number(b.totalConMargen || 0), 0);
    const totalAceptado = presupuestos.filter(b => b.estado === 'aceptado').reduce((s, b) => s + Number(b.totalConMargen || 0), 0);
    const totalCobrado = presupuestos.reduce((s, b) => s + Number(b.totalPagado || 0), 0);
    const totalPendienteCobro = presupuestos.filter(b => b.estado === 'aceptado').reduce((s, b) => s + Number(b.pendientePago || 0), 0);

    let totalFacturado = 0;
    let totalFacturasCobradas = 0;
    let totalFacturasPendientes = 0;
    let facturas = [];
    if (client.crmClientId) {
      try {
        const invoicesDb = getInvoicesDbName();
        await ensureDatabase(req, invoicesDb);
        const allInvoices = await getAllDocuments(req, invoicesDb);
        const clientInvoices = allInvoices.filter(inv => inv.clientId === client.crmClientId && !inv.deletedAt);
        totalFacturado = clientInvoices.reduce((s, inv) => s + Number(inv.total || 0), 0);
        totalFacturasCobradas = clientInvoices.filter(inv => inv.status === 'paid').reduce((s, inv) => s + Number(inv.total || 0), 0);
        totalFacturasPendientes = clientInvoices.filter(inv => inv.status === 'pending' || inv.status === 'overdue').reduce((s, inv) => s + Number(inv.total || 0), 0);
        facturas = clientInvoices.slice(0, 10).map(inv => ({ _id: inv._id, numero: inv.number || '', total: inv.total || 0, estado: inv.status || '', fecha: inv.date || inv.createdAt || '' }));
      } catch { /* invoices DB may not exist */ }
    }

    const resumenEconomico = {
      totalPresupuestado, totalAceptado, totalCobrado, totalPendienteCobro,
      totalFacturado, totalFacturasCobradas, totalFacturasPendientes, facturas,
      numObrasActivas: obras.filter(o => o.estado === 'en_obra' || o.estado === 'planificacion').length,
      numObrasFinalizadas: obras.filter(o => o.estado === 'finalizada').length,
      numPresupuestosPendientes: presupuestos.filter(b => b.estado === 'enviado').length,
    };

    const today = new Date().toISOString().slice(0, 10);
    const alertas = [];
    if ((client.tipoCliente === 'empresa' || client.tipoCliente === 'autonomo') && (!client.cif || !client.razonSocial || !client.direccionFiscal)) {
      alertas.push({ id: `fiscal_${id}`, type: 'cliente_sin_datos_fiscales', severity: 'warning', label: 'Datos fiscales incompletos', detail: 'Faltan datos fiscales obligatorios', entityId: id, entityName: client.nombre, entityType: 'client', obraId: '', obraNombre: '' });
    }
    for (const b of presupuestos) {
      if (b.estado === 'aceptado' && Array.isArray(b.pagos)) {
        for (const p of b.pagos) {
          if (!p.pagado && p.fecha && p.fecha < today) {
            alertas.push({ id: `impago_${b._id}_${p.id}`, type: 'cliente_con_impagos', severity: 'high', label: 'Cobro vencido', detail: `${b.referencia}: ${p.concepto} — ${Number(p.importe).toLocaleString('es-ES')}€`, entityId: b._id, entityName: b.referencia, entityType: 'budget', obraId: '', obraNombre: '' });
          }
        }
      }
    }

    const history = buildClientHistory(client, obras, presupuestos);

    return res.json({
      ok: true,
      client: sanitizeConstructionClient(client),
      obras: obras.map(o => ({ _id: o._id, nombre: o.nombre, estado: o.estado, progreso: o.progreso, ubicacion: o.ubicacion, tipoObra: o.tipoObra, fechaInicio: o.fechaInicio, fechaFinPrevista: o.fechaFinPrevista })),
      presupuestos: presupuestos.map(b => ({ _id: b._id, referencia: b.referencia, estado: b.estado, totalConMargen: b.totalConMargen, totalPagado: b.totalPagado, pendientePago: b.pendientePago, fecha: b.fecha, proyectoNombre: b.proyectoNombre })),
      resumenEconomico,
      ultimasInteracciones: history.slice(0, 20),
      alertas,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener detalle' });
  }
}

function buildClientHistory(client, obras, presupuestos) {
  const entries = [];
  for (const n of (client.notasEstructuradas || [])) {
    entries.push({ id: n.id, tipo: 'nota', fecha: n.fecha, titulo: `Nota: ${n.tipo}`, detalle: n.texto, entidadId: client._id, entidadTipo: 'client', autor: n.autorNombre });
  }
  for (const o of obras) {
    entries.push({ id: `obra_${o._id}`, tipo: 'obra_creada', fecha: o.createdAt, titulo: `Obra creada: ${o.nombre}`, detalle: `${o.tipoObra || ''} — ${o.ubicacion || ''}`, entidadId: o._id, entidadTipo: 'project', autor: '' });
  }
  for (const b of presupuestos) {
    entries.push({ id: `pres_${b._id}`, tipo: b.estado === 'aceptado' ? 'presupuesto_aceptado' : b.estado === 'rechazado' ? 'presupuesto_rechazado' : 'presupuesto_enviado', fecha: b.updatedAt || b.createdAt, titulo: `Presupuesto ${b.referencia} — ${b.estado}`, detalle: `Total: ${Number(b.totalConMargen || 0).toLocaleString('es-ES')}€`, entidadId: b._id, entidadTipo: 'budget', autor: '' });
    if (Array.isArray(b.pagos)) {
      for (const p of b.pagos) {
        if (p.pagado) {
          entries.push({ id: `pago_${b._id}_${p.id}`, tipo: 'pago_registrado', fecha: p.fechaPago || b.updatedAt, titulo: `Pago registrado: ${p.concepto}`, detalle: `${Number(p.importe || 0).toLocaleString('es-ES')}€`, entidadId: b._id, entidadTipo: 'budget', autor: '' });
        }
      }
    }
  }
  entries.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  return entries;
}

export async function getClientNotes(req, res) {
  try {
    const { userId, id } = req.params;
    const client = await ensureOwner(req, userId, id, 'construction_client');
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });
    const notes = (client.notasEstructuradas || []).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    return res.json({ ok: true, notes });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar notas' });
  }
}

export async function createClientNote(req, res) {
  try {
    const { userId, id } = req.params;
    const { note } = req.body || {};
    if (!note || !note.texto) return badRequest(res, 'Falta texto de la nota');
    const existing = await ensureOwner(req, userId, id, 'construction_client');
    if (!existing) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const newNote = {
      id: `nota-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      texto: String(note.texto || ''),
      tipo: note.tipo || 'nota_interna',
      autor: String(note.autor || ''),
      autorNombre: String(note.autorNombre || ''),
      fecha: new Date().toISOString(),
      obraId: String(note.obraId || ''),
      obraNombre: String(note.obraNombre || ''),
      adjuntos: Array.isArray(note.adjuntos) ? note.adjuntos : [],
    };

    const notes = [...(existing.notasEstructuradas || []), newNote];
    const db = getConstructionDbName();
    const doc = buildConstructionClientDocument(userId, { ...existing, notasEstructuradas: notes }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.status(201).json({ ok: true, note: newNote, client: sanitizeConstructionClient({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear nota' });
  }
}

export async function getClientHistory(req, res) {
  try {
    const { userId, id } = req.params;
    const client = await ensureOwner(req, userId, id, 'construction_client');
    if (!client) return res.status(404).json({ ok: false, error: 'Cliente no encontrado' });

    const [projects, budgets] = await Promise.all([
      listConstructionDocsByType(req, userId, 'construction_project'),
      listConstructionDocsByType(req, userId, 'construction_budget'),
    ]);

    const obras = projects.filter(p => p.clienteId === id);
    const presupuestos = budgets.filter(b => b.clienteId === id);
    const history = buildClientHistory(client, obras, presupuestos);

    const limit = Math.min(Number(req.query?.limit) || 20, 100);
    const offset = Number(req.query?.offset) || 0;

    return res.json({ ok: true, history: history.slice(offset, offset + limit), total: history.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener histórico' });
  }
}

export async function checkClientDuplicates(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const { nombre, cif, telefono, email, excludeId } = req.body || {};

    const clients = await listConstructionDocsByType(req, userId, 'construction_client');
    const duplicates = [];

    const normPhone = (p) => String(p || '').replace(/\D/g, '').slice(-9);
    const normEmail = (e) => String(e || '').trim().toLowerCase();
    const normCif = (c) => String(c || '').replace(/[\s-]/g, '').toUpperCase();

    for (const c of clients) {
      if (excludeId && c._id === excludeId) continue;
      if (cif && normCif(cif) && normCif(c.cif) && normCif(cif) === normCif(c.cif)) {
        duplicates.push({ client: sanitizeConstructionClient(c), matchField: 'cif', matchScore: 100 });
        continue;
      }
      if (telefono && normPhone(telefono).length >= 9 && normPhone(telefono) === normPhone(c.telefono)) {
        duplicates.push({ client: sanitizeConstructionClient(c), matchField: 'telefono', matchScore: 100 });
        continue;
      }
      if (email && normEmail(email) && normEmail(email) === normEmail(c.email)) {
        duplicates.push({ client: sanitizeConstructionClient(c), matchField: 'email', matchScore: 100 });
        continue;
      }
      if (nombre && c.nombre) {
        const a = nombre.toLowerCase().trim();
        const b = c.nombre.toLowerCase().trim();
        if (a === b || a.includes(b) || b.includes(a)) {
          duplicates.push({ client: sanitizeConstructionClient(c), matchField: 'nombre', matchScore: a === b ? 100 : 80 });
        }
      }
    }

    return res.json({ ok: true, duplicates });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al buscar duplicados' });
  }
}

export async function searchClients(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const q = String(req.query?.q || '').toLowerCase().trim();
    if (!q) return res.json({ ok: true, clients: [] });

    const clients = await listConstructionDocsByType(req, userId, 'construction_client');
    const results = clients.filter(c =>
      (c.nombre || '').toLowerCase().includes(q) ||
      (c.cif || '').toLowerCase().includes(q) ||
      (c.telefono || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.razonSocial || '').toLowerCase().includes(q)
    ).slice(0, 10);

    return res.json({ ok: true, clients: results.map(sanitizeConstructionClient) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al buscar clientes' });
  }
}

export async function quickCreateClient(req, res) {
  try {
    const { userId } = req.params;
    const { client, vincularA } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!client || !client.nombre) return badRequest(res, 'Falta nombre del cliente');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const doc = buildConstructionClientDocument(userId, client);
    const saved = await putDocument(req, db, doc._id, doc);
    const newClient = sanitizeConstructionClient({ ...doc, _rev: saved.rev });

    let linkedEntity = null;
    if (vincularA && vincularA.tipo && vincularA.id) {
      const targetType = vincularA.tipo === 'obra' ? 'construction_project' : 'construction_budget';
      const target = await ensureOwner(req, userId, vincularA.id, targetType);
      if (target) {
        const builderFn = vincularA.tipo === 'obra' ? buildConstructionProjectDocument : buildConstructionBudgetDocument;
        const sanitizeFn = vincularA.tipo === 'obra' ? sanitizeConstructionProject : sanitizeConstructionBudget;
        const updated = builderFn(userId, { ...target, clienteId: doc._id, clienteNombre: doc.nombre }, target);
        const savedTarget = await putDocument(req, db, updated._id, updated);
        linkedEntity = sanitizeFn({ ...updated, _rev: savedTarget.rev });
      }
    }

    const allClients = await listConstructionDocsByType(req, userId, 'construction_client');
    const normPhone = (p) => String(p || '').replace(/\D/g, '').slice(-9);
    const duplicates = allClients.filter(c => c._id !== doc._id && (
      (doc.cif && c.cif && c.cif.replace(/[\s-]/g, '').toUpperCase() === doc.cif.replace(/[\s-]/g, '').toUpperCase()) ||
      (doc.telefono && normPhone(doc.telefono).length >= 9 && normPhone(doc.telefono) === normPhone(c.telefono)) ||
      (doc.email && c.email && c.email.toLowerCase() === doc.email.toLowerCase())
    )).map(c => sanitizeConstructionClient(c));

    await emitConstructionEvent(req, userId, 'construction:client_created', { clientId: doc._id, nombre: doc.nombre });

    return res.status(201).json({ ok: true, client: newClient, duplicates, linkedEntity });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear cliente rápido' });
  }
}

export async function convertLeadToClient(req, res) {
  try {
    const { userId } = req.params;
    const { leadId } = req.body || {};
    if (!userId || !leadId) return badRequest(res, 'Falta userId o leadId');

    const leadsDb = getLeadsDbName();
    await ensureDatabase(req, leadsDb);
    const lead = await getDocument(req, leadsDb, leadId);
    if (!lead || lead.user_id !== userId) return res.status(404).json({ ok: false, error: 'Lead no encontrado' });

    if (lead.convertedToConstructionClientId) {
      return res.status(409).json({ ok: false, error: 'Este lead ya fue convertido a cliente de obra' });
    }

    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const clientData = {
      nombre: lead.name || lead.nombre || '',
      telefono: lead.phone || lead.telefono || '',
      email: lead.email || '',
      razonSocial: lead.company || lead.empresa || '',
      tipoCliente: lead.company ? 'empresa' : 'particular',
      estadoComercial: 'contactado',
      crmLeadId: leadId,
      origenCliente: 'web',
    };

    const doc = buildConstructionClientDocument(userId, clientData);
    const saved = await putDocument(req, db, doc._id, doc);

    await putDocument(req, leadsDb, lead._id, { ...lead, convertedToConstructionClientId: doc._id, status: 'won', updatedAt: new Date().toISOString() });

    return res.status(201).json({ ok: true, client: sanitizeConstructionClient({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al convertir lead' });
  }
}

export async function importFromCrmClient(req, res) {
  try {
    const { userId } = req.params;
    const { crmClientId } = req.body || {};
    if (!userId || !crmClientId) return badRequest(res, 'Falta userId o crmClientId');

    const clientsDb = getClientsDbName();
    await ensureDatabase(req, clientsDb);
    const crmClient = await getDocument(req, clientsDb, crmClientId);
    if (!crmClient || crmClient.user_id !== userId) return res.status(404).json({ ok: false, error: 'Cliente CRM no encontrado' });

    const existing = await listConstructionDocsByType(req, userId, 'construction_client');
    const already = existing.find(c => c.crmClientId === crmClientId);
    if (already) return res.status(409).json({ ok: false, error: 'Este cliente CRM ya está vinculado', existingClient: sanitizeConstructionClient(already) });

    const db = getConstructionDbName();
    await ensureDatabase(req, db);

    const direcciones = (crmClient.addresses || []).map((a, i) => ({
      id: `dir-${i}-${Date.now()}`, etiqueta: a.label || '', tipo: 'otro',
      calle: a.street || '', numero: '', piso: '', codigoPostal: a.postalCode || '',
      ciudad: a.city || '', provincia: a.state || '', pais: a.country || 'España',
      esPrincipal: Boolean(a.isPrimary), coordenadas: null,
    }));

    const contactos = (crmClient.contacts || []).map((c, i) => ({
      id: `cnt-${i}-${Date.now()}`, nombre: c.name || '', cargo: c.role || c.position || '',
      telefono: c.phone || '', email: c.email || '', notas: '', esPrincipal: Boolean(c.isPrimary),
    }));

    const clientData = {
      nombre: crmClient.name || '',
      cif: crmClient.fiscalId || crmClient.dni || '',
      telefono: crmClient.phone || '',
      email: crmClient.email || '',
      direccion: crmClient.address || '',
      tipoCliente: crmClient.clientType === 'empresa' ? 'empresa' : crmClient.clientType === 'autonomo' ? 'autonomo' : 'particular',
      razonSocial: crmClient.legalName || '',
      direccionFiscal: crmClient.fiscalAddress || '',
      ciudadFiscal: crmClient.fiscalCity || '',
      cpFiscal: crmClient.fiscalPostalCode || '',
      paisFiscal: crmClient.fiscalCountry || 'España',
      estadoComercial: 'contactado',
      crmClientId,
      direcciones,
      contactos,
      tags: crmClient.tags || [],
    };

    const doc = buildConstructionClientDocument(userId, clientData);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.status(201).json({ ok: true, client: sanitizeConstructionClient({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al importar cliente CRM' });
  }
}

export async function linkCrmClient(req, res) {
  try {
    const { userId } = req.params;
    const { constructionClientId, crmClientId } = req.body || {};
    if (!userId || !constructionClientId || !crmClientId) return badRequest(res, 'Faltan parámetros');

    const existing = await ensureOwner(req, userId, constructionClientId, 'construction_client');
    if (!existing) return res.status(404).json({ ok: false, error: 'Cliente de obra no encontrado' });

    const db = getConstructionDbName();
    const doc = buildConstructionClientDocument(userId, { ...existing, crmClientId }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, client: sanitizeConstructionClient({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al vincular cliente CRM' });
  }
}

// ─── GUILDS (GREMIOS) ─────────────────────────────────────────────────────────

export async function listGuilds(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const items = await listConstructionDocsByType(req, userId, 'construction_guild');
    return res.json({ ok: true, guilds: items.map(sanitizeConstructionGuild) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar gremios' });
  }
}

export async function createGuild(req, res) {
  try {
    const { userId } = req.params;
    const { guild } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!guild || typeof guild !== 'object') return badRequest(res, 'Falta el objeto guild');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const doc = buildConstructionGuildDocument(userId, guild);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'construction_guild', action: `Creó gremio ${doc.nombre} (${doc.tipo})`,
      entityId: doc._id, entityLabel: doc.nombre, metadata: { tipo: doc.tipo },
    });
    return res.status(201).json({ ok: true, guild: sanitizeConstructionGuild({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear gremio' });
  }
}

export async function updateGuild(req, res) {
  try {
    const { userId, id } = req.params;
    const { guild } = req.body || {};
    if (!guild) return badRequest(res, 'Faltan datos');
    const existing = await ensureOwner(req, userId, id, 'construction_guild');
    if (!existing) return res.status(404).json({ ok: false, error: 'Gremio no encontrado' });
    const db = getConstructionDbName();
    const doc = buildConstructionGuildDocument(userId, { ...existing, ...guild }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, guild: sanitizeConstructionGuild({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar gremio' });
  }
}

export async function removeGuild(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_guild');
    if (!existing) return res.status(404).json({ ok: false, error: 'Gremio no encontrado' });
    const db = getConstructionDbName();
    await softDeleteDocument(req, db, id);
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar gremio' });
  }
}

// ─── PROJECTS (OBRAS) ─────────────────────────────────────────────────────────

export async function listProjects(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const items = await listConstructionDocsByType(req, userId, 'construction_project');
    return res.json({ ok: true, projects: items.map(sanitizeConstructionProject) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar proyectos' });
  }
}

export async function createProject(req, res) {
  try {
    const { userId } = req.params;
    const { project } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!project || typeof project !== 'object') return badRequest(res, 'Falta el objeto project');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const doc = buildConstructionProjectDocument(userId, project);
    const saved = await putDocument(req, db, doc._id, doc);
    const projectSaved = { ...doc, _rev: saved.rev };
    try {
      await seedDefaultObraDocumentsForProject(req, userId, projectSaved);
    } catch {
      /* no bloquear creación */
    }
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'construction_project', action: `Creó obra ${doc.nombre}`,
      entityId: doc._id, entityLabel: doc.nombre, metadata: { tipoObra: doc.tipoObra },
    });
    await emitConstructionEvent(req, userId, 'construction:project_updated', { projectId: doc._id, action: 'created' });
    return res.status(201).json({ ok: true, project: sanitizeConstructionProject(projectSaved) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear proyecto' });
  }
}

export async function updateProject(req, res) {
  try {
    const { userId, id } = req.params;
    const { project } = req.body || {};
    if (!project) return badRequest(res, 'Faltan datos');
    const existing = await ensureOwner(req, userId, id, 'construction_project');
    if (!existing) return res.status(404).json({ ok: false, error: 'Proyecto no encontrado' });
    if (existing.estado === 'cerrada' || existing.archivada) {
      return res.status(403).json({ ok: false, error: 'La obra está cerrada y archivada. Solo consulta o reapertura autorizada.' });
    }
    const db = getConstructionDbName();
    const doc = buildConstructionProjectDocument(userId, { ...existing, ...project }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, project: sanitizeConstructionProject({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar proyecto' });
  }
}

export async function removeProject(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_project');
    if (!existing) return res.status(404).json({ ok: false, error: 'Proyecto no encontrado' });
    const db = getConstructionDbName();
    await softDeleteDocument(req, db, id);
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar proyecto' });
  }
}

// ─── BUDGETS (PRESUPUESTOS) ───────────────────────────────────────────────────

export async function listBudgets(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const items = await listConstructionDocsByType(req, userId, 'construction_budget');
    return res.json({ ok: true, budgets: items.map(sanitizeConstructionBudget) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar presupuestos' });
  }
}

export async function createBudget(req, res) {
  try {
    const { userId } = req.params;
    const { budget } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!budget || typeof budget !== 'object') return badRequest(res, 'Falta el objeto budget');
    if (budget.proyectoId) {
      const proj = await ensureOwner(req, userId, budget.proyectoId, 'construction_project');
      if (proj && (proj.estado === 'cerrada' || proj.archivada)) {
        return res.status(403).json({ ok: false, error: 'No se pueden crear presupuestos en una obra cerrada.' });
      }
    }
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const doc = buildConstructionBudgetDocument(userId, budget);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'construction_budget', action: `Creó presupuesto ${doc.referencia}`,
      entityId: doc._id, entityLabel: doc.referencia, metadata: { estado: doc.estado, tipoObra: doc.tipoObra },
    });
    return res.status(201).json({ ok: true, budget: sanitizeConstructionBudget({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear presupuesto' });
  }
}

export async function updateBudget(req, res) {
  try {
    const { userId, id } = req.params;
    const { budget } = req.body || {};
    if (!budget) return badRequest(res, 'Faltan datos');
    const existing = await ensureOwner(req, userId, id, 'construction_budget');
    if (!existing) return res.status(404).json({ ok: false, error: 'Presupuesto no encontrado' });
    if (existing.proyectoId) {
      const proj = await ensureOwner(req, userId, existing.proyectoId, 'construction_project');
      if (proj && (proj.estado === 'cerrada' || proj.archivada)) {
        return res.status(403).json({ ok: false, error: 'No se pueden modificar presupuestos de una obra cerrada.' });
      }
    }
    const db = getConstructionDbName();
    const doc = buildConstructionBudgetDocument(userId, { ...existing, ...budget }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, budget: sanitizeConstructionBudget({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar presupuesto' });
  }
}

// ─── AUTO-CONVERSIÓN PRESUPUESTO → OBRA ────────────────────────────────────

async function convertBudgetToProject(req, userId, budget, account) {
  const db = getConstructionDbName();
  const now = new Date().toISOString();
  const actorName = account?.fullName || 'Sistema';

  const gremios = [...new Set((budget.partidas || []).map(p => p.gremio).filter(Boolean))];
  const obraNombre = `Obra — ${budget.referencia} — ${budget.clienteNombre || 'Sin cliente'}`;

  let projectDoc;
  let reactivated = false;

  if (budget.obraGeneradaId) {
    try {
      const existingProject = await getDocument(req, db, budget.obraGeneradaId);
      if (existingProject && existingProject.type === 'construction_project' && existingProject.user_id === userId) {
        const newHistorial = [...(existingProject.historial || []), {
          fecha: now, accion: 'reactivacion', actor: actorName,
          detalle: `Obra reactivada por re-aceptación del presupuesto ${budget.referencia}`,
        }];
        projectDoc = buildConstructionProjectDocument(userId, {
          ...existingProject,
          estado: 'pendiente_planificacion',
          historial: newHistorial,
        }, existingProject);
        reactivated = true;
      }
    } catch { /* obra no existe, crear nueva */ }
  }

  if (!projectDoc) {
    projectDoc = buildConstructionProjectDocument(userId, {
      nombre: obraNombre,
      tipoObra: budget.tipoObra,
      ubicacion: budget.direccionObra || '',
      clienteId: budget.clienteId,
      clienteNombre: budget.clienteNombre,
      presupuestoId: budget._id,
      presupuestoRef: budget.referencia,
      importeTotal: budget.totalConMargen || 0,
      partidas: budget.partidas || [],
      gremios,
      responsableId: userId,
      responsableNombre: actorName,
      fechaAceptacion: now,
      origenAutoConversion: true,
      estado: 'pendiente_planificacion',
      historial: [{
        fecha: now, accion: 'creacion_automatica', actor: actorName,
        detalle: `Obra creada automáticamente desde presupuesto ${budget.referencia} (${budget.totalConMargen?.toFixed(2) || 0} €)`,
      }],
    });
  }

  const savedProject = await putDocument(req, db, projectDoc._id, projectDoc);

  const updatedBudget = buildConstructionBudgetDocument(userId, {
    ...budget,
    obraGeneradaId: projectDoc._id,
    proyectoId: projectDoc._id,
    proyectoNombre: projectDoc.nombre,
  }, budget);
  const savedBudget = await putDocument(req, db, updatedBudget._id, updatedBudget);

  await logAccountActivity(req, {
    actorUserId: userId, actorName, targetUserId: userId,
    type: 'construction_project',
    action: reactivated
      ? `Reactivó obra "${projectDoc.nombre}" desde presupuesto ${budget.referencia}`
      : `Obra "${projectDoc.nombre}" creada automáticamente desde presupuesto ${budget.referencia}`,
    entityId: projectDoc._id, entityLabel: projectDoc.nombre,
    metadata: { presupuestoId: budget._id, presupuestoRef: budget.referencia, reactivated },
  });

  return {
    project: { ...projectDoc, _rev: savedProject.rev },
    updatedBudget: { ...updatedBudget, _rev: savedBudget.rev },
    reactivated,
  };
}

async function notifyBudgetConversion(req, userId, budget, project, reactivated) {
  try {
    const action = reactivated ? 'reactivada' : 'creada automáticamente';
    const notification = buildNotificationDocument({
      userId,
      level: 'info',
      category: 'construction',
      title: 'Obra creada desde presupuesto',
      message: `El presupuesto ${budget.referencia} ha sido aceptado. Se ha ${action} la obra "${project.nombre}" en estado pendiente de planificación.`,
      entityId: project._id,
      entityType: 'construction_project',
      route: '/saas/construction/projects',
      metadata: { presupuestoId: budget._id, presupuestoRef: budget.referencia, projectId: project._id },
    });
    const saved = await saveNotification(req, notification);
    const sanitized = sanitizeNotification(saved);

    broadcastToUser(userId, 'notification', sanitized);
    broadcastToUser(userId, 'construction_project_created', {
      projectId: project._id, presupuestoId: budget._id,
    });

    sendPushToUser(req, userId, {
      title: sanitized.title,
      body: sanitized.message,
      data: { route: '/saas/construction/projects', notificationId: sanitized.id },
    }).catch(() => null);
  } catch { /* non-blocking */ }
}

const ROLES_ACCEPT_BUDGET = ['Admin', 'Gerente'];

export async function acceptBudget(req, res) {
  try {
    const { userId, id } = req.params;
    const { metodoPago, numPlazos } = req.body || {};

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    if (!ROLES_ACCEPT_BUDGET.includes(account.role)) {
      return res.status(403).json({ ok: false, error: 'Solo el gerente o administrador puede aceptar presupuestos' });
    }

    const existing = await ensureOwner(req, userId, id, 'construction_budget');
    if (!existing) return res.status(404).json({ ok: false, error: 'Presupuesto no encontrado' });
    if (existing.estado === 'aceptado') return badRequest(res, 'El presupuesto ya está aceptado');

    const now = new Date().toISOString();
    const total = existing.totalConMargen || 0;
    let pagos = [];

    if (metodoPago === 'contado') {
      pagos = [{ id: 1, concepto: 'Pago único al contado', importe: total, fecha: '', pagado: false }];
    } else {
      const plazos = Math.max(1, Number(numPlazos) || 3);
      const importePlazo = Math.round((total / plazos) * 100) / 100;
      pagos = Array.from({ length: plazos }, (_, i) => ({
        id: i + 1,
        concepto: `Plazo ${i + 1} de ${plazos}`,
        importe: i === plazos - 1 ? total - importePlazo * (plazos - 1) : importePlazo,
        fecha: '',
        pagado: false,
      }));
    }

    const db = getConstructionDbName();
    const doc = buildConstructionBudgetDocument(userId, {
      ...existing, estado: 'aceptado', metodoPago: metodoPago || 'contado',
      numPlazos: Number(numPlazos) || 1, pagos, fechaAceptacion: now,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'construction_budget', action: `Aceptó presupuesto ${doc.referencia} — ${metodoPago}`,
      entityId: doc._id, entityLabel: doc.referencia, metadata: { metodoPago, numPlazos },
    });

    try {
      await generatePaymentLinesFromBudget(req, userId, doc);
    } catch { /* non-blocking */ }

    let project = null;
    let autoConverted = false;
    let conversionError = null;

    try {
      const budgetWithRev = { ...doc, _rev: saved.rev };
      const result = await convertBudgetToProject(req, userId, budgetWithRev, account);
      project = sanitizeConstructionProject(result.project);
      autoConverted = true;

      await notifyBudgetConversion(req, userId, budgetWithRev, result.project, result.reactivated);

      return res.json({
        ok: true,
        budget: sanitizeConstructionBudget(result.updatedBudget),
        project,
        autoConverted,
      });
    } catch (err) {
      conversionError = err?.message || 'Error en la conversión automática';
    }

    return res.json({
      ok: true,
      budget: sanitizeConstructionBudget({ ...doc, _rev: saved.rev }),
      project,
      autoConverted,
      conversionError,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al aceptar presupuesto' });
  }
}

export async function registerPayment(req, res) {
  try {
    const { userId, id } = req.params;
    const { pagoId } = req.body || {};
    const existing = await ensureOwner(req, userId, id, 'construction_budget');
    if (!existing) return res.status(404).json({ ok: false, error: 'Presupuesto no encontrado' });

    const pagos = (existing.pagos || []).map(p =>
      p.id === Number(pagoId) ? { ...p, pagado: true, fecha: new Date().toISOString().slice(0, 10) } : p
    );

    const db = getConstructionDbName();
    const doc = buildConstructionBudgetDocument(userId, { ...existing, pagos }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, budget: sanitizeConstructionBudget({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al registrar pago' });
  }
}

export async function removeBudget(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_budget');
    if (!existing) return res.status(404).json({ ok: false, error: 'Presupuesto no encontrado' });
    const db = getConstructionDbName();
    await softDeleteDocument(req, db, id);
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar presupuesto' });
  }
}

export async function sendBudget(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_budget');
    if (!existing) return res.status(404).json({ ok: false, error: 'Presupuesto no encontrado' });
    if (existing.estado !== 'borrador') return badRequest(res, 'Solo se pueden enviar presupuestos en borrador');
    if (!existing.clienteId) return badRequest(res, 'El presupuesto debe tener un cliente asignado');
    if (!existing.partidas || existing.partidas.length === 0) return badRequest(res, 'El presupuesto debe tener al menos una partida');

    const db = getConstructionDbName();
    const doc = buildConstructionBudgetDocument(userId, {
      ...existing, estado: 'enviado', enviadoAt: new Date().toISOString(),
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    const account = await findAccountByUserId(req, userId);
    if (account) {
      await logAccountActivity(req, {
        actorUserId: userId, actorName: account.fullName, targetUserId: userId,
        type: 'construction_budget', action: `Envió presupuesto ${doc.referencia} a ${doc.clienteNombre}`,
        entityId: doc._id, entityLabel: doc.referencia, metadata: { clienteId: doc.clienteId },
      });
    }

    return res.json({ ok: true, budget: sanitizeConstructionBudget({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al enviar presupuesto' });
  }
}

export async function rejectBudget(req, res) {
  try {
    const { userId, id } = req.params;
    const { motivoRechazo } = req.body || {};
    const existing = await ensureOwner(req, userId, id, 'construction_budget');
    if (!existing) return res.status(404).json({ ok: false, error: 'Presupuesto no encontrado' });
    if (existing.estado === 'aceptado') return badRequest(res, 'No se puede rechazar un presupuesto ya aceptado');
    if (existing.estado === 'rechazado') return badRequest(res, 'El presupuesto ya está rechazado');

    const db = getConstructionDbName();
    const doc = buildConstructionBudgetDocument(userId, {
      ...existing, estado: 'rechazado', motivoRechazo: motivoRechazo || '',
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    const account = await findAccountByUserId(req, userId);
    if (account) {
      await logAccountActivity(req, {
        actorUserId: userId, actorName: account.fullName, targetUserId: userId,
        type: 'construction_budget', action: `Rechazó presupuesto ${doc.referencia}`,
        entityId: doc._id, entityLabel: doc.referencia, metadata: { motivoRechazo: motivoRechazo || '' },
      });
    }

    return res.json({ ok: true, budget: sanitizeConstructionBudget({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al rechazar presupuesto' });
  }
}

// ─── BUDGET TEMPLATES (PLANTILLAS DE PARTIDAS) ───────────────────────────────

export async function listBudgetTemplates(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const items = await listConstructionDocsByType(req, userId, 'construction_budget_template');
    return res.json({ ok: true, templates: items.map(sanitizeConstructionBudgetTemplate) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar plantillas' });
  }
}

export async function createBudgetTemplate(req, res) {
  try {
    const { userId } = req.params;
    const { template } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!template || typeof template !== 'object') return badRequest(res, 'Falta el objeto template');
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const doc = buildConstructionBudgetTemplateDocument(userId, template);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.status(201).json({ ok: true, template: sanitizeConstructionBudgetTemplate({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear plantilla' });
  }
}

export async function updateBudgetTemplate(req, res) {
  try {
    const { userId, id } = req.params;
    const { template } = req.body || {};
    if (!template) return badRequest(res, 'Faltan datos');
    const existing = await ensureOwner(req, userId, id, 'construction_budget_template');
    if (!existing) return res.status(404).json({ ok: false, error: 'Plantilla no encontrada' });
    const db = getConstructionDbName();
    const doc = buildConstructionBudgetTemplateDocument(userId, { ...existing, ...template }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, template: sanitizeConstructionBudgetTemplate({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar plantilla' });
  }
}

export async function removeBudgetTemplate(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_budget_template');
    if (!existing) return res.status(404).json({ ok: false, error: 'Plantilla no encontrada' });
    const db = getConstructionDbName();
    await softDeleteDocument(req, db, id);
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar plantilla' });
  }
}

// ─── WORKERS (TRABAJADORES) ───────────────────────────────────────────────────

export async function listWorkers(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const items = await listConstructionDocsByType(req, userId, 'construction_worker');
    return res.json({ ok: true, workers: items.map(sanitizeConstructionWorker) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar trabajadores' });
  }
}

export async function createWorker(req, res) {
  try {
    const { userId } = req.params;
    const { worker } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!worker || typeof worker !== 'object') return badRequest(res, 'Falta el objeto worker');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const doc = buildConstructionWorkerDocument(userId, worker);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'construction_worker', action: `Registró trabajador ${doc.nombre}`,
      entityId: doc._id, entityLabel: doc.nombre, metadata: { gremio: doc.gremio },
    });
    return res.status(201).json({ ok: true, worker: sanitizeConstructionWorker({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear trabajador' });
  }
}

export async function updateWorker(req, res) {
  try {
    const { userId, id } = req.params;
    const { worker } = req.body || {};
    if (!worker) return badRequest(res, 'Faltan datos');
    const existing = await ensureOwner(req, userId, id, 'construction_worker');
    if (!existing) return res.status(404).json({ ok: false, error: 'Trabajador no encontrado' });
    const db = getConstructionDbName();
    const doc = buildConstructionWorkerDocument(userId, { ...existing, ...worker }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, worker: sanitizeConstructionWorker({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar trabajador' });
  }
}

export async function removeWorker(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_worker');
    if (!existing) return res.status(404).json({ ok: false, error: 'Trabajador no encontrado' });
    const db = getConstructionDbName();
    await softDeleteDocument(req, db, id);
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar trabajador' });
  }
}

// ─── TASKS (TAREAS DE OBRA) ───────────────────────────────────────────────────

export async function listTasks(req, res) {
  try {
    const { userId } = req.params;
    const { workerId, projectId } = req.query || {};
    if (!userId) return badRequest(res, 'Falta userId');
    let items = await listConstructionDocsByType(req, userId, 'construction_task');
    if (workerId) items = items.filter(t => t.trabajadorId === workerId);
    if (projectId) items = items.filter(t => t.obraId === projectId);
    return res.json({ ok: true, tasks: items.map(sanitizeConstructionTask) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar tareas' });
  }
}

export async function createTask(req, res) {
  try {
    const { userId } = req.params;
    const { task } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!task || typeof task !== 'object') return badRequest(res, 'Falta el objeto task');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const doc = buildConstructionTaskDocument(userId, {
      ...task,
      creadoPor: userId,
      creadoPorNombre: account.fullName,
    });
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'construction_task', action: `Creó tarea "${doc.titulo}" para ${doc.trabajadorNombre || 'sin asignar'}`,
      entityId: doc._id, entityLabel: doc.titulo, metadata: { prioridad: doc.prioridad, trabajadorId: doc.trabajadorId },
    });
    return res.status(201).json({ ok: true, task: sanitizeConstructionTask({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear tarea' });
  }
}

export async function updateTask(req, res) {
  try {
    const { userId, id } = req.params;
    const { task } = req.body || {};
    if (!task) return badRequest(res, 'Faltan datos');
    const existing = await ensureOwner(req, userId, id, 'construction_task');
    if (!existing) return res.status(404).json({ ok: false, error: 'Tarea no encontrada' });
    if (existing.obraId) {
      const proj = await ensureOwner(req, userId, existing.obraId, 'construction_project');
      if (proj && (proj.estado === 'cerrada' || proj.archivada)) {
        return res.status(403).json({ ok: false, error: 'No se pueden modificar tareas de una obra cerrada.' });
      }
    }
    const db = getConstructionDbName();
    const doc = buildConstructionTaskDocument(userId, { ...existing, ...task }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, task: sanitizeConstructionTask({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar tarea' });
  }
}

export async function removeTask(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_task');
    if (!existing) return res.status(404).json({ ok: false, error: 'Tarea no encontrada' });
    const db = getConstructionDbName();
    await softDeleteDocument(req, db, id);
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar tarea' });
  }
}

// ─── DAILY REPORTS (PARTES DIARIOS DE OBRA) ─────────────────────────────────

export async function listDailyReports(req, res) {
  try {
    const { userId } = req.params;
    const { projectId, workerId, dateFrom, dateTo, estado } = req.query || {};
    if (!userId) return badRequest(res, 'Falta userId');
    let items = await listConstructionDocsByType(req, userId, 'construction_daily_report');
    if (projectId) items = items.filter(r => r.obraId === projectId);
    if (workerId) items = items.filter(r => r.trabajadorId === workerId);
    if (dateFrom) items = items.filter(r => r.fecha >= dateFrom);
    if (dateTo) items = items.filter(r => r.fecha <= dateTo);
    if (estado) items = items.filter(r => r.estado === estado);
    return res.json({ ok: true, reports: items.map(sanitizeConstructionDailyReport) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar partes' });
  }
}

export async function createDailyReport(req, res) {
  try {
    const { userId } = req.params;
    const { report } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!report || typeof report !== 'object') return badRequest(res, 'Falta el objeto report');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const historial = [{ accion: 'creado', usuario: account.fullName, fecha: new Date().toISOString(), detalle: '' }];
    const doc = buildConstructionDailyReportDocument(userId, {
      ...report,
      creadoPor: userId,
      creadoPorNombre: account.fullName,
      historial,
    });
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'construction_daily_report', action: `Creó parte ${doc.referencia} en obra ${doc.obraNombre}`,
      entityId: doc._id, entityLabel: doc.referencia, metadata: { obraId: doc.obraId, trabajadorId: doc.trabajadorId },
    });
    return res.status(201).json({ ok: true, report: sanitizeConstructionDailyReport({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear parte' });
  }
}

export async function updateDailyReport(req, res) {
  try {
    const { userId, id } = req.params;
    const { report } = req.body || {};
    if (!report) return badRequest(res, 'Faltan datos');
    const existing = await ensureOwner(req, userId, id, 'construction_daily_report');
    if (!existing) return res.status(404).json({ ok: false, error: 'Parte no encontrado' });
    if (existing.estado === 'validado') return badRequest(res, 'No se puede editar un parte validado');
    const account = await findAccountByUserId(req, userId);
    const historial = [...(existing.historial || []), {
      accion: 'editado', usuario: account?.fullName || userId, fecha: new Date().toISOString(), detalle: '',
    }];
    const db = getConstructionDbName();
    const doc = buildConstructionDailyReportDocument(userId, { ...existing, ...report, historial }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, report: sanitizeConstructionDailyReport({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar parte' });
  }
}

export async function removeDailyReport(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_daily_report');
    if (!existing) return res.status(404).json({ ok: false, error: 'Parte no encontrado' });
    if (existing.estado !== 'borrador') return res.status(403).json({ ok: false, error: 'Solo se pueden eliminar partes en borrador' });
    const db = getConstructionDbName();
    await softDeleteDocument(req, db, id);
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar parte' });
  }
}

export async function submitDailyReport(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_daily_report');
    if (!existing) return res.status(404).json({ ok: false, error: 'Parte no encontrado' });
    if (existing.estado !== 'borrador' && existing.estado !== 'rechazado') {
      return badRequest(res, 'Solo se pueden enviar partes en borrador o rechazados');
    }
    if (!existing.obraId) return badRequest(res, 'Falta la obra');
    if (!existing.trabajadorId) return badRequest(res, 'Falta el trabajador');
    if (!existing.horasTrabajadas || existing.horasTrabajadas <= 0) return badRequest(res, 'Las horas deben ser > 0');
    if (!existing.descripcion) return badRequest(res, 'Falta la descripción del trabajo');

    const account = await findAccountByUserId(req, userId);
    const db = getConstructionDbName();
    const historial = [...(existing.historial || []), {
      accion: 'enviado', usuario: account?.fullName || userId, fecha: new Date().toISOString(), detalle: '',
    }];

    // Si tiene incidencia, crear documento de incidencia independiente
    let incidenciaData = existing.incidencia;
    if (existing.tieneIncidencia && existing.incidencia && !existing.incidencia.incidenciaId) {
      const incDoc = buildConstructionIncidentDocument(userId, {
        obraId: existing.obraId,
        obraNombre: existing.obraNombre,
        parteId: existing._id,
        parteReferencia: existing.referencia,
        reportadoPor: existing.trabajadorId,
        reportadoPorNombre: existing.trabajadorNombre,
        tipo: existing.incidencia.tipo,
        descripcion: existing.incidencia.descripcion,
        gravedad: existing.incidencia.gravedad,
        fotos: existing.incidencia.fotos,
        historial: [{ accion: 'creada_desde_parte', usuario: account?.fullName || userId, fecha: new Date().toISOString(), detalle: `Creada desde parte ${existing.referencia}` }],
      });
      await putDocument(req, db, incDoc._id, incDoc);
      incidenciaData = { ...existing.incidencia, incidenciaId: incDoc._id };
    }

    const doc = buildConstructionDailyReportDocument(userId, {
      ...existing, estado: 'enviado', historial, incidencia: incidenciaData,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    return res.json({ ok: true, report: sanitizeConstructionDailyReport({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al enviar parte' });
  }
}

export async function validateDailyReport(req, res) {
  try {
    const { userId, id } = req.params;
    const { validadoPor, validadoPorNombre } = req.body || {};
    const existing = await ensureOwner(req, userId, id, 'construction_daily_report');
    if (!existing) return res.status(404).json({ ok: false, error: 'Parte no encontrado' });
    if (existing.estado !== 'enviado') return badRequest(res, 'Solo se pueden validar partes enviados');

    const account = await findAccountByUserId(req, userId);
    const now = new Date().toISOString();
    const db = getConstructionDbName();
    const historial = [...(existing.historial || []), {
      accion: 'validado', usuario: validadoPorNombre || account?.fullName || userId, fecha: now, detalle: '',
    }];

    const doc = buildConstructionDailyReportDocument(userId, {
      ...existing, estado: 'validado',
      validadoPor: validadoPor || userId,
      validadoPorNombre: validadoPorNombre || account?.fullName || '',
      validadoAt: now, historial,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    // ── Automatizaciones al validar ──
    try {
      // 1. Sumar horas y coste a la obra
      if (existing.obraId) {
        const project = await getDocument(req, db, existing.obraId);
        if (project && project.type === 'construction_project') {
          const horasAcumuladas = (Number(project.horasAcumuladas) || 0) + (Number(existing.horasTrabajadas) || 0);
          const costeAcumulado = (Number(project.costeAcumulado) || 0) + (Number(existing.costeTotal) || 0);
          const horasEstimadas = Number(project.horasEstimadas) || 0;
          const progreso = horasEstimadas > 0 ? Math.min(100, Math.round((horasAcumuladas / horasEstimadas) * 100)) : project.progreso;
          const updatedProject = buildConstructionProjectDocument(userId, {
            ...project, horasAcumuladas, costeAcumulado, progreso,
          }, project);
          await putDocument(req, db, updatedProject._id, updatedProject);
        }
      }

      // 2. Marcar tarea como en_progreso si estaba pendiente
      if (existing.tareaId) {
        const task = await getDocument(req, db, existing.tareaId);
        if (task && task.type === 'construction_task' && task.estado === 'pendiente') {
          const updatedTask = buildConstructionTaskDocument(userId, { ...task, estado: 'en_progreso' }, task);
          await putDocument(req, db, updatedTask._id, updatedTask);
        }
      }
    } catch (_automationErr) {
      // No bloquear la validación si falla una automatización secundaria
    }

    return res.json({ ok: true, report: sanitizeConstructionDailyReport({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al validar parte' });
  }
}

export async function rejectDailyReport(req, res) {
  try {
    const { userId, id } = req.params;
    const { motivoRechazo } = req.body || {};
    const existing = await ensureOwner(req, userId, id, 'construction_daily_report');
    if (!existing) return res.status(404).json({ ok: false, error: 'Parte no encontrado' });
    if (existing.estado !== 'enviado') return badRequest(res, 'Solo se pueden rechazar partes enviados');

    const account = await findAccountByUserId(req, userId);
    const db = getConstructionDbName();
    const historial = [...(existing.historial || []), {
      accion: 'rechazado', usuario: account?.fullName || userId, fecha: new Date().toISOString(),
      detalle: motivoRechazo || '',
    }];

    const doc = buildConstructionDailyReportDocument(userId, {
      ...existing, estado: 'rechazado', motivoRechazo: motivoRechazo || '', historial,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, report: sanitizeConstructionDailyReport({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al rechazar parte' });
  }
}

// ─── INCIDENTS (INCIDENCIAS DE OBRA) ─────────────────────────────────────────

export async function listIncidents(req, res) {
  try {
    const { userId } = req.params;
    const { projectId, estado, prioridad, gravedad, tipo, workerId } = req.query || {};
    if (!userId) return badRequest(res, 'Falta userId');
    let items = await listConstructionDocsByType(req, userId, 'construction_incident');
    if (projectId) items = items.filter(i => i.obraId === projectId);
    if (estado) items = items.filter(i => i.estado === estado);
    if (prioridad) items = items.filter(i => (i.prioridad || i.gravedad) === prioridad);
    if (gravedad) items = items.filter(i => (i.gravedad || i.prioridad) === gravedad);
    if (tipo) items = items.filter(i => i.tipo === tipo);
    if (workerId) items = items.filter(i => i.trabajadorId === workerId);
    return res.json({ ok: true, incidents: items.map(sanitizeConstructionIncident) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar incidencias' });
  }
}

export async function createIncident(req, res) {
  try {
    const { userId } = req.params;
    const { incident } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!incident || typeof incident !== 'object') return badRequest(res, 'Falta el objeto incident');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const historial = [{ accion: 'creada', usuario: account.fullName, fecha: new Date().toISOString(), detalle: '' }];
    const doc = buildConstructionIncidentDocument(userId, { ...incident, historial });
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'construction_incident', action: `Creó incidencia ${doc.referencia} en obra ${doc.obraNombre}`,
      entityId: doc._id, entityLabel: doc.referencia, metadata: { tipo: doc.tipo, prioridad: doc.prioridad },
    });
    return res.status(201).json({ ok: true, incident: sanitizeConstructionIncident({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear incidencia' });
  }
}

export async function updateIncident(req, res) {
  try {
    const { userId, id } = req.params;
    const { incident } = req.body || {};
    if (!incident) return badRequest(res, 'Faltan datos');
    const existing = await ensureOwner(req, userId, id, 'construction_incident');
    if (!existing) return res.status(404).json({ ok: false, error: 'Incidencia no encontrada' });
    const account = await findAccountByUserId(req, userId);
    const cambios = [];
    if (incident.estado && incident.estado !== existing.estado) cambios.push(`estado → ${incident.estado}`);
    if (incident.asignadoANombre && incident.asignadoANombre !== existing.asignadoANombre) cambios.push(`asignada a ${incident.asignadoANombre}`);
    if (incident.prioridad && incident.prioridad !== existing.prioridad) cambios.push(`prioridad → ${incident.prioridad}`);
    const historial = [...(existing.historial || []), {
      accion: 'editada', usuario: account?.fullName || userId, fecha: new Date().toISOString(),
      detalle: cambios.length > 0 ? cambios.join(', ') : '',
    }];
    const db = getConstructionDbName();
    const doc = buildConstructionIncidentDocument(userId, { ...existing, ...incident, historial }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, incident: sanitizeConstructionIncident({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar incidencia' });
  }
}

export async function resolveIncident(req, res) {
  try {
    const { userId, id } = req.params;
    const { resolucion } = req.body || {};
    const existing = await ensureOwner(req, userId, id, 'construction_incident');
    if (!existing) return res.status(404).json({ ok: false, error: 'Incidencia no encontrada' });
    if (existing.estado === 'cerrada') return badRequest(res, 'La incidencia ya está cerrada');

    const account = await findAccountByUserId(req, userId);
    const now = new Date().toISOString();
    const historial = [...(existing.historial || []), {
      accion: 'resuelta', usuario: account?.fullName || userId, fecha: now, detalle: resolucion || '',
    }];
    const db = getConstructionDbName();
    const doc = buildConstructionIncidentDocument(userId, {
      ...existing, estado: 'resuelta', resolucion: resolucion || '', fechaResolucion: now,
      resueltoPor: account?.fullName || userId, historial,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, incident: sanitizeConstructionIncident({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al resolver incidencia' });
  }
}

export async function reopenIncident(req, res) {
  try {
    const { userId, id } = req.params;
    const { motivo } = req.body || {};
    const existing = await ensureOwner(req, userId, id, 'construction_incident');
    if (!existing) return res.status(404).json({ ok: false, error: 'Incidencia no encontrada' });
    if (existing.estado !== 'resuelta' && existing.estado !== 'cerrada') {
      return badRequest(res, 'Solo se pueden reabrir incidencias resueltas o cerradas');
    }

    const account = await findAccountByUserId(req, userId);
    const now = new Date().toISOString();
    const historial = [...(existing.historial || []), {
      accion: 'reabierta', usuario: account?.fullName || userId, fecha: now, detalle: motivo || '',
    }];
    const db = getConstructionDbName();
    const doc = buildConstructionIncidentDocument(userId, {
      ...existing, estado: 'reabierta', resolucion: '', fechaResolucion: '', resueltoPor: '',
      reabiertaCount: (existing.reabiertaCount || 0) + 1, historial,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, incident: sanitizeConstructionIncident({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al reabrir incidencia' });
  }
}

export async function removeIncident(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_incident');
    if (!existing) return res.status(404).json({ ok: false, error: 'Incidencia no encontrada' });
    const db = getConstructionDbName();
    await softDeleteDocument(req, db, id);
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar incidencia' });
  }
}

// ─── OBRA DOCUMENTS ───────────────────────────────────────────────────────────

function getCallerRole(req) {
  const role = req.authUser?.role || req.headers['x-user-role'] || '';
  return String(role);
}

function isWorkerRole(role) {
  const admin = ['Admin', 'Gerente', 'Comercial', 'Administración'];
  return !admin.includes(role);
}

function addHistoryEntry(doc, accion, usuario, detalle) {
  const historial = Array.isArray(doc.historial) ? [...doc.historial] : [];
  historial.push({ accion, usuario: String(usuario || ''), fecha: new Date().toISOString(), detalle: String(detalle || '') });
  return historial;
}

export async function listObraDocuments(req, res) {
  try {
    const { userId } = req.params;
    const q = req.query || {};
    if (!userId) return badRequest(res, 'Falta userId');
    let items = await listConstructionDocsByType(req, userId, 'construction_obra_document');
    const role = getCallerRole(req);
    if (isWorkerRole(role) || q.visibleTrabajador === 'true') {
      items = items.filter(obraDocIsVisibleForWorker);
    }
    if (q.obraId) items = items.filter((d) => d.obraId === q.obraId);
    if (q.clienteId) items = items.filter((d) => d.clienteId === q.clienteId);
    if (q.categoria) {
      const cats = String(q.categoria).split(',').map(s => s.trim());
      items = items.filter((d) => cats.includes(d.categoria));
    }
    if (q.estado) items = items.filter((d) => d.estado === q.estado);
    if (q.obligatorio === 'true') items = items.filter((d) => d.obligatorio);
    if (q.obligatorio === 'false') items = items.filter((d) => !d.obligatorio);
    if (q.firmaPendiente === 'true') items = items.filter((d) => d.firmaEstado === 'pendiente');
    if (q.caducado === 'true') {
      const today = new Date().toISOString().slice(0, 10);
      items = items.filter((d) => d.fechaCaducidad && d.fechaCaducidad < today);
    }
    if (q.search) {
      const s = String(q.search).toLowerCase();
      items = items.filter((d) =>
        (d.nombre || '').toLowerCase().includes(s) ||
        (d.descripcion || '').toLowerCase().includes(s) ||
        (d.tags || []).some(t => t.toLowerCase().includes(s))
      );
    }
    return res.json({ ok: true, documents: items.map(sanitizeConstructionObraDocument) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar documentos de obra' });
  }
}

export async function getObraDocument(req, res) {
  try {
    const { userId, id } = req.params;
    if (!userId || !id) return badRequest(res, 'Falta userId o id');
    const existing = await ensureOwner(req, userId, id, 'construction_obra_document');
    if (!existing) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    const role = getCallerRole(req);
    if (isWorkerRole(role) && !obraDocIsVisibleForWorker(existing)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para este documento' });
    }
    return res.json({ ok: true, document: sanitizeConstructionObraDocument(existing) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener documento' });
  }
}

export async function createObraDocument(req, res) {
  try {
    const { userId } = req.params;
    const { document: docIn } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!docIn || typeof docIn !== 'object') return badRequest(res, 'Falta el objeto document');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const role = getCallerRole(req);
    if (isWorkerRole(role) && !OBRA_DOC_WORKER_CREATABLE_CATEGORIES.has(docIn.categoria)) {
      return res.status(403).json({ ok: false, error: 'Sin permiso para crear documentos de esta categoría' });
    }
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const historial = addHistoryEntry({}, 'creado', account.fullName || userId, 'Documento creado');
    const doc = buildConstructionObraDocument(userId, {
      ...docIn,
      subidoPor: docIn.subidoPor || account.fullName || '',
      subidoPorId: docIn.subidoPorId || userId,
      historial,
    });
    const saved = await putDocument(req, db, doc._id, doc);
    await emitConstructionEvent(req, userId, 'construction:document_uploaded', { documentId: doc._id, obraId: doc.obraId });
    return res.status(201).json({ ok: true, document: sanitizeConstructionObraDocument({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear documento' });
  }
}

export async function updateObraDocument(req, res) {
  try {
    const { userId, id } = req.params;
    const { document: docIn } = req.body || {};
    if (!docIn) return badRequest(res, 'Faltan datos');
    const existing = await ensureOwner(req, userId, id, 'construction_obra_document');
    if (!existing) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    const role = getCallerRole(req);
    if (isWorkerRole(role) && existing.subidoPorId !== userId) {
      return res.status(403).json({ ok: false, error: 'Solo puedes editar documentos que hayas subido' });
    }
    const account = await findAccountByUserId(req, userId);
    const historial = addHistoryEntry(existing, 'editado', account?.fullName || userId, 'Documento actualizado');
    const db = getConstructionDbName();
    const doc = buildConstructionObraDocument(userId, { ...existing, ...docIn, historial }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await emitConstructionEvent(req, userId, 'construction:document_uploaded', { documentId: doc._id, obraId: doc.obraId });
    return res.json({ ok: true, document: sanitizeConstructionObraDocument({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar documento' });
  }
}

export async function removeObraDocument(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_obra_document');
    if (!existing) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    const role = getCallerRole(req);
    if (isWorkerRole(role)) return res.status(403).json({ ok: false, error: 'Sin permiso para eliminar documentos' });
    const db = getConstructionDbName();
    await softDeleteDocument(req, db, id);
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar documento' });
  }
}

export async function validateObraDocument(req, res) {
  try {
    const { userId, id } = req.params;
    const role = getCallerRole(req);
    if (isWorkerRole(role)) return res.status(403).json({ ok: false, error: 'Solo Admin/Gerente puede validar documentos' });
    const existing = await ensureOwner(req, userId, id, 'construction_obra_document');
    if (!existing) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    const account = await findAccountByUserId(req, userId);
    const historial = addHistoryEntry(existing, 'validado', account?.fullName || userId, 'Documento validado por gerencia');
    const db = getConstructionDbName();
    const doc = buildConstructionObraDocument(userId, { ...existing, estado: 'validado', historial }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, document: sanitizeConstructionObraDocument({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al validar documento' });
  }
}

export async function getObraDocumentStats(req, res) {
  try {
    const { userId } = req.params;
    const { obraId } = req.query || {};
    if (!userId) return badRequest(res, 'Falta userId');
    let items = await listConstructionDocsByType(req, userId, 'construction_obra_document');
    if (obraId) items = items.filter((d) => d.obraId === obraId);
    const today = new Date().toISOString().slice(0, 10);
    const porCategoria = {};
    const porEstado = {};
    for (const d of items) {
      porCategoria[d.categoria] = (porCategoria[d.categoria] || 0) + 1;
      porEstado[d.estado] = (porEstado[d.estado] || 0) + 1;
    }
    const obligatoriosFaltantes = items.filter(d => d.obligatorio && (d.estado === 'pendiente' || d.estado === 'borrador')).length;
    const firmasPendientes = items.filter(d => d.firmaEstado === 'pendiente').length;
    const licenciasCaducadas = items.filter(d => d.fechaCaducidad && d.fechaCaducidad < today && d.estado !== 'archivado').length;
    const seen = new Set();
    let duplicadosPosibles = 0;
    for (const d of items) {
      if (seen.has(d._id)) continue;
      const dups = findPossibleObraDocDuplicates(items, d);
      if (dups.length > 0) {
        duplicadosPosibles++;
        dups.forEach(x => seen.add(x._id));
      }
      seen.add(d._id);
    }
    return res.json({
      ok: true,
      stats: {
        total: items.length,
        porCategoria,
        porEstado,
        obligatoriosFaltantes,
        firmasPendientes,
        licenciasCaducadas,
        duplicadosPosibles,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener estadísticas' });
  }
}

export async function getObraDocumentTimeline(req, res) {
  try {
    const { userId, projectId } = req.params;
    if (!userId || !projectId) return badRequest(res, 'Falta userId o projectId');
    let items = await listConstructionDocsByType(req, userId, 'construction_obra_document');
    items = items.filter(d => d.obraId === projectId);
    const events = [];
    for (const d of items) {
      events.push({
        fecha: d.createdAt,
        tipo: 'creado',
        documentoId: d._id,
        documentoNombre: d.nombre || '',
        categoria: d.categoria || 'otro',
        usuario: d.subidoPor || '',
        detalle: d.entidadOrigenTipo ? `Auto-generado desde ${d.entidadOrigenTipo}` : 'Documento creado',
      });
      if (Array.isArray(d.historial)) {
        for (const h of d.historial) {
          if (h.accion === 'creado') continue;
          events.push({
            fecha: h.fecha,
            tipo: h.accion,
            documentoId: d._id,
            documentoNombre: d.nombre || '',
            categoria: d.categoria || 'otro',
            usuario: h.usuario || '',
            detalle: h.detalle || '',
          });
        }
      }
    }
    events.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    const limit = Number(req.query?.limit) || 50;
    const offset = Number(req.query?.offset) || 0;
    return res.json({ ok: true, events: events.slice(offset, offset + limit), total: events.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener timeline' });
  }
}

export async function checkObraDocumentDuplicate(req, res) {
  try {
    const { userId } = req.params;
    const { obraId, nombre, categoria, archivoSize } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    let items = await listConstructionDocsByType(req, userId, 'construction_obra_document');
    if (obraId) items = items.filter(d => d.obraId === obraId);
    const candidate = { obraId: obraId || '', nombre: nombre || '', categoria: categoria || '', archivoSize: Number(archivoSize || 0) };
    const duplicates = findPossibleObraDocDuplicates(items, candidate);
    return res.json({ ok: true, duplicates: duplicates.map(sanitizeConstructionObraDocument) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al verificar duplicados' });
  }
}

export async function requestObraDocumentSignature(req, res) {
  try {
    const { userId, id } = req.params;
    const { signers, message, expiresAt } = req.body || {};
    if (!userId || !id) return badRequest(res, 'Falta userId o documentId');
    if (!Array.isArray(signers) || !signers.length) return badRequest(res, 'Falta al menos un firmante');
    const role = getCallerRole(req);
    if (isWorkerRole(role)) return res.status(403).json({ ok: false, error: 'Sin permiso para solicitar firma' });
    const existing = await ensureOwner(req, userId, id, 'construction_obra_document');
    if (!existing) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    const account = await findAccountByUserId(req, userId);
    const docsDb = getDocumentsDbName();
    await ensureDatabase(req, docsDb);
    const sigReq = buildSignatureRequest(userId, {
      documentId: existing._id,
      documentName: existing.nombre,
      entityType: 'construction_obra_document',
      entityId: existing.obraId,
      signers: signers.map(s => ({
        name: s.name || '', email: s.email || '', role: s.role || 'firmante', status: 'pending',
      })),
      message: message || '',
      expiresAt: expiresAt || '',
      createdByName: account?.fullName || '',
    });
    const savedSig = await putDocument(req, docsDb, sigReq._id, sigReq);
    const historial = addHistoryEntry(existing, 'firma_solicitada', account?.fullName || userId, `Firma solicitada a ${signers.map(s => s.email).join(', ')}`);
    const db = getConstructionDbName();
    const doc = buildConstructionObraDocument(userId, {
      ...existing,
      estado: 'pendiente_firma',
      firmaSolicitadaId: sigReq._id,
      firmaEstado: 'pendiente',
      historial,
    }, existing);
    const savedDoc = await putDocument(req, db, doc._id, doc);
    await emitConstructionEvent(req, userId, 'construction:signature_requested', { documentId: doc._id, obraId: doc.obraId });
    return res.json({
      ok: true,
      document: sanitizeConstructionObraDocument({ ...doc, _rev: savedDoc.rev }),
      signatureRequestId: sigReq._id,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al solicitar firma' });
  }
}

export async function processObraDocumentOcr(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_obra_document');
    if (!existing) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    const { ocrData } = req.body || {};
    if (!ocrData || typeof ocrData !== 'object') return badRequest(res, 'Falta ocrData');
    const suggestedCategory = obraDocSuggestCategoryFromOcr(ocrData.documentType);
    const account = await findAccountByUserId(req, userId);
    const historial = addHistoryEntry(existing, 'ocr_procesado', account?.fullName || userId, `OCR completado — tipo detectado: ${ocrData.documentType || 'desconocido'}`);
    const db = getConstructionDbName();
    const doc = buildConstructionObraDocument(userId, {
      ...existing,
      ocrData,
      ocrProcessedAt: new Date().toISOString(),
      ocrConfidence: Number(ocrData.confidence ?? 0),
      historial,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({
      ok: true,
      document: sanitizeConstructionObraDocument({ ...doc, _rev: saved.rev }),
      suggestedCategory,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al procesar OCR' });
  }
}

export async function autoLinkObraDocument(req, userId, data) {
  try {
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const existing = await listConstructionDocsByType(req, userId, 'construction_obra_document');
    const alreadyLinked = existing.find(d => d.entidadOrigenId === data.entidadOrigenId && d.entidadOrigenTipo === data.entidadOrigenTipo);
    if (alreadyLinked) return null;
    const historial = [{ accion: 'auto_generado', usuario: 'Sistema', fecha: new Date().toISOString(), detalle: `Generado automáticamente desde ${data.entidadOrigenTipo} ${data.entidadOrigenId}` }];
    const doc = buildConstructionObraDocument(userId, { ...data, historial, subidoPor: 'Sistema', subidoPorId: 'system' });
    const saved = await putDocument(req, db, doc._id, doc);
    return { ...doc, _rev: saved.rev };
  } catch {
    return null;
  }
}

function isIncidentOpen(inc) {
  const e = String(inc.estado || '');
  return e === 'abierta' || e === 'en_revision' || e === 'reabierta' || e === 'en_progreso';
}

/** GET /api/construction/ops-center/:userId — datos agregados para el centro operativo */
export async function getConstructionOpsCenter(req, res) {
  try {
    const { userId } = req.params;
    const q = req.query || {};
    if (!userId) return badRequest(res, 'Falta userId');

    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    const dateFrom = q.dateFrom || monthStart;
    const dateTo = q.dateTo || today;

    const [
      projects,
      budgets,
      workers,
      tasks,
      reports,
      incidents,
      obraDocs,
      guilds,
    ] = await Promise.all([
      listConstructionDocsByType(req, userId, 'construction_project'),
      listConstructionDocsByType(req, userId, 'construction_budget'),
      listConstructionDocsByType(req, userId, 'construction_worker'),
      listConstructionDocsByType(req, userId, 'construction_task'),
      listConstructionDocsByType(req, userId, 'construction_daily_report'),
      listConstructionDocsByType(req, userId, 'construction_incident'),
      listConstructionDocsByType(req, userId, 'construction_obra_document'),
      listConstructionDocsByType(req, userId, 'construction_guild'),
    ]);

    const estadoFilter = q.estado ? String(q.estado).split(',').map((s) => s.trim()) : null;

    let filteredProjects = projects.filter((p) => {
      if (q.obraId && p._id !== q.obraId) return false;
      if (q.clienteId && p.clienteId !== q.clienteId) return false;
      if (estadoFilter && estadoFilter.length) return estadoFilter.includes(p.estado);
      return true;
    });

    if (q.trabajadorId) {
      const wid = q.trabajadorId;
      filteredProjects = filteredProjects.filter((p) =>
        workers.some((w) => w._id === wid && w.obraAsignada === p._id)
      );
    }

    const activeProjects = filteredProjects.filter((p) => p.estado !== 'finalizada');
    const acceptedBudgets = budgets.filter((b) => b.estado === 'aceptado');

    let totalCobrado = 0;
    let totalPendienteCobro = 0;
    let presupuestoTotalAceptado = 0;
    let margenPeso = 0;
    for (const b of acceptedBudgets) {
      const sb = sanitizeConstructionBudget(b);
      totalCobrado += Number(sb.totalPagado || 0);
      totalPendienteCobro += Number(sb.pendientePago || 0);
      presupuestoTotalAceptado += Number(sb.totalConMargen || 0);
      margenPeso += Number(sb.totalConMargen || 0) * (Number(sb.margen || 0) / 100);
    }
    const margenEstimadoGlobal =
      presupuestoTotalAceptado > 0 ? Math.round((margenPeso / presupuestoTotalAceptado) * 1000) / 10 : 0;

    let payments = [];
    try {
      payments = await listConstructionDocsByType(req, userId, 'construction_payment');
    } catch { /* no payments yet */ }
    const activePayments = payments.filter(p => p.estado !== 'anulado');
    const totalPagadoProveedores = activePayments.reduce((s, p) => s + Number(p.totalPagado || 0), 0);
    const totalPendientePago = activePayments.reduce((s, p) => s + Number(p.pendiente || 0), 0);
    const totalPactadoInterno = activePayments.reduce((s, p) => s + Number(p.importePactado || 0), 0);
    const pagosVencidos = activePayments.filter(p => p.fechaPrevista && p.fechaPrevista < today && p.estado !== 'pagado').length;

    const openIncidents = incidents.filter(isIncidentOpen);
    const pendingReports = reports.filter((r) => r.estado === 'enviado');
    const docsFaltantes = obraDocs.filter((d) => d.obligatorio && d.estado === 'pendiente');
    const docsCaducados = obraDocs.filter((d) => d.estado === 'caducado');

    const proximosCobros = [];
    const cobrosVencidos = [];
    for (const b of acceptedBudgets) {
      const sb = sanitizeConstructionBudget(b);
      for (const pago of sb.pagos || []) {
        if (pago.pagado) continue;
        const fecha = pago.fecha || '';
        const row = {
          presupuestoRef: sb.referencia,
          obraNombre: sb.proyectoNombre,
          clienteNombre: sb.clienteNombre,
          concepto: pago.concepto,
          importe: pago.importe,
          fecha,
          vencido: fecha && fecha < today,
        };
        if (fecha && fecha < today) {
          const d0 = new Date(fecha);
          const days = Math.floor((Date.now() - d0.getTime()) / (86400000));
          cobrosVencidos.push({ ...row, diasVencido: days });
        } else {
          proximosCobros.push(row);
        }
      }
    }

    const obrasRows = filteredProjects.map((p) => {
      const pt = tasks.filter((t) => t.obraId === p._id);
      const bud = budgets.find((b) => b._id === p.presupuestoId || b.proyectoId === p._id);
      const sb = bud ? sanitizeConstructionBudget(bud) : null;
      const incC = incidents.filter((i) => i.obraId === p._id && isIncidentOpen(i)).length;
      const docF = obraDocs.filter((d) => d.obraId === p._id && d.obligatorio && d.estado === 'pendiente').length;
      const partP = reports.filter((r) => r.obraId === p._id && r.estado === 'enviado').length;
      const fin = p.fechaFinPrevista ? new Date(p.fechaFinPrevista) : null;
      const enRetraso =
        p.estado !== 'finalizada' && fin && !Number.isNaN(fin.getTime()) && fin.getTime() < Date.now() && (p.progreso || 0) < 100;
      const diasRestantes =
        fin && !Number.isNaN(fin.getTime()) ? Math.ceil((fin.getTime() - Date.now()) / 86400000) : null;
      const workersOnSite = workers.filter((w) => w.obraAsignada === p._id && w.activo).length;

      return {
        _id: p._id,
        nombre: p.nombre,
        tipoObra: p.tipoObra,
        ubicacion: p.ubicacion,
        clienteNombre: p.clienteNombre,
        estado: p.estado,
        progreso: p.progreso,
        fechaInicio: p.fechaInicio,
        fechaFinPrevista: p.fechaFinPrevista,
        presupuesto: sb ? sb.totalConMargen : 0,
        cobrado: sb ? sb.totalPagado : 0,
        pendienteCobro: sb ? sb.pendientePago : 0,
        margenEstimado: sb ? Number(sb.margen || 0) : 0,
        trabajadoresAsignados: workersOnSite,
        tareasTotal: pt.length,
        tareasCompletadas: pt.filter((t) => t.estado === 'completada').length,
        tareasPendientes: pt.filter((t) => t.estado === 'pendiente').length,
        tareasEnProgreso: pt.filter((t) => t.estado === 'en_progreso').length,
        incidenciasAbiertas: incC,
        partesPendientes: partP,
        documentosFaltantes: docF,
        diasRestantes,
        enRetraso,
      };
    });

    const avanceMedioObras =
      activeProjects.length > 0
        ? Math.round(
            (activeProjects.reduce((s, p) => s + (Number(p.progreso) || 0), 0) / activeProjects.length) * 10
          ) / 10
        : 0;

    const tareasPendientes = tasks.filter((t) => t.estado === 'pendiente').length;
    const tareasEnProgreso = tasks.filter((t) => t.estado === 'en_progreso').length;
    const todayStr = today;
    const completadasHoy = tasks.filter((t) => t.estado === 'completada' && String(t.updatedAt || '').slice(0, 10) === todayStr).length;

    const proximasVencer = tasks
      .filter((t) => t.estado !== 'completada' && t.estado !== 'cancelada' && t.fechaLimite)
      .sort((a, b) => String(a.fechaLimite).localeCompare(String(b.fechaLimite)))
      .slice(0, 8)
      .map((t) => ({
        titulo: t.titulo,
        obraNombre: t.obraNombre,
        trabajadorNombre: t.trabajadorNombre,
        fechaLimite: t.fechaLimite,
        prioridad: t.prioridad,
      }));

    const horasHoy = reports
      .filter((r) => r.fecha === today && r.estado === 'validado')
      .reduce((s, r) => s + (Number(r.horasTrabajadas) || 0), 0);

    const alertas = [];
    let aid = 0;
    const nextId = (tipo) => `co_${tipo}_${++aid}`;

    for (const p of activeProjects) {
      const hasWorker = workers.some((w) => w.obraAsignada === p._id && w.activo);
      if (p.estado === 'en_obra' && !hasWorker) {
        alertas.push({
          id: nextId('obra_sin_responsable'),
          tipo: 'obra_sin_responsable',
          gravedad: 'warning',
          titulo: 'Obra sin responsable',
          mensaje: `${p.nombre} — Sin trabajador asignado`,
          obraId: p._id,
          ruta: '/saas/construction-projects',
        });
      }
      if (p.estado === 'pausada') {
        const u = new Date(p.updatedAt || p.createdAt || 0).getTime();
        if (u && Date.now() - u > 7 * 86400000) {
          alertas.push({
            id: nextId('obra_parada'),
            tipo: 'obra_parada',
            gravedad: 'error',
            titulo: 'Obra parada',
            mensaje: `${p.nombre} — Pausada desde hace más de 7 días`,
            obraId: p._id,
            ruta: '/saas/construction-projects',
          });
        }
      }
    }

    for (const row of cobrosVencidos.slice(0, 10)) {
      alertas.push({
        id: nextId('cobro'),
        tipo: 'cobro_vencido',
        gravedad: 'error',
        titulo: 'Cobro vencido',
        mensaje: `${row.obraNombre} — ${row.concepto}: ${row.importe} €`,
        ruta: '/saas/construction-budgets',
      });
    }

    if (totalPendientePago > 0) {
      alertas.push({
        id: nextId('pago'),
        tipo: 'pago_pendiente',
        gravedad: pagosVencidos > 0 ? 'error' : 'warning',
        titulo: pagosVencidos > 0 ? `${pagosVencidos} pago(s) vencido(s)` : 'Pagos internos pendientes',
        mensaje: `${totalPendientePago.toFixed(2)} € pendiente de ${activePayments.length} línea(s) (pactado: ${totalPactadoInterno.toFixed(2)} €)`,
        ruta: '/saas/construction-payments',
      });
    }

    for (const inc of openIncidents.slice(0, 15)) {
      alertas.push({
        id: nextId('inc'),
        tipo: 'incidencia_abierta',
        gravedad: inc.gravedad === 'critica' || inc.gravedad === 'alta' ? 'error' : 'warning',
        titulo: 'Incidencia abierta',
        mensaje: `${inc.obraNombre || 'Obra'} — ${inc.titulo || inc.descripcion?.slice(0, 80) || inc.referencia}`,
        incidentId: inc._id,
        ruta: '/saas/vertical/construccion',
      });
    }

    for (const d of docsFaltantes.slice(0, 10)) {
      alertas.push({
        id: nextId('doc'),
        tipo: 'documento_faltante',
        gravedad: 'warning',
        titulo: 'Documento obligatorio pendiente',
        mensaje: `${d.obraNombre} — ${d.nombre}`,
        obraId: d.obraId,
        ruta: '/saas/vertical/construccion',
      });
    }

    if (pendingReports.length) {
      alertas.push({
        id: nextId('parte'),
        tipo: 'parte_pendiente',
        gravedad: 'info',
        titulo: 'Partes pendientes de validación',
        mensaje: `${pendingReports.length} parte(s) enviado(s) sin validar`,
        ruta: '/saas/vertical/construccion',
      });
    }

    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const lim = in30.toISOString().slice(0, 10);
    for (const d of obraDocs) {
      if (d.fechaCaducidad && d.estado === 'vigente' && d.fechaCaducidad <= lim && d.fechaCaducidad >= today) {
        const dr = Math.ceil(
          (new Date(d.fechaCaducidad).getTime() - Date.now()) / 86400000
        );
        alertas.push({
          id: nextId('cad'),
          tipo: 'documento_caduca',
          gravedad: 'warning',
          titulo: 'Documento próximo a caducar',
          mensaje: `${d.obraNombre} — ${d.nombre} (${d.fechaCaducidad})`,
          obraId: d.obraId,
          ruta: '/saas/vertical/construccion',
        });
      }
    }

    const clientesMap = new Map();
    for (const p of projects) {
      if (!p.clienteId) continue;
      const key = p.clienteId;
      if (!clientesMap.has(key)) {
        clientesMap.set(key, {
          _id: key,
          nombre: p.clienteNombre,
          cif: '',
          obrasActivas: 0,
          totalPresupuestado: 0,
          totalCobrado: 0,
          totalPendiente: 0,
        });
      }
    }
    for (const b of acceptedBudgets) {
      const sb = sanitizeConstructionBudget(b);
      const k = sb.clienteId;
      if (!k || !clientesMap.has(k)) continue;
      const c = clientesMap.get(k);
      c.totalPresupuestado += sb.totalConMargen;
      c.totalCobrado += sb.totalPagado;
      c.totalPendiente += sb.pendientePago;
    }
    for (const p of activeProjects) {
      if (p.clienteId && clientesMap.has(p.clienteId)) {
        clientesMap.get(p.clienteId).obrasActivas += 1;
      }
    }

    const trabajadoresRows = workers
      .filter((w) => w.activo)
      .map((w) => {
        const wt = tasks.filter((t) => t.trabajadorId === w._id);
        const prToday = reports.filter((r) => r.trabajadorId === w._id && r.fecha === today);
        return {
          _id: w._id,
          nombre: w.nombre,
          gremio: w.gremio,
          obraNombre: w.obraNombre,
          activo: w.activo,
          tareasAsignadas: wt.length,
          tareasCompletadas: wt.filter((t) => t.estado === 'completada').length,
          partesHoy: prToday.length,
          horasHoy: prToday.reduce((s, r) => s + (Number(r.horasTrabajadas) || 0), 0),
        };
      });

    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      filters: {
        obraId: q.obraId || null,
        clienteId: q.clienteId || null,
        estado: q.estado || null,
        trabajadorId: q.trabajadorId || null,
        dateFrom,
        dateTo,
      },
      resumen: {
        obrasActivas: activeProjects.length,
        obrasPlanificacion: activeProjects.filter((p) => p.estado === 'planificación').length,
        obrasEnObra: activeProjects.filter((p) => p.estado === 'en_obra').length,
        obrasPausadas: activeProjects.filter((p) => p.estado === 'pausada').length,
        obrasFinalizadasMes: projects.filter(
          (p) => p.estado === 'finalizada' && String(p.updatedAt || '').slice(0, 7) === today.slice(0, 7)
        ).length,
        presupuestoTotalAceptado,
        totalCobrado,
        totalPendienteCobro,
        totalPagadoProveedores,
        totalPendientePago,
        totalPactadoInterno,
        pagosVencidos,
        margenEstimadoGlobal,
        avanceMedioObras,
        totalTrabajadoresActivos: workers.filter((w) => w.activo).length,
        totalIncidenciasAbiertas: openIncidents.length,
        totalPartesPendientes: pendingReports.length,
        totalDocumentosFaltantes: docsFaltantes.length,
        totalDocumentosCaducados: docsCaducados.length,
      },
      obras: obrasRows,
      clientes: Array.from(clientesMap.values()),
      presupuestos: {
        totalBorradores: budgets.filter((b) => b.estado === 'borrador').length,
        totalEnviados: budgets.filter((b) => b.estado === 'enviado').length,
        totalAceptados: acceptedBudgets.length,
        totalRechazados: budgets.filter((b) => b.estado === 'rechazado').length,
        importeBorradores: budgets.filter((b) => b.estado === 'borrador').reduce((s, b) => s + (Number(b.totalConMargen) || 0), 0),
        importeEnviados: budgets.filter((b) => b.estado === 'enviado').reduce((s, b) => s + (Number(b.totalConMargen) || 0), 0),
        importeAceptados: presupuestoTotalAceptado,
        proximosCobros: proximosCobros.slice(0, 12),
        cobrosVencidos: cobrosVencidos.slice(0, 12),
      },
      tareas: {
        totalPendientes: tareasPendientes,
        totalEnProgreso: tareasEnProgreso,
        totalCompletadasHoy: completadasHoy,
        proximasVencer,
      },
      incidencias: openIncidents.slice(0, 20).map((i) => ({
        _id: i._id,
        titulo: i.titulo || i.descripcion?.slice(0, 80) || i.referencia,
        obraNombre: i.obraNombre,
        tipo: i.tipo,
        gravedad: i.gravedad || i.prioridad,
        estado: i.estado,
        reportadoPorNombre: i.reportadoPorNombre,
        fechaDeteccion: i.fechaDeteccion || i.createdAt,
        costeEstimado: i.costeEstimado,
      })),
      partesTrabajo: {
        pendientesAprobacion: pendingReports.length,
        aprobadosHoy: reports.filter((r) => r.fecha === today && r.estado === 'validado').length,
        horasRegistradasHoy: horasHoy,
        ultimosPartes: reports.slice(0, 8).map((r) => ({
          trabajadorNombre: r.trabajadorNombre,
          obraNombre: r.obraNombre,
          fecha: r.fecha,
          horas: r.horasTrabajadas,
          estado: r.estado,
          referencia: r.referencia,
          _id: r._id,
        })),
      },
      documentos: {
        totalFaltantes: docsFaltantes.length,
        totalCaducados: docsCaducados.length,
        faltantes: docsFaltantes.slice(0, 12).map((d) => ({
          obraNombre: d.obraNombre,
          categoria: d.categoria,
          nombreLegible: d.nombre,
          obligatorio: d.obligatorio,
          obraId: d.obraId,
        })),
        proximosCaducar: obraDocs
          .filter((d) => d.estado === 'vigente' && d.fechaCaducidad && d.fechaCaducidad > today && d.fechaCaducidad <= lim)
          .slice(0, 8)
          .map((d) => ({
            obraNombre: d.obraNombre,
            nombre: d.nombre,
            fechaCaducidad: d.fechaCaducidad,
            diasRestantes: Math.ceil(
              (new Date(d.fechaCaducidad).getTime() - Date.now()) / 86400000
            ),
          })),
      },
      alertas,
      trabajadores: trabajadoresRows,
      charts: {
        obrasPorEstado: {
          planificación: projects.filter((p) => p.estado === 'planificación').length,
          en_obra: projects.filter((p) => p.estado === 'en_obra').length,
          pausada: projects.filter((p) => p.estado === 'pausada').length,
          finalizada: projects.filter((p) => p.estado === 'finalizada').length,
        },
        avancePorObra: obrasRows.slice(0, 12).map((o) => ({ nombre: o.nombre, progreso: o.progreso })),
        cobrosVsPagos: {
          cobrado: totalCobrado,
          pendienteCobro: totalPendienteCobro,
          pendientePagoProveedores: totalPendientePago,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cargar centro operativo' });
  }
}

// ─── REPORTS (INFORMES Y RENTABILIDAD) ───────────────────────────────────────

export async function getConstructionReports(req, res) {
  try {
    const { userId } = req.params;
    const q = req.query || {};
    if (!userId) return badRequest(res, 'Falta userId');

    const today = new Date().toISOString().slice(0, 10);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const dateFrom = q.desde || sixMonthsAgo.toISOString().slice(0, 10);
    const dateTo = q.hasta || today;

    const [projects, budgets, workers, tasks, reports, incidents, guilds] = await Promise.all([
      listConstructionDocsByType(req, userId, 'construction_project'),
      listConstructionDocsByType(req, userId, 'construction_budget'),
      listConstructionDocsByType(req, userId, 'construction_worker'),
      listConstructionDocsByType(req, userId, 'construction_task'),
      listConstructionDocsByType(req, userId, 'construction_daily_report'),
      listConstructionDocsByType(req, userId, 'construction_incident'),
      listConstructionDocsByType(req, userId, 'construction_guild'),
    ]);

    let filteredProjects = projects;
    if (q.obraId) filteredProjects = filteredProjects.filter((p) => p._id === q.obraId);
    if (q.clienteId) filteredProjects = filteredProjects.filter((p) => p.clienteId === q.clienteId);
    if (q.trabajadorId) {
      const wid = q.trabajadorId;
      filteredProjects = filteredProjects.filter((p) =>
        workers.some((w) => w._id === wid && w.obraAsignada === p._id)
      );
    }

    const activeProjects = filteredProjects.filter((p) => p.estado !== 'finalizada');
    const acceptedBudgets = budgets.filter((b) => b.estado === 'aceptado');

    let totalCobrado = 0;
    let totalPendienteCobro = 0;
    let presupuestoTotal = 0;
    let costoTotal = 0;
    let margenPeso = 0;

    for (const b of acceptedBudgets) {
      const sb = sanitizeConstructionBudget(b);
      totalCobrado += Number(sb.totalPagado || 0);
      totalPendienteCobro += Number(sb.pendientePago || 0);
      presupuestoTotal += Number(sb.totalConMargen || 0);
      costoTotal += Number(sb.totalPartidas || 0);
      margenPeso += Number(sb.totalConMargen || 0) * (Number(sb.margen || 0) / 100);
    }
    const margenGlobal = presupuestoTotal > 0 ? Math.round((margenPeso / presupuestoTotal) * 1000) / 10 : 0;
    const totalPagadoProveedores = guilds.reduce((s, g) => s + (Number(g.precioTotal) || 0), 0);

    const openIncidents = incidents.filter(isIncidentOpen);
    const horasTotal = reports
      .filter((r) => r.estado === 'validado' && r.fecha >= dateFrom && r.fecha <= dateTo)
      .reduce((s, r) => s + (Number(r.horasTrabajadas) || 0), 0);

    const obraDetails = filteredProjects.map((p) => {
      const pt = tasks.filter((t) => t.obraId === p._id);
      const bud = budgets.find((b) => b._id === p.presupuestoId || b.proyectoId === p._id);
      const sb = bud ? sanitizeConstructionBudget(bud) : null;
      const obraIncidents = incidents.filter((i) => i.obraId === p._id && isIncidentOpen(i)).length;
      const obraWorkers = workers.filter((w) => w.obraAsignada === p._id && w.activo).length;
      const obraHoras = reports
        .filter((r) => r.obraId === p._id && r.estado === 'validado' && r.fecha >= dateFrom && r.fecha <= dateTo)
        .reduce((s, r) => s + (Number(r.horasTrabajadas) || 0), 0);

      const presupuesto = sb ? Number(sb.totalConMargen || 0) : 0;
      const coste = sb ? Number(sb.totalPartidas || 0) : 0;
      const cobrado = sb ? Number(sb.totalPagado || 0) : 0;
      const pendiente = sb ? Number(sb.pendientePago || 0) : 0;
      const margenAbs = presupuesto - coste;
      const margenPct = presupuesto > 0 ? Math.round((margenAbs / presupuesto) * 1000) / 10 : 0;

      const fin = p.fechaFinPrevista ? new Date(p.fechaFinPrevista) : null;
      const inicio = p.fechaInicio ? new Date(p.fechaInicio) : null;
      let desviacion = 0;
      if (fin && inicio && !Number.isNaN(fin.getTime()) && !Number.isNaN(inicio.getTime())) {
        const totalDias = (fin.getTime() - inicio.getTime()) / 86400000;
        const diasPasados = (Date.now() - inicio.getTime()) / 86400000;
        if (totalDias > 0) {
          const progresoEsperado = Math.min(100, (diasPasados / totalDias) * 100);
          desviacion = Math.round(((p.progreso || 0) - progresoEsperado) * 10) / 10;
        }
      }

      return {
        obraId: p._id,
        obraNombre: p.nombre,
        clienteId: p.clienteId || '',
        clienteNombre: p.clienteNombre || '',
        tipoObra: p.tipoObra || '',
        ubicacion: p.ubicacion || '',
        estado: p.estado,
        progreso: p.progreso || 0,
        fechaInicio: p.fechaInicio || '',
        fechaFinPrevista: p.fechaFinPrevista || '',
        presupuesto,
        cobrado,
        pendienteCobro: pendiente,
        costeMateriales: sb ? sb.partidas.reduce((s2, pp) => s2 + (Number(pp.materiales) || 0), 0) : 0,
        costeManoObra: sb ? sb.partidas.reduce((s2, pp) => s2 + (Number(pp.manoObra) || 0), 0) : 0,
        costeEstructural: sb ? sb.partidas.reduce((s2, pp) => s2 + (Number(pp.estructural) || 0), 0) : 0,
        margenAbsoluto: margenAbs,
        margenPorcentaje: margenPct,
        horasImputadas: obraHoras,
        trabajadoresAsignados: obraWorkers,
        incidencias: obraIncidents,
        desviacion,
        tareasTotal: pt.length,
        tareasCompletadas: pt.filter((t) => t.estado === 'completada').length,
        tareasPendientes: pt.filter((t) => t.estado === 'pendiente' || t.estado === 'en_progreso').length,
      };
    });

    const clienteMap = new Map();
    for (const o of obraDetails) {
      if (!o.clienteId) continue;
      if (!clienteMap.has(o.clienteId)) {
        clienteMap.set(o.clienteId, {
          clienteId: o.clienteId,
          clienteNombre: o.clienteNombre,
          numObras: 0,
          obrasActivas: 0,
          totalPresupuestado: 0,
          totalCobrado: 0,
          pendienteCobro: 0,
          margenesSum: 0,
          margenesCount: 0,
          obraMasRentable: '',
          obraMenosRentable: '',
          maxMargen: -Infinity,
          minMargen: Infinity,
        });
      }
      const c = clienteMap.get(o.clienteId);
      c.numObras += 1;
      if (o.estado !== 'finalizada') c.obrasActivas += 1;
      c.totalPresupuestado += o.presupuesto;
      c.totalCobrado += o.cobrado;
      c.pendienteCobro += o.pendienteCobro;
      if (o.presupuesto > 0) {
        c.margenesSum += o.margenPorcentaje;
        c.margenesCount += 1;
        if (o.margenPorcentaje > c.maxMargen) { c.maxMargen = o.margenPorcentaje; c.obraMasRentable = o.obraNombre; }
        if (o.margenPorcentaje < c.minMargen) { c.minMargen = o.margenPorcentaje; c.obraMenosRentable = o.obraNombre; }
      }
    }
    const clienteDetails = Array.from(clienteMap.values()).map((c) => ({
      clienteId: c.clienteId,
      clienteNombre: c.clienteNombre,
      numObras: c.numObras,
      obrasActivas: c.obrasActivas,
      totalPresupuestado: c.totalPresupuestado,
      totalCobrado: c.totalCobrado,
      pendienteCobro: c.pendienteCobro,
      margenMedio: c.margenesCount > 0 ? Math.round((c.margenesSum / c.margenesCount) * 10) / 10 : 0,
      obraMasRentable: c.obraMasRentable,
      obraMenosRentable: c.obraMenosRentable,
    }));

    const monthsSet = new Set();
    const d0 = new Date(dateFrom);
    const d1 = new Date(dateTo);
    const cursor = new Date(d0.getFullYear(), d0.getMonth(), 1);
    while (cursor <= d1) {
      monthsSet.add(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    const monthKeys = Array.from(monthsSet).sort();

    const seriesMensual = monthKeys.map((mk) => {
      const monthReports = reports.filter((r) => r.estado === 'validado' && (r.fecha || '').slice(0, 7) === mk);
      const monthIncidents = incidents.filter((i) => (i.createdAt || '').slice(0, 7) === mk);
      const monthBudgets = acceptedBudgets.filter((b) => (b.fecha || '').slice(0, 7) === mk);
      const monthPresup = monthBudgets.reduce((s, b) => s + (Number(sanitizeConstructionBudget(b).totalConMargen) || 0), 0);
      const monthCobrado = monthBudgets.reduce((s, b) => {
        const sb = sanitizeConstructionBudget(b);
        return s + (sb.pagos || []).filter((pp) => pp.pagado && (pp.fecha || '').slice(0, 7) === mk)
          .reduce((s2, pp) => s2 + (Number(pp.importe) || 0), 0);
      }, 0);
      return {
        mes: mk,
        presupuestado: monthPresup,
        cobrado: monthCobrado,
        pagado: 0,
        margen: margenGlobal,
        horasImputadas: monthReports.reduce((s, r) => s + (Number(r.horasTrabajadas) || 0), 0),
        incidencias: monthIncidents.length,
      };
    });

    const trabajadores = workers.filter((w) => w.activo).map((w) => {
      const wTasks = tasks.filter((t) => t.trabajadorId === w._id);
      const wReports = reports.filter((r) => r.trabajadorId === w._id && r.estado === 'validado' && r.fecha >= dateFrom && r.fecha <= dateTo);
      return {
        _id: w._id,
        nombre: w.nombre,
        gremio: w.gremio,
        obraNombre: w.obraNombre || '',
        obraId: w.obraAsignada || '',
        horasImputadas: wReports.reduce((s, r) => s + (Number(r.horasTrabajadas) || 0), 0),
        tareasCompletadas: wTasks.filter((t) => t.estado === 'completada').length,
        tareasPendientes: wTasks.filter((t) => t.estado === 'pendiente' || t.estado === 'en_progreso').length,
        tareasTotal: wTasks.length,
        incidencias: incidents.filter((i) => i.reportadoPorId === w._id && isIncidentOpen(i)).length,
      };
    });

    const alertas = [];
    let aid = 0;
    const nid = (t) => `rpt_${t}_${++aid}`;

    for (const o of obraDetails) {
      if (o.presupuesto > 0 && o.margenPorcentaje < 5) {
        alertas.push({
          id: nid('margin'), tipo: 'obra_poco_rentable', severidad: o.margenPorcentaje < 0 ? 'critical' : 'warning',
          titulo: `Margen bajo en ${o.obraNombre}`,
          detalle: `Margen: ${o.margenPorcentaje}% (${o.margenAbsoluto.toFixed(0)} €)`,
          obraId: o.obraId, obraNombre: o.obraNombre, fecha: today,
        });
      }
      if (o.desviacion < -15) {
        alertas.push({
          id: nid('deviation'), tipo: 'desviacion_temporal', severidad: o.desviacion < -30 ? 'critical' : 'warning',
          titulo: `Retraso en ${o.obraNombre}`,
          detalle: `Desviación: ${o.desviacion}% respecto al avance esperado`,
          obraId: o.obraId, obraNombre: o.obraNombre, fecha: today,
        });
      }
      if (o.incidencias > 5) {
        alertas.push({
          id: nid('incidents'), tipo: 'demasiadas_incidencias', severidad: o.incidencias > 10 ? 'critical' : 'warning',
          titulo: `Exceso de incidencias en ${o.obraNombre}`,
          detalle: `${o.incidencias} incidencias abiertas`,
          obraId: o.obraId, obraNombre: o.obraNombre, fecha: today,
        });
      }
    }

    for (const b of acceptedBudgets) {
      const sb = sanitizeConstructionBudget(b);
      for (const pago of sb.pagos || []) {
        if (pago.pagado) continue;
        const fecha = pago.fecha || '';
        if (fecha && fecha < today) {
          const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
          if (dias > 15) {
            alertas.push({
              id: nid('collection'), tipo: 'cobro_retrasado', severidad: dias > 30 ? 'critical' : 'warning',
              titulo: `Cobro vencido: ${sb.proyectoNombre}`,
              detalle: `${pago.concepto}: ${pago.importe} € — vencido hace ${dias} días`,
              obraId: sb.proyectoId || '', obraNombre: sb.proyectoNombre, fecha: pago.fecha,
            });
          }
        }
      }
    }

    for (const w of trabajadores) {
      const estimatedHours = w.tareasTotal * 8;
      if (estimatedHours > 0 && w.horasImputadas > estimatedHours * 1.2) {
        alertas.push({
          id: nid('hours'), tipo: 'exceso_horas', severidad: 'warning',
          titulo: `Exceso de horas: ${w.nombre}`,
          detalle: `${w.horasImputadas}h imputadas (estimado: ${estimatedHours}h)`,
          obraId: w.obraId, obraNombre: w.obraNombre, fecha: today,
        });
      }
    }

    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      filters: { desde: dateFrom, hasta: dateTo, obraId: q.obraId || null, clienteId: q.clienteId || null, trabajadorId: q.trabajadorId || null },
      resumen: {
        obrasActivas: activeProjects.length,
        totalPresupuestado: presupuestoTotal,
        totalCobrado,
        cobrosPendientes: totalPendienteCobro,
        pagosPendientes: totalPagadoProveedores,
        margenGlobal,
        horasImputadas: horasTotal,
        trabajadoresActivos: workers.filter((w) => w.activo).length,
        incidenciasAbiertas: openIncidents.length,
        costoTotal,
      },
      obraDetails,
      clienteDetails,
      seriesMensual,
      trabajadores,
      alertas,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al generar informe de rentabilidad' });
  }
}

// ─── ALERTS (ALERTAS DE CONSTRUCCIÓN) ────────────────────────────────────────

export async function getConstructionAlerts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const today = new Date().toISOString().slice(0, 10);
    const alerts = [];

    const [workers, reports, tasks, incidents, budgets, clients, colls, projects] = await Promise.all([
      listConstructionDocsByType(req, userId, 'construction_worker'),
      listConstructionDocsByType(req, userId, 'construction_daily_report'),
      listConstructionDocsByType(req, userId, 'construction_task'),
      listConstructionDocsByType(req, userId, 'construction_incident'),
      listConstructionDocsByType(req, userId, 'construction_budget'),
      listConstructionDocsByType(req, userId, 'construction_client'),
      listConstructionDocsByType(req, userId, 'construction_collection'),
      listConstructionDocsByType(req, userId, 'construction_project'),
    ]);

    const todayReportWorkerIds = new Set(
      reports.filter(r => r.fecha === today).map(r => r.trabajadorId)
    );

    // Trabajadores activos sin parte hoy
    for (const w of workers) {
      if (w.activo && w.obraAsignada && !todayReportWorkerIds.has(w._id)) {
        alerts.push({
          id: `no_report_${w._id}`,
          type: 'construction_worker_no_report',
          severity: 'warning',
          label: 'Trabajador sin parte diario',
          detail: `${w.nombre} no ha registrado parte hoy`,
          entityId: w._id, entityName: w.nombre, entityType: 'worker',
          obraId: w.obraAsignada, obraNombre: w.obraNombre || '',
        });
      }
    }

    // Tareas con fecha pasada sin partes
    for (const t of tasks) {
      if (t.estado === 'pendiente' && t.fechaLimite && t.fechaLimite < today) {
        const hasReport = reports.some(r => r.tareaId === t._id);
        if (!hasReport) {
          alerts.push({
            id: `task_unexecuted_${t._id}`,
            type: 'construction_task_not_executed',
            severity: 'warning',
            label: 'Tarea de obra sin ejecutar',
            detail: `"${t.titulo}" venció el ${t.fechaLimite} sin partes asociados`,
            entityId: t._id, entityName: t.titulo, entityType: 'task',
            obraId: t.obraId, obraNombre: t.obraNombre || '',
          });
        }
      }
    }

    // Horas superiores a lo previsto por tarea
    for (const t of tasks) {
      if (!t.horasEstimadas || t.horasEstimadas <= 0) continue;
      const horasTarea = reports
        .filter(r => r.tareaId === t._id && r.estado === 'validado')
        .reduce((s, r) => s + (Number(r.horasTrabajadas) || 0), 0);
      if (horasTarea > t.horasEstimadas) {
        alerts.push({
          id: `hours_exceeded_${t._id}`,
          type: 'construction_hours_exceeded',
          severity: 'warning',
          label: 'Horas superiores a lo previsto',
          detail: `"${t.titulo}": ${horasTarea}h de ${t.horasEstimadas}h estimadas`,
          entityId: t._id, entityName: t.titulo, entityType: 'task',
          obraId: t.obraId, obraNombre: t.obraNombre || '',
        });
      }
    }

    // Incidencias abiertas > 24h
    const threshold = Date.now() - 24 * 60 * 60 * 1000;
    for (const inc of incidents) {
      if (inc.estado === 'abierta' && new Date(inc.createdAt).getTime() < threshold) {
        alerts.push({
          id: `incident_unreviewed_${inc._id}`,
          type: 'construction_incident_unreviewed',
          severity: 'high',
          label: 'Incidencia sin revisar',
          detail: `${inc.referencia}: "${inc.descripcion}" — ${inc.gravedad}`,
          entityId: inc._id, entityName: inc.referencia, entityType: 'incident',
          obraId: inc.obraId, obraNombre: inc.obraNombre || '',
        });
      }
    }

    // ── Alertas de presupuestos ──
    const now = Date.now();
    const threshold48h = now - 48 * 60 * 60 * 1000;
    const threshold7d = now - 7 * 24 * 60 * 60 * 1000;
    const clientsMap = new Map(clients.map(c => [c._id, c]));

    for (const b of budgets) {
      if (b.estado === 'borrador' && new Date(b.createdAt).getTime() < threshold48h) {
        alerts.push({
          id: `budget_draft_stale_${b._id}`,
          type: 'construction_budget_draft_stale',
          severity: 'warning',
          label: 'Presupuesto en borrador sin completar',
          detail: `${b.referencia} para ${b.clienteNombre || 'sin cliente'} lleva ${Math.round((now - new Date(b.createdAt).getTime()) / 86400000)} días en borrador`,
          entityId: b._id, entityName: b.referencia, entityType: 'budget',
        });
      }

      if (b.estado === 'enviado' && b.enviadoAt && new Date(b.enviadoAt).getTime() < threshold7d) {
        const dias = Math.round((now - new Date(b.enviadoAt).getTime()) / 86400000);
        alerts.push({
          id: `budget_sent_no_response_${b._id}`,
          type: 'construction_budget_no_response',
          severity: 'warning',
          label: 'Presupuesto enviado sin respuesta',
          detail: `${b.referencia} enviado a ${b.clienteNombre} hace ${dias} días`,
          entityId: b._id, entityName: b.referencia, entityType: 'budget',
        });
      }

      const minMargen = Number(b.margenMinimo ?? 10);
      if ((b.estado === 'borrador' || b.estado === 'enviado') && Number(b.margen) < minMargen) {
        alerts.push({
          id: `budget_low_margin_${b._id}`,
          type: 'construction_budget_low_margin',
          severity: 'high',
          label: 'Presupuesto por debajo del margen mínimo',
          detail: `${b.referencia} tiene margen del ${b.margen}% (mínimo: ${minMargen}%)`,
          entityId: b._id, entityName: b.referencia, entityType: 'budget',
        });
      }

      if (b.clienteId) {
        const cli = clientsMap.get(b.clienteId);
        if (cli) {
          const missing = [];
          if (!cli.nombre) missing.push('nombre');
          if (!cli.cif) missing.push('CIF/NIF');
          if (!cli.telefono) missing.push('teléfono');
          if (!cli.email) missing.push('email');
          if (missing.length > 0 && (b.estado === 'borrador' || b.estado === 'enviado')) {
            alerts.push({
              id: `budget_client_incomplete_${b._id}`,
              type: 'construction_client_incomplete',
              severity: 'warning',
              label: 'Cliente sin datos obligatorios',
              detail: `${cli.nombre || 'Cliente'} le falta: ${missing.join(', ')}`,
              entityId: cli._id, entityName: cli.nombre || b.clienteNombre, entityType: 'client',
            });
          }
        }
      }

      if (b.estado === 'aceptado' && b.clienteId && Array.isArray(b.pagos)) {
        for (const p of b.pagos) {
          if (!p.pagado && p.fecha && p.fecha < today) {
            alerts.push({
              id: `client_impago_${b._id}_${p.id}`,
              type: 'cliente_con_impagos',
              severity: 'high',
              label: 'Cliente con cobros vencidos',
              detail: `${b.clienteNombre}: ${p.concepto} — ${Number(p.importe || 0).toLocaleString('es-ES')}€ vencido`,
              entityId: b.clienteId, entityName: b.clienteNombre, entityType: 'client',
              obraId: b.proyectoId || '', obraNombre: b.proyectoNombre || '',
            });
          }
        }
      }

      if (b.estado === 'enviado' && b.enviadoAt) {
        const dias = Math.round((now - new Date(b.enviadoAt).getTime()) / 86400000);
        if (dias > 15) {
          alerts.push({
            id: `client_budget_pending_${b._id}`,
            type: 'cliente_presupuesto_pendiente',
            severity: 'warning',
            label: 'Presupuesto pendiente de respuesta',
            detail: `${b.referencia} para ${b.clienteNombre} — ${dias} días sin respuesta`,
            entityId: b.clienteId || b._id, entityName: b.clienteNombre || b.referencia, entityType: 'client',
          });
        }
      }
    }

    // ── Alertas específicas de clientes (CC-03) ──
    const cifMap = new Map();
    const phoneMap = new Map();
    for (const c of clients) {
      const normCif = (c.cif || '').replace(/[\s-]/g, '').toUpperCase();
      const normPhone = (c.telefono || '').replace(/\D/g, '').slice(-9);
      if (normCif && normCif.length > 3) {
        if (cifMap.has(normCif)) {
          const other = cifMap.get(normCif);
          alerts.push({ id: `client_dup_cif_${c._id}`, type: 'cliente_duplicado', severity: 'warning', label: 'Posible cliente duplicado', detail: `${c.nombre} comparte CIF con ${other.nombre}`, entityId: c._id, entityName: c.nombre, entityType: 'client', obraId: '', obraNombre: '' });
        } else {
          cifMap.set(normCif, c);
        }
      }
      if (normPhone && normPhone.length >= 9) {
        if (phoneMap.has(normPhone)) {
          const other = phoneMap.get(normPhone);
          alerts.push({ id: `client_dup_phone_${c._id}`, type: 'cliente_duplicado', severity: 'warning', label: 'Posible cliente duplicado', detail: `${c.nombre} comparte teléfono con ${other.nombre}`, entityId: c._id, entityName: c.nombre, entityType: 'client', obraId: '', obraNombre: '' });
        } else {
          phoneMap.set(normPhone, c);
        }
      }

      if ((c.tipoCliente === 'empresa' || c.tipoCliente === 'autonomo' || c.tipoCliente === 'promotora') && (!c.cif || !c.razonSocial || !c.direccionFiscal)) {
        alerts.push({ id: `client_no_fiscal_${c._id}`, type: 'cliente_sin_datos_fiscales', severity: 'warning', label: 'Cliente sin datos fiscales', detail: `${c.nombre} (${c.tipoCliente}) — faltan datos fiscales completos`, entityId: c._id, entityName: c.nombre, entityType: 'client', obraId: '', obraNombre: '' });
      }

      if (c.estadoComercial === 'en_obra') {
        const hasActive = budgets.some(b => b.clienteId === c._id) || clients.some(() => false);
        const projectsForClient = (await listConstructionDocsByType(req, userId, 'construction_project')).filter(p => p.clienteId === c._id && (p.estado === 'en_obra' || p.estado === 'planificacion'));
        if (projectsForClient.length === 0) {
          alerts.push({ id: `client_inactive_${c._id}`, type: 'cliente_inactivo', severity: 'warning', label: 'Cliente en obra sin obras activas', detail: `${c.nombre} está marcado como "en obra" pero no tiene obras activas`, entityId: c._id, entityName: c.nombre, entityType: 'client', obraId: '', obraNombre: '' });
        }
      }
    }

    // ── Alertas de cobros de obra ──
    const sevenDaysFromNow = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    for (const col of colls) {
      for (const entrega of (col.entregas || [])) {
        if (entrega.estado === 'cobrado') continue;

        // Cobro próximo (en los próximos 7 días)
        if (entrega.estado === 'pendiente' && entrega.fechaPrevista && entrega.fechaPrevista >= today && entrega.fechaPrevista <= sevenDaysFromNow) {
          alerts.push({
            id: `col_upcoming_${col._id}_${entrega.id}`,
            type: 'construction_collection_upcoming',
            severity: 'warning',
            label: 'Cobro próximo',
            detail: `"${entrega.concepto}" (${entrega.importe}€) vence el ${entrega.fechaPrevista} — ${col.obraNombre}`,
            entityId: col._id, entityName: col.referencia, entityType: 'collection',
            obraId: col.obraId, obraNombre: col.obraNombre || '',
          });
        }

        // Cobro vencido
        if (entrega.estado === 'pendiente' && entrega.fechaPrevista && entrega.fechaPrevista < today) {
          alerts.push({
            id: `col_overdue_${col._id}_${entrega.id}`,
            type: 'construction_collection_overdue',
            severity: 'high',
            label: 'Cobro vencido',
            detail: `"${entrega.concepto}" (${entrega.importe}€) venció el ${entrega.fechaPrevista} — ${col.obraNombre}`,
            entityId: col._id, entityName: col.referencia, entityType: 'collection',
            obraId: col.obraId, obraNombre: col.obraNombre || '',
          });
        }

        // Cobro parcial pendiente de completar
        if (entrega.estado === 'parcial') {
          const restante = entrega.importe - (entrega.cobradoParcial || 0);
          alerts.push({
            id: `col_partial_${col._id}_${entrega.id}`,
            type: 'construction_collection_partial_pending',
            severity: 'warning',
            label: 'Cobro parcial pendiente',
            detail: `"${entrega.concepto}": faltan ${restante.toFixed(2)}€ por cobrar — ${col.obraNombre}`,
            entityId: col._id, entityName: col.referencia, entityType: 'collection',
            obraId: col.obraId, obraNombre: col.obraNombre || '',
          });
        }
      }

      // Obra finalizada con cobros abiertos
      if (col.saldoPendiente > 0 && col.obraId) {
        const prj = projects.find(p => p._id === col.obraId);
        if (prj && (prj.estado === 'finalizada' || prj.estado === 'cerrada')) {
          alerts.push({
            id: `col_project_closed_${col._id}`,
            type: 'construction_collection_project_finished_open',
            severity: 'high',
            label: 'Obra finalizada con cobros abiertos',
            detail: `${col.obraNombre} — pendiente: ${col.saldoPendiente.toFixed(2)}€ (${col.referencia})`,
            entityId: col._id, entityName: col.referencia, entityType: 'collection',
            obraId: col.obraId, obraNombre: col.obraNombre || '',
          });
        }
      }
    }

    return res.json({ ok: true, alerts });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener alertas' });
  }
}

/** GET /api/construction/alerts/:userId/summary — conteos por tipo y severidad */
export async function getConstructionAlertSummaryEndpoint(req, res) {
  let payload = null;
  const mock = {
    status() {
      return this;
    },
    json(p) {
      payload = p;
    },
  };
  try {
    await getConstructionAlerts(req, mock);
    const alerts = payload?.alerts || [];
    const bySeverity = { warning: 0, high: 0 };
    const byType = {};
    for (const a of alerts) {
      if (a.severity === 'high') bySeverity.high += 1;
      else bySeverity.warning += 1;
      const t = a.type || 'unknown';
      byType[t] = (byType[t] || 0) + 1;
    }
    return res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      total: alerts.length,
      bySeverity,
      byType,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al resumir alertas' });
  }
}

// ─── PAYMENTS (PAGOS INTERNOS A GREMIOS / PROVEEDORES) ──────────────────────

async function recalcProjectFinancials(req, userId, obraId) {
  if (!obraId) return;
  const db = getConstructionDbName();
  const project = await getDocument(req, db, obraId);
  if (!project || project.type !== 'construction_project' || project.user_id !== userId) return;

  const allPayments = await listConstructionDocsByType(req, userId, 'construction_payment');
  const obraPayments = allPayments.filter(p => p.obraId === obraId && p.estado !== 'anulado');

  const totalLineasPago = obraPayments.reduce((s, p) => s + Number(p.importePactado || 0), 0);
  const totalPagadoInterno = obraPayments.reduce((s, p) => s + Number(p.totalPagado || 0), 0);
  const totalPendienteInterno = obraPayments.reduce((s, p) => s + Number(p.pendiente || 0), 0);

  let cobradoCliente = Number(project.cobradoCliente || 0);
  if (project.presupuestoId) {
    try {
      const budget = await getDocument(req, db, project.presupuestoId);
      if (budget && budget.type === 'construction_budget') {
        cobradoCliente = Number(budget.totalPagado || 0);
      }
    } catch { /* ignore */ }
  }

  const costeAcumulado = Number(totalPagadoInterno.toFixed(2));
  const margenReal = Number((cobradoCliente - costeAcumulado).toFixed(2));
  const margenRealPorc = cobradoCliente > 0 ? Number(((margenReal / cobradoCliente) * 100).toFixed(1)) : 0;

  const updated = buildConstructionProjectDocument(userId, {
    ...project,
    costeAcumulado,
    cobradoCliente,
    margenReal,
    margenRealPorc,
    totalLineasPago: Number(totalLineasPago.toFixed(2)),
    totalPagadoInterno: Number(totalPagadoInterno.toFixed(2)),
    totalPendienteInterno: Number(totalPendienteInterno.toFixed(2)),
  }, project);
  await putDocument(req, db, updated._id, updated);
}

async function generatePaymentLinesFromBudget(req, userId, budgetDoc) {
  const db = getConstructionDbName();
  const partidas = budgetDoc.partidas || [];
  if (!partidas.length || !budgetDoc.proyectoId) return;

  const existingPayments = await listConstructionDocsByType(req, userId, 'construction_payment');
  const existingForBudget = new Set(
    existingPayments.filter(p => p.presupuestoId === budgetDoc._id).map(p => `${p.gremioNombre}::${p.importePactado}`)
  );

  const guilds = await listConstructionDocsByType(req, userId, 'construction_guild');
  const guildMap = {};
  for (const g of guilds) guildMap[g.nombre?.toLowerCase()] = g;

  for (const partida of partidas) {
    if (!partida.gremio || partida.subtotal <= 0) continue;
    const dedupKey = `${partida.gremio}::${partida.subtotal}`;
    if (existingForBudget.has(dedupKey)) continue;

    const guild = guildMap[partida.gremio?.toLowerCase()];
    const paymentDoc = buildConstructionPaymentDocument(userId, {
      nombre: `${partida.gremio} — ${partida.descripcion || 'Partida de presupuesto'}`,
      tipo: 'gremio',
      obraId: budgetDoc.proyectoId,
      obraNombre: budgetDoc.proyectoNombre || '',
      gremioId: guild?._id || '',
      gremioNombre: partida.gremio,
      gremioTipo: guild?.tipo || '',
      presupuestoId: budgetDoc._id,
      importePactado: partida.subtotal,
    });
    await putDocument(req, db, paymentDoc._id, paymentDoc);
  }

  try {
    const project = await getDocument(req, db, budgetDoc.proyectoId);
    if (project && project.type === 'construction_project') {
      const totalPartidas = partidas.reduce((s, p) => s + (p.subtotal || 0), 0);
      const totalConMargen = budgetDoc.totalConMargen || totalPartidas;
      const margenPrevisto = Number((totalConMargen - totalPartidas).toFixed(2));
      const margenPrevistoPorc = totalConMargen > 0 ? Number(((margenPrevisto / totalConMargen) * 100).toFixed(1)) : 0;

      const updated = buildConstructionProjectDocument(userId, {
        ...project,
        presupuestoTotal: totalConMargen,
        costePresupuestado: totalPartidas,
        margenPrevisto,
        margenPrevistoPorc,
        presupuestoId: budgetDoc._id,
      }, project);
      await putDocument(req, db, updated._id, updated);
    }
  } catch { /* non-blocking */ }
}

export async function listPayments(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const { projectId, tipo, estado, guildId, supplierId } = req.query || {};
    let items = await listConstructionDocsByType(req, userId, 'construction_payment');
    if (projectId) items = items.filter(p => p.obraId === projectId);
    if (tipo) items = items.filter(p => p.tipo === tipo);
    if (estado) items = items.filter(p => p.estado === estado);
    if (guildId) items = items.filter(p => p.gremioId === guildId);
    if (supplierId) items = items.filter(p => p.proveedorId === supplierId);
    return res.json({ ok: true, payments: items.map(sanitizeConstructionPayment) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar pagos' });
  }
}

export async function createPayment(req, res) {
  try {
    const { userId } = req.params;
    const { payment } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!payment || typeof payment !== 'object') return badRequest(res, 'Falta el objeto payment');
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const doc = buildConstructionPaymentDocument(userId, payment);
    const saved = await putDocument(req, db, doc._id, doc);
    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'construction_payment', action: `Creó línea de pago "${doc.nombre}" para ${doc.obraNombre || 'obra'}`,
      entityId: doc._id, entityLabel: doc.referencia, metadata: { tipo: doc.tipo, importe: doc.importePactado },
    });
    try { await recalcProjectFinancials(req, userId, doc.obraId); } catch { /* */ }
    await emitConstructionEvent(req, userId, 'construction:payment_created', { paymentId: doc._id, obraId: doc.obraId });
    return res.status(201).json({ ok: true, payment: sanitizeConstructionPayment({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear línea de pago' });
  }
}

export async function updatePayment(req, res) {
  try {
    const { userId, id } = req.params;
    const { payment } = req.body || {};
    if (!payment) return badRequest(res, 'Faltan datos');
    const existing = await ensureOwner(req, userId, id, 'construction_payment');
    if (!existing) return res.status(404).json({ ok: false, error: 'Línea de pago no encontrada' });
    const db = getConstructionDbName();
    const doc = buildConstructionPaymentDocument(userId, { ...existing, ...payment }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    try { await recalcProjectFinancials(req, userId, doc.obraId); } catch { /* */ }
    await emitConstructionEvent(req, userId, 'construction:payment_updated', { paymentId: doc._id, obraId: doc.obraId });
    return res.json({ ok: true, payment: sanitizeConstructionPayment({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar línea de pago' });
  }
}

export async function removePayment(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_payment');
    if (!existing) return res.status(404).json({ ok: false, error: 'Línea de pago no encontrada' });
    const pagosRealizados = (existing.pagos || []).filter(p => p.pagado);
    if (pagosRealizados.length > 0) {
      return res.status(403).json({ ok: false, error: 'No se puede eliminar una línea con pagos registrados. Anúlela en su lugar.' });
    }
    if (existing.estado === 'pagado') {
      return res.status(403).json({ ok: false, error: 'No se puede eliminar una línea ya pagada' });
    }
    const db = getConstructionDbName();
    await softDeleteDocument(req, db, id);
    try { await recalcProjectFinancials(req, userId, existing.obraId); } catch { /* */ }
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar línea de pago' });
  }
}

export async function registerInstallment(req, res) {
  try {
    const { userId, id } = req.params;
    const { installment } = req.body || {};
    if (!installment || typeof installment !== 'object') return badRequest(res, 'Falta el objeto installment');
    if (!installment.importe || Number(installment.importe) <= 0) return badRequest(res, 'El importe debe ser mayor que 0');

    const existing = await ensureOwner(req, userId, id, 'construction_payment');
    if (!existing) return res.status(404).json({ ok: false, error: 'Línea de pago no encontrada' });
    if (existing.estado === 'anulado') return badRequest(res, 'No se puede registrar pago en una línea anulada');

    const newInstallment = {
      id: `inst-${Date.now().toString(36)}`,
      concepto: String(installment.concepto || ''),
      importe: Number(installment.importe),
      fecha: String(installment.fecha || new Date().toISOString().slice(0, 10)),
      pagado: true,
      fechaPago: String(installment.fechaPago || new Date().toISOString().slice(0, 10)),
      metodoPago: String(installment.metodoPago || 'transferencia'),
      justificanteUrl: String(installment.justificanteUrl || ''),
      justificanteNombre: String(installment.justificanteNombre || ''),
      justificanteMimeType: String(installment.justificanteMimeType || ''),
      facturaProveedorId: String(installment.facturaProveedorId || ''),
      ocrData: installment.ocrData || null,
      faseId: String(installment.faseId || ''),
      faseNombre: String(installment.faseNombre || ''),
      notas: String(installment.notas || ''),
    };

    const pagos = [...(existing.pagos || []), newInstallment];

    const fases = (existing.fases || []).map(f => {
      if (newInstallment.faseId && f.id === newInstallment.faseId) {
        const fasePagado = pagos.filter(p => p.pagado && p.faseId === f.id).reduce((s, p) => s + p.importe, 0);
        return { ...f, completada: fasePagado >= f.importe };
      }
      return f;
    });

    const db = getConstructionDbName();
    const doc = buildConstructionPaymentDocument(userId, { ...existing, pagos, fases }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    const account = await findAccountByUserId(req, userId);
    if (account) {
      await logAccountActivity(req, {
        actorUserId: userId, actorName: account.fullName, targetUserId: userId,
        type: 'construction_payment', action: `Registró pago de ${newInstallment.importe.toFixed(2)}€ en "${doc.nombre}"`,
        entityId: doc._id, entityLabel: doc.referencia, metadata: { importe: newInstallment.importe, pendiente: doc.pendiente },
      });
    }

    try { await recalcProjectFinancials(req, userId, doc.obraId); } catch { /* */ }

    let financeMovementId = '';
    try {
      const financeDb = getFinanceDbName();
      await ensureDatabase(req, financeDb);
      const financeDoc = buildFinanceDocument(userId, {
        type: 'pago',
        concept: `Pago interno "${doc.nombre}" — ${newInstallment.concepto || doc.referencia}`,
        reference: doc.referencia,
        category: 'pagos_obra',
        amountBase: newInstallment.importe,
        taxRate: 0,
        date: newInstallment.fechaPago || newInstallment.fecha,
        companyName: doc.gremioNombre || doc.proveedorNombre || doc.nombre,
        status: 'paid',
        paidAt: new Date().toISOString(),
        source: 'construction_payment',
        sourceRef: doc._id,
        linkedDocuments: [{ id: doc._id, type: 'construction_payment', name: doc.referencia, url: '' }],
      });
      const fSaved = await putDocument(req, financeDb, financeDoc._id, financeDoc);
      financeMovementId = fSaved.id || financeDoc._id;
    } catch { /* finance creation is non-blocking */ }

    await emitConstructionEvent(req, userId, 'construction:payment_registered', {
      paymentId: doc._id, obraId: doc.obraId, importe: newInstallment.importe, pendiente: doc.pendiente, financeMovementId,
    });

    return res.json({ ok: true, payment: sanitizeConstructionPayment({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al registrar pago' });
  }
}

export async function cancelPaymentLine(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_payment');
    if (!existing) return res.status(404).json({ ok: false, error: 'Línea de pago no encontrada' });
    const db = getConstructionDbName();
    const doc = buildConstructionPaymentDocument(userId, { ...existing, estado: 'anulado' }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    try { await recalcProjectFinancials(req, userId, doc.obraId); } catch { /* */ }
    await emitConstructionEvent(req, userId, 'construction:payment_cancelled', { paymentId: doc._id, obraId: doc.obraId });
    return res.json({ ok: true, payment: sanitizeConstructionPayment({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al anular línea de pago' });
  }
}

export async function linkReceipt(req, res) {
  try {
    const { userId, id, installmentId } = req.params;
    const receipt = req.body || {};
    const existing = await ensureOwner(req, userId, id, 'construction_payment');
    if (!existing) return res.status(404).json({ ok: false, error: 'Línea de pago no encontrada' });

    const pagos = (existing.pagos || []).map(p => {
      if (p.id === installmentId) {
        return {
          ...p,
          justificanteUrl: String(receipt.justificanteUrl || p.justificanteUrl || ''),
          justificanteNombre: String(receipt.justificanteNombre || p.justificanteNombre || ''),
          justificanteMimeType: String(receipt.justificanteMimeType || p.justificanteMimeType || ''),
          facturaProveedorId: String(receipt.facturaProveedorId || p.facturaProveedorId || ''),
          ocrData: receipt.ocrData || p.ocrData || null,
        };
      }
      return p;
    });

    const db = getConstructionDbName();
    const doc = buildConstructionPaymentDocument(userId, { ...existing, pagos }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, payment: sanitizeConstructionPayment({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al vincular justificante' });
  }
}

export async function updatePaymentPhases(req, res) {
  try {
    const { userId, id } = req.params;
    const { fases } = req.body || {};
    if (!Array.isArray(fases)) return badRequest(res, 'Falta el array fases');
    const existing = await ensureOwner(req, userId, id, 'construction_payment');
    if (!existing) return res.status(404).json({ ok: false, error: 'Línea de pago no encontrada' });

    const totalFases = fases.reduce((s, f) => s + Number(f.importe || 0), 0);
    if (totalFases > existing.importePactado * 1.001) {
      return badRequest(res, `La suma de las fases (${totalFases.toFixed(2)}€) supera el importe pactado (${existing.importePactado.toFixed(2)}€)`);
    }

    const db = getConstructionDbName();
    const doc = buildConstructionPaymentDocument(userId, { ...existing, fases }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, payment: sanitizeConstructionPayment({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar fases' });
  }
}

export async function getPaymentsByProject(req, res) {
  try {
    const { userId, projectId } = req.params;
    if (!userId || !projectId) return badRequest(res, 'Falta userId o projectId');
    const items = await listConstructionDocsByType(req, userId, 'construction_payment');
    const filtered = items.filter(p => p.obraId === projectId);

    const totalPactado = filtered.reduce((s, p) => s + Number(p.importePactado || 0), 0);
    const totalPagado = filtered.filter(p => p.estado !== 'anulado').reduce((s, p) => s + Number(p.totalPagado || 0), 0);
    const totalPendiente = filtered.filter(p => p.estado !== 'anulado').reduce((s, p) => s + Number(p.pendiente || 0), 0);

    const byType = {};
    for (const p of filtered) {
      if (!byType[p.tipo]) byType[p.tipo] = { pactado: 0, pagado: 0, pendiente: 0, count: 0 };
      byType[p.tipo].pactado += Number(p.importePactado || 0);
      byType[p.tipo].pagado += Number(p.totalPagado || 0);
      byType[p.tipo].pendiente += Number(p.pendiente || 0);
      byType[p.tipo].count++;
    }

    return res.json({
      ok: true,
      payments: filtered.map(sanitizeConstructionPayment),
      summary: { totalPactado, totalPagado, totalPendiente, byType, count: filtered.length },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener pagos por obra' });
  }
}

export async function getPaymentsSummary(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const { projectId } = req.query || {};
    let items = await listConstructionDocsByType(req, userId, 'construction_payment');
    if (projectId) items = items.filter(p => p.obraId === projectId);

    const active = items.filter(p => p.estado !== 'anulado');
    const totalPactado = active.reduce((s, p) => s + Number(p.importePactado || 0), 0);
    const totalPagado = active.reduce((s, p) => s + Number(p.totalPagado || 0), 0);
    const totalPendiente = active.reduce((s, p) => s + Number(p.pendiente || 0), 0);

    const today = new Date().toISOString().slice(0, 10);
    const vencidas = active.filter(p => p.fechaPrevista && p.fechaPrevista < today && p.estado !== 'pagado');

    const byProject = {};
    for (const p of active) {
      const key = p.obraId || 'sin_obra';
      if (!byProject[key]) byProject[key] = { obraId: p.obraId, obraNombre: p.obraNombre, pactado: 0, pagado: 0, pendiente: 0, count: 0 };
      byProject[key].pactado += Number(p.importePactado || 0);
      byProject[key].pagado += Number(p.totalPagado || 0);
      byProject[key].pendiente += Number(p.pendiente || 0);
      byProject[key].count++;
    }

    const byType = {};
    for (const p of active) {
      if (!byType[p.tipo]) byType[p.tipo] = { pactado: 0, pagado: 0, pendiente: 0, count: 0 };
      byType[p.tipo].pactado += Number(p.importePactado || 0);
      byType[p.tipo].pagado += Number(p.totalPagado || 0);
      byType[p.tipo].pendiente += Number(p.pendiente || 0);
      byType[p.tipo].count++;
    }

    return res.json({
      ok: true,
      summary: {
        totalPactado, totalPagado, totalPendiente,
        totalLineas: active.length, lineasVencidas: vencidas.length,
        byProject: Object.values(byProject),
        byType,
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener resumen de pagos' });
  }
}

export async function generatePaymentLinesFromBudgetEndpoint(req, res) {
  try {
    const { userId, budgetId } = req.params;
    if (!userId || !budgetId) return badRequest(res, 'Falta userId o budgetId');
    const existing = await ensureOwner(req, userId, budgetId, 'construction_budget');
    if (!existing) return res.status(404).json({ ok: false, error: 'Presupuesto no encontrado' });
    if (existing.estado !== 'aceptado') return badRequest(res, 'El presupuesto debe estar aceptado');

    await generatePaymentLinesFromBudget(req, userId, existing);

    const payments = await listConstructionDocsByType(req, userId, 'construction_payment');
    const generated = payments.filter(p => p.presupuestoId === budgetId);

    return res.json({ ok: true, generated: generated.length, payments: generated.map(sanitizeConstructionPayment) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al generar líneas de pago' });
  }
}

// ─── CLOCKIN CROSS-REFERENCE (CRUCE CON FICHAJES) ───────────────────────────

export async function getClockinComparison(req, res) {
  try {
    const { userId } = req.params;
    const { date, workerId } = req.query || {};
    if (!userId) return badRequest(res, 'Falta userId');

    const reports = await listConstructionDocsByType(req, userId, 'construction_daily_report');

    let filteredReports = reports;
    if (date) filteredReports = filteredReports.filter(r => r.fecha === date);
    if (workerId) filteredReports = filteredReports.filter(r => r.trabajadorId === workerId);

    const clockinsDb = getClockinsDbName();
    await ensureDatabase(req, clockinsDb);
    const allClockins = await getAllDocuments(req, clockinsDb);
    const clockins = allClockins.filter(d => d?.type === 'clockin' && !d?.deletedAt);

    const comparison = filteredReports.map(report => {
      const workerClockins = clockins.filter(c =>
        c.date === report.fecha &&
        (c.worker_id === report.trabajadorId || c.employee_name === report.trabajadorNombre)
      );

      const clockinHoras = workerClockins.reduce((s, c) => {
        const horas = Number(c.totalHours || c.hours || 0);
        return s + horas;
      }, 0);

      const desviacion = report.horasTrabajadas - clockinHoras;

      return {
        parteId: report._id,
        referencia: report.referencia,
        fecha: report.fecha,
        trabajadorId: report.trabajadorId,
        trabajadorNombre: report.trabajadorNombre,
        obraNombre: report.obraNombre,
        horasParte: report.horasTrabajadas,
        horasFichaje: clockinHoras,
        desviacion,
        desviacionPorcentaje: clockinHoras > 0 ? Math.round((desviacion / clockinHoras) * 100) : null,
        fichajesEncontrados: workerClockins.length,
        clockinId: workerClockins.length === 1 ? workerClockins[0]._id : null,
      };
    });

    return res.json({ ok: true, comparison });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cruzar fichajes' });
  }
}

// ─── CIERRE DE OBRA ───────────────────────────────────────────────────────────

export async function getClosureSummary(req, res) {
  try {
    const { userId, id } = req.params;
    if (!userId || !id) return badRequest(res, 'Falta userId o projectId');

    const project = await ensureOwner(req, userId, id, 'construction_project');
    if (!project) return res.status(404).json({ ok: false, error: 'Proyecto no encontrado' });

    const db = getConstructionDbName();
    await ensureDatabase(req, db);

    const budgets = (await listConstructionDocsByType(req, userId, 'construction_budget')).filter(b => b.proyectoId === id);
    const incidents = (await listConstructionDocsByType(req, userId, 'construction_incident')).filter(i => i.obraId === id);
    const tasks = (await listConstructionDocsByType(req, userId, 'construction_task')).filter(t => t.obraId === id);
    const obraDocs = (await listConstructionDocsByType(req, userId, 'construction_obra_document')).filter(d => d.obraId === id);
    const dailyReports = (await listConstructionDocsByType(req, userId, 'construction_daily_report')).filter(r => r.obraId === id);

    const presupuestoInicial = budgets.reduce((s, b) => s + (Number(b.totalConMargen) || 0), 0);
    const totalCobrado = budgets.reduce((s, b) => s + (Number(b.totalPagado) || 0), 0);
    const pendienteCobro = presupuestoInicial - totalCobrado;
    const horasTotales = dailyReports.reduce((s, r) => s + (Number(r.horasTrabajadas) || 0), 0);
    const costeTotal = dailyReports.reduce((s, r) => s + (Number(r.costeTotal) || 0), 0);
    const margenPrevisto = budgets.length ? budgets.reduce((s, b) => s + (Number(b.margen) || 0), 0) / budgets.length : 0;
    const margenReal = presupuestoInicial > 0 ? Math.round(((presupuestoInicial - costeTotal) / presupuestoInicial) * 10000) / 100 : 0;

    const incidenciasAbiertas = incidents.filter(i => !['cerrada', 'resuelta'].includes(i.estado));
    const tareasPendientes = tasks.filter(t => !['completada', 'cancelada'].includes(t.estado));
    const cobrosPendientes = budgets.flatMap(b => (b.pagos || []).filter(p => !p.pagado));
    const docsPendientes = obraDocs.filter(d => d.obligatorio && d.estado === 'pendiente');

    const blockingReasons = [];
    if (incidenciasAbiertas.length > 0) blockingReasons.push(`Hay ${incidenciasAbiertas.length} incidencia(s) abierta(s)`);
    if (cobrosPendientes.length > 0) blockingReasons.push(`Hay ${cobrosPendientes.length} cobro(s) pendiente(s)`);
    if (docsPendientes.length > 0) blockingReasons.push(`Faltan ${docsPendientes.length} documento(s) obligatorio(s)`);
    if (tareasPendientes.length > 0) blockingReasons.push(`Hay ${tareasPendientes.length} tarea(s) pendiente(s)`);

    const canClose = blockingReasons.length === 0;
    const alreadyClosed = project.estado === 'cerrada';

    return res.json({
      ok: true,
      project: sanitizeConstructionProject(project),
      summary: {
        presupuestoInicial,
        totalCobrado,
        totalPagado: costeTotal,
        pendienteCobro,
        pendientePago: 0,
        margenPrevisto,
        margenReal,
        horasTotales,
        incidencias: {
          total: incidents.length,
          abiertas: incidenciasAbiertas.length,
          resueltas: incidents.filter(i => i.estado === 'resuelta').length,
          cerradas: incidents.filter(i => i.estado === 'cerrada').length,
        },
        tareas: {
          total: tasks.length,
          completadas: tasks.filter(t => t.estado === 'completada').length,
          pendientes: tareasPendientes.length,
        },
      },
      checklist: {
        cobrosPendientes,
        pagosPendientes: [],
        incidenciasAbiertas: incidenciasAbiertas.map(i => ({ _id: i._id, referencia: i.referencia, titulo: i.titulo, tipo: i.tipo, gravedad: i.gravedad || i.prioridad, estado: i.estado, obraNombre: i.obraNombre })),
        documentosPendientes: docsPendientes.map(d => ({ _id: d._id, nombre: d.nombre, categoria: d.categoria })),
        tareasPendientes: tareasPendientes.map(t => ({ _id: t._id, titulo: t.titulo, estado: t.estado, trabajadorNombre: t.trabajadorNombre })),
      },
      canClose,
      alreadyClosed,
      blockingReasons,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener resumen de cierre' });
  }
}

export async function closeProject(req, res) {
  try {
    const { userId, id } = req.params;
    const { motivoCierre, forzarCierre } = req.body || {};
    if (!userId || !id) return badRequest(res, 'Falta userId o projectId');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const allowedRoles = ['owner', 'admin', 'manager', 'gerente'];
    if (account.role && !allowedRoles.includes(account.role)) {
      return res.status(403).json({ ok: false, error: 'No tienes permisos para cerrar obras' });
    }

    const project = await ensureOwner(req, userId, id, 'construction_project');
    if (!project) return res.status(404).json({ ok: false, error: 'Proyecto no encontrado' });
    if (project.estado === 'cerrada') return badRequest(res, 'La obra ya está cerrada');
    if (project.estado !== 'finalizada' && !forzarCierre) {
      return badRequest(res, 'Solo se pueden cerrar obras en estado "finalizada". Usa forzarCierre para omitir.');
    }

    const db = getConstructionDbName();
    await ensureDatabase(req, db);

    const budgets = (await listConstructionDocsByType(req, userId, 'construction_budget')).filter(b => b.proyectoId === id);
    const incidents = (await listConstructionDocsByType(req, userId, 'construction_incident')).filter(i => i.obraId === id);
    const tasks = (await listConstructionDocsByType(req, userId, 'construction_task')).filter(t => t.obraId === id);
    const obraDocs = (await listConstructionDocsByType(req, userId, 'construction_obra_document')).filter(d => d.obraId === id);
    const dailyReports = (await listConstructionDocsByType(req, userId, 'construction_daily_report')).filter(r => r.obraId === id);

    const presupuestoInicial = budgets.reduce((s, b) => s + (Number(b.totalConMargen) || 0), 0);
    const totalCobrado = budgets.reduce((s, b) => s + (Number(b.totalPagado) || 0), 0);
    const pendienteCobro = presupuestoInicial - totalCobrado;
    const horasTotales = dailyReports.reduce((s, r) => s + (Number(r.horasTrabajadas) || 0), 0);
    const costeTotal = dailyReports.reduce((s, r) => s + (Number(r.costeTotal) || 0), 0);
    const margenPrevisto = budgets.length ? budgets.reduce((s, b) => s + (Number(b.margen) || 0), 0) / budgets.length : 0;
    const margenReal = presupuestoInicial > 0 ? Math.round(((presupuestoInicial - costeTotal) / presupuestoInicial) * 10000) / 100 : 0;

    const incidenciasAbiertas = incidents.filter(i => !['cerrada', 'resuelta'].includes(i.estado));
    const tareasPendientes = tasks.filter(t => !['completada', 'cancelada'].includes(t.estado));
    const cobrosPendientes = budgets.flatMap(b => (b.pagos || []).filter(p => !p.pagado));
    const docsPendientes = obraDocs.filter(d => d.obligatorio && d.estado === 'pendiente');

    const warnings = [];
    if (incidenciasAbiertas.length > 0) warnings.push(`Se cerró con ${incidenciasAbiertas.length} incidencia(s) abierta(s)`);
    if (cobrosPendientes.length > 0) warnings.push(`Se cerró con ${cobrosPendientes.length} cobro(s) pendiente(s)`);
    if (docsPendientes.length > 0) warnings.push(`Se cerró con ${docsPendientes.length} documento(s) obligatorio(s) pendiente(s)`);
    if (tareasPendientes.length > 0) warnings.push(`Se cerró con ${tareasPendientes.length} tarea(s) pendiente(s)`);

    if (warnings.length > 0 && !forzarCierre) {
      return res.status(400).json({ ok: false, error: 'Hay pendientes sin resolver', blockingReasons: warnings, requiresForce: true });
    }

    const resumenCierre = {
      presupuestoInicial, totalCobrado, totalPagado: costeTotal,
      pendienteCobro, pendientePago: 0, margenPrevisto, margenReal, horasTotales,
      incidencias: { total: incidents.length, abiertas: incidenciasAbiertas.length, resueltas: incidents.filter(i => i.estado === 'resuelta').length, cerradas: incidents.filter(i => i.estado === 'cerrada').length },
      tareas: { total: tasks.length, completadas: tasks.filter(t => t.estado === 'completada').length, pendientes: tareasPendientes.length },
      fechaGeneracion: new Date().toISOString(),
    };

    const doc = buildConstructionProjectDocument(userId, {
      ...project,
      estado: 'cerrada',
      archivada: true,
      fechaCierre: new Date().toISOString(),
      cerradoPor: userId,
      cerradoPorNombre: account.fullName || '',
      motivoCierre: String(motivoCierre || ''),
      resumenCierre,
    }, project);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'construction_project', action: `Cerró obra "${project.nombre}"${warnings.length ? ' (con pendientes)' : ''}`,
      entityId: doc._id, entityLabel: project.nombre, metadata: { motivoCierre, forzado: Boolean(forzarCierre), warnings },
    });

    await emitConstructionEvent(req, userId, 'construction:project-closed', { projectId: id, nombre: project.nombre });

    return res.json({
      ok: true,
      project: sanitizeConstructionProject({ ...doc, _rev: saved.rev }),
      summary: resumenCierre,
      warnings,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cerrar obra' });
  }
}

export async function reopenProject(req, res) {
  try {
    const { userId, id } = req.params;
    const { motivoReapertura } = req.body || {};
    if (!userId || !id) return badRequest(res, 'Falta userId o projectId');
    if (!motivoReapertura || !String(motivoReapertura).trim()) {
      return badRequest(res, 'El motivo de reapertura es obligatorio');
    }

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const allowedRoles = ['owner', 'admin', 'manager', 'gerente'];
    if (account.role && !allowedRoles.includes(account.role)) {
      return res.status(403).json({ ok: false, error: 'No tienes permisos para reabrir obras' });
    }

    const project = await ensureOwner(req, userId, id, 'construction_project');
    if (!project) return res.status(404).json({ ok: false, error: 'Proyecto no encontrado' });
    if (project.estado !== 'cerrada') return badRequest(res, 'Solo se pueden reabrir obras en estado "cerrada"');

    const db = getConstructionDbName();
    const doc = buildConstructionProjectDocument(userId, {
      ...project,
      estado: 'finalizada',
      archivada: false,
      fechaReapertura: new Date().toISOString(),
      reabiertoPor: userId,
      reabiertoPorNombre: account.fullName || '',
    }, project);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'construction_project', action: `Reabrió obra "${project.nombre}" — motivo: ${motivoReapertura}`,
      entityId: doc._id, entityLabel: project.nombre, metadata: { motivoReapertura },
    });

    await emitConstructionEvent(req, userId, 'construction:project-reopened', { projectId: id, nombre: project.nombre });

    return res.json({ ok: true, project: sanitizeConstructionProject({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al reabrir obra' });
  }
}

// ─── COLLECTIONS (COBROS DE OBRA) ─────────────────────────────────────────────

export async function listCollections(req, res) {
  try {
    const { userId } = req.params;
    const { obraId, clienteId, estadoCobro } = req.query || {};
    if (!userId) return badRequest(res, 'Falta userId');
    let items = await listConstructionDocsByType(req, userId, 'construction_collection');
    if (obraId) items = items.filter(c => c.obraId === obraId);
    if (clienteId) items = items.filter(c => c.clienteId === clienteId);
    if (estadoCobro) items = items.filter(c => c.estadoCobro === estadoCobro);
    return res.json({ ok: true, collections: items.map(sanitizeConstructionCollection) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar cobros' });
  }
}

export async function getCollection(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_collection');
    if (!existing) return res.status(404).json({ ok: false, error: 'Cobro no encontrado' });
    return res.json({ ok: true, collection: sanitizeConstructionCollection(existing) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener cobro' });
  }
}

export async function createCollection(req, res) {
  try {
    const { userId } = req.params;
    const { collection } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!collection || typeof collection !== 'object') return badRequest(res, 'Falta el objeto collection');
    if (!collection.obraId) return badRequest(res, 'Falta obraId');
    if (!collection.importeTotal || collection.importeTotal <= 0) return badRequest(res, 'El importe total debe ser mayor a 0');

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const doc = buildConstructionCollectionDocument(userId, collection);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'construction_collection', action: `Creó cobro ${doc.referencia} — ${doc.obraNombre}`,
      entityId: doc._id, entityLabel: doc.referencia,
      metadata: { tipoCobro: doc.tipoCobro, importeTotal: doc.importeTotal },
    });

    await emitConstructionEvent(req, userId, 'collection:created', { collection: sanitizeConstructionCollection({ ...doc, _rev: saved.rev }) });

    return res.status(201).json({ ok: true, collection: sanitizeConstructionCollection({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear cobro' });
  }
}

export async function updateCollection(req, res) {
  try {
    const { userId, id } = req.params;
    const { collection } = req.body || {};
    if (!collection) return badRequest(res, 'Faltan datos');

    const existing = await ensureOwner(req, userId, id, 'construction_collection');
    if (!existing) return res.status(404).json({ ok: false, error: 'Cobro no encontrado' });

    const db = getConstructionDbName();
    const doc = buildConstructionCollectionDocument(userId, { ...existing, ...collection }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await emitConstructionEvent(req, userId, 'collection:updated', { collection: sanitizeConstructionCollection({ ...doc, _rev: saved.rev }) });

    return res.json({ ok: true, collection: sanitizeConstructionCollection({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar cobro' });
  }
}

export async function removeCollection(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_collection');
    if (!existing) return res.status(404).json({ ok: false, error: 'Cobro no encontrado' });

    const db = getConstructionDbName();
    await softDeleteDocument(req, db, id);

    await emitConstructionEvent(req, userId, 'collection:deleted', { id });

    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar cobro' });
  }
}

export async function collectPayment(req, res) {
  try {
    const { userId, id } = req.params;
    const { entregaId, fechaCobro, observaciones } = req.body || {};
    if (!entregaId) return badRequest(res, 'Falta entregaId');

    const existing = await ensureOwner(req, userId, id, 'construction_collection');
    if (!existing) return res.status(404).json({ ok: false, error: 'Cobro no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const entregaIdx = (existing.entregas || []).findIndex(e => e.id === Number(entregaId));
    if (entregaIdx === -1) return badRequest(res, 'Entrega no encontrada');

    const entrega = existing.entregas[entregaIdx];
    if (entrega.estado === 'cobrado') return badRequest(res, 'Esta entrega ya está cobrada');

    const cobradoDate = fechaCobro || new Date().toISOString().slice(0, 10);

    // Create finance movement
    let financeMovementId = '';
    try {
      const financeDb = getFinanceDbName();
      await ensureDatabase(req, financeDb);
      const financeDoc = buildFinanceDocument(userId, {
        type: 'cobro',
        concept: `Cobro obra "${existing.obraNombre}" — ${entrega.concepto}`,
        reference: existing.referencia,
        category: 'cobros_obra',
        amountBase: entrega.importe,
        taxRate: 0,
        date: cobradoDate,
        companyName: existing.clienteNombre,
        status: 'paid',
        paidAt: new Date().toISOString(),
        source: 'construction_collection',
        sourceRef: existing._id,
        linkedDocuments: [{ id: existing._id, type: 'construction_collection', name: existing.referencia, url: '' }],
      });
      const fSaved = await putDocument(req, financeDb, financeDoc._id, financeDoc);
      financeMovementId = fSaved.id || financeDoc._id;
    } catch (_finErr) { /* finance creation is non-blocking */ }

    const updatedEntregas = existing.entregas.map(e =>
      e.id === Number(entregaId) ? {
        ...e,
        estado: 'cobrado',
        fechaCobro: cobradoDate,
        cobradoTotal: e.importe,
        cobradoParcial: 0,
        observaciones: observaciones || e.observaciones || '',
        financeMovementId,
      } : e
    );

    const db = getConstructionDbName();
    const doc = buildConstructionCollectionDocument(userId, { ...existing, entregas: updatedEntregas }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'construction_collection', action: `Registró cobro completo: ${entrega.concepto} (${entrega.importe}€) — ${existing.obraNombre}`,
      entityId: doc._id, entityLabel: doc.referencia,
      metadata: { entregaId, importe: entrega.importe },
    });

    await emitConstructionEvent(req, userId, 'collection:payment', { collection: sanitizeConstructionCollection({ ...doc, _rev: saved.rev }) });

    return res.json({ ok: true, collection: sanitizeConstructionCollection({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al registrar cobro' });
  }
}

export async function collectPartialPayment(req, res) {
  try {
    const { userId, id } = req.params;
    const { entregaId, importeParcial, fechaCobro, observaciones } = req.body || {};
    if (!entregaId) return badRequest(res, 'Falta entregaId');
    if (!importeParcial || importeParcial <= 0) return badRequest(res, 'El importe parcial debe ser mayor a 0');

    const existing = await ensureOwner(req, userId, id, 'construction_collection');
    if (!existing) return res.status(404).json({ ok: false, error: 'Cobro no encontrado' });

    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

    const entregaIdx = (existing.entregas || []).findIndex(e => e.id === Number(entregaId));
    if (entregaIdx === -1) return badRequest(res, 'Entrega no encontrada');

    const entrega = existing.entregas[entregaIdx];
    if (entrega.estado === 'cobrado') return badRequest(res, 'Esta entrega ya está cobrada');

    const newParcial = (Number(entrega.cobradoParcial) || 0) + Number(importeParcial);
    const isComplete = newParcial >= entrega.importe;
    const cobradoDate = fechaCobro || new Date().toISOString().slice(0, 10);

    // Create finance movement for partial
    let financeMovementId = entrega.financeMovementId || '';
    try {
      const financeDb = getFinanceDbName();
      await ensureDatabase(req, financeDb);
      const financeDoc = buildFinanceDocument(userId, {
        type: 'cobro',
        concept: `Cobro parcial obra "${existing.obraNombre}" — ${entrega.concepto}`,
        reference: existing.referencia,
        category: 'cobros_obra',
        amountBase: Number(importeParcial),
        taxRate: 0,
        date: cobradoDate,
        companyName: existing.clienteNombre,
        status: 'paid',
        paidAt: new Date().toISOString(),
        source: 'construction_collection',
        sourceRef: existing._id,
        linkedDocuments: [{ id: existing._id, type: 'construction_collection', name: existing.referencia, url: '' }],
      });
      const fSaved = await putDocument(req, financeDb, financeDoc._id, financeDoc);
      financeMovementId = fSaved.id || financeDoc._id;
    } catch (_finErr) { /* finance creation is non-blocking */ }

    const updatedEntregas = existing.entregas.map(e =>
      e.id === Number(entregaId) ? {
        ...e,
        estado: isComplete ? 'cobrado' : 'parcial',
        fechaCobro: isComplete ? cobradoDate : (e.fechaCobro || ''),
        cobradoParcial: isComplete ? 0 : newParcial,
        cobradoTotal: isComplete ? e.importe : 0,
        observaciones: observaciones || e.observaciones || '',
        financeMovementId,
      } : e
    );

    const db = getConstructionDbName();
    const doc = buildConstructionCollectionDocument(userId, { ...existing, entregas: updatedEntregas }, existing);
    const saved = await putDocument(req, db, doc._id, doc);

    await logAccountActivity(req, {
      actorUserId: userId, actorName: account.fullName, targetUserId: userId,
      type: 'construction_collection', action: `Registró cobro parcial: ${importeParcial}€ de ${entrega.concepto} — ${existing.obraNombre}`,
      entityId: doc._id, entityLabel: doc.referencia,
      metadata: { entregaId, importeParcial },
    });

    await emitConstructionEvent(req, userId, 'collection:partial', { collection: sanitizeConstructionCollection({ ...doc, _rev: saved.rev }) });

    return res.json({ ok: true, collection: sanitizeConstructionCollection({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al registrar cobro parcial' });
  }
}

export async function getCollectionSummaryByProject(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const collections = await listConstructionDocsByType(req, userId, 'construction_collection');
    const projectMap = {};

    for (const c of collections) {
      if (!c.obraId) continue;
      if (!projectMap[c.obraId]) {
        projectMap[c.obraId] = {
          obraId: c.obraId,
          obraNombre: c.obraNombre || '',
          importeTotal: 0,
          importeCobrado: 0,
          saldoPendiente: 0,
          totalCobros: 0,
          cobrosVencidos: 0,
        };
      }
      const p = projectMap[c.obraId];
      p.importeTotal += Number(c.importeTotal || 0);
      p.importeCobrado += Number(c.importeCobrado || 0);
      p.saldoPendiente += Number(c.saldoPendiente || 0);
      p.totalCobros += 1;
      if (c.estadoCobro === 'vencido') p.cobrosVencidos += 1;
    }

    return res.json({ ok: true, summary: Object.values(projectMap) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener resumen por obra' });
  }
}

export async function getCollectionSummaryByClient(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const collections = await listConstructionDocsByType(req, userId, 'construction_collection');
    const clientMap = {};

    for (const c of collections) {
      if (!c.clienteId) continue;
      if (!clientMap[c.clienteId]) {
        clientMap[c.clienteId] = {
          clienteId: c.clienteId,
          clienteNombre: c.clienteNombre || '',
          importeTotal: 0,
          importeCobrado: 0,
          saldoPendiente: 0,
          totalCobros: 0,
          cobrosVencidos: 0,
        };
      }
      const cl = clientMap[c.clienteId];
      cl.importeTotal += Number(c.importeTotal || 0);
      cl.importeCobrado += Number(c.importeCobrado || 0);
      cl.saldoPendiente += Number(c.saldoPendiente || 0);
      cl.totalCobros += 1;
      if (c.estadoCobro === 'vencido') cl.cobrosVencidos += 1;
    }

    return res.json({ ok: true, summary: Object.values(clientMap) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener resumen por cliente' });
  }
}

// ─── PLANNING ENTRIES (Planificación de obra) ─────────────────────────────────

function detectPlanningConflicts(entry, allEntries) {
  const conflicts = [];
  if (!entry.recursoId || !entry.fechaInicio || !entry.fechaFin) return conflicts;
  const start = entry.fechaInicio;
  const end = entry.fechaFin;
  for (const other of allEntries) {
    if (other._id === entry._id) continue;
    if (other.estado === 'cancelado' || other.estado === 'completado') continue;
    if (other.recursoId !== entry.recursoId) continue;
    if (other.fechaFin < start || other.fechaInicio > end) continue;
    const tipo = entry.tipoRecurso === 'trabajador' ? 'solapamiento_trabajador'
      : entry.tipoRecurso === 'maquinaria' ? 'solapamiento_maquinaria' : 'solapamiento_subcontrata';
    conflicts.push({
      tipo,
      mensaje: `${other.recursoNombre} ya asignado a ${other.obraNombre} del ${other.fechaInicio} al ${other.fechaFin}`,
      entryId: other._id,
      obraNombre: other.obraNombre,
      fechas: `${other.fechaInicio} - ${other.fechaFin}`,
    });
  }
  return conflicts;
}

export async function listPlanningEntries(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const items = await listConstructionDocsByType(req, userId, 'construction_planning_entry');
    let filtered = items;
    const { projectId, tipoRecurso, recursoId, estado, dateFrom, dateTo } = req.query;
    if (projectId) filtered = filtered.filter(e => e.obraId === projectId);
    if (tipoRecurso) filtered = filtered.filter(e => e.tipoRecurso === tipoRecurso);
    if (recursoId) filtered = filtered.filter(e => e.recursoId === recursoId);
    if (estado) filtered = filtered.filter(e => e.estado === estado);
    if (dateFrom) filtered = filtered.filter(e => e.fechaFin >= dateFrom);
    if (dateTo) filtered = filtered.filter(e => e.fechaInicio <= dateTo);
    return res.json({ ok: true, entries: filtered.map(sanitizeConstructionPlanningEntry) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar planificación' });
  }
}

export async function createPlanningEntry(req, res) {
  try {
    const { userId } = req.params;
    const { entry } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!entry || typeof entry !== 'object') return badRequest(res, 'Falta el objeto entry');
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const allEntries = await listConstructionDocsByType(req, userId, 'construction_planning_entry');
    const doc = buildConstructionPlanningEntryDocument(userId, {
      ...entry,
      historial: [{ accion: 'creado', usuario: userId, fecha: new Date().toISOString(), detalle: '' }],
    });
    doc.conflictos = detectPlanningConflicts(doc, allEntries);
    const saved = await putDocument(req, db, doc._id, doc);
    await emitConstructionEvent(req, userId, 'construction:planning_created', { entryId: doc._id });
    return res.status(201).json({ ok: true, entry: sanitizeConstructionPlanningEntry({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear entrada de planificación' });
  }
}

export async function updatePlanningEntry(req, res) {
  try {
    const { userId, id: docId } = req.params;
    const { entry } = req.body || {};
    if (!userId || !docId) return badRequest(res, 'Falta userId o id');
    const existing = await ensureOwner(req, userId, docId, 'construction_planning_entry');
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrada no encontrada' });
    const db = getConstructionDbName();
    const allEntries = await listConstructionDocsByType(req, userId, 'construction_planning_entry');
    const hist = [...(existing.historial || []), { accion: 'editado', usuario: userId, fecha: new Date().toISOString(), detalle: '' }];
    const doc = buildConstructionPlanningEntryDocument(userId, { ...entry, historial: hist }, existing);
    doc.conflictos = detectPlanningConflicts(doc, allEntries);
    const saved = await putDocument(req, db, doc._id, doc);
    await emitConstructionEvent(req, userId, 'construction:planning_updated', { entryId: doc._id });
    return res.json({ ok: true, entry: sanitizeConstructionPlanningEntry({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar entrada' });
  }
}

export async function removePlanningEntry(req, res) {
  try {
    const { userId, id: docId } = req.params;
    if (!userId || !docId) return badRequest(res, 'Falta userId o id');
    const existing = await ensureOwner(req, userId, docId, 'construction_planning_entry');
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrada no encontrada' });
    if (existing.estado !== 'planificado' && existing.estado !== 'cancelado') {
      return res.status(403).json({ ok: false, error: 'Solo se pueden eliminar entradas planificadas o canceladas' });
    }
    const db = getConstructionDbName();
    await softDeleteDocument(req, db, docId, existing._rev);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar entrada' });
  }
}

export async function confirmPlanningEntry(req, res) {
  try {
    const { userId, id: docId } = req.params;
    if (!userId || !docId) return badRequest(res, 'Falta userId o id');
    const existing = await ensureOwner(req, userId, docId, 'construction_planning_entry');
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrada no encontrada' });
    const db = getConstructionDbName();
    const now = new Date().toISOString();
    const hist = [...(existing.historial || []), { accion: 'confirmado', usuario: userId, fecha: now, detalle: '' }];
    const doc = buildConstructionPlanningEntryDocument(userId, {
      estado: 'confirmado', confirmado: true, confirmadoAt: now,
      confirmadoPor: req.body?.confirmadoPor || userId, historial: hist,
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await emitConstructionEvent(req, userId, 'construction:planning_updated', { entryId: doc._id, action: 'confirmed' });
    return res.json({ ok: true, entry: sanitizeConstructionPlanningEntry({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al confirmar' });
  }
}

export async function startPlanningEntry(req, res) {
  try {
    const { userId, id: docId } = req.params;
    if (!userId || !docId) return badRequest(res, 'Falta userId o id');
    const existing = await ensureOwner(req, userId, docId, 'construction_planning_entry');
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrada no encontrada' });
    const db = getConstructionDbName();
    const now = new Date().toISOString();
    const hist = [...(existing.historial || []), { accion: 'iniciado', usuario: userId, fecha: now, detalle: '' }];
    const doc = buildConstructionPlanningEntryDocument(userId, { estado: 'en_curso', historial: hist }, existing);
    if (existing.tareaId) {
      try {
        const task = await getDocument(req, db, existing.tareaId);
        if (task && task.estado === 'pendiente') {
          task.estado = 'en_progreso'; task.updatedAt = now;
          await putDocument(req, db, task._id, task);
        }
      } catch { /* ignore */ }
    }
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, entry: sanitizeConstructionPlanningEntry({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al iniciar' });
  }
}

export async function completePlanningEntry(req, res) {
  try {
    const { userId, id: docId } = req.params;
    if (!userId || !docId) return badRequest(res, 'Falta userId o id');
    const existing = await ensureOwner(req, userId, docId, 'construction_planning_entry');
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrada no encontrada' });
    const db = getConstructionDbName();
    const now = new Date().toISOString();
    const hist = [...(existing.historial || []), { accion: 'completado', usuario: userId, fecha: now, detalle: '' }];
    const doc = buildConstructionPlanningEntryDocument(userId, { estado: 'completado', historial: hist }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await emitConstructionEvent(req, userId, 'construction:planning_completed', { entryId: doc._id });
    return res.json({ ok: true, entry: sanitizeConstructionPlanningEntry({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al completar' });
  }
}

export async function cancelPlanningEntry(req, res) {
  try {
    const { userId, id: docId } = req.params;
    if (!userId || !docId) return badRequest(res, 'Falta userId o id');
    const existing = await ensureOwner(req, userId, docId, 'construction_planning_entry');
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrada no encontrada' });
    const db = getConstructionDbName();
    const now = new Date().toISOString();
    const hist = [...(existing.historial || []), { accion: 'cancelado', usuario: userId, fecha: now, detalle: '' }];
    const doc = buildConstructionPlanningEntryDocument(userId, { estado: 'cancelado', historial: hist }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, entry: sanitizeConstructionPlanningEntry({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al cancelar' });
  }
}

export async function duplicatePlanningEntry(req, res) {
  try {
    const { userId, id: docId } = req.params;
    if (!userId || !docId) return badRequest(res, 'Falta userId o id');
    const existing = await ensureOwner(req, userId, docId, 'construction_planning_entry');
    if (!existing) return res.status(404).json({ ok: false, error: 'Entrada no encontrada' });
    const db = getConstructionDbName();
    const { fechaInicio, fechaFin } = req.body || {};
    const newData = { ...existing, _id: undefined, _rev: undefined, referencia: undefined,
      estado: 'planificado', confirmado: false, confirmadoAt: '', confirmadoPor: '',
      fechaInicio: fechaInicio || existing.fechaInicio, fechaFin: fechaFin || existing.fechaFin,
      historial: [{ accion: 'duplicado', usuario: userId, fecha: new Date().toISOString(), detalle: `Desde ${existing.referencia}` }],
      conflictos: [],
    };
    const doc = buildConstructionPlanningEntryDocument(userId, newData);
    const allEntries = await listConstructionDocsByType(req, userId, 'construction_planning_entry');
    doc.conflictos = detectPlanningConflicts(doc, allEntries);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.status(201).json({ ok: true, entry: sanitizeConstructionPlanningEntry({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al duplicar' });
  }
}

// ─── MILESTONES (Hitos de obra) ───────────────────────────────────────────────

export async function listMilestones(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    let items = await listConstructionDocsByType(req, userId, 'construction_milestone');
    const { projectId, estado, tipo } = req.query;
    if (projectId) items = items.filter(m => m.obraId === projectId);
    if (estado) items = items.filter(m => m.estado === estado);
    if (tipo) items = items.filter(m => m.tipo === tipo);
    const today = new Date().toISOString().slice(0, 10);
    items = items.map(m => {
      if (m.estado === 'pendiente' && m.fecha && m.fecha < today) {
        const diffMs = Date.now() - new Date(m.fecha).getTime();
        m.diasRetraso = Math.max(0, Math.floor(diffMs / 86400000));
      }
      return m;
    });
    return res.json({ ok: true, milestones: items.map(sanitizeConstructionMilestone) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar hitos' });
  }
}

export async function createMilestone(req, res) {
  try {
    const { userId } = req.params;
    const { milestone } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!milestone || typeof milestone !== 'object') return badRequest(res, 'Falta el objeto milestone');
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const doc = buildConstructionMilestoneDocument(userId, milestone);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.status(201).json({ ok: true, milestone: sanitizeConstructionMilestone({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear hito' });
  }
}

export async function updateMilestone(req, res) {
  try {
    const { userId, id: docId } = req.params;
    const { milestone } = req.body || {};
    if (!userId || !docId) return badRequest(res, 'Falta userId o id');
    const existing = await ensureOwner(req, userId, docId, 'construction_milestone');
    if (!existing) return res.status(404).json({ ok: false, error: 'Hito no encontrado' });
    const db = getConstructionDbName();
    const doc = buildConstructionMilestoneDocument(userId, milestone, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, milestone: sanitizeConstructionMilestone({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar hito' });
  }
}

export async function completeMilestoneEndpoint(req, res) {
  try {
    const { userId, id: docId } = req.params;
    if (!userId || !docId) return badRequest(res, 'Falta userId o id');
    const existing = await ensureOwner(req, userId, docId, 'construction_milestone');
    if (!existing) return res.status(404).json({ ok: false, error: 'Hito no encontrado' });
    const db = getConstructionDbName();
    const now = new Date().toISOString();
    const doc = buildConstructionMilestoneDocument(userId, { estado: 'cumplido', fechaReal: now.slice(0, 10), diasRetraso: 0 }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    await emitConstructionEvent(req, userId, 'construction:milestone_completed', { milestoneId: doc._id });
    return res.json({ ok: true, milestone: sanitizeConstructionMilestone({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al completar hito' });
  }
}

export async function removeMilestone(req, res) {
  try {
    const { userId, id: docId } = req.params;
    if (!userId || !docId) return badRequest(res, 'Falta userId o id');
    const existing = await ensureOwner(req, userId, docId, 'construction_milestone');
    if (!existing) return res.status(404).json({ ok: false, error: 'Hito no encontrado' });
    if (existing.estado !== 'pendiente') return res.status(403).json({ ok: false, error: 'Solo se pueden eliminar hitos pendientes' });
    const db = getConstructionDbName();
    await softDeleteDocument(req, db, docId, existing._rev);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar hito' });
  }
}

// ─── MATERIAL NEEDS (Necesidades de material) ─────────────────────────────────

export async function listMaterialNeeds(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    let items = await listConstructionDocsByType(req, userId, 'construction_material_need');
    const { projectId, estado, dateFrom, dateTo } = req.query;
    if (projectId) items = items.filter(n => n.obraId === projectId);
    if (estado) items = items.filter(n => n.estado === estado);
    if (dateFrom) items = items.filter(n => n.fechaNecesaria >= dateFrom);
    if (dateTo) items = items.filter(n => n.fechaNecesaria <= dateTo);
    return res.json({ ok: true, needs: items.map(sanitizeConstructionMaterialNeed) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar necesidades de material' });
  }
}

export async function createMaterialNeed(req, res) {
  try {
    const { userId } = req.params;
    const { need } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!need || typeof need !== 'object') return badRequest(res, 'Falta el objeto need');
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const doc = buildConstructionMaterialNeedDocument(userId, need);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.status(201).json({ ok: true, need: sanitizeConstructionMaterialNeed({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear necesidad de material' });
  }
}

export async function updateMaterialNeed(req, res) {
  try {
    const { userId, id: docId } = req.params;
    const { need } = req.body || {};
    if (!userId || !docId) return badRequest(res, 'Falta userId o id');
    const existing = await ensureOwner(req, userId, docId, 'construction_material_need');
    if (!existing) return res.status(404).json({ ok: false, error: 'Necesidad no encontrada' });
    const db = getConstructionDbName();
    const doc = buildConstructionMaterialNeedDocument(userId, need, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, need: sanitizeConstructionMaterialNeed({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar necesidad' });
  }
}

export async function removeMaterialNeed(req, res) {
  try {
    const { userId, id: docId } = req.params;
    if (!userId || !docId) return badRequest(res, 'Falta userId o id');
    const existing = await ensureOwner(req, userId, docId, 'construction_material_need');
    if (!existing) return res.status(404).json({ ok: false, error: 'Necesidad no encontrada' });
    if (existing.estado !== 'previsto') return res.status(403).json({ ok: false, error: 'Solo se pueden eliminar necesidades en estado previsto' });
    const db = getConstructionDbName();
    await softDeleteDocument(req, db, docId, existing._rev);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar necesidad' });
  }
}

export async function requestMaterialNeed(req, res) {
  try {
    const { userId, id: docId } = req.params;
    if (!userId || !docId) return badRequest(res, 'Falta userId o id');
    const existing = await ensureOwner(req, userId, docId, 'construction_material_need');
    if (!existing) return res.status(404).json({ ok: false, error: 'Necesidad no encontrada' });
    const db = getConstructionDbName();
    const doc = buildConstructionMaterialNeedDocument(userId, {
      estado: 'solicitado', fechaSolicitud: new Date().toISOString().slice(0, 10),
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    return res.json({ ok: true, need: sanitizeConstructionMaterialNeed({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al solicitar material' });
  }
}

// ─── PLANNING OVERVIEW (Datos agregados) ──────────────────────────────────────

export async function getPlanningOverview(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');

    const { projectId, dateFrom, dateTo, tipoRecurso, recursoId } = req.query;

    const [entries, milestones, materialNeeds, projects, workers, guilds] = await Promise.all([
      listConstructionDocsByType(req, userId, 'construction_planning_entry'),
      listConstructionDocsByType(req, userId, 'construction_milestone'),
      listConstructionDocsByType(req, userId, 'construction_material_need'),
      listConstructionDocsByType(req, userId, 'construction_project'),
      listConstructionDocsByType(req, userId, 'construction_worker'),
      listConstructionDocsByType(req, userId, 'construction_guild'),
    ]);

    let filteredEntries = entries;
    let filteredMilestones = milestones;
    let filteredNeeds = materialNeeds;

    if (projectId) {
      filteredEntries = filteredEntries.filter(e => e.obraId === projectId);
      filteredMilestones = filteredMilestones.filter(m => m.obraId === projectId);
      filteredNeeds = filteredNeeds.filter(n => n.obraId === projectId);
    }
    if (tipoRecurso) filteredEntries = filteredEntries.filter(e => e.tipoRecurso === tipoRecurso);
    if (recursoId) filteredEntries = filteredEntries.filter(e => e.recursoId === recursoId);
    if (dateFrom) {
      filteredEntries = filteredEntries.filter(e => e.fechaFin >= dateFrom);
      filteredMilestones = filteredMilestones.filter(m => m.fecha >= dateFrom);
      filteredNeeds = filteredNeeds.filter(n => n.fechaNecesaria >= dateFrom);
    }
    if (dateTo) {
      filteredEntries = filteredEntries.filter(e => e.fechaInicio <= dateTo);
      filteredMilestones = filteredMilestones.filter(m => m.fecha <= dateTo);
      filteredNeeds = filteredNeeds.filter(n => n.fechaNecesaria <= dateTo);
    }

    const today = new Date().toISOString().slice(0, 10);
    const in7days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const activeStatuses = new Set(['planificado', 'confirmado', 'en_curso']);

    const allConflicts = [];
    for (const e of filteredEntries) {
      if (Array.isArray(e.conflictos)) {
        for (const c of e.conflictos) allConflicts.push({ ...c, sourceEntryId: e._id });
      }
    }

    const activeProjects = projects.filter(p => p.estado !== 'finalizada' && !p.archivada);
    const obrasActivas = activeProjects.length;
    const activeWorkers = workers.filter(w => w.activo !== false);

    const alertas = [];
    for (const p of activeProjects) {
      const hasEntry = filteredEntries.some(e => e.obraId === p._id && activeStatuses.has(e.estado));
      if (!hasEntry) {
        alertas.push({ id: `po-${p._id}`, type: 'planning_obra_sin_planificar', severity: 'high',
          label: 'Obra sin planificar', detail: `${p.nombre} no tiene asignaciones activas`,
          entityId: p._id, entityName: p.nombre, entityType: 'project', obraId: p._id, obraNombre: p.nombre });
      }
    }
    for (const w of activeWorkers) {
      const hasEntry = entries.some(e => e.recursoId === w._id && activeStatuses.has(e.estado) && e.fechaFin >= today && e.fechaInicio <= in7days);
      if (!hasEntry) {
        alertas.push({ id: `pw-${w._id}`, type: 'planning_trabajador_no_asignado', severity: 'warning',
          label: 'Trabajador no asignado', detail: `${w.nombre} sin asignaciones esta semana`,
          entityId: w._id, entityName: w.nombre, entityType: 'worker', obraId: '', obraNombre: '' });
      }
    }
    for (const e of filteredEntries) {
      if (Array.isArray(e.conflictos) && e.conflictos.length > 0 && e.estado !== 'cancelado') {
        alertas.push({ id: `pc-${e._id}`, type: 'planning_conflicto_fechas', severity: 'high',
          label: 'Conflicto de fechas', detail: `${e.recursoNombre}: ${e.conflictos.length} conflicto(s)`,
          entityId: e._id, entityName: e.referencia, entityType: 'planning_entry', obraId: e.obraId, obraNombre: e.obraNombre });
      }
    }
    for (const e of filteredEntries) {
      if (e.tipoRecurso === 'subcontrata' && e.requiereConfirmacion && !e.confirmado && e.fechaInicio <= in7days && e.estado !== 'cancelado') {
        alertas.push({ id: `ps-${e._id}`, type: 'planning_subcontrata_pendiente', severity: 'high',
          label: 'Subcontrata pendiente confirmar', detail: `${e.recursoNombre} para ${e.obraNombre} (${e.fechaInicio})`,
          entityId: e._id, entityName: e.recursoNombre, entityType: 'planning_entry', obraId: e.obraId, obraNombre: e.obraNombre });
      }
    }

    const resumen = {
      totalEntradas: filteredEntries.length,
      entradasPlanificadas: filteredEntries.filter(e => e.estado === 'planificado').length,
      entradasConfirmadas: filteredEntries.filter(e => e.estado === 'confirmado').length,
      entradasEnCurso: filteredEntries.filter(e => e.estado === 'en_curso').length,
      entradasCompletadas: filteredEntries.filter(e => e.estado === 'completado').length,
      totalConflictos: allConflicts.length,
      hitosProximos: filteredMilestones.filter(m => m.estado === 'pendiente' && m.fecha >= today && m.fecha <= in7days).length,
      hitosRetrasados: filteredMilestones.filter(m => m.estado === 'pendiente' && m.fecha < today).length,
      materialesPendientes: filteredNeeds.filter(n => n.estado === 'previsto' || n.estado === 'solicitado').length,
      materialesRequierenCompra: filteredNeeds.filter(n => n.requiereCompra).length,
      trabajadoresAsignados: new Set(filteredEntries.filter(e => e.tipoRecurso === 'trabajador' && activeStatuses.has(e.estado)).map(e => e.recursoId)).size,
      maquinariaAsignada: new Set(filteredEntries.filter(e => e.tipoRecurso === 'maquinaria' && activeStatuses.has(e.estado)).map(e => e.recursoId)).size,
      subcontratasPendientesConfirmar: filteredEntries.filter(e => e.tipoRecurso === 'subcontrata' && e.requiereConfirmacion && !e.confirmado && e.estado !== 'cancelado').length,
      obrasActivas,
    };

    return res.json({
      ok: true, resumen,
      entries: filteredEntries.map(sanitizeConstructionPlanningEntry),
      milestones: filteredMilestones.map(sanitizeConstructionMilestone),
      materialNeeds: filteredNeeds.map(sanitizeConstructionMaterialNeed),
      obras: activeProjects.map(sanitizeConstructionProject),
      trabajadores: activeWorkers.map(sanitizeConstructionWorker),
      subcontratas: guilds.map(sanitizeConstructionGuild),
      conflictos: allConflicts,
      alertas,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al obtener overview de planificación' });
  }
}

// ─── PREDEFINED PARTIDAS (Catálogo de partidas) ──────────────────────────────

export async function listPredefinedPartidas(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const items = await listConstructionDocsByType(req, userId, 'construction_predefined_partida');
    let result = items.map(sanitizeConstructionPredefinedPartida);
    const { gremio, activa, search } = req.query || {};
    if (gremio) result = result.filter(p => p.gremio === gremio);
    if (activa === 'true') result = result.filter(p => p.activa);
    if (activa === 'false') result = result.filter(p => !p.activa);
    if (search) {
      const s = String(search).toLowerCase();
      result = result.filter(p =>
        (p.nombre || '').toLowerCase().includes(s) ||
        (p.descripcion || '').toLowerCase().includes(s) ||
        (p.codigo || '').toLowerCase().includes(s)
      );
    }
    result.sort((a, b) => (a.orden || 0) - (b.orden || 0) || (a.nombre || '').localeCompare(b.nombre || ''));
    return res.json({ ok: true, partidas: result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar partidas predefinidas' });
  }
}

export async function getPredefinedPartidasByGremio(req, res) {
  try {
    const { userId, gremio } = req.params;
    if (!userId || !gremio) return badRequest(res, 'Falta userId o gremio');
    const items = await listConstructionDocsByType(req, userId, 'construction_predefined_partida');
    const result = items
      .map(sanitizeConstructionPredefinedPartida)
      .filter(p => p.gremio === gremio && p.activa)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0));
    return res.json({ ok: true, partidas: result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al listar partidas por gremio' });
  }
}

export async function createPredefinedPartida(req, res) {
  try {
    const { userId } = req.params;
    const { partida } = req.body || {};
    if (!userId) return badRequest(res, 'Falta userId');
    if (!partida || typeof partida !== 'object') return badRequest(res, 'Falta el objeto partida');
    if (!isManager(req)) return res.status(403).json({ ok: false, error: 'Solo gerentes pueden crear partidas predefinidas' });
    const account = await findAccountByUserId(req, userId);
    if (!account) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const doc = buildConstructionPredefinedPartidaDocument(userId, partida);
    const saved = await putDocument(req, db, doc._id, doc);
    if (partida.gremio) {
      await updateGuildPartidaCount(req, userId, partida.gremio, 1);
    }
    return res.status(201).json({ ok: true, partida: sanitizeConstructionPredefinedPartida({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear partida predefinida' });
  }
}

export async function updatePredefinedPartida(req, res) {
  try {
    const { userId, id } = req.params;
    const { partida } = req.body || {};
    if (!partida) return badRequest(res, 'Faltan datos');
    if (!isManager(req)) return res.status(403).json({ ok: false, error: 'Solo gerentes pueden modificar partidas' });
    const existing = await ensureOwner(req, userId, id, 'construction_predefined_partida');
    if (!existing) return res.status(404).json({ ok: false, error: 'Partida no encontrada' });
    const db = getConstructionDbName();
    const pricesChanged =
      Number(partida.precioMateriales ?? existing.precioMateriales) !== Number(existing.precioMateriales) ||
      Number(partida.precioManoObra ?? existing.precioManoObra) !== Number(existing.precioManoObra) ||
      Number(partida.precioEstructural ?? existing.precioEstructural) !== Number(existing.precioEstructural);
    let historialPrecios = existing.historialPrecios || [];
    if (pricesChanged) {
      historialPrecios = [...historialPrecios, {
        fecha: new Date().toISOString(),
        precioMateriales: Number(existing.precioMateriales || 0),
        precioManoObra: Number(existing.precioManoObra || 0),
        precioEstructural: Number(existing.precioEstructural || 0),
        precioUnitario: Number(existing.precioUnitario || 0),
        modificadoPor: userId,
        modificadoPorNombre: req.authUser?.fullName || '',
      }];
    }
    const doc = buildConstructionPredefinedPartidaDocument(userId, {
      ...existing, ...partida,
      historialPrecios,
      precioActualizado: pricesChanged ? new Date().toISOString().slice(0, 10) : (partida.precioActualizado || existing.precioActualizado),
    }, existing);
    const saved = await putDocument(req, db, doc._id, doc);
    if (pricesChanged && doc.gremio) {
      await updateGuildPricesDate(req, userId, doc.gremio);
    }
    return res.json({ ok: true, partida: sanitizeConstructionPredefinedPartida({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al actualizar partida' });
  }
}

export async function removePredefinedPartida(req, res) {
  try {
    const { userId, id } = req.params;
    if (!isManager(req)) return res.status(403).json({ ok: false, error: 'Solo gerentes pueden eliminar partidas' });
    const existing = await ensureOwner(req, userId, id, 'construction_predefined_partida');
    if (!existing) return res.status(404).json({ ok: false, error: 'Partida no encontrada' });
    const db = getConstructionDbName();
    await softDeleteDocument(req, db, id);
    if (existing.gremio) {
      await updateGuildPartidaCount(req, userId, existing.gremio, -1);
    }
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al eliminar partida' });
  }
}

export async function bulkImportPartidas(req, res) {
  try {
    const { userId } = req.params;
    const { partidas } = req.body || {};
    if (!isManager(req)) return res.status(403).json({ ok: false, error: 'Solo gerentes pueden importar partidas' });
    if (!Array.isArray(partidas) || partidas.length === 0) return badRequest(res, 'Falta array de partidas');
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const gremioCountDeltas = {};
    const results = [];
    const errors = [];
    for (let i = 0; i < partidas.length; i++) {
      try {
        const p = partidas[i];
        if (!p.nombre) { errors.push(`Fila ${i + 1}: falta nombre`); continue; }
        const doc = buildConstructionPredefinedPartidaDocument(userId, p);
        await putDocument(req, db, doc._id, doc);
        results.push(doc._id);
        if (doc.gremio) gremioCountDeltas[doc.gremio] = (gremioCountDeltas[doc.gremio] || 0) + 1;
      } catch (e) {
        errors.push(`Fila ${i + 1}: ${e.message}`);
      }
    }
    for (const [gremio, delta] of Object.entries(gremioCountDeltas)) {
      await updateGuildPartidaCount(req, userId, gremio, delta);
    }
    return res.json({ ok: true, imported: results.length, errors });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al importar partidas' });
  }
}

async function updateGuildPartidaCount(req, userId, gremioTipo, delta) {
  try {
    const items = await listConstructionDocsByType(req, userId, 'construction_guild');
    const guild = items.find(g => g.tipo === gremioTipo && !g.deletedAt);
    if (!guild) return;
    const db = getConstructionDbName();
    guild.totalPartidas = Math.max(0, (Number(guild.totalPartidas) || 0) + delta);
    guild.updatedAt = new Date().toISOString();
    await putDocument(req, db, guild._id, guild);
  } catch { /* best effort */ }
}

async function updateGuildPricesDate(req, userId, gremioTipo) {
  try {
    const items = await listConstructionDocsByType(req, userId, 'construction_guild');
    const guild = items.find(g => g.tipo === gremioTipo && !g.deletedAt);
    if (!guild) return;
    const db = getConstructionDbName();
    guild.preciosActualizados = new Date().toISOString().slice(0, 10);
    guild.updatedAt = new Date().toISOString();
    await putDocument(req, db, guild._id, guild);
  } catch { /* best effort */ }
}

// ─── BUDGET TEMPLATE EXTRAS (aplicar + crear desde presupuesto) ──────────────

export async function applyBudgetTemplate(req, res) {
  try {
    const { userId, id } = req.params;
    const existing = await ensureOwner(req, userId, id, 'construction_budget_template');
    if (!existing) return res.status(404).json({ ok: false, error: 'Plantilla no encontrada' });
    const db = getConstructionDbName();
    const allPartidas = await listConstructionDocsByType(req, userId, 'construction_predefined_partida');
    const partidas = (existing.partidas || []).map(tp => {
      const catalogo = allPartidas.find(d => d._id === tp.partidaPredefinidaId && !d.deletedAt);
      return {
        ...tp,
        precioMateriales: catalogo?.precioMateriales ?? tp.precioMateriales,
        precioManoObra: catalogo?.precioManoObra ?? tp.precioManoObra,
        precioEstructural: catalogo?.precioEstructural ?? tp.precioEstructural,
        precioUnitario: catalogo ? (Number(catalogo.precioMateriales || 0) + Number(catalogo.precioManoObra || 0) + Number(catalogo.precioEstructural || 0)) : tp.precioUnitario,
      };
    });
    existing.vecesUsada = (existing.vecesUsada || 0) + 1;
    existing.ultimoUso = new Date().toISOString();
    existing.updatedAt = new Date().toISOString();
    await putDocument(req, db, existing._id, existing);
    return res.json({
      ok: true,
      budgetData: {
        partidas: partidas.map(p => ({
          partidaPredefinidaId: p.partidaPredefinidaId || '',
          gremio: p.gremio, nombre: p.nombre, descripcion: p.descripcion,
          unidad: p.unidad, cantidad: p.cantidadDefecto || 1,
          precioUnitarioMateriales: p.precioMateriales,
          precioUnitarioManoObra: p.precioManoObra,
          precioUnitarioEstructural: p.precioEstructural,
        })),
        margen: existing.margenDefecto || 15,
        tipoObra: existing.tipoObra || '',
        templateId: existing._id,
        templateNombre: existing.nombre || '',
      },
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al aplicar plantilla' });
  }
}

export async function createTemplateFromBudget(req, res) {
  try {
    const { userId, budgetId } = req.params;
    const { nombre } = req.body || {};
    if (!isManager(req)) return res.status(403).json({ ok: false, error: 'Solo gerentes pueden crear plantillas' });
    if (!nombre) return badRequest(res, 'Falta nombre para la plantilla');
    const budget = await ensureOwner(req, userId, budgetId, 'construction_budget');
    if (!budget) return res.status(404).json({ ok: false, error: 'Presupuesto no encontrado' });
    const db = getConstructionDbName();
    const templatePartidas = (budget.partidas || []).map((p, i) => ({
      id: `tpl-${i + 1}`,
      partidaPredefinidaId: p.partidaPredefinidaId || '',
      gremio: p.gremio || '',
      nombre: p.nombre || p.descripcion || '',
      descripcion: p.descripcion || '',
      unidad: p.unidad || 'ud',
      cantidadDefecto: p.cantidad || 1,
      precioMateriales: p.precioUnitarioMateriales || p.materiales || 0,
      precioManoObra: p.precioUnitarioManoObra || p.manoObra || 0,
      precioEstructural: p.precioUnitarioEstructural || p.estructural || 0,
    }));
    const doc = buildConstructionBudgetTemplateDocument(userId, {
      nombre,
      tipoObra: budget.tipoObra || '',
      margenDefecto: budget.margen || 15,
      partidas: templatePartidas,
      creadoPor: userId,
      creadoPorNombre: req.authUser?.fullName || '',
    });
    const saved = await putDocument(req, db, doc._id, doc);
    return res.status(201).json({ ok: true, template: sanitizeConstructionBudgetTemplate({ ...doc, _rev: saved.rev }) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al crear plantilla desde presupuesto' });
  }
}

// ─── PARTIDA & PRICE ALERTS ─────────────────────────────────────────────────

export async function getPartidaAlerts(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return badRequest(res, 'Falta userId');
    const db = getConstructionDbName();
    await ensureDatabase(req, db);
    const allDocs = await getAllDocuments(req, db);
    const userDocs = allDocs.filter(d => d.user_id === userId && !d.deletedAt);
    const partidas = userDocs.filter(d => d.type === 'construction_predefined_partida' && d.activa !== false);
    const guilds = userDocs.filter(d => d.type === 'construction_guild');
    const templates = userDocs.filter(d => d.type === 'construction_budget_template' && d.activa !== false);

    const alerts = [];
    const now = new Date();
    const DAYS_THRESHOLD = 180;

    for (const p of partidas) {
      const pu = Number(p.precioMateriales || 0) + Number(p.precioManoObra || 0) + Number(p.precioEstructural || 0);
      if (pu === 0) {
        alerts.push({
          id: `alert-nopr-${p._id}`,
          type: 'partida_sin_precio',
          severity: 'warning',
          label: 'Partida sin precio',
          detail: `${p.codigo || ''} ${p.nombre || ''} (${CONSTRUCTION_GUILD_LABELS[p.gremio] || p.gremio}) tiene precio 0`,
          entityId: p._id, entityName: p.nombre || '', entityType: 'predefined_partida',
          gremio: p.gremio || '',
        });
      }
      if (p.precioActualizado) {
        const updated = new Date(p.precioActualizado);
        const diffDays = (now - updated) / (1000 * 60 * 60 * 24);
        if (diffDays > DAYS_THRESHOLD) {
          alerts.push({
            id: `alert-old-${p._id}`,
            type: 'precio_desactualizado',
            severity: 'warning',
            label: 'Precio desactualizado',
            detail: `${p.codigo || ''} ${p.nombre || ''} no se actualiza desde ${p.precioActualizado}`,
            entityId: p._id, entityName: p.nombre || '', entityType: 'predefined_partida',
            gremio: p.gremio || '',
          });
        }
      }
    }

    const gremiosConPartidas = new Set(partidas.map(p => p.gremio));
    for (const gType of CONSTRUCTION_GUILDS) {
      if (gType === 'personalizado') continue;
      if (!gremiosConPartidas.has(gType)) {
        alerts.push({
          id: `alert-nopt-${gType}`,
          type: 'gremio_sin_partidas',
          severity: 'info',
          label: 'Gremio sin partidas',
          detail: `${CONSTRUCTION_GUILD_LABELS[gType] || gType} no tiene partidas predefinidas`,
          entityId: '', entityName: CONSTRUCTION_GUILD_LABELS[gType] || gType, entityType: 'guild',
          gremio: gType,
        });
      }
    }

    for (const tpl of templates) {
      const badPartidas = (tpl.partidas || []).filter(tp => {
        const pu = Number(tp.precioMateriales || 0) + Number(tp.precioManoObra || 0) + Number(tp.precioEstructural || 0);
        if (pu === 0) return true;
        if (tp.partidaPredefinidaId) {
          const cat = partidas.find(p => p._id === tp.partidaPredefinidaId);
          if (!cat) return true;
        }
        return false;
      });
      if (badPartidas.length > 0) {
        alerts.push({
          id: `alert-tplinc-${tpl._id}`,
          type: 'plantilla_incompleta',
          severity: 'warning',
          label: 'Plantilla incompleta',
          detail: `"${tpl.nombre || ''}" tiene ${badPartidas.length} partida(s) sin precio o con referencia inválida`,
          entityId: tpl._id, entityName: tpl.nombre || '', entityType: 'budget_template',
          gremio: '',
        });
      }
    }

    const summary = {
      sinPrecio: alerts.filter(a => a.type === 'partida_sin_precio').length,
      sinPartidas: alerts.filter(a => a.type === 'gremio_sin_partidas').length,
      desactualizados: alerts.filter(a => a.type === 'precio_desactualizado').length,
      incompletas: alerts.filter(a => a.type === 'plantilla_incompleta').length,
    };

    return res.json({ ok: true, alerts, summary });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Error al calcular alertas de partidas' });
  }
}
