import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Search,
  MoreVertical,
  Trash2,
  Play,
  Square,
  Timer,
  AlertCircle,
  Loader2,
  Building2,
  ArrowRight,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import { workerNeedsBusinessLink } from '../../../lib/workerProfileCompletion';
import {
  type WorkerTask,
  type TaskPriority,
  type TaskStatus,
  listWorkerTasks,
  createWorkerTask,
  ensureRoleOnboardingTasks,
  startTaskTimer,
  stopTaskTimer,
  completeTask,
  reopenTask,
  deleteWorkerTask,
  getLiveSeconds,
  getRemainingAutoStop,
  formatTaskTimer,
} from '../../../lib/workerTasksApi';
import { getRoleTaskBundle } from '../../../lib/roleTaskTemplates';
import { getInviteRoleDisplayLabel } from '../../../lib/inviteFunctionRoles';
import { useWorkerAssignedStore } from '../../../hooks/useWorkerAssignedStore';
import { WorkerStoreScheduleCard } from '../../../components/saas/worker/WorkerStoreScheduleCard';
import { WorkerClockInCard } from '../../../components/saas/worker/WorkerClockInCard';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../../lib/vertialUiTokens';
import {
  WORKER_CARD,
  WORKER_FILTER_PILL,
  WORKER_FILTER_PILL_OFF,
  WORKER_FILTER_PILL_ON,
  WORKER_FILTER_ROW,
  WORKER_INPUT,
  WORKER_MUTED,
  WORKER_PAGE,
} from '../../../lib/workerUi';

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; icon: React.ReactNode }> = {
  low: { label: 'Baja', color: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300', icon: <Circle className="w-3 h-3" /> },
  medium: { label: 'Media', color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300', icon: <Clock className="w-3 h-3" /> },
  high: { label: 'Alta', color: 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300', icon: <AlertTriangle className="w-3 h-3" /> },
  urgent: { label: 'Urgente', color: 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300', icon: <AlertTriangle className="w-3 h-3" /> },
};

export function WorkerTasks() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || user?.linkedBusinessId || '';
  const memberId = user?.user_id || '';
  const memberName = user?.fullName || '';
  const needsCompany = workerNeedsBusinessLink(user);
  const {
    showStoreBlock,
    workCenter,
    storeLabel,
    hasAssignment,
    storeHoursToday,
    personalShiftToday,
    hasPersonalSchedule,
    personalDayOff,
    memberSchedule,
    scheduleLoading,
    storeResolving,
  } = useWorkerAssignedStore();

  const [tasks, setTasks] = useState<WorkerTask[]>([]);
  const [filter, setFilter] = useState<'all' | TaskStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('medium');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasRunningTimer = tasks.some((t) => t.timerRunning);

  const roleId = String(user?.role || '').trim();
  const businessType = currentBusiness?.businessType;
  const roleBundle = getRoleTaskBundle(roleId, businessType);

  const loadTasks = useCallback(async () => {
    if (!businessId || !memberId) {
      setLoading(false);
      return;
    }
    try {
      // Invites antiguos: siembra tareas del rol si aún no existen.
      const seeded = await ensureRoleOnboardingTasks(
        businessId,
        memberId,
        roleId,
        businessType,
      );
      setTasks(seeded.tasks.length ? seeded.tasks : await listWorkerTasks(businessId, memberId));
    } catch (e: any) {
      console.error('Error loading tasks:', e);
    } finally {
      setLoading(false);
    }
  }, [businessId, memberId, roleId, businessType]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (hasRunningTimer) {
      tickRef.current = setInterval(() => setTick((v) => v + 1), 1000);
    } else if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [hasRunningTimer]);

  useEffect(() => {
    if (!hasRunningTimer) return;
    for (const task of tasks) {
      if (task.timerRunning && getRemainingAutoStop(task) <= 0) {
        handleStopTimer(task);
      }
    }
  });

  const filteredTasks = tasks
    .filter((task) => filter === 'all' || task.status === filter)
    .filter((task) => task.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !businessId || !memberId) return;
    setSaving('new');
    try {
      const created = await createWorkerTask(businessId, memberId, newTaskTitle.trim(), newTaskPriority);
      setTasks((prev) => [created, ...prev]);
      setNewTaskTitle('');
      setShowNewTask(false);
    } catch (e: any) {
      console.error('Error creating task:', e);
    } finally {
      setSaving(null);
    }
  };

  const handleStartTimer = async (task: WorkerTask) => {
    if (saving) return;
    const otherRunning = tasks.find((t) => t.timerRunning && t._id !== task._id);
    if (otherRunning) {
      setSaving(otherRunning._id);
      try {
        const stopped = await stopTaskTimer(otherRunning);
        setTasks((prev) => prev.map((t) => (t._id === stopped._id ? stopped : t)));
      } catch (e: any) {
        console.error('Error stopping other timer:', e);
      }
    }

    setSaving(task._id);
    try {
      const updated = await startTaskTimer(task);
      setTasks((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
    } catch (e: any) {
      console.error('Error starting timer:', e);
    } finally {
      setSaving(null);
    }
  };

  const handleStopTimer = async (task: WorkerTask) => {
    if (saving) return;
    setSaving(task._id);
    try {
      const updated = await stopTaskTimer(task);
      setTasks((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
    } catch (e: any) {
      console.error('Error stopping timer:', e);
    } finally {
      setSaving(null);
    }
  };

  const handleToggleComplete = async (task: WorkerTask) => {
    if (saving) return;
    setSaving(task._id);
    try {
      const updated = task.status === 'completed' ? await reopenTask(task) : await completeTask(task);
      setTasks((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
    } catch (e: any) {
      console.error('Error toggling task:', e);
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (task: WorkerTask) => {
    if (saving) return;
    setSaving(task._id);
    setOpenMenuId(null);
    try {
      await deleteWorkerTask(task);
      setTasks((prev) => prev.filter((t) => t._id !== task._id));
    } catch (e: any) {
      console.error('Error deleting task:', e);
    } finally {
      setSaving(null);
    }
  };

  const counts = {
    all: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
  };

  const totalWorkedToday = tasks.reduce((sum, t) => sum + getLiveSeconds(t), 0);

  if (needsCompany || !businessId) {
    return (
      <Layout title={t('worker.tasks.title')} subtitle={t('worker.tasks.subtitle')}>
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-5">
            <Building2 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {t('worker.tasks.needsCompanyTitle', 'Espera la invitación de tu gerente')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6">
            {t(
              'worker.tasks.needsCompanyBody',
              'Cuando te inviten al equipo, aquí verás tu trabajo, fichaje y documentos. Mientras tanto puedes revisar invitaciones o completar tu perfil.',
            )}
          </p>
          <button
            type="button"
            onClick={() => navigate('/saas/invitations')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            {t('nav.workerInvitations', 'Mis invitaciones')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout title={t('worker.tasks.title')} subtitle={t('worker.tasks.subtitle')}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={t('worker.tasks.title')} subtitle={t('worker.tasks.subtitle')}>
      <div className={WORKER_PAGE}>
        <div className="space-y-3">
          {showStoreBlock ? (
            <WorkerStoreScheduleCard
              workCenter={workCenter}
              storeLabel={storeLabel}
              hasAssignment={hasAssignment}
              storeHoursToday={storeHoursToday}
              personalShiftToday={personalShiftToday}
              hasPersonalSchedule={hasPersonalSchedule}
              personalDayOff={personalDayOff}
              memberSchedule={memberSchedule}
              scheduleLoading={scheduleLoading}
              storeResolving={storeResolving}
              compact
            />
          ) : null}
          <WorkerClockInCard
            businessId={businessId}
            memberId={memberId}
            memberName={memberName}
            size="md"
          />
        </div>

        {roleBundle ? (
          <div className={`${WORKER_CARD} border-blue-200 bg-blue-50/60 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/30`}>
            <p className="text-xs font-semibold text-[var(--v-blue,#2563eb)] dark:text-blue-300">
              {getInviteRoleDisplayLabel(roleId, businessType) || roleBundle.roleLabel}
            </p>
            <p className="mt-0.5 text-sm text-stone-800 dark:text-stone-100">{roleBundle.summary}</p>
            <p className={`mt-1 ${WORKER_MUTED}`}>Marca las tareas conforme las completes.</p>
          </div>
        ) : null}

        <div className={`${WORKER_CARD} flex items-center justify-between gap-3 px-4 py-3`}>
          <div className="min-w-0">
            <p className={WORKER_MUTED}>{t('worker.tasks.totalTimeToday', 'Tiempo en tareas hoy')}</p>
            <p className="font-mono text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-50">
              {formatTaskTimer(totalWorkedToday)}
            </p>
          </div>
          {hasRunningTimer ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              En curso
            </span>
          ) : (
            <Timer className="h-6 w-6 shrink-0 text-stone-300 dark:text-stone-600" />
          )}
        </div>

        <div className={WORKER_FILTER_ROW}>
          {([
            ['all', t('worker.tasks.all', 'Todas')],
            ['pending', t('worker.tasks.pending', 'Pendientes')],
            ['in_progress', t('worker.tasks.inProgress', 'En curso')],
            ['completed', t('worker.tasks.completed', 'Hechas')],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`${WORKER_FILTER_PILL} ${
                filter === key ? WORKER_FILTER_PILL_ON : WORKER_FILTER_PILL_OFF
              }`}
            >
              {label}
              <span className="tabular-nums opacity-70">{counts[key]}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('worker.tasks.searchPlaceholder', 'Buscar…')}
              className={`${WORKER_INPUT} pl-10`}
            />
          </div>
          <button type="button" onClick={() => setShowNewTask(true)} className={`${VERTIAL_BTN_PRIMARY} w-full sm:w-auto`}>
            <Plus className="h-4 w-4" />
            {t('worker.tasks.newTask', 'Nueva')}
          </button>
        </div>

        {showNewTask ? (
          <div className={`${WORKER_CARD} space-y-3 border-blue-200 p-4 dark:border-blue-800`}>
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder={t('worker.tasks.newTaskPlaceholder', '¿Qué necesitas hacer?')}
              className={WORKER_INPUT}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className={WORKER_MUTED}>{t('worker.tasks.priority', 'Prioridad')}</span>
              {(['low', 'medium', 'high', 'urgent'] as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setNewTaskPriority(p)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    newTaskPriority === p
                      ? `${PRIORITY_CONFIG[p].color} ring-2 ring-blue-400/40`
                      : 'bg-stone-100 text-stone-500 dark:bg-stone-800'
                  }`}
                >
                  {t(`worker.tasks.priority_${p}`, PRIORITY_CONFIG[p].label)}
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowNewTask(false)} className={VERTIAL_BTN_SECONDARY}>
                {t('common.cancel', 'Cancelar')}
              </button>
              <button
                type="button"
                onClick={handleAddTask}
                disabled={saving === 'new'}
                className={VERTIAL_BTN_PRIMARY}
              >
                {saving === 'new' ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.add', 'Añadir')}
              </button>
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          {filteredTasks.length === 0 ? (
            <div className={`${WORKER_CARD} px-4 py-10 text-center`}>
              <AlertCircle className="mx-auto mb-2 h-8 w-8 text-stone-300 dark:text-stone-600" />
              <p className="text-sm font-medium text-stone-600 dark:text-stone-300">
                {t('worker.tasks.noTasks', 'Sin tareas')}
              </p>
              <p className={`mt-1 ${WORKER_MUTED}`}>
                {roleBundle
                  ? 'Recarga o vuelve a iniciar sesión.'
                  : t('worker.tasks.noTasksHint', 'Crea una tarea para empezar')}
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => {
              const liveSeconds = getLiveSeconds(task);
              const isSaving = saving === task._id;

              return (
                <div
                  key={task._id}
                  className={`${WORKER_CARD} flex items-start gap-3 p-3.5 ${
                    task.timerRunning
                      ? 'border-emerald-300 ring-1 ring-emerald-200 dark:border-emerald-700 dark:ring-emerald-900'
                      : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleComplete(task)}
                    disabled={isSaving}
                    className={`mt-0.5 shrink-0 touch-manipulation ${
                      task.status === 'completed'
                        ? 'text-emerald-500'
                        : 'text-stone-300 hover:text-emerald-400 dark:text-stone-600'
                    }`}
                    aria-label={task.status === 'completed' ? 'Reabrir' : 'Completar'}
                  >
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="h-6 w-6" />
                    ) : (
                      <Circle className="h-6 w-6" />
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-[15px] font-medium leading-snug ${
                        task.status === 'completed'
                          ? 'text-stone-400 line-through'
                          : 'text-stone-900 dark:text-stone-100'
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.description ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-stone-500 dark:text-stone-400">
                        {task.description}
                      </p>
                    ) : null}

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-[11px] ${
                          task.timerRunning
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : liveSeconds > 0
                              ? 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
                              : 'bg-stone-50 text-stone-400 dark:bg-stone-900 dark:text-stone-500'
                        }`}
                      >
                        <Timer className="h-3 w-3" />
                        {formatTaskTimer(liveSeconds)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_CONFIG[task.priority].color}`}
                      >
                        {t(`worker.tasks.priority_${task.priority}`, PRIORITY_CONFIG[task.priority].label)}
                      </span>
                      {task.category === 'role_onboarding' || task.templateKey ? (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                          Puesto
                        </span>
                      ) : null}
                    </div>

                    {task.timerRunning
                      ? (() => {
                          const remaining = getRemainingAutoStop(task);
                          const mins = Math.floor(remaining / 60);
                          if (mins >= 30) return null;
                          return (
                            <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="h-3 w-3" />
                              Auto-pausa en {mins} min
                            </p>
                          );
                        })()
                      : null}
                  </div>

                  {task.status !== 'completed' ? (
                    <button
                      type="button"
                      onClick={() => (task.timerRunning ? handleStopTimer(task) : handleStartTimer(task))}
                      disabled={isSaving}
                      className={`flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-xl transition-colors disabled:opacity-50 ${
                        task.timerRunning
                          ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300'
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                      }`}
                      aria-label={task.timerRunning ? 'Parar' : 'Iniciar'}
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : task.timerRunning ? (
                        <Square className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </button>
                  ) : null}

                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(openMenuId === task._id ? null : task._id)}
                      className="flex h-11 w-9 touch-manipulation items-center justify-center rounded-xl text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
                      aria-label="Más"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {openMenuId === task._id ? (
                      <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-xl border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-900">
                        <button
                          type="button"
                          onClick={() => handleDelete(task)}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t('common.delete', 'Eliminar')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
}
