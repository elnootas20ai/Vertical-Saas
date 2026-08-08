import { describe, expect, it } from 'vitest';
import {
  buildWorkerInviteLinkDocument,
  isWorkerInviteLinkRedeemable,
  sanitizeWorkerInviteLink,
  hashToken,
} from '../services/couchdb.js';

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
});
