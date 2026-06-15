export type ImportMode = 'leads' | 'clients';

export type LeadField =
  | 'name' | 'phone' | 'email' | 'source' | 'status'
  | 'vehicleInterest' | 'budget' | 'notes' | 'responsible' | 'tags' | 'ignore';

export type ClientField =
  | 'name' | 'phone' | 'email' | 'dni' | 'address' | 'city'
  | 'postalCode' | 'notes' | 'responsible' | 'tags' | 'ignore';

export type ImportField = LeadField | ClientField;

export function stripBom(value: string): string {
  return String(value || '').replace(/^\ufeff/, '').trim();
}

export function normalizeHeader(h: string): string {
  return stripBom(h)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const LEAD_ALIASES: Record<string, LeadField> = {
  nombre: 'name',
  name: 'name',
  'nombre cliente': 'name',
  cliente: 'name',
  telefono: 'phone',
  phone: 'phone',
  movil: 'phone',
  mobile: 'phone',
  tel: 'phone',
  'telefono movil': 'phone',
  'numero telefono': 'phone',
  'num telefono': 'phone',
  email: 'email',
  correo: 'email',
  'e mail': 'email',
  mail: 'email',
  fuente: 'source',
  source: 'source',
  origen: 'source',
  estado: 'status',
  status: 'status',
  vehiculo: 'vehicleInterest',
  'vehiculo de interes': 'vehicleInterest',
  interes: 'vehicleInterest',
  presupuesto: 'budget',
  budget: 'budget',
  notas: 'notes',
  notes: 'notes',
  observaciones: 'notes',
  responsable: 'responsible',
  assigned: 'responsible',
  comercial: 'responsible',
  etiquetas: 'tags',
  tags: 'tags',
  labels: 'tags',
};

const CLIENT_ALIASES: Record<string, ClientField> = {
  nombre: 'name',
  name: 'name',
  'nombre cliente': 'name',
  cliente: 'name',
  'razon social': 'name',
  telefono: 'phone',
  phone: 'phone',
  movil: 'phone',
  mobile: 'phone',
  tel: 'phone',
  'telefono movil': 'phone',
  'numero telefono': 'phone',
  'num telefono': 'phone',
  email: 'email',
  correo: 'email',
  'e mail': 'email',
  mail: 'email',
  'correo electronico': 'email',
  dni: 'dni',
  nif: 'dni',
  cif: 'dni',
  nie: 'dni',
  direccion: 'address',
  address: 'address',
  calle: 'address',
  domicilio: 'address',
  ciudad: 'city',
  city: 'city',
  poblacion: 'city',
  localidad: 'city',
  municipio: 'city',
  'codigo postal': 'postalCode',
  cp: 'postalCode',
  postalcode: 'postalCode',
  'cod postal': 'postalCode',
  notas: 'notes',
  notes: 'notes',
  observaciones: 'notes',
  responsable: 'responsible',
  comercial: 'responsible',
  etiquetas: 'tags',
  tags: 'tags',
  labels: 'tags',
};

export function autoDetectImportField(header: string, mode: ImportMode): ImportField {
  const norm = normalizeHeader(header);
  const aliases = mode === 'leads' ? LEAD_ALIASES : CLIENT_ALIASES;
  return aliases[norm] || 'ignore';
}

export function maybeResplitDelimitedRow(row: string[]): string[] | null {
  if (row.length !== 1) return null;
  const line = String(row[0] || '');
  if (!line.includes(';') && !line.includes('\t')) return null;
  const delimiter = line.includes(';') ? ';' : '\t';
  return line.split(delimiter).map((cell) => stripBom(cell));
}

export function normalizeParsedTable(raw: string[][]): { headers: string[]; rows: string[][] } | null {
  if (!raw.length) return null;

  let headerRow = raw[0].map((cell) => stripBom(String(cell ?? '')));
  let body = raw.slice(1).map((row) => row.map((cell) => String(cell ?? '').trim()));

  const resplitHeader = maybeResplitDelimitedRow(headerRow);
  if (resplitHeader) {
    headerRow = resplitHeader.map((cell) => stripBom(cell));
    body = body
      .map((row) => maybeResplitDelimitedRow(row) || row.map((cell) => stripBom(String(cell ?? ''))))
      .filter((row) => row.some((cell) => cell.trim() !== ''));
  }

  const headers = headerRow.filter((h) => h !== '');
  if (!headers.length) return null;

  const rows = body.filter((row) => row.some((cell) => String(cell || '').trim() !== ''));
  if (!rows.length) return null;

  return { headers, rows };
}

export const CLIENT_REQUIRED_FIELDS: ClientField[] = ['name', 'phone'];
export const LEAD_REQUIRED_FIELDS: LeadField[] = ['name', 'phone'];

export const REQUIRED_FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  phone: 'Teléfono',
  email: 'Email',
};
