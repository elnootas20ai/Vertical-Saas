import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import {
  listCleaningServicesRequest,
  listCleaningIncidentsRequest,
  listCleaningRoutesRequest,
} from '../lib/cleaningApi';
import type {
  CleaningService,
  CleaningServiceStatus,
  CleaningIncident,
  CleaningRoute,
} from '../lib/cleaningApi';
import { listCleaningWorkersRequest } from '../lib/cleaningWorkersApi';
import type { CleaningWorker } from '../lib/cleaningWorkersApi';
import { listCleaningMaterialsRequest } from '../lib/cleaningMaterialsApi';
import type { CleaningMaterial as CatalogMaterial } from '../lib/cleaningMaterialsApi';
import { fetchClockins } from '../lib/clockinsApi';
import type { EnrichedClockinRecord } from '../lib/clockinsApi';
import type { CleaningAlertType } from '../lib/cleaningHubApi';

type AlertSev = 'error' | 'warning' | 'info';

export interface HubAlert {
  id: string;
  type: CleaningAlertType;
  severity: AlertSev;
  message: string;
  route: string;
}

export interface HubWorker {
  id: string;
  name: string;
  avatar: string;
  clockedIn: boolean;
  clockInTime?: string;
  hoursToday: number;
  incidents: number;
  rating: number;
  servicesTotal: number;
  servicesCompleted: number;
  currentService?: { clientName: string };
  nextService?: { clientName: string; time: string };
}

export interface HubSvc {
  id: string;
  serviceNumber: string;
  clientName: string;
  address: string;
  cleaningType: string;
  assignedToName: string;
  status: CleaningServiceStatus;
  estimatedStart: string;
  estimatedEnd: string;
  price: number;
  isRecurrent: boolean;
  recurrencePattern?: string;
  zoneName: string;
  checklistDone: number;
  checklistTotal: number;
}

export interface HubIncident {
  id: string;
  type: string;
  severity: AlertSev;
  serviceNumber: string;
  clientName: string;
  workerName: string;
  description: string;
  time: string;
  status: string;
}

export interface HubMaterial {
  id: string;
  name: string;
  currentStock: number;
  minStock: number;
  unit: string;
  lastRestocked?: string;
  isCritical: boolean;
}

export interface HubKpis {
  servicesToday: number;
  servicesCompleted: number;
  servicesInProgress: number;
  servicesPending: number;
  servicesUncovered: number;
  activeWorkers: number;
  totalWorkers: number;
  absentWorkers: number;
  clockinsPending: number;
  hoursWorkedToday: number;
  openIncidents: number;
  billingToday: number;
  billingPending: number;
  profitabilityAvg: number;
  criticalMaterials: number;
  recurrentServices: number;
  oneTimeServices: number;
}

export interface HubData {
  kpis: HubKpis;
  workers: HubWorker[];
  services: HubSvc[];
  alerts: HubAlert[];
  incidents: HubIncident[];
  materials: HubMaterial[];
  servicesByHour: { hour: string; scheduled: number; completed: number }[];
  profitByClient: { client: string; revenue: number; cost: number; margin: number }[];
  unbilled: HubSvc[];
}

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  falta_limpieza: 'Falta de limpieza',
  rotura: 'Rotura',
  ausencia: 'Ausencia',
  queja_cliente: 'Queja cliente',
  urgencia_extra: 'Urgencia extra',
  material_faltante: 'Material faltante',
  acceso_no_permitido: 'Acceso denegado',
};

function mapPriorityToSeverity(priority: string): AlertSev {
  if (priority === 'critical' || priority === 'high') return 'error';
  if (priority === 'medium') return 'warning';
  return 'info';
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function recurrenceLabel(svc: CleaningService): string | undefined {
  if (!svc.recurrence || svc.recurrence.type === 'none') return undefined;
  const dayNames = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  switch (svc.recurrence.type) {
    case 'daily': return 'Diario';
    case 'weekly': {
      const days = (svc.recurrence.days || []).map(d => dayNames[d] || '?').join('-');
      return days || 'Semanal';
    }
    case 'biweekly': return 'Quincenal';
    case 'monthly': return 'Mensual';
    default: return svc.recurrence.type;
  }
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function parseDurationMinutes(dur: string): number {
  if (!dur) return 60;
  const hMatch = dur.match(/(\d+)\s*h/i);
  const mMatch = dur.match(/(\d+)\s*m/i);
  let total = 0;
  if (hMatch) total += parseInt(hMatch[1], 10) * 60;
  if (mMatch) total += parseInt(mMatch[1], 10);
  if (!hMatch && !mMatch) {
    const n = parseInt(dur, 10);
    if (!isNaN(n)) total = n > 12 ? n : n * 60;
  }
  return total || 60;
}

function buildData(
  rawServices: CleaningService[],
  rawWorkers: CleaningWorker[],
  rawIncidents: CleaningIncident[],
  rawMaterials: CatalogMaterial[],
  clockins: EnrichedClockinRecord[],
  _routes: CleaningRoute[],
): HubData {
  const today = todayStr();
  const now = new Date();
  const currentHour = now.getHours();

  const todaySvcs = rawServices.filter(s => s.date === today && !s.deletedAt);
  const activeWorkers = rawWorkers.filter(w => w.status === 'active' && !w.deletedAt);

  const services: HubSvc[] = todaySvcs.map(s => {
    const durMins = parseDurationMinutes(s.duration);
    const startTime = s.time || '08:00';
    const endTime = addMinutes(startTime, durMins);
    const isRec = s.recurrence && s.recurrence.type !== 'none';
    return {
      id: s._id,
      serviceNumber: s.serviceNumber || '',
      clientName: s.clientName || '',
      address: s.address || '',
      cleaningType: s.cleaningType || 'general',
      assignedToName: s.assignedToName || '',
      status: s.status,
      estimatedStart: startTime,
      estimatedEnd: endTime,
      price: s.price || 0,
      isRecurrent: !!isRec,
      recurrencePattern: isRec ? recurrenceLabel(s) : undefined,
      zoneName: s.zone || '',
      checklistDone: (s.tasks || []).filter(t => t.done).length,
      checklistTotal: (s.tasks || []).length,
    };
  });

  const clockinByMember = new Map<string, EnrichedClockinRecord>();
  for (const c of clockins) {
    if (c.date === today) clockinByMember.set(c.member_id, c);
  }

  const todayOpenIncidents = rawIncidents.filter(
    i => !i.deletedAt && (i.status === 'open' || i.status === 'in_progress'),
  );

  const workers: HubWorker[] = activeWorkers.map(w => {
    const ci = clockinByMember.get(w.teamMemberId);
    const isClockedIn = ci?.status === 'active' || ci?.status === 'break';
    const clockInEntry = ci?.entries?.find(e => e.type === 'clock_in');
    const minutesToday = ci?.totalMinutes || 0;

    const wSvcs = services.filter(
      s => s.assignedToName === w.name,
    );
    const wIncidents = todayOpenIncidents.filter(i => i.workerId === w.id || i.workerName === w.name);

    const inProgress = wSvcs.find(s => s.status === 'in_progress');
    const nextSvc = wSvcs
      .filter(s => s.status === 'assigned' || s.status === 'pending')
      .sort((a, b) => a.estimatedStart.localeCompare(b.estimatedStart))[0];

    return {
      id: w._id,
      name: w.name,
      avatar: w.name
        .split(' ')
        .map(n => n[0] || '')
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      clockedIn: !!isClockedIn,
      clockInTime: clockInEntry?.time?.slice(11, 16) || clockInEntry?.time,
      hoursToday: Math.round((minutesToday / 60) * 10) / 10,
      incidents: wIncidents.length,
      rating: w.specializations?.length ? 4.5 : 4.0,
      servicesTotal: wSvcs.length,
      servicesCompleted: wSvcs.filter(s => s.status === 'completed').length,
      currentService: inProgress ? { clientName: inProgress.clientName } : undefined,
      nextService: nextSvc ? { clientName: nextSvc.clientName, time: nextSvc.estimatedStart } : undefined,
    };
  });

  const completed = services.filter(s => s.status === 'completed').length;
  const inProgress = services.filter(s => s.status === 'in_progress').length;
  const pending = services.filter(s => s.status === 'pending' || s.status === 'assigned').length;
  const uncovered = services.filter(s => !s.assignedToName && s.status !== 'completed' && s.status !== 'cancelled').length;
  const recurrent = services.filter(s => s.isRecurrent).length;

  const clockedInWorkers = workers.filter(w => w.clockedIn);
  const totalHours = clockedInWorkers.reduce((sum, w) => sum + w.hoursToday, 0);
  const notClockedIn = workers.filter(w => !w.clockedIn);

  const materials: HubMaterial[] = rawMaterials
    .filter(m => m.active)
    .map(m => ({
      id: m._id,
      name: m.name,
      currentStock: m.stockQuantity,
      minStock: m.minStock,
      unit: m.unit,
      isCritical: m.stockQuantity < m.minStock,
    }));
  const criticalMats = materials.filter(m => m.isCritical).length;

  const billingCompleted = services
    .filter(s => s.status === 'completed')
    .reduce((sum, s) => sum + s.price, 0);
  const billingPending = services
    .filter(s => s.status !== 'completed' && s.status !== 'cancelled')
    .reduce((sum, s) => sum + s.price, 0);

  const totalRevenue = services.reduce((sum, s) => sum + s.price, 0);
  const estimatedCostRatio = 0.65;
  const profitabilityAvg = totalRevenue > 0
    ? Math.round((1 - estimatedCostRatio) * 1000) / 10
    : 0;

  const kpis: HubKpis = {
    servicesToday: services.length,
    servicesCompleted: completed,
    servicesInProgress: inProgress,
    servicesPending: pending,
    servicesUncovered: uncovered,
    activeWorkers: clockedInWorkers.length,
    totalWorkers: workers.length,
    absentWorkers: notClockedIn.length,
    clockinsPending: notClockedIn.length,
    hoursWorkedToday: Math.round(totalHours * 10) / 10,
    openIncidents: todayOpenIncidents.length,
    billingToday: billingCompleted,
    billingPending,
    profitabilityAvg,
    criticalMaterials: criticalMats,
    recurrentServices: recurrent,
    oneTimeServices: services.length - recurrent,
  };

  const alerts: HubAlert[] = [];
  let alertIdx = 0;

  services
    .filter(s => !s.assignedToName && s.status !== 'completed' && s.status !== 'cancelled')
    .forEach(s => {
      alerts.push({
        id: `a${++alertIdx}`,
        type: 'service_uncovered',
        severity: 'error',
        message: `Servicio #${s.serviceNumber} - Sin trabajador asignado (${s.estimatedStart})`,
        route: '/saas/cleaning-services',
      });
    });

  notClockedIn.forEach(w => {
    alerts.push({
      id: `a${++alertIdx}`,
      type: 'worker_absent',
      severity: 'error',
      message: `${w.name} - No fichado/a`,
      route: '/saas/clockins',
    });
  });

  materials
    .filter(m => m.isCritical)
    .forEach(m => {
      alerts.push({
        id: `a${++alertIdx}`,
        type: 'material_critical',
        severity: 'error',
        message: `${m.name} - Stock ${m.currentStock}/${m.minStock} ${m.unit}`,
        route: '/saas/cleaning-services',
      });
    });

  todayOpenIncidents.forEach(i => {
    alerts.push({
      id: `a${++alertIdx}`,
      type: 'incident_open',
      severity: mapPriorityToSeverity(i.priority),
      message: `Incidencia #${i.incidentNumber} - ${i.description?.slice(0, 60) || i.incidentType}`,
      route: '/saas/cleaning-incidents',
    });
  });

  if (billingPending > 0) {
    const unbilledCount = services.filter(s => s.status === 'completed' && !s.id).length || completed;
    alerts.push({
      id: `a${++alertIdx}`,
      type: 'billing_pending',
      severity: 'info',
      message: `${unbilledCount} servicios pendientes de facturar (${billingPending.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })})`,
      route: '/saas/finance',
    });
  }

  alerts.sort((a, b) => {
    const sevOrder: Record<AlertSev, number> = { error: 0, warning: 1, info: 2 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });

  const incidents: HubIncident[] = todayOpenIncidents.slice(0, 20).map(i => ({
    id: i._id,
    type: INCIDENT_TYPE_LABELS[i.incidentType] || i.incidentType,
    severity: mapPriorityToSeverity(i.priority),
    serviceNumber: `#${i.serviceNumber}`,
    clientName: i.clientName,
    workerName: i.workerName,
    description: i.description,
    time: i.createdAt?.slice(11, 16) || '',
    status: i.status,
  }));

  const hourBuckets = new Map<number, { scheduled: number; completed: number }>();
  for (let h = 6; h <= Math.max(currentHour, 18); h++) {
    hourBuckets.set(h, { scheduled: 0, completed: 0 });
  }
  for (const s of services) {
    const h = parseInt(s.estimatedStart?.split(':')[0] || '8', 10);
    const bucket = hourBuckets.get(h);
    if (bucket) {
      bucket.scheduled++;
      if (s.status === 'completed') bucket.completed++;
    }
  }
  const servicesByHour = Array.from(hourBuckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([h, v]) => ({ hour: `${String(h).padStart(2, '0')}:00`, ...v }));

  const clientMap = new Map<string, { revenue: number; cost: number }>();
  for (const s of services) {
    if (!s.clientName) continue;
    const entry = clientMap.get(s.clientName) || { revenue: 0, cost: 0 };
    entry.revenue += s.price || 0;
    entry.cost += (s.price || 0) * estimatedCostRatio;
    clientMap.set(s.clientName, entry);
  }
  const profitByClient = Array.from(clientMap.entries())
    .map(([client, { revenue, cost }]) => ({
      client,
      revenue: Math.round(revenue),
      cost: Math.round(cost),
      margin: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const unbilled = services
    .filter(s => s.status === 'completed')
    .slice(0, 6);

  return { kpis, workers, services, alerts, incidents, materials, servicesByHour, profitByClient, unbilled };
}

const EMPTY_DATA: HubData = {
  kpis: {
    servicesToday: 0, servicesCompleted: 0, servicesInProgress: 0, servicesPending: 0,
    servicesUncovered: 0, activeWorkers: 0, totalWorkers: 0, absentWorkers: 0,
    clockinsPending: 0, hoursWorkedToday: 0, openIncidents: 0, billingToday: 0,
    billingPending: 0, profitabilityAvg: 0, criticalMaterials: 0, recurrentServices: 0,
    oneTimeServices: 0,
  },
  workers: [], services: [], alerts: [], incidents: [], materials: [],
  servicesByHour: [], profitByClient: [], unbilled: [],
};

export function useCleaningHubData(sseVersion: number) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const [data, setData] = useState<HubData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(0);

  const userId = user?.userId ?? '';
  const businessId = currentBusiness?.id ?? '';

  const load = useCallback(async () => {
    if (!userId) return;
    const seq = ++fetchRef.current;
    setError(null);

    try {
      const today = todayStr();

      const [rawServices, rawWorkers, rawIncidents, rawMaterials, clockinRecords, rawRoutes] =
        await Promise.all([
          listCleaningServicesRequest(userId),
          listCleaningWorkersRequest(userId),
          listCleaningIncidentsRequest(userId),
          listCleaningMaterialsRequest(userId).catch(() => [] as CatalogMaterial[]),
          businessId
            ? fetchClockins(businessId, { date: today }).catch(() => [] as EnrichedClockinRecord[])
            : ([] as EnrichedClockinRecord[]),
          listCleaningRoutesRequest(userId, { date: today }).catch(() => [] as CleaningRoute[]),
        ]);

      if (seq !== fetchRef.current) return;

      const result = buildData(rawServices, rawWorkers, rawIncidents, rawMaterials, clockinRecords, rawRoutes);
      setData(result);
    } catch (err) {
      if (seq !== fetchRef.current) return;
      setError(err instanceof Error ? err.message : 'Error al cargar datos');
    } finally {
      if (seq === fetchRef.current) setLoading(false);
    }
  }, [userId, businessId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load, sseVersion]);

  const refresh = useCallback(() => {
    setLoading(true);
    return load();
  }, [load]);

  return { data, loading, error, refresh };
}
