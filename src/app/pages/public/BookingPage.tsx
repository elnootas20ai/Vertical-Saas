import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Calendar, Clock, User, Phone, Mail,
  Car, FileText, CheckCircle, AlertCircle, Loader2, MapPin,
} from 'lucide-react';
import {
  format, addDays, startOfDay, isBefore, isAfter, parseISO,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addMonths, subMonths,
  startOfMonth, endOfMonth,
} from 'date-fns';
import { es } from 'date-fns/locale';
import {
  getPublicBookingInfoRequest,
  getAvailableSlotsRequest,
  createPublicBookingRequest,
  type PublicBookingInfo,
  type AppointmentType,
} from '../../lib/appointmentsApi';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Step = 'select_date' | 'select_slot' | 'form' | 'success' | 'error';

interface BookingForm {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  appointmentType: AppointmentType;
  notes: string;
  vehicleName: string;
}

// ─── Etiquetas, iconos y descripciones por tipo de cita (genéricas) ──────────

const ALL_APPOINTMENT_LABELS: Record<string, string> = {
  visit:            'Visita',
  test_drive:       'Prueba de conducción',
  paperwork:        'Documentación',
  delivery:         'Entrega',
  consultation:     'Consulta',
  treatment:        'Tratamiento',
  checkup:          'Revisión',
  followup_appt:    'Seguimiento',
  trial_class:      'Clase de prueba',
  enrollment:       'Matriculación',
  personal_session: 'Sesión personal',
  reservation:      'Reserva',
  checkin:          'Check-in',
  tour:             'Visita guiada',
  service:          'Servicio',
  assessment:       'Evaluación',
  class_session:    'Clase / Sesión',
};

const ALL_APPOINTMENT_ICONS: Record<string, string> = {
  visit:            '🏢',
  test_drive:       '🚗',
  paperwork:        '📄',
  delivery:         '🎉',
  consultation:     '💬',
  treatment:        '💊',
  checkup:          '🩺',
  followup_appt:    '🔄',
  trial_class:      '🎯',
  enrollment:       '📝',
  personal_session: '🏋️',
  reservation:      '📅',
  checkin:          '✅',
  tour:             '🏠',
  service:          '🔧',
  assessment:       '📋',
  class_session:    '📚',
};

const ALL_APPOINTMENT_DESCRIPTIONS: Record<string, string> = {
  visit:            'Ven a conocernos en persona',
  test_drive:       'Prueba el vehículo que te interesa',
  paperwork:        'Trámites, contratos y documentación',
  delivery:         'Recoge tu pedido o entrega',
  consultation:     'Consulta personalizada con un profesional',
  treatment:        'Sesión de tratamiento programada',
  checkup:          'Revisión o chequeo general',
  followup_appt:    'Cita de seguimiento',
  trial_class:      'Prueba una clase sin compromiso',
  enrollment:       'Proceso de alta o inscripción',
  personal_session: 'Sesión individual personalizada',
  reservation:      'Reserva tu plaza o espacio',
  checkin:          'Registro de llegada',
  tour:             'Recorrido guiado por las instalaciones',
  service:          'Solicita un servicio profesional',
  assessment:       'Evaluación y presupuesto',
  class_session:    'Asiste a una clase o sesión grupal',
};

// ─── Adaptaciones por vertical ───────────────────────────────────────────────

type VerticalOverrides = Partial<Record<string, { label: string; icon: string; description: string }>>;

const VERTICAL_OVERRIDES: Record<string, VerticalOverrides> = {
  carDealership: {
    visit:     { label: 'Visita al concesionario', icon: '🏢', description: 'Ven a conocer nuestros vehículos en persona' },
    test_drive:{ label: 'Prueba de conducción',    icon: '🚗', description: 'Prueba el vehículo que te interesa en la carretera' },
    paperwork: { label: 'Firmar documentos',        icon: '📄', description: 'Trámites, contratos y documentación' },
    delivery:  { label: 'Entrega del vehículo',     icon: '🎉', description: 'Recoge tu nuevo vehículo' },
  },
  workshop: {
    visit:     { label: 'Cita en taller',          icon: '🔧', description: 'Trae tu vehículo al taller' },
    delivery:  { label: 'Recogida del vehículo',    icon: '🚗', description: 'Recoge tu vehículo reparado' },
    paperwork: { label: 'Presupuesto / Documentos', icon: '📄', description: 'Revisión de presupuesto y documentación' },
  },
  clinic: {
    consultation: { label: 'Consulta médica',     icon: '🩺', description: 'Consulta con un especialista' },
    treatment:    { label: 'Tratamiento',          icon: '💊', description: 'Sesión de tratamiento programada' },
    checkup:      { label: 'Revisión general',     icon: '🔍', description: 'Chequeo médico completo' },
    followup_appt:{ label: 'Seguimiento',          icon: '🔄', description: 'Cita de control y seguimiento' },
  },
  vet: {
    consultation: { label: 'Consulta veterinaria', icon: '🐾', description: 'Consulta para tu mascota' },
    treatment:    { label: 'Tratamiento',          icon: '💉', description: 'Tratamiento o vacunación' },
    checkup:      { label: 'Revisión',             icon: '🩺', description: 'Revisión de salud de tu mascota' },
    followup_appt:{ label: 'Seguimiento',          icon: '🔄', description: 'Cita de control post-tratamiento' },
  },
  gym: {
    visit:           { label: 'Visita al centro',     icon: '🏋️', description: 'Conoce nuestras instalaciones' },
    trial_class:     { label: 'Clase de prueba',       icon: '🎯', description: 'Prueba una clase sin compromiso' },
    enrollment:      { label: 'Inscripción',           icon: '📝', description: 'Alta de socio o matrícula' },
    personal_session:{ label: 'Sesión personal',       icon: '💪', description: 'Entrenamiento personalizado' },
  },
  hairSalon: {
    reservation:  { label: 'Reservar cita',      icon: '💇', description: 'Reserva tu hora preferida' },
    consultation: { label: 'Consulta de imagen',  icon: '💬', description: 'Asesoramiento personalizado' },
    treatment:    { label: 'Tratamiento capilar', icon: '✨', description: 'Tratamiento especializado' },
  },
  hotel: {
    reservation: { label: 'Reservar habitación', icon: '🏨', description: 'Reserva tu estancia' },
    checkin:     { label: 'Check-in',             icon: '✅', description: 'Registro de llegada al hotel' },
    tour:        { label: 'Visita al hotel',      icon: '🏠', description: 'Conoce nuestras instalaciones' },
  },
  realEstate: {
    visit:        { label: 'Visitar inmueble',     icon: '🏠', description: 'Visita el inmueble que te interesa' },
    tour:         { label: 'Visita guiada',         icon: '🗝️', description: 'Recorrido por las propiedades' },
    consultation: { label: 'Consulta inmobiliaria', icon: '💬', description: 'Asesoramiento personalizado' },
    paperwork:    { label: 'Firma de documentos',   icon: '📄', description: 'Documentación y trámites' },
  },
  lawyer: {
    consultation:  { label: 'Consulta jurídica',  icon: '⚖️', description: 'Consulta con tu abogado' },
    followup_appt: { label: 'Seguimiento del caso',icon: '🔄', description: 'Revisión del estado de tu expediente' },
    paperwork:     { label: 'Firma de documentos', icon: '📄', description: 'Firma de contratos y escrituras' },
  },
  academy: {
    visit:         { label: 'Visita al centro',  icon: '🏫', description: 'Conoce nuestras instalaciones' },
    enrollment:    { label: 'Matrícula',          icon: '📝', description: 'Proceso de inscripción' },
    class_session: { label: 'Clase',              icon: '📚', description: 'Asiste a una clase' },
    consultation:  { label: 'Orientación',        icon: '💬', description: 'Asesoramiento académico' },
  },
  cleaning: {
    visit:      { label: 'Visita de valoración', icon: '🏠', description: 'Evaluamos tu espacio' },
    service:    { label: 'Servicio de limpieza',  icon: '🧹', description: 'Servicio profesional programado' },
    assessment: { label: 'Presupuesto',           icon: '📋', description: 'Solicita un presupuesto sin compromiso' },
  },
  events: {
    reservation:  { label: 'Reservar evento',  icon: '🎉', description: 'Reserva la fecha de tu evento' },
    visit:        { label: 'Visita al espacio', icon: '🏢', description: 'Conoce el espacio del evento' },
    consultation: { label: 'Consulta',          icon: '💬', description: 'Planificación de tu evento' },
  },
  construction: {
    visit:      { label: 'Visita a obra',   icon: '🏗️', description: 'Visita el estado de la obra' },
    assessment: { label: 'Presupuesto',      icon: '📋', description: 'Evaluación y presupuesto de obra' },
    paperwork:  { label: 'Documentación',    icon: '📄', description: 'Firma de documentos y permisos' },
    delivery:   { label: 'Entrega de llaves',icon: '🔑', description: 'Entrega final del proyecto' },
  },
  delivery: {
    reservation: { label: 'Hacer pedido',     icon: '🛒', description: 'Reserva tu pedido' },
    delivery:    { label: 'Programar entrega', icon: '🚚', description: 'Elige la fecha de entrega' },
  },
  carWash: {
    reservation: { label: 'Reservar lavado', icon: '🚿', description: 'Reserva tu turno de lavado' },
    service:     { label: 'Servicio especial',icon: '✨', description: 'Servicio de detailing o especial' },
  },
  nightclub: {
    reservation: { label: 'Reservar mesa / VIP', icon: '🍾', description: 'Reserva tu espacio VIP' },
    visit:       { label: 'Evento especial',      icon: '🎶', description: 'Información sobre eventos' },
  },
  pharmacy: {
    consultation: { label: 'Consulta farmacéutica', icon: '💊', description: 'Consulta con el farmacéutico' },
    service:      { label: 'Servicio',               icon: '🩺', description: 'Servicio profesional' },
    delivery:     { label: 'Recogida de encargo',    icon: '📦', description: 'Recoge tu encargo preparado' },
  },
};

const VERTICAL_BUSINESS_NAMES: Record<string, string> = {
  carDealership: 'el concesionario',
  workshop:      'el taller',
  clinic:        'la clínica',
  vet:           'la clínica veterinaria',
  gym:           'el centro deportivo',
  hairSalon:     'el salón',
  hotel:         'el hotel',
  realEstate:    'la inmobiliaria',
  lawyer:        'el despacho',
  academy:       'la academia',
  cleaning:      'la empresa',
  events:        'la empresa de eventos',
  construction:  'la constructora',
  delivery:      'el negocio',
  nightclub:     'el local',
  scrapyard:     'el desguace',
  spareParts:    'la tienda',
  taxi:          'el servicio',
  pharmacy:      'la farmacia',
  carWash:       'el centro de lavado',
};

function getLabel(type: AppointmentType, businessType?: string): string {
  const overrides = businessType ? VERTICAL_OVERRIDES[businessType] : undefined;
  return overrides?.[type]?.label || ALL_APPOINTMENT_LABELS[type] || type;
}

function getIcon(type: AppointmentType, businessType?: string): string {
  const overrides = businessType ? VERTICAL_OVERRIDES[businessType] : undefined;
  return overrides?.[type]?.icon || ALL_APPOINTMENT_ICONS[type] || '📅';
}

function getDescription(type: AppointmentType, businessType?: string): string {
  const overrides = businessType ? VERTICAL_OVERRIDES[businessType] : undefined;
  return overrides?.[type]?.description || ALL_APPOINTMENT_DESCRIPTIONS[type] || '';
}

function getBusinessLabel(businessType?: string): string {
  return (businessType && VERTICAL_BUSINESS_NAMES[businessType]) || 'el negocio';
}

function showsVehicleField(type: AppointmentType, businessType?: string): boolean {
  const vehicleVerticals = ['carDealership', 'workshop', 'scrapyard', 'taxi', 'carWash'];
  return type === 'test_drive' && vehicleVerticals.includes(businessType || '');
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function BookingPage() {
  const { userId } = useParams<{ userId: string }>();

  const [step, setStep] = useState<Step>('select_date');
  const [info, setInfo] = useState<PublicBookingInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [infoError, setInfoError] = useState('');

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  const [form, setForm] = useState<BookingForm>({
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    appointmentType: 'visit',
    notes: '',
    vehicleName: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ─── Cargar info del dealer ────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    setLoadingInfo(true);
    getPublicBookingInfoRequest(userId)
      .then((data) => {
        setInfo(data);
        if (data.config.appointmentTypes.length > 0) {
          setForm((f) => ({ ...f, appointmentType: data.config.appointmentTypes[0] }));
        }
      })
      .catch((err) => {
        setInfoError(err.message || 'Este enlace de reserva no está disponible');
      })
      .finally(() => setLoadingInfo(false));
  }, [userId]);

  // ─── Cargar slots al seleccionar fecha ────────────────────────────────
  const loadSlots = useCallback(async (date: Date) => {
    if (!userId) return;
    setLoadingSlots(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const s = await getAvailableSlotsRequest(userId, dateStr);
      setSlots(s);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [userId]);

  const handleSelectDate = async (date: Date) => {
    setSelectedDate(date);
    setSelectedSlot('');
    await loadSlots(date);
    setStep('select_slot');
  };

  const handleSelectSlot = (slot: string) => {
    setSelectedSlot(slot);
    setStep('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !selectedDate || !selectedSlot) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      await createPublicBookingRequest(userId, {
        ...form,
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: selectedSlot,
        vehicleName: showsVehicleField(form.appointmentType, bType) ? form.vehicleName : undefined,
      });
      setStep('success');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error al realizar la reserva');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Calendario ───────────────────────────────────────────────────────
  const calendarDays = (() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  })();

  const today = startOfDay(new Date());
  const maxDate = info ? addDays(today, info.config.maxDaysAhead) : addDays(today, 30);

  const isDayEnabled = (day: Date) => {
    if (isBefore(day, today) || isAfter(day, maxDate)) return false;
    if (!info) return false;
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
    const key = dayNames[day.getDay()];
    return info.config.workingHours[key]?.enabled ?? false;
  };

  const bType = info?.dealer.businessType;

  // ─── Loading / Error state ────────────────────────────────────────────
  if (loadingInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (infoError || !info) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Enlace no disponible</h1>
          <p className="text-gray-500 dark:text-gray-400">{infoError || 'Este enlace de reserva no está disponible actualmente.'}</p>
        </div>
      </div>
    );
  }

  // ─── Success ──────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-8 text-center space-y-5">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto animate-bounce-once">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">¡Cita confirmada!</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2">Tu solicitud ha sido enviada correctamente</p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-5 text-left space-y-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-indigo-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Fecha</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100 capitalize">
                  {selectedDate ? format(selectedDate, "EEEE d 'de' MMMM 'de' yyyy", { locale: es }) : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-indigo-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Hora</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{selectedSlot}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xl">{getIcon(form.appointmentType, bType)}</span>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Tipo</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{getLabel(form.appointmentType, bType)}</p>
              </div>
            </div>
            {info.dealer.companyName && (
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Con</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{info.dealer.displayName} — {info.dealer.companyName}</p>
                </div>
              </div>
            )}
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nos pondremos en contacto contigo para confirmar todos los detalles.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center gap-4">
          {info.dealer.logo ? (
            <img src={info.dealer.logo} alt={info.dealer.companyName} className="h-10 w-auto object-contain" />
          ) : (
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Calendar className="w-5 h-5 text-white" />
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{info.dealer.displayName}</h1>
            {info.dealer.companyName && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{info.dealer.companyName}</p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Steps indicator */}
        <div className="flex items-center gap-2 justify-center">
          {(['select_date', 'select_slot', 'form'] as const).map((s, i) => {
            const labels = ['Elige día', 'Elige hora', 'Tus datos'];
            const stepIndex = ['select_date', 'select_slot', 'form'].indexOf(step);
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 ${active || done ? 'text-indigo-600' : 'text-gray-400 dark:text-gray-500'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                    done ? 'bg-indigo-600 border-indigo-600 text-white'
                      : active ? 'border-indigo-600 bg-white dark:bg-gray-800 text-indigo-600'
                        : 'border-gray-300 bg-white dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                  }`}>
                    {done ? <CheckCircle className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className="text-xs font-semibold hidden sm:block">{labels[i]}</span>
                </div>
                {i < 2 && <div className={`w-8 h-0.5 rounded ${i < stepIndex ? 'bg-indigo-600' : 'bg-gray-200'}`} />}
              </div>
            );
          })}
        </div>

        {/* STEP 1: Seleccionar fecha */}
        {step === 'select_date' && (
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5">
              <Calendar className="w-5 h-5 inline mr-2 text-indigo-600" />
              ¿Qué día prefieres?
            </h2>

            {/* Cabecera del mes */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
                disabled={isBefore(endOfMonth(subMonths(currentMonth, 1)), today)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: es })}
              </h3>
              <button
                onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>

            {/* Días de semana */}
            <div className="grid grid-cols-7 mb-1">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
                <div key={d} className="text-center text-xs font-bold text-gray-400 dark:text-gray-500 py-2">{d}</div>
              ))}
            </div>

            {/* Grid de días */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, idx) => {
                const enabled = isDayEnabled(day);
                const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                const isSelected = selectedDate && isSameDay(day, selectedDate);

                return (
                  <button
                    key={idx}
                    onClick={() => enabled && handleSelectDate(day)}
                    disabled={!enabled}
                    className={`relative h-10 w-full rounded-xl text-sm font-medium transition-all ${
                      !isCurrentMonth ? 'opacity-30' : ''
                    } ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-md'
                        : enabled
                          ? 'hover:bg-indigo-50 text-gray-900 dark:text-gray-100 hover:text-indigo-700'
                          : 'text-gray-300 cursor-not-allowed'
                    } ${isSameDay(day, today) && !isSelected ? 'ring-2 ring-indigo-300 ring-offset-1' : ''}`}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>

            <p className="mt-4 text-xs text-gray-400 dark:text-gray-500 text-center">
              Disponibilidad para los próximos {info.config.maxDaysAhead} días
            </p>
          </div>
        )}

        {/* STEP 2: Seleccionar hora */}
        {step === 'select_slot' && selectedDate && (
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
            <div className="flex items-center gap-3 mb-5">
              <button
                onClick={() => setStep('select_date')}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  <Clock className="w-5 h-5 inline mr-2 text-indigo-600" />
                  Elige una hora
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                  {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
                </p>
              </div>
            </div>

            {loadingSlots ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-10 space-y-3">
                <div className="text-4xl">😔</div>
                <p className="text-gray-600 dark:text-gray-400 font-medium">No hay horarios disponibles este día</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">Prueba con otra fecha</p>
                <button
                  onClick={() => setStep('select_date')}
                  className="mt-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-sm font-medium transition-colors"
                >
                  Volver al calendario
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => handleSelectSlot(slot)}
                    className="py-3 px-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-indigo-700 transition-all"
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Formulario */}
        {step === 'form' && selectedDate && selectedSlot && (
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
            <div className="flex items-center gap-3 mb-5">
              <button
                onClick={() => setStep('select_slot')}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Tus datos</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {format(selectedDate, "d 'de' MMMM", { locale: es })} · {selectedSlot}
                </p>
              </div>
            </div>

            {/* Resumen */}
            <div className="bg-indigo-50 rounded-2xl p-4 mb-5 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-indigo-500" />
                <span className="font-semibold text-indigo-800 capitalize">
                  {format(selectedDate, "EEE d MMM", { locale: es })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-indigo-500" />
                <span className="font-semibold text-indigo-800">{selectedSlot}</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Tipo de cita */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo de cita</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {info.config.appointmentTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setForm({ ...form, appointmentType: type })}
                      className={`px-4 py-3 rounded-xl border-2 text-sm font-medium text-left transition-all ${
                        form.appointmentType === type
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <span className="mr-2">{getIcon(type, bType)}</span>
                      <span className="font-semibold">{getLabel(type, bType)}</span>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 ml-6">{getDescription(type, bType)}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Vehículo para test drive (solo verticales de automoción) */}
              {showsVehicleField(form.appointmentType, bType) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Car className="w-4 h-4 inline mr-1 text-emerald-600" />
                    Vehículo de interés (opcional)
                  </label>
                  <input
                    type="text"
                    value={form.vehicleName}
                    onChange={(e) => setForm({ ...form, vehicleName: e.target.value })}
                    placeholder="Ej: Toyota Corolla, SUV de 7 plazas..."
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
              )}

              {/* Datos personales */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <User className="w-4 h-4 inline mr-1" />
                  Nombre completo *
                </label>
                <input
                  type="text"
                  required
                  value={form.clientName}
                  onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                  placeholder="Tu nombre"
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-indigo-500 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Phone className="w-4 h-4 inline mr-1" />
                    Teléfono *
                  </label>
                  <input
                    type="tel"
                    required
                    value={form.clientPhone}
                    onChange={(e) => setForm({ ...form, clientPhone: e.target.value })}
                    placeholder="+34 600 000 000"
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    <Mail className="w-4 h-4 inline mr-1" />
                    Email (opcional)
                  </label>
                  <input
                    type="email"
                    value={form.clientEmail}
                    onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
                    placeholder="tu@email.com"
                    className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <FileText className="w-4 h-4 inline mr-1" />
                  Comentarios (opcional)
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  placeholder="¿Alguna petición especial o información que quieras añadir?"
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-indigo-500 text-sm resize-none"
                />
              </div>

              {submitError && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-base transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Reservando...
                  </>
                ) : (
                  <>
                    <Calendar className="w-5 h-5" />
                    Confirmar reserva
                  </>
                )}
              </button>

              <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                Al reservar aceptas que {getBusinessLabel(bType)} se ponga en contacto contigo para confirmar la cita.
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
