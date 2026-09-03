/**
 * i18n mínimo para landing (/): solo textos `landing.*`.
 * El SaaS/auth cargan el bundle completo vía `import('./i18n')` (ensureSaasI18n).
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18N_LANG_STORAGE_KEY, LANDING_I18N } from './landingI18n';

function readStoredLanguage(): string {
  try {
    const stored = localStorage.getItem(I18N_LANG_STORAGE_KEY);
    if (stored && ['es', 'en', 'pt', 'fr', 'it'].includes(stored)) return stored;
  } catch {
    /* noop */
  }
  return 'es';
}

const landingResources = {
  es: { translation: { landing: LANDING_I18N.es } },
  en: { translation: { landing: LANDING_I18N.en } },
  pt: { translation: { landing: LANDING_I18N.pt } },
  fr: { translation: { landing: LANDING_I18N.fr } },
  it: { translation: { landing: LANDING_I18N.it } },
};

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: landingResources,
    lng: typeof window !== 'undefined' ? readStoredLanguage() : 'es',
    fallbackLng: 'es',
    supportedLngs: ['es', 'en', 'pt', 'fr', 'it'],
    defaultNS: 'translation',
    interpolation: {
      escapeValue: false,
    },
  });

  i18n.on('languageChanged', (lng) => {
    try {
      localStorage.setItem(I18N_LANG_STORAGE_KEY, lng);
      if (typeof document !== 'undefined') {
        document.documentElement.lang = lng;
      }
    } catch {
      /* noop */
    }
  });
}

export default i18n;
export { I18N_LANG_STORAGE_KEY };
