import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import {
  Hotel,
  BedDouble,
  Key,
  Users,
  ArrowLeft,
  Search,
  X,
  LogIn,
  LogOut,
  Calendar,
  DoorOpen,
  User,
  ChevronRight,
} from 'lucide-react';

type GuestStatus = 'reservado' | 'checked_in' | 'checked_out';
type RoomType = 'individual' | 'doble' | 'suite';
type RoomStatus = 'disponible' | 'ocupada' | 'limpieza' | 'mantenimiento';

interface HotelGuestStay {
  id: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  roomNumber: string | null;
  status: GuestStatus;
}

interface HotelRoom {
  id: string;
  number: string;
  type: RoomType;
  status: RoomStatus;
}

type MainTab = 'checkin' | 'rooms';
type StaySubFilter = 'llegadas' | 'salidas' | 'todos';

const GUEST_STATUS_CFG: Record<GuestStatus, { label: string; color: string; bg: string }> = {
  reservado: { label: 'Reservado', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800' },
  checked_in: { label: 'En casa', color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800' },
  checked_out: { label: 'Check-out', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-600' },
};

const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  individual: 'Individual',
  doble: 'Doble',
  suite: 'Suite',
};

const ROOM_STATUS_CFG: Record<RoomStatus, { label: string; color: string; bg: string }> = {
  disponible: { label: 'Disponible', color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800' },
  ocupada: { label: 'Ocupada', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800' },
  limpieza: { label: 'Limpieza', color: 'text-violet-700 dark:text-violet-300', bg: 'bg-violet-50 border-violet-200 dark:bg-violet-950/40 dark:border-violet-800' },
  mantenimiento: { label: 'Mantenimiento', color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-50 border-orange-200 dark:bg-orange-950/40 dark:border-orange-800' },
};

const ROOM_STATUS_ORDER: RoomStatus[] = ['disponible', 'ocupada', 'limpieza', 'mantenimiento'];

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function seedRooms(): HotelRoom[] {
  const specs: { n: string; t: RoomType; s: RoomStatus }[] = [
    { n: '101', t: 'individual', s: 'disponible' },
    { n: '102', t: 'doble', s: 'ocupada' },
    { n: '103', t: 'doble', s: 'limpieza' },
    { n: '104', t: 'suite', s: 'disponible' },
    { n: '201', t: 'individual', s: 'mantenimiento' },
    { n: '202', t: 'doble', s: 'disponible' },
    { n: '203', t: 'doble', s: 'disponible' },
    { n: '204', t: 'suite', s: 'ocupada' },
    { n: '301', t: 'suite', s: 'disponible' },
    { n: '302', t: 'individual', s: 'limpieza' },
  ];
  return specs.map((row) => ({
    id: uuidv4(),
    number: row.n,
    type: row.t,
    status: row.s,
  }));
}

function seedStays(today: string): HotelGuestStay[] {
  const tomorrow = (() => {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const yesterday = (() => {
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  return [
    {
      id: uuidv4(),
      guestName: 'María García López',
      checkInDate: today,
      checkOutDate: tomorrow,
      roomNumber: null,
      status: 'reservado',
    },
    {
      id: uuidv4(),
      guestName: 'Jean Dupont',
      checkInDate: yesterday,
      checkOutDate: today,
      roomNumber: '102',
      status: 'checked_in',
    },
    {
      id: uuidv4(),
      guestName: 'Ana Ruiz',
      checkInDate: today,
      checkOutDate: tomorrow,
      roomNumber: '204',
      status: 'checked_in',
    },
    {
      id: uuidv4(),
      guestName: 'Pedro Sánchez',
      checkInDate: yesterday,
      checkOutDate: yesterday,
      roomNumber: '105',
      status: 'checked_out',
    },
    {
      id: uuidv4(),
      guestName: 'Equipo Congreso SL',
      checkInDate: tomorrow,
      checkOutDate: (() => {
        const d = new Date(tomorrow + 'T12:00:00');
        d.setDate(d.getDate() + 2);
        return d.toISOString().slice(0, 10);
      })(),
      roomNumber: null,
      status: 'reservado',
    },
  ];
}

function StayCard({
  stay,
  onSelect,
}: {
  stay: HotelGuestStay;
  onSelect: (s: HotelGuestStay) => void;
}) {
  const cfg = GUEST_STATUS_CFG[stay.status];
  return (
    <button
      type="button"
      onClick={() => onSelect(stay)}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all hover:shadow-lg active:scale-[0.98] ${cfg.bg}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <User className="w-4 h-4 text-gray-500 shrink-0" />
          <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{stay.guestName}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 border ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {new Date(stay.checkInDate + 'T12:00:00').toLocaleDateString('es-ES')} →{' '}
          {new Date(stay.checkOutDate + 'T12:00:00').toLocaleDateString('es-ES')}
        </span>
        {stay.roomNumber ? (
          <span className="flex items-center gap-1 font-mono font-semibold text-gray-800 dark:text-gray-200">
            <DoorOpen className="w-3 h-3" /> Hab. {stay.roomNumber}
          </span>
        ) : (
          <span className="text-amber-600 dark:text-amber-400 font-medium">Sin habitación</span>
        )}
      </div>
      <div className="flex justify-end mt-2">
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </div>
    </button>
  );
}

export function WorkerTpvHotel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const workerName = user?.firstName ? `${user.firstName} ${user?.lastName || ''}`.trim() : 'Recepción';

  const today = useMemo(() => todayISO(), []);

  const [tab, setTab] = useState<MainTab>('checkin');
  const [stayFilter, setStayFilter] = useState<StaySubFilter>('llegadas');
  const [roomStatusFilter, setRoomStatusFilter] = useState<RoomStatus | 'all'>('all');
  const [roomTypeFilter, setRoomTypeFilter] = useState<RoomType | 'all'>('all');
  const [search, setSearch] = useState('');

  const [rooms, setRooms] = useState<HotelRoom[]>(() => seedRooms());
  const [stays, setStays] = useState<HotelGuestStay[]>(() => seedStays(today));

  const [selectedStay, setSelectedStay] = useState<HotelGuestStay | null>(null);
  const [assignRoomNumber, setAssignRoomNumber] = useState<string>('');

  const stats = useMemo(() => {
    const llegadasHoy = stays.filter((s) => s.checkInDate === today && s.status !== 'checked_out').length;
    const salidasHoy = stays.filter((s) => s.checkOutDate === today && s.status === 'checked_in').length;
    const disponibles = rooms.filter((r) => r.status === 'disponible').length;
    return { llegadasHoy, salidasHoy, disponibles };
  }, [stays, rooms, today]);

  const staysForTab = useMemo(() => {
    let list = stays;
    if (stayFilter === 'llegadas') {
      list = stays.filter((s) => s.checkInDate === today);
    } else if (stayFilter === 'salidas') {
      list = stays.filter((s) => s.checkOutDate === today);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.guestName.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.roomNumber && s.roomNumber.toLowerCase().includes(q)),
    );
  }, [stays, stayFilter, today, search]);

  const roomsFiltered = useMemo(() => {
    let list = rooms;
    if (roomStatusFilter !== 'all') list = list.filter((r) => r.status === roomStatusFilter);
    if (roomTypeFilter !== 'all') list = list.filter((r) => r.type === roomTypeFilter);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => r.number.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
  }, [rooms, roomStatusFilter, roomTypeFilter, search]);

  const disponiblesList = useMemo(() => rooms.filter((r) => r.status === 'disponible'), [rooms]);

  const processCheckIn = useCallback(
    (stayId: string, roomNumber: string) => {
      const room = rooms.find((r) => r.number === roomNumber);
      if (!room || room.status !== 'disponible') {
        toast.error('Habitación no disponible');
        return;
      }
      setRooms((prev) =>
        prev.map((r) => (r.number === roomNumber ? { ...r, status: 'ocupada' as RoomStatus } : r)),
      );
      setStays((prev) =>
        prev.map((s) =>
          s.id === stayId ? { ...s, status: 'checked_in' as GuestStatus, roomNumber } : s,
        ),
      );
      toast.success(`Check-in: habitación ${roomNumber} asignada`);
      setSelectedStay(null);
      setAssignRoomNumber('');
    },
    [rooms],
  );

  const processCheckOut = useCallback((stay: HotelGuestStay) => {
    if (!stay.roomNumber) {
      toast.error('El huésped no tiene habitación asignada');
      return;
    }
    setStays((prev) =>
      prev.map((s) => (s.id === stay.id ? { ...s, status: 'checked_out' as GuestStatus } : s)),
    );
    setRooms((prev) =>
      prev.map((r) =>
        r.number === stay.roomNumber ? { ...r, status: 'limpieza' as RoomStatus } : r,
      ),
    );
    toast.success(`Check-out: habitación ${stay.roomNumber} en limpieza`);
    setSelectedStay(null);
  }, []);

  const cycleRoomStatus = useCallback((roomId: string) => {
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== roomId) return r;
        const i = ROOM_STATUS_ORDER.indexOf(r.status);
        const next = ROOM_STATUS_ORDER[(i + 1) % ROOM_STATUS_ORDER.length];
        return { ...r, status: next };
      }),
    );
  }, []);

  const setRoomStatus = useCallback((roomId: string, status: RoomStatus) => {
    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, status } : r)));
  }, []);

  if (selectedStay) {
    const canCheckIn = selectedStay.status === 'reservado';
    const canCheckOut = selectedStay.status === 'checked_in' && selectedStay.checkOutDate <= today;

    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedStay(null);
                setAssignRoomNumber('');
              }}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Estancia</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className={`rounded-2xl border-2 p-4 ${GUEST_STATUS_CFG[selectedStay.status].bg}`}>
            <p className="text-xs font-mono text-gray-500 mb-1">{selectedStay.id.slice(0, 8)}…</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <User className="w-5 h-5" /> {selectedStay.guestName}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Entrada: {new Date(selectedStay.checkInDate + 'T12:00:00').toLocaleDateString('es-ES')} · Salida:{' '}
              {new Date(selectedStay.checkOutDate + 'T12:00:00').toLocaleDateString('es-ES')}
            </p>
            <p className="mt-2">
              <span className={`text-xs px-2 py-1 rounded-full font-semibold ${GUEST_STATUS_CFG[selectedStay.status].color}`}>
                {GUEST_STATUS_CFG[selectedStay.status].label}
              </span>
            </p>
            {selectedStay.roomNumber && (
              <p className="mt-2 text-sm font-semibold flex items-center gap-2">
                <Key className="w-4 h-4" /> Habitación {selectedStay.roomNumber}
              </p>
            )}
          </div>

          {canCheckIn && (
            <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-3">
                <LogIn className="w-4 h-4" /> Procesar check-in
              </h3>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                Asignar habitación (disponibles)
              </label>
              <select
                value={assignRoomNumber}
                onChange={(e) => setAssignRoomNumber(e.target.value)}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm mb-3"
              >
                <option value="">Seleccionar…</option>
                {disponiblesList.map((r) => (
                  <option key={r.id} value={r.number}>
                    {r.number} — {ROOM_TYPE_LABEL[r.type]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!assignRoomNumber}
                onClick={() => processCheckIn(selectedStay.id, assignRoomNumber)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shadow-md"
              >
                Confirmar check-in
              </button>
            </div>
          )}

          {selectedStay.status === 'checked_in' && (
            <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-2">
                <LogOut className="w-4 h-4" /> Check-out
              </h3>
              <p className="text-xs text-gray-500 mb-3">
                Al confirmar, la habitación pasará a estado <strong>limpieza</strong>.
              </p>
              <button
                type="button"
                disabled={!canCheckOut}
                onClick={() => processCheckOut(selectedStay)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 disabled:opacity-50 shadow-md"
              >
                {canCheckOut ? 'Confirmar check-out' : 'Salida no programada para hoy'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/saas/worker')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 shrink-0" />
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/40 rounded-xl flex items-center justify-center shrink-0">
              <Hotel className="w-5 h-5 text-amber-700 dark:text-amber-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">Mi Puesto - Recepción</h1>
              <p className="text-xs text-gray-500 truncate">{workerName}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => {
              setTab('checkin');
              setSearch('');
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === 'checkin'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Key className="w-4 h-4" /> Check-in/out
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('rooms');
              setSearch('');
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === 'rooms'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <BedDouble className="w-4 h-4" /> Habitaciones
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: 'Llegadas hoy', value: stats.llegadasHoy, color: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800' },
            { label: 'Salidas hoy', value: stats.salidasHoy, color: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800' },
            { label: 'Disponibles', value: stats.disponibles, color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border-2 p-2.5 text-center ${s.color}`}>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {tab === 'checkin' && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {(
              [
                { id: 'llegadas' as const, label: 'Llegadas' },
                { id: 'salidas' as const, label: 'Salidas' },
                { id: 'todos' as const, label: 'Todos' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStayFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  stayFilter === f.id
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'rooms' && (
          <div className="space-y-2 mb-2">
            <div className="flex gap-1.5 flex-wrap">
              {([{ id: 'all' as const, label: 'Estado: todos' }, ...ROOM_STATUS_ORDER.map((id) => ({ id, label: ROOM_STATUS_CFG[id].label }))] as const).map(
                (f) => (
                  <button
                    key={String(f.id)}
                    type="button"
                    onClick={() => setRoomStatusFilter(f.id)}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                      roomStatusFilter === f.id
                        ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {f.label}
                  </button>
                ),
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(
                [
                  { id: 'all' as const, label: 'Tipo: todos' },
                  { id: 'individual' as const, label: 'Individual' },
                  { id: 'doble' as const, label: 'Doble' },
                  { id: 'suite' as const, label: 'Suite' },
                ] as const
              ).map((f) => (
                <button
                  key={String(f.id)}
                  type="button"
                  onClick={() => setRoomTypeFilter(f.id)}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                    roomTypeFilter === f.id
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              tab === 'checkin'
                ? 'Buscar huésped, habitación, UUID…'
                : 'Buscar número de habitación, UUID…'
            }
            className="w-full pl-9 pr-8 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-gray-900 dark:text-gray-100"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === 'checkin' ? (
          staysForTab.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Users className="w-10 h-10 mb-2" />
              <p className="text-sm font-medium">No hay estancias en esta vista</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {staysForTab.map((s) => (
                <StayCard key={s.id} stay={s} onSelect={setSelectedStay} />
              ))}
            </div>
          )
        ) : roomsFiltered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <BedDouble className="w-10 h-10 mb-2" />
            <p className="text-sm font-medium">No hay habitaciones en esta vista</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {roomsFiltered.map((r) => {
              const st = ROOM_STATUS_CFG[r.status];
              return (
                <div
                  key={r.id}
                  className={`rounded-2xl border-2 p-3 flex flex-col gap-2 ${st.bg} transition-all hover:shadow-lg`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-lg font-bold font-mono text-gray-900 dark:text-gray-100">{r.number}</span>
                    <BedDouble className="w-4 h-4 text-gray-500 shrink-0" />
                  </div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{ROOM_TYPE_LABEL[r.type]}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold w-fit ${st.color}`}>{st.label}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <button
                      type="button"
                      title="Siguiente estado"
                      onClick={() => cycleRoomStatus(r.id)}
                      className="flex-1 min-w-[72px] py-1.5 rounded-lg text-[10px] font-bold bg-white/80 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-800"
                    >
                      Rotar
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {ROOM_STATUS_ORDER.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setRoomStatus(r.id, status)}
                        className={`px-1.5 py-1 rounded-md text-[10px] font-semibold border leading-tight ${
                          r.status === status
                            ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                            : 'bg-transparent border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {ROOM_STATUS_CFG[status].label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
