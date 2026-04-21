import React, { useEffect, useRef, useState } from 'react';
import { Columns3, GripVertical, Eye, EyeOff, RotateCcw, Check } from 'lucide-react';
import type { ColumnDef } from '../../hooks/useColumnPreferences';

interface Props<T extends string> {
  columns: ColumnDef<T>[];
  visibleIds: T[];
  columnOrder: T[];
  onToggle: (id: T) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onReset: () => void;
}

export function ColumnCustomizer<T extends string>({
  columns,
  visibleIds,
  columnOrder,
  onToggle,
  onReorder,
  onReset,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // Touch drag state
  const touchStartIndexRef = useRef<number | null>(null);
  const touchDragRef = useRef<HTMLElement | null>(null);
  const touchGhostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Map id -> label
  const labelMap = Object.fromEntries(columns.map(c => [c.id, c.label])) as Record<T, string>;
  const requiredMap = Object.fromEntries(columns.map(c => [c.id, !!c.required])) as Record<T, boolean>;

  const orderedCols = columnOrder.map(id => ({ id, label: labelMap[id], required: requiredMap[id] }));
  const visibleCount = visibleIds.length;

  // ── Touch drag helpers ──────────────────────────────────────────────────────

  const getItemIndexFromPoint = (x: number, y: number): number | null => {
    const items = ref.current?.querySelectorAll('[data-col-index]');
    if (!items) return null;
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom) return i;
    }
    return null;
  };

  const handleTouchStart = (e: React.TouchEvent, idx: number, isRequired: boolean) => {
    if (isRequired) return;
    touchStartIndexRef.current = idx;
    const target = e.currentTarget as HTMLElement;
    touchDragRef.current = target;

    // Create ghost element
    const ghost = target.cloneNode(true) as HTMLDivElement;
    ghost.style.cssText = `
      position: fixed; pointer-events: none; z-index: 9999; opacity: 0.85;
      width: ${target.offsetWidth}px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      border-radius: 12px; background: white;
      transform: rotate(1.5deg) scale(1.02);
      transition: transform 0.1s;
    `;
    const touch = e.touches[0];
    ghost.style.left = `${touch.clientX - target.offsetWidth / 2}px`;
    ghost.style.top = `${touch.clientY - target.offsetHeight / 2}px`;
    document.body.appendChild(ghost);
    touchGhostRef.current = ghost;

    target.style.opacity = '0.4';
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartIndexRef.current === null) return;
    e.preventDefault();
    const touch = e.touches[0];
    const ghost = touchGhostRef.current;
    const target = touchDragRef.current;
    if (!ghost || !target) return;

    ghost.style.left = `${touch.clientX - target.offsetWidth / 2}px`;
    ghost.style.top = `${touch.clientY - target.offsetHeight / 2}px`;

    const overIdx = getItemIndexFromPoint(touch.clientX, touch.clientY);
    setDragOver(overIdx);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartIndexRef.current === null) return;
    const touch = e.changedTouches[0];
    const toIdx = getItemIndexFromPoint(touch.clientX, touch.clientY);

    if (toIdx !== null && toIdx !== touchStartIndexRef.current) {
      onReorder(touchStartIndexRef.current, toIdx);
    }

    // Cleanup
    touchGhostRef.current?.remove();
    touchGhostRef.current = null;
    if (touchDragRef.current) touchDragRef.current.style.opacity = '';
    touchDragRef.current = null;
    touchStartIndexRef.current = null;
    setDragOver(null);
  };

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        title="Personalizar columnas"
        className={`flex items-center gap-1.5 px-3 py-2.5 border-2 rounded-xl text-sm font-medium transition-colors ${open ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-200 hover:border-gray-300 text-gray-600 dark:text-gray-400 dark:border-gray-700 dark:hover:border-gray-600'}`}
      >
        <Columns3 className="w-4 h-4" />
        <span className="hidden sm:inline">Columnas</span>
        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${open ? 'bg-white text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
          {visibleCount}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl z-40 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Columnas visibles</p>
            <button
              onClick={onReset}
              title="Restaurar por defecto"
              className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Restablecer
            </button>
          </div>

          {/* Column list */}
          <div className="py-1 max-h-72 overflow-y-auto">
            {orderedCols.map((col, idx) => {
              const isVisible = visibleIds.includes(col.id);
              const isDraggedOver = dragOver === idx;

              return (
                <div
                  key={col.id}
                  data-col-index={idx}
                  draggable={!col.required}
                  onDragStart={() => { dragIndexRef.current = idx; }}
                  onDragOver={e => { e.preventDefault(); setDragOver(idx); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => {
                    if (dragIndexRef.current !== null && dragIndexRef.current !== idx) {
                      onReorder(dragIndexRef.current, idx);
                    }
                    setDragOver(null);
                    dragIndexRef.current = null;
                  }}
                  onDragEnd={() => { setDragOver(null); dragIndexRef.current = null; }}
                  onTouchStart={e => handleTouchStart(e, idx, !!col.required)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  className={`flex items-center gap-2 px-3 py-2.5 transition-colors cursor-default select-none ${isDraggedOver ? 'bg-blue-50 dark:bg-blue-950 border-l-2 border-blue-400' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                >
                  {/* Drag handle */}
                  <span
                    className={`flex-shrink-0 touch-none ${col.required ? 'opacity-0' : 'text-gray-300 dark:text-gray-600 cursor-grab active:cursor-grabbing'}`}
                    title={col.required ? undefined : 'Arrastra para reordenar'}
                  >
                    <GripVertical className="w-4 h-4" />
                  </span>

                  {/* Toggle */}
                  <button
                    onClick={() => !col.required && onToggle(col.id)}
                    disabled={col.required}
                    className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${isVisible ? 'bg-gray-900 dark:bg-gray-100 border-gray-900' : 'border-gray-300 dark:border-gray-600'} ${col.required ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    {isVisible && <Check className="w-2.5 h-2.5 text-white dark:text-gray-900" />}
                  </button>

                  {/* Label */}
                  <span className={`flex-1 text-sm transition-colors ${isVisible ? 'text-gray-900 font-medium' : 'text-gray-400 dark:text-gray-500'}`}>
                    {col.label}
                  </span>

                  {/* Visibility icon */}
                  {isVisible
                    ? <Eye className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                    : <EyeOff className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                  }
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-2.5">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Arrastra para reordenar · toca para mostrar/ocultar
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
