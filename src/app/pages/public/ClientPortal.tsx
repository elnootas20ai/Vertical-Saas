import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Car, FileText, Receipt, User, Mail, Phone, MapPin, CheckCircle, Clock, AlertCircle, Shield, Calendar } from 'lucide-react';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const protocol = typeof window !== 'undefined' ? window.location.protocol.replace(':', '') : 'http';
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const port = env.VITE_API_PORT || '3001';
  return `${protocol}://${host}:${port}`;
}

function getCouchHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) h['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) h['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) h['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return h;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortalSale {
  id: string;
  vehicleName: string;
  vehiclePlate: string;
  stage: string;
  totalPrice: number;
  expectedDelivery: string;
  deliveredAt: string;
  createdAt: string;
  paymentMethod: string;
}

interface PortalInvoice {
  id: string;
  number: string;
  vehicleName: string;
  total: number;
  paid: number;
  status: string;
  date: string;
  dueDate: string;
}

interface PortalDocument {
  id: string;
  name: string;
  category: string;
  status: string;
  createdAt: string;
  signedAt: string;
}

interface PortalAppointment {
  id: string;
  title: string;
  date: string;
  status: string;
  notes: string;
  vehicleName: string;
  type: string;
}

interface PortalData {
  client: { id: string; name: string; email: string; phone: string; dni: string; address: string; city: string; vehiclesPurchased: string[] };
  dealer: { name: string; email: string; phone: string; logo: string | null };
  sales: PortalSale[];
  invoices: PortalInvoice[];
  documents: PortalDocument[];
  appointments: PortalAppointment[];
  generatedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  interested: 'Interesado', reserved: 'Reservado', documentation: 'Documentación',
  sold: 'Vendido', delivered: 'Entregado',
};
const STAGE_COLORS: Record<string, string> = {
  interested: 'bg-yellow-100 text-yellow-800',
  reserved: 'bg-orange-100 text-orange-800',
  documentation: 'bg-blue-100 text-blue-800',
  sold: 'bg-green-100 text-green-800',
  delivered: 'bg-emerald-100 text-emerald-800',
};
const INV_STATUS_LABELS: Record<string, string> = { paid: 'Pagada', pending: 'Pendiente', overdue: 'Vencida', draft: 'Borrador' };
const INV_STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-800', pending: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800', draft: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
};
const DOC_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador', pending_signature: 'Pendiente firma', signed: 'Firmado',
  rejected: 'Rechazado', expired: 'Expirado',
};

function formatCurrency(v: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
}

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ClientPortal() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'invoices' | 'documents' | 'appointments'>('overview');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${getApiBase()}/api/portal/data/${encodeURIComponent(token)}`, {
      headers: { 'Content-Type': 'application/json', ...getCouchHeaders() },
    })
      .then(r => r.json())
      .then(payload => {
        if (!payload.ok) throw new Error(payload.error || 'Error cargando portal');
        setData(payload.portal);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Cargando tu área de cliente...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-red-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Enlace no válido</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{error || 'Este enlace de portal no existe o ha expirado.'}</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview',      label: 'Resumen',    icon: User,      count: null },
    { id: 'sales',         label: 'Compras',    icon: Car,       count: data.sales.length },
    { id: 'invoices',      label: 'Facturas',   icon: Receipt,   count: data.invoices.length },
    { id: 'documents',     label: 'Documentos', icon: FileText,  count: data.documents.length },
    { id: 'appointments',  label: 'Citas',      icon: Calendar,  count: (data.appointments || []).length },
  ] as const;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {data.dealer.logo ? (
              <img src={data.dealer.logo} alt={data.dealer.name} className="h-8 w-auto object-contain" />
            ) : (
              <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
                <Car className="w-4 h-4 text-white" />
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{data.dealer.name}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Área de cliente</p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
            <Shield className="w-3.5 h-3.5 text-green-500" />
            <span>Acceso seguro</span>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Client card */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-3xl p-5 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs text-blue-200 font-semibold uppercase tracking-wider">Tu área privada</p>
              <h1 className="text-xl font-black">{data.client.name}</h1>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {data.client.email && (
              <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
                <Mail className="w-3.5 h-3.5 text-blue-200 flex-shrink-0" />
                <span className="text-xs text-blue-100 truncate">{data.client.email}</span>
              </div>
            )}
            {data.client.phone && (
              <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
                <Phone className="w-3.5 h-3.5 text-blue-200 flex-shrink-0" />
                <span className="text-xs text-blue-100">{data.client.phone}</span>
              </div>
            )}
            {data.client.city && (
              <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
                <MapPin className="w-3.5 h-3.5 text-blue-200 flex-shrink-0" />
                <span className="text-xs text-blue-100">{data.client.city}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 bg-gray-100 dark:bg-gray-700 rounded-2xl p-1.5">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-gray-100'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.count !== null && tab.count > 0 && (
                  <span className={`text-xs rounded-full w-4 h-4 flex items-center justify-center flex-shrink-0 ${
                    activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600 dark:text-gray-400'
                  }`}>{tab.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Compras',  value: data.sales.length,                icon: Car },
                { label: 'Facturas', value: data.invoices.length,             icon: Receipt },
                { label: 'Docs',     value: data.documents.length,            icon: FileText },
                { label: 'Citas',    value: (data.appointments || []).length, icon: Calendar },
              ].map(stat => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 text-center">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mx-auto mb-2">
                      <Icon className="w-5 h-5 text-blue-600" />
                    </div>
                    <p className="text-2xl font-black text-gray-900 dark:text-gray-100">{stat.value}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{stat.label}</p>
                  </div>
                );
              })}
            </div>

            {data.client.vehiclesPurchased.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <Car className="w-4 h-4 text-blue-600" /> Vehículos
                </h3>
                <div className="space-y-2">
                  {data.client.vehiclesPurchased.map((v, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Car className="w-4 h-4 text-blue-600" />
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dealer contact */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Contacto con {data.dealer.name}</h3>
              <div className="space-y-2">
                {data.dealer.email && (
                  <a href={`mailto:${data.dealer.email}`} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <Mail className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{data.dealer.email}</span>
                  </a>
                )}
                {data.dealer.phone && (
                  <a href={`tel:${data.dealer.phone}`} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <Phone className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{data.dealer.phone}</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sales */}
        {activeTab === 'sales' && (
          <div className="space-y-3">
            {data.sales.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800">
                <Car className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">Sin compras registradas</p>
              </div>
            ) : data.sales.map(sale => (
              <div key={sale.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-bold text-gray-900 dark:text-gray-100">{sale.vehicleName || 'Vehículo'}</p>
                    {sale.vehiclePlate && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sale.vehiclePlate}</p>}
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STAGE_COLORS[sale.stage] || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                    {STAGE_LABELS[sale.stage] || sale.stage}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {sale.totalPrice > 0 && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                      <p className="text-xs text-gray-400 dark:text-gray-500">Precio</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(sale.totalPrice)}</p>
                    </div>
                  )}
                  {(sale.expectedDelivery || sale.deliveredAt) && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                      <p className="text-xs text-gray-400 dark:text-gray-500">{sale.deliveredAt ? 'Entregado' : 'Entrega prevista'}</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatDate(sale.deliveredAt || sale.expectedDelivery)}</p>
                    </div>
                  )}
                </div>
                {sale.stage === 'delivered' && (
                  <div className="flex items-center gap-2 mt-3 text-xs text-green-700 bg-green-50 rounded-xl px-3 py-2">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Vehículo entregado
                  </div>
                )}
                {(sale.stage === 'reserved' || sale.stage === 'documentation') && (
                  <div className="flex items-center gap-2 mt-3 text-xs text-orange-700 bg-orange-50 rounded-xl px-3 py-2">
                    <Clock className="w-3.5 h-3.5" />
                    En proceso — te avisaremos cuando esté listo
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Invoices */}
        {activeTab === 'invoices' && (
          <div className="space-y-3">
            {data.invoices.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800">
                <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">Sin facturas registradas</p>
              </div>
            ) : data.invoices.map(inv => (
              <div key={inv.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-bold text-gray-900 dark:text-gray-100">Factura {inv.number || inv.id.slice(-6)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{inv.vehicleName} · {formatDate(inv.date)}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${INV_STATUS_COLORS[inv.status] || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                    {INV_STATUS_LABELS[inv.status] || inv.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                    <p className="text-xs text-gray-400 dark:text-gray-500">Total</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(inv.total)}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                    <p className="text-xs text-gray-400 dark:text-gray-500">Pagado</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(inv.paid)}</p>
                  </div>
                </div>
                {inv.total - inv.paid > 0 && inv.status !== 'paid' && (
                  <div className="mt-3 bg-yellow-50 rounded-xl px-3 py-2 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-yellow-600" />
                    <span className="text-xs text-yellow-700">Pendiente: {formatCurrency(inv.total - inv.paid)}</span>
                    {inv.dueDate && <span className="text-xs text-yellow-600 ml-auto">Vence: {formatDate(inv.dueDate)}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Documents */}
        {activeTab === 'documents' && (
          <div className="space-y-3">
            {data.documents.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800">
                <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">Sin documentos disponibles</p>
              </div>
            ) : data.documents.map(doc => (
              <div key={doc.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{doc.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{doc.category} · {formatDate(doc.createdAt)}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
                  doc.status === 'signed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}>
                  {DOC_STATUS_LABELS[doc.status] || doc.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Appointments */}
        {activeTab === 'appointments' && (
          <div className="space-y-3">
            {(data.appointments || []).length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800">
                <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">Sin citas registradas</p>
              </div>
            ) : (data.appointments || []).map(appt => (
              <div key={appt.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-bold text-gray-900 dark:text-gray-100">{appt.title}</p>
                    {appt.vehicleName && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{appt.vehicleName}</p>}
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
                    appt.status === 'completed' ? 'bg-green-100 text-green-800' :
                    appt.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                    appt.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {appt.status === 'completed' ? 'Completada' :
                     appt.status === 'cancelled' ? 'Cancelada' :
                     appt.status === 'confirmed' ? 'Confirmada' : 'Pendiente'}
                  </span>
                </div>
                {appt.date && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                    <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    {formatDate(appt.date)}
                  </div>
                )}
                {appt.notes && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">{appt.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-4">
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <Shield className="w-3.5 h-3.5 text-green-500" />
            Área segura de cliente · {data.dealer.name}
          </div>
        </div>
      </div>
    </div>
  );
}
