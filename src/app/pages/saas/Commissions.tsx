import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { useWorkCenters } from '../../hooks/useWorkCenters';
import {
  Award,
  BadgeDollarSign,
  BarChart3,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Download,
  Edit2,
  FileSpreadsheet,
  Flame,
  Layers,
  List,
  LoaderCircle,
  MessageCircle,
  Plus,
  Send,
  Settings2,
  Trash2,
  TrendingUp,
  UserCheck,
  X,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  buildCommissionSummaries,
  buildDefaultRules,
  calculateCommission,
  createCommissionRule,
  deleteCommissionRule,
  listCommissionRules,
  listCommissions,
  saveCommissionRule,
  updateCommissionStatus,
  type CommissionRecord,
  type CommissionRule,
  type CommissionRuleType,
  type CommissionSummary,
  type CommissionTier,
  type CreateCommissionRulePayload,
} from '../../lib/commissionsApi';
import {
  acceptIdea,
  addAgentMessage,
  listAgentMessages,
  listProgress,
  type ChatMessage,
  type ProgressItem,
} from '../../lib/agentIdeasApi';
import { toast } from 'sonner';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

// ── Types ─────────────────────────────────────────────────────────────────────

type CommTab = 'report' | 'records' | 'rules';
type RecordFilter = 'all' | 'pending' | 'approved' | 'paid' | 'cancelled';
type AgentDetailTab = 'detalle' | 'heatmap' | 'ideas';
type HeatmapGranularity = 'week' | 'hour' | 'day' | 'month' | 'year';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(v: number) {
  return `${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

const RULE_TYPE_LABELS: Record<CommissionRuleType, string> = {
  fixed:          'Importe fijo',
  percent_sale:   '% sobre venta',
  percent_margin: '% sobre margen',
  tiered_percent: 'Escalada por tramos',
};

const STATUS_CFG = {
  pending:   { label: 'Pendiente',  bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  approved:  { label: 'Aprobada',   bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  paid:      { label: 'Pagada',     bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cancelled: { label: 'Cancelada',  bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500' },
} as const;

// ── Rule Form ─────────────────────────────────────────────────────────────────

interface RuleFormData {
  name: string;
  description: string;
  ruleType: CommissionRuleType;
  fixedAmount: string;
  percentRate: string;
  tiers: CommissionTier[];
  isActive: boolean;
}

const emptyRuleForm = (): RuleFormData => ({
  name: '',
  description: '',
  ruleType: 'percent_sale',
  fixedAmount: '',
  percentRate: '',
  tiers: [{ minAmount: 0, maxAmount: 10000, rate: 1 }, { minAmount: 10000, rate: 2 }],
  isActive: true,
});

function RuleModal({
  rule,
  onSave,
  onClose,
  saving,
}: {
  rule: CommissionRule | null;
  onSave: (data: RuleFormData) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<RuleFormData>(() =>
    rule
      ? {
          name: rule.name,
          description: rule.description ?? '',
          ruleType: rule.ruleType,
          fixedAmount: String(rule.fixedAmount ?? ''),
          percentRate: String(rule.percentRate ?? ''),
          tiers: rule.tiers ?? [{ minAmount: 0, maxAmount: 10000, rate: 1 }, { minAmount: 10000, rate: 2 }],
          isActive: rule.isActive,
        }
      : emptyRuleForm(),
  );

  const updateTier = (i: number, field: keyof CommissionTier, value: string) => {
    setForm((f) => {
      const tiers = [...f.tiers];
      tiers[i] = { ...tiers[i], [field]: value === '' ? undefined : Number(value) };
      return { ...f, tiers };
    });
  };

  const addTier = () =>
    setForm((f) => ({ ...f, tiers: [...f.tiers, { minAmount: 0, rate: 1 }] }));

  const removeTier = (i: number) =>
    setForm((f) => ({ ...f, tiers: f.tiers.filter((_, idx) => idx !== i) }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 text-lg">
            {rule ? 'Editar regla de comisión' : 'Nueva regla de comisión'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Nombre</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej: Comisión estándar"
              className="w-full border border-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Descripción</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descripción opcional"
              className="w-full border border-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Tipo de regla</label>
            <div className="relative">
              <select
                value={form.ruleType}
                onChange={(e) => setForm({ ...form, ruleType: e.target.value as CommissionRuleType })}
                className="w-full appearance-none bg-white dark:bg-gray-800 border-2 border-slate-200 hover:border-slate-300 rounded-xl pl-3.5 pr-9 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer"
              >
                {(Object.entries(RULE_TYPE_LABELS) as [CommissionRuleType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>

          {form.ruleType === 'fixed' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Importe fijo (€)</label>
              <input
                type="number"
                min="0"
                value={form.fixedAmount}
                onChange={(e) => setForm({ ...form, fixedAmount: e.target.value })}
                placeholder="200"
                className="w-full border border-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {(form.ruleType === 'percent_sale' || form.ruleType === 'percent_margin') && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                Porcentaje (%) {form.ruleType === 'percent_margin' ? 'sobre margen' : 'sobre precio venta'}
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.percentRate}
                onChange={(e) => setForm({ ...form, percentRate: e.target.value })}
                placeholder="3"
                className="w-full border border-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {form.ruleType === 'tiered_percent' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-700">Tramos de comisión</label>
                <AddButtonDropdown
                label="Nueva comisión"
                onQuickAdd={addTier}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de comisión"
              />
              </div>
              <div className="space-y-2">
                {form.tiers.map((tier, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <div className="flex-1">
                      <input
                        type="number"
                        value={tier.minAmount}
                        onChange={(e) => updateTier(i, 'minAmount', e.target.value)}
                        placeholder="Desde €"
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="number"
                        value={tier.maxAmount ?? ''}
                        onChange={(e) => updateTier(i, 'maxAmount', e.target.value)}
                        placeholder="Hasta € (vacío=∞)"
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="w-20">
                      <input
                        type="number"
                        value={tier.rate}
                        onChange={(e) => updateTier(i, 'rate', e.target.value)}
                        placeholder="%"
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <button onClick={() => removeTier(i)} className="text-red-400 hover:text-red-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <p className="text-xs text-slate-400">Desde € | Hasta € | %</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="rounded"
            />
            <label htmlFor="isActive" className="text-sm text-slate-700">Regla activa</label>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.name.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {saving && <LoaderCircle className="w-3.5 h-3.5 animate-spin" />}
            Guardar regla
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Agent Heatmap ───────────────────────────────────────────────────────────────

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function intensityToHeatColor(intensity: number, scheme: 'green' | 'purple' | 'blue' = 'green'): string {
  if (intensity === 0) return '#f1f5f9';
  if (scheme === 'green') {
    if (intensity < 0.15) return '#bbf7d0';
    if (intensity < 0.35) return '#4ade80';
    if (intensity < 0.55) return '#16a34a';
    if (intensity < 0.80) return '#15803d';
    return '#14532d';
  }
  if (scheme === 'purple') {
    if (intensity < 0.15) return '#e9d5ff';
    if (intensity < 0.35) return '#a78bfa';
    if (intensity < 0.55) return '#7c3aed';
    if (intensity < 0.80) return '#6d28d9';
    return '#4c1d95';
  }
  // blue
  if (intensity < 0.15) return '#bfdbfe';
  if (intensity < 0.35) return '#60a5fa';
  if (intensity < 0.55) return '#2563eb';
  if (intensity < 0.80) return '#1d4ed8';
  return '#1e3a8a';
}

function AgentHeatmap({ commissions }: { commissions: CommissionRecord[] }) {
  const [granularity, setGranularity] = useState<HeatmapGranularity>('week');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(false);
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, [granularity]);

  const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const WEEK_DAY_LABELS_MON = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();
  const currentMonth = now.getMonth();
  const currentYearStr = now.getFullYear().toString();

  // Rango de fechas de los datos
  const dateRange = useMemo(() => {
    const dates = commissions
      .map(c => { try { return new Date(c.saleDate); } catch { return null; } })
      .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
    if (!dates.length) return null;
    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));
    return { min, max };
  }, [commissions]);

  // Vista semanas: estilo contribución GitHub — últimas 26 semanas
  const weekData = useMemo(() => {
    const WEEKS = 26;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Lunes más cercano hacia atrás
    const dow = today.getDay(); // 0=dom
    const daysToLastMon = dow === 0 ? 6 : dow - 1;
    const lastMon = new Date(today);
    lastMon.setDate(lastMon.getDate() - daysToLastMon - (WEEKS - 1) * 7);

    const dayMap: Record<string, number> = {};
    for (const c of commissions) {
      try {
        const d = new Date(c.saleDate);
        if (isNaN(d.getTime())) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        dayMap[key] = (dayMap[key] || 0) + c.commissionAmount;
      } catch {}
    }

    // grid[w][d]: w=0..25 semanas, d=0..6 lun..dom
    const grid: { date: Date; val: number; key: string }[][] = [];
    const weekLabels: string[] = [];
    let lastMonthSeen = -1;

    for (let w = 0; w < WEEKS; w++) {
      const week: { date: Date; val: number; key: string }[] = [];
      let monthLabel = '';
      for (let d = 0; d < 7; d++) {
        const date = new Date(lastMon);
        date.setDate(date.getDate() + w * 7 + d);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        week.push({ date, val: dayMap[key] || 0, key });
        if (date.getDate() <= 7 && date.getMonth() !== lastMonthSeen) {
          monthLabel = MONTH_LABELS[date.getMonth()];
          lastMonthSeen = date.getMonth();
        }
      }
      grid.push(week);
      weekLabels.push(monthLabel);
    }

    const max = Math.max(...Object.values(dayMap), 0.01);
    return { grid, weekLabels, max };
  }, [commissions]);

  // Vista horas: grid día × hora (7×24)
  const hourData = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const c of commissions) {
      try {
        const d = new Date(c.saleDate);
        if (!isNaN(d.getTime())) grid[d.getDay()][d.getHours()] += c.commissionAmount;
      } catch {}
    }
    const max = Math.max(...grid.flat(), 0.01);
    return { grid, max };
  }, [commissions]);

  // Vista días: comisión por día de la semana
  const dayData = useMemo(() => {
    const byDay = Array(7).fill(0);
    for (const c of commissions) {
      try {
        const d = new Date(c.saleDate);
        if (!isNaN(d.getTime())) byDay[d.getDay()] += c.commissionAmount;
      } catch {}
    }
    const max = Math.max(...byDay, 0.01);
    return { byDay, max };
  }, [commissions]);

  // Vista meses: comisión por mes del año
  const monthData = useMemo(() => {
    const byMonth: Record<string, number[]> = {};
    for (const c of commissions) {
      try {
        const d = new Date(c.saleDate);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear().toString();
          if (!byMonth[y]) byMonth[y] = Array(12).fill(0);
          byMonth[y][d.getMonth()] += c.commissionAmount;
        }
      } catch {}
    }
    const years = Object.keys(byMonth).sort();
    const max = Math.max(...years.flatMap((y) => byMonth[y]), 0.01);
    return { byMonth, years, max };
  }, [commissions]);

  // Vista años: comisión total por año
  const yearData = useMemo(() => {
    const byYear: Record<string, number> = {};
    for (const c of commissions) {
      try {
        const d = new Date(c.saleDate);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear().toString();
          byYear[y] = (byYear[y] || 0) + c.commissionAmount;
        }
      } catch {}
    }
    const years = Object.keys(byYear).sort();
    const max = Math.max(...Object.values(byYear), 0.01);
    return { byYear, years, max };
  }, [commissions]);

  const granOptions: { id: HeatmapGranularity; label: string }[] = [
    { id: 'week', label: 'Semanas' },
    { id: 'hour', label: 'Horas' },
    { id: 'day', label: 'Días' },
    { id: 'month', label: 'Meses' },
    { id: 'year', label: 'Años' },
  ];

  if (commissions.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        Sin datos para el mapa de calor
      </div>
    );
  }

  const fmtDateShort = (d: Date) =>
    d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="p-4 space-y-4">

      {/* ── Header: rango de fechas + hora actual ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-gray-700 bg-gradient-to-r from-slate-50 via-white to-slate-50 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800 px-4 py-3">
        <div>
          {dateRange ? (
            <p className="text-xs font-semibold text-slate-700">
              {fmtDateShort(dateRange.min)}
              <span className="mx-1.5 text-slate-300">→</span>
              {fmtDateShort(dateRange.max)}
            </p>
          ) : null}
          <p className="text-[10px] text-slate-400 mt-0.5">{commissions.length} registro{commissions.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          <span className="text-[10px] font-semibold text-amber-700">
            Ahora · {DAY_LABELS[currentDay]} {String(currentHour).padStart(2, '0')}:00 h
          </span>
        </div>
      </div>

      {/* ── Selector granularidad ── */}
      <div className="flex flex-wrap gap-1.5">
        {granOptions.map((g) => (
          <button
            key={g.id}
            onClick={() => setGranularity(g.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
              granularity === g.id
                ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md shadow-blue-200 dark:shadow-blue-900/40'
                : 'border border-slate-200 bg-white dark:bg-gray-800 text-slate-600 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* ══ VISTA SEMANAS — estilo contribución GitHub ══ */}
      {granularity === 'week' && (
        <div className="overflow-x-auto">
          <p className="mb-3 text-xs font-medium text-slate-500">
            Comisiones diarias · últimas 26 semanas
          </p>
          <div className="inline-block select-none">
            {/* Etiquetas de mes encima de cada columna */}
            <div className="mb-1 flex gap-[3px] pl-8">
              {weekData.weekLabels.map((lbl, wi) => (
                <div key={wi} style={{ width: 14 }} className="text-center text-[9px] text-slate-400 truncate">
                  {lbl}
                </div>
              ))}
            </div>

            {/* Filas lun-dom */}
            {WEEK_DAY_LABELS_MON.map((dayLbl, di) => {
              // di=0→Lun(getDay=1) ... di=5→Sáb(getDay=6) ... di=6→Dom(getDay=0)
              const getdayIdx = di === 6 ? 0 : di + 1;
              return (
                <div key={di} className="mb-[3px] flex items-center gap-[3px]">
                  <span className="w-7 text-right text-[9px] text-slate-400 pr-1">{dayLbl}</span>
                  {weekData.grid.map((week, wi) => {
                    const cell = week[di];
                    const today = new Date();
                    const isToday = cell.date.toDateString() === today.toDateString();
                    const isFuture = cell.date > today;
                    const intensity = weekData.max > 0 ? cell.val / weekData.max : 0;
                    const idx = wi * 7 + di;
                    const delay = idx * 6;
                    const bg = isFuture ? '#f1f5f9' : intensityToHeatColor(intensity, 'green');
                    return (
                      <div
                        key={wi}
                        title={`${cell.date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} — ${formatCurrency(cell.val)}`}
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          backgroundColor: bg,
                          opacity: isFuture ? (mounted ? 0.18 : 0) : (mounted ? 1 : 0),
                          transform: mounted ? 'scale(1)' : 'scale(0.4)',
                          transition: `opacity 0.35s ease ${delay}ms, transform 0.35s ease ${delay}ms`,
                          boxShadow: isToday ? '0 0 0 2px #f59e0b, 0 0 6px rgba(245,158,11,0.6)' : undefined,
                          cursor: 'default',
                          flexShrink: 0,
                        }}
                      />
                    );
                  })}
                </div>
              );
            })}

            {/* Leyenda */}
            <div className="mt-3 flex items-center gap-1.5 pl-8">
              <span className="text-[9px] text-slate-400">Menos</span>
              {[0, 0.12, 0.35, 0.65, 1].map((v, i) => (
                <div
                  key={i}
                  style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: intensityToHeatColor(v, 'green'), flexShrink: 0 }}
                />
              ))}
              <span className="text-[9px] text-slate-400">Más</span>
            </div>
          </div>
        </div>
      )}

      {/* ══ VISTA HORAS ══ */}
      {granularity === 'hour' && (
        <div className="overflow-x-auto">
          <p className="mb-2 text-xs font-medium text-slate-500">Comisión por día de la semana × hora del día</p>
          <div className="inline-block min-w-0">
            {/* Cabecera horas */}
            <div className="flex gap-[3px] mb-1 pl-8">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} style={{ width: 16 }} className="text-center text-[9px] text-slate-400 truncate">
                  {h % 6 === 0 ? `${h}h` : ''}
                </div>
              ))}
            </div>
            {/* Filas días */}
            {hourData.grid.map((row, di) => (
              <div key={di} className="mb-[3px] flex items-center gap-[3px]">
                <span className="w-7 text-right text-[9px] text-slate-500 font-medium pr-1">{DAY_LABELS[di]}</span>
                {row.map((val, hi) => {
                  const intensity = hourData.max > 0 ? val / hourData.max : 0;
                  const isNow = di === currentDay && hi === currentHour;
                  const idx = di * 24 + hi;
                  const delay = idx * 4;
                  return (
                    <div
                      key={hi}
                      title={`${DAY_LABELS[di]} ${String(hi).padStart(2, '0')}:00 h — ${formatCurrency(val)}`}
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 3,
                        backgroundColor: intensityToHeatColor(intensity, 'purple'),
                        opacity: mounted ? 1 : 0,
                        transform: mounted ? 'scale(1)' : 'scale(0.3)',
                        transition: `opacity 0.3s ease ${delay}ms, transform 0.3s ease ${delay}ms`,
                        boxShadow: isNow ? '0 0 0 2px #f59e0b, 0 0 8px rgba(245,158,11,0.7)' : undefined,
                        flexShrink: 0,
                        cursor: 'default',
                      }}
                    />
                  );
                })}
              </div>
            ))}
            {/* Leyenda */}
            <div className="mt-3 flex items-center gap-1.5 pl-8">
              <span className="text-[9px] text-slate-400">Menos</span>
              {[0, 0.12, 0.35, 0.65, 1].map((v, i) => (
                <div key={i} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: intensityToHeatColor(v, 'purple'), flexShrink: 0 }} />
              ))}
              <span className="text-[9px] text-slate-400">Más</span>
              <span className="ml-3 flex items-center gap-1 text-[9px] text-amber-600 font-medium">
                <span style={{ width: 10, height: 10, borderRadius: 2, display: 'inline-block', boxShadow: '0 0 0 1.5px #f59e0b' }} />
                Hora actual
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ══ VISTA DÍAS ══ */}
      {granularity === 'day' && (
        <div>
          <p className="mb-3 text-xs font-medium text-slate-500">Comisión acumulada por día de la semana</p>
          <div className="flex gap-2 items-end" style={{ height: 140 }}>
            {dayData.byDay.map((val, i) => {
              const pct = dayData.max > 0 ? val / dayData.max : 0;
              const barH = Math.max(pct * 100, val > 0 ? 4 : 0);
              const isToday = i === currentDay;
              const delay = i * 80;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span
                    className="text-[10px] font-semibold text-slate-600 transition-all"
                    style={{ opacity: mounted ? 1 : 0, transition: `opacity 0.4s ease ${delay + 300}ms` }}
                  >
                    {formatCurrency(val)}
                  </span>
                  <div className="relative w-full flex items-end justify-center" style={{ height: 100 }}>
                    <div
                      title={`${DAY_LABELS[i]} — ${formatCurrency(val)}`}
                      style={{
                        width: '70%',
                        maxWidth: 32,
                        height: mounted ? `${barH}%` : '0%',
                        borderRadius: '4px 4px 0 0',
                        background: isToday
                          ? 'linear-gradient(to top, #f59e0b, #fbbf24)'
                          : 'linear-gradient(to top, #6366f1, #818cf8)',
                        transition: `height 0.6s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`,
                        boxShadow: isToday ? '0 0 12px rgba(245,158,11,0.4)' : '0 2px 8px rgba(99,102,241,0.25)',
                      }}
                    />
                    {isToday && (
                      <div
                        className="absolute top-0 right-0 translate-x-1 -translate-y-1"
                        style={{
                          width: 8, height: 8, borderRadius: '50%',
                          backgroundColor: '#f59e0b',
                          boxShadow: '0 0 6px rgba(245,158,11,0.8)',
                          animation: 'pulse 1.5s infinite',
                        }}
                      />
                    )}
                  </div>
                  <span className={`text-[10px] font-semibold ${isToday ? 'text-amber-600' : 'text-slate-500'}`}>
                    {DAY_LABELS[i]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ VISTA MESES ══ */}
      {granularity === 'month' && (
        <div className="overflow-x-auto">
          <p className="mb-2 text-xs font-medium text-slate-500">Comisión por mes y año</p>
          <div className="inline-block min-w-0">
            <div className="grid gap-[3px]" style={{ gridTemplateColumns: `auto repeat(12, minmax(32px, 1fr))` }}>
              <div />
              {MONTH_LABELS.map((m, mi) => (
                <div key={m} className={`text-center text-[10px] font-medium ${mi === currentMonth ? 'text-amber-600' : 'text-slate-400'}`}>
                  {m}
                </div>
              ))}
              {monthData.years.map((y, yi) => (
                <React.Fragment key={y}>
                  <div className={`text-[10px] font-semibold pr-1.5 flex items-center ${y === currentYearStr ? 'text-amber-600' : 'text-slate-500'}`}>
                    {y}
                  </div>
                  {(monthData.byMonth[y] || Array(12).fill(0)).map((val, mi) => {
                    const intensity = monthData.max > 0 ? val / monthData.max : 0;
                    const isNow = y === currentYearStr && mi === currentMonth;
                    const idx = yi * 12 + mi;
                    const delay = idx * 15;
                    return (
                      <div
                        key={mi}
                        title={`${MONTH_LABELS[mi]} ${y} — ${formatCurrency(val)}`}
                        style={{
                          minWidth: 32,
                          height: 26,
                          borderRadius: 5,
                          backgroundColor: intensityToHeatColor(intensity, 'blue'),
                          opacity: mounted ? 1 : 0,
                          transform: mounted ? 'scale(1)' : 'scale(0.5)',
                          transition: `opacity 0.35s ease ${delay}ms, transform 0.35s ease ${delay}ms`,
                          boxShadow: isNow ? '0 0 0 2px #f59e0b, 0 0 6px rgba(245,158,11,0.5)' : undefined,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 9,
                          fontWeight: 600,
                          color: intensity > 0.35 ? 'white' : '#64748b',
                          cursor: 'default',
                        }}
                      >
                        {val > 0 ? (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : Math.round(val)) : ''}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
            {/* Leyenda */}
            <div className="mt-3 flex items-center gap-1.5">
              <span className="text-[9px] text-slate-400">Menos</span>
              {[0, 0.12, 0.35, 0.65, 1].map((v, i) => (
                <div key={i} style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: intensityToHeatColor(v, 'blue'), flexShrink: 0 }} />
              ))}
              <span className="text-[9px] text-slate-400">Más</span>
            </div>
          </div>
        </div>
      )}

      {/* ══ VISTA AÑOS ══ */}
      {granularity === 'year' && (
        <div>
          <p className="mb-3 text-xs font-medium text-slate-500">Comisión total por año</p>
          <div className="flex gap-4 items-end" style={{ height: 160 }}>
            {yearData.years.map((y, yi) => {
              const val = yearData.byYear[y] ?? 0;
              const pct = yearData.max > 0 ? val / yearData.max : 0;
              const barH = Math.max(pct * 120, val > 0 ? 4 : 0);
              const isCurrentYear = y === currentYearStr;
              const delay = yi * 100;
              return (
                <div key={y} className="flex-1 flex flex-col items-center gap-1.5 min-w-[56px]">
                  <span
                    className="text-[10px] font-bold text-slate-600"
                    style={{ opacity: mounted ? 1 : 0, transition: `opacity 0.4s ease ${delay + 400}ms` }}
                  >
                    {formatCurrency(val)}
                  </span>
                  <div className="relative w-full flex items-end justify-center" style={{ height: 120 }}>
                    <div
                      title={`${y} — ${formatCurrency(val)}`}
                      style={{
                        width: '60%',
                        maxWidth: 40,
                        height: mounted ? `${(barH / 120) * 100}%` : '0%',
                        borderRadius: '6px 6px 0 0',
                        background: isCurrentYear
                          ? 'linear-gradient(to top, #f59e0b, #fde68a)'
                          : 'linear-gradient(to top, #10b981, #6ee7b7)',
                        transition: `height 0.7s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`,
                        boxShadow: isCurrentYear
                          ? '0 0 16px rgba(245,158,11,0.4)'
                          : '0 4px 12px rgba(16,185,129,0.3)',
                      }}
                    />
                  </div>
                  <span className={`text-xs font-bold ${isCurrentYear ? 'text-amber-600' : 'text-slate-600'}`}>{y}</span>
                  {isCurrentYear && (
                    <span className="text-[9px] font-semibold text-amber-500 bg-amber-50 rounded-full px-1.5 py-0.5">actual</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Agent Ideas Chat ────────────────────────────────────────────────────────────

function AgentIdeasChat({
  agentId,
  agentName,
  userId,
  onProgressCreated,
}: {
  agentId: string;
  agentName: string;
  userId: string;
  onProgressCreated: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    listAgentMessages(userId, agentId)
  );
  const [input, setInput] = useState('');

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;

    const userMsg = addAgentMessage(userId, agentId, agentName, 'user', text, true);
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // Respuesta simulada del agente
    const agentReplies = [
      'Gracias por la idea. ¿Quieres que la apliquemos como progreso?',
      'Buena sugerencia. Puedes aceptarla para añadirla al progreso general.',
      'Anotado. Si la aceptas, se creará un progreso visible para todos.',
    ];
    const reply = agentReplies[Math.floor(Math.random() * agentReplies.length)];
    setTimeout(() => {
      const agentMsg = addAgentMessage(userId, agentId, agentName, 'agent', reply, false);
      setMessages((prev) => [...prev, agentMsg]);
    }, 600);
  };

  const handleAccept = (msg: ChatMessage) => {
    const item = acceptIdea(userId, msg.id, agentId, agentName);
    if (item) {
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, accepted: true } : m))
      );
      onProgressCreated();
    }
  };

  return (
    <div className="flex flex-col p-4 min-h-[280px]">
      <p className="text-xs text-slate-500 mb-3">
        Escribe ideas para mejorar la empresa. Si las aceptas, se crearán progresos en el chat general.
      </p>
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 max-h-[200px] min-h-[120px] bg-slate-50 rounded-lg p-3">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">
            Escribe tu primera idea para mejorar la empresa...
          </p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-800 border border-slate-200 text-slate-700'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
                {msg.isIdea && msg.role === 'user' && (
                  <div className="mt-2 flex items-center gap-2">
                    {msg.accepted ? (
                      <span className="text-xs text-emerald-400 font-medium">✓ Aplicada</span>
                    ) : (
                      <button
                        onClick={() => handleAccept(msg)}
                        className="text-xs px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 font-medium transition-colors"
                      >
                        Aceptar y crear progreso
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Escribe una idea para mejorar la empresa..."
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Send className="w-4 h-4" />
          Enviar
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function Commissions() {
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const { activeWorkCenters, hasWorkCenters } = useWorkCenters();

  const [tab, setTab] = useState<CommTab>('report');
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [recordFilter, setRecordFilter] = useState<RecordFilter>('all');
  const [filterWorkCenter, setFilterWorkCenter] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [agentDetailTab, setAgentDetailTab] = useState<AgentDetailTab>('detalle');
  const [progressVersion, setProgressVersion] = useState(0);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'agent', label: 'Agente' },
    { key: 'amount', label: 'Importe' },
    { key: 'sale', label: 'Venta' },
    { key: 'date', label: 'Fecha' },
    { key: 'status', label: 'Estado' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'agent', label: 'Agente', example: '' },
    { key: 'amount', label: 'Importe', example: '' },
    { key: 'sale', label: 'Venta', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'status', label: 'Estado', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} comisión(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} comisión(s) importado(s)`);
  };


  const progressItems = useMemo(
    () => (userId ? listProgress(userId) : []),
    [userId, progressVersion]
  );

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [r, c] = await Promise.all([listCommissionRules(userId), listCommissions(userId)]);
      setRules(r);
      setRecords(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);
  useModalClose(showRuleModal, () => { setShowRuleModal(false); setEditingRule(null); });

  // ── Available months for filter ──────────────────────────────────────────────
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const r of records) {
      months.add(r.saleDate.slice(0, 7));
    }
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [records]);

  // ── Filtered records ─────────────────────────────────────────────────────────
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (recordFilter !== 'all' && r.status !== recordFilter) return false;
      if (selectedMonth && !r.saleDate.startsWith(selectedMonth)) return false;
      if (filterWorkCenter !== 'all' && (r as any).workCenterId !== filterWorkCenter) return false;
      return true;
    });
  }, [records, recordFilter, selectedMonth, filterWorkCenter]);

  // ── Commission summaries ─────────────────────────────────────────────────────
  const summaries = useMemo(() => buildCommissionSummaries(filteredRecords), [filteredRecords]);

  const totals = useMemo(() => ({
    totalCommission: summaries.reduce((s, a) => s + a.totalCommission, 0),
    pendingCommission: summaries.reduce((s, a) => s + a.pendingCommission, 0),
    paidCommission: summaries.reduce((s, a) => s + a.paidCommission, 0),
    totalSales: summaries.reduce((s, a) => s + a.totalSales, 0),
  }), [summaries]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleSaveRule = async (data: RuleFormData) => {
    if (!userId) return;
    setSaving(true);
    try {
      const payload: CreateCommissionRulePayload = {
        user_id: userId,
        name: data.name.trim(),
        description: data.description.trim() || undefined,
        ruleType: data.ruleType,
        fixedAmount: data.ruleType === 'fixed' ? Number(data.fixedAmount) : undefined,
        percentRate: (data.ruleType === 'percent_sale' || data.ruleType === 'percent_margin')
          ? Number(data.percentRate)
          : undefined,
        tiers: data.ruleType === 'tiered_percent' ? data.tiers : undefined,
        isActive: data.isActive,
      };

      if (editingRule) {
        await saveCommissionRule({ ...editingRule, ...payload, updatedAt: new Date().toISOString() });
      } else {
        await createCommissionRule(payload);
      }
      setShowRuleModal(false);
      setEditingRule(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('¿Eliminar esta regla de comisión?')) return;
    try {
      await deleteCommissionRule(ruleId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
    }
  };

  const handleSeedRules = async () => {
    if (!userId) return;
    const defaults = buildDefaultRules(userId);
    setSaving(true);
    try {
      for (const rule of defaults) {
        await saveCommissionRule(rule);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al inicializar reglas');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (record: CommissionRecord, status: CommissionRecord['status']) => {
    try {
      const updated = await updateCommissionStatus(record, status);
      setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar estado');
    }
  };

  const exportCsv = () => {
    const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Agente', 'Vehículo', 'Matrícula', 'Cliente', 'Fecha', 'PVP', 'Coste', 'Margen', 'Regla', 'Comisión', 'Estado'];
    const rows = filteredRecords.map((r) => [
      r.agentName, r.vehicleName, r.vehiclePlate, r.clientName, r.saleDate,
      r.salePrice.toFixed(2), r.purchasePrice.toFixed(2), r.grossMargin.toFixed(2),
      r.ruleName, r.commissionAmount.toFixed(2), r.status,
    ].map(esc).join(','));
    const csv = [header.map(esc).join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comisiones-${selectedMonth || 'todas'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const tabs: { id: CommTab; label: string; icon: React.ReactNode }[] = [
    { id: 'report',  label: 'Informe mensual',  icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'records', label: 'Registros',         icon: <Layers className="w-4 h-4" /> },
    { id: 'rules',   label: 'Reglas',            icon: <Settings2 className="w-4 h-4" /> },
  ];

  return (
    <Layout title="Comisiones" subtitle="" noPadding>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-4">
          {tab === 'records' && (
            <button
              onClick={exportCsv}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar CSV
            </button>
          )}
          {tab === 'rules' && (
            <button
              onClick={() => { setEditingRule(null); setShowRuleModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nueva regla
            </button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Progresos generales (ideas aceptadas) */}
        {progressItems.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                Progresos generales
              </h3>
              <span className="text-xs text-slate-500">{progressItems.length} idea{progressItems.length !== 1 ? 's' : ''} aplicada{progressItems.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-[200px] overflow-y-auto">
              {progressItems.map((p: ProgressItem) => (
                <div key={p.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{p.idea}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Por {p.agentName} · {formatDate(p.acceptedAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total comisiones', value: formatCurrency(totals.totalCommission), icon: <CircleDollarSign className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50' },
            { label: 'Pendiente de pago', value: formatCurrency(totals.pendingCommission), icon: <BadgeDollarSign className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50' },
            { label: 'Comisiones pagadas', value: formatCurrency(totals.paidCommission), icon: <TrendingUp className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50' },
            { label: 'Ventas con comisión', value: totals.totalSales, icon: <UserCheck className="w-5 h-5 text-purple-500" />, bg: 'bg-purple-50' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 p-4">
              <div className={`inline-flex p-2 rounded-lg ${kpi.bg} mb-3`}>{kpi.icon}</div>
              <div className="text-2xl font-bold text-slate-900">{kpi.value}</div>
              <div className="text-xs text-slate-500 mt-1">{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {tabs.map((t, i) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex-shrink-0 flex items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                  isActive ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'
                } ${i !== 0 ? 'border-l border-gray-100 dark:border-gray-800' : ''}`}
              >
                {t.label}
                {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-t-full" />}
              </button>
            );
          })}
        </div>

        {/* Filters (report + records) */}
        {(tab === 'report' || tab === 'records') && (
          <div className="flex flex-wrap gap-3">
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="appearance-none bg-white dark:bg-gray-800 border-2 border-slate-200 hover:border-slate-300 rounded-xl pl-3.5 pr-9 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer shadow-sm"
              >
                <option value="">Todos los meses</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {formatMonth(m + '-01')}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
            {hasWorkCenters && (
              <select
                className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none"
                value={filterWorkCenter}
                onChange={e => setFilterWorkCenter(e.target.value)}
              >
                <option value="all">Todos los centros</option>
                {activeWorkCenters.map((wc) => (
                  <option key={wc.id} value={wc.id}>{wc.name}</option>
                ))}
              </select>
            )}
            {tab === 'records' && (
              <div className="relative">
                <select
                  value={recordFilter}
                  onChange={(e) => setRecordFilter(e.target.value as RecordFilter)}
                  className="appearance-none bg-white dark:bg-gray-800 border-2 border-slate-200 hover:border-slate-300 rounded-xl pl-3.5 pr-9 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-pointer shadow-sm"
                >
                  <option value="all">Todos los estados</option>
                  <option value="pending">Pendiente</option>
                  <option value="approved">Aprobada</option>
                  <option value="paid">Pagada</option>
                  <option value="cancelled">Cancelada</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <LoaderCircle className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        )}

        {/* ── REPORT TAB ── */}
        {!loading && tab === 'report' && (
          <div className="space-y-4">
            {summaries.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 p-12 text-center">
                <Award className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Sin registros de comisiones</p>
                <p className="text-sm text-slate-400 mt-1">
                  Las comisiones se generan automáticamente al cerrar una venta con una regla asignada
                </p>
              </div>
            ) : (
              summaries.map((summary: CommissionSummary) => (
                <div key={summary.agentId} className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
                    onClick={() => setExpandedAgent(expandedAgent === summary.agentId ? null : summary.agentId)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                        {summary.agentName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-slate-900">{summary.agentName}</p>
                        <p className="text-xs text-slate-500">{summary.totalSales} venta{summary.totalSales !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right hidden sm:block">
                        <p className="text-xs text-slate-500">Total comisión</p>
                        <p className="font-bold text-slate-900">{formatCurrency(summary.totalCommission)}</p>
                      </div>
                      <div className="text-right hidden sm:block">
                        <p className="text-xs text-amber-600">Pendiente</p>
                        <p className="font-semibold text-amber-700">{formatCurrency(summary.pendingCommission)}</p>
                      </div>
                      <div className="text-right hidden sm:block">
                        <p className="text-xs text-emerald-600">Pagado</p>
                        <p className="font-semibold text-emerald-700">{formatCurrency(summary.paidCommission)}</p>
                      </div>
                      {expandedAgent === summary.agentId
                        ? <ChevronUp className="w-4 h-4 text-slate-400" />
                        : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>

                  {expandedAgent === summary.agentId && (
                    <div className="border-t border-slate-100">
                      {/* Pestañas Detalle | Mapa de calor */}
                      <div className="flex gap-1 px-4 pt-3 pb-2 border-b border-slate-100">
                        <button
                          onClick={() => setAgentDetailTab('detalle')}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            agentDetailTab === 'detalle' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          <List className="w-4 h-4" />
                          Detalle
                        </button>
                        <button
                          onClick={() => setAgentDetailTab('heatmap')}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            agentDetailTab === 'heatmap' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          <Flame className="w-4 h-4" />
                          Mapa de calor
                        </button>
                        <button
                          onClick={() => setAgentDetailTab('ideas')}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            agentDetailTab === 'ideas' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          <MessageCircle className="w-4 h-4" />
                          Ideas
                        </button>
                      </div>

                      {agentDetailTab === 'detalle' && (
                      <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-sm">
                        <thead>
                          <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                            <th className="px-4 py-3 text-left">Fecha</th>
                            <th className="px-4 py-3 text-left">Vehículo</th>
                            <th className="px-4 py-3 text-left">Cliente</th>
                            <th className="px-4 py-3 text-right">PVP</th>
                            <th className="px-4 py-3 text-right">Margen</th>
                            <th className="px-4 py-3 text-right">Comisión</th>
                            <th className="px-4 py-3 text-center">Estado</th>
                            <th className="px-4 py-3 text-center">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {summary.commissions.map((rec) => {
                            const cfg = STATUS_CFG[rec.status];
                            return (
                              <tr key={rec.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(rec.saleDate)}</td>
                                <td className="px-4 py-3">
                                  <p className="font-medium text-slate-800">{rec.vehicleName}</p>
                                  <p className="text-xs text-slate-400">{rec.vehiclePlate}</p>
                                </td>
                                <td className="px-4 py-3 text-slate-600">{rec.clientName}</td>
                                <td className="px-4 py-3 text-right font-medium text-slate-800">{formatCurrency(rec.salePrice)}</td>
                                <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(rec.grossMargin)}</td>
                                <td className="px-4 py-3 text-right font-bold text-blue-700">{formatCurrency(rec.commissionAmount)}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                    {cfg.label}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {rec.status === 'pending' && (
                                    <div className="flex gap-1 justify-center">
                                      <button
                                        onClick={() => handleStatusChange(rec, 'approved')}
                                        className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
                                      >
                                        Aprobar
                                      </button>
                                    </div>
                                  )}
                                  {rec.status === 'approved' && (
                                    <button
                                      onClick={() => handleStatusChange(rec, 'paid')}
                                      className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 transition-colors"
                                    >
                                      Marcar pagada
                                    </button>
                                  )}
                                  {rec.status === 'paid' && (
                                    <span className="text-xs text-slate-400">
                                      {rec.paidAt ? formatDate(rec.paidAt) : '—'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-50 font-semibold">
                            <td colSpan={5} className="px-4 py-3 text-right text-slate-700">
                              Total agente:
                            </td>
                            <td className="px-4 py-3 text-right text-blue-700 font-bold">
                              {formatCurrency(summary.totalCommission)}
                            </td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                      </div>
                      )}

                      {agentDetailTab === 'heatmap' && (
                        <AgentHeatmap commissions={summary.commissions} />
                      )}

                      {agentDetailTab === 'ideas' && (
                        <AgentIdeasChat
                          agentId={summary.agentId}
                          agentName={summary.agentName}
                          userId={userId}
                          onProgressCreated={() => setProgressVersion((v) => v + 1)}
                        />
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── RECORDS TAB ── */}
        {!loading && tab === 'records' && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 overflow-hidden">
            {filteredRecords.length === 0 ? (
              <div className="p-12 text-center">
                <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Sin registros</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                      <th className="px-4 py-3 text-left">Comercial</th>
                      <th className="px-4 py-3 text-left">Vehículo</th>
                      <th className="px-4 py-3 text-left">Cliente</th>
                      <th className="px-4 py-3 text-left">Fecha</th>
                      <th className="px-4 py-3 text-right">PVP</th>
                      <th className="px-4 py-3 text-right">Comisión</th>
                      <th className="px-4 py-3 text-left">Regla</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecords.map((rec) => {
                      const cfg = STATUS_CFG[rec.status];
                      return (
                        <tr key={rec.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold text-xs">
                                {rec.agentName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                              </div>
                              <span className="font-medium text-slate-800">{rec.agentName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800">{rec.vehicleName}</p>
                            <p className="text-xs text-slate-400">{rec.vehiclePlate}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{rec.clientName}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(rec.saleDate)}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatCurrency(rec.salePrice)}</td>
                          <td className="px-4 py-3 text-right font-bold text-blue-700">{formatCurrency(rec.commissionAmount)}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{rec.ruleName}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                              {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 justify-center">
                              {rec.status === 'pending' && (
                                <>
                                  <button
                                    onClick={() => handleStatusChange(rec, 'approved')}
                                    title="Aprobar"
                                    className="p-1 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                                  >
                                    <TrendingUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleStatusChange(rec, 'cancelled')}
                                    title="Cancelar"
                                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              {rec.status === 'approved' && (
                                <button
                                  onClick={() => handleStatusChange(rec, 'paid')}
                                  title="Marcar pagada"
                                  className="p-1 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── RULES TAB ── */}
        {!loading && tab === 'rules' && (
          <div className="space-y-4">
            {rules.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 p-12 text-center">
                <Settings2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Sin reglas de comisión</p>
                <p className="text-sm text-slate-400 mt-2 mb-4">
                  Define las reglas para calcular automáticamente las comisiones al cerrar ventas
                </p>
                <button
                  onClick={handleSeedRules}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Inicializando...' : 'Inicializar reglas por defecto'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {rules.map((rule) => (
                  <div key={rule.id} className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${rule.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                        />
                        <h3 className="font-semibold text-slate-900 text-sm">{rule.name}</h3>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setEditingRule(rule); setShowRuleModal(true); }}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {rule.description && (
                      <p className="text-xs text-slate-500 mb-3">{rule.description}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {RULE_TYPE_LABELS[rule.ruleType]}
                      </span>
                      <span className="text-sm font-bold text-blue-700">
                        {rule.ruleType === 'fixed'
                          ? formatCurrency(rule.fixedAmount ?? 0)
                          : rule.ruleType === 'tiered_percent'
                          ? `${rule.tiers?.length ?? 0} tramos`
                          : `${rule.percentRate ?? 0}%`}
                      </span>
                    </div>
                    {rule.ruleType === 'tiered_percent' && rule.tiers && (
                      <div className="mt-3 space-y-1">
                        {rule.tiers.map((tier, i) => (
                          <div key={i} className="flex justify-between text-xs text-slate-500">
                            <span>
                              {tier.minAmount.toLocaleString('es-ES')} €
                              {tier.maxAmount ? ` – ${tier.maxAmount.toLocaleString('es-ES')} €` : '+'}
                            </span>
                            <span className="font-medium text-slate-700">{tier.rate}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Preview calculation */}
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-xs text-slate-400">
                        Ej: venta 20.000 € / coste 14.000 € →{' '}
                        <span className="font-semibold text-blue-600">
                          {formatCurrency(calculateCommission(rule, 20000, 14000))}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Rule modal */}
        {showRuleModal && (
          <RuleModal
            rule={editingRule}
            onSave={handleSaveRule}
            onClose={() => { setShowRuleModal(false); setEditingRule(null); }}
            saving={saving}
          />
        )}
      </div>
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="commissions"
        moduleLabel="Comisiones"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Comisiones"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
