/**
 * C-01: Historial de interacciones con timeline visual.
 * Muestra llamadas, emails, citas, notas y cambios de etapa en orden cronológico
 * con iconos, colores y detalles expandibles.
 */
import { useState, useRef, useEffect } from 'react';
import {
  Phone, Mail, Calendar, MessageSquare, FileText, ArrowRight,
  ChevronDown, ChevronUp, User, Clock, Star, X,
} from 'lucide-react';

export type InteractionType = 'call' | 'email' | 'meeting' | 'note' | 'appointment' | 'stage_change' | 'document';

export interface TimelineEvent {
  id: string;
  type: InteractionType;
  title: string;
  description?: string;
  date: string;
  user?: string;
  /** Avatar URL del usuario responsable */
  userAvatar?: string;
  /** ID del usuario responsable */
  userId?: string;
  /** Para stage_change: etapa anterior → nueva */
  fromStage?: string;
  toStage?: string;
  /** Destacar evento (ej: conversión a cliente) */
  highlight?: boolean;
}

interface Props {
  events: TimelineEvent[];
  emptyLabel?: string;
  maxInitialItems?: number;
}

const TYPE_CONFIG: Record<InteractionType, {
  icon: React.ComponentType<{ className?: string }>;
  bg: string;
  border: string;
  text: string;
  label: string;
}> = {
  call:         { icon: Phone,        bg: 'bg-blue-100',    border: 'border-blue-300',   text: 'text-blue-700',   label: 'Llamada' },
  email:        { icon: Mail,         bg: 'bg-violet-100',  border: 'border-violet-300', text: 'text-violet-700', label: 'Email' },
  meeting:      { icon: User,         bg: 'bg-amber-100',   border: 'border-amber-300',  text: 'text-amber-700',  label: 'Reunión' },
  note:         { icon: MessageSquare,bg: 'bg-gray-100 dark:bg-gray-700',    border: 'border-gray-300',   text: 'text-gray-600 dark:text-gray-400',   label: 'Nota' },
  appointment:  { icon: Calendar,     bg: 'bg-emerald-100', border: 'border-emerald-300',text: 'text-emerald-700',label: 'Cita' },
  stage_change: { icon: ArrowRight,   bg: 'bg-rose-100',    border: 'border-rose-300',   text: 'text-rose-700',   label: 'Cambio etapa' },
  document:     { icon: FileText,     bg: 'bg-indigo-100',  border: 'border-indigo-300', text: 'text-indigo-700', label: 'Documento' },
};

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 2) return 'Ahora mismo';
  if (minutes < 60) return `Hace ${minutes} min`;
  if (hours < 24) return `Hace ${hours}h`;
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;

  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateFull(dateStr: string) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function AgentPopup({
  name,
  avatar,
  onClose,
}: {
  name: string;
  avatar?: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 z-50 w-52 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden"
    >
      <div className="bg-gradient-to-br from-violet-600 to-indigo-600 px-4 py-3 flex items-center gap-3">
        {avatar ? (
          <img
            src={avatar}
            alt={name}
            className="w-10 h-10 rounded-full object-cover border-2 border-white/60 flex-shrink-0"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-sm font-bold">{initials}</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm leading-tight truncate">{name}</p>
          <p className="text-white/70 text-xs mt-0.5">Responsable</p>
        </div>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-4 py-2.5 flex items-center gap-2">
        <User className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
        <span className="text-xs text-gray-500 dark:text-gray-400">Agente del concesionario</span>
      </div>
    </div>
  );
}

function TimelineItem({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [showAgentPopup, setShowAgentPopup] = useState(false);
  const cfg = TYPE_CONFIG[event.type] || TYPE_CONFIG.note;
  const Icon = cfg.icon;
  const hasDetail = Boolean(event.description || event.fromStage);

  const initials = event.user
    ? event.user.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <div className="flex gap-4">
      {/* Línea y punto */}
      <div className="flex flex-col items-center">
        <div className={`w-9 h-9 rounded-full border-2 ${cfg.bg} ${cfg.border} flex items-center justify-center flex-shrink-0 z-10`}>
          <Icon className={`w-4 h-4 ${cfg.text}`} />
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-gray-200 mt-1" />}
      </div>

      {/* Contenido */}
      <div className={`flex-1 pb-6 ${isLast ? '' : ''}`}>
        <div
          className={`rounded-xl border p-4 transition-all ${
            event.highlight
              ? 'border-amber-300 bg-amber-50/60 shadow-sm'
              : 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-200 dark:hover:border-gray-700'
          }`}
        >
          {/* Cabecera */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                  {cfg.label}
                </span>
                {event.highlight && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                    <Star className="w-3 h-3" /> Destacado
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1 leading-tight">{event.title}</p>
            </div>
            {hasDetail && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors flex-shrink-0 mt-1"
                title={expanded ? 'Colapsar' : 'Expandir'}
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* Stage change */}
          {event.type === 'stage_change' && event.fromStage && event.toStage && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">{event.fromStage}</span>
              <ArrowRight className="w-3 h-3 text-gray-400 dark:text-gray-500" />
              <span className="text-xs px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full font-medium">{event.toStage}</span>
            </div>
          )}

          {/* Descripción expandida */}
          {expanded && event.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-3 leading-relaxed whitespace-pre-line border-t border-gray-100 dark:border-gray-800 pt-3">
              {event.description}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center gap-3 mt-2.5">
            {event.user && (
              <div className="relative">
                <button
                  type="button"
                  onDoubleClick={() => setShowAgentPopup((v) => !v)}
                  className="flex items-center gap-1.5 hover:opacity-80 transition-opacity cursor-pointer"
                  title={`Ver perfil de ${event.user} (doble clic)`}
                >
                  {event.userAvatar ? (
                    <img
                      src={event.userAvatar}
                      alt={event.user}
                      className="w-5 h-5 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        img.style.display = 'none';
                        const sib = img.nextElementSibling as HTMLElement | null;
                        if (sib) sib.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <span
                    className={`w-5 h-5 rounded-full bg-violet-100 text-violet-700 text-[9px] font-bold items-center justify-center border border-violet-200 ${
                      event.userAvatar ? 'hidden' : 'flex'
                    }`}
                  >
                    {initials}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{event.user}</span>
                </button>
                {showAgentPopup && (
                  <AgentPopup
                    name={event.user}
                    avatar={event.userAvatar}
                    onClose={() => setShowAgentPopup(false)}
                  />
                )}
              </div>
            )}
            <span
              className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 ml-auto"
              title={formatDateFull(event.date)}
            >
              <Clock className="w-3 h-3" />
              {formatDate(event.date)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InteractionTimeline({ events, emptyLabel = 'Sin interacciones registradas', maxInitialItems = 8 }: Props) {
  const [showAll, setShowAll] = useState(false);

  const sorted = [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const visible = showAll ? sorted : sorted.slice(0, maxInitialItems);
  const hidden = sorted.length - maxInitialItems;

  if (sorted.length === 0) {
    return (
      <div className="text-center py-12">
        <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-400 dark:text-gray-500">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-0">
        {visible.map((event, i) => (
          <TimelineItem key={event.id} event={event} isLast={i === visible.length - 1} />
        ))}
      </div>

      {!showAll && hidden > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full mt-2 py-2.5 text-sm text-violet-600 hover:text-violet-700 font-medium flex items-center justify-center gap-1.5 rounded-xl border border-violet-100 hover:border-violet-200 hover:bg-violet-50 transition-all"
        >
          <ChevronDown className="w-4 h-4" />
          Ver {hidden} interacción{hidden > 1 ? 'es' : ''} más
        </button>
      )}
      {showAll && sorted.length > maxInitialItems && (
        <button
          onClick={() => setShowAll(false)}
          className="w-full mt-2 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium flex items-center justify-center gap-1.5 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
        >
          <ChevronUp className="w-4 h-4" />
          Mostrar menos
        </button>
      )}
    </div>
  );
}
