/**
 * Contrato de prestación de servicios SaaS Vertial (plantilla de producto).
 * Redactado en defensa de Vertial: modificación unilateral con preaviso,
 * cobro anticipado no reembolsable, suspensión por impago, responsabilidad limitada.
 * Versión fijada: al firmar se guarda el snapshot + versionId. Al cambiar el texto,
 * sube VERTIAL_SERVICE_AGREEMENT_VERSION (los contratos ya firmados conservan su copia).
 * Texto de producto; revisión por abogado colegiado recomendada antes de producción.
 */

export const VERTIAL_SERVICE_AGREEMENT_VERSION = 'VERTIAL-SAAS-ES-2026-08.4';

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
  const clientLabel = party.legalName || party.tradeName || 'el Cliente';
  const nif = party.taxId || '—';
  const plan = party.planId || 'el seleccionado en el alta';
  const billingPeriodLabel =
    party.billingMode === 'annual'
      ? 'anual'
      : party.billingMode === 'monthly'
        ? 'mensual'
        : 'mensual o anual según el plan seleccionado en el alta';
  const p = VERTIAL_PROVIDER;

  return [
    {
      id: '1',
      title: '1. Partes',
      body:
        `De una parte, D. ${p.ownerName}, con DNI ${p.taxId}, operando bajo el nombre comercial ` +
        `${p.name}, con teléfono ${p.phone}, email de contacto ${p.email} y sitio web ${p.web} ` +
        `(en adelante, «Vertial» o el «Proveedor»), titular y operador de la plataforma de software ` +
        `como servicio (SaaS) Vertial. ` +
        `De otra parte, ${clientLabel}, con NIF/CIF ${nif}, domicilio en ${party.address || '—'}` +
        `${party.city ? `, ${party.city}` : ''}${party.province ? ` (${party.province})` : ''}, ` +
        `email ${party.email || '—'} y teléfono ${party.phone || '—'} (en adelante, el «Cliente»), ` +
        `representado por la persona firmante, que declara tener poder suficiente para obligar al Cliente.`,
    },
    {
      id: '2',
      title: '2. Objeto',
      body:
        `Vertial concede al Cliente una licencia de uso no exclusiva, intransferible, no sublicenciable y ` +
        `revocable de la plataforma Vertial y de los módulos asociados al plan contratado (${plan}), para la ` +
        `gestión interna de su negocio. La licencia no supone venta ni cesión del software. La funcionalidad ` +
        `concreta es la disponible en la plataforma en cada momento, pudiendo Vertial mejorarla, sustituirla o ` +
        `reorganizarla sin que ello constituya incumplimiento, siempre que no se prive al servicio de su utilidad esencial.`,
    },
    {
      id: '3',
      title: '3. Alta, cuenta y veracidad de los datos',
      body:
        `El Cliente declara que los datos facilitados en el registro son veraces, actuales y completos, y se ` +
        `obliga a mantenerlos actualizados. El Cliente es el único responsable de la custodia de sus credenciales, ` +
        `de los usuarios que invite y de toda actividad realizada desde su cuenta. Notificará sin demora a Vertial ` +
        `cualquier uso no autorizado. Vertial podrá suspender cautelarmente cuentas ante indicios razonables de ` +
        `fraude, suplantación o uso ilícito, sin que ello genere derecho a indemnización.`,
    },
    {
      id: '4',
      title: '4. Precio y periodo de cobro',
      body:
        `El servicio se presta por suscripción con periodo de facturación ${billingPeriodLabel}. El precio ` +
        `vigente es el del plan contratado más los complementos activados (usuarios, locales u otros módulos), ` +
        `conforme a las tarifas publicadas por Vertial. El cobro se efectúa por anticipado, entre el día 1 y el ` +
        `día 5 (ambos inclusive) del mes de inicio de cada periodo de facturación, mediante el medio de pago ` +
        `facilitado por el Cliente, quien autoriza expresamente los cargos recurrentes en dicha ventana de cobro. ` +
        `El Cliente se obliga a mantener el medio de pago operativo y con fondos suficientes en esas fechas. ` +
        `Salvo norma imperativa en contrario, las cantidades abonadas no son reembolsables, tampoco por baja ` +
        `anticipada dentro de un periodo ya cobrado. Los precios no incluyen impuestos indirectos, que se ` +
        `repercutirán al tipo aplicable.`,
    },
    {
      id: '5',
      title: '5. Impago y suspensión',
      body:
        `Si un cargo resulta impagado o devuelto, Vertial podrá reintentar el cobro y requerir el pago al Cliente. ` +
        `Transcurridos siete (7) días naturales desde el requerimiento sin regularización, Vertial podrá suspender ` +
        `el acceso al servicio total o parcialmente, y resolverlo si el impago persiste treinta (30) días. La ` +
        `suspensión no exime del pago de las cantidades devengadas. Vertial podrá repercutir los gastos razonables ` +
        `de devolución bancaria e intereses de demora conforme a la Ley 3/2004 de lucha contra la morosidad.`,
    },
    {
      id: '6',
      title: '6. Modificación de condiciones y tarifas',
      body:
        `Vertial podrá modificar este contrato, las condiciones del servicio y las tarifas para adaptarlos a ` +
        `cambios legales, técnicos, de mercado o de producto. Las modificaciones se comunicarán al Cliente con al ` +
        `menos treinta (30) días naturales de antelación por medios electrónicos (email o aviso en la plataforma) y ` +
        `surtirán efecto en el siguiente periodo de facturación. Si el Cliente no acepta la modificación, podrá ` +
        `resolver el contrato antes de su entrada en vigor sin penalización; el uso continuado del servicio tras la ` +
        `fecha de efectos constituye aceptación. Los contratos firmados conservan copia de la versión aceptada.`,
    },
    {
      id: '7',
      title: '7. Uso aceptable',
      body:
        `El Cliente usará la plataforma de forma lícita y conforme a su finalidad. Queda prohibido: (i) vulnerar ` +
        `derechos de terceros o normativa aplicable; (ii) el acceso o intento de acceso no autorizado a sistemas o ` +
        `datos de otros clientes; (iii) descompilar, realizar ingeniería inversa o derivar el código salvo en los ` +
        `límites legales imperativos; (iv) revender, arrendar o sublicenciar el servicio; (v) el abuso técnico ` +
        `(ataques, scraping masivo, elusión de límites de licencia o seguridad). El incumplimiento faculta a ` +
        `Vertial para suspender o resolver el contrato de inmediato, sin perjuicio de reclamar daños.`,
    },
    {
      id: '8',
      title: '8. Protección de datos',
      body:
        `Cada parte cumplirá la normativa de protección de datos aplicable (RGPD (UE) 2016/679 y LOPDGDD 3/2018). ` +
        `Respecto de los datos personales que el Cliente introduce en la plataforma (clientes finales, empleados, ` +
        `operaciones), el Cliente es responsable del tratamiento y Vertial actúa como encargado, tratándolos solo ` +
        `siguiendo sus instrucciones documentadas y aplicando medidas técnicas y organizativas apropiadas. El ` +
        `Cliente garantiza disponer de base jurídica para dichos tratamientos y mantendrá indemne a Vertial frente ` +
        `a reclamaciones derivadas de datos introducidos sin legitimación suficiente.`,
    },
    {
      id: '9',
      title: '9. Disponibilidad, soporte y copias',
      body:
        `Vertial pondrá los medios razonables para mantener la disponibilidad del servicio, comunicar los ` +
        `mantenimientos programados y realizar copias de seguridad periódicas. No se garantiza disponibilidad ` +
        `ininterrumpida ni ausencia total de errores. El soporte se presta por los canales habilitados según el ` +
        `plan. El Cliente es responsable de exportar periódicamente la información que considere crítica mediante ` +
        `las herramientas de exportación disponibles.`,
    },
    {
      id: '10',
      title: '10. Propiedad intelectual e industrial',
      body:
        `La plataforma, el software, las marcas, los diseños, la documentación y demás contenidos de Vertial son ` +
        `titularidad exclusiva de Vertial o de sus licenciantes y están protegidos por la normativa de propiedad ` +
        `intelectual e industrial. El Cliente conserva la titularidad de los datos de negocio que introduzca y ` +
        `concede a Vertial la licencia estrictamente necesaria para alojarlos y procesarlos con el fin de prestar ` +
        `el servicio. Vertial podrá usar datos agregados y anonimizados para estadística y mejora del producto.`,
    },
    {
      id: '11',
      title: '11. Garantías y limitación de responsabilidad',
      body:
        `El servicio se presta «tal cual» y «según disponibilidad». En la máxima medida permitida por la ley, ` +
        `Vertial no responde de daños indirectos, lucro cesante, pérdida de negocio o de datos no imputable a dolo ` +
        `o negligencia grave, decisiones tomadas por el Cliente con base en la información de la plataforma, ni de ` +
        `fallos causados por terceros (conectividad, proveedores cloud, pasarelas de pago, fuerza mayor). La ` +
        `responsabilidad total y acumulada de Vertial, de existir, queda limitada al importe efectivamente abonado ` +
        `por el Cliente en los doce (12) meses anteriores al hecho causante. Nada limita la responsabilidad que ` +
        `legalmente no pueda limitarse.`,
    },
    {
      id: '12',
      title: '12. Indemnidad',
      body:
        `El Cliente mantendrá indemne a Vertial frente a reclamaciones de terceros derivadas de: (i) el contenido ` +
        `y los datos introducidos por el Cliente; (ii) el uso del servicio contrario a este contrato o a la ley; ` +
        `(iii) el incumplimiento por el Cliente de sus obligaciones fiscales, laborales o de consumo frente a sus ` +
        `propios clientes. Vertial notificará la reclamación y colaborará razonablemente en la defensa.`,
    },
    {
      id: '13',
      title: '13. Duración, baja y efectos de la terminación',
      body:
        `El contrato entra en vigor con la firma electrónica y se renueva automáticamente por periodos iguales al ` +
        `de facturación. Si el Cliente desea darse de baja, deberá comunicarlo a Vertial por escrito (email o canal ` +
        `habilitado en la plataforma) con un preaviso mínimo de dos (2) meses de antelación a la fecha del ` +
        `siguiente cobro; los periodos que se devenguen durante el preaviso se facturarán y abonarán con ` +
        `normalidad. Las bajas comunicadas sin respetar el preaviso surtirán efecto una vez transcurrido este. ` +
        `Cualquiera de las partes podrá resolver por incumplimiento grave no subsanado en quince (15) días desde ` +
        `el requerimiento. A la terminación cesa el acceso; el Cliente dispondrá de treinta (30) días para ` +
        `solicitar la exportación de sus datos, transcurridos los cuales Vertial podrá suprimirlos salvo ` +
        `obligación legal de conservación.`,
    },
    {
      id: '14',
      title: '14. Firma electrónica y evidencia',
      body:
        `Las partes reconocen plena validez y eficacia jurídica a la firma manuscrita digitalizada capturada en el ` +
        `proceso de alta, junto con la fecha, la versión del contrato (${VERTIAL_SERVICE_AGREEMENT_VERSION}) y los ` +
        `datos identificativos del Cliente, conforme al Reglamento (UE) 910/2014 (eIDAS) y la Ley 6/2020. Vertial ` +
        `conserva como evidencia el documento firmado, la huella temporal y los metadatos técnicos del acto de firma.`,
    },
    {
      id: '15',
      title: '15. Miscelánea',
      body:
        `Este contrato constituye el acuerdo íntegro entre las partes respecto del servicio y sustituye acuerdos ` +
        `anteriores sobre el mismo objeto. La nulidad de una cláusula no afecta al resto. La falta de ejercicio de ` +
        `un derecho por Vertial no supone renuncia. El Cliente no podrá ceder el contrato sin consentimiento ` +
        `escrito de Vertial; Vertial podrá cederlo a sociedades de su grupo o en caso de reestructuración ` +
        `empresarial, garantizando la continuidad del servicio.`,
    },
    {
      id: '16',
      title: '16. Ley aplicable y jurisdicción',
      body:
        `Este contrato se rige por la legislación española. Para cualquier controversia, las partes, con renuncia ` +
        `expresa a cualquier otro fuero que pudiera corresponderles, se someten a los juzgados y tribunales del ` +
        `domicilio del Proveedor, salvo que una norma imperativa disponga otra cosa.`,
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
