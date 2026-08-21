/**
 * Registro de actividad en la ficha individual del evento.
 * Patrón: actividad reciente Vertial (lista + filtro Todos/Hoy).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Info,
  AlertTriangle,
  CircleDot,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { listNotificationsRequest, type NotificationRecord } from '../../../lib/notificationApi';
import {
  isActivityToday,
  mergeEventActivity,
  type EventActivityEntry,
  type EventActivityTone,
} from '../../../lib/eventsActivityRegistry';
import { formatDateTimeEs } from '../../../lib/formatDateEs';
import type { EventRecord } from '../../../lib/eventsTypes';
import { VERTIAL_SURFACE } from '../../../lib/vertialUiTokens';

type Scope = 'todos' | 'hoy';

function toneIcon(tone: EventActivityTone) {
  if (tone === 'success') return CheckCircle2;
  if (tone === 'warning') return AlertTriangle;
  if (tone === 'info') return Info;
  return CircleDot;
}

function toneClass(tone: EventActivityTone): string {
  if (tone === 'success') return 'text-emerald-600 dark:text-emerald-400';
  if (tone === 'warning') return 'text-amber-600 dark:text-amber-400';
  if (tone === 'info') return 'text-[#2563EB]';
  return 'text-stone-400';
}

export function EventsProjectActivityPanel({
  event,
}: {
  event: EventRecord;
}) {
  const { user } = useAuth();
  const [scope, setScope] = useState<Scope>('todos');
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  useEffect(() => {
    const uid = String(user?.user_id || user?.id || '').trim();
    if (!uid) {
      setNotifications([]);
      return;
    }
    let cancelled = false;
    void listNotificationsRequest(uid)
      .then((res) => {
        if (cancelled) return;
        setNotifications(Array.isArray(res.notifications) ? res.notifications : []);
      })
      .catch(() => {
        if (!cancelled) setNotifications([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.user_id, user?.id, event._id, event.updatedAt]);

  const allEntries = useMemo(
    () => mergeEventActivity(event, notifications),
    [event, notifications],
  );

  const entries = useMemo(
    () => (scope === 'hoy' ? allEntries.filter((e) => isActivityToday(e.at)) : allEntries),
    [allEntries, scope],
  );

  return (
    <section className={`${VERTIAL_SURFACE} p-5 space-y-4`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
            Actividad reciente
          </h2>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
            Envíos, aceptación, cobros, fases y avisos de este evento.
          </p>
        </div>
        <div className="flex rounded-xl border border-stone-200 p-0.5 bg-stone-50 dark:border-stone-700 dark:bg-stone-900/50">
          <button
            type="button"
            onClick={() => setScope('todos')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              scope === 'todos'
                ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-white'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setScope('hoy')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              scope === 'hoy'
                ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-800 dark:text-white'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
            }`}
          >
            Hoy
          </button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-4 dark:border-stone-800 dark:bg-stone-900/40">
          <Clock className="w-4 h-4 shrink-0 text-stone-400 mt-0.5" />
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {scope === 'hoy'
              ? 'Sin actividad hoy en este evento.'
              : 'Aún no hay movimientos registrados en esta contratación.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {entries.map((item: EventActivityEntry) => {
            const Icon = toneIcon(item.tone);
            return (
              <li
                key={item.id}
                className="flex gap-3 rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-3 dark:border-stone-800 dark:bg-stone-900/40"
              >
                <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${toneClass(item.tone)}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-800 dark:text-stone-100">
                    {item.title}
                  </p>
                  {item.detail ? (
                    <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
                      {item.detail}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
                    {formatDateTimeEs(item.at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
