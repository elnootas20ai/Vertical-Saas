import { Activity, ClipboardList, Plug, Receipt, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY, VERTIAL_SURFACE } from '../../lib/vertialUiTokens';
import { HeladeriaMvpShell } from './HeladeriaMvpShell';

const QUICK = [
  { label: 'Abrir TPV', path: '/saas/vertical/heladeria/tpv', icon: Receipt },
  { label: 'Caja', path: '/saas/vertical/heladeria/caja', icon: ShoppingBag },
  { label: 'Encargos', path: '/saas/heladeria-encargos', icon: ClipboardList },
  { label: 'Integraciones', path: '/saas/heladeria-integraciones', icon: Plug },
] as const;

/** Centro operativo Heladería — MVP. */
export function HeladeriaOpsPage() {
  const navigate = useNavigate();

  return (
    <HeladeriaMvpShell
      title="Centro operativo"
      subtitle="Heladería · pedidos y mostrador del día"
      area="ops"
    >
      <section className={`${VERTIAL_SURFACE} p-5`}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[var(--v-blue,#2563eb)] dark:bg-blue-950/40">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
              Operativa del día
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              El TPV ya lee el catálogo y el PDV activo. Aquí irán los tickets del día y alertas.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Pedidos hoy', value: '—' },
            { label: 'En mostrador', value: '—' },
            { label: 'Tickets cobrados', value: '—' },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/50"
            >
              <p className="text-xs text-stone-500">{kpi.label}</p>
              <p className="mt-1 text-2xl font-semibold text-stone-900 dark:text-stone-100">
                {kpi.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button
              key={q.path}
              type="button"
              className={q.path.includes('/tpv') ? VERTIAL_BTN_PRIMARY : VERTIAL_BTN_SECONDARY}
              onClick={() => navigate(q.path)}
            >
              <q.icon className="h-4 w-4" />
              {q.label}
            </button>
          ))}
        </div>
      </section>
    </HeladeriaMvpShell>
  );
}
