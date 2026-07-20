export const VERTIAL_LEGAL_ENTITY = {
  name: 'Vertial S.L.',
  nif: 'B22653737',
  address: 'Calle Coso 67-75, 3ºC, 50001 Zaragoza, España',
  email: 'soporte@vertialapp.com',
  phone: '+34 647 77 98 12',
  website: 'vertialapp.com',
  registry: 'Registro Mercantil de Zaragoza (datos de inscripción disponibles bajo solicitud).',
  dpoEmail: 'privacidad@vertialapp.com',
} as const;

export type LegalDocId = 'aviso-legal' | 'terminos' | 'privacidad' | 'cookies';

export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDocument = {
  id: LegalDocId;
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: LegalSection[];
};

const LAST_UPDATED = '20 de julio de 2026';

export const LEGAL_DOCUMENTS: Record<LegalDocId, LegalDocument> = {
  'aviso-legal': {
    id: 'aviso-legal',
    title: 'Aviso legal',
    subtitle: 'Información del titular del sitio y del servicio conforme a la LSSI-CE.',
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        id: 'titular',
        title: '1. Titular del sitio web',
        paragraphs: [
          `En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa que el titular de este sitio es ${VERTIAL_LEGAL_ENTITY.name}, con NIF ${VERTIAL_LEGAL_ENTITY.nif}, domicilio en ${VERTIAL_LEGAL_ENTITY.address}.`,
          `Correo de contacto: ${VERTIAL_LEGAL_ENTITY.email} · Teléfono: ${VERTIAL_LEGAL_ENTITY.phone}.`,
        ],
      },
      {
        id: 'objeto',
        title: '2. Objeto',
        paragraphs: [
          'El presente sitio web facilita el acceso a Vertial, plataforma de software en la nube (SaaS) para la gestión operativa de negocios (punto de venta, catálogo, equipos, documentación y módulos según vertical contratada).',
          'El uso del sitio y del servicio implica la aceptación de este aviso legal, de los Términos y Condiciones, de la Política de Privacidad y de la Política de Cookies.',
        ],
      },
      {
        id: 'uso',
        title: '3. Condiciones de uso del sitio',
        bullets: [
          'El usuario se compromete a hacer un uso diligente, lícito y conforme a la buena fe.',
          'Queda prohibido introducir virus, intentar acceso no autorizado o usar el servicio para fines ilícitos.',
          'Vertial podrá suspender cuentas que incumplan estas normas o supongan riesgo para la plataforma o terceros.',
        ],
      },
      {
        id: 'propiedad',
        title: '4. Propiedad intelectual e industrial',
        paragraphs: [
          'Los contenidos, diseños, código, marcas y signos distintivos son titularidad de Vertial o de sus licenciantes. Queda prohibida su reproducción o explotación sin autorización expresa.',
          'Los datos y contenidos que el cliente introduce en la plataforma son de su titularidad; el cliente concede a Vertial las licencias necesarias para alojarlos, procesarlos y prestar el servicio.',
        ],
      },
      {
        id: 'responsabilidad',
        title: '5. Responsabilidad',
        paragraphs: [
          'Vertial no se hace responsable del uso indebido del servicio por parte de los usuarios ni de la veracidad de los datos aportados por ellos.',
          'El servicio se presta con alta disponibilidad; no obstante, pueden producirse interrupciones por mantenimiento, actualizaciones o causas de fuerza mayor. Se informará cuando sea razonablemente posible.',
        ],
      },
      {
        id: 'enlaces',
        title: '6. Enlaces y legislación aplicable',
        paragraphs: [
          'Los enlaces a sitios de terceros no implican responsabilidad sobre sus contenidos. La relación con Vertial se rige por la legislación española; para conflictos, los tribunales de Zaragoza serán competentes salvo norma imperativa en materia de consumidores.',
        ],
      },
    ],
  },
  terminos: {
    id: 'terminos',
    title: 'Términos y condiciones del servicio',
    subtitle: 'Condiciones de contratación y uso de la plataforma Vertial (SaaS).',
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        id: 'partes',
        title: '1. Identificación y aceptación',
        paragraphs: [
          `Las presentes condiciones regulan el acceso y uso de la plataforma Vertial, prestada por ${VERTIAL_LEGAL_ENTITY.name} (${VERTIAL_LEGAL_ENTITY.nif}).`,
          'Al registrarse, contratar un plan o utilizar el servicio, el cliente declara ser mayor de edad, tener capacidad para contratar y aceptar íntegramente estos términos.',
        ],
      },
      {
        id: 'servicio',
        title: '2. Descripción del servicio',
        bullets: [
          'Software de gestión en la nube según el plan y vertical contratados (empresa, tiendas/PDV, marcas, catálogo, TPV, RRHH, etc.).',
          'Funcionalidades, límites (usuarios, tiendas, marcas) y módulos dependen del plan activo y de las ampliaciones contratadas.',
          'Vertial podrá actualizar el servicio para mejoras, seguridad o cumplimiento legal, manteniendo la funcionalidad esencial del plan contratado.',
        ],
      },
      {
        id: 'cuenta',
        title: '3. Registro y cuenta',
        bullets: [
          'El usuario debe facilitar datos veraces y mantener sus credenciales en secreto.',
          'Es responsable de las actividades realizadas bajo su cuenta y de los usuarios que invite a su organización.',
          'Vertial puede solicitar verificación de email o datos de facturación antes de activar determinadas funciones.',
        ],
      },
      {
        id: 'planes',
        title: '4. Planes, prueba y facturación',
        paragraphs: [
          'Pueden existir periodos de prueba gratuitos según la oferta vigente. Al finalizar la prueba, el acceso puede limitarse hasta la contratación de un plan de pago.',
          'Los precios, periodicidad y métodos de pago se muestran en el proceso de contratación. El impago puede conllevar suspensión del servicio tras aviso razonable.',
          'Salvo indicación contraria, las suscripciones se renuevan automáticamente hasta su cancelación desde el área de facturación o por solicitud a soporte.',
        ],
      },
      {
        id: 'datos-cliente',
        title: '5. Datos del cliente',
        paragraphs: [
          'El cliente es responsable de los datos que introduce (clientes finales, empleados, catálogo, ventas, etc.) y de cumplir la normativa aplicable (incluido RGPD si trata datos personales de terceros).',
          'Vertial actúa como encargado del tratamiento respecto a los datos personales que el cliente instruye procesar en la plataforma; el acuerdo de encargo de tratamiento forma parte de la relación comercial y puede solicitarse por escrito.',
        ],
      },
      {
        id: 'uso-aceptable',
        title: '6. Uso aceptable',
        bullets: [
          'No utilizar el servicio para spam, malware, suplantación o actividades ilegales.',
          'No realizar ingeniería inversa ni intentar eludir límites técnicos o de licencia.',
          'No sobrecargar la infraestructura de forma intencionada (abuso de API, scraping masivo no autorizado).',
        ],
      },
      {
        id: 'soporte',
        title: '7. Soporte y nivel de servicio',
        paragraphs: [
          `El soporte se presta por los canales indicados en la plataforma (email ${VERTIAL_LEGAL_ENTITY.email}, documentación in-app). Los tiempos de respuesta pueden variar según el plan.`,
          'No se garantiza un resultado concreto de negocio (ventas, beneficios); el servicio es una herramienta de gestión.',
        ],
      },
      {
        id: 'resolucion',
        title: '8. Duración, suspensión y resolución',
        bullets: [
          'El cliente puede cancelar su suscripción en cualquier momento; el acceso se mantiene hasta el fin del periodo pagado salvo incumplimiento grave.',
          'Vertial puede resolver el contrato por incumplimiento material o impago, previa comunicación cuando sea posible.',
          'Tras la baja, el cliente puede solicitar exportación de sus datos en un plazo razonable; después se procederá a su eliminación según la política de conservación.',
        ],
      },
      {
        id: 'limitacion',
        title: '9. Limitación de responsabilidad',
        paragraphs: [
          'En la medida permitida por la ley, la responsabilidad de Vertial se limita al importe abonado por el cliente en los doce meses anteriores al hecho que origine la reclamación.',
          'No se responde de daños indirectos, lucro cesante o pérdida de datos por causas ajenas a un incumplimiento grave de Vertial.',
        ],
      },
      {
        id: 'ley',
        title: '10. Ley aplicable y jurisdicción',
        paragraphs: [
          'Estas condiciones se rigen por la ley española. Salvo normas imperativas de protección de consumidores, las partes se someten a los juzgados y tribunales de Zaragoza.',
        ],
      },
    ],
  },
  privacidad: {
    id: 'privacidad',
    title: 'Política de privacidad',
    subtitle: 'Información sobre el tratamiento de datos personales (RGPD y LOPDGDD).',
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        id: 'responsable',
        title: '1. Responsable del tratamiento',
        paragraphs: [
          `Responsable: ${VERTIAL_LEGAL_ENTITY.name}, NIF ${VERTIAL_LEGAL_ENTITY.nif}, ${VERTIAL_LEGAL_ENTITY.address}.`,
          `Contacto privacidad: ${VERTIAL_LEGAL_ENTITY.dpoEmail} (o ${VERTIAL_LEGAL_ENTITY.email} si no dispone de DPO dedicado).`,
        ],
      },
      {
        id: 'alcance',
        title: '2. Ámbito',
        paragraphs: [
          'Esta política aplica al tratamiento de datos de usuarios registrados, contactos comerciales y navegantes del sitio web y aplicación Vertial.',
          'Cuando el cliente utiliza Vertial para gestionar datos de sus propios clientes o empleados, el cliente es responsable del tratamiento y Vertial actúa como encargado según las instrucciones del cliente.',
        ],
      },
      {
        id: 'datos',
        title: '3. Datos que tratamos',
        bullets: [
          'Identificación y contacto: nombre, email, teléfono, empresa.',
          'Credenciales y seguridad: contraseña (almacenada de forma segura), registros de acceso, IP aproximada.',
          'Facturación: datos fiscales, historial de suscripción y pagos (los datos de tarjeta los procesa el proveedor de pagos; en la app iOS no se cobra la suscripción de Vertial).',
          'Uso del servicio: configuración, tiendas, marcas, catálogo, operaciones y logs técnicos necesarios para el funcionamiento.',
          'App móvil (iOS/Android): fotos o imágenes que captures o adjuntes (p. ej. documentos, vehículos, TPV); ubicación precisa solo cuando usas funciones que la requieren (p. ej. fichaje geolocalizado), mientras la app está en uso; identificadores de dispositivo o tokens de notificaciones push para avisos operativos; acceso a la red local del dispositivo solo para conectar impresoras térmicas WiFi en el establecimiento.',
        ],
      },
      {
        id: 'finalidades',
        title: '4. Finalidades y bases jurídicas',
        bullets: [
          'Prestación del servicio contratado — ejecución de contrato (art. 6.1.b RGPD).',
          'Gestión de la cuenta, soporte y comunicaciones operativas — contrato / interés legítimo.',
          'Facturación y obligaciones legales — cumplimiento legal (art. 6.1.c).',
          'Mejora del producto y seguridad (analítica agregada, logs) — interés legítimo, con salvaguardas.',
          'Comunicaciones comerciales sobre Vertial — consentimiento o interés legítimo según el caso; baja en cualquier momento.',
          'Funciones de la app móvil (fichaje, cámara, push, impresora LAN) — prestación del servicio / interés legítimo técnico; no usamos estos datos para publicidad ni seguimiento entre apps de terceros.',
        ],
      },
      {
        id: 'conservacion',
        title: '5. Plazo de conservación',
        bullets: [
          'Datos de cuenta: mientras dure la relación y después durante los plazos legales (facturación, reclamaciones).',
          'Logs de seguridad: plazo limitado (habitualmente 12 meses salvo investigación de incidentes).',
          'Datos de encargo (datos del cliente en la plataforma): según instrucciones del cliente y contrato de encargo.',
        ],
      },
      {
        id: 'destinatarios',
        title: '6. Destinatarios y transferencias',
        paragraphs: [
          'Podemos compartir datos con proveedores que nos prestan servicios (hosting en la UE/EEE, email transaccional, pasarela de pago, envío de notificaciones push, soporte), bajo contrato que exige confidencialidad y tratamiento conforme al RGPD.',
          'En la app iOS, Apple puede recibir tokens de dispositivo necesarios para entregar notificaciones push (APNs). El inicio de sesión con Apple se rige además por las condiciones de Apple.',
          'No vendemos datos personales ni los usamos para seguimiento publicitario entre apps o sitios de terceros (App Tracking = no). Si hubiera transferencias fuera del EEE, se aplicarán garantías adecuadas (cláusulas tipo, decisiones de adecuación).',
        ],
      },
      {
        id: 'derechos',
        title: '7. Derechos de las personas',
        bullets: [
          'Acceso, rectificación, supresión, oposición, limitación, portabilidad y retirada del consentimiento.',
          'Reclamación ante la AEPD (www.aepd.es) si considera que el tratamiento no se ajusta a la normativa.',
          `Para ejercer derechos: ${VERTIAL_LEGAL_ENTITY.dpoEmail}, indicando identidad y derecho solicitado.`,
        ],
      },
      {
        id: 'menores',
        title: '8. Menores y seguridad',
        paragraphs: [
          'El servicio no está dirigido a menores de 14 años. Implementamos medidas técnicas y organizativas razonables para proteger los datos (cifrado en tránsito, control de acceso, copias de seguridad).',
        ],
      },
    ],
  },
  cookies: {
    id: 'cookies',
    title: 'Política de cookies',
    subtitle: 'Uso de cookies y tecnologías similares en vertialapp.com y la aplicación.',
    lastUpdated: LAST_UPDATED,
    sections: [
      {
        id: 'que-son',
        title: '1. ¿Qué son las cookies?',
        paragraphs: [
          'Son pequeños archivos que se almacenan en su dispositivo al visitar un sitio web. Permiten recordar preferencias, mantener la sesión iniciada o medir el uso del sitio.',
        ],
      },
      {
        id: 'tipos',
        title: '2. Cookies que utilizamos',
        bullets: [
          'Necesarias (técnicas): imprescindibles para login, seguridad y preferencias básicas. No requieren consentimiento.',
          'Preferencias: recuerdan idioma, tema u opciones de interfaz (consentimiento o configuración).',
          'Analíticas: estadísticas de uso agregadas para mejorar el producto (consentimiento).',
          'Marketing: solo si se activan campañas o integraciones que las utilicen (consentimiento).',
        ],
      },
      {
        id: 'gestion',
        title: '3. Gestión del consentimiento',
        paragraphs: [
          'Al entrar por primera vez puede aceptar, rechazar o configurar cookies no necesarias desde el banner inferior.',
          'Puede cambiar su elección en cualquier momento borrando cookies del navegador o desde la configuración del banner si vuelve a mostrarse.',
        ],
      },
      {
        id: 'terceros',
        title: '4. Cookies de terceros',
        paragraphs: [
          'Si utiliza inicio de sesión con Google u otros proveedores, pueden aplicarse sus políticas. Las pasarelas de pago pueden usar cookies propias en sus dominios.',
        ],
      },
      {
        id: 'mas-info',
        title: '5. Más información',
        paragraphs: [
          `Para dudas sobre privacidad y cookies: ${VERTIAL_LEGAL_ENTITY.email}. Consulte también la Política de Privacidad.`,
        ],
      },
    ],
  },
};

export const LEGAL_DOC_LIST: LegalDocument[] = [
  LEGAL_DOCUMENTS['aviso-legal'],
  LEGAL_DOCUMENTS.terminos,
  LEGAL_DOCUMENTS.privacidad,
  LEGAL_DOCUMENTS.cookies,
];

export function getLegalDoc(id: string | undefined): LegalDocument | null {
  if (!id || !(id in LEGAL_DOCUMENTS)) return null;
  return LEGAL_DOCUMENTS[id as LegalDocId];
}

export const REGISTER_LEGAL_SUMMARY = [
  'Términos y condiciones del servicio SaaS Vertial (planes, uso de la cuenta y facturación).',
  'Política de privacidad y tratamiento de datos según el RGPD (incl. datos que gestiones de tus clientes en la plataforma).',
  'Aviso legal del titular del sitio (Vertial S.L.).',
  'Uso de cookies según la Política de cookies (puedes configurarlas en el banner).',
] as const;
