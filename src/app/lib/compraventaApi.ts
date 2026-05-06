import { getApiBase } from './apiBase';
const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CompraventaFilters {
  branchId?: string;
  responsibleId?: string;
  vehicleStatus?: string;
  salesChannel?: string;
}

export interface StockKpis {
  total: number;
  reservados: number;
  enPreparacion: number;
  vendidosMes: number;
  diasPromedioStock: number;
}

export interface FinanzasKpis {
  ventasMes: number;
  margenMes: number;
  margenPct: number;
  cobrosPendientes: number;
  cobrosCount: number;
}

export interface EntregasKpis {
  pendientes: number;
  programadasHoy: number;
  retrasadas: number;
}

export interface CrmKpis {
  oportunidadesAbiertas: number;
  leadsSinContacto48h: number;
  reservasSinContrato: number;
}

export interface VehiculoStock {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  diasStock: number;
  precioVenta: number;
  ubicacion: string;
  centro: string;
}

export interface ReservaActiva {
  id: string;
  vehiculo: string;
  matricula: string;
  cliente: string;
  fechaReserva: string;
  tieneContrato: boolean;
  comercial: string;
}

export interface VentaReciente {
  id: string;
  vehiculo: string;
  cliente: string;
  importe: number;
  margen: number;
  estadoPago: string;
  fecha: string;
  stage: string;
}

export interface VehiculoPreparacion {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  gastosRegistrados: number;
  numGastos: number;
}

export interface EntregaPendiente {
  id: string;
  vehiculo: string;
  cliente: string;
  fechaPrevista: string;
  badge: 'hoy' | 'retrasada' | 'próxima';
  stage: string;
}

export interface OportunidadCrm {
  id: string;
  nombre: string;
  fuente: string;
  estado: string;
  diasSinContacto: number;
}

export interface CompraventaAlert {
  id: string;
  severity: 'error' | 'warning' | 'info';
  type: string;
  message: string;
  entityType: string;
  entityId: string;
  route: string;
}

export interface AccionPendiente {
  id: string;
  tipo: 'entrega' | 'seguimiento' | 'tarea';
  descripcion: string;
  fecha: string;
  asignadoA: string;
  route: string;
}

export interface RendimientoData {
  ventasPorDia: Array<{ dia: string; ventas: number; margen: number }>;
  margenAcumulado: number;
  totalVentas: number;
}

export interface CompraventaData {
  ok: boolean;
  isManager: boolean;
  stock: StockKpis;
  finanzas: FinanzasKpis;
  entregas: EntregasKpis;
  crm: CrmKpis;
  vehiculosStock: VehiculoStock[];
  reservasActivas: ReservaActiva[];
  ventasRecientes: VentaReciente[];
  vehiculosPreparacion: VehiculoPreparacion[];
  entregasPendientes: EntregaPendiente[];
  oportunidades: OportunidadCrm[];
  alertas: CompraventaAlert[];
  proximasAcciones: AccionPendiente[];
  rendimiento: RendimientoData | null;
  updatedAt: string;
}

// ─── Fetch ──────────────────────────────────────────────────────────────────

const API_BASE = getApiBase();

export async function fetchCompraventaData(
  userId: string,
  filters?: CompraventaFilters,
): Promise<CompraventaData> {
  const params = new URLSearchParams();
  if (filters?.branchId) params.set('branchId', filters.branchId);
  if (filters?.responsibleId) params.set('responsibleId', filters.responsibleId);
  if (filters?.vehicleStatus) params.set('vehicleStatus', filters.vehicleStatus);
  if (filters?.salesChannel) params.set('salesChannel', filters.salesChannel);

  const qs = params.toString();
  const url = `${API_BASE}/api/compraventa/${encodeURIComponent(userId)}${qs ? `?${qs}` : ''}`;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...getCouchHeaders(),
    },
  });

  const payload = await response.json().catch(() => ({ ok: false, error: 'Respuesta inválida' }));

  if (!response.ok || !payload.ok) {
    throw new Error(payload?.error || 'Error cargando datos del centro operativo');
  }

  return payload as CompraventaData;
}
