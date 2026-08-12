import { describe, expect, it, vi } from 'vitest';
import {
  buildWorkerInviteLinkDocument,
  isWorkerInviteLinkRedeemable,
  sanitizeWorkerInviteLink,
  hashToken,
  workerInviteTokenPtrId,
} from '../services/couchdb.js';
import { isCouchConflictError, withCouchConflictRetry } from '../services/couchConflictRetry.js';

describe('worker invite links (core QR)', () => {
  it('buildWorkerInviteLinkDocument fija salesPointId = workCenterId', () => {
    const doc = buildWorkerInviteLinkDocument({
      tokenHash: hashToken('abc'),
      businessId: 'biz-1',
      businessName: 'Inmo Demo',
      workCenterId: 'wc-oficina',
      workCenterName: 'Oficina Centro',
      role: 'Comercial',
    });
    expect(doc.type).toBe('worker_invite_link');
    expect(doc.status).toBe('active');
    expect(doc.workCenterId).toBe('wc-oficina');
    expect(doc.employment?.salesPointId).toBe('wc-oficina');
    expect(doc.role).toBe('Comercial');
    expect(sanitizeWorkerInviteLink(doc)).not.toHaveProperty('tokenHash');
  });

  it('isWorkerInviteLinkRedeemable respeta status, caducidad y maxUses', () => {
    const base = buildWorkerInviteLinkDocument({
      tokenHash: 'hash',
      businessId: 'biz-1',
      workCenterId: 'wc-1',
      role: 'Comercial',
      maxUses: 2,
      expiresInDays: 30,
    });
    expect(isWorkerInviteLinkRedeemable(base)).toBe(true);

    expect(isWorkerInviteLinkRedeemable({ ...base, status: 'revoked' })).toBe(false);
    expect(isWorkerInviteLinkRedeemable({
      ...base,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })).toBe(false);
    expect(isWorkerInviteLinkRedeemable({ ...base, useCount: 2 })).toBe(false);
  });

  it('workerInviteTokenPtrId es determinista por hash', () => {
    const h = hashToken('token-xyz');
    expect(workerInviteTokenPtrId(h)).toBe(`worker_invite_token:${h}`);
    expect(workerInviteTokenPtrId('')).toBe('');
  });
});

describe('couchConflictRetry (QR join burst)', () => {
  it('detecta 409 y mensaje conflict', () => {
    expect(isCouchConflictError({ statusCode: 409 })).toBe(true);
    expect(isCouchConflictError(new Error('Document update conflict'))).toBe(true);
    expect(isCouchConflictError(new Error('otro'))).toBe(false);
  });

  it('reintenta hasta éxito ante conflictos', async () => {
    let n = 0;
    const result = await withCouchConflictRetry(async () => {
      n += 1;
      if (n < 3) {
        const err = new Error('conflict');
        err.statusCode = 409;
        throw err;
      }
      return 'ok';
    }, { maxAttempts: 5, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(n).toBe(3);
  });

  it('no reintenta errores que no son conflicto', async () => {
    const fn = vi.fn(async () => {
      throw new Error('seat limit');
    });
    await expect(withCouchConflictRetry(fn, { maxAttempts: 4, baseDelayMs: 1 })).rejects.toThrow('seat limit');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
