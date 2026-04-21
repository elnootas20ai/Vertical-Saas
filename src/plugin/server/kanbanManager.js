import { v4 as uuidv4 } from 'uuid';

const COUCH_URL = process.env.VITE_COUCHDB_URL || 'http://localhost:5984';
const COUCH_USER = process.env.VITE_COUCHDB_USER || '';
const COUCH_PASS = process.env.VITE_COUCHDB_PASSWORD || '';
const DB_NAME = 'plugin_kanban';

const authHeader = 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64');

async function couch(path, opts = {}) {
  const res = await fetch(`${COUCH_URL}/${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
      ...opts.headers,
    },
  });
  return res.json();
}

async function ensureDb() {
  const res = await fetch(`${COUCH_URL}/${DB_NAME}`, {
    method: 'HEAD',
    headers: { Authorization: authHeader },
  });
  if (res.status === 404) {
    await couch(DB_NAME, { method: 'PUT' });
    await couch(`${DB_NAME}/_index`, {
      method: 'POST',
      body: JSON.stringify({
        index: { fields: ['docType', 'status', 'order'] },
        name: 'idx-type-status-order',
      }),
    });
    await couch(`${DB_NAME}/_index`, {
      method: 'POST',
      body: JSON.stringify({
        index: { fields: ['docType', 'createdAt'] },
        name: 'idx-type-created',
      }),
    });
  }
}

ensureDb().catch((err) => console.error('[kanban] DB init error:', err.message));

// ── Tickets ──

async function getAllTickets() {
  const result = await couch(`${DB_NAME}/_find`, {
    method: 'POST',
    body: JSON.stringify({
      selector: { docType: 'ticket' },
      sort: [{ docType: 'asc' }, { status: 'asc' }, { order: 'asc' }],
      limit: 5000,
    }),
  });
  return (result.docs || []).map(stripCouchFields);
}

async function getTicket(id) {
  const doc = await couch(`${DB_NAME}/${id}`);
  if (doc.error) return null;
  return stripCouchFields(doc);
}

async function createTicket(data) {
  const now = new Date().toISOString();
  const id = `ticket_${uuidv4()}`;
  const allTickets = await getAllTickets();
  const maxOrder = allTickets.reduce((m, t) => Math.max(m, t.order || 0), 0);
  const maxTicketNumber = allTickets.reduce((m, t) => Math.max(m, t.ticketNumber || 0), 0);

  const ticket = {
    _id: id,
    docType: 'ticket',
    ticketNumber: maxTicketNumber + 1,
    title: data.title || 'Untitled',
    description: data.description || '',
    status: data.status || 'backlog',
    priority: data.priority || 'medium',
    assignee: data.assignee || null,
    assigneeAvatar: data.assigneeAvatar || null,
    group: data.group || '',
    subgroup: data.subgroup || '',
    tags: data.tags || [],
    attachments: data.attachments || [],
    comments: [],
    timelog: [],
    history: [],
    aiPrompt: data.aiPrompt || null,
    aiPrePrompt: data.aiPrePrompt || null,
    aiStudy: data.aiStudy || null,
    order: data.order ?? maxOrder + 1,
    createdAt: now,
    updatedAt: now,
  };

  await couch(`${DB_NAME}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(ticket),
  });

  return stripCouchFields(ticket);
}

async function updateTicket(id, changes, changedBy = 'system') {
  const doc = await couch(`${DB_NAME}/${id}`);
  if (doc.error) throw new Error('Ticket not found');

  const now = new Date().toISOString();
  const historyEntries = [];

  for (const [key, val] of Object.entries(changes)) {
    if (['comments', 'timelog', 'history', 'attachments'].includes(key)) continue;
    const oldVal = doc[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(val)) {
      historyEntries.push({
        id: uuidv4(),
        field: key,
        oldValue: String(oldVal ?? ''),
        newValue: String(val ?? ''),
        changedBy,
        createdAt: now,
      });
    }
  }

  const updated = {
    ...doc,
    ...changes,
    history: [...(doc.history || []), ...historyEntries],
    updatedAt: now,
  };

  await couch(`${DB_NAME}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updated),
  });

  return stripCouchFields(updated);
}

async function deleteTicket(id) {
  const doc = await couch(`${DB_NAME}/${id}`);
  if (doc.error) throw new Error('Ticket not found');
  await couch(`${DB_NAME}/${id}?rev=${doc._rev}`, { method: 'DELETE' });
  return { ok: true };
}

async function moveTicket(id, status, order) {
  const doc = await couch(`${DB_NAME}/${id}`);
  if (doc.error) throw new Error('Ticket not found');

  const now = new Date().toISOString();
  const history = doc.history || [];
  if (doc.status !== status) {
    history.push({
      id: uuidv4(),
      field: 'status',
      oldValue: doc.status,
      newValue: status,
      changedBy: 'drag',
      createdAt: now,
    });
  }

  const updated = { ...doc, status, order, history, updatedAt: now };
  await couch(`${DB_NAME}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updated),
  });
  return stripCouchFields(updated);
}

async function reorderTickets(ticketOrders) {
  const docs = [];
  for (const { id, order, status } of ticketOrders) {
    const doc = await couch(`${DB_NAME}/${id}`);
    if (!doc.error) {
      docs.push({ ...doc, order, ...(status ? { status } : {}), updatedAt: new Date().toISOString() });
    }
  }
  if (docs.length) {
    await couch(`${DB_NAME}/_bulk_docs`, {
      method: 'POST',
      body: JSON.stringify({ docs }),
    });
  }
  return { ok: true };
}

// ── Comments ──

async function addComment(ticketId, comment) {
  const doc = await couch(`${DB_NAME}/${ticketId}`);
  if (doc.error) throw new Error('Ticket not found');

  const entry = {
    id: uuidv4(),
    author: comment.author || 'Anonymous',
    content: comment.content || '',
    attachments: comment.attachments || [],
    createdAt: new Date().toISOString(),
  };

  doc.comments = [...(doc.comments || []), entry];
  doc.updatedAt = new Date().toISOString();

  await couch(`${DB_NAME}/${ticketId}`, {
    method: 'PUT',
    body: JSON.stringify(doc),
  });

  return entry;
}

async function deleteComment(ticketId, commentId) {
  const doc = await couch(`${DB_NAME}/${ticketId}`);
  if (doc.error) throw new Error('Ticket not found');

  doc.comments = (doc.comments || []).filter((c) => c.id !== commentId);
  doc.updatedAt = new Date().toISOString();

  await couch(`${DB_NAME}/${ticketId}`, {
    method: 'PUT',
    body: JSON.stringify(doc),
  });
  return { ok: true };
}

// ── Time Log ──

async function addTimeEntry(ticketId, entry) {
  const doc = await couch(`${DB_NAME}/${ticketId}`);
  if (doc.error) throw new Error('Ticket not found');

  const timeEntry = {
    id: uuidv4(),
    userId: entry.userId || 'unknown',
    userName: entry.userName || 'Unknown',
    hours: entry.hours || 0,
    description: entry.description || '',
    date: entry.date || new Date().toISOString().split('T')[0],
    createdAt: new Date().toISOString(),
  };

  doc.timelog = [...(doc.timelog || []), timeEntry];
  doc.updatedAt = new Date().toISOString();

  await couch(`${DB_NAME}/${ticketId}`, {
    method: 'PUT',
    body: JSON.stringify(doc),
  });

  return timeEntry;
}

async function updateTimeEntry(ticketId, entryId, changes) {
  const doc = await couch(`${DB_NAME}/${ticketId}`);
  if (doc.error) throw new Error('Ticket not found');

  doc.timelog = (doc.timelog || []).map((t) => {
    if (t.id !== entryId) return t;
    return { ...t, ...changes, id: entryId };
  });
  doc.updatedAt = new Date().toISOString();

  await couch(`${DB_NAME}/${ticketId}`, {
    method: 'PUT',
    body: JSON.stringify(doc),
  });
  return doc.timelog.find((t) => t.id === entryId);
}

async function deleteTimeEntry(ticketId, entryId) {
  const doc = await couch(`${DB_NAME}/${ticketId}`);
  if (doc.error) throw new Error('Ticket not found');

  doc.timelog = (doc.timelog || []).filter((t) => t.id !== entryId);
  doc.updatedAt = new Date().toISOString();

  await couch(`${DB_NAME}/${ticketId}`, {
    method: 'PUT',
    body: JSON.stringify(doc),
  });
  return { ok: true };
}

// ── Team Members ──

async function getAllMembers() {
  const result = await couch(`${DB_NAME}/_find`, {
    method: 'POST',
    body: JSON.stringify({
      selector: { docType: 'member' },
      limit: 500,
    }),
  });
  return (result.docs || []).map(stripCouchFields);
}

async function createMember(data) {
  const id = `member_${uuidv4()}`;
  const member = {
    _id: id,
    docType: 'member',
    name: data.name,
    avatar: data.avatar || null,
    role: data.role || '',
    email: data.email || '',
    createdAt: new Date().toISOString(),
  };
  await couch(`${DB_NAME}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(member),
  });
  return stripCouchFields(member);
}

async function updateMember(id, changes) {
  const doc = await couch(`${DB_NAME}/${id}`);
  if (doc.error) throw new Error('Member not found');
  const updated = { ...doc, ...changes };
  await couch(`${DB_NAME}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updated),
  });
  return stripCouchFields(updated);
}

async function deleteMember(id) {
  const doc = await couch(`${DB_NAME}/${id}`);
  if (doc.error) throw new Error('Member not found');
  await couch(`${DB_NAME}/${id}?rev=${doc._rev}`, { method: 'DELETE' });
  return { ok: true };
}

// ── Attachments (store base64 or URLs) ──

async function addAttachment(ticketId, attachment) {
  const doc = await couch(`${DB_NAME}/${ticketId}`);
  if (doc.error) throw new Error('Ticket not found');

  const entry = {
    id: uuidv4(),
    name: attachment.name || 'file',
    url: attachment.url || '',
    type: attachment.type || 'image/png',
    size: attachment.size || 0,
    createdAt: new Date().toISOString(),
  };

  doc.attachments = [...(doc.attachments || []), entry];
  doc.updatedAt = new Date().toISOString();

  await couch(`${DB_NAME}/${ticketId}`, {
    method: 'PUT',
    body: JSON.stringify(doc),
  });
  return entry;
}

async function deleteAttachment(ticketId, attachmentId) {
  const doc = await couch(`${DB_NAME}/${ticketId}`);
  if (doc.error) throw new Error('Ticket not found');

  doc.attachments = (doc.attachments || []).filter((a) => a.id !== attachmentId);
  doc.updatedAt = new Date().toISOString();

  await couch(`${DB_NAME}/${ticketId}`, {
    method: 'PUT',
    body: JSON.stringify(doc),
  });
  return { ok: true };
}

// ── Stats ──

async function getTeamStats() {
  const [tickets, members] = await Promise.all([getAllTickets(), getAllMembers()]);
  const totalHours = {};
  const ticketsByAssignee = {};
  const ticketsByStatus = { backlog: 0, todo: 0, in_progress: 0, review: 0, done: 0 };

  for (const t of tickets) {
    ticketsByStatus[t.status] = (ticketsByStatus[t.status] || 0) + 1;
    if (t.assignee) {
      ticketsByAssignee[t.assignee] = (ticketsByAssignee[t.assignee] || 0) + 1;
    }
    for (const entry of t.timelog || []) {
      totalHours[entry.userId] = (totalHours[entry.userId] || 0) + (entry.hours || 0);
    }
  }

  return { tickets: tickets.length, members: members.length, ticketsByStatus, ticketsByAssignee, totalHours };
}

// ── Saved Views ──

async function getAllViews() {
  const result = await couch(`${DB_NAME}/_find`, {
    method: 'POST',
    body: JSON.stringify({
      selector: { docType: 'savedView' },
      sort: [{ docType: 'asc' }, { createdAt: 'asc' }],
      limit: 200,
    }),
  });
  return (result.docs || []).map(stripCouchFields);
}

async function createView(data) {
  const now = new Date().toISOString();
  const id = `view_${uuidv4()}`;
  const doc = {
    _id: id,
    docType: 'savedView',
    name: data.name || 'Untitled View',
    filter: data.filter || {},
    sortBy: data.sortBy || 'order',
    groupBy: data.groupBy || 'none',
    boardMode: data.boardMode || 'horizontal',
    createdAt: now,
    updatedAt: now,
  };
  await couch(`${DB_NAME}/${id}`, { method: 'PUT', body: JSON.stringify(doc) });
  return stripCouchFields(doc);
}

async function updateView(id, changes) {
  const doc = await couch(`${DB_NAME}/${id}`);
  if (doc.error) throw new Error('View not found');
  Object.assign(doc, changes);
  doc.updatedAt = new Date().toISOString();
  await couch(`${DB_NAME}/${id}`, { method: 'PUT', body: JSON.stringify(doc) });
  return stripCouchFields(doc);
}

async function deleteView(id) {
  const doc = await couch(`${DB_NAME}/${id}`);
  if (doc.error) throw new Error('View not found');
  await couch(`${DB_NAME}/${id}?rev=${doc._rev}`, { method: 'DELETE' });
  return { ok: true };
}

// ── AI Search Sessions ──

async function getActiveAiSearchSession() {
  const result = await couch(`${DB_NAME}/_find`, {
    method: 'POST',
    body: JSON.stringify({
      selector: { docType: 'aiSearchSession', status: 'running' },
      limit: 1,
    }),
  });
  const doc = (result.docs || [])[0];
  return doc ? stripCouchFields(doc) : null;
}

async function getAiSearchSession(id) {
  const doc = await couch(`${DB_NAME}/${id}`);
  if (doc.error) return null;
  return stripCouchFields(doc);
}

async function createAiSearchSession(data) {
  const now = new Date().toISOString();
  const id = `aisearch_${uuidv4()}`;
  const session = {
    _id: id,
    docType: 'aiSearchSession',
    status: 'running',
    durationMinutes: data.durationMinutes || 5,
    category: data.category || 'both',
    startedAt: now,
    generatedCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  await couch(`${DB_NAME}/${id}`, { method: 'PUT', body: JSON.stringify(session) });
  return stripCouchFields(session);
}

async function updateAiSearchSession(id, changes) {
  const doc = await couch(`${DB_NAME}/${id}`);
  if (doc.error) throw new Error('Session not found');
  const updated = { ...doc, ...changes, updatedAt: new Date().toISOString() };
  await couch(`${DB_NAME}/${id}`, { method: 'PUT', body: JSON.stringify(updated) });
  return stripCouchFields(updated);
}

async function getAiSearchTickets(sessionId) {
  const result = await couch(`${DB_NAME}/_find`, {
    method: 'POST',
    body: JSON.stringify({
      selector: { docType: 'aiSearchTicket', sessionId },
      sort: [{ docType: 'asc' }, { createdAt: 'asc' }],
      limit: 500,
    }),
  });
  return (result.docs || []).map(stripCouchFields);
}

async function createAiSearchTicket(sessionId, data) {
  const now = new Date().toISOString();
  const id = `aisearchticket_${uuidv4()}`;
  const ticket = {
    _id: id,
    docType: 'aiSearchTicket',
    sessionId,
    title: data.title || '',
    description: data.description || '',
    priority: data.priority || 'medium',
    tags: data.tags || [],
    group: data.group || '',
    subgroup: data.subgroup || '',
    category: data.category || 'both',
    reviewStatus: 'pending',
    createdAt: now,
  };
  await couch(`${DB_NAME}/${id}`, { method: 'PUT', body: JSON.stringify(ticket) });
  return stripCouchFields(ticket);
}

async function updateAiSearchTicket(id, changes) {
  const doc = await couch(`${DB_NAME}/${id}`);
  if (doc.error) throw new Error('AI search ticket not found');
  const updated = { ...doc, ...changes };
  await couch(`${DB_NAME}/${id}`, { method: 'PUT', body: JSON.stringify(updated) });
  return stripCouchFields(updated);
}

async function deleteAiSearchTicket(id) {
  const doc = await couch(`${DB_NAME}/${id}`);
  if (doc.error) throw new Error('AI search ticket not found');
  await couch(`${DB_NAME}/${id}?rev=${doc._rev}`, { method: 'DELETE' });
  return { ok: true };
}

function stripCouchFields(doc) {
  if (!doc) return doc;
  const { _id, _rev, docType, ...rest } = doc;
  return { id: _id, ...rest };
}

export {
  getAllTickets,
  getTicket,
  createTicket,
  updateTicket,
  deleteTicket,
  moveTicket,
  reorderTickets,
  addComment,
  deleteComment,
  addTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  getAllMembers,
  createMember,
  updateMember,
  deleteMember,
  addAttachment,
  deleteAttachment,
  getTeamStats,
  getAllViews,
  createView,
  updateView,
  deleteView,
  getActiveAiSearchSession,
  getAiSearchSession,
  createAiSearchSession,
  updateAiSearchSession,
  getAiSearchTickets,
  createAiSearchTicket,
  updateAiSearchTicket,
  deleteAiSearchTicket,
};
