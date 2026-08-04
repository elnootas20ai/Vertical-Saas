import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  PauseCircle,
  Send,
  Umbrella,
  XCircle,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import {
  addDaysIsoLocal,
  getHrRequestType,
  listHrRequestTypesForWorker,
  todayIsoLocal,
  type LeaveType,
} from '../../../lib/hrRequestCatalog';
import {
  STATUS_LABELS,
  cancelVacationRequest,
  countVacationRequestDays,
  createVacationRequest,
  getMemberVacationBalance,
  getSettings,
  listVacations,
  validateVacationRequestPolicy,
  resolveVacationTenureGate,
  findOverlappingLeaveRequests,
  LEAVE_TYPE_LABELS,
  type VacationRequest,
  type VacationSettings,
} from '../../../lib/vacationsApi';
import { getMemberScheduleWeeklyHours } from '../../../lib/schedulesApi';
import { formatDateEs, formatDateRangeEs, formatDateTimeEs } from '../../../lib/formatDateEs';
import { formatNumberEs, formatQtyEs } from '../../../lib/formatNumberEs';
import { toast } from 'sonner';
import { WORKER_CARD, WORKER_PAGE } from '../../../lib/workerUi';
import { VERTIAL_BTN_PRIMARY } from '../../../lib/vertialUiTokens';

const STATUS_STYLE: Record<VacationRequest['status'], string> = {
  pending:
    'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800',
  approved:
    'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
  rejected:
    'bg-rose-50/80 text-rose-700 border-rose-200 dark:bg-rose-950/25 dark:text-rose-300 dark:border-rose-900',
  cancelled:
    'bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700',
};

const STATUS_ICON = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  cancelled: PauseCircle,
} as const;

type MobileTab = 'new' | 'mine';

/**
 * Solicitudes → RRHH.
 * Móvil: pestañas Pedir / Mis solicitudes (sin bucle de reload ni toast repetido).
 */
export function WorkerRequests() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const businessId = currentBusiness?.business_id || user?.linkedBusinessId || '';
  const memberId = String(user?.user_id || user?.id || '').trim();
  const memberName = user?.fullName || user?.email || '';
  const ownerUserId = useMemo(() => {
    const fromCurrent = String(currentBusiness?.owner_user_id || '').trim();
    if (fromCurrent) return fromCurrent;
    const bid = String(businessId || '')
      .replace(/^business:/, '')
      .trim();
    if (!bid) return '';
    const match = (businesses || []).find((b) => {
      const id = String(b.business_id || b.id || '')
        .replace(/^business:/, '')
        .trim();
      return id === bid;
    });
    return String(match?.owner_user_id || '').trim();
  }, [currentBusiness?.owner_user_id, businessId, businesses]);
  const statusLabels = STATUS_LABELS[i18n.language?.slice(0, 2) || 'es'] || STATUS_LABELS.es;
  const year = new Date().getFullYear();
  const typeOptions = useMemo(() => listHrRequestTypesForWorker(), []);

  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [settings, setSettings] = useState<VacationSettings | null>(null);
  const [scheduleWeeklyHours, setScheduleWeeklyHours] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [filter, setFilter] = useState<'all' | VacationRequest['status']>('all');
  const [mobileTab, setMobileTab] = useState<MobileTab>('new');
  const [justSentId, setJustSentId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);
  const listTopRef = useRef<HTMLElement | null>(null);

  const emptyForm = useCallback(
    () => ({
      startDate: '',
      endDate: '',
      leaveType: 'vacation' as LeaveType,
      notes: '',
    }),
    [],
  );

  const [form, setForm] = useState(emptyForm);

  const selectedType = useMemo(
    () => typeOptions.find((x) => x.id === form.leaveType) || typeOptions[0],
    [typeOptions, form.leaveType],
  );

  const minVacationStart = useMemo(() => {
    const notice = Number(settings?.minNoticeDays || 0);
    if (notice <= 0) return todayIsoLocal();
    return addDaysIsoLocal(todayIsoLocal(), notice);
  }, [settings?.minNoticeDays]);

  const vacationTenureBlock = useMemo(() => {
    const gate = resolveVacationTenureGate(settings, user?.employment?.startDate);
    return gate.ok ? null : gate.message;
  }, [
    settings?.minTenureMonthsForVacation,
    settings?.minTenureDaysForVacation,
    settings,
    user?.employment?.startDate,
  ]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!businessId || !memberId) {
      setLoading(false);
      return;
    }
    const silent = Boolean(opts?.silent) || hasLoadedRef.current;
    if (!silent) setLoading(true);
    try {
      const [vacs, sett, schedHours] = await Promise.all([
        listVacations(businessId, { memberId }),
        getSettings(businessId, { createIfMissing: false }),
        getMemberScheduleWeeklyHours(businessId, memberId).catch(() => null),
      ]);
      setRequests(vacs);
      setSettings(sett);
      setScheduleWeeklyHours(schedHours);
      hasLoadedRef.current = true;
    } catch {
      toast.error('No se pudieron cargar tus solicitudes', { id: 'worker-requests-load' });
    } finally {
      setLoading(false);
    }
  }, [businessId, memberId]);

  useEffect(() => {
    hasLoadedRef.current = false;
    void load();
  }, [load]);

  /** Prefill desde Calendario: /saas/worker/requests?start=&end= */
  const appliedCalendarQuery = useRef(false);
  useEffect(() => {
    if (appliedCalendarQuery.current) return;
    const start = String(searchParams.get('start') || '').trim();
    const end = String(searchParams.get('end') || '').trim();
    const typeRaw = String(searchParams.get('type') || '').trim();
    if (!start && !end && !typeRaw) return;
    appliedCalendarQuery.current = true;
    const leaveType = typeOptions.some((x) => x.id === typeRaw)
      ? (typeRaw as LeaveType)
      : undefined;
    setMobileTab('new');
    setForm((p) => ({
      ...p,
      startDate: start || p.startDate,
      endDate: end || start || p.endDate,
      ...(leaveType ? { leaveType } : {}),
    }));
  }, [searchParams, typeOptions]);

  const employmentStartDate = String(user?.employment?.startDate || '').trim();
  const hasManualVacationAllowance = Boolean(
    settings
      && memberId
      && settings.allowances?.[memberId] != null
      && Number.isFinite(Number(settings.allowances[memberId])),
  );
  const contractHours = Number(user?.employment?.hoursPerWeek);
  const contractWorkday = String(user?.employment?.workday || '').trim();
  const effectiveHours =
    (Number.isFinite(contractHours) && contractHours > 0 ? contractHours : null)
    ?? (scheduleWeeklyHours != null && scheduleWeeklyHours > 0 ? scheduleWeeklyHours : null);
  const hasContractHoursBasis = Boolean(
    effectiveHours != null
    || ['completa', 'media', 'parcial'].includes(contractWorkday.toLowerCase()),
  );
  const canShowVacationBalance = Boolean(
    hasManualVacationAllowance
    || (employmentStartDate && hasContractHoursBasis),
  );

  const balance = useMemo(() => {
    if (!canShowVacationBalance || !settings || !memberId) return null;
    return getMemberVacationBalance(settings, requests, memberId, {
      year,
      startDate: user?.employment?.startDate,
      endDate: user?.employment?.endDate,
      hoursPerWeek: effectiveHours ?? user?.employment?.hoursPerWeek,
      workday: user?.employment?.workday,
      scheduleWeeklyHours: scheduleWeeklyHours ?? undefined,
    });
  }, [
    canShowVacationBalance,
    settings,
    memberId,
    requests,
    year,
    user?.employment?.startDate,
    user?.employment?.endDate,
    user?.employment?.hoursPerWeek,
    user?.employment?.workday,
    effectiveHours,
    scheduleWeeklyHours,
  ]);

  const balanceLabel = useMemo(() => {
    if (!balance) return null;
    const pendingDays = Number(balance.pending || 0);
    const pendingHint =
      pendingDays > 0
        ? ` · ${formatQtyEs(pendingDays)} d en trámite`
        : '';
    const requestable = Number(balance.requestable ?? 0);
    const perMonth = Number(balance.daysPerMonth || settings?.daysPerMonth || 2.5);
    const completed = Number(balance.completedMonths || 0);
    const hoursTxt =
      effectiveHours != null
        ? `${formatQtyEs(effectiveHours)} h/sem · `
        : '';

    // Pedibles siempre = requestable (0 si antigüedad o sin meses completos).
    if (vacationTenureBlock) {
      return {
        value: '0',
        hint: `${hoursTxt}${vacationTenureBlock.replace(/^Vacaciones disponibles /i, '')}${pendingHint}`,
      };
    }

    const chargeHint =
      completed <= 0
        ? `se cargan +${formatQtyEs(perMonth)} d al cumplir 1 mes de alta`
        : `+${formatQtyEs(perMonth)} d/mes · ${completed} mes(es) cargados`;

    return {
      value: formatQtyEs(requestable),
      hint: `${hoursTxt}${chargeHint}${pendingHint}`,
    };
  }, [
    balance,
    effectiveHours,
    settings?.daysPerMonth,
    vacationTenureBlock,
  ]);

  const vacationCannotRequest = Boolean(
    form.leaveType === 'vacation'
    && (
      vacationTenureBlock
      || (canShowVacationBalance && balance != null && Number(balance.requestable ?? 0) < 1
        && !settings?.allowRequestUnaccrued)
    ),
  );

  const filtered = useMemo(() => {
    const list = filter === 'all' ? requests : requests.filter((r) => r.status === filter);
    return [...list].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }, [requests, filter]);

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  const previewDays =
    form.startDate && form.endDate && form.endDate >= form.startDate
      ? countVacationRequestDays(form.startDate, form.endDate, settings)
      : 0;

  const leaveLabels = LEAVE_TYPE_LABELS[i18n.language?.slice(0, 2) || 'es'] || LEAVE_TYPE_LABELS.es;

  const dateOverlapHint = useMemo(() => {
    if (!form.startDate || !form.endDate || form.endDate < form.startDate || !memberId) return null;
    const overlaps = findOverlappingLeaveRequests(
      requests,
      memberId,
      form.startDate,
      form.endDate,
    );
    if (!overlaps.length) return null;
    const parts = overlaps.slice(0, 3).map((o) => {
      const type = leaveLabels[String(o.leaveType || '')] || o.leaveType || 'permiso';
      const st = o.status === 'approved' ? 'aprobado' : 'pendiente';
      return `${type} (${st}) ${formatDateRangeEs(o.startDate, o.endDate)}`;
    });
    return `Estas fechas ya tienen: ${parts.join(' · ')}. Puedes enviar igual; RRHH verá el solape.`;
  }, [form.startDate, form.endDate, memberId, requests, leaveLabels]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!businessId || !memberId || !selectedType) {
      const msg = !businessId
        ? 'No hay empresa asociada a tu cuenta. Cierra sesión y vuelve a entrar.'
        : 'No se pudo identificar tu usuario. Recarga la página o vuelve a iniciar sesión.';
      setFormError(msg);
      toast.error(msg, { id: 'worker-request-form' });
      return;
    }
    setFormError('');

    const policy = validateVacationRequestPolicy(
      form.startDate,
      form.endDate,
      settings,
      selectedType.id,
      { employmentStartDate: user?.employment?.startDate },
    );
    if (!policy.ok) {
      setFormError(policy.error);
      toast.error(policy.error, { id: 'worker-request-form' });
      return;
    }
    if (selectedType.notesRequired && form.notes.trim().length < 3) {
      const msg = 'Indica el motivo (mín. 3 caracteres).';
      setFormError(msg);
      toast.error(msg, { id: 'worker-request-form' });
      return;
    }

    const duplicatePending = requests.some(
      (r) =>
        r.status === 'pending'
        && r.leaveType === selectedType.id
        && r.startDate === form.startDate
        && r.endDate === form.endDate,
    );
    if (duplicatePending) {
      const msg = 'Ya tienes una solicitud pendiente igual (mismo tipo y fechas). Espera a RRHH o cancélala.';
      setFormError(msg);
      toast.error(msg, { id: 'worker-request-form' });
      setMobileTab('mine');
      return;
    }

    setSubmitting(true);
    try {
      const saved = await createVacationRequest(
        businessId,
        memberId,
        memberName,
        {
          startDate: form.startDate,
          endDate: form.endDate,
          leaveType: selectedType.id,
          notes: form.notes.trim(),
          urgency: selectedType.defaultUrgent ? 'urgent' : 'normal',
        },
        settings,
        {
          notifyOwnerUserId: ownerUserId || undefined,
          existingRequests: requests.filter(
            (r) => r.status === 'pending' || r.status === 'approved',
          ),
          employmentStartDate: user?.employment?.startDate,
          employmentEndDate: user?.employment?.endDate,
          hoursPerWeek: effectiveHours ?? user?.employment?.hoursPerWeek,
          workday: user?.employment?.workday,
          scheduleWeeklyHours: scheduleWeeklyHours ?? undefined,
        },
      );
      // Optimistic: no esperar reload para verla.
      setRequests((prev) => [saved, ...prev.filter((r) => r._id !== saved._id)]);
      setForm(emptyForm());
      setFormError('');
      setJustSentId(saved._id);
      setMobileTab('mine');
      setFilter('all');
      if (saved.needsHrReview) {
        toast.warning(
          'Enviada a RRHH con solape: ellos la valoran (no se aprueba sola).',
          { id: 'worker-request-sent' },
        );
      } else {
        toast.success('Solicitud enviada a RRHH. Queda pendiente de aprobación.', {
          id: 'worker-request-sent',
        });
      }
      window.setTimeout(() => {
        listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
      // Refresh silencioso: no vuelve al spinner (evita el “bucle” de arriba).
      void load({ silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo enviar la solicitud';
      setFormError(msg);
      toast.error(msg, { id: 'worker-request-form' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(req: VacationRequest) {
    if (!memberId || cancellingId) return;
    setCancellingId(req._id);
    try {
      const updated = await cancelVacationRequest(req, memberId);
      setRequests((prev) => prev.map((r) => (r._id === updated._id ? updated : r)));
      if (justSentId === req._id) setJustSentId(null);
      toast.success('Solicitud cancelada. Ya puedes pedir de nuevo esas fechas.', {
        id: 'worker-request-cancel',
      });
      void load({ silent: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cancelar', {
        id: 'worker-request-cancel',
      });
    } finally {
      setCancellingId(null);
    }
  }

  if (loading) {
    return (
      <Layout title={t('nav.workerRequests', 'Solicitudes')} subtitle="Vacaciones y permisos hacia RRHH">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  const formSection = (
    <section className={`${WORKER_CARD} p-4 sm:p-5`}>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[var(--v-blue,#2563eb)] dark:bg-blue-950/40 dark:text-blue-400">
          <Send className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">Pedir a RRHH</h2>
          <p className="text-xs text-stone-500">
            Completa y envía.{' '}
            <Link to="/saas/worker/calendar" className="font-semibold text-[var(--v-blue,#2563eb)] hover:underline">
              Ver calendario
            </Link>
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
          Tipo
          <select
            value={form.leaveType}
            onChange={(e) => {
              const leaveType = e.target.value as LeaveType;
              setForm((p) => {
                if (leaveType !== 'vacation') {
                  return { ...p, leaveType };
                }
                const startDate = p.startDate < minVacationStart ? minVacationStart : p.startDate;
                return {
                  ...p,
                  leaveType,
                  startDate,
                  endDate: p.endDate < startDate ? startDate : p.endDate,
                };
              });
            }}
            className="mt-1 w-full min-h-12 rounded-xl border-2 border-gray-200 bg-white px-3 py-3 text-base dark:border-gray-600 dark:bg-gray-900 sm:min-h-0 sm:py-2.5 sm:text-sm"
          >
            {typeOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {selectedType?.description ? (
          <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-gray-900/60 dark:text-gray-400">
            {selectedType.description}
            {selectedType.consumesVacationBalance ? (
              <span className="mt-1 block font-medium text-gray-700 dark:text-gray-300">
                {vacationTenureBlock
                  ? vacationTenureBlock
                  : canShowVacationBalance && balance
                    ? Number(balance.requestable ?? 0) >= 1
                      ? `Puedes pedir ahora: ${formatQtyEs(balance.requestable ?? 0)} d (cargados por meses de alta).`
                      : `Aún no tienes días de vacaciones disponibles. Se cargan +${formatQtyEs(balance.daysPerMonth || settings?.daysPerMonth || 2.5)} d por cada mes completo de alta.`
                    : 'Sin fecha de alta o jornada: el saldo de vacaciones no está disponible.'}
              </span>
            ) : (
              <span className="mt-1 block font-medium text-gray-700 dark:text-gray-300">
                No consume saldo de vacaciones: puedes pedirlo aunque lleves poco tiempo (RRHH lo valora).
              </span>
            )}
          </p>
        ) : null}

        {form.leaveType === 'vacation' && vacationTenureBlock ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            {vacationTenureBlock} Mientras tanto puedes pedir «Asuntos propios» u otros permisos.
          </p>
        ) : null}

        {form.leaveType === 'vacation' && !vacationTenureBlock && vacationCannotRequest ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            Vacaciones bloqueadas: todavía no has completado un mes de alta o no hay días cargados.
            Usa «Asuntos propios» si es algo puntual.
          </p>
        ) : null}

        {form.leaveType === 'vacation' && !vacationTenureBlock && Number(settings?.minNoticeDays || 0) > 0 ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            Vacaciones: mínimo {settings?.minNoticeDays} días de antelación (desde {formatDateEs(minVacationStart)}).
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
            Desde
            <input
              type="date"
              required
              value={form.startDate}
              min={form.leaveType === 'vacation' ? minVacationStart : undefined}
              onChange={(e) => {
                const startDate = e.target.value;
                setForm((p) => ({
                  ...p,
                  startDate,
                  endDate: !p.endDate || p.endDate < startDate ? startDate : p.endDate,
                }));
              }}
              className="mt-1 w-full min-h-12 rounded-xl border-2 border-gray-200 bg-white px-3 py-3 text-base dark:border-gray-600 dark:bg-gray-900 sm:min-h-0 sm:py-2.5 sm:text-sm"
            />
          </label>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
            Hasta
            <input
              type="date"
              required
              value={form.endDate}
              min={form.startDate || undefined}
              onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))}
              className="mt-1 w-full min-h-12 rounded-xl border-2 border-gray-200 bg-white px-3 py-3 text-base dark:border-gray-600 dark:bg-gray-900 sm:min-h-0 sm:py-2.5 sm:text-sm"
            />
          </label>
        </div>

        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300">
          Nota para RRHH {selectedType?.notesRequired ? '(obligatorio)' : '(opcional)'}
          <textarea
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            rows={3}
            required={selectedType?.notesRequired}
            placeholder="Motivo o detalles…"
            className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-3 text-base dark:border-gray-600 dark:bg-gray-900 sm:py-2.5 sm:text-sm"
          />
        </label>

        {previewDays > 0 ? (
          <p className="text-xs text-gray-500">Duración: {previewDays} día(s)</p>
        ) : null}

        {dateOverlapHint ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            {dateOverlapHint}
          </p>
        ) : form.startDate && form.endDate && form.endDate >= form.startDate ? (
          <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
            Fechas libres de otras solicitudes tuyas: puedes pedir sin solape.
          </p>
        ) : null}

        {formError ? (
          <p className="flex items-start gap-1.5 text-xs text-red-600">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {formError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting || vacationCannotRequest}
          className={`${VERTIAL_BTN_PRIMARY} w-full`}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {submitting ? 'Enviando…' : 'Enviar a RRHH'}
        </button>
      </form>
    </section>
  );

  const listSection = (
    <section ref={listTopRef} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Mis solicitudes</h2>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {([
            ['all', 'Todas'],
            ['pending', 'Pendientes'],
            ['approved', 'Aprobadas'],
            ['rejected', 'Rechazadas'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                filter === id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {justSentId ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          Solicitud enviada. Aparece abajo como pendiente hasta que RRHH responda.
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-12 dark:border-gray-700 dark:bg-gray-800">
          <Umbrella className="mb-3 h-9 w-9 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Sin solicitudes</p>
          <p className="mt-1 max-w-xs text-center text-xs text-gray-500">
            Usa «Pedir» para enviar la primera a RRHH.
          </p>
          <button
            type="button"
            onClick={() => setMobileTab('new')}
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white sm:hidden"
          >
            Pedir a RRHH
          </button>
        </div>
      ) : (
        <ul className="space-y-2 sm:space-y-0 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-gray-200 sm:bg-white dark:sm:border-gray-700 dark:sm:bg-gray-800">
          {filtered.map((req) => {
            const Icon = STATUS_ICON[req.status] || Clock;
            const typeDef = getHrRequestType(req.leaveType);
            const highlight = justSentId === req._id;
            const decided = req.status === 'approved' || req.status === 'rejected' || req.status === 'cancelled';
            const open = expandedId === req._id;
            const reviewNote = String(req.reviewNote || '').trim();
            const ownNotes = String(req.notes || '').trim();

            return (
              <li
                key={req._id}
                className={`rounded-2xl border bg-white dark:bg-gray-800 sm:rounded-none sm:border-0 sm:border-b sm:border-gray-100 sm:last:border-b-0 dark:sm:border-gray-700/60 ${
                  highlight
                    ? 'border-emerald-300 ring-2 ring-emerald-200 dark:border-emerald-700 dark:ring-emerald-900'
                    : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                {decided ? (
                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? null : req._id)}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left"
                    aria-expanded={open}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {typeDef.label}
                        </p>
                        {req.urgency === 'urgent' ? (
                          <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                            Urgente
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {formatDateRangeEs(req.startDate, req.endDate)} · {formatQtyEs(req.totalDays)} d
                      </p>
                      <p className="mt-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                        {open ? 'Ocultar detalle' : 'Ver detalle y motivos'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[req.status]}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {statusLabels[req.status] || req.status}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>
                ) : (
                  <div className="flex items-start justify-between gap-3 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {typeDef.label}
                        </p>
                        {req.needsHrReview ? (
                          <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                            En valoración RRHH
                          </span>
                        ) : null}
                        {req.urgency === 'urgent' ? (
                          <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                            Urgente
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {formatDateRangeEs(req.startDate, req.endDate)} · {formatQtyEs(req.totalDays)} d
                      </p>
                      {req.conflictSummary
                        && req.needsHrReview
                        && !/Nadie más del equipo/i.test(req.conflictSummary) ? (
                        <p className="mt-1 text-xs text-orange-700 dark:text-orange-300">{req.conflictSummary}</p>
                      ) : null}
                      {ownNotes ? (
                        <p className="mt-1.5 text-xs text-gray-600 dark:text-gray-400">{ownNotes}</p>
                      ) : null}
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[req.status]}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {statusLabels[req.status] || req.status}
                    </span>
                  </div>
                )}

                {decided && open ? (
                  <div className="space-y-2 border-t border-gray-100 px-4 pb-3.5 pt-3 dark:border-gray-700/60">
                    {(req.reviewedAt || req.reviewedByName) ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {[
                          req.reviewedByName ? `Por ${req.reviewedByName}` : null,
                          req.reviewedAt ? formatDateTimeEs(req.reviewedAt) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    ) : null}
                    <div className="rounded-xl bg-stone-50 px-3 py-2.5 dark:bg-stone-900/60">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                        {req.status === 'approved'
                          ? 'Motivo / nota de aprobación'
                          : req.status === 'rejected'
                            ? 'Motivo del rechazo'
                            : 'Motivo de la cancelación'}
                      </p>
                      <p className="mt-1 text-sm text-gray-800 dark:text-gray-200">
                        {reviewNote || 'Sin motivo indicado'}
                      </p>
                    </div>
                    {ownNotes ? (
                      <div className="rounded-xl border border-gray-100 px-3 py-2.5 dark:border-gray-700">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                          Tu nota al pedir
                        </p>
                        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{ownNotes}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {req.status === 'pending' ? (
                  <div className="px-4 pb-3.5 sm:px-4 sm:pb-3">
                    <button
                      type="button"
                      onClick={() => void handleCancel(req)}
                      disabled={cancellingId === req._id}
                      className="w-full min-h-11 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-rose-950/30 sm:mt-0 sm:w-auto sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0 sm:text-xs sm:underline-offset-2 sm:hover:bg-transparent sm:hover:underline"
                    >
                      {cancellingId === req._id ? 'Cancelando…' : 'Cancelar solicitud'}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <Layout title={t('nav.workerRequests', 'Solicitudes')} subtitle="Vacaciones, permisos y bajas">
      <div className={WORKER_PAGE}>
        <div className={`grid gap-2 ${canShowVacationBalance ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <div className={`${WORKER_CARD} px-3 py-3`}>
            <p className="text-[11px] font-medium text-stone-500">Pendientes</p>
            <p className="text-xl font-bold tabular-nums text-orange-600">{formatNumberEs(pendingCount, { maxFraction: 0 })}</p>
          </div>
          {canShowVacationBalance && balanceLabel ? (
            <div className={`${WORKER_CARD} px-3 py-3`}>
              <p className="text-[11px] font-medium text-stone-500">Puedes pedir</p>
              <p className="text-xl font-bold tabular-nums text-stone-900 dark:text-stone-50">
                {balanceLabel.value}
                <span className="ml-0.5 text-sm font-semibold text-stone-400">d</span>
              </p>
              <p className="mt-0.5 text-[10px] leading-tight text-stone-400">{balanceLabel.hint}</p>
            </div>
          ) : null}
          <div className={`${WORKER_CARD} px-3 py-3`}>
            <p className="text-[11px] font-medium text-stone-500">Enviadas</p>
            <p className="text-xl font-bold tabular-nums text-stone-900 dark:text-stone-50">{formatNumberEs(requests.length, { maxFraction: 0 })}</p>
          </div>
        </div>

        {/* Móvil: no apilar formulario + lista (evita sensación de bucle arriba) */}
        <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-100/80 p-1 dark:border-gray-700 dark:bg-gray-800/80 sm:hidden">
          <button
            type="button"
            onClick={() => setMobileTab('new')}
            className={`min-h-11 flex-1 rounded-lg text-sm font-semibold ${
              mobileTab === 'new'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500'
            }`}
          >
            Pedir
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('mine')}
            className={`min-h-11 flex-1 rounded-lg text-sm font-semibold ${
              mobileTab === 'mine'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500'
            }`}
          >
            Mis solicitudes
            {pendingCount > 0 ? (
              <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            ) : null}
          </button>
        </div>

        <div className="sm:hidden">
          {mobileTab === 'new' ? formSection : listSection}
        </div>
        <div className="hidden space-y-5 sm:block">
          {formSection}
          {listSection}
        </div>
      </div>
    </Layout>
  );
}
