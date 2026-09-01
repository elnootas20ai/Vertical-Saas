import { describe, expect, it } from 'vitest';
import {
  AFFILIATE_COMMISSION_MONTHS_PER_CLIENT,
  addMonthsIso,
  countCommissionMonthsForContact,
  evaluateAffiliateCommissionEligibility,
  resolveCommissionEndsAt,
} from '../src/app/lib/affiliateCommissionWindow';

describe('affiliateCommissionWindow', () => {
  it('addMonthsIso suma 24 meses desde el primer cobro', () => {
    const end = addMonthsIso('2026-01-15T10:00:00.000Z', AFFILIATE_COMMISSION_MONTHS_PER_CLIENT);
    expect(end).toBe('2028-01-15T10:00:00.000Z');
  });

  it('resolveCommissionEndsAt usa commissionEndsAt explícito o calcula desde payingStartedAt', () => {
    expect(resolveCommissionEndsAt({ payingStartedAt: '2026-01-01T00:00:00.000Z' })).toBe(
      '2028-01-01T00:00:00.000Z',
    );
    expect(
      resolveCommissionEndsAt({
        payingStartedAt: '2026-01-01T00:00:00.000Z',
        commissionEndsAt: '2027-06-01T00:00:00.000Z',
      }),
    ).toBe('2027-06-01T00:00:00.000Z');
  });

  it('bloquea sin contacto o sin primer cobro', () => {
    expect(evaluateAffiliateCommissionEligibility({ contact: null }).ok).toBe(false);
    expect(
      evaluateAffiliateCommissionEligibility({
        contact: { _id: 'cnt-1', contactName: 'A' },
      }).ok,
    ).toBe(false);
  });

  it('bloquea si pasaron 24 meses o ya hay 24 comisiones', () => {
    const contact = {
      _id: 'cnt-1',
      payingStartedAt: '2024-01-01T00:00:00.000Z',
    };
    expect(
      evaluateAffiliateCommissionEligibility({
        contact,
        now: '2026-01-01T00:00:00.000Z',
      }).ok,
    ).toBe(false);

    const active = {
      _id: 'cnt-2',
      payingStartedAt: '2026-01-01T00:00:00.000Z',
    };
    const commissions = Array.from({ length: 24 }, (_, i) => ({
      type: 'affiliate_commission',
      contactId: 'cnt-2',
      status: i % 2 === 0 ? 'paid' : 'pending',
    }));
    expect(
      evaluateAffiliateCommissionEligibility({
        contact: active,
        commissions,
        now: '2026-06-01T00:00:00.000Z',
      }).ok,
    ).toBe(false);
    expect(countCommissionMonthsForContact(commissions, 'cnt-2')).toBe(24);
  });

  it('permite comisión dentro de la ventana', () => {
    const result = evaluateAffiliateCommissionEligibility({
      contact: { _id: 'cnt-3', payingStartedAt: '2026-01-01T00:00:00.000Z' },
      commissions: [
        { type: 'affiliate_commission', contactId: 'cnt-3', status: 'paid' },
        { type: 'affiliate_commission', contactId: 'cnt-3', status: 'cancelled' },
      ],
      now: '2026-06-01T00:00:00.000Z',
    });
    expect(result.ok).toBe(true);
    expect(result.monthsUsed).toBe(1);
  });
});
