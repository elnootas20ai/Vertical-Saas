/**
 * Tracking first-party de la web pública.
 * Solo envía eventos si hay consentimiento de cookies analíticas.
 */
import { getApiBase } from './apiBase';

const VISITOR_KEY = 'vertial_web_vid';
const CONSENT_KEY = 'vertial_cookie_consent';

type AnalyticsEventName =
  | 'pageview'
  | 'cta_register'
  | 'cta_sales'
  | 'cta_login'
  | 'cta_plan'
  | 'cta_worker'
  | 'cta_tablet'
  | 'section_view';

function hasAnalyticsConsent(): boolean {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { preferences?: { analytics?: boolean } };
    return Boolean(parsed?.preferences?.analytics);
  } catch {
    return false;
  }
}

function getVisitorId(): string {
  try {
    let id = sessionStorage.getItem(VISITOR_KEY);
    if (id) return id;
    id = `v_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    sessionStorage.setItem(VISITOR_KEY, id);
    return id;
  } catch {
    return '';
  }
}

export function trackWebEvent(name: AnalyticsEventName, extra?: { path?: string }) {
  if (typeof window === 'undefined') return;
  if (!hasAnalyticsConsent()) return;

  const payload = {
    name,
    path: extra?.path || `${window.location.pathname}${window.location.search || ''}`,
    referrer: document.referrer || '',
    visitorId: getVisitorId(),
  };

  const url = `${getApiBase()}/api/public/web-analytics/event`;
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}

export function trackLandingPageview() {
  trackWebEvent('pageview');
}
