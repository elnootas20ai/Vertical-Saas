/** Tipos orientativos de TPO por CCAA sobre base de compra (turismos usados). */

export type CcaaTpoRate = {
  code: string;
  label: string;
  rate: number;
  note?: string;
};

export const CCAA_TPO_RATES: CcaaTpoRate[] = [
  { code: 'ES-AN', label: 'Andalucía', rate: 0.04, note: 'Pueden aplicar tablas por CO₂' },
  { code: 'ES-AR', label: 'Aragón', rate: 0.04 },
  { code: 'ES-AS', label: 'Asturias', rate: 0.04 },
  { code: 'ES-IB', label: 'Illes Balears', rate: 0.04 },
  { code: 'ES-CN', label: 'Canarias', rate: 0.035, note: 'ITPM — tipo orientativo' },
  { code: 'ES-CB', label: 'Cantabria', rate: 0.04 },
  { code: 'ES-CL', label: 'Castilla y León', rate: 0.05 },
  { code: 'ES-CM', label: 'Castilla-La Mancha', rate: 0.06 },
  { code: 'ES-CT', label: 'Cataluña', rate: 0.05 },
  { code: 'ES-EX', label: 'Extremadura', rate: 0.04 },
  { code: 'ES-GA', label: 'Galicia', rate: 0.05 },
  { code: 'ES-RI', label: 'La Rioja', rate: 0.04 },
  { code: 'ES-MD', label: 'Madrid', rate: 0.04 },
  { code: 'ES-MC', label: 'Murcia', rate: 0.04 },
  { code: 'ES-NC', label: 'Navarra', rate: 0.04 },
  { code: 'ES-PV', label: 'País Vasco', rate: 0.04, note: 'Normativa foral' },
  { code: 'ES-VC', label: 'Comunitat Valenciana', rate: 0.06 },
  { code: 'ES-CE', label: 'Ceuta', rate: 0.04 },
  { code: 'ES-ML', label: 'Melilla', rate: 0.04 },
];

const BY_CODE = Object.fromEntries(CCAA_TPO_RATES.map((r) => [r.code, r]));

export function getTpoForCcaa(code: string): CcaaTpoRate {
  return BY_CODE[code] || BY_CODE['ES-MD'];
}

export function formatTpoRateLabel(ccaa: CcaaTpoRate): string {
  return `${ccaa.label} (${(ccaa.rate * 100).toFixed(1).replace('.0', '')}%)`;
}

/** Inferir CCAA desde texto de dirección del negocio (heurística simple). */
export function inferCcaaFromAddress(address?: string | null): string {
  const text = String(address || '').toLowerCase();
  if (!text) return 'ES-MD';
  const rules: [RegExp, string][] = [
    [/\b(madrid|móstoles|alcalá|getafe|leganés)\b/i, 'ES-MD'],
    [/\b(barcelona|tarragona|girona|lleida|hospitalet|badalona)\b/i, 'ES-CT'],
    [/\b(valencia|alicante|castellón|elche|torrevieja)\b/i, 'ES-VC'],
    [/\b(sevilla|málaga|córdoba|granada|huelva|jaén|cádiz|almería)\b/i, 'ES-AN'],
    [/\b(bilbao|vitoria|san sebastián|donostia|gipuzkoa|bizkaia)\b/i, 'ES-PV'],
    [/\b(zaragoza|huesca|teruel)\b/i, 'ES-AR'],
    [/\b(murcia|cartagena|lorca)\b/i, 'ES-MC'],
    [/\b(vigo|coruña|santiago|ourense|lugo|pontevedra)\b/i, 'ES-GA'],
    [/\b(valladolid|salamanca|burgos|león|segovia|ávila|palencia|zamora|soria)\b/i, 'ES-CL'],
    [/\b(toledo|ciudad real|albacete|cuenca|guadalajara)\b/i, 'ES-CM'],
    [/\b(palma|mallorca|ibiza|menorca)\b/i, 'ES-IB'],
    [/\b(las palmas|santa cruz|tenerife|canarias)\b/i, 'ES-CN'],
    [/\b(pamplona|navarra)\b/i, 'ES-NC'],
    [/\b(oviedo|asturias|gijón)\b/i, 'ES-AS'],
    [/\b(santander|cantabria)\b/i, 'ES-CB'],
    [/\b(badajoz|cáceres|extremadura)\b/i, 'ES-EX'],
    [/\b(logroño|la rioja)\b/i, 'ES-RI'],
  ];
  for (const [pattern, code] of rules) {
    if (pattern.test(text)) return code;
  }
  return 'ES-MD';
}
