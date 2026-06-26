import * as XLSX from 'xlsx';

export function getClientTemplateHeaders(includeResponsible = true): string[] {
  const headers = [
    'Nombre', 'Teléfono', 'Email', 'DNI', 'Dirección', 'Ciudad', 'Código postal', 'Notas',
  ];
  if (includeResponsible) headers.push('Responsable');
  headers.push('Etiquetas');
  return headers;
}

export const LEAD_TEMPLATE_HEADERS = [
  'Nombre', 'Teléfono', 'Email', 'Fuente', 'Estado', 'Vehículo de interés',
  'Presupuesto', 'Notas', 'Responsable', 'Etiquetas',
] as const;

export function downloadClientImportTemplate(options?: { includeResponsible?: boolean }) {
  const headers = getClientTemplateHeaders(options?.includeResponsible !== false);
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
  XLSX.writeFile(wb, 'plantilla_clientes.xlsx');
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

export function downloadClientImportTemplateCsv(options?: { includeResponsible?: boolean }) {
  downloadCsvFile('plantilla_clientes.csv', getClientTemplateHeaders(options?.includeResponsible !== false));
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
