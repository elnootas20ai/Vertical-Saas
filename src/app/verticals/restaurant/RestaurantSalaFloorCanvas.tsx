import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type { DiningTable } from '../../lib/salaApi';
import type { SalaRoom } from '../../lib/salaStudioTypes';
import {
  DEFAULT_FLOOR_HEIGHT,
  DEFAULT_FLOOR_WIDTH,
  skinForRoomType,
} from './restaurantSalaFloorSkins';

export type FloorTablePlacement = {
  table: DiningTable;
  x: number;
  y: number;
};

type Props = {
  room: SalaRoom | null;
  tables: DiningTable[];
  floorWidth?: number;
  floorHeight?: number;
  canvasRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  minScale?: number;
  emptyMessage?: ReactNode;
  renderTable: (placement: FloorTablePlacement) => ReactNode;
};

const FLOOR_BACKGROUND_CLASSES: Record<
  NonNullable<SalaRoom['floorBackgroundId']>,
  string
> = {
  wood:
    'bg-[#ead9bd] bg-[repeating-linear-gradient(90deg,rgba(120,80,45,0.08)_0,rgba(120,80,45,0.08)_1px,transparent_1px,transparent_72px)]',
  tile:
    'bg-stone-100 bg-[linear-gradient(rgba(120,113,108,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(120,113,108,0.12)_1px,transparent_1px)] bg-[size:54px_54px] dark:bg-stone-800',
  outdoor:
    'bg-emerald-50 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.12)_1.5px,transparent_1.5px)] bg-[size:30px_30px] dark:bg-emerald-950',
  night:
    'bg-slate-950 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.18),transparent_60%)]',
};

function FloorPlant({ className }: { className: string }) {
  return (
    <div
      className={`h-14 w-14 drop-shadow-md ${className}`}
      aria-hidden
    >
      <span className="absolute left-2 top-0 h-7 w-7 -rotate-12 rounded-full rounded-br-sm bg-emerald-600/85" />
      <span className="absolute right-2 top-0 h-7 w-7 rotate-12 rounded-full rounded-bl-sm bg-emerald-700/85" />
      <span className="absolute left-1/2 top-1 h-8 w-6 -translate-x-1/2 rounded-full bg-emerald-500/90" />
      <span className="absolute bottom-1 left-1/2 h-7 w-9 -translate-x-1/2 rounded-b-xl border border-amber-950/20 bg-orange-700/85" />
      <span className="absolute bottom-6 left-1/2 h-2 w-11 -translate-x-1/2 rounded-full border border-amber-950/20 bg-orange-600" />
    </div>
  );
}

function FloorPlanter({ className }: { className: string }) {
  return (
    <div
      className={`h-11 w-36 rounded-lg border border-amber-950/20 bg-orange-800/65 px-2 pt-1 shadow-md ${className}`}
      aria-hidden
    >
      <span className="block h-6 w-full rounded-[50%] bg-[radial-gradient(circle,rgba(22,163,74,0.9)_0_3px,transparent_4px)] bg-[size:18px_14px]" />
    </div>
  );
}

function FloorPerimeter({ skinId }: { skinId: string }) {
  const wallClass =
    skinId === 'vip'
      ? 'bg-violet-300/35'
      : skinId === 'barra'
        ? 'bg-zinc-600/50'
        : skinId === 'terraza'
          ? 'bg-emerald-800/25'
          : 'bg-stone-600/30';
  const windowClass = skinId === 'vip' ? 'bg-amber-300/65' : 'bg-sky-400/50';
  return (
    <div className="absolute inset-2" aria-hidden>
      <span className={`absolute inset-x-0 top-0 h-2 rounded-full ${wallClass}`} />
      <span className={`absolute bottom-0 left-0 top-0 w-2 rounded-full ${wallClass}`} />
      <span className={`absolute bottom-0 right-0 top-0 w-2 rounded-full ${wallClass}`} />
      <span className={`absolute bottom-0 left-0 right-[58%] h-2 rounded-full ${wallClass}`} />
      <span className={`absolute bottom-0 left-[58%] right-0 h-2 rounded-full ${wallClass}`} />
      <span className={`absolute left-[16%] top-0 h-1.5 w-[18%] rounded-full ${windowClass}`} />
      <span className={`absolute right-[18%] top-0 h-1.5 w-[16%] rounded-full ${windowClass}`} />
      {skinId !== 'barra' ? (
        <span className={`absolute right-0 top-[34%] h-[20%] w-1.5 rounded-full ${windowClass}`} />
      ) : null}
    </div>
  );
}

function FloorAmbience({ skinId }: { skinId: string }) {
  if (skinId === 'terraza') {
    return (
      <>
        <div className="absolute inset-5 rounded-[28px] border border-emerald-700/10" />
        <div className="absolute -right-12 -top-16 h-56 w-56 rounded-full bg-sky-200/20 blur-3xl" />
        <FloorPlant className="absolute left-6 top-6" />
        <FloorPlant className="absolute right-7 top-28" />
        <FloorPlanter className="absolute bottom-7 left-8" />
        <FloorPlanter className="absolute bottom-7 right-8" />
        <div className="absolute left-[42%] top-[38%] h-28 w-28 rounded-full border border-emerald-800/15 bg-white/10 shadow-[inset_0_0_0_6px_rgba(255,255,255,0.08)]">
          <span className="absolute bottom-2 left-1/2 top-2 w-px bg-emerald-900/15" />
          <span className="absolute left-2 right-2 top-1/2 h-px bg-emerald-900/15" />
        </div>
      </>
    );
  }

  if (skinId === 'barra') {
    return (
      <>
        <div className="absolute left-6 right-6 top-5 h-12 rounded-xl border border-zinc-950/20 bg-zinc-800/85 shadow-xl dark:bg-zinc-700/75">
          <div className="absolute bottom-1 left-3 right-3 h-1 rounded-full bg-amber-400/70" />
          <div className="absolute inset-x-8 top-2 flex justify-between">
            {Array.from({ length: 8 }).map((_, index) => (
              <span
                key={index}
                className="h-5 w-2 rounded-t-full bg-sky-200/45 shadow-sm"
              />
            ))}
          </div>
        </div>
        <div className="absolute left-6 right-6 top-20 h-px border-t border-dashed border-zinc-600/25" />
        <div className="absolute left-10 top-7 h-7 w-20 rounded border border-zinc-950/30 bg-zinc-900/45">
          <span className="absolute inset-1 rounded border border-sky-200/25 bg-sky-100/10" />
        </div>
        <FloorPlant className="absolute bottom-7 right-7" />
      </>
    );
  }

  if (skinId === 'vip') {
    return (
      <>
        <div className="absolute inset-5 rounded-[28px] border border-violet-300/15" />
        <div className="absolute -left-20 top-1/4 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <span className="absolute left-10 top-10 h-6 w-6 rounded-full border-4 border-amber-300/25 bg-amber-200/20 shadow-[0_0_22px_rgba(251,191,36,0.25)]" />
        <span className="absolute bottom-12 right-12 h-6 w-6 rounded-full border-4 border-amber-300/25 bg-amber-200/20 shadow-[0_0_22px_rgba(251,191,36,0.25)]" />
        <FloorPlant className="absolute bottom-7 left-7" />
        <FloorPlant className="absolute bottom-7 right-7" />
      </>
    );
  }

  return (
    <>
      <div className="absolute inset-5 rounded-[28px] border border-amber-900/10" />
      <div className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-amber-200/20 blur-3xl" />
      <div className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-orange-200/15 blur-3xl" />
      <div className="absolute left-1/2 top-6 flex h-9 w-40 -translate-x-1/2 items-center justify-around rounded-lg border border-amber-950/15 bg-amber-900/10 shadow-sm">
        <span className="h-5 w-5 rounded-full border-2 border-amber-900/15 bg-white/35" />
        <span className="h-5 w-5 rounded-full border-2 border-amber-900/15 bg-white/35" />
        <span className="h-5 w-5 rounded-full border-2 border-amber-900/15 bg-white/35" />
      </div>
      <FloorPlant className="absolute left-7 top-7" />
      <FloorPlant className="absolute bottom-7 right-7" />
    </>
  );
}

function FloorSeatFurniture({ skinId }: { skinId: string }) {
  if (skinId === 'salon') {
    return (
      <div className="pointer-events-none absolute -inset-2.5" aria-hidden>
        <span className="absolute -top-0.5 left-1/2 h-2 w-8 -translate-x-1/2 rounded-t-md border border-amber-900/25 bg-amber-700/35" />
        <span className="absolute -bottom-0.5 left-1/2 h-2 w-8 -translate-x-1/2 rounded-b-md border border-amber-900/25 bg-amber-700/35" />
        <span className="absolute -left-0.5 top-1/2 h-8 w-2 -translate-y-1/2 rounded-l-md border border-amber-900/25 bg-amber-700/35" />
        <span className="absolute -right-0.5 top-1/2 h-8 w-2 -translate-y-1/2 rounded-r-md border border-amber-900/25 bg-amber-700/35" />
      </div>
    );
  }

  if (skinId === 'vip') {
    return (
      <div
        className="pointer-events-none absolute -inset-1.5 rounded-[28px] border border-amber-300/35 shadow-[0_0_18px_rgba(196,181,253,0.18)]"
        aria-hidden
      />
    );
  }

  if (skinId === 'terraza') {
    return (
      <div
        className="pointer-events-none absolute -inset-1.5 rounded-full border border-dashed border-emerald-700/25"
        aria-hidden
      />
    );
  }

  return null;
}

export function fallbackFloorTablePosition(
  indexInRoom: number,
  isBarra: boolean,
): { x: number; y: number } {
  const cols = isBarra ? 6 : 4;
  const gapX = isBarra ? 100 : 140;
  const gapY = isBarra ? 100 : 120;
  const col = indexInRoom % cols;
  const row = Math.floor(indexInRoom / cols);
  return { x: 80 + col * gapX, y: 80 + row * gapY };
}

export function positionTablesForFloor(
  tables: DiningTable[],
  room: SalaRoom | null,
): FloorTablePlacement[] {
  const isBarra = room?.roomType === 'barra';
  return tables.map((table, index) => {
    const fallback = fallbackFloorTablePosition(index, isBarra);
    const rawX = Number(table.x);
    const rawY = Number(table.y);
    // Mesas legacy suelen venir todas en 0,0: solo la primera puede ocupar ese punto.
    const hasPosition =
      Number.isFinite(rawX)
      && Number.isFinite(rawY)
      && !(index > 0 && rawX === 0 && rawY === 0);
    return {
      table,
      x: hasPosition ? rawX : fallback.x,
      y: hasPosition ? rawY : fallback.y,
    };
  });
}

export function compactFloorDimensions(
  tables: DiningTable[],
  requestedWidth: number,
  requestedHeight: number,
): { width: number; height: number } {
  const maxX = tables.reduce((max, table) => {
    const x = Number(table.x);
    return Number.isFinite(x) ? Math.max(max, x) : max;
  }, 0);
  const maxY = tables.reduce((max, table) => {
    const y = Number(table.y);
    return Number.isFinite(y) ? Math.max(max, y) : max;
  }, 0);
  const configuredWidth = Math.max(640, Number(requestedWidth) || DEFAULT_FLOOR_WIDTH);
  const configuredHeight = Math.max(420, Number(requestedHeight) || DEFAULT_FLOOR_HEIGHT);
  return {
    width: Math.max(640, Math.min(configuredWidth, Math.max(DEFAULT_FLOOR_WIDTH, maxX + 200))),
    height: Math.max(420, Math.min(configuredHeight, Math.max(DEFAULT_FLOOR_HEIGHT, maxY + 180))),
  };
}

export function RestaurantSalaFloorCanvas({
  room,
  tables,
  floorWidth = DEFAULT_FLOOR_WIDTH,
  floorHeight = DEFAULT_FLOOR_HEIGHT,
  canvasRef,
  className = '',
  minScale = 0.55,
  emptyMessage,
  renderTable,
}: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const safeWidth = Math.max(640, Number(floorWidth) || DEFAULT_FLOOR_WIDTH);
  const safeHeight = Math.max(420, Number(floorHeight) || DEFAULT_FLOOR_HEIGHT);
  const skin = skinForRoomType(room?.roomType);
  const floorClass = room?.floorBackgroundId
    ? FLOOR_BACKGROUND_CLASSES[room.floorBackgroundId]
    : skin.floorClass;
  const positioned = useMemo(
    () => positionTablesForFloor(tables, room),
    [tables, room],
  );

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const update = () => setViewportWidth(node.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fitScale = viewportWidth > 0 ? viewportWidth / safeWidth : 1;
  const scale = Math.min(1, Math.max(minScale, fitScale));

  return (
    <div
      ref={viewportRef}
      className={`min-h-0 overflow-auto rounded-2xl border border-stone-200 dark:border-stone-700 ${className}`}
    >
      <div
        className="relative"
        style={{ width: safeWidth * scale, height: safeHeight * scale }}
      >
        <div
          ref={canvasRef}
          className={`absolute left-0 top-0 origin-top-left overflow-hidden ${floorClass}`}
          style={{
            width: safeWidth,
            height: safeHeight,
            transform: `scale(${scale})`,
          }}
        >
          <div className={`pointer-events-none absolute inset-0 ${skin.atmosphereClass}`} />
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <FloorAmbience skinId={skin.id} />
            <FloorPerimeter skinId={skin.id} />
          </div>
          {positioned.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center px-5 text-center text-sm text-stone-500/80">
              {emptyMessage}
            </div>
          ) : (
            positioned.map((placement) => {
              const id = String(placement.table._id || placement.table.id || '');
              return (
                <div
                  key={id}
                  className="absolute w-fit"
                  style={{ left: placement.x, top: placement.y }}
                >
                  <div className="relative w-fit">
                    <FloorSeatFurniture skinId={skin.id} />
                    <div className="relative z-[1]">{renderTable(placement)}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
