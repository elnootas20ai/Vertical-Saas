import {
  ArrowRight, Phone, Mail, CalendarDays, MessageSquare,
  Plus, CheckCircle2, XCircle, Car,
} from 'lucide-react';
import type { ActivityEvent } from '../../lib/opportunitiesApi';

interface ActivityTimelineProps {
  events: ActivityEvent[];
  maxItems?: number;
  onEventClick?: (event: ActivityEvent) => void;
  compact?: boolean;
}

const EVENT_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  stage_change:         { icon: <ArrowRight className="w-3.5 h-3.5" />,     color: 'text-blue-600',    bg: 'bg-blue-100 dark:bg-blue-900/40' },
  interaction_call:     { icon: <Phone className="w-3.5 h-3.5" />,          color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/40' },
  interaction_email:    { icon: <Mail className="w-3.5 h-3.5" />,           color: 'text-purple-600',  bg: 'bg-purple-100 dark:bg-purple-900/40' },
  interaction_meeting:  { icon: <CalendarDays className="w-3.5 h-3.5" />,   color: 'text-amber-600',   bg: 'bg-amber-100 dark:bg-amber-900/40' },
  interaction_note:     { icon: <MessageSquare className="w-3.5 h-3.5" />,  color: 'text-gray-600',    bg: 'bg-gray-100 dark:bg-gray-700' },
  interaction_whatsapp: { icon: <MessageSquare className="w-3.5 h-3.5" />,  color: 'text-green-600',   bg: 'bg-green-100 dark:bg-green-900/40' },
  opportunity_created:  { icon: <Plus className="w-3.5 h-3.5" />,           color: 'text-indigo-600',  bg: 'bg-indigo-100 dark:bg-indigo-900/40' },
  won:                  { icon: <CheckCircle2 className="w-3.5 h-3.5" />,   color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/40' },
  lost:                 { icon: <XCircle className="w-3.5 h-3.5" />,        color: 'text-red-600',     bg: 'bg-red-100 dark:bg-red-900/40' },
};

function getEventConfig(event: ActivityEvent) {
  if (event.type === 'stage_change') {
    if (event.to === 'won') return EVENT_CONFIG.won;
    if (event.to === 'lost') return EVENT_CONFIG.lost;
    return EVENT_CONFIG.stage_change;
  }
  if (event.type === 'interaction') {
    return EVENT_CONFIG[`interaction_${event.interactionType || 'note'}`] || EVENT_CONFIG.interaction_note;
  }
  return EVENT_CONFIG[event.type] || EVENT_CONFIG.opportunity_created;
}

function formatRelativeDate(dateStr: string) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins}min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function groupByDay(events: ActivityEvent[]) {
  const groups: { label: string; events: ActivityEvent[] }[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let currentDay = '';
  for (const ev of events) {
    const day = (ev.date || '').slice(0, 10);
    if (day !== currentDay) {
      currentDay = day;
      let label = new Date(day).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      if (day === today) label = 'Hoy';
      else if (day === yesterday) label = 'Ayer';
      groups.push({ label, events: [] });
    }
    groups[groups.length - 1].events.push(ev);
  }
  return groups;
}

export function ActivityTimeline({ events, maxItems = 30, onEventClick, compact = false }: ActivityTimelineProps) {
  const sliced = events.slice(0, maxItems);
  const groups = groupByDay(sliced);

  if (sliced.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
        <CalendarDays className="w-8 h-8 mb-2" />
        <p className="text-sm">Sin actividad reciente</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2 px-1">
            {group.label}
          </h4>
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="space-y-1">
              {group.events.map((event, i) => {
                const config = getEventConfig(event);
                return (
                  <button
                    key={`${event.opportunityId}-${event.date}-${i}`}
                    onClick={() => onEventClick?.(event)}
                    className="relative w-full flex items-start gap-3 pl-1 pr-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group"
                  >
                    <div className={`relative z-10 flex-shrink-0 w-7 h-7 rounded-full ${config.bg} flex items-center justify-center ${config.color}`}>
                      {config.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`${compact ? 'text-xs' : 'text-sm'} text-gray-800 dark:text-gray-200 truncate`}>
                        <span className="font-medium">{event.actor}</span>
                        {' '}
                        <span className="text-gray-500 dark:text-gray-400">{event.description}</span>
                      </p>
                      {event.vehicleName && (
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 mt-0.5">
                          <Car className="w-3 h-3" />
                          {event.vehicleName}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap flex-shrink-0 mt-0.5">
                      {formatRelativeDate(event.date)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
