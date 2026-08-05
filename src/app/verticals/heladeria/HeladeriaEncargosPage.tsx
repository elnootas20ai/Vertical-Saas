import { CalendarClock, ClipboardList } from 'lucide-react';
import { VERTIAL_BTN_PRIMARY, VERTIAL_SURFACE } from '../../lib/vertialUiTokens';
import { HeladeriaMvpShell } from './HeladeriaMvpShell';

const DEMO_ENCARGOS = [
  {
    id: 'ENC-101',
    cliente: 'Ana López',
    detalle: 'Tarta 1 kg · vainilla + chocolate',
    entrega: '06/08/2026 · 18:00',
    estado: 'Pendiente',
  },
  {
    id: 'ENC-102',
    cliente: 'Empresa Nova',
    detalle: '40 cucuruchos surtidos',
    entrega: '07/08/2026 · 12:30',
    estado: 'Confirmado',
  },
  {
    id: 'ENC-103',
    cliente: 'Marc Riera',
    detalle: 'Caja fiesta · 12 tarrinas',
    entrega: '08/08/2026 · 17:00',
    estado: 'Listo',
  },
] as const;

const ESTADO_CLASS: Record<string, string> = {
  Pendiente:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  Confirmado:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  Listo:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
};

/** Encargos Heladería — pedidos anticipados (MVP). */
export function HeladeriaEncargosPage() {
  return (
    <HeladeriaMvpShell
      title="Encargos"
      subtitle="Heladería · tartas, fiestas y pedidos anticipados"
      area="encargos"
      actions={
        <button type="button" className={VERTIAL_BTN_PRIMARY}>
          <ClipboardList className="h-4 w-4" />
          Nuevo encargo
        </button>
      }
    >
      <section className={`${VERTIAL_SURFACE} overflow-hidden`}>
        <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-[var(--v-blue,#2563eb)]" />
            <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              Próximas entregas (demo)
            </h2>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Lista de ejemplo. Luego: alta real, estados y aviso al TPV.
          </p>
        </div>
        <ul className="divide-y divide-stone-200 dark:divide-stone-800">
          {DEMO_ENCARGOS.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-stone-400">{e.id}</p>
                <p className="text-sm font-medium text-stone-900 dark:text-stone-100">{e.cliente}</p>
                <p className="text-xs text-stone-500">{e.detalle}</p>
                <p className="mt-0.5 text-xs text-stone-500">Entrega: {e.entrega}</p>
              </div>
              <span
                className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${ESTADO_CLASS[e.estado] || ''}`}
              >
                {e.estado}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </HeladeriaMvpShell>
  );
}
