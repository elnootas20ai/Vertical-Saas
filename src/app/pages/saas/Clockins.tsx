import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  Play,
  Square,
  Coffee,
  Users,
  Timer,
  CalendarDays,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  StickyNote,
  BarChart3,
  TrendingUp,
  Network,
  Filter,
  UserCheck,
  Pencil,
  Check,
  X,
  MapPin,
  Smartphone,
  Monitor,
  Fingerprint,
  Bell,
  UserX,
  FileWarning,
  AlertTriangle,
  CheckCircle2,
  Download,
  Hourglass,
  UserMinus,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import { useGeolocation } from '../../hooks/useGeolocation';
import type {
  ClockinRecord,
  EnrichedClockinRecord,
  ClockinStats,
  MemberPerformance,
  ActiveMember,
  OrgClockNode,
  OrgClockEdge,
  AbsenteeismDay,
  AbsenteeismSummary,
  OvertimeMember,
  OvertimeSummary,
} from '../../lib/clockinsApi';
import {
  getTodayClockin,
  clockIn,
  clockOut,
  startBreak,
  endBreak,
  updateNotes,
  formatMinutes,
  fetchClockins,
  fetchActiveNow,
  fetchClockinStats,
  fetchPerformance,
  fetchOrgClockStatus,
  getDisplayTime,
  getTimeDiffMinutes,
  adjustClockinViaApi,
  fetchAbsenteeism,
  fetchOvertime,
  exportClockinsCsv,
} from '../../lib/clockinsApi';
import type { ClockinAlert, AlertsSummary } from '../../lib/clockinAlertsApi';
import {
  generateAlerts,
  fetchAlerts,
  fetchAlertsSummary,
  acknowledgeAlert as ackAlert,
  ALERT_TYPE_CONFIG,
} from '../../lib/clockinAlertsApi';

type Tab = 'my' | 'team' | 'stats' | 'performance' | 'org' | 'alerts' | 'absenteeism' | 'overtime';

export function Clockins() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';

  const myMember = useMemo(
    () => currentBusiness?.members?.find((m) => m.user_id === user?.user_id),
    [currentBusiness, user?.user_id],
  );
  const { activeWorkCenters, hasWorkCenters } = useWorkCenters();
  const myRole = myMember?.role || user?.role || 'Usuario';
  const isAdmin = myRole === 'Admin' || myRole === 'Gerente';

  const [tab, setTab] = useState<Tab>(() => (isAdmin ? 'team' : 'my'));
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [myRecord, setMyRecord] = useState<ClockinRecord | null>(null);
  const [teamRecords, setTeamRecords] = useState<EnrichedClockinRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notesText, setNotesText] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [tick, setTick] = useState(0);
  const [filterWorkCenter, setFilterWorkCenter] = useState<string>('all');

  const [stats, setStats] = useState<ClockinStats | null>(null);
  const [statsFrom, setStatsFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [statsTo, setStatsTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [statsLoading, setStatsLoading] = useState(false);

  const [performance, setPerformance] = useState<MemberPerformance[]>([]);
  const [perfLoading, setPerfLoading] = useState(false);

  const [activeNow, setActiveNow] = useState<ActiveMember[]>([]);

  const [orgNodes, setOrgNodes] = useState<OrgClockNode[]>([]);
  const [orgEdges, setOrgEdges] = useState<OrgClockEdge[]>([]);
  const [orgLoading, setOrgLoading] = useState(false);

  const [alerts, setAlerts] = useState<ClockinAlert[]>([]);
  const [alertsSummary, setAlertsSummary] = useState<AlertsSummary | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(false);

  const [absentReport, setAbsentReport] = useState<AbsenteeismDay[]>([]);
  const [absentSummary, setAbsentSummary] = useState<AbsenteeismSummary | null>(null);
  const [absentLoading, setAbsentLoading] = useState(false);

  const [overtimeReport, setOvertimeReport] = useState<OvertimeMember[]>([]);
  const [overtimeSummary, setOvertimeSummary] = useState<OvertimeSummary | null>(null);
  const [overtimeLoading, setOvertimeLoading] = useState(false);

  const { requestLocation } = useGeolocation();

  const lang = i18n.language?.slice(0, 2) || 'es';

  /* ── Data loaders ── */

  const loadMyRecord = useCallback(async () => {
    if (!businessId || !user?.user_id) return;
    try {
      const record = await getTodayClockin(businessId, user.user_id);
      setMyRecord(record);
      if (record) setNotesText(record.notes || '');
    } catch (e: any) {
      setError(e.message);
    }
  }, [businessId, user?.user_id]);

  const loadTeamRecords = useCallback(async () => {
    if (!businessId) return;
    try {
      const records = await fetchClockins(businessId, { date: selectedDate });
      setTeamRecords(records);
    } catch (e: any) {
      setError(e.message);
    }
  }, [businessId, selectedDate]);

  const loadActiveNow = useCallback(async () => {
    if (!businessId) return;
    try {
      setActiveNow(await fetchActiveNow(businessId));
    } catch { /* non-critical */ }
  }, [businessId]);

  const loadStats = useCallback(async () => {
    if (!businessId) return;
    setStatsLoading(true);
    try {
      setStats(await fetchClockinStats(businessId, { from: statsFrom, to: statsTo }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStatsLoading(false);
    }
  }, [businessId, statsFrom, statsTo]);

  const loadPerformance = useCallback(async () => {
    if (!businessId) return;
    setPerfLoading(true);
    try {
      setPerformance(await fetchPerformance(businessId, { from: statsFrom, to: statsTo }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPerfLoading(false);
    }
  }, [businessId, statsFrom, statsTo]);

  const loadOrgStatus = useCallback(async () => {
    if (!businessId) return;
    setOrgLoading(true);
    try {
      const data = await fetchOrgClockStatus(businessId);
      setOrgNodes(data.nodes);
      setOrgEdges(data.edges);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOrgLoading(false);
    }
  }, [businessId]);

  const loadAlerts = useCallback(async () => {
    if (!businessId) return;
    setAlertsLoading(true);
    try {
      await generateAlerts(businessId);
      const [alertList, summary] = await Promise.all([
        fetchAlerts(businessId, { status: undefined }),
        fetchAlertsSummary(businessId),
      ]);
      setAlerts(alertList);
      setAlertsSummary(summary);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAlertsLoading(false);
    }
  }, [businessId]);

  const loadAlertsSummaryOnly = useCallback(async () => {
    if (!businessId) return;
    try {
      setAlertsSummary(await fetchAlertsSummary(businessId));
    } catch { /* non-critical */ }
  }, [businessId]);

  const loadAbsenteeism = useCallback(async () => {
    if (!businessId) return;
    setAbsentLoading(true);
    try {
      const data = await fetchAbsenteeism(businessId, { from: statsFrom, to: statsTo });
      setAbsentReport(data.report);
      setAbsentSummary(data.summary);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAbsentLoading(false);
    }
  }, [businessId, statsFrom, statsTo]);

  const loadOvertime = useCallback(async () => {
    if (!businessId) return;
    setOvertimeLoading(true);
    try {
      const data = await fetchOvertime(businessId, { from: statsFrom, to: statsTo });
      setOvertimeReport(data.report);
      setOvertimeSummary(data.summary);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOvertimeLoading(false);
    }
  }, [businessId, statsFrom, statsTo]);

  /* ── Effects ── */

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadMyRecord();
      if (isAdmin || tab === 'team') await loadTeamRecords();
      await loadActiveNow();
      if (isAdmin) loadAlertsSummaryOnly();
      setLoading(false);
    })();
  }, [businessId, user?.user_id]);

  useEffect(() => { if (tab === 'team') loadTeamRecords(); }, [selectedDate, tab]);
  useEffect(() => { if (tab === 'stats') loadStats(); }, [tab, statsFrom, statsTo]);
  useEffect(() => { if (tab === 'performance' && isAdmin) loadPerformance(); }, [tab, statsFrom, statsTo]);
  useEffect(() => { if (tab === 'org') loadOrgStatus(); }, [tab]);
  useEffect(() => { if (tab === 'alerts' && isAdmin) loadAlerts(); }, [tab]);
  useEffect(() => { if (tab === 'absenteeism' && isAdmin) loadAbsenteeism(); }, [tab, statsFrom, statsTo]);
  useEffect(() => { if (tab === 'overtime') loadOvertime(); }, [tab, statsFrom, statsTo]);

  useEffect(() => {
    if (myRecord?.status === 'active' || myRecord?.status === 'break') {
      const iv = setInterval(() => setTick((prev) => prev + 1), 60000);
      return () => clearInterval(iv);
    }
  }, [myRecord?.status]);

  useEffect(() => {
    if (tab === 'team' || tab === 'org') {
      const iv = setInterval(() => {
        loadActiveNow();
        if (tab === 'org') loadOrgStatus();
      }, 30000);
      return () => clearInterval(iv);
    }
  }, [tab]);

  /* ── Actions ── */

  const getGeo = async () => {
    try {
      const loc = await requestLocation();
      return loc || undefined;
    } catch { return undefined; }
  };

  const handleClockIn = async () => {
    if (!businessId || !user) return;
    setActionLoading(true); setError('');
    try {
      const geo = await getGeo();
      setMyRecord(await clockIn(businessId, user.user_id, user.fullName || user.email, { geo, device_type: 'desktop' }));
      loadActiveNow();
    } catch (e: any) { setError(e.message); } finally { setActionLoading(false); }
  };

  const handleClockOut = async () => {
    if (!myRecord) return;
    setActionLoading(true); setError('');
    try {
      const geo = await getGeo();
      setMyRecord(await clockOut(myRecord, geo));
      loadActiveNow();
    } catch (e: any) { setError(e.message); } finally { setActionLoading(false); }
  };

  const handleBreak = async () => {
    if (!myRecord) return;
    setActionLoading(true); setError('');
    try {
      const geo = await getGeo();
      setMyRecord(myRecord.status === 'break' ? await endBreak(myRecord, geo) : await startBreak(myRecord, geo));
    } catch (e: any) { setError(e.message); } finally { setActionLoading(false); }
  };

  const handleExport = async () => {
    try {
      await exportClockinsCsv(businessId, { from: statsFrom, to: statsTo });
    } catch (e: any) { setError(e.message); }
  };

  const handleAcknowledgeAlert = async (alertId: string, action: 'acknowledge' | 'resolve') => {
    try {
      await ackAlert(businessId, alertId, action);
      loadAlerts();
    } catch (e: any) { setError(e.message); }
  };

  const handleSaveNotes = async () => {
    if (!myRecord) return;
    try { setMyRecord(await updateNotes(myRecord, notesText)); } catch { /* silent */ }
  };

  const shiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });

  const liveMinutes = (() => {
    if (!myRecord || myRecord.status === 'completed') return myRecord?.totalMinutes || 0;
    const ci = myRecord.entries.find((e) => e.type === 'clock_in');
    if (!ci) return 0;
    return Math.max(0, Math.round((Date.now() - new Date(ci.time).getTime()) / 60000) - myRecord.breakMinutes);
  })();

  const todayStr = new Date().toISOString().slice(0, 10);

  const filteredTeamRecords = useMemo(() => {
    if (filterWorkCenter === 'all') return teamRecords;
    return teamRecords.filter((r) => {
      const wc =
        (r as { workCenterId?: string }).workCenterId ??
        (currentBusiness?.members?.find((m) => m.user_id === r.member_id) as { workCenterId?: string } | undefined)?.workCenterId;
      return wc === filterWorkCenter;
    });
  }, [teamRecords, filterWorkCenter, currentBusiness?.members]);

  const filteredActiveNow = useMemo(() => {
    if (filterWorkCenter === 'all') return activeNow;
    return activeNow.filter((a) => {
      const wc =
        (a as { workCenterId?: string }).workCenterId ??
        (currentBusiness?.members?.find((m) => m.user_id === a.member_id) as { workCenterId?: string } | undefined)?.workCenterId;
      return wc === filterWorkCenter;
    });
  }, [activeNow, filterWorkCenter, currentBusiness?.members]);

  const filteredOrgNodes = useMemo(() => {
    if (filterWorkCenter === 'all') return orgNodes;
    return orgNodes.filter((n) => {
      const wc =
        (n as { workCenterId?: string }).workCenterId ??
        (currentBusiness?.members?.find((m) => m.user_id === n.user_id) as { workCenterId?: string } | undefined)?.workCenterId;
      return wc === filterWorkCenter;
    });
  }, [orgNodes, filterWorkCenter, currentBusiness?.members]);

  const filteredOrgEdges = useMemo(() => {
    if (filterWorkCenter === 'all') return orgEdges;
    const ids = new Set(filteredOrgNodes.map((n) => n.id));
    return orgEdges.filter((e) => ids.has(e.source) && ids.has(e.target));
  }, [orgEdges, filteredOrgNodes, filterWorkCenter]);

  const filteredPerformance = useMemo(() => {
    if (filterWorkCenter === 'all') return performance;
    return performance.filter((p) => {
      const wc = (currentBusiness?.members?.find((m) => m.user_id === p.member_id) as { workCenterId?: string } | undefined)?.workCenterId;
      return wc === filterWorkCenter;
    });
  }, [performance, filterWorkCenter, currentBusiness?.members]);

  const filteredStats = useMemo((): ClockinStats | null => {
    if (!stats) return null;
    if (filterWorkCenter === 'all') return stats;
    const wcMatch = (memberId: string) =>
      (currentBusiness?.members?.find((m) => m.user_id === memberId) as { workCenterId?: string } | undefined)?.workCenterId === filterWorkCenter;
    const byMember = stats.byMember.filter((m) => wcMatch(m.member_id));
    const totalMinutes = byMember.reduce((s, m) => s + m.totalMinutes, 0);
    const totalBreakMinutes = byMember.reduce((s, m) => s + m.breakMinutes, 0);
    const totalSessions = byMember.reduce((s, m) => s + m.sessions, 0);
    return {
      ...stats,
      summary: {
        ...stats.summary,
        totalMinutes,
        totalBreakMinutes,
        totalSessions,
        uniqueMembers: byMember.length,
        completedSessions: totalSessions,
        avgMinutesPerSession: totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0,
      },
      byMember,
    };
  }, [stats, filterWorkCenter, currentBusiness?.members]);

  const todayTotalHours = useMemo(
    () => filteredTeamRecords.reduce((s, r) => s + r.totalMinutes, 0),
    [filteredTeamRecords, filterWorkCenter],
  );

  const STATUS: Record<string, { label: string; color: string; dot: string }> = {
    active:    { label: 'Trabajando',  color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', dot: 'bg-green-500' },
    break:     { label: 'En descanso', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', dot: 'bg-amber-500' },
    completed: { label: 'Finalizado',  color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',        dot: 'bg-gray-400' },
    offline:   { label: 'Sin fichar',  color: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',    dot: 'bg-slate-400' },
  };

  const alertBadge = alertsSummary && alertsSummary.total > 0 ? alertsSummary.total : 0;

  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'my', label: 'Mi fichaje', icon: <Clock className="w-4 h-4" /> },
    ...(isAdmin || myRole !== 'Usuario'
      ? [
          { id: 'team' as Tab, label: 'Equipo', icon: <Users className="w-4 h-4" /> },
          { id: 'org' as Tab,  label: 'Organigrama', icon: <Network className="w-4 h-4" /> },
          { id: 'stats' as Tab, label: 'Estadísticas', icon: <BarChart3 className="w-4 h-4" /> },
        ]
      : []),
    ...(isAdmin
      ? [
          { id: 'alerts' as Tab, label: 'Alertas', icon: <Bell className="w-4 h-4" />, badge: alertBadge },
          { id: 'absenteeism' as Tab, label: 'Absentismo', icon: <UserMinus className="w-4 h-4" /> },
          { id: 'overtime' as Tab, label: 'Horas extra', icon: <Hourglass className="w-4 h-4" /> },
          { id: 'performance' as Tab, label: 'Rendimiento', icon: <TrendingUp className="w-4 h-4" /> },
        ]
      : []),
  ];

  if (loading) {
    return (
      <Layout title={t('nav.clockins')} subtitle="">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={t('nav.clockins')} subtitle="">
      <div className="space-y-6">
        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
            <button onClick={() => setError('')} className="ml-auto text-xs underline">Cerrar</button>
          </div>
        )}

        {/* Active-now banner */}
        {filteredActiveNow.length > 0 && tab !== 'my' && (
          <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">
              {filteredActiveNow.length} {filteredActiveNow.length === 1 ? 'persona activa' : 'personas activas'} ahora
            </span>
            <div className="flex -space-x-2 ml-2">
              {filteredActiveNow.slice(0, 5).map((a) => (
                <div key={a.member_id} className="w-7 h-7 rounded-full bg-green-200 dark:bg-green-800 flex items-center justify-center text-xs font-bold text-green-800 dark:text-green-200 border-2 border-white dark:border-gray-900" title={a.member_name}>
                  {a.member_name.charAt(0).toUpperCase()}
                </div>
              ))}
              {filteredActiveNow.length > 5 && (
                <div className="w-7 h-7 rounded-full bg-green-300 dark:bg-green-700 flex items-center justify-center text-xs font-bold border-2 border-white dark:border-gray-900">+{filteredActiveNow.length - 5}</div>
              )}
            </div>
          </div>
        )}

        {/* Alert banner */}
        {alertBadge > 0 && tab !== 'alerts' && isAdmin && (
          <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium text-red-700 dark:text-red-400">
              {alertBadge} {alertBadge === 1 ? 'alerta activa' : 'alertas activas'}
              {alertsSummary && (
                <span className="font-normal text-red-500 dark:text-red-400/70">
                  {' — '}
                  {[
                    alertsSummary.no_clockin > 0 && `${alertsSummary.no_clockin} sin fichar`,
                    alertsSummary.late > 0 && `${alertsSummary.late} retrasos`,
                    alertsSummary.incomplete > 0 && `${alertsSummary.incomplete} incompletos`,
                    alertsSummary.excess_hours > 0 && `${alertsSummary.excess_hours} exceso horas`,
                  ].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
            <button onClick={() => setTab('alerts')} className="ml-auto text-xs font-semibold text-red-700 dark:text-red-400 hover:underline">Ver alertas</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t.icon}{t.label}
              {t.badge && t.badge > 0 ? (
                <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-red-500 text-white">{t.badge > 99 ? '99+' : t.badge}</span>
              ) : null}
            </button>
          ))}
        </div>

        {hasWorkCenters && (
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none"
              value={filterWorkCenter}
              onChange={e => setFilterWorkCenter(e.target.value)}
            >
              <option value="all">Todos los centros</option>
              {activeWorkCenters.map((wc) => (
                <option key={wc.id} value={wc.id}>{wc.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* ─── My Clock ─── */}
        {tab === 'my' && (
          <MyClockPanel
            record={myRecord}
            liveMinutes={liveMinutes}
            actionLoading={actionLoading}
            notesText={notesText}
            showNotes={showNotes}
            STATUS={STATUS}
            lang={lang}
            fmtTime={fmtTime}
            onClockIn={handleClockIn}
            onClockOut={handleClockOut}
            onBreak={handleBreak}
            onNotesChange={setNotesText}
            onToggleNotes={() => setShowNotes(!showNotes)}
            onSaveNotes={handleSaveNotes}
            isAdmin={isAdmin}
          />
        )}

        {/* ─── Team ─── */}
        {tab === 'team' && (
          <TeamPanel
            records={filteredTeamRecords}
            selectedDate={selectedDate}
            todayStr={todayStr}
            activeCount={filteredActiveNow.length}
            totalHours={todayTotalHours}
            STATUS={STATUS}
            fmtTime={fmtTime}
            onShiftDate={shiftDate}
            onDateChange={setSelectedDate}
            isAdmin={isAdmin}
            onRecordsUpdate={loadTeamRecords}
          />
        )}

        {/* ─── Org ─── */}
        {tab === 'org' && (
          <OrgPanel nodes={filteredOrgNodes} edges={filteredOrgEdges} loading={orgLoading} STATUS={STATUS} onRefresh={loadOrgStatus} />
        )}

        {/* ─── Stats ─── */}
        {tab === 'stats' && (
          <StatsPanel stats={filteredStats} loading={statsLoading} from={statsFrom} to={statsTo} onFromChange={setStatsFrom} onToChange={setStatsTo} onExport={handleExport} />
        )}

        {/* ─── Alerts ─── */}
        {tab === 'alerts' && isAdmin && (
          <AlertsPanel alerts={alerts} loading={alertsLoading} onAcknowledge={handleAcknowledgeAlert} onRefresh={loadAlerts} />
        )}

        {/* ─── Absenteeism ─── */}
        {tab === 'absenteeism' && isAdmin && (
          <AbsenteeismPanel report={absentReport} summary={absentSummary} loading={absentLoading} from={statsFrom} to={statsTo} onFromChange={setStatsFrom} onToChange={setStatsTo} />
        )}

        {/* ─── Overtime ─── */}
        {tab === 'overtime' && (
          <OvertimePanel report={overtimeReport} summary={overtimeSummary} loading={overtimeLoading} from={statsFrom} to={statsTo} onFromChange={setStatsFrom} onToChange={setStatsTo} />
        )}

        {/* ─── Performance ─── */}
        {tab === 'performance' && isAdmin && (
          <PerformancePanel data={filteredPerformance} loading={perfLoading} from={statsFrom} to={statsTo} onFromChange={setStatsFrom} onToChange={setStatsTo} />
        )}
      </div>
    </Layout>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Shared widgets
   ═════════════════════════════════════════════════════════════════════════════ */

function Stat({ icon, label, value, color, sub }: { icon: React.ReactNode; label: string; value: string; color: string; sub?: string }) {
  const bg: Record<string, string> = {
    green: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
    red: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
    slate: 'bg-slate-50 text-slate-600 dark:bg-slate-900/20 dark:text-slate-400',
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${bg[color]}`}>{icon}</div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
          {sub && <p className="text-xs text-gray-400">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function Badge({ role }: { role: string }) {
  const m: Record<string, string> = {
    Admin: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    Gerente: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    Comercial: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    'Administración': 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    Taller: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    Usuario: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${m[role] || m.Usuario}`}>{role}</span>;
}

function DateRange({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  const preset = (days: number) => {
    const e = new Date(), s = new Date();
    s.setDate(e.getDate() - days);
    onFrom(s.toISOString().slice(0, 10));
    onTo(e.toISOString().slice(0, 10));
  };
  const thisMonth = () => {
    const n = new Date();
    onFrom(new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10));
    onTo(n.toISOString().slice(0, 10));
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Filter className="w-4 h-4 text-gray-400" />
      <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
      <span className="text-gray-400 text-sm">—</span>
      <input type="date" value={to} onChange={(e) => onTo(e.target.value)} className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
      <div className="flex gap-1">
        {[7, 30, 90].map((d) => (
          <button key={d} onClick={() => preset(d)} className="px-2.5 py-1 text-xs font-medium rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">{d}d</button>
        ))}
        <button onClick={thisMonth} className="px-2.5 py-1 text-xs font-medium rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 transition-colors">Este mes</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   My Clock
   ═════════════════════════════════════════════════════════════════════════════ */

function MyClockPanel({ record, liveMinutes, actionLoading, notesText, showNotes, STATUS, lang, fmtTime, onClockIn, onClockOut, onBreak, onNotesChange, onToggleNotes, onSaveNotes, isAdmin }: any) {
  const fmtDisplay = (entry: any, rec: any) => {
    if (!entry) return '-';
    const displayTime = isAdmin ? entry.time : getDisplayTime(entry, rec);
    return fmtTime(displayTime);
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <Clock className="w-6 h-6 text-gray-400" />
        <span className="text-lg font-semibold text-gray-900 dark:text-white">
          {new Date().toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
        {record && (
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${STATUS[record.status].color}`}>
            <span className={`w-2 h-2 rounded-full ${STATUS[record.status].dot} ${record.status === 'active' ? 'animate-pulse' : ''}`} />
            {STATUS[record.status].label}
          </span>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex flex-col items-center gap-6">
          <div className="text-center">
            <p className="text-5xl font-bold tabular-nums text-gray-900 dark:text-white">
              {formatMinutes(record?.status === 'completed' ? record.totalMinutes : liveMinutes)}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {record?.status === 'completed' ? 'Jornada completada' : record?.status === 'active' ? 'Tiempo trabajado' : record?.status === 'break' ? 'En descanso' : 'Sin fichar'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {!record || record.status === 'completed' ? (
              <button onClick={onClockIn} disabled={actionLoading} className="flex items-center gap-2 px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-green-600/25">
                {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                Fichar entrada
              </button>
            ) : (
              <>
                <button onClick={onBreak} disabled={actionLoading} className={`flex items-center gap-2 px-6 py-4 font-semibold rounded-xl transition-colors disabled:opacity-50 ${record.status === 'break' ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-lg shadow-amber-600/25' : 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'}`}>
                  <Coffee className="w-5 h-5" />
                  {record.status === 'break' ? 'Fin descanso' : 'Descanso'}
                </button>
                <button onClick={onClockOut} disabled={actionLoading} className="flex items-center gap-2 px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-red-600/25">
                  {actionLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Square className="w-5 h-5" />}
                  Fichar salida
                </button>
              </>
            )}
          </div>

          {/* Timeline */}
          {record?.entries?.length > 0 && (
            <div className="w-full max-w-md mt-4 space-y-2">
              {record.entries.map((entry: any, i: number) => {
                const lbl: Record<string, string> = { clock_in: 'Entrada', break_start: 'Inicio descanso', break_end: 'Fin descanso', clock_out: 'Salida' };
                const clr: Record<string, string> = { clock_in: 'bg-green-500', break_start: 'bg-amber-500', break_end: 'bg-amber-500', clock_out: 'bg-red-500' };
                const displayTime = isAdmin ? entry.time : getDisplayTime(entry, record);
                const diff = getTimeDiffMinutes(entry, record);
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                    <span className={`w-2 h-2 rounded-full ${clr[entry.type]}`} />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">{lbl[entry.type]}</span>
                    <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400">{fmtTime(displayTime)}</span>
                    {isAdmin && diff !== null && diff !== 0 && (
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${diff > 0 ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'}`}>
                        {diff > 0 ? '+' : ''}{diff}min
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Notes */}
          {record && record.status !== 'completed' && (
            <div className="w-full max-w-md">
              <button onClick={onToggleNotes} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                <StickyNote className="w-4 h-4" /> Notas
              </button>
              {showNotes && (
                <textarea value={notesText} onChange={(e: any) => onNotesChange(e.target.value)} onBlur={onSaveNotes} rows={2} placeholder="Añade notas…" className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none" />
              )}
            </div>
          )}
        </div>
      </div>

      {record && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat icon={<Play className="w-5 h-5" />} label="Entrada" value={fmtDisplay(record.entries.find((e: any) => e.type === 'clock_in'), record)} color="green" sub={record.scheduled_start ? `Horario: ${record.scheduled_start}` : undefined} />
          <Stat icon={<Square className="w-5 h-5" />} label="Salida" value={fmtDisplay(record.entries.find((e: any) => e.type === 'clock_out'), record)} color="red" sub={record.scheduled_end ? `Horario: ${record.scheduled_end}` : undefined} />
          <Stat icon={<Coffee className="w-5 h-5" />} label="Descanso" value={formatMinutes(record.breakMinutes)} color="amber" />
          <Stat icon={<Timer className="w-5 h-5" />} label="Neto" value={formatMinutes(record.status === 'completed' ? record.totalMinutes : liveMinutes)} color="blue" />
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Team
   ═════════════════════════════════════════════════════════════════════════════ */

function TimeDiffBadge({ diff }: { diff: number | null }) {
  if (diff === null || diff === 0) return null;
  const isLate = diff > 0;
  return (
    <span className={`ml-1 inline-flex text-[10px] font-semibold px-1.5 py-0.5 rounded ${isLate ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'}`}>
      {isLate ? '+' : ''}{diff}m
    </span>
  );
}

function TeamPanel({ records, selectedDate, todayStr, activeCount, totalHours, STATUS, fmtTime, onShiftDate, onDateChange, isAdmin, onRecordsUpdate }: any) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEntryIdx, setEditEntryIdx] = useState<number>(-1);
  const [editTimeValue, setEditTimeValue] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const startEdit = (record: any, entryIdx: number) => {
    const entry = record.entries[entryIdx];
    const time = new Date(entry.time);
    setEditingId(record._id);
    setEditEntryIdx(entryIdx);
    setEditTimeValue(`${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditEntryIdx(-1);
    setEditTimeValue('');
  };

  const saveEdit = async (record: any) => {
    if (!editTimeValue || adjusting) return;
    setAdjusting(true);
    try {
      const [h, m] = editTimeValue.split(':').map(Number);
      const newTime = new Date(`${record.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
      await adjustClockinViaApi(record.business_id, record._id, editEntryIdx, newTime.toISOString());
      cancelEdit();
      if (onRecordsUpdate) onRecordsUpdate();
    } catch { /* silent */ }
    finally { setAdjusting(false); }
  };

  return (
    <>
      <div className="flex items-center gap-4">
        <button onClick={() => onShiftDate(-1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><ChevronLeft className="w-5 h-5 text-gray-500" /></button>
        <input type="date" value={selectedDate} onChange={(e: any) => onDateChange(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm" />
        <button onClick={() => onShiftDate(1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><ChevronRight className="w-5 h-5 text-gray-500" /></button>
        <button onClick={() => onDateChange(todayStr)} className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded-lg hover:bg-amber-100 transition-colors">Hoy</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat icon={<Users className="w-5 h-5" />} label="Fichajes del día" value={String(records.length)} color="blue" />
        <Stat icon={<UserCheck className="w-5 h-5" />} label="Activos ahora" value={String(activeCount)} color="green" />
        <Stat icon={<Timer className="w-5 h-5" />} label="Horas totales" value={formatMinutes(totalHours)} color="amber" />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <CalendarDays className="w-10 h-10 mb-3" />
            <p className="text-sm">No hay fichajes para esta fecha</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  {[
                    'Miembro', 'Rol', 'Estado',
                    ...(isAdmin ? ['H. Asignada', 'H. Real', 'Dif.'] : ['Entrada']),
                    ...(isAdmin ? ['H. Asignada', 'H. Real', 'Dif.'] : ['Salida']),
                    'Descanso', 'Neto',
                    ...(isAdmin ? ['Origen', ''] : []),
                  ].map((h, i) => (
                    <th key={`${h}-${i}`} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {records.map((r: EnrichedClockinRecord & { scheduled_start?: string; scheduled_end?: string }) => {
                  const ci = r.entries.find((e) => e.type === 'clock_in');
                  const co = r.entries.find((e) => e.type === 'clock_out');
                  const ciIdx = r.entries.findIndex((e) => e.type === 'clock_in');
                  const coIdx = r.entries.findIndex((e) => e.type === 'clock_out');
                  const sc = STATUS[r.status] || STATUS.completed;
                  const ciDiff = ci ? getTimeDiffMinutes(ci, r as any) : null;
                  const coDiff = co ? getTimeDiffMinutes(co, r as any) : null;

                  const isEditingCi = editingId === r._id && editEntryIdx === ciIdx;
                  const isEditingCo = editingId === r._id && editEntryIdx === coIdx;

                  return (
                    <tr key={r._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-3 py-3 text-sm font-medium text-gray-900 dark:text-white">{r.member_name}</td>
                      <td className="px-3 py-3"><Badge role={r.member_role || 'Usuario'} /></td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${sc.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
                        </span>
                      </td>

                      {isAdmin ? (
                        <>
                          {/* Entrada: Hora asignada */}
                          <td className="px-3 py-3 text-sm tabular-nums text-gray-400">{r.scheduled_start || '-'}</td>
                          {/* Entrada: Hora real */}
                          <td className="px-3 py-3 text-sm tabular-nums text-gray-600 dark:text-gray-300">
                            {isEditingCi ? (
                              <div className="flex items-center gap-1">
                                <input type="time" value={editTimeValue} onChange={(e: any) => setEditTimeValue(e.target.value)} className="px-1.5 py-0.5 text-sm border border-blue-300 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-24" />
                                <button onClick={() => saveEdit(r)} disabled={adjusting} className="p-0.5 text-green-600 hover:text-green-700"><Check className="w-4 h-4" /></button>
                                <button onClick={cancelEdit} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                              </div>
                            ) : (
                              <span>{ci ? fmtTime(ci.time) : '-'}</span>
                            )}
                          </td>
                          {/* Entrada: Diferencia */}
                          <td className="px-3 py-3"><TimeDiffBadge diff={ciDiff} /></td>

                          {/* Salida: Hora asignada */}
                          <td className="px-3 py-3 text-sm tabular-nums text-gray-400">{r.scheduled_end || '-'}</td>
                          {/* Salida: Hora real */}
                          <td className="px-3 py-3 text-sm tabular-nums text-gray-600 dark:text-gray-300">
                            {isEditingCo ? (
                              <div className="flex items-center gap-1">
                                <input type="time" value={editTimeValue} onChange={(e: any) => setEditTimeValue(e.target.value)} className="px-1.5 py-0.5 text-sm border border-blue-300 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-24" />
                                <button onClick={() => saveEdit(r)} disabled={adjusting} className="p-0.5 text-green-600 hover:text-green-700"><Check className="w-4 h-4" /></button>
                                <button onClick={cancelEdit} className="p-0.5 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                              </div>
                            ) : (
                              <span>{co ? fmtTime(co.time) : '-'}</span>
                            )}
                          </td>
                          {/* Salida: Diferencia */}
                          <td className="px-3 py-3"><TimeDiffBadge diff={coDiff} /></td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-3 text-sm tabular-nums text-gray-600 dark:text-gray-300">
                            {ci ? fmtTime(getDisplayTime(ci, r as any)) : '-'}
                          </td>
                          <td className="px-3 py-3 text-sm tabular-nums text-gray-600 dark:text-gray-300">
                            {co ? fmtTime(getDisplayTime(co, r as any)) : '-'}
                          </td>
                        </>
                      )}

                      <td className="px-3 py-3 text-sm tabular-nums text-gray-600 dark:text-gray-300">{formatMinutes(r.breakMinutes)}</td>
                      <td className="px-3 py-3 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{formatMinutes(r.totalMinutes)}</td>

                      {isAdmin && (
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            {(r as any).device_type === 'mobile' && <Smartphone className="w-3.5 h-3.5 text-blue-500" title="Móvil" />}
                            {(r as any).device_type === 'kiosk' && <Fingerprint className="w-3.5 h-3.5 text-indigo-500" title="Terminal" />}
                            {(r as any).device_type === 'desktop' && <Monitor className="w-3.5 h-3.5 text-gray-400" title="PC" />}
                            {!(r as any).device_type && <Monitor className="w-3.5 h-3.5 text-gray-300" title="Sin dato" />}
                            {(r as any).geo && (
                              <a
                                href={`https://maps.google.com/?q=${(r as any).geo.latitude},${(r as any).geo.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-500 hover:text-emerald-600 transition-colors"
                                title={`Ubicación: ${(r as any).geo.latitude.toFixed(5)}, ${(r as any).geo.longitude.toFixed(5)}`}
                              >
                                <MapPin className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </td>
                      )}

                      {isAdmin && (
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            {ci && ciIdx >= 0 && !isEditingCi && (
                              <button onClick={() => startEdit(r, ciIdx)} title="Ajustar entrada" className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-400 hover:text-blue-600 transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {co && coIdx >= 0 && !isEditingCo && (
                              <button onClick={() => startEdit(r, coIdx)} title="Ajustar salida" className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-400 hover:text-blue-600 transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Org chart status
   ═════════════════════════════════════════════════════════════════════════════ */

function OrgPanel({ nodes, edges, loading, STATUS, onRefresh }: { nodes: OrgClockNode[]; edges: OrgClockEdge[]; loading: boolean; STATUS: any; onRefresh: () => void }) {
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  if (!nodes.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Network className="w-12 h-12 mb-3" />
        <p className="text-sm">No hay organigrama configurado</p>
        <p className="text-xs mt-1">Configúralo en la sección de equipo</p>
      </div>
    );
  }

  const rootIds = new Set(nodes.map((n) => n.id));
  for (const e of edges) rootIds.delete(e.target);
  const children: Record<string, string[]> = {};
  for (const e of edges) { (children[e.source] ??= []).push(e.target); }
  const byId: Record<string, OrgClockNode> = {};
  for (const n of nodes) byId[n.id] = n;

  function renderTree(id: string, depth: number): React.ReactNode {
    const n = byId[id];
    if (!n) return null;
    const sc = STATUS[n.clock.status] || STATUS.offline;
    return (
      <div key={id} className={depth > 0 ? 'ml-6 border-l-2 border-gray-200 dark:border-gray-700 pl-4' : ''}>
        <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
            n.clock.status === 'active' ? 'border-green-500 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : n.clock.status === 'break' ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
            : n.clock.status === 'completed' ? 'border-gray-400 bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            : 'border-gray-300 bg-gray-50 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
          }`}>{n.label.charAt(0).toUpperCase()}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{n.label}</p>
            <div className="flex items-center gap-2">
              <Badge role={n.role} />
              {n.clock.clock_in && <span className="text-xs text-gray-400 tabular-nums">desde {new Date(n.clock.clock_in).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${sc.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${n.clock.status === 'active' ? 'animate-pulse' : ''}`} />{sc.label}
          </span>
          {n.clock.totalMinutes > 0 && <span className="text-xs tabular-nums text-gray-500 font-medium">{formatMinutes(n.clock.totalMinutes)}</span>}
        </div>
        {(children[id] || []).map((cid) => renderTree(cid, depth + 1))}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Estado del organigrama — Hoy</h3>
        <button onClick={onRefresh} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
          <Loader2 className="w-3.5 h-3.5" /> Actualizar
        </button>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-1">
        {Array.from(rootIds).map((rid) => renderTree(rid, 0))}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Stats
   ═════════════════════════════════════════════════════════════════════════════ */

function StatsPanel({ stats, loading, from, to, onFromChange, onToChange, onExport }: { stats: ClockinStats | null; loading: boolean; from: string; to: string; onFromChange: (v: string) => void; onToChange: (v: string) => void; onExport?: () => void }) {
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <DateRange from={from} to={to} onFrom={onFromChange} onTo={onToChange} />
      {onExport && (
        <button onClick={onExport} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors border border-emerald-200 dark:border-emerald-800">
          <Download className="w-3.5 h-3.5" /> Exportar CSV
        </button>
      )}
    </div>
  );

  if (loading) return <div className="space-y-6">{header}<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div></div>;
  if (!stats) return <div className="space-y-6">{header}<div className="flex flex-col items-center py-20 text-gray-400"><BarChart3 className="w-12 h-12 mb-3" /><p className="text-sm">Sin datos</p></div></div>;

  const maxMbr = Math.max(...stats.byMember.map((m) => m.totalMinutes), 1);
  const maxDay = Math.max(...stats.byDate.map((d) => d.totalMinutes), 1);

  return (
    <div className="space-y-6">
      {header}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Stat icon={<Timer className="w-5 h-5" />} label="Horas totales" value={formatMinutes(stats.summary.totalMinutes)} color="blue" />
        <Stat icon={<Coffee className="w-5 h-5" />} label="Descansos" value={formatMinutes(stats.summary.totalBreakMinutes)} color="amber" />
        <Stat icon={<CalendarDays className="w-5 h-5" />} label="Sesiones" value={String(stats.summary.totalSessions)} color="purple" />
        <Stat icon={<UserCheck className="w-5 h-5" />} label="Completadas" value={String(stats.summary.completedSessions)} color="green" />
        <Stat icon={<Users className="w-5 h-5" />} label="Empleados" value={String(stats.summary.uniqueMembers)} color="slate" />
        <Stat icon={<Clock className="w-5 h-5" />} label="Media/sesión" value={formatMinutes(stats.summary.avgMinutesPerSession)} color="blue" />
      </div>

      {/* By role */}
      {stats.byRole.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Actividad por rol</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {stats.byRole.map((r) => (
              <div key={r.role} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                <Badge role={r.role} />
                <div className="flex-1 text-right">
                  <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">{formatMinutes(r.totalMinutes)}</p>
                  <p className="text-xs text-gray-500">{r.memberCount} miembros · {r.sessions} sesiones</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By member */}
      {stats.byMember.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Horas por empleado</h4>
          <div className="space-y-3">
            {[...stats.byMember].sort((a, b) => b.totalMinutes - a.totalMinutes).map((m) => (
              <div key={m.member_id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-400">{m.member_name.charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{m.member_name}</span>
                      <Badge role={m.role} />
                    </div>
                    <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">{formatMinutes(m.totalMinutes)}</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${(m.totalMinutes / maxMbr) * 100}%` }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{m.sessions} sesiones · Media: {formatMinutes(m.avgMinutes)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily bar chart */}
      {stats.byDate.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Horas por día</h4>
          <div className="flex items-end gap-1 h-40 overflow-x-auto pb-6">
            {stats.byDate.map((d) => (
              <div key={d.date} className="flex flex-col items-center flex-shrink-0" style={{ minWidth: stats.byDate.length > 31 ? 12 : 24 }}>
                <div className="w-full flex flex-col items-center justify-end" style={{ height: 120 }}>
                  <div className="w-full max-w-[20px] bg-blue-500 dark:bg-blue-400 rounded-t transition-all hover:bg-blue-600" style={{ height: `${Math.max((d.totalMinutes / maxDay) * 120, 2)}px` }} title={`${d.date}: ${formatMinutes(d.totalMinutes)}`} />
                </div>
                {stats.byDate.length <= 31 && <span className="text-[9px] text-gray-400 mt-1 rotate-45 origin-left whitespace-nowrap">{d.date.slice(5)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly */}
      {stats.byMonth.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Resumen mensual</h4>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Mes</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Horas</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Sesiones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {stats.byMonth.map((m) => (
                <tr key={m.month} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">{m.month}</td>
                  <td className="px-3 py-2 text-sm tabular-nums text-right text-gray-700 dark:text-gray-300">{formatMinutes(m.totalMinutes)}</td>
                  <td className="px-3 py-2 text-sm tabular-nums text-right text-gray-500">{m.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Performance
   ═════════════════════════════════════════════════════════════════════════════ */

function PerformancePanel({ data, loading, from, to, onFromChange, onToChange }: { data: MemberPerformance[]; loading: boolean; from: string; to: string; onFromChange: (v: string) => void; onToChange: (v: string) => void }) {
  const header = <DateRange from={from} to={to} onFrom={onFromChange} onTo={onToChange} />;
  if (loading) return <div className="space-y-6">{header}<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div></div>;

  const hasData = data.some((p) => p.hoursWorked > 0 || p.salesCount > 0);

  return (
    <div className="space-y-6">
      {header}
      {!hasData ? (
        <div className="flex flex-col items-center py-20 text-gray-400">
          <TrendingUp className="w-12 h-12 mb-3" />
          <p className="text-sm">Sin datos de rendimiento para este período</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Rendimiento: fichajes vs. ventas</h4>
            <p className="text-xs text-gray-500 mt-0.5">Análisis cruzado de horas trabajadas y actividad comercial</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                  {['Miembro', 'Rol', 'Horas', 'Sesiones', 'Ventas', 'Importe', 'Ventas/h', '€/h'].map((h, i) => (
                    <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase ${i >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {data.map((p) => (
                  <tr key={p.member_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{p.member_name}</td>
                    <td className="px-4 py-3"><Badge role={p.role} /></td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right text-gray-700 dark:text-gray-300">{p.hoursWorked.toFixed(1)}h</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right text-gray-500">{p.sessions}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right text-gray-700 dark:text-gray-300">{p.salesCount}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right text-gray-700 dark:text-gray-300">
                      {p.salesAmount > 0 ? `${p.salesAmount.toLocaleString('es-ES')} €` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right font-medium">
                      <span className={p.salesPerHour > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>{p.salesPerHour.toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right font-bold">
                      <span className={p.revenuePerHour > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}>
                        {p.revenuePerHour > 0 ? `${p.revenuePerHour.toLocaleString('es-ES')} €` : '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Alerts
   ═════════════════════════════════════════════════════════════════════════════ */

function AlertsPanel({ alerts, loading, onAcknowledge, onRefresh }: { alerts: ClockinAlert[]; loading: boolean; onAcknowledge: (id: string, action: 'acknowledge' | 'resolve') => void; onRefresh: () => void }) {
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('active');

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  const filtered = alerts.filter((a) => {
    if (filterType !== 'all' && a.alert_type !== filterType) return false;
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    return true;
  });

  const counts = {
    no_clockin: alerts.filter((a) => a.alert_type === 'no_clockin' && a.status === 'active').length,
    late: alerts.filter((a) => a.alert_type === 'late' && a.status === 'active').length,
    excess_hours: alerts.filter((a) => a.alert_type === 'excess_hours' && a.status === 'active').length,
    incomplete: alerts.filter((a) => a.alert_type === 'incomplete' && a.status === 'active').length,
  };

  const ALERT_ICONS: Record<string, React.ReactNode> = {
    no_clockin: <UserX className="w-5 h-5" />,
    late: <Clock className="w-5 h-5" />,
    excess_hours: <AlertTriangle className="w-5 h-5" />,
    incomplete: <FileWarning className="w-5 h-5" />,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {(['all', 'no_clockin', 'late', 'excess_hours', 'incomplete'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                filterType === type
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {type === 'all' ? 'Todas' : ALERT_TYPE_CONFIG[type].label}
              {type !== 'all' && counts[type] > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[9px] font-bold rounded-full bg-red-500 text-white">{counts[type]}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300">
            <option value="all">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="acknowledged">Reconocidas</option>
            <option value="resolved">Resueltas</option>
          </select>
          <button onClick={onRefresh} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
            <Loader2 className="w-3.5 h-3.5" /> Actualizar
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={<UserX className="w-5 h-5" />} label="Sin fichar" value={String(counts.no_clockin)} color="red" />
        <Stat icon={<Clock className="w-5 h-5" />} label="Retrasos" value={String(counts.late)} color="amber" />
        <Stat icon={<AlertTriangle className="w-5 h-5" />} label="Exceso horas" value={String(counts.excess_hours)} color="purple" />
        <Stat icon={<FileWarning className="w-5 h-5" />} label="Incompletos" value={String(counts.incomplete)} color="blue" />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <CheckCircle2 className="w-12 h-12 mb-3 text-green-400" />
          <p className="text-sm font-medium text-green-600 dark:text-green-400">Todo en orden</p>
          <p className="text-xs text-gray-400 mt-1">No hay alertas {filterStatus !== 'all' ? `con estado "${filterStatus}"` : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((alert) => {
            const cfg = ALERT_TYPE_CONFIG[alert.alert_type];
            return (
              <div key={alert._id} className={`bg-white dark:bg-gray-800 rounded-xl border-l-4 ${
                alert.severity === 'critical' ? 'border-l-red-500' : 'border-l-amber-500'
              } border border-gray-200 dark:border-gray-700 p-4`}>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${cfg.bgColor}`}>
                    <span className={cfg.color}>{ALERT_ICONS[alert.alert_type]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">{alert.member_name}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        alert.severity === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}>{alert.severity === 'critical' ? 'Crítica' : 'Aviso'}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.bgColor} ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                      <p>Fecha: {alert.date}</p>
                      {alert.details.scheduled_start && <p>Horario: {alert.details.scheduled_start}{alert.details.scheduled_end ? ` - ${alert.details.scheduled_end}` : ''}</p>}
                      {alert.details.actual_start && <p>Hora real: {new Date(alert.details.actual_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
                      {alert.details.delay_minutes != null && <p>Retraso: <span className="font-semibold text-red-600 dark:text-red-400">{alert.details.delay_minutes} min</span></p>}
                      {alert.details.worked_minutes != null && <p>Horas trabajadas: {formatMinutes(alert.details.worked_minutes)} (máx: {formatMinutes(alert.details.max_minutes || 0)})</p>}
                      {alert.details.missing_entry && <p>Falta: <span className="font-semibold">fichaje de salida</span></p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {alert.status === 'active' && (
                      <>
                        <button onClick={() => onAcknowledge(alert._id, 'acknowledge')} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 transition-colors" title="Reconocer">
                          Reconocer
                        </button>
                        <button onClick={() => onAcknowledge(alert._id, 'resolve')} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 transition-colors" title="Resolver">
                          Resolver
                        </button>
                      </>
                    )}
                    {alert.status === 'acknowledged' && (
                      <button onClick={() => onAcknowledge(alert._id, 'resolve')} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 transition-colors">
                        Resolver
                      </button>
                    )}
                    {alert.status === 'resolved' && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-green-600 dark:text-green-400"><CheckCircle2 className="w-3 h-3" />Resuelta</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Absenteeism
   ═════════════════════════════════════════════════════════════════════════════ */

function AbsenteeismPanel({ report, summary, loading, from, to, onFromChange, onToChange }: { report: AbsenteeismDay[]; summary: AbsenteeismSummary | null; loading: boolean; from: string; to: string; onFromChange: (v: string) => void; onToChange: (v: string) => void }) {
  const header = <DateRange from={from} to={to} onFrom={onFromChange} onTo={onToChange} />;

  if (loading) return <div className="space-y-6">{header}<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div></div>;

  return (
    <div className="space-y-6">
      {header}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat icon={<CalendarDays className="w-5 h-5" />} label="Días evaluados" value={String(summary.totalDays)} color="blue" />
          <Stat icon={<Users className="w-5 h-5" />} label="Fichajes esperados" value={String(summary.totalExpected)} color="slate" />
          <Stat icon={<UserCheck className="w-5 h-5" />} label="Presentes" value={String(summary.totalPresent)} color="green" />
          <Stat icon={<UserMinus className="w-5 h-5" />} label="Ausencias" value={String(summary.totalAbsent)} color="red" />
          <Stat icon={<TrendingUp className="w-5 h-5" />} label="Tasa absentismo" value={`${summary.overallRate}%`} color={summary.overallRate > 10 ? 'red' : summary.overallRate > 5 ? 'amber' : 'green'} />
        </div>
      )}

      {report.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-gray-400">
          <UserMinus className="w-12 h-12 mb-3" />
          <p className="text-sm">Sin datos de absentismo para este período</p>
          <p className="text-xs mt-1">Asegúrate de que los miembros tienen horarios asignados</p>
        </div>
      ) : (
        <div className="space-y-4">
          {report.map((day) => (
            <div key={day.date} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <CalendarDays className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{day.date}</span>
                  <span className="text-xs text-gray-500">{day.expected.length} esperados</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">{day.present.length} presentes</span>
                  {day.absent.length > 0 && (
                    <span className="text-xs text-red-600 dark:text-red-400 font-bold">{day.absent.length} ausentes</span>
                  )}
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    day.rate > 10 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : day.rate > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  }`}>{day.rate}%</span>
                </div>
              </div>
              {day.absent.length > 0 && (
                <div className="p-4">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-2">Ausentes:</p>
                  <div className="flex flex-wrap gap-2">
                    {day.absent.map((a) => (
                      <div key={a.member_id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                        <div className="w-6 h-6 rounded-full bg-red-200 dark:bg-red-800 flex items-center justify-center text-[10px] font-bold text-red-700 dark:text-red-300">{a.member_name.charAt(0).toUpperCase()}</div>
                        <span className="text-xs font-medium text-red-700 dark:text-red-400">{a.member_name}</span>
                        <span className="text-[10px] text-red-400">{a.scheduled_start}-{a.scheduled_end}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Overtime
   ═════════════════════════════════════════════════════════════════════════════ */

function OvertimePanel({ report, summary, loading, from, to, onFromChange, onToChange }: { report: OvertimeMember[]; summary: OvertimeSummary | null; loading: boolean; from: string; to: string; onFromChange: (v: string) => void; onToChange: (v: string) => void }) {
  const header = <DateRange from={from} to={to} onFrom={onFromChange} onTo={onToChange} />;

  if (loading) return <div className="space-y-6">{header}<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div></div>;

  return (
    <div className="space-y-6">
      {header}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat icon={<Hourglass className="w-5 h-5" />} label="Total horas extra" value={formatMinutes(summary.totalOvertime)} color="red" />
          <Stat icon={<Timer className="w-5 h-5" />} label="Total trabajado" value={formatMinutes(summary.totalWorked)} color="blue" />
          <Stat icon={<CalendarDays className="w-5 h-5" />} label="Total asignado" value={formatMinutes(summary.totalScheduled)} color="slate" />
          <Stat icon={<Users className="w-5 h-5" />} label="Con horas extra" value={String(summary.membersWithOvertime)} color="amber" />
        </div>
      )}

      {report.length === 0 || !report.some((r) => r.overtime_minutes > 0 || r.worked_minutes > 0) ? (
        <div className="flex flex-col items-center py-20 text-gray-400">
          <Hourglass className="w-12 h-12 mb-3" />
          <p className="text-sm">Sin datos de horas extra para este período</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                  {['Miembro', 'Rol', 'Asignado', 'Trabajado', 'Horas extra', 'Diferencia'].map((h, i) => (
                    <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase ${i >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {report.filter((r) => r.worked_minutes > 0 || r.overtime_minutes > 0).map((r) => {
                  const diff = r.worked_minutes - r.scheduled_minutes;
                  return (
                    <tr key={r.member_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-400">{r.member_name.charAt(0).toUpperCase()}</div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{r.member_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><Badge role={r.role} /></td>
                      <td className="px-4 py-3 text-sm tabular-nums text-right text-gray-500">{formatMinutes(r.scheduled_minutes)}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-right text-gray-700 dark:text-gray-300 font-medium">{formatMinutes(r.worked_minutes)}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-right">
                        <span className={`font-bold ${r.overtime_minutes > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`}>
                          {r.overtime_minutes > 0 ? formatMinutes(r.overtime_minutes) : '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-right">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                          diff > 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : diff < 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-gray-100 text-gray-500'
                        }`}>
                          {diff > 0 ? '+' : ''}{formatMinutes(Math.abs(diff))}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
