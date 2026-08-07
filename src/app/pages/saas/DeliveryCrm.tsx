import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { Tabs } from '../../components/saas/Tabs';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { resolveRetailOpsWriteBusinessId } from '../../lib/tpvRegisterScope';
import { useApp } from '../../context/AppContext';
import {
  getDashboardRequest,
  listCrmClientsRequest,
  getClientOrdersRequest,
  getAlertsRequest,
  listCampaignsRequest,
  createCampaignRequest,
  updateCampaignRequest,
  deleteCampaignRequest,
  type DeliveryCrmDashboard,
  type DeliveryCrmClient,
  type DeliveryCrmAlert,
  type DeliveryCrmAlertsSummary,
  type DeliveryCampaign,
  type DeliveryOrderBrief,
  type CampaignTrigger,
  type CampaignStatus,
} from '../../lib/deliveryCrmApi';
import {
  LayoutDashboard, Users, ShoppingBag, Target, Megaphone, Bell,
  Search, TrendingUp, TrendingDown, Crown, AlertTriangle, MapPin,
  Phone, Mail, Clock, ChevronRight, Plus, X, Eye, Edit3, Trash2,
  Package, Repeat, UserX, Zap, Gift, Star, Filter, ArrowUpRight,
  BarChart3, Truck, CreditCard, RefreshCw, Hash, Percent, Send,
  Pause, Play, CheckCircle2, XCircle, Heart, ShieldAlert, Map,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type TabId = 'dashboard' | 'clients' | 'campaigns' | 'alerts';

const TAB_DEFS: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'clients', label: 'Clientes', icon: Users },
  { id: 'campaigns', label: 'Campañas', icon: Megaphone },
  { id: 'alerts', label: 'Alertas', icon: Bell },
];

const FREQUENCY_LABELS: Record<string, string> = {
  none: 'Sin pedidos', monthly: 'Mensual', biweekly: 'Quincenal', weekly: 'Semanal',
};

const CHANNEL_LABELS: Record<string, string> = {
  direct: 'Directo', phone: 'Teléfono', web: 'Web', app: 'App', push: 'Push', email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp',
};

const TRIGGER_CONFIG: Record<CampaignTrigger, { label: string; icon: typeof Zap; color: string }> = {
  manual: { label: 'Manual', icon: Send, color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  inactive_client: { label: 'Cliente inactivo', icon: UserX, color: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
  vip_reward: { label: 'Recompensa VIP', icon: Crown, color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  zone_promo: { label: 'Promo por zona', icon: MapPin, color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  frequency_upsell: { label: 'Upselling frecuencia', icon: TrendingUp, color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
  new_client_welcome: { label: 'Bienvenida nuevo', icon: Gift, color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
  birthday: { label: 'Cumpleaños', icon: Heart, color: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400' },
};

const CAMPAIGN_STATUS_CFG: Record<CampaignStatus, { label: string; dot: string; bg: string; text: string }> = {
  draft: { label: 'Borrador', dot: 'bg-slate-400', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400' },
  active: { label: 'Activa', dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300' },
  paused: { label: 'Pausada', dot: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300' },
  completed: { label: 'Completada', dot: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300' },
  cancelled: { label: 'Cancelada', dot: 'bg-red-400', bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400' },
};

const ALERT_TYPE_ICONS: Record<string, typeof Crown> = {
  vip_no_purchase: Crown,
  zone_sales_drop: Map,
  repeat_incidents: ShieldAlert,
  inactive_client: UserX,
};

const ALERT_TYPE_COLORS: Record<string, string> = {
  vip_no_purchase: 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10',
  zone_sales_drop: 'border-l-red-500 bg-red-50/50 dark:bg-red-900/10',
  repeat_incidents: 'border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/10',
  inactive_client: 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/10',
};

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
}

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtNum(v: number) {
  return new Intl.NumberFormat('es-ES').format(v);
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, accent = 'amber' }: {
  icon: typeof TrendingUp; label: string; value: string; sub?: string;
  accent?: 'amber' | 'emerald' | 'blue' | 'red' | 'purple' | 'cyan';
}) {
  const colors: Record<string, string> = {
    amber: 'from-amber-500 to-orange-500',
    emerald: 'from-emerald-500 to-teal-500',
    blue: 'from-blue-500 to-indigo-500',
    red: 'from-red-500 to-pink-500',
    purple: 'from-purple-500 to-violet-500',
    cyan: 'from-cyan-500 to-blue-500',
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 flex items-start gap-4 hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-gray-900/30 transition-shadow">
      <div className={`flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br ${colors[accent]} flex items-center justify-center`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-0.5 truncate">{value}</p>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function DeliveryCrm() {
  const { user, isInitializing } = useAuth();
  const { currentBusiness, businesses } = useBusiness();
  const businessId = resolveRetailOpsWriteBusinessId(
    resolveBusinessScopeId(currentBusiness),
    businesses,
  );
  const userId = user?.user_id || user?.id || '';
  const { addClient } = useApp();
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [loading, setLoading] = useState(true);

  // Dashboard
  const [dashboard, setDashboard] = useState<DeliveryCrmDashboard | null>(null);

  // Clients
  const [clients, setClients] = useState<DeliveryCrmClient[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientFilter, setClientFilter] = useState<'all' | 'vip' | 'at_risk' | 'inactive' | 'new'>('all');
  const [selectedClient, setSelectedClient] = useState<DeliveryCrmClient | null>(null);
  const [clientOrders, setClientOrders] = useState<DeliveryOrderBrief[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Campaigns
  const [campaigns, setCampaigns] = useState<DeliveryCampaign[]>([]);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<DeliveryCampaign | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    name: '', description: '', trigger: 'manual' as CampaignTrigger,
    targetSegment: 'all', channel: 'push', message: '', discountPercent: 0,
    startDate: '', endDate: '',
  });

  // Alerts
  const [alerts, setAlerts] = useState<DeliveryCrmAlert[]>([]);
  const [alertsSummary, setAlertsSummary] = useState<DeliveryCrmAlertsSummary | null>(null);
  const [alertFilter, setAlertFilter] = useState<'all' | 'vip_no_purchase' | 'zone_sales_drop' | 'repeat_incidents' | 'inactive_client'>('all');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    { key: 'street', label: 'Calle y número' },
    { key: 'city', label: 'Ciudad' },
    { key: 'address', label: 'Dirección (alternativa si va todo en una línea)' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'phone', label: 'Teléfono', required: true, example: '' },
    { key: 'email', label: 'Email', example: '' },
    { key: 'street', label: 'Calle y número', required: true, example: '' },
    { key: 'city', label: 'Ciudad', required: true, example: '' },
    { key: 'address', label: 'Dirección (una columna; si no hay calle/ciudad)', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const loadAll = useCallback(async () => {
    const uid = user?.user_id || user?.id || '';
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [dash, cls, camps, alertData] = await Promise.all([
        getDashboardRequest(uid, businessId || undefined),
        listCrmClientsRequest(uid, businessId || undefined),
        listCampaignsRequest(uid),
        getAlertsRequest(uid, businessId || undefined),
      ]);
      if (dash) setDashboard(dash);
      setClients(cls);
      setCampaigns(camps);
      if (alertData) {
        setAlerts(alertData.alerts);
        setAlertsSummary(alertData.summary);
      }
    } catch {
      toast.error('Error cargando datos CRM Delivery');
    } finally {
      setLoading(false);
    }
  }, [user?.user_id, user?.id, businessId]);

  useEffect(() => {
    if (isInitializing) return;
    void loadAll();
  }, [isInitializing, loadAll]);

  const clientBusinessPayload = useCallback(
    (entry: Record<string, unknown>) => ({
      name: String(entry.name || '').trim(),
      phone: String(entry.phone || '').trim(),
      email: String(entry.email || ''),
      dni: '',
      address: String(entry.street || entry.address || '').trim(),
      city: String(entry.city || '').trim(),
      postalCode: '',
      status: 'active' as const,
      responsible: '',
      notes: String(entry.notes || ''),
      tags: [] as string[],
      consents: { dataProcessing: false, commercial: false, thirdParty: false },
      interactions: [],
      documentsList: [],
      ...(businessId ? { businessId, business_id: businessId } : {}),
    }),
    [businessId],
  );

  const createClientsFromEntries = useCallback(
    async (entries: Array<Record<string, unknown>>) => {
      let created = 0;
      for (const entry of entries) {
        const name = String(entry.name || '').trim();
        const street = String(entry.street || entry.address || '').trim();
        const city = String(entry.city || '').trim();
        const phoneDigits = String(entry.phone || '').replace(/\D/g, '');
        if (!name || phoneDigits.length < 9 || !street || !city) continue;
        try {
          await addClient(clientBusinessPayload(entry));
          created += 1;
        } catch {
          // Continue with remaining rows; individual failures should not stop import batch.
        }
      }
      if (created > 0) await loadAll();
      return created;
    },
    [addClient, loadAll, clientBusinessPayload],
  );

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    const created = await createClientsFromEntries(entries);
    if (created > 0) toast.success(`${created} cliente(s) creado(s) con IA`);
    else toast.error('No se pudo crear ningún cliente');
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    const created = await createClientsFromEntries(entries);
    if (created > 0) toast.success(`${created} cliente(s) importado(s)`);
    else toast.error('No se pudo importar ningún cliente');
  };

  const openClientDetail = async (client: DeliveryCrmClient) => {
    setSelectedClient(client);
    setLoadingOrders(true);
    if (userId) {
      const orders = await getClientOrdersRequest(userId, client.id, businessId || undefined);
      setClientOrders(orders);
    }
    setLoadingOrders(false);
  };

  // ─── Clients filtering ──────────────────────────────────────────────────────

  const filteredClients = useMemo(() => {
    const q = clientSearch.toLowerCase();
    return clients.filter((c) => {
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.email.toLowerCase().includes(q);
      if (!matchSearch) return false;
      switch (clientFilter) {
        case 'vip': return c.delivery.isVip;
        case 'at_risk': return c.delivery.isAtRisk;
        case 'inactive': return c.delivery.isInactive;
        case 'new': return c.delivery.totalOrders <= 1;
        default: return true;
      }
    });
  }, [clients, clientSearch, clientFilter]);

  const clientCounts = useMemo(() => ({
    all: clients.length,
    vip: clients.filter((c) => c.delivery.isVip).length,
    at_risk: clients.filter((c) => c.delivery.isAtRisk).length,
    inactive: clients.filter((c) => c.delivery.isInactive).length,
    new: clients.filter((c) => c.delivery.totalOrders <= 1).length,
  }), [clients]);

  // ─── Campaigns CRUD ─────────────────────────────────────────────────────────

  const openCreateCampaign = () => {
    setEditingCampaign(null);
    setCampaignForm({ name: '', description: '', trigger: 'manual', targetSegment: 'all', channel: 'push', message: '', discountPercent: 0, startDate: '', endDate: '' });
    setShowCampaignModal(true);
  };

  const openEditCampaign = (c: DeliveryCampaign) => {
    setEditingCampaign(c);
    setCampaignForm({
      name: c.name, description: c.description, trigger: c.trigger, targetSegment: c.targetSegment,
      channel: c.channel, message: c.message, discountPercent: c.discountPercent,
      startDate: c.startDate, endDate: c.endDate,
    });
    setShowCampaignModal(true);
  };

  const handleSaveCampaign = async () => {
    if (!campaignForm.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!userId) return;
    if (editingCampaign) {
      const result = await updateCampaignRequest(userId, editingCampaign.id, campaignForm);
      if (result) {
        setCampaigns((p) => p.map((c) => c.id === result.id ? result : c));
        toast.success('Campaña actualizada');
      } else { toast.error('Error al actualizar'); }
    } else {
      const result = await createCampaignRequest(userId, campaignForm);
      if (result) {
        setCampaigns((p) => [result, ...p]);
        toast.success('Campaña creada');
      } else { toast.error('Error al crear'); }
    }
    setShowCampaignModal(false);
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!userId) return;
    const ok = await deleteCampaignRequest(userId, id);
    if (ok) {
      setCampaigns((p) => p.filter((c) => c.id !== id));
      toast.success('Campaña eliminada');
    } else { toast.error('Error al eliminar'); }
  };

  const handleToggleCampaignStatus = async (c: DeliveryCampaign) => {
    if (!userId) return;
    const newStatus: CampaignStatus = c.status === 'active' ? 'paused' : 'active';
    const result = await updateCampaignRequest(userId, c.id, { status: newStatus } as Partial<DeliveryCampaign>);
    if (result) {
      setCampaigns((p) => p.map((x) => x.id === result.id ? result : x));
      toast.success(newStatus === 'active' ? 'Campaña activada' : 'Campaña pausada');
    }
  };

  // ─── Filtered alerts ───────────────────────────────────────────────────────

  const filteredAlerts = useMemo(() => {
    if (alertFilter === 'all') return alerts;
    return alerts.filter((a) => a.type === alertFilter);
  }, [alerts, alertFilter]);

  // ─── Tab content ───────────────────────────────────────────────────────────

  const tabs = TAB_DEFS.map((t) => ({
    id: t.id,
    label: t.label,
    count: t.id === 'alerts' ? (alertsSummary?.total || 0) : undefined,
  }));

  if (loading) {
    return (
      <Layout backTo="/saas/delivery-ops" title="CRM Delivery" subtitle="Fidelización y retención de clientes">
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout backTo="/saas/delivery-ops" title="CRM Delivery" subtitle="Fidelización y retención de clientes">
      <div className="space-y-6">
        {/* Tabs */}
        <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as TabId)} />

        {/* Dashboard */}
        {activeTab === 'dashboard' && dashboard && (
          <div className="space-y-6">
            {/* KPIs grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <KpiCard icon={ShoppingBag} label="Pedidos totales" value={fmtNum(dashboard.totalOrders)} accent="blue" />
              <KpiCard icon={CreditCard} label="Facturación total" value={fmtCurrency(dashboard.totalRevenue)} sub={`Último mes: ${fmtCurrency(dashboard.recentRevenue)}`} accent="emerald" />
              <KpiCard icon={BarChart3} label="Ticket medio" value={fmtCurrency(dashboard.avgTicket)} accent="amber" />
              <KpiCard icon={Users} label="Clientes únicos" value={fmtNum(dashboard.uniqueClients)} sub={`${fmtNum(dashboard.totalRegisteredClients)} registrados`} accent="purple" />
              <KpiCard icon={Repeat} label="Tasa repetición" value={`${dashboard.repeatRate}%`} sub={`${fmtNum(dashboard.repeatClients)} repiten`} accent="cyan" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KpiCard icon={Crown} label="Clientes VIP" value={fmtNum(dashboard.vipClients)} accent="amber" />
              <KpiCard icon={UserX} label="Inactivos (+90 días)" value={fmtNum(dashboard.inactiveClients)} accent="red" />
              <KpiCard icon={AlertTriangle} label="Incidencias" value={fmtNum(dashboard.totalIncidents)} accent="red" />
            </div>

            {/* Zones + Channels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Zones */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-5 h-5 text-blue-500" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Zonas de reparto</h3>
                </div>
                {dashboard.topZones.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">Sin datos de zonas</p>
                ) : (
                  <div className="space-y-3">
                    {dashboard.topZones.map((z, i) => {
                      const maxRev = dashboard.topZones[0]?.revenue || 1;
                      return (
                        <div key={z.zone} className="flex items-center gap-3">
                          <span className="w-6 text-xs font-bold text-gray-400 dark:text-gray-500 text-right">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{z.zone}</span>
                              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{z.orders} pedidos</span>
                            </div>
                            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all" style={{ width: `${(z.revenue / maxRev) * 100}%` }} />
                            </div>
                          </div>
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 w-20 text-right">{fmtCurrency(z.revenue)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Channels */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Truck className="w-5 h-5 text-emerald-500" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Canales de venta</h3>
                </div>
                {Object.keys(dashboard.channels).length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">Sin datos de canales</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(dashboard.channels)
                      .sort(([, a], [, b]) => b.revenue - a.revenue)
                      .map(([ch, data]) => {
                        const maxRev = Math.max(...Object.values(dashboard.channels).map((c) => c.revenue)) || 1;
                        return (
                          <div key={ch} className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400 w-20">{CHANNEL_LABELS[ch] || ch}</span>
                            <div className="flex-1 min-w-0">
                              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all" style={{ width: `${(data.revenue / maxRev) * 100}%` }} />
                              </div>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 w-16 text-right">{data.orders} ped.</span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 w-20 text-right">{fmtCurrency(data.revenue)}</span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Clients Tab */}
        {activeTab === 'clients' && (
          <div className="space-y-4">
            {/* Segment pills */}
            <div className="flex flex-wrap gap-2">
              {([
                { id: 'all', label: 'Todos', icon: Users },
                { id: 'vip', label: 'VIP', icon: Crown },
                { id: 'at_risk', label: 'En riesgo', icon: AlertTriangle },
                { id: 'inactive', label: 'Inactivos', icon: UserX },
                { id: 'new', label: 'Nuevos', icon: Star },
              ] as const).map((seg) => (
                <button
                  key={seg.id}
                  onClick={() => setClientFilter(seg.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    clientFilter === seg.id
                      ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 shadow-md'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <seg.icon className="w-4 h-4" />
                  {seg.label}
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                    clientFilter === seg.id ? 'bg-white/20 text-white dark:bg-gray-900/20 dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                  }`}>
                    {clientCounts[seg.id]}
                  </span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, teléfono o email..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              />
            </div>

            {/* Client detail modal */}
            {selectedClient && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedClient(null)}>
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 p-5 flex items-center justify-between z-10">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedClient.name}</h2>
                        {selectedClient.delivery.isVip && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold"><Crown className="w-3 h-3" />VIP</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        {selectedClient.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{selectedClient.phone}</span>}
                        {selectedClient.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{selectedClient.email}</span>}
                      </div>
                    </div>
                    <button onClick={() => setSelectedClient(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
                  </div>

                  <div className="p-5 space-y-5">
                    {/* Métricas delivery */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-gray-50 dark:bg-gray-750 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{selectedClient.delivery.deliveredOrders}</p>
                        <p className="text-xs text-gray-500 mt-1">Pedidos entregados</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-750 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtCurrency(selectedClient.delivery.totalSpent)}</p>
                        <p className="text-xs text-gray-500 mt-1">Gasto total</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-750 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtCurrency(selectedClient.delivery.avgTicket)}</p>
                        <p className="text-xs text-gray-500 mt-1">Ticket medio</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-750 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{FREQUENCY_LABELS[selectedClient.delivery.frequency]}</p>
                        <p className="text-xs text-gray-500 mt-1">Frecuencia</p>
                      </div>
                    </div>

                    {/* Tags/Status */}
                    <div className="flex flex-wrap gap-2">
                      {selectedClient.delivery.zones.map((z) => (
                        <span key={z} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-medium">
                          <MapPin className="w-3 h-3" />{z}
                        </span>
                      ))}
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs font-medium">
                        Canal: {CHANNEL_LABELS[selectedClient.delivery.preferredChannel] || selectedClient.delivery.preferredChannel}
                      </span>
                      {selectedClient.delivery.incidents > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs font-medium">
                          <AlertTriangle className="w-3 h-3" />{selectedClient.delivery.incidents} incidencias
                        </span>
                      )}
                    </div>

                    {/* Top products */}
                    {selectedClient.delivery.topProducts.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Productos favoritos</h4>
                        <div className="space-y-2">
                          {selectedClient.delivery.topProducts.map((p) => (
                            <div key={p.name} className="flex items-center justify-between bg-gray-50 dark:bg-gray-750 rounded-lg px-3 py-2">
                              <span className="text-sm text-gray-700 dark:text-gray-300">{p.name}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-500">{p.qty}x</span>
                                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtCurrency(p.revenue)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Historial de pedidos */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Historial de pedidos</h4>
                      {loadingOrders ? (
                        <div className="flex justify-center py-6">
                          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : clientOrders.length === 0 ? (
                        <p className="text-sm text-gray-400 py-4 text-center">Sin pedidos vinculados</p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {clientOrders.map((o) => (
                            <div key={o.id} className="bg-gray-50 dark:bg-gray-750 rounded-lg px-4 py-3 flex items-center justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{o.orderNumber}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    o.status === 'delivered' ? 'bg-green-100 text-green-700' :
                                    o.status === 'incident' ? 'bg-red-100 text-red-700' :
                                    o.status === 'cancelled' ? 'bg-gray-100 text-gray-500' :
                                    'bg-blue-100 text-blue-700'
                                  }`}>{o.status}</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">{fmtDate(o.createdAt)} · {o.items.length} productos</p>
                              </div>
                              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{fmtCurrency(o.totalAmount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Client list */}
            {filteredClients.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 py-16 text-center">
                <Users className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-400 dark:text-gray-500">No hay clientes con los filtros seleccionados</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Cliente</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Pedidos</th>
                        <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Gasto total</th>
                        <th className="text-right px-3 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Ticket medio</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Frecuencia</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Último pedido</th>
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Estado</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {filteredClients.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors" onClick={() => openClientDetail(c)}>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                                {c.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{c.name}</span>
                                  {c.delivery.isVip && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                                </div>
                                <p className="text-xs text-gray-400">{c.phone}</p>
                              </div>
                            </div>
                          </td>
                          <td className="text-center px-3 py-3.5 text-sm font-medium text-gray-700 dark:text-gray-300">{c.delivery.deliveredOrders}</td>
                          <td className="text-right px-3 py-3.5 text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtCurrency(c.delivery.totalSpent)}</td>
                          <td className="text-right px-3 py-3.5 text-sm text-gray-600 dark:text-gray-400">{fmtCurrency(c.delivery.avgTicket)}</td>
                          <td className="text-center px-3 py-3.5">
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{FREQUENCY_LABELS[c.delivery.frequency]}</span>
                          </td>
                          <td className="text-center px-3 py-3.5 text-xs text-gray-500">{fmtDate(c.delivery.lastOrderDate || '')}</td>
                          <td className="text-center px-3 py-3.5">
                            {c.delivery.isVip ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">VIP</span>
                            ) : c.delivery.isAtRisk ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold">En riesgo</span>
                            ) : c.delivery.isInactive ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">Inactivo</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">Activo</span>
                            )}
                          </td>
                          <td className="px-2"><ChevronRight className="w-4 h-4 text-gray-300" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Campaigns Tab */}
        {activeTab === 'campaigns' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">{campaigns.length} campañas configuradas</p>
              <AddButtonDropdown
                label="Nuevo cliente"
                onQuickAdd={openCreateCampaign}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de cliente"
              />
            </div>

            {/* Automatic trigger suggestions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {([
                { trigger: 'inactive_client' as CampaignTrigger, desc: 'Recupera clientes que llevan +30 días sin pedir' },
                { trigger: 'vip_reward' as CampaignTrigger, desc: 'Recompensa a tus mejores clientes con descuentos exclusivos' },
                { trigger: 'zone_promo' as CampaignTrigger, desc: 'Promociones segmentadas por zona de reparto' },
                { trigger: 'frequency_upsell' as CampaignTrigger, desc: 'Incentiva a clientes mensuales a pedir más a menudo' },
                { trigger: 'new_client_welcome' as CampaignTrigger, desc: 'Da la bienvenida a nuevos clientes con un descuento' },
                { trigger: 'birthday' as CampaignTrigger, desc: 'Envía ofertas especiales en el cumpleaños del cliente' },
              ]).map(({ trigger, desc }) => {
                const cfg = TRIGGER_CONFIG[trigger];
                const exists = campaigns.some((c) => c.trigger === trigger);
                return (
                  <div key={trigger} className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 ${exists ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                        <cfg.icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{cfg.label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
                        {!exists && (
                          <button
                            onClick={() => {
                              setCampaignForm({ name: cfg.label, description: desc, trigger, targetSegment: 'all', channel: 'push', message: '', discountPercent: 10, startDate: '', endDate: '' });
                              setEditingCampaign(null);
                              setShowCampaignModal(true);
                            }}
                            className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 flex items-center gap-1"
                          >
                            <Zap className="w-3 h-3" />Configurar
                          </button>
                        )}
                        {exists && <span className="mt-2 inline-block text-xs text-emerald-600 dark:text-emerald-400 font-medium">Configurada</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Campaigns list */}
            {campaigns.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 py-16 text-center">
                <Megaphone className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Crea tu primera campaña para empezar a fidelizar clientes</p>
              </div>
            ) : (
              <div className="space-y-3">
                {campaigns.map((c) => {
                  const st = CAMPAIGN_STATUS_CFG[c.status] || CAMPAIGN_STATUS_CFG.draft;
                  const trig = TRIGGER_CONFIG[c.trigger] || TRIGGER_CONFIG.manual;
                  return (
                    <div key={c.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${trig.color}`}>
                            <trig.icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{c.name}</h3>
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />{st.label}
                              </span>
                            </div>
                            {c.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{c.description}</p>}
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                              <span>Canal: {CHANNEL_LABELS[c.channel] || c.channel}</span>
                              {c.discountPercent > 0 && <span>Descuento: {c.discountPercent}%</span>}
                              <span>Creada: {fmtDate(c.createdAt)}</span>
                            </div>
                            {/* Stats */}
                            <div className="flex items-center gap-4 mt-2">
                              <span className="text-xs text-gray-500"><span className="font-bold text-gray-700 dark:text-gray-300">{c.stats.sent}</span> enviados</span>
                              <span className="text-xs text-gray-500"><span className="font-bold text-gray-700 dark:text-gray-300">{c.stats.converted}</span> convertidos</span>
                              <span className="text-xs text-gray-500"><span className="font-bold text-emerald-600">{fmtCurrency(c.stats.revenue)}</span> generados</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); handleToggleCampaignStatus(c); }}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600" title={c.status === 'active' ? 'Pausar' : 'Activar'}>
                            {c.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); openEditCampaign(c); }}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteCampaign(c.id); }}
                            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Campaign Modal */}
            {showCampaignModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowCampaignModal(false)}>
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{editingCampaign ? 'Editar campaña' : 'Nueva campaña'}</h2>
                    <button onClick={() => setShowCampaignModal(false)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
                  </div>
                  <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
                      <input value={campaignForm.name} onChange={(e) => setCampaignForm((f) => ({ ...f, name: e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Descripción</label>
                      <textarea value={campaignForm.description} onChange={(e) => setCampaignForm((f) => ({ ...f, description: e.target.value }))} rows={2}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Trigger automático</label>
                        <select value={campaignForm.trigger} onChange={(e) => setCampaignForm((f) => ({ ...f, trigger: e.target.value as CampaignTrigger }))}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 rounded-lg text-sm">
                          {Object.entries(TRIGGER_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Canal</label>
                        <select value={campaignForm.channel} onChange={(e) => setCampaignForm((f) => ({ ...f, channel: e.target.value }))}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 rounded-lg text-sm">
                          <option value="push">Push</option><option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Segmento objetivo</label>
                        <select value={campaignForm.targetSegment} onChange={(e) => setCampaignForm((f) => ({ ...f, targetSegment: e.target.value }))}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 rounded-lg text-sm">
                          <option value="all">Todos</option><option value="vip">VIP</option><option value="at_risk">En riesgo</option><option value="inactive">Inactivos</option><option value="new">Nuevos</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Descuento (%)</label>
                        <input type="number" min={0} max={100} value={campaignForm.discountPercent} onChange={(e) => setCampaignForm((f) => ({ ...f, discountPercent: Number(e.target.value) }))}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Mensaje</label>
                      <textarea value={campaignForm.message} onChange={(e) => setCampaignForm((f) => ({ ...f, message: e.target.value }))} rows={3} placeholder="Ej: ¡Te echamos de menos! Usa el código VUELVE10 para un 10% de descuento..."
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Fecha inicio</label>
                        <input type="date" value={campaignForm.startDate} onChange={(e) => setCampaignForm((f) => ({ ...f, startDate: e.target.value }))}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Fecha fin</label>
                        <input type="date" value={campaignForm.endDate} onChange={(e) => setCampaignForm((f) => ({ ...f, endDate: e.target.value }))}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-600 rounded-lg text-sm" />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 dark:border-gray-700">
                    <button onClick={() => setShowCampaignModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200">Cancelar</button>
                    <button onClick={handleSaveCampaign} className="px-5 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors">
                      {editingCampaign ? 'Guardar cambios' : 'Crear campaña'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <div className="space-y-4">
            {/* Summary cards */}
            {alertsSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button onClick={() => setAlertFilter('vip_no_purchase')} className={`bg-white dark:bg-gray-800 rounded-xl border p-4 text-left transition-all ${alertFilter === 'vip_no_purchase' ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                  <Crown className="w-5 h-5 text-amber-500 mb-2" />
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{alertsSummary.vipNoPurchase}</p>
                  <p className="text-xs text-gray-500 mt-0.5">VIP sin compra</p>
                </button>
                <button onClick={() => setAlertFilter('zone_sales_drop')} className={`bg-white dark:bg-gray-800 rounded-xl border p-4 text-left transition-all ${alertFilter === 'zone_sales_drop' ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                  <Map className="w-5 h-5 text-red-500 mb-2" />
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{alertsSummary.zoneDrop}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Zonas en caída</p>
                </button>
                <button onClick={() => setAlertFilter('repeat_incidents')} className={`bg-white dark:bg-gray-800 rounded-xl border p-4 text-left transition-all ${alertFilter === 'repeat_incidents' ? 'border-orange-400 ring-2 ring-orange-200' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                  <ShieldAlert className="w-5 h-5 text-orange-500 mb-2" />
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{alertsSummary.repeatIncidents}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Incidencias rep.</p>
                </button>
                <button onClick={() => setAlertFilter('inactive_client')} className={`bg-white dark:bg-gray-800 rounded-xl border p-4 text-left transition-all ${alertFilter === 'inactive_client' ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                  <UserX className="w-5 h-5 text-blue-500 mb-2" />
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{alertsSummary.inactiveClients}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Clientes inactivos</p>
                </button>
              </div>
            )}

            {/* Filter toggle */}
            <div className="flex items-center gap-2">
              <button onClick={() => setAlertFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${alertFilter === 'all' ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                Todas ({alerts.length})
              </button>
              <button onClick={() => setAlertFilter(alertFilter === 'all' ? 'vip_no_purchase' : 'all')} className="text-xs text-gray-400 hover:text-gray-600">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Alert list */}
            {filteredAlerts.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 py-16 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-300 dark:text-emerald-600 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Sin alertas pendientes</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAlerts.map((a) => {
                  const Icon = ALERT_TYPE_ICONS[a.type] || Bell;
                  const colorClass = ALERT_TYPE_COLORS[a.type] || 'border-l-gray-400';
                  return (
                    <div key={a.id} className={`border-l-4 rounded-xl p-4 ${colorClass} transition-shadow hover:shadow-md`}>
                      <div className="flex items-start gap-3">
                        <Icon className="w-5 h-5 flex-shrink-0 mt-0.5 text-gray-600 dark:text-gray-400" />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{a.title}</h4>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{a.description}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                            {a.totalSpent !== undefined && <span>Gasto: {fmtCurrency(a.totalSpent)}</span>}
                            {a.totalOrders !== undefined && <span>{a.totalOrders} pedidos</span>}
                            {a.dropPercent !== undefined && <span className="text-red-600 font-medium">-{a.dropPercent}%</span>}
                            {a.incidentCount !== undefined && <span>{a.incidentCount} incidencias</span>}
                          </div>
                        </div>
                        {a.clientId && (
                          <button
                            onClick={() => {
                              const client = clients.find((c) => c.id === a.clientId);
                              if (client) openClientDetail(client);
                            }}
                            className="flex-shrink-0 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                          >
                            Ver cliente
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="delivery_crm"
        moduleLabel="CRM Delivery"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="CRM Delivery"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
