/**
 * Contrato de prestación de servicios SaaS Vertial (plantilla de producto).
 * Redactado en defensa de Vertial: modificación con preaviso, cobro anticipado
 * no reembolsable, suspensión por impago, responsabilidad limitada.
 * Versión fijada al firmar. Al cambiar el texto, sube VERTIAL_SERVICE_AGREEMENT_VERSION.
 * Texto de producto; revisión por abogado colegiado recomendada antes de producción.
 */

export const VERTIAL_SERVICE_AGREEMENT_VERSION = 'VERTIAL-SAAS-ES-2026-08.6';

/** Datos del prestador (Vertial). Un solo sitio para actualizarlos. */
export const VERTIAL_PROVIDER = {
  name: 'VERTIAL',
  ownerName: 'Uriel Arnau Ruiz',
  taxId: '48216687Q',
  phone: '647779812',
  email: 'vertial.noreply@gmail.com',
  web: 'www.vertialapp.com',
} as const;

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

function formatClientDomicile(party: ServiceAgreementParty): string {
  const parts = [party.address, party.city, party.province]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : 'sin indicar';
}

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
  const clientLabel = party.legalName || party.tradeName || 'Cliente';
  const nif = party.taxId || 'sin indicar';
  const domicile = formatClientDomicile(party);
  const email = party.email || 'sin indicar';
  const phone = party.phone || 'sin indicar';
  const plan = party.planId || 'el seleccionado en el alta';
  const billingPeriodLabel =
    party.billingMode === 'annual'
      ? 'anual'
      : party.billingMode === 'monthly'
        ? 'mensual'
        : 'mensual o anual, según el plan elegido en el alta';
  const p = VERTIAL_PROVIDER;

  return [
    {
      id: '1',
      title: '1. Partes',
      body:
        `Este contrato se celebra entre las siguientes partes. ` +
        `Prestador del servicio: VERTIAL, a cargo de ${p.ownerName}, DNI ${p.taxId}. ` +
        `Teléfono ${p.phone}. Correo ${p.email}. Web ${p.web}. ` +
        `Cliente: ${clientLabel}, NIF/CIF ${nif}. Domicilio ${domicile}. ` +
        `Correo ${email}. Teléfono ${phone}.`,
    },
    {
      id: '2',
      title: '2. Objeto',
      body:
        `Vertial concede al Cliente una licencia de uso no exclusiva, intransferible, no sublicenciable ` +
        `y revocable de la plataforma Vertial y de los módulos del plan contratado, plan ${plan}, ` +
        `para la gestión interna de su negocio. Esta licencia no supone venta ni cesión del software. ` +
        `La funcionalidad será la disponible en cada momento. Vertial podrá mejorarla, sustituirla o ` +
        `reorganizarla sin que ello sea incumplimiento, siempre que el servicio conserve su utilidad esencial.`,
    },
    {
      id: '3',
      title: '3. Alta, cuenta y veracidad de los datos',
      body:
        `El Cliente declara que los datos del registro son veraces, actuales y completos, y se obliga a ` +
        `mantenerlos actualizados. Es el único responsable de la custodia de sus credenciales, de los ` +
        `usuarios que invite y de toda actividad realizada desde su cuenta. Notificará sin demora a Vertial ` +
        `cualquier uso no autorizado. Ante indicios razonables de fraude, suplantación o uso ilícito, ` +
        `Vertial podrá suspender la cuenta de forma cautelar, sin derecho a indemnización.`,
    },
    {
      id: '4',
      title: '4. Precio y periodo de cobro',
      body:
        `El servicio se presta por suscripción con facturación ${billingPeriodLabel}. El precio vigente ` +
        `es el del plan contratado más los complementos activados, como usuarios, locales u otros módulos, ` +
        `según las tarifas publicadas por Vertial. El cobro se realiza por anticipado entre el día 1 y el ` +
        `día 5 de cada mes de inicio de periodo, ambos inclusive, con el medio de pago facilitado por el ` +
        `Cliente, quien autoriza los cargos recurrentes en esa ventana. El Cliente mantendrá el medio de ` +
        `pago operativo y con fondos suficientes en esas fechas. Salvo norma imperativa en contrario, las ` +
        `cantidades abonadas no son reembolsables, tampoco por baja anticipada dentro de un periodo ya ` +
        `cobrado. Los precios no incluyen impuestos indirectos, que se repercutirán al tipo aplicable.`,
    },
    {
      id: '5',
      title: '5. Impago y suspensión',
      body:
        `Si un cargo resulta impagado o devuelto, Vertial podrá reintentar el cobro y requerir el pago. ` +
        `Si tras 7 días naturales desde el requerimiento no hay regularización, Vertial podrá suspender ` +
        `el acceso total o parcialmente. Si el impago continúa 30 días, podrá resolver el contrato. ` +
        `La suspensión no exime del pago de las cantidades ya devengadas. Vertial podrá repercutir los ` +
        `gastos razonables de devolución bancaria y los intereses de demora previstos en la Ley 3/2004 ` +
        `de lucha contra la morosidad.`,
    },
    {
      id: '6',
      title: '6. Modificación de condiciones y tarifas',
      body:
        `Vertial podrá modificar este contrato, las condiciones del servicio y las tarifas para adaptarlas ` +
        `a cambios legales, técnicos, de mercado o de producto. Lo comunicará al Cliente con al menos ` +
        `30 días naturales de antelación, por correo electrónico o aviso en la plataforma. Los cambios ` +
        `surtirán efecto en el siguiente periodo de facturación. Si el Cliente no los acepta, podrá ` +
        `resolver el contrato antes de esa fecha sin penalización. El uso continuado del servicio tras ` +
        `la fecha de efectos implica aceptación. Cada contrato firmado conserva copia de la versión aceptada.`,
    },
    {
      id: '7',
      title: '7. Uso aceptable',
      body:
        `El Cliente usará la plataforma de forma lícita y conforme a su finalidad. Queda prohibido vulnerar ` +
        `derechos de terceros o la normativa aplicable; acceder o intentar acceder sin autorización a ` +
        `sistemas o datos de otros clientes; descompilar, realizar ingeniería inversa o derivar el código, ` +
        `salvo en los límites legales imperativos; revender, arrendar o sublicenciar el servicio; y el abuso ` +
        `técnico, incluidos ataques, scraping masivo o elusión de límites de licencia o seguridad. El ` +
        `incumplimiento faculta a Vertial para suspender o resolver el contrato de inmediato, sin perjuicio ` +
        `de reclamar daños.`,
    },
    {
      id: '8',
      title: '8. Protección de datos',
      body:
        `Cada parte cumplirá la normativa aplicable de protección de datos, en particular el RGPD y la ` +
        `LOPDGDD. Sobre los datos personales que el Cliente introduce en la plataforma, clientes finales, ` +
        `empleados u operaciones, el Cliente es responsable del tratamiento y Vertial actúa como encargado: ` +
        `los tratará solo siguiendo las instrucciones documentadas del Cliente y con medidas técnicas y ` +
        `organizativas apropiadas. El Cliente garantiza disponer de base jurídica para esos tratamientos y ` +
        `mantendrá indemne a Vertial frente a reclamaciones derivadas de datos introducidos sin legitimación suficiente.`,
    },
    {
      id: '9',
      title: '9. Disponibilidad, soporte y copias',
      body:
        `Vertial pondrá medios razonables para mantener la disponibilidad del servicio, comunicar los ` +
        `mantenimientos programados y realizar copias de seguridad periódicas. No se garantiza disponibilidad ` +
        `ininterrumpida ni ausencia total de errores. El soporte se presta por los canales habilitados según ` +
        `el plan. El Cliente es responsable de exportar periódicamente la información que considere crítica ` +
        `con las herramientas de exportación disponibles.`,
    },
    {
      id: '10',
      title: '10. Propiedad intelectual e industrial',
      body:
        `La plataforma, el software, las marcas, los diseños, la documentación y demás contenidos de Vertial ` +
        `son titularidad exclusiva de Vertial o de sus licenciantes y están protegidos por la normativa de ` +
        `propiedad intelectual e industrial. El Cliente conserva la titularidad de los datos de negocio que ` +
        `introduzca y concede a Vertial la licencia estrictamente necesaria para alojarlos y procesarlos a ` +
        `fin de prestar el servicio. Vertial podrá usar datos agregados y anonimizados para estadística y ` +
        `mejora del producto.`,
    },
    {
      id: '11',
      title: '11. Garantías y limitación de responsabilidad',
      body:
        `El servicio se presta tal cual y según disponibilidad. En la máxima medida permitida por la ley, ` +
        `Vertial no responde de daños indirectos, lucro cesante, pérdida de negocio o de datos no imputable ` +
        `a dolo o negligencia grave, ni de decisiones del Cliente basadas en la información de la plataforma, ` +
        `ni de fallos de terceros como conectividad, proveedores cloud, pasarelas de pago o fuerza mayor. ` +
        `La responsabilidad total y acumulada de Vertial, de existir, queda limitada al importe efectivamente ` +
        `abonado por el Cliente en los 12 meses anteriores al hecho causante. Nada limita la responsabilidad ` +
        `que la ley no permita limitar.`,
    },
    {
      id: '12',
      title: '12. Indemnidad',
      body:
        `El Cliente mantendrá indemne a Vertial frente a reclamaciones de terceros derivadas del contenido ` +
        `y los datos que introduzca, del uso del servicio contrario a este contrato o a la ley, y del ` +
        `incumplimiento de sus obligaciones fiscales, laborales o de consumo frente a sus propios clientes. ` +
        `Vertial notificará la reclamación y colaborará razonablemente en la defensa.`,
    },
    {
      id: '13',
      title: '13. Duración, baja y efectos de la terminación',
      body:
        `El contrato entra en vigor con la firma electrónica y se renueva automáticamente por periodos ` +
        `iguales al de facturación. Para darse de baja, el Cliente deberá comunicarlo a Vertial por escrito, ` +
        `correo electrónico o canal habilitado en la plataforma, con un preaviso mínimo de 2 meses respecto ` +
        `a la fecha del siguiente cobro. Los periodos que se devenguen durante el preaviso se facturarán y ` +
        `abonarán con normalidad. Las bajas sin ese preaviso surtirán efecto cuando este se cumpla. ` +
        `Cualquiera de las partes podrá resolver por incumplimiento grave no subsanado en 15 días desde el ` +
        `requerimiento. A la terminación cesa el acceso. El Cliente dispondrá de 30 días para solicitar la ` +
        `exportación de sus datos; después Vertial podrá suprimirlos, salvo obligación legal de conservación.`,
    },
    {
      id: '14',
      title: '14. Firma electrónica y evidencia',
      body:
        `Las partes reconocen plena validez jurídica a la firma manuscrita digitalizada capturada en el alta, ` +
        `junto con la fecha, la versión del contrato ${VERTIAL_SERVICE_AGREEMENT_VERSION} y los datos ` +
        `identificativos del Cliente, conforme al Reglamento eIDAS y a la Ley 6/2020. Vertial conserva como ` +
        `evidencia el documento firmado, la marca temporal y los metadatos técnicos del acto de firma.`,
    },
    {
      id: '15',
      title: '15. Miscelánea',
      body:
        `Este contrato es el acuerdo íntegro entre las partes sobre el servicio y sustituye acuerdos anteriores ` +
        `sobre el mismo objeto. La nulidad de una cláusula no afecta al resto. La falta de ejercicio de un ` +
        `derecho por Vertial no supone renuncia. El Cliente no podrá ceder el contrato sin consentimiento ` +
        `escrito de Vertial. Vertial podrá cederlo a sociedades de su grupo o en caso de reestructuración ` +
        `empresarial, garantizando la continuidad del servicio.`,
    },
    {
      id: '16',
      title: '16. Ley aplicable y jurisdicción',
      body:
        `Este contrato se rige por la legislación española. Para cualquier controversia, las partes renuncian ` +
        `a cualquier otro fuero que pudiera corresponderles y se someten a los juzgados y tribunales del ` +
        `domicilio de Vertial, salvo que una norma imperativa disponga otra cosa.`,
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
