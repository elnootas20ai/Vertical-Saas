/**
 * Editor de plano de sala: 4 skins por tipo de zona + arrastrar mesas (x/y).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { toast } from 'sonner';
import { LayoutGrid, Loader2, Move } from 'lucide-react';
import {
  getFloorConfigRequest,
  updateDiningTableRequest,
  type DiningTable,
} from '../../lib/salaApi';
import type { SalaRoom } from '../../lib/salaStudioTypes';
import { SALA_ROOM_TYPE_LABELS } from '../../lib/salaStudioTypes';
import { VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import {
  DEFAULT_FLOOR_HEIGHT,
  DEFAULT_FLOOR_WIDTH,
  TABLE_NODE_SIZE,
  skinForRoomType,
} from './restaurantSalaFloorSkins';

type Props = {
  rooms: SalaRoom[];
  tables: DiningTable[];
  userId: string;
  businessId: string;
  mapBusy?: boolean;
  onTablesChange: (tables: DiningTable[] | ((prev: DiningTable[]) => DiningTable[])) => void;
};

function tableIdOf(t: DiningTable): string {
  return String(t._id || t.id || '').trim();
}

function fallbackPosition(indexInRoom: number, isBarra: boolean): { x: number; y: number } {
  const cols = isBarra ? 6 : 4;
  const gapX = isBarra ? 100 : 140;
  const gapY = isBarra ? 100 : 120;
  const col = indexInRoom % cols;
  const row = Math.floor(indexInRoom / cols);
  return { x: 80 + col * gapX, y: 80 + row * gapY };
}

export function RestaurantSalaFloorEditor({
  rooms,
  tables,
  userId,
  businessId,
  mapBusy = false,
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
  const [dragId, setDragId] = useState('');
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const floorRef = useRef<HTMLDivElement | null>(null);

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
        const w = Number(cfg.floorWidth) || DEFAULT_FLOOR_WIDTH;
        const h = Number(cfg.floorHeight) || DEFAULT_FLOOR_HEIGHT;
        setFloorWidth(Math.max(640, w));
        setFloorHeight(Math.max(420, h));
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

  const positioned = useMemo(() => {
    const isBarra = activeRoom?.roomType === 'barra';
    return roomTables.map((t, idx) => {
      const fb = fallbackPosition(idx, isBarra);
      const x = Number.isFinite(Number(t.x)) ? Number(t.x) : fb.x;
      const y = Number.isFinite(Number(t.y)) ? Number(t.y) : fb.y;
      return { table: t, x, y };
    });
  }, [roomTables, activeRoom?.roomType]);

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
      } catch (err) {
        onTablesChange(snapshot);
        toast.error(err instanceof Error ? err.message : 'No se pudo guardar la posición');
      } finally {
        setSavingId('');
      }
    },
    [userId, onTablesChange],
  );

  const clamp = useCallback(
    (x: number, y: number) => {
      const maxX = Math.max(0, floorWidth - TABLE_NODE_SIZE);
      const maxY = Math.max(0, floorHeight - TABLE_NODE_SIZE);
      return {
        x: Math.round(Math.min(maxX, Math.max(0, x))),
        y: Math.round(Math.min(maxY, Math.max(0, y))),
      };
    },
    [floorWidth, floorHeight],
  );

  const tablesRef = useRef(tables);
  tablesRef.current = tables;

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
      onTablesChange((prev) =>
        prev.map((t) => (tableIdOf(t) === d.id ? { ...t, x: next.x, y: next.y } : t)),
      );
    };
    const onUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setDragId('');
      if (!d) return;
      const t = tablesRef.current.find((row) => tableIdOf(row) === d.id);
      if (!t) return;
      const pos = clamp(Number(t.x) || 0, Number(t.y) || 0);
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
        ) : null}
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
                {SALA_ROOM_TYPE_LABELS[room.roomType] || roomSkin.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-stone-200 dark:border-stone-700">
        <div
          ref={floorRef}
          className={`relative origin-top-left ${skin.floorClass}`}
          style={{
            width: floorWidth,
            height: floorHeight,
            minWidth: '100%',
          }}
        >
          <div className={`pointer-events-none absolute inset-0 ${skin.atmosphereClass}`} />
          {activeRoom?.roomType === 'barra' ? (
            <div
              className="pointer-events-none absolute left-6 top-6 bottom-6 w-16 rounded-xl bg-zinc-800/80 shadow-inner dark:bg-zinc-700/60"
              aria-hidden
            />
          ) : null}
          {positioned.length === 0 ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-stone-500/80">
              Esta zona no tiene mesas. Añádelas en «En vivo → Editar sala».
            </p>
          ) : (
            positioned.map(({ table, x, y }) => {
              const id = tableIdOf(table);
              const dragging = dragId === id;
              const isRound = table.shape === 'round';
              const isHigh = table.shape === 'high';
              return (
                <button
                  key={id}
                  type="button"
                  onPointerDown={(e) => onPointerDown(e, id, x, y)}
                  onPointerUp={finishDrag}
                  onPointerCancel={finishDrag}
                  className={`absolute flex touch-none select-none flex-col items-center justify-center gap-0.5 ${
                    isRound || isHigh ? 'rounded-full' : 'rounded-xl'
                  } ${skin.tableClass} ${skin.tableTextClass} ${
                    dragging ? 'z-20 scale-105 cursor-grabbing ring-2 ring-blue-500' : 'z-10 cursor-grab'
                  } ${savingId === id ? 'opacity-70' : ''}`}
                  style={{
                    left: x,
                    top: y,
                    width: isHigh ? 56 : TABLE_NODE_SIZE,
                    height: isHigh ? 56 : TABLE_NODE_SIZE,
                  }}
                  title={`Mover ${table.name || `Mesa ${table.number}`}`}
                >
                  <span className="text-sm font-bold leading-none">
                    {table.number || '·'}
                  </span>
                  <span className="max-w-[4.5rem] truncate text-[9px] font-medium opacity-80">
                    {table.name || `Mesa ${table.number}`}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <p className="text-center text-[11px] text-stone-400">
        Salón, Terraza, Barra y VIP tienen diseño distinto. Arrastra y suelta para guardar la posición.
      </p>
    </div>
  );
}
