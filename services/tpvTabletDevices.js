/**
 * Dispositivos TPV vinculados al código de tienda (PDV).
 * 2 tablets incluidas **por PDV**; extras vía subscription.extraTpvTabletSlots (suman al cupo de cada tienda).
 * Ningún dispositivo se aprueba solo: solo el CEO desde Ajustes.
 */

export const TPV_INCLUDED_TABLET_SLOTS = 2;
export const TPV_MAX_REJECT_COUNT = 3;

const STATUSES = new Set(['pending', 'approved', 'rejected', 'revoked', 'blocked']);

export function normalizeDeviceId(value) {
  return String(value || '').trim().slice(0, 80);
}

export function normalizeTpvAllowedDevices(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => {
      const deviceId = normalizeDeviceId(d?.deviceId);
      if (!deviceId) return null;
      const status = STATUSES.has(String(d?.status || '')) ? String(d.status) : 'pending';
      const rejectCount = Math.max(0, Math.min(99, Math.floor(Number(d?.rejectCount) || 0)));
      return {
        deviceId,
        label: String(d?.label || '').trim().slice(0, 120) || 'Dispositivo',
        status,
        rejectCount,
        createdAt: String(d?.createdAt || new Date().toISOString()),
        approvedAt: d?.approvedAt ? String(d.approvedAt) : undefined,
        lastSeenAt: d?.lastSeenAt ? String(d.lastSeenAt) : undefined,
        lastRequestAt: d?.lastRequestAt ? String(d.lastRequestAt) : undefined,
      };
    })
    .filter(Boolean);
}

export function countApprovedDevices(devices) {
  return normalizeTpvAllowedDevices(devices).filter((d) => d.status === 'approved').length;
}

export function resolveTabletSlotLimit(subscription) {
  const extra = Math.max(0, Math.floor(Number(subscription?.extraTpvTabletSlots) || 0));
  return TPV_INCLUDED_TABLET_SLOTS + Math.min(99, extra);
}

/**
 * Solo el CEO puede aprobar (endpoint aparte). Aquí nunca se auto-aprueba.
 * @returns {{ ok: true, devices: object[] } | { ok: false, code: string, error: string, devices: object[] }}
 */
export function evaluateTabletDeviceAccess(pdv, { deviceId, label } = {}) {
  const id = normalizeDeviceId(deviceId);
  if (!id) {
    return {
      ok: false,
      code: 'DEVICE_ID_REQUIRED',
      error: 'Falta el identificador del dispositivo',
      devices: normalizeTpvAllowedDevices(pdv?.tpvAllowedDevices),
    };
  }

  const now = new Date().toISOString();
  let devices = normalizeTpvAllowedDevices(pdv?.tpvAllowedDevices);
  const existing = devices.find((d) => d.deviceId === id);

  if (existing) {
    if (existing.status === 'approved') {
      const next = devices.map((d) =>
        d.deviceId === id
          ? { ...d, lastSeenAt: now, lastRequestAt: now, label: label || d.label }
          : d,
      );
      return { ok: true, devices: next };
    }
    if (existing.status === 'blocked') {
      return {
        ok: false,
        code: 'DEVICE_BLOCKED',
        error: 'Demasiados intentos. Contacta con el administrador.',
        devices,
      };
    }
    if (existing.status === 'revoked') {
      return {
        ok: false,
        code: 'DEVICE_NOT_ALLOWED',
        error: 'Este dispositivo fue revocado. Pide al administrador que lo reactive.',
        devices,
      };
    }
    if (existing.status === 'rejected') {
      const next = devices.map((d) =>
        d.deviceId === id
          ? { ...d, status: 'pending', lastRequestAt: now, label: label || d.label }
          : d,
      );
      return {
        ok: false,
        code: 'DEVICE_PENDING_APPROVAL',
        error: 'Esperando aprobación del administrador',
        devices: next,
      };
    }
    // pending
    const next = devices.map((d) =>
      d.deviceId === id
        ? { ...d, lastRequestAt: now, label: label || d.label }
        : d,
    );
    return {
      ok: false,
      code: 'DEVICE_PENDING_APPROVAL',
      error: 'Esperando aprobación del administrador',
      devices: next,
    };
  }

  // Nuevo dispositivo: siempre pendiente. Solo el CEO aprueba.
  const pending = {
    deviceId: id,
    label: label || 'Dispositivo',
    status: 'pending',
    rejectCount: 0,
    createdAt: now,
    lastRequestAt: now,
  };
  return {
    ok: false,
    code: 'DEVICE_PENDING_APPROVAL',
    error: 'Esperando aprobación del administrador',
    devices: [...devices, pending],
  };
}

export function approveDeviceInList(devices, deviceId) {
  const id = normalizeDeviceId(deviceId);
  const now = new Date().toISOString();
  let found = false;
  const next = normalizeTpvAllowedDevices(devices).map((d) => {
    if (d.deviceId !== id) return d;
    found = true;
    return { ...d, status: 'approved', approvedAt: now, lastSeenAt: now };
  });
  return { found, devices: next };
}

export function rejectDeviceInList(devices, deviceId) {
  const id = normalizeDeviceId(deviceId);
  let found = false;
  const next = normalizeTpvAllowedDevices(devices).map((d) => {
    if (d.deviceId !== id) return d;
    found = true;
    const rejectCount = Math.min(TPV_MAX_REJECT_COUNT, (d.rejectCount || 0) + 1);
    const status = rejectCount >= TPV_MAX_REJECT_COUNT ? 'blocked' : 'rejected';
    return { ...d, status, rejectCount };
  });
  return { found, devices: next };
}

export function revokeDeviceInList(devices, deviceId) {
  const id = normalizeDeviceId(deviceId);
  const list = normalizeTpvAllowedDevices(devices);
  const found = list.some((d) => d.deviceId === id);
  // Quitar del cupo: se elimina de la lista (no dejar "revocado" ocupando UI).
  const next = list.filter((d) => d.deviceId !== id);
  return { found, devices: next };
}

export function unblockDeviceInList(devices, deviceId) {
  const id = normalizeDeviceId(deviceId);
  let found = false;
  const next = normalizeTpvAllowedDevices(devices).map((d) => {
    if (d.deviceId !== id) return d;
    found = true;
    return { ...d, status: 'pending', rejectCount: 0, lastRequestAt: new Date().toISOString() };
  });
  return { found, devices: next };
}
