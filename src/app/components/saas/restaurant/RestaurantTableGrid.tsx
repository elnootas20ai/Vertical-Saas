import { Coffee, Users } from 'lucide-react';
import type { ExtendedDiningTable } from '../../../lib/salaStudioTypes';
import type { RestaurantTableLiveInfo } from '../../../lib/restaurantTableDisplay';
import { formatOccupiedTime, formatTableMoney } from '../../../lib/restaurantTableDisplay';
import {
  isTableActive,
  tableSecondaryLine,
  tableStatusAccentColor,
  tableTileSurfaceClass,
} from './restaurantTableTileUi';

export const RESTAURANT_COUNTER_TABLE_ID = 'tpv-restaurant-counter';

type Props = {
  tables: ExtendedDiningTable[];
  liveByTableId?: Map<string, RestaurantTableLiveInfo>;
  onSelectTable: (table: ExtendedDiningTable) => void;
  onSelectCounter: () => void;
  selectedTableId?: string | null;
  compact?: boolean;
  readOnly?: boolean;
};

export function RestaurantTableGrid({
  tables,
  liveByTableId,
  onSelectTable,
  onSelectCounter,
  selectedTableId,
  compact = false,
  readOnly = false,
}: Props) {
  const gridClass = compact
    ? 'grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6'
    : 'grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6';

  return (
    <div className={gridClass}>
      <button
        type="button"
        disabled={readOnly}
        onClick={onSelectCounter}
        className={`relative flex min-h-[72px] min-w-[72px] flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-2 py-2 transition-all touch-manipulation ${
          readOnly
            ? 'cursor-default opacity-90'
            : 'active:scale-[0.98] hover:border-amber-400 hover:bg-amber-50/50 dark:hover:border-amber-500/50 dark:hover:bg-amber-950/20'
        } dark:border-stone-600 dark:bg-stone-900/40`}
      >
        <Coffee className="h-5 w-5 text-stone-600 dark:text-stone-300" />
        <span className="text-xs font-bold text-stone-800 dark:text-stone-100">Mostrador</span>
        <span className="text-[10px] text-stone-500">Barra</span>
      </button>

      {tables.map((table) => {
        const live = liveByTableId?.get(table._id);
        const visualStatus = live?.visualStatus ?? table.status;
        const selected = selectedTableId === table._id;
        const disabled = visualStatus === 'unavailable';
        const hasAccount = Boolean(live?.hasOpenAccount);
        const active = isTableActive(visualStatus, hasAccount);
        const accent = tableStatusAccentColor(visualStatus, hasAccount);
        const elapsed = formatOccupiedTime(live?.occupiedMinutes ?? null);
        const guests = table.currentGuests > 0 ? table.currentGuests : 0;

        return (
          <button
            key={table._id}
            type="button"
            disabled={disabled || readOnly}
            onClick={() => !readOnly && onSelectTable(table)}
            aria-label={`Mesa ${table.number}, ${tableSecondaryLine(table, live, visualStatus)}`}
            className={`${tableTileSurfaceClass(visualStatus, { selected, hasAccount, disabled: disabled || readOnly })} px-2.5 py-2 ${
              readOnly ? 'cursor-default' : ''
            }`}
          >
            {accent ? (
              <span
                className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                style={{ backgroundColor: accent }}
                aria-hidden
              />
            ) : null}

            <div className="flex w-full items-start justify-between gap-1 pl-0.5">
              <span
                className={`font-black tabular-nums leading-none text-stone-900 dark:text-stone-50 ${
                  compact ? 'text-2xl' : 'text-3xl'
                }`}
              >
                {table.number}
              </span>
              {active && hasAccount ? (
                <span className="shrink-0 rounded-md bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
                  {formatTableMoney(live!.openTotal)}
                </span>
              ) : null}
            </div>

            <p className="mt-1 w-full truncate pl-0.5 text-left text-[11px] text-stone-500 dark:text-stone-400">
              <Users className="mr-0.5 inline h-3 w-3 -mt-px" />
              {tableSecondaryLine(table, live, visualStatus)}
            </p>

            {active ? (
              <p className="mt-0.5 w-full truncate pl-0.5 text-left text-[10px] font-medium text-stone-600 dark:text-stone-300">
                {hasAccount && live && live.openItemCount > 0 ? `${live.openItemCount} art.` : null}
                {hasAccount && live && live.openItemCount > 0 && elapsed ? ' · ' : null}
                {elapsed ? elapsed : null}
                {!elapsed && guests > 0 ? `${guests} comensales` : null}
                {visualStatus === 'reserved' && live?.reservationGuest ? (
                  <>
                    {live.reservationTime ? `${live.reservationTime.slice(0, 5)} · ` : ''}
                    {live.reservationGuest}
                  </>
                ) : null}
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
