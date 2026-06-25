import { describe, expect, it } from 'vitest';
import {
  getTrialActiveBannerContent,
  getTrialExpiringBannerContent,
} from '../src/app/lib/trialBannerMessages';

describe('trial banner messages', () => {
  it('aclara que la tarjeta guardada no implica cobro inmediato', () => {
    const content = getTrialActiveBannerContent({
      daysLeft: 14,
      hasSavedCard: true,
      cardLastFour: '4242',
      hasMoneiSubscription: false,
    });
    expect(content.title).toContain('14 días');
    expect(content.detail).toContain('Sin cargo');
    expect(content.detail).toContain('4242');
    expect(content.ctaLabel).toBe('Ver facturación');
  });

  it('describe el cobro automático con suscripción MONEI en prueba', () => {
    const content = getTrialActiveBannerContent({
      daysLeft: 10,
      hasSavedCard: true,
      hasMoneiSubscription: true,
    });
    expect(content.detail).toContain('primer cobro');
    expect(content.ctaLabel).toBe('Ver facturación');
  });

  it('pide configurar pago si no hay tarjeta', () => {
    const content = getTrialExpiringBannerContent({
      daysLeft: 2,
      hasSavedCard: false,
      hasMoneiSubscription: false,
    });
    expect(content.ctaLabel).toBe('Configurar pago');
  });
});
