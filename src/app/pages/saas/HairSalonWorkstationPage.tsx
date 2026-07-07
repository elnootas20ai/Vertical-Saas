import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useModalClose } from '../../hooks/useModalClose';
import {
  listAppointmentsRequest,
  createAppointmentRequest,
  updateAppointmentRequest,
  deleteAppointmentRequest,
  type Appointment,
  type AppointmentStatus,
  type AppointmentType,
} from '../../lib/appointmentsApi';
import {
  ArrowLeft, CalendarDays, Clock, Plus, Search,
  ChevronLeft, ChevronRight, X, Trash2, CheckCircle, AlertCircle,
  Play, Ban, EyeOff, DollarSign, Users, Scissors, Phone, Mail,
  User, RefreshCw, Loader2, Filter,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface TeamMember {
  user_id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}

interface HairSalonWorkstationPageProps {
  salesPoint?: { _id: string; id: string; name: string } | null;
  onBack?: () => void;
}

const HOUR_HEIGHT = 72;
const START_HOUR = 9;
const END_HOUR = 21;
const SLOT_MINUTES = 15;

const STATUS_CFG: Record<string, { label: string; bg: string; text: string; border: string; icon: React.ReactNode }> = {
  pending:   { label: 'Pendiente',  bg: 'bg-amber-50 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-300',     border: 'border-amber-300 dark:border-amber-600',     icon: <AlertCircle className="w-3.5 h-3.5" /> },
  confirmed: { label: 'Confirmada', bg: 'bg-emerald-50 dark:bg-emerald-900/30',  text: 'text-emerald-700 dark:text-emerald-300',  border: 'border-emerald-300 dark:border-emerald-600',  icon: <CheckCircle className="w-3.5 h-3.5" /> },
  completed: { label: 'Completada', bg: 'bg-indigo-50 dark:bg-indigo-900/30',    text: 'text-indigo-700 dark:text-indigo-300',    border: 'border-indigo-300 dark:border-indigo-600',    icon: <CheckCircle className="w-3.5 h-3.5" /> },
  cancelled: { label: 'Cancelada',  bg: 'bg-gray-100 dark:bg-gray-700/50',       text: 'text-gray-500 dark:text-gray-400',        border: 'border-gray-300 dark:border-gray-600',        icon: <Ban className="w-3.5 h-3.5" /> },
};

const BLOCK_COLORS = [
  { bg: 'bg-violet-100 dark:bg-violet-900/40', border: 'border-l-violet-500', text: 'text-violet-900 dark:text-violet-100' },
  { bg: 'bg-sky-100 dark:bg-sky-900/40',       border: 'border-l-sky-500',    text: 'text-sky-900 dark:text-sky-100' },
  { bg: 'bg-rose-100 dark:bg-rose-900/40',     border: 'border-l-rose-500',   text: 'text-rose-900 dark:text-rose-100' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/40', border: 'border-l-emerald-500', text: 'text-emerald-900 dark:text-emerald-100' },
  { bg: 'bg-amber-100 dark:bg-amber-900/40',   border: 'border-l-amber-500',  text: 'text-amber-900 dark:text-amber-100' },
  { bg: 'bg-cyan-100 dark:bg-cyan-900/40',     border: 'border-l-cyan-500',   text: 'text-cyan-900 dark:text-cyan-100' },
  { bg: 'bg-pink-100 dark:bg-pink-900/40',     border: 'border-l-pink-500',   text: 'text-pink-900 dark:text-pink-100' },
  { bg: 'bg-teal-100 dark:bg-teal-900/40',     border: 'border-l-teal-500',   text: 'text-teal-900 dark:text-teal-100' },
];

const SERVICES = [
  { name: 'Corte se\u00f1ora', duration: 45, price: 25 },
  { name: 'Corte caballero', duration: 30, price: 15 },
  { name: 'Tinte ra\u00edz', duration: 60, price: 35 },
  { name: 'Mechas balayage', duration: 90, price: 65 },
  { name: 'Mechas completas', duration: 120, price: 80 },
  { name: 'Peinado evento', duration: 60, price: 40 },
  { name: 'Tratamiento keratina', duration: 90, price: 50 },
  { name: 'Tratamiento hidrataci\u00f3n', duration: 45, price: 30 },
  { name: 'Barba', duration: 20, price: 10 },
  { name: 'Corte + barba', duration: 45, price: 22 },
  { name: 'Manicura', duration: 40, price: 20 },
  { name: 'Pedicura', duration: 50, price: 25 },
  { name: 'Alisado', duration: 120, price: 90 },
  { name: 'Lavado + secado', duration: 30, price: 12 },
];

function formatDateISO(d: Date) { return d.toISOString().slice(0, 10); }

function displayDate(d: Date) {
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function getMemberName(m: TeamMember) {
  if (m.fullName) return m.fullName;
  return [m.firstName, m.lastName].filter(Boolean).join(' ') || m.email || 'Sin nombre';
}

function timeToMinutes(time: string) {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const TIME_OPTIONS: string[] = [];
for (let h = START_HOUR; h < END_HOUR; h++) {
  for (let m = 0; m < 60; m += SLOT_MINUTES) {
    TIME_OPTIONS.push(minutesToTime(h * 60 + m));
  }
}

function guessDuration(appt: Appointment): number {
  const note = (appt.notes || '').toLowerCase();
  const match = SERVICES.find(s => note.includes(s.name.toLowerCase()));
  if (match) return match.duration;
  if (note.includes('tinte') || note.includes('color')) return 60;
  if (note.includes('mechas') || note.includes('balayage')) return 90;
  if (note.includes('keratina') || note.includes('alisado')) return 90;
  if (note.includes('barba')) return 20;
  if (note.includes('peinado')) return 60;
  if (note.includes('manicura')) return 40;
  return 30;
}

function appointmentTypeLabel(t: AppointmentType) {
  const map: Partial<Record<AppointmentType, string>> = {
    service: 'Servicio', consultation: 'Consulta', treatment: 'Tratamiento',
    reservation: 'Reserva', visit: 'Visita', call: 'Llamada', meeting: 'Reunión',
  };
  return map[t] || 'Cita';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════════

export function HairSalonWorkstationPage({ salesPoint, onBack }: HairSalonWorkstationPageProps) {
  const navigate = useNavigate();
  const { user, listUsers } = useAuth();
  const { currentBusiness } = useBusiness();

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [filterStylist, setFilterStylist] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<Appointment | null>(null);
  const [prefillTime, setPrefillTime] = useState<string | null>(null);
  const [prefillStylist, setPrefillStylist] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
    useModalClose(showNewModal, () => setShowNewModal(false));
  useModalClose(!!showDetailModal, () => setShowDetailModal(null));

  const userId = user?.id || '';
  const dateStr = formatDateISO(currentDate);

  const loadAppointments = useCallback(async () => {
    if (!userId) return;
    try {
      const appts = await listAppointmentsRequest(userId);
      setAppointments(appts);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { void loadAppointments(); }, [loadAppointments]);

  useEffect(() => {
    if (!user) return;
    listUsers().then(u => setTeamMembers(u as TeamMember[])).catch(() => {});
  }, [user, listUsers]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadAppointments();
    setRefreshing(false);
  }, [loadAppointments]);

  const todayAppointments = useMemo(() =>
    appointments.filter(a => a.date === dateStr && a.status !== 'cancelled'),
    [appointments, dateStr],
  );

  const filteredAppointments = useMemo(() => {
    let list = todayAppointments;
    if (filterStylist !== 'all') list = list.filter(a => a.assignedTo === filterStylist);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(a =>
        a.clientName.toLowerCase().includes(q) ||
        a.clientPhone.toLowerCase().includes(q) ||
        (a.notes || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [todayAppointments, filterStylist, searchQuery]);

  const visibleStylists = useMemo(() => {
    if (filterStylist !== 'all') {
      const m = teamMembers.find(t => t.user_id === filterStylist);
      return m ? [m] : [];
    }
    if (teamMembers.length === 0) return [{ user_id: userId, fullName: 'Yo', email: user?.email } as TeamMember];
    return teamMembers;
  }, [teamMembers, filterStylist, userId, user]);

  const kpis = useMemo(() => {
    const total = todayAppointments.length;
    const completed = todayAppointments.filter(a => a.status === 'completed').length;
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const upcoming = todayAppointments
      .filter(a => a.status !== 'completed' && a.status !== 'cancelled' && timeToMinutes(a.time || '00:00') >= nowMins)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    return { total, completed, next: upcoming[0] as Appointment | undefined };
  }, [todayAppointments]);

  const handleCreateAppointment = useCallback(async (data: {
    clientName: string; clientPhone: string; clientEmail?: string;
    date: string; time: string; notes: string; assignedTo: string; assignedName: string;
    appointmentType: AppointmentType;
  }) => {
    if (!userId) return;
    setSaving(true);
    try {
      const created = await createAppointmentRequest(userId, {
        ...data, location: salesPoint?.name || '', status: 'confirmed',
      });
      if (created) {
        setAppointments(prev => [...prev, created]);
        toast.success('Cita creada');
        setShowNewModal(false);
      }
    } catch { toast.error('Error al crear la cita'); } finally { setSaving(false); }
  }, [userId, salesPoint]);

  const handleUpdateStatus = useCallback(async (appt: Appointment, newStatus: AppointmentStatus) => {
    if (!userId) return;
    try {
      const updated = await updateAppointmentRequest(userId, { id: appt.id, status: newStatus });
      if (updated) {
        setAppointments(prev => prev.map(a => a.id === appt.id ? updated : a));
        toast.success(`Cita ${STATUS_CFG[newStatus]?.label.toLowerCase() || newStatus}`);
        if (showDetailModal?.id === appt.id) setShowDetailModal(updated);
      }
    } catch { toast.error('Error al actualizar la cita'); }
  }, [userId, showDetailModal]);

  const handleReschedule = useCallback(async (appt: Appointment, newTime: string) => {
    if (!userId) return;
    try {
      const updated = await updateAppointmentRequest(userId, { id: appt.id, time: newTime });
      if (updated) {
        setAppointments(prev => prev.map(a => a.id === appt.id ? updated : a));
        toast.success('Cita reprogramada');
      }
    } catch { toast.error('Error al reprogramar'); }
  }, [userId]);

  const handleReassign = useCallback(async (appt: Appointment, newId: string, newName: string) => {
    if (!userId) return;
    try {
      const updated = await updateAppointmentRequest(userId, { id: appt.id, assignedTo: newId, assignedName: newName });
      if (updated) {
        setAppointments(prev => prev.map(a => a.id === appt.id ? updated : a));
        toast.success('Cita reasignada');
      }
    } catch { toast.error('Error al reasignar'); }
  }, [userId]);

  const handleDelete = useCallback(async (appt: Appointment) => {
    if (!userId) return;
    try {
      await deleteAppointmentRequest(userId, appt.id);
      setAppointments(prev => prev.filter(a => a.id !== appt.id));
      toast.success('Cita eliminada');
      setShowDetailModal(null);
    } catch { toast.error('Error al eliminar'); }
  }, [userId]);

  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  const goNext = () => setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
  const isToday = dateStr === formatDateISO(new Date());

  const handleSlotClick = (hour: number, minute: number, stylistId: string) => {
    setPrefillTime(minutesToTime(hour * 60 + minute));
    setPrefillStylist(stylistId);
    setShowNewModal(true);
  };

  const nowIndicator = useMemo(() => {
    if (!isToday) return null;
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    if (mins < START_HOUR * 60 || mins > END_HOUR * 60) return null;
    return ((mins - START_HOUR * 60) / 60) * HOUR_HEIGHT;
  }, [isToday, currentDate]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  const totalHours = END_HOUR - START_HOUR;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack || (() => navigate(-1))} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Scissors className="w-5 h-5 text-violet-500 shrink-0" />
                <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">Agenda</h1>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {currentBusiness?.businessName || 'Peluquer\u00eda'} — {salesPoint?.name || 'Puesto'}
              </p>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-4">
            <KPIBadge icon={<CalendarDays className="w-4 h-4 text-violet-500" />} value={kpis.total} label="hoy" scheme="violet" />
            <KPIBadge icon={<CheckCircle className="w-4 h-4 text-emerald-500" />} value={kpis.completed} label="hechas" scheme="emerald" />
            {kpis.next && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <Clock className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-amber-700 dark:text-amber-300 font-medium max-w-[140px] truncate">
                  {kpis.next.time} — {kpis.next.clientName}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={refresh} disabled={refreshing} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <RefreshCw className={`w-4 h-4 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <AddButtonDropdown
              label="Nueva cita"
              onQuickAdd={() => { setPrefillTime(null); setPrefillStylist(null); setShowNewModal(true); }}
              quickAddLabel="Alta rápida"
              quickAddDesc="Formulario de cita"
            />
          </div>
        </div>

        {/* Date nav + filters */}
        <div className="flex items-center justify-between gap-3 mt-3">
          <div className="flex items-center gap-2">
            <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={goToday} className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${isToday ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>Hoy</button>
            <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><ChevronRight className="w-4 h-4" /></button>
            <span className="text-sm font-semibold text-gray-900 dark:text-white capitalize ml-1">{displayDate(currentDate)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar cliente\u2026" className="w-48 pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
            </div>
            {teamMembers.length > 1 && (
              <div className="relative">
                <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <select value={filterStylist} onChange={e => setFilterStylist(e.target.value)} className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm">
                  <option value="all">Todos</option>
                  {teamMembers.map(m => <option key={m.user_id} value={m.user_id}>{getMemberName(m)}</option>)}
                </select>
              </div>
            )}
            <button onClick={() => setShowSidebar(s => !s)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Calendar grid */}
        <div className="flex-1 overflow-auto">
          <div className="min-w-[600px]">
            {/* Stylist headers */}
            <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex">
              <div className="w-16 shrink-0 border-r border-gray-200 dark:border-gray-800" />
              {visibleStylists.map((s, i) => {
                const colors = BLOCK_COLORS[i % BLOCK_COLORS.length];
                const count = filteredAppointments.filter(a => a.assignedTo === s.user_id).length;
                return (
                  <div key={s.user_id} className="flex-1 min-w-[160px] px-3 py-2 border-r border-gray-100 dark:border-gray-800 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${colors.border.replace('border-l-', 'bg-')}`} />
                      <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{getMemberName(s)}</span>
                    </div>
                    <span className="text-xs text-gray-500">{count} cita{count !== 1 ? 's' : ''}</span>
                  </div>
                );
              })}
            </div>

            {/* Time grid body */}
            <div className="relative" style={{ height: totalHours * HOUR_HEIGHT }}>
              {/* Hour lines */}
              {Array.from({ length: totalHours + 1 }).map((_, i) => (
                <div key={i} className="absolute left-0 right-0 border-t border-gray-100 dark:border-gray-800/60" style={{ top: i * HOUR_HEIGHT }}>
                  <div className="w-16 shrink-0 pr-2 -mt-2.5 text-right">
                    <span className="text-xs text-gray-400 font-medium">{minutesToTime((START_HOUR + i) * 60)}</span>
                  </div>
                </div>
              ))}
              {/* Half-hour lines */}
              {Array.from({ length: totalHours }).map((_, i) => (
                <div key={`h-${i}`} className="absolute left-16 right-0 border-t border-dashed border-gray-50 dark:border-gray-800/30" style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
              ))}

              {/* Now indicator */}
              {nowIndicator !== null && (
                <div className="absolute left-14 right-0 z-10 flex items-center pointer-events-none" style={{ top: nowIndicator }}>
                  <div className="w-3 h-3 rounded-full bg-red-500 -ml-1.5 shadow" />
                  <div className="flex-1 h-0.5 bg-red-500/60" />
                </div>
              )}

              {/* Stylist columns */}
              <div className="absolute left-16 right-0 top-0 bottom-0 flex">
                {visibleStylists.map((stylist, colIdx) => {
                  const stylistAppts = filteredAppointments.filter(a => a.assignedTo === stylist.user_id);
                  const colors = BLOCK_COLORS[colIdx % BLOCK_COLORS.length];
                  return (
                    <div key={stylist.user_id} className="flex-1 min-w-[160px] relative border-r border-gray-100 dark:border-gray-800/60">
                      {/* Clickable slots */}
                      {Array.from({ length: totalHours * (60 / SLOT_MINUTES) }).map((_, si) => {
                        const mins = START_HOUR * 60 + si * SLOT_MINUTES;
                        return (
                          <div
                            key={si}
                            className="absolute left-0 right-0 cursor-pointer hover:bg-violet-50/50 dark:hover:bg-violet-900/10 transition-colors"
                            style={{ top: si * (HOUR_HEIGHT / (60 / SLOT_MINUTES)), height: HOUR_HEIGHT / (60 / SLOT_MINUTES) }}
                            onClick={() => handleSlotClick(Math.floor(mins / 60), mins % 60, stylist.user_id)}
                          />
                        );
                      })}
                      {/* Appointment blocks */}
                      {stylistAppts.map(appt => {
                        const startMins = timeToMinutes(appt.time || '09:00');
                        const duration = guessDuration(appt);
                        const top = ((startMins - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                        const height = Math.max((duration / 60) * HOUR_HEIGHT, 28);
                        const st = STATUS_CFG[appt.status] || STATUS_CFG.pending;
                        return (
                          <div
                            key={appt.id}
                            className={`absolute left-1 right-1 rounded-lg border-l-4 ${colors.border} ${colors.bg} shadow-sm cursor-pointer hover:shadow-md transition-shadow overflow-hidden z-10`}
                            style={{ top, height }}
                            onClick={e => { e.stopPropagation(); setShowDetailModal(appt); }}
                          >
                            <div className="px-2 py-1 h-full flex flex-col justify-between">
                              <div className="min-w-0">
                                <p className={`text-xs font-semibold ${colors.text} truncate`}>{appt.clientName || 'Sin nombre'}</p>
                                {height > 40 && <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{appt.notes || appointmentTypeLabel(appt.appointmentType)}</p>}
                              </div>
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[10px] text-gray-400">{appt.time}</span>
                                <span className={`inline-flex items-center gap-0.5 px-1 rounded text-[9px] font-medium ${st.bg} ${st.text}`}>{st.icon}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className={`${showSidebar ? 'w-80' : 'w-0'} shrink-0 transition-all duration-200 overflow-hidden border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900`}>
          <div className="w-80 h-full flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Citas del d\u00eda</h3>
              <p className="text-xs text-gray-500 mt-0.5">{filteredAppointments.length} cita{filteredAppointments.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredAppointments.sort((a, b) => (a.time || '').localeCompare(b.time || '')).map(appt => {
                const st = STATUS_CFG[appt.status] || STATUS_CFG.pending;
                const stylistMember = teamMembers.find(m => m.user_id === appt.assignedTo);
                return (
                  <div key={appt.id} className={`rounded-xl border ${st.border} p-3 cursor-pointer hover:shadow-md transition-shadow ${appt.status === 'completed' ? 'opacity-60' : ''}`} onClick={() => setShowDetailModal(appt)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{appt.clientName || 'Sin nombre'}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{appt.notes || appointmentTypeLabel(appt.appointmentType)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${st.bg} ${st.text}`}>{st.icon}{st.label}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{appt.time}</span>
                      {stylistMember && <span className="flex items-center gap-1 truncate"><User className="w-3 h-3" />{getMemberName(stylistMember)}</span>}
                    </div>
                    {appt.status !== 'completed' && appt.status !== 'cancelled' && (
                      <div className="flex items-center gap-1 mt-2">
                        {appt.status === 'pending' && (
                          <button onClick={e => { e.stopPropagation(); handleUpdateStatus(appt, 'confirmed'); }} className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-200 transition-colors">Confirmar</button>
                        )}
                        <button onClick={e => { e.stopPropagation(); handleUpdateStatus(appt, 'completed'); }} className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 hover:bg-indigo-200 transition-colors">Completar</button>
                        <button onClick={e => { e.stopPropagation(); handleUpdateStatus(appt, 'cancelled'); }} className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400 hover:bg-gray-200 transition-colors">Cancelar</button>
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredAppointments.length === 0 && (
                <div className="text-center py-10 text-gray-400">
                  <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay citas</p>
                  <p className="text-xs mt-1">Haz clic en la agenda para a\u00f1adir una</p>
                </div>
              )}
            </div>
            {/* Mobile KPIs */}
            <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 p-3 grid grid-cols-2 gap-2 lg:hidden">
              <div className="bg-violet-50 dark:bg-violet-900/20 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-violet-700 dark:text-violet-300">{kpis.total}</p>
                <p className="text-[10px] text-violet-500">Citas hoy</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2 text-center">
                <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{kpis.completed}</p>
                <p className="text-[10px] text-emerald-500">Completadas</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showNewModal && (
        <NewAppointmentModal onClose={() => setShowNewModal(false)} onSave={handleCreateAppointment} saving={saving} teamMembers={visibleStylists} prefillTime={prefillTime} prefillStylist={prefillStylist} date={dateStr} />
      )}
      {showDetailModal && (
        <AppointmentDetailModal appt={showDetailModal} onClose={() => setShowDetailModal(null)} onUpdateStatus={handleUpdateStatus} onReschedule={handleReschedule} onReassign={handleReassign} onDelete={handleDelete} teamMembers={teamMembers} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

function KPIBadge({ icon, value, label, scheme }: { icon: React.ReactNode; value: number | string; label: string; scheme: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 bg-${scheme}-50 dark:bg-${scheme}-900/20 rounded-lg`}>
      {icon}
      <span className={`text-sm font-semibold text-${scheme}-700 dark:text-${scheme}-300`}>{value}</span>
      <span className={`text-xs text-${scheme}-500`}>{label}</span>
    </div>
  );
}

function NewAppointmentModal({ onClose, onSave, saving, teamMembers, prefillTime, prefillStylist, date }: {
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
  teamMembers: TeamMember[];
  prefillTime: string | null;
  prefillStylist: string | null;
  date: string;
}) {
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [time, setTime] = useState(prefillTime || '10:00');
  const [assignedTo, setAssignedTo] = useState(prefillStylist || teamMembers[0]?.user_id || '');
  const [service, setService] = useState(SERVICES[0].name);
  const [notes, setNotes] = useState('');
  const [apptDate, setApptDate] = useState(date);

  const selectedService = SERVICES.find(s => s.name === service);

  const handleSubmit = () => {
    if (!clientName.trim()) return;
    const member = teamMembers.find(m => m.user_id === assignedTo);
    onSave({
      clientName: clientName.trim(), clientPhone: clientPhone.trim(),
      clientEmail: clientEmail.trim() || undefined,
      date: apptDate, time,
      notes: notes.trim() || service,
      assignedTo, assignedName: member ? getMemberName(member) : '',
      appointmentType: 'service' as AppointmentType,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Nueva cita</h2>
            <p className="text-xs text-gray-500">Completa los datos del cliente y servicio</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Cliente *</label>
            <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nombre del cliente" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:ring-2 focus:ring-violet-500 outline-none" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tel\u00e9fono</label>
            <input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="600 123 456" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
            <input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="cliente@email.com" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Servicio</label>
            <select value={service} onChange={e => setService(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
              {SERVICES.map(s => <option key={s.name} value={s.name}>{s.name} ({s.duration} min — {s.price} \u20ac)</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Fecha</label>
            <input type="date" value={apptDate} onChange={e => setApptDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Hora</label>
            <select value={time} onChange={e => setTime(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {teamMembers.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Estilista</label>
              <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                {teamMembers.map(m => <option key={m.user_id} value={m.user_id}>{getMemberName(m)}</option>)}
              </select>
            </div>
          )}
          <div className={teamMembers.length > 1 ? '' : 'sm:col-span-2'}>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notas</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Detalles adicionales\u2026" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm resize-none" />
          </div>
        </div>
        {selectedService && (
          <div className="flex items-center gap-3 px-3 py-2 bg-violet-50 dark:bg-violet-900/20 rounded-lg text-sm">
            <Clock className="w-4 h-4 text-violet-500" /><span className="text-violet-700 dark:text-violet-300">{selectedService.duration} min</span>
            <span className="text-violet-400">\u00b7</span>
            <DollarSign className="w-4 h-4 text-violet-500" /><span className="text-violet-700 dark:text-violet-300">{selectedService.price} \u20ac</span>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={handleSubmit} disabled={!clientName.trim() || saving} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}Crear cita
          </button>
        </div>
      </div>
    </div>
  );
}

function AppointmentDetailModal({ appt, onClose, onUpdateStatus, onReschedule, onReassign, onDelete, teamMembers }: {
  appt: Appointment; onClose: () => void;
  onUpdateStatus: (a: Appointment, s: AppointmentStatus) => void;
  onReschedule: (a: Appointment, t: string) => void;
  onReassign: (a: Appointment, id: string, name: string) => void;
  onDelete: (a: Appointment) => void;
  teamMembers: TeamMember[];
}) {
  const [editTime, setEditTime] = useState(appt.time || '10:00');
  const [editStylist, setEditStylist] = useState(appt.assignedTo || '');
  const [showReschedule, setShowReschedule] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const st = STATUS_CFG[appt.status] || STATUS_CFG.pending;
  const duration = guessDuration(appt);
  const endTime = minutesToTime(timeToMinutes(appt.time || '09:00') + duration);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{appt.clientName || 'Sin nombre'}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{appt.notes || appointmentTypeLabel(appt.appointmentType)}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0"><X className="w-5 h-5" /></button>
          </div>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>{st.icon}{st.label}</span>
            <span className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{appt.time} — {endTime} ({duration} min)</span>
          </div>
        </div>

        <div className="px-6 py-4 space-y-3">
          {appt.clientPhone && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Phone className="w-4 h-4 text-gray-400" /><a href={`tel:${appt.clientPhone}`} className="hover:underline">{appt.clientPhone}</a>
            </div>
          )}
          {appt.clientEmail && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Mail className="w-4 h-4 text-gray-400" /><a href={`mailto:${appt.clientEmail}`} className="hover:underline">{appt.clientEmail}</a>
            </div>
          )}
          {appt.assignedName && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <User className="w-4 h-4 text-gray-400" />{appt.assignedName}
            </div>
          )}
          {appt.source === 'booking' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Reserva online</span>
          )}
        </div>

        {appt.status !== 'cancelled' && (
          <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Cambiar estado</p>
            <div className="flex flex-wrap gap-2">
              {appt.status !== 'confirmed' && appt.status !== 'completed' && (
                <button onClick={() => onUpdateStatus(appt, 'confirmed')} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 hover:bg-emerald-200 transition-colors">
                  <CheckCircle className="w-3.5 h-3.5 inline mr-1" />Confirmar
                </button>
              )}
              {appt.status !== 'completed' && (
                <button onClick={() => onUpdateStatus(appt, 'completed')} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 hover:bg-indigo-200 transition-colors">
                  <CheckCircle className="w-3.5 h-3.5 inline mr-1" />Completar
                </button>
              )}
              <button onClick={() => onUpdateStatus(appt, 'cancelled')} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400 hover:bg-gray-200 transition-colors">
                <Ban className="w-3.5 h-3.5 inline mr-1" />Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-700 space-y-3">
          <div>
            <button onClick={() => setShowReschedule(s => !s)} className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline">
              <Clock className="w-3.5 h-3.5 inline mr-1" />{showReschedule ? 'Ocultar' : 'Reprogramar hora'}
            </button>
            {showReschedule && (
              <div className="mt-2 flex items-center gap-2">
                <select value={editTime} onChange={e => setEditTime(e.target.value)} className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                  {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button onClick={() => { onReschedule(appt, editTime); setShowReschedule(false); }} className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 transition-colors">Aplicar</button>
              </div>
            )}
          </div>
          {teamMembers.length > 1 && (
            <div>
              <button onClick={() => setShowReassign(s => !s)} className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline">
                <Users className="w-3.5 h-3.5 inline mr-1" />{showReassign ? 'Ocultar' : 'Reasignar estilista'}
              </button>
              {showReassign && (
                <div className="mt-2 flex items-center gap-2">
                  <select value={editStylist} onChange={e => setEditStylist(e.target.value)} className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
                    {teamMembers.map(m => <option key={m.user_id} value={m.user_id}>{getMemberName(m)}</option>)}
                  </select>
                  <button onClick={() => { const m = teamMembers.find(t => t.user_id === editStylist); if (m) { onReassign(appt, editStylist, getMemberName(m)); setShowReassign(false); } }} className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 transition-colors">Aplicar</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700">
          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />Eliminar cita
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600 dark:text-red-400">\u00bfSeguro?</span>
              <button onClick={() => onDelete(appt)} className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors">Eliminar</button>
              <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">No</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
