import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useModalClose } from '../../hooks/useModalClose';
import { useClientPhoneSearch } from '../../hooks/useClientPhoneSearch';
import { resolveClientSearchBusinessId } from '../../lib/clientSearchScope';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { formatDateEs, formatDateEsAsTyping, parseDateEsToIso } from '../../lib/formatDateEs';
import type { Client } from '../../context/AppContext';
import {
  listDiningTablesRequest,
  getFloorConfigRequest,
  type DiningTable,
} from '../../lib/salaApi';
import type { SalaRoom } from '../../lib/salaStudioTypes';
import {
  listReservations,
  createReservation,
  updateReservation,
  confirmReservation,
  cancelReservation,
  finalizeReservation,
  deleteReservation,
  duplicateReservation,
  assignTable,
  seatGuest,
  reservationsCrudApi,
  applyAutomationRules,
} from '../../lib/restaurantReservationsApi';
import {
  ACTIVE_STATUSES,
  AUTOMATION_STORAGE_KEY,
  DEFAULT_AUTOMATION,
  EMPTY_FORM,
  FILTER_TABS,
  STATUS_CFG,
  formatRemainingTime,
  matchesFilterStatus,
  parseHistory,
  type ReservationAutomationSettings,
  type ReservationFilterStatus,
  type ReservationFormData,
  type RestaurantReservation,
  type ReservationStatus,
} from '../../lib/restaurantReservationTypes';
import {
  diningTableDisplayName,
  diningTableStatusLabel,
  formatDiningTablePickerLabel,
  groupDiningTablesByZone,
  isDiningTablePickable,
  sortDiningTablesForPicker,
} from '../../lib/restaurantTableSelectUi';
import {
  Search,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Users,
  MapPin,
  Phone,
  Mail,
  Loader2,
  Copy,
  Check,
  UserCheck,
  Trash2,
  Edit2,
  Armchair,
  AlertCircle,
  Settings2,
  ExternalLink,
} from 'lucide-react';
import { writeSalaTpvOpenTable } from '../../lib/salaTpvLaunch';
import { toast } from 'sonner';

function formatClientPhone(client: Client): string {
  const prefix = client.phonePrefix || '+34';
  const phone = client.phone || '';
  return phone ? `${prefix} ${phone}`.trim() : '';
}

function loadAutomationSettings(): ReservationAutomationSettings {
  try {
    const raw = localStorage.getItem(AUTOMATION_STORAGE_KEY);
    if (raw) return { ...DEFAULT_AUTOMATION, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_AUTOMATION;
}

function saveAutomationSettings(s: ReservationAutomationSettings) {
  localStorage.setItem(AUTOMATION_STORAGE_KEY, JSON.stringify(s));
}

function todayLocalIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalIsoDate(d);
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

function weekDays(dateStr: string): string[] {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(monday);
    x.setDate(monday.getDate() + i);
    return toLocalIsoDate(x);
  });
}

export function RestaurantReservationsPage() {
  const { user } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const navigate = useNavigate();
  const userId = user?.user_id || user?.id || '';
  const userName = user?.fullName || user?.email || 'Usuario';
  const businessId = currentBusiness?.business_id || '';
  const businessScopeId = resolveBusinessScopeId(currentBusiness);
  const clientSearchBusinessId = resolveClientSearchBusinessId(currentBusiness, businessScopeId);
  const reservationScope = useMemo(
    () => ({
      businessId: businessScopeId,
      accountBusinessCount: businesses.length || 1,
    }),
    [businessScopeId, businesses.length],
  );
  const clientScope = useMemo(
    () => ({
      businessId: businessScopeId,
      searchBusinessId: clientSearchBusinessId,
      accountBusinessCount: businesses.length || 1,
    }),
    [businessScopeId, clientSearchBusinessId, businesses.length],
  );

  const [reservations, setReservations] = useState<RestaurantReservation[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  const [rooms, setRooms] = useState<SalaRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(todayLocalIso);
  const [filterStatus, setFilterStatus] = useState<ReservationFilterStatus>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<RestaurantReservation | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RestaurantReservation | null>(null);
  const [form, setForm] = useState<ReservationFormData>(EMPTY_FORM);
  const [formDateDisplay, setFormDateDisplay] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showAutomation, setShowAutomation] = useState(false);
  const [automation, setAutomation] = useState<ReservationAutomationSettings>(loadAutomationSettings);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [clientLookup, setClientLookup] = useState('');
  const [clientEditing, setClientEditing] = useState(true);

  const {
    results: clientResults,
    isSearching: isClientSearching,
    searchError: clientSearchError,
    selectedClient,
    selectClient,
    clearSelection,
    clearResults,
  } = useClientPhoneSearch({
    userId,
    phone: clientLookup,
    businessId: clientSearchBusinessId,
    enabled: showModal,
    matchByName: true,
    minQueryLength: 2,
  });

  useModalClose(showModal, () => {
    setShowModal(false);
    setEditing(null);
    setForm({ ...EMPTY_FORM, date: selectedDate });
    setFormDateDisplay(formatDateEs(selectedDate));
    setClientLookup('');
    setClientEditing(true);
    clearSelection();
    clearResults();
  });
  useModalClose(showAssignModal, () => setShowAssignModal(false));
  useModalClose(showAutomation, () => setShowAutomation(false));

  const actor = useMemo(() => ({ userId, userName }), [userId, userName]);

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
      const [resList, tableList, floorConfig] = await Promise.all([
        listReservations(userId, reservationScope),
        listDiningTablesRequest(userId, businessScopeId ? { businessId: businessScopeId } : undefined),
        getFloorConfigRequest(userId, businessScopeId ? { businessId: businessScopeId } : undefined),
      ]);
      setReservations(resList);
      setTables(tableList);
      const floorRooms = Array.isArray(floorConfig?.rooms)
        ? (floorConfig.rooms as SalaRoom[])
        : [];
      setRooms(floorRooms);
      setSelected((prev) => {
        if (!prev) return null;
        return resList.find((r) => r._id === prev._id) ?? prev;
      });
    } catch {
      if (!silent) {
        setReservations([]);
        setTables([]);
        setRooms([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [userId, businessScopeId, reservationScope]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Auto-refresh silencioso: no sustituir la lista por el spinner
  useEffect(() => {
    const interval = setInterval(() => {
      void loadData({ silent: true });
    }, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Persist automation status changes
  useEffect(() => {
    if (!userId || !automation.enabled) return;
    const tick = async () => {
      const withRules = applyAutomationRules(reservations, automation);
      for (let i = 0; i < withRules.length; i++) {
        const next = withRules[i];
        const prev = reservations[i];
        if (prev && next.status !== prev.status && (next.status === 'delayed' || next.status === 'no_show')) {
          try {
            const history = JSON.stringify([
              {
                action: next.status === 'delayed' ? 'Retraso automático' : 'No presentado automático',
                userId: 'system',
                userName: 'Sistema',
                at: new Date().toISOString(),
              },
              ...parseHistory(prev.history),
            ]);
            await reservationsCrudApi.update(userId, prev._id, { status: next.status, history });
          } catch { /* ignore */ }
        }
      }
    };
    const id = setInterval(() => void tick(), 60_000);
    return () => clearInterval(id);
  }, [userId, reservations, automation]);

  const displayReservations = useMemo(
    () => applyAutomationRules(reservations, automation),
    [reservations, automation],
  );

  const dayReservations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return displayReservations
      .filter((r) => r.date === selectedDate)
      .filter((r) => matchesFilterStatus(r.status, filterStatus))
      .filter((r) => {
        if (!q) return true;
        return (
          r.guestName.toLowerCase().includes(q)
          || r.phone.toLowerCase().includes(q)
          || r.tableNumber.includes(q)
          || r.date.includes(q)
        );
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [displayReservations, selectedDate, filterStatus, search]);

  const countsByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of displayReservations) {
      if (ACTIVE_STATUSES.includes(r.status as ReservationStatus) || r.status === 'confirmed') {
        map[r.date] = (map[r.date] || 0) + 1;
      }
    }
    return map;
  }, [displayReservations]);

  const week = useMemo(() => weekDays(selectedDate), [selectedDate]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, date: selectedDate });
    setFormDateDisplay(formatDateEs(selectedDate));
    setClientLookup('');
    setClientEditing(true);
    clearSelection();
    clearResults();
    setShowModal(true);
  };

  const applyClient = (client: Client) => {
    selectClient(client);
    setForm((prev) => ({
      ...prev,
      clientId: client.id,
      guestName: client.name || client.fullName || prev.guestName,
      phone: formatClientPhone(client) || prev.phone,
      email: client.email || prev.email,
    }));
    setClientLookup('');
    setClientEditing(false);
  };

  const clearLinkedClient = () => {
    clearSelection();
    setForm((prev) => ({ ...prev, clientId: '' }));
    setClientLookup('');
    setClientEditing(true);
  };

  const openEdit = (item: RestaurantReservation) => {
    setEditing(item);
    setForm({
      guestName: item.guestName,
      phone: item.phone,
      email: item.email,
      clientId: item.clientId || '',
      date: item.date,
      time: item.time,
      partySize: item.partySize,
      preferredZone: item.preferredZone,
      tableId: item.tableId,
      tableName: item.tableName,
      tableNumber: item.tableNumber,
      notes: item.notes,
      status: item.status,
    });
    setFormDateDisplay(formatDateEs(item.date));
    setClientLookup('');
    setClientEditing(!item.clientId);
    clearSelection();
    clearResults();
    setShowModal(true);
  };

  const handleSave = async () => {
    const dateIso = parseDateEsToIso(formDateDisplay) || form.date;
    if (!userId || !form.guestName.trim() || !dateIso || !form.time) {
      toast.error('Completa nombre, fecha y hora');
      return;
    }
    const payload = { ...form, date: dateIso };
    setSaving(true);
    try {
      if (editing) {
        const item = await updateReservation(userId, editing, payload, actor, tables, reservations, clientScope);
        toast.success(item.clientId ? 'Reserva actualizada · Cliente en CRM' : 'Reserva actualizada');
        setSelected(item);
      } else {
        const { item, tableAssigned, clientLinked } = await createReservation(
          userId,
          payload,
          actor,
          tables,
          reservations,
          clientScope,
        );
        const phoneDigits = form.phone.replace(/\D/g, '');
        if (tableAssigned && clientLinked) {
          toast.success('Reserva creada · Mesa asignada · Cliente guardado en CRM');
        } else if (tableAssigned) {
          toast.success('Reserva creada · Mesa asignada automáticamente');
        } else if (clientLinked) {
          toast.success('Reserva creada · Cliente guardado en CRM');
        } else if (phoneDigits.length > 0 && phoneDigits.length < 9) {
          toast.success('Reserva creada · Teléfono incompleto para CRM (mín. 9 dígitos)');
        } else if (!phoneDigits.length) {
          toast.success('Reserva creada · Añade teléfono para guardar en CRM');
        } else {
          toast.success('Reserva creada correctamente');
        }
        setSelected(item);
      }
      setShowModal(false);
      setEditing(null);
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (action: () => Promise<RestaurantReservation | void>, successMsg: string) => {
    setSaving(true);
    try {
      const result = await action();
      toast.success(successMsg);
      if (result) setSelected(result);
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error en la acción');
    } finally {
      setSaving(false);
    }
  };

  const handleSeat = async (item: RestaurantReservation) => {
    setSaving(true);
    try {
      const { tableId, orderId } = await seatGuest(userId, item, actor, businessId);
      toast.success('Cliente sentado · Abriendo TPV');
      writeSalaTpvOpenTable({ tableId, orderId });
      await loadData();
      navigate(`/saas/caja/tpv?mesa=${encodeURIComponent(tableId)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo sentar al cliente');
    } finally {
      setSaving(false);
    }
  };

  const calendarCells = useMemo(() => {
    const first = new Date(calendarMonth.year, calendarMonth.month, 1);
    const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const daysInMonth = new Date(calendarMonth.year, calendarMonth.month + 1, 0).getDate();
    const cells: (string | null)[] = Array(startDay).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calendarMonth.year}-${String(calendarMonth.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push(dateStr);
    }
    return cells;
  }, [calendarMonth]);

  const zoneOptions = useMemo(() => {
    const fromTables = [...new Set(tables.map((t) => t.zone).filter(Boolean))];
    const fromRooms = rooms.map((r) => r.name).filter(Boolean);
    return [...new Set([...fromRooms, ...fromTables])];
  }, [tables, rooms]);

  const availableTablesForAssign = useMemo(() => {
    if (!selected) return [];
    const partySize = parseInt(selected.partySize, 10) || 2;
    return sortDiningTablesForPicker(
      tables.filter((t) => t.active && t.capacity >= partySize && t.status !== 'hidden'),
    );
  }, [selected, tables]);

  const pickableTablesForForm = useMemo(
    () =>
      groupDiningTablesByZone(
        tables.filter((t) => t.active && t.status !== 'hidden'),
      ),
    [tables],
  );

  return (
    <Layout title="Reservas">
      <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
        {/* Top bar */}
        <div className="shrink-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold capitalize text-gray-900 dark:text-gray-100">
                {formatDisplayDate(selectedDate)}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {dayReservations.length} reserva{dayReservations.length !== 1 ? 's' : ''} este día
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedDate(todayLocalIso())}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => setShowAutomation(true)}
                className="rounded-xl border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                aria-label="Automatización"
              >
                <Settings2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-800"
              >
                <Plus className="h-4 w-4" />
                Nueva reserva
              </button>
            </div>
          </div>

          {/* Week selector */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedDate(addDays(selectedDate, -7))}
              className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {week.map((d) => {
              const isSelected = d === selectedDate;
              const isToday = d === todayLocalIso();
              const dayLabel = new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
              const count = countsByDate[d] || 0;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setSelectedDate(d)}
                  className={`relative shrink-0 rounded-xl px-3 py-2 text-center text-sm transition-all ${
                    isSelected
                      ? 'bg-violet-600 font-semibold text-white shadow-md'
                      : 'border border-gray-200 bg-white text-gray-700 hover:border-violet-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                  }`}
                >
                  <span className="block capitalize">{dayLabel}</span>
                  {count > 0 && (
                    <span className={`mt-0.5 block text-[10px] ${isSelected ? 'text-violet-200' : 'text-violet-600'}`}>
                      {count} res.
                    </span>
                  )}
                  {isToday && !isSelected && (
                    <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-violet-500" />
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setSelectedDate(addDays(selectedDate, 7))}
              className="shrink-0 rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Search + filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre, teléfono, mesa o fecha…"
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterStatus(tab.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    filterStatus === tab.id
                      ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Three columns */}
        <div className="flex min-h-0 flex-1 gap-4">
          {/* LEFT: Calendar + filters */}
          <aside className="hidden w-56 shrink-0 flex-col gap-4 lg:flex xl:w-64">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {new Date(calendarMonth.year, calendarMonth.month).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                </span>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((m) => (m.month === 0 ? { year: m.year - 1, month: 11 } : { ...m, month: m.month - 1 }))}
                    className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarMonth((m) => (m.month === 11 ? { year: m.year + 1, month: 0 } : { ...m, month: m.month + 1 }))}
                    className="rounded p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-gray-400">
                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {calendarCells.map((dateStr, i) => {
                  if (!dateStr) return <span key={`empty-${i}`} />;
                  const isSelected = dateStr === selectedDate;
                  const isToday = dateStr === todayLocalIso();
                  const count = countsByDate[dateStr] || 0;
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => setSelectedDate(dateStr)}
                      className={`relative flex h-8 items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                        isSelected
                          ? 'bg-violet-600 text-white'
                          : isToday
                            ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
                            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                      }`}
                    >
                      {parseInt(dateStr.slice(8), 10)}
                      {count > 0 && !isSelected && (
                        <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-violet-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={openCreate}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white hover:bg-violet-700"
            >
              <Plus className="h-4 w-4" />
              Nueva reserva
            </button>
          </aside>

          {/* CENTER: List */}
          <main className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            {loading ? (
              <div className="flex h-full items-center justify-center gap-2 text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Cargando reservas…
              </div>
            ) : dayReservations.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <Calendar className="h-12 w-12 text-gray-300" />
                <p className="font-medium text-gray-500">No hay reservas para este día</p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                >
                  Crear primera reserva
                </button>
              </div>
            ) : (
              <div className="h-full overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
                {dayReservations.map((item) => {
                  const cfg = STATUS_CFG[item.status] || STATUS_CFG.pending;
                  const isActive = selected?._id === item._id;
                  const isUpcoming = ACTIVE_STATUSES.includes(item.status as ReservationStatus) || item.status === 'confirmed';
                  return (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => setSelected(item)}
                      className={`w-full px-4 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                        isActive ? 'bg-violet-50 dark:bg-violet-950/20' : ''
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-14 shrink-0 text-center">
                          <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">{item.time}</p>
                          {isUpcoming && (
                            <p className="min-h-[1rem] text-[10px] font-medium tabular-nums text-violet-600 dark:text-violet-400">
                              {formatRemainingTime(item.date, item.time)}
                            </p>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-gray-900 dark:text-gray-100">{item.guestName}</p>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                              {cfg.label}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{item.partySize} pers.</span>
                            {item.preferredZone && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{item.preferredZone}</span>}
                            {item.tableNumber && <span className="inline-flex items-center gap-1"><Armchair className="h-3 w-3" />Mesa {item.tableNumber}</span>}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </main>

          {/* RIGHT: Detail panel */}
          <aside className="hidden w-80 shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 lg:flex lg:flex-col xl:w-96">
            {!selected ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-gray-400">
                <Calendar className="h-10 w-10 opacity-40" />
                <p className="text-sm">Selecciona una reserva para ver el detalle</p>
              </div>
            ) : (
              <>
                <div className="border-b border-gray-100 px-4 py-4 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selected.guestName}</h2>
                        {selected.clientId ? (
                          <Link
                            to={`/saas/crm/clientes/${encodeURIComponent(selected.clientId)}`}
                            className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300"
                          >
                            CRM
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : null}
                      </div>
                      <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CFG[selected.status]?.bg} ${STATUS_CFG[selected.status]?.text}`}>
                        {STATUS_CFG[selected.status]?.label}
                      </span>
                    </div>
                    <button type="button" onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                      <p className="text-[10px] font-semibold uppercase text-gray-400">Fecha</p>
                      <p className="mt-0.5 font-medium">{formatDateEs(selected.date)}</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                      <p className="text-[10px] font-semibold uppercase text-gray-400">Hora</p>
                      <p className="mt-0.5 font-medium">{selected.time}</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                      <p className="text-[10px] font-semibold uppercase text-gray-400">Personas</p>
                      <p className="mt-0.5 font-medium">{selected.partySize}</p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                      <p className="text-[10px] font-semibold uppercase text-gray-400">Mesa</p>
                      <p className="mt-0.5 font-medium">{selected.tableNumber ? `#${selected.tableNumber}` : 'Sin mesa'}</p>
                    </div>
                  </div>

                  {(selected.phone || selected.email) && (
                    <div className="space-y-2 text-sm">
                      {selected.phone && (
                        <p className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Phone className="h-4 w-4 shrink-0" />{selected.phone}
                        </p>
                      )}
                      {selected.email && (
                        <p className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Mail className="h-4 w-4 shrink-0" />{selected.email}
                        </p>
                      )}
                    </div>
                  )}

                  {selected.preferredZone && (
                    <p className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <MapPin className="h-4 w-4" />Zona: {selected.preferredZone}
                    </p>
                  )}

                  {selected.notes && (
                    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
                      {selected.notes}
                    </div>
                  )}

                  {/* History */}
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Historial</p>
                    <div className="space-y-2">
                      {parseHistory(selected.history).length === 0 ? (
                        <p className="text-xs text-gray-400">Sin eventos registrados</p>
                      ) : (
                        parseHistory(selected.history).map((entry, i) => (
                          <div key={`${entry.at}-${i}`} className="rounded-lg border border-gray-100 px-3 py-2 text-xs dark:border-gray-800">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-gray-800 dark:text-gray-200">{entry.action}</span>
                              <span className="shrink-0 text-gray-400">
                                {new Date(entry.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="mt-0.5 text-gray-500">{entry.userName}</p>
                            {entry.details && <p className="mt-0.5 text-gray-400">{entry.details}</p>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="shrink-0 space-y-2 border-t border-gray-100 p-4 dark:border-gray-800">
                  <div className="grid grid-cols-2 gap-2">
                    {selected.status === 'pending' && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void runAction(() => confirmReservation(userId, selected, actor), 'Reserva confirmada')}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />Confirmar
                      </button>
                    )}
                    {['pending', 'confirmed', 'arrived', 'delayed'].includes(selected.status) && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSeat(selected)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <UserCheck className="h-3.5 w-3.5" />Sentar
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => openEdit(selected)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2 text-xs font-medium dark:border-gray-700"
                    >
                      <Edit2 className="h-3.5 w-3.5" />Editar
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setShowAssignModal(true)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2 text-xs font-medium dark:border-gray-700"
                    >
                      <Armchair className="h-3.5 w-3.5" />{selected.tableId ? 'Cambiar mesa' : 'Asignar mesa'}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void runAction(
                        () => duplicateReservation(userId, selected, actor, tables, reservations, clientScope),
                        'Reserva duplicada',
                      )}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2 text-xs font-medium dark:border-gray-700"
                    >
                      <Copy className="h-3.5 w-3.5" />Duplicar
                    </button>
                    {!['cancelled', 'finished', 'seated'].includes(selected.status) && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void runAction(() => cancelReservation(userId, selected, actor), 'Reserva cancelada')}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 py-2 text-xs font-medium text-red-600 dark:border-red-900"
                      >
                        Cancelar
                      </button>
                    )}
                    {selected.status === 'seated' && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void runAction(() => finalizeReservation(userId, selected, actor), 'Reserva finalizada')}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-2 text-xs font-medium dark:border-gray-700"
                      >
                        Finalizar
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        if (!window.confirm('¿Eliminar esta reserva permanentemente?')) return;
                        void runAction(async () => { await deleteReservation(userId, selected); setSelected(null); }, 'Reserva eliminada');
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 py-2 text-xs font-medium text-red-600 dark:border-red-900"
                    >
                      <Trash2 className="h-3.5 w-3.5" />Eliminar
                    </button>
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>
      </div>

      {/* Create/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">{editing ? 'Editar reserva' : 'Nueva reserva'}</h2>
              <button type="button" onClick={() => setShowModal(false)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Cliente CRM (teléfono o nombre)
                </label>
                {selectedClient || form.clientId ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-violet-200 bg-violet-50 p-3 dark:border-violet-800 dark:bg-violet-950/30">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {selectedClient?.name || form.guestName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Se vinculará al CRM de clientes
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearLinkedClient}
                      className="shrink-0 rounded-lg p-1.5 text-violet-700 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-900/40"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        value={clientLookup}
                        onChange={(e) => {
                          setClientLookup(e.target.value);
                          setClientEditing(true);
                          setForm((prev) => ({ ...prev, clientId: '' }));
                          clearSelection();
                        }}
                        placeholder="Buscar cliente existente…"
                        className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-10 text-sm dark:border-gray-700 dark:bg-gray-800"
                        autoComplete="off"
                      />
                      {isClientSearching ? (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
                      ) : null}
                    </div>
                    {clientSearchError ? (
                      <p className="mt-1 text-xs text-red-500">{clientSearchError}</p>
                    ) : null}
                    {clientEditing && clientResults.length > 0 ? (
                      <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                        {clientResults.map((client) => (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => applyClient(client)}
                            className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {client.name || client.fullName || 'Cliente'}
                              </p>
                              <p className="text-xs text-gray-500">{formatClientPhone(client) || client.email || '—'}</p>
                            </div>
                            <span className="shrink-0 text-xs font-bold text-violet-600">Vincular</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-1.5 text-[11px] text-gray-500">
                      Si no existe, se crea al guardar (teléfono mín. 9 dígitos).
                    </p>
                  </>
                )}
              </div>
              <input
                value={form.guestName}
                onChange={(e) => {
                  setClientEditing(true);
                  clearSelection();
                  setForm((p) => ({ ...p, guestName: e.target.value, clientId: '' }));
                }}
                placeholder="Nombre *"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={form.phone}
                  onChange={(e) => {
                    setClientEditing(true);
                    clearSelection();
                    setForm((p) => ({ ...p, phone: e.target.value, clientId: '' }));
                  }}
                  placeholder="Teléfono (para CRM)"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
                />
                <input
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="Email"
                  type="email"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="DD/MM/AAAA"
                  value={formDateDisplay}
                  onChange={(e) => {
                    const next = formatDateEsAsTyping(e.target.value);
                    setFormDateDisplay(next);
                    const iso = parseDateEsToIso(next);
                    if (iso) setForm((p) => ({ ...p, date: iso }));
                  }}
                  onBlur={() => {
                    const iso = parseDateEsToIso(formDateDisplay);
                    if (iso) {
                      setForm((p) => ({ ...p, date: iso }));
                      setFormDateDisplay(formatDateEs(iso));
                    } else if (form.date) {
                      setFormDateDisplay(formatDateEs(form.date));
                    }
                  }}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
                />
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={form.partySize}
                  onChange={(e) => setForm((p) => ({ ...p, partySize: e.target.value }))}
                  placeholder="Nº personas"
                  type="number"
                  min={1}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
                />
                <select
                  value={form.preferredZone}
                  onChange={(e) => setForm((p) => ({ ...p, preferredZone: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
                >
                  <option value="">Zona preferida</option>
                  {zoneOptions.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <select
                value={form.tableId}
                onChange={(e) => {
                  const t = tables.find((x) => x._id === e.target.value);
                  setForm((p) => ({
                    ...p,
                    tableId: e.target.value,
                    tableName: t?.name || '',
                    tableNumber: t ? String(t.number) : '',
                  }));
                }}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <option value="">Mesa (opcional — auto-asignación)</option>
                {pickableTablesForForm.map(([zone, zoneTables]) => (
                  <optgroup key={zone} label={zone}>
                    {zoneTables.map((t) => (
                      <option key={t._id} value={t._id} disabled={!isDiningTablePickable(t.status)}>
                        {formatDiningTablePickerLabel(t)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Observaciones (alergias, silla infantil…)"
                rows={3}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowModal(false)} className="rounded-xl border px-4 py-2 text-sm dark:border-gray-700">Cancelar</button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign table modal */}
      {showAssignModal && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Asignar mesa</h2>
              <button type="button" onClick={() => setShowAssignModal(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-2">
              {availableTablesForAssign.length === 0 ? (
                <p className="text-sm text-gray-500">No hay mesas compatibles</p>
              ) : (
                availableTablesForAssign.map((t) => (
                  <button
                    key={t._id}
                    type="button"
                    disabled={saving || !isDiningTablePickable(t.status)}
                    onClick={() => void runAction(async () => {
                      const item = await assignTable(userId, selected, t, actor, tables, reservations);
                      setShowAssignModal(false);
                      return item;
                    }, 'Mesa asignada')}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors hover:border-violet-400 disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected.tableId === t._id ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/20' : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {diningTableDisplayName(t)}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t.zone} · {t.capacity} pers. · {diningTableStatusLabel(t.status)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Automation settings */}
      {showAutomation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Automatización</h2>
              <button type="button" onClick={() => setShowAutomation(false)}><X className="h-5 w-5" /></button>
            </div>
            <label className="mb-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={automation.enabled}
                onChange={(e) => setAutomation((a) => ({ ...a, enabled: e.target.checked }))}
              />
              Activar alertas automáticas
            </label>
            <div className="space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-gray-500">Marcar retraso tras (minutos)</label>
                <input
                  type="number"
                  min={5}
                  value={automation.delayAfterMinutes}
                  onChange={(e) => setAutomation((a) => ({ ...a, delayAfterMinutes: parseInt(e.target.value, 10) || 15 }))}
                  className="w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-gray-500">Marcar no presentado tras (minutos más)</label>
                <input
                  type="number"
                  min={10}
                  value={automation.noShowAfterMinutes}
                  onChange={(e) => setAutomation((a) => ({ ...a, noShowAfterMinutes: parseInt(e.target.value, 10) || 30 }))}
                  className="w-full rounded-xl border px-3 py-2 dark:border-gray-700 dark:bg-gray-800"
                />
              </div>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Si llega la hora de la reserva verás una alerta visual. Tras el tiempo configurado cambiará a Retraso y luego a No presentado.
            </div>
            <button
              type="button"
              onClick={() => {
                saveAutomationSettings(automation);
                setShowAutomation(false);
                toast.success('Configuración guardada');
              }}
              className="mt-4 w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white"
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
