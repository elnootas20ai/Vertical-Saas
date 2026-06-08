import { useNavigate } from 'react-router-dom';
import {
  Package, Clock, CheckCircle, Truck, Store, XCircle, Loader2,
  RefreshCw, ChevronDown, Phone, Mail, MapPin, FileText,
  ChefHat, PackageCheck, AlertCircle, Plug, Save,
  Eye, EyeOff, ToggleLeft, ToggleRight, ExternalLink,
  Copy, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { useBusiness } from '../../context/BusinessContext';
import { getApiBase } from '../../lib/apiBase';
import {
  listWebOrdersRequest,
  updateWebOrderRequest,
  getDeliveryIntegrationsRequest,
  saveDeliveryIntegrationsRequest,
  type WebOrder,
  type WebOrderStatus,
  type DeliveryIntegrations,
} from '../../lib/webApi';
import { Layout } from '../../components/saas/Layout';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '../../components/ui/dialog';

const STATUS_CONFIG: Record<WebOrderStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:    { label: 'Pendiente',    color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   icon: <Clock className="w-4 h-4" /> },
  confirmed:  { label: 'Confirmado',   color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     icon: <CheckCircle className="w-4 h-4" /> },
  preparing:  { label: 'Preparando',   color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', icon: <ChefHat className="w-4 h-4" /> },
  ready:      { label: 'Listo',        color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', icon: <PackageCheck className="w-4 h-4" /> },
  delivering: { label: 'En reparto',   color: 'text-cyan-700',   bg: 'bg-cyan-50 border-cyan-200',     icon: <Truck className="w-4 h-4" /> },
  delivered:  { label: 'Entregado',    color: 'text-green-700',  bg: 'bg-green-50 border-green-200',   icon: <CheckCircle className="w-4 h-4" /> },
  cancelled:  { label: 'Cancelado',    color: 'text-red-700',    bg: 'bg-red-50 border-red-200',       icon: <XCircle className="w-4 h-4" /> },
};

const STATUS_FLOW: WebOrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'delivering', 'delivered'];

type FilterStatus = WebOrderStatus | 'all' | 'active';

export function WebOrders() {
  const navigate = useNavigate();
  const { currentBusiness } = useBusiness();
  const [orders, setOrders] = useState<WebOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('active');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [integrations, setIntegrations] = useState<DeliveryIntegrations>({
    uber:    { enabled: false, token: '' },
    globo:   { enabled: false, token: '' },
    justead: { enabled: false, token: '' },
    flipdish: { enabled: false, token: '' },
  });
  const [intLoading, setIntLoading] = useState(false);
  const [intSaving, setIntSaving] = useState(false);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const apiBase = useMemo(() => getApiBase(), []);
  const buildWebhookUrl = useCallback(
    (urlSlug: string): string => `${apiBase}/api/delivery-webhooks/${urlSlug}/${businessId}`,
    [apiBase, businessId],
  );
  const copyWebhookUrl = useCallback(async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      toast.success('URL copiada al portapapeles');
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000);
    } catch {
      toast.error('No se pudo copiar la URL');
    }
  }, []);

  const businessId = currentBusiness?.business_id || '';

  const loadOrders = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const res = await listWebOrdersRequest(businessId);
      setOrders(res.orders || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : 'Error al cargar pedidos';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  const loadIntegrations = useCallback(async () => {
    if (!businessId) return;
    setIntLoading(true);
    try {
      const res = await getDeliveryIntegrationsRequest(businessId);
      if (res.integrations) setIntegrations(res.integrations);
    } catch {
      // silent
    } finally {
      setIntLoading(false);
    }
  }, [businessId]);

  const saveIntegrations = async () => {
    if (!businessId) return;
    setIntSaving(true);
    try {
      const res = await saveDeliveryIntegrationsRequest(businessId, integrations);
      if (res.integrations) setIntegrations(res.integrations);
      setIntegrationsOpen(false);
    } catch {
      // silent
    } finally {
      setIntSaving(false);
    }
  };

  useEffect(() => { loadOrders(); }, [loadOrders]);

  useEffect(() => {
    if (!businessId) return;
    const interval = setInterval(() => {
      listWebOrdersRequest(businessId)
        .then((res) => setOrders(res.orders || []))
        .catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [businessId]);

  const filteredOrders = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'active') return orders.filter((o) => !['delivered', 'cancelled'].includes(o.status));
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length, active: 0 };
    for (const o of orders) {
      c[o.status] = (c[o.status] || 0) + 1;
      if (!['delivered', 'cancelled'].includes(o.status)) c.active++;
    }
    return c;
  }, [orders]);

  const advanceStatus = async (order: WebOrder) => {
    const currentIdx = STATUS_FLOW.indexOf(order.status);
    if (currentIdx < 0 || currentIdx >= STATUS_FLOW.length - 1) return;
    const nextStatus = STATUS_FLOW[currentIdx + 1];
    setUpdatingId(order._id);
    try {
      const res = await updateWebOrderRequest(businessId, order._id, { status: nextStatus, statusNote: '' } as Partial<WebOrder> & { statusNote?: string });
      setOrders((prev) => prev.map((o) => (o._id === order._id ? res.order : o)));
    } catch {
      // silent
    } finally {
      setUpdatingId(null);
    }
  };

  const cancelOrder = async (order: WebOrder) => {
    setUpdatingId(order._id);
    try {
      const res = await updateWebOrderRequest(businessId, order._id, { status: 'cancelled' });
      setOrders((prev) => prev.map((o) => (o._id === order._id ? res.order : o)));
    } catch {
      // silent
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (d: string) => {
    if (!d) return '-';
    const date = new Date(d);
    return date.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const timeSince = (d: string) => {
    if (!d) return '';
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    return `hace ${hrs}h ${mins % 60}m`;
  };

  return (
    <Layout title="Pedidos Web">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Package className="w-6 h-6 text-amber-600" />
              Pedidos Web
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Gestiona los pedidos que llegan desde tu tienda online
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/saas/vertical/delivery/integraciones')}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-purple-200 dark:border-purple-700 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300 transition-colors"
            >
              <Plug className="w-4 h-4" /> Integraciones
            </button>
            <button
              onClick={loadOrders}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { key: 'active' as FilterStatus, label: 'Activos', count: counts.active || 0, color: 'text-amber-600 bg-amber-50 border-amber-200' },
            { key: 'pending' as FilterStatus, label: 'Pendientes', count: counts.pending || 0, color: 'text-amber-600 bg-amber-50 border-amber-200' },
            { key: 'preparing' as FilterStatus, label: 'Preparando', count: counts.preparing || 0, color: 'text-purple-600 bg-purple-50 border-purple-200' },
            { key: 'delivered' as FilterStatus, label: 'Entregados', count: counts.delivered || 0, color: 'text-green-600 bg-green-50 border-green-200' },
          ].map(({ key, label, count, color }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`p-3 rounded-xl border text-left transition-all ${
                filter === key ? color + ' ring-2 ring-offset-1 ring-amber-500/30' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              }`}
            >
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none">
          {[
            { key: 'all' as FilterStatus, label: 'Todos' },
            { key: 'active' as FilterStatus, label: 'Activos' },
            ...Object.entries(STATUS_CONFIG).map(([key, { label }]) => ({ key: key as FilterStatus, label })),
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === key
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {label} {counts[key] ? `(${counts[key]})` : ''}
            </button>
          ))}
        </div>

        {/* Orders */}
        {loading && orders.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">No hay pedidos</p>
            <p className="text-sm text-gray-400 dark:text-gray-500">Los pedidos de tu tienda web aparecerán aquí</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
              const isExpanded = expandedOrder === order._id;
              const isUpdating = updatingId === order._id;
              const canAdvance = STATUS_FLOW.indexOf(order.status) >= 0 && STATUS_FLOW.indexOf(order.status) < STATUS_FLOW.length - 1 && order.status !== 'cancelled';
              const nextStatusLabel = canAdvance ? STATUS_CONFIG[STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1]]?.label : '';

              return (
                <div key={order._id} className={`bg-white dark:bg-gray-800 rounded-xl border transition-all ${isExpanded ? 'border-amber-300 dark:border-amber-600 shadow-md' : 'border-gray-200 dark:border-gray-700'}`}>
                  <button
                    onClick={() => setExpandedOrder(isExpanded ? null : order._id)}
                    className="w-full p-4 flex items-center gap-3 text-left"
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${status.bg} ${status.color}`}>
                      {status.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-sm text-gray-900 dark:text-white">{order.orderNumber}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${status.bg} ${status.color}`}>
                          {status.label}
                        </span>
                        <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                          {order.orderType === 'delivery' ? <Truck className="w-3 h-3" /> : <Store className="w-3 h-3" />}
                          {order.orderType === 'delivery' ? 'Domicilio' : 'Recogida'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{order.customerName}</span>
                        <span>{order.items.length} art.</span>
                        <span className="font-semibold text-amber-600">{order.totalAmount.toFixed(2)} €</span>
                        <span className="text-gray-400">{timeSince(order.createdAt)}</span>
                      </div>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-3">
                      {/* Customer info */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Phone className="w-3.5 h-3.5 text-gray-400" /> {order.customerPhone || '-'}
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                          <Mail className="w-3.5 h-3.5 text-gray-400" /> {order.customerEmail || '-'}
                        </div>
                        {order.orderType === 'delivery' && order.customerAddress && (
                          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 sm:col-span-2">
                            <MapPin className="w-3.5 h-3.5 text-gray-400" />
                            <span>{order.customerAddress}{order.customerPostalCode ? ` (${order.customerPostalCode})` : ''}</span>
                            {order.shippingCarrier && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded font-medium">{order.shippingCarrier}</span>
                            )}
                            {order.shippingZoneName && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">{order.shippingZoneName}</span>
                            )}
                          </div>
                        )}
                        {order.notes && (
                          <div className="flex items-start gap-2 text-gray-600 dark:text-gray-400 sm:col-span-2">
                            <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5" /> {order.notes}
                          </div>
                        )}
                      </div>

                      {/* Items */}
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                        <table className="w-full text-sm min-w-[500px]">
                          <thead>
                            <tr className="text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
                              <th className="text-left pb-2 font-medium">Producto</th>
                              <th className="text-center pb-2 font-medium w-16">Cant.</th>
                              <th className="text-right pb-2 font-medium w-20">Precio</th>
                              <th className="text-right pb-2 font-medium w-20">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.items.map((item) => (
                              <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                                <td className="py-1.5 text-gray-700 dark:text-gray-300">{item.name}</td>
                                <td className="py-1.5 text-center text-gray-500">{item.quantity}</td>
                                <td className="py-1.5 text-right text-gray-500">{item.unitPrice.toFixed(2)} €</td>
                                <td className="py-1.5 text-right font-medium text-gray-700 dark:text-gray-300">{item.total.toFixed(2)} €</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            {order.deliveryFee > 0 && (
                              <tr className="border-t border-gray-200 dark:border-gray-700">
                                <td colSpan={3} className="py-1 text-right text-xs text-gray-500">Envío{order.shippingCarrier ? ` (${order.shippingCarrier})` : ''}</td>
                                <td className="py-1 text-right text-xs text-gray-500">{order.deliveryFee.toFixed(2)} €</td>
                              </tr>
                            )}
                            {order.promoDiscount > 0 && (
                              <tr>
                                <td colSpan={3} className="py-1 text-right text-xs text-green-600">Dto. promo ({order.promoCode})</td>
                                <td className="py-1 text-right text-xs text-green-600">-{order.promoDiscount.toFixed(2)} €</td>
                              </tr>
                            )}
                            {order.volumeDiscount > 0 && (
                              <tr>
                                <td colSpan={3} className="py-1 text-right text-xs text-emerald-600">
                                  Dto. volumen{order.volumeDiscountLabel ? ` (${order.volumeDiscountLabel})` : ''}
                                </td>
                                <td className="py-1 text-right text-xs text-emerald-600">-{order.volumeDiscount.toFixed(2)} €</td>
                              </tr>
                            )}
                            <tr className="border-t border-gray-300 dark:border-gray-600">
                              <td colSpan={3} className="py-1.5 text-right font-bold text-gray-900 dark:text-white">Total</td>
                              <td className="py-1.5 text-right font-bold text-amber-600">{order.totalAmount.toFixed(2)} €</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Status history */}
                      {order.statusHistory.length > 0 && (
                        <div className="text-xs text-gray-500 space-y-1">
                          <p className="font-medium text-gray-600 dark:text-gray-400">Historial:</p>
                          {order.statusHistory.map((sh, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-gray-300" />
                              <span className="font-medium">{STATUS_CONFIG[sh.status]?.label || sh.status}</span>
                              <span className="text-gray-400">{formatDate(sh.date)}</span>
                              {sh.notes && <span className="text-gray-400">— {sh.notes}</span>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      {order.status !== 'delivered' && order.status !== 'cancelled' && (
                        <div className="flex gap-2 pt-1">
                          {canAdvance && (
                            <button
                              onClick={() => advanceStatus(order)}
                              disabled={isUpdating}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-600 text-white font-medium text-sm hover:bg-amber-700 transition-colors disabled:opacity-50"
                            >
                              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : STATUS_CONFIG[STATUS_FLOW[STATUS_FLOW.indexOf(order.status) + 1]]?.icon}
                              Pasar a: {nextStatusLabel}
                            </button>
                          )}
                          <button
                            onClick={() => cancelOrder(order)}
                            disabled={isUpdating}
                            className="px-4 py-2.5 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}

                      <div className="text-xs text-gray-400 text-right">
                        Recibido: {formatDate(order.createdAt)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={integrationsOpen} onOpenChange={setIntegrationsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="w-5 h-5 text-purple-600" />
              Integraciones de Delivery
            </DialogTitle>
            <DialogDescription>
              Conecta tus plataformas de delivery introduciendo el token de cada servicio y activándolos.
            </DialogDescription>
          </DialogHeader>

          {intLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {([
                { key: 'uber' as const, urlSlug: 'ubereats', name: 'Uber Eats', color: 'bg-black text-white', accent: 'border-black/20', devUrl: 'https://developer.uber.com/docs/eats' },
                { key: 'globo' as const, urlSlug: 'glovo', name: 'Glovo', color: 'bg-[#00A082] text-white', accent: 'border-[#00A082]/20', devUrl: 'https://developers.glovoapp.com/' },
                { key: 'justead' as const, urlSlug: 'justeat', name: 'Just Eat', color: 'bg-[#FF8000] text-white', accent: 'border-[#FF8000]/20', devUrl: 'https://developers.just-eat.com/' },
              ]).map(({ key, urlSlug, name, color, accent, devUrl }) => {
                const webhookUrl = buildWebhookUrl(urlSlug);
                const isCopied = copiedKey === key;
                return (
                <div key={key} className={`rounded-xl border ${accent} p-4 space-y-3`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${color}`}>{name}</span>
                      {integrations[key].enabled && (
                        <span className="text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">Activo</span>
                      )}
                    </div>
                    <button
                      onClick={() => setIntegrations((prev) => ({
                        ...prev,
                        [key]: { ...prev[key], enabled: !prev[key].enabled },
                      }))}
                      className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    >
                      {integrations[key].enabled
                        ? <ToggleRight className="w-8 h-8 text-green-500" />
                        : <ToggleLeft className="w-8 h-8" />
                      }
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      URL de webhook (registra esta URL en {name})
                    </label>
                    <div className="flex items-stretch gap-2">
                      <code className="flex-1 px-3 py-2 text-[11px] font-mono break-all border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 select-all">
                        {businessId ? webhookUrl : 'Selecciona un negocio activo para ver la URL'}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyWebhookUrl(key, webhookUrl)}
                        disabled={!businessId}
                        className="shrink-0 inline-flex items-center justify-center w-10 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Copiar URL"
                      >
                        {isCopied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                      Las plataformas autentican con el header <code className="text-[10px]">x-webhook-token</code> o el query <code className="text-[10px]">?token=</code>.
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      Token secreto
                    </label>
                    <div className="relative">
                      <input
                        type={showTokens[key] ? 'text' : 'password'}
                        placeholder={`Token de ${name}`}
                        value={integrations[key].token}
                        onChange={(e) => setIntegrations((prev) => ({
                          ...prev,
                          [key]: { ...prev[key], token: e.target.value },
                        }))}
                        className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTokens((prev) => ({ ...prev, [key]: !prev[key] }))}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {showTokens[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <a
                    href={devUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Obtener token de {name}
                  </a>
                </div>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <button
              onClick={() => setIntegrationsOpen(false)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={saveIntegrations}
              disabled={intSaving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {intSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Guardar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
