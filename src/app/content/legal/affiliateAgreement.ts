import { VERTIAL_LEGAL_ENTITY } from './vertialLegal';

/** Incrementar al cambiar el texto legal para exigir nueva aceptación. */
export const AFFILIATE_AGREEMENT_VERSION = '2026-07-06-v1';

/** Debe coincidir con DEFAULT_AFFILIATE_COMMISSION_RATE del backend. */
const AFFILIATE_BASE_COMMISSION_PERCENT = 20;

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
  lastUpdated: '6 de julio de 2026',
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
      title: '3. Comisiones',
      bullets: [
        `La comisión base estándar es del ${AFFILIATE_BASE_COMMISSION_PERCENT}% sobre el importe neto recurrente mensual del cliente referido y activo, salvo acuerdo distinto comunicado por escrito por Vertial.`,
        'Las comisiones se generan únicamente por clientes que se registren con el código de referido del Afiliado y mantengan una suscripción de pago activa conforme a las condiciones del plan contratado.',
        'Vertial liquidará las comisiones de forma mensual, previa verificación del estado de pago del cliente referido. El Afiliado debe facilitar datos de facturación válidos para recibir los pagos.',
        'Vertial se reserva el derecho de ajustar porcentajes, bonificaciones o condiciones especiales mediante comunicación al Afiliado con antelación razonable.',
        'No se abonarán comisiones por autoconsumo, registros fraudulentos, duplicados, cancelaciones inmediatas, chargebacks o clientes ya existentes en Vertial antes del referido.',
      ],
    },
    {
      id: 'obligaciones-afiliado',
      title: '4. Obligaciones del Afiliado',
      bullets: [
        'Promocionar Vertial de forma veraz, sin prometer funcionalidades, precios o plazos no autorizados por Vertial.',
        'No utilizar spam, suplantación de identidad, publicidad engañosa ni prácticas contrarias a la normativa de consumo, publicidad o protección de datos.',
        'No registrar clientes en nombre de terceros sin su consentimiento expreso.',
        'Mantener actualizados sus datos de contacto, facturación y fiscalidad en el panel o comunicándolos a Vertial.',
        'Cumplir la normativa aplicable (RGPD, LSSI-CE, normativa fiscal y mercantil) en sus actividades de promoción.',
      ],
    },
    {
      id: 'independencia',
      title: '5. Relación entre las partes',
      paragraphs: [
        'El Afiliado actúa como colaborador comercial independiente. Este contrato no crea relación laboral, sociedad, agencia exclusiva ni representación mercantil salvo pacto expreso por escrito.',
        'El Afiliado es responsable de sus obligaciones fiscales, laborales y de Seguridad Social derivadas de su actividad.',
      ],
    },
    {
      id: 'propiedad',
      title: '6. Propiedad intelectual y materiales',
      bullets: [
        'Vertial concede al Afiliado una licencia limitada, no exclusiva y revocable para usar logotipos, capturas y materiales comerciales facilitados únicamente para promocionar el programa.',
        'Queda prohibida la modificación de la marca, el registro de dominios similares a Vertial o la creación de materiales que puedan inducir a error sobre la titularidad del servicio.',
      ],
    },
    {
      id: 'datos',
      title: '7. Protección de datos',
      paragraphs: [
        'El Afiliado tratará los datos personales de contactos y clientes potenciales conforme al RGPD y solo con base jurídica válida (consentimiento, interés legítimo documentado, etc.).',
        'Vertial tratará los datos del Afiliado para gestionar el programa, pagos, soporte y cumplimiento legal, conforme a su Política de Privacidad.',
      ],
    },
    {
      id: 'duracion',
      title: '8. Duración y baja',
      bullets: [
        'El contrato entra en vigor en el momento de la aceptación electrónica y permanece vigente mientras el Afiliado participe en el programa.',
        'Cualquiera de las partes puede resolver la relación comercial con preaviso de 15 días, sin perjuicio de liquidar comisiones devengadas por clientes activos antes de la baja.',
        'Vertial podrá suspender o resolver de forma inmediata ante fraude, incumplimiento grave, daño reputacional o impago de obligaciones del Afiliado.',
      ],
    },
    {
      id: 'responsabilidad',
      title: '9. Limitación de responsabilidad',
      paragraphs: [
        'Vertial no garantiza un volumen mínimo de ingresos para el Afiliado. El programa depende del esfuerzo comercial del Afiliado y de la conversión real de clientes.',
        'En la medida permitida por la ley, la responsabilidad total de Vertial frente al Afiliado por este contrato se limitará a las comisiones pendientes de pago acreditadas en el panel en el momento del hecho causante.',
        'El Afiliado mantendrá indemne a Vertial frente a reclamaciones de terceros derivadas de promociones no autorizadas, incumplimientos legales o uso indebido de materiales.',
      ],
    },
    {
      id: 'aceptacion',
      title: '10. Aceptación electrónica',
      paragraphs: [
        'Al marcar la casilla de aceptación y pulsar «Firmar y continuar», el Afiliado declara haber leído, comprendido y aceptado íntegramente este contrato.',
        'Vertial registrará la versión aceptada, fecha, hora e identificadores técnicos de la sesión a efectos probatorios.',
        'Si Vertial actualiza este contrato, podrá requerir una nueva aceptación para seguir accediendo al panel.',
      ],
    },
  ],
};
