/**
 * Contrato de prestación de servicios SaaS Vertial (plantilla de producto).
 * Versión fijada: al firmar se guarda el snapshot + versionId.
 * Texto orientativo de producto; revisión legal externa recomendada antes de producción.
 */

export const VERTIAL_SERVICE_AGREEMENT_VERSION = 'VERTIAL-SAAS-ES-2026-08';

export type ServiceAgreementParty = {
  legalName: string;
  tradeName: string;
  taxId: string;
  address: string;
  city?: string;
  province: string;
  email: string;
  phone: string;
  businessType?: string;
  planId?: string;
  billingMode?: 'monthly' | 'annual';
  signerName: string;
  signerEmail?: string;
};

export type ServiceAgreementClause = {
  id: string;
  title: string;
  body: string;
};

export type SignedServiceAgreement = {
  version: string;
  signedAt: string;
  party: ServiceAgreementParty;
  clauses: ServiceAgreementClause[];
  signatureDataUrl: string;
  signerName: string;
  userAgent?: string;
};

export function buildServiceAgreementParty(input: {
  companyProfile: {
    tradeName?: string;
    legalName?: string;
    taxId?: string;
    address?: string;
    city?: string;
    province?: string;
    companyEmail?: string;
    companyPhone?: string;
  };
  businessType?: string;
  planId?: string;
  billingMode?: 'monthly' | 'annual';
  signerName?: string;
  signerEmail?: string;
}): ServiceAgreementParty {
  const c = input.companyProfile || {};
  return {
    legalName: String(c.legalName || c.tradeName || '').trim(),
    tradeName: String(c.tradeName || c.legalName || '').trim(),
    taxId: String(c.taxId || '').trim().toUpperCase(),
    address: String(c.address || '').trim(),
    city: String(c.city || '').trim() || undefined,
    province: String(c.province || '').trim(),
    email: String(c.companyEmail || input.signerEmail || '').trim(),
    phone: String(c.companyPhone || '').trim(),
    businessType: input.businessType || undefined,
    planId: input.planId || undefined,
    billingMode: input.billingMode,
    signerName: String(input.signerName || '').trim(),
    signerEmail: String(input.signerEmail || c.companyEmail || '').trim() || undefined,
  };
}

export function buildServiceAgreementClauses(party: ServiceAgreementParty): ServiceAgreementClause[] {
  const clientLabel =
    party.legalName || party.tradeName || 'el Cliente';
  const nif = party.taxId || '—';
  const plan = party.planId || 'según selección en alta';
  const billing =
    party.billingMode === 'annual'
      ? 'facturación anual'
      : party.billingMode === 'monthly'
        ? 'facturación mensual'
        : 'facturación según plan contratado';

  return [
    {
      id: '1',
      title: '1. Partes',
      body:
        `De una parte, VERTIAL (en adelante, «Vertial» o el «Proveedor»), titular de la plataforma SaaS Vertial. ` +
        `De otra parte, ${clientLabel}, con NIF/CIF ${nif}, domicilio en ${party.address || '—'}` +
        `${party.city ? `, ${party.city}` : ''}${party.province ? ` (${party.province})` : ''}, ` +
        `email ${party.email || '—'} y teléfono ${party.phone || '—'} (en adelante, el «Cliente»).`,
    },
    {
      id: '2',
      title: '2. Objeto',
      body:
        `Vertial concede al Cliente un derecho de uso no exclusivo, intransferible y revocable de la plataforma ` +
        `software como servicio (SaaS) Vertial y módulos asociados al plan contratado (${plan}, ${billing}), ` +
        `para la gestión operativa de su negocio, conforme a la funcionalidad disponible en cada momento.`,
    },
    {
      id: '3',
      title: '3. Alta y cuenta',
      body:
        `El Cliente declara que los datos facilitados en el registro y onboarding son veraces y están actualizados. ` +
        `Es responsable de la custodia de credenciales, usuarios invitados y del uso que se haga desde su cuenta. ` +
        `Deberá notificar sin demora cualquier acceso no autorizado.`,
    },
    {
      id: '4',
      title: '4. Condiciones económicas',
      body:
        `El precio, periodo de prueba (si aplica), renovación y forma de pago se rigen por el plan seleccionado ` +
        `en el alta y por las condiciones comerciales vigentes en Vertial. El impago o impago reiterado puede ` +
        `suponer la suspensión temporal del servicio previa comunicación razonable.`,
    },
    {
      id: '5',
      title: '5. Uso aceptable',
      body:
        `El Cliente se compromete a usar la plataforma de forma lícita, sin vulnerar derechos de terceros ni ` +
        `normativa aplicable. Queda prohibido el abuso técnico (ataques, scraping masivo no autorizado, ` +
        `intento de eludir límites de seguridad o de licencia) y el uso para fines ilícitos.`,
    },
    {
      id: '6',
      title: '6. Datos y privacidad',
      body:
        `Vertial tratará datos personales como encargado o responsable según el caso, conforme a la normativa ` +
        `de protección de datos aplicable (RGPD y LOPDGDD) y a su política de privacidad. El Cliente es ` +
        `responsable de los datos que introduce (clientes, empleados, operaciones) y de disponer de base ` +
        `legítima para su tratamiento. Vertial aplicará medidas técnicas y organizativas razonables de seguridad.`,
    },
    {
      id: '7',
      title: '7. Disponibilidad y soporte',
      body:
        `Vertial realizará esfuerzos razonables para mantener la disponibilidad del servicio y comunicar ` +
        `mantenimientos programados. No se garantiza disponibilidad ininterrumpida al 100 %. El soporte ` +
        `se prestará por los canales habilitados según el plan.`,
    },
    {
      id: '8',
      title: '8. Propiedad intelectual',
      body:
        `La plataforma, marcas, software, documentación y contenidos de Vertial son propiedad de Vertial o ` +
        `de sus licenciantes. El Cliente conserva la titularidad de los datos de negocio que introduzca. ` +
        `Ninguna cláusula cede al Cliente derechos de propiedad sobre el software de Vertial.`,
    },
    {
      id: '9',
      title: '9. Limitación de responsabilidad',
      body:
        `En la máxima medida permitida por la ley, Vertial no será responsable de daños indirectos, lucro ` +
        `cesante, pérdida de datos no imputable a dolo o negligencia grave, o interrupciones causadas por ` +
        `terceros (ISP, proveedores cloud, fuerza mayor). La responsabilidad agregada de Vertial, si procede, ` +
        `quedará limitada a las cantidades abonadas por el Cliente en los doce (12) meses anteriores al hecho.`,
    },
    {
      id: '10',
      title: '10. Duración y resolución',
      body:
        `El contrato entra en vigor con la firma electrónica del Cliente en el alta y se prorroga según el ` +
        `ciclo de facturación del plan, salvo baja conforme a las condiciones comerciales. Cualquiera de las ` +
        `partes podrá resolver por incumplimiento grave no subsanado en plazo razonable tras requerimiento.`,
    },
    {
      id: '11',
      title: '11. Firma electrónica',
      body:
        `El Cliente acepta que la firma manuscrita digital capturada en esta pantalla, junto con la fecha, ` +
        `versión del contrato (${VERTIAL_SERVICE_AGREEMENT_VERSION}) y los datos de la empresa, tiene plenos ` +
        `efectos como manifestación de voluntad para contratar el servicio Vertial. Se conserva evidencia ` +
        `del consentimiento en la cuenta del Cliente.`,
    },
    {
      id: '12',
      title: '12. Ley aplicable',
      body:
        `Este contrato se rige por la legislación española. Para la resolución de controversias, las partes ` +
        `se someten a los juzgados y tribunales del domicilio del Proveedor, salvo norma imperativa en contrario.`,
    },
  ];
}

export function formatAgreementDateEs(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
