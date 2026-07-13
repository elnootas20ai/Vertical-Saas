import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useModalClose } from '../../hooks/useModalClose';
import {
  ArrowLeft, Users, Handshake, Check, Plus, X, User, Mail, Phone, Building2,
  Loader2, AlertCircle, Tag, LayoutDashboard, BadgeDollarSign,
  UserCheck, Share2, UserCircle2, LifeBuoy, FolderOpen,
} from 'lucide-react';
import {
  listAffiliateVerticals,
  portalDashboard,
  portalLogin,
  portalLoginWithAccount,
  portalRegisterClient,
  portalReferredAccounts,
  portalAcceptContract,
  portalSubmitKyc,
  type ReferredAccount,
} from '../../lib/affiliatesApi';
import { AFFILIATE_AGREEMENT_VERSION } from '../../content/legal/affiliateAgreement';
import { AffiliateContractGate } from '../../components/affiliate/AffiliateContractGate';
import { AffiliateKycGate, AffiliateKycPendingGate } from '../../components/affiliate/AffiliateKycGate';
import { AffiliateResourcesSection } from '../../components/affiliate/AffiliateResourcesSection';
import {
  AffiliateBackofficeLayout,
  type AffiliateBackofficeSection,
  type AffiliateNavItem,
} from '../../components/affiliate/AffiliateBackofficeLayout';
import {
  AffiliateDashboardSection,
  AffiliateClientsSection,
  AffiliateReferredSection,
  AffiliateCommissionsSection,
  AffiliateReferralSection,
  AffiliateAccountSection,
  AffiliateHelpSection,
  type PortalAffiliate,
  type PortalClient,
  type PortalCommission,
  type PortalStats,
} from '../../components/affiliate/AffiliatePortalSections';

// ── Login Screen ───────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (code: string) => void }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'account' | 'code'>('account');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const data = await portalLoginWithAccount(email.trim(), password);
      if (data.ok && data.affiliate?.affiliateCode) {
        onLogin(data.affiliate.affiliateCode);
      } else {
        setError(data.error || 'No se pudo iniciar sesión');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
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
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 flex flex-col items-stretch px-4 py-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:items-center sm:justify-center sm:px-6">
      <div className="w-full max-w-md my-auto">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-500/20">
            <Handshake className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white mb-2">Panel de Afiliado</h1>
          <p className="text-blue-200/70 min-h-[2.75rem] flex items-center justify-center px-2 text-sm leading-relaxed">
            {mode === 'account'
              ? 'Entra con tu email y contraseña de Vertial'
              : 'Acceso alternativo con código de afiliado'}
          </p>
        </div>

        <div className="flex rounded-xl bg-white/10 p-1 mb-4">
          <button
            type="button"
            onClick={() => { setMode('account'); setError(''); }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors duration-200 ${mode === 'account' ? 'bg-white text-slate-900 shadow-sm' : 'text-blue-100 hover:text-white'}`}
          >
            Email y contraseña
          </button>
          <button
            type="button"
            onClick={() => { setMode('code'); setError(''); }}
            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors duration-200 ${mode === 'code' ? 'bg-white text-slate-900 shadow-sm' : 'text-blue-100 hover:text-white'}`}
          >
            Código
          </button>
        </div>

        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6 min-h-[23.5rem] flex flex-col">
          {mode === 'account' ? (
            <form onSubmit={handleAccountSubmit} className="flex flex-col flex-1 space-y-5">
              <div className="min-h-[11.5rem] space-y-5">
                <div>
                  <label className="block text-sm font-medium text-blue-200/80 mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    autoComplete="email"
                    className="w-full px-4 py-3.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-200/80 mb-2">Contraseña</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full px-4 py-3.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/40 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="min-h-[3rem] flex items-start">
                {error ? (
                  <div className="w-full flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                  </div>
                ) : null}
              </div>

              <button type="submit" disabled={loading || !email.trim() || !password}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-violet-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar al panel'}
              </button>
              <div className="text-center min-h-[1.25rem]">
                <button type="button" onClick={() => navigate('/affiliados')}
                  className="text-sm text-blue-300/60 hover:text-blue-200 transition-colors">
                  ¿No tienes acceso? Solicita ser afiliado
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCodeSubmit} className="flex flex-col flex-1 space-y-5">
              <div className="min-h-[11.5rem] flex flex-col justify-center">
                <div>
                  <label className="block text-sm font-medium text-blue-200/80 mb-2">Código de afiliado</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Ej: AFF-A7K2N3"
                    className="w-full px-4 py-3.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-blue-300/40 font-mono text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-2 text-xs text-blue-200/45 text-center leading-relaxed">
                    Lo recibes por email cuando te aceptamos como afiliado
                  </p>
                </div>
              </div>

              <div className="min-h-[3rem] flex items-start">
                {error ? (
                  <div className="w-full flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                  </div>
                ) : null}
              </div>

              <button type="submit" disabled={loading || !code.trim()}
                className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold rounded-xl hover:from-blue-700 hover:to-violet-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Acceder con código'}
              </button>
              <div className="text-center min-h-[1.25rem]">
                <button type="button" onClick={() => navigate('/affiliados')}
                  className="text-sm text-blue-300/60 hover:text-blue-200 transition-colors">
                  ¿No tienes código? Solicita ser afiliado
                </button>
              </div>
            </form>
          )}
        </div>

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
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
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
  const [section, setSection] = useState<AffiliateBackofficeSection>('dashboard');
  const [showAddClient, setShowAddClient] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [verticalOptions, setVerticalOptions] = useState<string[]>([]);
  const [referredAccounts, setReferredAccounts] = useState<ReferredAccount[]>([]);
  const [acceptingContract, setAcceptingContract] = useState(false);
  const [contractError, setContractError] = useState('');
  const [submittingKyc, setSubmittingKyc] = useState(false);
  const [kycError, setKycError] = useState('');

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
        setSection('clients');
      }
    } catch {
      // silently fail
    } finally {
      setAddingClient(false);
    }
  };

  const handleAcceptContract = async () => {
    if (!affiliateCode) return;
    setAcceptingContract(true);
    setContractError('');
    try {
      const result = await portalAcceptContract(affiliateCode, AFFILIATE_AGREEMENT_VERSION);
      if (result.ok && result.affiliate) {
        setAffiliate(result.affiliate as PortalAffiliate);
        await loadData(affiliateCode);
      } else {
        setContractError(result.error || 'No se pudo registrar la firma');
      }
    } catch {
      setContractError('Error de conexión');
    } finally {
      setAcceptingContract(false);
    }
  };

  const handleSubmitKyc = async (payload: Record<string, unknown>) => {
    if (!affiliateCode) return;
    setSubmittingKyc(true);
    setKycError('');
    try {
      const result = await portalSubmitKyc(affiliateCode, payload);
      if (result.ok && result.affiliate) {
        setAffiliate(result.affiliate as PortalAffiliate);
        await loadData(affiliateCode);
      } else {
        setKycError(result.error || 'No se pudo enviar la verificación');
      }
    } catch {
      setKycError('Error de conexión');
    } finally {
      setSubmittingKyc(false);
    }
  };

  const navItems = useMemo((): AffiliateNavItem[] => [
    { id: 'dashboard', label: 'Inicio', description: 'Resumen y acciones rápidas', icon: LayoutDashboard },
    { id: 'clients', label: 'Mis clientes', description: 'Leads y seguimiento comercial', icon: Users, badge: clients.length },
    { id: 'referred', label: 'Altas referidas', description: 'Registros con tu código', icon: UserCheck, badge: referredAccounts.length },
    { id: 'commissions', label: 'Comisiones', description: 'Cobros pendientes y pagados', icon: BadgeDollarSign, badge: commissions.length },
    { id: 'referral', label: 'Referir', description: 'Código, enlace y QR', icon: Share2 },
    { id: 'resources', label: 'Materiales', description: 'Plan de acción y venta', icon: FolderOpen },
    { id: 'account', label: 'Mi cuenta', description: 'Datos de tu perfil', icon: UserCircle2 },
    { id: 'help', label: 'Ayuda', description: 'Soporte y recursos', icon: LifeBuoy },
  ], [clients.length, referredAccounts.length, commissions.length]);

  if (!urlCode && !affiliate) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
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

  if (affiliate.needsKycSubmission) {
    return (
      <AffiliateKycGate
        affiliateName={affiliate.name}
        rejectionReason={affiliate.kyc?.rejectionReason}
        loading={submittingKyc}
        error={kycError}
        onSubmit={handleSubmitKyc}
      />
    );
  }

  if (affiliate.needsKycApproval) {
    return (
      <AffiliateKycPendingGate
        affiliateName={affiliate.name}
        submittedAt={affiliate.kyc?.submittedAt}
      />
    );
  }

  if (affiliate.needsContractAcceptance) {
    return (
      <AffiliateContractGate
        affiliateName={affiliate.name}
        loading={acceptingContract}
        error={contractError}
        onAccept={handleAcceptContract}
      />
    );
  }

  return (
    <>
      <AffiliateBackofficeLayout
        affiliateName={affiliate.name}
        affiliateCode={affiliate.affiliateCode}
        commissionRate={affiliate.commissionRate}
        activeSection={section}
        onSectionChange={setSection}
        navItems={navItems}
      >
        {section === 'dashboard' && (
          <AffiliateDashboardSection
            affiliate={affiliate}
            stats={stats}
            clients={clients}
            commissions={commissions}
            onGoClients={() => setSection('clients')}
            onGoReferral={() => setSection('referral')}
          />
        )}
        {section === 'clients' && (
          <AffiliateClientsSection
            clients={clients}
            commissionRate={affiliate.commissionRate}
            onAddClient={() => setShowAddClient(true)}
          />
        )}
        {section === 'referred' && (
          <AffiliateReferredSection
            referredAccounts={referredAccounts}
            referralCode={affiliate.referralCode}
          />
        )}
        {section === 'commissions' && (
          <AffiliateCommissionsSection commissions={commissions} stats={stats} />
        )}
        {section === 'referral' && (
          <AffiliateReferralSection affiliate={affiliate} />
        )}
        {section === 'resources' && (
          <AffiliateResourcesSection />
        )}
        {section === 'account' && (
          <AffiliateAccountSection affiliate={affiliate} />
        )}
        {section === 'help' && (
          <AffiliateHelpSection />
        )}
      </AffiliateBackofficeLayout>

      {showAddClient && (
        <AddClientModal
          onSave={handleAddClient}
          onClose={() => setShowAddClient(false)}
          loading={addingClient}
          verticalOptions={verticalOptions}
        />
      )}
    </>
  );
}
