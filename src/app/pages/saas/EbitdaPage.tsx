import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useFinanceUserId } from '../../hooks/useFinanceUserId';
import { useBusiness } from '../../context/BusinessContext';
import { listFinanceMovements } from '../../lib/financeApi';
import type { FinanceMovementRecord } from '../../lib/financeTypes';
import type { EbitdaScopeFilter } from '../../lib/financeScope';
import {
  computeEbitdaMonthly,
  computeEbitdaBreakdown,
  extractYearsFromMovements,
  getCategoryLabel,
} from '../../lib/ebitdaMetrics';
import {
  PiggyBank, TrendingUp, TrendingDown,
  DollarSign, BarChart3, Calendar,
  Percent, Building2, Layers, Store,
} from 'lucide-react';

function fmt(n: number) { return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

type ScopeMode = 'all' | 'business' | 'store';

export function EbitdaPage() {
  const financeUserId = useFinanceUserId();
  const { businesses, currentBusiness } = useBusiness();
  const [movements, setMovements] = useState<FinanceMovementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');
  const [selectedBusinessId, setSelectedBusinessId] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState('');

  const loadData = useCallback(async () => {
    if (!financeUserId) {
      setMovements([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setMovements(await listFinanceMovements(financeUserId));
    } catch {
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, [financeUserId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (scopeMode === 'business' && !selectedBusinessId && currentBusiness?.business_id) {
      setSelectedBusinessId(currentBusiness.business_id);
    }
  }, [scopeMode, selectedBusinessId, currentBusiness?.business_id]);

  const businessNameMap = useMemo(
    () => new Map(businesses.map((b) => [b.business_id, b.name])),
    [businesses],
  );

  const storeOptions = useMemo(() => {
    const map = new Map<string, string>();
    const bid = scopeMode === 'store' ? selectedBusinessId : '';
    for (const m of movements) {
      if (bid && m.businessId && m.businessId !== bid) continue;
      const id = String(m.workCenterId || '').trim();
      if (!id) continue;
      map.set(id, String(m.workCenterName || id));
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [movements, scopeMode, selectedBusinessId]);

  const scopeFilter: EbitdaScopeFilter = useMemo(() => {
    if (scopeMode === 'store' && selectedStoreId) {
      return {
        level: 'store',
        workCenterId: selectedStoreId,
        businessId: selectedBusinessId || undefined,
      };
    }
    if (scopeMode === 'business' && selectedBusinessId) {
      return { level: 'business', businessId: selectedBusinessId };
    }
    return { level: 'all' };
  }, [scopeMode, selectedBusinessId, selectedStoreId]);

  const scopeLabel = useMemo(() => {
    if (scopeMode === 'all') return 'Todas las empresas (consolidado)';
    if (scopeMode === 'business') {
      return businessNameMap.get(selectedBusinessId) || 'Empresa';
    }
    const store = storeOptions.find((s) => s.id === selectedStoreId);
    return store?.name || 'Tienda';
  }, [scopeMode, selectedBusinessId, selectedStoreId, businessNameMap, storeOptions]);

  const years = useMemo(() => extractYearsFromMovements(movements), [movements]);

  const { months: monthlyData, annual: annualTotals } = useMemo(
    () => computeEbitdaMonthly(movements, selectedYear, scopeFilter),
    [movements, selectedYear, scopeFilter],
  );

  const businessBreakdown = useMemo(
    () => (scopeMode === 'all' ? computeEbitdaBreakdown(movements, selectedYear, 'business', businessNameMap) : []),
    [movements, selectedYear, scopeMode, businessNameMap],
  );

  const storeBreakdown = useMemo(() => {
    if (scopeMode === 'store') return [];
    const scoped =
      scopeMode === 'business' && selectedBusinessId
        ? movements.filter((m) => m.businessId === selectedBusinessId)
        : movements;
    return computeEbitdaBreakdown(scoped, selectedYear, 'store');
  }, [movements, selectedYear, scopeMode, selectedBusinessId]);

  const maxBar = useMemo(() => Math.max(...monthlyData.map(m => Math.max(m.income, m.opex)), 1), [monthlyData]);

  const topCategories = useMemo(() => {
    const yearMvs = movements.filter(m => m.date.startsWith(String(selectedYear)) && m.type === 'pago');
    const byCategory: Record<string, number> = {};
    yearMvs.forEach(m => {
      const label = getCategoryLabel(m.category, 'pago');
      byCategory[label] = (byCategory[label] || 0) + m.totalAmount;
    });
    return Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [movements, selectedYear]);

  const totalExpensesCat = topCategories.reduce((s, [, v]) => s + v, 0);

  return (
    <Layout title="EBITDA" subtitle="Resultado operativo por empresa, tienda o consolidado">
      <div className="space-y-6">
        {/* Scope + year */}
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Ámbito</label>
              <select
                className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                value={scopeMode}
                onChange={(e) => {
                  const mode = e.target.value as ScopeMode;
                  setScopeMode(mode);
                  if (mode === 'business' && !selectedBusinessId) {
                    setSelectedBusinessId(currentBusiness?.business_id || businesses[0]?.business_id || '');
                  }
                }}
              >
                <option value="all">Todas las empresas</option>
                <option value="business">Una empresa</option>
                <option value="store">Una tienda</option>
              </select>
            </div>
            {(scopeMode === 'business' || scopeMode === 'store') && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Empresa</label>
                <select
                  className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800"
                  value={selectedBusinessId}
                  onChange={(e) => { setSelectedBusinessId(e.target.value); setSelectedStoreId(''); }}
                >
                  {businesses.map((b) => (
                    <option key={b.business_id} value={b.business_id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}
            {scopeMode === 'store' && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Tienda</label>
                <select
                  className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800"
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                >
                  <option value="">Selecciona tienda…</option>
                  {storeOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <select className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
              {years.map(y => (<option key={y} value={y}>{y}</option>))}
            </select>
          </div>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
          Viendo: <span className="font-semibold text-gray-700 dark:text-gray-300">{scopeLabel}</span>
          {scopeMode === 'store' && !selectedStoreId ? ' — elige una tienda para ver datos' : null}
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500"><div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />Cargando datos...</div>
        ) : scopeMode === 'store' && !selectedStoreId ? (
          <div className="rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 p-12 text-center text-gray-500">
            <Store className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Selecciona una tienda para ver su EBITDA.</p>
            <p className="text-xs mt-1">Los movimientos nuevos (TPV, facturas, manual) se etiquetan automáticamente.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
                <div className="text-green-600 mb-2"><TrendingUp className="w-5 h-5" /></div>
                <div className="text-2xl font-bold text-green-900 dark:text-green-200">{fmt(annualTotals.income)}€</div>
                <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">Ingresos {selectedYear}</div>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
                <div className="text-red-600 mb-2"><TrendingDown className="w-5 h-5" /></div>
                <div className="text-2xl font-bold text-red-900 dark:text-red-200">{fmt(annualTotals.opex)}€</div>
                <div className="text-xs text-red-700 dark:text-red-400 mt-0.5">Gastos operativos</div>
              </div>
              <div className={`p-5 border-2 rounded-xl ${annualTotals.ebitda >= 0 ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700'}`}>
                <div className={`mb-2 ${annualTotals.ebitda >= 0 ? 'text-blue-600' : 'text-amber-600'}`}><PiggyBank className="w-6 h-6" /></div>
                <div className={`text-3xl font-bold ${annualTotals.ebitda >= 0 ? 'text-blue-900 dark:text-blue-200' : 'text-amber-900 dark:text-amber-200'}`}>{fmt(annualTotals.ebitda)}€</div>
                <div className={`text-xs mt-0.5 ${annualTotals.ebitda >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-amber-700 dark:text-amber-400'}`}>EBITDA anual</div>
              </div>
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl">
                <div className="text-purple-600 mb-2"><Percent className="w-5 h-5" /></div>
                <div className="text-2xl font-bold text-purple-900 dark:text-purple-200">{annualTotals.ebitdaMargin.toFixed(1)}%</div>
                <div className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">Margen EBITDA</div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2"><Layers className="w-5 h-5 text-gray-500" /> Cuenta de resultados simplificada</h3>
              <div className="space-y-2">
                <div className="flex justify-between py-2 text-sm"><span className="text-gray-600 dark:text-gray-400">Ingresos totales</span><span className="font-bold text-green-700 dark:text-green-400">{fmt(annualTotals.income)}€</span></div>
                <div className="flex justify-between py-2 text-sm border-t border-gray-100 dark:border-gray-700"><span className="text-gray-600 dark:text-gray-400">Coste de ventas (COGS)</span><span className="font-bold text-red-600">-{fmt(annualTotals.cogs)}€</span></div>
                <div className="flex justify-between py-2 text-sm border-t-2 border-gray-300 dark:border-gray-600 font-bold"><span className="text-gray-900 dark:text-gray-100">Beneficio bruto</span><span className={annualTotals.grossProfit >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600'}>{fmt(annualTotals.grossProfit)}€</span></div>
                <div className="flex justify-between py-2 text-sm border-t border-gray-100 dark:border-gray-700"><span className="text-gray-600 dark:text-gray-400">Gastos operativos (OPEX)</span><span className="font-bold text-red-600">-{fmt(annualTotals.opex)}€</span></div>
                <div className="flex justify-between py-3 text-lg border-t-2 border-gray-900 dark:border-gray-300 font-bold"><span className="text-gray-900 dark:text-gray-100">EBITDA</span><span className={annualTotals.ebitda >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-600'}>{fmt(annualTotals.ebitda)}€</span></div>
              </div>
            </div>

            {businessBreakdown.length > 1 && (
              <BreakdownTable
                title="EBITDA por empresa"
                icon={<Building2 className="w-5 h-5 text-gray-500" />}
                rows={businessBreakdown}
                year={selectedYear}
              />
            )}

            {storeBreakdown.length > 1 && (
              <BreakdownTable
                title={scopeMode === 'business' ? 'EBITDA por tienda' : 'EBITDA por tienda (todas las empresas)'}
                icon={<Store className="w-5 h-5 text-gray-500" />}
                rows={storeBreakdown}
                year={selectedYear}
              />
            )}

            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-gray-500" /> EBITDA mensual</h3>
              <div className="grid grid-cols-12 gap-1.5 items-end h-48">
                {monthlyData.map(m => {
                  const incH = maxBar > 0 ? (m.income / maxBar) * 100 : 0;
                  const opxH = maxBar > 0 ? (m.opex / maxBar) * 100 : 0;
                  return (
                    <div key={m.month} className="flex flex-col items-center gap-1">
                      <div className="w-full flex gap-0.5 items-end" style={{ height: '160px' }}>
                        <div className="flex-1 bg-green-400 dark:bg-green-600 rounded-t" style={{ height: `${incH}%`, minHeight: m.income > 0 ? '2px' : '0' }} title={`Ingresos: ${fmt(m.income)}€`} />
                        <div className="flex-1 bg-red-400 dark:bg-red-600 rounded-t" style={{ height: `${opxH}%`, minHeight: m.opex > 0 ? '2px' : '0' }} title={`OPEX: ${fmt(m.opex)}€`} />
                      </div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">{m.label}</span>
                      <span className={`text-[10px] font-bold ${m.ebitda >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{m.ebitda > 0 ? '+' : ''}{(m.ebitda / 1000).toFixed(0)}k</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead><tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Mes</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Ingresos</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">OPEX</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">EBITDA</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Margen</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {monthlyData.map(m => (
                      <tr key={m.month} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{m.label} {selectedYear}</td>
                        <td className="px-4 py-3 text-sm text-right text-green-700 dark:text-green-400 font-semibold">{fmt(m.income)}€</td>
                        <td className="px-4 py-3 text-sm text-right text-red-600 font-semibold">{fmt(m.opex)}€</td>
                        <td className={`px-4 py-3 text-sm text-right font-bold ${m.ebitda >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-600'}`}>{fmt(m.ebitda)}€</td>
                        <td className={`px-4 py-3 text-sm text-right font-semibold ${m.ebitdaMargin >= 0 ? 'text-purple-700 dark:text-purple-400' : 'text-red-600'}`}>{m.ebitdaMargin.toFixed(1)}%</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 dark:bg-gray-900 font-bold">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">TOTAL</td>
                      <td className="px-4 py-3 text-sm text-right text-green-700 dark:text-green-400">{fmt(annualTotals.income)}€</td>
                      <td className="px-4 py-3 text-sm text-right text-red-600">{fmt(annualTotals.opex)}€</td>
                      <td className={`px-4 py-3 text-sm text-right ${annualTotals.ebitda >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-600'}`}>{fmt(annualTotals.ebitda)}€</td>
                      <td className="px-4 py-3 text-sm text-right text-purple-700 dark:text-purple-400">{annualTotals.ebitdaMargin.toFixed(1)}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {topCategories.length > 0 && (
              <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-6">
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2"><DollarSign className="w-5 h-5 text-gray-500" /> Principales categorías de gasto</h3>
                <div className="space-y-3">
                  {topCategories.map(([cat, amount]) => {
                    const pct = totalExpensesCat > 0 ? (amount / totalExpensesCat) * 100 : 0;
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cat}</span>
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{fmt(amount)}€ <span className="text-xs text-gray-400 font-normal">({pct.toFixed(0)}%)</span></span>
                        </div>
                        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-red-400 dark:bg-red-600 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

function BreakdownTable({
  title,
  icon,
  rows,
  year,
}: {
  title: string;
  icon: React.ReactNode;
  rows: ReturnType<typeof computeEbitdaBreakdown>;
  year: number;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        {icon}
        <h3 className="font-bold text-gray-900 dark:text-gray-100">{title} — {year}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900 text-xs uppercase text-gray-500">
              <th className="px-4 py-2 text-left">Nombre</th>
              <th className="px-4 py-2 text-right">Ingresos</th>
              <th className="px-4 py-2 text-right">COGS</th>
              <th className="px-4 py-2 text-right">OPEX</th>
              <th className="px-4 py-2 text-right">EBITDA</th>
              <th className="px-4 py-2 text-right">Margen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((row) => (
              <tr key={row.id} className="text-sm">
                <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">{row.label}</td>
                <td className="px-4 py-2.5 text-right text-green-700 dark:text-green-400">{fmt(row.income)}€</td>
                <td className="px-4 py-2.5 text-right text-red-600">{fmt(row.cogs)}€</td>
                <td className="px-4 py-2.5 text-right text-red-600">{fmt(row.opex)}€</td>
                <td className={`px-4 py-2.5 text-right font-bold ${row.ebitda >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-600'}`}>{fmt(row.ebitda)}€</td>
                <td className="px-4 py-2.5 text-right text-purple-700 dark:text-purple-400">{row.ebitdaMargin.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
