import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { aiChatRequest, type AIChatMessage } from '../../lib/aiParserApi';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, X, Search, Send, Sparkles, Loader2,
  CalendarDays, MapPin, Users, Clock, CheckCircle, AlertCircle,
  Ban, PartyPopper, Euro, ChevronRight, Edit3, Trash2,
  ListChecks, MessageSquare, Bot, User, ChevronDown,
  Clipboard, Utensils, Lightbulb, FileText, Mic, Copy,
  Check, ArrowUp, ArrowRight, ArrowDown, Truck, Hammer,
  Paintbrush, Wrench, UserCog, RotateCcw, Zap, Calendar,
  TrendingUp,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

// ─── Types ───────────────────────────────────────────────────────────────────

type EventType = 'boda' | 'corporativo' | 'cumpleaños' | 'conferencia' | 'feria' | 'gala';
type EventStatus = 'planificacion' | 'confirmado' | 'en_curso' | 'finalizado' | 'cancelado';
type TaskStatus = 'pendiente' | 'en_proceso' | 'completado' | 'bloqueado';
type Priority = 'alta' | 'media' | 'baja';
type Category = 'transporte' | 'montaje' | 'decoracion' | 'tecnico' | 'personal';

interface EventItem {
  id: string;
  nombre: string;
  tipo: EventType;
  fecha: string;
  hora?: string;
  lugar: string;
  cliente: string;
  invitados: number;
  presupuesto: number;
  estado: EventStatus;
  notas?: string;
}

interface TaskItem {
  id: string;
  eventoId: string;
  tarea: string;
  responsable: string;
  fechaLimite: string;
  estado: TaskStatus;
  prioridad: Priority;
  categoria: Category;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<EventType, { label: string; bg: string; text: string }> = {
  boda:        { label: 'Boda',        bg: 'bg-pink-100 dark:bg-pink-900/40',    text: 'text-pink-700 dark:text-pink-300' },
  corporativo: { label: 'Corporativo', bg: 'bg-blue-100 dark:bg-blue-900/40',    text: 'text-blue-700 dark:text-blue-300' },
  cumpleaños:  { label: 'Cumpleaños',  bg: 'bg-amber-100 dark:bg-amber-900/40',  text: 'text-amber-700 dark:text-amber-300' },
  conferencia: { label: 'Conferencia', bg: 'bg-indigo-100 dark:bg-indigo-900/40', text: 'text-indigo-700 dark:text-indigo-300' },
  feria:       { label: 'Feria',       bg: 'bg-teal-100 dark:bg-teal-900/40',    text: 'text-teal-700 dark:text-teal-300' },
  gala:        { label: 'Gala',        bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
};

const STATUS_CONFIG: Record<EventStatus, { label: string; bg: string; text: string; dot: string }> = {
  planificacion: { label: 'Planificación', bg: 'bg-slate-100 dark:bg-slate-800',       text: 'text-slate-700 dark:text-slate-300', dot: 'bg-slate-400' },
  confirmado:    { label: 'Confirmado',    bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  en_curso:      { label: 'En curso',      bg: 'bg-blue-50 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  finalizado:    { label: 'Finalizado',    bg: 'bg-gray-100 dark:bg-gray-700/50',      text: 'text-gray-600 dark:text-gray-400', dot: 'bg-gray-400' },
  cancelado:     { label: 'Cancelado',     bg: 'bg-red-50 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
};

const TASK_STATUS: Record<TaskStatus, { label: string; bg: string; text: string }> = {
  pendiente:  { label: 'Pendiente',  bg: 'bg-slate-100 dark:bg-slate-800',       text: 'text-slate-700 dark:text-slate-300' },
  en_proceso: { label: 'En proceso', bg: 'bg-blue-50 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-300' },
  completado: { label: 'Completado', bg: 'bg-emerald-50 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
  bloqueado:  { label: 'Bloqueado',  bg: 'bg-red-50 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-300' },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; icon: React.ReactNode; color: string }> = {
  alta:  { label: 'Alta',  icon: <ArrowUp className="w-3 h-3" />,    color: 'text-red-600' },
  media: { label: 'Media', icon: <ArrowRight className="w-3 h-3" />, color: 'text-amber-600' },
  baja:  { label: 'Baja',  icon: <ArrowDown className="w-3 h-3" />,  color: 'text-blue-600' },
};

const CATEGORY_CONFIG: Record<Category, { label: string; icon: React.ReactNode }> = {
  transporte: { label: 'Transporte', icon: <Truck className="w-3 h-3" /> },
  montaje:    { label: 'Montaje',    icon: <Hammer className="w-3 h-3" /> },
  decoracion: { label: 'Decoración', icon: <Paintbrush className="w-3 h-3" /> },
  tecnico:    { label: 'Técnico',    icon: <Wrench className="w-3 h-3" /> },
  personal:   { label: 'Personal',   icon: <UserCog className="w-3 h-3" /> },
};

const AI_SUGGESTIONS = [
  { icon: <Clipboard className="w-4 h-4" />, label: 'Generar checklist', prompt: 'Genera un checklist completo para organizar el evento seleccionado, incluyendo tareas por categoría y plazos.' },
  { icon: <Utensils className="w-4 h-4" />,  label: 'Sugerir menú',     prompt: 'Sugiere un menú de catering apropiado para el evento, considerando el tipo de evento y número de invitados.' },
  { icon: <Calendar className="w-4 h-4" />,  label: 'Crear timeline',   prompt: 'Crea un timeline detallado del día del evento, hora por hora, con las actividades y responsables.' },
  { icon: <Lightbulb className="w-4 h-4" />, label: 'Ideas creativas',  prompt: 'Dame ideas creativas para la decoración y entretenimiento del evento.' },
  { icon: <FileText className="w-4 h-4" />,  label: 'Presupuesto',      prompt: 'Genera un desglose de presupuesto estimado para el evento, por categorías (venue, catering, decoración, técnico, personal).' },
  { icon: <Euro className="w-4 h-4" />,      label: 'Texto invitación', prompt: 'Redacta un texto profesional de invitación para enviar a los asistentes del evento.' },
];

function fmt(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 });
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function daysUntil(dateStr: string) {
  if (!dateStr) return null;
  const d = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  return d;
}

// ─── Event Card ──────────────────────────────────────────────────────────────

function EventCard({ event, selected, onClick, taskCount }: {
  event: EventItem;
  selected: boolean;
  onClick: () => void;
  taskCount: { total: number; done: number };
}) {
  const st = STATUS_CONFIG[event.estado];
  const tp = TYPE_LABELS[event.tipo];
  const days = daysUntil(event.fecha);
  const progress = taskCount.total ? Math.round((taskCount.done / taskCount.total) * 100) : 0;

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
        selected
          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 shadow-md'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{event.nombre}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{event.cliente}</p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
          {st.label}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${tp.bg} ${tp.text}`}>{tp.label}</span>
        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 flex items-center gap-1">
          <CalendarDays className="w-2.5 h-2.5" />{event.fecha}
        </span>
        {days != null && days >= 0 && (
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${days <= 3 ? 'bg-red-100 text-red-700' : days <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
            {days === 0 ? 'HOY' : `${days}d`}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400 mb-2">
        <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{event.lugar || '—'}</span>
        <span className="flex items-center gap-1"><Users className="w-2.5 h-2.5" />{event.invitados}</span>
        <span className="flex items-center gap-1"><Euro className="w-2.5 h-2.5" />{fmt(event.presupuesto)}</span>
      </div>

      {taskCount.total > 0 && (
        <div>
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-gray-500">{taskCount.done}/{taskCount.total} tareas</span>
            <span className="font-bold text-gray-700 dark:text-gray-300">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Task Row ────────────────────────────────────────────────────────────────

function TaskRow({ task, onToggle, onDelete }: {
  task: TaskItem;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isDone = task.estado === 'completado';
  const pr = PRIORITY_CONFIG[task.prioridad];
  const cat = CATEGORY_CONFIG[task.categoria];
  const ts = TASK_STATUS[task.estado];

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${isDone ? 'opacity-60' : ''}`}>
      <button
        onClick={onToggle}
        className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-emerald-400'}`}
      >
        {isDone && <Check className="w-3 h-3" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isDone ? 'line-through text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
          {task.tarea}
        </p>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-0.5">{cat.icon}{cat.label}</span>
          {task.responsable && <span>· {task.responsable}</span>}
          {task.fechaLimite && <span>· {task.fechaLimite}</span>}
        </div>
      </div>
      <span className={`shrink-0 flex items-center gap-0.5 text-[10px] font-semibold ${pr.color}`}>
        {pr.icon}{pr.label}
      </span>
      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${ts.bg} ${ts.text}`}>
        {ts.label}
      </span>
      <button onClick={onDelete} className="shrink-0 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── AI Chat Panel ───────────────────────────────────────────────────────────

function AIChatPanel({ messages, onSend, loading, eventContext }: {
  messages: ChatMsg[];
  onSend: (text: string) => void;
  loading: boolean;
  eventContext?: string;
}) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    onSend(input.trim());
    setInput('');
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Asistente IA</h3>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Planificación y gestión de eventos</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30 flex items-center justify-center mb-3">
              <Bot className="w-7 h-7 text-violet-500" />
            </div>
            <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Asistente de eventos</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-xs">
              Pregúntame sobre planificación, logística, catering, presupuestos o cualquier aspecto de tus eventos.
            </p>
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {AI_SUGGESTIONS.slice(0, 4).map(s => (
                <button
                  key={s.label}
                  onClick={() => onSend(s.prompt)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-left hover:border-violet-300 dark:hover:border-violet-700 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all group"
                >
                  <span className="text-gray-400 group-hover:text-violet-500 transition-colors">{s.icon}</span>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white mt-0.5">
                <Bot className="w-3.5 h-3.5" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
              msg.role === 'user'
                ? 'bg-violet-600 text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200'
            }`}>
              {msg.loading ? (
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-gray-500">Pensando...</span>
                </div>
              ) : (
                <>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                  {msg.role === 'assistant' && (
                    <button
                      onClick={() => handleCopy(msg.id, msg.content)}
                      className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {copied === msg.id ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      {copied === msg.id ? 'Copiado' : 'Copiar'}
                    </button>
                  )}
                </>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="shrink-0 w-7 h-7 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 mt-0.5">
                <User className="w-3.5 h-3.5" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Quick suggestions strip */}
      {messages.length > 0 && (
        <div className="shrink-0 px-3 py-2 border-t border-gray-100 dark:border-gray-800 flex gap-1.5 overflow-x-auto scrollbar-none">
          {AI_SUGGESTIONS.map(s => (
            <button
              key={s.label}
              onClick={() => onSend(s.prompt)}
              disabled={loading}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-[10px] font-medium text-gray-600 dark:text-gray-400 hover:border-violet-300 hover:text-violet-600 transition-colors disabled:opacity-50"
            >
              {s.icon}<span>{s.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="shrink-0 p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Pregunta a la IA sobre tus eventos..."
            disabled={loading}
            className="flex-1 px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="shrink-0 w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-600/20"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── New Event Modal ─────────────────────────────────────────────────────────

function NewEventModal({ onSave, onClose }: {
  onSave: (e: Omit<EventItem, 'id'>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Omit<EventItem, 'id'>>({
    nombre: '', tipo: 'corporativo', fecha: '', hora: '', lugar: '',
    cliente: '', invitados: 0, presupuesto: 0, estado: 'planificacion', notas: '',
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <PartyPopper className="w-5 h-5 text-violet-500" />Nuevo Evento
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del evento *</label>
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
              <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as EventType }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none">
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
              <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as EventStatus }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none">
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha *</label>
              <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hora</label>
              <input type="time" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lugar</label>
              <input value={form.lugar} onChange={e => setForm(f => ({ ...f, lugar: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente</label>
              <input value={form.cliente} onChange={e => setForm(f => ({ ...f, cliente: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invitados</label>
              <input type="number" value={form.invitados} onChange={e => setForm(f => ({ ...f, invitados: +e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Presupuesto (€)</label>
              <input type="number" value={form.presupuesto} onChange={e => setForm(f => ({ ...f, presupuesto: +e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas</label>
            <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={2} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 transition-colors">Cancelar</button>
          <button
            onClick={() => { if (form.nombre && form.fecha) { onSave(form); } else { toast.error('Nombre y fecha son obligatorios'); } }}
            className="px-4 py-2.5 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors"
          >
            Crear evento
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── New Task Modal ──────────────────────────────────────────────────────────

function NewTaskModal({ eventId, eventName, onSave, onClose }: {
  eventId: string;
  eventName: string;
  onSave: (t: Omit<TaskItem, 'id'>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    tarea: '', responsable: '', fechaLimite: '',
    estado: 'pendiente' as TaskStatus, prioridad: 'media' as Priority, categoria: 'montaje' as Category,
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nueva tarea</h3>
            <p className="text-xs text-gray-500">{eventName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tarea *</label>
            <input value={form.tarea} onChange={e => setForm(f => ({ ...f, tarea: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsable</label>
              <input value={form.responsable} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha límite</label>
              <input type="date" value={form.fechaLimite} onChange={e => setForm(f => ({ ...f, fechaLimite: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prioridad</label>
              <select value={form.prioridad} onChange={e => setForm(f => ({ ...f, prioridad: e.target.value as Priority }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none">
                {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoría</label>
              <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value as Category }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none">
                {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
              <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as TaskStatus }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-violet-500 outline-none">
                {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 transition-colors">Cancelar</button>
          <button
            onClick={() => { if (form.tarea) { onSave({ ...form, eventoId: eventId }); } }}
            className="px-4 py-2.5 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors"
          >
            Crear tarea
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface EventsWorkstationPageProps {
  salesPoint?: { _id: string; id: string; name: string } | null;
  onBack?: () => void;
}

export function EventsWorkstationPage({ salesPoint, onBack }: EventsWorkstationPageProps) {
  const navigate = useNavigate();
  const { currentBusiness } = useBusiness();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [showNewTask, setShowNewTask] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'tasks' | 'chat'>('tasks');
  const [searchEvents, setSearchEvents] = useState('');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'date', label: 'Fecha' },
    { key: 'venue', label: 'Local' },
    { key: 'type', label: 'Tipo' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'venue', label: 'Local', example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} evento(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} evento(s) importado(s)`);
  };


  const selectedEvent = events.find(e => e.id === selectedEventId) ?? null;

  const filteredEvents = useMemo(() => {
    if (!searchEvents.trim()) return events;
    const q = searchEvents.toLowerCase();
    return events.filter(e =>
      e.nombre.toLowerCase().includes(q) ||
      e.cliente.toLowerCase().includes(q) ||
      e.lugar.toLowerCase().includes(q),
    );
  }, [events, searchEvents]);

  const selectedTasks = useMemo(() =>
    selectedEventId ? tasks.filter(t => t.eventoId === selectedEventId) : [],
    [tasks, selectedEventId],
  );

  const taskCountByEvent = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    tasks.forEach(t => {
      const cur = map.get(t.eventoId) ?? { total: 0, done: 0 };
      cur.total++;
      if (t.estado === 'completado') cur.done++;
      map.set(t.eventoId, cur);
    });
    return map;
  }, [tasks]);

  const kpis = useMemo(() => {
    const activos = events.filter(e => ['planificacion', 'confirmado', 'en_curso'].includes(e.estado)).length;
    const upcoming = events.filter(e => e.estado !== 'finalizado' && e.estado !== 'cancelado').sort((a, b) => a.fecha.localeCompare(b.fecha));
    const next = upcoming[0];
    const totalPresupuesto = events.reduce((s, e) => s + e.presupuesto, 0);
    const totalInvitados = events.reduce((s, e) => s + e.invitados, 0);
    const tasksDone = tasks.filter(t => t.estado === 'completado').length;
    const tasksTotal = tasks.length;
    return { activos, next, totalPresupuesto, totalInvitados, tasksDone, tasksTotal };
  }, [events, tasks]);

  const handleAddEvent = useCallback((data: Omit<EventItem, 'id'>) => {
    const newEvent: EventItem = { ...data, id: genId() };
    setEvents(prev => [...prev, newEvent]);
    setSelectedEventId(newEvent.id);
    setShowNewEvent(false);
    toast.success(`Evento "${data.nombre}" creado`);
  }, []);

  const handleAddTask = useCallback((data: Omit<TaskItem, 'id'>) => {
    setTasks(prev => [...prev, { ...data, id: genId() }]);
    setShowNewTask(false);
    toast.success('Tarea creada');
  }, []);

  const toggleTask = useCallback((id: string) => {
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, estado: t.estado === 'completado' ? 'pendiente' : 'completado' } : t,
    ));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const deleteEvent = useCallback((id: string) => {
    setEvents(prev => prev.filter(e => e.id !== id));
    setTasks(prev => prev.filter(t => t.eventoId !== id));
    if (selectedEventId === id) setSelectedEventId(null);
    toast.success('Evento eliminado');
  }, [selectedEventId]);

  const buildEventContext = useCallback(() => {
    if (!selectedEvent) return '';
    const tc = taskCountByEvent.get(selectedEvent.id);
    return `Evento: ${selectedEvent.nombre}\nTipo: ${TYPE_LABELS[selectedEvent.tipo].label}\nFecha: ${selectedEvent.fecha}${selectedEvent.hora ? ` a las ${selectedEvent.hora}` : ''}\nLugar: ${selectedEvent.lugar}\nCliente: ${selectedEvent.cliente}\nInvitados: ${selectedEvent.invitados}\nPresupuesto: ${fmt(selectedEvent.presupuesto)}\nEstado: ${STATUS_CONFIG[selectedEvent.estado].label}\nTareas: ${tc?.done ?? 0}/${tc?.total ?? 0} completadas${selectedEvent.notas ? `\nNotas: ${selectedEvent.notas}` : ''}`;
  }, [selectedEvent, taskCountByEvent]);

  const handleSendChat = useCallback(async (text: string) => {
    const userMsg: ChatMsg = { id: genId(), role: 'user', content: text };
    const loadingMsg: ChatMsg = { id: genId(), role: 'assistant', content: '', loading: true };
    setChatMessages(prev => [...prev, userMsg, loadingMsg]);
    setChatLoading(true);

    try {
      const history: AIChatMessage[] = [...chatMessages.filter(m => !m.loading), userMsg]
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));
      const result = await aiChatRequest(history, buildEventContext());
      setChatMessages(prev =>
        prev.map(m => m.id === loadingMsg.id ? { ...m, content: result.reply, loading: false } : m),
      );
    } catch (err: any) {
      setChatMessages(prev =>
        prev.map(m => m.id === loadingMsg.id
          ? { ...m, content: `Error: ${err.message || 'No se pudo obtener respuesta de la IA'}`, loading: false }
          : m,
        ),
      );
    } finally {
      setChatLoading(false);
    }
  }, [chatMessages, buildEventContext]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <header className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <button onClick={onBack ?? (() => navigate(-1))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
                <PartyPopper className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">
                  {salesPoint ? `Eventos — ${salesPoint.name}` : 'Centro de Eventos'}
                </h1>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{currentBusiness?.name ?? 'Gestión de Eventos'}</p>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="hidden lg:flex items-center gap-5">
            {[
              { label: 'Activos', value: kpis.activos, color: 'text-violet-600' },
              { label: 'Invitados', value: kpis.totalInvitados, color: 'text-blue-600' },
              { label: 'Presupuesto', value: fmt(kpis.totalPresupuesto), color: 'text-emerald-600' },
              { label: 'Tareas', value: `${kpis.tasksDone}/${kpis.tasksTotal}`, color: 'text-amber-600' },
            ].map(k => (
              <div key={k.label} className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{k.label}</p>
                <p className={`text-sm font-bold ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Body — 3 columns */}
      <div className="flex-1 min-h-0 flex">
        {/* Left: Event list */}
        <aside className="w-72 xl:w-80 shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="shrink-0 p-3 space-y-2 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={searchEvents} onChange={e => setSearchEvents(e.target.value)}
                  placeholder="Buscar evento..."
                  className="w-full pl-8 pr-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
                />
              </div>
              <button
                onClick={() => setShowNewEvent(true)}
                className="shrink-0 w-9 h-9 rounded-lg bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center transition-colors shadow-lg shadow-violet-600/20"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <PartyPopper className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Sin eventos</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Crea tu primer evento para empezar</p>
                <AddButtonDropdown
                label="Nuevo evento"
                onQuickAdd={() => setShowNewEvent(true)}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de evento"
              />
              </div>
            ) : (
              filteredEvents.map(ev => (
                <EventCard
                  key={ev.id}
                  event={ev}
                  selected={ev.id === selectedEventId}
                  onClick={() => setSelectedEventId(ev.id)}
                  taskCount={taskCountByEvent.get(ev.id) ?? { total: 0, done: 0 }}
                />
              ))
            )}
          </div>
        </aside>

        {/* Center: Tasks + details OR empty state */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {!selectedEvent ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30 flex items-center justify-center mb-4">
                <Zap className="w-10 h-10 text-violet-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-2">
                Selecciona un evento
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mb-6">
                Elige un evento de la lista izquierda para ver sus tareas, detalles y hablar con la IA sobre su planificación.
              </p>
              <button onClick={() => setShowNewEvent(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 transition-colors shadow-lg shadow-violet-600/20">
                <Plus className="w-4 h-4" />Crear evento
              </button>
            </div>
          ) : (
            <>
              {/* Event header */}
              <div className="shrink-0 px-5 py-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedEvent.nombre}</h2>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${TYPE_LABELS[selectedEvent.tipo].bg} ${TYPE_LABELS[selectedEvent.tipo].text}`}>
                        {TYPE_LABELS[selectedEvent.tipo].label}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CONFIG[selectedEvent.estado].bg} ${STATUS_CONFIG[selectedEvent.estado].text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[selectedEvent.estado].dot}`} />
                        {STATUS_CONFIG[selectedEvent.estado].label}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                      <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{selectedEvent.fecha}{selectedEvent.hora ? ` · ${selectedEvent.hora}` : ''}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{selectedEvent.lugar || '—'}</span>
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{selectedEvent.invitados} invitados</span>
                      <span className="flex items-center gap-1"><Euro className="w-3.5 h-3.5" />{fmt(selectedEvent.presupuesto)}</span>
                      {selectedEvent.cliente && <span className="font-medium text-gray-700 dark:text-gray-300">{selectedEvent.cliente}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => deleteEvent(selectedEvent.id)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="shrink-0 flex items-center gap-1 px-5 pt-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                {([
                  { id: 'tasks' as const, label: 'Tareas', icon: <ListChecks className="w-4 h-4" />, count: selectedTasks.length },
                  { id: 'chat' as const, label: 'IA Asistente', icon: <Sparkles className="w-4 h-4" /> },
                ]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      activeTab === tab.id
                        ? 'border-violet-500 text-violet-700 dark:text-violet-400'
                        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.count != null && <span className="text-xs font-bold text-gray-400 ml-0.5">{tab.count}</span>}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {activeTab === 'tasks' && (
                  <div className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">
                        Tareas del evento
                        {selectedTasks.length > 0 && (
                          <span className="ml-2 text-xs font-normal text-gray-400">
                            {selectedTasks.filter(t => t.estado === 'completado').length}/{selectedTasks.length} completadas
                          </span>
                        )}
                      </h3>
                      <button
                        onClick={() => setShowNewTask(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-600 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />Nueva tarea
                      </button>
                    </div>

                    {selectedTasks.length > 0 && (
                      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-gray-500">Progreso</span>
                          <span className="font-bold text-gray-700 dark:text-gray-300">
                            {Math.round((selectedTasks.filter(t => t.estado === 'completado').length / selectedTasks.length) * 100)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className="bg-emerald-500 h-2 rounded-full transition-all"
                            style={{ width: `${Math.round((selectedTasks.filter(t => t.estado === 'completado').length / selectedTasks.length) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {selectedTasks.length === 0 ? (
                        <div className="flex flex-col items-center py-12 text-center">
                          <ListChecks className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Sin tareas</p>
                          <p className="text-xs text-gray-400 mt-1 mb-3">Añade tareas o pide a la IA que genere un checklist</p>
                          <div className="flex gap-2">
                            <button onClick={() => setShowNewTask(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-violet-600 bg-violet-50 hover:bg-violet-100 transition-colors">
                              <Plus className="w-3.5 h-3.5" />Manual
                            </button>
                            <button
                              onClick={() => { setActiveTab('chat'); handleSendChat('Genera un checklist completo y detallado para este evento, con tareas organizadas por categoría (transporte, montaje, decoración, técnico, personal), incluyendo responsables sugeridos y plazos.'); }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 transition-colors"
                            >
                              <Sparkles className="w-3.5 h-3.5" />Generar con IA
                            </button>
                          </div>
                        </div>
                      ) : (
                        selectedTasks
                          .sort((a, b) => {
                            const prio = { alta: 0, media: 1, baja: 2 };
                            const st = { bloqueado: 0, pendiente: 1, en_proceso: 2, completado: 3 };
                            return (st[a.estado] - st[b.estado]) || (prio[a.prioridad] - prio[b.prioridad]);
                          })
                          .map(t => (
                            <TaskRow key={t.id} task={t} onToggle={() => toggleTask(t.id)} onDelete={() => deleteTask(t.id)} />
                          ))
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'chat' && (
                  <div className="h-full">
                    <AIChatPanel
                      messages={chatMessages}
                      onSend={handleSendChat}
                      loading={chatLoading}
                      eventContext={buildEventContext()}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </main>

        {/* Right: AI panel (desktop) — shown alongside tasks */}
        {selectedEvent && activeTab === 'tasks' && (
          <aside className="hidden xl:flex w-96 shrink-0 flex-col border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <AIChatPanel
              messages={chatMessages}
              onSend={handleSendChat}
              loading={chatLoading}
              eventContext={buildEventContext()}
            />
          </aside>
        )}
      </div>

      {/* Modals */}
      {showNewEvent && <NewEventModal onSave={handleAddEvent} onClose={() => setShowNewEvent(false)} />}
      {showNewTask && selectedEvent && (
        <NewTaskModal eventId={selectedEvent.id} eventName={selectedEvent.nombre} onSave={handleAddTask} onClose={() => setShowNewTask(false)} />
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="events_workstation"
        moduleLabel="Eventos"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Eventos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </div>
  );
}
