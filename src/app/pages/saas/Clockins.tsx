import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Search,
  ChevronDown,
  ChevronUp,
  Plane,
  UserPlus,
  List as ListIcon,
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
  updateClockinDate,
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
  fetchDailySummary,
} from '../../lib/clockinsApi';
import type { DailySummary } from '../../lib/clockinsApi';
import type { ClockinAlert, AlertsSummary } from '../../lib/clockinAlertsApi';
import {
  generateAlerts,
  fetchAlerts,
  fetchAlertsSummary,
  acknowledgeAlert as ackAlert,
  ALERT_TYPE_CONFIG,
} from '../../lib/clockinAlertsApi';
import { listVacations, type VacationRequest } from '../../lib/vacationsApi';
import { ClockinsManagerTeamView } from '../../components/saas/clockins/ClockinsManagerTeamView';
import { ClockinHistoryPanel } from '../../components/saas/clockins/ClockinHistoryPanel';
import { resolveClockinMemberName } from '../../lib/clockinsDisplay';

// ── Pestañas (3 nivel superior) + sub-pestañas dentro de Análisis ───────────
type Tab = 'team' | 'analysis' | 'alerts';
type AnalysisSubTab = 'stats' | 'performance' | 'absenteeism' | 'overtime';
type TodayView = 'list' | 'org';

const SCHEDULES_PATH = '/saas/equipo/horarios-vacaciones';

export function Clockins() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlMemberId = searchParams.get('memberId') || '';
  const businessId = currentBusiness?.business_id || '';

  const myMember = useMemo(
    () => currentBusiness?.members?.find((m) => m.user_id === user?.user_id),
    [currentBusiness, user?.user_id],
  );
  const { activeWorkCenters, hasWorkCenters } = useWorkCenters();
  const myRole = myMember?.role || user?.role || 'Usuario';
  const isAdmin = myRole === 'Admin' || myRole === 'Gerente';

  // Una sola jerarquía de 3 pestañas. El "mi fichaje" ya no es pestaña: vive
  // siempre en una barra superior compacta, así el CEO puede fichar sin perder
  // de vista al equipo.
  const [tab, setTab] = useState<Tab>('team');
  const [analysisSubTab, setAnalysisSubTab] = useState<AnalysisSubTab>('stats');
  const [todayView, setTodayView] = useState<TodayView>('list');

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
  const [filterRole, setFilterRole] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [myClockExpanded, setMyClockExpanded] = useState(false);
  const [myClockBarVisible, setMyClockBarVisible] = useState(false);
  const [manualClockOpen, setManualClockOpen] = useState(false);

  // Vacaciones aprobadas, usadas para cruzar contra absentismo y marcar
  // ausencias justificadas en vez de ausencias "sin más".
  const [approvedVacations, setApprovedVacations] = useState<VacationRequest[]>([]);

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

  /**
   * Resumen del día (scheduled, late, no-show, etc.) que muestra el hero card
   * encima del listado. Se refresca al entrar en la página y cuando llega
   * cualquier notificación SSE de tipo fichaje (vía evento DOM emitido en el
   * provider). Solo se carga si el usuario es Admin/Gerente.
   */
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [dailySummaryLoading, setDailySummaryLoading] = useState(false);

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

  const loadApprovedVacations = useCallback(async () => {
    if (!businessId) return;
    try {
      const vacs = await listVacations(businessId, { status: 'approved' });
      setApprovedVacations(vacs);
    } catch { /* no bloqueante */ }
  }, [businessId]);

  /* ── Effects ── */

  useEffect(() => {
    if (!urlMemberId || !currentBusiness?.members?.length) return;
    const member = currentBusiness.members.find((m) => m.user_id === urlMemberId);
    if (member) {
      setSearchText(String(member.fullName || member.email || '').trim());
    }
  }, [urlMemberId, currentBusiness?.members]);

  const loadDailySummary = useCallback(async () => {
    if (!businessId || !isAdmin) return;
    setDailySummaryLoading(true);
    try {
      const s = await fetchDailySummary(businessId, selectedDate);
      setDailySummary(s);
    } catch (err) {
      console.error('Error cargando resumen diario:', err);
    } finally {
      setDailySummaryLoading(false);
    }
  }, [businessId, isAdmin, selectedDate]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadMyRecord();
      await loadTeamRecords();
      await loadActiveNow();
      if (isAdmin) {
        loadAlertsSummaryOnly();
        loadApprovedVacations();
        loadDailySummary();
      }
      setLoading(false);
    })();
  }, [businessId, user?.user_id]);

  /**
   * Refresca el resumen cuando llega un evento de fichaje al campanario SSE.
   * Así el card se mantiene vivo sin necesidad de recargar la página.
   */
  useEffect(() => {
    if (!isAdmin) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.category === 'clockin') {
        loadDailySummary();
      }
    };
    window.addEventListener('vertial:notification', handler);
    return () => window.removeEventListener('vertial:notification', handler);
  }, [isAdmin, loadDailySummary]);

  // Fecha cambia en la pestaña Equipo: recarga la tabla del día y el resumen.
  useEffect(() => {
    loadTeamRecords();
    if (isAdmin) loadDailySummary();
  }, [selectedDate]);

  // Organigrama: se carga sólo al activar su vista dentro de Equipo.
  useEffect(() => {
    if (tab === 'team' && todayView === 'org') loadOrgStatus();
  }, [tab, todayView]);

  // Análisis: cada sub-pestaña dispara su propio fetch cuando se activa o
  // cuando cambia el rango. DateRange está compartido para todas las sub-vistas.
  useEffect(() => {
    if (tab !== 'analysis') return;
    if (analysisSubTab === 'stats') loadStats();
    if (analysisSubTab === 'performance' && isAdmin) loadPerformance();
    if (analysisSubTab === 'absenteeism' && isAdmin) {
      loadAbsenteeism();
      loadApprovedVacations();
    }
    if (analysisSubTab === 'overtime') loadOvertime();
  }, [tab, analysisSubTab, statsFrom, statsTo, isAdmin]);

  useEffect(() => { if (tab === 'alerts' && isAdmin) loadAlerts(); }, [tab]);

  useEffect(() => {
    if (myRecord?.status === 'active' || myRecord?.status === 'break') {
      const iv = setInterval(() => setTick((prev) => prev + 1), 60000);
      return () => clearInterval(iv);
    }
  }, [myRecord?.status]);

  // Una sola ronda de polling en Equipo: refresca activos-ahora siempre y, si
  // está activa la vista de organigrama, también el árbol.
  useEffect(() => {
    if (tab !== 'team') return;
    const iv = setInterval(() => {
      loadActiveNow();
      if (todayView === 'org') loadOrgStatus();
    }, 30000);
    return () => clearInterval(iv);
  }, [tab, todayView]);

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

  // Roles disponibles en la empresa (para el filtro). Únicos, ordenados.
  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    for (const m of currentBusiness?.members || []) if (m.role) set.add(m.role);
    return Array.from(set).sort();
  }, [currentBusiness?.members]);

  // Top-level: solo 3 pestañas (antes 8). El "Mi fichaje" ya no es pestaña.
  // Análisis agrupa Estadísticas / Rendimiento / Absentismo / Horas extra
  // bajo un único date-range para evitar reselecciones al cambiar de vista.
  const tabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'team',     label: 'Equipo',   icon: <Users className="w-4 h-4" /> },
    { id: 'analysis', label: 'Análisis', icon: <BarChart3 className="w-4 h-4" /> },
    ...(isAdmin ? [{ id: 'alerts' as Tab, label: 'Alertas', icon: <Bell className="w-4 h-4" />, badge: alertBadge }] : []),
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

        {/* Mi fichaje: colapsado para gerentes (prioridad = vista del equipo) */}
        {isAdmin && !myClockBarVisible ? (
          <button
            type="button"
            onClick={() => setMyClockBarVisible(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
          >
            <Clock className="w-4 h-4 text-gray-400" />
            Tu fichaje
            {myRecord && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${(STATUS[myRecord.status] || STATUS.offline).color}`}>
                {(STATUS[myRecord.status] || STATUS.offline).label}
              </span>
            )}
            <ChevronDown className="w-4 h-4 ml-auto text-gray-400" />
          </button>
        ) : (
          <div className="relative">
            {isAdmin && (
              <button
                type="button"
                onClick={() => { setMyClockBarVisible(false); setMyClockExpanded(false); }}
                className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                title="Ocultar tu fichaje"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <MyClockBar
              record={myRecord}
              liveMinutes={liveMinutes}
              actionLoading={actionLoading}
              expanded={myClockExpanded}
              onToggle={() => setMyClockExpanded((v) => !v)}
              notesText={notesText}
              showNotes={showNotes}
              STATUS={STATUS}
              lang={lang}
              fmtTime={fmtTime}
              isAdmin={isAdmin}
              onClockIn={handleClockIn}
              onClockOut={handleClockOut}
              onBreak={handleBreak}
              onNotesChange={setNotesText}
              onToggleNotes={() => setShowNotes(!showNotes)}
              onSaveNotes={handleSaveNotes}
            />
          </div>
        )}

        {/* Resumen del día en tarjeta aparte solo para no-admin */}
        {!isAdmin && (
          <DailySummaryCard
            summary={dailySummary}
            loading={dailySummaryLoading}
            onRefresh={loadDailySummary}
          />
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

        {urlMemberId && (
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm">
            <span className="text-blue-800 dark:text-blue-200">Viendo un miembro concreto del equipo.</span>
            <button
              type="button"
              onClick={() => navigate(`/saas/team/${urlMemberId}?tab=clockins`)}
              className="font-semibold text-blue-700 dark:text-blue-300 hover:underline"
            >
              Historial completo
            </button>
            <button
              type="button"
              onClick={() => { setSearchParams({}); setSearchText(''); }}
              className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Ver todo el equipo
            </button>
          </div>
        )}

        {/* Tabs (3 niveles superiores) */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl overflow-x-auto">
          {tabs.map((td) => (
            <button
              key={td.id}
              onClick={() => setTab(td.id)}
              className={`relative flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                tab === td.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {td.icon}{td.label}
              {td.badge && td.badge > 0 ? (
                <span className="ml-1 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-red-500 text-white">{td.badge > 99 ? '99+' : td.badge}</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* ─── Equipo ─── */}
        {tab === 'team' && isAdmin ? (
          <div className="space-y-6">
            <ClockinsManagerTeamView
              businessId={businessId}
              records={filteredTeamRecords}
              selectedDate={selectedDate}
              todayStr={todayStr}
              activeMembers={filteredActiveNow}
              totalHours={todayTotalHours}
              dailySummary={dailySummary}
              dailySummaryLoading={dailySummaryLoading}
              fmtTime={fmtTime}
              isAdmin={isAdmin}
              searchText={searchText}
              onSearchChange={setSearchText}
              filterRole={filterRole}
              onFilterRoleChange={setFilterRole}
              availableRoles={availableRoles}
              onShiftDate={shiftDate}
              onDateChange={setSelectedDate}
              onRecordsUpdate={() => { loadTeamRecords(); loadDailySummary(); loadActiveNow(); }}
              onOpenManualClockin={() => setManualClockOpen(true)}
              onEditSchedule={(memberId) => navigate(`${SCHEDULES_PATH}?member=${encodeURIComponent(memberId)}`)}
              onViewMemberHistory={(memberId) => navigate(`/saas/team/${memberId}?tab=clockins`)}
              businessMembers={(currentBusiness?.members || []).filter((m) => {
                const email = String(m.email || '').toLowerCase();
                const name = String(m.fullName || '').trim();
                if (email.endsWith('@test.local')) return false;
                if (/^demo(\s|$)/i.test(name)) return false;
                return true;
              })}
              STATUS={STATUS}
            />
            <ClockinHistoryPanel
              businessId={businessId}
              memberId={user?.user_id || ''}
              managerView
            />
          </div>
        ) : tab === 'team' ? (
          <TeamPanel
            records={filteredTeamRecords}
            selectedDate={selectedDate}
            todayStr={todayStr}
            activeCount={filteredActiveNow.length}
            activeMembers={filteredActiveNow}
            totalHours={todayTotalHours}
            STATUS={STATUS}
            fmtTime={fmtTime}
            onShiftDate={shiftDate}
            onDateChange={setSelectedDate}
            isAdmin={isAdmin}
            onRecordsUpdate={loadTeamRecords}
            searchText={searchText}
            onSearchChange={setSearchText}
            filterRole={filterRole}
            onFilterRoleChange={setFilterRole}
            filterWorkCenter={filterWorkCenter}
            onFilterWorkCenterChange={setFilterWorkCenter}
            activeWorkCenters={activeWorkCenters}
            hasWorkCenters={hasWorkCenters}
            availableRoles={availableRoles}
            todayView={todayView}
            onTodayViewChange={setTodayView}
            orgNodes={filteredOrgNodes}
            orgEdges={filteredOrgEdges}
            orgLoading={orgLoading}
            onOrgRefresh={loadOrgStatus}
            onOpenManualClockin={() => setManualClockOpen(true)}
            onEditSchedule={(memberId) => navigate(`${SCHEDULES_PATH}?member=${encodeURIComponent(memberId)}`)}
            onViewMemberHistory={(memberId) => navigate(`/saas/team/${memberId}?tab=clockins`)}
            businessMembers={currentBusiness?.members}
          />
        ) : null}

        {/* ─── Análisis (sub-pestañas con DateRange compartido) ─── */}
        {tab === 'analysis' && (
          <AnalysisPanel
            subTab={analysisSubTab}
            onSubTabChange={setAnalysisSubTab}
            from={statsFrom}
            to={statsTo}
            onFromChange={setStatsFrom}
            onToChange={setStatsTo}
            stats={filteredStats}
            statsLoading={statsLoading}
            performance={filteredPerformance}
            perfLoading={perfLoading}
            absentReport={absentReport}
            absentSummary={absentSummary}
            absentLoading={absentLoading}
            approvedVacations={approvedVacations}
            overtimeReport={overtimeReport}
            overtimeSummary={overtimeSummary}
            overtimeLoading={overtimeLoading}
            isAdmin={isAdmin}
            onExport={handleExport}
          />
        )}

        {/* ─── Alertas ─── */}
        {tab === 'alerts' && isAdmin && (
          <AlertsPanel alerts={alerts} loading={alertsLoading} onAcknowledge={handleAcknowledgeAlert} onRefresh={loadAlerts} />
        )}

        {/* Modal "Fichar en su nombre" (solo admin) */}
        {manualClockOpen && isAdmin && (
          <ManualClockinModal
            businessId={businessId}
            members={(currentBusiness?.members || []).filter((m) => m.user_id !== user?.user_id)}
            actingUserName={user?.fullName || user?.email || 'Admin'}
            onClose={() => setManualClockOpen(false)}
            onCreated={() => { setManualClockOpen(false); loadTeamRecords(); loadActiveNow(); }}
          />
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
   Mi fichaje — Barra compacta, siempre visible
   ─────────────────────────────────────────────────────────────────────────────
   Reemplaza la antigua pestaña «Mi fichaje». El CEO puede fichar entrada,
   descanso y salida sin abandonar la vista del equipo. Al expandir se ve el
   timeline detallado, las notas y los stats del día.
   ═════════════════════════════════════════════════════════════════════════════ */

interface MyClockBarProps {
  record: ClockinRecord | null;
  liveMinutes: number;
  actionLoading: boolean;
  expanded: boolean;
  onToggle: () => void;
  notesText: string;
  showNotes: boolean;
  STATUS: Record<string, { label: string; color: string; dot: string }>;
  lang: string;
  fmtTime: (iso: string) => string;
  isAdmin: boolean;
  onClockIn: () => void;
  onClockOut: () => void;
  onBreak: () => void;
  onNotesChange: (v: string) => void;
  onToggleNotes: () => void;
  onSaveNotes: () => void;
}

function MyClockBar({
  record, liveMinutes, actionLoading, expanded, onToggle, notesText, showNotes,
  STATUS, lang, fmtTime, isAdmin, onClockIn, onClockOut, onBreak,
  onNotesChange, onToggleNotes, onSaveNotes,
}: MyClockBarProps) {
  const status = record?.status || 'offline';
  const sc = STATUS[status];
  const elapsed = record?.status === 'completed' ? record.totalMinutes : liveMinutes;
  const todayLabel = new Date().toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' });

  const fmtDisplay = (entry: any, rec: any) => {
    if (!entry) return '-';
    const displayTime = isAdmin ? entry.time : getDisplayTime(entry, rec);
    return fmtTime(displayTime);
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Cabecera compacta: estado + cronómetro + botones */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : status === 'break' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
            : status === 'completed' ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
            : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
          }`}>
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">Mi fichaje</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sc.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${status === 'active' ? 'animate-pulse' : ''}`} />
                {sc.label}
              </span>
              <span className="text-xs text-gray-400 hidden sm:inline">· {todayLabel}</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold tabular-nums text-gray-900 dark:text-white mt-0.5">
              {formatMinutes(elapsed)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!record || record.status === 'completed' ? (
            <button
              onClick={onClockIn}
              disabled={actionLoading}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-sm"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Fichar entrada
            </button>
          ) : (
            <>
              <button
                onClick={onBreak}
                disabled={actionLoading}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 ${
                  record.status === 'break'
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                }`}
              >
                <Coffee className="w-4 h-4" />
                {record.status === 'break' ? 'Fin descanso' : 'Descanso'}
              </button>
              <button
                onClick={onClockOut}
                disabled={actionLoading}
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-sm"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                Fichar salida
              </button>
            </>
          )}
          <button
            onClick={onToggle}
            className="p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
            title={expanded ? 'Ocultar detalle' : 'Ver detalle'}
            aria-label={expanded ? 'Ocultar detalle de mi fichaje' : 'Ver detalle de mi fichaje'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Detalle expandible: stats, timeline y notas */}
      {expanded && record && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4 bg-gray-50/50 dark:bg-gray-900/20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={<Play className="w-4 h-4" />} label="Entrada" value={fmtDisplay(record.entries.find((e: any) => e.type === 'clock_in'), record)} color="green" sub={record.scheduled_start ? `Horario: ${record.scheduled_start}` : undefined} />
            <Stat icon={<Square className="w-4 h-4" />} label="Salida" value={fmtDisplay(record.entries.find((e: any) => e.type === 'clock_out'), record)} color="red" sub={record.scheduled_end ? `Horario: ${record.scheduled_end}` : undefined} />
            <Stat icon={<Coffee className="w-4 h-4" />} label="Descanso" value={formatMinutes(record.breakMinutes)} color="amber" />
            <Stat icon={<Timer className="w-4 h-4" />} label="Neto" value={formatMinutes(record.status === 'completed' ? record.totalMinutes : liveMinutes)} color="blue" />
          </div>

          {record.entries?.length > 0 && (
            <div className="space-y-1.5">
              {record.entries.map((entry, i) => {
                const lbl: Record<string, string> = { clock_in: 'Entrada', break_start: 'Inicio descanso', break_end: 'Fin descanso', clock_out: 'Salida' };
                const clr: Record<string, string> = { clock_in: 'bg-green-500', break_start: 'bg-amber-500', break_end: 'bg-amber-500', clock_out: 'bg-red-500' };
                const displayTime = isAdmin ? entry.time : getDisplayTime(entry, record);
                const diff = getTimeDiffMinutes(entry, record);
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                    <span className={`w-2 h-2 rounded-full ${clr[entry.type]}`} />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 flex-1">{lbl[entry.type]}</span>
                    <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{fmtTime(displayTime)}</span>
                    {isAdmin && diff !== null && diff !== 0 && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${diff > 0 ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'}`}>
                        {diff > 0 ? '+' : ''}{diff}min
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {record.status !== 'completed' && (
            <div>
              <button onClick={onToggleNotes} className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                <StickyNote className="w-3.5 h-3.5" /> Notas {showNotes ? '(ocultar)' : ''}
              </button>
              {showNotes && (
                <textarea
                  value={notesText}
                  onChange={(e) => onNotesChange(e.target.value)}
                  onBlur={onSaveNotes}
                  rows={2}
                  placeholder="Añade notas…"
                  className="mt-2 w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
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

interface TeamPanelProps {
  records: EnrichedClockinRecord[];
  selectedDate: string;
  todayStr: string;
  activeCount: number;
  activeMembers: ActiveMember[];
  totalHours: number;
  STATUS: Record<string, { label: string; color: string; dot: string }>;
  fmtTime: (iso: string) => string;
  onShiftDate: (days: number) => void;
  onDateChange: (date: string) => void;
  isAdmin: boolean;
  onRecordsUpdate: () => void;
  searchText: string;
  onSearchChange: (v: string) => void;
  filterRole: string;
  onFilterRoleChange: (v: string) => void;
  filterWorkCenter: string;
  onFilterWorkCenterChange: (v: string) => void;
  activeWorkCenters: { id: string; name: string }[];
  hasWorkCenters: boolean;
  availableRoles: string[];
  todayView: TodayView;
  onTodayViewChange: (v: TodayView) => void;
  orgNodes: OrgClockNode[];
  orgEdges: OrgClockEdge[];
  orgLoading: boolean;
  onOrgRefresh: () => void;
  onOpenManualClockin: () => void;
  onEditSchedule: (memberId: string) => void;
  onViewMemberHistory: (memberId: string) => void;
  businessMembers?: { user_id: string; fullName?: string; email?: string }[];
}

function TeamPanel({
  records, selectedDate, todayStr, activeCount, activeMembers, totalHours, STATUS, fmtTime,
  onShiftDate, onDateChange, isAdmin, onRecordsUpdate,
  searchText, onSearchChange, filterRole, onFilterRoleChange,
  filterWorkCenter, onFilterWorkCenterChange, activeWorkCenters, hasWorkCenters, availableRoles,
  todayView, onTodayViewChange, orgNodes, orgEdges, orgLoading, onOrgRefresh,
  onOpenManualClockin, onEditSchedule, onViewMemberHistory, businessMembers = [],
}: TeamPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEntryIdx, setEditEntryIdx] = useState<number>(-1);
  const [editTimeValue, setEditTimeValue] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const startEdit = (record: EnrichedClockinRecord, entryIdx: number) => {
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

  const saveEdit = async (record: EnrichedClockinRecord) => {
    if (!editTimeValue || adjusting) return;
    setAdjusting(true);
    try {
      const [h, m] = editTimeValue.split(':').map(Number);
      const newTime = new Date(`${record.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`);
      await adjustClockinViaApi(record.business_id, record._id, editEntryIdx, newTime.toISOString());
      cancelEdit();
      onRecordsUpdate();
    } catch { /* silent */ }
    finally { setAdjusting(false); }
  };

  // Búsqueda y filtros aplicados al listado del día.
  const visibleRecords = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    return records.filter((r) => {
      if (filterRole !== 'all' && r.member_role !== filterRole) return false;
      if (needle && !r.member_name.toLowerCase().includes(needle) && !r.member_email?.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [records, searchText, filterRole]);

  return (
    <>
      {/* Banner activos ahora */}
      {activeMembers.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm font-medium text-green-700 dark:text-green-400">
            {activeMembers.length} {activeMembers.length === 1 ? 'persona activa' : 'personas activas'} ahora
          </span>
          <div className="flex -space-x-2">
            {activeMembers.slice(0, 6).map((a) => (
              <div key={a.member_id} className="w-7 h-7 rounded-full bg-green-200 dark:bg-green-800 flex items-center justify-center text-xs font-bold text-green-800 dark:text-green-200 border-2 border-white dark:border-gray-900" title={a.member_name}>
                {a.member_name.charAt(0).toUpperCase()}
              </div>
            ))}
            {activeMembers.length > 6 && (
              <div className="w-7 h-7 rounded-full bg-green-300 dark:bg-green-700 flex items-center justify-center text-xs font-bold border-2 border-white dark:border-gray-900">+{activeMembers.length - 6}</div>
            )}
          </div>
        </div>
      )}

      {/* Toolbar: navegación de fecha, búsqueda, filtros, acciones admin */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => onShiftDate(-1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Día anterior"><ChevronLeft className="w-5 h-5 text-gray-500" /></button>
          <input type="date" value={selectedDate} onChange={(e) => onDateChange(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm" />
          <button onClick={() => onShiftDate(1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Día siguiente"><ChevronRight className="w-5 h-5 text-gray-500" /></button>
          <button onClick={() => onDateChange(todayStr)} className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded-lg hover:bg-amber-100 transition-colors">Hoy</button>

          {/* Toggle lista / organigrama */}
          <div className="ml-auto flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <button
              onClick={() => onTodayViewChange('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${todayView === 'list' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
              title="Vista de lista"
            >
              <ListIcon className="w-3.5 h-3.5" /> Lista
            </button>
            <button
              onClick={() => onTodayViewChange('org')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${todayView === 'org' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
              title="Vista de organigrama"
            >
              <Network className="w-3.5 h-3.5" /> Organigrama
            </button>
          </div>
        </div>

        {/* Buscador + filtros + acciones */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar por nombre o email…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
            />
          </div>
          {availableRoles.length > 0 && (
            <select
              value={filterRole}
              onChange={(e) => onFilterRoleChange(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="all">Todos los roles</option>
              {availableRoles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          {hasWorkCenters && (
            <select
              value={filterWorkCenter}
              onChange={(e) => onFilterWorkCenterChange(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="all">Todos los centros</option>
              {activeWorkCenters.map((wc) => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
            </select>
          )}
          {isAdmin && (
            <button
              onClick={onOpenManualClockin}
              className="ml-auto flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800 transition-colors"
              title="Crear un fichaje en nombre de un trabajador"
            >
              <UserPlus className="w-3.5 h-3.5" /> Fichar en su nombre
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat icon={<Users className="w-5 h-5" />} label="Fichajes del día" value={String(visibleRecords.length)} color="blue" />
        <Stat icon={<UserCheck className="w-5 h-5" />} label="Activos ahora" value={String(activeCount)} color="green" />
        <Stat icon={<Timer className="w-5 h-5" />} label="Horas totales" value={formatMinutes(totalHours)} color="amber" />
      </div>

      {/* Vista organigrama */}
      {todayView === 'org' && (
        <OrgPanel nodes={orgNodes} edges={orgEdges} loading={orgLoading} STATUS={STATUS} onRefresh={onOrgRefresh} />
      )}

      {/* Vista lista — mobile cards / desktop table */}
      {todayView === 'list' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {visibleRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <CalendarDays className="w-10 h-10 mb-3" />
              <p className="text-sm">{records.length === 0 ? 'No hay miembros visibles en el equipo' : 'Ningún miembro coincide con los filtros'}</p>
            </div>
          ) : (
            <>
              {/* Cards móvil */}
              <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-700/50">
                {visibleRecords.map((r) => (
                  <TeamMemberCard
                    key={r._id}
                    record={r}
                    displayName={resolveClockinMemberName(r, businessMembers)}
                    STATUS={STATUS}
                    fmtTime={fmtTime}
                    isAdmin={isAdmin}
                    onEditEntry={(idx) => startEdit(r, idx)}
                    onEditSchedule={() => onEditSchedule(r.member_id)}
                    onViewHistory={() => onViewMemberHistory(r.member_id)}
                  />
                ))}
              </div>

              {/* Tabla desktop */}
              <div className="hidden md:block overflow-x-auto">
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
                    {visibleRecords.map((r: EnrichedClockinRecord & { scheduled_start?: string; scheduled_end?: string }) => {
                  const memberLabel = resolveClockinMemberName(r, businessMembers);
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
                      <td className="px-3 py-3 text-sm font-medium text-gray-900 dark:text-white">{memberLabel}</td>
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
                            {ci && ciIdx >= 0 && !isEditingCi && !r.roster_placeholder && (
                              <button onClick={() => startEdit(r, ciIdx)} title="Ajustar entrada" className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-400 hover:text-blue-600 transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {co && coIdx >= 0 && !isEditingCo && !r.roster_placeholder && (
                              <button onClick={() => startEdit(r, coIdx)} title="Ajustar salida" className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-400 hover:text-blue-600 transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => onViewMemberHistory(r.member_id)} title="Historial" className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 transition-colors">
                              <Clock className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => onEditSchedule(r.member_id)} title="Editar horario" className="p-1 rounded hover:bg-violet-50 dark:hover:bg-violet-900/20 text-gray-400 hover:text-violet-600 transition-colors">
                              <CalendarDays className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Team — Tarjeta para móvil (sustituye a la tabla en <md)
   ═════════════════════════════════════════════════════════════════════════════ */

interface TeamMemberCardProps {
  record: EnrichedClockinRecord & { scheduled_start?: string; scheduled_end?: string };
  displayName: string;
  STATUS: Record<string, { label: string; color: string; dot: string }>;
  fmtTime: (iso: string) => string;
  isAdmin: boolean;
  onEditEntry: (entryIdx: number) => void;
  onEditSchedule: () => void;
  onViewHistory: () => void;
}

function TeamMemberCard({ record: r, displayName, STATUS, fmtTime, isAdmin, onEditEntry, onEditSchedule, onViewHistory }: TeamMemberCardProps) {
  const ci = r.entries.find((e) => e.type === 'clock_in');
  const co = r.entries.find((e) => e.type === 'clock_out');
  const ciIdx = r.entries.findIndex((e) => e.type === 'clock_in');
  const coIdx = r.entries.findIndex((e) => e.type === 'clock_out');
  const sc = STATUS[r.status] || STATUS.completed;
  const ciDiff = ci ? getTimeDiffMinutes(ci, r) : null;
  const coDiff = co ? getTimeDiffMinutes(co, r) : null;
  const device = (r as { device_type?: string }).device_type;
  const geo = (r as { geo?: { latitude: number; longitude: number } }).geo;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{displayName}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge role={r.member_role || 'Usuario'} />
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sc.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{sc.label}
            </span>
          </div>
        </div>
        <span className="text-base font-bold tabular-nums text-gray-900 dark:text-white shrink-0">{formatMinutes(r.totalMinutes)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-gray-50 dark:bg-gray-900/30 p-2">
          <p className="text-[10px] uppercase text-gray-400 font-semibold">Entrada</p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{ci ? fmtTime(isAdmin ? ci.time : getDisplayTime(ci, r)) : '—'}</span>
            {isAdmin && <TimeDiffBadge diff={ciDiff} />}
          </div>
          {isAdmin && r.scheduled_start && <p className="text-[10px] text-gray-400 mt-0.5">Asignada: {r.scheduled_start}</p>}
        </div>
        <div className="rounded-lg bg-gray-50 dark:bg-gray-900/30 p-2">
          <p className="text-[10px] uppercase text-gray-400 font-semibold">Salida</p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-white">{co ? fmtTime(isAdmin ? co.time : getDisplayTime(co, r)) : '—'}</span>
            {isAdmin && <TimeDiffBadge diff={coDiff} />}
          </div>
          {isAdmin && r.scheduled_end && <p className="text-[10px] text-gray-400 mt-0.5">Asignada: {r.scheduled_end}</p>}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <span>Descanso {formatMinutes(r.breakMinutes)}</span>
          {isAdmin && (
            <>
              {device === 'mobile' && <Smartphone className="w-3.5 h-3.5 text-blue-500" />}
              {device === 'kiosk' && <Fingerprint className="w-3.5 h-3.5 text-indigo-500" />}
              {device === 'desktop' && <Monitor className="w-3.5 h-3.5 text-gray-400" />}
              {geo && (
                <a href={`https://maps.google.com/?q=${geo.latitude},${geo.longitude}`} target="_blank" rel="noopener noreferrer" className="text-emerald-500" title="Ubicación">
                  <MapPin className="w-3.5 h-3.5" />
                </a>
              )}
            </>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-1">
            {!r.roster_placeholder && ci && ciIdx >= 0 && (
              <button onClick={() => onEditEntry(ciIdx)} className="px-2 py-1 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Ajustar entrada">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {!r.roster_placeholder && co && coIdx >= 0 && (
              <button onClick={() => onEditEntry(coIdx)} className="px-2 py-1 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Ajustar salida">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={onViewHistory} className="px-2 py-1 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" title="Historial">
              <Clock className="w-3.5 h-3.5" />
            </button>
            <button onClick={onEditSchedule} className="px-2 py-1 rounded text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20" title="Editar horario">
              <CalendarDays className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
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

function StatsPanel({ stats, loading }: { stats: ClockinStats | null; loading: boolean }) {
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (!stats) return <div className="flex flex-col items-center py-20 text-gray-400"><BarChart3 className="w-12 h-12 mb-3" /><p className="text-sm">Sin datos</p></div>;

  const maxMbr = Math.max(...stats.byMember.map((m) => m.totalMinutes), 1);
  const maxDay = Math.max(...stats.byDate.map((d) => d.totalMinutes), 1);

  return (
    <div className="space-y-6">
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

function PerformancePanel({ data, loading }: { data: MemberPerformance[]; loading: boolean }) {
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  const hasData = data.some((p) => p.hoursWorked > 0 || p.salesCount > 0);

  return (
    <div className="space-y-6">
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

function AbsenteeismPanel({
  report, summary, loading, approvedVacations,
}: {
  report: AbsenteeismDay[];
  summary: AbsenteeismSummary | null;
  loading: boolean;
  approvedVacations: VacationRequest[];
}) {
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  // Helpers para cruzar ausencias con vacaciones aprobadas. Una ausencia es
  // «justificada» si en esa fecha el miembro tiene una vacation_request con
  // status='approved' que cubra el día (incluyendo cualquier leaveType).
  const isJustified = (memberId: string, date: string): VacationRequest | null => {
    return approvedVacations.find((v) => v.member_id === memberId && date >= v.startDate && date <= v.endDate) || null;
  };

  // Recalculamos las cifras descontando las ausencias justificadas para que
  // la tasa de absentismo refleje las ausencias reales (no las planificadas).
  type AnnotatedAbsence = AbsenteeismDay['absent'][number] & { justifiedBy?: VacationRequest };
  type AnnotatedDay = AbsenteeismDay & { unjustified: AnnotatedAbsence[]; justified: AnnotatedAbsence[]; effectiveRate: number };

  const annotated: AnnotatedDay[] = report.map((day) => {
    const justified: AnnotatedAbsence[] = [];
    const unjustified: AnnotatedAbsence[] = [];
    for (const ab of day.absent) {
      const v = isJustified(ab.member_id, day.date);
      if (v) justified.push({ ...ab, justifiedBy: v });
      else unjustified.push(ab);
    }
    const effectiveRate = day.expected.length > 0
      ? Math.round((unjustified.length / day.expected.length) * 1000) / 10
      : 0;
    return { ...day, justified, unjustified, effectiveRate };
  });

  const totalJustified = annotated.reduce((s, d) => s + d.justified.length, 0);
  const totalUnjustified = annotated.reduce((s, d) => s + d.unjustified.length, 0);
  const totalAbsentRaw = summary?.totalAbsent ?? (totalJustified + totalUnjustified);
  const effectiveAbsenteeism = summary && summary.totalExpected > 0
    ? Math.round((totalUnjustified / summary.totalExpected) * 1000) / 10
    : 0;

  const LEAVE_LABEL: Record<string, string> = {
    vacation: 'Vacaciones',
    personal: 'Asuntos propios',
    sick: 'Baja médica',
    other: 'Justificada',
  };

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Stat icon={<CalendarDays className="w-5 h-5" />} label="Días evaluados" value={String(summary.totalDays)} color="blue" />
          <Stat icon={<Users className="w-5 h-5" />} label="Esperados" value={String(summary.totalExpected)} color="slate" />
          <Stat icon={<UserCheck className="w-5 h-5" />} label="Presentes" value={String(summary.totalPresent)} color="green" />
          <Stat icon={<Plane className="w-5 h-5" />} label="Justificadas" value={String(totalJustified)} color="blue" sub={`de ${totalAbsentRaw} ausencias`} />
          <Stat icon={<UserMinus className="w-5 h-5" />} label="Sin justificar" value={String(totalUnjustified)} color="red" />
          <Stat icon={<TrendingUp className="w-5 h-5" />} label="Tasa real" value={`${effectiveAbsenteeism}%`} color={effectiveAbsenteeism > 10 ? 'red' : effectiveAbsenteeism > 5 ? 'amber' : 'green'} sub={`bruta: ${summary.overallRate}%`} />
        </div>
      )}

      {annotated.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-gray-400">
          <UserMinus className="w-12 h-12 mb-3" />
          <p className="text-sm">Sin datos de absentismo para este período</p>
          <p className="text-xs mt-1">Asegúrate de que los miembros tienen horarios asignados</p>
        </div>
      ) : (
        <div className="space-y-4">
          {annotated.map((day) => (
            <div key={day.date} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <CalendarDays className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{day.date}</span>
                  <span className="text-xs text-gray-500">{day.expected.length} esperados</span>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-green-600 dark:text-green-400 font-medium">{day.present.length} presentes</span>
                  {day.justified.length > 0 && (
                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">{day.justified.length} justificadas</span>
                  )}
                  {day.unjustified.length > 0 && (
                    <span className="text-xs text-red-600 dark:text-red-400 font-bold">{day.unjustified.length} sin justificar</span>
                  )}
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    day.effectiveRate > 10 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : day.effectiveRate > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  }`}>{day.effectiveRate}%</span>
                </div>
              </div>
              {(day.unjustified.length > 0 || day.justified.length > 0) && (
                <div className="p-4 space-y-3">
                  {day.unjustified.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-2">Sin justificar:</p>
                      <div className="flex flex-wrap gap-2">
                        {day.unjustified.map((a) => (
                          <div key={a.member_id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                            <div className="w-6 h-6 rounded-full bg-red-200 dark:bg-red-800 flex items-center justify-center text-[10px] font-bold text-red-700 dark:text-red-300">{a.member_name.charAt(0).toUpperCase()}</div>
                            <span className="text-xs font-medium text-red-700 dark:text-red-400">{a.member_name}</span>
                            <span className="text-[10px] text-red-400">{a.scheduled_start}-{a.scheduled_end}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {day.justified.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2">Justificadas (vacaciones / bajas aprobadas):</p>
                      <div className="flex flex-wrap gap-2">
                        {day.justified.map((a) => (
                          <div key={a.member_id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
                            <Plane className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="text-xs font-medium text-blue-700 dark:text-blue-400">{a.member_name}</span>
                            <span className="text-[10px] text-blue-400">
                              {LEAVE_LABEL[a.justifiedBy?.leaveType || 'other']}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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

function OvertimePanel({ report, summary, loading }: { report: OvertimeMember[]; summary: OvertimeSummary | null; loading: boolean }) {
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-6">
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

/* ═══════════════════════════════════════════════════════════════════════════════
   Análisis — Wrapper con sub-pestañas y DateRange compartido
   ═════════════════════════════════════════════════════════════════════════════ */

interface AnalysisPanelProps {
  subTab: AnalysisSubTab;
  onSubTabChange: (v: AnalysisSubTab) => void;
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  stats: ClockinStats | null;
  statsLoading: boolean;
  performance: MemberPerformance[];
  perfLoading: boolean;
  absentReport: AbsenteeismDay[];
  absentSummary: AbsenteeismSummary | null;
  absentLoading: boolean;
  approvedVacations: VacationRequest[];
  overtimeReport: OvertimeMember[];
  overtimeSummary: OvertimeSummary | null;
  overtimeLoading: boolean;
  isAdmin: boolean;
  onExport: () => void;
}

function AnalysisPanel(props: AnalysisPanelProps) {
  const {
    subTab, onSubTabChange, from, to, onFromChange, onToChange,
    stats, statsLoading, performance, perfLoading,
    absentReport, absentSummary, absentLoading, approvedVacations,
    overtimeReport, overtimeSummary, overtimeLoading,
    isAdmin, onExport,
  } = props;

  const subTabs: { id: AnalysisSubTab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = (
    [
      { id: 'stats' as AnalysisSubTab, label: 'Estadísticas', icon: <BarChart3 className="w-3.5 h-3.5" /> },
      { id: 'performance' as AnalysisSubTab, label: 'Rendimiento', icon: <TrendingUp className="w-3.5 h-3.5" />, adminOnly: true },
      { id: 'absenteeism' as AnalysisSubTab, label: 'Absentismo', icon: <UserMinus className="w-3.5 h-3.5" />, adminOnly: true },
      { id: 'overtime' as AnalysisSubTab, label: 'Horas extra', icon: <Hourglass className="w-3.5 h-3.5" /> },
    ]
  ).filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="space-y-5">
      {/* DateRange compartido + sub-pestañas: el usuario selecciona el rango
          una sola vez para todas las vistas analíticas. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DateRange from={from} to={to} onFrom={onFromChange} onTo={onToChange} />
          {subTab === 'stats' && (
            <button onClick={onExport} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors border border-emerald-200 dark:border-emerald-800">
              <Download className="w-3.5 h-3.5" /> Exportar CSV
            </button>
          )}
        </div>

        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-x-auto">
          {subTabs.map((st) => (
            <button
              key={st.id}
              onClick={() => onSubTabChange(st.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                subTab === st.id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {st.icon}{st.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'stats' && <StatsPanel stats={stats} loading={statsLoading} />}
      {subTab === 'performance' && isAdmin && <PerformancePanel data={performance} loading={perfLoading} />}
      {subTab === 'absenteeism' && isAdmin && (
        <AbsenteeismPanel report={absentReport} summary={absentSummary} loading={absentLoading} approvedVacations={approvedVacations} />
      )}
      {subTab === 'overtime' && <OvertimePanel report={overtimeReport} summary={overtimeSummary} loading={overtimeLoading} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Modal "Fichar en su nombre" (admin)
   ─────────────────────────────────────────────────────────────────────────────
   Crea un fichaje completo (entrada + salida opcional) en nombre de otro
   trabajador. Útil para CEOs que descubren a media mañana que alguien no fichó.
   Trazabilidad: deja una nota explícita identificando al admin que actuó.
   ═════════════════════════════════════════════════════════════════════════════ */

interface ManualClockinModalProps {
  businessId: string;
  members: { user_id: string; fullName?: string; email?: string; role?: string }[];
  actingUserName: string;
  onClose: () => void;
  onCreated: () => void;
}

function ManualClockinModal({ businessId, members, actingUserName, onClose, onCreated }: ManualClockinModalProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [memberId, setMemberId] = useState('');
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  const selectedMember = members.find((m) => m.user_id === memberId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId || !date || !startTime) {
      setErr('Selecciona trabajador, fecha y hora de entrada');
      return;
    }
    if (!reason.trim()) {
      setErr('Indica un motivo (queda registrado para trazabilidad)');
      return;
    }
    if (!selectedMember) return;

    setSubmitting(true);
    setErr('');
    try {
      // 1) Creamos el fichaje. `clockIn` siempre lo crea con date=hoy, así que
      //    al final del flujo lo reajustamos a la fecha indicada si era pasada.
      const memberName = selectedMember.fullName || selectedMember.email || 'Trabajador';
      const record = await clockIn(businessId, memberId, memberName, { device_type: 'desktop' });

      // 2) Reajustamos la entrada a la hora indicada en la fecha indicada.
      const startIso = new Date(`${date}T${startTime}:00`).toISOString();
      const ciIdx = record.entries.findIndex((e) => e.type === 'clock_in');
      let current: ClockinRecord = record;
      if (ciIdx >= 0) {
        current = await adjustClockinViaApi(businessId, record._id, ciIdx, startIso);
      }

      // 3) Si hay hora de salida, cerramos y reajustamos la salida.
      if (endTime) {
        current = await clockOut(current);
        const coIdx = current.entries.findIndex((e) => e.type === 'clock_out');
        const endIso = new Date(`${date}T${endTime}:00`).toISOString();
        if (coIdx >= 0) {
          current = await adjustClockinViaApi(businessId, current._id, coIdx, endIso);
        }
      }

      // 4) Si la fecha indicada es distinta de hoy, alineamos el campo `date`
      //    del documento para que aparezca correctamente en la tabla del día,
      //    en absentismo, en estadísticas y en exports.
      if (date !== today) {
        current = await updateClockinDate(current, date);
      }

      // 5) Auditoría: dejamos constancia explícita en las notas para que
      //    cualquier revisión posterior sepa que NO fue un fichaje del propio
      //    trabajador, sino una corrección administrativa, y por quién.
      await updateNotes(current, `[Fichaje manual por ${actingUserName}] ${reason.trim()}`);

      onCreated();
    } catch (e: any) {
      setErr(e?.message || 'No se pudo crear el fichaje');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Fichar en su nombre</h3>
              <p className="text-[11px] text-gray-500">El registro queda con nota de auditoría</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Trabajador</label>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              required
            >
              <option value="">— Selecciona —</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.fullName || m.email || m.user_id} {m.role ? `· ${m.role}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Fecha</label>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Entrada</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Salida (opcional)</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Vacío = fichaje aún abierto</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Motivo</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Ej.: olvidó fichar al entrar, baja médica, problema con el kiosko…"
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400"
              required
            />
          </div>

          {err && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs">
              <AlertCircle className="w-3.5 h-3.5" /> {err}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 bg-gray-50 dark:bg-gray-900/30 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 shadow-sm"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Crear fichaje
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Hero card: resumen del día ────────────────────────────────────────────────

interface DailySummaryCardProps {
  summary: DailySummary | null;
  loading: boolean;
  onRefresh: () => void;
}

/**
 * Tarjeta-resumen que muestra al gerente el estado del día en un golpe de
 * vista: cuántos tenían turno, cuántos fichraon, retrasos y ausencias. Se
 * mantiene vivo con SSE (cada notificación de fichaje refresca el endpoint).
 */
function DailySummaryCard({ summary, loading, onRefresh }: DailySummaryCardProps) {
  if (!summary && !loading) return null;
  const fmtHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${String(m).padStart(2, '0')}m`;
  };

  const dateLabel = summary?.date
    ? new Date(`${summary.date}T00:00:00`).toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : 'Hoy';

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-blue-100 dark:border-blue-900/40 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-blue-900/20 dark:via-gray-800 dark:to-purple-900/20 p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            <CalendarDays className="w-3.5 h-3.5" />
            Resumen del día
          </div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white capitalize mt-0.5">
            {dateLabel}
          </h2>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:border-blue-300 dark:hover:border-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {!summary && loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DailyStatChip
              icon={<UserCheck className="w-4 h-4" />}
              label="Han fichado"
              value={`${summary.clocked}${summary.scheduled > 0 ? ` / ${summary.scheduled}` : ''}`}
              tone="blue"
            />
            <DailyStatChip
              icon={<CheckCircle2 className="w-4 h-4" />}
              label="Puntuales"
              value={summary.onTime}
              tone="emerald"
            />
            <DailyStatChip
              icon={<AlertTriangle className="w-4 h-4" />}
              label="Con retraso"
              value={summary.late}
              sub={summary.avgLateMinutes > 0 ? `≈ ${summary.avgLateMinutes} min` : undefined}
              tone="amber"
            />
            <DailyStatChip
              icon={<UserX className="w-4 h-4" />}
              label="Sin fichar"
              value={summary.noShow}
              tone={summary.noShow > 0 ? 'red' : 'gray'}
            />
          </div>

          {(summary.lateMembers.length > 0 || summary.noShowMembers.length > 0 || summary.totalWorkedMinutes > 0) && (
            <div className="mt-4 pt-4 border-t border-blue-100 dark:border-blue-900/40 flex flex-wrap gap-x-6 gap-y-2 text-xs">
              {summary.totalWorkedMinutes > 0 && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Timer className="w-3.5 h-3.5 text-blue-500" />
                  <span>Total trabajado: <strong className="text-gray-900 dark:text-white">{fmtHours(summary.totalWorkedMinutes)}</strong></span>
                </div>
              )}
              {summary.completed > 0 && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{summary.completed} ya {summary.completed === 1 ? 'cerró salida' : 'cerraron salida'}</span>
                </div>
              )}
              {summary.lateMembers.length > 0 && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 truncate">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">
                    Más tarde:{' '}
                    <strong className="text-gray-900 dark:text-white">
                      {summary.lateMembers
                        .slice(0, 3)
                        .map((m) => `${m.memberName.split(' ')[0] || '?'} (${m.lateMinutes}m)`)
                        .join(', ')}
                    </strong>
                  </span>
                </div>
              )}
              {summary.noShowMembers.length > 0 && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 truncate">
                  <UserX className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span className="truncate">
                    Faltan:{' '}
                    <strong className="text-gray-900 dark:text-white">
                      {summary.noShowMembers.slice(0, 3).map((m) => m.memberName).join(', ')}
                    </strong>
                    {summary.noShowMembers.length > 3 && (
                      <span className="text-gray-400"> y {summary.noShowMembers.length - 3} más</span>
                    )}
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

interface DailyStatChipProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  tone: 'blue' | 'emerald' | 'amber' | 'red' | 'gray';
}

function DailyStatChip({ icon, label, value, sub, tone }: DailyStatChipProps) {
  const tones: Record<DailyStatChipProps['tone'], string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300',
    amber: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-300',
    red: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300',
    gray: 'bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300',
  };
  return (
    <div className={`rounded-xl border-2 px-3 py-2.5 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider opacity-80">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold leading-none">{value}</span>
        {sub && <span className="text-[11px] opacity-70">{sub}</span>}
      </div>
    </div>
  );
}
