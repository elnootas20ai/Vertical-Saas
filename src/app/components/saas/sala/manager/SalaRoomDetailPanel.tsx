import { useMemo, useState, useEffect } from 'react';
import {
  Copy, Pencil, Trash2, Plus, Minus, LayoutGrid, Users, ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { SalaRoom } from '../../../../lib/salaStudioTypes';
import { SALA_ROOM_TYPE_LABELS } from '../../../../lib/salaStudioTypes';
import type { ExtendedDiningTable } from '../../../../lib/salaStudioTypes';
import type { SalaTpvDisplay } from '../../../../lib/salaStoreTpv';
import { roomSetupStatus } from './useSalaManager';
import { SalaTpvStatusBlock } from './SalaTpvStatusBlock';
import { SalaTableConfigRow } from './SalaTableConfigRow';
import { SALA_TABLE_LIST_GRID } from './salaTableListLayout';
import type { TableSizePreset } from '../../../../lib/salaTableSize';

/** Filas visibles por página — caben en pantalla sin scroll interno. */
const TABLES_PER_PAGE = 8;

type Props = {
  room: SalaRoom | null;
  tables: ExtendedDiningTable[];
  tpv: SalaTpvDisplay | null;
  onOpenTpv?: () => void;
  onEditName: () => void;
  onEditType: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onTableCountChange: (count: number) => void;
  onEditTable: (table: ExtendedDiningTable) => void;
  onTableSizeChange: (tableId: string, sizePreset: TableSizePreset) => void;
  onTableCapacityChange: (tableId: string, capacity: number) => void;
  onTableActiveChange: (tableId: string, active: boolean) => void;
  onDeleteTable: (tableId: string) => void;
  onAddTable: () => void;
};

export function SalaRoomDetailPanel({
  room,
  tables,
  tpv,
  onOpenTpv,
  onEditName,
  onEditType,
  onDuplicate,
  onDelete,
  onTableCountChange,
  onEditTable,
  onTableSizeChange,
  onTableCapacityChange,
  onTableActiveChange,
  onDeleteTable,
  onAddTable,
}: Props) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [room?.id]);

  const capacity = useMemo(
    () => tables.reduce((s, t) => s + (t.visible !== false ? (t.capacity || 0) : 0), 0),
    [tables],
  );

  const activeTables = useMemo(
    () => tables.filter((t) => t.visible !== false).length,
    [tables],
  );

  const totalPages = Math.max(1, Math.ceil(tables.length / TABLES_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedTables = tables.slice(
    safePage * TABLES_PER_PAGE,
    safePage * TABLES_PER_PAGE + TABLES_PER_PAGE,
  );

  if (!room) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-gray-400">
        <div>
          <LayoutGrid className="mx-auto mb-3 h-10 w-10 opacity-30" />
          <p className="text-sm font-medium">Selecciona una sala</p>
          <p className="mt-1 text-xs">O crea una nueva para empezar</p>
        </div>
      </div>
    );
  }

  const status = roomSetupStatus(tables.length);
  const configured = status === 'configured';

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-x border-gray-200/80 dark:border-gray-800">
      {/* Cabecera compacta — sin scroll */}
      <div className="shrink-0 space-y-3 border-b border-gray-200/80 px-5 py-3 dark:border-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-50">{room.name}</h2>
            <p className="text-xs text-gray-500">
              {SALA_ROOM_TYPE_LABELS[room.roomType]}
              <span className="mx-2 text-gray-300">·</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{tables.length} mesas</span>
              <span className="mx-2 text-gray-300">·</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{capacity} pers.</span>
              <span className="mx-2 text-gray-300">·</span>
              <span className={configured ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                {configured ? 'Configurada' : 'Incompleta'}
              </span>
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-wrap justify-end gap-1.5">
              <SafeActionBtn icon={Pencil} label="Nombre" onClick={onEditName} />
              <SafeActionBtn icon={Pencil} label="Tipo" onClick={onEditType} />
              <SafeActionBtn icon={Copy} label="Duplicar" onClick={onDuplicate} />
            </div>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Eliminar sala
            </button>
          </div>
        </div>

        <SalaTpvStatusBlock tpv={tpv} variant="inline" onOpenTpv={onOpenTpv} />
      </div>

      {/* Lista de mesas — altura fija, paginación en lugar de scroll */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-3">
        <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Mesas</span>
            <div className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => onTableCountChange(Math.max(0, tables.length - 1))}
                className="p-1.5 hover:bg-gray-50 dark:hover:bg-gray-800"
                aria-label="Reducir mesas"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums">{tables.length}</span>
              <button
                type="button"
                onClick={() => onTableCountChange(tables.length + 1)}
                className="p-1.5 hover:bg-gray-50 dark:hover:bg-gray-800"
                aria-label="Aumentar mesas"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <span className="text-xs text-gray-500">
              {activeTables} activa{activeTables !== 1 ? 's' : ''} en TPV
            </span>
          </div>

          <button
            type="button"
            onClick={onAddTable}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
          >
            <Plus className="h-3.5 w-3.5" />
            Añadir mesa
          </button>
        </div>

        {tables.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-10 text-center dark:border-gray-800">
            <Users className="mb-2 h-7 w-7 text-gray-300" />
            <p className="text-sm text-gray-400">Sin mesas — usa el stepper o «Añadir mesa»</p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200/80 dark:border-gray-800">
            <div
              className={`${SALA_TABLE_LIST_GRID} shrink-0 border-b border-gray-200/80 bg-gray-50/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:border-gray-800 dark:bg-gray-900/60`}
            >
              <span>Mesa</span>
              <span>Tamaño</span>
              <span className="text-center">Aforo</span>
              <span className="text-center">Activa</span>
              <span className="sr-only">Acciones</span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-white dark:bg-gray-950">
              {pagedTables.map((table) => (
                <SalaTableConfigRow
                  key={table._id}
                  table={table}
                  onEdit={() => onEditTable(table)}
                  onSizeChange={(preset) => onTableSizeChange(table._id, preset)}
                  onCapacityChange={(cap) => onTableCapacityChange(table._id, cap)}
                  onActiveChange={(active) => onTableActiveChange(table._id, active)}
                  onDelete={() => onDeleteTable(table._id)}
                />
              ))}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200/80 bg-gray-50/80 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/40">
              <button
                type="button"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </button>
              <div className="text-center">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {tables.length <= TABLES_PER_PAGE
                    ? `${tables.length} mesa${tables.length !== 1 ? 's' : ''}`
                    : `${safePage * TABLES_PER_PAGE + 1}–${Math.min((safePage + 1) * TABLES_PER_PAGE, tables.length)} de ${tables.length}`}
                </p>
                {totalPages > 1 ? (
                  <p className="mt-0.5 text-[10px] text-gray-400">
                    Página {safePage + 1} de {totalPages}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-40 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-300 dark:hover:bg-gray-900"
              >
                Siguiente
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SafeActionBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
