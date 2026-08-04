import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  History,
  Loader2,
  Settings2,
  X,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { VacationsTeamPanel } from '../../components/saas/schedules/VacationsTeamPanel';
import { HrRequestsHistoryPanel } from '../../components/saas/schedules/HrRequestsHistoryPanel';
import { HrRequestsReceptionPanel } from '../../components/saas/schedules/HrRequestsReceptionPanel';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useModalClose } from '../../hooks/useModalClose';
import { listHrRequestTypesForWorker } from '../../lib/hrRequestCatalog';
import { mergeBusinessMembers } from '../../lib/schedulesDisplay';
import type { LeaveType, VacationRequest, VacationSettings, VacationStatus } from '../../lib/vacationsApi';
import {
  countVacationRequestDays,
  createVacationRequest,
  deleteVacation,
  getSettings,
  LEAVE_TYPE_LABELS,
  listVacations,
  reviewVacation,
  saveSettings,
  STATUS_LABELS,
} from '../../lib/vacationsApi';

const MANAGER_ROLES = new Set(['Admin', 'Gerente', 'CEO']);

type CeoView = 'reception' | 'history';

export function HrRequestsPage() {
  const { i18n } = useTranslation();
  const { user, listUsers } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';
  const myBusinessMember = useMemo(
    () => currentBusiness?.members?.find((m) => m.user_id === user?.user_id),
    [currentBusiness?.members, user?.user_id],
  );
  const isOwner = Boolean(
    user?.user_id
    && currentBusiness?.owner_user_id
    && user.user_id === currentBusiness.owner_user_id,
  );
  const canManage =
    isOwner
    || MANAGER_ROLES.has(myBusinessMember?.role || user?.role || '');

  const lang = (i18n.language?.slice(0, 2) || 'es') as string;
  const leaveLabels = LEAVE_TYPE_LABELS[lang] || LEAVE_TYPE_LABELS.es;
  const statusLabels = STATUS_LABELS[lang] || STATUS_LABELS.es;
  const currentYear = new Date().getFullYear();

  const [view, setView] = useState<CeoView>('reception');
  /** Solo true en la primera carga; los refrescos no vacían la UI. */
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [members, setMembers] = useState<
    { user_id: string; fullName: string; role: string; startDate?: string; endDate?: string }[]
  >([]);
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [vacSettings, setVacSettings] = useState<VacationSettings | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [form, setForm] = useState({
    startDate: '',
    endDate: '',
    leaveType: 'vacation' as LeaveType,
    notes: '',
    urgency: 'normal' as 'normal' | 'urgent',
  });

  const hasLoadedRef = useRef(false);
  const listUsersRef = useRef(listUsers);
  listUsersRef.current = listUsers;
  const businessMembersRef = useRef(currentBusiness?.members);
  businessMembersRef.current = currentBusiness?.members;

  useModalClose(showForm, () => setShowForm(false));
  useModalClose(showSettings, () => setShowSettings(false));

  const flash = (msg: string) => {
    setSuccess(msg);
    window.setTimeout(() => setSuccess(''), 2500);
  };

  const loadData = useCallback(async () => {
    if (!businessId) return;
    const isInitial = !hasLoadedRef.current;
    // No poner loading=true en refrescos: desmonta bandeja/historial y parpadea.
    if (isInitial) setLoading(true);
    setError('');
    try {
      const [memberList, vacs, vs] = await Promise.all([
        listUsersRef.current(businessId).catch(() => []),
        // Historial completo (sin filtrar año); la bandeja y KPIs filtran en UI.
        listVacations(businessId),
        getSettings(businessId),
      ]);
      setMembers(
        mergeBusinessMembers(
          (businessMembersRef.current || []) as {
            user_id: string;
            fullName?: string;
            email?: string;
            role?: string;
            employment?: unknown;
          }[],
          memberList as {
            user_id: string;
            fullName?: string;
            role?: string;
            employment?: unknown;
          }[],
        ).map((m) => {
          const emp = (m.employment || {}) as {
            startDate?: string;
            endDate?: string;
            hoursPerWeek?: number;
            workday?: string;
          };
          return {
            user_id: m.user_id,
            fullName: m.fullName || m.email || m.user_id,
            role: String(m.role || 'Usuario'),
            startDate: emp.startDate,
            endDate: emp.endDate,
            hoursPerWeek: emp.hoursPerWeek,
            workday: emp.workday,
          };
        }),
      );
      setVacations(vacs);
      setVacSettings(vs);
      hasLoadedRef.current = true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar solicitudes');
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    hasLoadedRef.current = false;
    void loadData();
  }, [loadData]);

  const pendingRequests = useMemo(
    () => vacations.filter((v) => v.status === 'pending'),
    [vacations],
  );
  const pendingCount = pendingRequests.length;

  const handleReview = async (record: VacationRequest, decision: 'approved' | 'rejected') => {
    if (!user) return;
    setError('');
    try {
      const note = reviewNotes[record._id] || '';
      const result = await reviewVacation(
        record,
        decision,
        user.user_id,
        user.fullName || user.email,
        note,
      );
      setReviewNotes((prev) => {
        const next = { ...prev };
        delete next[record._id];
        return next;
      });
      setExpandedId(null);
      const autoMsg = result.autoDisabledShifts?.length
        ? ` (${result.autoDisabledShifts.length} turnos desactivados)`
        : '';
      flash(decision === 'approved' ? `Solicitud aprobada${autoMsg}` : 'Solicitud rechazada');
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al revisar la solicitud');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !user) return;
    if (!form.startDate || !form.endDate) {
      setError('Selecciona las fechas');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await createVacationRequest(
        businessId,
        user.user_id,
        user.fullName || user.email,
        {
          startDate: form.startDate,
          endDate: form.endDate,
          leaveType: form.leaveType,
          notes: form.notes,
          urgency: form.urgency,
        },
        vacSettings,
        {
          notifyOwnerUserId: currentBusiness?.owner_user_id,
          existingRequests: vacations.filter((v) => v.member_id === user.user_id),
          employmentStartDate: user.employment?.startDate,
          employmentEndDate: user.employment?.endDate,
          hoursPerWeek: user.employment?.hoursPerWeek,
          workday: user.employment?.workday,
        },
      );
      flash(
        saved.needsHrReview
          ? 'Enviada a RRHH con solape — hay que valorarla'
          : 'Solicitud enviada',
      );
      setShowForm(false);
      setForm({
        startDate: '',
        endDate: '',
        leaveType: 'vacation',
        notes: '',
        urgency: 'normal',
      });
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al enviar la solicitud');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Solicitudes RRHH" subtitle="Gestión de peticiones del equipo">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title="Solicitudes RRHH"
      subtitle={
        canManage
          ? pendingCount > 0
            ? `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'} · aprueba o rechaza aquí`
            : 'Aquí llegan las peticiones del equipo'
          : 'Tus solicitudes de vacaciones y ausencias'
      }
    >
      <div className="space-y-4 pb-2 sm:space-y-5">
        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="flex-1">{error}</p>
            <button type="button" onClick={() => setError('')} className="opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        {success ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        ) : null}

        {canManage ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex w-full gap-1 rounded-xl border border-gray-200 bg-gray-100/80 p-1 dark:border-gray-700 dark:bg-gray-800/80 sm:w-auto">
              <button
                type="button"
                onClick={() => setView('reception')}
                className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold sm:flex-none ${
                  view === 'reception'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                Pendientes
                {pendingCount > 0 ? (
                  <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {pendingCount}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setView('history')}
                className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold sm:flex-none ${
                  view === 'history'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                <History className="h-4 w-4" />
                Historial
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 sm:w-auto"
            >
              <Settings2 className="h-4 w-4" />
              Ajustes
            </button>
          </div>
        ) : null}

        {canManage && view === 'reception' ? (
          <HrRequestsReceptionPanel
            pending={pendingRequests}
            allRequests={vacations}
            members={members}
            leaveLabels={leaveLabels as Record<LeaveType, string>}
            expandedId={expandedId}
            reviewNotes={reviewNotes}
            onExpand={setExpandedId}
            onReviewNote={(id, note) => setReviewNotes((p) => ({ ...p, [id]: note }))}
            onReview={handleReview}
          />
        ) : canManage && view === 'history' ? (
          <HrRequestsHistoryPanel
            members={members}
            vacations={vacations}
            vacSettings={vacSettings}
            leaveLabels={leaveLabels as Record<LeaveType, string>}
            statusLabels={statusLabels as Record<VacationStatus, string>}
          />
        ) : !canManage ? (
          <VacationsTeamPanel
            members={members}
            vacations={vacations.filter((v) => new Date(v.startDate).getFullYear() === currentYear)}
            vacSettings={vacSettings}
            currentYear={currentYear}
            canManage={false}
            userId={user?.user_id}
            leaveLabels={leaveLabels as Record<LeaveType, string>}
            statusLabels={statusLabels as Record<VacationStatus, string>}
            expandedId={expandedId}
            reviewNotes={reviewNotes}
            onExpand={setExpandedId}
            onReviewNote={(id, note) => setReviewNotes((p) => ({ ...p, [id]: note }))}
            onReview={handleReview}
            onDelete={(r) => {
              void deleteVacation(r).then(loadData);
            }}
            onRequest={() => setShowForm(true)}
          />
        ) : null}
      </div>

      {showSettings && canManage ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSettings(false);
          }}
        >
          <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800 sm:max-w-3xl sm:rounded-3xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Ajustes RRHH</h2>
                <p className="text-xs text-gray-500">Política de días y saldo del equipo</p>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-4">
              <VacationsTeamPanel
                members={members}
                vacations={vacations.filter((v) => new Date(v.startDate).getFullYear() === currentYear)}
                vacSettings={vacSettings}
                currentYear={currentYear}
                canManage
                userId={user?.user_id}
                leaveLabels={leaveLabels as Record<LeaveType, string>}
                statusLabels={statusLabels as Record<VacationStatus, string>}
                expandedId={null}
                reviewNotes={{}}
                onExpand={() => {}}
                onReviewNote={() => {}}
                onReview={() => {}}
                onDelete={() => {}}
                onRequest={() => {}}
                hidePendingInbox
                settingsOnly
                onSaveSettings={async (next) => {
                  const saved = await saveSettings(next);
                  setVacSettings(saved);
                  flash('Ajustes guardados');
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {showForm ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowForm(false);
          }}
        >
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800 sm:max-w-lg sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Nueva solicitud</h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-5 py-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Tipo</label>
                <select
                  value={form.leaveType}
                  onChange={(e) => setForm({ ...form, leaveType: e.target.value as LeaveType })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-900"
                >
                  {listHrRequestTypesForWorker().map((t) => (
                    <option key={t.id} value={t.id}>
                      {leaveLabels[t.id] || t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Desde</label>
                  <input
                    type="date"
                    required
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Hasta</label>
                  <input
                    type="date"
                    required
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-900"
                  />
                </div>
              </div>
              {form.startDate && form.endDate && form.startDate <= form.endDate ? (
                <p className="text-sm text-gray-500">
                  <span className="font-semibold">
                    {countVacationRequestDays(form.startDate, form.endDate, vacSettings)}
                  </span>{' '}
                  día(s) según política
                </p>
              ) : null}
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={form.urgency === 'urgent'}
                  onChange={(e) =>
                    setForm({ ...form, urgency: e.target.checked ? 'urgent' : 'normal' })
                  }
                  className="h-4 w-4 rounded border-gray-300 text-amber-600"
                />
                Marcar como urgente
              </label>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Notas</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  placeholder="Motivo u observaciones…"
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-900"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 font-semibold text-white shadow-lg shadow-amber-600/25 hover:bg-amber-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Enviar solicitud
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </Layout>
  );
}

