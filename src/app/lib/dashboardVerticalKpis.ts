import { createVerticalApi } from './verticalApiFactory';
import { loadEvents } from './eventsFlow';
import type { EventContractStage } from './eventsTypes';
import { listConstructionProjects } from './constructionApi';
import { listCleaningServicesRequest } from './cleaningApi';
import { listReservations } from './restaurantReservationsApi';
import { localCalendarDayKey } from './tpvCajaScope';
import type { BusinessType } from './businessApi';
import i18n from './i18n';

export type VerticalKpiSnapshot = {
  label: string;
  value: string;
  sub: string;
  route: string;
};

const ACTIVE_EVENT_STAGES: EventContractStage[] = [
  'presupuesto', 'enviado', 'aceptado', 'contratado', 'planificacion', 'en_curso',
];

export async function loadVerticalKpiSnapshot(
  vertical: BusinessType | string,
  userId: string,
  businessId?: string,
): Promise<VerticalKpiSnapshot | null> {
  if (!userId) return null;

  try {
    switch (vertical) {
      case 'events': {
        const events = await loadEvents(userId);
        const active = events.filter((e) => ACTIVE_EVENT_STAGES.includes(e.estado)).length;
        return {
          label: 'Eventos activos',
          value: String(active),
          sub: `${events.length} en total`,
          route: '/saas/vertical/eventos',
        };
      }
      case 'restaurant': {
        const today = localCalendarDayKey();
        const reservations = await listReservations(userId).catch(() => []);
        const todayCount = reservations.filter((r) => String(r.date || r.fecha || '').startsWith(today)).length;
        return {
          label: 'Reservas hoy',
          value: String(todayCount),
          sub: 'Sala y TPV',
          route: '/saas/reservations',
        };
      }
      case 'cleaning': {
        const services = await listCleaningServicesRequest(userId);
        const today = localCalendarDayKey();
        const todayServices = services.filter((s) => String(s.date || '').startsWith(today)).length;
        return {
          label: 'Servicios hoy',
          value: String(todayServices),
          sub: `${services.length} totales`,
          route: '/saas/cleaning-hub',
        };
      }
      case 'construction': {
        const projects = await listConstructionProjects(userId);
        const active = projects.filter((p) => !['finalizada', 'cerrada', 'cancelada'].includes(p.estado)).length;
        return {
          label: 'Proyectos activos',
          value: String(active),
          sub: `${projects.length} en cartera`,
          route: '/saas/construction-projects',
        };
      }
      case 'scrapyard': {
        const vehiclesApi = createVerticalApi<{ id?: string }>('scrapyard', 'vehicles');
        const list = await vehiclesApi.list(userId);
        return {
          label: 'Vehículos en desguace',
          value: String(list.length),
          sub: 'En stock',
          route: '/saas/vertical/desguaces',
        };
      }
      case 'gym': {
        const membersApi = createVerticalApi<{ estado?: string }>('gym', 'members');
        const accessApi = createVerticalApi<{ horaEntrada?: string }>('gym', 'accessLogs');
        const [members, accessLogs] = await Promise.all([
          membersApi.list(userId),
          accessApi.list(userId).catch(() => []),
        ]);
        const active = members.filter((m) => String(m.estado || 'activo') === 'activo').length;
        const today = localCalendarDayKey();
        const accessToday = accessLogs.filter((log) => String(log.horaEntrada || '').startsWith(today)).length;
        return {
          label: i18n.t('verticalKpi.gymActiveMembers'),
          value: String(active),
          sub: i18n.t('verticalKpi.gymAccessToday', { count: accessToday }),
          route: '/saas/gym-hub',
        };
      }
      case 'workshop': {
        const { listWorkOrdersRequest } = await import('./workshopApi');
        const orders = await listWorkOrdersRequest(userId, { businessId });
        const open = orders.filter((o) => ['pending', 'in_progress'].includes(String(o.status || ''))).length;
        return {
          label: i18n.t('verticalKpi.workshopOpenOrders'),
          value: String(open),
          sub: i18n.t('verticalKpi.workshopTotal', { count: orders.length }),
          route: '/saas/workshop',
        };
      }
      case 'clinic': {
        const apptApi = createVerticalApi('clinic', 'appointments');
        const list = await apptApi.list(userId);
        const today = localCalendarDayKey();
        const todayAppt = list.filter((a) => String((a as { fecha?: string }).fecha || '').startsWith(today)).length;
        return {
          label: 'Citas hoy',
          value: String(todayAppt),
          sub: `${list.length} totales`,
          route: '/saas/clinic-appointments',
        };
      }
      case 'hotel': {
        const roomsApi = createVerticalApi('hotel', 'rooms');
        const list = await roomsApi.list(userId);
        return {
          label: 'Habitaciones',
          value: String(list.length),
          sub: 'Inventario',
          route: '/saas/hotel-rooms',
        };
      }
      case 'hairSalon': {
        const apptApi = createVerticalApi('hairSalon', 'appointments');
        const list = await apptApi.list(userId);
        const today = localCalendarDayKey();
        const todayAppt = list.filter((a) => String((a as { fecha?: string }).fecha || '').startsWith(today)).length;
        return {
          label: 'Citas hoy',
          value: String(todayAppt),
          sub: `${list.length} totales`,
          route: '/saas/salon-appointments',
        };
      }
      case 'lawyer': {
        const casesApi = createVerticalApi('lawyer', 'cases');
        const list = await casesApi.list(userId);
        const open = list.filter((c) => String((c as { estado?: string }).estado || '') !== 'cerrado').length;
        return {
          label: 'Casos abiertos',
          value: String(open),
          sub: `${list.length} totales`,
          route: '/saas/lawyer-cases',
        };
      }
      case 'academy': {
        const studentsApi = createVerticalApi('academy', 'students');
        const list = await studentsApi.list(userId);
        return {
          label: 'Alumnos activos',
          value: String(list.length),
          sub: 'Matriculados',
          route: '/saas/academy-students',
        };
      }
      case 'realEstate': {
        const propsApi = createVerticalApi('realEstate', 'properties');
        const list = await propsApi.list(userId);
        return {
          label: 'Propiedades',
          value: String(list.length),
          sub: 'En cartera',
          route: '/saas/realestate-properties',
        };
      }
      case 'nightclub': {
        const eventsApi = createVerticalApi('nightclub', 'events');
        const list = await eventsApi.list(userId);
        return {
          label: 'Eventos próximos',
          value: String(list.length),
          sub: 'Programados',
          route: '/saas/nightclub-events',
        };
      }
      case 'pharmacy': {
        const invApi = createVerticalApi('pharmacy', 'inventory');
        const list = await invApi.list(userId);
        return {
          label: 'Inventario',
          value: String(list.length),
          sub: 'Productos',
          route: '/saas/pharmacy-inventory',
        };
      }
      case 'vet': {
        const patientsApi = createVerticalApi('vet', 'patients');
        const list = await patientsApi.list(userId);
        return {
          label: 'Pacientes',
          value: String(list.length),
          sub: 'Registrados',
          route: '/saas/vet-patients',
        };
      }
      case 'carWash': {
        const bookingsApi = createVerticalApi('carWash', 'bookings');
        const list = await bookingsApi.list(userId);
        const today = localCalendarDayKey();
        const todayBookings = list.filter((b) => String((b as { fecha?: string }).fecha || '').startsWith(today)).length;
        return {
          label: 'Servicios hoy',
          value: String(todayBookings),
          sub: `${list.length} totales`,
          route: '/saas/carwash-services',
        };
      }
      case 'butcherShop': {
        return {
          label: 'Centro operativo',
          value: '—',
          sub: 'Carnicería',
          route: '/saas/butcher-hub',
        };
      }
      case 'spareParts': {
        const catalogApi = createVerticalApi('spareParts', 'catalog');
        const list = await catalogApi.list(userId);
        return {
          label: 'Catálogo piezas',
          value: String(list.length),
          sub: 'Disponibles',
          route: '/saas/catalog',
        };
      }
      case 'taxi': {
        const fleetApi = createVerticalApi('taxi', 'fleet');
        const list = await fleetApi.list(userId);
        return {
          label: 'Flota activa',
          value: String(list.length),
          sub: 'Vehículos',
          route: '/saas/taxi-fleet',
        };
      }
      case 'tobaccoShop': {
        return {
          label: 'Ventas hoy',
          value: '—',
          sub: 'Estanco',
          route: '/saas/tobacco-sales',
        };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
