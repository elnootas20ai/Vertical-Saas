import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useModalClose } from '../../hooks/useModalClose';
import {
  ArrowLeft, Users, DollarSign, TrendingUp, Clock, CheckCircle2, Copy, Check,
  Plus, X, User, Mail, Phone, Building2, FileText, Loader2, AlertCircle,
  Handshake, BadgeDollarSign, ExternalLink, MessageSquare, Tag,
  CreditCard, MailOpen, UserPlus, CircleDollarSign, QrCode, Share2, UserCheck,
} from 'lucide-react';
import {
  listAffiliateVerticals,
  portalDashboard,
  portalLogin,
  portalRegisterClient,
  portalReferredAccounts,
  type ReferredAccount,
} from '../../lib/affiliatesApi';

type Tab = 'clients' | 'commissions' | 'referred';

interface PortalAffiliate {
  id: string;
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  company: string;
  affiliateCode: string;
  referralCode: string;
  commissionRate: number;
  status: string;
  createdAt: string;
}

interface PortalClient {
  _id: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactType: string;
  company: string;
  verticals?: string[];
  signedSaas: boolean;
  emailSent?: boolean;
  emailOpened?: boolean;
  cardAdded?: boolean;
  isPaying?: boolean;
  monthlyAmount?: number;
  commissionPercent?: number;
  createdAt: string;
}

interface PortalCommission {
  _id: string;
  description: string;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  dueDate?: string;
  paidAt?: string;
  createdAt: string;
}

interface PortalStats {
  totalClients: number;
  signedClients: number;
  totalEarned: number;
  pendingAmount: number;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtCurrency(v: number) {
  return `${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

const COMM_STATUS: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  pending:   { label: 'Pendiente', bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  paid:      { label: 'Pagada',    bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelada', bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500' },
};

// ── Login Screen ───────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (code: string) => void }) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await portalLogin(code.trim());
      if (data.ok) {
        onLogin(data.affiliate.affiliateCode);
      } else {
        setError(data.error || 'Código no válido');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-500/20">
            <Handshake className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">Panel de Afiliado</h1>
          <p className="text-blue-200/70">Introduce tu código de afiliado para acceder</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-blue-200/80 mb-2">Código de afiliado</label>
            <input
              type="text" value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Ej: AFF-A7K2N3"
              className="w-full px-4 py-3.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/40 font-mono text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          <button type="submit" disabled={loading || !code.trim()}
            className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-violet-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Acceder al panel'}
          </button>

          <div className="text-center">
            <button type="button" onClick={() => navigate('/affiliados')}
              className="text-sm text-blue-300/60 hover:text-blue-200 transition-colors">
              ¿No tienes código? Solicita ser afiliado
            </button>
          </div>
        </form>

        <button onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm text-blue-300/40 hover:text-blue-200 transition-colors mx-auto mt-6">
          <ArrowLeft className="w-4 h-4" /> Volver al inicio
        </button>
      </div>
    </div>
  );
}

// ── Add Client Modal ───────────────────────────────────────────────────────────

function AddClientModal({ onSave, onClose, loading, verticalOptions }: {
  onSave: (data: { contactName: string; contactEmail: string; contactPhone: string; company: string; notes: string; verticals: string[] }) => void;
  onClose: () => void;
  loading: boolean;
  verticalOptions: string[];
}) {
  const [form, setForm] = useState({ contactName: '', contactEmail: '', contactPhone: '', company: '', notes: '', verticals: [] as string[] });
  useModalClose(true, onClose);

  const toggleVertical = (v: string) => {
    setForm((prev) => ({
      ...prev,
      verticals: prev.verticals.includes(v) ? prev.verticals.filter((x) => x !== v) : [...prev.verticals, v],
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600" /> Registrar nuevo cliente
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          {[
            { key: 'contactName', label: 'Nombre completo *', placeholder: 'Nombre del contacto', icon: User },
            { key: 'contactEmail', label: 'Email', placeholder: 'correo@email.com', icon: Mail },
            { key: 'contactPhone', label: 'Teléfono', placeholder: '+34 600 000 000', icon: Phone },
            { key: 'company', label: 'Empresa', placeholder: 'Nombre de la empresa', icon: Building2 },
          ].map(({ key, label, placeholder, icon: Icon }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
              <div className="relative">
                <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input value={form[key as keyof typeof form] as string}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          ))}
          {verticalOptions.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-violet-500" /> Categorías / Sectores
              </label>
              <div className="grid grid-cols-2 gap-2">
                {verticalOptions.map((v) => {
                  const selected = form.verticals.includes(v);
                  return (
                    <button key={v} type="button" onClick={() => toggleVertical(v)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left ${
                        selected
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50/50'
                      }`}>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        selected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                      }`}>
                        {selected && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      {v}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
            <textarea rows={3} value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Información adicional..."
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors">Cancelar</button>
          <button onClick={() => onSave(form)} disabled={!form.contactName.trim() || loading}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Registrar cliente
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Portal ────────────────────────────────────────────────────────────────

export function AffiliatePortal() {
  const { code: urlCode } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [affiliateCode, setAffiliateCode] = useState(urlCode || '');
  const [affiliate, setAffiliate] = useState<PortalAffiliate | null>(null);
  const [clients, setClients] = useState<PortalClient[]>([]);
  const [commissions, setCommissions] = useState<PortalCommission[]>([]);
  const [stats, setStats] = useState<PortalStats>({ totalClients: 0, signedClients: 0, totalEarned: 0, pendingAmount: 0 });
  const [loading, setLoading] = useState(!!urlCode);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('clients');
  const [showAddClient, setShowAddClient] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedReferral, setCopiedReferral] = useState(false);
  const [verticalOptions, setVerticalOptions] = useState<string[]>([]);
  const [referredAccounts, setReferredAccounts] = useState<ReferredAccount[]>([]);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    listAffiliateVerticals()
      .then((verticals) => setVerticalOptions(verticals))
      .catch(() => {});
  }, []);

  const loadData = useCallback(async (code: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await portalDashboard(code);
      if (data.ok) {
        setAffiliate(data.affiliate);
        setClients(data.clients || []);
        setCommissions(data.commissions || []);
        setStats(data.stats || { totalClients: 0, signedClients: 0, totalEarned: 0, pendingAmount: 0 });
        portalReferredAccounts(code).then(setReferredAccounts).catch(() => {});
      } else {
        setError(data.error || 'Error al cargar datos');
        setAffiliate(null);
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (urlCode) loadData(urlCode);
  }, [urlCode, loadData]);

  const handleLogin = (code: string) => {
    setAffiliateCode(code);
    navigate(`/panel-afiliado/${code}`, { replace: true });
    loadData(code);
  };

  const handleAddClient = async (data: { contactName: string; contactEmail: string; contactPhone: string; company: string; notes: string; verticals: string[] }) => {
    if (!affiliateCode) return;
    setAddingClient(true);
    try {
      const result = await portalRegisterClient(affiliateCode, data);
      if (result.ok) {
        setShowAddClient(false);
        loadData(affiliateCode);
      }
    } catch {
      // silently fail
    } finally {
      setAddingClient(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(affiliate?.affiliateCode || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyReferralCode = () => {
    navigator.clipboard.writeText(affiliate?.referralCode || '');
    setCopiedReferral(true);
    setTimeout(() => setCopiedReferral(false), 2000);
  };

  const referralUrl = affiliate?.referralCode
    ? `${window.location.origin}/auth/register?ref=${encodeURIComponent(affiliate.referralCode)}`
    : '';

  const qrImageUrl = referralUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(referralUrl)}`
    : '';

  if (!urlCode && !affiliate) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (error || !affiliate) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 flex items-center justify-center px-6">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-white font-semibold mb-2">{error || 'Afiliado no encontrado'}</p>
          <button onClick={() => navigate('/panel-afiliado')}
            className="text-blue-300 hover:text-blue-200 text-sm mt-4 flex items-center gap-2 mx-auto">
            <ArrowLeft className="w-4 h-4" /> Volver al login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center">
                <Handshake className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm leading-tight">Panel de Afiliado</p>
                <p className="text-xs text-blue-300/60">UDAR EDGE</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={copyCode}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs font-mono hover:bg-white/20 transition-colors">
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {affiliate.affiliateCode}
              </button>
              <button onClick={() => navigate('/')}
                className="text-sm text-blue-300/60 hover:text-white transition-colors">
                Salir
              </button>
            </div>
          </div>

          {/* Affiliate info + stats */}
          <div className="pb-6 pt-2">
            <h1 className="text-xl font-bold mb-1">Hola, {affiliate.name.split(' ')[0]}</h1>
            <p className="text-sm text-blue-200/60 mb-6">Comisión: {affiliate.commissionRate}% por cliente activo</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Clientes registrados', value: stats.totalClients, icon: Users, color: 'text-blue-400' },
                { label: 'Clientes firmados', value: stats.signedClients, icon: CheckCircle2, color: 'text-emerald-400' },
                { label: 'Pendiente de cobro', value: fmtCurrency(stats.pendingAmount), icon: Clock, color: 'text-amber-400' },
                { label: 'Total cobrado', value: fmtCurrency(stats.totalEarned), icon: TrendingUp, color: 'text-emerald-400' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-3.5">
                  <Icon className={`w-5 h-5 ${color} mb-2`} />
                  <p className="text-lg font-bold text-white">{value}</p>
                  <p className="text-xs text-blue-200/50">{label}</p>
                </div>
              ))}
            </div>

            {affiliate.referralCode && (
              <div className="mt-4 bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                      <Share2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Tu código de referido</p>
                      <p className="text-xs text-blue-200/60">Compártelo con tus clientes para que se registren</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={copyReferralCode}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-400/30 rounded-xl text-sm font-mono font-bold text-amber-300 hover:bg-amber-500/30 transition-colors">
                      {copiedReferral ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {affiliate.referralCode}
                    </button>
                    <button onClick={() => setShowQr(!showQr)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-sm text-white hover:bg-white/20 transition-colors">
                      <QrCode className="w-4 h-4" />
                      QR
                    </button>
                  </div>
                </div>
                {showQr && qrImageUrl && (
                  <div className="mt-4 flex flex-col items-center gap-3 p-4 bg-white rounded-xl">
                    <img src={qrImageUrl} alt="QR código de referido" className="w-48 h-48" />
                    <p className="text-xs text-slate-500 text-center break-all max-w-xs">{referralUrl}</p>
                    <button onClick={() => {
                      navigator.clipboard.writeText(referralUrl);
                    }} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                      <Copy className="w-3 h-3" /> Copiar enlace de registro
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Tabs + action */}
        <div className="flex items-center justify-between">
          <div className="flex bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
            {([
              { id: 'clients' as Tab, label: 'Mis clientes', icon: Users, count: clients.length },
              { id: 'referred' as Tab, label: 'Altas referidas', icon: UserCheck, count: referredAccounts.length },
              { id: 'commissions' as Tab, label: 'Mis comisiones', icon: BadgeDollarSign, count: commissions.length },
            ]).map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  tab === t.id ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:text-slate-700'
                }`}>
                <t.icon className="w-4 h-4" />
                {t.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
          {tab === 'clients' && (
            <button onClick={() => setShowAddClient(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
              <Plus className="w-4 h-4" /> Nuevo cliente
            </button>
          )}
        </div>

        {/* Clients tab */}
        {tab === 'clients' && (
          <div className="space-y-3">
            {clients.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="font-medium text-slate-500 mb-1">No tienes clientes registrados</p>
                <p className="text-sm text-slate-400 mb-4">Empieza registrando clientes desde aquí para hacer seguimiento.</p>
                <button onClick={() => setShowAddClient(true)}
                  className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors inline-flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Registrar primer cliente
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {clients.map((c) => {
                  const stages = [
                    { label: 'Registrado', active: true, icon: UserPlus, color: 'bg-blue-500' },
                    { label: 'Email enviado', active: !!c.emailSent, icon: Mail, color: 'bg-violet-500' },
                    { label: 'Email abierto', active: !!c.emailOpened, icon: MailOpen, color: 'bg-indigo-500' },
                    { label: 'Tarjeta añadida', active: !!c.cardAdded, icon: CreditCard, color: 'bg-amber-500' },
                    { label: 'Pagando', active: !!c.isPaying, icon: CircleDollarSign, color: 'bg-emerald-500' },
                  ];
                  const progress = stages.filter((s) => s.active).length;
                  const estComm = (c.monthlyAmount ?? 0) > 0
                    ? ((c.monthlyAmount ?? 0) * (c.commissionPercent ?? affiliate.commissionRate)) / 100
                    : 0;
                  return (
                    <div key={c._id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                      <div className="px-4 sm:px-5 py-4">
                        {/* Contact info row */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {c.contactName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-slate-800 text-sm">{c.contactName}</p>
                              {c.isPaying && (
                                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                  <CircleDollarSign className="w-2.5 h-2.5" /> Pagando
                                </span>
                              )}
                              {c.signedSaas && !c.isPaying && (
                                <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                  <CheckCircle2 className="w-2.5 h-2.5" /> SaaS
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                              {c.contactEmail && <span>{c.contactEmail}</span>}
                              {c.company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{c.company}</span>}
                            </div>
                          </div>
                          {estComm > 0 && (
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold text-emerald-700">{fmtCurrency(estComm)}</p>
                              <p className="text-[10px] text-slate-400">/mes</p>
                            </div>
                          )}
                        </div>

                        {/* Pipeline steps */}
                        <div className="flex items-center gap-1">
                          {stages.map((stage, i) => {
                            const Icon = stage.icon;
                            return (
                              <React.Fragment key={stage.label}>
                                {i > 0 && (
                                  <div className={`h-0.5 flex-1 rounded-full ${stage.active ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                                )}
                                <div
                                  title={stage.label}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                                    stage.active ? `${stage.color} text-white` : 'bg-slate-100 text-slate-400'
                                  }`}
                                >
                                  <Icon className="w-3 h-3" />
                                </div>
                              </React.Fragment>
                            );
                          })}
                          <span className="text-[10px] font-semibold text-slate-400 ml-2">{progress}/5</span>
                          <span className="text-[10px] text-slate-400 ml-auto">{fmt(c.createdAt)}</span>
                        </div>

                        {/* Categories */}
                        {c.verticals && c.verticals.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {c.verticals.map((v) => (
                              <span key={v} className="text-[10px] font-medium bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-full">{v}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Referred accounts tab */}
        {tab === 'referred' && (
          <div className="space-y-3">
            {referredAccounts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <UserCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="font-medium text-slate-500 mb-1">No hay altas referidas aún</p>
                <p className="text-sm text-slate-400 mb-4">
                  Comparte tu código de referido <span className="font-mono font-bold text-amber-600">{affiliate.referralCode}</span> para que tus clientes se registren.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-slate-700">{referredAccounts.length} alta{referredAccounts.length !== 1 ? 's' : ''} con tu código</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {referredAccounts.map((acc) => (
                    <div key={acc.id} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {acc.fullName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{acc.fullName}</p>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          {acc.email && <span>{acc.email}</span>}
                          {acc.companyName && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{acc.companyName}</span>}
                        </div>
                      </div>
                      <span className="text-xs text-slate-400 flex-shrink-0">{fmt(acc.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Commissions tab */}
        {tab === 'commissions' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total generado', value: fmtCurrency(stats.totalEarned + stats.pendingAmount), bg: 'bg-blue-50', text: 'text-blue-700' },
                { label: 'Pendiente de cobro', value: fmtCurrency(stats.pendingAmount), bg: 'bg-amber-50', text: 'text-amber-700' },
                { label: 'Ya cobrado', value: fmtCurrency(stats.totalEarned), bg: 'bg-emerald-50', text: 'text-emerald-700' },
              ].map((s) => (
                <div key={s.label} className={`rounded-2xl ${s.bg} border border-slate-200/50 p-4 text-center`}>
                  <p className={`text-xl font-bold ${s.text}`}>{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {commissions.length === 0 ? (
                <div className="p-12 text-center">
                  <BadgeDollarSign className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="font-medium text-slate-500 mb-1">Sin comisiones aún</p>
                  <p className="text-sm text-slate-400">Cuando tus clientes firmen el SaaS, verás tus comisiones aquí.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                        <th className="px-4 py-3 text-left">Descripción</th>
                        <th className="px-4 py-3 text-right">Importe</th>
                        <th className="px-4 py-3 text-center">Estado</th>
                        <th className="px-4 py-3 text-left">Fecha pago</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {commissions.map((c) => {
                        const cfg = COMM_STATUS[c.status] || COMM_STATUS.pending;
                        return (
                          <tr key={c._id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-slate-700">{c.description}</td>
                            <td className="px-4 py-3 text-right font-bold text-blue-700">{fmtCurrency(c.amount)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                              {c.paidAt ? fmt(c.paidAt) : c.dueDate ? `Vence: ${fmt(c.dueDate)}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex items-start gap-4">
          <MessageSquare className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-blue-900 text-sm mb-1">¿Necesitas ayuda?</p>
            <p className="text-sm text-blue-700/70">
              Contacta con nuestro equipo de afiliados por WhatsApp o email. Estamos aquí para ayudarte a cerrar más ventas.
            </p>
          </div>
        </div>
      </div>

      {/* Modal */}
      {showAddClient && (
        <AddClientModal
          onSave={handleAddClient}
          onClose={() => setShowAddClient(false)}
          loading={addingClient}
          verticalOptions={verticalOptions}
        />
      )}
    </div>
  );
}
