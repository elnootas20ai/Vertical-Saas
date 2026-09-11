/**
 * Editor de plano de sala: 4 skins por tipo de zona + arrastrar mesas (x/y).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { toast } from 'sonner';
import { Check, LayoutGrid, Loader2, Move, Save } from 'lucide-react';
import {
  getFloorConfigRequest,
  saveFloorConfigRequest,
  updateDiningTableRequest,
  type DiningFloorConfig,
  type DiningTable,
} from '../../lib/salaApi';
import type { SalaRoom } from '../../lib/salaStudioTypes';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import {
  DEFAULT_FLOOR_HEIGHT,
  DEFAULT_FLOOR_WIDTH,
  TABLE_NODE_SIZE,
  skinForRoomType,
} from './restaurantSalaFloorSkins';
import {
  compactFloorDimensions,
  positionTablesForFloor,
  RestaurantSalaFloorCanvas,
} from './RestaurantSalaFloorCanvas';

type Props = {
  rooms: SalaRoom[];
  tables: DiningTable[];
  userId: string;
  businessId: string;
  mapBusy?: boolean;
  onRoomsChange: (rooms: SalaRoom[]) => void;
  onTablesChange: (tables: DiningTable[] | ((prev: DiningTable[]) => DiningTable[])) => void;
};

function tableIdOf(t: DiningTable): string {
  return String(t._id || t.id || '').trim();
}

type FloorBackgroundOptionId = 'auto' | NonNullable<SalaRoom['floorBackgroundId']>;

const FLOOR_BACKGROUND_OPTIONS: Array<{ id: FloorBackgroundOptionId; label: string }> = [
  { id: 'auto', label: 'Automático' },
  { id: 'wood', label: 'Madera' },
  { id: 'tile', label: 'Baldosa' },
  { id: 'outdoor', label: 'Exterior' },
  { id: 'night', label: 'Noche' },
];

export function RestaurantSalaFloorEditor({
  rooms,
  tables,
  userId,
  businessId,
  mapBusy = false,
  onRoomsChange,
  onTablesChange,
}: Props) {
  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [rooms],
  );

  const [activeRoomId, setActiveRoomId] = useState(() => sortedRooms[0]?.id || '');
  const [floorWidth, setFloorWidth] = useState(DEFAULT_FLOOR_WIDTH);
  const [floorHeight, setFloorHeight] = useState(DEFAULT_FLOOR_HEIGHT);
  const [savingId, setSavingId] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState(0);
  const [dragId, setDragId] = useState('');
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const floorRef = useRef<HTMLDivElement | null>(null);
  const floorConfigRef = useRef<DiningFloorConfig | null>(null);

  useEffect(() => {
    if (!activeRoomId && sortedRooms[0]?.id) {
      setActiveRoomId(sortedRooms[0].id);
    } else if (activeRoomId && !sortedRooms.some((r) => r.id === activeRoomId)) {
      setActiveRoomId(sortedRooms[0]?.id || '');
    }
  }, [sortedRooms, activeRoomId]);

  useEffect(() => {
    let cancelled = false;
    if (!userId || !businessId) return;
    void getFloorConfigRequest(userId, { businessId })
      .then((cfg) => {
        if (cancelled || !cfg) return;
        floorConfigRef.current = cfg;
        const w = Number(cfg.floorWidth) || DEFAULT_FLOOR_WIDTH;
        const h = Number(cfg.floorHeight) || DEFAULT_FLOOR_HEIGHT;
        const compact = compactFloorDimensions(tables, w, h);
        setFloorWidth(compact.width);
        setFloorHeight(compact.height);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId, businessId]);

  const activeRoom = sortedRooms.find((r) => r.id === activeRoomId) || sortedRooms[0] || null;
  const skin = skinForRoomType(activeRoom?.roomType);

  const roomTables = useMemo(() => {
    if (!activeRoom) return [];
    const roomId = activeRoom.id;
    const inRoom = tables.filter((t) => {
      if (t.visible === false || t.active === false) return false;
      const tid = String(t.roomId || '').trim();
      if (tid) return tid === roomId;
      return String(t.zone || '').trim() === String(activeRoom.name || '').trim();
    });
    return inRoom
      .slice()
      .sort((a, b) => (a.sortOrder || a.number) - (b.sortOrder || b.number));
  }, [tables, activeRoom]);

  const selectFloorBackground = useCallback(
    async (backgroundId: FloorBackgroundOptionId) => {
      if (!userId || !businessId || !activeRoom || savingId || mapBusy) return;
      const previousRooms = rooms;
      const nextRooms = rooms.map((room) => {
        if (room.id !== activeRoom.id) return room;
        const nextRoom = { ...room };
        if (backgroundId === 'auto') {
          delete nextRoom.floorBackgroundId;
        } else {
          nextRoom.floorBackgroundId = backgroundId;
        }
        return nextRoom;
      });
      onRoomsChange(nextRooms);
      setSavingId('__background__');
      try {
        const current =
          floorConfigRef.current
          || await getFloorConfigRequest(userId, { businessId }).catch(() => null);
        const saved = await saveFloorConfigRequest(userId, {
          ...(current || {}),
          businessId,
          rooms: nextRooms,
        });
        floorConfigRef.current = saved;
        setLastSavedAt(Date.now());
        const label =
          FLOOR_BACKGROUND_OPTIONS.find((option) => option.id === backgroundId)?.label || '';
        toast.success(`Fondo ${label.toLowerCase()} aplicado`);
      } catch (err) {
        onRoomsChange(previousRooms);
        toast.error(err instanceof Error ? err.message : 'No se pudo guardar el fondo');
      } finally {
        setSavingId('');
      }
    },
    [userId, businessId, activeRoom, savingId, mapBusy, rooms, onRoomsChange],
  );

  const persistPosition = useCallback(
    async (id: string, x: number, y: number) => {
      if (!userId || !id) return;
      setSavingId(id);
      let snapshot: DiningTable[] = [];
      onTablesChange((prev) => {
        snapshot = prev;
        return prev.map((t) => (tableIdOf(t) === id ? { ...t, x, y } : t));
      });
      try {
        const saved = await updateDiningTableRequest(userId, id, { x, y });
        onTablesChange((prev) =>
          prev.map((t) => (tableIdOf(t) === id ? { ...t, ...saved, x, y } : t)),
        );
        setLastSavedAt(Date.now());
      } catch (err) {
        onTablesChange(snapshot);
        toast.error(err instanceof Error ? err.message : 'No se pudo guardar la posición');
      } finally {
        setSavingId('');
      }
    },
    [userId, onTablesChange],
  );

  const saveFloorLayout = useCallback(async () => {
    if (!userId || !activeRoom || roomTables.length === 0 || savingId || mapBusy) return;
    setSavingId('__floor__');
    try {
      const positioned = positionTablesForFloor(roomTables, activeRoom);
      await Promise.all(
        positioned.map(({ table, x, y }) => {
          const id = tableIdOf(table);
          return id ? updateDiningTableRequest(userId, id, { x, y }) : Promise.resolve(null);
        }),
      );
      setLastSavedAt(Date.now());
      toast.success('Plano guardado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar el plano');
    } finally {
      setSavingId('');
    }
  }, [userId, activeRoom, roomTables, savingId, mapBusy]);

  const clamp = useCallback(
    (x: number, y: number) => {
      const nodeWidth = skin.id === 'vip' ? 104 : TABLE_NODE_SIZE;
      const nodeHeight = skin.id === 'barra' ? 64 : skin.id === 'vip' ? 76 : TABLE_NODE_SIZE;
      const maxX = Math.max(0, floorWidth - nodeWidth);
      const maxY = Math.max(0, floorHeight - nodeHeight);
      return {
        x: Math.round(Math.min(maxX, Math.max(0, x))),
        y: Math.round(Math.min(maxY, Math.max(0, y))),
      };
    },
    [floorWidth, floorHeight, skin.id],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, id: string, x: number, y: number) => {
    if (mapBusy || savingId) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: x,
      origY: y,
      currentX: x,
      currentY: y,
    };
    setDragId(id);
  };

  useEffect(() => {
    if (!dragId) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.id !== dragId) return;
      const scale = floorRef.current
        ? floorRef.current.getBoundingClientRect().width / floorWidth
        : 1;
      const dx = (e.clientX - d.startX) / (scale || 1);
      const dy = (e.clientY - d.startY) / (scale || 1);
      const next = clamp(d.origX + dx, d.origY + dy);
      d.currentX = next.x;
      d.currentY = next.y;
      onTablesChange((prev) =>
        prev.map((t) => (tableIdOf(t) === d.id ? { ...t, x: next.x, y: next.y } : t)),
      );
    };
    const onUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDragId('');
      if (!d) return;
      const pos = clamp(d.currentX, d.currentY);
      void persistPosition(d.id, pos.x, pos.y);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragId, floorWidth, clamp, onTablesChange, persistPosition]);

  const finishDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  if (sortedRooms.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-stone-500">
        No hay zonas todavía. En <strong>En vivo</strong> pulsa «Editar sala» y añade Salón, Terraza, Barra o VIP.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
          <Move className="h-3.5 w-3.5" />
          Plano · arrastra las mesas
        </span>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${skin.badgeClass}`}>
          {skin.label}
        </span>
        {mapBusy || savingId ? (
          <span className="inline-flex items-center gap-1 text-xs text-stone-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Guardando…
          </span>
        ) : lastSavedAt > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            Guardado
          </span>
        ) : (
          <span className="text-xs text-stone-400">Se guarda al soltar</span>
        )}
        <button
          type="button"
          onClick={() => void saveFloorLayout()}
          disabled={mapBusy || Boolean(savingId) || roomTables.length === 0}
          className={`${VERTIAL_BTN_PRIMARY} ml-auto !min-h-9 !px-3 !py-1.5 text-xs disabled:opacity-50`}
        >
          <Save className="h-3.5 w-3.5" />
          Guardar plano
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {sortedRooms.map((room) => {
          const active = room.id === activeRoom?.id;
          const roomSkin = skinForRoomType(room.roomType);
          return (
            <button
              key={room.id}
              type="button"
              onClick={() => setActiveRoomId(room.id)}
              className={`${VERTIAL_BTN_SECONDARY} shrink-0 !min-h-10 !px-3 !py-2 text-xs ${
                active ? 'ring-2 ring-[var(--v-blue,#2563eb)] border-blue-300' : ''
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5 opacity-60" />
              {room.name}
              <span className="text-[10px] font-medium text-stone-400">
                {roomSkin.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-stone-200 bg-white p-2 dark:border-stone-700 dark:bg-stone-900">
        <span className="mr-1 px-1 text-[11px] font-bold uppercase tracking-wide text-stone-500">
          Fondo
        </span>
        {FLOOR_BACKGROUND_OPTIONS.map((option) => {
          const selected =
            option.id === 'auto'
              ? !activeRoom?.floorBackgroundId
              : activeRoom?.floorBackgroundId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={mapBusy || Boolean(savingId)}
              onClick={() => void selectFloorBackground(option.id)}
              className={`min-h-9 rounded-lg border px-3 text-xs font-semibold transition-colors disabled:opacity-50 ${
                selected
                  ? 'border-[var(--v-blue,#2563eb)] bg-[var(--v-blue,#2563eb)] text-white'
                  : 'border-stone-200 bg-stone-50 text-stone-700 hover:border-blue-300 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <RestaurantSalaFloorCanvas
        room={activeRoom}
        tables={roomTables}
        floorWidth={floorWidth}
        floorHeight={floorHeight}
        canvasRef={floorRef}
        className="flex-1"
        minScale={0.7}
        emptyMessage="Esta zona no tiene mesas. Añádelas en «En vivo → Editar sala»."
        renderTable={({ table, x, y }) => {
          const id = tableIdOf(table);
          const dragging = dragId === id;
          const isBarSeat = skin.id === 'barra';
          const isTerraceTable = skin.id === 'terraza';
          const isVipTable = skin.id === 'vip';
          const isRound = table.shape === 'round' || isTerraceTable;
          const isHigh = table.shape === 'high' || isBarSeat;
          const shapeClass =
            isRound || isHigh
              ? 'rounded-full'
              : isVipTable
                ? 'rounded-[24px]'
                : 'rounded-[18px]';
          const seatLabel = isBarSeat
            ? `Puesto ${table.number || '·'}`
            : table.name || `Mesa ${table.number}`;
          return (
            <button
              type="button"
              onPointerDown={(e) => onPointerDown(e, id, x, y)}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              className={`flex touch-none select-none flex-col items-center justify-center gap-0.5 ${shapeClass} ${
                skin.tableClass
              } ${skin.tableTextClass} ${
                dragging ? 'z-20 scale-105 cursor-grabbing ring-2 ring-blue-500' : 'z-10 cursor-grab'
              } ${savingId === id ? 'opacity-70' : ''}`}
              style={{
                width: isHigh ? 64 : isVipTable ? 104 : TABLE_NODE_SIZE,
                height: isHigh ? 64 : isVipTable ? 76 : TABLE_NODE_SIZE,
              }}
              title={`Mover ${seatLabel}`}
            >
              <span className="text-sm font-bold leading-none">
                {table.number || '·'}
              </span>
              <span className="max-w-[4.5rem] truncate text-[9px] font-medium opacity-80">
                {isBarSeat ? 'Puesto' : table.name || `Mesa ${table.number}`}
              </span>
            </button>
          );
        }}
      />

      <p className="text-center text-[11px] text-stone-400">
        Salón, Terraza, Barra y VIP tienen diseño distinto. Arrastra y suelta para guardar la posición.
      </p>
    </div>
  );
}
