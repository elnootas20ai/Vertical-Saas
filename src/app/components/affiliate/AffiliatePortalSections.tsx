import React from 'react';
import {
  Users, TrendingUp, Clock, CheckCircle2, Plus, Building2,
  BadgeDollarSign, UserCheck, Share2, Copy, Check, QrCode, Mail, Phone,
  MessageSquare, UserPlus, MailOpen, CreditCard, CircleDollarSign,
  LayoutDashboard, Rocket, BookOpen, HeadphonesIcon, FileText, ExternalLink,
} from 'lucide-react';
import type { ReferredAccount } from '../../lib/affiliatesApi';

export interface PortalAffiliate {
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
  contractAcceptedAt?: string | null;
  contractVersion?: string | null;
  needsContractAcceptance?: boolean;
  needsKycSubmission?: boolean;
  needsKycApproval?: boolean;
  kycApproved?: boolean;
  kyc?: {
    status?: string | null;
    submittedAt?: string;
    reviewedAt?: string;
    rejectionReason?: string;
  };
}

export interface PortalClient {
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

export interface PortalCommission {
  _id: string;
  description: string;
  amount: number;
  status: 'pending' | 'paid' | 'cancelled';
  dueDate?: string;
  paidAt?: string;
  createdAt: string;
}

export interface PortalStats {
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

function ClientCard({ client: c, commissionRate }: { client: PortalClient; commissionRate: number }) {
  const stages = [
    { label: 'Registrado', active: true, icon: UserPlus, color: 'bg-blue-500' },
    { label: 'Email enviado', active: !!c.emailSent, icon: Mail, color: 'bg-violet-500' },
    { label: 'Email abierto', active: !!c.emailOpened, icon: MailOpen, color: 'bg-indigo-500' },
    { label: 'Tarjeta añadida', active: !!c.cardAdded, icon: CreditCard, color: 'bg-amber-500' },
    { label: 'Pagando', active: !!c.isPaying, icon: CircleDollarSign, color: 'bg-emerald-500' },
  ];
  const progress = stages.filter((s) => s.active).length;
  const estComm = (c.monthlyAmount ?? 0) > 0
    ? ((c.monthlyAmount ?? 0) * (c.commissionPercent ?? commissionRate)) / 100
    : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-4 sm:px-5 py-4">
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
            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
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
}

export function AffiliateDashboardSection({
  affiliate,
  stats,
  clients,
  commissions,
  onGoClients,
  onGoReferral,
  allowRegisterClients = true,
}: {
  affiliate: PortalAffiliate;
  stats: PortalStats;
  clients: PortalClient[];
  commissions: PortalCommission[];
  onGoClients: () => void;
  onGoReferral: () => void;
  allowRegisterClients?: boolean;
}) {
  const recentClients = clients.slice(0, 3);
  const recentCommissions = commissions.slice(0, 3);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Hola, {affiliate.name.split(' ')[0]}</h1>
        <p className="text-sm text-slate-500 mt-1">Resumen de tu actividad como afiliado Vertial.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Clientes registrados', value: stats.totalClients, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Clientes firmados', value: stats.signedClients, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Pendiente de cobro', value: fmtCurrency(stats.pendingAmount), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Total cobrado', value: fmtCurrency(stats.totalEarned), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-xl font-black text-slate-900">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
            <Rocket className="w-4 h-4 text-blue-600" /> Acciones rápidas
          </h2>
          <div className="grid gap-2">
            {allowRegisterClients ? (
              <button type="button" onClick={onGoClients}
                className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-colors text-left">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center"><Users className="w-4 h-4 text-blue-700" /></div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Registrar cliente</p>
                  <p className="text-xs text-slate-500">Añade un lead y haz seguimiento del pipeline</p>
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 text-left">
                <div className="w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center"><Users className="w-4 h-4 text-slate-500" /></div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">Altas de clientes Vertial</p>
                  <p className="text-xs text-slate-500">En iOS solo consulta; no se dan de alta cuentas nuevas.</p>
                </div>
              </div>
            )}
            <button type="button" onClick={onGoReferral}
              className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-amber-300 hover:bg-amber-50/50 transition-colors text-left">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center"><Share2 className="w-4 h-4 text-amber-700" /></div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Compartir código</p>
                <p className="text-xs text-slate-500">Enlace, QR y código de referido</p>
              </div>
            </button>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl p-5 text-white">
          <p className="text-xs uppercase tracking-widest text-blue-300/60 font-semibold mb-2">Tu comisión</p>
          <p className="text-3xl font-black">{affiliate.commissionRate}%</p>
          <p className="text-sm text-blue-200/70 mt-2">Por cada cliente activo que refieras y mantenga su suscripción.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Últimos clientes</span>
            <button type="button" onClick={onGoClients} className="text-xs text-blue-600 font-semibold hover:underline">Ver todos</button>
          </div>
          {recentClients.length === 0 ? (
            <p className="p-5 text-sm text-slate-400">Aún no has registrado clientes.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentClients.map((c) => (
                <div key={c._id} className="px-5 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                    {c.contactName[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{c.contactName}</p>
                    <p className="text-xs text-slate-400">{fmt(c.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-700">Últimas comisiones</span>
          </div>
          {recentCommissions.length === 0 ? (
            <p className="p-5 text-sm text-slate-400">Sin comisiones registradas todavía.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentCommissions.map((c) => (
                <div key={c._id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-700 truncate">{c.description}</p>
                  <p className="text-sm font-bold text-blue-700 shrink-0">{fmtCurrency(c.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AffiliateClientsSection({
  clients,
  commissionRate,
  onAddClient,
  allowRegisterClients = true,
}: {
  clients: PortalClient[];
  commissionRate: number;
  onAddClient: () => void;
  allowRegisterClients?: boolean;
}) {
  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Mis clientes</h1>
          <p className="text-sm text-slate-500 mt-1">
            {allowRegisterClients
              ? 'Registra leads y sigue el avance hasta que paguen.'
              : 'Consulta tus leads (en iOS no se dan de alta cuentas nuevas).'}
          </p>
        </div>
        {allowRegisterClients ? (
          <button type="button" onClick={onAddClient}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Nuevo cliente
          </button>
        ) : null}
      </div>

      {clients.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-500 mb-1">No tienes clientes registrados</p>
          <p className="text-sm text-slate-400 mb-4">
            {allowRegisterClients
              ? 'Empieza registrando clientes desde aquí para hacer seguimiento.'
              : 'Las altas de clientes Vertial no están disponibles en la app iOS.'}
          </p>
          {allowRegisterClients ? (
            <button type="button" onClick={onAddClient}
              className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Registrar primer cliente
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {clients.map((c) => (
            <ClientCard key={c._id} client={c} commissionRate={commissionRate} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AffiliateReferredSection({
  referredAccounts,
  referralCode,
}: {
  referredAccounts: ReferredAccount[];
  referralCode: string;
}) {
  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Altas referidas</h1>
        <p className="text-sm text-slate-500 mt-1">Cuentas que se registraron directamente con tu código.</p>
      </div>

      {referredAccounts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <UserCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-500 mb-1">No hay altas referidas aún</p>
          <p className="text-sm text-slate-400">
            Comparte tu código <span className="font-mono font-bold text-amber-600">{referralCode}</span> para que tus clientes se registren solos.
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
                  <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
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
  );
}

export function AffiliateCommissionsSection({
  commissions,
  stats,
}: {
  commissions: PortalCommission[];
  stats: PortalStats;
}) {
  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Mis comisiones</h1>
        <p className="text-sm text-slate-500 mt-1">Consulta lo generado, pendiente y cobrado.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
  );
}

export function AffiliateReferralSection({
  affiliate,
  allowRegisterClients = true,
}: {
  affiliate: PortalAffiliate;
  allowRegisterClients?: boolean;
}) {
  const [copiedReferral, setCopiedReferral] = React.useState(false);
  const [showQr, setShowQr] = React.useState(false);

  const referralUrl =
    allowRegisterClients && affiliate.referralCode
      ? `${window.location.origin}/auth/register?ref=${encodeURIComponent(affiliate.referralCode)}`
      : '';
  const qrImageUrl = referralUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(referralUrl)}`
    : '';

  const copyReferralCode = () => {
    navigator.clipboard.writeText(affiliate.referralCode || '');
    setCopiedReferral(true);
    window.setTimeout(() => setCopiedReferral(false), 2000);
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Referir clientes</h1>
        <p className="text-sm text-slate-500 mt-1">
          {allowRegisterClients
            ? 'Comparte tu código para que se registren y queden vinculados a ti.'
            : 'En iOS puedes consultar tu código; el enlace de registro de empresas no está disponible en la app.'}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
            <Share2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900">Código de referido</p>
            <p className="text-sm text-slate-500 mt-1">
              {allowRegisterClients
                ? 'Dáselo a tus contactos o comparte el enlace de registro.'
                : 'Comparte el código fuera de la app iOS si tus contactos se dan de alta en la web.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={copyReferralCode}
            className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm font-mono font-bold text-amber-800 hover:bg-amber-100 transition-colors">
            {copiedReferral ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            {affiliate.referralCode || '—'}
          </button>
          {referralUrl ? (
            <button type="button" onClick={() => setShowQr((v) => !v)}
              className="flex items-center gap-2 px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
              <QrCode className="w-4 h-4" />
              {showQr ? 'Ocultar QR' : 'Ver QR'}
            </button>
          ) : null}
        </div>

        {referralUrl && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Enlace para tus clientes (no abras este enlace tú)
            </p>
            <p className="text-sm text-slate-700 break-all font-mono">{referralUrl}</p>
            <button type="button" onClick={() => navigator.clipboard.writeText(referralUrl)}
              className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1">
              <Copy className="w-3 h-3" /> Copiar enlace
            </button>
          </div>
        )}

        {showQr && qrImageUrl && (
          <div className="flex flex-col items-center gap-3 p-6 bg-slate-50 rounded-2xl border border-slate-200">
            <img src={qrImageUrl} alt="QR código de referido" className="w-48 h-48 bg-white p-2 rounded-xl" />
            <p className="text-xs text-slate-500 text-center">Escanea para abrir el registro con tu código</p>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
        <p className="font-semibold text-blue-900 text-sm mb-2 flex items-center gap-2">
          <BookOpen className="w-4 h-4" /> Consejo
        </p>
        <p className="text-sm text-blue-800/80 leading-relaxed">
          {allowRegisterClients
            ? 'Puedes registrar clientes manualmente en «Mis clientes» o dejar que se registren solos con tu enlace. Las altas automáticas aparecen en «Altas referidas».'
            : 'En iOS solo puedes ver tu código y tu panel. Las altas de empresas Vertial no se hacen desde esta app.'}
        </p>
      </div>
    </div>
  );
}

export function AffiliateAccountSection({ affiliate }: { affiliate: PortalAffiliate }) {
  const rows = [
    { label: 'Nombre', value: affiliate.name, icon: Users },
    { label: 'Email', value: affiliate.email, icon: Mail },
    { label: 'Teléfono', value: affiliate.phone, icon: Phone },
    { label: 'WhatsApp', value: affiliate.whatsapp || affiliate.phone, icon: MessageSquare },
    { label: 'Empresa', value: affiliate.company || '—', icon: Building2 },
    { label: 'Código afiliado', value: affiliate.affiliateCode, icon: FileText },
    { label: 'Estado', value: affiliate.status === 'accepted' ? 'Activo' : affiliate.status, icon: CheckCircle2 },
    { label: 'Alta desde', value: fmt(affiliate.createdAt), icon: Clock },
  ];

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Mi cuenta</h1>
        <p className="text-sm text-slate-500 mt-1">Datos de tu perfil de afiliado.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
        {rows.map(({ label, value, icon: Icon }) => (
          <div key={label} className="flex items-center gap-4 px-5 py-4">
            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-slate-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-400 font-medium">{label}</p>
              <p className="text-sm font-semibold text-slate-800 truncate">{value || '—'}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-violet-50 border border-violet-100 p-5">
        <p className="text-sm font-semibold text-violet-900">Comisión acordada: {affiliate.commissionRate}%</p>
        <p className="text-xs text-violet-700/70 mt-1">Si necesitas cambiar tus datos, contacta con el equipo de afiliados.</p>
      </div>

      <div className={`rounded-2xl border p-5 ${affiliate.kycApproved ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
        <p className="text-sm font-semibold text-slate-900">Verificación de identidad (KYC)</p>
        <p className="text-xs text-slate-600 mt-1">
          {affiliate.kycApproved
            ? `Identidad verificada${affiliate.kyc?.reviewedAt ? ` el ${fmt(affiliate.kyc.reviewedAt)}` : ''}.`
            : affiliate.needsKycApproval
              ? 'Documentación enviada. Estamos revisando tu DNI y datos de cobro.'
              : 'Pendiente de completar en el acceso al panel.'}
        </p>
      </div>

      <div className={`rounded-2xl border p-5 ${affiliate.contractAcceptedAt ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
        <p className="text-sm font-semibold text-slate-900">Contrato de afiliado</p>
        {affiliate.contractAcceptedAt ? (
          <p className="text-xs text-emerald-800 mt-1">
            Firmado el {fmt(affiliate.contractAcceptedAt)}
            {affiliate.contractVersion ? ` · versión ${affiliate.contractVersion}` : ''}
          </p>
        ) : (
          <p className="text-xs text-amber-800 mt-1">Pendiente de firma. Se te pedirá al entrar al panel.</p>
        )}
      </div>
    </div>
  );
}

export function AffiliateHelpSection() {
  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Ayuda y soporte</h1>
        <p className="text-sm text-slate-500 mt-1">Recursos para vender mejor y resolver dudas.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {[
          {
            icon: HeadphonesIcon,
            title: 'Soporte afiliados',
            desc: 'Escríbenos por email si necesitas ayuda para cerrar una venta.',
            action: 'Contactar soporte',
            href: 'mailto:hola@vertialapp.com?subject=Soporte%20afiliado',
          },
          {
            icon: BookOpen,
            title: 'Materiales comerciales',
            desc: 'Plan de acción, argumentario y PDFs de venta en el menú «Materiales».',
            action: 'Abrir Materiales',
          },
          {
            icon: LayoutDashboard,
            title: 'Cómo funciona el panel',
            desc: 'Registra clientes, comparte tu código y consulta comisiones desde el menú izquierdo.',
            action: 'Usa el menú lateral',
          },
          {
            icon: ExternalLink,
            title: 'Programa de afiliados',
            desc: 'Condiciones, comisiones y preguntas frecuentes del programa.',
            action: 'Ir a la web',
            href: '/affiliados',
          },
        ].map(({ icon: Icon, title, desc, action, href }) => (
          <div key={title} className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
              <Icon className="w-5 h-5 text-blue-600" />
            </div>
            <p className="font-bold text-slate-900">{title}</p>
            <p className="text-sm text-slate-500 mt-2 flex-1 leading-relaxed">{desc}</p>
            {href ? (
              <a href={href} className="mt-4 text-sm font-semibold text-blue-600 hover:underline inline-flex items-center gap-1">
                {action} <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : (
              <span className="mt-4 text-sm font-semibold text-slate-400">{action}</span>
            )}
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex items-start gap-4">
        <MessageSquare className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-blue-900 text-sm mb-1">¿Necesitas ayuda ahora?</p>
          <p className="text-sm text-blue-700/70 leading-relaxed">
            Contacta con nuestro equipo de afiliados. Estamos aquí para ayudarte a cerrar más ventas.
          </p>
          <a href="mailto:hola@vertialapp.com" className="inline-block mt-3 text-sm font-semibold text-blue-700 hover:underline">
            hola@vertialapp.com
          </a>
        </div>
      </div>
    </div>
  );
}
