import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { Tabs } from '../../components/saas/Tabs';
import { useAuth } from '../../context/AuthContext';
import { useBusinessOptional } from '../../context/BusinessContext';
import {
  listSuppliersRequest,
  updateSupplierRequest,
  listCatalogItemsRequest,
  listPurchaseInvoicesRequest,
  type Supplier,
  type CatalogItem,
  type PurchaseInvoice,
} from '../../lib/deliveryApi';
import { listBrandsRequest, type Brand } from '../../lib/brandsApi';
import { labelsForSupplierOrganizerIds } from '../../components/saas/SupplierOrganizersField';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import {
  listPurchaseOrdersRequest,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from '../../lib/purchaseOrderApi';
import {
  listDocumentsRequest,
  type DocumentRecord,
} from '../../lib/documentsApi';
import {
  ArrowLeft,
  Factory,
  Phone,
  Mail,
  MapPin,
  User,
  CreditCard,
  Calendar,
  Edit3,
  CheckCircle2,
  XCircle,
  Package,
  FileText,
  ShoppingBag,
  TrendingUp,
  Clock,
  AlertTriangle,
  ExternalLink,
  DollarSign,
  BarChart3,
  Shield,
  ShieldAlert,
  Receipt,
  ClipboardList,
  FolderOpen,
  Send,
  Truck,
  X,
} from 'lucide-react';

const ORDER_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  sent: 'Enviado',
  partial: 'Parcial',
  received: 'Recibido',
  cancelled: 'Cancelado',
};
const ORDER_STATUS_CLASS: Record<PurchaseOrderStatus, string> = {
  draft: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600',
  pending: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  sent: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  partial: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800',
  received: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  cancelled: 'bg-red-100 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
};

const INV_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' },
  paid: { label: 'Pagada', cls: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' },
  overdue: { label: 'Vencida', cls: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' },
};

function isOverdue(inv: PurchaseInvoice): boolean {
  return inv.status === 'pending' && !!inv.dueDate && new Date(inv.dueDate) < new Date();
}

function daysBetween(a: string, b: Date): number {
  return Math.ceil((b.getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24));
}

function isHabitualSupplier(orders: PurchaseOrder[], invoices: PurchaseInvoice[]): boolean {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const recentOrders = orders.filter(o => new Date(o.createdAt) >= threeMonthsAgo).length;
  const recentInvoices = invoices.filter(i => new Date(i.createdAt) >= threeMonthsAgo).length;
  return (recentOrders + recentInvoices) >= 3;
}

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const businessId = resolveBusinessScopeId(useBusinessOptional()?.currentBusiness);
  const navigate = useNavigate();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const loadData = useCallback(async () => {
    if (!user?.id || !id) return;
    try {
      const [sups, items, invs, ords, docs, brandList] = await Promise.all([
        listSuppliersRequest(user.id),
        listCatalogItemsRequest(user.id),
        listPurchaseInvoicesRequest(user.id),
        listPurchaseOrdersRequest(user.id),
        listDocumentsRequest(user.id),
        businessId ? listBrandsRequest(businessId).catch(() => [] as Brand[]) : Promise.resolve([] as Brand[]),
      ]);
      const found = sups.find(s => s._id === id);
      if (!found) { toast.error('Proveedor no encontrado'); navigate('/saas/suppliers'); return; }
      setSupplier(found);
      setCatalogItems(items);
      setInvoices(invs);
      setOrders(ords);
      setDocuments(docs);
      setBrands(brandList);
    } catch {
      toast.error('Error al cargar datos del proveedor');
    } finally {
      setLoading(false);
    }
  }, [user?.id, id, navigate, businessId]);

  useEffect(() => { loadData(); }, [loadData]);

  const organizerLabels = useMemo(
    () => labelsForSupplierOrganizerIds(supplier?.organizerIds, brands),
    [supplier?.organizerIds, brands],
  );

  const supplierOrders = useMemo(() => orders.filter(o => o.supplierId === id), [orders, id]);
  const supplierInvoices = useMemo(() => invoices.filter(i => i.supplierId === id), [invoices, id]);
  const supplierProducts = useMemo(() => catalogItems.filter(i => i.supplierId === id), [catalogItems, id]);
  const supplierDocs = useMemo(() => documents.filter(d => d.supplierId === id), [documents, id]);
  const overdueInvoices = useMemo(() => supplierInvoices.filter(isOverdue), [supplierInvoices]);
  const habitual = useMemo(() => isHabitualSupplier(supplierOrders, supplierInvoices), [supplierOrders, supplierInvoices]);

  const stats = useMemo(() => {
    const totalInvoiced = supplierInvoices.reduce((s, i) => s + (i.total || 0), 0);
    const pendingAmount = supplierInvoices.filter(i => i.status === 'pending').reduce((s, i) => s + (i.total || 0), 0);
    const paidAmount = supplierInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
    const overdueAmount = overdueInvoices.reduce((s, i) => s + (i.total || 0), 0);
    const totalOrdered = supplierOrders.reduce((s, o) => s + (o.total || 0), 0);
    const avgOrder = supplierOrders.length > 0 ? totalOrdered / supplierOrders.length : 0;
    return { totalInvoiced, pendingAmount, paidAmount, overdueAmount, totalOrdered, avgOrder };
  }, [supplierInvoices, supplierOrders, overdueInvoices]);

  const handleToggleActive = async () => {
    if (!user?.id || !supplier) return;
    try {
      const updated = await updateSupplierRequest(user.id, { ...supplier, active: !supplier.active });
      setSupplier(updated);
      toast.success(`Proveedor ${updated.active ? 'activado' : 'desactivado'}`);
    } catch { toast.error('Error al actualizar'); }
  };

  const handleValidate = async () => {
    if (!user?.id || !supplier) return;
    try {
      const updated = await updateSupplierRequest(user.id, {
        ...supplier,
        validated: true,
        validatedAt: new Date().toISOString(),
      } as Supplier & { validated: boolean; validatedAt: string });
      setSupplier(updated);
      toast.success('Proveedor validado');
    } catch { toast.error('Error al validar'); }
  };

  if (loading) {
    return (
      <Layout title="Proveedor" subtitle="Cargando...">
        <div className="flex items-center justify-center py-24 text-gray-500">
          <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />
          Cargando proveedor...
        </div>
      </Layout>
    );
  }

  if (!supplier) return null;

  const isValidated = (supplier as any).validated !== false;

  const tabs = [
    { id: 'overview', label: 'Resumen' },
    { id: 'orders', label: 'Pedidos', count: supplierOrders.length || undefined },
    { id: 'invoices', label: 'Facturas', count: supplierInvoices.length || undefined },
    { id: 'products', label: 'Productos', count: supplierProducts.length || undefined },
    { id: 'documents', label: 'Documentos', count: supplierDocs.length || undefined },
  ];

  return (
    <Layout title="" subtitle="">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => navigate('/saas/suppliers')} className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Proveedores
          </button>
          <span className="text-gray-400">/</span>
          <span className="text-gray-700 dark:text-gray-300 font-medium">{supplier.name}</span>
        </div>

        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center shrink-0">
                <Factory className="w-7 h-7 text-gray-500 dark:text-gray-400" />
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{supplier.name}</h1>
                  <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${supplier.active ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600'}`}>
                    {supplier.active ? 'Activo' : 'Inactivo'}
                  </span>
                  {!isValidated && (
                    <span className="px-2.5 py-0.5 text-xs font-bold rounded-full border bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" /> Sin validar
                    </span>
                  )}
                  {habitual && (
                    <span className="px-2.5 py-0.5 text-xs font-bold rounded-full border bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Habitual
                    </span>
                  )}
                </div>
                {supplier.cif && (
                  <p className="text-sm font-mono text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5" /> {supplier.cif}
                  </p>
                )}
                {supplier.category && (
                  <span className="inline-block mt-1.5 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg">
                    {supplier.category}
                  </span>
                )}
                {organizerLabels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {organizerLabels.map((label) => (
                      <span
                        key={label}
                        className="px-2 py-0.5 text-xs bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300 rounded-lg border border-sky-200 dark:border-sky-800"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isValidated && (
                <button onClick={handleValidate} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium flex items-center gap-2 transition-colors">
                  <Shield className="w-4 h-4" /> Validar
                </button>
              )}
              <button onClick={() => navigate(`/saas/suppliers?edit=${supplier._id}`)} className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2">
                <Edit3 className="w-4 h-4" /> Editar
              </button>
              <button onClick={handleToggleActive} className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors ${supplier.active ? 'border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700' : 'bg-green-600 hover:bg-green-700 text-white'}`}>
                {supplier.active ? <><XCircle className="w-4 h-4" /> Desactivar</> : <><CheckCircle2 className="w-4 h-4" /> Activar</>}
              </button>
            </div>
          </div>

          {/* Contact info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            {supplier.email && (
              <a href={`mailto:${supplier.email}`} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                <Mail className="w-4 h-4 shrink-0" /> {supplier.email}
              </a>
            )}
            {supplier.phone && (
              <a href={`tel:${supplier.phone}`} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                <Phone className="w-4 h-4 shrink-0" /> {supplier.phone}
              </a>
            )}
            {supplier.address && (
              <span className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <MapPin className="w-4 h-4 shrink-0" /> {supplier.address}
              </span>
            )}
            {supplier.contactPerson && (
              <span className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <User className="w-4 h-4 shrink-0" /> {supplier.contactPerson}
              </span>
            )}
          </div>

          {/* Payment terms */}
          {supplier.paymentTerms && (
            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl flex items-center gap-2 text-sm">
              <CreditCard className="w-4 h-4 text-gray-500 shrink-0" />
              <span className="font-medium text-gray-700 dark:text-gray-300">Condiciones de pago:</span>
              <span className="text-gray-600 dark:text-gray-400">{supplier.paymentTerms}</span>
            </div>
          )}
        </div>

        {/* Overdue alert */}
        {overdueInvoices.length > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-red-900 dark:text-red-300">
                {overdueInvoices.length} factura{overdueInvoices.length > 1 ? 's' : ''} vencida{overdueInvoices.length > 1 ? 's' : ''} ({stats.overdueAmount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€)
              </p>
              <p className="text-sm text-red-700 dark:text-red-400">
                Retraso medio: {Math.round(overdueInvoices.reduce((s, i) => s + daysBetween(i.dueDate, new Date()), 0) / overdueInvoices.length)} días
              </p>
            </div>
            <button onClick={() => setActiveTab('invoices')} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors shrink-0">
              Ver facturas
            </button>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
            <ClipboardList className="w-5 h-5 text-blue-600 mb-2" />
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-200">{supplierOrders.length}</div>
            <div className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">Pedidos</div>
          </div>
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl">
            <Receipt className="w-5 h-5 text-purple-600 mb-2" />
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-200">{supplierInvoices.length}</div>
            <div className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">Facturas</div>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
            <DollarSign className="w-5 h-5 text-green-600 mb-2" />
            <div className="text-2xl font-bold text-green-900 dark:text-green-200">{stats.totalInvoiced.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
            <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">Total facturado</div>
          </div>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
            <Clock className="w-5 h-5 text-amber-600 mb-2" />
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-200">{stats.pendingAmount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
            <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Pdte. de pago</div>
          </div>
          <div className="p-4 bg-cyan-50 dark:bg-cyan-900/20 border-2 border-cyan-200 dark:border-cyan-800 rounded-xl">
            <Package className="w-5 h-5 text-cyan-600 mb-2" />
            <div className="text-2xl font-bold text-cyan-900 dark:text-cyan-200">{supplierProducts.length}</div>
            <div className="text-xs text-cyan-700 dark:text-cyan-400 mt-0.5">Productos</div>
          </div>
          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl">
            <BarChart3 className="w-5 h-5 text-indigo-600 mb-2" />
            <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-200">{stats.avgOrder.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
            <div className="text-xs text-indigo-700 dark:text-indigo-400 mt-0.5">Pedido medio</div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        {/* TAB: Overview */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent orders */}
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4" /> Últimos pedidos
                </h3>
                <button onClick={() => setActiveTab('orders')} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Ver todos →</button>
              </div>
              {supplierOrders.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">Sin pedidos</p>
              ) : (
                <div className="space-y-2">
                  {supplierOrders.slice(0, 5).map(order => (
                    <div key={order._id} onClick={() => navigate('/saas/suppliers/ordenes-compra')} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <div>
                        <span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{order.orderNumber}</span>
                        <span className="text-xs text-gray-400 ml-2">{order.createdAt ? new Date(order.createdAt).toLocaleDateString('es-ES') : ''}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${ORDER_STATUS_CLASS[order.status]}`}>
                          {ORDER_STATUS_LABEL[order.status]}
                        </span>
                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{(order.total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent invoices */}
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Receipt className="w-4 h-4" /> Últimas facturas
                </h3>
                <button onClick={() => setActiveTab('invoices')} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Ver todas →</button>
              </div>
              {supplierInvoices.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">Sin facturas</p>
              ) : (
                <div className="space-y-2">
                  {supplierInvoices.slice(0, 5).map(inv => {
                    const displayStatus = isOverdue(inv) ? 'overdue' : inv.status;
                    const statusCfg = INV_STATUS[displayStatus] || INV_STATUS.pending;
                    return (
                      <div key={inv._id} onClick={() => navigate('/saas/suppliers/facturas')} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <div>
                          <span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{inv.invoiceNumber || '—'}</span>
                          <span className="text-xs text-gray-400 ml-2">{inv.date ? new Date(inv.date).toLocaleDateString('es-ES') : ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusCfg.cls}`}>
                            {statusCfg.label}
                          </span>
                          <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{(inv.total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Products */}
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <Package className="w-4 h-4" /> Productos asociados
                </h3>
                <button onClick={() => setActiveTab('products')} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Ver todos →</button>
              </div>
              {supplierProducts.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">Sin productos</p>
              ) : (
                <div className="space-y-2">
                  {supplierProducts.slice(0, 6).map(item => (
                    <div key={item._id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                      <span className="text-sm text-gray-900 dark:text-gray-100 truncate">{item.name}</span>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold ${item.stockQuantity <= item.minStock ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'}`}>
                          {item.stockQuantity} {item.unit}
                        </span>
                        <span className="text-xs text-gray-400">{(item.costPrice || 0).toFixed(2)}€</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4" /> Notas e información
              </h3>
              {supplier.notes ? (
                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{supplier.notes}</p>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">Sin notas</p>
              )}
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 gap-3 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Creado: {new Date(supplier.createdAt).toLocaleDateString('es-ES')}</div>
                <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Actualizado: {new Date(supplier.updatedAt).toLocaleDateString('es-ES')}</div>
              </div>

              {/* Quick links */}
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2">
                <button onClick={() => navigate('/saas/suppliers/ordenes-compra')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5" /> Pedidos de compra <ExternalLink className="w-3 h-3" />
                </button>
                <button onClick={() => navigate('/saas/suppliers/facturas')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5" /> Facturación <ExternalLink className="w-3 h-3" />
                </button>
                <button onClick={() => navigate('/saas/catalog')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5" /> Catálogo <ExternalLink className="w-3 h-3" />
                </button>
                <button onClick={() => navigate('/saas/finance')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" /> Finanzas <ExternalLink className="w-3 h-3" />
                </button>
                <button onClick={() => navigate('/saas/documents')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5" /> Documentos <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB: Orders */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Histórico de pedidos</h3>
              <button onClick={() => navigate('/saas/suppliers/ordenes-compra')} className="px-4 py-2 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl text-sm font-medium flex items-center gap-2 transition-colors">
                <ShoppingBag className="w-4 h-4" /> Ir a pedidos
              </button>
            </div>
            {/* Order summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-center">
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{supplierOrders.length}</div>
                <div className="text-xs text-gray-500">Total pedidos</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-center">
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.totalOrdered.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
                <div className="text-xs text-gray-500">Importe acumulado</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-center">
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.avgOrder.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
                <div className="text-xs text-gray-500">Pedido medio</div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-center">
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{supplierOrders.filter(o => o.status === 'received').length}</div>
                <div className="text-xs text-gray-500">Recibidos</div>
              </div>
            </div>
            {supplierOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <ClipboardList className="w-12 h-12 text-gray-300 mb-3" />
                <p className="font-semibold">Sin pedidos para este proveedor</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Nº Pedido</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Fecha</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Artículos</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Total</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Origen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {supplierOrders.map(order => (
                        <tr key={order._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer" onClick={() => navigate('/saas/suppliers/ordenes-compra')}>
                          <td className="px-4 py-3"><span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{order.orderNumber}</span></td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{order.createdAt ? new Date(order.createdAt).toLocaleDateString('es-ES') : '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${ORDER_STATUS_CLASS[order.status]}`}>
                              {ORDER_STATUS_LABEL[order.status]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{order.items.length} línea{order.items.length !== 1 ? 's' : ''}</td>
                          <td className="px-4 py-3 text-right font-bold text-sm text-gray-900 dark:text-gray-100">{(order.total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium ${order.source === 'auto' ? 'text-violet-600 dark:text-violet-400' : 'text-gray-500'}`}>
                              {order.source === 'auto' ? 'Automático' : 'Manual'}
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
        )}

        {/* TAB: Invoices */}
        {activeTab === 'invoices' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Histórico de facturas</h3>
              <button onClick={() => navigate('/saas/suppliers/facturas')} className="px-4 py-2 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl text-sm font-medium flex items-center gap-2 transition-colors">
                <Receipt className="w-4 h-4" /> Ir a facturación
              </button>
            </div>
            {/* Invoice summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-center">
                <div className="text-lg font-bold text-green-900 dark:text-green-200">{stats.paidAmount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
                <div className="text-xs text-green-600">Pagado</div>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-center">
                <div className="text-lg font-bold text-amber-900 dark:text-amber-200">{stats.pendingAmount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
                <div className="text-xs text-amber-600">Pendiente</div>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-center">
                <div className="text-lg font-bold text-red-900 dark:text-red-200">{overdueInvoices.length}</div>
                <div className="text-xs text-red-600">Vencidas</div>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-center">
                <div className="text-lg font-bold text-blue-900 dark:text-blue-200">{stats.totalInvoiced.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
                <div className="text-xs text-blue-600">Total facturado</div>
              </div>
            </div>
            {supplierInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <Receipt className="w-12 h-12 text-gray-300 mb-3" />
                <p className="font-semibold">Sin facturas para este proveedor</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Nº Factura</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Fecha</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Vencimiento</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Total</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Pedido vinculado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {supplierInvoices.map(inv => {
                        const displayStatus = isOverdue(inv) ? 'overdue' : inv.status;
                        const statusCfg = INV_STATUS[displayStatus] || INV_STATUS.pending;
                        return (
                          <tr key={inv._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer" onClick={() => navigate('/saas/suppliers/facturas')}>
                            <td className="px-4 py-3"><span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{inv.invoiceNumber || '—'}</span></td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{inv.date ? new Date(inv.date).toLocaleDateString('es-ES') : '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`text-sm ${displayStatus === 'overdue' ? 'text-red-600 font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>
                                {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('es-ES') : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${statusCfg.cls}`}>{statusCfg.label}</span>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-sm text-gray-900 dark:text-gray-100">{(inv.total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</td>
                            <td className="px-4 py-3">
                              {inv.linkedPurchaseOrderNumber ? (
                                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-lg">{inv.linkedPurchaseOrderNumber}</span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 dark:bg-gray-900 border-t-2 border-gray-200 dark:border-gray-700">
                        <td colSpan={4} className="px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-300">Total ({supplierInvoices.length} factura{supplierInvoices.length !== 1 ? 's' : ''})</td>
                        <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 dark:text-gray-100">{stats.totalInvoiced.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: Products */}
        {activeTab === 'products' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Productos del catálogo</h3>
              <button onClick={() => navigate('/saas/catalog')} className="px-4 py-2 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl text-sm font-medium flex items-center gap-2 transition-colors">
                <Package className="w-4 h-4" /> Ir al catálogo
              </button>
            </div>
            {supplierProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <Package className="w-12 h-12 text-gray-300 mb-3" />
                <p className="font-semibold">Sin productos asociados</p>
                <p className="text-sm mt-1">Asigna este proveedor a los artículos del catálogo</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Producto</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">SKU</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Stock</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Mín.</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Precio coste</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {supplierProducts.map(item => (
                        <tr key={item._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <td className="px-4 py-3 font-medium text-sm text-gray-900 dark:text-gray-100">{item.name}</td>
                          <td className="px-4 py-3 text-sm font-mono text-gray-500 dark:text-gray-400">{item.sku || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <span className={`text-sm font-bold ${item.stockQuantity <= item.minStock ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                              {item.stockQuantity} {item.unit}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-500 dark:text-gray-400">{item.minStock} {item.unit}</td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 dark:text-gray-100">{(item.costPrice || 0).toFixed(2)}€</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: Documents */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Documentos asociados</h3>
              <button onClick={() => navigate('/saas/documents')} className="px-4 py-2 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl text-sm font-medium flex items-center gap-2 transition-colors">
                <FolderOpen className="w-4 h-4" /> Ir a documentos
              </button>
            </div>
            {supplierDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <FolderOpen className="w-12 h-12 text-gray-300 mb-3" />
                <p className="font-semibold">Sin documentos asociados</p>
                <p className="text-sm mt-1">Sube contratos, condiciones comerciales o certificados desde el módulo de documentos</p>
                <button onClick={() => navigate('/saas/documents')} className="mt-4 px-4 py-2 bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white rounded-xl text-sm font-medium">Subir documento</button>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Nombre</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Tipo</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Fecha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {supplierDocs.map(doc => (
                        <tr key={doc._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer" onClick={() => navigate(`/saas/documents/${doc._id}`)}>
                          <td className="px-4 py-3 font-medium text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-400 shrink-0" /> {doc.name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{doc.docType || doc.docSubCategory || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
                              doc.status === 'signed' ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
                                : doc.status === 'sent' ? 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
                                : 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                            }`}>
                              {doc.status === 'signed' ? 'Firmado' : doc.status === 'sent' ? 'Enviado' : 'Pendiente'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{new Date(doc.createdAt).toLocaleDateString('es-ES')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
