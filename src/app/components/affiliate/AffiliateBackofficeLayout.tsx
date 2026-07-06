import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  BadgeDollarSign,
  Share2,
  UserCircle2,
  LifeBuoy,
  FolderOpen,
  Handshake,
  Copy,
  Check,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';

export type AffiliateBackofficeSection =
  | 'dashboard'
  | 'clients'
  | 'referred'
  | 'commissions'
  | 'referral'
  | 'resources'
  | 'account'
  | 'help';

export interface AffiliateNavItem {
  id: AffiliateBackofficeSection;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
  badge?: number;
}

interface AffiliateBackofficeLayoutProps {
  affiliateName: string;
  affiliateCode: string;
  commissionRate: number;
  activeSection: AffiliateBackofficeSection;
  onSectionChange: (section: AffiliateBackofficeSection) => void;
  navItems: AffiliateNavItem[];
  children: ReactNode;
}

export function AffiliateBackofficeLayout({
  affiliateName,
  affiliateCode,
  commissionRate,
  activeSection,
  onSectionChange,
  navItems,
  children,
}: AffiliateBackofficeLayoutProps) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeItem = navItems.find((item) => item.id === activeSection);

  const copyCode = () => {
    navigator.clipboard.writeText(affiliateCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const selectSection = (section: AffiliateBackofficeSection) => {
    onSectionChange(section);
    setMobileOpen(false);
  };

  const sidebar = (
    <aside className="flex flex-col h-full bg-gradient-to-b from-slate-900 via-blue-950 to-indigo-950 text-white border-r border-white/10">
      <div className="px-4 pt-5 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center shrink-0">
            <Handshake className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight truncate">Backoffice Afiliado</p>
            <p className="text-[11px] text-blue-300/60">Vertial</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 border-b border-white/10">
        <p className="text-xs text-blue-200/50 uppercase tracking-wider font-semibold mb-2">Tu acceso</p>
        <p className="font-semibold text-sm truncate">{affiliateName}</p>
        <button
          type="button"
          onClick={copyCode}
          className="mt-2 w-full flex items-center justify-between gap-2 px-3 py-2 bg-white/10 border border-white/15 rounded-xl text-xs font-mono hover:bg-white/15 transition-colors"
        >
          <span className="truncate">{affiliateCode}</span>
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
        </button>
        <p className="text-[11px] text-blue-200/50 mt-2">Comisión: {commissionRate}% por cliente activo</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-widest text-blue-300/40">Menú</p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectSection(item.id)}
              className={`w-full flex items-start gap-3 px-3 py-3 rounded-xl text-left transition-all ${
                active
                  ? 'bg-white/15 border border-white/20 shadow-lg shadow-blue-900/20'
                  : 'hover:bg-white/8 border border-transparent'
              }`}
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                active ? 'bg-blue-500/30 text-blue-100' : 'bg-white/8 text-blue-200/70'
              }`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold truncate ${active ? 'text-white' : 'text-blue-100/90'}`}>
                    {item.label}
                  </span>
                  {item.badge != null && item.badge > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/30 text-blue-100">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-blue-200/45 leading-snug mt-0.5 line-clamp-2">{item.description}</p>
              </div>
              {active && <ChevronRight className="w-4 h-4 text-blue-300/50 shrink-0 mt-1" />}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10 space-y-1">
        <button
          type="button"
          onClick={() => navigate('/affiliados')}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-blue-200/70 hover:bg-white/8 hover:text-white transition-colors"
        >
          <LifeBuoy className="w-4 h-4" />
          Programa de afiliados
        </button>
        <button
          type="button"
          onClick={() => navigate('/panel-afiliado')}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-red-300/80 hover:bg-red-500/10 hover:text-red-200 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <div className="hidden lg:block w-[280px] shrink-0 fixed inset-y-0 left-0 z-30">
        {sidebar}
      </div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Cerrar menú"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-[min(300px,88vw)] h-full shadow-2xl">
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex-1 lg:ml-[280px] min-w-0 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-slate-100 text-slate-600"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">{activeItem?.label || 'Panel'}</p>
              <p className="text-xs text-slate-500 truncate hidden sm:block">{activeItem?.description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={copyCode}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-mono text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
            {affiliateCode}
          </button>
        </header>

        <main className="flex-1 px-4 sm:px-6 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
