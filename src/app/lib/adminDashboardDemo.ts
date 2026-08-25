/**
 * Mocks de dashboard SOLO para uriel@admin.com (super-admin).
 * Otras cuentas nunca ven estos datos.
 */
import type { VerticalDashboardData } from './verticalApiFactory';
import type { PortfolioBusiness } from '../hooks/usePortfolioOverview';
import type { PortfolioMetrics, PortfolioFinanceTotals, PortfolioClientMetrics } from './portfolioMetrics';
import { emptyPortfolioMetrics, emptyPortfolioClientMetrics } from './portfolioMetrics';
import {
  shouldUseAdminDashboardDemo,
  ADMIN_DEMO_BADGE_LABEL,
  isVertialSuperAdminEmail,
  getAdminDemoSessionEmail,
  setAdminDemoSessionEmail,
} from './adminDashboardDemoGate';

export {
  shouldUseAdminDashboardDemo,
  ADMIN_DEMO_BADGE_LABEL,
  isVertialSuperAdminEmail,
  getAdminDemoSessionEmail,
  setAdminDemoSessionEmail,
};
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

function activity(
  type: string,
  summaries: string[],
): VerticalDashboardData['recentActivity'] {
  return summaries.map((summary, i) => ({
    id: `admin-demo-${type}-${i}`,
    type,
    summary,
    updatedAt: hoursAgo(i * 1.5 + 0.5),
    createdAt: hoursAgo(i * 3 + 2),
  }));
}

function pack(
  counts: Record<string, number>,
  type: string,
  summaries: string[],
): VerticalDashboardData {
  const recentActivity = activity(type, summaries);
  return {
    counts,
    recentActivity,
    total: Object.values(counts).reduce((a, b) => a + b, 0) || recentActivity.length,
  };
}

/** Demos por clave de API vertical (`createVerticalDashboardApi(...)`). */
const VERTICAL_DEMOS: Record<string, VerticalDashboardData> = {
  lawyer: pack(
    { cases: 6, hearings: 4, billing: 4, documents: 12, clients: 5 },
    'lawyer_case',
    [
      'Audiencia laboral — Exp. 2026/0142',
      'Hoja de encargo firmada — familia Pérez',
      'Plazo procesal en 48 h — mercantil García',
      'Factura honorarios emitida — 1.680 €',
      'Nuevo lead captación — penal leve',
    ],
  ),
  gym: pack(
    { members: 312, classes: 18, memberships: 287, checkins: 64 },
    'gym_checkin',
    [
      'Check-in · Ana López — sala cardio',
      'Nueva alta · plan anual Premium',
      'Clase Spinning 18:00 — 14 plazas',
      'Cuota vencida · recordatorio enviado',
      'PT asignado · Martín ↔ coach Sara',
    ],
  ),
  salon: pack(
    { appointments: 22, services: 1840, loyalty: 6, products: 31 },
    'salon_appt',
    [
      'Cita coloración · 10:30 — Lucía',
      'Producto vendido · champú keratina',
      'Cliente nuevo fidelización',
      'No-show · hueco liberado 12:00',
      'Reserva online · corte + barba',
    ],
  ),
  hotel: pack(
    { reservations: 41, checkins: 12, guests: 67, roomService: 890 },
    'hotel_stay',
    [
      'Check-in · Hab. 214 — familia Ruiz',
      'Room service · desayuno 305',
      'Checkout · Hab. 118',
      'Reserva web · suite fin de semana',
      'Housekeeping · planta 2 completa',
    ],
  ),
  academy: pack(
    { students: 156, courses: 12, grades: 48, enroll: 9, enrollToday: 9 },
    'academy_class',
    [
      'Clase inglés B2 · 09:00',
      'Nueva matrícula · curso verano',
      'Pago mensual recibo #4421',
      'Profesor suplente · aula 3',
      'Examen nivel · 14 alumnos',
    ],
  ),
  clinic: pack(
    {
      appointments: 34,
      patients: 890,
      treatments: 19,
      waiting: 4,
      history: 120,
      prescriptions: 45,
      rooms: 6,
    },
    'clinic_appt',
    [
      'Consulta medicina general · 09:15',
      'Analítica lista · paciente #228',
      'Sala de espera · 4 personas',
      'Cita cancelada · hueco 11:30',
      'Prescripción emitida',
    ],
  ),
  nightclub: pack(
    { events: 6, tickets: 1240, vip: 38, staff: 22 },
    'nightclub_event',
    [
      'Evento sábado · anticipada 820 entradas',
      'VIP lounge · reserva mesa 4',
      'DJ guest confirmado',
      'Stock barra · reposición cerveza',
      'Turno seguridad · 22:00',
    ],
  ),
  pharmacy: pack(
    { products: 1840, salesToday: 96, prescriptions: 28, lowStock: 7 },
    'pharmacy_sale',
    [
      'Venta mostrador · 24,80 €',
      'Receta electrónica dispensada',
      'Stock bajo · ibuprofeno 600',
      'Pedido proveedor · farmalider',
      'Caducidad lote · revisar lineal',
    ],
  ),
  vet: pack(
    { patients: 412, appointments: 16, surgeries: 2, vaccines: 9 },
    'vet_appt',
    [
      'Consulta · Luna (labrador)',
      'Vacuna rabia · Milo',
      'Cirugía programada · 16:00',
      'Ingreso observación · gato',
      'Recordatorio desparasitación',
    ],
  ),
  carwash: pack(
    { services: 48, bookings: 12, memberships: 86, vehicles: 41 },
    'carwash_job',
    [
      'Lavado premium · BMW 320',
      'Reserva mañana · 09:30',
      'Abonado mensual · check-in',
      'Interior completo · furgoneta',
      'Cola exterior · 3 vehículos',
    ],
  ),
  taxi: pack(
    { trips: 67, fleet: 14, drivers: 11, revenue: 1840 },
    'taxi_trip',
    [
      'Viaje aeropuerto · T2',
      'Conductor en ruta · #7',
      'Fin turno · caja 312 €',
      'Incidencia · cliente no aparece',
      'Reserva empresa · 18:00',
    ],
  ),
  spareparts: pack(
    { catalog: 2340, orders: 18, lowStock: 23, suppliers: 14 },
    'spare_order',
    [
      'Pedido taller · pastillas freno',
      'Stock crítico · filtro aceite',
      'Recepción proveedor · Bosch',
      'Presupuesto cliente · 186 €',
      'Devolución garantía · alternador',
    ],
  ),
  'scrapyard-ops': pack(
    { vehicles: 86, parts: 1240, sales: 19, weighing: 6 },
    'scrap_vehicle',
    [
      'Entrada vehículo · Seat León 2016',
      'Pieza vendida · faro delantero',
      'Pesaje chatarra · 420 kg',
      'Baja DGT · trámite OK',
      'Stock motor · Golf VI',
    ],
  ),
  realestate: pack(
    { properties: 42, visits: 9, contracts: 3, leads: 17 },
    're_visit',
    [
      'Visita piso Eixample · 17:00',
      'Señal reserva · 3.000 €',
      'Lead web · alquiler 3 hab',
      'Contrato borrador enviado',
      'Fotos publicadas · portal',
    ],
  ),
};

export function isVerticalDashEmpty(data: VerticalDashboardData | null | undefined): boolean {
  if (!data) return true;
  const countSum = Object.values(data.counts || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const activityLen = Array.isArray(data.recentActivity) ? data.recentActivity.length : 0;
  const total = Number(data.total || 0);
  return countSum <= 0 && activityLen <= 0 && total <= 0;
}

export function resolveAdminVerticalDemo(
  email: string | null | undefined,
  data: VerticalDashboardData | null | undefined,
  verticalKey: string,
): { data: VerticalDashboardData; usingDemo: boolean } {
  if (!shouldUseAdminDashboardDemo(email)) {
    return {
      data: data || { counts: {}, recentActivity: [], total: 0 },
      usingDemo: false,
    };
  }
  if (!isVerticalDashEmpty(data)) {
    return { data: data as VerticalDashboardData, usingDemo: false };
  }
  const demo = VERTICAL_DEMOS[verticalKey] || pack(
    { items: 24, active: 12, today: 8 },
    verticalKey,
    ['Actividad demo 1', 'Actividad demo 2', 'Actividad demo 3', 'Actividad demo 4', 'Actividad demo 5'],
  );
  return { data: demo, usingDemo: true };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function demoMetricsForBusiness(businessId: string, businessType: string): {
  metrics: PortfolioMetrics;
  finance: PortfolioFinanceTotals;
  clients: PortfolioClientMetrics;
} {
  const seed = hashSeed(businessId || businessType);
  const base = 800 + (seed % 4200);
  const today = Math.round(base * (0.04 + (seed % 7) / 100));
  const month = Math.round(base * (18 + (seed % 12)));
  const prev = Math.round(month * (0.88 + (seed % 20) / 100));
  const ordersMonth = Math.round(month / (22 + (seed % 15)));
  const expenses = Math.round(month * (0.55 + (seed % 15) / 100));
  const profit = month - expenses;
  const ebitda = Math.round(profit * 0.85);
  const isOps = ['delivery', 'restaurant', 'iceCreamShop', 'butcherShop'].includes(businessType);

  const metrics: PortfolioMetrics = {
    ...emptyPortfolioMetrics(),
    revenueToday: today,
    revenueMonth: month,
    revenuePrevMonth: prev,
    revenuePrevMonthMtd: Math.round(prev * 0.72),
    ordersToday: isOps ? Math.round(today / 28) : Math.round(today / 90),
    ordersMonth,
    ordersPrevMonth: Math.round(ordersMonth * 0.9),
    deliveredToday: isOps ? Math.round(today / 30) : 0,
    deliveredMonth: isOps ? Math.round(ordersMonth * 0.92) : 0,
    deliveredPrevMonth: isOps ? Math.round(ordersMonth * 0.85) : 0,
    activeOrders: isOps ? 3 + (seed % 8) : 0,
    cancelledMonth: isOps ? 2 + (seed % 5) : 0,
    avgTicketMonth: ordersMonth > 0 ? Math.round((month / ordersMonth) * 100) / 100 : 0,
    openCashRegisters: isOps ? 1 + (seed % 2) : 0,
    cashInRegisters: isOps ? Math.round(today * 0.35) : 0,
    revenueByChannel: isOps
      ? { tpv: Math.round(month * 0.55), glovo: Math.round(month * 0.25), uber: Math.round(month * 0.2) }
      : { mostrador: month },
    revenueByBrand: {},
    pizzasToday: businessType === 'delivery' || businessType === 'restaurant' ? 12 + (seed % 20) : 0,
    burgersToday: businessType === 'delivery' || businessType === 'restaurant' ? 8 + (seed % 14) : 0,
    tacosToday: 0,
    kebabsToday: 0,
  };

  const finance: PortfolioFinanceTotals = {
    incomeMonth: month,
    expensesMonth: expenses,
    incomePrevMonth: prev,
    incomePrevMonthMtd: Math.round(prev * 0.72),
    expensesPrevMonth: Math.round(expenses * 0.95),
    profitMonth: profit,
    ebitdaMonth: ebitda,
    ebitdaMarginMonth: month > 0 ? Math.round((ebitda / month) * 1000) / 10 : 0,
    pendingAmount: Math.round(month * 0.08),
    cashBalance: Math.round(month * 0.22),
  };

  const clients: PortfolioClientMetrics = {
    ...emptyPortfolioClientMetrics(),
    totalClients: 80 + (seed % 400),
    newClientsMonth: 4 + (seed % 18),
    newClientsPrevMonth: 3 + (seed % 14),
  };

  return { metrics, finance, clients };
}

/** Rellena filas de portfolio vacías (visión general) solo en admin. */
export function enrichPortfolioRowsForAdminDemo(
  email: string | null | undefined,
  rows: PortfolioBusiness[],
): { rows: PortfolioBusiness[]; usingDemo: boolean } {
  if (!shouldUseAdminDashboardDemo(email) || rows.length === 0) {
    return { rows, usingDemo: false };
  }

  let touched = false;
  const next = rows.map((row) => {
    const hasLife =
      (row.metrics?.revenueMonth || 0) > 0
      || (row.finance?.incomeMonth || 0) > 0
      || (row.metrics?.ordersMonth || 0) > 0;
    if (hasLife) return row;
    touched = true;
    const demo = demoMetricsForBusiness(row.businessId, String(row.business?.businessType || ''));
    return {
      ...row,
      metrics: demo.metrics,
      finance: demo.finance,
      clients: demo.clients,
      team: {
        ...row.team,
        clockedInNow: Math.max(row.team?.clockedInNow || 0, 2 + (hashSeed(row.businessId) % 5)),
        totalMembers: Math.max(row.team?.totalMembers || 0, row.memberCount || 4),
      },
    };
  });

  return { rows: next, usingDemo: touched };
}

/** KPIs delivery/restaurante unificado cuando la empresa admin está vacía. */
export function getAdminUnifiedOpsDemo(businessId: string, businessType: string): PortfolioMetrics {
  return demoMetricsForBusiness(businessId, businessType).metrics;
}

export type AdminRestaurantDemoKpis = {
  salesToday: number;
  ticketsToday: number;
  avgTicket: number;
  tablesFree: number;
  tablesOccupied: number;
  kitchenPending: number;
  reservationsToday: number;
  waitlist: number;
  staffClocked: number;
  openRegister: boolean;
  cashInRegister: number;
};

export function getAdminRestaurantDemoKpis(businessId: string): AdminRestaurantDemoKpis {
  const seed = hashSeed(businessId || 'restaurant');
  const salesToday = 1280 + (seed % 900);
  const ticketsToday = 38 + (seed % 25);
  return {
    salesToday,
    ticketsToday,
    avgTicket: Math.round((salesToday / ticketsToday) * 100) / 100,
    tablesFree: 6 + (seed % 5),
    tablesOccupied: 8 + (seed % 6),
    kitchenPending: 4 + (seed % 7),
    reservationsToday: 5 + (seed % 8),
    waitlist: 2 + (seed % 4),
    staffClocked: 3 + (seed % 4),
    openRegister: true,
    cashInRegister: Math.round(salesToday * 0.4),
  };
}
