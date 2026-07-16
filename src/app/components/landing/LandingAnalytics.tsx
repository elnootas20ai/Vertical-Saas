import { useEffect } from 'react';
import { useCookieConsent } from '../CookieConsentBanner';
import { trackLandingPageview, trackWebEvent } from '../../lib/webAnalytics';

/**
 * Activa pageviews de la landing cuando hay consentimiento analítico.
 */
export function LandingAnalytics() {
  const consent = useCookieConsent();

  useEffect(() => {
    if (!consent?.analytics) return;
    trackLandingPageview();
  }, [consent?.analytics]);

  return null;
}

export function trackLandingCta(
  name: 'cta_register' | 'cta_sales' | 'cta_login' | 'cta_plan' | 'cta_worker' | 'cta_tablet',
) {
  trackWebEvent(name);
}
