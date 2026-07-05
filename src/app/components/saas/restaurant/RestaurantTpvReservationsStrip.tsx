import { useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { reservationMinutesUntil } from '../../../lib/restaurantFloorReservations';
import { STATUS_CFG, type RestaurantReservation } from '../../../lib/restaurantReservationTypes';

type Props = {
  reservations: RestaurantReservation[];
  seatingId?: string | null;
  onSeat: (reservation: RestaurantReservation) => void;
  compact?: boolean;
};

function urgencyClass(minutes: number): string {
  if (minutes <= 0) return 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30';
  if (minutes <= 15) return 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30';
  return 'border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900';
}

export function RestaurantTpvReservationsStrip({
  reservations,
  seatingId = null,
  onSeat,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(true);

  const dueCount = useMemo(
    () => reservations.filter((r) => reservationMinutesUntil(r) <= 15).length,
    [reservations],
  );

  if (reservations.length === 0) return null;

  return (
    <div className="shrink-0 border-b border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-900/80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 text-left touch-manipulation ${
          compact ? 'px-2 py-2' : 'px-3 py-2.5'
        }`}
      >
        <CalendarClock className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
            Reservas hoy
            <span className="ml-1.5 font-normal text-stone-500">({reservations.length})</span>
          </p>
          {dueCount > 0 ? (
            <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">
              {dueCount} para sentar pronto
            </p>
          ) : (
            <p className="text-[11px] text-stone-500">Próximas reservas del turno</p>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-stone-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-stone-400" />
        )}
      </button>

      {open ? (
        <div className={`max-h-44 space-y-1.5 overflow-y-auto overscroll-contain ${compact ? 'px-2 pb-2' : 'px-3 pb-3'}`}>
          {reservations.map((reservation) => {
            const minutes = reservationMinutesUntil(reservation);
            const statusCfg = STATUS_CFG[reservation.status];
            const time = reservation.time?.slice(0, 5) || '--:--';
            const mesa = reservation.tableNumber
              ? `Mesa ${reservation.tableNumber}`
              : reservation.preferredZone || 'Sin mesa';
            const canSeat = Boolean(reservation.tableId) && reservation.status !== 'seated';
            const seating = seatingId === reservation._id;

            return (
              <div
                key={reservation._id}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${urgencyClass(minutes)}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-bold tabular-nums text-stone-900 dark:text-stone-50">
                      {time}
                    </span>
                    <span className="truncate text-sm font-semibold text-stone-800 dark:text-stone-100">
                      {reservation.guestName || 'Cliente'}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${statusCfg.bg} ${statusCfg.text}`}
                    >
                      {statusCfg.label}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-stone-500 dark:text-stone-400">
                    {mesa}
                    <Users className="mx-1 inline h-3 w-3 -mt-px" />
                    {reservation.partySize || '2'} pers.
                    {minutes <= 0 ? (
                      <span className="ml-1 font-semibold text-rose-600 dark:text-rose-400">
                        · Ahora
                      </span>
                    ) : minutes <= 15 ? (
                      <span className="ml-1 text-amber-700 dark:text-amber-400">
                        · en {minutes} min
                      </span>
                    ) : null}
                  </p>
                </div>
                {canSeat ? (
                  <button
                    type="button"
                    disabled={seating}
                    onClick={() => onSeat(reservation)}
                    className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                  >
                    {seating ? '…' : 'Sentar'}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
