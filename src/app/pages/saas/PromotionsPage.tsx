import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Edit2,
  Eye,
  Gift,
  Megaphone,
  MoreHorizontal,
  Package,
  Pause,
  Percent,
  Play,
  Plus,
  Search,
  Sparkles,
  Tag,
  Target,
  Trash2,
  TrendingUp,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { Pagination } from '../../components/saas/Pagination';
import { CrmNav } from '../../components/saas/CrmNav';
import { usePagination } from '../../hooks/usePagination';
import { v4 as uuidv4 } from 'uuid';
import {
  readStoredPromotions,
  writeStoredPromotions,
  type StoredPromotion,
  setClientAppliedPromo,
  type AppliedPromo,
  type PromoApplyMode,
  type PromoWeekday,
  type PromoDiscountTarget,
  type PromoExtrasMode,
  resolvePromoDiscountTarget,
} from '../../lib/promoCodes';
import { listPromotionsRequest, syncPromotionsRequest } from '../../lib/promotionsApi';

// ── Types ─────────────────────────────────────────────────────────────────────

type PromoStatus = 'active' | 'scheduled' | 'paused' | 'expired' | 'draft';
type PromoType = 'percentage' | 'fixed' | '2x1' | 'gift' | 'code' | 'fixed_unit_price';
type PageView = 'list' | 'create' | 'detail';

interface Promotion {
  id: string;
  name: string;
  description: string;
  type: PromoType;
  status: PromoStatus;
  discountValue: number;
  code?: string;
  startDate: string;
  endDate: string;
  maxUses: number | null;
  currentUses: number;
  targetAudience: 'all' | 'new' | 'returning' | 'vip' | 'custom';
  clientIds?: string[];
  createdAt: string;
  revenue: number;
  ordersUsed: number;
  weekdays?: PromoWeekday[];
  productNameIncludes?: string[];
  productIds?: string[];
  fixedUnitPrice?: number;
  applyMode?: PromoApplyMode;
  salesPointIds?: string[];
  discountTarget?: PromoDiscountTarget;
  extrasMode?: PromoExtrasMode;
}

const WEEKDAY_OPTIONS: { value: PromoWeekday; label: string }[] = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
];

function toStoredPromotion(p: Promotion): StoredPromotion {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    type: p.type,
    status: p.status,
    discountValue: p.discountValue,
    code: p.code,
    startDate: p.startDate,
    endDate: p.endDate,
    maxUses: p.maxUses,
    currentUses: p.currentUses,
    createdAt: p.createdAt,
    weekdays: p.weekdays,
    productMatch: {
      productIds: p.productIds || [],
      nameIncludes: p.productNameIncludes || [],
    },
    fixedUnitPrice: p.fixedUnitPrice,
    applyMode: p.applyMode,
    salesPointIds: Array.isArray(p.salesPointIds) ? p.salesPointIds : [],
    discountTarget: resolvePromoDiscountTarget(p),
    extrasMode: p.extrasMode === 'include_in_fixed' ? 'include_in_fixed' : 'on_top',
  };
}

function fromStoredPromotion(p: StoredPromotion): Promotion {
  return {
    id: p.id,
    name: p.name || 'Promoción',
    description: p.description || '',
    type: (p.type || 'percentage') as PromoType,
    status: (p.status || 'draft') as PromoStatus,
    discountValue: Number(p.discountValue || 0),
    code: p.code || undefined,
    startDate: p.startDate || defaultStartDate(),
    endDate: p.endDate || '',
    maxUses: p.maxUses ?? null,
    currentUses: Number(p.currentUses || 0),
    targetAudience: 'all',
    createdAt: p.createdAt || new Date().toISOString(),
    revenue: 0,
    ordersUsed: 0,
    weekdays: Array.isArray(p.weekdays) ? (p.weekdays as PromoWeekday[]) : [],
    productNameIncludes: p.productMatch?.nameIncludes || [],
    productIds: p.productMatch?.productIds || [],
    fixedUnitPrice: p.fixedUnitPrice != null ? Number(p.fixedUnitPrice) : undefined,
    applyMode: p.applyMode || (p.type === 'fixed_unit_price' ? 'auto' : undefined),
    salesPointIds: Array.isArray(p.salesPointIds) ? p.salesPointIds : [],
    discountTarget: resolvePromoDiscountTarget(p),
    extrasMode: p.extrasMode === 'include_in_fixed' ? 'include_in_fixed' : 'on_top',
  };
}

const STATUS_CONFIG: Record<PromoStatus, { label: string; bg: string; text: string; dot: string }> = {
  active:    { label: 'Activa',      bg: 'bg-emerald-50 dark:bg-emerald-900/20',  text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  scheduled: { label: 'Programada',  bg: 'bg-blue-50 dark:bg-blue-900/20',        text: 'text-blue-700 dark:text-blue-300',       dot: 'bg-blue-500' },
  paused:    { label: 'Pausada',     bg: 'bg-amber-50 dark:bg-amber-900/20',      text: 'text-amber-700 dark:text-amber-300',     dot: 'bg-amber-500' },
  expired:   { label: 'Finalizada',  bg: 'bg-slate-100 dark:bg-slate-800',        text: 'text-slate-600 dark:text-slate-400',     dot: 'bg-slate-400' },
  draft:     { label: 'Borrador',    bg: 'bg-slate-50 dark:bg-slate-800/50',      text: 'text-slate-500 dark:text-slate-400',     dot: 'bg-slate-300' },
};

const TYPE_CONFIG: Record<PromoType, { label: string; icon: React.ElementType; color: string }> = {
  percentage: { label: 'Descuento %',       icon: Percent,  color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  fixed:      { label: 'Descuento fijo',    icon: Tag,      color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
  '2x1':     { label: '2×1 / Pack',        icon: Package,  color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
  gift:       { label: 'Regalo',            icon: Gift,     color: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400' },
  code:       { label: 'Código promocional', icon: Sparkles, color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  fixed_unit_price: {
    label: 'Precio fijo producto',
    icon: Tag,
    color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  },
};

const AUDIENCE_LABELS: Record<string, string> = {
  all: 'Todos los clientes',
  new: 'Nuevos clientes',
  returning: 'Clientes recurrentes',
  vip: 'Clientes VIP',
  custom: 'Selección personalizada',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(v: number) {
  return `${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatDate(iso: string) {
  if (!String(iso || '').trim()) return 'Permanente';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return 'Permanente';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateInput(iso: string) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function daysUntil(iso: string) {
  if (!String(iso || '').trim()) return Number.POSITIVE_INFINITY;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function isPermanentPromo(p: { endDate?: string | null }) {
  return !String(p.endDate || '').trim();
}

function defaultStartDate() {
  return new Date().toISOString().slice(0, 10);
}

function defaultEndDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

function generatePromoCode(): string {
  return 'PROMO' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ── Mock Data ─────────────────────────────────────────────────────────────────

function buildMockPromotions(): Promotion[] {
  return [];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PromoStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function TypeBadge({ type }: { type: PromoType }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.percentage;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function KPICard({ label, value, sub, icon: Icon, gradient }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  gradient: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-xl border p-5 ${gradient}`}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-white/80 dark:bg-gray-800/80 flex items-center justify-center flex-shrink-0 shadow-sm">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium opacity-70 mb-0.5">{label}</p>
          <p className="text-xl font-bold">{value}</p>
          {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4">
        <Megaphone className="w-8 h-8 text-amber-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Sin promociones</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 max-w-sm">
        Crea tu primera promoción para impulsar las ventas y fidelizar a tus clientes.
      </p>
      <button
        onClick={onNew}
        className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:bg-black dark:hover:bg-white transition-colors"
      >
        <Plus className="w-4 h-4" />
        Crear promoción
      </button>
    </div>
  );
}

// ── Detail Analytics Section ──────────────────────────────────────────────────

function PromoAnalytics({ promo }: { promo: Promotion }) {
  const conversionRate = promo.maxUses
    ? Math.round((promo.currentUses / promo.maxUses) * 100)
    : null;

  const weeklyData = [
    { week: 'Sem 1', orders: 18, revenue: 2140 },
    { week: 'Sem 2', orders: 24, revenue: 3280 },
    { week: 'Sem 3', orders: 28, revenue: 3960 },
    { week: 'Sem 4', orders: 17, revenue: 2070 },
  ];

  const maxRevenue = Math.max(...weeklyData.map(w => w.revenue));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Ingresos</p>
          </div>
          <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100">{formatCurrency(promo.revenue)}</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">Usos</p>
          </div>
          <p className="text-lg font-bold text-blue-900 dark:text-blue-100">{promo.currentUses}</p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <p className="text-xs text-purple-700 dark:text-purple-300 font-medium">Conversión</p>
          </div>
          <p className="text-lg font-bold text-purple-900 dark:text-purple-100">
            {conversionRate !== null ? `${conversionRate}%` : '∞'}
          </p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">Ticket medio</p>
          </div>
          <p className="text-lg font-bold text-amber-900 dark:text-amber-100">
            {promo.ordersUsed > 0 ? formatCurrency(promo.revenue / promo.ordersUsed) : '—'}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-5">
        <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-slate-500" />
          Evolución semanal
        </h4>
        <div className="space-y-3">
          {weeklyData.map((w, i) => {
            const pct = maxRevenue > 0 ? (w.revenue / maxRevenue) * 100 : 0;
            return (
              <div key={i}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">{w.week}</span>
                  <div className="text-right">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(w.revenue)}</span>
                    <span className="text-slate-400 dark:text-slate-500 text-xs ml-2">({w.orders} usos)</span>
                  </div>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {promo.status === 'active' && (
        <div className="bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-blue-900/20 dark:via-purple-900/20 dark:to-pink-900/20 rounded-xl p-5 border border-purple-100 dark:border-purple-800">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm flex-shrink-0">
              <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2">
                Análisis inteligente
                <span className="px-2 py-0.5 bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-300 text-xs font-semibold rounded">IA</span>
              </h4>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                Esta promoción presenta un rendimiento sólido con una tasa de uso del{' '}
                {conversionRate !== null ? `${conversionRate}%` : 'alta'}. El ticket medio
                {promo.ordersUsed > 0
                  ? ` de ${formatCurrency(promo.revenue / promo.ordersUsed)} está por encima de la media.`
                  : ' aún no tiene datos suficientes.'}{' '}
                Recomendamos mantenerla activa y considerar ampliar la audiencia objetivo para maximizar el impacto.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export type PromotionsPageProps = {
  embedDeliveryOps?: boolean;
};

export function PromotionsPage({ embedDeliveryOps }: PromotionsPageProps = {}) {
  const { user } = useAuth();
  const { clients } = useApp();

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [promotionsLoaded, setPromotionsLoaded] = useState(false);
  const [activeView, setActiveView] = useState<PageView>('list');
  const [selectedPromo, setSelectedPromo] = useState<Promotion | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PromoStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<PromoType | 'all'>('all');
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'analytics'>('info');
  const [assignClientId, setAssignClientId] = useState<string>('');

  useEffect(() => {
    const userId = user?.user_id;
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const remote = await listPromotionsRequest(userId);
        if (cancelled) return;
        if (remote.length > 0) {
          setPromotions(remote.map(fromStoredPromotion));
          writeStoredPromotions(remote);
        } else {
          const stored = readStoredPromotions();
          if (stored.length > 0) {
            setPromotions(stored.map(fromStoredPromotion));
            await syncPromotionsRequest(userId, stored).catch(() => {});
          } else {
            setPromotions(buildMockPromotions());
          }
        }
      } catch {
        if (!cancelled) {
          const stored = readStoredPromotions();
          setPromotions(stored.length > 0 ? stored.map(fromStoredPromotion) : buildMockPromotions());
        }
      } finally {
        if (!cancelled) setPromotionsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.user_id]);

  useEffect(() => {
    if (!promotionsLoaded || !user?.user_id) return;
    const stored = promotions.map(toStoredPromotion);
    writeStoredPromotions(stored);
    const timer = window.setTimeout(() => {
      void syncPromotionsRequest(user.user_id!, stored).catch(() => {});
    }, 800);
    return () => window.clearTimeout(timer);
  }, [promotions, promotionsLoaded, user?.user_id]);

  const selectedClientLabel = useMemo(() => {
    const id = String(assignClientId || '').trim();
    if (!id) return '';
    const c = (clients || []).find((x) => x.id === id);
    return c ? c.name : '';
  }, [assignClientId, clients]);

  const canAssignToClient = useMemo(() => {
    return Boolean(assignClientId && selectedPromo?.status === 'active' && selectedPromo?.code);
  }, [assignClientId, selectedPromo?.status, selectedPromo?.code]);

  const buildAppliedFromPromo = useCallback((p: Promotion): AppliedPromo | null => {
    if (!p.code) return null;
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      code: p.code,
      discountValue: Number(p.discountValue || 0),
    };
  }, []);

  // ── Form ───────────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'percentage' as PromoType,
    discountValue: 10,
    code: '',
    startDate: defaultStartDate(),
    endDate: defaultEndDate(),
    permanent: false,
    maxUses: '' as string,
    targetAudience: 'all' as Promotion['targetAudience'],
    weekdays: [] as PromoWeekday[],
    productNamesText: '',
    fixedUnitPrice: 11,
    applyAuto: true,
    discountTarget: 'order' as PromoDiscountTarget,
    extrasMode: 'on_top' as PromoExtrasMode,
  });

  function resetForm() {
    setForm({
      name: '', description: '', type: 'percentage', discountValue: 10, code: '',
      startDate: defaultStartDate(), endDate: defaultEndDate(), permanent: false,
      maxUses: '', targetAudience: 'all',
      weekdays: [], productNamesText: '', fixedUnitPrice: 11, applyAuto: true,
      discountTarget: 'order', extrasMode: 'on_top',
    });
    setEditingId(null);
  }

  function parseProductNames(text: string): string[] {
    return String(text || '')
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return promotions.filter((p) => {
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchType = typeFilter === 'all' || p.type === typeFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch = !q || [p.name, p.description, p.code || ''].join(' ').toLowerCase().includes(q);
      return matchStatus && matchType && matchSearch;
    });
  }, [promotions, statusFilter, typeFilter, searchQuery]);

  const { paginated, pagination } = usePagination(filtered, 10);

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const active = promotions.filter((p) => p.status === 'active');
    const totalRevenue = promotions.reduce((s, p) => s + p.revenue, 0);
    const totalUses = promotions.reduce((s, p) => s + p.currentUses, 0);
    const avgDiscount = promotions.length > 0
      ? Math.round(promotions.filter((p) => p.discountValue > 0).reduce((s, p) => s + p.discountValue, 0) / Math.max(1, promotions.filter((p) => p.discountValue > 0).length))
      : 0;
    return { activeCount: active.length, totalRevenue, totalUses, avgDiscount, total: promotions.length };
  }, [promotions]);

  // ── CRUD ───────────────────────────────────────────────────────────────────
  const handleCreate = useCallback((asDraft: boolean) => {
    if (!form.name.trim()) {
      showToast('El nombre de la promoción es obligatorio', 'error');
      return;
    }
    if (!form.startDate) {
      showToast('La fecha de inicio es obligatoria', 'error');
      return;
    }
    if (!form.permanent && !form.endDate) {
      showToast('Indica fecha fin, o marca «Permanente»', 'error');
      return;
    }
    if (form.permanent && !String(form.code || '').trim()) {
      showToast('Un código permanente necesita un código (ej. VERANO10)', 'error');
      return;
    }
    const productNames = parseProductNames(form.productNamesText);
    if (form.type === 'fixed_unit_price') {
      if (!(form.fixedUnitPrice > 0)) {
        showToast('Indica el precio fijo del producto', 'error');
        return;
      }
      if (productNames.length === 0) {
        showToast('Indica al menos un nombre de producto (ej: Margarita, Prosciutto)', 'error');
        return;
      }
    }

    setSaving(true);
    setTimeout(() => {
      const fixedPrice = form.type === 'fixed_unit_price' ? Number(form.fixedUnitPrice) : undefined;
      const newPromo: Promotion = {
        id: uuidv4(),
        name: form.name,
        description: form.description,
        type: form.type,
        status: asDraft ? 'draft' : (new Date(form.startDate) > new Date() ? 'scheduled' : 'active'),
        discountValue: form.type === 'fixed_unit_price' ? Number(form.fixedUnitPrice) : form.discountValue,
        code: form.code || undefined,
        startDate: new Date(form.startDate).toISOString(),
        endDate: form.permanent ? '' : new Date(form.endDate + 'T23:59:59').toISOString(),
        maxUses: form.maxUses ? parseInt(form.maxUses) : null,
        currentUses: 0,
        targetAudience: form.targetAudience,
        createdAt: new Date().toISOString(),
        revenue: 0,
        ordersUsed: 0,
        weekdays: form.weekdays.length > 0 ? [...form.weekdays] : undefined,
        productNameIncludes: productNames,
        fixedUnitPrice: fixedPrice,
        applyMode: form.type === 'fixed_unit_price'
          ? (form.applyAuto ? 'auto' : 'manual_code')
          : undefined,
        discountTarget: form.type === 'fixed_unit_price' ? 'product' : (form.discountTarget || 'order'),
        extrasMode: form.type === 'fixed_unit_price' ? form.extrasMode : undefined,
      };
      setPromotions((prev) => [newPromo, ...prev]);
      showToast(asDraft ? 'Promoción guardada como borrador' : 'Promoción creada correctamente');
      resetForm();
      setActiveView('list');
      setSaving(false);
    }, 400);
  }, [form]);

  const handleUpdate = useCallback(() => {
    if (!editingId) return;
    if (!form.name.trim()) {
      showToast('El nombre es obligatorio', 'error');
      return;
    }
    if (!form.startDate) {
      showToast('La fecha de inicio es obligatoria', 'error');
      return;
    }
    if (!form.permanent && !form.endDate) {
      showToast('Indica fecha fin, o marca «Permanente»', 'error');
      return;
    }
    if (form.permanent && !String(form.code || '').trim()) {
      showToast('Un código permanente necesita un código (ej. VERANO10)', 'error');
      return;
    }
    const productNames = parseProductNames(form.productNamesText);
    if (form.type === 'fixed_unit_price') {
      if (!(form.fixedUnitPrice > 0)) {
        showToast('Indica el precio fijo del producto', 'error');
        return;
      }
      if (productNames.length === 0) {
        showToast('Indica al menos un nombre de producto', 'error');
        return;
      }
    }
    setSaving(true);
    setTimeout(() => {
      setPromotions((prev) =>
        prev.map((p) =>
          p.id === editingId
            ? {
                ...p,
                name: form.name,
                description: form.description,
                type: form.type,
                discountValue: form.type === 'fixed_unit_price' ? Number(form.fixedUnitPrice) : form.discountValue,
                code: form.code || undefined,
                startDate: new Date(form.startDate).toISOString(),
                endDate: form.permanent ? '' : new Date(form.endDate + 'T23:59:59').toISOString(),
                maxUses: form.maxUses ? parseInt(form.maxUses) : null,
                targetAudience: form.targetAudience,
                weekdays: form.weekdays.length > 0 ? [...form.weekdays] : undefined,
                productNameIncludes: productNames,
                fixedUnitPrice: form.type === 'fixed_unit_price' ? Number(form.fixedUnitPrice) : undefined,
                applyMode: form.type === 'fixed_unit_price'
                  ? (form.applyAuto ? 'auto' : 'manual_code')
                  : undefined,
                discountTarget: form.type === 'fixed_unit_price' ? 'product' : (form.discountTarget || 'order'),
                extrasMode: form.type === 'fixed_unit_price' ? form.extrasMode : undefined,
              }
            : p,
        ),
      );
      const updated = promotions.find((p) => p.id === editingId);
      if (updated) setSelectedPromo({ ...updated, name: form.name, description: form.description });
      showToast('Promoción actualizada');
      resetForm();
      setActiveView('list');
      setSaving(false);
    }, 400);
  }, [editingId, form, promotions]);

  function handleEdit(promo: Promotion) {
    const permanent = isPermanentPromo(promo);
    setForm({
      name: promo.name,
      description: promo.description,
      type: promo.type,
      discountValue: promo.discountValue,
      code: promo.code || '',
      startDate: formatDateInput(promo.startDate) || defaultStartDate(),
      endDate: permanent ? defaultEndDate() : (formatDateInput(promo.endDate) || defaultEndDate()),
      permanent,
      maxUses: promo.maxUses ? String(promo.maxUses) : '',
      targetAudience: promo.targetAudience,
      weekdays: promo.weekdays || [],
      productNamesText: (promo.productNameIncludes || []).join(', '),
      fixedUnitPrice: promo.fixedUnitPrice ?? promo.discountValue ?? 11,
      applyAuto: (promo.applyMode || 'auto') !== 'manual_code',
      discountTarget: resolvePromoDiscountTarget(promo),
      extrasMode: promo.extrasMode === 'include_in_fixed' ? 'include_in_fixed' : 'on_top',
    });
    setEditingId(promo.id);
    setActiveView('create');
  }

  function handleDelete(promo: Promotion) {
    if (!confirm(`¿Eliminar la promoción "${promo.name}"?`)) return;
    setPromotions((prev) => prev.filter((p) => p.id !== promo.id));
    if (selectedPromo?.id === promo.id) {
      setSelectedPromo(null);
      setActiveView('list');
    }
    showToast('Promoción eliminada');
  }

  function handleToggleStatus(promo: Promotion) {
    const nextStatus: PromoStatus = promo.status === 'active' ? 'paused' : 'active';
    setPromotions((prev) =>
      prev.map((p) => (p.id === promo.id ? { ...p, status: nextStatus } : p)),
    );
    if (selectedPromo?.id === promo.id) setSelectedPromo({ ...promo, status: nextStatus });
    showToast(nextStatus === 'active' ? 'Promoción activada' : 'Promoción pausada');
  }

  function handleDuplicate(promo: Promotion) {
    const dup: Promotion = {
      ...promo,
      id: uuidv4(),
      name: `${promo.name} (copia)`,
      status: 'draft',
      currentUses: 0,
      revenue: 0,
      ordersUsed: 0,
      createdAt: new Date().toISOString(),
    };
    setPromotions((prev) => [dup, ...prev]);
    showToast('Promoción duplicada como borrador');
  }

  function handleCopyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const shellClass = embedDeliveryOps ? 'space-y-4' : 'p-6 space-y-6';

  const pageBody = (
    <>
      <div className={shellClass}>
        {!embedDeliveryOps && <CrmNav active="promotions" />}

        {/* ═══════════════════════════════════════════ LIST VIEW */}
        {activeView === 'list' && (
          <>
            {/* Filters + New button */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nombre, descripción o código..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
              </div>
              <button
                onClick={() => { resetForm(); setActiveView('create'); }}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 dark:bg-gray-100 hover:bg-black dark:hover:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold transition-colors flex-shrink-0"
              >
                <Plus className="w-4 h-4" />
                Nueva promoción
              </button>
              <div className="flex gap-2 flex-wrap w-full">
                {(['all', 'active', 'scheduled', 'paused', 'expired', 'draft'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                      statusFilter === s
                        ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                        : 'bg-white dark:bg-gray-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-gray-700 hover:border-slate-300'
                    }`}
                  >
                    {s === 'all' ? 'Todas' : STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard
                label="Activas ahora"
                value={String(kpis.activeCount)}
                sub={`de ${kpis.total} totales`}
                icon={Megaphone}
                gradient="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/20 dark:to-gray-800 border-emerald-100 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100"
              />
              <KPICard
                label="Ingresos generados"
                value={formatCurrency(kpis.totalRevenue)}
                icon={TrendingUp}
                gradient="bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-800 border-blue-100 dark:border-blue-800 text-blue-900 dark:text-blue-100"
              />
              <KPICard
                label="Usos totales"
                value={kpis.totalUses.toLocaleString('es-ES')}
                icon={Users}
                gradient="bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/20 dark:to-gray-800 border-purple-100 dark:border-purple-800 text-purple-900 dark:text-purple-100"
              />
              <KPICard
                label="Descuento medio"
                value={`${kpis.avgDiscount}%`}
                icon={Percent}
                gradient="bg-gradient-to-br from-amber-50 to-white dark:from-amber-900/20 dark:to-gray-800 border-amber-100 dark:border-amber-800 text-amber-900 dark:text-amber-100"
              />
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
              <EmptyState onNew={() => { resetForm(); setActiveView('create'); }} />
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-gray-700 bg-slate-50 dark:bg-gray-800/50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Promoción</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Tipo</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Código</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Ingresos</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Usos</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Estado</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Periodo</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((promo) => {
                        const remaining = daysUntil(promo.endDate);
                        return (
                          <tr
                            key={promo.id}
                            className="border-b border-slate-50 dark:border-gray-700/50 hover:bg-slate-50/50 dark:hover:bg-gray-700/20 transition-colors cursor-pointer"
                            onClick={() => { setSelectedPromo(promo); setDetailTab('info'); setActiveView('detail'); }}
                          >
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900 dark:text-slate-100">{promo.name}</p>
                              <p className="text-xs text-slate-400 dark:text-slate-500 line-clamp-1">{promo.description}</p>
                            </td>
                            <td className="px-4 py-3">
                              <TypeBadge type={promo.type} />
                            </td>
                            <td className="px-4 py-3">
                              {promo.code ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleCopyCode(promo.code!); }}
                                  className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 rounded-md font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors"
                                  title="Copiar código"
                                >
                                  {copiedCode === promo.code ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                  {promo.code}
                                </button>
                              ) : (
                                <span className="text-slate-300 dark:text-slate-600">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                              {promo.revenue > 0 ? formatCurrency(promo.revenue) : '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="text-slate-700 dark:text-slate-300 font-medium">{promo.currentUses}</span>
                              {promo.maxUses && (
                                <span className="text-slate-400 dark:text-slate-500 text-xs">/{promo.maxUses}</span>
                              )}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={promo.status} /></td>
                            <td className="px-4 py-3">
                              {isPermanentPromo(promo) ? (
                                <>
                                  <p className="text-xs text-slate-600 dark:text-slate-400">
                                    Desde {formatDate(promo.startDate)}
                                  </p>
                                  <span className="inline-flex mt-0.5 items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                    Permanente
                                  </span>
                                </>
                              ) : (
                                <>
                                  <p className="text-xs text-slate-600 dark:text-slate-400">{formatDate(promo.startDate)} – {formatDate(promo.endDate)}</p>
                                  {promo.status === 'active' && Number.isFinite(remaining) && remaining > 0 && (
                                    <p className={`text-xs ${remaining <= 7 ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'}`}>
                                      {remaining} días restantes
                                    </p>
                                  )}
                                  {promo.status === 'active' && Number.isFinite(remaining) && remaining <= 0 && (
                                    <p className="text-xs text-red-500">Vencida</p>
                                  )}
                                </>
                              )}
                            </td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="relative">
                                <button
                                  onClick={() => setActionMenuId(actionMenuId === promo.id ? null : promo.id)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                                {actionMenuId === promo.id && (
                                  <div className="absolute right-0 z-20 mt-1 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl shadow-lg py-1 w-48">
                                    <button
                                      onClick={() => { setSelectedPromo(promo); setDetailTab('info'); setActiveView('detail'); setActionMenuId(null); }}
                                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700"
                                    >
                                      <Eye className="w-4 h-4" /> Ver detalle
                                    </button>
                                    <button
                                      onClick={() => { handleEdit(promo); setActionMenuId(null); }}
                                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700"
                                    >
                                      <Edit2 className="w-4 h-4" /> Editar
                                    </button>
                                    <button
                                      onClick={() => { handleDuplicate(promo); setActionMenuId(null); }}
                                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-700"
                                    >
                                      <Copy className="w-4 h-4" /> Duplicar
                                    </button>
                                    {(promo.status === 'active' || promo.status === 'paused') && (
                                      <button
                                        onClick={() => { handleToggleStatus(promo); setActionMenuId(null); }}
                                        className={`flex items-center gap-2 w-full px-3 py-2 text-sm ${
                                          promo.status === 'active'
                                            ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                            : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                        }`}
                                      >
                                        {promo.status === 'active'
                                          ? <><Pause className="w-4 h-4" /> Pausar</>
                                          : <><Play className="w-4 h-4" /> Activar</>}
                                      </button>
                                    )}
                                    <div className="border-t border-slate-100 dark:border-gray-700 my-1" />
                                    <button
                                      onClick={() => { handleDelete(promo); setActionMenuId(null); }}
                                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    >
                                      <Trash2 className="w-4 h-4" /> Eliminar
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination pagination={pagination} />
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════ CREATE / EDIT VIEW */}
        {activeView === 'create' && (
          <div className="max-w-3xl mx-auto space-y-6">

            <button
              onClick={() => { resetForm(); setActiveView(editingId ? 'detail' : 'list'); }}
              className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {editingId ? 'Volver al detalle' : 'Volver a promociones'}
            </button>

            {/* Step 1 - Type selection */}
            {/* Step 1 - Scope + type */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-6">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-center font-bold">1</span>
                ¿Sobre qué aplica el descuento?
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({
                    ...f,
                    discountTarget: 'order',
                    type: f.type === 'fixed_unit_price' ? 'fixed' : f.type,
                  }))}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    form.discountTarget === 'order' && form.type !== 'fixed_unit_price'
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-slate-200 dark:border-gray-700'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Total del pedido</p>
                  <p className="mt-1 text-[11px] text-slate-500">Descuento € o % sobre todo el ticket.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({
                    ...f,
                    discountTarget: 'product',
                    type: 'fixed_unit_price',
                  }))}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    form.discountTarget === 'product' || form.type === 'fixed_unit_price'
                      ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-slate-200 dark:border-gray-700'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Productos concretos (varios)</p>
                  <p className="mt-1 text-[11px] text-slate-500">Ej. varias pizzas a 11€ cada una. Los extras se definen abajo.</p>
                </button>
              </div>

              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                Tipo de promoción
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3">
                {(Object.entries(TYPE_CONFIG) as [PromoType, typeof TYPE_CONFIG[PromoType]][])
                  .filter(([key]) => (
                    form.discountTarget === 'product'
                      ? key === 'fixed_unit_price'
                      : key !== 'fixed_unit_price'
                  ))
                  .map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  const isSelected = form.type === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm((f) => ({
                        ...f,
                        type: key,
                        discountTarget: key === 'fixed_unit_price' ? 'product' : 'order',
                      }))}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all text-center ${
                        isSelected
                          ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-500 shadow-sm'
                          : 'border-slate-200 dark:border-gray-700 hover:border-slate-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cfg.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className={`text-xs font-semibold ${isSelected ? 'text-amber-800 dark:text-amber-200' : 'text-slate-600 dark:text-slate-400'}`}>
                        {cfg.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2 - Details */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-6">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-center font-bold">2</span>
                Datos de la promoción
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Nombre *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full text-sm border border-slate-200 dark:border-gray-700 dark:bg-gray-900 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                    placeholder="Ej: Descuento Primavera 2026"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Descripción</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="w-full text-sm border border-slate-200 dark:border-gray-700 dark:bg-gray-900 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                    placeholder="Describe brevemente la promoción..."
                  />
                </div>

                {(form.type === 'percentage' || form.type === 'fixed' || form.type === 'code') && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Valor del descuento {form.type === 'fixed' ? '(€)' : '(%)'}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        max={form.type === 'percentage' ? 100 : undefined}
                        value={form.discountValue}
                        onChange={(e) => setForm((f) => ({ ...f, discountValue: Math.max(0, Number(e.target.value)) }))}
                        className="w-full text-sm border border-slate-200 dark:border-gray-700 dark:bg-gray-900 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">
                        {form.type === 'fixed' ? '€' : '%'}
                      </span>
                    </div>
                  </div>
                )}

                {form.type === 'fixed_unit_price' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Precio fijo por unidad (€) *
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={form.fixedUnitPrice}
                          onChange={(e) => setForm((f) => ({ ...f, fixedUnitPrice: Math.max(0, Number(e.target.value)) }))}
                          className="w-full text-sm border border-slate-200 dark:border-gray-700 dark:bg-gray-900 rounded-lg px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">€</span>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Productos (nombres, separados por coma) *
                      </label>
                      <textarea
                        value={form.productNamesText}
                        onChange={(e) => setForm((f) => ({ ...f, productNamesText: e.target.value }))}
                        rows={2}
                        className="w-full text-sm border border-slate-200 dark:border-gray-700 dark:bg-gray-900 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                        placeholder="Prosciutto, Bacon, Calzone apertas, Margarita, Roquefort"
                      />
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        El TPV busca estos textos dentro del nombre del producto (sin importar mayúsculas).
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                        Extras / suplementos
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, extrasMode: 'on_top' }))}
                          className={`rounded-xl border-2 p-3 text-left ${
                            form.extrasMode === 'on_top'
                              ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                              : 'border-slate-200 dark:border-gray-700'
                          }`}
                        >
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Sumar extras encima</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">Pizza a 11€ + extras (recomendado).</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, extrasMode: 'include_in_fixed' }))}
                          className={`rounded-xl border-2 p-3 text-left ${
                            form.extrasMode === 'include_in_fixed'
                              ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                              : 'border-slate-200 dark:border-gray-700'
                          }`}
                        >
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Incluir extras en el fijo</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">Todo a 11€ (los extras no se cobran aparte).</p>
                        </button>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                        Días de la semana (vacío = todos)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {WEEKDAY_OPTIONS.map((d) => {
                          const on = form.weekdays.includes(d.value);
                          return (
                            <button
                              key={d.value}
                              type="button"
                              onClick={() => setForm((f) => ({
                                ...f,
                                weekdays: on
                                  ? f.weekdays.filter((x) => x !== d.value)
                                  : [...f.weekdays, d.value].sort((a, b) => a - b),
                              }))}
                              className={`px-2.5 h-8 rounded-lg text-xs font-semibold border transition-colors ${
                                on
                                  ? 'bg-amber-500 text-white border-amber-500'
                                  : 'bg-white dark:bg-gray-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-gray-700'
                              }`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="inline-flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.applyAuto}
                          onChange={(e) => setForm((f) => ({ ...f, applyAuto: e.target.checked }))}
                          className="mt-0.5 rounded border-slate-300"
                        />
                        <span>
                          Aplicar sola en el TPV (sin teclear código)
                          <span className="mt-0.5 block text-[11px] font-normal text-stone-500">
                            Si quieres que el cajero la active a mano, deja un código y no marques esto.
                          </span>
                        </span>
                      </label>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Código promocional{form.permanent ? ' *' : ''}
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={form.code}
                      onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                      className="flex-1 text-sm border border-slate-200 dark:border-gray-700 dark:bg-gray-900 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                      placeholder="PRIMAVERA15"
                    />
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, code: generatePromoCode() }))}
                      className="px-3 py-2 text-xs font-medium border border-slate-200 dark:border-gray-700 rounded-lg hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors text-slate-600 dark:text-slate-400 whitespace-nowrap"
                    >
                      Generar
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
                    En el TPV (Promoción → Código) saldrá en la lista para elegirlo.
                    Déjala Activa. Marca «Permanente» en el paso 4 si no debe caducar
                    (sigue haciendo falta el código). Para el desplegable «Cliente» del TPV,
                    créala en la ficha del cliente.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Usos máximos</label>
                  <input
                    type="number"
                    min={1}
                    value={form.maxUses}
                    onChange={(e) => setForm((f) => ({ ...f, maxUses: e.target.value }))}
                    className="w-full text-sm border border-slate-200 dark:border-gray-700 dark:bg-gray-900 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                    placeholder="Ilimitado"
                  />
                </div>
              </div>
            </div>

            {/* Step 3 - Audience */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-6">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-center font-bold">3</span>
                Público objetivo
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {(Object.entries(AUDIENCE_LABELS) as [Promotion['targetAudience'], string][]).map(([key, label]) => {
                  const isSelected = form.targetAudience === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, targetAudience: key }))}
                      className={`px-3 py-3 rounded-xl border-2 text-xs font-semibold transition-all text-center ${
                        isSelected
                          ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-500 text-amber-800 dark:text-amber-200'
                          : 'border-slate-200 dark:border-gray-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-gray-600'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 4 - Dates */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-6">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs flex items-center justify-center font-bold">4</span>
                Periodo de validez
              </h2>
              <label className="mb-4 flex items-start gap-3 rounded-xl border border-slate-200 dark:border-gray-700 bg-stone-50/80 dark:bg-gray-900/40 px-3 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.permanent}
                  onChange={(e) => {
                    const permanent = e.target.checked;
                    setForm((f) => ({
                      ...f,
                      permanent,
                      endDate: permanent ? '' : (f.endDate || defaultEndDate()),
                    }));
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500/40"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Permanente</span>
                  <span className="block text-[11px] leading-relaxed text-stone-500 dark:text-stone-400 mt-0.5">
                    Sin fecha de caducidad. El código sigue existiendo y se puede usar en el TPV
                    hasta que desactives o pauses la promoción.
                  </span>
                </span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Fecha inicio *</label>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="w-full text-sm border border-slate-200 dark:border-gray-700 dark:bg-gray-900 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Fecha fin {form.permanent ? '' : '*'}
                  </label>
                  <input
                    type="date"
                    value={form.permanent ? '' : form.endDate}
                    disabled={form.permanent}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value, permanent: false }))}
                    className="w-full text-sm border border-slate-200 dark:border-gray-700 dark:bg-gray-900 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {form.permanent && (
                    <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">Sin caducidad</p>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { resetForm(); setActiveView(editingId ? 'detail' : 'list'); }}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-gray-700 rounded-xl hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              {editingId ? (
                <button
                  disabled={saving}
                  onClick={handleUpdate}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900 rounded-xl hover:bg-black dark:hover:bg-white disabled:opacity-50 transition-colors shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              ) : (
                <>
                  <button
                    disabled={saving}
                    onClick={() => handleCreate(true)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-gray-600 rounded-xl hover:bg-slate-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    Guardar borrador
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => handleCreate(false)}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900 rounded-xl hover:bg-black dark:hover:bg-white disabled:opacity-50 transition-colors shadow-sm"
                  >
                    <Megaphone className="w-4 h-4" />
                    {saving ? 'Creando...' : 'Crear promoción'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════ DETAIL VIEW */}
        {activeView === 'detail' && selectedPromo && (
          <div className="max-w-3xl mx-auto space-y-6">

            <button
              onClick={() => { setSelectedPromo(null); setActiveView('list'); }}
              className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a promociones
            </button>

            {/* Header card */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-gray-700">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <TypeBadge type={selectedPromo.type} />
                      <StatusBadge status={selectedPromo.status} />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{selectedPromo.name}</h2>
                    {selectedPromo.description && (
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{selectedPromo.description}</p>
                    )}
                  </div>
                  {selectedPromo.discountValue > 0 && (
                    <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                      <span className="text-white font-bold text-lg">
                        {selectedPromo.type === 'fixed' || selectedPromo.type === 'fixed_unit_price'
                          ? `${selectedPromo.fixedUnitPrice ?? selectedPromo.discountValue}€`
                          : `${selectedPromo.discountValue}%`}
                      </span>
                    </div>
                  )}
                </div>

                {selectedPromo.code && (
                  <div className="flex items-center gap-3 bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-xl p-3 mb-4">
                    <Tag className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">Código</p>
                      <p className="font-mono font-bold text-slate-900 dark:text-slate-100 text-sm">{selectedPromo.code}</p>
                    </div>
                    <button
                      onClick={() => handleCopyCode(selectedPromo.code!)}
                      className="p-2 hover:bg-slate-200 dark:hover:bg-gray-700 rounded-lg transition-colors relative"
                    >
                      {copiedCode === selectedPromo.code
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        : <Copy className="w-4 h-4 text-slate-500" />}
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Inicio</p>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{formatDate(selectedPromo.startDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Fin</p>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {isPermanentPromo(selectedPromo) ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                          Permanente
                        </span>
                      ) : (
                        formatDate(selectedPromo.endDate)
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Público</p>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{AUDIENCE_LABELS[selectedPromo.targetAudience]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Usos</p>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {selectedPromo.currentUses}{selectedPromo.maxUses ? ` / ${selectedPromo.maxUses}` : ' (sin límite)'}
                    </p>
                  </div>
                </div>

                {selectedPromo.maxUses && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                      <span>Progreso de uso</span>
                      <span>{Math.round((selectedPromo.currentUses / selectedPromo.maxUses) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, (selectedPromo.currentUses / selectedPromo.maxUses) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Detail tabs */}
              <div className="border-b border-slate-100 dark:border-gray-700 px-6">
                <div className="flex gap-1">
                  {([['info', 'Información'], ['analytics', 'Analítica']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setDetailTab(key)}
                      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                        detailTab === key
                          ? 'border-amber-500 text-slate-900 dark:text-slate-100'
                          : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6">
                {detailTab === 'info' && (
                  <div className="space-y-4">
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-slate-200 dark:border-gray-700">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Asignar al cliente (TPV)</h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
                        Deja este código listo cuando elijan ese cliente en el TPV (modo Código
                        preactivado). No es el desplegable «Cliente»: ese se gestiona en
                        Clientes → ficha → Promociones.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={assignClientId}
                          onChange={(e) => setAssignClientId(e.target.value)}
                          className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
                        >
                          <option value="">Selecciona un cliente…</option>
                          {(clients || [])
                            .slice()
                            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'))
                            .map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        <button
                          type="button"
                          disabled={!canAssignToClient}
                          onClick={() => {
                            const ap = buildAppliedFromPromo(selectedPromo);
                            if (!ap) return;
                            setClientAppliedPromo(assignClientId, ap);
                            setAssignClientId('');
                            showToast(`Código asignado a ${selectedClientLabel || 'cliente'}`);
                          }}
                          className="px-4 py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50"
                        >
                          Asignar
                        </button>
                        <button
                          type="button"
                          disabled={!assignClientId}
                          onClick={() => {
                            setClientAppliedPromo(assignClientId, null);
                            setAssignClientId('');
                            showToast('Código quitado del cliente');
                          }}
                          className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-gray-700 text-slate-700 dark:text-slate-200 text-sm font-semibold disabled:opacity-50"
                        >
                          Quitar
                        </button>
                      </div>
                      {selectedPromo?.status !== 'active' && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2 font-semibold">
                          Para asignar, la promoción debe estar en estado “Activa”.
                        </p>
                      )}
                      {!selectedPromo?.code && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2 font-semibold">
                          Para asignar, la promoción debe tener un código.
                        </p>
                      )}
                    </div>
                    <div className="bg-slate-50 dark:bg-gray-900 rounded-xl p-4 border border-slate-100 dark:border-gray-700">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Configuración</h4>
                      <dl className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-xs text-slate-500 dark:text-slate-400">Tipo</dt>
                          <dd className="font-medium text-slate-900 dark:text-slate-100">{TYPE_CONFIG[selectedPromo.type].label}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500 dark:text-slate-400">Descuento</dt>
                          <dd className="font-medium text-slate-900 dark:text-slate-100">
                            {selectedPromo.type === 'fixed' || selectedPromo.type === 'fixed_unit_price'
                              ? `${selectedPromo.fixedUnitPrice ?? selectedPromo.discountValue} €`
                              : selectedPromo.type === '2x1' || selectedPromo.type === 'gift'
                                ? 'N/A'
                                : `${selectedPromo.discountValue}%`}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500 dark:text-slate-400">Creada</dt>
                          <dd className="font-medium text-slate-900 dark:text-slate-100">{formatDate(selectedPromo.createdAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500 dark:text-slate-400">Límite de usos</dt>
                          <dd className="font-medium text-slate-900 dark:text-slate-100">{selectedPromo.maxUses ?? 'Sin límite'}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                )}
                {detailTab === 'analytics' && <PromoAnalytics promo={selectedPromo} />}
              </div>

              {/* Actions */}
              <div className="p-6 border-t border-slate-100 dark:border-gray-700 flex flex-wrap gap-3">
                <button
                  onClick={() => handleEdit(selectedPromo)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Editar
                </button>
                <button
                  onClick={() => handleDuplicate(selectedPromo)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-gray-700 rounded-xl hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  Duplicar
                </button>
                {(selectedPromo.status === 'active' || selectedPromo.status === 'paused') && (
                  <button
                    onClick={() => handleToggleStatus(selectedPromo)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                      selectedPromo.status === 'active'
                        ? 'text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                        : 'text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                    }`}
                  >
                    {selectedPromo.status === 'active'
                      ? <><Pause className="w-4 h-4" /> Pausar</>
                      : <><Play className="w-4 h-4" /> Activar</>}
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => handleDelete(selectedPromo)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {actionMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setActionMenuId(null)} />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl text-sm font-medium transition-all ${
            toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <XCircle className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}
    </>
  );

  if (embedDeliveryOps) {
    return pageBody;
  }

  return (
    <Layout title="Promociones" subtitle="Códigos y descuentos de la empresa para el TPV" noPadding>
      {pageBody}
    </Layout>
  );
}
