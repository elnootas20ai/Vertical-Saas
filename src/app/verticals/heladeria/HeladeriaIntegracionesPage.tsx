import { Globe, Plug } from 'lucide-react';
import { VERTIAL_BTN_SECONDARY, VERTIAL_SURFACE } from '../../lib/vertialUiTokens';
import { HeladeriaMvpShell } from './HeladeriaMvpShell';

const CHANNELS = [
  {
    id: 'glovo',
    name: 'Glovo',
    status: 'No conectado',
    note: 'Pedidos a domicilio desde marketplace.',
  },
  {
    id: 'uber',
    name: 'Uber Eats',
    status: 'No conectado',
    note: 'Canal delivery marketplace.',
  },
  {
    id: 'justeat',
    name: 'Just Eat',
    status: 'No conectado',
    note: 'Canal delivery marketplace.',
  },
  {
    id: 'web',
    name: 'Web pedidos',
    status: 'Pendiente',
    note: 'Pedidos online propios de la heladería.',
  },
] as const;

/** Integraciones Heladería — canales externos (MVP). */
export function HeladeriaIntegracionesPage() {
  return (
    <HeladeriaMvpShell
      title="Integraciones"
      subtitle="Heladería · marketplaces y web de pedidos"
      area="integraciones"
    >
      <section className={`${VERTIAL_SURFACE} p-4`}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[var(--v-blue,#2563eb)] dark:bg-blue-950/40">
            <Plug className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
              Canales
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              MVP: listado. Siguiente: OAuth, sync de carta y pedidos al centro operativo.
            </p>
          </div>
        </div>

        <ul className="mt-5 space-y-2">
          {CHANNELS.map((ch) => (
            <li
              key={ch.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/80 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/50"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {ch.id === 'web' ? (
                    <Globe className="h-4 w-4 text-stone-400" />
                  ) : (
                    <Plug className="h-4 w-4 text-stone-400" />
                  )}
                  <p className="text-sm font-medium text-stone-900 dark:text-stone-100">{ch.name}</p>
                </div>
                <p className="mt-0.5 text-xs text-stone-500">{ch.note}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-stone-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-stone-500 dark:border-stone-700 dark:bg-stone-950">
                  {ch.status}
                </span>
                <button type="button" className={VERTIAL_BTN_SECONDARY}>
                  Configurar
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </HeladeriaMvpShell>
  );
}
