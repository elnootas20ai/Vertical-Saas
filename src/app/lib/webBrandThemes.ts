/** Resolución genérica de la marca configurada para la web pública. */

export type WebBrandTheme = {
  id: string;
  storeName: string;
  welcomeMessage: string;
  storeDescription: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  /** Icono (favicon / avatar) */
  storeLogo: string;
  /** Wordmark horizontal para el hero */
  wordmark: string;
};

const VERTIAL_OR_LEGACY_PRIMARIES = new Set([
  '#2563eb',
  '#2563EB',
  '#f59e0b',
  '#F59E0B',
  '#6366f1',
  '#6366F1',
]);

export type ResolvedWebBrand = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  storeLogo: string;
  wordmark: string | null;
  storeName: string;
  welcomeMessage: string;
  storeDescription: string;
  themeId: string | null;
};

/**
 * Prioridad: valores guardados por el negocio → fallback visual Vertial.
 */
export function resolveWebBrandTheme(
  config: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    backgroundColor?: string;
    storeLogo?: string;
    storeName?: string;
    welcomeMessage?: string;
    storeDescription?: string;
    slug?: string;
  } | null | undefined,
  _routeSlug?: string,
): ResolvedWebBrand {
  const rawPrimary = String(config?.primaryColor || '').trim();
  const useSavedPrimary = Boolean(rawPrimary) && !VERTIAL_OR_LEGACY_PRIMARIES.has(rawPrimary);

  const primaryColor =
    useSavedPrimary
      ? rawPrimary
      : (rawPrimary || '#2563EB');

  const secondaryColor =
    String(config?.secondaryColor || '').trim() ||
    '#0B1220';

  const accentRaw = String(config?.accentColor || '').trim();
  const accentColor =
    accentRaw && !VERTIAL_OR_LEGACY_PRIMARIES.has(accentRaw) && accentRaw.toLowerCase() !== '#14b8a6'
      ? accentRaw
      : (accentRaw || '#14B8A6');

  const backgroundColor =
    String(config?.backgroundColor || '').trim() ||
    '#ffffff';

  const storeLogo =
    String(config?.storeLogo || '').trim() ||
    '';

  const rawWelcome = String(config?.welcomeMessage || '').trim();
  const genericWelcome = /^(¡?bienvenid[oa]s?!?|welcome!?)$/i.test(rawWelcome);

  return {
    primaryColor,
    secondaryColor,
    accentColor,
    backgroundColor,
    storeLogo,
    wordmark: null,
    storeName: String(config?.storeName || '').trim() || 'Pedido online',
    welcomeMessage:
      rawWelcome && !genericWelcome
        ? rawWelcome
        : (rawWelcome || '¡Bienvenido!'),
    storeDescription:
      String(config?.storeDescription || '').trim() ||
      '',
    themeId: null,
  };
}
