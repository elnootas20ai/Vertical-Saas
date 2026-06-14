import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useGroup } from '../../context/GroupContext';
import { listFinanceMovements } from '../../lib/financeApi';
import type { FinanceMovementRecord } from '../../lib/financeTypes';
import { listCommissions } from '../../lib/commissionsApi';
import type { CommissionRecord } from '../../lib/commissionsApi';
import { listConsents, listRequests } from '../../lib/gdprApi';
import type { GdprConsent, GdprRequest } from '../../lib/gdprApi';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Area, AreaChart,
  FunnelChart, Funnel, LabelList, ReferenceLine,
} from 'recharts';
import {
  Download, FileText, TrendingUp, TrendingDown, Car, Users, ShoppingCart,
  Calendar, Euro, Filter, RefreshCw, FileSpreadsheet, BarChart2,
  Award, Clock, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Wallet, ArrowRightLeft, Package, Star, Target, Zap, Activity,
  Layers, ChevronRight, ChevronDown, ChevronUp, Percent, Phone, MapPin, Key, Trophy,
  RotateCcw, Building2, Shield, Grid3X3, X, Truck, Info,
} from 'lucide-react';
import { PeriodBadge } from '../../components/ui/PeriodBadge';
import {
  format, subMonths, isWithinInterval, getYear, getMonth, parseISO,
  startOfMonth, endOfMonth, startOfYear, eachMonthOfInterval, endOfYear,
  startOfWeek, endOfWeek, subWeeks, eachWeekOfInterval,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import FinanceReportsPanel from '../../components/saas/finance/FinanceReportsPanel';
import { useReportPlanAccess } from '../../hooks/useReportPlanAccess';
import {
  REPORT_CATALOG,
  requiredPlanLabel,
  type ReportId,
} from '../../lib/reportPlanCatalog';
import { Lock, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ReportTab = ReportId;

const SENSITIVE_TABS: ReportTab[] = REPORT_CATALOG
  .filter((r) => r.requiresReportsPermission)
  .map((r) => r.id);

type DatePreset = 'month' | '7d' | '30d' | '90d' | '6m' | '1y' | 'custom';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatEur(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M €`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k €`;
  return `${n.toLocaleString('es-ES')} €`;
}

function pct(num: number, den: number) {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function KPICard({
  title, value, sub, icon, color, trend,
}: {
  title: string; value: string; sub: string;
  icon: React.ReactNode; color: string;
  trend?: { value: string; up: boolean };
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${color}`}>{icon}</div>
        {trend && (
          <span className={`flex items-center gap-0.5 text-xs font-bold ${trend.up ? 'text-emerald-600' : 'text-red-500'}`}>
            {trend.up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {trend.value}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
      <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-0.5">{title}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{children}</h3>
  );
}

function ChartCard({ title, children, action, period }: { title: string; children: React.ReactNode; action?: React.ReactNode; period?: string }) {
  const periodLabel = period === 'month' ? 'Mes' : period === '7d' ? '7d' : period === '30d' ? '30d' : period === '90d' ? '90d' : period === '6m' ? '6m' : period === '1y' ? '1y' : period;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <SectionTitle>{title}</SectionTitle>
        {action}
      </div>
      <div className="relative">
        {periodLabel && (
          <div className="absolute top-1 right-1 z-10">
            <PeriodBadge period={periodLabel} variant="glass" className="text-[9px] tracking-[0.2em] opacity-75" />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: { background: '#1f2937', border: 'none', borderRadius: 8, color: '#f9fafb', fontSize: 12 },
};

// ─── ScenarioForecastCard ────────────────────────────────────────────────────

function ScenarioForecastCard({
  title,
  description,
  color,
  multiplier,
  pipelineCount,
  avgBudget,
  historicalCloseRate,
}: {
  title: string;
  description: string;
  color: string;
  multiplier: number;
  pipelineCount: number;
  avgBudget: number;
  historicalCloseRate: number;
}) {
  const [open, setOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawnRef = useRef(false);

  const adjustedRate = (historicalCloseRate / 100) * multiplier;
  const projectedUnits = Math.round(pipelineCount * adjustedRate);
  const projectedRevenue = Math.round(pipelineCount * adjustedRate * avgBudget);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas || drawnRef.current) return;
    drawnRef.current = true;

    const timeout = setTimeout(() => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (!w || !h) return;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const rawCtx = canvas.getContext('2d');
      if (!rawCtx) return;
      rawCtx.scale(dpr, dpr);
      const ctx = rawCtx;

      const monthlyRevenue = Array.from({ length: 12 }, (_, i) => {
        const wt = 0.5 + (i / 11) * multiplier;
        return wt;
      }).map((() => {
        const weights = Array.from({ length: 12 }, (_, i) => 0.5 + (i / 11) * multiplier);
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        return (wt: number) => (wt / totalWeight) * projectedRevenue;
      })());

      const maxVal = Math.max(...monthlyRevenue, 1) * 1.2;
      const PAD = { top: 20, right: 16, bottom: 32, left: 56 };
      const cW = w - PAD.left - PAD.right;
      const cH = h - PAD.top - PAD.bottom;
      const xPos = (i: number) => PAD.left + (i / (monthlyRevenue.length - 1)) * cW;
      const yPos = (v: number) => PAD.top + cH - (v / maxVal) * cH;

      function draw(progress: number) {
        ctx.clearRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(156,163,175,0.25)';
        ctx.lineWidth = 1;
        for (let g = 0; g <= 4; g++) {
          const y = PAD.top + (g / 4) * cH;
          ctx.beginPath();
          ctx.moveTo(PAD.left, y);
          ctx.lineTo(w - PAD.right, y);
          ctx.stroke();
          const val = maxVal * (1 - g / 4);
          ctx.fillStyle = 'rgba(107,114,128,0.8)';
          ctx.font = '10px system-ui, sans-serif';
          ctx.textAlign = 'right';
          const label = val >= 1_000_000
            ? `${(val / 1_000_000).toFixed(1)}M`
            : val >= 1_000
            ? `${(val / 1_000).toFixed(0)}k`
            : Math.round(val).toString();
          ctx.fillText(label + '€', PAD.left - 4, y + 3);
        }

        ctx.fillStyle = 'rgba(107,114,128,0.8)';
        ctx.font = '10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        MONTH_LABELS.forEach((m, i) => ctx.fillText(m, xPos(i), h - PAD.bottom + 14));

        const partial = monthlyRevenue.map((v, i) => {
          if (i === 0) return v * Math.min(1, progress * 12);
          const t = i / (monthlyRevenue.length - 1);
          if (progress >= t) return v;
          const pt = (i - 1) / (monthlyRevenue.length - 1);
          const frac = Math.max(0, (progress - pt) / (t - pt));
          return monthlyRevenue[i - 1] + (v - monthlyRevenue[i - 1]) * frac;
        });

        const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
        grad.addColorStop(0, color + '50');
        grad.addColorStop(1, color + '08');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(xPos(0), PAD.top + cH);
        partial.forEach((v, i) => ctx.lineTo(xPos(i), yPos(v)));
        ctx.lineTo(xPos(partial.length - 1), PAD.top + cH);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        partial.forEach((v, i) => {
          if (i === 0) ctx.moveTo(xPos(i), yPos(v));
          else ctx.lineTo(xPos(i), yPos(v));
        });
        ctx.stroke();

        partial.forEach((v, i) => {
          ctx.beginPath();
          ctx.arc(xPos(i), yPos(v), 3.5, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
      }

      const startTime = performance.now();
      const duration = 900;
      function frame(now: number) {
        const t = Math.min((now - startTime) / duration, 1);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        draw(ease);
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }, 60);

    return () => clearTimeout(timeout);
  }, [open, color, multiplier, pipelineCount, avgBudget, historicalCloseRate, projectedRevenue]);

  return (
    <div
      className="rounded-2xl border overflow-hidden bg-white dark:bg-gray-800 transition-colors"
      style={{ borderColor: open ? color : undefined }}
    >
      <button
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50/30 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="flex-1 font-bold text-sm text-gray-900 dark:text-gray-100">{title}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500 mr-3 hidden sm:block">{description}</span>
        <div className="text-right min-w-[80px] mr-2">
          <p className="text-sm font-bold" style={{ color }}>{projectedUnits} uds</p>
          {avgBudget > 0 && <p className="text-xs text-gray-400 dark:text-gray-500">{formatEur(projectedRevenue)}</p>}
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
        }
      </button>
      {open && (
        <div className="px-5 pb-5">
          <div
            className="rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800 bg-gray-50/50"
            style={{ height: 200 }}
          >
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Export helpers ───────────────────────────────────────────────────────────

async function exportToExcel(data: Record<string, unknown>[], filename: string) {
  const { utils, writeFile } = await import('xlsx');
  const ws = utils.json_to_sheet(data);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Informe');
  writeFile(wb, `${filename}.xlsx`);
}

async function exportToPdf(title: string, rows: string[][], headers: string[]) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Generado: ${format(new Date(), "d 'de' MMMM yyyy", { locale: es })}`, 14, 26);

  let y = 38;
  const colW = Math.floor((doc.internal.pageSize.width - 28) / headers.length);

  doc.setFillColor(37, 99, 235);
  doc.rect(14, y - 6, doc.internal.pageSize.width - 28, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  headers.forEach((h, i) => doc.text(h.substring(0, 20), 14 + i * colW, y));
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40, 40, 40);
  y += 9;

  rows.forEach((row, ri) => {
    if (y > doc.internal.pageSize.height - 15) {
      doc.addPage();
      y = 20;
    }
    if (ri % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y - 5, doc.internal.pageSize.width - 28, 8, 'F');
    }
    row.forEach((cell, i) => doc.text(String(cell).substring(0, 25), 14 + i * colW, y));
    y += 8;
  });

  doc.save(`${title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
}

function exportToCsv(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => {
      const v = row[h];
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','),
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Componente principal ────────────────────────────────────────────────────

export function Reports() {
  const { t } = useTranslation();
  const { vehicles, leads, clients, sales } = useApp();
  const { user: authUser } = useAuth();
  const { groups, currentGroup, groupKpis, isLoadingKpis, switchGroup, loadGroupKpis } = useGroup();

  const { activeWorkCenters, hasWorkCenters } = useWorkCenters();
  const [filterWorkCenter, setFilterWorkCenter] = useState<string>('all');
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterResponsible, setFilterResponsible] = useState<string>('all');
  const [filterSupplier, setFilterSupplier] = useState<string>('all');
  const [filterVehicleStatus, setFilterVehicleStatus] = useState<string>('all');
  const [tab, setTab] = useState<ReportTab>('ventas');
  const [preset, setPreset] = useState<DatePreset>('month');
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [exporting, setExporting] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  // ── Permisos ──────────────────────────────────────────────────────────────
  const isManager = useMemo(() => {
    const role = authUser?.role;
    return role === 'Admin' || role === 'Gerente';
  }, [authUser]);

  const canViewFullReports = useMemo(() => {
    if (isManager) return true;
    const perms = authUser?.permissions as Record<string, { view?: boolean }> | undefined;
    return perms?.reports?.view === true;
  }, [isManager, authUser]);

  const {
    planTier,
    planLabel,
    unlockedReports,
    lockedReports,
    isBasicPlan,
    canAccessReport,
    findReport,
  } = useReportPlanAccess();

  useEffect(() => {
    if (!canAccessReport(tab)) {
      const fallback = unlockedReports[0]?.id ?? 'ventas';
      if (canAccessReport(fallback)) setTab(fallback);
    }
  }, [tab, unlockedReports, canAccessReport]);

  // ── Listas únicas para filtros ────────────────────────────────────────────
  const uniqueBrands = useMemo(() =>
    [...new Set(vehicles.map(v => v.brand).filter(Boolean))].sort(),
    [vehicles],
  );
  const uniqueResponsibles = useMemo(() =>
    [...new Set([
      ...sales.filter(s => s.responsible).map(s => s.responsible!),
      ...leads.filter(l => l.responsible).map(l => l.responsible!),
    ])].sort(),
    [sales, leads],
  );
  const uniqueSuppliers = useMemo(() =>
    [...new Set(vehicles.map(v => (v as any).supplierName).filter(Boolean))].sort(),
    [vehicles],
  );

  const hasActiveFilters = filterBrand !== 'all' || filterResponsible !== 'all'
    || filterSupplier !== 'all' || filterVehicleStatus !== 'all';

  const clearAllFilters = useCallback(() => {
    setFilterBrand('all');
    setFilterResponsible('all');
    setFilterSupplier('all');
    setFilterVehicleStatus('all');
    setFilterWorkCenter('all');
  }, []);

  // ── Filtro base de vehículos (reutilizado en múltiples useMemo) ────────────
  const filteredVehicles = useMemo(() =>
    vehicles.filter(v => {
      if (filterBrand !== 'all' && v.brand !== filterBrand) return false;
      if (filterSupplier !== 'all' && (v as any).supplierName !== filterSupplier) return false;
      if (filterVehicleStatus !== 'all' && v.status !== filterVehicleStatus) return false;
      return true;
    }),
    [vehicles, filterBrand, filterSupplier, filterVehicleStatus],
  );

  // Finance data (lazy load)
  const [financeMovements, setFinanceMovements] = useState<FinanceMovementRecord[]>([]);
  const [financeLoading, setFinanceLoading] = useState(false);

  // Commissions (lazy load for tab margen)
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [commissionsLoaded, setCommissionsLoaded] = useState(false);

  // GDPR data (lazy load for tab rgpd)
  const [gdprConsents, setGdprConsents] = useState<GdprConsent[]>([]);
  const [gdprRequests, setGdprRequests] = useState<GdprRequest[]>([]);
  const [gdprLoading, setGdprLoading] = useState(false);
  const [gdprLoaded, setGdprLoaded] = useState(false);

  const loadFinance = useCallback(() => {
    if (!authUser?.user_id) return;
    setFinanceLoading(true);
    listFinanceMovements(authUser.user_id)
      .then(setFinanceMovements)
      .catch(() => {})
      .finally(() => setFinanceLoading(false));
  }, [authUser?.user_id]);

  const loadCommissions = useCallback(() => {
    if (!authUser?.user_id) return;
    listCommissions(authUser.user_id)
      .then(setCommissions)
      .catch(() => {});
  }, [authUser?.user_id]);

  useEffect(() => {
    if ((tab === 'financiero' || tab === 'rentabilidad') && authUser?.user_id && financeMovements.length === 0) {
      loadFinance();
    }
  }, [tab, authUser?.user_id, financeMovements.length, loadFinance]);

  useEffect(() => {
    if (tab === 'margen' && authUser?.user_id && !commissionsLoaded) {
      setCommissionsLoaded(true);
      loadCommissions();
    }
  }, [tab, authUser?.user_id, commissionsLoaded, loadCommissions]);

  // IR-09: Auto-refresh de datos lazy cada 5 min mientras se ven tabs relevantes
  useEffect(() => {
    const finTabs: ReportTab[] = ['financiero', 'rentabilidad', 'margen'];
    if (!finTabs.includes(tab) || !authUser?.user_id) return;
    const id = setInterval(() => {
      loadFinance();
      if (commissionsLoaded) loadCommissions();
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [tab, authUser?.user_id, commissionsLoaded, loadFinance, loadCommissions]);

  useEffect(() => {
    if (tab === 'rgpd' && authUser?.user_id && !gdprLoaded) {
      setGdprLoading(true);
      setGdprLoaded(true);
      Promise.all([
        listConsents(authUser.user_id),
        listRequests(authUser.user_id),
      ]).then(([c, r]) => {
        setGdprConsents(c);
        setGdprRequests(r);
      }).catch(() => {}).finally(() => setGdprLoading(false));
    }
  }, [tab, authUser?.user_id, gdprLoaded]);

  useEffect(() => {
    if (tab === 'grupo' && currentGroup?.group_id) {
      void loadGroupKpis(currentGroup.group_id);
    }
  }, [tab, currentGroup?.group_id, loadGroupKpis]);

  const applyPreset = useCallback((p: DatePreset) => {
    setPreset(p);
    const now = new Date();
    if (p === 'month') {
      setDateFrom(format(startOfMonth(now), 'yyyy-MM-dd'));
      setDateTo(format(endOfMonth(now), 'yyyy-MM-dd'));
    } else if (p === '7d') { setDateFrom(format(new Date(now.getTime() - 7 * 86400000), 'yyyy-MM-dd')); setDateTo(format(now, 'yyyy-MM-dd')); }
    else if (p === '30d') { setDateFrom(format(subMonths(now, 1), 'yyyy-MM-dd')); setDateTo(format(now, 'yyyy-MM-dd')); }
    else if (p === '90d') { setDateFrom(format(subMonths(now, 3), 'yyyy-MM-dd')); setDateTo(format(now, 'yyyy-MM-dd')); }
    else if (p === '6m') { setDateFrom(format(subMonths(now, 6), 'yyyy-MM-dd')); setDateTo(format(now, 'yyyy-MM-dd')); }
    else if (p === '1y') { setDateFrom(format(subMonths(now, 12), 'yyyy-MM-dd')); setDateTo(format(now, 'yyyy-MM-dd')); }
  }, []);

  const interval = useMemo(() => ({
    start: new Date(dateFrom + 'T00:00:00'),
    end: new Date(dateTo + 'T23:59:59'),
  }), [dateFrom, dateTo]);

  // ── Ventas ───────────────────────────────────────────────────────────────
  const filteredSales = useMemo(() =>
    sales.filter(s => {
      try {
        if (!isWithinInterval(new Date(s.createdAt), interval)) return false;
      } catch { return false; }
      if (filterWorkCenter !== 'all' && (s as any).workCenterId !== filterWorkCenter) return false;
      if (filterResponsible !== 'all' && s.responsible !== filterResponsible) return false;
      return true;
    }),
    [sales, interval, filterWorkCenter, filterResponsible],
  );

  const totalRevenue = filteredSales.reduce((s, sale) => s + (sale.salePrice || 0), 0);
  const completedSales = filteredSales.filter(s => s.status === 'completed');
  const avgTicket = completedSales.length ? Math.round(totalRevenue / completedSales.length) : 0;

  const salesByMonth = useMemo(() => {
    const map = new Map<string, { mes: string; ventas: number; importe: number; margen: number }>();
    filteredSales.forEach(s => {
      const key = format(new Date(s.createdAt), 'MMM yy', { locale: es });
      const v = vehicles.find(veh => veh.id === s.vehicleId);
      const margin = v ? (v.salePrice || s.salePrice) - v.purchasePrice : 0;
      const prev = map.get(key) || { mes: key, ventas: 0, importe: 0, margen: 0 };
      map.set(key, { ...prev, ventas: prev.ventas + 1, importe: prev.importe + (s.salePrice || 0), margen: prev.margen + margin });
    });
    return Array.from(map.values());
  }, [filteredSales, vehicles]);

  // ── Leads / CRM ──────────────────────────────────────────────────────────
  const filteredLeads = useMemo(() =>
    leads.filter(l => {
      try {
        if (!isWithinInterval(new Date(l.createdAt), interval)) return false;
      } catch { return false; }
      if (filterWorkCenter !== 'all' && (l as any).workCenterId !== filterWorkCenter) return false;
      if (filterResponsible !== 'all' && l.responsible !== filterResponsible) return false;
      return true;
    }),
    [leads, interval, filterWorkCenter, filterResponsible],
  );

  const conversionRate = pct(filteredLeads.filter(l => l.status === 'won').length, filteredLeads.length);

  const leadsBySource = useMemo(() => {
    const map = new Map<string, number>();
    filteredLeads.forEach(l => map.set(l.source || 'Sin origen', (map.get(l.source || 'Sin origen') || 0) + 1));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredLeads]);

  const leadsByStatus = useMemo(() => {
    const labels: Record<string, string> = {
      new: 'Nuevo', contacted: 'Contactado', appointment: 'Cita',
      reserved: 'Reservado', negotiation: 'Negociación', won: 'Ganado', lost: 'Perdido',
    };
    const map = new Map<string, number>();
    filteredLeads.forEach(l => map.set(l.status, (map.get(l.status) || 0) + 1));
    return Array.from(map.entries()).map(([k, v]) => ({ name: labels[k] || k, value: v }));
  }, [filteredLeads]);

  // ── Inventario ────────────────────────────────────────────────────────────
  const vehiclesByBrand = useMemo(() => {
    const map = new Map<string, number>();
    filteredVehicles.forEach(v => map.set(v.brand, (map.get(v.brand) || 0) + 1));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [filteredVehicles]);

  const vehiclesByStatus = useMemo(() => {
    const labels: Record<string, string> = {
      available: 'Disponible', reserved: 'Reservado',
      sold: 'Vendido', workshop: 'Taller', scrapped: 'Desguace',
    };
    const map = new Map<string, number>();
    filteredVehicles.forEach(v => map.set(v.status, (map.get(v.status) || 0) + 1));
    return Array.from(map.entries()).map(([k, v]) => ({ name: labels[k] || k, value: v }));
  }, [filteredVehicles]);

  // ── R-04: Antigüedad de stock (grupos 0-30 / 31-60 / 61-90 / +90) ────────
  const stockAgeData = useMemo(() => {
    return filteredVehicles
      .filter(v => v.status === 'available' || v.status === 'reserved')
      .map(v => {
        const days = v.daysInStock;
        let bucket: 'g0' | 'g30' | 'g60' | 'g90';
        let alert: 'green' | 'yellow' | 'orange' | 'red';
        if (days <= 30) { bucket = 'g0'; alert = 'green'; }
        else if (days <= 60) { bucket = 'g30'; alert = 'yellow'; }
        else if (days <= 90) { bucket = 'g60'; alert = 'orange'; }
        else { bucket = 'g90'; alert = 'red'; }

        // Impacto en margen: cuanto más días, mayor descuento estimado
        const targetMargin = v.salePrice ? (v.salePrice - v.purchasePrice) : 0;
        const agePenalty = days <= 30 ? 0 : days <= 60 ? 0.05 : days <= 90 ? 0.10 : 0.18;
        const marginImpact = v.salePrice ? -Math.round(v.salePrice * agePenalty) : 0;

        return {
          id: v.id,
          plate: v.registrationPlate,
          vehicle: `${v.brand} ${v.model} ${v.year}`,
          days,
          bucket,
          status: v.status,
          purchasePrice: v.purchasePrice,
          salePrice: v.salePrice || 0,
          targetMargin,
          marginImpact,
          alert,
        };
      })
      .sort((a, b) => b.days - a.days);
  }, [filteredVehicles]);

  const stockAgeStats = useMemo(() => ({
    g0:  stockAgeData.filter(v => v.bucket === 'g0').length,
    g30: stockAgeData.filter(v => v.bucket === 'g30').length,
    g60: stockAgeData.filter(v => v.bucket === 'g60').length,
    g90: stockAgeData.filter(v => v.bucket === 'g90').length,
    totalMarginImpact: stockAgeData.reduce((s, v) => s + v.marginImpact, 0),
  }), [stockAgeData]);

  // ── REP-03: Margen por vehículo ──────────────────────────────────────────
  const marginData = useMemo(() => {
    return filteredVehicles
      .filter(v => v.status === 'sold' && v.salePrice)
      .map(v => {
        const margin = (v.salePrice || 0) - v.purchasePrice;
        const marginPct = v.salePrice ? pct(margin, v.salePrice) : 0;
        return {
          id: v.id,
          plate: v.registrationPlate,
          vehicle: `${v.brand} ${v.model} ${v.year}`,
          brand: v.brand,
          purchasePrice: v.purchasePrice,
          salePrice: v.salePrice || 0,
          margin,
          marginPct,
          days: v.daysInStock,
          soldAt: v.soldAt,
        };
      })
      .sort((a, b) => b.margin - a.margin);
  }, [filteredVehicles]);

  const marginStats = useMemo(() => {
    if (!marginData.length) return { avg: 0, total: 0, avgPct: 0, best: null as typeof marginData[0] | null };
    const total = marginData.reduce((s, v) => s + v.margin, 0);
    const avgPct = Math.round(marginData.reduce((s, v) => s + v.marginPct, 0) / marginData.length);
    return { avg: Math.round(total / marginData.length), total, avgPct, best: marginData[0] };
  }, [marginData]);

  // ── REP-04: Rendimiento comerciales ──────────────────────────────────────
  const commercialData = useMemo(() => {
    const map = new Map<string, {
      name: string; leads: number; won: number; lost: number;
      contacted: number; budgetSum: number; budgetCount: number;
    }>();

    const allLeads = tab === 'comerciales' ? leads : filteredLeads;
    allLeads.forEach(l => {
      const name = l.responsible || 'Sin asignar';
      const prev = map.get(name) || { name, leads: 0, won: 0, lost: 0, contacted: 0, budgetSum: 0, budgetCount: 0 };
      map.set(name, {
        ...prev,
        leads: prev.leads + 1,
        won: prev.won + (l.status === 'won' ? 1 : 0),
        lost: prev.lost + (l.status === 'lost' ? 1 : 0),
        contacted: prev.contacted + (['contacted', 'appointment', 'reserved', 'negotiation', 'won'].includes(l.status) ? 1 : 0),
        budgetSum: prev.budgetSum + (l.budget ? Number(l.budget) : 0),
        budgetCount: prev.budgetCount + (l.budget ? 1 : 0),
      });
    });

    return Array.from(map.values())
      .map(c => ({
        ...c,
        conversion: pct(c.won, c.leads),
        avgBudget: c.budgetCount ? Math.round(c.budgetSum / c.budgetCount) : 0,
      }))
      .sort((a, b) => b.won - a.won);
  }, [leads, filteredLeads, tab]);

  // ── REP-04b: Evolución semanal por comercial ─────────────────────────────
  const commercialTimeline = useMemo(() => {
    const WEEKS = 12;
    const today = new Date();
    const weekStarts = eachWeekOfInterval(
      { start: subWeeks(startOfWeek(today, { weekStartsOn: 1 }), WEEKS - 1), end: today },
      { weekStartsOn: 1 },
    ).slice(-WEEKS);

    const agents = [...new Set(
      leads
        .filter(l => l.responsible && l.responsible !== 'Sin asignar')
        .map(l => l.responsible as string),
    )].slice(0, 5);

    const AGENT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

    const data = weekStarts.map((ws) => {
      const we = endOfWeek(ws, { weekStartsOn: 1 });
      const point: Record<string, string | number> = {
        semana: format(ws, "d MMM", { locale: es }),
        semanaFull: format(ws, "d 'de' MMMM yyyy", { locale: es }),
      };
      for (const agent of agents) {
        point[agent] = leads.filter(l => {
          if (l.responsible !== agent) return false;
          try { return isWithinInterval(new Date(l.createdAt), { start: ws, end: we }); }
          catch { return false; }
        }).length;
      }
      return point;
    });

    return { data, agents, agentColors: AGENT_COLORS };
  }, [leads]);

  // ── REP-07: Comparativa interanual ───────────────────────────────────────
  const yearlyComparison = useMemo(() => {
    const now = new Date();
    const currentYear = getYear(now);
    const prevYear = currentYear - 1;

    const dataByMonth = MONTH_LABELS.map((mes, monthIdx) => {
      const soldCurrent = filteredVehicles.filter(v => {
        if (v.status !== 'sold' || !v.soldAt) return false;
        const d = new Date(v.soldAt);
        return getYear(d) === currentYear && getMonth(d) === monthIdx;
      });
      const soldPrev = filteredVehicles.filter(v => {
        if (v.status !== 'sold' || !v.soldAt) return false;
        const d = new Date(v.soldAt);
        return getYear(d) === prevYear && getMonth(d) === monthIdx;
      });

      return {
        mes,
        [`Ventas ${currentYear}`]: soldCurrent.length,
        [`Ventas ${prevYear}`]: soldPrev.length,
        [`Ingresos ${currentYear}`]: soldCurrent.reduce((s, v) => s + (v.salePrice || 0), 0),
        [`Ingresos ${prevYear}`]: soldPrev.reduce((s, v) => s + (v.salePrice || 0), 0),
        [`Margen ${currentYear}`]: soldCurrent.reduce((s, v) => s + ((v.salePrice || 0) - v.purchasePrice), 0),
        [`Margen ${prevYear}`]: soldPrev.reduce((s, v) => s + ((v.salePrice || 0) - v.purchasePrice), 0),
        currentYear,
        prevYear,
      };
    });
    return { data: dataByMonth, currentYear, prevYear };
  }, [filteredVehicles]);

  // ── Finance ───────────────────────────────────────────────────────────────
  const filteredFinance = useMemo(() =>
    financeMovements.filter(m => {
      try { return isWithinInterval(parseISO(m.date), interval); } catch { return false; }
    }),
    [financeMovements, interval],
  );

  const financeStats = useMemo(() => {
    const cobros = filteredFinance.filter(m => m.type === 'cobro').reduce((s, m) => s + m.totalAmount, 0);
    const pagos = filteredFinance.filter(m => m.type === 'pago').reduce((s, m) => s + m.totalAmount, 0);
    return { cobros, pagos, balance: cobros - pagos };
  }, [filteredFinance]);

  const financeByMonth = useMemo(() => {
    const map = new Map<string, { mes: string; cobros: number; pagos: number }>();
    filteredFinance.forEach(m => {
      const key = format(parseISO(m.date), 'MMM yy', { locale: es });
      const prev = map.get(key) || { mes: key, cobros: 0, pagos: 0 };
      map.set(key, {
        ...prev,
        cobros: m.type === 'cobro' ? prev.cobros + m.totalAmount : prev.cobros,
        pagos: m.type === 'pago' ? prev.pagos + m.totalAmount : prev.pagos,
      });
    });
    return Array.from(map.values());
  }, [filteredFinance]);

  const financeByCategory = useMemo(() => {
    const map = new Map<string, { name: string; value: number; type: string }>();
    filteredFinance.forEach(m => {
      const key = `${m.type}:${m.category}`;
      const prev = map.get(key) || { name: m.category, value: 0, type: m.type };
      map.set(key, { ...prev, value: prev.value + m.totalAmount });
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [filteredFinance]);

  // ── R-05: CRM Funnel ──────────────────────────────────────────────────────
  const crmFunnelData = useMemo(() => {
    const total = filteredLeads.length;
    if (!total) return [];
    const stages = [
      { key: 'new', label: 'Captados', statuses: ['new', 'contacted', 'appointment', 'reserved', 'negotiation', 'won', 'lost'] },
      { key: 'contacted', label: 'Contactados', statuses: ['contacted', 'appointment', 'reserved', 'negotiation', 'won'] },
      { key: 'appointment', label: 'Cita concertada', statuses: ['appointment', 'reserved', 'negotiation', 'won'] },
      { key: 'negotiation', label: 'Negociación', statuses: ['reserved', 'negotiation', 'won'] },
      { key: 'won', label: 'Ganados', statuses: ['won'] },
    ];
    return stages.map((stage, i) => {
      const count = filteredLeads.filter(l => stage.statuses.includes(l.status)).length;
      const prev = i === 0 ? total : filteredLeads.filter(l => stages[i - 1].statuses.includes(l.status)).length;
      return {
        name: stage.label,
        value: count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        convRate: prev > 0 ? Math.round((count / prev) * 100) : 0,
        fill: ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#06b6d4'][i],
      };
    });
  }, [filteredLeads]);

  // ── R-02: Rentabilidad mensual ────────────────────────────────────────────
  const rentabilidadData = useMemo(() => {
    const now = new Date();
    const currentYear = getYear(now);
    const prevYear = currentYear - 1;

    const months = MONTH_LABELS.map((mes, monthIdx) => {
      const soldCur = filteredVehicles.filter(v => {
        if (v.status !== 'sold' || !v.soldAt) return false;
        const d = new Date(v.soldAt);
        return getYear(d) === currentYear && getMonth(d) === monthIdx;
      });
      const soldPrev = filteredVehicles.filter(v => {
        if (v.status !== 'sold' || !v.soldAt) return false;
        const d = new Date(v.soldAt);
        return getYear(d) === prevYear && getMonth(d) === monthIdx;
      });

      const revenue = soldCur.reduce((s, v) => s + (v.salePrice || 0), 0);
      const cogs = soldCur.reduce((s, v) => s + v.purchasePrice, 0);
      const grossMargin = revenue - cogs;

      // Gastos operativos del mes desde movimientos financieros
      const opex = financeMovements.filter(m => {
        if (m.type !== 'pago') return false;
        try {
          const d = parseISO(m.date);
          return getYear(d) === currentYear && getMonth(d) === monthIdx;
        } catch { return false; }
      }).reduce((s, m) => s + m.totalAmount, 0);

      const ebitda = grossMargin - opex;

      const revenuePrev = soldPrev.reduce((s, v) => s + (v.salePrice || 0), 0);
      const cogsPrev = soldPrev.reduce((s, v) => s + v.purchasePrice, 0);
      const grossMarginPrev = revenuePrev - cogsPrev;

      return { mes, revenue, cogs, grossMargin, opex, ebitda, revenuePrev, grossMarginPrev };
    });

    const totals = months.reduce((acc, m) => ({
      revenue: acc.revenue + m.revenue,
      cogs: acc.cogs + m.cogs,
      grossMargin: acc.grossMargin + m.grossMargin,
      opex: acc.opex + m.opex,
      ebitda: acc.ebitda + m.ebitda,
      revenuePrev: acc.revenuePrev + m.revenuePrev,
      grossMarginPrev: acc.grossMarginPrev + m.grossMarginPrev,
    }), { revenue: 0, cogs: 0, grossMargin: 0, opex: 0, ebitda: 0, revenuePrev: 0, grossMarginPrev: 0 });

    return { months, totals, currentYear, prevYear };
  }, [filteredVehicles, financeMovements]);

  // ── R-06: Forecast de ventas ──────────────────────────────────────────────
  const forecastData = useMemo(() => {
    const now = new Date();
    const sixMonthsAgo = subMonths(now, 6);
    const sixMonthInterval = { start: sixMonthsAgo, end: now };

    const recentLeads = leads.filter(l => {
      try { return isWithinInterval(new Date(l.createdAt), sixMonthInterval); } catch { return false; }
    });
    const recentWon = recentLeads.filter(l => l.status === 'won').length;
    const recentClosed = recentLeads.filter(l => l.status === 'won' || l.status === 'lost').length;
    const historicalCloseRate = recentClosed > 0 ? recentWon / recentClosed : 0;

    const pipeline = leads.filter(l => ['new', 'contacted', 'appointment', 'reserved', 'negotiation'].includes(l.status));
    const pipelineCount = pipeline.length;
    const pipelineValue = pipeline.reduce((s, l) => s + (l.budget ? Number(l.budget) : 0), 0);
    const avgBudget = pipelineCount > 0 ? pipelineValue / pipelineCount : 0;

    const forecastUnits = Math.round(pipelineCount * historicalCloseRate);
    const forecastRevenue = Math.round(pipelineValue * historicalCloseRate);

    // Pipeline por etapa
    const pipelineByStage = [
      { name: 'Nuevos', count: pipeline.filter(l => l.status === 'new').length, fill: '#3b82f6' },
      { name: 'Contactados', count: pipeline.filter(l => l.status === 'contacted').length, fill: '#8b5cf6' },
      { name: 'Cita', count: pipeline.filter(l => l.status === 'appointment').length, fill: '#f59e0b' },
      { name: 'Reservado', count: pipeline.filter(l => l.status === 'reserved').length, fill: '#10b981' },
      { name: 'Negociación', count: pipeline.filter(l => l.status === 'negotiation').length, fill: '#06b6d4' },
    ];

    // Tendencia histórica de cierre por mes (últimos 6 meses)
    const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
      const m = subMonths(now, 5 - i);
      const mStart = startOfMonth(m);
      const mEnd = endOfMonth(m);
      const mLeads = leads.filter(l => {
        try { return isWithinInterval(new Date(l.createdAt), { start: mStart, end: mEnd }); } catch { return false; }
      });
      const mWon = mLeads.filter(l => l.status === 'won').length;
      const mClosed = mLeads.filter(l => l.status === 'won' || l.status === 'lost').length;
      return {
        mes: format(m, 'MMM yy', { locale: es }),
        won: mWon,
        pipeline: mLeads.filter(l => ['new', 'contacted', 'appointment', 'reserved', 'negotiation'].includes(l.status)).length,
        rate: mClosed > 0 ? Math.round((mWon / mClosed) * 100) : 0,
      };
    });

    return {
      historicalCloseRate: Math.round(historicalCloseRate * 100),
      pipelineCount,
      pipelineValue,
      avgBudget: Math.round(avgBudget),
      forecastUnits,
      forecastRevenue,
      pipelineByStage,
      monthlyTrend,
    };
  }, [leads]);

  // ── R-08: Comparativa 3 períodos ──────────────────────────────────────────
  const tripleComparison = useMemo(() => {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const prevMonthStart = startOfMonth(subMonths(now, 1));
    const prevMonthEnd = endOfMonth(subMonths(now, 1));
    const samePrevYearStart = startOfMonth(subMonths(now, 12));
    const samePrevYearEnd = endOfMonth(subMonths(now, 12));

    const period = (start: Date, end: Date) => {
      const interval = { start, end };
      const periodSales = sales.filter(s => { try { return isWithinInterval(new Date(s.createdAt), interval); } catch { return false; } });
      const periodLeads = leads.filter(l => { try { return isWithinInterval(new Date(l.createdAt), interval); } catch { return false; } });
      const periodVehicles = vehicles.filter(v => {
        if (!v.soldAt) return false;
        try { return isWithinInterval(new Date(v.soldAt), interval); } catch { return false; }
      });
      const revenue = periodSales.reduce((s, sale) => s + (sale.salePrice || 0), 0);
      const margin = periodVehicles.reduce((s, v) => s + ((v.salePrice || 0) - v.purchasePrice), 0);
      const won = periodLeads.filter(l => l.status === 'won').length;
      const closed = periodLeads.filter(l => l.status === 'won' || l.status === 'lost').length;
      return {
        ventas: periodSales.filter(s => s.status === 'completed').length,
        revenue,
        margin,
        leads: periodLeads.length,
        convRate: closed > 0 ? Math.round((won / closed) * 100) : 0,
        ticket: periodSales.filter(s => s.status === 'completed').length > 0
          ? Math.round(revenue / periodSales.filter(s => s.status === 'completed').length) : 0,
      };
    };

    return {
      current: { label: format(now, 'MMMM yyyy', { locale: es }), ...period(currentMonthStart, currentMonthEnd) },
      prev: { label: format(subMonths(now, 1), 'MMMM yyyy', { locale: es }), ...period(prevMonthStart, prevMonthEnd) },
      samePrevYear: { label: format(subMonths(now, 12), 'MMMM yyyy', { locale: es }), ...period(samePrevYearStart, samePrevYearEnd) },
    };
  }, [sales, leads, vehicles]);

  // ── R-01: Margen real por vehículo (con costes asociados y comisiones) ───
  const realMarginData = useMemo(() => {
    return filteredVehicles
      .filter(v => v.status === 'sold' && v.salePrice)
      .map(v => {
        const costsTotal = (v.associatedCosts || []).reduce((s, c) => s + c.amount, 0);
        const vehicleCommissions = commissions.filter(c => {
          const vName = `${v.brand} ${v.model}`;
          return c.vehicleName?.includes(vName) || c.vehiclePlate === v.registrationPlate;
        });
        const commissionsTotal = vehicleCommissions.reduce((s, c) => s + c.commissionAmount, 0);
        const grossMargin = (v.salePrice || 0) - v.purchasePrice;
        const realMargin = grossMargin - costsTotal - commissionsTotal;
        const realMarginPct = v.salePrice ? Math.round((realMargin / v.salePrice) * 100) : 0;
        return {
          id: v.id,
          plate: v.registrationPlate,
          vehicle: `${v.brand} ${v.model} ${v.year}`,
          brand: v.brand,
          purchasePrice: v.purchasePrice,
          salePrice: v.salePrice || 0,
          costsTotal,
          commissionsTotal,
          grossMargin,
          realMargin,
          realMarginPct,
          days: v.daysInStock,
          costBreakdown: (v.associatedCosts || []).map(c => `${c.category}: ${c.amount}€`).join(', '),
        };
      })
      .sort((a, b) => b.realMargin - a.realMargin);
  }, [filteredVehicles, commissions]);

  // ── R-02: Revenue por comercial (sales linked to responsible) ────────────
  const commercialRevenueData = useMemo(() => {
    const map = new Map<string, { name: string; ventas: number; revenue: number; margin: number }>();
    sales.filter(s => s.status === 'completed').forEach(s => {
      const name = s.responsible || 'Sin asignar';
      const prev = map.get(name) || { name, ventas: 0, revenue: 0, margin: 0 };
      const v = vehicles.find(veh => veh.id === s.vehicleId);
      const margin = v ? (v.salePrice || s.salePrice || 0) - v.purchasePrice : 0;
      map.set(name, {
        ...prev,
        ventas: prev.ventas + 1,
        revenue: prev.revenue + (s.salePrice || 0),
        margin: prev.margin + margin,
      });
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [sales, vehicles]);

  // ── R-03: Rotación de stock (tiempo medio de venta por marca/precio) ─────
  const rotacionData = useMemo(() => {
    const soldVehicles = filteredVehicles.filter(v => v.status === 'sold' && v.soldAt);
    const byBrand = new Map<string, { brand: string; count: number; totalDays: number; totalMargin: number }>();
    const byPriceRange = new Map<string, { range: string; count: number; totalDays: number }>();
    const byModel = new Map<string, { model: string; brand: string; count: number; totalDays: number; avgPrice: number; priceSum: number }>();

    soldVehicles.forEach(v => {
      const days = v.daysInStock || 0;
      const margin = (v.salePrice || 0) - v.purchasePrice;
      const price = v.salePrice || v.purchasePrice;

      const prevB = byBrand.get(v.brand) || { brand: v.brand, count: 0, totalDays: 0, totalMargin: 0 };
      byBrand.set(v.brand, { ...prevB, count: prevB.count + 1, totalDays: prevB.totalDays + days, totalMargin: prevB.totalMargin + margin });

      const modelKey = `${v.brand} ${v.model}`;
      const prevM = byModel.get(modelKey) || { model: v.model, brand: v.brand, count: 0, totalDays: 0, avgPrice: 0, priceSum: 0 };
      byModel.set(modelKey, { ...prevM, count: prevM.count + 1, totalDays: prevM.totalDays + days, priceSum: prevM.priceSum + price, avgPrice: 0 });

      let range: string;
      if (price < 10000) range = '< 10.000€';
      else if (price < 20000) range = '10k–20k€';
      else if (price < 30000) range = '20k–30k€';
      else if (price < 50000) range = '30k–50k€';
      else range = '> 50.000€';
      const prevR = byPriceRange.get(range) || { range, count: 0, totalDays: 0 };
      byPriceRange.set(range, { ...prevR, count: prevR.count + 1, totalDays: prevR.totalDays + days });
    });

    const brandData = Array.from(byBrand.values())
      .map(b => ({ ...b, avgDays: Math.round(b.totalDays / b.count), avgMargin: Math.round(b.totalMargin / b.count) }))
      .sort((a, b) => a.avgDays - b.avgDays);

    const modelData = Array.from(byModel.values())
      .map(m => ({ ...m, avgDays: Math.round(m.totalDays / m.count), avgPrice: Math.round(m.priceSum / m.count) }))
      .sort((a, b) => a.avgDays - b.avgDays)
      .slice(0, 15);

    const PRICE_ORDER = ['< 10.000€', '10k–20k€', '20k–30k€', '30k–50k€', '> 50.000€'];
    const priceData = Array.from(byPriceRange.values())
      .map(r => ({ ...r, avgDays: Math.round(r.totalDays / r.count) }))
      .sort((a, b) => PRICE_ORDER.indexOf(a.range) - PRICE_ORDER.indexOf(b.range));

    const avgDaysTotal = soldVehicles.length
      ? Math.round(soldVehicles.reduce((s, v) => s + v.daysInStock, 0) / soldVehicles.length) : 0;
    const fastestBrand = brandData[0] || null;
    const slowestBrand = brandData[brandData.length - 1] || null;

    return { brandData, modelData, priceData, avgDaysTotal, total: soldVehicles.length, fastestBrand, slowestBrand };
  }, [filteredVehicles]);

  // ── R-05: RGPD stats ──────────────────────────────────────────────────────
  const gdprStats = useMemo(() => {
    const now = Date.now();
    const in30days = now + 30 * 86400000;
    const activeConsents = gdprConsents.filter(c => c.granted && !c.revokedAt);
    const expiringSoon = gdprConsents.filter(c =>
      c.granted && c.expiresAt && new Date(c.expiresAt).getTime() <= in30days && new Date(c.expiresAt).getTime() > now
    );
    const expired = gdprConsents.filter(c => c.expiresAt && new Date(c.expiresAt).getTime() <= now && c.granted);
    const pendingRequests = gdprRequests.filter(r => r.status === 'pending' || r.status === 'in_progress');
    const overdue = gdprRequests.filter(r =>
      r.legalDeadline && new Date(r.legalDeadline).getTime() <= now &&
      r.status !== 'completed' && r.status !== 'rejected'
    );
    const byPurpose = gdprConsents.reduce<Record<string, number>>((acc, c) => {
      acc[c.purpose] = (acc[c.purpose] || 0) + 1;
      return acc;
    }, {});
    const byRightType = gdprRequests.reduce<Record<string, number>>((acc, r) => {
      acc[r.rightType] = (acc[r.rightType] || 0) + 1;
      return acc;
    }, {});
    return { activeConsents, expiringSoon, expired, pendingRequests, overdue, byPurpose, byRightType };
  }, [gdprConsents, gdprRequests]);

  // ── R-09: Heatmap de actividad (día × hora) ───────────────────────────────
  const heatmapData = useMemo(() => {
    const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const grid: { day: number; hour: number; leads: number; sales: number; total: number }[][] =
      Array.from({ length: 7 }, (_, day) =>
        Array.from({ length: 24 }, (_, hour) => ({ day, hour, leads: 0, sales: 0, total: 0 }))
      );

    leads.forEach(l => {
      try {
        const d = new Date(l.createdAt);
        if (isNaN(d.getTime())) return;
        grid[d.getDay()][d.getHours()].leads++;
        grid[d.getDay()][d.getHours()].total++;
      } catch {}
    });

    sales.forEach(s => {
      try {
        const d = new Date(s.createdAt);
        if (isNaN(d.getTime())) return;
        grid[d.getDay()][d.getHours()].sales++;
        grid[d.getDay()][d.getHours()].total++;
      } catch {}
    });

    const maxTotal = Math.max(...grid.flatMap(d => d.map(h => h.total)), 1);
    const peakHour = grid.flat().reduce((best, cell) => cell.total > best.total ? cell : best, grid[0][0]);
    const peakDay = DAY_LABELS.reduce((bestDay, _, di) => {
      const dayTotal = grid[di].reduce((s, h) => s + h.total, 0);
      const bestTotal = grid[bestDay].reduce((s, h) => s + h.total, 0);
      return dayTotal > bestTotal ? di : bestDay;
    }, 0);

    return { grid, maxTotal, dayLabels: DAY_LABELS, peakHour, peakDay };
  }, [leads, sales]);

  // ── IR-02: Compras por proveedor ──────────────────────────────────────────
  const supplierData = useMemo(() => {
    const map = new Map<string, {
      supplier: string; total: number; totalCost: number;
      sold: number; totalRevenue: number; totalMargin: number;
      totalDays: number; soldDays: number;
    }>();

    filteredVehicles.forEach(v => {
      const name = (v as any).supplierName || (v as any).origin || 'Sin proveedor';
      const prev = map.get(name) || { supplier: name, total: 0, totalCost: 0, sold: 0, totalRevenue: 0, totalMargin: 0, totalDays: 0, soldDays: 0 };
      const isSold = v.status === 'sold' && v.salePrice;
      map.set(name, {
        ...prev,
        total: prev.total + 1,
        totalCost: prev.totalCost + v.purchasePrice,
        sold: prev.sold + (isSold ? 1 : 0),
        totalRevenue: prev.totalRevenue + (isSold ? (v.salePrice || 0) : 0),
        totalMargin: prev.totalMargin + (isSold ? ((v.salePrice || 0) - v.purchasePrice) : 0),
        totalDays: prev.totalDays + v.daysInStock,
        soldDays: prev.soldDays + (isSold ? v.daysInStock : 0),
      });
    });

    return Array.from(map.values())
      .map(s => ({
        ...s,
        avgCost: s.total > 0 ? Math.round(s.totalCost / s.total) : 0,
        avgMargin: s.sold > 0 ? Math.round(s.totalMargin / s.sold) : 0,
        avgMarginPct: s.totalRevenue > 0 ? Math.round((s.totalMargin / s.totalRevenue) * 100) : 0,
        avgDays: s.sold > 0 ? Math.round(s.soldDays / s.sold) : (s.total > 0 ? Math.round(s.totalDays / s.total) : 0),
      }))
      .sort((a, b) => b.totalMargin - a.totalMargin);
  }, [filteredVehicles]);

  const supplierStats = useMemo(() => {
    const active = supplierData.filter(s => s.supplier !== 'Sin proveedor');
    const totalInvestment = supplierData.reduce((s, p) => s + p.totalCost, 0);
    const totalMargin = supplierData.reduce((s, p) => s + p.totalMargin, 0);
    const totalSold = supplierData.reduce((s, p) => s + p.sold, 0);
    return {
      activeCount: active.length,
      totalInvestment,
      totalMargin,
      avgMarginPct: totalSold > 0 ? Math.round((totalMargin / supplierData.reduce((s, p) => s + p.totalRevenue, 0)) * 100) : 0,
      best: supplierData[0] || null,
    };
  }, [supplierData]);

  // ── IR-03: Revenue por comercial ampliado ─────────────────────────────────
  const commercialFullData = useMemo(() => {
    const map = new Map<string, {
      name: string; ventas: number; revenue: number; margin: number;
      totalCosts: number; realMargin: number;
      bestPlate: string; bestMargin: number;
    }>();

    sales.filter(s => {
      if (s.status !== 'completed') return false;
      if (filterResponsible !== 'all' && s.responsible !== filterResponsible) return false;
      try { return isWithinInterval(new Date(s.createdAt), interval); } catch { return false; }
    }).forEach(s => {
      const name = s.responsible || 'Sin asignar';
      const v = vehicles.find(veh => veh.id === s.vehicleId);
      const margin = v ? (v.salePrice || s.salePrice || 0) - v.purchasePrice : 0;
      const costs = v ? (v.associatedCosts || []).reduce((sum: number, c: any) => sum + c.amount, 0) : 0;
      const realM = margin - costs;
      const prev = map.get(name) || { name, ventas: 0, revenue: 0, margin: 0, totalCosts: 0, realMargin: 0, bestPlate: '', bestMargin: -Infinity };
      map.set(name, {
        ...prev,
        ventas: prev.ventas + 1,
        revenue: prev.revenue + (s.salePrice || 0),
        margin: prev.margin + margin,
        totalCosts: prev.totalCosts + costs,
        realMargin: prev.realMargin + realM,
        bestPlate: realM > prev.bestMargin ? (v?.registrationPlate || '') : prev.bestPlate,
        bestMargin: realM > prev.bestMargin ? realM : prev.bestMargin,
      });
    });

    return Array.from(map.values()).map(c => ({
      ...c,
      avgTicket: c.ventas > 0 ? Math.round(c.revenue / c.ventas) : 0,
      avgMargin: c.ventas > 0 ? Math.round(c.realMargin / c.ventas) : 0,
      marginPct: c.revenue > 0 ? Math.round((c.realMargin / c.revenue) * 100) : 0,
    })).sort((a, b) => b.revenue - a.revenue);
  }, [sales, vehicles, filterResponsible, interval]);

  // ── IR-05: Gastos de preparación acumulados ───────────────────────────────
  const preparationCostsData = useMemo(() => {
    const byCategory = new Map<string, { category: string; total: number; count: number }>();
    const byVehicle = new Map<string, { id: string; plate: string; vehicle: string; total: number }>();
    let totalAmount = 0;
    let vehiclesWithCosts = 0;

    filteredVehicles.forEach(v => {
      const costs = v.associatedCosts || [];
      if (costs.length === 0) return;
      vehiclesWithCosts++;
      let vTotal = 0;
      costs.forEach((c: any) => {
        const cat = c.category || 'Otros';
        const prev = byCategory.get(cat) || { category: cat, total: 0, count: 0 };
        byCategory.set(cat, { ...prev, total: prev.total + c.amount, count: prev.count + 1 });
        totalAmount += c.amount;
        vTotal += c.amount;
      });
      byVehicle.set(v.id, { id: v.id, plate: v.registrationPlate, vehicle: `${v.brand} ${v.model} ${v.year}`, total: vTotal });
    });

    const topVehiclesByCost = Array.from(byVehicle.values()).sort((a, b) => b.total - a.total).slice(0, 10);
    const categories = Array.from(byCategory.values()).sort((a, b) => b.total - a.total);

    return {
      categories,
      topVehiclesByCost,
      vehiclesWithCosts,
      totalAmount,
      avgPerVehicle: vehiclesWithCosts > 0 ? Math.round(totalAmount / vehiclesWithCosts) : 0,
      topCategory: categories[0] || null,
    };
  }, [filteredVehicles]);

  // ── IR-07: Alertas locales de rentabilidad ────────────────────────────────
  const reportAlerts = useMemo(() => {
    const alerts: { id: string; level: 'warning' | 'alert'; icon: React.ReactNode; title: string; message: string; route?: string }[] = [];

    if (marginStats.avgPct > 0 && marginStats.avgPct < 8) {
      alerts.push({
        id: 'low-margin', level: marginStats.avgPct < 3 ? 'alert' : 'warning',
        icon: <TrendingDown className="w-4 h-4" />, title: 'Margen medio bajo',
        message: `El margen medio de los vehículos vendidos es del ${marginStats.avgPct}% (objetivo: ≥ 8%).`,
      });
    }

    const parked90 = stockAgeStats.g90;
    if (parked90 >= 5) {
      alerts.push({
        id: 'parked-vehicles', level: parked90 >= 10 ? 'alert' : 'warning',
        icon: <Clock className="w-4 h-4" />, title: `${parked90} vehículos > 90 días en stock`,
        message: `Impacto estimado en margen: ${formatEur(stockAgeStats.totalMarginImpact)}.`,
        route: '/saas/vehicles',
      });
    }

    if (preparationCostsData.avgPerVehicle > 1500) {
      alerts.push({
        id: 'excess-costs', level: preparationCostsData.avgPerVehicle > 2500 ? 'alert' : 'warning',
        icon: <AlertTriangle className="w-4 h-4" />, title: 'Gasto de preparación elevado',
        message: `Media de ${formatEur(preparationCostsData.avgPerVehicle)} por vehículo (objetivo: < 1.500 €).`,
      });
    }

    if (tripleComparison.prev.ventas > 0) {
      const dropPct = Math.round(((tripleComparison.current.ventas - tripleComparison.prev.ventas) / tripleComparison.prev.ventas) * 100);
      if (dropPct <= -30) {
        alerts.push({
          id: 'sales-drop', level: dropPct <= -50 ? 'alert' : 'warning',
          icon: <TrendingDown className="w-4 h-4" />, title: 'Caída significativa de ventas',
          message: `${dropPct}% vs mes anterior (${tripleComparison.current.ventas} vs ${tripleComparison.prev.ventas}).`,
        });
      }
    }

    return alerts;
  }, [marginStats, stockAgeStats, preparationCostsData, tripleComparison]);

  // ── IR-11: Previsión de cierre de mes ─────────────────────────────────────
  const monthEndForecast = useMemo(() => {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const remainingDays = daysInMonth - dayOfMonth;
    const pctElapsed = dayOfMonth / daysInMonth;
    const currentMonthIdx = now.getMonth();
    const currentMonth = rentabilidadData.months[currentMonthIdx];
    if (!currentMonth || currentMonth.revenue === 0) return null;

    const projectedRevenue = pctElapsed > 0 ? Math.round(currentMonth.revenue / pctElapsed) : 0;
    const projectedCogs = pctElapsed > 0 ? Math.round(currentMonth.cogs / pctElapsed) : 0;
    const projectedGrossMargin = projectedRevenue - projectedCogs;
    const projectedOpex = pctElapsed > 0 ? Math.round(currentMonth.opex / pctElapsed) : 0;
    const projectedEbitda = projectedGrossMargin - projectedOpex;

    const pipelineMarginEstimate = forecastData.forecastUnits * (marginStats.avg || 0);
    const optimistic = projectedEbitda + Math.round(pipelineMarginEstimate * 0.3);
    const conservative = projectedEbitda;
    const pessimistic = Math.round(projectedEbitda * 0.7);

    return {
      dayOfMonth, daysInMonth, remainingDays, pctElapsed: Math.round(pctElapsed * 100),
      actual: { revenue: currentMonth.revenue, grossMargin: currentMonth.grossMargin, opex: currentMonth.opex, ebitda: currentMonth.ebitda },
      projected: { revenue: projectedRevenue, grossMargin: projectedGrossMargin, opex: projectedOpex, ebitda: projectedEbitda },
      scenarios: { optimistic, conservative, pessimistic },
      pipelineUnits: forecastData.forecastUnits, pipelineMarginEstimate,
    };
  }, [rentabilidadData, forecastData, marginStats]);

  // ── Exportar ──────────────────────────────────────────────────────────────
  const handleExportExcel = async () => {
    setExporting(true);
    try {
      if (tab === 'ventas') {
        await exportToExcel(filteredSales.map(s => ({
          ID: s.id, Fecha: format(new Date(s.createdAt), 'dd/MM/yyyy'),
          Estado: s.status === 'completed' ? 'Completada' : s.status === 'cancelled' ? 'Cancelada' : 'Pendiente',
          'Precio Venta': s.salePrice, Notas: s.notes || '',
        })), `Informe_Ventas_${dateFrom}_${dateTo}`);
      } else if (tab === 'inventario') {
        await exportToExcel(vehicles.map(v => ({
          Matrícula: v.registrationPlate, Marca: v.brand, Modelo: v.model,
          Año: v.year, Estado: v.status, 'Precio Compra': v.purchasePrice,
          'Precio Venta': v.salePrice || '', 'Días en Stock': v.daysInStock,
        })), `Informe_Inventario_${format(new Date(), 'yyyy-MM-dd')}`);
      } else if (tab === 'crm') {
        await exportToExcel(filteredLeads.map(l => ({
          Nombre: l.name, Teléfono: l.phone, Origen: l.source,
          Estado: l.status, Responsable: l.responsible || '', Creado: format(new Date(l.createdAt), 'dd/MM/yyyy'),
        })), `Informe_CRM_${dateFrom}_${dateTo}`);
      } else if (tab === 'margen') {
        await exportToExcel(realMarginData.map(v => ({
          Matrícula: v.plate, Vehículo: v.vehicle,
          'P. Compra': v.purchasePrice, 'P. Venta': v.salePrice,
          'Costes Adicionales': v.costsTotal, Comisiones: v.commissionsTotal,
          'Margen Bruto': v.grossMargin, 'Margen Real': v.realMargin, '% Margen Real': `${v.realMarginPct}%`,
          'Días Stock': v.days,
        })), `Informe_Rentabilidad_Real_${format(new Date(), 'yyyy-MM-dd')}`);
      } else if (tab === 'comerciales') {
        await exportToExcel(commercialData.map(c => ({
          Comercial: c.name, Leads: c.leads, Ganados: c.won, Perdidos: c.lost,
          'Tasa Conversión': `${c.conversion}%`, 'Presup. Medio': c.avgBudget,
        })), `Informe_Comerciales_${dateFrom}_${dateTo}`);
      } else if (tab === 'financiero') {
        await exportToExcel(filteredFinance.map(m => ({
          Tipo: m.type, Concepto: m.concept, Categoría: m.category,
          Base: m.amountBase, IVA: m.taxAmount, Total: m.totalAmount,
          Fecha: m.date, Método: m.payMethod,
        })), `Informe_Financiero_${dateFrom}_${dateTo}`);
      } else if (tab === 'comparativa') {
        const { data: cmpData, currentYear, prevYear } = yearlyComparison;
        await exportToExcel(cmpData.map(d => ({
          Mes: d.mes,
          [`Ventas ${currentYear}`]: d[`Ventas ${currentYear}`],
          [`Ventas ${prevYear}`]: d[`Ventas ${prevYear}`],
          [`Ingresos ${currentYear}`]: d[`Ingresos ${currentYear}`],
          [`Ingresos ${prevYear}`]: d[`Ingresos ${prevYear}`],
          [`Margen ${currentYear}`]: d[`Margen ${currentYear}`],
          [`Margen ${prevYear}`]: d[`Margen ${prevYear}`],
        })), `Comparativa_${prevYear}_vs_${currentYear}`);
      } else if (tab === 'rentabilidad') {
        await exportToExcel(rentabilidadData.months.map(m => ({
          Mes: m.mes,
          'Revenue': m.revenue,
          'COGS': m.cogs,
          'Margen Bruto': m.grossMargin,
          '% Margen': m.revenue > 0 ? `${Math.round((m.grossMargin / m.revenue) * 100)}%` : '0%',
          'Gastos Operativos': m.opex,
          'EBITDA Estimado': m.ebitda,
        })), `Informe_Rentabilidad_${rentabilidadData.currentYear}`);
      } else if (tab === 'forecast') {
        await exportToExcel(forecastData.monthlyTrend.map(m => ({
          Mes: m.mes,
          'Leads Ganados': m.won,
          'Pipeline': m.pipeline,
          'Tasa Cierre (%)': `${m.rate}%`,
        })), `Informe_Forecast_${format(new Date(), 'yyyy-MM-dd')}`);
      } else if (tab === 'rotacion') {
        await exportToExcel(rotacionData.brandData.map(b => ({
          Marca: b.brand, 'Unidades Vendidas': b.count,
          'Días Medio Venta': b.avgDays, 'Margen Medio': b.avgMargin,
        })), `Rotacion_Stock_${format(new Date(), 'yyyy-MM-dd')}`);
      } else if (tab === 'rgpd') {
        await exportToExcel(gdprConsents.map(c => ({
          Cliente: c.clientName, Email: c.clientEmail, DNI: c.clientDni,
          Finalidad: c.purpose, Canal: c.channel, Activo: c.granted ? 'Sí' : 'No',
          'Fecha Consentimiento': c.grantedAt ? format(new Date(c.grantedAt), 'dd/MM/yyyy') : '—',
          'Vence': c.expiresAt ? format(new Date(c.expiresAt), 'dd/MM/yyyy') : 'Sin vencimiento',
        })), `RGPD_Consentimientos_${format(new Date(), 'yyyy-MM-dd')}`);
      }
    } catch (err) {
      console.error('Error exportando Excel:', err);
    }
    setExporting(false);
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      if (tab === 'ventas') {
        await exportToPdf('Informe de Ventas',
          filteredSales.map(s => [s.id, format(new Date(s.createdAt), 'dd/MM/yyyy'), s.status, formatEur(s.salePrice)]),
          ['ID', 'Fecha', 'Estado', 'Importe']);
      } else if (tab === 'inventario') {
        await exportToPdf('Informe de Inventario',
          vehicles.map(v => [v.registrationPlate, `${v.brand} ${v.model}`, String(v.year), v.status, String(v.daysInStock) + 'd']),
          ['Matrícula', 'Vehículo', 'Año', 'Estado', 'Días Stock']);
      } else if (tab === 'crm') {
        await exportToPdf('Informe CRM',
          filteredLeads.map(l => [l.name, l.phone, l.source, l.status, format(new Date(l.createdAt), 'dd/MM/yyyy')]),
          ['Nombre', 'Teléfono', 'Origen', 'Estado', 'Fecha']);
      } else if (tab === 'margen') {
        await exportToPdf('Rentabilidad Real por Vehículo',
          realMarginData.map(v => [v.plate, v.vehicle, formatEur(v.purchasePrice), formatEur(v.salePrice), formatEur(v.costsTotal + v.commissionsTotal), formatEur(v.realMargin), `${v.realMarginPct}%`]),
          ['Matrícula', 'Vehículo', 'P.Compra', 'P.Venta', 'Deducciones', 'M.Real', '%']);
      } else if (tab === 'comerciales') {
        await exportToPdf('Informe de Comerciales',
          commercialData.map(c => [c.name, String(c.leads), String(c.won), String(c.lost), `${c.conversion}%`]),
          ['Comercial', 'Leads', 'Ganados', 'Perdidos', 'Conversión']);
      } else if (tab === 'financiero') {
        await exportToPdf('Informe Financiero',
          filteredFinance.map(m => [m.type, m.concept, m.category, formatEur(m.totalAmount), m.date]),
          ['Tipo', 'Concepto', 'Categoría', 'Total', 'Fecha']);
      } else if (tab === 'comparativa') {
        const { data, currentYear, prevYear } = yearlyComparison;
        await exportToPdf(`Comparativa ${prevYear} vs ${currentYear}`,
          data.map(d => [d.mes, String(d[`Ventas ${currentYear}`]), String(d[`Ventas ${prevYear}`]),
            formatEur(Number(d[`Ingresos ${currentYear}`])), formatEur(Number(d[`Ingresos ${prevYear}`]))]),
          ['Mes', `Ventas ${currentYear}`, `Ventas ${prevYear}`, `Ingresos ${currentYear}`, `Ingresos ${prevYear}`]);
      } else if (tab === 'rentabilidad') {
        await exportToPdf(`Rentabilidad ${rentabilidadData.currentYear}`,
          rentabilidadData.months.map(m => [m.mes, formatEur(m.revenue), formatEur(m.grossMargin), formatEur(m.opex), formatEur(m.ebitda)]),
          ['Mes', 'Revenue', 'Margen Bruto', 'Gastos Op.', 'EBITDA Est.']);
      } else if (tab === 'forecast') {
        await exportToPdf('Forecast de Ventas',
          forecastData.monthlyTrend.map(m => [m.mes, String(m.won), String(m.pipeline), `${m.rate}%`]),
          ['Mes', 'Ganados', 'Pipeline', 'Tasa Cierre']);
      } else if (tab === 'rotacion') {
        await exportToPdf('Rotación de Stock por Marca',
          rotacionData.brandData.map(b => [b.brand, String(b.count), `${b.avgDays}d`, formatEur(b.avgMargin)]),
          ['Marca', 'Unidades', 'Días Medio', 'Margen Medio']);
      } else if (tab === 'rgpd') {
        await exportToPdf('Informe RGPD — Consentimientos',
          gdprConsents.slice(0, 50).map(c => [c.clientName, c.purpose, c.granted ? 'Activo' : 'Revocado', c.expiresAt ? format(new Date(c.expiresAt), 'dd/MM/yy') : '—']),
          ['Cliente', 'Finalidad', 'Estado', 'Vence']);
      }
    } catch (err) {
      console.error('Error exportando PDF:', err);
    }
    setExporting(false);
  };

  const handleExportCsv = () => {
    if (tab === 'ventas') {
      exportToCsv(filteredSales.map(s => ({
        ID: s.id, Fecha: format(new Date(s.createdAt), 'dd/MM/yyyy'),
        Estado: s.status === 'completed' ? 'Completada' : s.status === 'cancelled' ? 'Cancelada' : 'Pendiente',
        'Precio Venta': s.salePrice, Responsable: s.responsible || '', Notas: s.notes || '',
      })), `Ventas_${dateFrom}_${dateTo}`);
    } else if (tab === 'inventario') {
      exportToCsv(vehicles.map(v => ({
        Matrícula: v.registrationPlate, Marca: v.brand, Modelo: v.model,
        Año: v.year, Estado: v.status, 'Precio Compra': v.purchasePrice,
        'Precio Venta': v.salePrice || '', 'Días en Stock': v.daysInStock,
      })), `Inventario_${format(new Date(), 'yyyy-MM-dd')}`);
    } else if (tab === 'crm') {
      exportToCsv(filteredLeads.map(l => ({
        Nombre: l.name, Teléfono: l.phone, Origen: l.source,
        Estado: l.status, Responsable: l.responsible || '', Creado: format(new Date(l.createdAt), 'dd/MM/yyyy'),
      })), `CRM_${dateFrom}_${dateTo}`);
    } else if (tab === 'margen') {
      exportToCsv(realMarginData.map(v => ({
        Matrícula: v.plate, Vehículo: v.vehicle,
        'P. Compra': v.purchasePrice, 'P. Venta': v.salePrice,
        'Costes Adicionales': v.costsTotal, Comisiones: v.commissionsTotal,
        'Margen Bruto': v.grossMargin, 'Margen Real': v.realMargin, '% Margen Real': `${v.realMarginPct}%`,
        'Días Stock': v.days,
      })), `Rentabilidad_Vehiculos_${format(new Date(), 'yyyy-MM-dd')}`);
    } else if (tab === 'comerciales') {
      exportToCsv(commercialData.map(c => ({
        Comercial: c.name, Leads: c.leads, Ganados: c.won, Perdidos: c.lost,
        'Tasa Conversión': `${c.conversion}%`, 'Presup. Medio': c.avgBudget,
      })), `Comerciales_${dateFrom}_${dateTo}`);
    } else if (tab === 'financiero') {
      exportToCsv(filteredFinance.map(m => ({
        Tipo: m.type, Concepto: m.concept, Categoría: m.category,
        Base: m.amountBase, IVA: m.taxAmount, Total: m.totalAmount,
        Fecha: m.date, Método: m.payMethod,
      })), `Financiero_${dateFrom}_${dateTo}`);
    } else if (tab === 'rotacion') {
      exportToCsv(rotacionData.brandData.map(b => ({
        Marca: b.brand, 'Unidades Vendidas': b.count,
        'Días Medio Venta': b.avgDays, 'Margen Medio': b.avgMargin,
      })), `Rotacion_Stock_${format(new Date(), 'yyyy-MM-dd')}`);
    } else if (tab === 'rgpd') {
      exportToCsv(gdprConsents.map(c => ({
        Cliente: c.clientName, Email: c.clientEmail, DNI: c.clientDni,
        Finalidad: c.purpose, Canal: c.channel, Activo: c.granted ? 'Sí' : 'No',
        'Fecha Consentimiento': c.grantedAt ? format(new Date(c.grantedAt), 'dd/MM/yyyy') : '—',
        'Vence': c.expiresAt ? format(new Date(c.expiresAt), 'dd/MM/yyyy') : 'Sin vencimiento',
      })), `RGPD_Consentimientos_${format(new Date(), 'yyyy-MM-dd')}`);
    } else if (tab === 'rentabilidad') {
      exportToCsv(rentabilidadData.months.map(m => ({
        Mes: m.mes, Revenue: m.revenue, COGS: m.cogs,
        'Margen Bruto': m.grossMargin, 'Gastos Op.': m.opex, 'EBITDA Est.': m.ebitda,
      })), `Rentabilidad_${rentabilidadData.currentYear}`);
    } else if (tab === 'comparativa') {
      const { data: cmpData, currentYear, prevYear } = yearlyComparison;
      exportToCsv(cmpData.map(d => ({
        Mes: d.mes,
        [`Ventas ${currentYear}`]: d[`Ventas ${currentYear}`],
        [`Ventas ${prevYear}`]: d[`Ventas ${prevYear}`],
        [`Ingresos ${currentYear}`]: d[`Ingresos ${currentYear}`],
        [`Ingresos ${prevYear}`]: d[`Ingresos ${prevYear}`],
      })), `Comparativa_${prevYear}_vs_${currentYear}`);
    } else if (tab === 'forecast') {
      exportToCsv(forecastData.monthlyTrend.map(m => ({
        Mes: m.mes, 'Leads Ganados': m.won, Pipeline: m.pipeline, 'Tasa Cierre': `${m.rate}%`,
      })), `Forecast_${format(new Date(), 'yyyy-MM-dd')}`);
    }
  };

  const REPORT_TAB_ICONS: Record<ReportTab, React.ReactNode> = {
    ventas: <TrendingUp className="w-4 h-4" />,
    inventario: <Car className="w-4 h-4" />,
    rotacion: <RotateCcw className="w-4 h-4" />,
    crm: <Users className="w-4 h-4" />,
    financiero: <Wallet className="w-4 h-4" />,
    rentabilidad: <Layers className="w-4 h-4" />,
    margen: <BarChart2 className="w-4 h-4" />,
    comerciales: <Award className="w-4 h-4" />,
    proveedores: <Truck className="w-4 h-4" />,
    forecast: <Zap className="w-4 h-4" />,
    comparativa: <ArrowRightLeft className="w-4 h-4" />,
    grupo: <Building2 className="w-4 h-4" />,
    rgpd: <Shield className="w-4 h-4" />,
    heatmap: <Grid3X3 className="w-4 h-4" />,
  };

  const visibleTabs = useMemo(
    () =>
      REPORT_CATALOG.map((entry) => ({
        ...entry,
        icon: REPORT_TAB_ICONS[entry.id],
        unlocked: canAccessReport(entry.id),
      })),
    [canAccessReport],
  );

  const handleTabClick = (id: ReportTab, unlocked: boolean) => {
    if (!unlocked) {
      const entry = findReport(id);
      toast.info(
        entry
          ? `Informe «${entry.label}» disponible desde plan ${requiredPlanLabel(entry)}`
          : 'Informe no disponible en tu plan',
      );
      return;
    }
    setTab(id);
  };

  const PRESETS: { id: DatePreset; label: string }[] = [
    { id: 'month', label: 'Mes actual' },
    { id: '7d', label: '7d' }, { id: '30d', label: '30d' },
    { id: '90d', label: '90d' }, { id: '6m', label: '6m' },
    { id: '1y', label: '1 año' }, { id: 'custom', label: 'Custom' },
  ];

  return (
    <Layout title={t('reports.title')} subtitle={t('reports.subtitle')}>
      <div className="p-4 md:p-6 space-y-5">

        {/* ── Shortcuts de navegación ────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 text-[10px] px-1">
          <Link to="/saas/dashboard" className="text-gray-400 hover:text-blue-500 transition-colors">Dashboard</Link>
          <span className="text-gray-300">·</span>
          <Link to="/saas/vehicles" className="text-gray-400 hover:text-blue-500 transition-colors">Vehículos</Link>
          <span className="text-gray-300">·</span>
          <Link to="/saas/sales" className="text-gray-400 hover:text-blue-500 transition-colors">Ventas</Link>
          <span className="text-gray-300">·</span>
          <Link to="/saas/finance" className="text-gray-400 hover:text-blue-500 transition-colors">Finanzas</Link>
          <span className="text-gray-300">·</span>
          <Link to="/saas/team" className="text-gray-400 hover:text-blue-500 transition-colors">Equipo</Link>
        </div>

        {/* ── Cabecera: filtros + export ──────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <Filter className="w-4 h-4" />
              <span className="text-sm font-medium hidden sm:inline">Período:</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    preset === p.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <div className="flex items-center gap-2">
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                <span className="text-gray-400 dark:text-gray-500 text-xs">→</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
              </div>
            )}
            {hasWorkCenters && (
              <select
                value={filterWorkCenter}
                onChange={e => setFilterWorkCenter(e.target.value)}
                className="px-3 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:border-blue-500 outline-none"
              >
                <option value="all">Todos los centros</option>
                {activeWorkCenters.map(wc => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
              </select>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={handleExportExcel} disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-40">
                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
              </button>
              <button onClick={handleExportPdf} disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors disabled:opacity-40">
                <FileText className="w-3.5 h-3.5" /> PDF
              </button>
              <button onClick={handleExportCsv} disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-40">
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              {exporting && <RefreshCw className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 animate-spin" />}
            </div>
          </div>

          {/* ── Filtros avanzados ──────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2">
            {uniqueBrands.length > 0 && (
              <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)}
                className="px-3 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:border-blue-500 outline-none">
                <option value="all">Todas las marcas</option>
                {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
            {uniqueResponsibles.length > 0 && (
              <select value={filterResponsible} onChange={e => setFilterResponsible(e.target.value)}
                className="px-3 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:border-blue-500 outline-none">
                <option value="all">Todos los comerciales</option>
                {uniqueResponsibles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
            {uniqueSuppliers.length > 0 && (
              <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
                className="px-3 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:border-blue-500 outline-none">
                <option value="all">Todos los proveedores</option>
                {uniqueSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            <select value={filterVehicleStatus} onChange={e => setFilterVehicleStatus(e.target.value)}
              className="px-3 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-xs font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:border-blue-500 outline-none">
              <option value="all">Todos los estados</option>
              <option value="available">Disponible</option>
              <option value="reserved">Reservado</option>
              <option value="sold">Vendido</option>
              <option value="workshop">Taller</option>
            </select>
            {hasActiveFilters && (
              <button onClick={clearAllFilters}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl hover:bg-red-100 transition-colors">
                <X className="w-3 h-3" /> Limpiar
              </button>
            )}
          </div>

          {/* ── Chips de filtros activos ────────────────────────────────────── */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-1.5">
              {filterBrand !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  Marca: {filterBrand} <button onClick={() => setFilterBrand('all')} className="hover:text-blue-900">×</button>
                </span>
              )}
              {filterResponsible !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                  Comercial: {filterResponsible} <button onClick={() => setFilterResponsible('all')} className="hover:text-purple-900">×</button>
                </span>
              )}
              {filterSupplier !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                  Proveedor: {filterSupplier} <button onClick={() => setFilterSupplier('all')} className="hover:text-amber-900">×</button>
                </span>
              )}
              {filterVehicleStatus !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                  Estado: {filterVehicleStatus} <button onClick={() => setFilterVehicleStatus('all')} className="hover:text-emerald-900">×</button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Panel de alertas de rentabilidad ──────────────────────────────── */}
        {canViewFullReports && reportAlerts.filter(a => !dismissedAlerts.has(a.id)).length > 0 && (
          <div className="space-y-2">
            {reportAlerts.filter(a => !dismissedAlerts.has(a.id)).map(a => (
              <div key={a.id} className={`flex items-start gap-3 p-3 rounded-xl border ${
                a.level === 'alert' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300' :
                'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
              }`}>
                <div className="mt-0.5 flex-shrink-0">{a.icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold">{a.title}</p>
                  <p className="text-[10px] mt-0.5 opacity-80">{a.message}</p>
                </div>
                {a.route && (
                  <Link to={a.route} className="text-[10px] font-semibold underline flex-shrink-0">Ver</Link>
                )}
                <button onClick={() => setDismissedAlerts(prev => new Set([...prev, a.id]))}
                  className="opacity-50 hover:opacity-100 flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        {/* ── Plan / permisos ─────────────────────────────────────────────── */}
        {isBasicPlan && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/40 dark:to-violet-950/30 border border-indigo-200 dark:border-indigo-800">
            <div className="flex items-start gap-3 flex-1">
              <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-indigo-900 dark:text-indigo-100">
                  Plan {planLabel} — informes limitados
                </p>
                <p className="text-xs text-indigo-700/90 dark:text-indigo-300 mt-1">
                  Tienes {unlockedReports.length} informe{unlockedReports.length !== 1 ? 's' : ''} de demo
                  (Ventas e Inventario). El resto se desbloquea desde plan Normal.
                  {lockedReports.length > 0 ? ` · ${lockedReports.length} informes bloqueados` : ''}
                </p>
              </div>
            </div>
            <Link
              to="/saas/billing"
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors shrink-0"
            >
              Ver planes
            </Link>
          </div>
        )}

        {!canViewFullReports && !isBasicPlan && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300">
            <Info className="w-4 h-4 flex-shrink-0" />
            <p className="text-xs">Los informes financieros sensibles requieren permiso de gerente. Operativos disponibles según tu plan ({planLabel}).</p>
          </div>
        )}

        {/* ── Tabs (todos visibles; bloqueados con candado) ───────────────── */}
        <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-700 rounded-xl p-1 w-full overflow-x-auto scrollbar-none">
          {visibleTabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabClick(t.id, t.unlocked)}
              title={t.unlocked ? t.description : `Plan ${requiredPlanLabel(t)}`}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap flex-1 justify-center ${
                tab === t.id && t.unlocked
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                  : t.unlocked
                    ? 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    : 'text-gray-400 dark:text-gray-600 opacity-60 cursor-not-allowed'
              }`}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
              {!t.unlocked && <Lock className="w-3 h-3" />}
            </button>
          ))}
        </div>

        {!canAccessReport(tab) && (
          <div className="rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 p-10 text-center">
            <Lock className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Informe no disponible en tu plan</p>
            <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto">
              Sube a plan Normal o Pro para acceder a informes mensuales completos.
            </p>
          </div>
        )}

        {canAccessReport(tab) && (
        <>
        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: VENTAS                                                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'ventas' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard title="Ventas en período" value={String(filteredSales.length)}
                sub={`${filteredSales.filter(s => s.status === 'completed').length} completadas`}
                icon={<ShoppingCart className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30" />
              <KPICard title="Ingresos totales" value={formatEur(totalRevenue)}
                sub="Suma precios de venta"
                icon={<Euro className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30" />
              <KPICard title="Ticket medio" value={avgTicket ? formatEur(avgTicket) : '—'}
                sub="Por venta completada"
                icon={<TrendingUp className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30" />
              <KPICard title="Canceladas" value={String(filteredSales.filter(s => s.status === 'cancelled').length)}
                sub={`de ${filteredSales.length} totales`}
                icon={<Calendar className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/30" />
            </div>

            {salesByMonth.length > 0 ? (
              <div className="grid md:grid-cols-2 gap-5">
                <ChartCard title="Ventas por mes" period={preset}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={salesByMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [name === 'importe' ? formatEur(v) : v, name === 'importe' ? 'Importe' : 'Ventas']} />
                      <Bar dataKey="ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Ventas" />
                      <Bar dataKey="importe" fill="#10b981" radius={[4, 4, 0, 0]} name="Importe" />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Margen bruto por mes" period={preset}>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={salesByMonth}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                      <Area type="monotone" dataKey="margen" fill="#f0fdf4" stroke="#10b981" strokeWidth={2} name="Margen" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
                <TrendingUp className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">Sin ventas en el período seleccionado</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Ajusta el rango de fechas</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: INVENTARIO                                                   */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'inventario' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard title="Total vehículos" value={String(vehicles.length)} sub="En catálogo"
                icon={<Car className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30" />
              <KPICard title="Disponibles" value={String(vehicles.filter(v => v.status === 'available').length)} sub="Listos para venta"
                icon={<Car className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30" />
              <KPICard title="Valor stock" value={formatEur(vehicles.filter(v => v.status === 'available').reduce((s, v) => s + v.purchasePrice, 0))}
                sub="Vehículos disponibles"
                icon={<Euro className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30" />
              <KPICard title="Días medio stock" value={vehicles.length ? String(Math.round(vehicles.reduce((s, v) => s + v.daysInStock, 0) / vehicles.length)) : '—'}
                sub="Promedio general"
                icon={<Calendar className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/30" />
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <ChartCard title="Top marcas en stock" period={preset}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={vehiclesByBrand} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Unidades" />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Estado del inventario" period={preset}>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={vehiclesByStatus} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                      label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}>
                      {vehiclesByStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* R-04: Antigüedad de stock 4 grupos + impacto en margen */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Stock Aging</h3>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                    {stockAgeData.length} vehículos
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-lg">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> {stockAgeStats.g0} · 0-30d
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> {stockAgeStats.g30} · 31-60d
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-2 py-1 rounded-lg">
                    <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> {stockAgeStats.g60} · 61-90d
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-lg">
                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> {stockAgeStats.g90} · +90d
                  </span>
                  {stockAgeStats.totalMarginImpact < 0 && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded-lg">
                      <AlertTriangle className="w-3 h-3" /> Impacto margen: {formatEur(stockAgeStats.totalMarginImpact)}
                    </span>
                  )}
                </div>
              </div>

              {/* Mini chart de distribución */}
              {stockAgeData.length > 0 && (
                <div className="px-5 py-3 border-b border-gray-50/50">
                  <div className="flex gap-1 h-6 rounded-lg overflow-hidden">
                    {[
                      { count: stockAgeStats.g0, color: 'bg-emerald-400', label: '0-30d' },
                      { count: stockAgeStats.g30, color: 'bg-amber-400', label: '31-60d' },
                      { count: stockAgeStats.g60, color: 'bg-orange-400', label: '61-90d' },
                      { count: stockAgeStats.g90, color: 'bg-red-500', label: '+90d' },
                    ].filter(s => s.count > 0).map(s => (
                      <div
                        key={s.label}
                        className={`${s.color} flex items-center justify-center text-white text-[9px] font-bold transition-all`}
                        style={{ width: `${(s.count / stockAgeData.length) * 100}%` }}
                        title={`${s.label}: ${s.count} vehículos`}
                      >
                        {s.count > 1 ? s.count : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stockAgeData.length === 0 ? (
                <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">No hay vehículos en stock</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Matrícula</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Vehículo</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Estado</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">P. Compra</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">P. Venta</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Días</th>
                        <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Impacto margen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {stockAgeData.map(v => {
                        const alertColors = {
                          green:  { row: '', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500' },
                          yellow: { row: 'bg-amber-50/30 dark:bg-amber-900/5',  badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',   dot: 'bg-amber-500' },
                          orange: { row: 'bg-orange-50/30 dark:bg-orange-900/5', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', dot: 'bg-orange-500' },
                          red:    { row: 'bg-red-50/30 dark:bg-red-900/5',    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',     dot: 'bg-red-500' },
                        }[v.alert];
                        return (
                          <tr key={v.id} className={`hover:bg-gray-50/30 transition-colors ${alertColors.row}`}>
                            <td className="px-5 py-3">
                              <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">{v.plate}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300 max-w-[200px] truncate">{v.vehicle}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${v.status === 'available' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                {v.status === 'available' ? 'Disponible' : 'Reservado'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-gray-600 dark:text-gray-400">{formatEur(v.purchasePrice)}</td>
                            <td className="px-4 py-3 text-right text-xs text-gray-600 dark:text-gray-400">{v.salePrice ? formatEur(v.salePrice) : '—'}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full ${alertColors.badge}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${alertColors.dot}`} />
                                {v.days}d
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <span className={`text-xs font-bold ${v.marginImpact < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                                {v.marginImpact < 0 ? formatEur(v.marginImpact) : '—'}
                              </span>
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

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: CRM (R-05 Funnel)                                           */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'crm' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard title="Leads en período" value={String(filteredLeads.length)} sub={`${dateFrom} → ${dateTo}`}
                icon={<Users className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30" />
              <KPICard title="Tasa conversión" value={`${conversionRate}%`} sub="Leads ganados / total"
                icon={<TrendingUp className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30"
                trend={conversionRate > 0 ? { value: `${filteredLeads.filter(l => l.status === 'won').length} ganados`, up: conversionRate >= 15 } : undefined} />
              <KPICard title="Clientes activos" value={String(clients.filter(c => c.status === 'active').length)} sub="Total cartera"
                icon={<Users className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30" />
              <KPICard title="Leads perdidos" value={String(filteredLeads.filter(l => l.status === 'lost').length)} sub="En el período"
                icon={<Download className="w-4 h-4 text-red-600" />} color="bg-red-50 dark:bg-red-900/30" />
            </div>

            {/* R-05: Embudo de conversión CRM */}
            {crmFunnelData.length > 0 && crmFunnelData[0].value > 0 ? (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Target className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Embudo de conversión CRM</h3>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">Tasas de paso entre etapas</span>
                </div>
                <div className="grid md:grid-cols-2 gap-6 items-center">
                  {/* Funnel visual */}
                  <div className="space-y-2">
                    {crmFunnelData.map((stage, i) => (
                      <div key={stage.name} className="relative">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 w-36 flex-shrink-0">{stage.name}</span>
                          <span className="text-xs font-black" style={{ color: stage.fill }}>{stage.value}</span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">({stage.pct}%)</span>
                          {i > 0 && (
                            <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                              ↓ {stage.convRate}%
                            </span>
                          )}
                        </div>
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                            style={{ width: `${stage.pct}%`, backgroundColor: stage.fill }}
                          >
                            {stage.pct > 10 && <span className="text-white text-[9px] font-bold">{stage.value}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Recharts Funnel */}
                  <ResponsiveContainer width="100%" height={240}>
                    <FunnelChart>
                      <Tooltip {...tooltipStyle} formatter={(v: number, _: string, props: { payload?: { name?: string } }) => [`${v} leads`, props.payload?.name || '']} />
                      <Funnel dataKey="value" data={crmFunnelData} isAnimationActive>
                        <LabelList dataKey="name" position="right" style={{ fontSize: 11, fill: '#6b7280' }} />
                      </Funnel>
                    </FunnelChart>
                  </ResponsiveContainer>
                </div>

                {/* Resumen tasas entre etapas */}
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  {crmFunnelData.slice(1).map((stage, i) => (
                    <div key={stage.name} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50/50 rounded-xl">
                      <ChevronRight className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">{crmFunnelData[i].name} → {stage.name}</span>
                      <span className={`text-[10px] font-black ${stage.convRate >= 50 ? 'text-emerald-600' : stage.convRate >= 25 ? 'text-amber-600' : 'text-red-600'}`}>
                        {stage.convRate}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid md:grid-cols-2 gap-5">
              <ChartCard title="Leads por origen" period={preset}>
                {leadsBySource.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={leadsBySource} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                        label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}>
                        {leadsBySource.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-16">Sin datos en el período</p>}
              </ChartCard>
              <ChartCard title="Leads por estado" period={preset}>
                {leadsByStatus.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={leadsByStatus}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Leads" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-16">Sin datos en el período</p>}
              </ChartCard>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: FINANCIERO (REP-01)                                          */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'financiero' && (
          <div className="space-y-5">
            {financeLoading ? (
              <div className="flex items-center justify-center py-20 gap-3 text-gray-400 dark:text-gray-500">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span className="text-sm">Cargando movimientos financieros…</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <KPICard title="Total cobros" value={formatEur(financeStats.cobros)} sub={`${filteredFinance.filter(m => m.type === 'cobro').length} movimientos`}
                    icon={<ArrowUpRight className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30"
                    trend={{ value: 'Ingresos', up: true }} />
                  <KPICard title="Total pagos" value={formatEur(financeStats.pagos)} sub={`${filteredFinance.filter(m => m.type === 'pago').length} movimientos`}
                    icon={<ArrowDownRight className="w-4 h-4 text-red-600" />} color="bg-red-50 dark:bg-red-900/30"
                    trend={{ value: 'Gastos', up: false }} />
                  <KPICard title="Balance neto" value={formatEur(financeStats.balance)}
                    sub={financeStats.balance >= 0 ? 'Positivo' : 'Negativo'}
                    icon={<Euro className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30"
                    trend={{ value: financeStats.balance >= 0 ? 'Superávit' : 'Déficit', up: financeStats.balance >= 0 }} />
                </div>

                {financeByMonth.length > 0 ? (
                  <div className="grid md:grid-cols-2 gap-5">
                    <ChartCard title="Cobros vs Pagos por mes" period={preset}>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={financeByMonth}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                          <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                          <Bar dataKey="cobros" fill="#10b981" radius={[4, 4, 0, 0]} name="Cobros" />
                          <Bar dataKey="pagos" fill="#ef4444" radius={[4, 4, 0, 0]} name="Pagos" />
                          <Legend />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                    <ChartCard title="Por categoría" period={preset}>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={financeByCategory} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                          <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10 }} />
                          <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Importe">
                            {financeByCategory.map((entry, i) => (
                              <Cell key={i} fill={entry.type === 'cobro' ? '#10b981' : '#ef4444'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
                    <Wallet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 font-medium">Sin movimientos financieros en el período</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Registra cobros y pagos en el módulo de Finanzas</p>
                  </div>
                )}

                <div className="mt-6">
                  <FinanceReportsPanel userId={authUser?.user_id || ''} movements={filteredFinance} />
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: MARGEN REAL POR VEHÍCULO (R-01)                            */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'margen' && (() => {
          const realTotal = realMarginData.reduce((s, v) => s + v.realMargin, 0);
          const realAvg = realMarginData.length ? Math.round(realTotal / realMarginData.length) : 0;
          const realAvgPct = realMarginData.length
            ? Math.round(realMarginData.reduce((s, v) => s + v.realMarginPct, 0) / realMarginData.length) : 0;
          const totalCosts = realMarginData.reduce((s, v) => s + v.costsTotal, 0);
          const totalCommissions = realMarginData.reduce((s, v) => s + v.commissionsTotal, 0);

          return (
            <div className="space-y-5">
              {/* Banner explicativo */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-2xl p-4 flex flex-wrap items-start gap-3">
                <BarChart2 className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-bold text-blue-800 dark:text-blue-300">Margen Real = P.Venta − P.Compra − Costes adicionales − Comisiones</p>
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                    Los costes adicionales incluyen preparación, ITV, limpieza, fotos, etc. Las comisiones se cruzan por matrícula/vehículo.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard title="Vehículos vendidos" value={String(realMarginData.length)} sub="Con precio de venta"
                  icon={<Car className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30" />
                <KPICard title="Margen real total" value={realTotal > 0 ? formatEur(realTotal) : '—'}
                  sub="Tras descontar costes y comisiones"
                  icon={<Euro className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30" />
                <KPICard title="Margen real medio" value={realAvg > 0 ? formatEur(realAvg) : '—'}
                  sub={`${realAvgPct}% promedio por unidad`}
                  icon={<TrendingUp className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30"
                  trend={realAvgPct > 0 ? { value: `${realAvgPct}%`, up: realAvgPct >= 8 } : undefined} />
                <KPICard title="Costes + Comisiones" value={formatEur(totalCosts + totalCommissions)}
                  sub={`Costes: ${formatEur(totalCosts)} · Com.: ${formatEur(totalCommissions)}`}
                  icon={<TrendingDown className="w-4 h-4 text-red-600" />} color="bg-red-50 dark:bg-red-900/30" />
              </div>

              {realMarginData.length > 0 && (
                <div className="grid md:grid-cols-2 gap-5">
                  <ChartCard title="Top 10 — Margen real por vehículo" period={preset}>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={realMarginData.slice(0, 10)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => formatEur(v)} />
                        <YAxis dataKey="plate" type="category" width={75} tick={{ fontSize: 10 }} />
                        <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                        <Bar dataKey="realMargin" name="Margen Real" radius={[0, 4, 4, 0]}>
                          {realMarginData.slice(0, 10).map((entry, i) => (
                            <Cell key={i} fill={entry.realMargin >= 0 ? '#10b981' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Desglose de deducciones (total)" period={preset}>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={realMarginData.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="plate" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={45} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                        <Bar dataKey="grossMargin" name="Margen Bruto" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="costsTotal" name="Costes" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="commissionsTotal" name="Comisiones" fill="#ef4444" radius={[3, 3, 0, 0]} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Rentabilidad real por unidad vendida</h3>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">P.Venta − P.Compra − Costes − Comisiones</span>
                </div>
                {realMarginData.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    No hay vehículos vendidos con precio de venta registrado
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[1100px]">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/30">
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Matrícula</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Vehículo</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">P. Compra</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">P. Venta</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-amber-600">Costes</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-red-500">Comisiones</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-blue-600">M. Bruto</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-emerald-600">M. Real</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                        {realMarginData.map(v => {
                          const isPositive = v.realMargin >= 0;
                          return (
                            <tr key={v.id} className="hover:bg-gray-50/30 transition-colors">
                              <td className="px-5 py-3">
                                <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">{v.plate}</span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300 max-w-[160px] truncate">{v.vehicle}</td>
                              <td className="px-3 py-3 text-right text-xs text-gray-500 dark:text-gray-400">{formatEur(v.purchasePrice)}</td>
                              <td className="px-3 py-3 text-right text-xs text-gray-700 dark:text-gray-300 font-medium">{formatEur(v.salePrice)}</td>
                              <td className="px-3 py-3 text-right text-xs text-amber-600">
                                {v.costsTotal > 0 ? `−${formatEur(v.costsTotal)}` : '—'}
                              </td>
                              <td className="px-3 py-3 text-right text-xs text-red-500">
                                {v.commissionsTotal > 0 ? `−${formatEur(v.commissionsTotal)}` : '—'}
                              </td>
                              <td className="px-3 py-3 text-right text-xs text-blue-600 dark:text-blue-400 font-medium">
                                {v.grossMargin >= 0 ? '+' : ''}{formatEur(v.grossMargin)}
                              </td>
                              <td className={`px-3 py-3 text-right text-xs font-bold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                                {isPositive ? '+' : ''}{formatEur(v.realMargin)}
                              </td>
                              <td className="px-5 py-3 text-right">
                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${isPositive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                                  {isPositive ? '+' : ''}{v.realMarginPct}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── IR-04: Top Vehículos ──────────────────────────────────── */}
              {realMarginData.length > 0 && (
                <>
                  <SectionTitle>Top Vehículos</SectionTitle>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <KPICard title="Venta más rápida"
                      value={(() => { const fastest = [...realMarginData].sort((a, b) => a.days - b.days)[0]; return fastest ? `${fastest.days}d` : '—'; })()}
                      sub={(() => { const fastest = [...realMarginData].sort((a, b) => a.days - b.days)[0]; return fastest?.plate || ''; })()}
                      icon={<Zap className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30" />
                    <KPICard title="Mayor tiempo en stock"
                      value={(() => { const avail = filteredVehicles.filter(v => v.status === 'available').sort((a, b) => b.daysInStock - a.daysInStock)[0]; return avail ? `${avail.daysInStock}d` : '—'; })()}
                      sub={(() => { const avail = filteredVehicles.filter(v => v.status === 'available').sort((a, b) => b.daysInStock - a.daysInStock)[0]; return avail ? `${avail.brand} ${avail.model}` : ''; })()}
                      icon={<Clock className="w-4 h-4 text-red-600" />} color="bg-red-50 dark:bg-red-900/30" />
                    <KPICard title="Mejor margen" value={realMarginData[0] ? formatEur(realMarginData[0].realMargin) : '—'}
                      sub={realMarginData[0]?.plate || ''} icon={<Star className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30" />
                    <KPICard title="Peor margen"
                      value={realMarginData.length > 0 ? formatEur(realMarginData[realMarginData.length - 1].realMargin) : '—'}
                      sub={realMarginData[realMarginData.length - 1]?.plate || ''}
                      icon={<AlertTriangle className="w-4 h-4 text-red-600" />} color="bg-red-50 dark:bg-red-900/30" />
                  </div>
                  <div className="grid md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Top 5 Ganadores</h4>
                      {realMarginData.slice(0, 5).map((v, i) => (
                        <Link key={v.id} to={`/saas/vehicles/${v.id}`}
                          className="flex items-center gap-3 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/10 hover:bg-emerald-50 transition-colors">
                          <span className="text-sm font-black w-7 text-center">{i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{v.vehicle}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{v.plate} · {v.days}d stock</p>
                          </div>
                          <span className="text-sm font-black text-emerald-600">+{formatEur(v.realMargin)}</span>
                        </Link>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-red-700 dark:text-red-400 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Top 5 Operaciones en riesgo</h4>
                      {[...realMarginData].sort((a, b) => a.realMargin - b.realMargin).slice(0, 5).map((v, i) => (
                        <Link key={v.id} to={`/saas/vehicles/${v.id}`}
                          className="flex items-center gap-3 p-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10 hover:bg-red-50 transition-colors">
                          <span className="text-sm font-black w-7 text-center text-red-500">#{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{v.vehicle}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{v.plate} · {v.days}d stock</p>
                          </div>
                          <span className={`text-sm font-black ${v.realMargin >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                            {v.realMargin >= 0 ? '+' : ''}{formatEur(v.realMargin)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ── IR-05: Gastos de preparación acumulados ─────────────── */}
              <SectionTitle>Gastos de preparación acumulados</SectionTitle>
              {preparationCostsData.totalAmount > 0 ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <KPICard title="Gasto total preparación" value={formatEur(preparationCostsData.totalAmount)}
                      sub="Suma de todos los costes asociados"
                      icon={<Wallet className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30" />
                    <KPICard title="Gasto medio por vehículo" value={formatEur(preparationCostsData.avgPerVehicle)}
                      sub={`${preparationCostsData.vehiclesWithCosts} vehículos con gastos`}
                      icon={<Car className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30"
                      trend={preparationCostsData.avgPerVehicle > 1500 ? { value: 'Elevado', up: false } : { value: 'Normal', up: true }} />
                    <KPICard title="Vehículos con gastos" value={String(preparationCostsData.vehiclesWithCosts)}
                      sub={`de ${filteredVehicles.length} totales`}
                      icon={<Package className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30" />
                    <KPICard title="Categoría principal" value={preparationCostsData.topCategory?.category || '—'}
                      sub={preparationCostsData.topCategory ? formatEur(preparationCostsData.topCategory.total) : ''}
                      icon={<Layers className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/30" />
                  </div>

                  <div className="grid md:grid-cols-2 gap-5">
                    <ChartCard title="Distribución por categoría" period={preset}>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={preparationCostsData.categories} dataKey="total" nameKey="category" cx="50%" cy="50%"
                            outerRadius={90} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                            {preparationCostsData.categories.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </ChartCard>

                    <ChartCard title="Top 10 vehículos con mayor gasto" period={preset}>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={preparationCostsData.topVehiclesByCost} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => formatEur(v)} />
                          <YAxis dataKey="plate" type="category" width={75} tick={{ fontSize: 10 }} />
                          <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                          <Bar dataKey="total" name="Gasto total" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </div>

                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Desglose por categoría</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/30">
                            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Categoría</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Operaciones</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Gasto total</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">% del total</th>
                            <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Media/operación</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                          {preparationCostsData.categories.map(c => (
                            <tr key={c.category} className="hover:bg-gray-50/30 transition-colors">
                              <td className="px-5 py-3 text-xs font-semibold text-gray-800 dark:text-gray-200 capitalize">{c.category}</td>
                              <td className="px-4 py-3 text-right text-xs text-gray-600 dark:text-gray-400">{c.count}</td>
                              <td className="px-4 py-3 text-right text-xs font-bold text-amber-600">{formatEur(c.total)}</td>
                              <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400">
                                {preparationCostsData.totalAmount > 0 ? `${Math.round((c.total / preparationCostsData.totalAmount) * 100)}%` : '—'}
                              </td>
                              <td className="px-5 py-3 text-right text-xs text-gray-500 dark:text-gray-400">{c.count > 0 ? formatEur(Math.round(c.total / c.count)) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
                  <Wallet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium">Sin gastos de preparación registrados</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Añade costes asociados en la ficha de cada vehículo</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: COMERCIALES (R-03)                                           */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'comerciales' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard title="Comerciales activos" value={String(commercialData.filter(c => c.name !== 'Sin asignar').length)}
                sub="Con leads asignados"
                icon={<Award className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30" />
              <KPICard title="Total leads" value={String(leads.length)} sub="En toda la base"
                icon={<Users className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30" />
              <KPICard title="Mejor conversión" value={commercialData.length ? `${Math.max(...commercialData.filter(c => c.leads >= 3).map(c => c.conversion), 0)}%` : '—'}
                sub={commercialData.find(c => c.conversion === Math.max(...commercialData.filter(c2 => c2.leads >= 3).map(c => c.conversion)))?.name || '—'}
                icon={<Star className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30" />
              <KPICard title="Más ganados" value={commercialData.length ? String(Math.max(...commercialData.map(c => c.won))) : '—'}
                sub={commercialData.find(c => c.won === Math.max(...commercialData.map(c2 => c2.won)))?.name || '—'}
                icon={<TrendingUp className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/30" />
            </div>

            {/* R-03: Actividad del equipo */}
            {commercialData.filter(c => c.name !== 'Sin asignar').length > 0 && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Actividad del equipo</h3>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">Estimado desde datos CRM (todos los leads)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Comercial</th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <span className="flex items-center justify-end gap-1"><Phone className="w-3 h-3" /> Contactos</span>
                        </th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <span className="flex items-center justify-end gap-1"><MapPin className="w-3 h-3" /> Citas</span>
                        </th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <span className="flex items-center justify-end gap-1"><Key className="w-3 h-3" /> Pruebas</span>
                        </th>
                        <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                          <span className="flex items-center justify-end gap-1"><Trophy className="w-3 h-3" /> Cierres</span>
                        </th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Conv.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {commercialData.filter(c => c.name !== 'Sin asignar').map((c, i) => (
                        <tr key={c.name} className="hover:bg-gray-50/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                                {c.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{c.name}</p>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500">#{i + 1} en ranking</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="text-xs font-bold text-blue-600">{c.contacted}</span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="text-xs font-bold text-purple-600">
                              {leads.filter(l => l.responsible === c.name && ['appointment', 'reserved', 'negotiation', 'won'].includes(l.status)).length}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="text-xs font-bold text-amber-600">
                              {leads.filter(l => l.responsible === c.name && ['reserved', 'negotiation', 'won'].includes(l.status)).length}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="text-xs font-bold text-emerald-600">{c.won}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                              c.conversion >= 20 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                              c.conversion >= 10 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                              'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            }`}>{c.conversion}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* R-02: Revenue por comercial */}
            {commercialRevenueData.length > 0 && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                  <Euro className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Revenue por comercial (ventas completadas)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Comercial</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Ventas</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Revenue</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Margen Bruto</th>
                        <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">% del total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {commercialRevenueData.map((c, i) => {
                        const totalRev = commercialRevenueData.reduce((s, x) => s + x.revenue, 0);
                        const share = totalRev > 0 ? Math.round((c.revenue / totalRev) * 100) : 0;
                        return (
                          <tr key={c.name} className="hover:bg-gray-50/30 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                                  {c.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{c.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-300">{c.ventas}</td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-blue-600 dark:text-blue-400">{formatEur(c.revenue)}</td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              {c.margin > 0 ? `+${formatEur(c.margin)}` : '—'}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-20 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                                  <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${share}%` }} />
                                </div>
                                <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-right">{share}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {commercialData.length > 0 ? (
              <>
                {/* ── Evolución semanal de leads por comercial (últimas 12 semanas) ── */}
                {commercialTimeline.agents.length > 0 && (
                  <ChartCard
                    title="Evolución semanal de leads por comercial"
                    period="12w"
                    action={
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium flex items-center gap-1">
                        <Activity className="w-3 h-3" />
                        Últimas 12 semanas
                      </span>
                    }
                  >
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={commercialTimeline.data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                        <defs>
                          {commercialTimeline.agents.map((agent, i) => (
                            <linearGradient key={agent} id={`grad-agent-${i}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={commercialTimeline.agentColors[i]} stopOpacity={0.35} />
                              <stop offset="95%" stopColor={commercialTimeline.agentColors[i]} stopOpacity={0} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="semana"
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 10, color: '#f1f5f9', fontSize: 12 }}
                          labelFormatter={(label, payload) => {
                            const full = payload?.[0]?.payload?.semanaFull;
                            return full ? `Semana del ${full}` : `Semana ${label}`;
                          }}
                          formatter={(value: number, name: string) => [`${value} leads`, name]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {commercialTimeline.agents.map((agent, i) => (
                          <Area
                            key={agent}
                            type="monotone"
                            dataKey={agent}
                            name={agent}
                            stroke={commercialTimeline.agentColors[i]}
                            strokeWidth={2}
                            fill={`url(#grad-agent-${i})`}
                            dot={{ r: 3, fill: commercialTimeline.agentColors[i], strokeWidth: 0 }}
                            activeDot={{ r: 5, strokeWidth: 0 }}
                            isAnimationActive={true}
                            animationDuration={1200}
                            animationEasing="ease-out"
                          />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartCard>
                )}

                <div className="grid md:grid-cols-2 gap-5">
                  <ChartCard title="Leads por comercial" period={preset}>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={commercialData.slice(0, 8)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip {...tooltipStyle} />
                        <Bar dataKey="leads" fill="#6366f1" radius={[4, 4, 0, 0]} name="Leads" isAnimationActive animationDuration={900} />
                        <Bar dataKey="won" fill="#10b981" radius={[4, 4, 0, 0]} name="Ganados" isAnimationActive animationDuration={900} animationBegin={150} />
                        <Bar dataKey="lost" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Perdidos" isAnimationActive animationDuration={900} animationBegin={300} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Tasa de conversión por comercial" period={preset}>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={commercialData.slice(0, 8)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" axisLine={false} tickLine={false} />
                        <YAxis dataKey="name" type="category" width={85} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}%`, 'Conversión']} />
                        <Bar dataKey="conversion" name="Conversión %" radius={[0, 4, 4, 0]} isAnimationActive animationDuration={1000}>
                          {commercialData.slice(0, 8).map((entry, i) => (
                            <Cell key={i} fill={entry.conversion >= 20 ? '#10b981' : entry.conversion >= 10 ? '#f59e0b' : '#f43f5e'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                    <Award className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Ranking de rendimiento</h3>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">Datos globales (todos los leads)</span>
                  </div>
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">#</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Comercial</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Leads</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Ganados</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Perdidos</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Conversión</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Presup. Medio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                        {commercialData.map((c, i) => {
                          const rankColors = ['text-amber-500', 'text-gray-400 dark:text-gray-500', 'text-orange-400'];
                          return (
                            <tr key={c.name} className="hover:bg-gray-50/30 transition-colors">
                              <td className="px-5 py-3">
                                <span className={`text-xs font-black ${rankColors[i] ?? 'text-gray-300'}`}>#{i + 1}</span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                                    {c.name.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{c.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">{c.leads}</td>
                              <td className="px-4 py-3 text-right text-xs font-bold text-emerald-600">{c.won}</td>
                              <td className="px-4 py-3 text-right text-xs font-bold text-red-500">{c.lost}</td>
                              <td className="px-4 py-3 text-right">
                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                                  c.conversion >= 20 ? 'bg-emerald-100 text-emerald-700' :
                                  c.conversion >= 10 ? 'bg-amber-100 text-amber-700' :
                                  'bg-red-100 text-red-700'
                                }`}>{c.conversion}%</span>
                              </td>
                              <td className="px-5 py-3 text-right text-xs text-gray-500 dark:text-gray-400">
                                {c.avgBudget ? formatEur(c.avgBudget) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
                <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">Sin leads asignados a comerciales</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Asigna responsables a los leads para ver métricas</p>
              </div>
            )}

            {/* ── IR-03: Rendimiento económico por comercial ──────────── */}
            {commercialFullData.length > 0 && (
              <>
                <SectionTitle>Rendimiento económico por comercial</SectionTitle>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KPICard title="Facturación total equipo" value={formatEur(commercialFullData.reduce((s, c) => s + c.revenue, 0))}
                    sub="Ventas completadas en periodo"
                    icon={<Euro className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30" />
                  <KPICard title="Margen real total equipo" value={formatEur(commercialFullData.reduce((s, c) => s + c.realMargin, 0))}
                    sub="Tras descontar costes asociados"
                    icon={<TrendingUp className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30" />
                  <KPICard title="Ticket medio global"
                    value={(() => { const t = commercialFullData.reduce((s, c) => s + c.ventas, 0); const r = commercialFullData.reduce((s, c) => s + c.revenue, 0); return t > 0 ? formatEur(Math.round(r / t)) : '—'; })()}
                    sub="Por venta completada"
                    icon={<ShoppingCart className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30" />
                  <KPICard title="Mejor comercial"
                    value={(() => { const best = [...commercialFullData].sort((a, b) => b.realMargin - a.realMargin)[0]; return best?.name || '—'; })()}
                    sub={(() => { const best = [...commercialFullData].sort((a, b) => b.realMargin - a.realMargin)[0]; return best ? formatEur(best.realMargin) : ''; })()}
                    icon={<Trophy className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/30" />
                </div>

                <ChartCard title="Revenue vs Margen por comercial" period={preset}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={commercialFullData.filter(c => c.name !== 'Sin asignar')}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                      <Bar dataKey="revenue" name="Facturación" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="realMargin" name="Margen real" fill="#10b981" radius={[3, 3, 0, 0]} />
                      <Legend />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                    <Euro className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Rendimiento económico detallado</h3>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">Basado en ventas completadas con vehículo asociado</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[1000px]">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/30">
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Comercial</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Ventas</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Facturación</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Ticket medio</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Margen bruto</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-amber-600">Costes asoc.</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-emerald-600">Margen real</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">%</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Mejor op.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                        {commercialFullData.map(c => (
                          <tr key={c.name} className="hover:bg-gray-50/30 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-violet-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                                  {c.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{c.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right text-xs font-bold text-gray-800 dark:text-gray-200">{c.ventas}</td>
                            <td className="px-3 py-3 text-right text-xs text-gray-700 dark:text-gray-300 font-medium">{formatEur(c.revenue)}</td>
                            <td className="px-3 py-3 text-right text-xs text-gray-500 dark:text-gray-400">{formatEur(c.avgTicket)}</td>
                            <td className="px-3 py-3 text-right text-xs text-blue-600 font-medium">{formatEur(c.margin)}</td>
                            <td className="px-3 py-3 text-right text-xs text-amber-600">{c.totalCosts > 0 ? `−${formatEur(c.totalCosts)}` : '—'}</td>
                            <td className={`px-3 py-3 text-right text-xs font-bold ${c.realMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {c.realMargin >= 0 ? '+' : ''}{formatEur(c.realMargin)}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${c.marginPct >= 10 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : c.marginPct >= 5 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                {c.marginPct}%
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right text-xs text-gray-400 font-mono">{c.bestPlate || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: PROVEEDORES (IR-02)                                          */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'proveedores' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard title="Proveedores activos" value={String(supplierStats.activeCount)}
                sub="Con vehículos en histórico"
                icon={<Truck className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30" />
              <KPICard title="Inversión total" value={formatEur(supplierStats.totalInvestment)}
                sub="Suma precios de compra"
                icon={<Euro className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30" />
              <KPICard title="Margen global proveedores" value={supplierStats.avgMarginPct > 0 ? `${supplierStats.avgMarginPct}%` : '—'}
                sub={`${formatEur(supplierStats.totalMargin)} total`}
                icon={<TrendingUp className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30"
                trend={supplierStats.avgMarginPct > 0 ? { value: `${supplierStats.avgMarginPct}%`, up: supplierStats.avgMarginPct >= 8 } : undefined} />
              <KPICard title="Mejor proveedor" value={supplierStats.best?.supplier || '—'}
                sub={supplierStats.best ? `${formatEur(supplierStats.best.totalMargin)} margen` : 'Sin datos'}
                icon={<Star className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/30" />
            </div>

            {supplierData.length > 0 ? (
              <>
                <div className="grid md:grid-cols-2 gap-5">
                  <ChartCard title="Top 10 proveedores por margen" period={preset}>
                    <ResponsiveContainer width="100%" height={Math.max(240, Math.min(supplierData.length, 10) * 32)}>
                      <BarChart data={supplierData.slice(0, 10)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => formatEur(v)} />
                        <YAxis dataKey="supplier" type="category" width={100} tick={{ fontSize: 10 }} />
                        <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                        <Bar dataKey="totalMargin" name="Margen Total" radius={[0, 4, 4, 0]}>
                          {supplierData.slice(0, 10).map((entry, i) => (
                            <Cell key={i} fill={entry.totalMargin >= 0 ? '#10b981' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Inversión vs Margen por proveedor" period={preset}>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={supplierData.slice(0, 8)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="supplier" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                        <Bar dataKey="totalCost" name="Inversión" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="totalMargin" name="Margen" fill="#10b981" radius={[3, 3, 0, 0]} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Detalle por proveedor</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[1000px]">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/30">
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Proveedor</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Vehículos</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Inversión</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Coste medio</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Vendidos</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Facturación</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-emerald-600">Margen</th>
                          <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">%</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Días medio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                        {supplierData.map(s => (
                          <tr key={s.supplier} className="hover:bg-gray-50/30 transition-colors">
                            <td className="px-5 py-3 text-xs font-semibold text-gray-800 dark:text-gray-200">{s.supplier}</td>
                            <td className="px-3 py-3 text-right text-xs font-bold text-gray-800 dark:text-gray-200">{s.total}</td>
                            <td className="px-3 py-3 text-right text-xs text-gray-500 dark:text-gray-400">{formatEur(s.totalCost)}</td>
                            <td className="px-3 py-3 text-right text-xs text-gray-500 dark:text-gray-400">{formatEur(s.avgCost)}</td>
                            <td className="px-3 py-3 text-right text-xs text-gray-700 dark:text-gray-300">{s.sold}</td>
                            <td className="px-3 py-3 text-right text-xs text-gray-700 dark:text-gray-300 font-medium">{s.totalRevenue > 0 ? formatEur(s.totalRevenue) : '—'}</td>
                            <td className={`px-3 py-3 text-right text-xs font-bold ${s.totalMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {s.sold > 0 ? `${s.totalMargin >= 0 ? '+' : ''}${formatEur(s.totalMargin)}` : '—'}
                            </td>
                            <td className="px-3 py-3 text-right">
                              {s.sold > 0 ? (
                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${s.avgMarginPct >= 10 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : s.avgMarginPct >= 5 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                  {s.avgMarginPct}%
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-5 py-3 text-right text-xs text-gray-500 dark:text-gray-400">{s.avgDays > 0 ? `${s.avgDays}d` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
                <Truck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">Sin datos de proveedores</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Registra el proveedor en la ficha de cada vehículo para ver métricas</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: RENTABILIDAD (R-02)                                          */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'rentabilidad' && (() => {
          const { months, totals, currentYear, prevYear } = rentabilidadData;
          const grossMarginPct = totals.revenue > 0 ? Math.round((totals.grossMargin / totals.revenue) * 100) : 0;
          const ebitdaPct = totals.revenue > 0 ? Math.round((totals.ebitda / totals.revenue) * 100) : 0;
          const yoyRevGrowth = totals.revenuePrev > 0 ? Math.round(((totals.revenue - totals.revenuePrev) / totals.revenuePrev) * 100) : null;
          const yoyMarginGrowth = totals.grossMarginPrev > 0 ? Math.round(((totals.grossMargin - totals.grossMarginPrev) / totals.grossMarginPrev) * 100) : null;

          return (
            <div className="space-y-5">
              {/* KPIs anuales */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard title={`Revenue ${currentYear}`} value={formatEur(totals.revenue)}
                  sub={`vs ${formatEur(totals.revenuePrev)} en ${prevYear}`}
                  icon={<Euro className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30"
                  trend={yoyRevGrowth !== null ? { value: `${yoyRevGrowth > 0 ? '+' : ''}${yoyRevGrowth}% YoY`, up: yoyRevGrowth >= 0 } : undefined} />
                <KPICard title="Margen Bruto" value={formatEur(totals.grossMargin)}
                  sub={`${grossMarginPct}% sobre revenue`}
                  icon={<TrendingUp className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30"
                  trend={yoyMarginGrowth !== null ? { value: `${yoyMarginGrowth > 0 ? '+' : ''}${yoyMarginGrowth}% YoY`, up: yoyMarginGrowth >= 0 } : undefined} />
                <KPICard title="Gastos Operativos" value={formatEur(totals.opex)}
                  sub="Pagos registrados en finanzas"
                  icon={<TrendingDown className="w-4 h-4 text-red-600" />} color="bg-red-50 dark:bg-red-900/30" />
                <KPICard title="EBITDA Estimado" value={formatEur(totals.ebitda)}
                  sub={`${ebitdaPct}% sobre revenue`}
                  icon={<Percent className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/30"
                  trend={{ value: ebitdaPct >= 10 ? 'Saludable' : ebitdaPct >= 0 ? 'Ajustado' : 'Negativo', up: ebitdaPct >= 10 }} />
              </div>

              {/* Gráfica combinada mensual */}
              <ChartCard title={`Cuenta de resultados mensual ${currentYear}`} period="m">
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={months}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [formatEur(v), name]} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[3, 3, 0, 0]} opacity={0.85} />
                    <Bar dataKey="grossMargin" name="Margen bruto" fill="#10b981" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="opex" name="Gastos op." fill="#ef4444" radius={[3, 3, 0, 0]} opacity={0.7} />
                    <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                    <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* YoY Revenue vs Margen */}
              <div className="grid md:grid-cols-2 gap-5">
                <ChartCard title={`Revenue: ${currentYear} vs ${prevYear}`} period="1y">
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={months}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                      <Line type="monotone" dataKey="revenue" name={`Revenue ${currentYear}`} stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="revenuePrev" name={`Revenue ${prevYear}`} stroke="#93c5fd" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2 }} />
                      <Legend />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title={`Margen Bruto: ${currentYear} vs ${prevYear}`} period="1y">
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={months}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                      <Line type="monotone" dataKey="grossMargin" name={`Margen ${currentYear}`} stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="grossMarginPrev" name={`Margen ${prevYear}`} stroke="#6ee7b7" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2 }} />
                      <Legend />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* Tabla detallada mensual */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Cuenta de resultados detallada</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/30">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Mes</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Revenue</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">COGS</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Margen Bruto</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">% MB</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Gastos Op.</th>
                        <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">EBITDA Est.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {months.map((m, i) => {
                        const mbPct = m.revenue > 0 ? Math.round((m.grossMargin / m.revenue) * 100) : 0;
                        return (
                          <tr key={i} className="hover:bg-gray-50/30 transition-colors">
                            <td className="px-5 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 capitalize">{m.mes}</td>
                            <td className="px-4 py-3 text-right text-xs text-gray-700 dark:text-gray-300 font-medium">{m.revenue > 0 ? formatEur(m.revenue) : '—'}</td>
                            <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400">{m.cogs > 0 ? formatEur(m.cogs) : '—'}</td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-emerald-600 dark:text-emerald-400">{m.grossMargin > 0 ? formatEur(m.grossMargin) : '—'}</td>
                            <td className="px-4 py-3 text-right">
                              {m.revenue > 0 ? (
                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${mbPct >= 15 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : mbPct >= 8 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                  {mbPct}%
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right text-xs text-red-600 dark:text-red-400">{m.opex > 0 ? formatEur(m.opex) : '—'}</td>
                            <td className="px-5 py-3 text-right text-xs font-bold">
                              {m.revenue > 0 ? (
                                <span className={m.ebitda >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                                  {m.ebitda >= 0 ? '+' : ''}{formatEur(m.ebitda)}
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50/30">
                        <td className="px-5 py-3 text-xs font-black text-gray-900 dark:text-gray-100">TOTAL {currentYear}</td>
                        <td className="px-4 py-3 text-right text-xs font-black text-gray-900 dark:text-gray-100">{formatEur(totals.revenue)}</td>
                        <td className="px-4 py-3 text-right text-xs font-bold text-gray-600 dark:text-gray-400">{formatEur(totals.cogs)}</td>
                        <td className="px-4 py-3 text-right text-xs font-black text-emerald-600">{formatEur(totals.grossMargin)}</td>
                        <td className="px-4 py-3 text-right"><span className="text-[10px] font-black text-gray-700 dark:text-gray-300">{grossMarginPct}%</span></td>
                        <td className="px-4 py-3 text-right text-xs font-bold text-red-600">{formatEur(totals.opex)}</td>
                        <td className="px-5 py-3 text-right text-xs font-black">
                          <span className={totals.ebitda >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                            {totals.ebitda >= 0 ? '+' : ''}{formatEur(totals.ebitda)}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* ── IR-11: Previsión de cierre de mes ──────────────────────── */}
              {monthEndForecast && (
                <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 border border-indigo-200 dark:border-indigo-700 rounded-2xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Target className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-base font-black text-gray-900 dark:text-gray-100">
                      Previsión cierre {format(new Date(), 'MMMM yyyy', { locale: es })}
                    </h3>
                    <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-bold">
                      Día {monthEndForecast.dayOfMonth}/{monthEndForecast.daysInMonth} ({monthEndForecast.pctElapsed}%)
                    </span>
                  </div>

                  {/* Barra de progreso del mes */}
                  <div>
                    <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full transition-all"
                        style={{ width: `${monthEndForecast.pctElapsed}%` }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                      <span>Día 1</span>
                      <span>{monthEndForecast.remainingDays} días restantes</span>
                      <span>Día {monthEndForecast.daysInMonth}</span>
                    </div>
                  </div>

                  {/* Tabla real vs proyectado */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-indigo-200/50 dark:border-indigo-700/50">
                          <th className="text-left px-3 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">Concepto</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">Real a hoy</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">Proyección mes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-indigo-100/50 dark:divide-indigo-800/30">
                        <tr>
                          <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">Revenue</td>
                          <td className="px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">{formatEur(monthEndForecast.actual.revenue)}</td>
                          <td className="px-3 py-2 text-right text-xs font-bold text-blue-700 dark:text-blue-400">{formatEur(monthEndForecast.projected.revenue)}</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">Margen bruto</td>
                          <td className="px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">{formatEur(monthEndForecast.actual.grossMargin)}</td>
                          <td className="px-3 py-2 text-right text-xs font-bold text-emerald-700 dark:text-emerald-400">{formatEur(monthEndForecast.projected.grossMargin)}</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">Gastos operativos</td>
                          <td className="px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">{formatEur(monthEndForecast.actual.opex)}</td>
                          <td className="px-3 py-2 text-right text-xs font-bold text-red-600 dark:text-red-400">{formatEur(monthEndForecast.projected.opex)}</td>
                        </tr>
                        <tr className="font-black">
                          <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">EBITDA estimado</td>
                          <td className="px-3 py-2 text-right text-xs text-gray-900 dark:text-gray-100">{formatEur(monthEndForecast.actual.ebitda)}</td>
                          <td className={`px-3 py-2 text-right text-xs ${monthEndForecast.projected.ebitda >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}`}>
                            {monthEndForecast.projected.ebitda >= 0 ? '+' : ''}{formatEur(monthEndForecast.projected.ebitda)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Escenarios */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl p-3 bg-emerald-50/80 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-center">
                      <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Optimista</p>
                      <p className="text-lg font-black text-emerald-700 dark:text-emerald-300 mt-1">{formatEur(monthEndForecast.scenarios.optimistic)}</p>
                      <p className="text-[10px] text-emerald-500 mt-0.5">+pipeline ({monthEndForecast.pipelineUnits} leads)</p>
                    </div>
                    <div className="rounded-xl p-3 bg-blue-50/80 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-center">
                      <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Conservador</p>
                      <p className="text-lg font-black text-blue-700 dark:text-blue-300 mt-1">{formatEur(monthEndForecast.scenarios.conservative)}</p>
                      <p className="text-[10px] text-blue-500 mt-0.5">Proyección lineal</p>
                    </div>
                    <div className="rounded-xl p-3 bg-red-50/80 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center">
                      <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">Pesimista</p>
                      <p className="text-lg font-black text-red-700 dark:text-red-300 mt-1">{formatEur(monthEndForecast.scenarios.pessimistic)}</p>
                      <p className="text-[10px] text-red-500 mt-0.5">70% del ritmo actual</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: FORECAST (R-06)                                              */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'forecast' && (
          <div className="space-y-5">
            {/* KPIs del forecast */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard title="Pipeline activo" value={String(forecastData.pipelineCount)}
                sub="Leads en etapas activas"
                icon={<Activity className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30" />
              <KPICard title="Valor pipeline" value={forecastData.pipelineValue > 0 ? formatEur(forecastData.pipelineValue) : '—'}
                sub="Suma presupuestos pipeline"
                icon={<Euro className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30" />
              <KPICard title="Tasa histórica cierre" value={`${forecastData.historicalCloseRate}%`}
                sub="Últimos 6 meses"
                icon={<Percent className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30"
                trend={{ value: forecastData.historicalCloseRate >= 20 ? 'Excelente' : forecastData.historicalCloseRate >= 10 ? 'Normal' : 'Bajo', up: forecastData.historicalCloseRate >= 15 }} />
              <KPICard title="Forecast unidades" value={String(forecastData.forecastUnits)}
                sub={forecastData.forecastRevenue > 0 ? `≈ ${formatEur(forecastData.forecastRevenue)}` : 'Sin presupuestos'}
                icon={<Zap className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/30"
                trend={forecastData.forecastUnits > 0 ? { value: 'Proyectado', up: true } : undefined} />
            </div>

            {/* Banner de predicción */}
            <div className={`rounded-2xl p-5 border-2 ${forecastData.forecastUnits > 0 ? 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-700' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-5 h-5 text-blue-600" />
                    <h3 className="text-base font-black text-gray-900 dark:text-gray-100">Forecast de ventas</h3>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Con <strong>{forecastData.pipelineCount} leads activos</strong> y una tasa de cierre histórica del <strong>{forecastData.historicalCloseRate}%</strong>,
                    se proyectan <strong className="text-blue-700 dark:text-blue-400">{forecastData.forecastUnits} ventas</strong>
                    {forecastData.forecastRevenue > 0 && <> con un revenue estimado de <strong className="text-emerald-700 dark:text-emerald-400">{formatEur(forecastData.forecastRevenue)}</strong></>}.
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Basado en el pipeline actual × tasa histórica de cierre (últimos 6 meses)</p>
                </div>
                {forecastData.forecastRevenue > 0 && (
                  <div className="text-right">
                    <p className="text-3xl font-black text-blue-600 dark:text-blue-400">{formatEur(forecastData.forecastRevenue)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">Revenue proyectado</p>
                  </div>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              {/* Pipeline por etapa */}
              <ChartCard title="Pipeline por etapa" period={preset}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={forecastData.pipelineByStage} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11 }} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" name="Leads" radius={[0, 4, 4, 0]}>
                      {forecastData.pipelineByStage.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* Tendencia histórica de cierre */}
              <ChartCard title="Tendencia histórica (últimos 6 meses)" period="6m">
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={forecastData.monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                    <Tooltip {...tooltipStyle} />
                    <Bar yAxisId="left" dataKey="won" name="Ganados" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="left" dataKey="pipeline" name="Pipeline" fill="#3b82f6" radius={[4, 4, 0, 0]} opacity={0.5} />
                    <Line yAxisId="right" type="monotone" dataKey="rate" name="Tasa %" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                    <Legend />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Tabla de pipeline */}
            {/* Escenarios de proyección */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Escenarios de proyección</h3>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">— expande cada tarjeta para ver el canvas</span>
              </div>
              <div className="space-y-2">
                <ScenarioForecastCard
                  title="Escenario Pesimista"
                  description="70% de la tasa histórica de cierre"
                  color="#ef4444"
                  multiplier={0.7}
                  pipelineCount={forecastData.pipelineCount}
                  avgBudget={forecastData.avgBudget}
                  historicalCloseRate={forecastData.historicalCloseRate}
                />
                <ScenarioForecastCard
                  title="Escenario Realista"
                  description="Tasa histórica actual de cierre"
                  color="#3b82f6"
                  multiplier={1.0}
                  pipelineCount={forecastData.pipelineCount}
                  avgBudget={forecastData.avgBudget}
                  historicalCloseRate={forecastData.historicalCloseRate}
                />
                <ScenarioForecastCard
                  title="Escenario Optimista"
                  description="140% de la tasa histórica de cierre"
                  color="#10b981"
                  multiplier={1.4}
                  pipelineCount={forecastData.pipelineCount}
                  avgBudget={forecastData.avgBudget}
                  historicalCloseRate={forecastData.historicalCloseRate}
                />
                <ScenarioForecastCard
                  title="Escenario Acelerado"
                  description="Crecimiento máximo — 2× tasa histórica"
                  color="#8b5cf6"
                  multiplier={2.0}
                  pipelineCount={forecastData.pipelineCount}
                  avgBudget={forecastData.avgBudget}
                  historicalCloseRate={forecastData.historicalCloseRate}
                />
              </div>
            </div>

            {forecastData.pipelineByStage.some(s => s.count > 0) && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                  <Target className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Desglose del pipeline</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Etapa</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Leads</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">% del pipeline</th>
                        <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Forecast contrib.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {forecastData.pipelineByStage.map(stage => {
                        const stagePct = forecastData.pipelineCount > 0 ? Math.round((stage.count / forecastData.pipelineCount) * 100) : 0;
                        const stageContrib = Math.round(stage.count * (forecastData.historicalCloseRate / 100));
                        return (
                          <tr key={stage.name} className="hover:bg-gray-50/30 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.fill }} />
                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{stage.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-gray-800 dark:text-gray-200">{stage.count}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                                  <div className="h-1.5 rounded-full" style={{ width: `${stagePct}%`, backgroundColor: stage.fill }} />
                                </div>
                                <span className="text-xs text-gray-500 dark:text-gray-400">{stagePct}%</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-right text-xs font-bold text-blue-600 dark:text-blue-400">{stageContrib}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: COMPARATIVA INTERANUAL (REP-07)                             */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'comparativa' && (() => {
          const { data, currentYear, prevYear } = yearlyComparison;
          const totalCurrent = data.reduce((s, d) => s + Number(d[`Ventas ${currentYear}`]), 0);
          const totalPrev = data.reduce((s, d) => s + Number(d[`Ventas ${prevYear}`]), 0);
          const ingresosCurrent = data.reduce((s, d) => s + Number(d[`Ingresos ${currentYear}`]), 0);
          const ingresosPrev = data.reduce((s, d) => s + Number(d[`Ingresos ${prevYear}`]), 0);
          const margenCurrent = data.reduce((s, d) => s + Number(d[`Margen ${currentYear}`]), 0);
          const margenPrev = data.reduce((s, d) => s + Number(d[`Margen ${prevYear}`]), 0);
          const growthVentas = totalPrev > 0 ? Math.round(((totalCurrent - totalPrev) / totalPrev) * 100) : null;
          const growthIngresos = ingresosPrev > 0 ? Math.round(((ingresosCurrent - ingresosPrev) / ingresosPrev) * 100) : null;

          return (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard title={`Ventas ${currentYear}`} value={String(totalCurrent)}
                  sub={`vs ${totalPrev} en ${prevYear}`}
                  icon={<TrendingUp className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30"
                  trend={growthVentas !== null ? { value: `${growthVentas > 0 ? '+' : ''}${growthVentas}%`, up: growthVentas >= 0 } : undefined} />
                <KPICard title={`Ingresos ${currentYear}`} value={formatEur(ingresosCurrent)}
                  sub={`vs ${formatEur(ingresosPrev)} en ${prevYear}`}
                  icon={<Euro className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30"
                  trend={growthIngresos !== null ? { value: `${growthIngresos > 0 ? '+' : ''}${growthIngresos}%`, up: growthIngresos >= 0 } : undefined} />
                <KPICard title={`Margen ${currentYear}`} value={formatEur(margenCurrent)}
                  sub={`vs ${formatEur(margenPrev)} en ${prevYear}`}
                  icon={<BarChart2 className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30" />
                <KPICard title="Año de comparación" value={String(prevYear)}
                  sub={`Comparando con ${currentYear}`}
                  icon={<ArrowRightLeft className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/30" />
              </div>

              <ChartCard title={`Ventas mensuales: ${currentYear} vs ${prevYear}`} period="1y">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey={`Ventas ${currentYear}`} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey={`Ventas ${prevYear}`} fill="#93c5fd" radius={[4, 4, 0, 0]} />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className="grid md:grid-cols-2 gap-5">
                <ChartCard title={`Ingresos mensuales: ${currentYear} vs ${prevYear}`} period="1y">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                      <Line type="monotone" dataKey={`Ingresos ${currentYear}`} stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey={`Ingresos ${prevYear}`} stroke="#6ee7b7" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2 }} />
                      <Legend />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title={`Margen bruto: ${currentYear} vs ${prevYear}`} period="1y">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
                      <Line type="monotone" dataKey={`Margen ${currentYear}`} stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey={`Margen ${prevYear}`} stroke="#fcd34d" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2 }} />
                      <Legend />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* R-08: Comparativa 3 períodos */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Comparativa 3 períodos</h3>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">Mes actual vs mes anterior vs mismo mes año pasado</span>
                </div>
                <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-700">
                  {[
                    { data: tripleComparison.current, accent: 'blue', label: 'Mes actual' },
                    { data: tripleComparison.prev, accent: 'gray', label: 'Mes anterior' },
                    { data: tripleComparison.samePrevYear, accent: 'gray', label: 'Mismo mes año anterior' },
                  ].map(({ data: p, accent, label }) => (
                    <div key={p.label} className={`p-5 ${accent === 'blue' ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-4 capitalize">{p.label}</p>
                      <div className="space-y-3">
                        {[
                          { label: 'Ventas', value: String(p.ventas), icon: <ShoppingCart className="w-3 h-3" /> },
                          { label: 'Revenue', value: p.revenue > 0 ? formatEur(p.revenue) : '—', icon: <Euro className="w-3 h-3" /> },
                          { label: 'Margen', value: p.margin !== 0 ? formatEur(p.margin) : '—', icon: <TrendingUp className="w-3 h-3" /> },
                          { label: 'Leads', value: String(p.leads), icon: <Users className="w-3 h-3" /> },
                          { label: 'Conversión', value: `${p.convRate}%`, icon: <Target className="w-3 h-3" /> },
                          { label: 'Ticket medio', value: p.ticket > 0 ? formatEur(p.ticket) : '—', icon: <Star className="w-3 h-3" /> },
                        ].map(kpi => (
                          <div key={kpi.label} className="flex items-center justify-between">
                            <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                              {kpi.icon} {kpi.label}
                            </span>
                            <span className={`text-xs font-bold ${accent === 'blue' ? 'text-blue-700 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>
                              {kpi.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: ROTACIÓN DE STOCK (R-03)                                    */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'rotacion' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPICard title="Vehículos analizados" value={String(rotacionData.total)} sub="Vendidos con fecha"
                icon={<Car className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30" />
              <KPICard title="Días medio de venta" value={rotacionData.avgDaysTotal > 0 ? `${rotacionData.avgDaysTotal}d` : '—'}
                sub="Promedio general de stock"
                icon={<Clock className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30"
                trend={rotacionData.avgDaysTotal > 0 ? { value: rotacionData.avgDaysTotal <= 30 ? 'Rápido' : rotacionData.avgDaysTotal <= 60 ? 'Normal' : 'Lento', up: rotacionData.avgDaysTotal <= 45 } : undefined} />
              <KPICard title="Marca más rápida" value={rotacionData.fastestBrand ? `${rotacionData.fastestBrand.avgDays}d` : '—'}
                sub={rotacionData.fastestBrand?.brand || '—'}
                icon={<TrendingUp className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30" />
              <KPICard title="Marca más lenta" value={rotacionData.slowestBrand ? `${rotacionData.slowestBrand.avgDays}d` : '—'}
                sub={rotacionData.slowestBrand?.brand || '—'}
                icon={<TrendingDown className="w-4 h-4 text-red-600" />} color="bg-red-50 dark:bg-red-900/30" />
            </div>

            {rotacionData.total === 0 ? (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
                <RotateCcw className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">Sin datos de rotación</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Los vehículos vendidos con fecha aparecerán aquí</p>
              </div>
            ) : (
              <>
                <div className="grid md:grid-cols-2 gap-5">
                  <ChartCard title="Días medio de venta por marca" period={preset}>
                    <ResponsiveContainer width="100%" height={Math.max(240, rotacionData.brandData.length * 26)}>
                      <BarChart data={rotacionData.brandData.slice(0, 12)} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 11 }} unit="d" />
                        <YAxis dataKey="brand" type="category" width={80} tick={{ fontSize: 10 }} />
                        <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [name === 'avgDays' ? `${v} días` : formatEur(v), name === 'avgDays' ? 'Días medio' : 'Margen medio']} />
                        <Bar dataKey="avgDays" name="Días medio" radius={[0, 4, 4, 0]}>
                          {rotacionData.brandData.slice(0, 12).map((entry, i) => (
                            <Cell key={i} fill={entry.avgDays <= 30 ? '#10b981' : entry.avgDays <= 60 ? '#f59e0b' : '#ef4444'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  <ChartCard title="Rotación por rango de precio" period={preset}>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={rotacionData.priceData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} unit="d" />
                        <Tooltip {...tooltipStyle} formatter={(v: number, name: string) => [name === 'avgDays' ? `${v} días` : v, name === 'avgDays' ? 'Días medio' : 'Unidades']} />
                        <Bar dataKey="avgDays" name="Días medio" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="count" name="Unidades" fill="#c4b5fd" radius={[4, 4, 0, 0]} />
                        <Legend />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                {/* Tabla detallada por modelo */}
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Rotación detallada por marca y modelo</h3>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">Ordenado por velocidad de venta</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[700px]">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/30">
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Marca</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Modelo</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Unidades</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Días medio</th>
                          <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Precio medio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                        {rotacionData.modelData.map((m, i) => (
                          <tr key={i} className="hover:bg-gray-50/30 transition-colors">
                            <td className="px-5 py-3 text-xs font-semibold text-gray-700 dark:text-gray-300">{m.brand}</td>
                            <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{m.model}</td>
                            <td className="px-4 py-3 text-right text-xs font-bold text-gray-800 dark:text-gray-200">{m.count}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                                m.avgDays <= 30 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                m.avgDays <= 60 ? 'bg-amber-100 text-amber-700' :
                                'bg-red-100 text-red-700'
                              }`}>{m.avgDays}d</span>
                            </td>
                            <td className="px-5 py-3 text-right text-xs text-gray-500 dark:text-gray-400">{m.avgPrice > 0 ? formatEur(m.avgPrice) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: GRUPO MULTI-CONCESIONARIO (R-04)                            */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'grupo' && (
          <div className="space-y-5">
            {groups.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400 font-semibold text-base">Sin grupo empresarial configurado</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Crea un grupo multi-concesionario en Configuración → Grupo para ver los KPIs consolidados.</p>
              </div>
            ) : (
              <>
                {/* Selector de grupo */}
                {groups.length > 1 && (
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 flex flex-wrap items-center gap-3">
                    <Building2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Grupo:</span>
                    <div className="flex flex-wrap gap-2">
                      {groups.map(g => (
                        <button key={g.group_id} onClick={() => switchGroup(g.group_id)}
                          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                            currentGroup?.group_id === g.group_id
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                          }`}>
                          {g.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {isLoadingKpis ? (
                  <div className="flex items-center justify-center py-20 gap-3 text-gray-400 dark:text-gray-500">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Cargando KPIs del grupo…</span>
                  </div>
                ) : groupKpis ? (
                  <>
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl p-5 text-white">
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 className="w-5 h-5" />
                        <h2 className="text-base font-black">{groupKpis.group.name}</h2>
                      </div>
                      <p className="text-blue-200 text-xs">{groupKpis.group.description || 'Dashboard KPIs consolidado del grupo'}</p>
                      <p className="text-blue-300 text-[10px] mt-1">Actualizado: {format(new Date(groupKpis.updatedAt), "d 'de' MMMM yyyy, HH:mm", { locale: es })}</p>
                    </div>

                    {/* KPIs consolidados */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <KPICard title="Stock total grupo" value={String(groupKpis.kpis.stockCount)}
                        sub={`${groupKpis.kpis.totalVehicles} vehículos en catálogo`}
                        icon={<Car className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30" />
                      <KPICard title="Ventas este mes" value={String(groupKpis.kpis.soldThisMonthCount)}
                        sub={`${formatEur(groupKpis.kpis.salesVolume)} en volumen`}
                        icon={<ShoppingCart className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30" />
                      <KPICard title="Margen total" value={formatEur(groupKpis.kpis.marginTotal)}
                        sub={`${groupKpis.kpis.marginPct}% sobre ventas`}
                        icon={<TrendingUp className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30"
                        trend={{ value: `${groupKpis.kpis.marginPct}%`, up: groupKpis.kpis.marginPct >= 10 }} />
                      <KPICard title="Oportunidades activas" value={String(groupKpis.kpis.oportunidades)}
                        sub={`${groupKpis.kpis.cobrosCount} cobros pendientes`}
                        icon={<Target className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/30" />
                    </div>

                    {/* Funnel del grupo */}
                    {groupKpis.funnel && (
                      <ChartCard title="Funnel CRM consolidado del grupo" period={preset}>
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={[
                            { name: 'Nuevos', value: groupKpis.funnel.new, fill: '#3b82f6' },
                            { name: 'Contactados', value: groupKpis.funnel.contacted, fill: '#8b5cf6' },
                            { name: 'Cita', value: groupKpis.funnel.appointment, fill: '#f59e0b' },
                            { name: 'Reservado', value: groupKpis.funnel.reserved, fill: '#06b6d4' },
                            { name: 'Negociación', value: groupKpis.funnel.negotiation, fill: '#f97316' },
                            { name: 'Ganados', value: groupKpis.funnel.won, fill: '#10b981' },
                            { name: 'Perdidos', value: groupKpis.funnel.lost, fill: '#ef4444' },
                          ]}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip {...tooltipStyle} />
                            <Bar dataKey="value" name="Leads" radius={[4, 4, 0, 0]}>
                              {[
                                '#3b82f6', '#8b5cf6', '#f59e0b', '#06b6d4', '#f97316', '#10b981', '#ef4444',
                              ].map((fill, i) => <Cell key={i} fill={fill} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartCard>
                    )}

                    {/* Drill-down por sede/concesionario */}
                    {groupKpis.kpisByBusiness && groupKpis.kpisByBusiness.length > 0 && (
                      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Drill-down por sede</h3>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">{groupKpis.kpisByBusiness.length} concesionarios</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm min-w-[700px]">
                            <thead>
                              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/30">
                                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Sede</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Stock</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Total vehículos</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Ventas mes</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Volumen</th>
                                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Margen</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                              {groupKpis.kpisByBusiness.map((b, i) => (
                                <tr key={b.business_id} className="hover:bg-gray-50/30 transition-colors">
                                  <td className="px-5 py-3">
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                                        {String(i + 1).padStart(2, '0')}
                                      </div>
                                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 font-mono">{b.business_id.slice(0, 12)}…</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right text-xs font-bold text-gray-700 dark:text-gray-300">{b.stockCount}</td>
                                  <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400">{b.totalVehicles}</td>
                                  <td className="px-4 py-3 text-right text-xs font-bold text-blue-600">{b.soldThisMonthCount}</td>
                                  <td className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300">{b.salesVolume > 0 ? formatEur(b.salesVolume) : '—'}</td>
                                  <td className="px-5 py-3 text-right">
                                    <span className={`text-xs font-bold ${b.marginTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {b.marginTotal >= 0 ? '+' : ''}{formatEur(b.marginTotal)}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
                    <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 font-medium">No hay datos del grupo todavía</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Selecciona un grupo o espera a que se carguen los KPIs</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: INFORME RGPD (R-05)                                         */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'rgpd' && (
          <div className="space-y-5">
            {gdprLoading ? (
              <div className="flex items-center justify-center py-20 gap-3 text-gray-400 dark:text-gray-500">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span className="text-sm">Cargando datos RGPD…</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KPICard title="Consentimientos activos" value={String(gdprStats.activeConsents.length)}
                    sub={`de ${gdprConsents.length} registros totales`}
                    icon={<Shield className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30" />
                  <KPICard title="Vencen en 30 días" value={String(gdprStats.expiringSoon.length)}
                    sub="Requieren renovación pronto"
                    icon={<Clock className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30"
                    trend={gdprStats.expiringSoon.length > 0 ? { value: `${gdprStats.expiringSoon.length} alertas`, up: false } : undefined} />
                  <KPICard title="Solicitudes pendientes" value={String(gdprStats.pendingRequests.length)}
                    sub={`de ${gdprRequests.length} solicitudes totales`}
                    icon={<AlertTriangle className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30" />
                  <KPICard title="Plazos vencidos" value={String(gdprStats.overdue.length)}
                    sub="Solicitudes fuera de plazo"
                    icon={<AlertTriangle className="w-4 h-4 text-red-600" />} color="bg-red-50 dark:bg-red-900/30"
                    trend={gdprStats.overdue.length > 0 ? { value: `${gdprStats.overdue.length} urgentes`, up: false } : undefined} />
                </div>

                <div className="grid md:grid-cols-2 gap-5">
                  {/* Consentimientos por finalidad */}
                  <ChartCard title="Consentimientos por finalidad" period={preset}>
                    {Object.keys(gdprStats.byPurpose).length > 0 ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={Object.entries(gdprStats.byPurpose).map(([k, v]) => ({
                              name: { marketing: 'Marketing', analytics: 'Analítica', functional: 'Funcional', communications: 'Comunicaciones', data_transfer: 'Trans. datos', profiling: 'Perfilado', other: 'Otro' }[k] || k,
                              value: v,
                            }))}
                            cx="50%" cy="50%" outerRadius={85} dataKey="value"
                            label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}>
                            {Object.keys(gdprStats.byPurpose).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-16">Sin datos de consentimientos</p>}
                  </ChartCard>

                  {/* Solicitudes por tipo de derecho */}
                  <ChartCard title="Solicitudes de derechos RGPD" period={preset}>
                    {Object.keys(gdprStats.byRightType).length > 0 ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={Object.entries(gdprStats.byRightType).map(([k, v]) => ({
                          name: { access: 'Acceso', rectification: 'Rectificación', erasure: 'Supresión', portability: 'Portabilidad', objection: 'Oposición', restriction: 'Limitación' }[k] || k,
                          value: v,
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip {...tooltipStyle} />
                          <Bar dataKey="value" name="Solicitudes" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-16">Sin solicitudes registradas</p>}
                  </ChartCard>
                </div>

                {/* Vencimientos próximos */}
                {gdprStats.expiringSoon.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700 rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-amber-200 dark:border-amber-700 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300">Consentimientos que vencen en los próximos 30 días</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[500px]">
                        <thead>
                          <tr className="border-b border-amber-100 dark:border-amber-800">
                            <th className="text-left px-5 py-3 text-xs font-semibold text-amber-700 dark:text-amber-400">Cliente</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-amber-700 dark:text-amber-400">Email</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-amber-700 dark:text-amber-400">Finalidad</th>
                            <th className="text-right px-5 py-3 text-xs font-semibold text-amber-700 dark:text-amber-400">Vence</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-50 dark:divide-amber-900/20">
                          {gdprStats.expiringSoon.map(c => (
                            <tr key={c.id} className="hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors">
                              <td className="px-5 py-3 text-xs font-semibold text-gray-800 dark:text-gray-200">{c.clientName}</td>
                              <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{c.clientEmail || '—'}</td>
                              <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                                {{ marketing: 'Marketing', analytics: 'Analítica', functional: 'Funcional', communications: 'Comunicaciones', data_transfer: 'Trans. datos', profiling: 'Perfilado', other: 'Otro' }[c.purpose] || c.purpose}
                              </td>
                              <td className="px-5 py-3 text-right">
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full">
                                  {c.expiresAt ? format(new Date(c.expiresAt), 'dd/MM/yyyy') : '—'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Solicitudes pendientes o en plazo vencido */}
                {gdprStats.pendingRequests.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Solicitudes de derechos pendientes</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[700px]">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-gray-800">
                            <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Cliente</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Derecho</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Estado</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Recibida</th>
                            <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">Plazo legal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                          {gdprStats.pendingRequests.map(r => {
                            const isOverdue = r.legalDeadline && new Date(r.legalDeadline).getTime() <= Date.now();
                            return (
                              <tr key={r.id} className={`hover:bg-gray-50/30 transition-colors ${isOverdue ? 'bg-red-50/30 dark:bg-red-900/5' : ''}`}>
                                <td className="px-5 py-3 text-xs font-semibold text-gray-800 dark:text-gray-200">{r.clientName}</td>
                                <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                                  {{ access: 'Acceso', rectification: 'Rectificación', erasure: 'Supresión', portability: 'Portabilidad', objection: 'Oposición', restriction: 'Limitación' }[r.rightType] || r.rightType}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${r.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                                    {r.status === 'in_progress' ? 'En proceso' : 'Pendiente'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400">{format(new Date(r.createdAt), 'dd/MM/yyyy')}</td>
                                <td className="px-5 py-3 text-right">
                                  {r.legalDeadline ? (
                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${isOverdue ? 'bg-red-100 text-red-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                                      {format(new Date(r.legalDeadline), 'dd/MM/yyyy')}
                                      {isOverdue && ' ⚠'}
                                    </span>
                                  ) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {gdprConsents.length === 0 && gdprRequests.length === 0 && (
                  <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
                    <Shield className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 font-medium">Sin registros RGPD</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Los consentimientos y solicitudes aparecerán aquí</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* TAB: HEATMAP DE ACTIVIDAD (R-09)                                 */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {tab === 'heatmap' && (() => {
          const HOURS = Array.from({ length: 24 }, (_, i) => i);
          const totalActivity = leads.length + sales.length;

          return (
            <div className="space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard title="Total eventos" value={String(totalActivity)} sub={`${leads.length} leads · ${sales.length} ventas`}
                  icon={<Activity className="w-4 h-4 text-blue-600" />} color="bg-blue-50 dark:bg-blue-900/30" />
                <KPICard title="Hora pico" value={`${heatmapData.peakHour.hour}:00`}
                  sub={`${heatmapData.peakHour.total} eventos en esa hora`}
                  icon={<Zap className="w-4 h-4 text-amber-600" />} color="bg-amber-50 dark:bg-amber-900/30" />
                <KPICard title="Día más activo" value={heatmapData.dayLabels[heatmapData.peakDay]}
                  sub={`Mayor concentración de actividad`}
                  icon={<Calendar className="w-4 h-4 text-emerald-600" />} color="bg-emerald-50 dark:bg-emerald-900/30" />
                <KPICard title="Fuentes analizadas" value="2"
                  sub="Leads + Ventas"
                  icon={<BarChart2 className="w-4 h-4 text-purple-600" />} color="bg-purple-50 dark:bg-purple-900/30" />
              </div>

              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Grid3X3 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Heatmap de actividad — Día × Hora</h3>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">Leads + Ventas combinados</span>
                </div>

                {totalActivity === 0 ? (
                  <div className="py-12 text-center text-gray-400 dark:text-gray-500">
                    <Grid3X3 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">Sin datos para generar el heatmap</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="min-w-[640px]">
                      {/* Etiquetas de horas */}
                      <div className="flex items-center mb-1 pl-12">
                        {HOURS.filter(h => h % 2 === 0).map(h => (
                          <div key={h} className="text-[9px] text-gray-400 dark:text-gray-500 text-center" style={{ width: `${100 / 12}%` }}>
                            {h}h
                          </div>
                        ))}
                      </div>
                      {/* Grid por día */}
                      {heatmapData.grid.map((dayRow, di) => {
                        const dayTotal = dayRow.reduce((s, h) => s + h.total, 0);
                        return (
                          <div key={di} className="flex items-center mb-0.5 gap-0.5">
                            <div className="w-10 text-[10px] font-semibold text-gray-500 dark:text-gray-400 text-right pr-2 flex-shrink-0">
                              {heatmapData.dayLabels[di]}
                            </div>
                            {dayRow.map((cell, hi) => {
                              const intensity = heatmapData.maxTotal > 0 ? cell.total / heatmapData.maxTotal : 0;
                              const bg = intensity === 0
                                ? 'bg-gray-100 dark:bg-gray-700'
                                : intensity < 0.25 ? 'bg-blue-100 dark:bg-blue-900/40'
                                : intensity < 0.5  ? 'bg-blue-300 dark:bg-blue-700'
                                : intensity < 0.75 ? 'bg-blue-500'
                                : 'bg-blue-700';
                              const textColor = intensity >= 0.5 ? 'text-white' : 'text-blue-700 dark:text-blue-300';
                              return (
                                <div
                                  key={hi}
                                  className={`h-7 rounded flex items-center justify-center text-[8px] font-bold transition-all cursor-default ${bg} ${cell.total > 0 ? textColor : ''}`}
                                  style={{ flex: 1 }}
                                  title={`${heatmapData.dayLabels[di]} ${hi}:00 — ${cell.total} eventos (${cell.leads} leads, ${cell.sales} ventas)`}
                                >
                                  {cell.total > 0 ? cell.total : ''}
                                </div>
                              );
                            })}
                            <div className="w-10 text-[9px] text-gray-400 dark:text-gray-500 text-right pl-1 flex-shrink-0">
                              {dayTotal > 0 ? dayTotal : ''}
                            </div>
                          </div>
                        );
                      })}
                      {/* Leyenda de intensidad */}
                      <div className="flex items-center gap-3 mt-4 justify-end">
                        <span className="text-[9px] text-gray-400 dark:text-gray-500">Baja actividad</span>
                        <div className="flex gap-0.5">
                          {['bg-gray-100 dark:bg-gray-700', 'bg-blue-100', 'bg-blue-300', 'bg-blue-500', 'bg-blue-700'].map((c, i) => (
                            <div key={i} className={`w-5 h-3 rounded ${c}`} />
                          ))}
                        </div>
                        <span className="text-[9px] text-gray-400 dark:text-gray-500">Alta actividad</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Top horas y días */}
              <div className="grid md:grid-cols-2 gap-5">
                <ChartCard title="Actividad por hora del día" period={preset}>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={HOURS.map(h => ({
                      hora: `${h}h`,
                      total: heatmapData.grid.reduce((s, d) => s + d[h].total, 0),
                      leads: heatmapData.grid.reduce((s, d) => s + d[h].leads, 0),
                      ventas: heatmapData.grid.reduce((s, d) => s + d[h].sales, 0),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="hora" tick={{ fontSize: 9 }} interval={1} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="leads" name="Leads" stackId="a" fill="#3b82f6" />
                      <Bar dataKey="ventas" name="Ventas" stackId="a" fill="#10b981" radius={[2, 2, 0, 0]} />
                      <Legend />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Actividad por día de la semana" period={preset}>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={heatmapData.dayLabels.map((day, di) => ({
                      dia: day,
                      leads: heatmapData.grid[di].reduce((s, h) => s + h.leads, 0),
                      ventas: heatmapData.grid[di].reduce((s, h) => s + h.sales, 0),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="leads" name="Leads" stackId="a" fill="#3b82f6" />
                      <Bar dataKey="ventas" name="Ventas" stackId="a" fill="#10b981" radius={[2, 2, 0, 0]} />
                      <Legend />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            </div>
          );
        })()}

        </>
        )}

      </div>
    </Layout>
  );
}
