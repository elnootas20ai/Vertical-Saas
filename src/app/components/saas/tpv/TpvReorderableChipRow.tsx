import { useCallback, useRef, useState, type ReactNode } from 'react';

type TpvReorderableChipRowProps = {
  itemIds: string[];
  onReorder: (nextIds: string[]) => void;
  renderItem: (id: string, index: number, dragging: boolean) => ReactNode;
  className?: string;
  gapClassName?: string;
  alignClassName?: string;
  prefix?: ReactNode;
};

function indexFromClientX(row: HTMLElement, clientX: number): number | null {
  const nodes = row.querySelectorAll<HTMLElement>('[data-tpv-chip-index]');
  for (let i = 0; i < nodes.length; i += 1) {
    const rect = nodes[i].getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right) return i;
  }
  return null;
}

export function TpvReorderableChipRow({
  itemIds,
  onReorder,
  renderItem,
  className = '',
  gapClassName = 'gap-2',
  alignClassName = 'items-end',
  prefix = null,
}: TpvReorderableChipRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const dragFromRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  const touchDragFromRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [touchDragging, setTouchDragging] = useState(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleReorder = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      dragMovedRef.current = true;
      onReorder(
        (() => {
          const next = [...itemIds];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return next;
        })(),
      );
      dragFromRef.current = to;
      touchDragFromRef.current = to;
      setDragOverIndex(to);
    },
    [itemIds, onReorder],
  );

  return (
    <div className={`relative ${className}`}>
      <div
        ref={rowRef}
        className={`flex overflow-x-auto overscroll-x-contain scroll-smooth snap-x snap-mandatory touch-pan-x scrollbar-hide pb-0.5 ${gapClassName} ${alignClassName}`}
        onTouchMove={(e) => {
          if (touchDragFromRef.current == null || !rowRef.current) return;
          e.preventDefault();
          const idx = indexFromClientX(rowRef.current, e.touches[0]?.clientX ?? 0);
          if (idx != null && idx !== touchDragFromRef.current) {
            handleReorder(touchDragFromRef.current, idx);
          }
        }}
        onTouchEnd={() => {
          clearLongPress();
          touchDragFromRef.current = null;
          setTouchDragging(false);
          dragFromRef.current = null;
          setDragOverIndex(null);
          window.setTimeout(() => {
            dragMovedRef.current = false;
          }, 0);
        }}
        onTouchCancel={() => {
          clearLongPress();
          touchDragFromRef.current = null;
          setTouchDragging(false);
          dragFromRef.current = null;
          setDragOverIndex(null);
        }}
      >
        {prefix ? <div className="shrink-0 snap-start">{prefix}</div> : null}
        {itemIds.map((id, index) => {
          const dragging = dragOverIndex === index && (dragFromRef.current != null || touchDragging);
          return (
            <div
              key={id}
              data-tpv-chip-index={index}
              draggable
              className={`shrink-0 snap-start select-none transition-transform ${
                dragging ? 'scale-105 opacity-90 z-10' : ''
              } ${touchDragging ? 'cursor-grabbing' : 'cursor-grab active:cursor-grabbing'}`}
              onDragStart={(e) => {
                dragFromRef.current = index;
                dragMovedRef.current = false;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(index));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragFromRef.current != null && dragFromRef.current !== index) {
                  setDragOverIndex(index);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragFromRef.current ?? Number(e.dataTransfer.getData('text/plain'));
                if (Number.isFinite(from) && from !== index) handleReorder(from, index);
                dragFromRef.current = null;
                setDragOverIndex(null);
                window.setTimeout(() => {
                  dragMovedRef.current = false;
                }, 0);
              }}
              onDragEnd={() => {
                dragFromRef.current = null;
                setDragOverIndex(null);
                window.setTimeout(() => {
                  dragMovedRef.current = false;
                }, 0);
              }}
              onTouchStart={() => {
                clearLongPress();
                longPressTimerRef.current = window.setTimeout(() => {
                  touchDragFromRef.current = index;
                  dragFromRef.current = index;
                  setTouchDragging(true);
                  setDragOverIndex(index);
                  if (typeof navigator !== 'undefined' && navigator.vibrate) {
                    navigator.vibrate(12);
                  }
                }, 380);
              }}
              onTouchMove={() => {
                if (touchDragFromRef.current == null) clearLongPress();
              }}
              onClickCapture={(e) => {
                if (dragMovedRef.current) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            >
              {renderItem(id, index, dragging)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
