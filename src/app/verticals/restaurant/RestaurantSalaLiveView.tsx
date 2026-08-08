/**
 * Sala en servicio en vivo — datos reales de zonas/mesas (sin mocks).
 * Modo normal: 1 clic → ficha. Libre = montar mesa (sin cobrar). Ocupada = pedir/ver cuenta.
 * Modo editar: capacidad / comensales +/- , añadir/quitar mesas y zonas.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Clock,
  LayoutGrid,
  Minus,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { RestaurantSeatGuestsModal } from '../../components/saas/restaurant/RestaurantSeatGuestsModal';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useSSE } from '../../hooks/useSSE';
import {
  changeTableStatusRequest,
  listDiningOrdersRequest,
  listDiningTablesRequest,
  listTableTicketStatsRequest,
  type DiningOrder,
  type DiningTable,
  type DiningTableStatus,
} from '../../lib/salaApi';
import { isStrictDeliveryBusinessType } from '../../lib/deliveryOpsTypes';
import { ensureOpenDiningOrder, diningOrderDueAmount, countDiningOrderItems } from '../../lib/restaurantDiningTpv';
import { cancelActiveReservationsForTable } from '../../lib/restaurantReservationsApi';
import { tableStatusOnOpen } from '../../lib/restaurantTableStatus';
import { DELIVERY_CEO_TPV_PATH, RESTAURANT_CEO_TPV_PATH } from '../../lib/retailOpsPaths';
import { writeSalaTpvOpenTable } from '../../lib/salaTpvLaunch';
import type { SalaRoom, SalaRoomType } from '../../lib/salaStudioTypes';
import { SALA_ROOM_TYPE_LABELS } from '../../lib/salaStudioTypes';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import { RestaurantAddTablesModal } from './RestaurantAddTablesModal';
import { RestaurantAddZoneModal } from './RestaurantAddZoneModal';
import { resolveTableCapacity } from './tableCapacity';

type Props = {
  rooms: SalaRoom[];
  tables: DiningTable[];
  storeLabel?: string;
  userId: string;
  businessId: string;
  actorName?: string;
  mapBusy?: boolean;
  onTablesChange: (tables: DiningTable[]) => void;
  onAddZone?: (input: {
    name: string;
    roomType: SalaRoomType;
    tableCount: number;
    defaultCapacity: number;
  }) => Promise<SalaRoom | void> | SalaRoom | void;
  onAddTables?: (input: {
    roomId: string;
    count: number;
    capacity: number;
  }) => Promise<void> | void;
  onUpdateTablePeople?: (input: {
    tableId: string;
    capacity?: number;
    currentGuests?: number;
  }) => Promise<void> | void;
  onRemoveTable?: (tableId: string) => Promise<void> | void;
  onRemoveZone?: (roomId: string) => Promise<void> | void;
  onRemount?: () => void;
  /** Bar/restaurante: abrir cuenta de mesa en Sala (sin pasar por elegir local / caja SaaS). */
  onOpenTableAccount?: (table: DiningTable, orderId?: string) => void;
};

type TableStatusUi = {
  label: string;
  /** Card contenedora de la mesa en el plano. */
  card: string;
  /** Chip de estado (ficha de mesa). */
  badge: string;
  /** Tablero de la mesa (la figura). */
  tableSurface: string;
  /** Silla con comensal sentado. */
  chairFill: string;
  /** Texto de estado bajo la figura. */
  statusText: string;
  /** Barra de acento superior en la ficha de mesa. */
  accent: string;
};

const OCCUPIED_UI: TableStatusUi = {
  label: 'Ocupada',
  card: 'hover:bg-white/50',
  badge: 'bg-rose-600 text-white',
  tableSurface:
    'border-rose-600/70 bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-600/30',
  chairFill: 'bg-rose-500 shadow-sm shadow-rose-500/40',
  statusText: 'text-rose-700',
  accent: 'from-rose-500 to-rose-600',
};

/** Cuenta pedida → cobrar = azul avance Vertial. */
const PENDING_PAYMENT_UI: TableStatusUi = {
  label: 'Por cobrar',
  card: 'hover:bg-white/50',
  badge: 'bg-blue-600 text-white',
  tableSurface:
    'border-blue-600/70 bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-600/30',
  chairFill: 'bg-blue-500 shadow-sm shadow-blue-500/40',
  statusText: 'text-blue-700',
  accent: 'from-blue-500 to-blue-600',
};

const STATUS_UI: Record<DiningTableStatus, TableStatusUi> = {
  available: {
    label: 'Libre',
    card: 'hover:bg-white/60',
    badge: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
    tableSurface:
      'border-emerald-300 bg-gradient-to-br from-white to-emerald-50 text-stone-900 shadow-md shadow-stone-900/10 group-hover:from-emerald-50 group-hover:to-emerald-100/80',
    chairFill: 'bg-emerald-500',
    statusText: 'text-emerald-700',
    accent: 'from-emerald-400 to-emerald-500',
  },
  occupied: OCCUPIED_UI,
  pending_order: OCCUPIED_UI,
  served: OCCUPIED_UI,
  pending_payment: PENDING_PAYMENT_UI,
  unavailable: {
    label: 'Por limpiar',
    card: 'hover:bg-white/50',
    badge: 'bg-stone-200 text-stone-600',
    tableSurface:
      'border-dashed border-stone-300 bg-stone-100/90 text-stone-500 shadow-sm',
    chairFill: 'bg-stone-400',
    statusText: 'text-stone-500',
    accent: 'from-stone-300 to-stone-400',
  },
  reserved: {
    label: 'Reservada',
    card: 'hover:bg-white/50',
    badge: 'border border-amber-200 bg-amber-100 text-amber-800',
    tableSurface:
      'border-amber-400 bg-gradient-to-br from-amber-50 to-amber-200/80 text-amber-900 shadow-md shadow-amber-500/20',
    chairFill: 'bg-amber-500',
    statusText: 'text-amber-700',
    accent: 'from-amber-400 to-amber-500',
  },
  hidden: {
    label: 'Oculta',
    card: '',
    badge: 'bg-stone-100 text-stone-500',
    tableSurface: 'border-dashed border-stone-300 bg-stone-50 text-stone-400',
    chairFill: 'bg-stone-300',
    statusText: 'text-stone-400',
    accent: 'from-stone-200 to-stone-300',
  },
};

/** Suelo del plano de sala: tono cálido, trama de baldosas y luz ambiental. */
const SALA_FLOOR_STYLE: CSSProperties = {
  backgroundColor: '#faf7f2',
  backgroundImage:
    'radial-gradient(ellipse 90% 70% at 50% 0%, rgba(255,255,255,0.9), transparent 70%), radial-gradient(circle, rgba(120, 100, 80, 0.14) 1px, transparent 1px)',
  backgroundSize: 'auto, 18px 18px',
};

/**
 * Figura de mesa: forma y sillas según capacidad.
 * ≤2 pax → redonda · 3-4 → cuadrada con laterales · 5+ → rectangular con laterales.
 */
function tableFigureLayout(capacity: number): {
  top: number;
  bottom: number;
  left: number;
  right: number;
  surface: string;
} {
  const cap = Math.max(1, capacity);
  if (cap <= 2) {
    return {
      top: 1,
      bottom: cap > 1 ? 1 : 0,
      left: 0,
      right: 0,
      surface: 'h-16 w-16 rounded-full',
    };
  }
  const left = 1;
  const right = cap >= 4 ? 1 : 0;
  const rest = cap - left - right;
  const top = Math.min(4, Math.ceil(rest / 2));
  const bottom = Math.min(4, rest - top);
  const width = top <= 1 ? 'w-16' : top === 2 ? 'w-20' : top === 3 ? 'w-24' : 'w-28';
  return { top, bottom, left, right, surface: `h-14 ${width} rounded-xl` };
}

const EMPTY_CHAIR = 'bg-stone-300/90 shadow-sm shadow-stone-400/20';

/** Fila de sillas (vista cenital): rellenas = comensales sentados. */
function ChairRow({ count, filled, fill }: { count: number; filled: number; fill: string }) {
  if (count <= 0) return <span className="h-2" aria-hidden />;
  return (
    <div className="flex justify-center gap-1.5" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={`h-2 w-5 rounded-md transition-colors ${i < filled ? fill : EMPTY_CHAIR}`}
        />
      ))}
    </div>
  );
}

/** Silla lateral (izquierda/derecha de la mesa). */
function SideChair({ present, filled, fill }: { present: boolean; filled: boolean; fill: string }) {
  if (!present) return <span className="w-2" aria-hidden />;
  return (
    <span
      className={`h-5 w-2 rounded-md transition-colors ${filled ? fill : EMPTY_CHAIR}`}
      aria-hidden
    />
  );
}

function tablesForRoom(tables: DiningTable[], room: SalaRoom): DiningTable[] {
  return tables
    .filter((t) => {
      if (t.active === false || t.status === 'hidden') return false;
      const roomId = String(t.roomId || '').trim();
      if (roomId) return roomId === room.id;
      return String(t.zone || '').trim() === room.name;
    })
    .sort((a, b) => (a.sortOrder || a.number) - (b.sortOrder || b.number));
}

function formatEuro(n: number): string {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function minutesSinceIso(iso: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60_000));
}

function formatDurationMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const days = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (days > 0) return h ? `${days} d ${h} h` : `${days} d`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Mesa con estancia larga → chip en ámbar (aviso). */
const LONG_STAY_MINUTES = 120;

function isOpenDiningOrder(order: DiningOrder): boolean {
  return order.status === 'open' || order.status === 'served' || order.status === 'pending_payment';
}

function isOccupiedStatus(status: DiningTableStatus): boolean {
  return (
    status === 'occupied'
    || status === 'pending_order'
    || status === 'served'
    || status === 'pending_payment'
  );
}

/** Líneas del ticket TPV para la ficha de mesa. */
function diningOrderTicketLines(order: DiningOrder): Array<{
  id: string;
  label: string;
  qty: number;
  lineTotal: number;
  status: string;
}> {
  const out: Array<{ id: string; label: string; qty: number; lineTotal: number; status: string }> = [];
  for (const comanda of order.comandas || []) {
    if (comanda.status === 'cancelled') continue;
    for (const item of comanda.items || []) {
      if (item.status === 'cancelled') continue;
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) continue;
      const name = String(item.name || 'Producto').trim() || 'Producto';
      const price = Number(item.price) || 0;
      out.push({
        id: String(item.id || `${comanda.id}-${name}-${out.length}`),
        label: name,
        qty,
        lineTotal: price * qty,
        status: String(item.status || comanda.status || ''),
      });
    }
  }
  return out;
}

function orderStatusLabel(status: string): string {
  if (status === 'pending_payment') return 'Pendiente de cobro';
  if (status === 'served') return 'Servido';
  if (status === 'open') return 'Abierto';
  return status || 'Abierto';
}

function itemStatusShort(status: string): string {
  if (status === 'pending' || status === 'sent_to_kitchen') return 'Cocina';
  if (status === 'in_preparation') return 'Prep.';
  if (status === 'ready') return 'Listo';
  if (status === 'served') return 'Servido';
  if (status === 'draft') return 'Borrador';
  return '';
}

function patchTableList(tables: DiningTable[], updated: DiningTable): DiningTable[] {
  const id = String(updated._id || updated.id || '');
  return tables.map((t) => (String(t._id || t.id) === id ? { ...t, ...updated } : t));
}

export function RestaurantSalaLiveView({
  rooms,
  tables,
  storeLabel,
  userId,
  businessId,
  actorName,
  mapBusy = false,
  onTablesChange,
  onAddZone,
  onAddTables,
  onUpdateTablePeople,
  onRemoveTable,
  onRemoveZone,
  onRemount,
  onOpenTableAccount,
}: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const isDeliverySala = isStrictDeliveryBusinessType(currentBusiness?.businessType);
  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [rooms],
  );
  const [activeRoomId, setActiveRoomId] = useState(() => sortedRooms[0]?.id || '');
  const [seatTable, setSeatTable] = useState<DiningTable | null>(null);
  const [reservedTable, setReservedTable] = useState<DiningTable | null>(null);
  const [infoTable, setInfoTable] = useState<DiningTable | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoOpenOrder, setInfoOpenOrder] = useState<DiningOrder | null>(null);
  const [infoTodayAmount, setInfoTodayAmount] = useState(0);
  const [infoTodayTickets, setInfoTodayTickets] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [editTable, setEditTable] = useState<DiningTable | null>(null);
  const [editCapacity, setEditCapacity] = useState(4);
  const [editGuests, setEditGuests] = useState(0);
  const [showAddZone, setShowAddZone] = useState(false);
  const [showAddTables, setShowAddTables] = useState(false);
  const [busyId, setBusyId] = useState('');

  const softReloadTables = useCallback(() => {
    if (!userId || editMode) return;
    void listDiningTablesRequest(userId)
      .then((rows) => {
        const scoped = businessId
          ? rows.filter((t) => {
              const bid = String((t as { businessId?: string }).businessId || '').trim();
              return !bid || bid === businessId;
            })
          : rows;
        onTablesChange(scoped);
      })
      .catch(() => undefined);
  }, [userId, businessId, editMode, onTablesChange]);

  const salaSseHandlers = useMemo(
    () => ({
      'sala:table_status_changed': softReloadTables,
      'sala:table_updated': softReloadTables,
      'sala:tables_bulk_updated': softReloadTables,
      'sala:order_created': softReloadTables,
      'sala:order_updated': softReloadTables,
      'sala:order_closed': softReloadTables,
      'sala:order_cancelled': softReloadTables,
    }),
    [softReloadTables],
  );

  useSSE({
    userId: user?.user_id || user?.id || null,
    businessId: businessId || null,
    handlers: salaSseHandlers,
    enabled: Boolean(userId && businessId && !editMode),
  });

  const canEditMap = Boolean(
    onAddZone || onAddTables || onUpdateTablePeople || onRemoveTable || onRemoveZone || onRemount,
  );

  useEffect(() => {
    if (!sortedRooms.length) {
      setActiveRoomId('');
      return;
    }
    if (!sortedRooms.some((r) => r.id === activeRoomId)) {
      setActiveRoomId(sortedRooms[0].id);
    }
  }, [sortedRooms, activeRoomId]);

  useEffect(() => {
    if (!editTable) return;
    const id = String(editTable._id || editTable.id || '');
    if (!tables.some((t) => String(t._id || t.id) === id)) setEditTable(null);
  }, [tables, editTable]);

  useEffect(() => {
    if (!infoTable) return;
    const id = String(infoTable._id || infoTable.id || '');
    const live = tables.find((t) => String(t._id || t.id) === id);
    if (!live) {
      setInfoTable(null);
      return;
    }
    if (
      live.status !== infoTable.status
      || live.currentGuests !== infoTable.currentGuests
      || live.capacity !== infoTable.capacity
      || live.occupiedAt !== infoTable.occupiedAt
      || live.updatedAt !== infoTable.updatedAt
    ) {
      setInfoTable(live);
    }
  }, [tables, infoTable]);

  useEffect(() => {
    if (!infoTable || !userId) {
      setInfoOpenOrder(null);
      setInfoTodayAmount(0);
      setInfoTodayTickets(0);
      setInfoLoading(false);
      return;
    }
    const tableId = String(infoTable._id || infoTable.id || '').trim();
    if (!tableId) return;

    let cancelled = false;
    setInfoLoading(true);
    const day = todayYmd();

    void (async () => {
      try {
        const [orders, stats] = await Promise.all([
          listDiningOrdersRequest(userId, { tableId }),
          listTableTicketStatsRequest(userId, {
            businessId: businessId || undefined,
            tableId,
            dateFrom: day,
            dateTo: day,
          }),
        ]);
        if (cancelled) return;
        const open = orders.find(isOpenDiningOrder) || null;
        setInfoOpenOrder(open);
        setInfoTodayTickets(stats.length);
        setInfoTodayAmount(
          stats.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
        );
      } catch {
        if (!cancelled) {
          setInfoOpenOrder(null);
          setInfoTodayAmount(0);
          setInfoTodayTickets(0);
        }
      } finally {
        if (!cancelled) setInfoLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [infoTable?._id, infoTable?.id, infoTable?.status, userId, businessId]);

  const activeRoom =
    sortedRooms.find((r) => r.id === activeRoomId) || sortedRooms[0] || null;
  const roomTables = activeRoom ? tablesForRoom(tables, activeRoom) : [];
  const visibleTables = tables.filter((t) => t.active !== false && t.status !== 'hidden');
  const freeCount = visibleTables.filter((t) => t.status === 'available').length;
  const toChargeCount = visibleTables.filter((t) => t.status === 'pending_payment').length;
  const occupiedCount =
    visibleTables.filter((t) => isOccupiedStatus(t.status)).length - toChargeCount;
  const reservedCount = visibleTables.filter((t) => t.status === 'reserved').length;
  const cleaningCount = visibleTables.filter((t) => t.status === 'unavailable').length;

  const openEditTable = (table: DiningTable) => {
    setEditTable(table);
    setEditCapacity(resolveTableCapacity(table));
    setEditGuests(Math.max(0, Number(table.currentGuests) || 0));
  };

  const openTpvForTable = (table: DiningTable, orderId?: string) => {
    const tableId = String(table._id || table.id || '').trim();
    if (!tableId) return;
    writeSalaTpvOpenTable({ tableId, orderId });
    if (isDeliverySala) {
      navigate(`${DELIVERY_CEO_TPV_PATH}?mesa=${encodeURIComponent(tableId)}`);
      return;
    }
    // Bar/restaurante: cuenta/carta en Sala (pedir y luego cobrar).
    if (onOpenTableAccount) {
      setInfoTable(null);
      setSeatTable(null);
      setReservedTable(null);
      onOpenTableAccount(table, orderId);
      return;
    }
    navigate(`${RESTAURANT_CEO_TPV_PATH}?mesa=${encodeURIComponent(tableId)}`);
  };

  /** Solo montar mesa: ocupada + cuenta vacía. No abre cobro (nadie paga al sentarse). */
  const seatTableOnly = async (table: DiningTable, guests: number) => {
    const tableId = String(table._id || table.id || '').trim();
    if (!userId || !businessId || !tableId) {
      toast.error('No se puede abrir la mesa');
      return;
    }
    setBusyId(tableId);
    try {
      const nextStatus = tableStatusOnOpen(table.status);
      const updated = await changeTableStatusRequest(userId, tableId, nextStatus, {
        currentGuests: guests,
      });
      onTablesChange(patchTableList(tables, updated));
      setSeatTable(null);
      setReservedTable(null);
      setInfoTable(null);

      if (isDeliverySala) {
        openTpvForTable(updated);
        return;
      }

      await ensureOpenDiningOrder({
        userId,
        businessId,
        tableId,
        tableNumber: table.number,
        tableName: table.name || `Mesa ${table.number}`,
        guests,
        createdBy: userId,
        createdByName: actorName || 'Sala',
        zone: table.zone || activeRoom?.name || '',
      });
      toast.success(
        `${updated.name || `Mesa ${updated.number}`} montada · ${guests} pax. Cuando quieras, toca la mesa para pedir.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo sentar en la mesa');
    } finally {
      setBusyId('');
    }
  };

  const markAvailable = async (table: DiningTable) => {
    const tableId = String(table._id || table.id || '').trim();
    if (!userId || !tableId) return;
    setBusyId(tableId);
    try {
      const updated = await changeTableStatusRequest(userId, tableId, 'available', {
        currentGuests: 0,
      });
      onTablesChange(patchTableList(tables, updated));
      toast.success('Mesa marcada como libre');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo liberar la mesa');
    } finally {
      setBusyId('');
    }
  };

  const cancelTableReservation = async (table: DiningTable) => {
    const tableId = String(table._id || table.id || '').trim();
    if (!userId || !tableId) return;
    setBusyId(tableId);
    try {
      const { cancelled } = await cancelActiveReservationsForTable(userId, tableId, {
        userId,
        userName: actorName || 'Sala',
      });
      const updated = await changeTableStatusRequest(userId, tableId, 'available', {
        currentGuests: 0,
      });
      onTablesChange(patchTableList(tables, updated));
      toast.success(
        cancelled > 0
          ? cancelled === 1
            ? 'Reserva cancelada · mesa libre'
            : `${cancelled} reservas canceladas · mesa libre`
          : 'Mesa liberada',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cancelar la reserva');
    } finally {
      setBusyId('');
    }
  };

  const handleTableClick = (table: DiningTable) => {
    const tableId = String(table._id || table.id || '').trim();
    if (!tableId || busyId === tableId) return;

    if (editMode) {
      openEditTable(table);
      return;
    }

    setSeatTable(null);
    setReservedTable(null);
    setInfoTable(table);
  };

  const toggleEditMode = () => {
    setEditMode((v) => {
      if (v) {
        setEditTable(null);
        setShowAddZone(false);
        setShowAddTables(false);
      } else {
        setInfoTable(null);
        setSeatTable(null);
        setReservedTable(null);
      }
      return !v;
    });
  };

  const saveEditTable = async () => {
    if (!editTable || !onUpdateTablePeople) return;
    const tableId = String(editTable._id || editTable.id || '');
    if (!tableId) return;
    const occupied = isOccupiedStatus(editTable.status);
    try {
      await Promise.resolve(
        onUpdateTablePeople({
          tableId,
          capacity: editCapacity,
          currentGuests: occupied ? editGuests : undefined,
        }),
      );
      setEditTable(null);
      toast.success('Mesa actualizada');
    } catch {
      /* toast en el padre */
    }
  };

  const canDeleteEdit =
    Boolean(onRemoveTable)
    && editTable
    && (editTable.status === 'available' || editTable.status === 'unavailable');

  return (
    <div className="mx-auto min-h-[calc(100vh-4rem)] w-full max-w-5xl px-4 py-6">
      <header className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Sala · En servicio
            </p>
            <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-stone-900">
              {storeLabel || 'Tu local'}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEditMap && (
              <button
                type="button"
                disabled={mapBusy}
                onClick={toggleEditMode}
                className={
                  editMode
                    ? 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50'
                    : VERTIAL_BTN_SECONDARY
                }
              >
                <Pencil className="h-4 w-4" strokeWidth={2} />
                {editMode ? 'Listo' : 'Editar sala'}
              </button>
            )}
            {editMode && onAddZone && (
              <button
                type="button"
                disabled={mapBusy}
                onClick={() => setShowAddZone(true)}
                className={VERTIAL_BTN_PRIMARY}
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
                Nueva zona
              </button>
            )}
            {editMode && onRemount && (
              <button type="button" onClick={onRemount} className={VERTIAL_BTN_SECONDARY}>
                Rehacer mapa
              </button>
            )}
          </div>
        </div>

        {/* Pulso de la sala: contadores por estado */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {freeCount} libre{freeCount === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-800">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            {occupiedCount} ocupada{occupiedCount === 1 ? '' : 's'}
          </span>
          {toChargeCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              {toChargeCount} por cobrar
            </span>
          )}
          {reservedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              {reservedCount} reservada{reservedCount === 1 ? '' : 's'}
            </span>
          )}
          {cleaningCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
              <span className="h-2 w-2 rounded-full bg-stone-400" />
              {cleaningCount} por limpiar
            </span>
          )}
          <span className="text-xs text-stone-400">
            {sortedRooms.length} zona{sortedRooms.length === 1 ? '' : 's'} · {visibleTables.length} mesas
          </span>
        </div>
      </header>

      {sortedRooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white px-6 py-16 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
            <LayoutGrid className="h-7 w-7 text-blue-600" strokeWidth={1.5} />
          </div>
          <p className="mt-4 text-base font-semibold text-stone-900">
            Aún no hay zonas configuradas
          </p>
          <p className="mt-1 text-sm text-stone-500">
            Crea la primera zona (salón, terraza, barra…) para empezar a servir.
          </p>
          {onAddZone ? (
            <button
              type="button"
              disabled={mapBusy}
              onClick={() => setShowAddZone(true)}
              className={`mt-5 ${VERTIAL_BTN_PRIMARY}`}
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Nueva zona
            </button>
          ) : onRemount ? (
            <button
              type="button"
              onClick={onRemount}
              className={`mt-5 ${VERTIAL_BTN_PRIMARY}`}
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Configurar sala
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {sortedRooms.map((room) => {
              const zoneTables = tablesForRoom(tables, room);
              const count = zoneTables.length;
              const zoneFree = zoneTables.filter((t) => t.status === 'available').length;
              const selected = (activeRoom?.id || '') === room.id;
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setActiveRoomId(room.id)}
                  className={`shrink-0 rounded-xl border px-4 py-2.5 text-left transition-all ${
                    selected
                      ? 'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/25'
                      : 'border-stone-200 bg-white text-stone-800 hover:border-blue-200 hover:bg-blue-50/50'
                  }`}
                >
                  <p className="text-sm font-semibold">{room.name}</p>
                  <p className={`mt-0.5 text-xs ${selected ? 'text-blue-100' : 'text-stone-500'}`}>
                    {SALA_ROOM_TYPE_LABELS[room.roomType] || room.roomType} · {count}{' '}
                    {room.roomType === 'barra' ? 'puestos' : 'mesas'}
                    {count > 0 && (
                      <span className={selected ? 'text-blue-100' : 'text-emerald-600'}>
                        {' '}· {zoneFree} libre{zoneFree === 1 ? '' : 's'}
                      </span>
                    )}
                  </p>
                </button>
              );
            })}
            {editMode && onAddZone && (
              <button
                type="button"
                disabled={mapBusy}
                onClick={() => setShowAddZone(true)}
                className="shrink-0 rounded-xl border border-dashed border-stone-300 bg-white px-4 py-2.5 text-left text-stone-600 transition-colors hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"
              >
                <p className="inline-flex items-center gap-1 text-sm font-semibold">
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  Zona
                </p>
                <p className="text-xs text-stone-400">Terraza, barra…</p>
              </button>
            )}
          </div>

          {activeRoom && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              {editMode ? (
                <p className="text-sm text-stone-500">
                  {SALA_ROOM_TYPE_LABELS[activeRoom.roomType]} · {roomTables.length}{' '}
                  {activeRoom.roomType === 'barra' ? 'puestos' : 'mesas'}
                  <span className="ml-2 font-semibold text-amber-700">· Modo edición</span>
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Libre — toca para montar mesa
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    Ocupada — toca para pedir / cobrar
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    Por cobrar — cuenta pedida
                  </span>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {editMode && onAddTables && (
                  <button
                    type="button"
                    disabled={mapBusy}
                    onClick={() => setShowAddTables(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    Añadir {activeRoom.roomType === 'barra' ? 'puestos' : 'mesas'}
                  </button>
                )}
                {editMode && onRemoveZone && sortedRooms.length > 1 && (
                  <button
                    type="button"
                    disabled={mapBusy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `¿Eliminar la zona «${activeRoom.name}»? Solo si todas sus mesas están libres.`,
                        )
                      ) {
                        return;
                      }
                      void Promise.resolve(onRemoveZone(activeRoom.id)).catch(() => undefined);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-500 transition-colors hover:border-rose-200 hover:text-rose-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Quitar zona
                  </button>
                )}
              </div>
            </div>
          )}

          {editMode && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              Toca una mesa para cambiar personas o eliminarla. Usa «Añadir» para mesas o zonas.
              Pulsa «Listo» para volver al servicio.
            </div>
          )}

          {roomTables.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white px-6 py-16 text-center shadow-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100">
                <LayoutGrid className="h-7 w-7 text-stone-400" strokeWidth={1.5} />
              </div>
              <p className="mt-4 text-base font-semibold text-stone-900">
                Aún no hay {activeRoom?.roomType === 'barra' ? 'puestos' : 'mesas'} en esta zona
              </p>
              <p className="mt-1 max-w-sm text-sm text-stone-500">
                {editMode
                  ? `«${activeRoom?.name}» está lista. Añade mesas o puestos de barra.`
                  : 'Pulsa «Editar sala» arriba para añadir mesas o puestos.'}
              </p>
              {editMode && onAddTables && activeRoom && (
                <button
                  type="button"
                  disabled={mapBusy}
                  onClick={() => setShowAddTables(true)}
                  className={`mt-5 ${VERTIAL_BTN_PRIMARY}`}
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  Añadir {activeRoom.roomType === 'barra' ? 'puestos' : 'mesas'}
                </button>
              )}
            </div>
          ) : (
            <div
              className="rounded-3xl border border-stone-200/80 p-3 shadow-inner sm:p-5"
              style={SALA_FLOOR_STYLE}
            >
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {roomTables.map((table) => {
                const ui = STATUS_UI[table.status] || STATUS_UI.available;
                const capacity = resolveTableCapacity(table);
                const tableId = String(table._id || table.id || '');
                const busy = busyId === tableId;
                const selectedEdit =
                  editMode && editTable && String(editTable._id || editTable.id) === tableId;
                const seatedMins = minutesSinceIso(table.occupiedAt);
                const occupied = isOccupiedStatus(table.status);
                const longStay =
                  occupied && seatedMins != null && seatedMins >= LONG_STAY_MINUTES;
                const guests = occupied ? Math.max(0, Number(table.currentGuests) || 0) : 0;
                const isBarSeat = activeRoom?.roomType === 'barra';
                const layout = tableFigureLayout(capacity);
                const filledTop = Math.min(guests, layout.top);
                const filledBottom = Math.min(Math.max(0, guests - filledTop), layout.bottom);
                const filledLeft = Math.min(
                  Math.max(0, guests - filledTop - filledBottom),
                  layout.left,
                );
                const filledRight = Math.min(
                  Math.max(0, guests - filledTop - filledBottom - filledLeft),
                  layout.right,
                );
                const customName =
                  table.name && table.name !== `Mesa ${table.number}` ? table.name : '';
                return (
                  <button
                    key={tableId}
                    type="button"
                    disabled={busy || mapBusy}
                    onClick={() => handleTableClick(table)}
                    className={`group relative flex flex-col items-center rounded-2xl px-2 py-3 text-center transition-all active:scale-[0.97] disabled:opacity-60 ${ui.card} ${
                      selectedEdit ? 'ring-2 ring-amber-500 ring-offset-2' : ''
                    }`}
                  >
                    {editMode && (
                      <span className="absolute right-2 top-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        Editar
                      </span>
                    )}

                    {/* Figura de mesa (o taburete en barra) */}
                    {isBarSeat ? (
                      <div
                        className={`mt-1 flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 transition-colors ${ui.tableSurface}`}
                      >
                        <span className="text-lg font-bold leading-none">{table.number}</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <ChairRow count={layout.top} filled={filledTop} fill={ui.chairFill} />
                        <div className="flex items-center gap-1">
                          <SideChair
                            present={layout.left > 0}
                            filled={filledLeft > 0}
                            fill={ui.chairFill}
                          />
                          <div
                            className={`flex flex-col items-center justify-center border-2 transition-colors ${layout.surface} ${ui.tableSurface}`}
                          >
                            <span className="text-lg font-bold leading-none">{table.number}</span>
                            <span className="mt-0.5 text-[10px] font-semibold opacity-80">
                              {guests > 0 ? `${guests}/${capacity}` : `${capacity} pax`}
                            </span>
                          </div>
                          <SideChair
                            present={layout.right > 0}
                            filled={filledRight > 0}
                            fill={ui.chairFill}
                          />
                        </div>
                        <ChairRow count={layout.bottom} filled={filledBottom} fill={ui.chairFill} />
                      </div>
                    )}

                    {/* Pie: nombre propio (si lo hay) + estado / tiempo */}
                    <div className="mt-2 w-full">
                      {customName && (
                        <p className="truncate text-xs font-bold text-stone-800">{customName}</p>
                      )}
                      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] font-semibold">
                        <span className={ui.statusText}>{ui.label}</span>
                        {!editMode && occupied && seatedMins != null && (
                          <span
                            className={`inline-flex items-center gap-0.5 ${
                              longStay ? 'text-amber-700' : 'text-stone-400'
                            }`}
                          >
                            <Clock className="h-3 w-3" strokeWidth={2} />
                            {formatDurationMinutes(seatedMins)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {editMode && onAddTables && (
                <button
                  type="button"
                  disabled={mapBusy}
                  onClick={() => setShowAddTables(true)}
                  className="flex min-h-[140px] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-stone-300 bg-white/60 px-4 py-4 text-stone-500 transition-colors hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"
                >
                  <Plus className="h-5 w-5" strokeWidth={1.5} />
                  <span className="text-xs font-semibold">
                    Añadir {activeRoom?.roomType === 'barra' ? 'puesto' : 'mesa'}
                  </span>
                </button>
              )}
            </div>
            </div>
          )}
        </>
      )}

      {infoTable && !editMode && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl sm:max-w-xl">
            {(() => {
              const ui = STATUS_UI[infoTable.status] || STATUS_UI.available;
              const capacity = resolveTableCapacity(infoTable);
              const seatedMins = minutesSinceIso(infoTable.occupiedAt);
              const openOrderId = infoOpenOrder
                ? String(infoOpenOrder._id || infoOpenOrder.id || '')
                : '';
              const ticketLines = infoOpenOrder ? diningOrderTicketLines(infoOpenOrder) : [];
              const due = infoOpenOrder ? diningOrderDueAmount(infoOpenOrder) : 0;
              const itemCount = infoOpenOrder ? countDiningOrderItems(infoOpenOrder) : 0;
              const comandaCount = (infoOpenOrder?.comandas || []).filter(
                (c) => c.status !== 'cancelled',
              ).length;
              const seated = seatedMins != null && isOccupiedStatus(infoTable.status);
              const infoLongStay = seated && seatedMins >= LONG_STAY_MINUTES;
              return (
                <>
                  <div
                    className={`h-1.5 shrink-0 bg-gradient-to-r ${ui.accent}`}
                    aria-hidden
                  />
                  <div className="shrink-0 border-b border-stone-100 px-5 py-4 sm:px-6">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold text-stone-900 sm:text-2xl">
                          {infoTable.name || `Mesa ${infoTable.number}`}
                        </h2>
                        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-stone-500">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ui.badge}`}
                          >
                            {ui.label}
                          </span>
                          {activeRoom?.name || infoTable.zone || 'Sala'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setInfoTable(null)}
                        className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                    <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <div className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-stone-400" strokeWidth={2} />
                          <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
                            Personas
                          </p>
                        </div>
                        <p className="mt-1 text-base font-semibold tabular-nums text-stone-900">
                          {infoTable.currentGuests > 0
                            ? `${infoTable.currentGuests} / ${capacity}`
                            : `${capacity} pax`}
                        </p>
                      </div>
                      <div
                        className={`rounded-xl border px-3 py-3 ${
                          infoLongStay
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-stone-100 bg-stone-50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Clock
                            className={`h-3.5 w-3.5 ${infoLongStay ? 'text-amber-500' : 'text-stone-400'}`}
                            strokeWidth={2}
                          />
                          <p
                            className={`text-[11px] font-medium uppercase tracking-wide ${
                              infoLongStay ? 'text-amber-600' : 'text-stone-400'
                            }`}
                          >
                            Tiempo en mesa
                          </p>
                        </div>
                        <p
                          className={`mt-1 text-base font-semibold tabular-nums ${
                            infoLongStay ? 'text-amber-800' : 'text-stone-900'
                          }`}
                        >
                          {seated ? formatDurationMinutes(seatedMins) : '—'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
                          Facturado hoy
                        </p>
                        <p className="mt-1 text-base font-semibold tabular-nums text-stone-900">
                          {infoLoading ? '…' : formatEuro(infoTodayAmount)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-stone-100 bg-stone-50 px-3 py-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
                          Tickets hoy
                        </p>
                        <p className="mt-1 text-base font-semibold tabular-nums text-stone-900">
                          {infoLoading ? '…' : infoTodayTickets}
                        </p>
                      </div>
                    </div>

                    <div className="mb-2 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                      <div className="flex items-center justify-between gap-2 border-b border-stone-100 bg-stone-50/70 px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Receipt className="h-3.5 w-3.5 text-stone-400" strokeWidth={2} />
                          <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
                            Pedido TPV abierto
                          </p>
                        </div>
                        {infoOpenOrder ? (
                          <p className="text-xs font-medium text-stone-500">
                            {orderStatusLabel(infoOpenOrder.status)}
                            {comandaCount > 0 ? ` · ${comandaCount} comanda${comandaCount === 1 ? '' : 's'}` : ''}
                          </p>
                        ) : null}
                      </div>

                      {infoLoading ? (
                        <p className="px-4 py-4 text-sm text-stone-500">Cargando pedido…</p>
                      ) : infoOpenOrder ? (
                        <div className="px-4 py-3">
                          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                            <div>
                              <p className="text-3xl font-bold tabular-nums tracking-tight text-stone-900">
                                {formatEuro(due)}
                              </p>
                              <p className="mt-0.5 text-sm text-stone-500">
                                {itemCount} artículo{itemCount === 1 ? '' : 's'}
                                {' · '}
                                {infoOpenOrder.guests || infoTable.currentGuests || 0} pax
                              </p>
                            </div>
                            {infoOpenOrder.createdByName ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600">
                                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold uppercase text-white">
                                  {infoOpenOrder.createdByName.trim().charAt(0)}
                                </span>
                                Abierto por {infoOpenOrder.createdByName}
                              </span>
                            ) : null}
                          </div>

                          {ticketLines.length > 0 ? (
                            <ul className="max-h-56 space-y-2 overflow-y-auto border-t border-stone-100 pt-3 sm:max-h-72">
                              {ticketLines.map((line) => {
                                const st = itemStatusShort(line.status);
                                return (
                                  <li
                                    key={line.id}
                                    className="flex items-start justify-between gap-3 text-sm"
                                  >
                                    <div className="min-w-0">
                                      <p className="font-medium text-stone-900">
                                        <span className="tabular-nums text-stone-500">
                                          {line.qty}×
                                        </span>{' '}
                                        {line.label}
                                      </p>
                                      {st ? (
                                        <p className="mt-0.5 text-xs text-stone-400">{st}</p>
                                      ) : null}
                                    </div>
                                    <p className="shrink-0 tabular-nums font-semibold text-stone-800">
                                      {formatEuro(line.lineTotal)}
                                    </p>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="border-t border-stone-100 pt-3 text-sm text-stone-500">
                              Sin líneas todavía — abre la carta para pedir.
                            </p>
                          )}

                          {infoOpenOrder.notes ? (
                            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                              Nota: {infoOpenOrder.notes}
                            </p>
                          ) : null}

                          {Number(infoOpenOrder.discount) > 0 ? (
                            <p className="mt-2 text-xs text-stone-500">
                              Descuento: −{formatEuro(Number(infoOpenOrder.discount) || 0)}
                              {infoOpenOrder.discountReason
                                ? ` (${infoOpenOrder.discountReason})`
                                : ''}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="px-4 py-4 text-sm text-stone-500">
                          Ningún pedido TPV abierto en esta mesa.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 space-y-2 border-t border-stone-100 px-5 py-4 sm:px-6">
                    {infoTable.status === 'available' && (
                      <button
                        type="button"
                        onClick={() => {
                          setSeatTable(infoTable);
                          setInfoTable(null);
                        }}
                        className={`w-full !min-h-12 !text-base ${VERTIAL_BTN_PRIMARY}`}
                      >
                        Montar mesa / sentar
                      </button>
                    )}
                    {infoTable.status === 'reserved' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setSeatTable(infoTable);
                            setInfoTable(null);
                          }}
                          className={`w-full !min-h-12 !text-base ${VERTIAL_BTN_PRIMARY}`}
                        >
                          Sentar ahora
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void cancelTableReservation(infoTable).then(() => setInfoTable(null));
                          }}
                          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-base font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                        >
                          Cancelar reserva
                        </button>
                      </>
                    )}
                    {infoTable.status === 'unavailable' && (
                      <button
                        type="button"
                        onClick={() => {
                          void markAvailable(infoTable).then(() => setInfoTable(null));
                        }}
                        className={`w-full !min-h-12 !text-base ${VERTIAL_BTN_PRIMARY}`}
                      >
                        Marcar libre
                      </button>
                    )}
                    {isOccupiedStatus(infoTable.status) && (
                      <button
                        type="button"
                        onClick={() => {
                          openTpvForTable(infoTable, openOrderId || undefined);
                          setInfoTable(null);
                        }}
                        className={`w-full !min-h-12 !text-base ${VERTIAL_BTN_PRIMARY}`}
                      >
                        {infoOpenOrder ? 'Pedir / ver cuenta' : 'Abrir carta'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setInfoTable(null)}
                      className={`w-full !min-h-12 !text-base ${VERTIAL_BTN_SECONDARY}`}
                    >
                      Cerrar
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {seatTable && !editMode && (
        <RestaurantSeatGuestsModal
          tableLabel={seatTable.name || `Mesa ${seatTable.number}`}
          capacity={resolveTableCapacity(seatTable)}
          defaultGuests={Math.min(2, resolveTableCapacity(seatTable))}
          confirmLabel="Montar mesa"
          onCancel={() => setSeatTable(null)}
          onConfirm={(guests) => void seatTableOnly(seatTable, guests)}
        />
      )}

      {reservedTable && !editMode && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-stone-900">
                  {reservedTable.name || `Mesa ${reservedTable.number}`}
                </h2>
                <p className="text-sm text-stone-500">Mesa reservada</p>
              </div>
              <button
                type="button"
                onClick={() => setReservedTable(null)}
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setSeatTable(reservedTable);
                  setReservedTable(null);
                }}
                className={`w-full ${VERTIAL_BTN_PRIMARY}`}
              >
                Sentar ahora
              </button>
              <button
                type="button"
                onClick={() => {
                  void cancelTableReservation(reservedTable).then(() => setReservedTable(null));
                }}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50"
              >
                Cancelar reserva
              </button>
            </div>
          </div>
        </div>
      )}

      {editTable && editMode && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-stone-900">
                  {editTable.name || `Mesa ${editTable.number}`}
                </h2>
                <p className="text-sm text-stone-500">Editar mesa</p>
              </div>
              <button
                type="button"
                onClick={() => setEditTable(null)}
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-stone-500">Capacidad (máx. personas)</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditCapacity((n) => Math.max(1, n - 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <p className="min-w-[3rem] text-center text-2xl font-semibold tabular-nums">
                    {editCapacity}
                  </p>
                  <button
                    type="button"
                    onClick={() => setEditCapacity((n) => Math.min(40, n + 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {isOccupiedStatus(editTable.status) && (
                <div>
                  <p className="mb-2 text-xs font-medium text-stone-500">Comensales ahora</p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditGuests((n) => Math.max(0, n - 1))}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <p className="min-w-[3rem] text-center text-2xl font-semibold tabular-nums">
                      {editGuests}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setEditGuests((n) => Math.min(Math.max(editCapacity, 1), n + 1))
                      }
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={mapBusy || !onUpdateTablePeople}
                onClick={() => void saveEditTable()}
                className={`w-full ${VERTIAL_BTN_PRIMARY}`}
              >
                Guardar
              </button>

              {canDeleteEdit && (
                <button
                  type="button"
                  disabled={mapBusy}
                  onClick={() => {
                    const id = String(editTable._id || editTable.id || '');
                    if (
                      !id
                      || !onRemoveTable
                      || !window.confirm('¿Eliminar esta mesa del mapa?')
                    ) {
                      return;
                    }
                    setEditTable(null);
                    void Promise.resolve(onRemoveTable(id)).catch(() => undefined);
                  }}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                  Eliminar mesa
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {onAddZone && (
        <RestaurantAddZoneModal
          open={showAddZone}
          busy={mapBusy}
          onClose={() => setShowAddZone(false)}
          onCreate={(input) => {
            void Promise.resolve(onAddZone(input)).then((created) => {
              setShowAddZone(false);
              if (created?.id) setActiveRoomId(created.id);
            });
          }}
        />
      )}

      {onAddTables && (
        <RestaurantAddTablesModal
          open={showAddTables}
          room={activeRoom}
          busy={mapBusy}
          onClose={() => setShowAddTables(false)}
          onConfirm={(input) => {
            if (!activeRoom) return;
            void Promise.resolve(
              onAddTables({ roomId: activeRoom.id, ...input }),
            ).then(() => setShowAddTables(false));
          }}
        />
      )}
    </div>
  );
}
