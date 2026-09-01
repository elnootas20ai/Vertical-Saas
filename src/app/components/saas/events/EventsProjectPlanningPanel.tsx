import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { listUsersRequest } from '../../../lib/authApi';
import { parseQuoteLines, saveEventPlanningChecklist } from '../../../lib/eventsFlow';
import {
  isEventPlanningReady,
  parsePlanningChecklist,
  type EventPlanningChecklist,
  type EventPlanningWorker,
  type EventRecord,
} from '../../../lib/eventsTypes';
import { formatMoneyEs } from '../../../lib/formatNumberEs';
import { mergeBusinessMembers } from '../../../lib/schedulesDisplay';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY, VERTIAL_SURFACE } from '../../../lib/vertialUiTokens';
import { useBusiness } from '../../../context/BusinessContext';
import { useAuth } from '../../../context/AuthContext';
import { Check, CheckCircle2, Loader2, MapPin, Plus, Sparkles, Users } from 'lucide-react';

type Props = {
  event: EventRecord;
  userId: string;
  businessId?: string;
  loading?: boolean;
  canEdit?: boolean;
  onEventUpdated: (event: EventRecord) => void;
  onMarkReady?: () => void;
};

function OkToggle({
  ok,
  disabled,
  onClick,
  label,
}: {
  ok: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ${
        ok
          ? 'bg-emerald-500 text-white'
          : 'border border-stone-200 bg-white text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300'
      } disabled:opacity-50`}
    >
      {ok ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
      {label}
    </button>
  );
}

export function EventsProjectPlanningPanel({
  event,
  userId,
  businessId,
  loading = false,
  canEdit = true,
  onEventUpdated,
  onMarkReady,
}: Props) {
  const { currentBusiness } = useBusiness();
  const { user } = useAuth();
  const lines = useMemo(() => parseQuoteLines(event.lineasPresupuesto), [event.lineasPresupuesto]);
  const checklist = useMemo(
    () => parsePlanningChecklist(event.planningChecklist),
    [event.planningChecklist],
  );
  const ready = isEventPlanningReady(event, lines);
  const [saving, setSaving] = useState(false);
  const [team, setTeam] = useState<Array<{ id: string; name: string }>>([]);
  const [extraName, setExtraName] = useState('');

  useEffect(() => {
    if (!businessId) return;
    void listUsersRequest(businessId)
      .then((res) => {
        const users = Array.isArray(res.users) ? res.users : [];
        const apiMembers = users.map((u) => ({
          user_id: String(u.user_id || u.id || '').trim(),
          fullName: String(u.fullName || `${u.firstName || ''} ${u.lastName || ''}`).trim() || String(u.email || ''),
          email: String(u.email || ''),
          role: String(u.role || 'Usuario'),
        })).filter((u) => u.user_id);
        const ownerId = String(currentBusiness?.owner_user_id || '').trim();
        const businessMembers = [...(currentBusiness?.members || [])];
        if (
          ownerId
          && !businessMembers.some((m) => String(m.user_id || '').trim() === ownerId)
        ) {
          const ownerFromApi = apiMembers.find((m) => m.user_id === ownerId);
          const self = user && String(user.user_id || '').trim() === ownerId ? user : null;
          businessMembers.push({
            user_id: ownerId,
            fullName: ownerFromApi?.fullName
              || String(self?.fullName || `${self?.firstName || ''} ${self?.lastName || ''}`).trim()
              || ownerFromApi?.email
              || String(self?.email || '')
              || 'Titular',
            email: ownerFromApi?.email || String(self?.email || ''),
            role: 'Admin',
            branch_id: null,
            permissions: {},
            joinedAt: '',
          });
        }
        const merged = mergeBusinessMembers(businessMembers, apiMembers);
        setTeam(merged.map((m) => ({ id: m.user_id, name: m.fullName })));
      })
      .catch(() => {
        const members = currentBusiness?.members || [];
        setTeam(
          members
            .map((m) => ({
              id: String(m.user_id || '').trim(),
              name: String(m.fullName || m.email || '').trim(),
            }))
            .filter((m) => m.id && m.name),
        );
      });
  }, [businessId, currentBusiness?.members, currentBusiness?.owner_user_id, user]);

  const persist = useCallback(async (next: EventPlanningChecklist) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const updated = await saveEventPlanningChecklist(userId, event, next);
      onEventUpdated(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la planificación');
    } finally {
      setSaving(false);
    }
  }, [canEdit, event, onEventUpdated, userId]);

  const toggleVenue = () => {
    if (!String(event.lugar || '').trim()) {
      toast.error('Indica el lugar del evento en Resumen');
      return;
    }
    void persist({ ...checklist, venueOk: !checklist.venueOk });
  };

  const toggleDate = () => {
    if (!String(event.fecha || '').trim()) {
      toast.error('Indica la fecha del evento en Resumen');
      return;
    }
    void persist({ ...checklist, dateOk: !checklist.dateOk });
  };

  const toggleService = (lineId: string) => {
    const has = checklist.servicesOk.includes(lineId);
    const servicesOk = has
      ? checklist.servicesOk.filter((id) => id !== lineId)
      : [...checklist.servicesOk, lineId];
    void persist({ ...checklist, servicesOk });
  };

  const upsertWorker = (worker: EventPlanningWorker) => {
    const rest = checklist.workers.filter((w) => w.id !== worker.id);
    void persist({ ...checklist, workers: [...rest, worker] });
  };

  const toggleWorkerOk = (worker: { id: string; name: string }) => {
    const current = checklist.workers.find((w) => w.id === worker.id);
    upsertWorker({ id: worker.id, name: worker.name, ok: !current?.ok });
  };

  const addExtraWorker = () => {
    const name = extraName.trim();
    if (!name) {
      toast.error('Escribe el nombre del trabajador');
      return;
    }
    const id = `ext-${name.toLowerCase().replace(/\s+/g, '-')}`;
    if (checklist.workers.some((w) => w.id === id || w.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Ese trabajador ya está en la lista');
      return;
    }
    setExtraName('');
    void persist({
      ...checklist,
      workers: [...checklist.workers, { id, name, ok: true }],
    });
  };

  const servicesOkCount = lines.filter((line) => checklist.servicesOk.includes(line.id)).length;
  const workersOkCount = checklist.workers.filter((w) => w.ok).length;
  const teamToShow = team.length > 0
    ? team
    : checklist.workers.map((w) => ({ id: w.id, name: w.name }));

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${VERTIAL_SURFACE} p-4 sm:p-5 flex flex-wrap items-start justify-between gap-3`}>
        <div>
          <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">Planificación</p>
          <p className="mt-0.5 text-sm text-stone-500">
            Confirma que servicios, equipo, lugar y fecha están listos para el día del evento.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            ready
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
          }`}
        >
          {ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
          {ready ? 'Listo' : 'Pendiente'}
        </span>
      </div>

      <section className={`${VERTIAL_SURFACE} p-4 sm:p-5 space-y-3`}>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-stone-400" />
          <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Lugar y fecha</h3>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-100 px-3 py-2.5 dark:border-stone-800">
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-800 dark:text-stone-200">{event.lugar || 'Sin lugar'}</p>
            <p className="text-xs text-stone-500">Lugar</p>
          </div>
          <OkToggle ok={checklist.venueOk} disabled={!canEdit || saving} onClick={toggleVenue} label={checklist.venueOk ? 'OK' : 'Marcar OK'} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-100 px-3 py-2.5 dark:border-stone-800">
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-800 dark:text-stone-200">
              {event.fecha ? new Date(event.fecha).toLocaleDateString('es-ES') : 'Sin fecha'}
            </p>
            <p className="text-xs text-stone-500">Fecha</p>
          </div>
          <OkToggle ok={checklist.dateOk} disabled={!canEdit || saving} onClick={toggleDate} label={checklist.dateOk ? 'OK' : 'Marcar OK'} />
        </div>
      </section>

      <section className={`${VERTIAL_SURFACE} p-4 sm:p-5 space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-stone-400" />
            <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Servicios</h3>
          </div>
          <span className="text-xs text-stone-500">{servicesOkCount}/{lines.length} OK</span>
        </div>
        {lines.length === 0 ? (
          <p className="text-sm text-stone-500">Aún no hay partidas en el presupuesto. Añádelas en Resumen.</p>
        ) : (
          <ul className="space-y-2">
            {lines.map((line) => {
              const ok = checklist.servicesOk.includes(line.id);
              return (
                <li
                  key={line.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-100 px-3 py-2.5 dark:border-stone-800"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-800 dark:text-stone-200">{line.concepto || 'Servicio'}</p>
                    <p className="text-xs text-stone-500 tabular-nums">{formatMoneyEs(line.total)}</p>
                  </div>
                  <OkToggle
                    ok={ok}
                    disabled={!canEdit || saving}
                    onClick={() => toggleService(line.id)}
                    label={ok ? 'OK' : 'Marcar OK'}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={`${VERTIAL_SURFACE} p-4 sm:p-5 space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-stone-400" />
            <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Trabajadores</h3>
          </div>
          <span className="text-xs text-stone-500">{workersOkCount} OK</span>
        </div>
        {teamToShow.length === 0 ? (
          <p className="text-sm text-stone-500">Añade quién va a trabajar este evento.</p>
        ) : (
          <ul className="space-y-2">
            {teamToShow.map((person) => {
              const ok = Boolean(checklist.workers.find((w) => w.id === person.id)?.ok);
              return (
                <li
                  key={person.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-100 px-3 py-2.5 dark:border-stone-800"
                >
                  <p className="text-sm font-medium text-stone-800 dark:text-stone-200">{person.name}</p>
                  <OkToggle
                    ok={ok}
                    disabled={!canEdit || saving}
                    onClick={() => toggleWorkerOk(person)}
                    label={ok ? 'OK' : 'Marcar OK'}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <input
              value={extraName}
              onChange={(e) => setExtraName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addExtraWorker();
                }
              }}
              placeholder="Nombre (si no está en el equipo)"
              className="min-h-11 min-w-[12rem] flex-1 rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none focus:border-blue-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
            />
            <button type="button" disabled={saving} onClick={addExtraWorker} className={VERTIAL_BTN_SECONDARY}>
              <Plus className="h-4 w-4" />
              Añadir
            </button>
          </div>
        )}
      </section>

      {onMarkReady && (
        <button
          type="button"
          disabled={!ready || saving}
          onClick={onMarkReady}
          className={`${VERTIAL_BTN_PRIMARY} w-full`}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Listo para el día del evento
        </button>
      )}
    </div>
  );
}
