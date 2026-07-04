import {
  Copy, Pencil, Trash2, Plus, QrCode, Minus, Users, LayoutGrid,
} from 'lucide-react';
import type { SalaRoom } from '../../../../lib/salaStudioTypes';
import { SALA_ROOM_TYPE_LABELS } from '../../../../lib/salaStudioTypes';
import type { ExtendedDiningTable } from '../../../../lib/salaStudioTypes';
import { roomSetupStatus, STATUS_LABELS } from './useSalaManager';
import {
  TABLE_SIZE_PRESETS,
  inferTableSizePreset,
  type TableSizePreset,
} from '../../../../lib/salaTableSize';
import { SalaTpvCodeBadge } from './SalaTpvCodeBadge';

type Props = {
  room: SalaRoom | null;
  tables: ExtendedDiningTable[];
  onEditName: () => void;
  onEditType: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onTableCountChange: (count: number) => void;
  onEditTable: (table: ExtendedDiningTable) => void;
  onTableSizeChange: (tableId: string, sizePreset: TableSizePreset) => void;
  onAddTable: () => void;
};

export function SalaRoomDetailPanel({
  room,
  tables,
  onEditName,
  onEditType,
  onDuplicate,
  onDelete,
  onTableCountChange,
  onEditTable,
  onTableSizeChange,
  onAddTable,
}: Props) {
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

  const capacity = tables.reduce((s, t) => s + (t.capacity || 0), 0);
  const status = roomSetupStatus(tables.length);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-gray-200/80 px-6 py-5 dark:border-gray-800">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">{room.name}</h2>
            <p className="mt-0.5 text-sm text-gray-500">{SALA_ROOM_TYPE_LABELS[room.roomType]}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionBtn icon={Pencil} label="Editar nombre" onClick={onEditName} />
            <ActionBtn icon={Pencil} label="Tipo" onClick={onEditType} />
            <ActionBtn icon={Copy} label="Duplicar" onClick={onDuplicate} />
            <ActionBtn icon={Trash2} label="Eliminar" onClick={onDelete} danger />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Mesas" value={String(tables.length)} />
          <MiniStat label="Capacidad" value={`${capacity} pers.`} />
          <MiniStat label="Estado" value={status === 'configured' ? 'Configurada' : 'Pendiente'} />
          <MiniStat label="Zona" value={room.name} />
        </div>

        <div className="mt-4">
          <SalaTpvCodeBadge code={room.terminalCode} />
          <p className="mt-1.5 text-xs text-gray-500">
            Usa este código en TPV Tablet (/auth/tpv-tablet) para abrir la caja de esta sala. Cada sala tiene su propio terminal TPV.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-500">Cantidad de mesas</span>
          <div className="inline-flex items-center rounded-xl border border-gray-200 dark:border-gray-700">
            <button type="button" onClick={() => onTableCountChange(Math.max(0, tables.length - 1))} className="p-2 hover:bg-gray-50 dark:hover:bg-gray-800">
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-[2.5rem] text-center text-sm font-semibold tabular-nums">{tables.length}</span>
            <button type="button" onClick={() => onTableCountChange(tables.length + 1)} className="p-2 hover:bg-gray-50 dark:hover:bg-gray-800">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white dark:border-gray-800 dark:bg-gray-950">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-900/50">
                <th className="px-4 py-3">Mesa</th>
                <th className="px-4 py-3">Tamaño</th>
                <th className="px-4 py-3">Capacidad</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">QR</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {tables.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    <Users className="mx-auto mb-2 h-8 w-8 opacity-30" />
                    <p className="text-sm">Sin mesas — ajusta la cantidad arriba</p>
                  </td>
                </tr>
              ) : tables.map((table) => (
                <tr key={table._id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/30">
                  <td className="px-4 py-3">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Mesa {table.number}</span>
                    {table.notes && <p className="mt-0.5 truncate text-xs text-gray-400">{table.notes}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={table.sizePreset || inferTableSizePreset(table.gridW, table.gridH, table.capacity)}
                      onChange={(e) => onTableSizeChange(table._id, e.target.value as TableSizePreset)}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    >
                      {(Object.keys(TABLE_SIZE_PRESETS) as TableSizePreset[]).map((key) => (
                        <option key={key} value={key}>{TABLE_SIZE_PRESETS[key].shortLabel}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{table.capacity} personas</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={table.status} />
                  </td>
                  <td className="px-4 py-3">
                    {table.qrCode ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                        <QrCode className="h-3.5 w-3.5" />
                        {table.qrCode}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onEditTable(table)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={onAddTable}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
        >
          <Plus className="h-4 w-4" />
          Añadir mesa
        </button>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900/40">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
        danger
          ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400'
          : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: ExtendedDiningTable['status'] }) {
  const colors: Record<string, string> = {
    available: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    occupied: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    unavailable: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    reserved: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  };
  const cls = colors[status] || 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
