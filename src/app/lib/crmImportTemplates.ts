import * as XLSX from 'xlsx';

export function getClientTemplateHeaders(includeResponsible = true): string[] {
  const headers = [
    'Nombre', 'Teléfono', 'Email', 'DNI', 'Dirección', 'Ciudad', 'Código postal', 'Notas',
  ];
  if (includeResponsible) headers.push('Responsable');
  headers.push('Etiquetas');
  return headers;
}

/** Etiquetas sugeridas en plantilla heladería. */
export const HELADERIA_CLIENT_TAG_EXAMPLES = [
  'VIP',
  'Frecuente',
  'Encargo tarta',
  'Alérgico frutos secos',
  'Alérgico leche',
  'Empresa',
  'Evento',
] as const;

export const LEAD_TEMPLATE_HEADERS = [
  'Nombre', 'Teléfono', 'Email', 'Fuente', 'Estado', 'Vehículo de interés',
  'Presupuesto', 'Notas', 'Responsable', 'Etiquetas',
] as const;

export type ClientTemplateOptions = {
  includeResponsible?: boolean;
  /** iceCreamShop | lawyer → plantilla con ejemplos e instrucciones del vertical */
  vertical?: string | null;
};

function isHeladeriaClientVertical(vertical?: string | null): boolean {
  return String(vertical || '').trim() === 'iceCreamShop';
}

function isLawyerClientVertical(vertical?: string | null): boolean {
  return String(vertical || '').trim() === 'lawyer';
}

/** Etiquetas sugeridas en plantilla abogados / despacho. */
export const LAWYER_CLIENT_TAG_EXAMPLES = [
  'Civil',
  'Penal',
  'Laboral',
  'Mercantil',
  'Familia',
  'Administrativo',
  'VIP',
  'Empresa',
  'Iguala',
] as const;

function buildHeladeriaClientExampleRows(includeResponsible: boolean): string[][] {
  const base = (row: {
    name: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    cp: string;
    notes: string;
    tags: string;
  }) => {
    const cells = [
      row.name,
      row.phone,
      row.email,
      '',
      row.address,
      row.city,
      row.cp,
      row.notes,
    ];
    if (includeResponsible) cells.push('');
    cells.push(row.tags);
    return cells;
  };

  return [
    base({
      name: 'Ejemplo · Ana López',
      phone: '600111222',
      email: 'ana@ejemplo.com',
      address: 'C/ Helados 12',
      city: 'Barcelona',
      cp: '08001',
      notes: 'Prefiere vainilla y chocolate. Borrar fila de ejemplo.',
      tags: 'VIP, Frecuente',
    }),
    base({
      name: 'Ejemplo · Empresa Fiestas SL',
      phone: '930000111',
      email: 'pedidos@fiestas.ejemplo',
      address: 'Av. Eventos 5',
      city: 'Barcelona',
      cp: '08018',
      notes: 'Encargos tartas fin de semana',
      tags: 'Empresa, Encargo tarta',
    }),
  ];
}

function heladeriaClientInstructionLines(): string[] {
  return [
    'PLANTILLA CLIENTES — HELADERÍA',
    '',
    'HOJA A IMPORTAR: «Clientes» (la primera).',
    '',
    'COLUMNAS:',
    '  Nombre* | Teléfono* | Email | DNI | Dirección | Ciudad | Código postal | Notas | Etiquetas',
    '',
    'OBLIGATORIO: Nombre y Teléfono.',
    '',
    'ETIQUETAS útiles (separadas por coma):',
    `  ${HELADERIA_CLIENT_TAG_EXAMPLES.join(' | ')}`,
    '',
    'NOTAS: preferencias de sabor, alergias, encargos habituales, tamaño tarta…',
    '',
    'Borra las filas «Ejemplo · …» antes de importar o cámbialas por clientes reales.',
    '',
    'Tras importar verás Pedidos / Total gastado / Último pedido en la exportación Excel.',
  ];
}

function buildLawyerClientExampleRows(includeResponsible: boolean): string[][] {
  const base = (row: {
    name: string;
    phone: string;
    email: string;
    dni: string;
    address: string;
    city: string;
    cp: string;
    notes: string;
    tags: string;
  }) => {
    const cells = [
      row.name,
      row.phone,
      row.email,
      row.dni,
      row.address,
      row.city,
      row.cp,
      row.notes,
    ];
    if (includeResponsible) cells.push('');
    cells.push(row.tags);
    return cells;
  };

  return [
    base({
      name: 'Ejemplo · María García López',
      phone: '600111222',
      email: 'maria@ejemplo.com',
      dni: '12345678A',
      address: 'C/ Justicia 8',
      city: 'Madrid',
      cp: '28001',
      notes: 'Persona física · laboral. Borrar fila de ejemplo.',
      tags: 'Laboral, VIP',
    }),
    base({
      name: 'Ejemplo · Constructora Norte SL',
      phone: '910000111',
      email: 'legal@norte.ejemplo',
      dni: 'B12345678',
      address: 'Av. Empresa 22',
      city: 'Barcelona',
      cp: '08018',
      notes: 'Persona jurídica · mercantil / iguala mensual',
      tags: 'Mercantil, Empresa, Iguala',
    }),
  ];
}

function lawyerClientInstructionLines(): string[] {
  return [
    'PLANTILLA CLIENTES — ABOGADOS / DESPACHO',
    '',
    'HOJA A IMPORTAR: «Clientes» (la primera).',
    '',
    'COLUMNAS:',
    '  Nombre* | Teléfono* | Email | DNI/CIF | Dirección | Ciudad | Código postal | Notas | Etiquetas',
    '',
    'OBLIGATORIO: Nombre y Teléfono.',
    '',
    'DNI/CIF: DNI o NIE (persona física) o CIF (persona jurídica).',
    '',
    'ETIQUETAS útiles (separadas por coma):',
    `  ${LAWYER_CLIENT_TAG_EXAMPLES.join(' | ')}`,
    '',
    'NOTAS: tipo de cliente, asunto habitual, iguala, observaciones RGPD…',
    '',
    'Borra las filas «Ejemplo · …» antes de importar o cámbialas por clientes reales.',
    '',
    'Los leads de captación (consultas nuevas) se gestionan en Captación; esta plantilla es la base de clientes del despacho.',
  ];
}

export function downloadClientImportTemplate(options?: ClientTemplateOptions) {
  const includeResponsible = options?.includeResponsible !== false;
  const heladeria = isHeladeriaClientVertical(options?.vertical);
  const lawyer = isLawyerClientVertical(options?.vertical);
  const headers = getClientTemplateHeaders(includeResponsible);
  const rows: string[][] = [headers];
  if (heladeria) {
    rows.push(...buildHeladeriaClientExampleRows(includeResponsible));
  } else if (lawyer) {
    rows.push(...buildLawyerClientExampleRows(includeResponsible));
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(12, h.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes');

  if (heladeria) {
    const help = XLSX.utils.aoa_to_sheet(heladeriaClientInstructionLines().map((line) => [line]));
    help['!cols'] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, help, 'instrucciones');
  } else if (lawyer) {
    const help = XLSX.utils.aoa_to_sheet(lawyerClientInstructionLines().map((line) => [line]));
    help['!cols'] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, help, 'instrucciones');
  }

  XLSX.writeFile(
    wb,
    heladeria
      ? 'plantilla_clientes_heladeria.xlsx'
      : lawyer
        ? 'plantilla_clientes_abogados.xlsx'
        : 'plantilla_clientes.xlsx',
  );
}

function downloadCsvFile(filename: string, headers: string[]) {
  const line = headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(';');
  const blob = new Blob(['\uFEFF', `${line}\n`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadClientImportTemplateCsv(options?: ClientTemplateOptions) {
  const heladeria = isHeladeriaClientVertical(options?.vertical);
  const lawyer = isLawyerClientVertical(options?.vertical);
  downloadCsvFile(
    heladeria
      ? 'plantilla_clientes_heladeria.csv'
      : lawyer
        ? 'plantilla_clientes_abogados.csv'
        : 'plantilla_clientes.csv',
    getClientTemplateHeaders(options?.includeResponsible !== false),
  );
}

export function downloadLeadImportTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([LEAD_TEMPLATE_HEADERS.slice()]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  XLSX.writeFile(wb, 'plantilla_leads.xlsx');
}

export function downloadLeadImportTemplateCsv() {
  downloadCsvFile('plantilla_leads.csv', [...LEAD_TEMPLATE_HEADERS]);
}

export interface ClientExportRow {
  name: string;
  phone: string;
  email?: string;
  dni?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  status?: string;
  responsible?: string;
  tags?: string[];
  totalOrders?: number;
  totalSpent?: number;
  lastOrderDate?: string | null;
  loyaltyPoints?: number;
  loyaltyLevel?: string;
}

export function mapClientToExportRow(c: {
  name: string;
  phone: string;
  email?: string;
  dni?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  status?: string;
  responsible?: string;
  tags?: string[];
  stats?: { totalOrders?: number; totalSpent?: number; lastOrderDate?: string | null };
  loyalty?: { points?: number; level?: string };
}): ClientExportRow {
  return {
    name: c.name,
    phone: c.phone,
    email: c.email,
    dni: c.dni,
    address: c.address,
    city: c.city,
    postalCode: c.postalCode,
    status: c.status,
    responsible: c.responsible,
    tags: c.tags,
    totalOrders: Number(c.stats?.totalOrders || 0),
    totalSpent: Number(c.stats?.totalSpent || 0),
    lastOrderDate: c.stats?.lastOrderDate || null,
    loyaltyPoints: Number(c.loyalty?.points || 0),
    loyaltyLevel: c.loyalty?.level || '',
  };
}

export function downloadClientsExport(
  clients: ClientExportRow[],
  options?: { includeResponsible?: boolean; includeDeliveryStats?: boolean },
) {
  const rows = clients.map((c) => {
    const row: Record<string, string | number> = {
      Nombre: c.name,
      Teléfono: c.phone,
      Email: c.email || '',
      'DNI/NIF': c.dni || '',
      Calle: c.address || '',
      Ciudad: c.city || '',
      'C.P.': c.postalCode || '',
      Estado: c.status === 'active' ? 'Activo' : 'Inactivo',
    };
    if (options?.includeResponsible !== false) {
      row.Responsable = c.responsible || '';
    }
    if (c.tags?.length) row.Etiquetas = c.tags.join(', ');
    if (options?.includeDeliveryStats) {
      row.Pedidos = c.totalOrders ?? 0;
      row['Total gastado (€)'] = Number((c.totalSpent ?? 0).toFixed(2));
      row['Último pedido'] = c.lastOrderDate
        ? String(c.lastOrderDate).slice(0, 10)
        : '';
      row['Puntos fidelización'] = c.loyaltyPoints ?? 0;
      row['Nivel fidelización'] = c.loyaltyLevel || '';
    }
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
  XLSX.writeFile(wb, `clientes_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
