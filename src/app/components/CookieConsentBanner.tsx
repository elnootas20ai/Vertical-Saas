import { useState, useEffect } from 'react';
import { X, Cookie, ChevronDown, ChevronUp, Shield, BarChart2, Target, Settings2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CookiePreferences {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
}

const STORAGE_KEY = 'vertial_cookie_consent';
const VERSION = 'v1';

interface StoredConsent {
  version: string;
  timestamp: string;
  preferences: CookiePreferences;
}

function loadStoredConsent(): StoredConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed.version !== VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveConsent(preferences: CookiePreferences) {
  const stored: StoredConsent = {
    version: VERSION,
    timestamp: new Date().toISOString(),
    preferences,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  window.dispatchEvent(new CustomEvent('cookieConsentUpdated', { detail: preferences }));
}

// ─── Category definitions ─────────────────────────────────────────────────────

const CATEGORIES = [
  {
    id: 'necessary' as const,
    icon: Shield,
    label: 'Cookies necesarias',
    description:
      'Imprescindibles para el funcionamiento del sitio web. Permiten la navegación y el uso de funciones básicas como el inicio de sesión y la seguridad. No pueden desactivarse.',
    required: true,
    examples: 'Sesión de usuario, CSRF, preferencias de idioma',
    legalBasis: 'Art. 6.1.b RGPD — Ejecución de un contrato',
  },
  {
    id: 'analytics' as const,
    icon: BarChart2,
    label: 'Cookies analíticas',
    description:
      'Nos ayudan a entender cómo se usa el sitio web, qué páginas se visitan con más frecuencia y si hay errores. Toda la información es anónima.',
    required: false,
    examples: 'Google Analytics, métricas de uso, informes de errores',
    legalBasis: 'Art. 6.1.a RGPD — Consentimiento',
  },
  {
    id: 'marketing' as const,
    icon: Target,
    label: 'Cookies de marketing',
    description:
      'Se utilizan para mostrar anuncios relevantes. Pueden ser establecidas por nuestros socios publicitarios y rastrear tu actividad entre sitios.',
    required: false,
    examples: 'Meta Pixel, Google Ads, retargeting',
    legalBasis: 'Art. 6.1.a RGPD — Consentimiento',
  },
  {
    id: 'preferences' as const,
    icon: Settings2,
    label: 'Cookies de preferencias',
    description:
      'Permiten que el sitio recuerde tus preferencias como el tema visual, el idioma o la región, para ofrecerte una experiencia personalizada.',
    required: false,
    examples: 'Tema claro/oscuro, idioma, preferencias de vista',
    legalBasis: 'Art. 6.1.a RGPD — Consentimiento',
  },
] as const;

type CategoryId = (typeof CATEGORIES)[number]['id'];

// ─── Component ────────────────────────────────────────────────────────────────

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true,
    analytics: false,
    marketing: false,
    preferences: false,
  });

  useEffect(() => {
    const stored = loadStoredConsent();
    if (!stored) {
      // Delay para no interrumpir el render inicial
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  if (!visible) return null;

  const handleAcceptAll = () => {
    const prefs: CookiePreferences = {
      necessary: true,
      analytics: true,
      marketing: true,
      preferences: true,
    };
    saveConsent(prefs);
    setVisible(false);
  };

  const handleRejectAll = () => {
    const prefs: CookiePreferences = {
      necessary: true,
      analytics: false,
      marketing: false,
      preferences: false,
    };
    saveConsent(prefs);
    setVisible(false);
  };

  const handleSavePreferences = () => {
    saveConsent(preferences);
    setVisible(false);
  };

  const toggleCategory = (id: Exclude<CategoryId, 'necessary'>) => {
    setPreferences((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] p-4 md:p-6"
      role="dialog"
      aria-modal="false"
      aria-label="Gestión de cookies"
    >
      <div className="max-w-3xl mx-auto rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <Cookie className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Usamos cookies en este sitio web
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Conforme a la LSSI-CE y el RGPD (UE) 2016/679
              </p>
            </div>
          </div>
          <button
            onClick={handleRejectAll}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            aria-label="Rechazar y cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-4 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Utilizamos cookies propias y de terceros para mejorar la experiencia de navegación,
            analizar el tráfico y personalizar el contenido. Puedes aceptar todas, rechazar las
            opcionales o configurar tus preferencias. Puedes modificar tu elección en cualquier
            momento.{' '}
            <a
              href="/legal/cookies"
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Política de cookies
            </a>{' '}
            ·{' '}
            <a
              href="/legal/privacidad"
              className="text-blue-600 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Política de privacidad
            </a>
          </p>

          {/* Toggle detalles */}
          <button
            onClick={() => setShowDetails((s) => !s)}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-medium"
          >
            {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showDetails ? 'Ocultar configuración detallada' : 'Configurar preferencias'}
          </button>

          {/* Detailed categories */}
          {showDetails && (
            <div className="space-y-2 pt-1">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isOn = cat.required ? true : preferences[cat.id as Exclude<CategoryId, 'necessary'>];
                return (
                  <div
                    key={cat.id}
                    className="rounded-lg border border-border p-3 flex gap-3"
                  >
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground">{cat.label}</span>
                        {cat.required ? (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                            Siempre activas
                          </span>
                        ) : (
                          <button
                            role="switch"
                            aria-checked={isOn}
                            onClick={() => toggleCategory(cat.id as Exclude<CategoryId, 'necessary'>)}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                              isOn ? 'bg-blue-600' : 'bg-muted-foreground/30'
                            }`}
                          >
                            <span
                              className={`block h-4 w-4 rounded-full bg-white dark:bg-gray-800 shadow-sm transition-transform ${
                                isOn ? 'translate-x-4' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {cat.description}
                      </p>
                      <div className="flex flex-wrap gap-x-4 mt-1.5 text-xs text-muted-foreground">
                        <span>
                          <span className="font-medium">Ejemplos:</span> {cat.examples}
                        </span>
                        <span className="text-blue-600/80">{cat.legalBasis}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 px-5 py-4 bg-muted/30 border-t border-border">
          <button
            onClick={handleRejectAll}
            className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-lg border border-border bg-background text-foreground hover:bg-muted transition-colors"
          >
            Rechazar opcionales
          </button>
          {showDetails && (
            <button
              onClick={handleSavePreferences}
              className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-lg border border-border bg-background text-foreground hover:bg-muted transition-colors"
            >
              Guardar preferencias
            </button>
          )}
          <button
            onClick={handleAcceptAll}
            className="flex-1 sm:flex-none px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors ml-auto"
          >
            Aceptar todas
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Hook para leer preferencias en otros componentes ────────────────────────

export function useCookieConsent(): CookiePreferences | null {
  const [consent, setConsent] = useState<CookiePreferences | null>(() => {
    const stored = loadStoredConsent();
    return stored?.preferences ?? null;
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<CookiePreferences>;
      setConsent(ce.detail);
    };
    window.addEventListener('cookieConsentUpdated', handler);
    return () => window.removeEventListener('cookieConsentUpdated', handler);
  }, []);

  return consent;
}
