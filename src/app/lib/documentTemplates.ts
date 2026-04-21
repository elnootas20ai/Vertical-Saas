import { v4 as uuidv4 } from 'uuid';

export type DocumentTemplateScope = 'global' | 'sales' | 'delivery' | 'billing';

export interface DocumentTemplateVariable {
  key: string;
  label: string;
  category: string;
  example: string;
  description: string;
}

export interface DocumentTemplate {
  id: string;
  title: string;
  description: string;
  scope: DocumentTemplateScope;
  html: string;
  createdAt: string;
  updatedAt: string;
}

export const DOCUMENT_TEMPLATE_STORAGE_KEY = 'udar-document-templates';

export const DOCUMENT_TEMPLATE_SCOPE_OPTIONS: { value: DocumentTemplateScope; label: string; helper: string }[] = [
  { value: 'global', label: 'General', helper: 'Disponible para cualquier flujo de la plataforma.' },
  { value: 'sales', label: 'Ventas', helper: 'Contratos, reservas y documentación comercial.' },
  { value: 'delivery', label: 'Entregas', helper: 'Recepción, entrega y checklists.' },
  { value: 'billing', label: 'Facturación', helper: 'Facturas y documentos administrativos.' },
];

export const DOCUMENT_TEMPLATE_VARIABLES: DocumentTemplateVariable[] = [
  {
    key: '{{empresa.nombre}}',
    label: 'Nombre de la empresa',
    category: 'Empresa',
    example: 'Udar Automoción',
    description: 'Nombre comercial del concesionario o empresa.',
  },
  {
    key: '{{empresa.cif}}',
    label: 'CIF de la empresa',
    category: 'Empresa',
    example: 'B12345678',
    description: 'Identificación fiscal de la empresa.',
  },
  {
    key: '{{empresa.direccion}}',
    label: 'Dirección de la empresa',
    category: 'Empresa',
    example: 'Av. del Motor 12, Madrid',
    description: 'Dirección fiscal o del centro de trabajo.',
  },
  {
    key: '{{cliente.nombre}}',
    label: 'Nombre del cliente',
    category: 'Cliente',
    example: 'Laura Fernández Ruiz',
    description: 'Nombre completo del cliente.',
  },
  {
    key: '{{cliente.dni}}',
    label: 'DNI del cliente',
    category: 'Cliente',
    example: '12345678A',
    description: 'Documento de identidad del cliente.',
  },
  {
    key: '{{cliente.telefono}}',
    label: 'Teléfono del cliente',
    category: 'Cliente',
    example: '+34 612 345 678',
    description: 'Teléfono principal del cliente.',
  },
  {
    key: '{{vehiculo.marca}}',
    label: 'Marca del vehículo',
    category: 'Vehículo',
    example: 'Toyota',
    description: 'Marca del vehículo asociado.',
  },
  {
    key: '{{vehiculo.modelo}}',
    label: 'Modelo del vehículo',
    category: 'Vehículo',
    example: 'Corolla',
    description: 'Modelo del vehículo asociado.',
  },
  {
    key: '{{vehiculo.matricula}}',
    label: 'Matrícula',
    category: 'Vehículo',
    example: '1234ABC',
    description: 'Matrícula o identificador público del vehículo.',
  },
  {
    key: '{{venta.fecha}}',
    label: 'Fecha de venta',
    category: 'Venta',
    example: '13/03/2026',
    description: 'Fecha de formalización o del documento.',
  },
  {
    key: '{{venta.precio}}',
    label: 'Precio de venta',
    category: 'Venta',
    example: '18.950 EUR',
    description: 'Precio final de la operación.',
  },
  {
    key: '{{venta.responsable}}',
    label: 'Responsable',
    category: 'Venta',
    example: 'Marta López',
    description: 'Usuario o comercial responsable.',
  },
];

const PREVIEW_VALUES = DOCUMENT_TEMPLATE_VARIABLES.reduce<Record<string, string>>((accumulator, variable) => {
  accumulator[variable.key] = variable.example;
  return accumulator;
}, {});

function currentTimestamp() {
  return new Date().toISOString();
}

export function getDefaultTemplateHtml(title = 'Nueva plantilla') {
  return [
    '<section style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">',
    `  <h1 style="font-size: 24px; margin-bottom: 8px;">${title}</h1>`,
    '  <p style="margin: 0 0 16px;">Documento generado para <strong>{{cliente.nombre}}</strong>.</p>',
    '  <p style="margin: 0 0 12px;">Vehículo: {{vehiculo.marca}} {{vehiculo.modelo}} - {{vehiculo.matricula}}</p>',
    '  <p style="margin: 0 0 12px;">Fecha: {{venta.fecha}}</p>',
    '  <p style="margin: 0;">Añade aquí cláusulas, condiciones y bloques HTML personalizados.</p>',
    '</section>',
  ].join('\n');
}

function createSeedTemplate(
  id: string,
  title: string,
  description: string,
  scope: DocumentTemplateScope,
  html: string,
): DocumentTemplate {
  const timestamp = currentTimestamp();
  return {
    id,
    title,
    description,
    scope,
    html,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function getSeedDocumentTemplates(): DocumentTemplate[] {
  return [
    createSeedTemplate(
      'template-contract',
      'Contrato de compraventa',
      'Plantilla base para cerrar operaciones de venta con datos del cliente y vehículo.',
      'sales',
      [
        '<article style="font-family: Arial, sans-serif; color: #111827;">',
        '  <h1 style="font-size: 26px; margin-bottom: 8px;">Contrato de compraventa</h1>',
        '  <p>Entre <strong>{{empresa.nombre}}</strong>, CIF {{empresa.cif}}, y <strong>{{cliente.nombre}}</strong>, DNI {{cliente.dni}}.</p>',
        '  <p>Vehículo objeto de la venta: <strong>{{vehiculo.marca}} {{vehiculo.modelo}}</strong>, matrícula {{vehiculo.matricula}}.</p>',
        '  <p>Precio acordado: <strong>{{venta.precio}}</strong>.</p>',
        '  <p>Fecha de firma: {{venta.fecha}}.</p>',
        '</article>',
      ].join('\n'),
    ),
    createSeedTemplate(
      'template-delivery',
      'Hoja de entrega',
      'Documento para la entrega del vehículo con comprobaciones y conformidad.',
      'delivery',
      [
        '<article style="font-family: Arial, sans-serif; color: #111827;">',
        '  <h1 style="font-size: 26px; margin-bottom: 8px;">Hoja de entrega</h1>',
        '  <p>Se hace entrega a <strong>{{cliente.nombre}}</strong> del vehículo {{vehiculo.marca}} {{vehiculo.modelo}}.</p>',
        '  <ul>',
        '    <li>Matrícula: {{vehiculo.matricula}}</li>',
        '    <li>Fecha: {{venta.fecha}}</li>',
        '    <li>Responsable: {{venta.responsable}}</li>',
        '  </ul>',
        '</article>',
      ].join('\n'),
    ),
    createSeedTemplate(
      'template-invoice',
      'Factura de venta',
      'Formato base para facturación con variables de empresa, cliente y precio.',
      'billing',
      [
        '<article style="font-family: Arial, sans-serif; color: #111827;">',
        '  <h1 style="font-size: 26px; margin-bottom: 8px;">Factura de venta</h1>',
        '  <p><strong>{{empresa.nombre}}</strong> · {{empresa.cif}}</p>',
        '  <p>Cliente: {{cliente.nombre}}</p>',
        '  <p>Importe: <strong>{{venta.precio}}</strong></p>',
        '  <p>Vehículo facturado: {{vehiculo.marca}} {{vehiculo.modelo}} - {{vehiculo.matricula}}</p>',
        '</article>',
      ].join('\n'),
    ),
  ];
}

function normalizeTemplate(input: Partial<DocumentTemplate>): DocumentTemplate | null {
  if (!input.id || !input.title || !input.html) {
    return null;
  }

  const scope = DOCUMENT_TEMPLATE_SCOPE_OPTIONS.some((option) => option.value === input.scope)
    ? (input.scope as DocumentTemplateScope)
    : 'global';

  return {
    id: input.id,
    title: input.title,
    description: input.description || '',
    scope,
    html: input.html,
    createdAt: input.createdAt || currentTimestamp(),
    updatedAt: input.updatedAt || currentTimestamp(),
  };
}

export function loadDocumentTemplates(): DocumentTemplate[] {
  if (typeof window === 'undefined') {
    return getSeedDocumentTemplates();
  }

  try {
    const rawValue = window.localStorage.getItem(DOCUMENT_TEMPLATE_STORAGE_KEY);
    if (!rawValue) {
      return getSeedDocumentTemplates();
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return getSeedDocumentTemplates();
    }

    const normalized = parsed
      .map((template) => normalizeTemplate(template))
      .filter((template): template is DocumentTemplate => template !== null);

    return normalized.length ? normalized : getSeedDocumentTemplates();
  } catch {
    return getSeedDocumentTemplates();
  }
}

export function saveDocumentTemplates(templates: DocumentTemplate[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(DOCUMENT_TEMPLATE_STORAGE_KEY, JSON.stringify(templates));
}

export function createEmptyDocumentTemplate(): DocumentTemplate {
  const timestamp = currentTimestamp();
  return {
    id: `template-${uuidv4()}`,
    title: '',
    description: '',
    scope: 'global',
    html: getDefaultTemplateHtml(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function duplicateDocumentTemplate(template: DocumentTemplate): DocumentTemplate {
  const timestamp = currentTimestamp();
  return {
    ...template,
    id: `template-${uuidv4()}`,
    title: `${template.title} (Copia)`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function buildTemplatePreview(html: string) {
  return html.replace(/\{\{[^}]+\}\}/g, (match) => PREVIEW_VALUES[match] || match);
}
