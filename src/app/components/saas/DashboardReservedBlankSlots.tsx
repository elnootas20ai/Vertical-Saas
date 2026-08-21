/**
 * Huecos al final del dashboard.
 * Merma / Stock crítico: vacíos.
 * Consumo de trabajadores: productos más consumidos (mes).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Coffee, Loader2, Recycle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import {
  listStaffConsumptionsRequest,
  type StaffConsumption,
} from '../../lib/deliveryApi';
import { formatMoneyEs, formatNumberEs } from '../../lib/formatNumberEs';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { resolveBusinessScopeId } from '../../lib/businessStoreScope';

type TopProduct = {
  key: string;
  name: string;
  quantity: number;
  total: number;
};

function monthKeyNow(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function buildTopProducts(items: StaffConsumption[], limit = 5): TopProduct[] {
  const map = new Map<string, TopProduct>();
  for (const row of items) {
    const name = String(row.itemName || '').trim() || 'Producto';
    const key = String(row.catalogItemId || name).trim() || name;
    const qty = Math.max(0, Number(row.quantity) || 0);
    const total = Math.max(0, Number(row.total) || 0);
    const prev = map.get(key);
    if (prev) {
      prev.quantity += qty;
      prev.total += total;
    } else {
      map.set(key, { key, name, quantity: qty, total });
    }
  }
  return [...map.values()]
    .sort((a, b) => b.quantity - a.quantity || b.total - a.total)
    .slice(0, limit)
    .map((p) => ({
      ...p,
      total: Math.round(p.total * 100) / 100,
    }));
}

function BlankSlot({
  label,
  icon: Icon,
}: {
  label: string;
  icon: typeof Recycle;
}) {
  return (
    <div className="min-h-[7.5rem] rounded-2xl border border-dashed border-stone-200 bg-white/60 p-4 dark:border-stone-700 dark:bg-stone-900/40">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-stone-100 text-stone-400 dark:bg-stone-800">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-stone-500 dark:text-stone-400">{label}</p>
      </div>
      <div className="mt-3 h-10 rounded-lg bg-transparent" />
    </div>
  );
}

function StaffConsumptionSlot() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const dataUserId = useMemo(
    () => resolveBusinessDataUserId(user, currentBusiness),
    [user, currentBusiness],
  );
  const businessId = resolveBusinessScopeId(currentBusiness);
  const monthKey = monthKeyNow();

  const [loading, setLoading] = useState(true);
  const [top, setTop] = useState<TopProduct[]>([]);
  const [monthTotal, setMonthTotal] = useState(0);
  const [monthCount, setMonthCount] = useState(0);

  useEffect(() => {
    if (!dataUserId) {
      setLoading(false);
      setTop([]);
      setMonthTotal(0);
      setMonthCount(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void listStaffConsumptionsRequest(dataUserId, { month: monthKey })
      .then((res) => {
        if (cancelled) return;
        const items = res.items || [];
        setTop(buildTopProducts(items, 5));
        setMonthTotal(Number(res.summary?.total || 0));
        setMonthCount(Number(res.summary?.count || items.length || 0));
      })
      .catch(() => {
        if (cancelled) return;
        setTop([]);
        setMonthTotal(0);
        setMonthCount(0);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dataUserId, businessId, monthKey]);

  return (
    <button
      type="button"
      onClick={() => navigate('/saas/catalog?tab=staff-consumption')}
      className="min-h-[7.5rem] w-full rounded-2xl border border-stone-200 bg-white p-4 text-left transition-colors hover:border-blue-200 hover:bg-blue-50/40 dark:border-stone-700 dark:bg-stone-900 dark:hover:border-blue-800 dark:hover:bg-blue-950/20"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <Coffee className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Consumo de trabajadores
            </p>
            <p className="text-[11px] text-stone-500">
              {loading
                ? 'Cargando…'
                : monthCount > 0
                  ? `${formatNumberEs(monthCount, { maxFraction: 0 })} este mes · ${formatMoneyEs(monthTotal)}`
                  : 'Este mes'}
            </p>
          </div>
        </div>
        {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-stone-300" /> : null}
      </div>

      <div className="mt-3 space-y-1.5">
        {loading ? (
          <div className="space-y-1.5">
            <div className="h-3 w-[75%] animate-pulse rounded bg-stone-100 dark:bg-stone-800" />
            <div className="h-3 w-[60%] animate-pulse rounded bg-stone-100 dark:bg-stone-800" />
          </div>
        ) : top.length === 0 ? (
          <p className="text-xs text-stone-400">Aún no hay consumos registrados</p>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
              Más consumidos
            </p>
            {top.map((row, idx) => (
              <div
                key={row.key}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="min-w-0 truncate text-stone-700 dark:text-stone-300">
                  <span className="mr-1.5 font-bold tabular-nums text-stone-400">{idx + 1}.</span>
                  {row.name}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-stone-900 dark:text-stone-100">
                  {formatNumberEs(row.quantity, { maxFraction: 0 })} ud
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </button>
  );
}

export function DashboardReservedBlankSlots({ className = '' }: { className?: string }) {
  return (
    <section
      className={`mt-5 space-y-3 ${className}`.trim()}
      aria-label="Secciones del dashboard"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <BlankSlot label="Merma" icon={Recycle} />
        <StaffConsumptionSlot />
        <BlankSlot label="Stock crítico" icon={AlertTriangle} />
      </div>
    </section>
  );
}
