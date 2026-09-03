import {
  BarChart,
  Bar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Area,
  AreaChart,
} from 'recharts';
import { BarChart3, Package, Users } from 'lucide-react';
import { PeriodBadge } from '../../components/ui/PeriodBadge';
import { formatDateEs } from '../../lib/formatDateEs';
import type { SoldProductFamilyMeta } from '../../lib/deliverySoldProductStats';

export type DailyPoint = { day: string; label: string; value: number };

type Props = {
  isDeliveryVertical: boolean;
  dailySalesData: DailyPoint[];
  dailyLeadsData: DailyPoint[];
  soldProductFamilies: SoldProductFamilyMeta[];
  soldProductDailyData: Record<string, string | number>[];
  soldProductToday: Record<string, number> | null;
  formatEur: (n: number) => string;
};

/** Gráficas del dashboard — chunk aparte (recharts no entra en el JS inicial del Dashboard). */
export function DashboardMainCharts({
  isDeliveryVertical,
  dailySalesData,
  dailyLeadsData,
  soldProductFamilies,
  soldProductDailyData,
  soldProductToday,
  formatEur,
}: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {isDeliveryVertical ? 'Cobrado (14 días)' : 'Ventas (14 días)'}
              </p>
            </div>
            {isDeliveryVertical && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 pl-6">
                Euros de pedidos pagados · por día de cobro
              </p>
            )}
          </div>
          <PeriodBadge period="14d" variant="minimal" className="text-[9px] opacity-50 shrink-0" />
        </div>
        <div className="p-4 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailySalesData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const pt = payload[0].payload as DailyPoint;
                  return (
                    <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
                      <span className="opacity-60 mr-1">{formatDateEs(pt.day)}</span>
                      {formatEur(pt.value)}
                      {isDeliveryVertical ? ' cobrados' : ''}
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#salesGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {isDeliveryVertical ? 'Pedidos creados (14 días)' : 'Nuevos leads (14 días)'}
              </p>
            </div>
            {isDeliveryVertical && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 pl-6">
                Nº de pedidos · por día de creación (incluye cancelados)
              </p>
            )}
          </div>
          <PeriodBadge period="14d" variant="minimal" className="text-[9px] opacity-50 shrink-0" />
        </div>
        <div className="p-4 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyLeadsData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const pt = payload[0].payload as DailyPoint;
                  return (
                    <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg">
                      <span className="opacity-60 mr-1">{formatDateEs(pt.day)}</span>
                      {pt.value} {isDeliveryVertical ? 'pedidos creados' : 'leads'}
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} fill="url(#leadsGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {isDeliveryVertical && soldProductFamilies.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 min-w-0">
              <Package className="w-4 h-4 text-gray-500 dark:text-gray-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  Productos vendidos (14 días)
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                  Según tipos de marca de la empresa (pizza, kebab, burger…)
                </p>
              </div>
            </div>
            <PeriodBadge period="14d" variant="minimal" className="text-[9px] opacity-50 self-start sm:self-auto" />
          </div>
          {soldProductToday && (
            <div className="flex flex-wrap gap-2 px-5 pt-3">
              {soldProductFamilies.map((fam) => {
                const n = Number(soldProductToday[fam.id] || 0);
                return (
                  <span
                    key={fam.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: fam.color }} />
                    {fam.label} hoy: {n}
                  </span>
                );
              })}
            </div>
          )}
          <div className="p-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={soldProductDailyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} tickLine={false} axisLine={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-gray-900 text-white text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-lg space-y-0.5">
                        <p className="opacity-60 mb-1">{label}</p>
                        {payload.map((p) => (
                          <p key={String(p.dataKey)}>
                            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: String(p.color || '#fff') }} />
                            {soldProductFamilies.find((f) => f.id === p.dataKey)?.label || String(p.dataKey)}: {Number(p.value || 0)}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                {soldProductFamilies.map((fam) => (
                  <Bar
                    key={fam.id}
                    dataKey={fam.id}
                    name={fam.label}
                    fill={fam.color}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={18}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
