import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarRange,
  Users,
  Save,
  X,
  Loader2,
  AlertCircle,
  Pencil,
  Timer,
  Plus,
  Copy,
  Trash2,
  Zap,
  LayoutTemplate,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Check,
  UserCheck,
  Pause,
  CheckCircle2,
  AlertTriangle,
  MapPin,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { ScheduleTimeField } from '../../components/saas/ScheduleTimeField';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { applyLaborCostToEmployment } from '../../lib/laborCost';
import type { EmploymentInfo } from '../../lib/authApi';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import type {
  ScheduleTemplate,
  DayShift,
  Weekday,
  ShiftTemplate,
  AssignmentRule,
  RuleCriteria,
  TeamMember,
} from '../../lib/schedulesApi';
import {
  listSchedules,
  saveSchedule,
  defaultWeekly,
  computeWeeklyHours,
  getMonday,
  WEEKDAYS,
  WEEKDAY_LABELS,
  TEMPLATE_COLORS,
  inferWorkdayFromWeeklyHours,
  listShiftTemplates,
  saveShiftTemplate,
  deleteShiftTemplate,
  listAssignmentRules,
  saveAssignmentRule,
  deleteAssignmentRule,
  applyTemplateToMembers,
  autoAssignByRules,
} from '../../lib/schedulesApi';
import { pickStoreOpeningHours } from '../../lib/businessHoursUtils';
import { listClockins } from '../../lib/clockinsApi';
import type { ClockinRecord } from '../../lib/clockinsApi';

type Tab = 'schedules' | 'templates' | 'rules' | 'comparison';

const MANAGER_ROLES = new Set(['Admin', 'Gerente']);

export function Schedules() {
  const { t, i18n } = useTranslation();
  const { user, listUsers, updateUser } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';

  const { activeWorkCenters, hasWorkCenters } = useWorkCenters();
  const [filterWorkCenter, setFilterWorkCenter] = useState<string>('all');
  const canManage = MANAGER_ROLES.has(user?.role || '');
  const [tab, setTab] = useState<Tab>('schedules');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [schedules, setSchedules] = useState<ScheduleTemplate[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [rules, setRules] = useState<AssignmentRule[]>([]);

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editWeekly, setEditWeekly] = useState<Record<Weekday, DayShift>>(defaultWeekly());
  const [editWorkCenterId, setEditWorkCenterId] = useState<string>('');
  const [editWorkCenterName, setEditWorkCenterName] = useState<string>('');

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

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkTemplateId, setBulkTemplateId] = useState('');
  const [bulkSelectedMembers, setBulkSelectedMembers] = useState<Set<string>>(new Set());
  const [bulkWorkCenterId, setBulkWorkCenterId] = useState('');
  const [bulkWorkCenterName, setBulkWorkCenterName] = useState('');

  const [weekOffset, setWeekOffset] = useState(0);

  useModalClose(!!editingMemberId, () => setEditingMemberId(null));
  useModalClose(showTemplateModal, () => setShowTemplateModal(false));
  useModalClose(showRuleModal, () => setShowRuleModal(false));
  useModalClose(showBulkModal, () => setShowBulkModal(false));

  const [clockins, setClockins] = useState<ClockinRecord[]>([]);
  const [comparisonDate, setComparisonDate] = useState(() => new Date().toISOString().slice(0, 10));

  const lang = (i18n.language?.slice(0, 2) || 'es') as string;
  const dayLabels = WEEKDAY_LABELS[lang] || WEEKDAY_LABELS.es;

  const currentWeekStart = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + weekOffset * 7);
    return getMonday(base);
  }, [weekOffset]);

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!businessId) return;
    const silent = Boolean(opts?.silent);
    if (!silent) setLoading(true);
    try {
      const [scheds, memberList, tmpls, rls] = await Promise.all([
        listSchedules(businessId, currentWeekStart),
        listUsers(businessId).catch(() => []),
        canManage ? listShiftTemplates(businessId) : Promise.resolve([]),
        canManage ? listAssignmentRules(businessId) : Promise.resolve([]),
      ]);
      setSchedules(scheds);
      setMembers((memberList as any[]).map((u: any) => ({
        user_id: u.user_id,
        fullName: u.fullName,
        role: u.role,
        employment: u.employment,
      })));
      setTemplates(tmpls);
      setRules(rls);
    } catch (e: any) {
      setError(e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [businessId, canManage, currentWeekStart]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadClockins = useCallback(async () => {
    if (!businessId) return;
    try {
      const records = await listClockins(businessId, { date: comparisonDate });
      setClockins(records);
    } catch {}
  }, [businessId, comparisonDate]);

  useEffect(() => {
    if (tab === 'comparison') loadClockins();
  }, [tab, comparisonDate, loadClockins]);

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 2500);
  };

  // ── Schedule editing ──────────────────────────────────────────────────────

  const storeHoursForDefaults = useCallback(
    (preferredWorkCenterId?: string) => {
      const preferred =
        preferredWorkCenterId
        || (filterWorkCenter !== 'all' ? filterWorkCenter : '')
        || '';
      return pickStoreOpeningHours(activeWorkCenters, preferred);
    },
    [activeWorkCenters, filterWorkCenter],
  );

  const openEditor = (memberId: string) => {
    const existing = schedules.find(s => s.member_id === memberId);
    const member = members.find((m) => m.user_id === memberId) as { workCenterId?: string } | undefined;
    const preferredWc =
      existing?.work_center_id
      || String(member?.workCenterId || '').trim()
      || '';
    setEditWeekly(
      existing
        ? { ...existing.weekly }
        : defaultWeekly(storeHoursForDefaults(preferredWc)),
    );
    const wc =
      preferredWc
        ? activeWorkCenters.find((c) => c.id === preferredWc || c._id === preferredWc)
        : null;
    setEditWorkCenterId(existing?.work_center_id || preferredWc || '');
    setEditWorkCenterName(existing?.work_center_name || wc?.name || '');
    setEditingMemberId(memberId);
    setError('');
  };

  const closeEditor = () => setEditingMemberId(null);

  const updateDay = (day: Weekday, field: keyof DayShift, value: any) => {
    setEditWeekly(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const handleSave = async () => {
    if (!editingMemberId || !businessId) return;
    setSaving(true);
    setError('');
    try {
      const member = members.find(m => m.user_id === editingMemberId);
      const existing =
        schedules.find((s) => s.member_id === editingMemberId && s.week_start === currentWeekStart)
        || schedules.find((s) => s.member_id === editingMemberId && !s.week_start)
        || null;
      const existingForWeek =
        existing && (!existing.week_start || existing.week_start === currentWeekStart)
          ? existing
          : null;
      await saveSchedule(
        businessId,
        editingMemberId,
        member?.fullName || '',
        editWeekly,
        existingForWeek,
        undefined,
        currentWeekStart,
        editWorkCenterId || undefined,
        editWorkCenterName || undefined,
      );
      // Horas/jornada salen del horario (invitación o edición), no a mano en RRHH.
      const hours = computeWeeklyHours(editWeekly);
      if (hours > 0 && canManage) {
        const emp = ((member as { employment?: EmploymentInfo } | undefined)?.employment || {}) as EmploymentInfo;
        await updateUser(editingMemberId, {
          employment: applyLaborCostToEmployment({
            ...emp,
            hoursPerWeek: hours,
            workday: inferWorkdayFromWeeklyHours(hours) || emp.workday || '',
          } as EmploymentInfo),
        } as any).catch(() => null);
      }
      flash(`Horario guardado · ${hours} h/sem`);
      closeEditor();
      await loadData({ silent: true });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const applyTemplateToEditor = (templateId: string) => {
    const tmpl = templates.find(t => t._id === templateId);
    if (tmpl) setEditWeekly({ ...tmpl.weekly });
  };

  // ── Template modal ────────────────────────────────────────────────────────

  const openTemplateModal = (existing?: ShiftTemplate) => {
    if (existing) {
      setEditingTemplate(existing);
      setTemplateName(existing.name);
      setTemplateColor(existing.color);
      setTemplateWeekly({ ...existing.weekly });
    } else {
      setEditingTemplate(null);
      setTemplateName('');
      setTemplateColor(TEMPLATE_COLORS[Math.floor(Math.random() * TEMPLATE_COLORS.length)]);
      setTemplateWeekly(defaultWeekly(storeHoursForDefaults()));
    }
    setShowTemplateModal(true);
    setError('');
  };

  const handleSaveTemplate = async () => {
    if (!businessId || !templateName.trim()) return;
    setSaving(true);
    setError('');
    try {
      await saveShiftTemplate(businessId, templateName.trim(), templateColor, templateWeekly, editingTemplate);
      flash('Plantilla guardada');
      setShowTemplateModal(false);
      await loadData({ silent: true });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (tmpl: ShiftTemplate) => {
    if (!confirm('¿Eliminar esta plantilla?')) return;
    try {
      await deleteShiftTemplate(tmpl);
      flash('Plantilla eliminada');
      await loadData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // ── Rule modal ────────────────────────────────────────────────────────────

  const openRuleModal = (existing?: AssignmentRule) => {
    if (existing) {
      setEditingRule(existing);
      setRuleName(existing.name);
      setRuleCriteria(existing.criteria);
      setRuleCriteriaValue(existing.criteria_value);
      setRuleTemplateId(existing.template_id);
    } else {
      setEditingRule(null);
      setRuleName('');
      setRuleCriteria('role');
      setRuleCriteriaValue('');
      setRuleTemplateId(templates[0]?._id || '');
    }
    setShowRuleModal(true);
    setError('');
  };

  const handleSaveRule = async () => {
    if (!businessId || !ruleName.trim() || !ruleCriteriaValue.trim() || !ruleTemplateId) return;
    setSaving(true);
    setError('');
    try {
      const tmpl = templates.find(t => t._id === ruleTemplateId);
      await saveAssignmentRule(businessId, {
        name: ruleName.trim(),
        criteria: ruleCriteria,
        criteria_value: ruleCriteriaValue.trim(),
        template_id: ruleTemplateId,
        template_name: tmpl?.name || '',
        active: editingRule?.active ?? true,
      }, editingRule);
      flash('Regla guardada');
      await loadData();
      setShowRuleModal(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleRuleActive = async (rule: AssignmentRule) => {
    try {
      await saveAssignmentRule(businessId, {
        name: rule.name,
        criteria: rule.criteria,
        criteria_value: rule.criteria_value,
        template_id: rule.template_id,
        template_name: rule.template_name,
        active: !rule.active,
      }, rule);
      await loadData();
    } catch {}
  };

  const handleDeleteRule = async (rule: AssignmentRule) => {
    if (!confirm('¿Eliminar esta regla?')) return;
    try {
      await deleteAssignmentRule(rule);
      flash('Regla eliminada');
      await loadData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleAutoAssign = async () => {
    if (!businessId || rules.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const result = await autoAssignByRules(businessId, rules, templates, members, schedules, currentWeekStart);
      flash(`Auto-asignación: ${result.applied} aplicados, ${result.skipped} omitidos`);
      await loadData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Bulk assign ───────────────────────────────────────────────────────────

  const openBulkModal = () => {
    setBulkTemplateId(templates[0]?._id || '');
    setBulkSelectedMembers(new Set());
    setBulkWorkCenterId('');
    setBulkWorkCenterName('');
    setShowBulkModal(true);
    setError('');
  };

  const toggleBulkMember = (id: string) => {
    setBulkSelectedMembers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulkAssign = async () => {
    if (!businessId || !bulkTemplateId || bulkSelectedMembers.size === 0) return;
    setSaving(true);
    setError('');
    try {
      const tmpl = templates.find(t => t._id === bulkTemplateId);
      if (!tmpl) return;
      const selected = members.filter(m => bulkSelectedMembers.has(m.user_id));
      await applyTemplateToMembers(businessId, tmpl, selected, schedules, currentWeekStart, bulkWorkCenterId || undefined, bulkWorkCenterName || undefined);
      flash(`Plantilla "${tmpl.name}" aplicada a ${selected.length} miembros`);
      await loadData();
      setShowBulkModal(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Weekly calendar view ──────────────────────────────────────────────────

  const weekStartDate = useMemo(() => {
    const d = new Date(currentWeekStart + 'T00:00:00');
    return d;
  }, [currentWeekStart]);

  const weekDates = useMemo(() => {
    return WEEKDAYS.map((_, i) => {
      const d = new Date(weekStartDate);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStartDate]);

  const isToday = (date: Date) => {
    const now = new Date();
    return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  };

  const formatDate = (d: Date) => d.toLocaleDateString(lang, { day: 'numeric', month: 'short' });

  // ── Comparison data ───────────────────────────────────────────────────────

  const comparisonDay = useMemo(() => {
    const d = new Date(comparisonDate + 'T00:00:00');
    return WEEKDAYS[(d.getDay() + 6) % 7];
  }, [comparisonDate]);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const getScheduleForMember = (memberId: string) => schedules.find(s => s.member_id === memberId);
  const totalTeamHours = schedules.reduce((s, sched) => s + sched.weeklyHours, 0);
  const membersWithSchedule = schedules.length;

  // ── Visible members (workers see only themselves) ─────────────────────────

  const visibleMembers = useMemo(() => {
    let list = canManage ? members : members.filter(m => m.user_id === user?.user_id);
    if (filterWorkCenter !== 'all') {
      list = list.filter(m => (m as any).workCenterId === filterWorkCenter);
    }
    return list;
  }, [members, canManage, user?.user_id, filterWorkCenter]);

  // ── Tabs config ───────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'schedules', label: 'Horarios', icon: <CalendarRange className="w-4 h-4" /> },
    ...(canManage ? [
      { id: 'templates' as Tab, label: 'Plantillas', icon: <LayoutTemplate className="w-4 h-4" /> },
      { id: 'rules' as Tab, label: 'Reglas automáticas', icon: <Settings2 className="w-4 h-4" /> },
      { id: 'comparison' as Tab, label: 'Horario vs Fichaje', icon: <Timer className="w-4 h-4" /> },
    ] : []),
  ];

  if (loading) {
    return (
      <Layout title={t('nav.schedules')} subtitle="">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={t('nav.schedules')} subtitle={canManage ? 'Gestión de horarios del equipo' : 'Tu horario semanal'}>
      <div className="space-y-6">
        {/* Alerts */}
        {error && !editingMemberId && !showTemplateModal && !showRuleModal && (
          <Alert type="error" message={error} />
        )}
        {success && <Alert type="success" message={success} />}

        {/* Tabs */}
        {tabs.length > 1 && (
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit overflow-x-auto">
            {tabs.map(tb => (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  tab === tb.id
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {tb.icon}
                {tb.label}
              </button>
            ))}
          </div>
        )}

        {hasWorkCenters && (
          <div className="flex flex-wrap gap-3">
            <select
              value={filterWorkCenter}
              onChange={e => setFilterWorkCenter(e.target.value)}
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none"
            >
              <option value="all">Todos los centros</option>
              {activeWorkCenters.map(wc => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
            </select>
          </div>
        )}

        {/* ════════════════════ TAB: SCHEDULES ════════════════════ */}
        {tab === 'schedules' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={<Users className="w-5 h-5" />} label="Miembros" value={String(members.length)} color="blue" />
              <StatCard icon={<CalendarRange className="w-5 h-5" />} label="Con horario" value={String(membersWithSchedule)} color="green" />
              <StatCard icon={<Timer className="w-5 h-5" />} label="Horas/semana equipo" value={`${totalTeamHours}h`} color="amber" />
              <StatCard icon={<LayoutTemplate className="w-5 h-5" />} label="Plantillas" value={String(templates.length)} color="purple" />
            </div>

            {/* Actions bar */}
            {canManage && templates.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button onClick={openBulkModal} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors shadow-sm">
                  <Copy className="w-4 h-4" />
                  Asignación masiva
                </button>
                {rules.length > 0 && (
                  <button onClick={handleAutoAssign} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-xl transition-colors">
                    <Zap className="w-4 h-4" />
                    Ejecutar auto-asignación
                  </button>
                )}
              </div>
            )}

            {/* Weekly calendar view */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  <ChevronLeft className="w-4 h-4 text-gray-500" />
                </button>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider">
                    Semana del {currentWeekStart}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      {formatDate(weekDates[0])} — {formatDate(weekDates[6])}
                    </span>
                    {weekOffset !== 0 && (
                      <button onClick={() => setWeekOffset(0)} className="px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded-md hover:bg-amber-100 transition-colors">
                        Hoy
                      </button>
                    )}
                  </div>
                </div>
                <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-48">Miembro</th>
                      {WEEKDAYS.map((day, i) => (
                        <th key={day} className={`px-2 py-3 text-center text-xs font-semibold uppercase ${
                          isToday(weekDates[i])
                            ? 'text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-900/10'
                            : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          <div>{dayLabels[day]?.slice(0, 3)}</div>
                          <div className="text-[10px] font-normal mt-0.5">{weekDates[i].getDate()}</div>
                        </th>
                      ))}
                      <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">H/sem</th>
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
                            {tmpl && (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tmpl.color }} />
                                <span className="text-[10px] text-gray-400">{tmpl.name}</span>
                              </div>
                            )}
                            {sched?.work_center_name && (
                              <div className="flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 text-blue-400" />
                                <span className="text-[10px] text-blue-500 dark:text-blue-400 truncate">{sched.work_center_name}</span>
                              </div>
                            )}
                          </td>
                          {WEEKDAYS.map((day, i) => {
                            const shift = sched?.weekly?.[day];
                            return (
                              <td key={day} className={`px-2 py-3 text-center ${isToday(weekDates[i]) ? 'bg-amber-50/30 dark:bg-amber-900/5' : ''}`}>
                                {shift?.enabled ? (
                                  <div className="text-xs">
                                    <span className="font-medium text-gray-900 dark:text-white">{shift.start}</span>
                                    <span className="text-gray-400 mx-0.5">-</span>
                                    <span className="font-medium text-gray-900 dark:text-white">{shift.end}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-3 text-center">
                            <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                              {sched ? `${sched.weeklyHours}h` : '—'}
                            </span>
                          </td>
                          {canManage && (
                            <td className="px-3 py-3 text-center">
                              <button
                                onClick={() => openEditor(member.user_id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors opacity-0 group-hover:opacity-100"
                                title="Editar horario"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {visibleMembers.length === 0 && (
                      <tr>
                        <td colSpan={10} className="py-16 text-center text-gray-400 text-sm">
                          <Users className="w-10 h-10 mx-auto mb-3" />
                          {canManage ? 'No hay miembros en el equipo' : 'No tienes un horario asignado'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ════════════════════ TAB: TEMPLATES ════════════════════ */}
        {tab === 'templates' && canManage && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Plantillas reutilizables de horario. Crea turnos y aplícalos fácilmente a varios miembros.
              </p>
              <button onClick={() => openTemplateModal()} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors shadow-sm">
                <Plus className="w-4 h-4" />
                Nueva plantilla
              </button>
            </div>

            {templates.length === 0 ? (
              <EmptyState
                icon={<LayoutTemplate className="w-12 h-12" />}
                title="Sin plantillas"
                description="Crea plantillas para reutilizar horarios (ej: Turno mañana, Turno tarde, Jornada completa)"
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {templates.map(tmpl => (
                  <div key={tmpl._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700/50">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tmpl.color }} />
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex-1 truncate">{tmpl.name}</h4>
                      <span className="text-xs text-gray-500 tabular-nums">{tmpl.weeklyHours}h/sem</span>
                    </div>
                    <div className="px-4 py-3 space-y-1">
                      {WEEKDAYS.map(day => {
                        const shift = tmpl.weekly[day];
                        return (
                          <div key={day} className="flex items-center justify-between text-xs">
                            <span className="text-gray-500 dark:text-gray-400 w-12">{dayLabels[day]?.slice(0, 3)}</span>
                            {shift?.enabled ? (
                              <span className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">{shift.start} - {shift.end}</span>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600">Libre</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-1 px-4 py-2 border-t border-gray-100 dark:border-gray-700/50">
                      <button onClick={() => openTemplateModal(tmpl)} className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors">
                        <Pencil className="w-3 h-3 inline mr-1" />
                        Editar
                      </button>
                      <button onClick={() => handleDeleteTemplate(tmpl)} className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ════════════════════ TAB: RULES ════════════════════ */}
        {tab === 'rules' && canManage && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Reglas para asignar automáticamente horarios según rol, departamento o puesto.
              </p>
              <div className="flex gap-2">
                {rules.filter(r => r.active).length > 0 && (
                  <button onClick={handleAutoAssign} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-xl transition-colors">
                    <Zap className="w-4 h-4" />
                    Ejecutar
                  </button>
                )}
                <button onClick={() => openRuleModal()} disabled={templates.length === 0} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors shadow-sm disabled:opacity-50" title={templates.length === 0 ? 'Crea primero una plantilla' : ''}>
                  <Plus className="w-4 h-4" />
                  Nueva regla
                </button>
              </div>
            </div>

            {templates.length === 0 && (
              <Alert type="warning" message="Necesitas crear al menos una plantilla antes de definir reglas automáticas." />
            )}

            {rules.length === 0 ? (
              <EmptyState
                icon={<Settings2 className="w-12 h-12" />}
                title="Sin reglas automáticas"
                description="Crea reglas como: 'Comerciales → Turno mañana' o 'Taller → Jornada completa'"
              />
            ) : (
              <div className="space-y-3">
                {rules.map(rule => {
                  const tmpl = templates.find(t => t._id === rule.template_id);
                  const criteriaLabel = { role: 'Rol', department: 'Departamento', position: 'Puesto' }[rule.criteria];
                  return (
                    <div key={rule._id} className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                      rule.active
                        ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                        : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700/50 opacity-60'
                    }`}>
                      <button onClick={() => toggleRuleActive(rule)} className={`p-1.5 rounded-lg transition-colors ${rule.active ? 'text-green-600 bg-green-50 dark:bg-green-900/20' : 'text-gray-400 bg-gray-100 dark:bg-gray-700'}`}>
                        {rule.active ? <CheckCircle2 className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{rule.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {criteriaLabel}: <span className="font-medium">{rule.criteria_value}</span>
                          <span className="mx-1.5">→</span>
                          {tmpl && <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: tmpl.color }} />{tmpl.name}</span>}
                          {!tmpl && <span className="text-red-400">(plantilla eliminada)</span>}
                        </p>
                      </div>
                      <button onClick={() => openRuleModal(rule)} className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteRule(rule)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ════════════════════ TAB: COMPARISON ════════════════════ */}
        {tab === 'comparison' && canManage && (
          <>
            <div className="flex items-center gap-4">
              <input
                type="date"
                value={comparisonDate}
                onChange={e => setComparisonDate(e.target.value)}
                className="px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
              <button onClick={() => setComparisonDate(new Date().toISOString().slice(0, 10))} className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 rounded-lg hover:bg-amber-100 transition-colors">
                Hoy
              </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Miembro</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Horario previsto</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Fichaje real</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Diferencia entrada</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Diferencia salida</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {members.map(member => {
                      const sched = getScheduleForMember(member.user_id);
                      const shift = sched?.weekly?.[comparisonDay];
                      const record = clockins.find(c => c.member_id === member.user_id);
                      const clockInEntry = record?.entries.find(e => e.type === 'clock_in');
                      const clockOutEntry = record?.entries.find(e => e.type === 'clock_out');

                      const diffIn = shift?.enabled && clockInEntry ? getTimeDiffMinutes(shift.start, clockInEntry.time) : null;
                      const diffOut = shift?.enabled && clockOutEntry ? getTimeDiffMinutes(shift.end, clockOutEntry.time) : null;

                      let status: 'ok' | 'late' | 'early' | 'absent' | 'no-schedule' = 'no-schedule';
                      if (shift?.enabled) {
                        if (!record) status = 'absent';
                        else if (diffIn !== null && diffIn > 5) status = 'late';
                        else if (diffOut !== null && diffOut < -5) status = 'early';
                        else status = 'ok';
                      }

                      const statusConfig = {
                        ok: { label: 'Correcto', cls: 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400' },
                        late: { label: 'Retraso', cls: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400' },
                        early: { label: 'Salida anticipada', cls: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400' },
                        absent: { label: 'Ausencia', cls: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400' },
                        'no-schedule': { label: 'Sin horario', cls: 'text-gray-400 bg-gray-50 dark:bg-gray-700 dark:text-gray-500' },
                      };
                      const sc = statusConfig[status];

                      return (
                        <tr key={member.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{member.fullName}</p>
                          </td>
                          <td className="px-4 py-3 text-center text-sm tabular-nums text-gray-600 dark:text-gray-300">
                            {shift?.enabled ? `${shift.start} - ${shift.end}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-center text-sm tabular-nums text-gray-600 dark:text-gray-300">
                            {clockInEntry ? (
                              <>
                                {new Date(clockInEntry.time).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}
                                {clockOutEntry && (
                                  <> - {new Date(clockOutEntry.time).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })}</>
                                )}
                              </>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {diffIn !== null ? (
                              <span className={`text-xs font-medium tabular-nums ${diffIn > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                {diffIn > 0 ? '+' : ''}{diffIn} min
                              </span>
                            ) : <span className="text-xs text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {diffOut !== null ? (
                              <span className={`text-xs font-medium tabular-nums ${diffOut < 0 ? 'text-red-500' : 'text-green-500'}`}>
                                {diffOut > 0 ? '+' : ''}{diffOut} min
                              </span>
                            ) : <span className="text-xs text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${sc.cls}`}>
                              {sc.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ════════════════════ MODAL: EDIT SCHEDULE ════════════════════ */}
        {editingMemberId && (
          <Modal onClose={closeEditor} title="Editar horario" subtitle={`${members.find(m => m.user_id === editingMemberId)?.fullName || ''} — Semana del ${currentWeekStart}`}>
            {error && <Alert type="error" message={error} />}
            {success && <Alert type="success" message={success} />}

            {templates.length > 0 && (
              <div className="mb-4">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">Aplicar plantilla</label>
                <div className="flex flex-wrap gap-2">
                  {templates.map(tmpl => (
                    <button key={tmpl._id} onClick={() => applyTemplateToEditor(tmpl._id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-600 rounded-lg hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tmpl.color }} />
                      {tmpl.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
                  <CalendarRange className="w-3 h-3 inline mr-1" />
                  Semana
                </label>
                <input
                  type="text"
                  value={`Semana del ${currentWeekStart}`}
                  readOnly
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-not-allowed"
                />
              </div>
              {hasWorkCenters && (
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
                    <MapPin className="w-3 h-3 inline mr-1" />
                    Centro de trabajo
                  </label>
                  <select
                    value={editWorkCenterId}
                    onChange={e => {
                      const wc = activeWorkCenters.find(w => w.id === e.target.value);
                      setEditWorkCenterId(e.target.value);
                      setEditWorkCenterName(wc?.name || '');
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  >
                    <option value="">Sin asignar</option>
                    {activeWorkCenters.map(wc => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <DayEditor weekly={editWeekly} dayLabels={dayLabels} onChange={updateDay} />

            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-b-2xl -mx-6 -mb-6 mt-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Total: <span className="font-bold text-gray-900 dark:text-white">{computeWeeklyHours(editWeekly)}h / semana</span>
              </p>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-amber-600/25">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar
              </button>
            </div>
          </Modal>
        )}

        {/* ════════════════════ MODAL: TEMPLATE ════════════════════ */}
        {showTemplateModal && (
          <Modal onClose={() => setShowTemplateModal(false)} title={editingTemplate ? 'Editar plantilla' : 'Nueva plantilla'}>
            {error && <Alert type="error" message={error} />}

            <div className="space-y-4 mb-4">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Nombre</label>
                <input
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder="Ej: Turno mañana, Jornada completa..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Color</label>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_COLORS.map(c => (
                    <button key={c} onClick={() => setTemplateColor(c)} className={`w-7 h-7 rounded-full border-2 transition-all ${templateColor === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
            </div>

            <DayEditor weekly={templateWeekly} dayLabels={dayLabels} onChange={(day, field, value) => {
              setTemplateWeekly(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
            }} />

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500">{computeWeeklyHours(templateWeekly)}h / semana</p>
              <button onClick={handleSaveTemplate} disabled={saving || !templateName.trim()} className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-amber-600/25">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar plantilla
              </button>
            </div>
          </Modal>
        )}

        {/* ════════════════════ MODAL: RULE ════════════════════ */}
        {showRuleModal && (
          <Modal onClose={() => setShowRuleModal(false)} title={editingRule ? 'Editar regla' : 'Nueva regla automática'}>
            {error && <Alert type="error" message={error} />}

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Nombre de la regla</label>
                <input
                  value={ruleName}
                  onChange={e => setRuleName(e.target.value)}
                  placeholder="Ej: Comerciales mañana, Taller jornada..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Criterio</label>
                  <select
                    value={ruleCriteria}
                    onChange={e => setRuleCriteria(e.target.value as RuleCriteria)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  >
                    <option value="role">Rol</option>
                    <option value="department">Departamento</option>
                    <option value="position">Puesto</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Valor</label>
                  {ruleCriteria === 'role' ? (
                    <select
                      value={ruleCriteriaValue}
                      onChange={e => setRuleCriteriaValue(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                    >
                      <option value="">Seleccionar...</option>
                      {['Admin', 'Gerente', 'Comercial', 'Administración', 'Taller', 'Usuario'].map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={ruleCriteriaValue}
                      onChange={e => setRuleCriteriaValue(e.target.value)}
                      placeholder={ruleCriteria === 'department' ? 'Ej: Ventas, Operaciones...' : 'Ej: Camarero, Mecánico...'}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                    />
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Plantilla a aplicar</label>
                <select
                  value={ruleTemplateId}
                  onChange={e => setRuleTemplateId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                >
                  <option value="">Seleccionar plantilla...</option>
                  {templates.map(t => (
                    <option key={t._id} value={t._id}>{t.name} ({t.weeklyHours}h/sem)</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={handleSaveRule}
                disabled={saving || !ruleName.trim() || !ruleCriteriaValue.trim() || !ruleTemplateId}
                className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-amber-600/25"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar regla
              </button>
            </div>
          </Modal>
        )}

        {/* ════════════════════ MODAL: BULK ASSIGN ════════════════════ */}
        {showBulkModal && (
          <Modal onClose={() => setShowBulkModal(false)} title="Asignación masiva" subtitle={`Semana del ${currentWeekStart}`}>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">Plantilla a aplicar</label>
                  <select
                    value={bulkTemplateId}
                    onChange={e => setBulkTemplateId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  >
                    {templates.map(t => (
                      <option key={t._id} value={t._id}>{t.name} ({t.weeklyHours}h/sem)</option>
                    ))}
                  </select>
                </div>
                {hasWorkCenters && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
                      <MapPin className="w-3 h-3 inline mr-1" />
                      Centro de trabajo
                    </label>
                    <select
                      value={bulkWorkCenterId}
                      onChange={e => {
                        const wc = activeWorkCenters.find(w => w.id === e.target.value);
                        setBulkWorkCenterId(e.target.value);
                        setBulkWorkCenterName(wc?.name || '');
                      }}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                    >
                      <option value="">Sin asignar</option>
                      {activeWorkCenters.map(wc => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Seleccionar miembros</label>
                  <button
                    onClick={() => {
                      if (bulkSelectedMembers.size === members.length) setBulkSelectedMembers(new Set());
                      else setBulkSelectedMembers(new Set(members.map(m => m.user_id)));
                    }}
                    className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                  >
                    {bulkSelectedMembers.size === members.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1 border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                  {members.map(m => (
                    <label key={m.user_id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={bulkSelectedMembers.has(m.user_id)}
                        onChange={() => toggleBulkMember(m.user_id)}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{m.fullName}</span>
                      {m.role && <span className="text-[10px] text-gray-400 ml-auto">{m.role}</span>}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500">{bulkSelectedMembers.size} seleccionados</p>
              <button
                onClick={handleBulkAssign}
                disabled={saving || bulkSelectedMembers.size === 0}
                className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-amber-600/25"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                Aplicar a {bulkSelectedMembers.size} miembros
              </button>
            </div>
          </Modal>
        )}
      </div>
    </Layout>
  );
}

// ─── Helper: time diff in minutes ─────────────────────────────────────────

function getTimeDiffMinutes(scheduledTime: string, actualIso: string): number {
  const [sh, sm] = scheduledTime.split(':').map(Number);
  const actual = new Date(actualIso);
  const scheduledMinutes = sh * 60 + sm;
  const actualMinutes = actual.getHours() * 60 + actual.getMinutes();
  return actualMinutes - scheduledMinutes;
}

// ─── Reusable components ─────────────────────────────────────────────────────

function Modal({ onClose, title, subtitle, children }: {
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{title}</h3>
            {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function DayEditor({ weekly, dayLabels, onChange }: {
  weekly: Record<Weekday, DayShift>;
  dayLabels: Record<Weekday, string>;
  onChange: (day: Weekday, field: keyof DayShift, value: any) => void;
}) {
  return (
    <div className="space-y-3">
      {WEEKDAYS.map(day => {
        const shift = weekly[day];
        const overnight = Boolean(
          shift.enabled
          && shift.start
          && shift.end
          && shift.start !== shift.end
          && String(shift.end) < String(shift.start),
        );
        return (
          <div key={day} className={`flex items-center gap-4 p-3 rounded-xl transition-colors ${shift.enabled ? 'bg-gray-50 dark:bg-gray-700/30' : 'bg-gray-50/50 dark:bg-gray-800/30 opacity-60'}`}>
            <label className="flex items-center gap-3 w-28 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                checked={shift.enabled}
                onChange={e => onChange(day, 'enabled', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{dayLabels[day]}</span>
            </label>
            {shift.enabled && (
              <div className="flex items-center gap-2 flex-wrap">
                <TimeInput label="Entrada" value={shift.start} onChange={v => onChange(day, 'start', v)} />
                <TimeInput label="Salida" value={shift.end} onChange={v => onChange(day, 'end', v)} />
                {overnight ? (
                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 whitespace-nowrap">
                    +1 día
                  </span>
                ) : null}
                <span className="text-xs text-gray-400 mx-1">|</span>
                <TimeInput label="Ini. pausa" value={shift.breakStart} onChange={v => onChange(day, 'breakStart', v)} />
                <TimeInput label="Fin pausa" value={shift.breakEnd} onChange={v => onChange(day, 'breakEnd', v)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <ScheduleTimeField compact label={label} value={value} onChange={onChange} />;
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    green: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[color]}`}>{icon}</div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
        </div>
      </div>
    </div>
  );
}

function Alert({ type, message }: { type: 'error' | 'success' | 'warning'; message: string }) {
  const styles = {
    error: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
    success: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
    warning: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
  };
  const icons = {
    error: <AlertCircle className="w-4 h-4 shrink-0" />,
    success: <Check className="w-4 h-4 shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 shrink-0" />,
  };
  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${styles[type]}`}>
      {icons[type]}
      {message}
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      {icon}
      <h3 className="mt-3 text-sm font-semibold text-gray-600 dark:text-gray-300">{title}</h3>
      <p className="mt-1 text-xs text-center max-w-sm">{description}</p>
    </div>
  );
}
