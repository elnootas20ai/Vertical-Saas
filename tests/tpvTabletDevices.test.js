import { describe, expect, it } from 'vitest';
import {
  TPV_INCLUDED_TABLET_SLOTS,
  TPV_MAX_REJECT_COUNT,
  approveDeviceInList,
  countApprovedDevices,
  evaluateTabletDeviceAccess,
  rejectDeviceInList,
  resolveTabletSlotLimit,
  revokeDeviceInList,
  unblockDeviceInList,
} from '../services/tpvTabletDevices.js';

describe('tpvTabletDevices', () => {
  it('deja pendiente el primer dispositivo (sin auto-aprobación)', () => {
    const result = evaluateTabletDeviceAccess({}, { deviceId: 'device-aaaa-1111', label: 'Tablet A' });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('DEVICE_PENDING_APPROVAL');
    expect(result.autoApproved).toBeUndefined();
    expect(result.devices).toHaveLength(1);
    expect(result.devices[0].status).toBe('pending');
    expect(result.devices[0].label).toBe('Tablet A');
  });

  it('deja pendiente un dispositivo nuevo cuando la lista ya existe', () => {
    const pdv = { tpvAllowedDevices: [] };
    const result = evaluateTabletDeviceAccess(pdv, { deviceId: 'device-bbbb-2222', label: 'Móvil' });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('DEVICE_PENDING_APPROVAL');
    expect(result.devices).toHaveLength(1);
    expect(result.devices[0].status).toBe('pending');
  });

  it('bloquea tras 3 rechazos', () => {
    let devices = [{ deviceId: 'd1', label: 'X', status: 'pending', rejectCount: 0, createdAt: 't' }];
    for (let i = 0; i < TPV_MAX_REJECT_COUNT; i += 1) {
      devices = rejectDeviceInList(devices, 'd1').devices;
    }
    expect(devices[0].status).toBe('blocked');
    expect(devices[0].rejectCount).toBe(3);
    const access = evaluateTabletDeviceAccess({ tpvAllowedDevices: devices }, { deviceId: 'd1' });
    expect(access.ok).toBe(false);
    expect(access.code).toBe('DEVICE_BLOCKED');
  });

  it('aprueba y desbloquea', () => {
    const pending = [{ deviceId: 'd1', label: 'X', status: 'pending', rejectCount: 0, createdAt: 't' }];
    const approved = approveDeviceInList(pending, 'd1').devices;
    expect(approved[0].status).toBe('approved');
    const blocked = [{ deviceId: 'd1', label: 'X', status: 'blocked', rejectCount: 3, createdAt: 't' }];
    const unblocked = unblockDeviceInList(blocked, 'd1').devices;
    expect(unblocked[0].status).toBe('pending');
    expect(unblocked[0].rejectCount).toBe(0);
  });

  it('cupo = 2 por PDV + extras', () => {
    expect(TPV_INCLUDED_TABLET_SLOTS).toBe(2);
    expect(resolveTabletSlotLimit({})).toBe(2);
    expect(resolveTabletSlotLimit({ extraTpvTabletSlots: 1 })).toBe(3);
  });

  it('revocar elimina el dispositivo de la lista y libera cupo', () => {
    const devices = [
      { deviceId: 'd1', label: 'A', status: 'approved', rejectCount: 0, createdAt: 't' },
      { deviceId: 'd2', label: 'B', status: 'approved', rejectCount: 0, createdAt: 't' },
    ];
    const result = revokeDeviceInList(devices, 'd1');
    expect(result.found).toBe(true);
    expect(result.devices).toHaveLength(1);
    expect(result.devices[0].deviceId).toBe('d2');
    expect(countApprovedDevices(result.devices)).toBe(1);
  });
});
