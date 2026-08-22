/**
 * Temas de marca para la web pública de pedidos.
 * Hoy Pecamos = referencia visual (logo + colores reales del site).
 */

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

/** Extraído de https://hoypecamos.com/ (Framer) */
export const HOYPECAMOS_THEME: WebBrandTheme = {
  id: 'hoypecamos',
  storeName: 'Hoy Pecamos',
  welcomeMessage: 'Un buen pecado siempre merece la pena.',
  storeDescription:
    'Somos Hoy Pecamos, un grupo nacido en la calle y hecho para los que viven sin miedo al placer. Entre hornos de leña y planchas que chispean: pizzas Modomio y burgers Blackburger.',
  primaryColor: '#E32226',
  secondaryColor: '#0D0D0D',
  accentColor: '#FF6026',
  backgroundColor: '#0D0D0D',
  storeLogo: '/web-brand/hoypecamos/logo-icon.png',
  wordmark: '/web-brand/hoypecamos/logo-wordmark.png',
};

const VERTIAL_OR_LEGACY_PRIMARIES = new Set([
  '#2563eb',
  '#2563EB',
  '#f59e0b',
  '#F59E0B',
  '#6366f1',
  '#6366F1',
]);

function haystack(slug?: string, storeName?: string, cfgSlug?: string): string {
  return `${slug || ''} ${storeName || ''} ${cfgSlug || ''}`.toLowerCase();
}

export function isHoyPecamosBrand(slug?: string, storeName?: string, cfgSlug?: string): boolean {
  return /hoy\s*pecamos|hoypecamos|modomio|blackburger/.test(haystack(slug, storeName, cfgSlug));
}

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
 * Prioridad: valores guardados por el negocio (si no son default Vertial/legacy)
 * → tema Hoy Pecamos si el slug/nombre encaja → fallback Vertial.
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
  routeSlug?: string,
): ResolvedWebBrand {
  const match = isHoyPecamosBrand(routeSlug, config?.storeName, config?.slug);
  const base = match ? HOYPECAMOS_THEME : null;

  const rawPrimary = String(config?.primaryColor || '').trim();
  const useSavedPrimary = Boolean(rawPrimary) && !VERTIAL_OR_LEGACY_PRIMARIES.has(rawPrimary);

  const primaryColor =
    useSavedPrimary
      ? rawPrimary
      : (base?.primaryColor || rawPrimary || '#2563EB');

  const secondaryColor =
    String(config?.secondaryColor || '').trim() ||
    base?.secondaryColor ||
    '#0B1220';

  const accentRaw = String(config?.accentColor || '').trim();
  const accentColor =
    accentRaw && !VERTIAL_OR_LEGACY_PRIMARIES.has(accentRaw) && accentRaw.toLowerCase() !== '#14b8a6'
      ? accentRaw
      : (base?.accentColor || accentRaw || '#14B8A6');

  const backgroundColor =
    String(config?.backgroundColor || '').trim() ||
    base?.backgroundColor ||
    '#ffffff';

  const storeLogo =
    String(config?.storeLogo || '').trim() ||
    base?.storeLogo ||
    '';

  const rawWelcome = String(config?.welcomeMessage || '').trim();
  const genericWelcome = /^(¡?bienvenid[oa]s?!?|welcome!?)$/i.test(rawWelcome);

  return {
    primaryColor,
    secondaryColor,
    accentColor,
    backgroundColor,
    storeLogo,
    wordmark: base?.wordmark || null,
    storeName: String(config?.storeName || '').trim() || base?.storeName || 'Pedido online',
    welcomeMessage:
      rawWelcome && !genericWelcome
        ? rawWelcome
        : (base?.welcomeMessage || rawWelcome || '¡Bienvenido!'),
    storeDescription:
      String(config?.storeDescription || '').trim() ||
      base?.storeDescription ||
      '',
    themeId: base?.id || null,
  };
}
