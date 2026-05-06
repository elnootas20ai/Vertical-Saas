import { getAuthHeaders } from './authApi';
import { getApiBase } from './apiBase';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


const API_BASE = getApiBase();

function normalizeUserId(userId: string): string {
  const value = String(userId || '').trim();
  return value.startsWith('account:') ? value.slice('account:'.length) : value;
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...getCouchHeaders(),
      ...(init?.headers || {}),
    },
    ...init,
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error || 'Error inesperado en construction API');
  }
  return payload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClientDoc {
  id: string;
  nombre: string;
  tipo: string;
  url: string;
  fecha: string;
  ocrData: OcrResult | null;
  fileBase64: string;
  fileMimeType: string;
}

export interface OcrResult {
  documentType: string | null;
  documentTypeLabel: string | null;
  emitter: string | null;
  receiver: string | null;
  date: string | null;
  documentNumber: string | null;
  subtotal: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  total: number | null;
  currency: string | null;
  lines: { description: string; quantity: number | null; unitPrice: number | null; total: number | null }[];
  notes: string | null;
}

export interface ClienteDireccion {
  id: string;
  etiqueta: string;
  tipo: 'obra' | 'domicilio' | 'fiscal' | 'correspondencia' | 'otro';
  calle: string;
  numero: string;
  piso: string;
  codigoPostal: string;
  ciudad: string;
  provincia: string;
  pais: string;
  esPrincipal: boolean;
  coordenadas: { lat: number; lng: number } | null;
}

export interface ClienteContacto {
  id: string;
  nombre: string;
  cargo: string;
  telefono: string;
  email: string;
  notas: string;
  esPrincipal: boolean;
}

export interface ClienteInmueble {
  id: string;
  tipo: 'vivienda' | 'local_comercial' | 'nave_industrial' | 'terreno' | 'garaje' | 'oficina' | 'edificio' | 'otro';
  descripcion: string;
  direccion: string;
  referenciaCatastral: string;
  superficie: number;
  obraId: string;
  obraNombre: string;
  estado: 'planificado' | 'en_obra' | 'finalizado' | 'entregado';
  notas: string;
}

export interface ClienteNota {
  id: string;
  texto: string;
  tipo: 'llamada' | 'visita' | 'email' | 'reunion' | 'nota_interna' | 'cambio_estado' | 'otro';
  autor: string;
  autorNombre: string;
  fecha: string;
  obraId: string;
  obraNombre: string;
  adjuntos: { nombre: string; url: string; mimeType: string }[];
}

export interface ClienteHistorialEntry {
  id: string;
  tipo: 'nota' | 'obra_creada' | 'obra_estado' | 'presupuesto_enviado' | 'presupuesto_aceptado' | 'presupuesto_rechazado' | 'pago_registrado' | 'estado_comercial' | 'documento_subido';
  fecha: string;
  titulo: string;
  detalle: string;
  entidadId: string;
  entidadTipo: string;
  autor: string;
}

export interface ClienteResumenEconomico {
  totalPresupuestado: number;
  totalAceptado: number;
  totalCobrado: number;
  totalPendienteCobro: number;
  numObrasActivas: number;
  numObrasFinalizadas: number;
  numPresupuestosPendientes: number;
}

export interface ClienteDetalle {
  client: ConstructionClient;
  obras: Partial<ConstructionProject>[];
  presupuestos: Partial<ConstructionBudget>[];
  resumenEconomico: ClienteResumenEconomico;
  ultimasInteracciones: ClienteHistorialEntry[];
  alertas: ConstructionAlert[];
}

export interface ClienteDuplicado {
  client: ConstructionClient;
  matchField: 'cif' | 'telefono' | 'email' | 'nombre';
  matchScore: number;
}

export type TipoCliente = 'particular' | 'empresa' | 'autonomo' | 'comunidad_propietarios' | 'promotora' | 'administracion_publica';
export type EstadoComercial = 'prospecto' | 'contactado' | 'presupuestado' | 'en_obra' | 'fidelizado' | 'inactivo' | 'perdido';

export interface ConstructionClient {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  nombre: string;
  cif: string;
  telefono: string;
  email: string;
  direccion: string;
  documentos: ClientDoc[];
  notas: string;

  tipoCliente: TipoCliente;
  razonSocial: string;
  direccionFiscal: string;
  ciudadFiscal: string;
  cpFiscal: string;
  provinciaFiscal: string;
  paisFiscal: string;
  regimenIva: string;

  estadoComercial: EstadoComercial;
  responsableId: string;
  responsableNombre: string;
  origenCliente: string;
  referidoPor: string;

  direcciones: ClienteDireccion[];
  contactos: ClienteContacto[];
  inmuebles: ClienteInmueble[];
  notasEstructuradas: ClienteNota[];

  tags: string[];
  crmClientId: string;
  crmLeadId: string;

  consentimientos: {
    proteccionDatos: boolean;
    comunicacionesComerciales: boolean;
    cesionTerceros: boolean;
  };

  createdAt: string;
  updatedAt: string;
}

export interface ConstructionGuild {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  nombre: string;
  tipo: string;
  contacto: string;
  telefono: string;
  email: string;
  descripcion: string;
  precioMateriales: number;
  precioManoObra: number;
  precioEstructural: number;
  precioTotal: number;
  tarifaHora: number;
  margenDefecto: number;
  totalPartidas: number;
  preciosActualizados: string;
  esPersonalizado: boolean;
  color: string;
  icono: string;
  notas: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConstructionUnit {
  key: string;
  label: string;
}

export interface ConstructionConfig {
  projectTypes: string[];
  guilds: string[];
  guildLabels: Record<string, string>;
  units: ConstructionUnit[];
}

export interface PredefinedPartidaMaterial {
  catalogItemId: string;
  nombre: string;
  cantidadPorUnidad: number;
  unidad: string;
}

export interface PredefinedPartidaPrecioHistorial {
  fecha: string;
  precioMateriales: number;
  precioManoObra: number;
  precioEstructural: number;
  precioUnitario: number;
  modificadoPor: string;
  modificadoPorNombre: string;
}

export interface ConstructionPredefinedPartida {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  gremio: string;
  categoria: string;
  unidad: string;
  precioMateriales: number;
  precioManoObra: number;
  precioEstructural: number;
  precioUnitario: number;
  materialesVinculados: PredefinedPartidaMaterial[];
  precioActualizado: string;
  precioValidadoPor: string;
  precioValidadoPorNombre: string;
  historialPrecios: PredefinedPartidaPrecioHistorial[];
  activa: boolean;
  orden: number;
  notas: string;
  createdAt: string;
  updatedAt: string;
}

export interface PartidaAlert {
  id: string;
  type: 'partida_sin_precio' | 'gremio_sin_partidas' | 'precio_desactualizado' | 'plantilla_incompleta';
  severity: 'info' | 'warning';
  label: string;
  detail: string;
  entityId: string;
  entityName: string;
  entityType: string;
  gremio: string;
}

export interface PartidaAlertSummary {
  sinPrecio: number;
  sinPartidas: number;
  desactualizados: number;
  incompletas: number;
}

export interface SubtotalPorGremio {
  gremio: string;
  subtotal: number;
}

export interface ProjectHistoryEntry {
  fecha: string;
  accion: string;
  actor: string;
  detalle: string;
}

// ─── Obra: estados y sub-tipos ───────────────────────────────────────────────

export type EstadoObra =
  | 'borrador'
  | 'presupuesto_en_preparacion'
  | 'presupuesto_enviado'
  | 'presupuesto_aceptado'
  | 'pendiente_de_planificacion'
  | 'en_ejecucion'
  | 'pendiente_de_cobro'
  | 'finalizada'
  | 'cerrada'
  | 'cancelada';

export const ESTADO_OBRA_CONFIG: Record<EstadoObra, { label: string; color: string; bg: string }> = {
  borrador:                     { label: 'Borrador',                   color: 'text-gray-600 dark:text-gray-400',       bg: 'bg-gray-100 dark:bg-gray-700' },
  presupuesto_en_preparacion:   { label: 'Presup. en preparación',     color: 'text-sky-700 dark:text-sky-400',         bg: 'bg-sky-100 dark:bg-sky-900/30' },
  presupuesto_enviado:          { label: 'Presup. enviado',            color: 'text-blue-700 dark:text-blue-400',       bg: 'bg-blue-100 dark:bg-blue-900/30' },
  presupuesto_aceptado:         { label: 'Presup. aceptado',           color: 'text-teal-700 dark:text-teal-400',       bg: 'bg-teal-100 dark:bg-teal-900/30' },
  pendiente_de_planificacion:   { label: 'Pte. planificación',         color: 'text-amber-700 dark:text-amber-400',     bg: 'bg-amber-100 dark:bg-amber-900/30' },
  en_ejecucion:                 { label: 'En ejecución',               color: 'text-green-700 dark:text-green-400',     bg: 'bg-green-100 dark:bg-green-900/30' },
  pendiente_de_cobro:           { label: 'Pte. de cobro',              color: 'text-orange-700 dark:text-orange-400',   bg: 'bg-orange-100 dark:bg-orange-900/30' },
  finalizada:                   { label: 'Finalizada',                 color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  cerrada:                      { label: 'Cerrada',                    color: 'text-gray-500 dark:text-gray-500',       bg: 'bg-gray-200 dark:bg-gray-800' },
  cancelada:                    { label: 'Cancelada',                  color: 'text-red-700 dark:text-red-400',         bg: 'bg-red-100 dark:bg-red-900/30' },
};

export const ESTADO_OBRA_TRANSICIONES: Record<EstadoObra, EstadoObra[]> = {
  borrador:                     ['presupuesto_en_preparacion', 'cancelada'],
  presupuesto_en_preparacion:   ['presupuesto_enviado', 'borrador', 'cancelada'],
  presupuesto_enviado:          ['presupuesto_aceptado', 'presupuesto_en_preparacion', 'cancelada'],
  presupuesto_aceptado:         ['pendiente_de_planificacion', 'cancelada'],
  pendiente_de_planificacion:   ['en_ejecucion', 'cancelada'],
  en_ejecucion:                 ['pendiente_de_cobro', 'cancelada'],
  pendiente_de_cobro:           ['finalizada', 'en_ejecucion'],
  finalizada:                   ['cerrada'],
  cerrada:                      [],
  cancelada:                    ['borrador'],
};

export const LEGACY_ESTADO_MAP: Record<string, EstadoObra> = {
  'planificación': 'pendiente_de_planificacion',
  'en_obra': 'en_ejecucion',
  'pausada': 'borrador',
};

export type EstadoFase = 'pendiente' | 'en_curso' | 'completada' | 'bloqueada';

export interface ObraFase {
  id: string;
  nombre: string;
  orden: number;
  estado: EstadoFase;
  fechaInicio: string;
  fechaFin: string;
  progreso: number;
  notas: string;
}

export interface ObraTrabajadorAsignado {
  trabajadorId: string;
  trabajadorNombre: string;
  rol: string;
  gremio: string;
  fechaAsignacion: string;
}

export interface ObraPagoInterno {
  id: string;
  concepto: string;
  importe: number;
  fecha: string;
  proveedor: string;
  tipo: 'subcontratista' | 'material' | 'maquinaria' | 'otro';
  pagado: boolean;
}

export const FASES_POR_DEFECTO: Omit<ObraFase, 'id'>[] = [
  { nombre: 'Proyecto y licencias',                orden: 1,  estado: 'pendiente', fechaInicio: '', fechaFin: '', progreso: 0, notas: '' },
  { nombre: 'Demolición / Preparación terreno',    orden: 2,  estado: 'pendiente', fechaInicio: '', fechaFin: '', progreso: 0, notas: '' },
  { nombre: 'Cimentación y estructura',            orden: 3,  estado: 'pendiente', fechaInicio: '', fechaFin: '', progreso: 0, notas: '' },
  { nombre: 'Albañilería y cerramientos',          orden: 4,  estado: 'pendiente', fechaInicio: '', fechaFin: '', progreso: 0, notas: '' },
  { nombre: 'Instalaciones (fontanería, elect.)',  orden: 5,  estado: 'pendiente', fechaInicio: '', fechaFin: '', progreso: 0, notas: '' },
  { nombre: 'Revestimientos y acabados',           orden: 6,  estado: 'pendiente', fechaInicio: '', fechaFin: '', progreso: 0, notas: '' },
  { nombre: 'Carpintería',                         orden: 7,  estado: 'pendiente', fechaInicio: '', fechaFin: '', progreso: 0, notas: '' },
  { nombre: 'Pintura',                             orden: 8,  estado: 'pendiente', fechaInicio: '', fechaFin: '', progreso: 0, notas: '' },
  { nombre: 'Limpieza final',                      orden: 9,  estado: 'pendiente', fechaInicio: '', fechaFin: '', progreso: 0, notas: '' },
  { nombre: 'Entrega y recepción',                 orden: 10, estado: 'pendiente', fechaInicio: '', fechaFin: '', progreso: 0, notas: '' },
];

export function normalizeEstadoObra(estado: string): EstadoObra {
  if (estado in ESTADO_OBRA_CONFIG) return estado as EstadoObra;
  if (estado in LEGACY_ESTADO_MAP) return LEGACY_ESTADO_MAP[estado];
  return 'borrador';
}

// ─── Obra: modelo principal ──────────────────────────────────────────────────

export interface ConstructionProject {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  nombre: string;
  tipoObra: string;

  direccion: string;
  codigoPostal: string;
  ciudad: string;
  provincia: string;
  ubicacion: string;

  clienteId: string;
  clienteNombre: string;

  responsableId: string;
  responsableNombre: string;
  trabajadores: ObraTrabajadorAsignado[];

  fechaInicio: string;
  fechaFinPrevista: string;
  fechaFinReal: string;
  fechaAceptacion: string;

  presupuestoId: string;
  presupuestoRef: string;
  importeTotal: number;
  presupuestoTotal: number;
  costesReales: number;
  margenPrevisto: number;
  rentabilidad: number;
  cobrosPendientes: number;
  totalCobrado: number;
  pagosInternos: ObraPagoInterno[];
  partidas: BudgetPartida[];
  gremios: string[];

  origenAutoConversion: boolean;
  historial: ProjectHistoryEntry[];

  estado: EstadoObra;
  progreso: number;

  fases: ObraFase[];
  actividad: ObraActividad[];

  horasEstimadas: number;
  horasAcumuladas: number;
  costeAcumulado: number;
  notas: string;

  archivada: boolean;
  fechaCierre: string;
  cerradoPor: string;
  cerradoPorNombre: string;
  motivoCierre: string;
  resumenCierre: ClosureSummary | null;
  fechaReapertura: string;
  reabiertoPor: string;
  reabiertoPorNombre: string;

  createdAt: string;
  updatedAt: string;
}

export interface ObraActividad {
  id: string;
  tipo: 'estado_cambio' | 'documento' | 'trabajador' | 'fase' | 'pago' | 'cobro' | 'nota' | 'incidencia' | 'creacion' | 'edicion';
  descripcion: string;
  usuario: string;
  fecha: string;
  metadata?: Record<string, unknown>;
}

export interface BudgetPartida {
  id: number | string;
  partidaPredefinidaId?: string;
  gremio: string;
  nombre?: string;
  descripcion: string;
  unidad?: string;
  cantidad?: number;
  precioUnitarioMateriales?: number;
  precioUnitarioManoObra?: number;
  precioUnitarioEstructural?: number;
  precioUnitario?: number;
  materiales: number;
  manoObra: number;
  estructural: number;
  subtotal: number;
}

export interface BudgetPago {
  id: number;
  concepto: string;
  importe: number;
  fecha: string;
  pagado: boolean;
}

export interface BudgetDoc {
  id: string;
  nombre: string;
  tipo: string;
  url: string;
  fecha: string;
  fileBase64: string;
  fileMimeType: string;
}

export interface ConstructionBudget {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  referencia: string;
  proyectoId: string;
  proyectoNombre: string;
  clienteId: string;
  clienteNombre: string;
  clienteCif: string;
  clienteTelefono: string;
  clienteEmail: string;
  clienteDireccionFiscal: DireccionFiscal;
  clienteFormaPago: string;
  tipoObra: string;
  direccionObra: string;
  descripcionObra: string;
  fecha: string;
  partidas: BudgetPartida[];
  totalPartidas: number;
  margen: number;
  margenMinimo: number;
  totalConMargen: number;
  estado: string;
  metodoPago: string;
  numPlazos: number;
  pagos: BudgetPago[];
  totalPagado: number;
  pendientePago: number;
  motivoRechazo: string;
  enviadoAt: string;
  fechaAceptacion: string;
  obraGeneradaId: string;
  creadoPor: string;
  creadoPorNombre: string;
  documentos: BudgetDoc[];
  notas: string;
  createdAt: string;
  updatedAt: string;
}

export interface AcceptBudgetResponse {
  ok: boolean;
  budget: ConstructionBudget;
  project?: ConstructionProject;
  autoConverted: boolean;
  conversionError?: string;
}

export interface BudgetTemplatePartida {
  id: string;
  partidaPredefinidaId: string;
  gremio: string;
  nombre: string;
  descripcion: string;
  unidad: string;
  cantidadDefecto: number;
  precioMateriales: number;
  precioManoObra: number;
  precioEstructural: number;
  precioUnitario: number;
  subtotal: number;
}

export interface BudgetTemplate {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  nombre: string;
  descripcion: string;
  tipoObra: string;
  categoria: string;
  gremio: string;
  partidas: BudgetTemplatePartida[];
  totalEstimado: number;
  margenDefecto: number;
  totalConMargen: number;
  gremiosIncluidos: string[];
  activa: boolean;
  vecesUsada: number;
  ultimoUso: string;
  creadoPor: string;
  creadoPorNombre: string;
  notas: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplyTemplateResult {
  partidas: Array<{
    partidaPredefinidaId: string;
    gremio: string;
    nombre: string;
    descripcion: string;
    unidad: string;
    cantidad: number;
    precioUnitarioMateriales: number;
    precioUnitarioManoObra: number;
    precioUnitarioEstructural: number;
  }>;
  margen: number;
  tipoObra: string;
  templateId: string;
  templateNombre: string;
}

export interface WorkerDoc {
  nombre: string;
  url: string;
  tipo: string;
  fecha: string;
}

export interface ConstructionWorker {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  nombre: string;
  dni: string;
  telefono: string;
  email: string;
  gremio: string;
  obraAsignada: string;
  obraNombre: string;
  ubicacionObra: string;
  documentos: WorkerDoc[];
  activo: boolean;
  notas: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function getConstructionConfig(): Promise<ConstructionConfig> {
  return request('/api/construction/config');
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export async function listConstructionClients(userId: string): Promise<ConstructionClient[]> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; clients: ConstructionClient[] }>(`/api/construction/clients/${encodeURIComponent(id)}`);
  return r.clients || [];
}

export async function createConstructionClient(userId: string, data: Partial<ConstructionClient>): Promise<ConstructionClient> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; client: ConstructionClient }>(`/api/construction/clients/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ client: data }) });
  return r.client;
}

export async function updateConstructionClient(userId: string, client: ConstructionClient): Promise<ConstructionClient> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; client: ConstructionClient }>(`/api/construction/clients/${encodeURIComponent(id)}/${encodeURIComponent(client._id)}`, { method: 'PUT', body: JSON.stringify({ client }) });
  return r.client;
}

export async function deleteConstructionClient(userId: string, clientId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`/api/construction/clients/${encodeURIComponent(id)}/${encodeURIComponent(clientId)}`, { method: 'DELETE' });
}

export async function getClientDetail(userId: string, clientId: string): Promise<ClienteDetalle> {
  const id = normalizeUserId(userId);
  return request<ClienteDetalle>(`/api/construction/clients/${encodeURIComponent(id)}/${encodeURIComponent(clientId)}/detail`);
}

export async function getClientNotes(userId: string, clientId: string): Promise<ClienteNota[]> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; notes: ClienteNota[] }>(`/api/construction/clients/${encodeURIComponent(id)}/${encodeURIComponent(clientId)}/notes`);
  return r.notes || [];
}

export async function createClientNote(userId: string, clientId: string, note: Partial<ClienteNota>): Promise<ClienteNota> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; note: ClienteNota }>(`/api/construction/clients/${encodeURIComponent(id)}/${encodeURIComponent(clientId)}/notes`, { method: 'POST', body: JSON.stringify({ note }) });
  return r.note;
}

export async function getClientHistory(userId: string, clientId: string, limit = 20, offset = 0): Promise<{ history: ClienteHistorialEntry[]; total: number }> {
  const id = normalizeUserId(userId);
  return request<{ history: ClienteHistorialEntry[]; total: number }>(`/api/construction/clients/${encodeURIComponent(id)}/${encodeURIComponent(clientId)}/history?limit=${limit}&offset=${offset}`);
}

export async function checkClientDuplicates(userId: string, data: { nombre?: string; cif?: string; telefono?: string; email?: string; excludeId?: string }): Promise<ClienteDuplicado[]> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; duplicates: ClienteDuplicado[] }>(`/api/construction/clients/${encodeURIComponent(id)}/check-duplicates`, { method: 'POST', body: JSON.stringify(data) });
  return r.duplicates || [];
}

export async function searchConstructionClients(userId: string, query: string): Promise<ConstructionClient[]> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; clients: ConstructionClient[] }>(`/api/construction/clients/${encodeURIComponent(id)}/search?q=${encodeURIComponent(query)}`);
  return r.clients || [];
}

export async function quickCreateConstructionClient(userId: string, client: Partial<ConstructionClient>, vincularA?: { tipo: 'obra' | 'presupuesto'; id: string }): Promise<{ client: ConstructionClient; duplicates: ClienteDuplicado[]; linkedEntity?: unknown }> {
  const id = normalizeUserId(userId);
  return request(`/api/construction/clients/${encodeURIComponent(id)}/quick`, { method: 'POST', body: JSON.stringify({ client, vincularA }) });
}

export async function convertLeadToConstructionClient(userId: string, leadId: string): Promise<ConstructionClient> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; client: ConstructionClient }>(`/api/construction/clients/${encodeURIComponent(id)}/from-lead`, { method: 'POST', body: JSON.stringify({ leadId }) });
  return r.client;
}

export async function importCrmClientToConstruction(userId: string, crmClientId: string): Promise<ConstructionClient> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; client: ConstructionClient }>(`/api/construction/clients/${encodeURIComponent(id)}/from-crm-client`, { method: 'POST', body: JSON.stringify({ crmClientId }) });
  return r.client;
}

export async function linkConstructionClientToCrm(userId: string, constructionClientId: string, crmClientId: string): Promise<ConstructionClient> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; client: ConstructionClient }>(`/api/construction/clients/${encodeURIComponent(id)}/link-crm`, { method: 'POST', body: JSON.stringify({ constructionClientId, crmClientId }) });
  return r.client;
}

// ─── Guilds ───────────────────────────────────────────────────────────────────

export async function listConstructionGuilds(userId: string): Promise<ConstructionGuild[]> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; guilds: ConstructionGuild[] }>(`/api/construction/guilds/${encodeURIComponent(id)}`);
  return r.guilds || [];
}

export async function createConstructionGuild(userId: string, data: Partial<ConstructionGuild>): Promise<ConstructionGuild> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; guild: ConstructionGuild }>(`/api/construction/guilds/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ guild: data }) });
  return r.guild;
}

export async function updateConstructionGuild(userId: string, guild: ConstructionGuild): Promise<ConstructionGuild> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; guild: ConstructionGuild }>(`/api/construction/guilds/${encodeURIComponent(id)}/${encodeURIComponent(guild._id)}`, { method: 'PUT', body: JSON.stringify({ guild }) });
  return r.guild;
}

export async function deleteConstructionGuild(userId: string, guildId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`/api/construction/guilds/${encodeURIComponent(id)}/${encodeURIComponent(guildId)}`, { method: 'DELETE' });
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function listConstructionProjects(userId: string): Promise<ConstructionProject[]> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; projects: ConstructionProject[] }>(`/api/construction/projects/${encodeURIComponent(id)}`);
  return r.projects || [];
}

export async function createConstructionProject(userId: string, data: Partial<ConstructionProject>): Promise<ConstructionProject> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; project: ConstructionProject }>(`/api/construction/projects/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ project: data }) });
  return r.project;
}

export async function updateConstructionProject(userId: string, project: ConstructionProject): Promise<ConstructionProject> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; project: ConstructionProject }>(`/api/construction/projects/${encodeURIComponent(id)}/${encodeURIComponent(project._id)}`, { method: 'PUT', body: JSON.stringify({ project }) });
  return r.project;
}

export async function deleteConstructionProject(userId: string, projectId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`/api/construction/projects/${encodeURIComponent(id)}/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

export async function listConstructionBudgets(userId: string): Promise<ConstructionBudget[]> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; budgets: ConstructionBudget[] }>(`/api/construction/budgets/${encodeURIComponent(id)}`);
  return r.budgets || [];
}

export async function createConstructionBudget(userId: string, data: Partial<ConstructionBudget>): Promise<ConstructionBudget> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; budget: ConstructionBudget }>(`/api/construction/budgets/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ budget: data }) });
  return r.budget;
}

export async function updateConstructionBudget(userId: string, budget: ConstructionBudget): Promise<ConstructionBudget> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; budget: ConstructionBudget }>(`/api/construction/budgets/${encodeURIComponent(id)}/${encodeURIComponent(budget._id)}`, { method: 'PUT', body: JSON.stringify({ budget }) });
  return r.budget;
}

export async function acceptConstructionBudget(userId: string, budgetId: string, metodoPago: string, numPlazos: number): Promise<AcceptBudgetResponse> {
  const id = normalizeUserId(userId);
  const r = await request<AcceptBudgetResponse>(`/api/construction/budgets/${encodeURIComponent(id)}/${encodeURIComponent(budgetId)}/accept`, { method: 'POST', body: JSON.stringify({ metodoPago, numPlazos }) });
  return r;
}

export async function registerConstructionPayment(userId: string, budgetId: string, pagoId: number): Promise<ConstructionBudget> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; budget: ConstructionBudget }>(`/api/construction/budgets/${encodeURIComponent(id)}/${encodeURIComponent(budgetId)}/pay`, { method: 'POST', body: JSON.stringify({ pagoId }) });
  return r.budget;
}

export async function sendConstructionBudget(userId: string, budgetId: string): Promise<ConstructionBudget> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; budget: ConstructionBudget }>(`/api/construction/budgets/${encodeURIComponent(id)}/${encodeURIComponent(budgetId)}/send`, { method: 'POST', body: JSON.stringify({}) });
  return r.budget;
}

export async function rejectConstructionBudget(userId: string, budgetId: string, motivoRechazo: string): Promise<ConstructionBudget> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; budget: ConstructionBudget }>(`/api/construction/budgets/${encodeURIComponent(id)}/${encodeURIComponent(budgetId)}/reject`, { method: 'POST', body: JSON.stringify({ motivoRechazo }) });
  return r.budget;
}

export async function deleteConstructionBudget(userId: string, budgetId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`/api/construction/budgets/${encodeURIComponent(id)}/${encodeURIComponent(budgetId)}`, { method: 'DELETE' });
}

// ─── Budget Templates ─────────────────────────────────────────────────────────

export async function listBudgetTemplates(userId: string): Promise<BudgetTemplate[]> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; templates: BudgetTemplate[] }>(`/api/construction/budget-templates/${encodeURIComponent(id)}`);
  return r.templates || [];
}

export async function createBudgetTemplate(userId: string, data: Partial<BudgetTemplate>): Promise<BudgetTemplate> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; template: BudgetTemplate }>(`/api/construction/budget-templates/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ template: data }) });
  return r.template;
}

export async function updateBudgetTemplate(userId: string, template: BudgetTemplate): Promise<BudgetTemplate> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; template: BudgetTemplate }>(`/api/construction/budget-templates/${encodeURIComponent(id)}/${encodeURIComponent(template._id)}`, { method: 'PUT', body: JSON.stringify({ template }) });
  return r.template;
}

export async function deleteBudgetTemplate(userId: string, templateId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`/api/construction/budget-templates/${encodeURIComponent(id)}/${encodeURIComponent(templateId)}`, { method: 'DELETE' });
}

export async function applyBudgetTemplateApi(userId: string, templateId: string): Promise<{ budgetData: ApplyTemplateResult }> {
  const id = normalizeUserId(userId);
  return request(`/api/construction/budget-templates/${encodeURIComponent(id)}/${encodeURIComponent(templateId)}/apply`, { method: 'POST' });
}

export async function createTemplateFromBudgetApi(userId: string, budgetId: string, nombre: string): Promise<BudgetTemplate> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; template: BudgetTemplate }>(`/api/construction/budget-templates/${encodeURIComponent(id)}/from-budget/${encodeURIComponent(budgetId)}`, {
    method: 'POST', body: JSON.stringify({ nombre }),
  });
  return r.template;
}

// ─── Predefined Partidas ─────────────────────────────────────────────────────

export async function listPredefinedPartidas(
  userId: string,
  filters?: { gremio?: string; activa?: boolean; search?: string }
): Promise<ConstructionPredefinedPartida[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.gremio) params.set('gremio', filters.gremio);
  if (filters?.activa !== undefined) params.set('activa', String(filters.activa));
  if (filters?.search) params.set('search', filters.search);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const r = await request<{ ok: boolean; partidas: ConstructionPredefinedPartida[] }>(`/api/construction/predefined-partidas/${encodeURIComponent(id)}${qs}`);
  return r.partidas || [];
}

export async function getPredefinedPartidasByGremio(userId: string, gremio: string): Promise<ConstructionPredefinedPartida[]> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; partidas: ConstructionPredefinedPartida[] }>(`/api/construction/predefined-partidas/${encodeURIComponent(id)}/by-gremio/${encodeURIComponent(gremio)}`);
  return r.partidas || [];
}

export async function createPredefinedPartida(userId: string, data: Partial<ConstructionPredefinedPartida>): Promise<ConstructionPredefinedPartida> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; partida: ConstructionPredefinedPartida }>(`/api/construction/predefined-partidas/${encodeURIComponent(id)}`, {
    method: 'POST', body: JSON.stringify({ partida: data }),
  });
  return r.partida;
}

export async function updatePredefinedPartida(userId: string, partida: ConstructionPredefinedPartida): Promise<ConstructionPredefinedPartida> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; partida: ConstructionPredefinedPartida }>(`/api/construction/predefined-partidas/${encodeURIComponent(id)}/${encodeURIComponent(partida._id)}`, {
    method: 'PUT', body: JSON.stringify({ partida }),
  });
  return r.partida;
}

export async function deletePredefinedPartida(userId: string, partidaId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`/api/construction/predefined-partidas/${encodeURIComponent(id)}/${encodeURIComponent(partidaId)}`, { method: 'DELETE' });
}

export async function bulkImportPartidas(userId: string, partidas: Partial<ConstructionPredefinedPartida>[]): Promise<{ imported: number; errors: string[] }> {
  const id = normalizeUserId(userId);
  return request(`/api/construction/predefined-partidas/${encodeURIComponent(id)}/bulk-import`, {
    method: 'POST', body: JSON.stringify({ partidas }),
  });
}

// ─── Partida Alerts ──────────────────────────────────────────────────────────

export async function getPartidaAlertsApi(userId: string): Promise<{ alerts: PartidaAlert[]; summary: PartidaAlertSummary }> {
  const id = normalizeUserId(userId);
  return request(`/api/construction/partida-alerts/${encodeURIComponent(id)}`);
}

// ─── Workers ──────────────────────────────────────────────────────────────────

export async function listConstructionWorkers(userId: string): Promise<ConstructionWorker[]> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; workers: ConstructionWorker[] }>(`/api/construction/workers/${encodeURIComponent(id)}`);
  return r.workers || [];
}

export async function createConstructionWorker(userId: string, data: Partial<ConstructionWorker>): Promise<ConstructionWorker> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; worker: ConstructionWorker }>(`/api/construction/workers/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ worker: data }) });
  return r.worker;
}

export async function updateConstructionWorker(userId: string, worker: ConstructionWorker): Promise<ConstructionWorker> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; worker: ConstructionWorker }>(`/api/construction/workers/${encodeURIComponent(id)}/${encodeURIComponent(worker._id)}`, { method: 'PUT', body: JSON.stringify({ worker }) });
  return r.worker;
}

export async function deleteConstructionWorker(userId: string, workerId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`/api/construction/workers/${encodeURIComponent(id)}/${encodeURIComponent(workerId)}`, { method: 'DELETE' });
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export interface TaskFoto {
  id: string;
  url: string;
  base64: string;
  mimeType: string;
  descripcion: string;
  fecha: string;
}

export interface ConstructionTask {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  titulo: string;
  descripcion: string;
  obraId: string;
  obraNombre: string;
  trabajadorId: string;
  trabajadorNombre: string;
  gremio: string;
  prioridad: string;
  estado: string;
  fechaLimite: string;
  fotos: TaskFoto[];
  notasAdmin: string;
  notasTrabajador: string;
  creadoPor: string;
  creadoPorNombre: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Daily Reports (Partes diarios) ──────────────────────────────────────────

export interface ReportMaterial {
  materialId: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  costeUnitario: number;
  costeTotal: number;
}

export interface ReportIncidencia {
  tipo: 'seguridad' | 'calidad' | 'material' | 'maquinaria' | 'accidente' | 'clima' | 'otro';
  descripcion: string;
  gravedad: 'baja' | 'media' | 'alta' | 'critica';
  fotos: TaskFoto[];
  incidenciaId: string;
}

export interface ReportHistorial {
  accion: string;
  usuario: string;
  fecha: string;
  detalle: string;
}

export interface ConstructionDailyReport {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  referencia: string;
  fecha: string;
  obraId: string;
  obraNombre: string;
  trabajadorId: string;
  trabajadorNombre: string;
  gremio: string;
  tareaId: string;
  tareaNombre: string;
  descripcion: string;
  horasTrabajadas: number;
  horasPrevistas: number;
  tarifaHora: number;
  costeTotal: number;
  materiales: ReportMaterial[];
  fotos: TaskFoto[];
  observaciones: string;
  tieneIncidencia: boolean;
  incidencia: ReportIncidencia | null;
  estado: 'borrador' | 'enviado' | 'validado' | 'rechazado';
  validadoPor: string;
  validadoPorNombre: string;
  validadoAt: string;
  motivoRechazo: string;
  clockinId: string;
  creadoPor: string;
  creadoPorNombre: string;
  historial: ReportHistorial[];
  createdAt: string;
  updatedAt: string;
}

// ─── Incidents (Incidencias de obra) ─────────────────────────────────────────

export type ConstructionIncidentType =
  | 'falta_material'
  | 'averia'
  | 'retraso_gremio'
  | 'cambio_cliente'
  | 'error_tecnico'
  | 'riesgo_seguridad'
  | 'otro'
  | 'seguridad'
  | 'calidad'
  | 'material'
  | 'maquinaria'
  | 'accidente'
  | 'clima';

export type ConstructionIncidentStatus = 'abierta' | 'en_revision' | 'resuelta' | 'cerrada' | 'reabierta';

export type ConstructionIncidentPriority = 'baja' | 'media' | 'alta' | 'critica';

export interface IncidentHistoryEntry {
  accion: string;
  usuario: string;
  fecha: string;
  detalle: string;
}

export interface ConstructionIncident {
  _id: string;
  _rev?: string;
  type?: 'construction_incident';
  id: string;
  user_id: string;
  referencia: string;
  titulo?: string;
  fecha?: string;
  obraId: string;
  obraNombre: string;
  trabajadorId?: string;
  trabajadorNombre?: string;
  parteId?: string;
  parteReferencia?: string;
  documentoId?: string;
  documentoNombre?: string;
  reportadoPor?: string;
  reportadoPorNombre?: string;
  tipo: ConstructionIncidentType | string;
  descripcion: string;
  prioridad?: ConstructionIncidentPriority;
  gravedad?: string;
  costeEstimado?: number;
  fechaDeteccion?: string;
  fotos: TaskFoto[];
  estado: ConstructionIncidentStatus | string;
  asignadoA?: string;
  asignadoANombre?: string;
  resolucion?: string;
  fechaResolucion?: string;
  resueltoPor?: string;
  fechaLimite?: string;
  reabiertaCount?: number;
  historial: IncidentHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

// ─── Obra documents ──────────────────────────────────────────────────────────

export type ObraDocCategoria =
  | 'presupuesto' | 'aceptacion' | 'contrato' | 'licencia' | 'plano'
  | 'foto' | 'factura' | 'justificante' | 'doc_cliente' | 'doc_gerencia'
  | 'instruccion' | 'seguro' | 'certificado' | 'licencia_obra'
  | 'permiso_municipal' | 'seguro_rc' | 'seguro_todo_riesgo'
  | 'plan_seguridad_salud' | 'evaluacion_riesgos' | 'certificado_tecnico'
  | 'acta_replanteo' | 'contrato_obra' | 'certificacion_obra' | 'albaran'
  | 'memoria_tecnica' | 'otro';

export type ObraDocEstado =
  | 'borrador' | 'pendiente' | 'pendiente_firma' | 'firmado'
  | 'validado' | 'vigente' | 'archivado' | 'caducado' | 'rechazado';

export interface ObraDocHistorialEntry {
  accion: string;
  usuario: string;
  fecha: string;
  detalle: string;
}

export interface ObraDocStats {
  total: number;
  obligatoriosFaltantes: number;
  firmasPendientes: number;
  licenciasCaducadas: number;
  porCategoria: Record<string, number>;
  porEstado: Record<string, number>;
}

export interface ObraDocTimelineEvent {
  tipo: string;
  documentoId: string;
  documentoNombre: string;
  categoria: string;
  usuario: string;
  fecha: string;
  detalle: string;
}

export interface ConstructionObraDocument {
  _id: string;
  _rev?: string;
  type?: 'construction_obra_document';
  id: string;
  user_id: string;
  obraId: string;
  obraNombre: string;
  clienteId: string;
  clienteNombre: string;
  categoria: string;
  nombre: string;
  descripcion: string;
  estado: string;
  fechaEmision: string;
  fechaCaducidad: string;
  obligatorio: boolean;
  visibleTrabajador: boolean;
  tags: string[];
  archivoUrl: string;
  archivoBase64: string;
  archivoMimeType: string;
  archivoNombre: string;
  archivoSize: number;
  ocrData: OcrResult | null;
  firmaEstado: string;
  firmadoPor: string;
  subidoPor: string;
  historial: ObraDocHistorialEntry[];
  notas: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

// ─── Alerts (listado rápido) ─────────────────────────────────────────────────

export interface ConstructionAlert {
  id: string;
  type: string;
  severity: 'warning' | 'high';
  label: string;
  detail: string;
  entityId: string;
  entityName: string;
  entityType: string;
  obraId: string;
  obraNombre: string;
}

// ─── Ops center (respuesta agregada) ─────────────────────────────────────────

export interface ConstructionOpsCenterData {
  ok: boolean;
  generatedAt: string;
  filters: {
    obraId: string | null;
    clienteId: string | null;
    estado: string | null;
    trabajadorId: string | null;
    dateFrom: string;
    dateTo: string;
  };
  resumen: Record<string, number>;
  obras: Array<Record<string, unknown>>;
  clientes: Array<Record<string, unknown>>;
  presupuestos: Record<string, unknown>;
  tareas: Record<string, unknown>;
  incidencias: Array<Record<string, unknown>>;
  partesTrabajo: Record<string, unknown>;
  documentos: Record<string, unknown>;
  alertas: ConstructionOpsAlert[];
  trabajadores: Array<Record<string, unknown>>;
  charts: Record<string, unknown>;
}

export interface ConstructionOpsAlert {
  id: string;
  tipo: string;
  gravedad: 'info' | 'warning' | 'error';
  titulo: string;
  mensaje: string;
  obraId?: string;
  incidentId?: string;
  ruta?: string;
}

export async function listConstructionTasks(userId: string, filters?: { workerId?: string; projectId?: string }): Promise<ConstructionTask[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.workerId) params.set('workerId', filters.workerId);
  if (filters?.projectId) params.set('projectId', filters.projectId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const r = await request<{ ok: boolean; tasks: ConstructionTask[] }>(`/api/construction/tasks/${encodeURIComponent(id)}${qs}`);
  return r.tasks || [];
}

export async function createConstructionTask(userId: string, data: Partial<ConstructionTask>): Promise<ConstructionTask> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; task: ConstructionTask }>(`/api/construction/tasks/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ task: data }) });
  return r.task;
}

export async function updateConstructionTask(userId: string, task: ConstructionTask): Promise<ConstructionTask> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; task: ConstructionTask }>(`/api/construction/tasks/${encodeURIComponent(id)}/${encodeURIComponent(task._id)}`, { method: 'PUT', body: JSON.stringify({ task }) });
  return r.task;
}

export async function deleteConstructionTask(userId: string, taskId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`/api/construction/tasks/${encodeURIComponent(id)}/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
}

// ─── Daily Reports ───────────────────────────────────────────────────────────

export async function listDailyReports(
  userId: string,
  filters?: { projectId?: string; workerId?: string; dateFrom?: string; dateTo?: string; estado?: string }
): Promise<ConstructionDailyReport[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.projectId) params.set('projectId', filters.projectId);
  if (filters?.workerId) params.set('workerId', filters.workerId);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  if (filters?.estado) params.set('estado', filters.estado);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const r = await request<{ ok: boolean; reports: ConstructionDailyReport[] }>(`/api/construction/daily-reports/${encodeURIComponent(id)}${qs}`);
  return r.reports || [];
}

export async function createDailyReport(userId: string, data: Partial<ConstructionDailyReport>): Promise<ConstructionDailyReport> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; report: ConstructionDailyReport }>(`/api/construction/daily-reports/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ report: data }) });
  return r.report;
}

export async function updateDailyReport(userId: string, report: ConstructionDailyReport): Promise<ConstructionDailyReport> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; report: ConstructionDailyReport }>(`/api/construction/daily-reports/${encodeURIComponent(id)}/${encodeURIComponent(report._id)}`, { method: 'PUT', body: JSON.stringify({ report }) });
  return r.report;
}

export async function deleteDailyReport(userId: string, reportId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`/api/construction/daily-reports/${encodeURIComponent(id)}/${encodeURIComponent(reportId)}`, { method: 'DELETE' });
}

export async function submitDailyReport(userId: string, reportId: string): Promise<ConstructionDailyReport> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; report: ConstructionDailyReport }>(`/api/construction/daily-reports/${encodeURIComponent(id)}/${encodeURIComponent(reportId)}/submit`, { method: 'POST' });
  return r.report;
}

export async function validateDailyReport(userId: string, reportId: string, validadoPor: string, validadoPorNombre: string): Promise<ConstructionDailyReport> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; report: ConstructionDailyReport }>(`/api/construction/daily-reports/${encodeURIComponent(id)}/${encodeURIComponent(reportId)}/validate`, { method: 'POST', body: JSON.stringify({ validadoPor, validadoPorNombre }) });
  return r.report;
}

export async function rejectDailyReport(userId: string, reportId: string, motivoRechazo: string): Promise<ConstructionDailyReport> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; report: ConstructionDailyReport }>(`/api/construction/daily-reports/${encodeURIComponent(id)}/${encodeURIComponent(reportId)}/reject`, { method: 'POST', body: JSON.stringify({ motivoRechazo }) });
  return r.report;
}

// ─── Incidents ───────────────────────────────────────────────────────────────

export async function listConstructionIncidents(
  userId: string,
  filters?: { projectId?: string; estado?: string; prioridad?: string; tipo?: string; workerId?: string; gravedad?: string }
): Promise<ConstructionIncident[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.projectId) params.set('projectId', filters.projectId);
  if (filters?.estado) params.set('estado', filters.estado);
  if (filters?.prioridad) params.set('prioridad', filters.prioridad);
  if (filters?.tipo) params.set('tipo', filters.tipo);
  if (filters?.workerId) params.set('workerId', filters.workerId);
  if (filters?.gravedad) params.set('gravedad', filters.gravedad);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const r = await request<{ ok: boolean; incidents: ConstructionIncident[] }>(`/api/construction/incidents/${encodeURIComponent(id)}${qs}`);
  return r.incidents || [];
}

export async function createConstructionIncident(userId: string, data: Partial<ConstructionIncident>): Promise<ConstructionIncident> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; incident: ConstructionIncident }>(`/api/construction/incidents/${encodeURIComponent(id)}`, {
    method: 'POST',
    body: JSON.stringify({ incident: data }),
  });
  return r.incident;
}

export async function updateConstructionIncident(userId: string, incident: ConstructionIncident): Promise<ConstructionIncident> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; incident: ConstructionIncident }>(`/api/construction/incidents/${encodeURIComponent(id)}/${encodeURIComponent(incident._id)}`, {
    method: 'PUT',
    body: JSON.stringify({ incident }),
  });
  return r.incident;
}

export async function resolveConstructionIncident(userId: string, incidentId: string, resolucion: string): Promise<ConstructionIncident> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; incident: ConstructionIncident }>(`/api/construction/incidents/${encodeURIComponent(id)}/${encodeURIComponent(incidentId)}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ resolucion }),
  });
  return r.incident;
}

export async function reopenConstructionIncident(userId: string, incidentId: string, motivo?: string): Promise<ConstructionIncident> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; incident: ConstructionIncident }>(`/api/construction/incidents/${encodeURIComponent(id)}/${encodeURIComponent(incidentId)}/reopen`, {
    method: 'POST',
    body: JSON.stringify({ motivo: motivo || '' }),
  });
  return r.incident;
}

export async function deleteConstructionIncident(userId: string, incidentId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`/api/construction/incidents/${encodeURIComponent(id)}/${encodeURIComponent(incidentId)}`, { method: 'DELETE' });
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export async function getConstructionAlerts(userId: string): Promise<ConstructionAlert[]> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; alerts: ConstructionAlert[] }>(`/api/construction/alerts/${encodeURIComponent(id)}`);
  return r.alerts || [];
}

// ─── Obra documents API ──────────────────────────────────────────────────────

export async function listObraDocuments(
  userId: string,
  filters?: { obraId?: string; clienteId?: string; categoria?: string; estado?: string; obligatorio?: boolean; search?: string }
): Promise<ConstructionObraDocument[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.obraId) params.set('obraId', filters.obraId);
  if (filters?.clienteId) params.set('clienteId', filters.clienteId);
  if (filters?.categoria) params.set('categoria', filters.categoria);
  if (filters?.estado) params.set('estado', filters.estado);
  if (filters?.obligatorio === true) params.set('obligatorio', 'true');
  if (filters?.obligatorio === false) params.set('obligatorio', 'false');
  if (filters?.search) params.set('search', filters.search);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const r = await request<{ ok: boolean; documents: ConstructionObraDocument[] }>(`/api/construction/obra-documents/${encodeURIComponent(id)}${qs}`);
  return r.documents || [];
}

export async function createObraDocument(userId: string, data: Partial<ConstructionObraDocument>): Promise<ConstructionObraDocument> {
  const uid = normalizeUserId(userId);
  const r = await request<{ ok: boolean; document: ConstructionObraDocument }>(`/api/construction/obra-documents/${encodeURIComponent(uid)}`, {
    method: 'POST',
    body: JSON.stringify({ document: data }),
  });
  return r.document;
}

export async function updateObraDocument(userId: string, doc: ConstructionObraDocument): Promise<ConstructionObraDocument> {
  const uid = normalizeUserId(userId);
  const r = await request<{ ok: boolean; document: ConstructionObraDocument }>(
    `/api/construction/obra-documents/${encodeURIComponent(uid)}/${encodeURIComponent(doc._id)}`,
    { method: 'PUT', body: JSON.stringify({ document: doc }) }
  );
  return r.document;
}

export async function deleteObraDocument(userId: string, documentId: string): Promise<void> {
  const uid = normalizeUserId(userId);
  await request(`/api/construction/obra-documents/${encodeURIComponent(uid)}/${encodeURIComponent(documentId)}`, { method: 'DELETE' });
}

export async function validateObraDocument(userId: string, documentId: string): Promise<ConstructionObraDocument> {
  const uid = normalizeUserId(userId);
  const r = await request<{ ok: boolean; document: ConstructionObraDocument }>(
    `/api/construction/obra-documents/${encodeURIComponent(uid)}/${encodeURIComponent(documentId)}/validate`,
    { method: 'POST' }
  );
  return r.document;
}

export async function getObraDocumentStats(userId: string, obraId?: string): Promise<ObraDocStats> {
  const uid = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (obraId) params.set('obraId', obraId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const r = await request<{ ok: boolean; stats: ObraDocStats }>(`/api/construction/obra-documents/${encodeURIComponent(uid)}/stats${qs}`);
  return r.stats;
}

export async function getObraDocumentTimeline(userId: string, obraId: string): Promise<{ events: ObraDocTimelineEvent[] }> {
  const uid = normalizeUserId(userId);
  return request<{ events: ObraDocTimelineEvent[] }>(`/api/construction/obra-documents/${encodeURIComponent(uid)}/timeline/${encodeURIComponent(obraId)}`);
}

export async function checkObraDocumentDuplicate(
  userId: string,
  data: { obraId: string; nombre: string; categoria: string; archivoSize: number }
): Promise<ConstructionObraDocument[]> {
  const uid = normalizeUserId(userId);
  const r = await request<{ ok: boolean; duplicates: ConstructionObraDocument[] }>(
    `/api/construction/obra-documents/${encodeURIComponent(uid)}/check-duplicate`,
    { method: 'POST', body: JSON.stringify(data) }
  );
  return r.duplicates || [];
}

export async function requestObraDocumentSignature(
  userId: string,
  documentId: string,
  data: { signers: { name: string; email: string; role: string }[]; message: string; expiresAt: string }
): Promise<ConstructionObraDocument> {
  const uid = normalizeUserId(userId);
  const r = await request<{ ok: boolean; document: ConstructionObraDocument }>(
    `/api/construction/obra-documents/${encodeURIComponent(uid)}/${encodeURIComponent(documentId)}/request-signature`,
    { method: 'POST', body: JSON.stringify(data) }
  );
  return r.document;
}

export async function processObraDocumentOcr(userId: string, documentId: string, ocrData: OcrResult): Promise<ConstructionObraDocument> {
  const uid = normalizeUserId(userId);
  const r = await request<{ ok: boolean; document: ConstructionObraDocument }>(
    `/api/construction/obra-documents/${encodeURIComponent(uid)}/${encodeURIComponent(documentId)}/ocr`,
    { method: 'POST', body: JSON.stringify({ ocrData }) }
  );
  return r.document;
}

// ─── Ops center ──────────────────────────────────────────────────────────────

export async function getConstructionOpsCenter(
  userId: string,
  filters?: {
    obraId?: string;
    clienteId?: string;
    estado?: string;
    trabajadorId?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<ConstructionOpsCenterData> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.obraId) params.set('obraId', filters.obraId);
  if (filters?.clienteId) params.set('clienteId', filters.clienteId);
  if (filters?.estado) params.set('estado', filters.estado);
  if (filters?.trabajadorId) params.set('trabajadorId', filters.trabajadorId);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return request<ConstructionOpsCenterData>(`/api/construction/ops-center/${encodeURIComponent(id)}${qs}`);
}

// ─── Reports (Informes y Rentabilidad) ───────────────────────────────────────

export interface ReportObraDetail {
  obraId: string;
  obraNombre: string;
  clienteId: string;
  clienteNombre: string;
  tipoObra: string;
  ubicacion: string;
  estado: string;
  progreso: number;
  fechaInicio: string;
  fechaFinPrevista: string;
  presupuesto: number;
  cobrado: number;
  pendienteCobro: number;
  costeMateriales: number;
  costeManoObra: number;
  costeEstructural: number;
  margenAbsoluto: number;
  margenPorcentaje: number;
  horasImputadas: number;
  trabajadoresAsignados: number;
  incidencias: number;
  desviacion: number;
  tareasTotal: number;
  tareasCompletadas: number;
  tareasPendientes: number;
}

export interface ReportClienteDetail {
  clienteId: string;
  clienteNombre: string;
  numObras: number;
  obrasActivas: number;
  totalPresupuestado: number;
  totalCobrado: number;
  pendienteCobro: number;
  margenMedio: number;
  obraMasRentable: string;
  obraMenosRentable: string;
}

export interface ReportMonthlyData {
  mes: string;
  presupuestado: number;
  cobrado: number;
  pagado: number;
  margen: number;
  horasImputadas: number;
  incidencias: number;
}

export interface ReportTrabajador {
  _id: string;
  nombre: string;
  gremio: string;
  obraNombre: string;
  obraId: string;
  horasImputadas: number;
  tareasCompletadas: number;
  tareasPendientes: number;
  tareasTotal: number;
  incidencias: number;
}

export interface ReportAlerta {
  id: string;
  tipo: 'obra_poco_rentable' | 'exceso_horas' | 'demasiadas_incidencias' | 'cobro_retrasado' | 'pago_no_justificado' | 'desviacion_temporal';
  severidad: 'warning' | 'critical';
  titulo: string;
  detalle: string;
  obraId?: string;
  obraNombre?: string;
  fecha: string;
}

export interface ConstructionReportsData {
  ok: boolean;
  generatedAt: string;
  filters: { desde: string; hasta: string; obraId: string | null; clienteId: string | null; trabajadorId: string | null };
  resumen: {
    obrasActivas: number;
    totalPresupuestado: number;
    totalCobrado: number;
    cobrosPendientes: number;
    pagosPendientes: number;
    margenGlobal: number;
    horasImputadas: number;
    trabajadoresActivos: number;
    incidenciasAbiertas: number;
    costoTotal: number;
  };
  obraDetails: ReportObraDetail[];
  clienteDetails: ReportClienteDetail[];
  seriesMensual: ReportMonthlyData[];
  trabajadores: ReportTrabajador[];
  alertas: ReportAlerta[];
}

export interface ConstructionReportsFilters {
  desde?: string;
  hasta?: string;
  clienteId?: string;
  obraId?: string;
  trabajadorId?: string;
}

export async function getConstructionReports(userId: string, filters?: ConstructionReportsFilters): Promise<ConstructionReportsData> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.desde) params.set('desde', filters.desde);
  if (filters?.hasta) params.set('hasta', filters.hasta);
  if (filters?.clienteId) params.set('clienteId', filters.clienteId);
  if (filters?.obraId) params.set('obraId', filters.obraId);
  if (filters?.trabajadorId) params.set('trabajadorId', filters.trabajadorId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return request<ConstructionReportsData>(`/api/construction/reports/${encodeURIComponent(id)}${qs}`);
}

// ─── Collections (Cobros de obra) ─────────────────────────────────────────────

export type CollectionTipoCobro = 'contado' | 'plazos' | 'fases' | 'hitos' | 'anticipo_parciales_cierre';
export type CollectionEstado = 'pendiente' | 'parcial' | 'cobrado' | 'vencido';
export type EntregaTipo = 'anticipo' | 'plazo' | 'fase' | 'hito' | 'parcial' | 'cierre' | 'contado';
export type EntregaEstado = 'pendiente' | 'parcial' | 'cobrado' | 'vencido';

export interface CollectionEntrega {
  id: number;
  concepto: string;
  tipo: EntregaTipo;
  importe: number;
  fechaPrevista: string;
  fechaCobro: string;
  estado: EntregaEstado;
  cobradoParcial: number;
  cobradoTotal: number;
  observaciones: string;
  financeMovementId: string;
}

export interface ConstructionCollection {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  referencia: string;
  obraId: string;
  obraNombre: string;
  clienteId: string;
  clienteNombre: string;
  presupuestoId: string;
  tipoCobro: CollectionTipoCobro;
  importeTotal: number;
  importeCobrado: number;
  saldoPendiente: number;
  estadoCobro: CollectionEstado;
  entregas: CollectionEntrega[];
  observaciones: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionSummaryItem {
  obraId?: string;
  obraNombre?: string;
  clienteId?: string;
  clienteNombre?: string;
  importeTotal: number;
  importeCobrado: number;
  saldoPendiente: number;
  totalCobros: number;
  cobrosVencidos: number;
}

export async function listConstructionCollections(
  userId: string,
  filters?: { obraId?: string; clienteId?: string; estadoCobro?: string }
): Promise<ConstructionCollection[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.obraId) params.set('obraId', filters.obraId);
  if (filters?.clienteId) params.set('clienteId', filters.clienteId);
  if (filters?.estadoCobro) params.set('estadoCobro', filters.estadoCobro);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const r = await request<{ ok: boolean; collections: ConstructionCollection[] }>(`/api/construction/collections/${encodeURIComponent(id)}${qs}`);
  return r.collections || [];
}

export async function getConstructionCollection(userId: string, collectionId: string): Promise<ConstructionCollection> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; collection: ConstructionCollection }>(`/api/construction/collections/${encodeURIComponent(id)}/${encodeURIComponent(collectionId)}`);
  return r.collection;
}

export async function createConstructionCollection(userId: string, data: Partial<ConstructionCollection>): Promise<ConstructionCollection> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; collection: ConstructionCollection }>(`/api/construction/collections/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ collection: data }) });
  return r.collection;
}

export async function updateConstructionCollection(userId: string, collection: ConstructionCollection): Promise<ConstructionCollection> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; collection: ConstructionCollection }>(`/api/construction/collections/${encodeURIComponent(id)}/${encodeURIComponent(collection._id)}`, { method: 'PUT', body: JSON.stringify({ collection }) });
  return r.collection;
}

export async function deleteConstructionCollection(userId: string, collectionId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`/api/construction/collections/${encodeURIComponent(id)}/${encodeURIComponent(collectionId)}`, { method: 'DELETE' });
}

export async function collectConstructionPayment(userId: string, collectionId: string, entregaId: number, fechaCobro?: string, observaciones?: string): Promise<ConstructionCollection> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; collection: ConstructionCollection }>(`/api/construction/collections/${encodeURIComponent(id)}/${encodeURIComponent(collectionId)}/collect`, {
    method: 'POST', body: JSON.stringify({ entregaId, fechaCobro, observaciones }),
  });
  return r.collection;
}

export async function collectConstructionPartialPayment(userId: string, collectionId: string, entregaId: number, importeParcial: number, fechaCobro?: string, observaciones?: string): Promise<ConstructionCollection> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; collection: ConstructionCollection }>(`/api/construction/collections/${encodeURIComponent(id)}/${encodeURIComponent(collectionId)}/partial`, {
    method: 'POST', body: JSON.stringify({ entregaId, importeParcial, fechaCobro, observaciones }),
  });
  return r.collection;
}

export async function getCollectionSummaryByProject(userId: string): Promise<CollectionSummaryItem[]> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; summary: CollectionSummaryItem[] }>(`/api/construction/collections/${encodeURIComponent(id)}/summary/by-project`);
  return r.summary || [];
}

export async function getCollectionSummaryByClient(userId: string): Promise<CollectionSummaryItem[]> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; summary: CollectionSummaryItem[] }>(`/api/construction/collections/${encodeURIComponent(id)}/summary/by-client`);
  return r.summary || [];
}

// ─── Planning Entries (Planificación de obra) ─────────────────────────────────

export interface PlanningMaterialPrevisto {
  materialId: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  fechaNecesaria: string;
  estado: string;
}

export interface PlanningConflicto {
  tipo: string;
  mensaje: string;
  entryId: string;
  obraNombre: string;
  fechas: string;
}

export interface PlanningReglaRecurrencia {
  tipo: 'diaria' | 'semanal' | 'quincenal' | 'mensual';
  intervalo: number;
  finRepeticion: string;
}

export interface PlanningHistorial {
  accion: string;
  usuario: string;
  fecha: string;
  detalle: string;
}

export interface ConstructionPlanningEntry {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  referencia: string;
  obraId: string;
  obraNombre: string;
  tipoRecurso: 'trabajador' | 'subcontrata' | 'maquinaria';
  recursoId: string;
  recursoNombre: string;
  gremio: string;
  tareaId: string;
  tareaNombre: string;
  fechaInicio: string;
  fechaFin: string;
  horaInicio: string;
  horaFin: string;
  todoElDia: boolean;
  diasSemana: number[];
  descripcion: string;
  prioridad: 'baja' | 'media' | 'alta' | 'urgente';
  estado: 'planificado' | 'confirmado' | 'en_curso' | 'completado' | 'cancelado';
  color: string;
  materialesPrevistos: PlanningMaterialPrevisto[];
  requiereConfirmacion: boolean;
  confirmado: boolean;
  confirmadoAt: string;
  confirmadoPor: string;
  responsableId: string;
  responsableNombre: string;
  notas: string;
  notasGerencia: string;
  esRecurrente: boolean;
  reglaRecurrencia: PlanningReglaRecurrencia | null;
  conflictos: PlanningConflicto[];
  historial: PlanningHistorial[];
  createdAt: string;
  updatedAt: string;
}

// ─── Milestones (Hitos de obra) ───────────────────────────────────────────────

export interface MilestoneDocumento {
  id: string;
  nombre: string;
  url: string;
  base64: string;
  mimeType: string;
  fecha: string;
}

export interface ConstructionMilestone {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  obraId: string;
  obraNombre: string;
  nombre: string;
  descripcion: string;
  tipo: 'inicio_obra' | 'fin_fase' | 'entrega_parcial' | 'recepcion_material' | 'inspeccion' | 'permiso' | 'entrega_final' | 'otro';
  fecha: string;
  fechaReal: string;
  fechaOriginal: string;
  estado: 'pendiente' | 'cumplido' | 'retrasado' | 'cancelado';
  responsableId: string;
  responsableNombre: string;
  diasRetraso: number;
  motivoRetraso: string;
  dependeDe: string;
  dependeDeNombre: string;
  documentos: MilestoneDocumento[];
  notas: string;
  color: string;
  icono: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Material Needs (Necesidades de material) ─────────────────────────────────

export interface ConstructionMaterialNeed {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  obraId: string;
  obraNombre: string;
  planningEntryId: string;
  materialId: string;
  materialNombre: string;
  categoria: string;
  cantidad: number;
  unidad: string;
  costeEstimado: number;
  fechaNecesaria: string;
  fechaSolicitud: string;
  fechaRecepcion: string;
  estado: 'previsto' | 'solicitado' | 'pedido' | 'recibido' | 'cancelado';
  pedidoCompraId: string;
  proveedorId: string;
  proveedorNombre: string;
  stockDisponible: number;
  requiereCompra: boolean;
  notas: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Planning Overview ────────────────────────────────────────────────────────

export interface PlanningOverviewResumen {
  totalEntradas: number;
  entradasPlanificadas: number;
  entradasConfirmadas: number;
  entradasEnCurso: number;
  entradasCompletadas: number;
  totalConflictos: number;
  hitosProximos: number;
  hitosRetrasados: number;
  materialesPendientes: number;
  materialesRequierenCompra: number;
  trabajadoresAsignados: number;
  maquinariaAsignada: number;
  subcontratasPendientesConfirmar: number;
  obrasActivas: number;
}

export interface PlanningOverview {
  ok: boolean;
  resumen: PlanningOverviewResumen;
  entries: ConstructionPlanningEntry[];
  milestones: ConstructionMilestone[];
  materialNeeds: ConstructionMaterialNeed[];
  obras: ConstructionProject[];
  trabajadores: ConstructionWorker[];
  subcontratas: ConstructionGuild[];
  conflictos: PlanningConflicto[];
  alertas: ConstructionAlert[];
}

// ─── Planning API Functions ───────────────────────────────────────────────────

export async function listPlanningEntries(
  userId: string,
  filters?: { projectId?: string; tipoRecurso?: string; recursoId?: string; estado?: string; dateFrom?: string; dateTo?: string }
): Promise<ConstructionPlanningEntry[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.projectId) params.set('projectId', filters.projectId);
  if (filters?.tipoRecurso) params.set('tipoRecurso', filters.tipoRecurso);
  if (filters?.recursoId) params.set('recursoId', filters.recursoId);
  if (filters?.estado) params.set('estado', filters.estado);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const r = await request<{ ok: boolean; entries: ConstructionPlanningEntry[] }>(`/api/construction/planning/${encodeURIComponent(id)}${qs}`);
  return r.entries || [];
}

export async function createPlanningEntry(userId: string, data: Partial<ConstructionPlanningEntry>): Promise<ConstructionPlanningEntry> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; entry: ConstructionPlanningEntry }>(`/api/construction/planning/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ entry: data }) });
  return r.entry;
}

export async function updatePlanningEntry(userId: string, entry: ConstructionPlanningEntry): Promise<ConstructionPlanningEntry> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; entry: ConstructionPlanningEntry }>(`/api/construction/planning/${encodeURIComponent(id)}/${encodeURIComponent(entry._id)}`, { method: 'PUT', body: JSON.stringify({ entry }) });
  return r.entry;
}

export async function deletePlanningEntry(userId: string, entryId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`/api/construction/planning/${encodeURIComponent(id)}/${encodeURIComponent(entryId)}`, { method: 'DELETE' });
}

export async function confirmPlanningEntry(userId: string, entryId: string, confirmadoPor: string): Promise<ConstructionPlanningEntry> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; entry: ConstructionPlanningEntry }>(`/api/construction/planning/${encodeURIComponent(id)}/${encodeURIComponent(entryId)}/confirm`, { method: 'POST', body: JSON.stringify({ confirmadoPor }) });
  return r.entry;
}

export async function startPlanningEntry(userId: string, entryId: string): Promise<ConstructionPlanningEntry> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; entry: ConstructionPlanningEntry }>(`/api/construction/planning/${encodeURIComponent(id)}/${encodeURIComponent(entryId)}/start`, { method: 'POST' });
  return r.entry;
}

export async function completePlanningEntry(userId: string, entryId: string): Promise<ConstructionPlanningEntry> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; entry: ConstructionPlanningEntry }>(`/api/construction/planning/${encodeURIComponent(id)}/${encodeURIComponent(entryId)}/complete`, { method: 'POST' });
  return r.entry;
}

export async function cancelPlanningEntry(userId: string, entryId: string): Promise<ConstructionPlanningEntry> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; entry: ConstructionPlanningEntry }>(`/api/construction/planning/${encodeURIComponent(id)}/${encodeURIComponent(entryId)}/cancel`, { method: 'POST' });
  return r.entry;
}

export async function duplicatePlanningEntry(userId: string, entryId: string, newDates: { fechaInicio: string; fechaFin: string }): Promise<ConstructionPlanningEntry> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; entry: ConstructionPlanningEntry }>(`/api/construction/planning/${encodeURIComponent(id)}/${encodeURIComponent(entryId)}/duplicate`, { method: 'POST', body: JSON.stringify(newDates) });
  return r.entry;
}

// ─── Milestones API ───────────────────────────────────────────────────────────

export async function listMilestones(userId: string, filters?: { projectId?: string; estado?: string; tipo?: string }): Promise<ConstructionMilestone[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.projectId) params.set('projectId', filters.projectId);
  if (filters?.estado) params.set('estado', filters.estado);
  if (filters?.tipo) params.set('tipo', filters.tipo);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const r = await request<{ ok: boolean; milestones: ConstructionMilestone[] }>(`/api/construction/milestones/${encodeURIComponent(id)}${qs}`);
  return r.milestones || [];
}

export async function createMilestone(userId: string, data: Partial<ConstructionMilestone>): Promise<ConstructionMilestone> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; milestone: ConstructionMilestone }>(`/api/construction/milestones/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ milestone: data }) });
  return r.milestone;
}

export async function updateMilestone(userId: string, milestone: ConstructionMilestone): Promise<ConstructionMilestone> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; milestone: ConstructionMilestone }>(`/api/construction/milestones/${encodeURIComponent(id)}/${encodeURIComponent(milestone._id)}`, { method: 'PUT', body: JSON.stringify({ milestone }) });
  return r.milestone;
}

export async function completeMilestone(userId: string, milestoneId: string): Promise<ConstructionMilestone> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; milestone: ConstructionMilestone }>(`/api/construction/milestones/${encodeURIComponent(id)}/${encodeURIComponent(milestoneId)}/complete`, { method: 'POST' });
  return r.milestone;
}

export async function deleteMilestone(userId: string, milestoneId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`/api/construction/milestones/${encodeURIComponent(id)}/${encodeURIComponent(milestoneId)}`, { method: 'DELETE' });
}

// ─── Material Needs API ───────────────────────────────────────────────────────

export async function listMaterialNeeds(userId: string, filters?: { projectId?: string; estado?: string; dateFrom?: string; dateTo?: string }): Promise<ConstructionMaterialNeed[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.projectId) params.set('projectId', filters.projectId);
  if (filters?.estado) params.set('estado', filters.estado);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const r = await request<{ ok: boolean; needs: ConstructionMaterialNeed[] }>(`/api/construction/material-needs/${encodeURIComponent(id)}${qs}`);
  return r.needs || [];
}

export async function createMaterialNeed(userId: string, data: Partial<ConstructionMaterialNeed>): Promise<ConstructionMaterialNeed> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; need: ConstructionMaterialNeed }>(`/api/construction/material-needs/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ need: data }) });
  return r.need;
}

export async function updateMaterialNeed(userId: string, need: ConstructionMaterialNeed): Promise<ConstructionMaterialNeed> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; need: ConstructionMaterialNeed }>(`/api/construction/material-needs/${encodeURIComponent(id)}/${encodeURIComponent(need._id)}`, { method: 'PUT', body: JSON.stringify({ need }) });
  return r.need;
}

export async function deleteMaterialNeed(userId: string, needId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`/api/construction/material-needs/${encodeURIComponent(id)}/${encodeURIComponent(needId)}`, { method: 'DELETE' });
}

export async function requestMaterialNeed(userId: string, needId: string): Promise<ConstructionMaterialNeed> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; need: ConstructionMaterialNeed }>(`/api/construction/material-needs/${encodeURIComponent(id)}/${encodeURIComponent(needId)}/request`, { method: 'POST' });
  return r.need;
}

// ─── Planning Overview API ────────────────────────────────────────────────────

export async function getPlanningOverview(
  userId: string,
  filters?: { projectId?: string; dateFrom?: string; dateTo?: string; tipoRecurso?: string; recursoId?: string }
): Promise<PlanningOverview> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.projectId) params.set('projectId', filters.projectId);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  if (filters?.tipoRecurso) params.set('tipoRecurso', filters.tipoRecurso);
  if (filters?.recursoId) params.set('recursoId', filters.recursoId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return request<PlanningOverview>(`/api/construction/planning-overview/${encodeURIComponent(id)}${qs}`);
}

// ─── OCR scan (reuses /api/ocr/scan endpoint) ────────────────────────────────

export async function scanDocumentOcr(imageBase64: string, mimeType: string): Promise<OcrResult> {
  const r = await request<{ ok: boolean; data: OcrResult }>('/api/ocr/scan', {
    method: 'POST',
    body: JSON.stringify({ imageBase64, mimeType }),
  });
  return r.data;
}

// ─── Pagos internos a gremios/proveedores ────────────────────────────────────

export interface PaymentInstallment {
  id: string;
  concepto: string;
  importe: number;
  fecha: string;
  pagado: boolean;
  fechaPago: string;
  metodoPago: string;
  justificanteUrl: string;
  justificanteNombre: string;
  justificanteMimeType: string;
  facturaProveedorId: string;
  ocrData: Record<string, unknown> | null;
  faseId: string;
  faseNombre: string;
  notas: string;
}

export interface PaymentPhase {
  id: string | number;
  nombre: string;
  importe: number;
  porcentaje: number;
  completada: boolean;
  fechaPrevista: string;
}

export interface ConstructionPayment {
  _id: string;
  _rev?: string;
  id: string;
  user_id: string;
  referencia: string;
  nombre: string;
  tipo: 'gremio' | 'proveedor' | 'gasto_general';
  obraId: string;
  obraNombre: string;
  gremioId: string;
  gremioNombre: string;
  gremioTipo: string;
  proveedorId: string;
  proveedorNombre: string;
  presupuestoId: string;
  importePactado: number;
  totalPagado: number;
  pendiente: number;
  estado: 'pendiente' | 'parcial' | 'pagado' | 'anulado';
  fechaPrevista: string;
  fases: PaymentPhase[];
  pagos: PaymentInstallment[];
  documentoUrl: string;
  documentoNombre: string;
  documentoMimeType: string;
  observaciones: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentProjectSummary {
  totalPactado: number;
  totalPagado: number;
  totalPendiente: number;
  byType: Record<string, { pactado: number; pagado: number; pendiente: number; count: number }>;
  count: number;
}

export interface PaymentGlobalSummary {
  totalPactado: number;
  totalPagado: number;
  totalPendiente: number;
  totalLineas: number;
  lineasVencidas: number;
  byProject: { obraId: string; obraNombre: string; pactado: number; pagado: number; pendiente: number; count: number }[];
  byType: Record<string, { pactado: number; pagado: number; pendiente: number; count: number }>;
}

export const PAYMENT_LINE_TYPE_CONFIG = {
  gremio: { label: 'Gremio', color: 'indigo' },
  proveedor: { label: 'Proveedor', color: 'teal' },
  gasto_general: { label: 'Gasto general', color: 'slate' },
} as const;

export const PAYMENT_STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'amber' },
  parcial: { label: 'Parcial', color: 'blue' },
  pagado: { label: 'Pagado', color: 'emerald' },
  anulado: { label: 'Anulado', color: 'gray' },
} as const;

export async function listPayments(
  userId: string,
  filters?: { projectId?: string; tipo?: string; estado?: string; guildId?: string; supplierId?: string }
): Promise<ConstructionPayment[]> {
  const id = normalizeUserId(userId);
  const params = new URLSearchParams();
  if (filters?.projectId) params.set('projectId', filters.projectId);
  if (filters?.tipo) params.set('tipo', filters.tipo);
  if (filters?.estado) params.set('estado', filters.estado);
  if (filters?.guildId) params.set('guildId', filters.guildId);
  if (filters?.supplierId) params.set('supplierId', filters.supplierId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const r = await request<{ ok: boolean; payments: ConstructionPayment[] }>(`/api/construction/payments/${encodeURIComponent(id)}${qs}`);
  return r.payments;
}

export async function createPayment(userId: string, data: Partial<ConstructionPayment>): Promise<ConstructionPayment> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; payment: ConstructionPayment }>(`/api/construction/payments/${encodeURIComponent(id)}`, {
    method: 'POST', body: JSON.stringify({ payment: data }),
  });
  return r.payment;
}

export async function updatePayment(userId: string, payment: Partial<ConstructionPayment> & { _id: string }): Promise<ConstructionPayment> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; payment: ConstructionPayment }>(`/api/construction/payments/${encodeURIComponent(id)}/${encodeURIComponent(payment._id)}`, {
    method: 'PUT', body: JSON.stringify({ payment }),
  });
  return r.payment;
}

export async function deletePayment(userId: string, paymentId: string): Promise<void> {
  const id = normalizeUserId(userId);
  await request(`/api/construction/payments/${encodeURIComponent(id)}/${encodeURIComponent(paymentId)}`, { method: 'DELETE' });
}

export async function registerPaymentInstallment(userId: string, paymentId: string, installment: Partial<PaymentInstallment>): Promise<ConstructionPayment> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; payment: ConstructionPayment }>(`/api/construction/payments/${encodeURIComponent(id)}/${encodeURIComponent(paymentId)}/pay`, {
    method: 'POST', body: JSON.stringify({ installment }),
  });
  return r.payment;
}

export async function cancelPaymentLine(userId: string, paymentId: string): Promise<ConstructionPayment> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; payment: ConstructionPayment }>(`/api/construction/payments/${encodeURIComponent(id)}/${encodeURIComponent(paymentId)}/cancel`, { method: 'POST' });
  return r.payment;
}

export async function linkPaymentReceipt(userId: string, paymentId: string, installmentId: string, receipt: Partial<PaymentInstallment>): Promise<ConstructionPayment> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; payment: ConstructionPayment }>(`/api/construction/payments/${encodeURIComponent(id)}/${encodeURIComponent(paymentId)}/installments/${encodeURIComponent(installmentId)}/receipt`, {
    method: 'POST', body: JSON.stringify(receipt),
  });
  return r.payment;
}

export async function updatePaymentPhases(userId: string, paymentId: string, fases: PaymentPhase[]): Promise<ConstructionPayment> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; payment: ConstructionPayment }>(`/api/construction/payments/${encodeURIComponent(id)}/${encodeURIComponent(paymentId)}/phases`, {
    method: 'PUT', body: JSON.stringify({ fases }),
  });
  return r.payment;
}

export async function getPaymentsByProject(userId: string, projectId: string): Promise<{ payments: ConstructionPayment[]; summary: PaymentProjectSummary }> {
  const id = normalizeUserId(userId);
  const r = await request<{ ok: boolean; payments: ConstructionPayment[]; summary: PaymentProjectSummary }>(`/api/construction/payments/${encodeURIComponent(id)}/by-project/${encodeURIComponent(projectId)}`);
  return { payments: r.payments, summary: r.summary };
}

export async function getPaymentsSummary(userId: string, projectId?: string): Promise<PaymentGlobalSummary> {
  const id = normalizeUserId(userId);
  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const r = await request<{ ok: boolean; summary: PaymentGlobalSummary }>(`/api/construction/payments/${encodeURIComponent(id)}/summary${qs}`);
  return r.summary;
}

export async function generatePaymentLinesFromBudget(userId: string, budgetId: string): Promise<{ generated: number; payments: ConstructionPayment[] }> {
  const id = normalizeUserId(userId);
  return request(`/api/construction/payments/${encodeURIComponent(id)}/generate-from-budget/${encodeURIComponent(budgetId)}`, { method: 'POST' });
}

// ─── Closure (Cierre de obra) ─────────────────────────────────────────────────

export interface ClosureSummary {
  presupuestoInicial: number;
  totalCobrado: number;
  totalPagado: number;
  pendienteCobro: number;
  pendientePago: number;
  margenPrevisto: number;
  margenReal: number;
  horasTotales: number;
  incidencias: { total: number; abiertas: number; resueltas: number; cerradas: number };
  tareas: { total: number; completadas: number; pendientes: number };
  fechaGeneracion?: string;
}

export interface ClosureChecklistItem {
  _id: string;
  referencia?: string;
  titulo?: string;
  nombre?: string;
  categoria?: string;
  tipo?: string;
  gravedad?: string;
  estado?: string;
  obraNombre?: string;
  trabajadorNombre?: string;
  concepto?: string;
  importe?: number;
}

export interface ClosureChecklist {
  cobrosPendientes: ClosureChecklistItem[];
  pagosPendientes: ClosureChecklistItem[];
  incidenciasAbiertas: ClosureChecklistItem[];
  documentosPendientes: ClosureChecklistItem[];
  tareasPendientes: ClosureChecklistItem[];
}

export interface ClosureResponse {
  ok: boolean;
  project: ConstructionProject;
  summary: ClosureSummary;
  checklist: ClosureChecklist;
  canClose: boolean;
  alreadyClosed: boolean;
  blockingReasons: string[];
}

export async function getClosureSummary(userId: string, projectId: string): Promise<ClosureResponse> {
  const id = normalizeUserId(userId);
  return request<ClosureResponse>(`/api/construction/projects/${encodeURIComponent(id)}/${encodeURIComponent(projectId)}/closure-summary`);
}

export async function closeConstructionProject(userId: string, projectId: string, opts: { motivoCierre?: string; forzarCierre?: boolean } = {}): Promise<{ ok: boolean; project: ConstructionProject; summary: ClosureSummary; warnings: string[] }> {
  const id = normalizeUserId(userId);
  return request(`/api/construction/projects/${encodeURIComponent(id)}/${encodeURIComponent(projectId)}/close`, {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export async function reopenConstructionProject(userId: string, projectId: string, motivoReapertura: string): Promise<{ ok: boolean; project: ConstructionProject }> {
  const id = normalizeUserId(userId);
  return request(`/api/construction/projects/${encodeURIComponent(id)}/${encodeURIComponent(projectId)}/reopen`, {
    method: 'POST',
    body: JSON.stringify({ motivoReapertura }),
  });
}
