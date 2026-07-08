/** Motor fiscal orientativo para compraventa de vehículos (revendedor). */

import { formatTpoRateLabel, getTpoForCcaa } from './compraventaFiscalTpoRates';

export const IVA_RATE = 0.21;
export const TPO_ESTIMATE_RATE = 0.04;
export const IMPORT_TARIFF_RATE = 0.1;
export const VAT_NEW_MAX_MONTHS = 6;
export const VAT_NEW_MAX_KM = 6000;

export type PurchaseOrigin = 'spain' | 'eu' | 'outside_eu';

export type SellerId =
  | 'private'
  | 'company_vat'
  | 'company_exempt'
  | 'reseller_rebu'
  | 'eu_private'
  | 'eu_company_vat'
  | 'eu_reseller_margin'
  | 'import_any';

export type VehicleVatStatus = 'unknown' | 'new' | 'used';

export type SaleClientId =
  | 'private_spain'
  | 'company_spain'
  | 'reseller_spain'
  | 'eu_business'
  | 'eu_private'
  | 'outside_eu';

export type PriceInputMode = 'total' | 'base' | 'import';

export type SellerOption = {
  id: SellerId;
  label: string;
  hint: string;
  rebuTag: 'yes' | 'no' | 'depends';
  priceMode: PriceInputMode;
  priceLabel: string;
};

export type SaleClientOption = {
  id: SaleClientId;
  label: string;
  hint: string;
};

export type FiscalFormInput = {
  origin: PurchaseOrigin;
  seller: SellerId;
  ccaa: string;
  vehicleId: string;
  acquisitionId: string;
  brand: string;
  model: string;
  plate: string;
  firstRegistration: string;
  mileage: string;
  purchasePrice: string;
  includeSale: boolean;
  saleClient: SaleClientId;
  salePrice: string;
};

export type PurchaseAnalysis = {
  operationLabel: string;
  operationTone: 'neutral' | 'success' | 'warning' | 'danger';
  vatSupported: number;
  vatDeductible: number;
  vatNetEffect: number;
  tpoEstimate: number;
  tpoRateLabel: string;
  tariffEstimate: number;
  realPurchaseCost: number;
  purchaseBaseForMargin: number;
  rebuEligible: boolean;
  rebuReason: string;
  legalRefs: string[];
  reminders: string[];
};

export type SaleAnalysis = {
  regime: 'rebu' | 'general' | 'exempt_intra' | 'exempt_export' | 'exempt_new_eu';
  regimeLabel: string;
  invoiceTotal: number;
  vatQuota303: number;
  margin?: number;
  marginBase?: number;
  marginVat?: number;
  invoiceConcept: string;
  invoiceNotes: string[];
  legalRefs: string[];
  reminders: string[];
  model303Hint: string;
};

export type FiscalResult = {
  vatStatus: VehicleVatStatus;
  vatStatusLabel: string;
  purchase: PurchaseAnalysis | null;
  sale: SaleAnalysis | null;
  vehicleLabel: string;
};

export const ORIGIN_OPTIONS: { id: PurchaseOrigin; label: string; hint: string }[] = [
  { id: 'spain', label: 'España', hint: 'Compra nacional' },
  { id: 'eu', label: 'Unión Europea', hint: 'Alemania, Francia, Portugal…' },
  { id: 'outside_eu', label: 'Fuera de la UE', hint: 'Reino Unido, Suiza, EE.UU…' },
];

export const SELLERS_BY_ORIGIN: Record<PurchaseOrigin, SellerOption[]> = {
  spain: [
    {
      id: 'private',
      label: 'Particular',
      hint: 'Contrato de compraventa, sin factura con IVA',
      rebuTag: 'yes',
      priceMode: 'total',
      priceLabel: 'Total pagado',
    },
    {
      id: 'company_vat',
      label: 'Empresa con IVA',
      hint: 'Factura con 21% desglosado',
      rebuTag: 'no',
      priceMode: 'base',
      priceLabel: 'Base imponible (sin IVA)',
    },
    {
      id: 'company_exempt',
      label: 'Empresa exenta',
      hint: 'Art. 20.Uno.25º LIVA — sin IVA deducible',
      rebuTag: 'yes',
      priceMode: 'total',
      priceLabel: 'Total pagado',
    },
    {
      id: 'reseller_rebu',
      label: 'Revendedor REBU',
      hint: 'Factura en régimen de bienes usados',
      rebuTag: 'yes',
      priceMode: 'total',
      priceLabel: 'Total pagado',
    },
  ],
  eu: [
    {
      id: 'eu_private',
      label: 'Particular UE',
      hint: 'Persona física en otro Estado miembro',
      rebuTag: 'depends',
      priceMode: 'total',
      priceLabel: 'Total pagado al vendedor',
    },
    {
      id: 'eu_company_vat',
      label: 'Empresa UE',
      hint: 'Factura intracomunitaria sin IVA (ROI)',
      rebuTag: 'no',
      priceMode: 'base',
      priceLabel: 'Base imponible (sin IVA)',
    },
    {
      id: 'eu_reseller_margin',
      label: 'Revendedor UE (margen)',
      hint: '§25a UStG, marge, margin scheme…',
      rebuTag: 'yes',
      priceMode: 'total',
      priceLabel: 'Total pagado',
    },
  ],
  outside_eu: [
    {
      id: 'import_any',
      label: 'Importación',
      hint: 'DUA, arancel e IVA de aduana',
      rebuTag: 'no',
      priceMode: 'import',
      priceLabel: 'Precio pagado al vendedor',
    },
  ],
};

export const SALE_CLIENT_OPTIONS: SaleClientOption[] = [
  { id: 'private_spain', label: 'Particular en España', hint: 'Consumidor final' },
  { id: 'company_spain', label: 'Empresa / autónomo España', hint: 'Puede renunciar al REBU (art. 135.Dos)' },
  { id: 'reseller_spain', label: 'Revendedor nacional', hint: 'Cadena de margen o renuncia' },
  { id: 'eu_business', label: 'Empresa UE', hint: 'Entrega intracomunitaria exenta' },
  { id: 'eu_private', label: 'Particular UE', hint: 'Usado: REBU o IVA · Nuevo: exento art. 25.Dos' },
  { id: 'outside_eu', label: 'Fuera de la UE', hint: 'Exportación exenta (art. 21)' },
];

export function defaultFiscalForm(ccaa = 'ES-MD'): FiscalFormInput {
  return {
    origin: 'eu',
    seller: 'eu_private',
    ccaa,
    vehicleId: '',
    acquisitionId: '',
    brand: '',
    model: '',
    plate: '',
    firstRegistration: '',
    mileage: '',
    purchasePrice: '',
    includeSale: false,
    saleClient: 'private_spain',
    salePrice: '',
  };
}

export function sellersForOrigin(origin: PurchaseOrigin): SellerOption[] {
  return SELLERS_BY_ORIGIN[origin];
}

export function defaultSellerForOrigin(origin: PurchaseOrigin): SellerId {
  return SELLERS_BY_ORIGIN[origin][0]?.id ?? 'private';
}

/**
 * Convierte un importe escrito por el usuario a número, aceptando formato
 * español ("1.234,56") e inglés ("1,234.56" / "1234.56") sin confundir
 * los separadores de miles con los decimales.
 */
export function parseNum(value: string): number {
  let s = String(value ?? '')
    .trim()
    .replace(/[^\d.,-]/g, ''); // quita €, espacios, letras…
  if (!s) return 0;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    // El último separador que aparece es el decimal.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.'); // ES: punto=miles, coma=decimal
    } else {
      s = s.replace(/,/g, ''); // EN: coma=miles, punto=decimal
    }
  } else if (hasComma) {
    s = s.replace(/\./g, '').replace(',', '.'); // solo coma → decimal
  } else if (hasDot) {
    // Solo puntos: puede ser miles ("25.000") o decimal ("25.5").
    const parts = s.split('.');
    const looksGrouped =
      parts.length > 2 || (parts.length === 2 && parts[1].length === 3);
    if (looksGrouped) s = s.replace(/\./g, '');
    // en otro caso se conserva como decimal
  }

  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}


/** Art. 13.2ª — entrega antes de 6 meses desde la 1ª puesta en servicio. */
function isWithinVatNewAgeWindow(firstRegistration: string, ref = new Date()): boolean {
  const d = new Date(firstRegistration);
  if (Number.isNaN(d.getTime())) return false;
  const boundary = new Date(d);
  boundary.setMonth(boundary.getMonth() + VAT_NEW_MAX_MONTHS);
  return ref < boundary;
}

export function normalizeFiscalForm(form: FiscalFormInput): FiscalFormInput {
  const validSellers = SELLERS_BY_ORIGIN[form.origin].map((s) => s.id);
  if (validSellers.includes(form.seller)) return form;
  return { ...form, seller: defaultSellerForOrigin(form.origin) };
}

export function computeVehicleVatStatus(
  firstRegistration: string,
  mileageRaw: string,
): { status: VehicleVatStatus; label: string; tone: 'neutral' | 'success' | 'danger' } {
  const mileage = parseNum(mileageRaw);
  const hasDate = Boolean(firstRegistration);
  const hasKm = String(mileageRaw || '').trim() !== '';

  if (!hasDate || !hasKm) {
    return { status: 'unknown', label: 'Indica fecha y km', tone: 'neutral' };
  }

  const isNew = isWithinVatNewAgeWindow(firstRegistration) || mileage <= VAT_NEW_MAX_KM;

  if (isNew) {
    return {
      status: 'new',
      label: 'NUEVO a efectos de IVA',
      tone: 'danger',
    };
  }

  return {
    status: 'used',
    label: 'USADO a efectos de IVA',
    tone: 'success',
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number): string {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatEuro(n: number): string {
  return `${fmt(n)} €`;
}

function analyzePurchase(
  form: FiscalFormInput,
  vatStatus: VehicleVatStatus,
): PurchaseAnalysis | null {
  const price = parseNum(form.purchasePrice);
  if (price <= 0) return null;

  const ccaaTpo = getTpoForCcaa(form.ccaa);
  const tpoRateLabel = formatTpoRateLabel(ccaaTpo);

  if (form.origin === 'spain') {
    if (form.seller === 'private') {
      const tpo = round2(price * ccaaTpo.rate);
      return {
        operationLabel: 'No sujeta a IVA · TPO en compra a particular',
        operationTone: 'neutral',
        vatSupported: 0,
        vatDeductible: 0,
        vatNetEffect: 0,
        tpoEstimate: tpo,
        tpoRateLabel,
        tariffEstimate: 0,
        realPurchaseCost: price,
        purchaseBaseForMargin: price,
        rebuEligible: true,
        rebuReason: 'Compra sin IVA deducible — REBU posible en venta.',
        legalRefs: ['Art. 7 y 8 LIVA (no sujeta)', 'Art. 45.I.B).17º TRLITP (exención TPO revendedor)'],
        reminders: [
          `TPO orientativo ${formatEuro(tpo)} (${tpoRateLabel}) — exento en caja si revendes como profesional.`,
          'Modelo 620/621 TPO con exención si revendes en el plazo legal.',
          'Conserva el contrato de compraventa como justificante del margen.',
        ],
      };
    }
    if (form.seller === 'company_vat') {
      const base = price;
      const vat = round2(base * IVA_RATE);
      return {
        operationLabel: 'Compra con IVA deducible (régimen general)',
        operationTone: 'warning',
        vatSupported: vat,
        vatDeductible: vat,
        vatNetEffect: 0,
        tpoEstimate: 0,
        tpoRateLabel,
        tariffEstimate: 0,
        realPurchaseCost: round2(base),
        purchaseBaseForMargin: round2(base),
        rebuEligible: false,
        rebuReason: 'Dedujiste IVA en la compra — reventa en régimen general.',
        legalRefs: ['Art. 92 LIVA (deducción)', 'Art. 131 LIVA (REBU no aplicable)'],
        reminders: [
          'Factura de compra con IVA desglosado obligatoria.',
          `Pagas ${formatEuro(round2(base + vat))} (IVA incl.) pero recuperas ${formatEuro(vat)}: coste real ${formatEuro(round2(base))}.`,
        ],
      };
    }
    if (form.seller === 'company_exempt' || form.seller === 'reseller_rebu') {
      return {
        operationLabel:
          form.seller === 'reseller_rebu'
            ? 'Compra a revendedor en REBU'
            : 'Compra exenta (art. 20.Uno.25º)',
        operationTone: 'success',
        vatSupported: 0,
        vatDeductible: 0,
        vatNetEffect: 0,
        tpoEstimate: 0,
        tpoRateLabel,
        tariffEstimate: 0,
        realPurchaseCost: price,
        purchaseBaseForMargin: price,
        rebuEligible: true,
        rebuReason: 'Sin IVA deducible en origen — REBU posible.',
        legalRefs: ['Art. 135 LIVA (REBU)', 'Art. 20.Uno.25º LIVA (exención en origen)'],
        reminders: ['Verifica la mención de exención o REBU en la factura del proveedor.'],
      };
    }
  }

  if (form.origin === 'eu') {
    if (form.seller === 'eu_company_vat') {
      const base = price;
      const vat = round2(base * IVA_RATE);
      const isNew = vatStatus === 'new';
      return {
        operationLabel: isNew
          ? 'Adquisición intracomunitaria — vehículo NUEVO'
          : 'Adquisición intracomunitaria — bienes usados',
        operationTone: isNew ? 'danger' : 'warning',
        vatSupported: vat,
        vatDeductible: vat,
        vatNetEffect: 0,
        tpoEstimate: 0,
        tpoRateLabel,
        tariffEstimate: 0,
        realPurchaseCost: base,
        purchaseBaseForMargin: base,
        rebuEligible: false,
        rebuReason: 'Autoliquidación con derecho a deducción — no REBU.',
        legalRefs: [
          'Art. 15 LIVA (adquisición intracomunitaria)',
          isNew ? 'Art. 13.2ª LIVA (medio de transporte nuevo)' : 'Directiva 2006/112/CE',
        ],
        reminders: [
          'Debes estar en el ROI y tener NIF-IVA válido.',
          'Modelo 349 si procede.',
          isNew ? 'Valorar IEDMT (modelo 576) por separado.' : '',
        ].filter(Boolean),
      };
    }
    if (form.seller === 'eu_private') {
      if (vatStatus === 'new') {
        const vat = round2(price * IVA_RATE);
        return {
          operationLabel: 'Medio de transporte NUEVO — autoliquidación IVA en España',
          operationTone: 'danger',
          vatSupported: vat,
          vatDeductible: vat,
          vatNetEffect: 0,
          tpoEstimate: 0,
          tpoRateLabel,
          tariffEstimate: 0,
          realPurchaseCost: price,
          purchaseBaseForMargin: price,
          rebuEligible: false,
          rebuReason: 'Vehículo nuevo — siempre sujeto aunque venda un particular.',
          legalRefs: ['Art. 13.2ª LIVA', 'Art. 15 LIVA (autoliquidación)'],
          reminders: [
            'Error frecuente: km 0 alemán puede ser NUEVO fiscalmente.',
            'Modelo 309 si procede · IEDMT por separado.',
          ],
        };
      }
      if (vatStatus === 'used') {
        return {
          operationLabel: 'Compra a particular UE (usado) — no sujeta en España',
          operationTone: 'success',
          vatSupported: 0,
          vatDeductible: 0,
          vatNetEffect: 0,
          tpoEstimate: 0,
          tpoRateLabel,
          tariffEstimate: 0,
          realPurchaseCost: price,
          purchaseBaseForMargin: price,
          rebuEligible: true,
          rebuReason: 'Compra usada sin IVA español deducible — REBU posible.',
          legalRefs: ['Art. 7 LIVA (territorialidad)', 'Art. 135 LIVA (REBU)'],
          reminders: ['Matricula en España · conserva contrato y prueba de pago.'],
        };
      }
      return {
        operationLabel: 'Completa fecha de matriculación y kilómetros',
        operationTone: 'neutral',
        vatSupported: 0,
        vatDeductible: 0,
        vatNetEffect: 0,
        tpoEstimate: 0,
        tpoRateLabel,
        tariffEstimate: 0,
        realPurchaseCost: price,
        purchaseBaseForMargin: price,
        rebuEligible: false,
        rebuReason: 'Pendiente de clasificar nuevo/usado.',
        legalRefs: ['Art. 13.2ª LIVA'],
        reminders: ['Indica 1ª matriculación y km para calcular el régimen.'],
      };
    }
    if (form.seller === 'eu_reseller_margin') {
      return {
        operationLabel: 'Compra a revendedor UE en régimen del margen',
        operationTone: 'success',
        vatSupported: 0,
        vatDeductible: 0,
        vatNetEffect: 0,
        tpoEstimate: 0,
        tpoRateLabel,
        tariffEstimate: 0,
        realPurchaseCost: price,
        purchaseBaseForMargin: price,
        rebuEligible: true,
        rebuReason: 'Sin IVA deducible — encadena REBU en España.',
        legalRefs: ['Art. 135 LIVA', 'Directiva 2006/112/CE (régimen del margen)'],
        reminders: ['Revisa la mención de margen en la factura extranjera.'],
      };
    }
  }

  if (form.origin === 'outside_eu' && form.seller === 'import_any') {
    const cif = price;
    const tariff = round2(cif * IMPORT_TARIFF_RATE);
    const vatBase = cif + tariff;
    const vat = round2(vatBase * IVA_RATE);
    return {
      operationLabel: 'Importación — arancel + IVA de aduana',
      operationTone: 'warning',
      vatSupported: vat,
      vatDeductible: vat,
      vatNetEffect: 0,
      tpoEstimate: 0,
      tpoRateLabel,
      tariffEstimate: tariff,
      realPurchaseCost: round2(cif + tariff),
      purchaseBaseForMargin: round2(cif + tariff),
      rebuEligible: false,
      rebuReason: 'Importación con IVA deducible — régimen general en venta.',
      legalRefs: ['Art. 86 LIVA (importación)', 'Arancel aduanero (~10% orientativo)'],
      reminders: [
        'DUA obligatorio · arancel orientativo según partida.',
        `Desembolso en aduana ${formatEuro(round2(cif + tariff + vat))} (arancel + IVA); recuperas el IVA ${formatEuro(vat)}. Coste real ${formatEuro(round2(cif + tariff))}.`,
      ],
    };
  }

  return null;
}

function analyzeSale(
  form: FiscalFormInput,
  purchase: PurchaseAnalysis,
  vatStatus: VehicleVatStatus,
): SaleAnalysis | null {
  const saleAmount = parseNum(form.salePrice);
  if (saleAmount <= 0) return null;

  const vehicle = [form.brand, form.model].filter(Boolean).join(' ') || 'Vehículo';
  const plateSuffix = form.plate ? ` · ${form.plate}` : '';

  if (form.saleClient === 'outside_eu') {
    return {
      regime: 'exempt_export',
      regimeLabel: 'Exportación exenta',
      invoiceTotal: saleAmount,
      vatQuota303: 0,
      invoiceConcept: `${vehicle}${plateSuffix}`,
      invoiceNotes: ['Operación exenta por exportación (art. 21 LIVA).', 'Expedir DUA de exportación.'],
      legalRefs: ['Art. 21 LIVA'],
      reminders: ['Documentación aduanera de salida.'],
      model303Hint: '0 € — operación exenta exportación.',
    };
  }

  if (form.saleClient === 'eu_business') {
    return {
      regime: 'exempt_intra',
      regimeLabel: 'Entrega intracomunitaria exenta',
      invoiceTotal: saleAmount,
      vatQuota303: 0,
      invoiceConcept: `${vehicle}${plateSuffix}`,
      invoiceNotes: [
        'Operación exenta (art. 25.Uno LIVA).',
        purchase.rebuEligible
          ? 'Renuncia al REBU en entrega intracomunitaria (art. 135.Dos).'
          : '',
        'Validar NIF-IVA en VIES antes de emitir.',
      ].filter(Boolean),
      legalRefs: ['Art. 25.Uno LIVA', 'Art. 135.Dos LIVA'],
      reminders: ['Modelo 349 · CMR del transporte.'],
      model303Hint: '0 € — entrega intracomunitaria exenta.',
    };
  }

  if (form.saleClient === 'eu_private' && vatStatus === 'new') {
    return {
      regime: 'exempt_new_eu',
      regimeLabel: 'Entrega exenta — vehículo NUEVO a particular UE',
      invoiceTotal: saleAmount,
      vatQuota303: 0,
      invoiceConcept: `${vehicle}${plateSuffix}`,
      invoiceNotes: ['Exenta art. 25.Dos LIVA — IVA en país del comprador.'],
      legalRefs: ['Art. 25.Dos LIVA', 'Art. 13.2ª LIVA'],
      reminders: ['Sin REBU en vehículos nuevos intracomunitarios.'],
      model303Hint: '0 € — exenta en origen.',
    };
  }

  const canRebu =
    purchase.rebuEligible &&
    (form.saleClient === 'private_spain' ||
      form.saleClient === 'company_spain' ||
      form.saleClient === 'reseller_spain' ||
      (form.saleClient === 'eu_private' && vatStatus === 'used'));

  if (canRebu) {
    const margin = round2(Math.max(0, saleAmount - purchase.purchaseBaseForMargin));
    const marginBase = round2(margin / (1 + IVA_RATE));
    const marginVat = round2(margin - marginBase);
    return {
      regime: 'rebu',
      regimeLabel: 'Régimen especial de bienes usados (REBU)',
      invoiceTotal: saleAmount,
      vatQuota303: marginVat,
      margin,
      marginBase,
      marginVat,
      invoiceConcept: `${vehicle}${plateSuffix}`,
      invoiceNotes: [
        'Régimen especial de bienes usados, art. 135 y ss. Ley 37/1992.',
        'No desglosar IVA en la factura al cliente.',
      ],
      legalRefs: ['Art. 135 LIVA', 'Art. 136 LIVA'],
      reminders: [
        'Factura por el total sin desglose de IVA.',
        'Conserva justificante de compra para acreditar el margen.',
      ],
      model303Hint: `${formatEuro(marginVat)} — IVA devengado del margen (no visible en factura).`,
    };
  }

  const base = saleAmount;
  const vat = round2(base * IVA_RATE);
  const total = round2(base + vat);
  return {
    regime: 'general',
    regimeLabel: 'Régimen general — IVA 21%',
    invoiceTotal: total,
    vatQuota303: vat,
    invoiceConcept: `${vehicle}${plateSuffix}`,
    invoiceNotes: [`Base imponible: ${formatEuro(base)}`, `IVA 21%: ${formatEuro(vat)}`],
    legalRefs: ['Art. 4 y 90 LIVA'],
    reminders: ['Factura con IVA desglosado.'],
    model303Hint: `${formatEuro(vat)} — cuota devengada régimen general.`,
  };
}

export function computeFiscalResult(form: FiscalFormInput): FiscalResult {
  const normalized = normalizeFiscalForm(form);
  const vatInfo = computeVehicleVatStatus(normalized.firstRegistration, normalized.mileage);
  const purchase = analyzePurchase(normalized, vatInfo.status);
  const vehicleLabel =
    [normalized.brand, normalized.model].filter(Boolean).join(' ') ||
    (normalized.plate ? normalized.plate : 'Sin identificar');

  let sale: SaleAnalysis | null = null;
  if (normalized.includeSale && purchase) {
    sale = analyzeSale(normalized, purchase, vatInfo.status);
  }

  return {
    vatStatus: vatInfo.status,
    vatStatusLabel: vatInfo.label,
    purchase,
    sale,
    vehicleLabel,
  };
}

export function sellerPriceLabel(form: FiscalFormInput): string {
  const seller = SELLERS_BY_ORIGIN[form.origin].find((s) => s.id === form.seller);
  return seller?.priceLabel ?? 'Importe';
}

export function salePriceHint(form: FiscalFormInput, result: FiscalResult): string {
  if (!result.purchase) return 'Precio de venta';
  if (form.includeSale && result.purchase.rebuEligible) {
    if (
      form.saleClient === 'outside_eu' ||
      form.saleClient === 'eu_business' ||
      (form.saleClient === 'eu_private' && result.vatStatus === 'new')
    ) {
      return 'Precio total de venta';
    }
    return 'Precio total de venta (IVA del margen incluido)';
  }
  if (
    form.saleClient === 'outside_eu' ||
    form.saleClient === 'eu_business' ||
    (form.saleClient === 'eu_private' && result.vatStatus === 'new')
  ) {
    return 'Precio total de venta';
  }
  return 'Base imponible (sin IVA)';
}
