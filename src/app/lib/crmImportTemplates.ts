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
}

export function downloadClientsExport(clients: ClientExportRow[], options?: { includeResponsible?: boolean }) {
  const rows = clients.map((c) => {
    const row: Record<string, string> = {
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
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
  XLSX.writeFile(wb, `clientes_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
