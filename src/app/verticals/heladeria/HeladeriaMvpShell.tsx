import type { ReactNode } from 'react';
import { Layout } from '../../components/saas/Layout';
import { VERTIAL_SURFACE } from '../../lib/vertialUiTokens';
import { ticketsForArea, type HeladeriaTicket } from './tickets';

const STATUS_LABEL: Record<HeladeriaTicket['status'], string> = {
  mvp: 'MVP',
  next: 'Siguiente',
  done: 'Hecho',
};

const STATUS_CLASS: Record<HeladeriaTicket['status'], string> = {
  mvp: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  next: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
};

type Props = {
  title: string;
  subtitle: string;
  area: HeladeriaTicket['area'];
  children: ReactNode;
  actions?: ReactNode;
};

/** Cabecera + cuerpo + panel de tickets — misma piel Vertial en las 5 pantallas. */
export function HeladeriaMvpShell({ title, subtitle, area, children, actions }: Props) {
  const tickets = ticketsForArea(area);

  return (
    <Layout title={title} subtitle={subtitle}>
      <div className="space-y-4">
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}

        {children}

        <section className={`${VERTIAL_SURFACE} p-4`}>
          <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
            Tickets Heladería
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Roadmap del vertical (sin tocar Delivery).
          </p>
          <ul className="mt-3 space-y-2">
            {tickets.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-1 rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2.5 dark:border-stone-800 dark:bg-stone-900/60 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                    <span className="font-mono text-xs text-stone-400">{t.id}</span>
                    {' · '}
                    {t.title}
                  </p>
                  <p className="text-xs text-stone-500">{t.note}</p>
                </div>
                <span
                  className={`shrink-0 self-start rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[t.status]}`}
                >
                  {STATUS_LABEL[t.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Layout>
  );
}
