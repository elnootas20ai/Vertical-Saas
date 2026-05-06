import { getApiBase } from './apiBase';
const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};


function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

// ── Types ────────────────────────────────────────────────────────────────────

export type WorkerEstado = 'activo' | 'inactivo' | 'fichado' | 'descanso';

export type WorkerAlertType =
  | 'lead_sin_gestionar'
  | 'sin_actividad'
  | 'baja_conversion'
  | 'exceso_pendientes'
  | 'documento_caducado';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface WorkerPerformanceData {
  workerId: string;
  nombre: string;
  avatar: string;
  rol: string;
  email: string;
  telefono: string;
  estado: WorkerEstado;

  ventasCerradas: number;
  ingresosTotales: number;
  margenTotal: number;
  ticketMedio: number;
  reservasActivas: number;
  entregasRealizadas: number;
  entregasPendientes: number;

  leadsAsignados: number;
  leadsSinGestionar: number;
  leadsConvertidos: number;
  ratioConversion: number;
  tiempoMedioCierreDias: number;

  comisionesGeneradas: number;
  comisionesPendientes: number;
  comisionesPagadas: number;

  horasTrabajadas: number;
  diasTrabajados: number;
  ventasPorHora: number;
  tareasCompletadas: number;
  tareasPendientes: number;

  documentosVigentes: number;
  documentosPendientes: number;
  documentosCaducados: number;

  tendenciaVentas: number;
  tendenciaIngresos: number;
  tendenciaConversion: number;
}

export interface TeamSummaryData {
  totalComerciales: number;
  comercialesActivos: number;
  ventasEquipo: number;
  ingresosTotales: number;
  margenEquipo: number;
  ticketMedioEquipo: number;
  ratioConversionEquipo: number;
  tiempoMedioCierreEquipo: number;
  comisionesTotales: number;
  horasTotales: number;
  leadsTotal: number;
  leadsSinGestionar: number;
  entregasPendientes: number;
}

export interface WorkerAlert {
  id: string;
  tipo: WorkerAlertType;
  severity: AlertSeverity;
  workerId: string;
  workerName: string;
  mensaje: string;
  ruta: string;
  timestamp: string;
}

export interface WorkerPerformanceResponse {
  ok: boolean;
  workers: WorkerPerformanceData[];
  teamSummary: TeamSummaryData;
  alerts: WorkerAlert[];
  range: { from: string; to: string };
  updatedAt: string;
}

// ── API ──────────────────────────────────────────────────────────────────────

const API_BASE = getApiBase();

export async function fetchWorkerPerformance(
  userId: string,
  options?: {
    from?: string;
    to?: string;
    businessId?: string;
    workerId?: string;
  },
): Promise<WorkerPerformanceResponse> {
  const params = new URLSearchParams();
  if (options?.from) params.set('from', options.from);
  if (options?.to) params.set('to', options.to);
  if (options?.businessId) params.set('businessId', options.businessId);
  if (options?.workerId) params.set('workerId', options.workerId);

  const qs = params.toString() ? `?${params.toString()}` : '';

  const response = await fetch(
    `${API_BASE}/api/worker-performance/${encodeURIComponent(userId)}${qs}`,
    {
      headers: {
        'Content-Type': 'application/json',
        ...getCouchHeaders(),
      },
      credentials: 'include',
    },
  );

  const payload = await response.json().catch(() => ({ ok: false, error: 'Respuesta inválida' }));

  if (!response.ok || !payload.ok) {
    throw new Error(payload?.error || 'Error cargando rendimiento de trabajadores');
  }

  return payload as WorkerPerformanceResponse;
}
