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
  Calendar,
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

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; icon: React.ReactNode }> = {
  low: { label: 'Baja', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', icon: <Circle className="w-3 h-3" /> },
  medium: { label: 'Media', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: <Clock className="w-3 h-3" /> },
  high: { label: 'Alta', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: <AlertTriangle className="w-3 h-3" /> },
  urgent: { label: 'Urgente', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: <AlertTriangle className="w-3 h-3" /> },
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
      <div className="space-y-5">
        <div className="space-y-4">
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
            compact
          />
        </div>

        {roleBundle ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50/80 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
              Tu función · {getInviteRoleDisplayLabel(roleId, businessType) || roleBundle.roleLabel}
            </p>
            <p className="mt-1 text-sm text-blue-900 dark:text-blue-100">{roleBundle.summary}</p>
            <p className="mt-1 text-xs text-blue-700/80 dark:text-blue-200/70">
              Las tareas de abajo son tu checklist del puesto. Márcalas conforme las hagas.
            </p>
          </div>
        ) : null}

        {/* Total Time Today */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">{t('worker.tasks.totalTimeToday', 'Tiempo total trabajado')}</p>
              <p className="text-3xl font-bold font-mono mt-1">{formatTaskTimer(totalWorkedToday)}</p>
            </div>
            <Timer className="w-10 h-10 text-blue-200" />
          </div>
          {hasRunningTimer && (
            <div className="mt-3 flex items-center gap-2 text-sm text-blue-100">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              {t('worker.tasks.timerActive', 'Timer activo')}
              {(() => {
                const running = tasks.find((t) => t.timerRunning);
                if (!running) return null;
                const remaining = getRemainingAutoStop(running);
                const rm = Math.floor(remaining / 60);
                return (
                  <span className="ml-auto text-xs bg-white/15 px-2 py-0.5 rounded-full">
                    {t('worker.tasks.autoStop', 'Auto-pausa en')} {Math.floor(rm / 60)}h {rm % 60}m
                  </span>
                );
              })()}
            </div>
          )}
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            ['all', t('worker.tasks.all', 'Todas'), 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'],
            ['pending', t('worker.tasks.pending', 'Pendientes'), 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'],
            ['in_progress', t('worker.tasks.inProgress', 'En progreso'), 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'],
            ['completed', t('worker.tasks.completed', 'Completadas'), 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'],
          ] as const).map(([key, label, colors]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`p-3 rounded-xl border transition-all text-left ${
                filter === key
                  ? 'border-blue-300 dark:border-blue-700 ring-2 ring-blue-200 dark:ring-blue-800'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              } ${colors}`}
            >
              <p className="text-2xl font-bold">{counts[key]}</p>
              <p className="text-xs font-medium opacity-70">{label}</p>
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('worker.tasks.searchPlaceholder', 'Buscar tareas...')}
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <button
            onClick={() => setShowNewTask(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {t('worker.tasks.newTask', 'Nueva tarea')}
          </button>
        </div>

        {/* New Task Form */}
        {showNewTask && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-blue-200 dark:border-blue-800 p-4 space-y-3">
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder={t('worker.tasks.newTaskPlaceholder', '¿Qué necesitas hacer?')}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{t('worker.tasks.priority', 'Prioridad')}:</span>
              {(['low', 'medium', 'high', 'urgent'] as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setNewTaskPriority(p)}
                  className={`text-xs px-2 py-1 rounded-lg transition-all ${
                    newTaskPriority === p ? PRIORITY_CONFIG[p].color + ' ring-2 ring-offset-1' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                  }`}
                >
                  {t(`worker.tasks.priority_${p}`, PRIORITY_CONFIG[p].label)}
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNewTask(false)}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                {t('common.cancel', 'Cancelar')}
              </button>
              <button
                onClick={handleAddTask}
                disabled={saving === 'new'}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50"
              >
                {saving === 'new' ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.add', 'Añadir')}
              </button>
            </div>
          </div>
        )}

        {/* Task List */}
        <div className="space-y-2">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
              <AlertCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">{t('worker.tasks.noTasks', 'Sin tareas')}</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                {roleBundle
                  ? 'Recarga la página o vuelve a iniciar sesión.'
                  : t('worker.tasks.noTasksHint', 'Crea una nueva tarea para empezar')}
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => {
              const liveSeconds = getLiveSeconds(task);
              const isSaving = saving === task._id;

              return (
                <div
                  key={task._id}
                  className={`group flex items-start gap-3 p-4 bg-white dark:bg-gray-800 rounded-xl border transition-all ${
                    task.timerRunning
                      ? 'border-green-300 dark:border-green-700 ring-1 ring-green-200 dark:ring-green-800'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  } hover:shadow-sm`}
                >
                  {/* Complete toggle */}
                  <button
                    onClick={() => handleToggleComplete(task)}
                    disabled={isSaving}
                    className={`mt-0.5 shrink-0 transition-colors ${
                      task.status === 'completed' ? 'text-emerald-500' : 'text-gray-300 dark:text-gray-600 hover:text-emerald-400'
                    }`}
                  >
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>

                  {/* Task content */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                      {task.title}
                    </p>
                    {task.description ? (
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                        {task.description}
                      </p>
                    ) : null}

                    {/* Timer display */}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-lg ${
                        task.timerRunning
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : liveSeconds > 0
                            ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                            : 'bg-gray-50 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                      }`}>
                        <Timer className="w-3 h-3" />
                        {formatTaskTimer(liveSeconds)}
                        {task.timerRunning && <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />}
                      </span>

                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_CONFIG[task.priority].color}`}>
                        {PRIORITY_CONFIG[task.priority].icon}
                        {t(`worker.tasks.priority_${task.priority}`, PRIORITY_CONFIG[task.priority].label)}
                      </span>

                      {task.category === 'role_onboarding' || task.templateKey ? (
                        <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                          Del puesto
                        </span>
                      ) : null}

                      <span className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {task.dueDate}
                      </span>
                    </div>

                    {/* Auto-stop warning */}
                    {task.timerRunning && (() => {
                      const remaining = getRemainingAutoStop(task);
                      const mins = Math.floor(remaining / 60);
                      if (mins < 30) {
                        return (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {t('worker.tasks.autoStopWarning', 'Se detendrá automáticamente en')} {mins}m
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {/* Timer control */}
                  {task.status !== 'completed' && (
                    <button
                      onClick={() => task.timerRunning ? handleStopTimer(task) : handleStartTimer(task)}
                      disabled={isSaving}
                      className={`shrink-0 p-2 rounded-lg transition-all ${
                        task.timerRunning
                          ? 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                          : 'bg-green-100 text-green-600 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
                      } disabled:opacity-50`}
                    >
                      {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : task.timerRunning ? (
                        <Square className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                  )}

                  {/* Menu */}
                  <div className="relative">
                    <button
                      onClick={() => setOpenMenuId(openMenuId === task._id ? null : task._id)}
                      className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
                    >
                      <MoreVertical className="w-4 h-4 text-gray-400" />
                    </button>
                    {openMenuId === task._id && (
                      <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 py-1">
                        <button
                          onClick={() => handleDelete(task)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t('common.delete', 'Eliminar')}
                        </button>
                      </div>
                    )}
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
