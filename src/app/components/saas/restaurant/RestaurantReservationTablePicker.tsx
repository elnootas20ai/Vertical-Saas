/**
 * Selector visual de mesas/taburetes para reservas TPV:
 * toca 1 o varias hasta cubrir el aforo (no un <select> con texto largo).
 */
import { useMemo } from 'react';
import { Check, Users } from 'lucide-react';
import type { DiningTable } from '../../../lib/salaApi';
import {
  diningTableDisplayName,
  groupDiningTablesByZone,
  isDiningTablePickable,
} from '../../../lib/restaurantTableSelectUi';

export type ReservationTableSelection = {
  tableIds: string[];
  tableId: string;
  tableName: string;
  tableNumber: string;
  covered: number;
};

type Props = {
  tables: DiningTable[];
  selectedIds: string[];
  partySize: number;
  preferredZone?: string;
  onChange: (next: ReservationTableSelection) => void;
};

function buildSelection(tables: DiningTable[], ids: string[]): ReservationTableSelection {
  const unique = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
  const selected = unique
    .map((id) => tables.find((t) => t._id === id))
    .filter((t): t is DiningTable => Boolean(t));
  const covered = selected.reduce((sum, t) => sum + (Number(t.capacity) || 0), 0);
  if (selected.length === 0) {
    return { tableIds: [], tableId: '', tableName: '', tableNumber: '', covered: 0 };
  }
  return {
    tableIds: selected.map((t) => t._id),
    tableId: selected[0]._id,
    tableName: selected.map((t) => diningTableDisplayName(t)).join(' + '),
    tableNumber: selected.map((t) => String(t.number)).join('+'),
    covered,
  };
}

export function RestaurantReservationTablePicker({
  tables,
  selectedIds,
  partySize,
  preferredZone,
  onChange,
}: Props) {
  const need = Math.max(1, Number(partySize) || 1);
  const groups = useMemo(
    () =>
      groupDiningTablesByZone(
        tables.filter((t) => t.active !== false && t.status !== 'hidden'),
      ),
    [tables],
  );

  const selection = useMemo(
    () => buildSelection(tables, selectedIds),
    [tables, selectedIds],
  );
  const covered = selection.covered;
  const enough = covered >= need;

  const toggle = (table: DiningTable) => {
    if (!isDiningTablePickable(table.status) && !selectedIds.includes(table._id)) return;
    const has = selectedIds.includes(table._id);
    const nextIds = has
      ? selectedIds.filter((id) => id !== table._id)
      : [...selectedIds, table._id];
    onChange(buildSelection(tables, nextIds));
  };

  const clear = () => onChange(buildSelection(tables, []));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
            Mesas / taburetes
          </p>
          <p className="text-xs text-stone-500">
            Elige una o varias hasta cubrir {need} pers. Vacío = auto al guardar.
          </p>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            selectedIds.length === 0
              ? 'bg-stone-100 text-stone-600'
              : enough
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-amber-50 text-amber-800'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          {selectedIds.length === 0
            ? 'Auto'
            : `${covered} / ${need} pers.`}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-200 px-3 py-4 text-center text-sm text-stone-500">
          No hay puestos en el mapa
        </p>
      ) : (
        <div className="max-h-56 space-y-3 overflow-y-auto pr-0.5">
          {groups.map(([zone, zoneTables]) => {
            const zonePreferred =
              preferredZone &&
              zone.toLowerCase().includes(String(preferredZone).toLowerCase());
            return (
              <div key={zone}>
                <p
                  className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${
                    zonePreferred ? 'text-[var(--v-blue,#2563eb)]' : 'text-stone-400'
                  }`}
                >
                  {zone}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {zoneTables.map((table) => {
                    const selected = selectedIds.includes(table._id);
                    const pickable = isDiningTablePickable(table.status);
                    const disabled = !pickable && !selected;
                    return (
                      <button
                        key={table._id}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggle(table)}
                        className={`relative min-h-[64px] rounded-xl border-2 px-2 py-2 text-left transition-colors touch-manipulation disabled:opacity-40 ${
                          selected
                            ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 dark:bg-blue-950/30'
                            : 'border-stone-200 bg-white hover:border-stone-300 dark:border-stone-700 dark:bg-stone-950'
                        }`}
                      >
                        {selected ? (
                          <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--v-blue,#2563eb)] text-white">
                            <Check className="h-2.5 w-2.5" strokeWidth={3} />
                          </span>
                        ) : null}
                        <span className="block text-lg font-black tabular-nums text-stone-900 dark:text-stone-50">
                          {table.number}
                        </span>
                        <span className="block truncate text-[10px] font-medium text-stone-500">
                          {diningTableDisplayName(table)}
                        </span>
                        <span className="block text-[10px] text-stone-400">
                          {Number(table.capacity) || 0} pax
                          {table.status === 'reserved' ? ' · reserv.' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedIds.length > 0 ? (
        <button
          type="button"
          onClick={clear}
          className="text-xs font-semibold text-stone-500 underline-offset-2 hover:underline"
        >
          Quitar selección (auto al guardar)
        </button>
      ) : null}

      {selectedIds.length > 0 && !enough ? (
        <p className="text-xs font-medium text-amber-700">
          Faltan {need - covered} plazas: añade otra mesa o taburete.
        </p>
      ) : null}
    </div>
  );
}
