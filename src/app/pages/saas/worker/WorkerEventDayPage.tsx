/**
 * Vista trabajador: su parte del Día D (hora, rol, check, brief, fases, TPV).
 * Sin permiso sales — solo lectura operativa + marcar “ya estoy”.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import {
  loadEventById,
  resolveEventsUserId,
  saveEventDayOps,
} from '../../../lib/eventsFlow';
import {
  CARGO_STATUS_LABEL,
  DAY_PHASE_META,
  currentPhaseId,
  ensureEventDayOps,
  findDayOpsCrewMember,
  hydrateDayOpsFromEvent,
  type EventDayOps,
} from '../../../lib/eventsDayOps';
import type { EventRecord } from '../../../lib/eventsTypes';
import { formatDateEs } from '../../../lib/formatDateEs';
import { AUTH_PATHS } from '../../../lib/authEntryPaths';
import {
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_SURFACE,
} from '../../../lib/vertialUiTokens';
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Loader2,
  MapPin,
  Monitor,
  Package,
  Truck,
  Users,
} from 'lucide-react';

export function WorkerEventDayPage() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const dataUserId = useMemo(
    () => resolveEventsUserId(user, currentBusiness),
    [user, currentBusiness],
  );
  const workerId = String(user?.user_id || user?.id || '').trim();
  const workerName = String(user?.fullName || user?.firstName || '').trim();

  const [event, setEvent] = useState<EventRecord | null>(null);
  const [ops, setOps] = useState<EventDayOps | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!dataUserId || !eventId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let loaded = await loadEventById(dataUserId, eventId);
      if (!loaded) {
        setEvent(null);
        setOps(null);
        return;
      }
      if (!String(loaded.dayOps || '').trim()) {
        try {
          loaded = await ensureEventDayOps(dataUserId, loaded);
        } catch {
          /* hidratar en memoria */
        }
      }
      setEvent(loaded);
      setOps(hydrateDayOpsFromEvent(loaded));
    } catch {
      toast.error('No se pudo cargar el Día D');
      setEvent(null);
      setOps(null);
    } finally {
      setLoading(false);
    }
  }, [dataUserId, eventId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const me = useMemo(() => {
    if (!ops) return null;
    return findDayOpsCrewMember(ops, { workerId, workerName });
  }, [ops, workerId, workerName]);

  const phaseId = ops ? currentPhaseId(ops) : null;
  const phaseMeta = DAY_PHASE_META.find((p) => p.id === phaseId);
  const tpvCode = String(event?.portableTerminalCode || '').trim().toUpperCase();

  const toggleCheckIn = async () => {
    if (!dataUserId || !event || !ops || !me) return;
    setSaving(true);
    try {
      const nextCrew = ops.crew.map((c) =>
        c.id === me.id ? { ...c, checkedIn: !c.checkedIn } : c,
      );
      const nextOps: EventDayOps = { ...ops, crew: nextCrew };
      const updated = await saveEventDayOps(dataUserId, event, nextOps);
      setEvent(updated);
      setOps(hydrateDayOpsFromEvent(updated));
      toast.success(me.checkedIn ? 'Marcado como pendiente' : 'Ya estás — registrado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const copyTpv = async () => {
    if (!tpvCode) return;
    try {
      await navigator.clipboard.writeText(tpvCode);
      toast.success('Código TPV copiado');
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  if (loading) {
    return (
      <Layout title="Mi Día D" subtitle="Tu parte del evento">
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
        </div>
      </Layout>
    );
  }

  if (!event || !ops) {
    return (
      <Layout title="Mi Día D" subtitle="Tu parte del evento">
        <div className={`${VERTIAL_SURFACE} max-w-lg mx-auto p-6 text-center space-y-3`}>
          <p className="text-sm text-stone-500">No se encontró este evento.</p>
          <Link to="/saas/worker/events" className={VERTIAL_BTN_SECONDARY}>
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
        </div>
      </Layout>
    );
  }

  const day = String(event.fecha || '').slice(0, 10);

  return (
    <Layout title="Mi Día D" subtitle={event.nombre}>
      <div className="max-w-lg mx-auto space-y-4 pb-10">
        <button
          type="button"
          onClick={() => navigate('/saas/worker/events')}
          className={`${VERTIAL_BTN_SECONDARY} text-sm`}
        >
          <ArrowLeft className="w-4 h-4" />
          Operaciones
        </button>

        <section className={`${VERTIAL_SURFACE} p-4 space-y-2`}>
          <h1 className="text-lg font-bold text-stone-900 dark:text-stone-100">{event.nombre}</h1>
          <p className="text-sm text-stone-500 flex flex-wrap gap-x-2 gap-y-1">
            {day && <span className="font-semibold text-stone-700 dark:text-stone-300">{formatDateEs(day)}</span>}
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {event.lugar || 'Sin lugar'}
            </span>
          </p>
          {phaseMeta && (
            <p className="text-sm font-semibold text-[#2563EB]">
              Ahora: {phaseMeta.label}
              <span className="font-normal text-stone-500"> — {phaseMeta.hint}</span>
            </p>
          )}
        </section>

        {/* Su parte */}
        <section className={`${VERTIAL_SURFACE} p-4 space-y-3`}>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#2563EB]" />
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Tu parte</h2>
          </div>
          {!me ? (
            <p className="text-sm text-stone-500">
              Aún no estás en el equipo de este Día D. Pide que te asignen en planificación o en la ruta.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] text-stone-500">Rol</p>
                  <p className="font-semibold text-stone-900 dark:text-stone-100">{me.role}</p>
                </div>
                <div>
                  <p className="text-[11px] text-stone-500">Hora</p>
                  <p className="font-semibold tabular-nums text-stone-900 dark:text-stone-100 inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {me.arriveTime || '—'}
                  </p>
                </div>
              </div>
              {me.isDriver && (
                <p className="text-xs font-bold uppercase tracking-wide text-[#2563EB]">Eres el conductor</p>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={() => void toggleCheckIn()}
                className={[
                  'w-full min-h-14 rounded-2xl border flex items-center justify-center gap-2 text-base font-semibold transition-colors',
                  me.checkedIn
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-[#2563EB] bg-[#2563EB] text-white',
                ].join(' ')}
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" strokeWidth={2.5} />}
                {me.checkedIn ? 'Ya estás (tocar para deshacer)' : 'Marcar: ya estoy'}
              </button>
            </>
          )}
        </section>

        {/* Timeline compacto */}
        <section className={`${VERTIAL_SURFACE} p-4 space-y-2`}>
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Fases del día</h2>
          <ol className="space-y-1.5">
            {ops.phases.map((p) => {
              const meta = DAY_PHASE_META.find((m) => m.id === p.id);
              return (
                <li
                  key={p.id}
                  className={[
                    'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm min-h-11',
                    p.done
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
                      : p.id === phaseId
                        ? 'bg-blue-50 text-[#2563EB] dark:bg-blue-950/30'
                        : 'bg-stone-50 text-stone-600 dark:bg-stone-900 dark:text-stone-300',
                  ].join(' ')}
                >
                  <span className="w-16 tabular-nums text-xs font-semibold shrink-0">
                    {p.plannedTime || '—:—'}
                  </span>
                  <span className="flex-1 font-medium">{meta?.label}</span>
                  {p.done ? <Check className="w-4 h-4 shrink-0" /> : null}
                </li>
              );
            })}
          </ol>
        </section>

        {/* Transporte si conductor o hay datos */}
        {(me?.isDriver || ops.transport.vehicleLabel || ops.transport.plate) && (
          <section className={`${VERTIAL_SURFACE} p-4 space-y-2`}>
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#2563EB]" />
              <h2 className="text-sm font-semibold">Quién lleva</h2>
            </div>
            <p className="text-sm text-stone-700 dark:text-stone-200">
              {ops.transport.vehicleLabel || 'Vehículo'}
              {ops.transport.plate ? ` · ${ops.transport.plate}` : ''}
            </p>
            {ops.transport.notes ? (
              <p className="text-xs text-stone-500 whitespace-pre-wrap">{ops.transport.notes}</p>
            ) : null}
          </section>
        )}

        {/* Carga resumen */}
        <section className={`${VERTIAL_SURFACE} p-4 space-y-2`}>
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-[#2563EB]" />
            <h2 className="text-sm font-semibold">Mercancía</h2>
          </div>
          {ops.cargo.length === 0 ? (
            <p className="text-xs text-stone-500">Sin carga listada aún.</p>
          ) : (
            <ul className="space-y-1.5">
              {ops.cargo.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 text-sm rounded-xl bg-stone-50 dark:bg-stone-900 px-3 py-2"
                >
                  <span className="truncate">
                    {c.name}
                    <span className="text-[10px] text-stone-400 ml-1">{CARGO_STATUS_LABEL[c.status]}</span>
                  </span>
                  <span className="tabular-nums font-semibold shrink-0">× {c.qty}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {ops.brief ? (
          <section className={`${VERTIAL_SURFACE} p-4 space-y-2`}>
            <h2 className="text-sm font-semibold">Brief del día</h2>
            <p className="text-sm text-stone-700 dark:text-stone-200 whitespace-pre-wrap">{ops.brief}</p>
          </section>
        ) : null}

        {tpvCode ? (
          <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/25 space-y-2">
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4 text-[#2563EB]" />
              <h2 className="text-sm font-semibold">Código TPV</h2>
            </div>
            <p className="text-2xl font-bold tracking-[0.2em] tabular-nums text-[#2563EB]">{tpvCode}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void copyTpv()} className={VERTIAL_BTN_SECONDARY}>
                <Copy className="w-3.5 h-3.5" />
                Copiar
              </button>
              <button
                type="button"
                className={VERTIAL_BTN_PRIMARY}
                onClick={() =>
                  window.open(
                    `${AUTH_PATHS.tpvTabletLogin}?code=${encodeURIComponent(tpvCode)}`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
              >
                Abrir login
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </Layout>
  );
}
