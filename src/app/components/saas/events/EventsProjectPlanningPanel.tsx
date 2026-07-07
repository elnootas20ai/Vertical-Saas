import { Link } from 'react-router-dom';
import type { EventPlanningSnapshot } from '../../../lib/eventsPlanning';
import type { EventRecord } from '../../../lib/eventsTypes';
import {
  Users, ListChecks, UtensilsCrossed, Briefcase, Sparkles, MapPin, Loader2,
} from 'lucide-react';

type Props = {
  event: EventRecord;
  snapshot: EventPlanningSnapshot | null;
  loading: boolean;
};

const fmtPct = (n: number) => `${n}%`;

export function EventsProjectPlanningPanel({ event, snapshot, loading }: Props) {
  const query = `?eventId=${encodeURIComponent(event._id)}&eventName=${encodeURIComponent(event.nombre)}`;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const snap = snapshot || {
    guests: { total: 0, confirmed: 0, pending: 0, rejected: 0 },
    logistics: { total: 0, pending: 0, inProgress: 0, completed: 0 },
    catering: { total: 0, confirmed: 0 },
    vendors: { total: 0 },
    readinessPct: 0,
  };

  const modules = [
    {
      to: `/saas/events-guests${query}`,
      icon: Users,
      label: 'Invitados',
      stat: `${snap.guests.confirmed}/${snap.guests.total || 0} confirmados`,
      tone: snap.guests.total > 0 ? 'ok' : 'empty',
    },
    {
      to: `/saas/events-logistics${query}`,
      icon: ListChecks,
      label: 'Logística',
      stat: `${snap.logistics.completed}/${snap.logistics.total || 0} tareas listas`,
      tone: snap.logistics.pending > 0 ? 'warn' : 'ok',
    },
    {
      to: `/saas/events-catering${query}`,
      icon: UtensilsCrossed,
      label: 'Catering',
      stat: `${snap.catering.confirmed}/${snap.catering.total || 0} confirmados`,
      tone: snap.catering.total > 0 ? 'ok' : 'empty',
    },
    {
      to: `/saas/events-vendors${query}`,
      icon: Briefcase,
      label: 'Externos',
      stat: `${snap.vendors.total} proveedor(es)`,
      tone: snap.vendors.total > 0 ? 'ok' : 'empty',
    },
    {
      to: `/saas/events-venues${query}`,
      icon: MapPin,
      label: 'Espacios',
      stat: event.lugar || 'Sin venue',
      tone: 'neutral' as const,
    },
    {
      to: `/saas/events-services${query}`,
      icon: Sparkles,
      label: 'Servicios',
      stat: 'Catálogo comercial',
      tone: 'neutral' as const,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/60 dark:bg-cyan-950/20 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800 dark:text-cyan-300">Preparación operativa</p>
          <p className="text-2xl font-black text-cyan-900 dark:text-cyan-100">{fmtPct(snap.readinessPct)}</p>
        </div>
        <p className="text-sm text-cyan-900/80 dark:text-cyan-200/80 max-w-md">
          Invitados, logística, catering y proveedores vinculados a este evento. Todo se gestiona desde aquí.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {modules.map((m) => (
          <Link
            key={m.label}
            to={m.to}
            className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 hover:border-cyan-400 transition-colors"
          >
            <m.icon className="w-5 h-5 text-cyan-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{m.label}</p>
              <p className="text-xs text-gray-500 truncate">{m.stat}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
