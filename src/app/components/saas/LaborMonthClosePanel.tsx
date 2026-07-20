import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, CheckCircle2, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { AuthUser } from '../../lib/authApi';
import type { Business } from '../../lib/businessApi';
import {
  ensureLaborMonthExpense,
  previewLaborMonthClose,
  type LaborCloseMode,
  type LaborMonthClosePreview,
} from '../../lib/laborMonthFinanceSync';
import { formatLaborCurrency } from '../../lib/laborCost';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function previousPeriod(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type Props = {
  business: Business | null | undefined;
  authUser: AuthUser | null | undefined;
  members: AuthUser[];
};

export function LaborMonthClosePanel({ business, authUser, members }: Props) {
  const businessId = String(business?.business_id || business?.id || '').replace(/^business:/, '').trim();
  const businessName = String(business?.name || '').trim();
  const financeUserId = resolveBusinessDataUserId(authUser, business);
  const [period, setPeriod] = useState(previousPeriod);
  const [mode, setMode] = useState<LaborCloseMode>('estimated_salary');
  const [preview, setPreview] = useState<LaborMonthClosePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  const memberPayload = useMemo(
    () =>
      members.map((m) => ({
        user_id: m.user_id,
        fullName: m.fullName || m.email || m.user_id,
        employment: m.employment || null,
      })),
    [members],
  );

  const loadPreview = useCallback(async () => {
    if (!financeUserId || !businessId || !period) {
      setPreview(null);
      return;
    }
    setLoading(true);
    try {
      const p = await previewLaborMonthClose(financeUserId, businessId, period, memberPayload, mode);
      setPreview(p);
    } catch (err) {
      setPreview(null);
      toast.error(err instanceof Error ? err.message : 'No se pudo calcular el cierre');
    } finally {
      setLoading(false);
    }
  }, [financeUserId, businessId, period, memberPayload, mode]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  async function handleClose() {
    if (!financeUserId || !preview || preview.alreadyPosted) return;
    if (!(preview.totalEmployerCost > 0)) {
      toast.error('No hay coste que registrar. Revisa sueldos en las fichas del equipo.');
      return;
    }
    if (!confirm(`¿Registrar ${formatLaborCurrency(preview.totalEmployerCost)} de personal en finanzas (${period})?`)) {
      return;
    }
    setPosting(true);
    try {
      const result = await ensureLaborMonthExpense(financeUserId, businessId, period, memberPayload, {
        mode,
        businessName,
      });
      if (result.created) {
        toast.success('Gasto de personal registrado en finanzas');
        setPreview(result.preview);
      } else {
        toast.info('Este mes ya estaba cerrado en finanzas');
        setPreview(result.preview);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar el gasto');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-violet-200 dark:border-violet-900/50 bg-gradient-to-br from-violet-50/80 to-white dark:from-violet-950/20 dark:to-gray-900 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5 text-violet-700 dark:text-violet-300" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Cierre mensual de personal</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Calcula sueldo + SS empresa del mes y lo deja como gasto en Finanzas (una vez por mes).
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
          Mes
          <input
            type="month"
            value={period}
            max={currentPeriod()}
            onChange={(e) => setPeriod(e.target.value)}
            className="mt-1 block px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
          />
        </label>
        <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
          Base del cálculo
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as LaborCloseMode)}
            className="mt-1 block px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
          >
            <option value="estimated_salary">Sueldo de ficha + SS (recomendado)</option>
            <option value="actual_hours">Horas fichadas × coste/hora</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void loadPreview()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-white/80 dark:hover:bg-gray-800"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
          Recalcular
        </button>
      </div>

      {preview && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="rounded-xl bg-white/80 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700 p-3">
            <p className="text-[10px] uppercase font-semibold text-gray-400">Trabajadores</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {preview.membersWithSalary}/{preview.membersTotal}
            </p>
          </div>
          <div className="rounded-xl bg-white/80 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700 p-3">
            <p className="text-[10px] uppercase font-semibold text-gray-400">Bruto ≈</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {formatLaborCurrency(preview.grossTotal, preview.currency)}
            </p>
          </div>
          <div className="rounded-xl bg-white/80 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700 p-3">
            <p className="text-[10px] uppercase font-semibold text-gray-400">SS empresa ≈</p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {formatLaborCurrency(preview.employerSsTotal, preview.currency)}
            </p>
          </div>
          <div className="rounded-xl bg-white/80 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700 p-3">
            <p className="text-[10px] uppercase font-semibold text-gray-400">Extras / descuentos</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              +{formatLaborCurrency(preview.overtimeCost, preview.currency)}
            </p>
            <p className="text-[10px] text-gray-400">
              −{formatLaborCurrency(preview.payrollDeductions, preview.currency)} consumo
            </p>
          </div>
          <div className="rounded-xl bg-white/80 dark:bg-gray-800/80 border border-violet-200 dark:border-violet-800 p-3">
            <p className="text-[10px] uppercase font-semibold text-violet-500">Total gasto</p>
            <p className="text-lg font-bold text-violet-700 dark:text-violet-300">
              {formatLaborCurrency(preview.totalEmployerCost, preview.currency)}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {preview?.alreadyPosted ? (
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            Ya registrado en finanzas este mes
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void handleClose()}
            disabled={posting || loading || !preview || !(preview.totalEmployerCost > 0)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50"
          >
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
            Registrar gasto en finanzas
          </button>
        )}
        <p className="text-[11px] text-gray-400 dark:text-gray-500 max-w-md">
          Estimación orientativa (SS ~31,5 %). No sustituye la nómina oficial de gestoría; sí deja el coste en el P&amp;L del negocio.
        </p>
      </div>
    </div>
  );
}
