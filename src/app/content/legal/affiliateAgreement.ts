import { VERTIAL_LEGAL_ENTITY } from './vertialLegal';

/** Incrementar al cambiar el texto legal para exigir nueva aceptación. */
export const AFFILIATE_AGREEMENT_VERSION = '2026-08-31-v3';

/** Debe coincidir con DEFAULT_AFFILIATE_COMMISSION_RATE del backend. */
const AFFILIATE_BASE_COMMISSION_PERCENT = 20;

/** Meses de cobro recurrente con comisión por cada cliente referido firmado. */
export const AFFILIATE_COMMISSION_MONTHS_PER_CLIENT = 24;

export type AffiliateAgreementSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type AffiliateAgreementDocument = {
  version: string;
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: AffiliateAgreementSection[];
};

export const AFFILIATE_AGREEMENT: AffiliateAgreementDocument = {
  version: AFFILIATE_AGREEMENT_VERSION,
  title: 'Contrato del Programa de Afiliados Vertial',
  subtitle:
    'Condiciones que regulan la participación de partners comerciales en el programa de afiliados de Vertial. '
    + 'La aceptación electrónica tiene efectos de firma a efectos de acceso al panel y operativa del programa.',
  lastUpdated: '31 de agosto de 2026',
  sections: [
    {
      id: 'partes',
      title: '1. Partes',
      paragraphs: [
        `De una parte, ${VERTIAL_LEGAL_ENTITY.name}, con NIF ${VERTIAL_LEGAL_ENTITY.nif}, domicilio en ${VERTIAL_LEGAL_ENTITY.address} (en adelante, «Vertial»).`,
        'De otra parte, la persona física o jurídica identificada en la solicitud de afiliación y en el acceso al panel de afiliado (en adelante, el «Afiliado» o «Partner»).',
      ],
    },
    {
      id: 'objeto',
      title: '2. Objeto del programa',
      paragraphs: [
        'Vertial pone a disposición del Afiliado un programa de referidos comerciales para promocionar la plataforma SaaS Vertial entre terceros (clientes potenciales).',
        'El Afiliado obtendrá un código de referido (REF-XXXXXX) y herramientas de seguimiento en el panel de afiliado. Las altas de clientes en Vertial vinculadas a ese código quedarán registradas a favor del Afiliado.',
      ],
    },
    {
      id: 'comisiones',
      title: '3. Comisiones y modelo económico',
      paragraphs: [
        'Por cada cliente referido que firme y quede activo en Vertial, el Afiliado genera comisión sobre los cobros mensuales de ese cliente durante un periodo máximo de dos (2) años (veinticuatro meses de facturación recurrente), contados desde el primer cobro mensual efectivo del cliente referido, siempre que la suscripción siga activa y al corriente de pago.',
        'Si el cliente cancela, deja de pagar o su suscripción se suspende antes de completar esos veinticuatro meses, las comisiones se interrumpen desde ese momento. Si el cliente vuelve a activarse dentro del mismo periodo de dos años, Vertial podrá reanudar las comisiones solo por los meses restantes de ese periodo, salvo pacto escrito distinto.',
        'El Afiliado declara conocer y aceptar expresamente que el modelo económico del programa —incluyendo, sin carácter limitativo, porcentajes de comisión, tramos, bonificaciones, umbrales por volumen de ventas u otras condiciones de retribución— puede subir o bajar a lo largo del tiempo en función del rendimiento comercial, de la evolución del mercado, de la política comercial de Vertial o de acuerdos particulares comunicados por escrito.',
        'Dicha variabilidad forma parte esencial de las condiciones del programa. La aceptación de este contrato implica el reconocimiento consciente de esa posibilidad, sin que el Afiliado pueda reclamar un porcentaje fijo e inalterable de por vida salvo pacto escrito en sentido contrario.',
      ],
      bullets: [
        `La comisión base estándar vigente al firmar es del ${AFFILIATE_BASE_COMMISSION_PERCENT}% sobre el importe neto recurrente mensual del cliente referido y activo, durante un máximo de ${AFFILIATE_COMMISSION_MONTHS_PER_CLIENT} meses (2 años) por cada cliente firmado, salvo acuerdo distinto comunicado por escrito por Vertial.`,
        'Las comisiones se generan únicamente por clientes que se registren con el código de referido del Afiliado y mantengan una suscripción de pago activa conforme a las condiciones del plan contratado.',
        'Transcurridos los veinticuatro meses de cobros con comisión respecto de un cliente concreto, ese cliente deja de generar nuevas comisiones para el Afiliado, aunque siga siendo cliente de Vertial.',
        'Vertial liquidará las comisiones de forma mensual, previa verificación del estado de pago del cliente referido. El Afiliado debe facilitar datos de facturación válidos para recibir los pagos.',
        'Cualquier modificación del modelo o de los porcentajes será comunicada al Afiliado con antelación razonable. La continuidad en el uso del panel tras dicha comunicación implica aceptación de las nuevas condiciones, sin perjuicio del derecho del Afiliado a solicitar la baja del programa.',
        'No se abonarán comisiones por autoconsumo, registros fraudulentos, duplicados, cancelaciones inmediatas, chargebacks o clientes ya existentes en Vertial antes del referido.',
      ],
    },
    {
      id: 'obligaciones-afiliado',
      title: '4. Obligaciones del Afiliado',
      bullets: [
        'Promocionar Vertial de forma veraz, sin prometer funcionalidades, precios, descuentos, plazos o condiciones no autorizados expresamente por Vertial.',
        'Abstenerse de toda conducta de difamación, injuria, calumnia o menoscabo reputacional hacia Vertial, sus marcas, productos, equipo o clientes, tanto en público como en privado, en redes sociales, foros, medios o cualquier otro canal.',
        'No publicar, exhibir, distribuir ni compartir capturas, demos, documentación interna, datos de clientes, materiales comerciales ni cualquier contenido de Vertial sin autorización previa y expresa de Vertial.',
        'No cobrar, solicitar ni pactar con terceros «extras», honorarios, comisiones paralelas, pagos en efectivo ni contraprestaciones de cualquier clase a costa, a nombre o a espaldas de Vertial, ni presentar como cobros de Vertial cantidades que no hayan sido autorizadas por Vertial.',
        'No utilizar spam, suplantación de identidad, publicidad engañosa ni prácticas contrarias a la normativa de consumo, publicidad o protección de datos.',
        'No registrar clientes en nombre de terceros sin su consentimiento expreso.',
        'Mantener actualizados sus datos de contacto, facturación y fiscalidad en el panel o comunicándolos a Vertial.',
        'Cumplir la normativa aplicable (RGPD, LSSI-CE, normativa fiscal y mercantil) en sus actividades de promoción.',
      ],
    },
    {
      id: 'rescision-inmediata',
      title: '5. Causas de rescisión inmediata',
      paragraphs: [
        'Sin perjuicio del régimen general de duración y baja, Vertial podrá resolver de forma inmediata, total y definitiva la participación del Afiliado en el programa —incluyendo la desactivación del código de referido, el acceso al panel y el cese de nuevas comisiones— cuando concurra cualquiera de las siguientes causas, tipificadas como incumplimiento grave:',
      ],
      bullets: [
        'Difamar, injuriar o dañar de forma deliberada la reputación, imagen o marca de Vertial, o difundir información falsa o engañosa sobre el servicio o la empresa.',
        'Mostrar, publicar o difundir contenido, materiales, datos o información de Vertial sin el permiso previo y expreso de Vertial.',
        'Cobrar extras, comisiones ocultas, pagos paralelos u otras contraprestaciones a espaldas de Vertial, o utilizar el nombre, la marca o la confianza de Vertial para obtener un beneficio económico no autorizado.',
        'Cualquier otra conducta fraudulenta, de competencia desleal, de engaño a clientes o de incumplimiento grave de las obligaciones de este contrato.',
      ],
    },
    {
      id: 'independencia',
      title: '6. Relación entre las partes',
      paragraphs: [
        'El Afiliado actúa como colaborador comercial independiente. Este contrato no crea relación laboral, sociedad, agencia exclusiva ni representación mercantil salvo pacto expreso por escrito.',
        'El Afiliado es responsable de sus obligaciones fiscales, laborales y de Seguridad Social derivadas de su actividad.',
        'Únicamente Vertial fija los precios, planes y condiciones comerciales ofrecidos a los clientes finales de la plataforma, salvo autorización escrita en sentido contrario.',
      ],
    },
    {
      id: 'propiedad',
      title: '7. Propiedad intelectual y materiales',
      bullets: [
        'Vertial concede al Afiliado una licencia limitada, no exclusiva y revocable para usar logotipos, capturas y materiales comerciales facilitados únicamente para promocionar el programa.',
        'Queda prohibida la modificación de la marca, el registro de dominios similares a Vertial o la creación de materiales que puedan inducir a error sobre la titularidad del servicio.',
        'La licencia se extingue de inmediato en caso de rescisión o baja del programa. El Afiliado deberá cesar todo uso de materiales Vertial y retirar cualquier contenido no autorizado.',
      ],
    },
    {
      id: 'datos',
      title: '8. Protección de datos',
      paragraphs: [
        'El Afiliado tratará los datos personales de contactos y clientes potenciales conforme al RGPD y solo con base jurídica válida (consentimiento, interés legítimo documentado, etc.).',
        'Vertial tratará los datos del Afiliado para gestionar el programa, pagos, soporte y cumplimiento legal, conforme a su Política de Privacidad.',
      ],
    },
    {
      id: 'duracion',
      title: '9. Duración y baja',
      bullets: [
        'El contrato entra en vigor en el momento de la aceptación electrónica y permanece vigente mientras el Afiliado participe en el programa.',
        'Cualquiera de las partes puede resolver la relación comercial con preaviso de 15 días, sin perjuicio de liquidar comisiones devengadas y acreditadas por clientes activos antes de la baja ordinaria.',
        'En los supuestos del apartado 5 (rescisión inmediata), la resolución será completa y sin preaviso. Vertial podrá denegar el abono de comisiones pendientes cuando estas deriven directa o indirectamente de la conducta que motiva la rescisión, en la medida permitida por la ley.',
      ],
    },
    {
      id: 'responsabilidad',
      title: '10. Limitación de responsabilidad',
      paragraphs: [
        'Vertial no garantiza un volumen mínimo de ingresos para el Afiliado. El programa depende del esfuerzo comercial del Afiliado y de la conversión real de clientes.',
        'En la medida permitida por la ley, la responsabilidad total de Vertial frente al Afiliado por este contrato se limitará a las comisiones pendientes de pago acreditadas en el panel en el momento del hecho causante.',
        'El Afiliado mantendrá indemne a Vertial frente a reclamaciones de terceros derivadas de promociones no autorizadas, cobros indebidos, difamación, difusión de contenido sin permiso, incumplimientos legales o uso indebido de materiales.',
      ],
    },
    {
      id: 'aceptacion',
      title: '11. Aceptación electrónica',
      paragraphs: [
        'Al marcar la casilla de aceptación y pulsar «Firmar y continuar», el Afiliado declara haber leído, comprendido y aceptado íntegramente este contrato, incluida la ventana máxima de veinticuatro (24) meses de comisión por cliente firmado, la variabilidad del modelo de comisiones y las causas de rescisión inmediata.',
        'Vertial registrará la versión aceptada, fecha, hora e identificadores técnicos de la sesión a efectos probatorios.',
        'Si Vertial actualiza este contrato, podrá requerir una nueva aceptación para seguir accediendo al panel.',
      ],
    },
  ],
};
