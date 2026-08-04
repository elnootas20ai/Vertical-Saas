import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import {
  Ban,
  Clock,
  MapPin,
  Send,
  Umbrella,
  Users,
  X,
} from 'lucide-react';
import { useModalClose } from '../../../hooks/useModalClose';
import { formatDateEs } from '../../../lib/formatDateEs';
import type { DayRosterRow } from '../../../lib/teamCalendarDayModel';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../../lib/vertialUiTokens';

type MyStatus = 'available' | 'taken_approved' | 'taken_pending' | 'taken_rejected' | 'blocked' | 'off';

type Props = {
  iso: string;
  storeLabel?: string;
  working: DayRosterRow[];
  away: DayRosterRow[];
  off: DayRosterRow[];
  myStatus: MyStatus;
  myStatusText: string;
  onClose: () => void;
  onRequestDay: () => void;
};

function Row({ row }: { row: DayRosterRow }) {
  return (
    <li className="flex items-center gap-3 px-1 py-2.5">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{ backgroundColor: row.colorHex }}
      >
        {row.fullName.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
          {row.isMe ? 'Tú' : row.fullName}
          {row.isMe ? (
            <span className="font-normal text-stone-400"> · {row.fullName}</span>
          ) : null}
        </p>
        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-stone-500">
          {row.storeLabel ? (
            <>
              <MapPin className="h-3 w-3 shrink-0" />
              {row.storeLabel}
              <span className="text-stone-300">·</span>
            </>
          ) : null}
          {row.detail}
        </p>
      </div>
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-white"
        style={{ backgroundColor: row.colorHex }}
      >
        {row.kind === 'work' ? <Clock className="h-3 w-3" /> : null}
        {row.kind === 'leave_approved' || row.kind === 'leave_pending' ? (
          <Umbrella className="h-3 w-3" />
        ) : null}
        {row.label}
      </span>
    </li>
  );
}

function Section({
  title,
  count,
  children,
  empty,
}: {
  title: string;
  count: number;
  children: ReactNode;
  empty?: string;
}) {
  return (
    <div className="border-t border-stone-100 dark:border-stone-800">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
          {title}
        </h4>
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="px-4 pb-3 text-xs text-stone-400">{empty || 'Nadie'}</p>
      ) : (
        <ul className="divide-y divide-stone-50 px-3 pb-2 dark:divide-stone-800/60">{children}</ul>
      )}
    </div>
  );
}

/** Popup al clicar un día: quién va, ausencias y pedir día. */
export function TeamCalendarDayPopup({
  iso,
  storeLabel,
  working,
  away,
  off,
  myStatus,
  myStatusText,
  onClose,
  onRequestDay,
}: Props) {
  useModalClose(true, onClose);

  const canRequestFresh = myStatus === 'available' || myStatus === 'off';

  const statusCls =
    canRequestFresh
      ? 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100'
      : myStatus === 'taken_approved'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100'
        : myStatus === 'taken_pending'
          ? 'border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100'
          : myStatus === 'taken_rejected'
            ? 'border-rose-200 bg-rose-50/80 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200'
          : myStatus === 'blocked'
            ? 'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100'
            : 'border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-[81] flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-stone-200 bg-white shadow-xl sm:max-w-lg sm:rounded-2xl dark:border-stone-700 dark:bg-stone-900"
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-4 py-3 dark:border-stone-800">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40">
              <Users className="h-5 w-5 text-[#2563EB]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">
                {formatDateEs(iso)}
              </h3>
              <p className="mt-0.5 text-xs text-stone-500">
                {working.length} trabajando
                {away.length ? ` · ${away.length} ausente${away.length === 1 ? '' : 's'}` : ''}
                {storeLabel ? ` · ${storeLabel}` : ''}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={VERTIAL_BTN_SECONDARY} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-3">
          <div className={`rounded-xl border px-3 py-2.5 text-xs ${statusCls}`}>
            {myStatus === 'blocked' ? (
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <Ban className="h-3.5 w-3.5" /> Tu estado
              </span>
            ) : (
              <span className="font-semibold">Tu estado · </span>
            )}
            {myStatusText}
          </div>

          <button type="button" onClick={onRequestDay} className={`${VERTIAL_BTN_PRIMARY} w-full`}>
            <Send className="h-4 w-4" />
            {canRequestFresh ? 'Pedir este día' : 'Pedir otro permiso este día'}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="Quién trabaja" count={working.length} empty="Nadie con turno este día">
            {working.map((row) => (
              <Row key={`w-${row.memberId}`} row={row} />
            ))}
          </Section>
          <Section title="Ausencias" count={away.length} empty="Sin ausencias">
            {away.map((row) => (
              <Row key={`a-${row.memberId}`} row={row} />
            ))}
          </Section>
          {off.length > 0 ? (
            <Section title="Libre / sin turno" count={off.length}>
              {off.map((row) => (
                <Row key={`o-${row.memberId}`} row={row} />
              ))}
            </Section>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
