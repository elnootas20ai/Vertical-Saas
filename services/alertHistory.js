/** Helpers de auditoría para alertas del Centro de Alertas. */

const MAX_HISTORY = 50;

export function appendAlertHistory(doc, entry) {
  const history = Array.isArray(doc?.statusHistory) ? [...doc.statusHistory] : [];
  history.push({
    action: entry.action,
    at: entry.at || new Date().toISOString(),
    by: entry.by ?? null,
    ...(entry.from !== undefined ? { from: entry.from } : {}),
    ...(entry.to !== undefined ? { to: entry.to } : {}),
    ...(entry.meta && typeof entry.meta === 'object' ? { meta: entry.meta } : {}),
  });
  return history.slice(-MAX_HISTORY);
}

export function createInitialAlertHistory({ status, at, by = null }) {
  return [{ action: 'created', status, at, by }];
}

export function mutateAlertStatus(doc, { status, userId, now = new Date().toISOString() }) {
  const prevStatus = doc.status || (doc.read ? 'seen' : 'new');
  const updated = {
    ...doc,
    status,
    read: status !== 'new',
    updatedAt: now,
  };

  if (status === 'resolved') {
    updated.resolvedAt = now;
    updated.resolvedBy = userId || null;
  } else {
    updated.resolvedAt = null;
    updated.resolvedBy = null;
  }

  if (status === 'seen' && !doc.seenAt) {
    updated.seenAt = now;
    updated.seenBy = userId || null;
  }

  if (prevStatus !== status) {
    updated.statusHistory = appendAlertHistory(doc, {
      action: 'status_change',
      from: prevStatus,
      to: status,
      by: userId || null,
      at: now,
    });
  }

  return updated;
}

export function mutateAlertAssignment(doc, { userIds, roles, userId, now = new Date().toISOString() }) {
  const assignedTo = {
    userIds: Array.isArray(userIds) ? userIds.map(String).slice(0, 50) : (doc.assignedTo?.userIds || []),
    roles: Array.isArray(roles) ? roles.map(String).slice(0, 20) : (doc.assignedTo?.roles || []),
  };

  return {
    ...doc,
    assignedTo,
    updatedAt: now,
    statusHistory: appendAlertHistory(doc, {
      action: 'assigned',
      by: userId || null,
      at: now,
      meta: { userIds: assignedTo.userIds, roles: assignedTo.roles },
    }),
  };
}

export function mutateAlertDeletion(doc, { userId, now = new Date().toISOString() }) {
  return {
    ...doc,
    deletedAt: now,
    deletedBy: userId || null,
    updatedAt: now,
    statusHistory: appendAlertHistory(doc, {
      action: 'deleted',
      by: userId || null,
      at: now,
    }),
  };
}

/** Reconstruye línea temporal mínima para alertas legacy sin statusHistory. */
export function deriveAlertTimeline(doc) {
  if (Array.isArray(doc?.statusHistory) && doc.statusHistory.length > 0) {
    return doc.statusHistory;
  }

  const events = [];
  const status = doc.status || (doc.read ? 'seen' : 'new');

  if (doc.createdAt) {
    events.push({ action: 'created', status: 'new', at: doc.createdAt, by: doc.user_id || null });
  }
  if (doc.seenAt) {
    events.push({ action: 'status_change', from: 'new', to: 'seen', at: doc.seenAt, by: doc.seenBy || null });
  } else if (status === 'seen' && doc.updatedAt && doc.updatedAt !== doc.createdAt) {
    events.push({ action: 'status_change', from: 'new', to: 'seen', at: doc.updatedAt, by: null });
  }
  if (doc.resolvedAt) {
    events.push({
      action: 'status_change',
      from: status === 'resolved' ? 'seen' : status,
      to: 'resolved',
      at: doc.resolvedAt,
      by: doc.resolvedBy || null,
    });
  }
  if (doc.deletedAt) {
    events.push({ action: 'deleted', at: doc.deletedAt, by: doc.deletedBy || null });
  }

  return events.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export function alertHistorySortKey(doc) {
  return doc.resolvedAt || doc.deletedAt || doc.updatedAt || doc.createdAt || '';
}
