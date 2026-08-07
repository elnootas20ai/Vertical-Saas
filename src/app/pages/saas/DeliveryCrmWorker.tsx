import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import {
  listCrmClientsRequest,
  getClientOrdersRequest,
  type DeliveryCrmClient,
  type DeliveryOrderBrief,
} from '../../lib/deliveryCrmApi';
import {
  Users, Search, Phone, Mail, MapPin, Crown, ChevronRight, X,
  Package, Clock, AlertTriangle, ShoppingBag,
} from 'lucide-react';

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v);
}

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

const FREQUENCY_LABELS: Record<string, string> = {
  none: 'Sin pedidos', monthly: 'Mensual', biweekly: 'Quincenal', weekly: 'Semanal',
};

export function DeliveryCrmWorker() {
  const { user, isInitializing } = useAuth();
  const { currentBusiness } = useBusiness();
  const businessId = resolveBusinessScopeId(currentBusiness);
  const userId = user?.user_id || user?.id || '';
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<DeliveryCrmClient[]>([]);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<DeliveryCrmClient | null>(null);
  const [clientOrders, setClientOrders] = useState<DeliveryOrderBrief[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const loadClients = useCallback(async () => {
    const uid = user?.user_id || user?.id || '';
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await listCrmClientsRequest(uid, businessId || undefined);
      setClients(data);
    } catch {
      toast.error('Error cargando clientes');
    } finally {
      setLoading(false);
    }
  }, [user?.user_id, user?.id, businessId]);

  useEffect(() => {
    if (isInitializing) return;
    void loadClients();
  }, [isInitializing, loadClients]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.email.toLowerCase().includes(q)
    );
  }, [clients, search]);

  const openDetail = async (client: DeliveryCrmClient) => {
    setSelectedClient(client);
    setLoadingOrders(true);
    if (userId) {
      const orders = await getClientOrdersRequest(userId, client.id, businessId || undefined);
      setClientOrders(orders);
    }
    setLoadingOrders(false);
  };

  if (loading) {
    return (
      <Layout backTo="/saas/delivery-ops" title="Clientes Delivery" subtitle="Consulta de clientes">
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout backTo="/saas/delivery-ops" title="Clientes Delivery" subtitle="Consulta de clientes y pedidos">
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar cliente por nombre, teléfono o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
          />
        </div>

        {/* Client detail drawer */}
        {selectedClient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedClient(null)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 p-5 flex items-center justify-between z-10">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedClient.name}</h2>
                    {selectedClient.delivery.isVip && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold"><Crown className="w-3 h-3" />VIP</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelectedClient(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
              </div>

              <div className="p-5 space-y-4">
                {/* Datos de contacto */}
                <div className="bg-gray-50 dark:bg-gray-750 rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Datos de contacto</h4>
                  {selectedClient.phone && (
                    <a href={`tel:${selectedClient.phone}`} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-amber-600">
                      <Phone className="w-4 h-4 text-gray-400" />{selectedClient.phone}
                    </a>
                  )}
                  {selectedClient.email && (
                    <a href={`mailto:${selectedClient.email}`} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-amber-600">
                      <Mail className="w-4 h-4 text-gray-400" />{selectedClient.email}
                    </a>
                  )}
                  {selectedClient.address && (
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <MapPin className="w-4 h-4 text-gray-400" />{selectedClient.address}{selectedClient.city ? `, ${selectedClient.city}` : ''}
                    </div>
                  )}
                </div>

                {/* Resumen rápido */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-750 rounded-xl p-3 text-center">
                    <ShoppingBag className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedClient.delivery.deliveredOrders}</p>
                    <p className="text-xs text-gray-500">Pedidos</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-750 rounded-xl p-3 text-center">
                    <Clock className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{FREQUENCY_LABELS[selectedClient.delivery.frequency]}</p>
                    <p className="text-xs text-gray-500">Frecuencia</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-750 rounded-xl p-3 text-center">
                    <Package className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{fmtCurrency(selectedClient.delivery.avgTicket)}</p>
                    <p className="text-xs text-gray-500">Ticket medio</p>
                  </div>
                </div>

                {selectedClient.delivery.incidents > 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-300">Este cliente tiene {selectedClient.delivery.incidents} incidencia(s) registrada(s)</p>
                  </div>
                )}

                {/* Zonas */}
                {selectedClient.delivery.zones.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedClient.delivery.zones.map((z) => (
                      <span key={z} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-medium">
                        <MapPin className="w-3 h-3" />{z}
                      </span>
                    ))}
                  </div>
                )}

                {/* Productos favoritos */}
                {selectedClient.delivery.topProducts.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Productos habituales</h4>
                    <div className="space-y-1.5">
                      {selectedClient.delivery.topProducts.map((p) => (
                        <div key={p.name} className="flex items-center justify-between bg-gray-50 dark:bg-gray-750 rounded-lg px-3 py-2">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{p.name}</span>
                          <span className="text-xs text-gray-500">{p.qty}x pedido</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Últimos pedidos */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Últimos pedidos</h4>
                  {loadingOrders ? (
                    <div className="flex justify-center py-4">
                      <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : clientOrders.length === 0 ? (
                    <p className="text-sm text-gray-400 py-3 text-center">Sin historial de pedidos</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {clientOrders.slice(0, 10).map((o) => (
                        <div key={o.id} className="bg-gray-50 dark:bg-gray-750 rounded-lg px-3 py-2.5 flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{o.orderNumber}</span>
                            <p className="text-xs text-gray-500 mt-0.5">{fmtDate(o.createdAt)}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{fmtCurrency(o.totalAmount)}</span>
                            <span className={`block text-xs mt-0.5 ${
                              o.status === 'delivered' ? 'text-green-600' : o.status === 'incident' ? 'text-red-600' : 'text-gray-500'
                            }`}>{o.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Client cards (mobile-friendly) */}
        {filtered.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 py-16 text-center">
            <Users className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No se encontraron clientes</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => openDetail(c)}
                className="w-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4 hover:shadow-md transition-shadow text-left"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{c.name}</span>
                    {c.delivery.isVip && <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                    <span>{c.phone}</span>
                    <span>{c.delivery.deliveredOrders} pedidos</span>
                    <span>{FREQUENCY_LABELS[c.delivery.frequency]}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
