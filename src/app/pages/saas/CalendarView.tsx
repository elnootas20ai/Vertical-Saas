import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationOpen } from '../../hooks/useNotificationOpen';
import { useTranslation } from 'react-i18next';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  ChevronLeft, ChevronRight, Plus, Calendar, Clock,
  User, Filter, Car, Check, X, Link, Settings,
  Users, AlertCircle, Loader2, ShoppingCart, PhoneCall,
  Handshake, BellRing, FileSignature, Truck, Wrench, Crown, Store,
  Smartphone,
} from 'lucide-react';
import { listWorkOrdersRequest, type WorkOrder } from '../../lib/workshopApi';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import { isEventsBusinessType } from '../../lib/deliveryOpsTypes';
import { loadEvents, resolveEventsUserId } from '../../lib/eventsFlow';
import {
  EVENT_STAGE_CONFIG,
  EVENT_TYPE_LABELS,
  type EventRecord,
} from '../../lib/eventsTypes';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameDay, isSameMonth, isToday, addMonths, subMonths,
  addWeeks, subWeeks, parseISO, isAfter,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  listAppointmentsRequest,
  createAppointmentRequest,
  updateAppointmentRequest,
  deleteAppointmentRequest,
  getBookingConfigRequest,
  saveBookingConfigRequest,
  type Appointment,
  type BookingConfig,
  type AppointmentType,
  type AppointmentStatus,
} from '../../lib/appointmentsApi';
import {
  addEventToPhoneCalendar,
  addEventsToPhoneCalendar,
  calendarIcsFromParts,
  isLikelyAppleMobileDevice,
  isPhoneCalendarSent,
  markPhoneCalendarSent,
  type CalendarIcsEvent,
} from '../../lib/calendarIcs';
import { VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import { toast } from 'sonner';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  type: 'appointment' | 'followup' | 'delivery' | 'test_drive' | 'sale' | 'purchase' | 'call' | 'meeting' | 'reminder' | 'paperwork' | 'visit' | 'workshop' | 'event';
  title: string;
  subtitle: string;
  date: Date;
  time?: string;
  color: string;
  route?: string;
  appointmentId?: string;
  assignedTo?: string;
  assignedName?: string;
  status?: AppointmentStatus;
  vehicleName?: string;
}

interface TeamMember {
  user_id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}

type CalendarMode = 'month' | 'week';

type EventTypeColorKey =
  | 'blue' | 'emerald' | 'amber' | 'purple' | 'green'
  | 'cyan' | 'orange' | 'indigo' | 'rose' | 'slate';

const EVENT_TYPE_COLOR_PRESETS: Record<EventTypeColorKey, { dot: string; bg: string; text: string }> = {
  blue:    { dot: 'bg-blue-500',    bg: 'bg-blue-50',    text: 'text-blue-700' },
  emerald: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  amber:   { dot: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700' },
  purple:  { dot: 'bg-purple-500',  bg: 'bg-purple-50',  text: 'text-purple-700' },
  green:   { dot: 'bg-green-600',   bg: 'bg-green-50',   text: 'text-green-700' },
  cyan:    { dot: 'bg-cyan-600',    bg: 'bg-cyan-50',    text: 'text-cyan-700' },
  orange:  { dot: 'bg-orange-500',  bg: 'bg-orange-50',  text: 'text-orange-700' },
  indigo:  { dot: 'bg-indigo-500',  bg: 'bg-indigo-50',  text: 'text-indigo-700' },
  rose:    { dot: 'bg-rose-500',    bg: 'bg-rose-50',    text: 'text-rose-700' },
  slate:   { dot: 'bg-slate-700',   bg: 'bg-slate-100',  text: 'text-slate-700' },
};

type EventTypeConfig = Record<string, { enabled: boolean; label: string; color: EventTypeColorKey }>;

function isDeliveryLikeCalendar(businessType: string | null | undefined): boolean {
  return businessType === 'delivery' || businessType === 'restaurant';
}

function isEventsCalendar(businessType: string | null | undefined): boolean {
  return isEventsBusinessType(businessType);
}

function defaultEventTypeConfig(businessType?: string | null): EventTypeConfig {
  if (isEventsCalendar(businessType)) {
    return {
      event:    { enabled: true,  label: 'Evento',         color: 'cyan' },
      meeting:  { enabled: true,  label: 'Reunión',        color: 'indigo' },
      call:     { enabled: true,  label: 'Llamada',        color: 'orange' },
      visit:    { enabled: true,  label: 'Visita',         color: 'blue' },
      reminder: { enabled: true,  label: 'Recordatorio',   color: 'rose' },
      delivery: { enabled: false, label: 'Logística',      color: 'purple' },
    };
  }
  if (isDeliveryLikeCalendar(businessType)) {
    return {
      delivery:  { enabled: true,  label: 'Reparto',        color: 'purple' },
      call:      { enabled: true,  label: 'Llamada',        color: 'orange' },
      meeting:   { enabled: true,  label: 'Reunión',        color: 'indigo' },
      visit:     { enabled: true,  label: 'Visita cliente', color: 'blue' },
      reminder:  { enabled: true,  label: 'Recordatorio',   color: 'rose' },
      paperwork: { enabled: false, label: 'Documentación',  color: 'amber' },
    };
  }
  return {
    sale:      { enabled: true, label: 'Venta',        color: 'green' },
    purchase:  { enabled: true, label: 'Compra',       color: 'cyan' },
    delivery:  { enabled: true, label: 'Entrega',      color: 'purple' },
    paperwork: { enabled: true, label: 'Papeleo',      color: 'amber' },
    call:      { enabled: true, label: 'Llamada',      color: 'orange' },
    meeting:   { enabled: true, label: 'Reunión',      color: 'indigo' },
    visit:     { enabled: true, label: 'Visita',       color: 'blue' },
    reminder:  { enabled: true, label: 'Recordatorio', color: 'rose' },
  };
}

function configurableEventTypes(businessType?: string | null): AppointmentType[] {
  if (isEventsCalendar(businessType)) {
    return ['meeting', 'call', 'visit', 'reminder', 'delivery'];
  }
  if (isDeliveryLikeCalendar(businessType)) {
    return ['delivery', 'call', 'meeting', 'visit', 'reminder', 'paperwork'];
  }
  return ['sale', 'purchase', 'delivery', 'paperwork', 'call', 'meeting', 'visit', 'reminder'];
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

const EVENT_COLORS: Record<string, string> = {
  appointment: 'bg-blue-500',
  test_drive:  'bg-emerald-500',
  followup:    'bg-amber-500',
  delivery:    'bg-purple-500',
  sale:        'bg-green-600',
  purchase:    'bg-cyan-600',
  call:        'bg-orange-500',
  meeting:     'bg-indigo-500',
  reminder:    'bg-rose-500',
  paperwork:   'bg-amber-600',
  visit:       'bg-blue-600',
  workshop:    'bg-slate-700',
  event:       'bg-cyan-600',
};

const EVENT_BG: Record<string, string> = {
  appointment: 'bg-blue-50',
  test_drive:  'bg-emerald-50',
  followup:    'bg-amber-50',
  delivery:    'bg-purple-50',
  sale:        'bg-green-50',
  purchase:    'bg-cyan-50',
  call:        'bg-orange-50',
  meeting:     'bg-indigo-50',
  reminder:    'bg-rose-50',
  paperwork:   'bg-amber-50',
  visit:       'bg-blue-50',
  workshop:    'bg-slate-100',
  event:       'bg-cyan-50',
};

const EVENT_TEXT_COLOR: Record<string, string> = {
  appointment: 'text-blue-700',
  test_drive:  'text-emerald-700',
  followup:    'text-amber-700',
  delivery:    'text-purple-700',
  sale:        'text-green-700',
  purchase:    'text-cyan-700',
  call:        'text-orange-700',
  meeting:     'text-indigo-700',
  reminder:    'text-rose-700',
  paperwork:   'text-amber-700',
  visit:       'text-blue-700',
  workshop:    'text-slate-700',
  event:       'text-cyan-700',
};

const EVENT_TEXT: Record<string, string> = {
  appointment: 'Cita',
  test_drive:  'Prueba de conducción',
  followup:    'Seguimiento',
  delivery:    'Entrega',
  sale:        'Venta',
  purchase:    'Compra',
  call:        'Llamada',
  meeting:     'Reunión',
  reminder:    'Recordatorio',
  paperwork:   'Papeleo',
  visit:       'Visita',
  workshop:    'OT Taller',
  event:       'Evento',
};

/** Tipos fijos + configurables que salen en la leyenda lateral. */
function calendarLegendTypes(businessType?: string | null): string[] {
  if (isEventsCalendar(businessType)) {
    return ['event', 'meeting', 'call', 'visit', 'reminder'];
  }
  if (isDeliveryLikeCalendar(businessType)) {
    return ['appointment', 'delivery', 'followup', 'call', 'meeting', 'visit', 'reminder'];
  }
  return [
    'appointment', 'test_drive', 'followup', 'delivery', 'sale', 'purchase',
    'call', 'meeting', 'reminder', 'paperwork', 'visit', 'workshop',
  ];
}

function parseEventCalendarDate(fecha: string): Date | null {
  const raw = String(fecha || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = parseISO(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Construye el evento ICS/Google desde un ítem del calendario Vertial. */
function buildPhoneCalendarEvent(
  ev: Pick<CalendarEvent, 'id' | 'title' | 'subtitle' | 'date' | 'time' | 'route'>,
  appointment?: Appointment | null,
): CalendarIcsEvent {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const description = [
    ev.subtitle,
    appointment?.notes,
    appointment?.clientPhone ? `Tel: ${appointment.clientPhone}` : '',
    appointment?.clientEmail ? `Email: ${appointment.clientEmail}` : '',
    ev.route ? `Abrir en Vertial: ${origin}${ev.route}` : '',
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join('\n');

  return calendarIcsFromParts({
    uid: `vertial-${String(ev.id || 'event').replace(/[^a-zA-Z0-9_-]/g, '-')}@vertial.app`,
    title: ev.title || appointment?.clientName || 'Evento Vertial',
    description,
    location: appointment?.location || '',
    date: ev.date,
    timeHhMm: ev.time || appointment?.time || null,
  });
}

/** Añade al calendario del móvil (Google en Android/PC; Apple en iPhone/iPad). */
function addVertialCalendarItemToPhone(
  ev: Pick<CalendarEvent, 'id' | 'title' | 'subtitle' | 'date' | 'time' | 'route'>,
  appointment?: Appointment | null,
  options?: { silent?: boolean; force?: boolean; onMarked?: () => void },
): boolean {
  const eventId = String(ev.id || '').trim();
  if (eventId && !options?.force && isPhoneCalendarSent(eventId)) {
    if (!options?.silent) {
      toast.message('Ya en este móvil', {
        description: 'Si ya lo confirmaste en el calendario, no hace falta otra vez.',
        action: {
          label: 'Abrir otra vez',
          onClick: () => {
            addVertialCalendarItemToPhone(ev, appointment, {
              force: true,
              onMarked: options?.onMarked,
            });
          },
        },
      });
    }
    return false;
  }

  const channel = addEventToPhoneCalendar(buildPhoneCalendarEvent(ev, appointment));
  if (eventId) {
    markPhoneCalendarSent(eventId);
    options?.onMarked?.();
  }
  if (!options?.silent) {
    toast.success(
      channel === 'ics'
        ? 'Se abre Calendario — añade el evento para recibir avisos en el iPhone'
        : 'Se abre Google Calendar — confirma el evento para recibir avisos en el móvil',
    );
  }
  return true;
}

function addAppointmentToPhoneCalendar(
  appointment: Appointment,
  options?: { onMarked?: () => void },
): void {
  const date = parseISO(`${appointment.date}T${appointment.time || '12:00'}:00`);
  addVertialCalendarItemToPhone(
    {
      id: `appt-${appointment.id}`,
      title: appointment.clientName || 'Cita',
      subtitle: appointment.notes || '',
      date: Number.isNaN(date.getTime()) ? new Date(`${appointment.date}T12:00:00`) : date,
      time: appointment.time,
    },
    appointment,
    { onMarked: options?.onMarked },
  );
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  appointment: <User className="w-4 h-4" />,
  test_drive:  <Car className="w-4 h-4" />,
  followup:    <Clock className="w-4 h-4" />,
  delivery:    <Truck className="w-4 h-4" />,
  sale:        <Handshake className="w-4 h-4" />,
  purchase:    <ShoppingCart className="w-4 h-4" />,
  call:        <PhoneCall className="w-4 h-4" />,
  meeting:     <Users className="w-4 h-4" />,
  reminder:    <BellRing className="w-4 h-4" />,
  paperwork:   <FileSignature className="w-4 h-4" />,
  visit:       <User className="w-4 h-4" />,
  workshop:    <Wrench className="w-4 h-4" />,
};

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-300',
  confirmed: 'bg-green-100 text-green-800 border-green-300',
  cancelled: 'bg-red-100 text-red-800 border-red-300',
  completed: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-300',
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
  completed: 'Completada',
};

const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  visit:            'Visita',
  test_drive:       'Prueba de conducción',
  paperwork:        'Firmar documentos',
  delivery:         'Entrega',
  sale:             'Venta',
  purchase:         'Compra',
  call:             'Llamada',
  meeting:          'Reunión',
  reminder:         'Recordatorio',
  consultation:     'Consulta',
  treatment:        'Tratamiento',
  checkup:          'Revisión',
  followup_appt:    'Seguimiento',
  trial_class:      'Clase de prueba',
  enrollment:       'Inscripción',
  personal_session: 'Sesión personal',
  reservation:      'Reserva',
  checkin:          'Check-in',
  tour:             'Visita guiada',
  service:          'Servicio',
  assessment:       'Evaluación',
  class_session:    'Clase / Sesión',
};

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const WEEKDAYS_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// ─── Componente principal ─────────────────────────────────────────────────────

export function CalendarView() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { leads, sales, vehicles, user } = useApp();
  const { user: authUser, listUsers } = useAuth();
  const { currentBusiness } = useBusiness();
  const workshopScope = useMemo(
    () => ({ businessId: currentBusiness?.id }),
    [currentBusiness?.id],
  );
  const { activeWorkCenters } = useWorkCenters();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [mode, setMode] = useState<CalendarMode>('month');
  const [filterType, setFilterType] = useState<'all' | 'appointment' | 'test_drive' | 'followup' | 'delivery' | 'sale' | 'purchase' | 'call' | 'meeting' | 'reminder' | 'paperwork' | 'visit' | 'workshop' | 'event'>('all');
  const [showNewEventModal, setShowNewEventModal] = useState(false);
  const [showEventTypesSettings, setShowEventTypesSettings] = useState(false);
  const [filterPerson, setFilterPerson] = useState<string>('all');
  const [filterSalesPoint, setFilterSalesPoint] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [verticalEvents, setVerticalEvents] = useState<EventRecord[]>([]);
  const [loadingVerticalEvents, setLoadingVerticalEvents] = useState(false);

  const [showNewModal, setShowNewModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<Appointment | null>(null);
  const [showBookingConfig, setShowBookingConfig] = useState(false);
  const [bookingConfig, setBookingConfig] = useState<BookingConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  /** Cola “Todo al móvil”: Google solo deja 1 evento por pestaña. */
  const [phoneSendQueue, setPhoneSendQueue] = useState<CalendarEvent[] | null>(null);
  const [phoneSendIdx, setPhoneSendIdx] = useState(0);
  /** Refresco UI tras marcar “ya enviado” en este móvil. */
  const [phoneSentTick, setPhoneSentTick] = useState(0);
  const bumpPhoneSent = useCallback(() => setPhoneSentTick((n) => n + 1), []);
  const isEventOnPhone = useCallback(
    (eventId: string) => {
      void phoneSentTick;
      return isPhoneCalendarSent(eventId);
    },
    [phoneSentTick],
  );
  const [draggingAppointmentId, setDraggingAppointmentId] = useState<string | null>(null);

  useModalClose(showNewModal, () => setShowNewModal(false));
  useModalClose(!!showDetailModal, () => setShowDetailModal(null));
  useModalClose(showBookingConfig, () => setShowBookingConfig(false));

  useNotificationOpen(
    useCallback((entityId: string) => {
      const appt = appointments.find((a) => a.id === entityId);
      if (appt) setShowDetailModal(appt);
    }, [appointments]),
    !loadingAppointments,
  );

  const userId = authUser?.user_id || user?.id || '';
  const businessType = currentBusiness?.businessType || null;
  const deliveryCalendar = isDeliveryLikeCalendar(businessType);
  const eventsCalendar = isEventsCalendar(businessType);
  const eventsDataUserId = useMemo(
    () => (eventsCalendar ? resolveEventsUserId(authUser, currentBusiness) : ''),
    [eventsCalendar, authUser, currentBusiness],
  );

  const eventTypeStorageKey = useMemo(
    () => {
      const bt = businessType || 'default';
      return userId
        ? `calendar_event_types_v2:${userId}:${bt}`
        : `calendar_event_types_v2:anon:${bt}`;
    },
    [userId, businessType],
  );

  const [eventTypeConfig, setEventTypeConfig] = useState<EventTypeConfig>(() => defaultEventTypeConfig(businessType));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = safeParseJson<EventTypeConfig>(window.localStorage.getItem(eventTypeStorageKey));
    setEventTypeConfig({ ...defaultEventTypeConfig(businessType), ...(saved || {}) });
  }, [eventTypeStorageKey, businessType]);

  const persistEventTypeConfig = useCallback((next: EventTypeConfig) => {
    setEventTypeConfig(next);
    try { window.localStorage.setItem(eventTypeStorageKey, JSON.stringify(next)); } catch { /* ignore */ }
  }, [eventTypeStorageKey]);

  const getTypeLabel = useCallback((tpe: AppointmentType) => {
    const cfg = eventTypeConfig[String(tpe)];
    if (cfg?.label) return cfg.label;
    if (deliveryCalendar && tpe === 'delivery') return 'Reparto';
    return APPOINTMENT_TYPE_LABELS[tpe] || String(tpe);
  }, [eventTypeConfig, deliveryCalendar]);

  const getTypeColors = useCallback((tpe: AppointmentType) => {
    const cfg = eventTypeConfig[String(tpe)];
    const preset = cfg?.color ? EVENT_TYPE_COLOR_PRESETS[cfg.color] : null;
    if (preset) return preset;
    return {
      dot: EVENT_COLORS[tpe as keyof typeof EVENT_COLORS] || 'bg-gray-500',
      bg: EVENT_BG[tpe as keyof typeof EVENT_BG] || 'bg-gray-50',
      text: EVENT_TEXT_COLOR[tpe as keyof typeof EVENT_TEXT_COLOR] || 'text-gray-700',
    };
  }, [eventTypeConfig]);

  const enabledCustomEventTypes = useMemo(() => {
    const merged = { ...defaultEventTypeConfig(businessType), ...eventTypeConfig };
    return Object.entries(merged)
      .filter(([, v]) => v?.enabled)
      .map(([k]) => k);
  }, [eventTypeConfig, businessType]);

  const legendFilterTypes = useMemo(() => calendarLegendTypes(businessType), [businessType]);

  useEffect(() => {
    if (filterType === 'all') return;
    if (!legendFilterTypes.includes(filterType)) {
      setFilterType('all');
    }
  }, [filterType, legendFilterTypes]);

  const maxSalesPointsByPlan = useMemo(() => {
    const planId = authUser?.subscription?.selectedPlanId || 'basic';
    if (planId === 'pro') return 2;
    if (planId === 'normal') return 1;
    return 1;
  }, [authUser?.subscription?.selectedPlanId]);

  // ─── Cargar citas y equipo ───────────────────────────────────────────────
  const loadAppointments = useCallback(async () => {
    if (!userId) return;
    try {
      const appts = await listAppointmentsRequest(userId);
      setAppointments(appts.filter((a) => a.status !== 'cancelled'));
    } catch {
      // silent
    } finally {
      setLoadingAppointments(false);
    }
  }, [userId]);

  const loadWorkOrders = useCallback(async () => {
    if (!userId || isDeliveryLikeCalendar(businessType) || isEventsCalendar(businessType)) {
      setWorkOrders([]);
      return;
    }
    try {
      const orders = await listWorkOrdersRequest(userId, workshopScope);
      setWorkOrders(orders.filter(wo => wo.status !== 'cancelled' && wo.status !== 'invoiced'));
    } catch {
      // silent
    }
  }, [userId, workshopScope, businessType]);

  useEffect(() => { void loadAppointments(); void loadWorkOrders(); }, [loadAppointments, loadWorkOrders]);

  const loadVerticalEvents = useCallback(async () => {
    if (!eventsCalendar || !eventsDataUserId) {
      setVerticalEvents([]);
      setLoadingVerticalEvents(false);
      return;
    }
    setLoadingVerticalEvents(true);
    try {
      const list = await loadEvents(eventsDataUserId);
      setVerticalEvents(list.filter((e) => e.estado !== 'cancelado' && String(e.fecha || '').trim()));
    } catch {
      setVerticalEvents([]);
    } finally {
      setLoadingVerticalEvents(false);
    }
  }, [eventsCalendar, eventsDataUserId]);

  useEffect(() => { void loadVerticalEvents(); }, [loadVerticalEvents]);

  useEffect(() => {
    if (!authUser) return;
    listUsers()
      .then((users) => {
        setTeamMembers(users as TeamMember[]);
      })
      .catch(() => {});
  }, [authUser, listUsers]);

  // ─── Construir eventos ────────────────────────────────────────────────────
  const events = useMemo<CalendarEvent[]>(() => {
    const result: CalendarEvent[] = [];

    // Contrataciones de la vertical Eventos (fuente: fecha del evento)
    if (eventsCalendar) {
      verticalEvents.forEach((ev) => {
        const date = parseEventCalendarDate(String(ev.fecha || ''));
        if (!date) return;
        const tipoLabel = EVENT_TYPE_LABELS[(ev.tipo || 'otro') as keyof typeof EVENT_TYPE_LABELS] || 'Evento';
        const stageLabel = EVENT_STAGE_CONFIG[ev.estado]?.label || ev.estado;
        const bits = [ev.cliente, tipoLabel, ev.lugar, stageLabel].filter(Boolean);
        result.push({
          id: `evt-${ev._id}`,
          type: 'event',
          title: ev.nombre || 'Evento',
          subtitle: bits.join(' · '),
          date,
          color: EVENT_COLORS.event,
          route: `/saas/vertical/eventos/${encodeURIComponent(ev._id)}`,
        });
      });
    }

    // Citas y eventos persistentes
    appointments.forEach((a) => {
      if (!a.date) return;
      const date = parseISO(`${a.date}T${a.time || '00:00'}:00`);
      const isCustomEvent = ['sale', 'purchase', 'call', 'meeting', 'reminder', 'paperwork', 'visit', 'delivery'].includes(a.appointmentType);
      const evType = isCustomEvent
        ? (a.appointmentType as CalendarEvent['type'])
        : a.appointmentType === 'test_drive' ? 'test_drive' : 'appointment';

      // En verticales como delivery no queremos mezclar "Venta/Compra" (compraventa).
      if (deliveryCalendar && (evType === 'sale' || evType === 'purchase' || evType === 'test_drive' || evType === 'workshop')) return;
      if (eventsCalendar && (evType === 'sale' || evType === 'purchase' || evType === 'test_drive' || evType === 'workshop')) return;

      const color = (() => {
        if (evType === 'appointment' || evType === 'test_drive' || evType === 'followup' || evType === 'workshop' || evType === 'event') {
          return EVENT_COLORS[evType] || EVENT_COLORS.appointment;
        }
        const c = getTypeColors(evType as unknown as AppointmentType);
        return c.dot;
      })();

      result.push({
        id: `appt-${a.id}`,
        type: evType,
        title: a.clientName,
        subtitle: isCustomEvent
          ? (a.notes || getTypeLabel(a.appointmentType))
          : a.appointmentType === 'test_drive' && a.vehicleName
            ? `Prueba: ${a.vehicleName}`
            : getTypeLabel(a.appointmentType),
        date,
        time: a.time,
        color,
        appointmentId: a.id,
        assignedTo: a.assignedTo,
        assignedName: a.assignedName,
        status: a.status,
        vehicleName: a.vehicleName,
      });
    });

    // Seguimientos desde leads
    if (!eventsCalendar && (businessType === 'carDealership' || businessType === 'scrapyard' || businessType === 'workshop')) {
      leads
        .filter((l) => (l.status === 'contacted' || l.status === 'negotiation') && l.lastContact)
        .forEach((l) => {
          result.push({
            id: `lead-follow-${l.id}`,
            type: 'followup',
            title: 'Seguimiento',
            subtitle: l.vehicleInterest || 'Sin vehículo',
            date: new Date(l.lastContact!),
            color: EVENT_COLORS.followup,
            route: `/saas/clients?tab=leads&leadId=${encodeURIComponent(l.id)}`,
            assignedTo: l.responsible,
            assignedName: l.responsible,
          });
        });
    }

    // Entregas desde ventas
    if (!eventsCalendar && (businessType === 'carDealership' || businessType === 'scrapyard')) {
      sales
        .filter((s) => s.deliveryDate)
        .forEach((s) => {
          const vehicle = vehicles.find((v) => v.id === s.vehicleId);
          result.push({
            id: `sale-delivery-${s.id}`,
            type: 'delivery',
            title: 'Entrega',
            subtitle: vehicle?.registrationPlate || (vehicle ? `${vehicle.brand} ${vehicle.model}` : ''),
            date: new Date(s.deliveryDate!),
            color: EVENT_COLORS.delivery,
            route: `/saas/sales/${encodeURIComponent(s.id)}`,
          });
        });
    }

    // Órdenes de trabajo del taller (por fecha estimada de entrega)
    if (!deliveryCalendar && !eventsCalendar) {
      workOrders
      .filter((wo) => wo.estimatedCompletion)
      .forEach((wo) => {
        result.push({
          id: `wo-delivery-${wo._id}`,
          type: 'workshop',
          title: `${wo.vehicleBrand} ${wo.vehicleModel} (${wo.vehiclePlate})`,
          subtitle: `${wo.woNumber} · ${wo.clientName || 'Sin cliente'} · ${wo.responsible || 'Sin asignar'}`,
          date: new Date(wo.estimatedCompletion!),
          color: EVENT_COLORS.workshop,
          route: `/saas/workshop/${wo._id}`,
          assignedTo: wo.responsible,
          assignedName: wo.responsible,
        });
      });
    }

    // OTs recién creadas (entrada del vehículo = createdAt)
    if (!deliveryCalendar && !eventsCalendar) {
      workOrders
        .filter((wo) => wo.status === 'pending' || wo.status === 'in_progress')
        .forEach((wo) => {
          result.push({
            id: `wo-entry-${wo._id}`,
            type: 'workshop',
            title: `Entrada: ${wo.vehicleBrand} ${wo.vehicleModel}`,
            subtitle: `${wo.woNumber} · ${wo.clientName || ''} · ${wo.vehiclePlate}`,
            date: new Date(wo.createdAt),
            color: EVENT_COLORS.workshop,
            route: `/saas/workshop/${wo._id}`,
            assignedTo: wo.responsible,
            assignedName: wo.responsible,
          });
        });
    }

    return result;
  }, [appointments, leads, sales, vehicles, workOrders, verticalEvents, businessType, deliveryCalendar, eventsCalendar, getTypeLabel, getTypeColors]);

  const filteredEvents = useMemo(() => {
    let evs = events;
    if (filterType !== 'all') evs = evs.filter((e) => e.type === filterType);
    if (filterPerson !== 'all') evs = evs.filter((e) => e.assignedTo === filterPerson);
    if (filterSalesPoint !== 'all') {
      const spName = activeWorkCenters.find((wc) => wc.id === filterSalesPoint || (wc as any)._id === filterSalesPoint)?.name || '';
      if (spName) {
        evs = evs.filter((e) => {
          // Solo filtramos citas internas por "location" (nombre del punto de venta).
          if (e.type !== 'appointment') return true;
          const apptId = e.appointmentId || e.id;
          const appt = appointments.find((a) => a.id === apptId);
          const loc = (appt?.location || '').trim();
          return loc === spName;
        });
      }
    }
    return evs;
  }, [events, filterType, filterPerson, filterSalesPoint, activeWorkCenters, appointments]);

  // ─── Navegación ───────────────────────────────────────────────────────────
  const prev = () => setCurrentDate((d) => mode === 'month' ? subMonths(d, 1) : subWeeks(d, 1));
  const next = () => setCurrentDate((d) => mode === 'month' ? addMonths(d, 1) : addWeeks(d, 1));
  const goToday = () => setCurrentDate(new Date());

  const headerLabel = mode === 'month'
    ? format(currentDate, 'MMMM yyyy', { locale: es })
    : `Semana del ${format(startOfWeek(currentDate, { weekStartsOn: 1 }), "d 'de' MMM", { locale: es })}`;

  const days = useMemo(() => {
    if (mode === 'month') {
      const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
      const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    }
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate, mode]);

  const eventsForDay = (day: Date) => filteredEvents.filter((e) => isSameDay(e.date, day));
  const selectedDayEvents = selectedDay ? filteredEvents.filter((e) => isSameDay(e.date, selectedDay)) : [];

  const upcomingForPhone = useMemo(
    () =>
      filteredEvents
        .filter((e) => isAfter(e.date, new Date()) || isSameDay(e.date, new Date()))
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(0, 40),
    [filteredEvents],
  );

  const upcomingPendingPhone = useMemo(
    () => upcomingForPhone.filter((e) => !isEventOnPhone(e.id)),
    [upcomingForPhone, isEventOnPhone],
  );

  const sendNextUpcomingToPhone = useCallback(() => {
    const pending = upcomingPendingPhone;
    if (pending.length === 0) {
      if (upcomingForPhone.length > 0) {
        toast.message('Todos ya están en este móvil');
      } else {
        toast.message(eventsCalendar ? 'No hay eventos próximos' : 'No hay citas próximas');
      }
      return;
    }

    // iPhone/iPad: un solo .ics con todos los pendientes (Calendario Apple).
    if (isLikelyAppleMobileDevice()) {
      const icsList = pending.map((ev) => {
        const appt = ev.appointmentId ? appointments.find((a) => a.id === ev.appointmentId) : null;
        return buildPhoneCalendarEvent(ev, appt);
      });
      addEventsToPhoneCalendar(icsList);
      pending.forEach((ev) => markPhoneCalendarSent(ev.id));
      bumpPhoneSent();
      setPhoneSendQueue(null);
      setPhoneSendIdx(0);
      toast.success(
        pending.length === 1
          ? 'Se abre Calendario — añade el evento en el iPhone'
          : `Se abre Calendario — añade los ${pending.length} eventos en el iPhone`,
      );
      return;
    }

    // Android/PC: Google (uno a uno).
    let queue = phoneSendQueue;
    let idx = phoneSendIdx;

    if (!queue) {
      queue = pending;
      idx = 0;
      setPhoneSendQueue(queue);
      setPhoneSendIdx(0);
    }

    const ev = queue[idx];
    if (!ev) {
      setPhoneSendQueue(null);
      setPhoneSendIdx(0);
      return;
    }

    const appt = ev.appointmentId ? appointments.find((a) => a.id === ev.appointmentId) : null;
    const opened = addVertialCalendarItemToPhone(ev, appt, {
      silent: true,
      onMarked: bumpPhoneSent,
    });

    const next = idx + 1;
    if (next >= queue.length) {
      setPhoneSendQueue(null);
      setPhoneSendIdx(0);
      toast.success(
        queue.length === 1
          ? opened
            ? 'Confirma en Google Calendar para recibir avisos'
            : 'Ya estaba en este móvil'
          : `Listo (${queue.length}) — confirma el último en Google`,
      );
      return;
    }

    setPhoneSendIdx(next);
    toast.success(
      opened
        ? `Abierto ${next} de ${queue.length} — confirma y pulsa Siguiente`
        : `Ya estaba (${next} de ${queue.length}) — pulsa Siguiente`,
    );
  }, [
    appointments,
    bumpPhoneSent,
    eventsCalendar,
    phoneSendIdx,
    phoneSendQueue,
    upcomingForPhone.length,
    upcomingPendingPhone,
  ]);

  // ─── Booking config ───────────────────────────────────────────────────────
  const openBookingConfig = async () => {
    if (!userId) return;
    try {
      const cfg = await getBookingConfigRequest(userId);
      setBookingConfig(cfg);
      setShowBookingConfig(true);
    } catch {
      setBookingConfig({
        enabled: true, displayName: '', slotDuration: 60, bufferMinutes: 15, maxDaysAhead: 30,
        appointmentTypes: ['visit', 'test_drive', 'paperwork', 'delivery'],
        workingHours: {
          mon: { enabled: true, start: '09:00', end: '18:00' },
          tue: { enabled: true, start: '09:00', end: '18:00' },
          wed: { enabled: true, start: '09:00', end: '18:00' },
          thu: { enabled: true, start: '09:00', end: '18:00' },
          fri: { enabled: true, start: '09:00', end: '18:00' },
          sat: { enabled: true, start: '09:00', end: '14:00' },
          sun: { enabled: false, start: '09:00', end: '14:00' },
        },
      });
      setShowBookingConfig(true);
    }
  };

  const handleSaveBookingConfig = async () => {
    if (!userId || !bookingConfig) return;
    setSavingConfig(true);
    try {
      await saveBookingConfigRequest(userId, bookingConfig);
      setShowBookingConfig(false);
    } catch {
      // silent
    } finally {
      setSavingConfig(false);
    }
  };

  const bookingUrl = `${window.location.origin}/booking/${userId}`;

  // ─── Actualizar estado de cita ────────────────────────────────────────────
  const handleStatusChange = async (appt: Appointment, status: AppointmentStatus) => {
    if (!userId) return;
    try {
      const updated = await updateAppointmentRequest(userId, { ...appt, status });
      if (updated) {
        setAppointments((prev) => prev.map((a) => a.id === updated.id ? updated : a));
        setShowDetailModal(updated);
      }
    } catch {
      // silent
    }
  };

  const handleDeleteAppointment = async (apptId: string) => {
    if (!userId) return;
    try {
      await deleteAppointmentRequest(userId, apptId);
      setAppointments((prev) => prev.filter((a) => a.id !== apptId));
      setShowDetailModal(null);
    } catch {
      // silent
    }
  };

  const handleAppointmentDrop = async (appointmentId: string, targetDay: Date) => {
    if (!userId) return;
    const targetDate = format(targetDay, 'yyyy-MM-dd');
    const current = appointments.find((a) => a.id === appointmentId);
    if (!current || current.date === targetDate) return;

    const previousAppointments = appointments;
    const optimistic = appointments.map((a) => (
      a.id === appointmentId ? { ...a, date: targetDate } : a
    ));
    setAppointments(optimistic);
    if (showDetailModal?.id === appointmentId) {
      setShowDetailModal((prev) => (prev ? { ...prev, date: targetDate } : prev));
    }

    try {
      const updated = await updateAppointmentRequest(userId, { id: appointmentId, date: targetDate });
      if (updated) {
        setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        if (showDetailModal?.id === updated.id) {
          setShowDetailModal(updated);
        }
      }
    } catch {
      setAppointments(previousAppointments);
      if (showDetailModal?.id === appointmentId) {
        const previous = previousAppointments.find((a) => a.id === appointmentId) || null;
        setShowDetailModal(previous);
      }
    }
  };

  const upcomingList = useMemo(
    () =>
      filteredEvents
        .filter((e) => isAfter(e.date, new Date()))
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(0, 6),
    [filteredEvents],
  );

  const upcomingLoading = loadingAppointments || (eventsCalendar && loadingVerticalEvents);

  const renderUpcomingPanel = (placement: 'mobile-top' | 'sidebar') => {
    const isMobileTop = placement === 'mobile-top';
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
        <div className="mb-3 flex flex-col gap-2.5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 min-w-0">
            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="truncate">
              {eventsCalendar ? 'Próximos eventos' : 'Próximas citas'}
            </span>
          </h3>
          <button
            type="button"
            onClick={sendNextUpcomingToPhone}
            disabled={!phoneSendQueue && upcomingPendingPhone.length === 0}
            className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--v-blue,#2563eb)] px-3 text-xs font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-40 ${
              isMobileTop ? 'min-h-11' : 'min-h-10 py-2'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            {phoneSendQueue
              ? `Siguiente (${phoneSendIdx + 1}/${phoneSendQueue.length})`
              : upcomingForPhone.length > 0 && upcomingPendingPhone.length === 0
                ? 'Ya en el móvil'
                : 'Todo al móvil'}
          </button>
        </div>
        {upcomingLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-gray-400 dark:text-gray-500" />
          </div>
        ) : (
          <>
            {upcomingList.map((ev) => (
              <div
                key={ev.id}
                className="border-b border-gray-100 dark:border-gray-700 last:border-0 py-2"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (ev.appointmentId) {
                      const appt = appointments.find((a) => a.id === ev.appointmentId);
                      if (appt) setShowDetailModal(appt);
                    } else if (ev.route) {
                      navigate(ev.route);
                    }
                  }}
                  className="w-full text-left flex items-center gap-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-750 rounded-lg px-1 transition-colors min-h-11"
                >
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${ev.color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{ev.title}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">
                      {format(ev.date, 'd MMM', { locale: es })}
                      {ev.time && ` · ${ev.time}`}
                    </p>
                  </div>
                  {ev.type === 'test_drive' && <Car className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const appt = ev.appointmentId
                      ? appointments.find((a) => a.id === ev.appointmentId)
                      : null;
                    addVertialCalendarItemToPhone(ev, appt, { onMarked: bumpPhoneSent });
                  }}
                  className={`mt-0.5 ml-5 inline-flex items-center gap-1 min-h-9 text-[11px] font-semibold hover:underline ${
                    isEventOnPhone(ev.id)
                      ? 'text-stone-500 dark:text-stone-400'
                      : 'text-[var(--v-blue,#2563eb)]'
                  }`}
                >
                  <Smartphone className="w-3 h-3" />
                  {isEventOnPhone(ev.id) ? 'Ya en el móvil' : 'Al móvil'}
                </button>
              </div>
            ))}
            {upcomingList.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                {eventsCalendar ? 'Sin eventos próximos' : 'Sin citas próximas'}
              </p>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <Layout title={t('calendar.title')} subtitle={t('calendar.subtitle')} noPadding>
      <div className="flex flex-col md:flex-row gap-0 min-h-[calc(100vh-80px)]">

        {/* Móvil: próximos arriba (antes del calendario) */}
        <div className="md:hidden p-3 pb-0 shrink-0">
          {renderUpcomingPanel('mobile-top')}
        </div>

        {/* ─── Panel principal ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 bg-white dark:bg-gray-800 md:border-r border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">

          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={prev}
                className="p-2.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors shrink-0"
                aria-label="Anterior"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
              <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100 min-w-0 flex-1 sm:flex-none sm:w-48 text-center capitalize truncate">
                {headerLabel}
              </h2>
              <button
                type="button"
                onClick={next}
                className="p-2.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors shrink-0"
                aria-label="Siguiente"
              >
                <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="ml-0.5 sm:ml-1 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-[var(--v-blue,#2563eb)] bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shrink-0"
              >
                Hoy
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">

              {/* Filtro por persona */}
              {teamMembers.length > 1 && (
                <select
                  value={filterPerson}
                  onChange={(e) => setFilterPerson(e.target.value)}
                  className="text-xs px-2.5 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-blue-400"
                >
                  <option value="all">Todo el equipo</option>
                  {teamMembers.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.fullName || m.email || m.user_id}
                    </option>
                  ))}
                </select>
              )}

              {/* Punto de venta: selector si hay >1 y plan permite, si no CTA PRO */}
              {activeWorkCenters.length > 1 && maxSalesPointsByPlan > 1 ? (
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    <Store className="w-3.5 h-3.5" /> Punto de venta
                  </span>
                  <select
                    value={filterSalesPoint}
                    onChange={(e) => setFilterSalesPoint(e.target.value)}
                    className="text-xs px-2.5 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-blue-400"
                    title="Ver calendario por punto de venta"
                  >
                    <option value="all">Todos</option>
                    {activeWorkCenters.map((wc) => (
                      <option key={wc.id} value={wc.id}>{wc.name}</option>
                    ))}
                  </select>
                </div>
              ) : isIosCustomerAccessOnlyApp() ? (
                <span
                  className="text-xs px-3 py-1.5 rounded-lg font-bold text-amber-800 bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-800 flex items-center gap-1.5"
                  title="Multi-tienda requiere plan Pro (no disponible contratar en iOS)"
                >
                  <Crown className="w-3.5 h-3.5" />
                  Multi-tienda (PRO)
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate('/saas/settings/facturacion')}
                  className="text-xs px-3 py-1.5 rounded-lg font-bold text-white bg-gradient-to-r from-amber-500 to-fuchsia-600 hover:from-amber-600 hover:to-fuchsia-700 shadow-sm hover:shadow transition-all flex items-center gap-1.5"
                  title="Multi-tienda: ver calendario por punto de venta (PRO)"
                >
                  <Crown className="w-3.5 h-3.5" />
                  Multi-tienda (PRO)
                </button>
              )}

              {/* Modo vista */}
              <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                {(['month', 'week'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                      mode === m
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {m === 'month' ? 'Mes' : 'Semana'}
                  </button>
                ))}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center justify-center w-9 h-9 shrink-0 bg-gray-900 hover:bg-black text-white rounded-lg transition-colors"
                    title="Nuevo"
                    aria-label="Crear nuevo: evento o cita"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[11rem]">
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => {
                      if (eventsCalendar) {
                        navigate('/saas/vertical/eventos/nueva-contratacion');
                        return;
                      }
                      setShowNewEventModal(true);
                    }}
                  >
                    <Calendar className="w-4 h-4" />
                    {eventsCalendar ? 'Nueva contratación' : 'Nuevo evento'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onSelect={() => setShowNewModal(true)}
                  >
                    <User className="w-4 h-4" />
                    Nueva cita
                  </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onSelect={() => setShowEventTypesSettings(true)}
                >
                  <Settings className="w-4 h-4" />
                  Tipos de evento
                </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Cabecera días */}
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
            {WEEKDAYS.map((d, i) => (
              <div key={d} className="py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <span className="sm:hidden">{WEEKDAYS_SHORT[i]}</span>
                <span className="hidden sm:inline">{d}</span>
              </div>
            ))}
          </div>

          {/* Grid de días */}
          <div className={`grid grid-cols-7 flex-1 divide-x divide-y divide-gray-100 dark:divide-gray-700 ${mode === 'week' ? 'grid-rows-1' : 'auto-rows-fr'}`}>
            {days.map((day, idx) => {
              const dayEvents = eventsForDay(day);
              const isSelected = selectedDay && isSameDay(day, selectedDay);
              const isCurrentMonth = isSameMonth(day, currentDate);

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDay(isSameDay(day, selectedDay || new Date(0)) ? null : day)}
                  onDragOver={(e) => {
                    if (!draggingAppointmentId) return;
                    e.preventDefault();
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const droppedAppointmentId = e.dataTransfer.getData('text/appointment-id') || draggingAppointmentId;
                    setDraggingAppointmentId(null);
                    if (!droppedAppointmentId) return;
                    await handleAppointmentDrop(droppedAppointmentId, day);
                  }}
                  className={`p-1 sm:p-2 min-h-[3.25rem] sm:min-h-0 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-750'
                  } ${draggingAppointmentId ? 'ring-1 ring-blue-200 dark:ring-blue-700/60' : ''} ${
                    !isCurrentMonth && mode === 'month' ? 'opacity-40' : ''
                  }`}
                >
                  <div className={`text-[11px] sm:text-xs font-semibold mb-0.5 sm:mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday(day) ? 'bg-[var(--v-blue,#2563eb)] text-white' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {format(day, 'd')}
                  </div>
                  {/* Móvil: solo contador (el detalle al tocar el día) */}
                  {dayEvents.length > 0 && (
                    <div className="sm:hidden flex justify-center">
                      <span className="min-w-[1.1rem] h-4 px-1 rounded-full bg-[var(--v-blue,#2563eb)] text-white text-[9px] font-bold leading-4 text-center">
                        {dayEvents.length}
                      </span>
                    </div>
                  )}
                  {/* Tablet/PC: chips con título */}
                  <div className="hidden sm:block space-y-0.5">
                    {dayEvents.slice(0, mode === 'week' ? 8 : 3).map((ev) => (
                      <button
                        key={ev.id}
                        draggable={Boolean(ev.appointmentId)}
                        onDragStart={(e) => {
                          if (!ev.appointmentId) return;
                          setDraggingAppointmentId(ev.appointmentId);
                          e.dataTransfer.setData('text/appointment-id', ev.appointmentId);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => setDraggingAppointmentId(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (ev.appointmentId) {
                            const appt = appointments.find((a) => a.id === ev.appointmentId);
                            if (appt) setShowDetailModal(appt);
                          } else if (ev.route) {
                            navigate(ev.route);
                          }
                        }}
                        className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-semibold text-white truncate ${ev.color} hover:opacity-80 transition-opacity ${
                          ev.appointmentId ? 'cursor-move' : ''
                        }`}
                        title={`${ev.title}${ev.time ? ` · ${ev.time}` : ''}`}
                      >
                        {ev.time && <span className="opacity-80 mr-1">{ev.time}</span>}
                        {ev.title}
                      </button>
                    ))}
                    {dayEvents.length > (mode === 'week' ? 8 : 3) && (
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 pl-1">
                        +{dayEvents.length - (mode === 'week' ? 8 : 3)} más
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Panel lateral ───────────────────────────────────────────── */}
        <div className="md:w-64 xl:w-72 shrink-0 space-y-4 p-3 sm:p-4 overflow-y-auto">

          {/* Acciones rápidas */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Acciones rápidas</h3>
            <div className="space-y-2">
              <button
                onClick={() => {
                  if (eventsCalendar) {
                    navigate('/saas/vertical/eventos/nueva-contratacion');
                    return;
                  }
                  setShowNewEventModal(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 min-h-11 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                {eventsCalendar ? 'Nueva contratación' : 'Nuevo evento'}
              </button>
              <button
                onClick={() => setShowNewModal(true)}
                className="w-full flex items-center gap-2 px-3 py-2.5 min-h-11 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-400 rounded-xl text-sm font-medium transition-colors"
              >
                <User className="w-4 h-4" />
                Nueva cita con cliente
              </button>
              {!deliveryCalendar && !eventsCalendar && (
              <button
                onClick={openBookingConfig}
                className="w-full flex items-center gap-2 px-3 py-2.5 min-h-11 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium transition-colors"
              >
                <Link className="w-4 h-4" />
                Enlace de reserva
              </button>
              )}
            </div>
          </div>

          {/* Leyenda */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                Tipos de evento
              </h3>
              <button
                type="button"
                onClick={() => setShowEventTypesSettings(true)}
                className="p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-500 dark:text-gray-400"
                title="Configurar tipos de evento"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-1.5">
              {legendFilterTypes
                .filter((ft) => {
                  if (ft === 'appointment' || ft === 'followup' || ft === 'event') return true;
                  if (!deliveryCalendar && !eventsCalendar && (ft === 'test_drive' || ft === 'workshop')) return true;
                  return enabledCustomEventTypes.includes(String(ft));
                })
                .map((ft) => {
                  const c = getTypeColors(ft as AppointmentType);
                  const label = (ft === 'appointment' || ft === 'test_drive' || ft === 'followup' || ft === 'workshop' || ft === 'event')
                    ? (deliveryCalendar && ft === 'appointment' ? 'Cita' : EVENT_TEXT[ft])
                    : getTypeLabel(ft as AppointmentType);
                  return (
                <button
                  key={ft}
                  onClick={() => setFilterType(filterType === ft ? 'all' : ft as typeof filterType)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-xl transition-colors ${
                    filterType === ft ? `${c.bg} ${c.text}` : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${c.dot}`} />
                  <span className="text-sm text-gray-600 dark:text-gray-300 flex-1 text-left">{label}</span>
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">
                    {events.filter((e) => e.type === ft).length}
                  </span>
                </button>
                  );
                })}
            </div>
          </div>

          {/* Eventos del día */}
          {selectedDay && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                {format(selectedDay, "EEEE d 'de' MMMM", { locale: es })}
              </h3>
              {selectedDayEvents.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Sin eventos este día</p>
              ) : (
                <div className="space-y-2">
                  {selectedDayEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-xl border border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (ev.appointmentId) {
                            const appt = appointments.find((a) => a.id === ev.appointmentId);
                            if (appt) setShowDetailModal(appt);
                          } else if (ev.route) {
                            navigate(ev.route);
                          }
                        }}
                        className="w-full text-left p-3 pb-2"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-2 h-2 rounded-full ${ev.color}`} />
                          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            {(ev.type === 'appointment' || ev.type === 'test_drive' || ev.type === 'followup' || ev.type === 'workshop' || ev.type === 'event')
                              ? EVENT_TEXT[ev.type]
                              : getTypeLabel(ev.type as unknown as AppointmentType)}
                          </span>
                          {ev.time && (
                            <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{ev.time}</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{ev.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{ev.subtitle}</p>
                        {ev.assignedName && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1">
                            <User className="w-3 h-3" /> {ev.assignedName}
                          </p>
                        )}
                        {ev.status && (
                          <span className={`mt-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${STATUS_COLORS[ev.status]}`}>
                            {STATUS_LABELS[ev.status]}
                          </span>
                        )}
                      </button>
                      <div className="px-3 pb-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const appt = ev.appointmentId
                              ? appointments.find((a) => a.id === ev.appointmentId)
                              : null;
                            addVertialCalendarItemToPhone(ev, appt, { onMarked: bumpPhoneSent });
                          }}
                          className={`inline-flex items-center gap-1.5 min-h-9 text-xs font-semibold hover:underline ${
                            isEventOnPhone(ev.id)
                              ? 'text-stone-500 dark:text-stone-400'
                              : 'text-[var(--v-blue,#2563eb)]'
                          }`}
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          {isEventOnPhone(ev.id) ? 'Ya en el móvil' : 'Al móvil'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Próximos: en tablet/PC va aquí; en móvil ya está arriba */}
          <div className="hidden md:block">
            {renderUpcomingPanel('sidebar')}
          </div>
        </div>
      </div>

      {/* ─── Modal Nuevo Evento ───────────────────────────────────────────────── */}
      {showNewEventModal && (
        <NewEventModal
          userId={userId}
          businessType={businessType}
          teamMembers={teamMembers}
          eventTypeConfig={eventTypeConfig}
          onClose={() => setShowNewEventModal(false)}
          onCreated={(appt) => {
            setAppointments((prev) => [...prev, appt]);
            setShowNewEventModal(false);
          }}
        />
      )}

      {/* ─── Modal Tipos de evento ───────────────────────────────────────────── */}
      {showEventTypesSettings && (
        <EventTypesSettingsModal
          businessType={businessType}
          config={eventTypeConfig}
          onChange={persistEventTypeConfig}
          onClose={() => setShowEventTypesSettings(false)}
        />
      )}

      {/* ─── Modal Nueva Cita ─────────────────────────────────────────────────── */}
      {showNewModal && (
        <NewAppointmentModal
          userId={userId}
          vehicles={vehicles}
          teamMembers={teamMembers}
          onClose={() => setShowNewModal(false)}
          onCreated={(appt) => {
            setAppointments((prev) => [...prev, appt]);
            setShowNewModal(false);
          }}
        />
      )}

      {/* ─── Modal Detalle de Cita ────────────────────────────────────────────── */}
      {showDetailModal && (
        <AppointmentDetailModal
          appointment={showDetailModal}
          onClose={() => setShowDetailModal(null)}
          onStatusChange={(status) => handleStatusChange(showDetailModal, status)}
          onDelete={() => handleDeleteAppointment(showDetailModal.id)}
          onAddToPhoneCalendar={() => {
            addAppointmentToPhoneCalendar(showDetailModal, { onMarked: bumpPhoneSent });
          }}
          phoneAlreadySent={isEventOnPhone(`appt-${showDetailModal.id}`)}
        />
      )}

      {/* ─── Modal Config Booking ─────────────────────────────────────────────── */}
      {showBookingConfig && bookingConfig && (
        <BookingConfigModal
          config={bookingConfig}
          bookingUrl={bookingUrl}
          saving={savingConfig}
          onChange={setBookingConfig}
          onSave={handleSaveBookingConfig}
          onClose={() => setShowBookingConfig(false)}
        />
      )}
    </Layout>
  );
}

// ─── Modal: Nuevo Evento ──────────────────────────────────────────────────────

// (Se genera dinámicamente dentro de NewEventModal según configuración del usuario)

function NewEventModal({
  userId,
  businessType,
  teamMembers,
  eventTypeConfig,
  onClose,
  onCreated,
}: {
  userId: string;
  businessType: string | null;
  teamMembers: TeamMember[];
  eventTypeConfig: EventTypeConfig;
  onClose: () => void;
  onCreated: (appt: Appointment) => void;
}) {
  const deliveryCalendar = isDeliveryLikeCalendar(businessType);
  const [form, setForm] = useState({
    eventType: (deliveryCalendar ? 'delivery' : 'sale') as AppointmentType,
    title: '',
    date: '',
    time: '',
    notes: '',
    assignedTo: userId,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const enabledTypes = useMemo(() => {
    const merged = { ...defaultEventTypeConfig(businessType), ...eventTypeConfig };
    return Object.entries(merged)
      .filter(([, v]) => v?.enabled)
      .map(([k]) => k);
  }, [eventTypeConfig, businessType]);

  const getLabel = useCallback((tpe: AppointmentType) => {
    const merged = { ...defaultEventTypeConfig(businessType), ...eventTypeConfig };
    return merged[String(tpe)]?.label || APPOINTMENT_TYPE_LABELS[tpe] || String(tpe);
  }, [eventTypeConfig, businessType]);

  const getColors = useCallback((tpe: AppointmentType) => {
    const merged = { ...defaultEventTypeConfig(businessType), ...eventTypeConfig };
    const cfg = merged[String(tpe)];
    const preset = cfg?.color ? EVENT_TYPE_COLOR_PRESETS[cfg.color] : null;
    if (preset) return preset;
    return {
      dot: EVENT_COLORS[tpe as keyof typeof EVENT_COLORS] || 'bg-gray-500',
      bg: EVENT_BG[tpe as keyof typeof EVENT_BG] || 'bg-gray-50',
      text: EVENT_TEXT_COLOR[tpe as keyof typeof EVENT_TEXT_COLOR] || 'text-gray-700',
    };
  }, [eventTypeConfig, businessType]);

  const categoryGroups = useMemo(() => {
    const raw = deliveryCalendar
      ? [
          {
            label: 'Operación',
            items: [
              { type: 'delivery' as AppointmentType, icon: Truck },
              { type: 'paperwork' as AppointmentType, icon: FileSignature },
            ],
          },
          {
            label: 'Comunicación',
            items: [
              { type: 'call' as AppointmentType, icon: PhoneCall },
              { type: 'meeting' as AppointmentType, icon: Users },
              { type: 'visit' as AppointmentType, icon: User },
              { type: 'reminder' as AppointmentType, icon: BellRing },
            ],
          },
        ]
      : [
          {
            label: 'Operaciones',
            items: [
              { type: 'sale' as AppointmentType, icon: Handshake },
              { type: 'purchase' as AppointmentType, icon: ShoppingCart },
              { type: 'delivery' as AppointmentType, icon: Truck },
              { type: 'paperwork' as AppointmentType, icon: FileSignature },
            ],
          },
          {
            label: 'Comunicación',
            items: [
              { type: 'call' as AppointmentType, icon: PhoneCall },
              { type: 'meeting' as AppointmentType, icon: Users },
              { type: 'visit' as AppointmentType, icon: User },
              { type: 'reminder' as AppointmentType, icon: BellRing },
            ],
          },
        ];

    return raw
      .map((g) => ({
        ...g,
        items: g.items
          .filter((it) => enabledTypes.includes(String(it.type)))
          .map((it) => ({
            ...it,
            label: getLabel(it.type),
            colors: getColors(it.type),
          })),
      }))
      .filter((g) => g.items.length > 0);
  }, [enabledTypes, getColors, getLabel, deliveryCalendar]);

  useEffect(() => {
    if (!enabledTypes.includes(String(form.eventType))) {
      const fallback = (enabledTypes[0] || (deliveryCalendar ? 'delivery' : 'sale')) as AppointmentType;
      setForm((f) => ({ ...f, eventType: fallback }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledTypes.join('|'), deliveryCalendar]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const selectedCat = categoryGroups.flatMap((g) => g.items).find((i) => i.type === form.eventType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setError('El título es obligatorio');
    if (!form.date) return setError('La fecha es obligatoria');
    if (!form.time) return setError('La hora es obligatoria');

    setSaving(true);
    setError('');
    try {
      const member = teamMembers.find((m) => m.user_id === form.assignedTo);
      const appt = await createAppointmentRequest(userId, {
        clientName: form.title,
        date: form.date,
        time: form.time,
        notes: form.notes,
        location: '',
        appointmentType: form.eventType,
        assignedTo: form.assignedTo,
        assignedName: member?.fullName || member?.email || form.assignedTo,
        status: 'pending',
        source: 'internal',
        clientPhone: '',
        clientEmail: '',
      } as Parameters<typeof createAppointmentRequest>[1]);
      if (appt) onCreated(appt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el evento');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
        <div className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto">

          {/* Header */}
          <div className="sticky top-0 bg-gray-900 px-6 py-5 rounded-t-3xl sm:rounded-t-3xl flex items-center justify-between z-10">
            <div>
              <h2 className="text-lg font-bold text-white">Nuevo evento</h2>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-0.5">Añade un próximo evento al calendario</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          <form id="new-event-form" onSubmit={handleSubmit} className="p-6 space-y-5">

            {/* Tipo de evento — selector visual */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Tipo de evento
              </label>
              {categoryGroups.map((group) => (
                <div key={group.label} className="mb-3">
                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">{group.label}</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {group.items.map(({ type, label, icon: Icon, colors }) => {
                      const isSelected = form.eventType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, eventType: type }))}
                          className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-2xl border-2 text-xs font-semibold transition-all ${
                            isSelected
                              ? `${colors.dot} border-transparent text-white shadow-md scale-[1.03]`
                              : `${colors.bg} ${colors.text} border-transparent hover:border-current`
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          <span className="leading-tight text-center">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Título */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Título *
              </label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={
                  'Título del evento'
                }
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-gray-900 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            {/* Fecha y Hora */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                  Fecha *
                </label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-gray-900 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                  Hora *
                </label>
                <input
                  type="time"
                  required
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-gray-900 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            {/* Asignado a */}
            {teamMembers.length > 1 && (
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                  Asignado a
                </label>
                <select
                  value={form.assignedTo}
                  onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-gray-900 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {teamMembers.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.fullName || m.email}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Notas */}
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Notas
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="Información adicional…"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-gray-900 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Vista previa del chip */}
            {form.title && form.date && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${getColors(form.eventType).bg}`}>
                <div className={`w-2 h-2 rounded-full ${getColors(form.eventType).dot}`} />
                <span className={`text-xs font-semibold ${getColors(form.eventType).text}`}>
                  {getLabel(form.eventType)}
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-400 flex-1 truncate">{form.title}</span>
                {form.date && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {new Date(form.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    {form.time && ` · ${form.time}`}
                  </span>
                )}
              </div>
            )}

          </form>

          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3 rounded-b-3xl sm:rounded-b-3xl">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium text-sm hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="new-event-form"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Guardando…' : 'Añadir evento'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Modal: Nueva Cita ────────────────────────────────────────────────────────

function NewAppointmentModal({
  userId,
  vehicles,
  teamMembers,
  onClose,
  onCreated,
}: {
  userId: string;
  vehicles: { id: string; brand: string; model: string; registrationPlate: string; status: string }[];
  teamMembers: TeamMember[];
  onClose: () => void;
  onCreated: (appt: Appointment) => void;
}) {
  const [form, setForm] = useState({
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    date: '',
    time: '',
    location: 'Concesionario Principal',
    appointmentType: 'visit' as AppointmentType,
    notes: '',
    assignedTo: userId,
    assignedName: '',
    vehicleId: '',
    vehicleName: '',
    vehiclePlate: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const availableVehicles = vehicles.filter((v) => v.status === 'available' || v.status === 'reserved');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientName.trim()) return setError('El nombre del cliente es obligatorio');
    if (!form.date) return setError('La fecha es obligatoria');
    if (!form.time) return setError('La hora es obligatoria');
    if (form.appointmentType === 'test_drive' && !form.vehicleId) return setError('Selecciona el vehículo para la prueba');

    setSaving(true);
    setError('');
    try {
      const member = teamMembers.find((m) => m.user_id === form.assignedTo);
      const appt = await createAppointmentRequest(userId, {
        ...form,
        assignedName: member?.fullName || member?.email || form.assignedTo,
        status: 'pending',
        source: 'internal',
      } as Parameters<typeof createAppointmentRequest>[1]);
      if (appt) onCreated(appt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear la cita');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 rounded-t-2xl flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Nueva cita</h2>
              <p className="text-blue-100 text-sm mt-0.5">Programa una cita con un cliente</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          <form id="new-appointment-form" onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Tipo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo de cita</label>
              <div className="grid grid-cols-2 gap-2">
                {(['visit', 'test_drive', 'paperwork', 'delivery'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm({ ...form, appointmentType: type })}
                    className={`px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                      form.appointmentType === type
                        ? type === 'test_drive' ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    {type === 'test_drive' && <Car className="w-3.5 h-3.5 inline mr-1" />}
                    {APPOINTMENT_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>

            {/* Vehículo (solo test_drive) */}
            {form.appointmentType === 'test_drive' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Car className="w-4 h-4 inline mr-1 text-emerald-600" />
                  Vehículo a probar *
                </label>
                <select
                  required
                  value={form.vehicleId}
                  onChange={(e) => {
                    const v = availableVehicles.find((x) => x.id === e.target.value);
                    setForm({
                      ...form,
                      vehicleId: e.target.value,
                      vehicleName: v ? `${v.brand} ${v.model}` : '',
                      vehiclePlate: v?.registrationPlate || '',
                    });
                  }}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-emerald-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Seleccionar vehículo...</option>
                  {availableVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.brand} {v.model} · {v.registrationPlate}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Cliente */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <User className="w-4 h-4 inline mr-1" />
                  Nombre del cliente *
                </label>
                <input
                  type="text"
                  required
                  value={form.clientName}
                  onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                  placeholder="Nombre completo"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono</label>
                <input
                  type="tel"
                  value={form.clientPhone}
                  onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                  placeholder="+34 600 000 000"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={form.clientEmail}
                  onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                  placeholder="email@ejemplo.com"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            {/* Fecha y Hora */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Fecha *
                </label>
                <input
                  type="date"
                  required
                  value={form.date}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Hora *
                </label>
                <input
                  type="time"
                  required
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            {/* Asignado a */}
            {teamMembers.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <Users className="w-4 h-4 inline mr-1" />
                  Asignado a
                </label>
                <select
                  value={form.assignedTo}
                  onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {teamMembers.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.fullName || m.email}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Notas */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="Observaciones adicionales..."
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:outline-none focus:border-blue-500 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

          </form>

          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3 rounded-b-2xl">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium text-sm transition-colors hover:border-gray-300 dark:hover:border-gray-600">
              Cancelar
            </button>
            <button type="submit" form="new-appointment-form" disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Crear cita
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Modal: Detalle de Cita ───────────────────────────────────────────────────

function AppointmentDetailModal({
  appointment,
  onClose,
  onStatusChange,
  onDelete,
  onAddToPhoneCalendar,
  phoneAlreadySent = false,
}: {
  appointment: Appointment;
  onClose: () => void;
  onStatusChange: (status: AppointmentStatus) => void;
  onDelete: () => void;
  onAddToPhoneCalendar: () => void;
  phoneAlreadySent?: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full">
          <div className={`px-6 py-5 rounded-t-2xl flex items-center justify-between ${
            appointment.appointmentType === 'test_drive' ? 'bg-gradient-to-r from-emerald-600 to-teal-600' : 'bg-gradient-to-r from-blue-600 to-indigo-600'
          }`}>
            <div>
              <h2 className="text-lg font-bold text-white">{appointment.clientName}</h2>
              <p className="text-white/80 text-sm mt-0.5">{APPOINTMENT_TYPE_LABELS[appointment.appointmentType]}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {/* Estado */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Estado:</span>
              {(['pending', 'confirmed', 'cancelled', 'completed'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => onStatusChange(s)}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all ${
                    appointment.status === s
                      ? STATUS_COLORS[s] + ' ring-2 ring-offset-1 ring-current'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>

            {/* Detalles */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <span className="font-medium">{appointment.date}</span>
                <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500 ml-2" />
                <span>{appointment.time}</span>
              </div>

              {appointment.clientPhone && (
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <User className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <span>{appointment.clientPhone}</span>
                  {appointment.clientEmail && <span className="text-gray-400 dark:text-gray-500">· {appointment.clientEmail}</span>}
                </div>
              )}

              {appointment.appointmentType === 'test_drive' && appointment.vehicleName && (
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
                  <Car className="w-4 h-4" />
                  <span>{appointment.vehicleName}</span>
                  {appointment.vehiclePlate && <span className="text-gray-400 dark:text-gray-500 font-normal">({appointment.vehiclePlate})</span>}
                </div>
              )}

              {appointment.assignedName && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <User className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <span>Asignado a: <span className="font-medium text-gray-700 dark:text-gray-300">{appointment.assignedName}</span></span>
                </div>
              )}

              {appointment.location && (
                <div className="text-gray-600 dark:text-gray-400 text-xs bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                  📍 {appointment.location}
                </div>
              )}

              {appointment.notes && (
                <div className="text-gray-600 dark:text-gray-400 text-xs bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                  💬 {appointment.notes}
                </div>
              )}

              {appointment.source === 'booking' && (
                <div className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                  <Link className="w-3.5 h-3.5" />
                  Reserva realizada por el cliente
                </div>
              )}
            </div>

            {/* Acciones */}
            <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-2">
              <button type="button" onClick={onAddToPhoneCalendar} className={`${VERTIAL_BTN_SECONDARY} w-full`}>
                <Smartphone className="w-4 h-4" />
                {phoneAlreadySent ? 'Ya en el móvil' : 'Al móvil'}
              </button>
              {confirmDelete ? (
                <div className="space-y-2">
                  <p className="text-sm text-red-600 font-medium">¿Eliminar esta cita?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDelete(false)} className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                      Cancelar
                    </button>
                    <button onClick={onDelete} className="flex-1 px-3 py-2 text-sm bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors">
                      Eliminar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full text-sm text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg px-3 py-2 transition-colors"
                >
                  Eliminar cita
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Modal: Configuración de Booking ─────────────────────────────────────────

function BookingConfigModal({
  config,
  bookingUrl,
  saving,
  onChange,
  onSave,
  onClose,
}: {
  config: BookingConfig;
  bookingUrl: string;
  saving: boolean;
  onChange: (cfg: BookingConfig) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyUrl = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(bookingUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = bookingUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const DAY_LABELS: Record<string, string> = {
    mon: 'Lunes', tue: 'Martes', wed: 'Miércoles',
    thu: 'Jueves', fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 rounded-t-2xl flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Enlace de reserva</h2>
              <p className="text-indigo-100 text-sm mt-0.5">Configura tu calendario público tipo Calendly</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Reservas públicas activas</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Los clientes podrán reservar directamente</p>
              </div>
              <button
                onClick={() => onChange({ ...config, enabled: !config.enabled })}
                className={`w-12 h-6 rounded-full transition-colors relative ${config.enabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white dark:bg-gray-800 rounded-full shadow transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {/* URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Link className="w-4 h-4 inline mr-1" />
                Tu enlace de reserva
              </label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={bookingUrl}
                  className="flex-1 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-mono"
                />
                <button
                  onClick={copyUrl}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${copied ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'}`}
                >
                  {copied ? <Check className="w-4 h-4" /> : 'Copiar'}
                </button>
              </div>
            </div>

            {/* Nombre visible */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre visible para clientes</label>
              <input
                type="text"
                value={config.displayName}
                onChange={(e) => onChange({ ...config, displayName: e.target.value })}
                placeholder="Tu nombre o del concesionario"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Duración de slots */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Duración por cita</label>
                <select
                  value={config.slotDuration}
                  onChange={(e) => onChange({ ...config, slotDuration: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value={30}>30 minutos</option>
                  <option value={45}>45 minutos</option>
                  <option value={60}>1 hora</option>
                  <option value={90}>1.5 horas</option>
                  <option value={120}>2 horas</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reservar hasta</label>
                <select
                  value={config.maxDaysAhead}
                  onChange={(e) => onChange({ ...config, maxDaysAhead: Number(e.target.value) })}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value={7}>7 días adelante</option>
                  <option value={14}>14 días adelante</option>
                  <option value={30}>30 días adelante</option>
                  <option value={60}>60 días adelante</option>
                </select>
              </div>
            </div>

            {/* Horario semanal */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <Settings className="w-4 h-4 inline mr-1" />
                Horario semanal
              </label>
              <div className="space-y-2">
                {(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((day) => {
                  const d = config.workingHours[day];
                  return (
                    <div key={day} className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => onChange({
                          ...config,
                          workingHours: { ...config.workingHours, [day]: { ...d, enabled: !d.enabled } },
                        })}
                        className={`w-16 text-xs font-semibold py-1 rounded-lg transition-colors ${d.enabled ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'}`}
                      >
                        {DAY_LABELS[day].slice(0, 3)}
                      </button>
                      {d.enabled ? (
                        <>
                          <input
                            type="time"
                            value={d.start}
                            onChange={(e) => onChange({
                              ...config,
                              workingHours: { ...config.workingHours, [day]: { ...d, start: e.target.value } },
                            })}
                            className="px-2 py-1 border border-gray-200 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-500"
                          />
                          <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                          <input
                            type="time"
                            value={d.end}
                            onChange={(e) => onChange({
                              ...config,
                              workingHours: { ...config.workingHours, [day]: { ...d, end: e.target.value } },
                            })}
                            className="px-2 py-1 border border-gray-200 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-indigo-500"
                          />
                        </>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-gray-500 italic">Cerrado</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3 rounded-b-2xl">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium text-sm hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
              Cancelar
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function EventTypesSettingsModal({
  businessType,
  config,
  onChange,
  onClose,
}: {
  businessType: string | null;
  config: EventTypeConfig;
  onChange: (next: EventTypeConfig) => void;
  onClose: () => void;
}) {
  const merged = useMemo(
    () => ({ ...defaultEventTypeConfig(businessType), ...config }),
    [config, businessType],
  );

  const orderedTypes: AppointmentType[] = useMemo(
    () => configurableEventTypes(businessType),
    [businessType],
  );

  const updateOne = (type: AppointmentType, patch: Partial<EventTypeConfig[string]>) => {
    const current = merged[String(type)] || defaultEventTypeConfig(businessType)[String(type)];
    const next: EventTypeConfig = { ...merged, [String(type)]: { ...current, ...patch } as any };
    onChange(next);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
        <div className="bg-white dark:bg-gray-800 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
          <div className="sticky top-0 bg-gray-900 px-6 py-5 rounded-t-3xl sm:rounded-t-3xl flex items-center justify-between z-10">
            <div>
              <h2 className="text-lg font-bold text-white">Tipos de evento</h2>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-0.5">
                {isDeliveryLikeCalendar(businessType)
                  ? 'Tipos pensados para delivery: reparto, llamadas y seguimiento'
                  : 'Activa, renombra y cambia colores'}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          <div className="p-6 space-y-3">
            {orderedTypes.map((tpe) => {
              const item = merged[String(tpe)] || defaultEventTypeConfig(businessType)[String(tpe)];
              if (!item) return null;
              const preset = EVENT_TYPE_COLOR_PRESETS[item.color];
              return (
                <div key={String(tpe)} className="border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => updateOne(tpe, { enabled: !item.enabled })}
                      className={`w-12 h-6 rounded-full transition-colors relative ${item.enabled ? 'bg-gray-900' : 'bg-gray-300 dark:bg-gray-600'}`}
                      title={item.enabled ? 'Activo' : 'Inactivo'}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white dark:bg-gray-800 rounded-full shadow transition-transform ${item.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>

                    <div className={`w-2.5 h-2.5 rounded-full ${preset.dot}`} />

                    <div className="flex-1 min-w-0">
                      <input
                        value={item.label}
                        onChange={(e) => updateOne(tpe, { label: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-gray-900 dark:focus:border-white"
                      />
                    </div>

                    <select
                      value={item.color}
                      onChange={(e) => updateOne(tpe, { color: e.target.value as EventTypeColorKey })}
                      className="text-xs px-2.5 py-2 border border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-gray-900"
                      title="Color"
                    >
                      {Object.keys(EVENT_TYPE_COLOR_PRESETS).map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </div>

                  <div className={`mt-3 rounded-xl px-3 py-2 ${preset.bg}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${preset.dot}`} />
                      <span className={`text-xs font-semibold ${preset.text}`}>{item.label}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 truncate">Vista previa</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 rounded-b-3xl sm:rounded-b-3xl">
            <button
              type="button"
              onClick={onClose}
              className="w-full px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold text-sm transition-colors"
            >
              Listo
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
