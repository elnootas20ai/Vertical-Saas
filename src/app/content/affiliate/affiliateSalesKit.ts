export type AffiliateResourceItem = {
  id: string;
  title: string;
  description: string;
  type: 'guide' | 'checklist' | 'pdf';
  /** Ruta pública opcional (p. ej. /docs/affiliate/guia-venta.pdf) */
  downloadUrl?: string;
};

export type AffiliateActionStep = {
  step: number;
  title: string;
  tasks: string[];
};

export const AFFILIATE_SALES_RESOURCES: AffiliateResourceItem[] = [
  {
    id: 'plan-accion',
    title: 'Plan de acción — primeros 30 días',
    description: 'Ruta recomendada para activar tu red, registrar leads y cerrar las primeras altas.',
    type: 'guide',
  },
  {
    id: 'argumentario',
    title: 'Argumentario de venta Vertial',
    description: 'Mensajes clave, objeciones frecuentes y respuestas para presentar la plataforma.',
    type: 'guide',
  },
  {
    id: 'checklist-cierre',
    title: 'Checklist de cierre',
    description: 'Pasos antes de enviar el enlace de registro al cliente.',
    type: 'checklist',
  },
  {
    id: 'guia-panel',
    title: 'Guía del panel de afiliado (PDF)',
    description: 'Resumen imprimible del panel, códigos y seguimiento de comisiones.',
    type: 'pdf',
    downloadUrl: '/docs/affiliate/guia-panel-afiliado.pdf',
  },
  {
    id: 'one-pager',
    title: 'One-pager comercial (PDF)',
    description: 'Ficha de una página para enviar por WhatsApp o email a prospectos.',
    type: 'pdf',
    downloadUrl: '/docs/affiliate/one-pager-vertial.pdf',
  },
];

export const AFFILIATE_ACTION_PLAN: AffiliateActionStep[] = [
  {
    step: 1,
    title: 'Semana 1 — Activación',
    tasks: [
      'Firma el contrato de afiliado y revisa tu comisión en el panel.',
      'Copia tu código REF y el enlace de registro desde «Referir».',
      'Identifica 10 contactos de tu red (talleres, gimnasios, concesionarios, etc.).',
      'Registra los primeros leads en «Mis clientes» con notas de seguimiento.',
    ],
  },
  {
    step: 2,
    title: 'Semana 2 — Demostración',
    tasks: [
      'Agenda 3 llamadas cortas usando el argumentario de venta.',
      'Envía el enlace `/auth/register?ref=TUCODIGO` solo a contactos interesados.',
      'Marca en el pipeline cuando hayas enviado email o demo.',
    ],
  },
  {
    step: 3,
    title: 'Semana 3 — Seguimiento',
    tasks: [
      'Revisa «Altas referidas» para ver quién se registró en Vertial.',
      'Haz follow-up a leads sin registro: ofrece ayuda con el alta guiada.',
      'Documenta objeciones para mejorar tu pitch.',
    ],
  },
  {
    step: 4,
    title: 'Semana 4 — Escala',
    tasks: [
      'Duplica lo que funcionó: sector, mensaje o canal.',
      'Pide referidos a clientes ya registrados con tu código.',
      'Consulta comisiones pendientes y confirma datos de facturación con Vertial.',
    ],
  },
];

export const AFFILIATE_SALES_PITCH = {
  headline: 'Vertial centraliza tu negocio en un solo SaaS',
  bullets: [
    'TPV, stock, equipos, documentación y vertical específica (automoción, fitness, hostelería…).',
    'Alta rápida, trial y planes escalables según el tamaño del negocio.',
    'Soporte y actualizaciones incluidas — tú refieres, Vertial opera la plataforma.',
  ],
  objections: [
    {
      q: '«Ya tengo otro software»',
      a: 'Vertial unifica operativa, ventas y documentación. Muchos clientes migran por ahorro de tiempo y menos herramientas sueltas.',
    },
    {
      q: '«Es caro»',
      a: 'Compara el coste frente a horas perdidas en Excel, WhatsApp y programas desconectados. Hay trial para probar sin riesgo.',
    },
    {
      q: '«No somos técnicos»',
      a: 'Está pensado para equipos operativos, no para informáticos. El onboarding guiado reduce la curva de aprendizaje.',
    },
  ],
};
