import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarRange, Users, Save, X, Loader2, AlertCircle, Pencil, Timer, Plus,
  Copy, Trash2, Zap, LayoutTemplate, Settings2, ChevronLeft, ChevronRight,
  Check, UserCheck, Pause, CheckCircle2, AlertTriangle, MapPin, Umbrella,
  CalendarDays, Clock, ThumbsUp, ThumbsDown, FileText, Info, Ban, PartyPopper,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useWorkCenters } from '../../hooks/useWorkCenters';

import type { ScheduleTemplate, DayShift, Weekday, ShiftTemplate, AssignmentRule, RuleCriteria, TeamMember, ScheduleWarning } from '../../lib/schedulesApi';
import {
  listSchedules, saveSchedule, defaultWeekly, computeWeeklyHours, getMonday, WEEKDAYS, WEEKDAY_LABELS, TEMPLATE_COLORS,
  listShiftTemplates, saveShiftTemplate, deleteShiftTemplate, listAssignmentRules, saveAssignmentRule, deleteAssignmentRule,
  applyTemplateToMembers, autoAssignByRules, checkScheduleConflicts,
} from '../../lib/schedulesApi';

import type { VacationRequest, VacationSettings, LeaveType, VacationStatus } from '../../lib/vacationsApi';
import { listVacations, createVacationRequest, reviewVacation, deleteVacation, getSettings, saveSettings, getDaysUsed, getDaysAllowed, countBusinessDays, LEAVE_TYPE_LABELS, STATUS_LABELS } from '../../lib/vacationsApi';

import type { CompanyHoliday, HolidayScope } from '../../lib/companyHolidaysApi';
import { listCompanyHolidays, saveCompanyHoliday, deleteCompanyHoliday, importPresetHolidays, getHolidayForDate, SCOPE_LABELS } from '../../lib/companyHolidaysApi';

import type { AvailabilityBlock, BlockReason } from '../../lib/availabilityBlocksApi';
import { listBlocks, saveBlock, deleteBlock, getMemberBlocksForDate, BLOCK_REASON_LABELS, BLOCK_REASON_COLORS } from '../../lib/availabilityBlocksApi';

import { listClockins } from '../../lib/clockinsApi';
import type { ClockinRecord } from '../../lib/clockinsApi';

import type { ScheduleAlert } from '../../lib/scheduleAlertsApi';
import { generateAlerts, getDismissedAlertIds, dismissAlert, ALERT_SEVERITY_CONFIG } from '../../lib/scheduleAlertsApi';

type Tab = 'calendar' | 'vacations' | 'holidays' | 'blocks' | 'templates' | 'rules' | 'comparison' | 'anomalies';
const MANAGER_ROLES = new Set(['Admin', 'Gerente']);

export function SchedulesVacations() {
  const { t, i18n } = useTranslation();
  const { user, listUsers } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';
  const { activeWorkCenters, hasWorkCenters } = useWorkCenters();
  const canManage = MANAGER_ROLES.has(user?.role || '');
  const lang = (i18n.language?.slice(0, 2) || 'es') as string;
  const dayLabels = WEEKDAY_LABELS[lang] || WEEKDAY_LABELS.es;
  const leaveLabels = LEAVE_TYPE_LABELS[lang] || LEAVE_TYPE_LABELS.es;
  const statusLabels = STATUS_LABELS[lang] || STATUS_LABELS.es;
  const blockLabels = BLOCK_REASON_LABELS[lang] || BLOCK_REASON_LABELS.es;
  const scopeLabels = SCOPE_LABELS[lang] || SCOPE_LABELS.es;
  const currentYear = new Date().getFullYear();

  const [tab, setTab] = useState<Tab>('calendar');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [filterWorkCenter, setFilterWorkCenter] = useState<string>('all');

  const [schedules, setSchedules] = useState<ScheduleTemplate[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [rules, setRules] = useState<AssignmentRule[]>([]);
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [vacSettings, setVacSettings] = useState<VacationSettings | null>(null);
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [clockins, setClockins] = useState<ClockinRecord[]>([]);
  const [alerts, setAlerts] = useState<ScheduleAlert[]>([]);

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editWeekly, setEditWeekly] = useState<Record<Weekday, DayShift>>(defaultWeekly());
  const [editWorkCenterId, setEditWorkCenterId] = useState('');
  const [editWorkCenterName, setEditWorkCenterName] = useState('');
  const [editWarnings, setEditWarnings] = useState<ScheduleWarning[]>([]);

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ShiftTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateColor, setTemplateColor] = useState(TEMPLATE_COLORS[0]);
  const [templateWeekly, setTemplateWeekly] = useState<Record<Weekday, DayShift>>(defaultWeekly());

  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AssignmentRule | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [ruleCriteria, setRuleCriteria] = useState<RuleCriteria>('role');
  const [ruleCriteriaValue, setRuleCriteriaValue] = useState('');
  const [ruleTemplateId, setRuleTemplateId] = useState('');

  const [showVacForm, setShowVacForm] = useState(false);
  const [vacFormData, setVacFormData] = useState({ startDate: '', endDate: '', leaveType: 'vacation' as LeaveType, notes: '' });

  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '', recurring: true, scope: 'all' as HolidayScope, scope_value: '', halfDay: false, halfDayPeriod: 'morning' as 'morning' | 'afternoon' });

  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockForm, setBlockForm] = useState({ member_id: '', startDate: '', endDate: '', allDay: true, startTime: '09:00', endTime: '17:00', reason: 'training' as BlockReason, notes: '', recurring: false });

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkTemplateId, setBulkTemplateId] = useState('');
  const [bulkSelectedMembers, setBulkSelectedMembers] = useState<Set<string>>(new Set());

  const [comparisonDate, setComparisonDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expandedVacRequest, setExpandedVacRequest] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  useModalClose(!!editingMemberId, () => setEditingMemberId(null));
  useModalClose(showTemplateModal, () => setShowTemplateModal(false));
  useModalClose(showRuleModal, () => setShowRuleModal(false));
  useModalClose(showVacForm, () => setShowVacForm(false));
  useModalClose(showHolidayModal, () => setShowHolidayModal(false));
  useModalClose(showBlockModal, () => setShowBlockModal(false));
  useModalClose(showBulkModal, () => setShowBulkModal(false));

  const currentWeekStart = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = (day === 0 ? -6 : 1 - day) + weekOffset * 7;
    const d = new Date(now);
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }, [weekOffset]);

  const weekDates = useMemo(() => WEEKDAYS.map((_, i) => { const d = new Date(currentWeekStart + 'T00:00:00'); d.setDate(d.getDate() + i); return d; }), [currentWeekStart]);
  const weekEnd = useMemo(() => weekDates[6]?.toISOString().slice(0, 10) || currentWeekStart, [weekDates, currentWeekStart]);
  const isToday = (date: Date) => { const n = new Date(); return date.getDate() === n.getDate() && date.getMonth() === n.getMonth() && date.getFullYear() === n.getFullYear(); };
  const formatDate = (d: Date) => d.toLocaleDateString(lang, { day: 'numeric', month: 'short' });

  const loadData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [scheds, memberList, tmpls, rls, vacs, vs, hols, blks] = await Promise.all([
        listSchedules(businessId, currentWeekStart),
        listUsers(businessId).catch(() => []),
        canManage ? listShiftTemplates(businessId) : Promise.resolve([]),
        canManage ? listAssignmentRules(businessId) : Promise.resolve([]),
        listVacations(businessId, { year: currentYear }),
        getSettings(businessId),
        listCompanyHolidays(businessId, currentYear),
        listBlocks(businessId, { from: currentWeekStart, to: weekEnd }),
      ]);
      setSchedules(scheds);
      setMembers((memberList as any[]).map((u: any) => ({ user_id: u.user_id, fullName: u.fullName, role: u.role, employment: u.employment })));
      setTemplates(tmpls); setRules(rls); setVacations(vacs); setVacSettings(vs); setHolidays(hols); setBlocks(blks);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [businessId, canManage, currentWeekStart, weekEnd, currentYear]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!loading && members.length > 0) {
      const dismissed = getDismissedAlertIds();
      const generated = generateAlerts({ schedules, vacations, holidays, blocks, members, weekStart: currentWeekStart });
      setAlerts(generated.filter(a => !dismissed.has(a.id)));
    }
  }, [loading, schedules, vacations, holidays, blocks, members, currentWeekStart]);

  const loadClockins = useCallback(async () => {
    if (!businessId) return;
    try { setClockins(await listClockins(businessId, { date: comparisonDate })); } catch {}
  }, [businessId, comparisonDate]);

  useEffect(() => { if (tab === 'comparison') loadClockins(); }, [tab, comparisonDate, loadClockins]);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 2500); };

  const visibleMembers = useMemo(() => {
    let list = canManage ? members : members.filter(m => m.user_id === user?.user_id);
    if (filterWorkCenter !== 'all') list = list.filter(m => (m as any).workCenterId === filterWorkCenter);
    return list;
  }, [members, canManage, user?.user_id, filterWorkCenter]);

  const getScheduleForMember = (id: string) => schedules.find(s => s.member_id === id);
  const totalTeamHours = schedules.reduce((s, sc) => s + sc.weeklyHours, 0);
  const membersOnVacation = new Set(vacations.filter(v => v.status === 'approved' && v.startDate <= weekEnd && v.endDate >= currentWeekStart).map(v => v.member_id));
  const activeAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'warning');

  const openEditor = async (memberId: string) => {
    const existing = schedules.find(s => s.member_id === memberId);
    const w = existing ? { ...existing.weekly } : defaultWeekly();
    setEditWeekly(w); setEditWorkCenterId(existing?.work_center_id || ''); setEditWorkCenterName(existing?.work_center_name || '');
    setEditingMemberId(memberId); setEditWarnings([]); setError('');
    try { setEditWarnings(await checkScheduleConflicts(businessId, memberId, w, currentWeekStart)); } catch {}
  };

  const handleSaveSchedule = async () => {
    if (!editingMemberId || !businessId) return;
    setSaving(true); setError('');
    try {
      const member = members.find(m => m.user_id === editingMemberId);
      const existing = schedules.find(s => s.member_id === editingMemberId);
      await saveSchedule(businessId, editingMemberId, member?.fullName || '', editWeekly, existing, undefined, currentWeekStart, editWorkCenterId || undefined, editWorkCenterName || undefined);
      flash('Horario guardado'); await loadData(); setTimeout(() => setEditingMemberId(null), 600);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const openTemplateModal = (existing?: ShiftTemplate) => {
    if (existing) { setEditingTemplate(existing); setTemplateName(existing.name); setTemplateColor(existing.color); setTemplateWeekly({ ...existing.weekly }); }
    else { setEditingTemplate(null); setTemplateName(''); setTemplateColor(TEMPLATE_COLORS[Math.floor(Math.random() * TEMPLATE_COLORS.length)]); setTemplateWeekly(defaultWeekly()); }
    setShowTemplateModal(true); setError('');
  };

  const handleSaveTemplate = async () => {
    if (!businessId || !templateName.trim()) return;
    setSaving(true); setError('');
    try { await saveShiftTemplate(businessId, templateName.trim(), templateColor, templateWeekly, editingTemplate); flash('Plantilla guardada'); await loadData(); setShowTemplateModal(false); }
    catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const openRuleModal = (existing?: AssignmentRule) => {
    if (existing) { setEditingRule(existing); setRuleName(existing.name); setRuleCriteria(existing.criteria); setRuleCriteriaValue(existing.criteria_value); setRuleTemplateId(existing.template_id); }
    else { setEditingRule(null); setRuleName(''); setRuleCriteria('role'); setRuleCriteriaValue(''); setRuleTemplateId(templates[0]?._id || ''); }
    setShowRuleModal(true); setError('');
  };

  const handleSaveRule = async () => {
    if (!businessId || !ruleName.trim() || !ruleCriteriaValue.trim() || !ruleTemplateId) return;
    setSaving(true); setError('');
    try {
      const tmpl = templates.find(t => t._id === ruleTemplateId);
      await saveAssignmentRule(businessId, { name: ruleName.trim(), criteria: ruleCriteria, criteria_value: ruleCriteriaValue.trim(), template_id: ruleTemplateId, template_name: tmpl?.name || '', active: editingRule?.active ?? true }, editingRule);
      flash('Regla guardada'); await loadData(); setShowRuleModal(false);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const handleAutoAssign = async () => {
    if (!businessId || rules.length === 0) return;
    setSaving(true); setError('');
    try { const r = await autoAssignByRules(businessId, rules, templates, members, schedules, currentWeekStart); flash(`Auto-asignación: ${r.applied} aplicados, ${r.skipped} omitidos`); await loadData(); }
    catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const handleVacSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!businessId || !user) return;
    if (!vacFormData.startDate || !vacFormData.endDate) { setError('Selecciona las fechas'); return; }
    setSaving(true); setError('');
    try { await createVacationRequest(businessId, user.user_id, user.fullName || user.email, vacFormData); flash('Solicitud enviada'); setShowVacForm(false); setVacFormData({ startDate: '', endDate: '', leaveType: 'vacation', notes: '' }); await loadData(); }
    catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const handleVacReview = async (record: VacationRequest, decision: 'approved' | 'rejected') => {
    if (!user) return; setError('');
    try {
      const note = reviewNotes[record._id] || '';
      const result = await reviewVacation(record, decision, user.user_id, user.fullName || user.email, note);
      setReviewNotes(prev => { const n = { ...prev }; delete n[record._id]; return n; });
      const autoMsg = result.autoDisabledShifts?.length ? ` (${result.autoDisabledShifts.length} turnos desactivados)` : '';
      flash(decision === 'approved' ? `Aprobada${autoMsg}` : 'Rechazada'); await loadData();
    } catch (e: any) { setError(e.message); }
  };

  const handleSaveHoliday = async () => {
    if (!businessId || !holidayForm.date || !holidayForm.name.trim()) return;
    setSaving(true); setError('');
    try { await saveCompanyHoliday(businessId, holidayForm); flash('Festivo guardado'); await loadData(); setShowHolidayModal(false); }
    catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const handleImportHolidays = async () => {
    if (!businessId) return; setSaving(true);
    try { const created = await importPresetHolidays(businessId, currentYear, holidays); flash(`${created.length} festivos importados`); await loadData(); }
    catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const handleSaveBlock = async () => {
    if (!businessId || !blockForm.member_id || !blockForm.startDate || !blockForm.endDate) return;
    const member = members.find(m => m.user_id === blockForm.member_id);
    setSaving(true); setError('');
    try { await saveBlock(businessId, { ...blockForm, member_name: member?.fullName || '', createdBy: user?.user_id || '' }); flash('Bloqueo guardado'); await loadData(); setShowBlockModal(false); }
    catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const openBulkModal = () => { setBulkTemplateId(templates[0]?._id || ''); setBulkSelectedMembers(new Set()); setShowBulkModal(true); };

  const handleBulkAssign = async () => {
    if (!businessId || !bulkTemplateId || bulkSelectedMembers.size === 0) return;
    setSaving(true); setError('');
    try {
      const tmpl = templates.find(t => t._id === bulkTemplateId); if (!tmpl) return;
      const selected = members.filter(m => bulkSelectedMembers.has(m.user_id));
      const result = await applyTemplateToMembers(businessId, tmpl, selected, schedules, currentWeekStart, undefined, undefined, true);
      flash(`Aplicada a ${result.applied.length}, ${result.skipped.length} omitidos`); await loadData(); setShowBulkModal(false);
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const comparisonDay = useMemo(() => { const d = new Date(comparisonDate + 'T00:00:00'); return WEEKDAYS[(d.getDay() + 6) % 7]; }, [comparisonDate]);
  function getTimeDiffMin(scheduled: string, actualIso: string): number { const [sh, sm] = scheduled.split(':').map(Number); const a = new Date(actualIso); return (a.getHours() * 60 + a.getMinutes()) - (sh * 60 + sm); }

  const visibleTabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'calendar', label: 'Calendario', icon: <CalendarRange className="w-4 h-4" /> },
    { id: 'vacations', label: 'Vacaciones', icon: <Umbrella className="w-4 h-4" />, badge: canManage ? vacations.filter(v => v.status === 'pending').length : undefined },
    { id: 'holidays', label: 'Festivos', icon: <PartyPopper className="w-4 h-4" /> },
    ...(canManage ? [
      { id: 'blocks' as Tab, label: 'Bloqueos', icon: <Ban className="w-4 h-4" /> },
      { id: 'templates' as Tab, label: 'Plantillas', icon: <LayoutTemplate className="w-4 h-4" /> },
      { id: 'rules' as Tab, label: 'Reglas', icon: <Settings2 className="w-4 h-4" /> },
      { id: 'comparison' as Tab, label: 'Horario vs Fichaje', icon: <Timer className="w-4 h-4" /> },
      { id: 'anomalies' as Tab, label: 'Anomalías', icon: <AlertTriangle className="w-4 h-4" /> },
    ] : []),
  ];

  if (loading) return (
    <Layout title="Horarios y Vacaciones" subtitle="">
      <div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
    </Layout>
  );

  return (
    <Layout title="Horarios y Vacaciones" subtitle={canManage ? 'Planifica la disponibilidad del equipo' : 'Tu disponibilidad'}>
      <div className="space-y-6">
        {error && <AlertBanner type="error" message={error} onClose={() => setError('')} />}
        {success && <AlertBanner type="success" message={success} />}

        {canManage && alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.slice(0, 4).map(a => (
              <div key={a.id} className={`flex items-start gap-3 p-3 rounded-xl border ${ALERT_SEVERITY_CONFIG[a.severity].cls}`}>
                {a.severity === 'critical' ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : a.severity === 'warning' ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <Info className="w-4 h-4 shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{a.title}</p>
                  <p className="text-xs opacity-80 mt-0.5">{a.description}</p>
                </div>
                <button onClick={() => setTab(a.actionTab as Tab)} className="text-xs font-medium underline shrink-0">{a.actionLabel}</button>
                <button onClick={() => { dismissAlert(a.id); setAlerts(prev => prev.filter(x => x.id !== a.id)); }} className="p-1 opacity-60 hover:opacity-100"><X className="w-3 h-3" /></button>
              </div>
            ))}
            {alerts.length > 4 && <p className="text-xs text-gray-500 text-center">+{alerts.length - 4} alertas más</p>}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<Users className="w-5 h-5" />} label="Con horario" value={`${schedules.length}/${members.length}`} color="blue" />
          <StatCard icon={<Umbrella className="w-5 h-5" />} label="De vacaciones" value={String(membersOnVacation.size)} color="green" />
          <StatCard icon={<Timer className="w-5 h-5" />} label="Horas/sem equipo" value={`${totalTeamHours}h`} color="amber" />
          <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="Alertas activas" value={String(activeAlerts.length)} color={activeAlerts.length > 0 ? 'red' : 'green'} />
        </div>

        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl overflow-x-auto">
          {visibleTabs.map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)} className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${tab === tb.id ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
              {tb.icon}{tb.label}
              {tb.badge && tb.badge > 0 && <span className="ml-1 w-5 h-5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">{tb.badge}</span>}
            </button>
          ))}
        </div>

        {hasWorkCenters && tab === 'calendar' && (
          <select value={filterWorkCenter} onChange={e => setFilterWorkCenter(e.target.value)} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none">
            <option value="all">Todos los centros</option>
            {activeWorkCenters.map(wc => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
          </select>
        )}

        {/* CALENDAR TAB */}
        {tab === 'calendar' && (
          <>
            {canManage && templates.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button onClick={openBulkModal} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors shadow-sm"><Copy className="w-4 h-4" />Asignación masiva</button>
                {rules.filter(r => r.active).length > 0 && <button onClick={handleAutoAssign} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 hover:bg-amber-100 rounded-xl transition-colors"><Zap className="w-4 h-4" />Auto-asignar</button>}
              </div>
            )}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"><ChevronLeft className="w-4 h-4 text-gray-500" /></button>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Semana del {currentWeekStart}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{formatDate(weekDates[0])} — {formatDate(weekDates[6])}</span>
                    {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} className="px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded-md hover:bg-amber-100">Hoy</button>}
                  </div>
                </div>
                <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"><ChevronRight className="w-4 h-4 text-gray-500" /></button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase w-48">Miembro</th>
                      {WEEKDAYS.map((day, i) => {
                        const dateStr = weekDates[i].toISOString().slice(0, 10);
                        const hol = getHolidayForDate(dateStr, holidays);
                        return (
                          <th key={day} className={`px-2 py-3 text-center text-xs font-semibold uppercase ${isToday(weekDates[i]) ? 'text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-900/10' : hol ? 'text-rose-500 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-900/10' : 'text-gray-500 dark:text-gray-400'}`}>
                            <div>{dayLabels[day]?.slice(0, 3)}</div>
                            <div className="text-[10px] font-normal mt-0.5">{weekDates[i].getDate()}</div>
                            {hol && <div className="text-[9px] font-normal text-rose-400 truncate max-w-[80px] mx-auto">{hol.name}</div>}
                          </th>
                        );
                      })}
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase">H/sem</th>
                      {canManage && <th className="px-3 py-3 w-12"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {visibleMembers.map(member => {
                      const sched = getScheduleForMember(member.user_id);
                      const tmpl = sched?.template_id ? templates.find(t => t._id === sched.template_id) : null;
                      return (
                        <tr key={member.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{member.fullName}</p>
                            {tmpl && <div className="flex items-center gap-1.5 mt-0.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: tmpl.color }} /><span className="text-[10px] text-gray-400">{tmpl.name}</span></div>}
                          </td>
                          {WEEKDAYS.map((day, i) => {
                            const dateStr = weekDates[i].toISOString().slice(0, 10);
                            const shift = sched?.weekly?.[day];
                            const vac = vacations.find(v => v.member_id === member.user_id && v.status === 'approved' && dateStr >= v.startDate && dateStr <= v.endDate);
                            const blk = getMemberBlocksForDate(blocks, member.user_id, dateStr)[0];
                            const hol = getHolidayForDate(dateStr, holidays);
                            if (vac) return <td key={day} className="px-2 py-3 text-center"><span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Vacaciones</span></td>;
                            if (blk) return <td key={day} className="px-2 py-3 text-center"><span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: BLOCK_REASON_COLORS[blk.reason] + '20', color: BLOCK_REASON_COLORS[blk.reason] }}>{blockLabels[blk.reason]}</span></td>;
                            return (
                              <td key={day} className={`px-2 py-3 text-center ${isToday(weekDates[i]) ? 'bg-amber-50/30 dark:bg-amber-900/5' : hol ? 'bg-rose-50/20 dark:bg-rose-900/5' : ''}`}>
                                {shift?.enabled ? <div className="text-xs"><span className="font-medium text-gray-900 dark:text-white">{shift.start}</span><span className="text-gray-400 mx-0.5">-</span><span className="font-medium text-gray-900 dark:text-white">{shift.end}</span></div> : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                              </td>
                            );
                          })}
                          <td className="px-3 py-3 text-center"><span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{sched ? `${sched.weeklyHours}h` : '—'}</span></td>
                          {canManage && <td className="px-3 py-3 text-center"><button onClick={() => openEditor(member.user_id)} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors opacity-0 group-hover:opacity-100"><Pencil className="w-4 h-4" /></button></td>}
                        </tr>
                      );
                    })}
                    {visibleMembers.length === 0 && <tr><td colSpan={10} className="py-16 text-center text-gray-400 text-sm"><Users className="w-10 h-10 mx-auto mb-3" />{canManage ? 'No hay miembros' : 'Sin horario asignado'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* VACATIONS TAB */}
        {tab === 'vacations' && (
          <>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {user && vacSettings && (() => { const used = getDaysUsed(vacations, user.user_id, currentYear); const allowed = getDaysAllowed(vacSettings, user.user_id); const remaining = Math.max(0, allowed - used); return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                  <StatCard icon={<Umbrella className="w-5 h-5" />} label="Asignados" value={String(allowed)} color="blue" />
                  <StatCard icon={<CalendarDays className="w-5 h-5" />} label="Usados" value={String(used)} color="amber" />
                  <StatCard icon={<Check className="w-5 h-5" />} label="Restantes" value={String(remaining)} color="green" />
                  <StatCard icon={<Clock className="w-5 h-5" />} label="Pendientes" value={String(vacations.filter(v => v.member_id === user.user_id && v.status === 'pending').length)} color="red" />
                </div>
              ); })()}
              <button onClick={() => setShowVacForm(true)} className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl shadow-lg shadow-amber-600/25"><Plus className="w-4 h-4" />Solicitar</button>
            </div>
            {canManage && (() => { const pending = vacations.filter(v => v.status === 'pending'); if (!pending.length) return null; return (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"><Clock className="w-4 h-4 text-amber-500" />Pendientes ({pending.length})</h3>
                {pending.map(req => { const isExp = expandedVacRequest === req._id; return (
                  <div key={req._id} className="bg-white dark:bg-gray-800 rounded-xl border border-amber-200 dark:border-amber-800/50 overflow-hidden">
                    <div className="p-4 cursor-pointer hover:bg-amber-50/50 dark:hover:bg-amber-900/10" onClick={() => setExpandedVacRequest(isExp ? null : req._id)}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1"><p className="text-sm font-bold text-gray-900 dark:text-white">{req.member_name}</p><p className="text-sm text-gray-600 dark:text-gray-300">{leaveLabels[req.leaveType]} · {req.startDate} → {req.endDate} · <span className="font-semibold">{req.totalDays}d</span></p></div>
                        {isExp ? <ChevronLeft className="w-4 h-4 text-gray-400 rotate-90" /> : <ChevronLeft className="w-4 h-4 text-gray-400 -rotate-90" />}
                      </div>
                    </div>
                    {isExp && <div className="px-4 pb-4 border-t border-amber-100 dark:border-amber-800/30 pt-3 space-y-3">
                      <textarea value={reviewNotes[req._id] || ''} onChange={e => setReviewNotes(p => ({ ...p, [req._id]: e.target.value }))} rows={2} placeholder="Nota (opcional)..." className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm placeholder:text-gray-400 outline-none" />
                      <div className="flex gap-2 justify-end">
                        <button onClick={e => { e.stopPropagation(); handleVacReview(req, 'rejected'); }} className="flex items-center gap-1.5 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm font-semibold rounded-lg border border-red-200 dark:border-red-800"><ThumbsDown className="w-4 h-4" />Rechazar</button>
                        <button onClick={e => { e.stopPropagation(); handleVacReview(req, 'approved'); }} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg"><ThumbsUp className="w-4 h-4" />Aprobar</button>
                      </div>
                    </div>}
                  </div>
                ); })}
              </div>
            ); })()}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700"><h3 className="text-sm font-semibold text-gray-900 dark:text-white">{canManage ? `Todas (${currentYear})` : 'Mis solicitudes'}</h3></div>
              {(() => { const shown = canManage ? vacations : vacations.filter(v => v.member_id === user?.user_id); if (!shown.length) return <div className="py-16 text-center text-gray-400"><Umbrella className="w-10 h-10 mx-auto mb-3" /><p className="text-sm">Sin solicitudes</p></div>; return (
                <div className="overflow-x-auto"><table className="w-full min-w-[700px]"><thead><tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">{canManage && <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Miembro</th>}<th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fechas</th><th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Días</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Estado</th><th className="px-4 py-3 w-10"></th></tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">{shown.map(r => <tr key={r._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">{canManage && <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{r.member_name}</td>}<td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{leaveLabels[r.leaveType]}</td><td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 tabular-nums">{r.startDate} → {r.endDate}</td><td className="px-4 py-3 text-center text-sm font-bold">{r.totalDays}</td><td className="px-4 py-3"><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${r.status === 'approved' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : r.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>{statusLabels[r.status]}</span></td><td className="px-4 py-3">{r.status === 'pending' && r.member_id === user?.user_id && <button onClick={() => deleteVacation(r).then(loadData)} className="p-1 text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>}</td></tr>)}</tbody></table></div>
              ); })()}
            </div>
          </>
        )}

        {/* HOLIDAYS TAB */}
        {tab === 'holidays' && (
          <>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-gray-500">Festivos de empresa ({currentYear})</p>
              {canManage && <div className="flex gap-2">
                <button onClick={handleImportHolidays} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 hover:bg-amber-100 rounded-xl"><CalendarDays className="w-4 h-4" />Importar España</button>
                <button onClick={() => { setHolidayForm({ date: '', name: '', recurring: true, scope: 'all', scope_value: '', halfDay: false, halfDayPeriod: 'morning' }); setShowHolidayModal(true); }} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm"><Plus className="w-4 h-4" />Nuevo</button>
              </div>}
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {!holidays.length ? <div className="py-16 text-center text-gray-400"><PartyPopper className="w-10 h-10 mx-auto mb-3" /><p className="text-sm">Sin festivos</p></div> : (
                <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"><th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fecha</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Nombre</th><th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Recurrente</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Ámbito</th>{canManage && <th className="px-4 py-3 w-10"></th>}</tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">{holidays.map(h => <tr key={h._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30"><td className="px-4 py-3 text-sm font-medium tabular-nums">{h.date}</td><td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{h.name}</td><td className="px-4 py-3 text-center">{h.recurring ? <Check className="w-4 h-4 text-green-500 mx-auto" /> : <X className="w-4 h-4 text-gray-300 mx-auto" />}</td><td className="px-4 py-3 text-sm text-gray-500">{scopeLabels[h.scope]}</td>{canManage && <td className="px-4 py-3"><button onClick={() => deleteCompanyHoliday(h).then(loadData)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>}</tr>)}</tbody></table></div>
              )}
            </div>
          </>
        )}

        {/* BLOCKS TAB */}
        {tab === 'blocks' && canManage && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Bloqueos de disponibilidad</p>
              <button onClick={() => { setBlockForm({ member_id: members[0]?.user_id || '', startDate: '', endDate: '', allDay: true, startTime: '09:00', endTime: '17:00', reason: 'training', notes: '', recurring: false }); setShowBlockModal(true); }} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm"><Plus className="w-4 h-4" />Nuevo</button>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {!blocks.length ? <div className="py-16 text-center text-gray-400"><Ban className="w-10 h-10 mx-auto mb-3" /><p className="text-sm">Sin bloqueos</p></div> : (
                <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"><th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Miembro</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fechas</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Motivo</th><th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Horario</th><th className="px-4 py-3 w-10"></th></tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">{blocks.map(b => <tr key={b._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30"><td className="px-4 py-3 text-sm font-medium">{b.member_name}</td><td className="px-4 py-3 text-sm tabular-nums">{b.startDate} → {b.endDate}</td><td className="px-4 py-3"><span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: BLOCK_REASON_COLORS[b.reason] + '20', color: BLOCK_REASON_COLORS[b.reason] }}>{blockLabels[b.reason]}</span></td><td className="px-4 py-3 text-sm text-gray-500">{b.allDay ? 'Todo el día' : `${b.startTime}-${b.endTime}`}</td><td className="px-4 py-3"><button onClick={() => deleteBlock(b).then(loadData)} className="p-1 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td></tr>)}</tbody></table></div>
              )}
            </div>
          </>
        )}

        {/* TEMPLATES TAB */}
        {tab === 'templates' && canManage && (
          <>
            <div className="flex items-center justify-between"><p className="text-sm text-gray-500">Plantillas reutilizables de horario.</p><button onClick={() => openTemplateModal()} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm"><Plus className="w-4 h-4" />Nueva</button></div>
            {!templates.length ? <EmptyState icon={<LayoutTemplate className="w-12 h-12" />} title="Sin plantillas" description="Crea plantillas para reutilizar horarios" /> : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{templates.map(tmpl => (
                <div key={tmpl._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700/50"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: tmpl.color }} /><h4 className="text-sm font-semibold flex-1 truncate">{tmpl.name}</h4><span className="text-xs text-gray-500 tabular-nums">{tmpl.weeklyHours}h</span></div>
                  <div className="px-4 py-3 space-y-1">{WEEKDAYS.map(day => { const s = tmpl.weekly[day]; return <div key={day} className="flex justify-between text-xs"><span className="text-gray-500 w-12">{dayLabels[day]?.slice(0, 3)}</span>{s?.enabled ? <span className="font-medium tabular-nums">{s.start}-{s.end}</span> : <span className="text-gray-300">Libre</span>}</div>; })}</div>
                  <div className="flex gap-1 px-4 py-2 border-t border-gray-100 dark:border-gray-700/50"><button onClick={() => openTemplateModal(tmpl)} className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg"><Pencil className="w-3 h-3 inline mr-1" />Editar</button><button onClick={async () => { if (!confirm('¿Eliminar?')) return; try { await deleteShiftTemplate(tmpl); flash('Eliminada'); await loadData(); } catch {} }} className="px-3 py-1.5 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-3 h-3" /></button></div>
                </div>
              ))}</div>
            )}
          </>
        )}

        {/* RULES TAB */}
        {tab === 'rules' && canManage && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Reglas de asignación automática.</p>
              <div className="flex gap-2">
                {rules.filter(r => r.active).length > 0 && <button onClick={handleAutoAssign} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 hover:bg-amber-100 rounded-xl"><Zap className="w-4 h-4" />Ejecutar</button>}
                <button onClick={() => openRuleModal()} disabled={!templates.length} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm disabled:opacity-50"><Plus className="w-4 h-4" />Nueva</button>
              </div>
            </div>
            {!rules.length ? <EmptyState icon={<Settings2 className="w-12 h-12" />} title="Sin reglas" description="Asigna horarios automáticamente por rol o departamento" /> : (
              <div className="space-y-3">{rules.map(rule => { const tmpl = templates.find(t => t._id === rule.template_id); return (
                <div key={rule._id} className={`flex items-center gap-4 p-4 rounded-xl border ${rule.active ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700/50 opacity-60'}`}>
                  <button onClick={async () => { try { await saveAssignmentRule(businessId, { ...rule, active: !rule.active }, rule); await loadData(); } catch {} }} className={`p-1.5 rounded-lg ${rule.active ? 'text-green-600 bg-green-50 dark:bg-green-900/20' : 'text-gray-400 bg-gray-100 dark:bg-gray-700'}`}>{rule.active ? <CheckCircle2 className="w-5 h-5" /> : <Pause className="w-5 h-5" />}</button>
                  <div className="flex-1 min-w-0"><p className="text-sm font-semibold">{rule.name}</p><p className="text-xs text-gray-500 mt-0.5">{{ role: 'Rol', department: 'Dept', position: 'Puesto' }[rule.criteria]}: <span className="font-medium">{rule.criteria_value}</span> → {tmpl ? <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: tmpl.color }} />{tmpl.name}</span> : '(eliminada)'}</p></div>
                  <button onClick={() => openRuleModal(rule)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg"><Pencil className="w-4 h-4" /></button>
                  <button onClick={async () => { if (!confirm('¿Eliminar?')) return; try { await deleteAssignmentRule(rule); await loadData(); } catch {} }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                </div>
              ); })}</div>
            )}
          </>
        )}

        {/* COMPARISON TAB */}
        {tab === 'comparison' && canManage && (
          <>
            <div className="flex items-center gap-4">
              <input type="date" value={comparisonDate} onChange={e => setComparisonDate(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm" />
              <button onClick={() => setComparisonDate(new Date().toISOString().slice(0, 10))} className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded-lg hover:bg-amber-100">Hoy</button>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead><tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"><th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Miembro</th><th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Previsto</th><th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Fichaje</th><th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Dif. entrada</th><th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Dif. salida</th><th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Estado</th></tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">{members.map(m => {
                  const sched = getScheduleForMember(m.user_id); const shift = sched?.weekly?.[comparisonDay]; const rec = clockins.find(c => c.member_id === m.user_id);
                  const ci = rec?.entries.find(e => e.type === 'clock_in'); const co = rec?.entries.find(e => e.type === 'clock_out');
                  const dI = shift?.enabled && ci ? getTimeDiffMin(shift.start, ci.time) : null; const dO = shift?.enabled && co ? getTimeDiffMin(shift.end, co.time) : null;
                  let st: string = 'no-schedule'; if (shift?.enabled) { if (!rec) st = 'absent'; else if (dI !== null && dI > 5) st = 'late'; else if (dO !== null && dO < -5) st = 'early'; else st = 'ok'; }
                  const cfg: Record<string, { l: string; c: string }> = { ok: { l: 'Correcto', c: 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400' }, late: { l: 'Retraso', c: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400' }, early: { l: 'Salida anticipada', c: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400' }, absent: { l: 'Ausencia', c: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400' }, 'no-schedule': { l: 'Sin horario', c: 'text-gray-400 bg-gray-50 dark:bg-gray-700' } };
                  return <tr key={m.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30"><td className="px-4 py-3 text-sm font-medium">{m.fullName}</td><td className="px-4 py-3 text-center text-sm tabular-nums">{shift?.enabled ? `${shift.start}-${shift.end}` : '—'}</td><td className="px-4 py-3 text-center text-sm tabular-nums">{ci ? new Date(ci.time).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) + (co ? '-' + new Date(co.time).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) : '') : '—'}</td><td className="px-4 py-3 text-center">{dI !== null ? <span className={`text-xs font-medium tabular-nums ${dI > 0 ? 'text-red-500' : 'text-green-500'}`}>{dI > 0 ? '+' : ''}{dI}m</span> : <span className="text-xs text-gray-300">—</span>}</td><td className="px-4 py-3 text-center">{dO !== null ? <span className={`text-xs font-medium tabular-nums ${dO < 0 ? 'text-red-500' : 'text-green-500'}`}>{dO > 0 ? '+' : ''}{dO}m</span> : <span className="text-xs text-gray-300">—</span>}</td><td className="px-4 py-3 text-center"><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${cfg[st].c}`}>{cfg[st].l}</span></td></tr>;
                })}</tbody>
              </table>
            </div>
          </>
        )}

        {/* ANOMALIES TAB */}
        {tab === 'anomalies' && canManage && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700"><h3 className="text-sm font-semibold">Anomalías (semana actual)</h3></div>
            {!alerts.length ? <div className="py-16 text-center text-gray-400"><CheckCircle2 className="w-10 h-10 mx-auto mb-3" /><p className="text-sm">Sin anomalías</p></div> : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">{alerts.map(a => (
                <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                  {a.severity === 'critical' ? <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" /> : a.severity === 'warning' ? <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /> : <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />}
                  <div className="flex-1"><p className="text-sm font-medium">{a.title}</p><p className="text-xs text-gray-500 mt-0.5">{a.description}</p></div>
                  {a.date && <span className="text-xs text-gray-400 tabular-nums">{a.date}</span>}
                  <button onClick={() => setTab(a.actionTab as Tab)} className="text-xs font-medium text-amber-600 hover:text-amber-700">{a.actionLabel}</button>
                </div>
              ))}</div>
            )}
          </div>
        )}

        {/* MODAL: EDIT SCHEDULE */}
        {editingMemberId && <Modal onClose={() => setEditingMemberId(null)} title="Editar horario" subtitle={`${members.find(m => m.user_id === editingMemberId)?.fullName || ''} — Semana ${currentWeekStart}`}>
          {error && <AlertBanner type="error" message={error} />}
          {editWarnings.length > 0 && <div className="mb-4 space-y-1">{editWarnings.map((w, i) => <AlertBanner key={i} type="warning" message={`${dayLabels[w.day]}: ${w.detail}`} />)}</div>}
          {templates.length > 0 && <div className="mb-4"><label className="text-xs font-medium text-gray-500 block mb-1.5">Aplicar plantilla</label><div className="flex flex-wrap gap-2">{templates.map(t => <button key={t._id} onClick={() => setEditWeekly({ ...t.weekly })} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-600 rounded-lg hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />{t.name}</button>)}</div></div>}
          <DayEditor weekly={editWeekly} dayLabels={dayLabels} onChange={(day, field, value) => setEditWeekly(p => ({ ...p, [day]: { ...p[day], [field]: value } }))} />
          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-b-2xl -mx-6 -mb-6 mt-4">
            <p className="text-sm text-gray-500">Total: <span className="font-bold">{computeWeeklyHours(editWeekly)}h</span></p>
            <button onClick={handleSaveSchedule} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl disabled:opacity-50 shadow-lg shadow-amber-600/25">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar</button>
          </div>
        </Modal>}

        {/* MODAL: TEMPLATE */}
        {showTemplateModal && <Modal onClose={() => setShowTemplateModal(false)} title={editingTemplate ? 'Editar plantilla' : 'Nueva plantilla'}>
          <div className="space-y-4 mb-4">
            <div><label className="text-xs font-medium text-gray-500 block mb-1">Nombre</label><input value={templateName} onChange={e => setTemplateName(e.target.value)} placeholder="Ej: Turno mañana..." className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 placeholder:text-gray-400 outline-none" /></div>
            <div><label className="text-xs font-medium text-gray-500 block mb-1">Color</label><div className="flex flex-wrap gap-2">{TEMPLATE_COLORS.map(c => <button key={c} onClick={() => setTemplateColor(c)} className={`w-7 h-7 rounded-full border-2 ${templateColor === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />)}</div></div>
          </div>
          <DayEditor weekly={templateWeekly} dayLabels={dayLabels} onChange={(day, field, value) => setTemplateWeekly(p => ({ ...p, [day]: { ...p[day], [field]: value } }))} />
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"><p className="text-sm text-gray-500">{computeWeeklyHours(templateWeekly)}h/sem</p><button onClick={handleSaveTemplate} disabled={saving || !templateName.trim()} className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl disabled:opacity-50 shadow-lg shadow-amber-600/25">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar</button></div>
        </Modal>}

        {/* MODAL: RULE */}
        {showRuleModal && <Modal onClose={() => setShowRuleModal(false)} title={editingRule ? 'Editar regla' : 'Nueva regla'}>
          <div className="space-y-4">
            <div><label className="text-xs font-medium text-gray-500 block mb-1">Nombre</label><input value={ruleName} onChange={e => setRuleName(e.target.value)} placeholder="Ej: Comerciales mañana..." className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 placeholder:text-gray-400 outline-none" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs font-medium text-gray-500 block mb-1">Criterio</label><select value={ruleCriteria} onChange={e => setRuleCriteria(e.target.value as RuleCriteria)} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 outline-none"><option value="role">Rol</option><option value="department">Departamento</option><option value="position">Puesto</option></select></div>
              <div><label className="text-xs font-medium text-gray-500 block mb-1">Valor</label><input value={ruleCriteriaValue} onChange={e => setRuleCriteriaValue(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 placeholder:text-gray-400 outline-none" /></div>
            </div>
            <div><label className="text-xs font-medium text-gray-500 block mb-1">Plantilla</label><select value={ruleTemplateId} onChange={e => setRuleTemplateId(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 outline-none"><option value="">Seleccionar...</option>{templates.map(t => <option key={t._id} value={t._id}>{t.name} ({t.weeklyHours}h)</option>)}</select></div>
          </div>
          <div className="flex justify-end mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"><button onClick={handleSaveRule} disabled={saving || !ruleName.trim() || !ruleCriteriaValue.trim() || !ruleTemplateId} className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl disabled:opacity-50 shadow-lg shadow-amber-600/25">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar</button></div>
        </Modal>}

        {/* MODAL: VACATION FORM */}
        {showVacForm && <Modal onClose={() => setShowVacForm(false)} title="Solicitar vacaciones">
          <form onSubmit={handleVacSubmit} className="space-y-4">
            <div><label className="text-xs font-medium text-gray-500 block mb-1">Tipo</label><select value={vacFormData.leaveType} onChange={e => setVacFormData({ ...vacFormData, leaveType: e.target.value as LeaveType })} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 outline-none">{(Object.keys(leaveLabels) as LeaveType[]).map(lt => <option key={lt} value={lt}>{leaveLabels[lt]}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium text-gray-500 block mb-1">Desde</label><input type="date" value={vacFormData.startDate} onChange={e => setVacFormData({ ...vacFormData, startDate: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 outline-none" required /></div><div><label className="text-xs font-medium text-gray-500 block mb-1">Hasta</label><input type="date" value={vacFormData.endDate} onChange={e => setVacFormData({ ...vacFormData, endDate: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 outline-none" required /></div></div>
            {vacFormData.startDate && vacFormData.endDate && vacFormData.startDate <= vacFormData.endDate && <p className="text-sm text-gray-500"><span className="font-semibold">{countBusinessDays(vacFormData.startDate, vacFormData.endDate)}</span> días laborables</p>}
            <div><label className="text-xs font-medium text-gray-500 block mb-1">Notas</label><textarea value={vacFormData.notes} onChange={e => setVacFormData({ ...vacFormData, notes: e.target.value })} rows={2} placeholder="Opcional..." className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 placeholder:text-gray-400 outline-none" /></div>
            <button type="submit" disabled={saving} className="w-full flex items-center justify-center gap-2 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl disabled:opacity-50 shadow-lg shadow-amber-600/25">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}Enviar</button>
          </form>
        </Modal>}

        {/* MODAL: HOLIDAY */}
        {showHolidayModal && <Modal onClose={() => setShowHolidayModal(false)} title="Nuevo festivo">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium text-gray-500 block mb-1">Fecha</label><input type="date" value={holidayForm.date} onChange={e => setHolidayForm({ ...holidayForm, date: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 outline-none" /></div><div><label className="text-xs font-medium text-gray-500 block mb-1">Nombre</label><input value={holidayForm.name} onChange={e => setHolidayForm({ ...holidayForm, name: e.target.value })} placeholder="Ej: Navidad..." className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 placeholder:text-gray-400 outline-none" /></div></div>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={holidayForm.recurring} onChange={e => setHolidayForm({ ...holidayForm, recurring: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-amber-600" /><span className="text-sm">Recurrente</span></label>
            <div><label className="text-xs font-medium text-gray-500 block mb-1">Ámbito</label><select value={holidayForm.scope} onChange={e => setHolidayForm({ ...holidayForm, scope: e.target.value as HolidayScope })} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 outline-none"><option value="all">Toda la empresa</option><option value="work_center">Centro de trabajo</option><option value="department">Departamento</option></select></div>
          </div>
          <div className="flex justify-end mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"><button onClick={handleSaveHoliday} disabled={saving || !holidayForm.date || !holidayForm.name.trim()} className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl disabled:opacity-50 shadow-lg shadow-amber-600/25">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar</button></div>
        </Modal>}

        {/* MODAL: BLOCK */}
        {showBlockModal && <Modal onClose={() => setShowBlockModal(false)} title="Nuevo bloqueo">
          <div className="space-y-4">
            <div><label className="text-xs font-medium text-gray-500 block mb-1">Miembro</label><select value={blockForm.member_id} onChange={e => setBlockForm({ ...blockForm, member_id: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 outline-none">{members.map(m => <option key={m.user_id} value={m.user_id}>{m.fullName}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium text-gray-500 block mb-1">Desde</label><input type="date" value={blockForm.startDate} onChange={e => setBlockForm({ ...blockForm, startDate: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 outline-none" /></div><div><label className="text-xs font-medium text-gray-500 block mb-1">Hasta</label><input type="date" value={blockForm.endDate} onChange={e => setBlockForm({ ...blockForm, endDate: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 outline-none" /></div></div>
            <div><label className="text-xs font-medium text-gray-500 block mb-1">Motivo</label><select value={blockForm.reason} onChange={e => setBlockForm({ ...blockForm, reason: e.target.value as BlockReason })} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 outline-none">{(Object.keys(blockLabels) as BlockReason[]).map(r => <option key={r} value={r}>{blockLabels[r]}</option>)}</select></div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={blockForm.allDay} onChange={e => setBlockForm({ ...blockForm, allDay: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-amber-600" /><span className="text-sm">Todo el día</span></label>
            {!blockForm.allDay && <div className="grid grid-cols-2 gap-3"><div><label className="text-xs font-medium text-gray-500 block mb-1">Hora inicio</label><input type="time" value={blockForm.startTime} onChange={e => setBlockForm({ ...blockForm, startTime: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 outline-none" /></div><div><label className="text-xs font-medium text-gray-500 block mb-1">Hora fin</label><input type="time" value={blockForm.endTime} onChange={e => setBlockForm({ ...blockForm, endTime: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 outline-none" /></div></div>}
            <div><label className="text-xs font-medium text-gray-500 block mb-1">Notas</label><textarea value={blockForm.notes} onChange={e => setBlockForm({ ...blockForm, notes: e.target.value })} rows={2} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 placeholder:text-gray-400 outline-none" /></div>
          </div>
          <div className="flex justify-end mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"><button onClick={handleSaveBlock} disabled={saving || !blockForm.member_id || !blockForm.startDate || !blockForm.endDate} className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl disabled:opacity-50 shadow-lg shadow-amber-600/25">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Guardar</button></div>
        </Modal>}

        {/* MODAL: BULK */}
        {showBulkModal && <Modal onClose={() => setShowBulkModal(false)} title="Asignación masiva" subtitle={`Semana ${currentWeekStart}`}>
          <div className="space-y-4">
            <div><label className="text-xs font-medium text-gray-500 block mb-1">Plantilla</label><select value={bulkTemplateId} onChange={e => setBulkTemplateId(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 outline-none">{templates.map(t => <option key={t._id} value={t._id}>{t.name} ({t.weeklyHours}h)</option>)}</select></div>
            <div>
              <div className="flex justify-between mb-2"><label className="text-xs font-medium text-gray-500">Miembros</label><button onClick={() => setBulkSelectedMembers(prev => prev.size === members.length ? new Set() : new Set(members.map(m => m.user_id)))} className="text-xs text-amber-600 font-medium">{bulkSelectedMembers.size === members.length ? 'Ninguno' : 'Todos'}</button></div>
              <div className="max-h-60 overflow-y-auto space-y-1 border border-gray-200 dark:border-gray-700 rounded-lg p-2">{members.map(m => <label key={m.user_id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"><input type="checkbox" checked={bulkSelectedMembers.has(m.user_id)} onChange={() => setBulkSelectedMembers(p => { const n = new Set(p); n.has(m.user_id) ? n.delete(m.user_id) : n.add(m.user_id); return n; })} className="w-4 h-4 rounded border-gray-300 text-amber-600" /><span className="text-sm">{m.fullName}</span></label>)}</div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500">{bulkSelectedMembers.size} seleccionados</p>
            <button onClick={handleBulkAssign} disabled={saving || !bulkSelectedMembers.size} className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl disabled:opacity-50 shadow-lg shadow-amber-600/25">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}Aplicar</button>
          </div>
        </Modal>}
      </div>
    </Layout>
  );
}

function Modal({ onClose, title, subtitle, children }: { onClose: () => void; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div><h3 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h3>{subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}</div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function DayEditor({ weekly, dayLabels, onChange }: { weekly: Record<Weekday, DayShift>; dayLabels: Record<Weekday, string>; onChange: (day: Weekday, field: keyof DayShift, value: any) => void }) {
  return <div className="space-y-3">{WEEKDAYS.map(day => { const s = weekly[day]; return (
    <div key={day} className={`flex items-center gap-4 p-3 rounded-xl ${s.enabled ? 'bg-gray-50 dark:bg-gray-700/30' : 'bg-gray-50/50 dark:bg-gray-800/30 opacity-60'}`}>
      <label className="flex items-center gap-3 w-28 shrink-0 cursor-pointer"><input type="checkbox" checked={s.enabled} onChange={e => onChange(day, 'enabled', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-amber-600" /><span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{dayLabels[day]}</span></label>
      {s.enabled && <div className="flex items-center gap-2 flex-wrap"><TInput label="Entrada" value={s.start} onChange={v => onChange(day, 'start', v)} /><TInput label="Salida" value={s.end} onChange={v => onChange(day, 'end', v)} /><span className="text-xs text-gray-400 mx-1">|</span><TInput label="Ini. pausa" value={s.breakStart} onChange={v => onChange(day, 'breakStart', v)} /><TInput label="Fin pausa" value={s.breakEnd} onChange={v => onChange(day, 'breakEnd', v)} /></div>}
    </div>
  ); })}</div>;
}

function TInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <div className="flex flex-col gap-0.5"><span className="text-[10px] text-gray-400 leading-none">{label}</span><input type="time" value={value} onChange={e => onChange(e.target.value)} className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 w-[5.5rem] outline-none" /></div>;
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const c: Record<string, string> = { green: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400', amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400', blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400', red: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' };
  return <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"><div className="flex items-center gap-3"><div className={`p-2 rounded-lg ${c[color]}`}>{icon}</div><div><p className="text-xs text-gray-500">{label}</p><p className="text-lg font-bold tabular-nums">{value}</p></div></div></div>;
}

function AlertBanner({ type, message, onClose }: { type: 'error' | 'success' | 'warning'; message: string; onClose?: () => void }) {
  const s = { error: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400', success: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400', warning: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400' };
  return <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${s[type]}`}>{type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : type === 'warning' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}{message}{onClose && <button onClick={onClose} className="ml-auto"><X className="w-4 h-4" /></button>}</div>;
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="flex flex-col items-center justify-center py-16 text-gray-400">{icon}<h3 className="mt-3 text-sm font-semibold text-gray-600 dark:text-gray-300">{title}</h3><p className="mt-1 text-xs text-center max-w-sm">{description}</p></div>;
}
