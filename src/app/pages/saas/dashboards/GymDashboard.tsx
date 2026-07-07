import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Layout } from '../../../components/saas/Layout';
import {
  Users,
  Calendar,
  UserPlus,
  Activity,
  CreditCard,
  Bell,
  LayoutGrid,
  Zap,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useBusinessOptional } from '../../../context/BusinessContext';
import { createVerticalApi, createVerticalDashboardApi, type VerticalDashboardData } from '../../../lib/verticalApiFactory';
import { localCalendarDayKey } from '../../../lib/tpvCajaScope';

type GymDashboardProps = { onSelectGeneral?: () => void };

export function GymDashboard({ onSelectGeneral }: GymDashboardProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const businessName = useBusinessOptional()?.currentBusiness?.name || t('gymDashboard.fallbackName');
  const dashApi = useMemo(() => createVerticalDashboardApi('gym'), []);
  const membersApi = useMemo(() => createVerticalApi<{ estado?: string }>('gym', 'members'), []);
  const accessApi = useMemo(() => createVerticalApi<{ horaEntrada?: string }>('gym', 'accessLogs'), []);
  const userId = user?.user_id || user?.id || '';
  const dateLocale = i18n.language?.startsWith('en') ? 'en-GB' : i18n.language || 'es-ES';

  const [dashData, setDashData] = useState<VerticalDashboardData | null>(null);
  const [activeMembers, setActiveMembers] = useState(0);
  const [accessToday, setAccessToday] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!userId) {
      setDashData(null);
      setActiveMembers(0);
      setAccessToday(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const today = localCalendarDayKey();
      const [d, members, accessLogs] = await Promise.all([
        dashApi.load(userId),
        membersApi.list(userId),
        accessApi.list(userId).catch(() => []),
      ]);
      setDashData(d);
      setActiveMembers(members.filter((m) => String(m.estado || 'activo') === 'activo').length);
      setAccessToday(accessLogs.filter((log) => String(log.horaEntrada || '').startsWith(today)).length);
    } catch {
      setDashData(null);
      setActiveMembers(0);
      setAccessToday(0);
    } finally {
      setLoading(false);
    }
  }, [dashApi, membersApi, accessApi, userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const classCount = dashData?.counts?.classes ?? 0;
  const membershipCount = dashData?.counts?.memberships ?? 0;

  const activities = useMemo(() => {
    const raw = dashData?.recentActivity || [];
    return raw.map(a => {
      const d = new Date(a.updatedAt || a.createdAt || 0);
      return {
        id: a.id,
        icon: UserPlus,
        tone: 'text-emerald-500 dark:text-emerald-400',
        title: a.summary || a.type || '',
        meta: d.toLocaleString(dateLocale, { dateStyle: 'short', timeStyle: 'short' }),
      };
    });
  }, [dashData, dateLocale]);

  const monthSummary = useMemo(() => {
    const c = dashData?.counts;
    const lines =
      dashData == null
        ? ([] as string[])
        : [
            t('gymDashboard.totalRecords', { count: dashData.total }),
            t('gymDashboard.membersCount', { count: c?.members ?? 0 }),
            t('gymDashboard.classesCount', { count: c?.classes ?? 0 }),
            t('gymDashboard.membershipsCount', { count: c?.memberships ?? 0 }),
          ];
    return {
      title: t('gymDashboard.monthSummary'),
      lines,
    };
  }, [dashData, t]);

  return (
    <Layout title={t('gymDashboard.title')}>
      <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto relative">
        {loading ? (
          <div className="flex justify-center items-center py-12" aria-busy="true">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
          </div>
        ) : null}
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{businessName}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('gymDashboard.subtitle')}</p>
          </div>
          {onSelectGeneral ? (
            <button
              type="button"
              onClick={() => onSelectGeneral()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <LayoutGrid className="w-4 h-4" />
              {t('gymDashboard.generalView')}
            </button>
          ) : null}
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/30">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                —
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {String(activeMembers)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('gymDashboard.kpiActiveMembers')}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/30">
                <Calendar className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {String(classCount)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('gymDashboard.kpiScheduledClasses')}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-violet-50 dark:bg-violet-900/30">
                <UserPlus className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {String(membershipCount)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('gymDashboard.kpiMembershipPlans')}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/30">
                <Activity className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">
              {String(accessToday)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('gymDashboard.kpiAccessToday')}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mr-2">
            {t('gymDashboard.quickActions')}
          </span>
          <button
            type="button"
            onClick={() => navigate('/saas/gym-members')}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400 px-3 py-2 text-sm font-medium text-white transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            {t('gymDashboard.newMember')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/saas/gym-classes')}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 transition-colors"
          >
            <Calendar className="w-4 h-4" />
            {t('gymDashboard.scheduleClass')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/saas/gym-memberships')}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-200 transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            {t('gymDashboard.managePlans')}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              {t('gymDashboard.recentActivity')}
            </h2>
            <ul className="space-y-3">
              {activities.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.id}
                    className="flex gap-3 text-sm border-b border-gray-100 dark:border-gray-700/80 pb-3 last:border-0 last:pb-0"
                  >
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${item.tone}`} />
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{item.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{item.meta}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              {monthSummary.title}
            </h2>
            <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
              {monthSummary.lines.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <Bell className="w-4 h-4 shrink-0 text-gray-400 mt-0.5" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}
