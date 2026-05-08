import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import {
  getCrmAlertsRequest, listRemindersRequest, createReminderRequest,
  updateReminderRequest, deleteReminderRequest,
  type CrmAlert, type CrmAlertsSummary, type CrmReminder,
} from '../../lib/crmApi';
import { toast } from 'sonner';
import {
  Bell, AlertTriangle, Clock, FileText, UserX, CheckCircle2,
  Plus, Trash2, Calendar, User, X, ChevronRight, RefreshCw,
} from 'lucide-react';

const SEVERITY_STYLES = {
  warning: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-l-amber-500', icon: 'text-amber-500', badge: 'bg-amber-100 text-amber-700' },
  info:    { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-l-blue-500', icon: 'text-blue-500', badge: 'bg-blue-100 text-blue-700' },
  low:     { bg: 'bg-gray-50 dark:bg-gray-800', border: 'border-l-gray-400', icon: 'text-gray-400', badge: 'bg-gray-100 text-gray-600' },
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  uncontacted_lead: 'Lead sin contactar',
  pending_quote: 'Presupuesto pendiente',
  inactive_client: 'Cliente inactivo',
  opportunity_no_followup: 'Oportunidad sin seguimiento',
  interested_no_response: 'Cliente interesado sin respuesta',
  stale_reservation: 'Reserva sin cerrar',
  lead_no_opportunity: 'Lead sin oportunidad',
};

const PRIORITY_STYLES = {
  high:   { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
  medium: { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  low:    { dot: 'bg-gray-400', text: 'text-gray-600', bg: 'bg-gray-50' },
};

interface CrmAlertsPanelProps {
  userId: string;
  /** Filtra alertas y recordatorios visibles (misma barra de búsqueda que el CRM). */
  searchQuery?: string;
}

export function CrmAlertsPanel({ userId, searchQuery = '' }: CrmAlertsPanelProps) {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<CrmAlert[]>([]);
  const [summary, setSummary] = useState<CrmAlertsSummary | null>(null);
  const [reminders, setReminders] = useState<CrmReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewReminder, setShowNewReminder] = useState(false);
  const [alertFilter, setAlertFilter] = useState<string>('all');

  const [newReminder, setNewReminder] = useState({
    title: '', description: '', dueDate: new Date().toISOString().slice(0, 10),
    priority: 'medium' as 'low' | 'medium' | 'high',
    entityType: 'client' as 'lead' | 'client' | 'quote',
    entityName: '', assignedTo: '',
  });

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [alertsData, remindersData] = await Promise.all([
      getCrmAlertsRequest(userId),
      listRemindersRequest(userId),
    ]);
    if (alertsData) {
      setAlerts(alertsData.alerts);
      setSummary(alertsData.summary);
    }
    setReminders(remindersData);
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreateReminder = async () => {
    if (!newReminder.title.trim()) { toast.error('El título es obligatorio'); return; }
    const result = await createReminderRequest(userId, newReminder);
    if (result) {
      setReminders((prev) => [result, ...prev]);
      setShowNewReminder(false);
      setNewReminder({ title: '', description: '', dueDate: new Date().toISOString().slice(0, 10), priority: 'medium', entityType: 'client', entityName: '', assignedTo: '' });
      toast.success('Recordatorio creado');
    } else {
      toast.error('Error al crear recordatorio');
    }
  };

  const handleToggleReminder = async (reminder: CrmReminder) => {
    const result = await updateReminderRequest(userId, reminder.id, { completed: !reminder.completed });
    if (result) {
      setReminders((prev) => prev.map((r) => r.id === reminder.id ? result : r));
    }
  };

  const handleDeleteReminder = async (id: string) => {
    const ok = await deleteReminderRequest(userId, id);
    if (ok) {
      setReminders((prev) => prev.filter((r) => r.id !== id));
      toast.success('Recordatorio eliminado');
    }
  };

  const filteredAlerts = alertFilter === 'all' ? alerts : alerts.filter((a) => a.type === alertFilter);
  const qNorm = searchQuery.trim().toLowerCase();
  const listAlerts =
    qNorm === ''
      ? filteredAlerts
      : filteredAlerts.filter((a) => {
          const blob = `${a.name || ''} ${a.clientName || ''} ${ALERT_TYPE_LABELS[a.type] || a.type || ''} ${a.type}`.toLowerCase();
          return blob.includes(qNorm);
        });
  const pendingReminders = reminders.filter((r) => !r.completed);
  const completedReminders = reminders.filter((r) => r.completed);
  const pendingRemindersFiltered =
    qNorm === ''
      ? pendingReminders
      : pendingReminders.filter((r) =>
          `${r.title} ${r.description || ''} ${r.entityName || ''} ${r.assignedTo || ''}`.toLowerCase().includes(qNorm),
        );
  const completedRemindersFiltered =
    qNorm === ''
      ? completedReminders
      : completedReminders.filter((r) =>
          `${r.title} ${r.description || ''} ${r.entityName || ''}`.toLowerCase().includes(qNorm),
        );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { key: 'uncontacted_lead', label: 'Leads sin contactar', count: summary.uncontactedLeads, icon: <UserX className="w-5 h-5 text-amber-600" />, iconBg: 'bg-amber-100 dark:bg-amber-900/40', activeBorder: 'border-amber-500', activeBg: 'bg-amber-50 dark:bg-amber-900/20' },
            { key: 'opportunity_no_followup', label: 'Sin seguimiento', count: (summary as Record<string, number>).opportunitiesNoFollowup || 0, icon: <AlertTriangle className="w-5 h-5 text-red-600" />, iconBg: 'bg-red-100 dark:bg-red-900/40', activeBorder: 'border-red-500', activeBg: 'bg-red-50 dark:bg-red-900/20' },
            { key: 'stale_reservation', label: 'Reservas estancadas', count: (summary as Record<string, number>).staleReservations || 0, icon: <Clock className="w-5 h-5 text-orange-600" />, iconBg: 'bg-orange-100 dark:bg-orange-900/40', activeBorder: 'border-orange-500', activeBg: 'bg-orange-50 dark:bg-orange-900/20' },
            { key: 'pending_quote', label: 'Presupuestos pendientes', count: summary.pendingQuotes, icon: <FileText className="w-5 h-5 text-blue-600" />, iconBg: 'bg-blue-100 dark:bg-blue-900/40', activeBorder: 'border-blue-500', activeBg: 'bg-blue-50 dark:bg-blue-900/20' },
          ].map((item) => (
            <button key={item.key} onClick={() => setAlertFilter(alertFilter === item.key ? 'all' : item.key)}
              className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${alertFilter === item.key ? `${item.activeBorder} ${item.activeBg}` : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300'}`}>
              <div className={`flex items-center justify-center w-9 h-9 rounded-xl ${item.iconBg}`}>{item.icon}</div>
              <div className="text-left">
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{item.count}</p>
                <p className="text-[10px] text-gray-500 leading-tight">{item.label}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts list */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Alertas {alertFilter !== 'all' && <span className="text-xs font-normal normal-case text-gray-400">({ALERT_TYPE_LABELS[alertFilter]})</span>}
            </h3>
            <div className="flex items-center gap-2">
              {alertFilter !== 'all' && (
                <button onClick={() => setAlertFilter('all')} className="text-xs text-blue-500 hover:text-blue-600">
                  Ver todas
                </button>
              )}
              <button onClick={loadData} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                <RefreshCw className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {listAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {filteredAlerts.length > 0 && qNorm ? 'Ninguna alerta coincide con la búsqueda' : 'Sin alertas pendientes'}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {filteredAlerts.length > 0 && qNorm ? 'Prueba con otros términos' : 'Todo bajo control'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {listAlerts.map((alert) => {
                const style = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.low;
                return (
                  <div key={alert.id}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border-l-4 ${style.border} ${style.bg} cursor-pointer hover:shadow-sm transition-all`}
                    onClick={() => {
                      if (alert.type === 'uncontacted_lead') navigate(`/saas/crm/clientes/${alert.id}`);
                      else if (alert.type === 'inactive_client') navigate(`/saas/crm/clientes/${alert.id}`);
                      else if (alert.type === 'pending_quote' && alert.clientId) navigate(`/saas/crm/clientes/${alert.clientId}`);
                    }}>
                    <div className={`${style.icon}`}>
                      {(alert.type === 'uncontacted_lead' || alert.type === 'opportunity_no_followup' || alert.type === 'interested_no_response') && <AlertTriangle className="w-5 h-5" />}
                      {(alert.type === 'pending_quote' || alert.type === 'lead_no_opportunity') && <FileText className="w-5 h-5" />}
                      {(alert.type === 'inactive_client' || alert.type === 'stale_reservation') && <Clock className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {alert.name || alert.clientName || 'Sin nombre'}
                        </p>
                        <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold rounded-full ${style.badge}`}>
                          {ALERT_TYPE_LABELS[alert.type]}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {alert.type === 'uncontacted_lead' && `${alert.daysSinceContact} dias sin contacto`}
                        {alert.type === 'pending_quote' && `${alert.daysPending} dias pendiente · ${new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(alert.total || 0)}`}
                        {alert.type === 'inactive_client' && `${alert.daysSinceActivity} dias inactivo`}
                        {alert.type === 'opportunity_no_followup' && `${alert.daysSinceContact} dias sin seguimiento`}
                        {alert.type === 'interested_no_response' && `${alert.daysSinceContact} dias sin respuesta`}
                        {alert.type === 'stale_reservation' && `${alert.daysSinceReserved} dias reservado sin cerrar`}
                        {alert.type === 'lead_no_opportunity' && `${alert.daysSinceCreated} dias sin oportunidad creada`}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Reminders */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Recordatorios
            </h3>
            <button onClick={() => setShowNewReminder(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" /> Nuevo
            </button>
          </div>

          {showNewReminder && (
            <div className="bg-white dark:bg-gray-800 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-3">
              <input type="text" placeholder="Título del recordatorio..."
                value={newReminder.title} onChange={(e) => setNewReminder((p) => ({ ...p, title: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:border-blue-500 outline-none bg-white dark:bg-gray-800" />
              <textarea placeholder="Descripción (opcional)..." rows={2}
                value={newReminder.description} onChange={(e) => setNewReminder((p) => ({ ...p, description: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:border-blue-500 outline-none bg-white dark:bg-gray-800 resize-none" />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={newReminder.dueDate}
                  onChange={(e) => setNewReminder((p) => ({ ...p, dueDate: e.target.value }))}
                  className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:border-blue-500 outline-none bg-white dark:bg-gray-800" />
                <select value={newReminder.priority}
                  onChange={(e) => setNewReminder((p) => ({ ...p, priority: e.target.value as 'low' | 'medium' | 'high' }))}
                  className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:border-blue-500 outline-none bg-white dark:bg-gray-800">
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                </select>
              </div>
              <input type="text" placeholder="Nombre del cliente / lead..."
                value={newReminder.entityName} onChange={(e) => setNewReminder((p) => ({ ...p, entityName: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg focus:border-blue-500 outline-none bg-white dark:bg-gray-800" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowNewReminder(false)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 rounded-lg">
                  Cancelar
                </button>
                <button onClick={handleCreateReminder}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                  Crear
                </button>
              </div>
            </div>
          )}

          {pendingRemindersFiltered.length === 0 && !showNewReminder ? (
            <div className="flex flex-col items-center justify-center py-8 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
              <Calendar className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {pendingReminders.length > 0 && qNorm ? 'Ningún recordatorio coincide' : 'Sin recordatorios pendientes'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingRemindersFiltered.map((r) => {
                const pStyle = PRIORITY_STYLES[r.priority] || PRIORITY_STYLES.medium;
                const isOverdue = new Date(r.dueDate) < new Date(new Date().toISOString().slice(0, 10));
                return (
                  <div key={r.id} className={`flex items-start gap-2.5 p-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 ${isOverdue ? 'border-l-4 border-l-red-400' : ''}`}>
                    <button onClick={() => handleToggleReminder(r)}
                      className="mt-0.5 w-4.5 h-4.5 rounded-full border-2 border-gray-300 dark:border-gray-600 hover:border-blue-500 transition-colors shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{r.title}</p>
                      {r.entityName && <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 mt-0.5"><User className="w-3 h-3" />{r.entityName}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] font-semibold ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                          {r.dueDate}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full ${pStyle.bg} ${pStyle.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${pStyle.dot}`} />
                          {r.priority === 'high' ? 'Alta' : r.priority === 'medium' ? 'Media' : 'Baja'}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteReminder(r.id)}
                      className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 className="w-3.5 h-3.5 text-gray-300 hover:text-red-400" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {completedRemindersFiltered.length > 0 && (
            <details className="group">
              <summary className="text-xs font-medium text-gray-400 dark:text-gray-500 cursor-pointer hover:text-gray-600 select-none">
                Completados ({completedRemindersFiltered.length})
              </summary>
              <div className="space-y-1.5 mt-2">
                {completedRemindersFiltered.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 opacity-60">
                    <button onClick={() => handleToggleReminder(r)}
                      className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    </button>
                    <p className="text-xs text-gray-500 line-through truncate flex-1">{r.title}</p>
                    <button onClick={() => handleDeleteReminder(r.id)}
                      className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20">
                      <X className="w-3 h-3 text-gray-300" />
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
