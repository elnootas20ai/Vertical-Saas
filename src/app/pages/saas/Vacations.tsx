import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Umbrella,
  Plus,
  Check,
  X,
  CalendarDays,
  Users,
  Clock,
  Loader2,
  AlertCircle,
  Briefcase,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Search,
  Filter,
  Building2,
  MapPin,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import type { VacationRequest, VacationSettings, LeaveType, VacationStatus } from '../../lib/vacationsApi';
import {
  listVacations,
  createVacationRequest,
  reviewVacation,
  deleteVacation,
  getSettings,
  saveSettings,
  getDaysUsed,
  getDaysAllowed,
  countBusinessDays,
  LEAVE_TYPE_LABELS,
  STATUS_LABELS,
} from '../../lib/vacationsApi';
import { listSalesPoints, type SalesPoint } from '../../lib/salesPointsApi';
import type { AuthUser } from '../../lib/authApi';

type Tab = 'my' | 'team' | 'settings';
type TeamView = 'requests' | 'balance';

const HOURS_PER_DAY = 8;

export function Vacations() {
  const { t, i18n } = useTranslation();
  const { user, listUsers } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = currentBusiness?.business_id || '';

  const [tab, setTab] = useState<Tab>('my');
  const [teamView, setTeamView] = useState<TeamView>('requests');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [settings, setSettings] = useState<VacationSettings | null>(null);
  const [members, setMembers] = useState<AuthUser[]>([]);
  const [salesPoints, setSalesPoints] = useState<SalesPoint[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ startDate: '', endDate: '', leaveType: 'vacation' as LeaveType, notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [filterSalesPoint, setFilterSalesPoint] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterStatus, setFilterStatus] = useState<VacationStatus | ''>('');
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);

  useModalClose(showForm, () => setShowForm(false));

  const isAdmin = user?.role === 'Admin' || user?.role === 'Gerente';
  const lang = (i18n.language?.slice(0, 2) || 'es') as string;
  const leaveLabels = LEAVE_TYPE_LABELS[lang] || LEAVE_TYPE_LABELS.es;
  const statusLabels = STATUS_LABELS[lang] || STATUS_LABELS.es;
  const currentYear = new Date().getFullYear();

  const loadData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [reqs, sett] = await Promise.all([
        listVacations(businessId, { year: currentYear }),
        getSettings(businessId),
      ]);
      setRequests(reqs);
      setSettings(sett);
      if (isAdmin) {
        try {
          const [m, sp] = await Promise.all([
            listUsers(businessId),
            listSalesPoints(user?.user_id || '').catch(() => [] as SalesPoint[]),
          ]);
          setMembers(m as AuthUser[]);
          setSalesPoints(sp);
        } catch {}
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [businessId, currentYear]);

  useEffect(() => { loadData(); }, [loadData]);

  const myRequests = requests.filter(r => r.member_id === user?.user_id);
  const pendingRequests = requests.filter(r => r.status === 'pending');
  const myDaysUsed = user ? getDaysUsed(requests, user.user_id, currentYear) : 0;
  const myDaysAllowed = user && settings ? getDaysAllowed(settings, user.user_id) : 22;
  const myDaysRemaining = Math.max(0, myDaysAllowed - myDaysUsed);

  const departments = useMemo(() => {
    const depts = new Set<string>();
    members.forEach(m => {
      const dept = (m as any).employment?.department;
      if (dept) depts.add(dept);
    });
    return Array.from(depts).sort((a, b) => a.localeCompare(b, 'es'));
  }, [members]);

  const salesPointMap = useMemo(() => {
    const map: Record<string, string> = {};
    salesPoints.forEach(sp => { map[sp.id || sp._id] = sp.name; });
    return map;
  }, [salesPoints]);

  const filteredMembers = useMemo(() => {
    return members.filter(m => {
      const emp = (m as any).employment;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!(m.fullName || '').toLowerCase().includes(q) && !(m.email || '').toLowerCase().includes(q)) return false;
      }
      if (filterSalesPoint && (emp?.salesPointId || '') !== filterSalesPoint) return false;
      if (filterDepartment && (emp?.department || '') !== filterDepartment) return false;
      return true;
    });
  }, [members, searchQuery, filterSalesPoint, filterDepartment]);

  const filteredMemberIds = useMemo(() => new Set(filteredMembers.map(m => m.user_id)), [filteredMembers]);

  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      if (!filteredMemberIds.has(r.member_id)) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      return true;
    });
  }, [requests, filteredMemberIds, filterStatus]);

  const filteredPendingRequests = useMemo(() => filteredRequests.filter(r => r.status === 'pending'), [filteredRequests]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !user) return;
    if (!formData.startDate || !formData.endDate) { setError('Selecciona las fechas'); return; }
    if (formData.startDate > formData.endDate) { setError('La fecha fin debe ser posterior a la de inicio'); return; }
    setSubmitting(true);
    setError('');
    try {
      await createVacationRequest(businessId, user.user_id, user.fullName || user.email, formData);
      setSuccess('Solicitud enviada correctamente');
      setShowForm(false);
      setFormData({ startDate: '', endDate: '', leaveType: 'vacation', notes: '' });
      await loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (record: VacationRequest, decision: 'approved' | 'rejected') => {
    if (!user) return;
    setError('');
    try {
      const note = reviewNotes[record._id] || '';
      await reviewVacation(record, decision, user.user_id, user.fullName || user.email, note);
      setReviewNotes(prev => { const n = { ...prev }; delete n[record._id]; return n; });
      setSuccess(decision === 'approved' ? 'Solicitud aprobada' : 'Solicitud rechazada');
      await loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (record: VacationRequest) => {
    if (!confirm('¿Eliminar esta solicitud?')) return;
    try {
      await deleteVacation(record);
      await loadData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSaveDefaultDays = async (days: number) => {
    if (!settings) return;
    try {
      const updated = await saveSettings({ ...settings, defaultDaysPerYear: days });
      setSettings(updated);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const statusColors: Record<VacationStatus, string> = {
    pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'my', label: 'Mis solicitudes' },
    ...(isAdmin ? [
      { id: 'team' as Tab, label: 'Equipo', badge: pendingRequests.length || undefined },
      { id: 'settings' as Tab, label: 'Ajustes' },
    ] : []),
  ];

  if (loading) {
    return (
      <Layout title={t('nav.vacations')} subtitle="">
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title={t('nav.vacations')} subtitle="">
      <div className="space-y-6">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
            <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm">
            <Check className="w-4 h-4 shrink-0" />
            {success}
          </div>
        )}

        {/* Tabs + action */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
            {tabs.map(tb => (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  tab === tb.id
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                {tb.label}
                {tb.badge && tb.badge > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
                    {tb.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          {tab === 'my' && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-amber-600/25"
            >
              <Plus className="w-4 h-4" />
              Solicitar
            </button>
          )}
        </div>

        {/* Stats */}
        {tab === 'my' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={<Umbrella className="w-5 h-5" />} label="Días asignados" value={String(myDaysAllowed)} color="blue" />
            <StatCard icon={<CalendarDays className="w-5 h-5" />} label="Días usados" value={String(myDaysUsed)} color="amber" />
            <StatCard icon={<Check className="w-5 h-5" />} label="Días restantes" value={String(myDaysRemaining)} color="green" />
            <StatCard icon={<Clock className="w-5 h-5" />} label="Pendientes" value={String(myRequests.filter(r => r.status === 'pending').length)} color="red" />
          </div>
        )}

        {/* My requests table */}
        {tab === 'my' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {myRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Umbrella className="w-10 h-10 mb-3" />
                <p className="text-sm">No tienes solicitudes este año</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Desde</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Hasta</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Días</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Estado</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Notas</th>
                      <th className="px-4 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {myRequests.map(req => (
                      <tr key={req._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{leaveLabels[req.leaveType]}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{req.startDate}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{req.endDate}</td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-gray-900 dark:text-white">{req.totalDays}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[req.status]}`}>
                            {statusLabels[req.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-[200px] truncate">{req.notes || '-'}</td>
                        <td className="px-4 py-3">
                          {req.status === 'pending' && (
                            <button onClick={() => handleDelete(req)} className="p-1 text-red-400 hover:text-red-600 transition-colors" title="Eliminar">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Team requests (admin) */}
        {tab === 'team' && (
          <>
            {/* Team stats overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={<Users className="w-5 h-5" />} label="Trabajadores" value={String(filteredMembers.length)} color="blue" />
              <StatCard icon={<Clock className="w-5 h-5" />} label="Pendientes" value={String(filteredPendingRequests.length)} color="amber" />
              <StatCard icon={<Check className="w-5 h-5" />} label="Aprobadas" value={String(filteredRequests.filter(r => r.status === 'approved').length)} color="green" />
              <StatCard icon={<X className="w-5 h-5" />} label="Rechazadas" value={String(filteredRequests.filter(r => r.status === 'rejected').length)} color="red" />
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Filtros</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar trabajador..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none placeholder:text-gray-400"
                  />
                </div>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select
                    value={filterSalesPoint}
                    onChange={e => setFilterSalesPoint(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none appearance-none"
                  >
                    <option value="">Todos los centros</option>
                    {salesPoints.map(sp => (
                      <option key={sp.id || sp._id} value={sp.id || sp._id}>{sp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select
                    value={filterDepartment}
                    onChange={e => setFilterDepartment(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none appearance-none"
                  >
                    <option value="">Todos los centros de trabajo</option>
                    {departments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value as VacationStatus | '')}
                    className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none appearance-none"
                  >
                    <option value="">Todos los estados</option>
                    <option value="pending">{statusLabels.pending}</option>
                    <option value="approved">{statusLabels.approved}</option>
                    <option value="rejected">{statusLabels.rejected}</option>
                  </select>
                </div>
              </div>
              {(searchQuery || filterSalesPoint || filterDepartment || filterStatus) && (
                <button
                  onClick={() => { setSearchQuery(''); setFilterSalesPoint(''); setFilterDepartment(''); setFilterStatus(''); }}
                  className="mt-2 text-xs text-amber-600 dark:text-amber-400 hover:underline"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            {/* Team sub-tabs */}
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl w-fit">
              <button
                onClick={() => setTeamView('requests')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  teamView === 'requests'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                Solicitudes
                {filteredPendingRequests.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full">
                    {filteredPendingRequests.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTeamView('balance')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  teamView === 'balance'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                }`}
              >
                Balance del equipo
              </button>
            </div>

            {/* Pending requests for review */}
            {teamView === 'requests' && (
              <>
                {filteredPendingRequests.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-500" />
                      Pendientes de aprobación ({filteredPendingRequests.length})
                    </h3>
                    {filteredPendingRequests.map(req => {
                      const member = members.find(m => m.user_id === req.member_id);
                      const emp = (member as any)?.employment;
                      const spName = emp?.salesPointId ? (salesPointMap[emp.salesPointId] || '') : '';
                      const isExpanded = expandedRequest === req._id;
                      return (
                        <div key={req._id} className="bg-white dark:bg-gray-800 rounded-xl border border-amber-200 dark:border-amber-800/50 overflow-hidden">
                          <div
                            className="p-4 cursor-pointer hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors"
                            onClick={() => setExpandedRequest(isExpanded ? null : req._id)}
                          >
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                              <div className="space-y-1 flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-bold text-gray-900 dark:text-white">{req.member_name}</p>
                                  {(spName || emp?.department) && (
                                    <div className="flex items-center gap-1.5">
                                      {spName && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                                          <MapPin className="w-3 h-3" />{spName}
                                        </span>
                                      )}
                                      {emp?.department && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
                                          <Building2 className="w-3 h-3" />{emp.department}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-300">
                                  {leaveLabels[req.leaveType]} · {req.startDate} → {req.endDate} · <span className="font-semibold">{req.totalDays} días ({req.totalDays * HOURS_PER_DAY}h)</span>
                                </p>
                                {req.notes && <p className="text-xs text-gray-500 dark:text-gray-400">{req.notes}</p>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                              </div>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-0 border-t border-amber-100 dark:border-amber-800/30">
                              <div className="pt-3 space-y-3">
                                {member && settings && (() => {
                                  const allowed = getDaysAllowed(settings, member.user_id);
                                  const used = getDaysUsed(requests, member.user_id, currentYear);
                                  const remaining = Math.max(0, allowed - used);
                                  return (
                                    <div className="grid grid-cols-3 gap-3">
                                      <div className="text-center p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                                        <p className="text-[10px] uppercase font-semibold text-blue-600 dark:text-blue-400">Asignados</p>
                                        <p className="text-sm font-bold text-blue-700 dark:text-blue-300">{allowed}d / {allowed * HOURS_PER_DAY}h</p>
                                      </div>
                                      <div className="text-center p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                                        <p className="text-[10px] uppercase font-semibold text-amber-600 dark:text-amber-400">Usados</p>
                                        <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{used}d / {used * HOURS_PER_DAY}h</p>
                                      </div>
                                      <div className="text-center p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
                                        <p className="text-[10px] uppercase font-semibold text-green-600 dark:text-green-400">Saldo</p>
                                        <p className="text-sm font-bold text-green-700 dark:text-green-300">{remaining}d / {remaining * HOURS_PER_DAY}h</p>
                                      </div>
                                    </div>
                                  );
                                })()}
                                <div>
                                  <textarea
                                    value={reviewNotes[req._id] || ''}
                                    onChange={e => setReviewNotes(prev => ({ ...prev, [req._id]: e.target.value }))}
                                    rows={2}
                                    placeholder="Nota de revisión (opcional)..."
                                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                                  />
                                </div>
                                <div className="flex items-center gap-2 justify-end">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleReview(req, 'rejected'); }}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-700 dark:text-red-400 text-sm font-semibold rounded-lg transition-colors border border-red-200 dark:border-red-800"
                                  >
                                    <ThumbsDown className="w-4 h-4" />
                                    Rechazar
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleReview(req, 'approved'); }}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
                                  >
                                    <ThumbsUp className="w-4 h-4" />
                                    Aprobar
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* All team requests */}
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      Todas las solicitudes ({currentYear})
                      {filterStatus && <span className="ml-2 text-xs font-normal text-gray-500">· {statusLabels[filterStatus]}</span>}
                    </h3>
                  </div>
                  {filteredRequests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                      <Briefcase className="w-10 h-10 mb-3" />
                      <p className="text-sm">No hay solicitudes{filterStatus || searchQuery || filterSalesPoint || filterDepartment ? ' con estos filtros' : ' este año'}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[800px]">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Miembro</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Centro / PDV</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fechas</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Días</th>
                            <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Horas</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Estado</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Revisado por</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                          {filteredRequests.map(req => {
                            const member = members.find(m => m.user_id === req.member_id);
                            const emp = (member as any)?.employment;
                            const spName = emp?.salesPointId ? (salesPointMap[emp.salesPointId] || '') : '';
                            return (
                              <tr key={req._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{req.member_name}</td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-col gap-0.5">
                                    {emp?.department && <span className="text-xs text-purple-600 dark:text-purple-400">{emp.department}</span>}
                                    {spName && <span className="text-xs text-blue-600 dark:text-blue-400">{spName}</span>}
                                    {!emp?.department && !spName && <span className="text-xs text-gray-400">-</span>}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{leaveLabels[req.leaveType]}</td>
                                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{req.startDate} → {req.endDate}</td>
                                <td className="px-4 py-3 text-center text-sm font-bold text-gray-900 dark:text-white">{req.totalDays}</td>
                                <td className="px-4 py-3 text-center text-sm font-bold text-gray-900 dark:text-white">{req.totalDays * HOURS_PER_DAY}</td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[req.status]}`}>
                                    {statusLabels[req.status]}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{req.reviewedByName || '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Team balance view */}
            {teamView === 'balance' && settings && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Balance del equipo ({currentYear})
                    <span className="ml-2 text-xs font-normal text-gray-500">· {filteredMembers.length} trabajadores</span>
                  </h3>
                </div>
                {filteredMembers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                    <Users className="w-10 h-10 mb-3" />
                    <p className="text-sm">No hay trabajadores{searchQuery || filterSalesPoint || filterDepartment ? ' con estos filtros' : ''}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px]">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Trabajador</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Centro / PDV</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Días asignados</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Horas asignadas</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Días usados</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Horas usadas</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Saldo días</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Saldo horas</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Pendientes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                        {filteredMembers.map(m => {
                          const allowed = getDaysAllowed(settings, m.user_id);
                          const used = getDaysUsed(requests, m.user_id, currentYear);
                          const remaining = Math.max(0, allowed - used);
                          const pending = requests.filter(r => r.member_id === m.user_id && r.status === 'pending').length;
                          const emp = (m as any).employment;
                          const spName = emp?.salesPointId ? (salesPointMap[emp.salesPointId] || '') : '';
                          return (
                            <tr key={m.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                              <td className="px-4 py-3">
                                <div>
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">{m.fullName || m.email}</p>
                                  {m.fullName && <p className="text-xs text-gray-400">{m.email}</p>}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-0.5">
                                  {emp?.department && <span className="text-xs text-purple-600 dark:text-purple-400">{emp.department}</span>}
                                  {spName && <span className="text-xs text-blue-600 dark:text-blue-400">{spName}</span>}
                                  {!emp?.department && !spName && <span className="text-xs text-gray-400">-</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center text-sm text-gray-600 dark:text-gray-300">{allowed}</td>
                              <td className="px-4 py-3 text-center text-sm text-gray-600 dark:text-gray-300">{allowed * HOURS_PER_DAY}</td>
                              <td className="px-4 py-3 text-center text-sm text-gray-600 dark:text-gray-300">{used}</td>
                              <td className="px-4 py-3 text-center text-sm text-gray-600 dark:text-gray-300">{used * HOURS_PER_DAY}</td>
                              <td className="px-4 py-3 text-center text-sm font-bold">
                                <span className={remaining > 5 ? 'text-green-600 dark:text-green-400' : remaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}>
                                  {remaining}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center text-sm font-bold">
                                <span className={remaining > 5 ? 'text-green-600 dark:text-green-400' : remaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}>
                                  {remaining * HOURS_PER_DAY}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {pending > 0 ? (
                                  <span className="inline-flex items-center justify-center w-6 h-6 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-bold rounded-full">
                                    {pending}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400">0</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50">
                          <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-white" colSpan={2}>Total</td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-gray-900 dark:text-white">
                            {filteredMembers.reduce((sum, m) => sum + getDaysAllowed(settings, m.user_id), 0)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-gray-900 dark:text-white">
                            {filteredMembers.reduce((sum, m) => sum + getDaysAllowed(settings, m.user_id), 0) * HOURS_PER_DAY}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-gray-900 dark:text-white">
                            {filteredMembers.reduce((sum, m) => sum + getDaysUsed(requests, m.user_id, currentYear), 0)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-gray-900 dark:text-white">
                            {filteredMembers.reduce((sum, m) => sum + getDaysUsed(requests, m.user_id, currentYear), 0) * HOURS_PER_DAY}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-green-600 dark:text-green-400">
                            {filteredMembers.reduce((sum, m) => {
                              const a = getDaysAllowed(settings, m.user_id);
                              const u = getDaysUsed(requests, m.user_id, currentYear);
                              return sum + Math.max(0, a - u);
                            }, 0)}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-green-600 dark:text-green-400">
                            {filteredMembers.reduce((sum, m) => {
                              const a = getDaysAllowed(settings, m.user_id);
                              const u = getDaysUsed(requests, m.user_id, currentYear);
                              return sum + Math.max(0, a - u);
                            }, 0) * HOURS_PER_DAY}
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-amber-600 dark:text-amber-400">
                            {filteredMembers.reduce((sum, m) => sum + requests.filter(r => r.member_id === m.user_id && r.status === 'pending').length, 0)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Settings tab */}
        {tab === 'settings' && settings && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Días de vacaciones por defecto</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Número de días laborables asignados por año a cada miembro</p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={settings.defaultDaysPerYear}
                  onChange={e => handleSaveDefaultDays(Number(e.target.value))}
                  className="w-24 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">días / año</span>
              </div>
            </div>

            {members.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Asignación individual</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Personaliza los días para cada miembro (deja vacío para usar el valor por defecto)</p>
                <div className="space-y-2">
                  {members.map(m => {
                    const custom = settings.allowances[m.user_id];
                    return (
                      <div key={m.user_id} className="flex items-center gap-3">
                        <span className="text-sm text-gray-700 dark:text-gray-300 w-48 truncate">{m.fullName}</span>
                        <input
                          type="number"
                          min={0}
                          max={365}
                          placeholder={String(settings.defaultDaysPerYear)}
                          value={custom ?? ''}
                          onChange={async e => {
                            const val = e.target.value;
                            const newAllowances = { ...settings.allowances };
                            if (val === '' || val === String(settings.defaultDaysPerYear)) {
                              delete newAllowances[m.user_id];
                            } else {
                              newAllowances[m.user_id] = Number(val);
                            }
                            try {
                              const updated = await saveSettings({ ...settings, allowances: newAllowances });
                              setSettings(updated);
                            } catch {}
                          }}
                          className="w-20 px-3 py-1.5 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                        />
                        <span className="text-xs text-gray-400">días</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Request form modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Solicitar vacaciones</h3>
                <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                  <select
                    value={formData.leaveType}
                    onChange={e => setFormData({ ...formData, leaveType: e.target.value as LeaveType })}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  >
                    {(Object.keys(leaveLabels) as LeaveType[]).map(lt => (
                      <option key={lt} value={lt}>{leaveLabels[lt]}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Desde</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hasta</label>
                    <input
                      type="date"
                      value={formData.endDate}
                      onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                      required
                    />
                  </div>
                </div>
                {formData.startDate && formData.endDate && formData.startDate <= formData.endDate && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    <span className="font-semibold text-gray-900 dark:text-white">{countBusinessDays(formData.startDate, formData.endDate)}</span> días laborables
                    {myDaysRemaining < countBusinessDays(formData.startDate, formData.endDate) && (
                      <span className="text-red-500 ml-2">(supera tus días restantes)</span>
                    )}
                  </p>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas (opcional)</label>
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                    placeholder="Motivo o comentarios..."
                    className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-lg shadow-amber-600/25"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  Enviar solicitud
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    green: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
    red: 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
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
