import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../../context/AuthContext';
import { useModalClose } from '../../../hooks/useModalClose';
import {
  Scale,
  Briefcase,
  Clock,
  Calendar,
  Gavel,
  ArrowLeft,
  Search,
  X,
  CheckCircle2,
  Circle,
  MapPin,
  FileText,
  Timer,
  Filter,
} from 'lucide-react';

type CaseType = 'civil' | 'penal' | 'laboral' | 'mercantil';
type CaseStatus = 'activo' | 'en_espera' | 'resuelto';
type AgendaType = 'reunion_cliente' | 'audiencia' | 'vencimiento';
type WorkerTab = 'expedientes' | 'agenda';

const CASE_TYPE_LABEL: Record<CaseType, string> = {
  civil: 'Civil',
  penal: 'Penal',
  laboral: 'Laboral',
  mercantil: 'Mercantil',
};

const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  activo: 'Activo',
  en_espera: 'En espera',
  resuelto: 'Resuelto',
};

const AGENDA_TYPE_LABEL: Record<AgendaType, string> = {
  reunion_cliente: 'Reunión cliente',
  audiencia: 'Audiencia',
  vencimiento: 'Vencimiento',
};

interface TimeEntry {
  id: string;
  minutes: number;
  note?: string;
  loggedAt: string;
}

interface CaseNote {
  id: string;
  text: string;
  createdAt: string;
}

interface LegalCase {
  id: string;
  ref: string;
  client: string;
  caseType: CaseType;
  nextDeadline: string;
  status: CaseStatus;
  timeEntries: TimeEntry[];
  notes: CaseNote[];
}

interface AgendaItem {
  id: string;
  date: string;
  time: string;
  caseRef: string;
  agendaType: AgendaType;
  location: string;
  completed: boolean;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysYmd(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDeadline(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function createInitialCases(): LegalCase[] {
  const t = todayYmd();
  return [
    {
      id: uuidv4(),
      ref: 'EXP-2026-0142',
      client: 'García & Asociados S.L.',
      caseType: 'mercantil',
      nextDeadline: addDaysYmd(3),
      status: 'activo',
      timeEntries: [
        { id: uuidv4(), minutes: 120, note: 'Revisión contrato', loggedAt: new Date().toISOString() },
      ],
      notes: [{ id: uuidv4(), text: 'Cliente solicita reunión previa a mediación.', createdAt: new Date().toISOString() }],
    },
    {
      id: uuidv4(),
      ref: 'EXP-2026-0089',
      client: 'María López Ruiz',
      caseType: 'civil',
      nextDeadline: t,
      status: 'activo',
      timeEntries: [],
      notes: [],
    },
    {
      id: uuidv4(),
      ref: 'EXP-2025-1203',
      client: 'José Martín',
      caseType: 'penal',
      nextDeadline: addDaysYmd(12),
      status: 'en_espera',
      timeEntries: [{ id: uuidv4(), minutes: 45, loggedAt: new Date().toISOString() }],
      notes: [],
    },
    {
      id: uuidv4(),
      ref: 'EXP-2024-0550',
      client: 'Sindicato CCOO local',
      caseType: 'laboral',
      nextDeadline: addDaysYmd(1),
      status: 'resuelto',
      timeEntries: [{ id: uuidv4(), minutes: 300, note: 'Juicio', loggedAt: new Date().toISOString() }],
      notes: [],
    },
  ];
}

function createInitialAgenda(): AgendaItem[] {
  const t = todayYmd();
  return [
    {
      id: uuidv4(),
      date: t,
      time: '09:30',
      caseRef: 'EXP-2026-0142',
      agendaType: 'reunion_cliente',
      location: 'Despacho 2',
      completed: false,
    },
    {
      id: uuidv4(),
      date: t,
      time: '11:00',
      caseRef: 'EXP-2026-0089',
      agendaType: 'audiencia',
      location: 'Juzgado n.º 4 — Av. Justicia 12',
      completed: false,
    },
    {
      id: uuidv4(),
      date: t,
      time: '16:00',
      caseRef: 'EXP-2026-0142',
      agendaType: 'vencimiento',
      location: 'Presentación escrito',
      completed: false,
    },
    {
      id: uuidv4(),
      date: addDaysYmd(1),
      time: '10:15',
      caseRef: 'EXP-2025-1203',
      agendaType: 'reunion_cliente',
      location: 'Videollamada',
      completed: false,
    },
  ];
}

export function WorkerTpvLawyer() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<WorkerTab>('expedientes');
  const [cases, setCases] = useState<LegalCase[]>(createInitialCases);
  const [agenda, setAgenda] = useState<AgendaItem[]>(createInitialAgenda);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CaseStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | CaseType>('all');
  const [agendaTypeFilter, setAgendaTypeFilter] = useState<'all' | AgendaType>('all');
  const [showCompletedAgenda, setShowCompletedAgenda] = useState(true);

  const [timeModalCase, setTimeModalCase] = useState<LegalCase | null>(null);
  const [timeMinutes, setTimeMinutes] = useState('');
  const [timeNote, setTimeNote] = useState('');
  const [noteDraftCaseId, setNoteDraftCaseId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  useModalClose(!!timeModalCase, () => {
    setTimeModalCase(null);
    setTimeMinutes('');
    setTimeNote('');
  });

  const today = todayYmd();
  const workerName = user?.fullName || user?.email || 'Abogado';

  const stats = useMemo(() => {
    const activos = cases.filter(c => c.status === 'activo').length;
    const citasHoy = agenda.filter(a => a.date === today && !a.completed).length;
    const weekEnd = addDaysYmd(7);
    const vencimientos = cases.filter(c => {
      if (c.status === 'resuelto') return false;
      const d = c.nextDeadline;
      return d >= today && d <= weekEnd;
    }).length;
    return { activos, citasHoy, vencimientos };
  }, [cases, agenda, today]);

  const filteredCases = useMemo(() => {
    let list = cases;
    if (statusFilter !== 'all') list = list.filter(c => c.status === statusFilter);
    if (typeFilter !== 'all') list = list.filter(c => c.caseType === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        c =>
          c.ref.toLowerCase().includes(q) ||
          c.client.toLowerCase().includes(q) ||
          CASE_TYPE_LABEL[c.caseType].toLowerCase().includes(q),
      );
    }
    return list;
  }, [cases, statusFilter, typeFilter, search]);

  const agendaToday = useMemo(() => {
    let list = agenda.filter(a => a.date === today);
    if (agendaTypeFilter !== 'all') list = list.filter(a => a.agendaType === agendaTypeFilter);
    if (!showCompletedAgenda) list = list.filter(a => !a.completed);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        a =>
          a.caseRef.toLowerCase().includes(q) ||
          a.location.toLowerCase().includes(q) ||
          AGENDA_TYPE_LABEL[a.agendaType].toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => a.time.localeCompare(b.time));
  }, [agenda, today, agendaTypeFilter, showCompletedAgenda, search]);

  const billableMinutes = useCallback((c: LegalCase) => c.timeEntries.reduce((s, e) => s + e.minutes, 0), []);

  const openTimeModal = (c: LegalCase) => {
    setTimeModalCase(c);
    setTimeMinutes('');
    setTimeNote('');
  };

  const submitTimeLog = () => {
    if (!timeModalCase) return;
    const m = parseInt(timeMinutes, 10);
    if (!Number.isFinite(m) || m <= 0) {
      toast.error('Indica minutos válidos (facturables)');
      return;
    }
    const entry: TimeEntry = {
      id: uuidv4(),
      minutes: m,
      note: timeNote.trim() || undefined,
      loggedAt: new Date().toISOString(),
    };
    setCases(prev =>
      prev.map(c => (c.id === timeModalCase.id ? { ...c, timeEntries: [...c.timeEntries, entry] } : c)),
    );
    toast.success(`${m} min registrados en ${timeModalCase.ref}`);
    setTimeModalCase(null);
    setTimeMinutes('');
    setTimeNote('');
  };

  const submitNote = (caseId: string) => {
    const text = noteText.trim();
    if (!text) {
      toast.error('Escribe una nota');
      return;
    }
    const note: CaseNote = { id: uuidv4(), text, createdAt: new Date().toISOString() };
    setCases(prev => prev.map(c => (c.id === caseId ? { ...c, notes: [...c.notes, note] } : c)));
    toast.success('Nota guardada');
    setNoteDraftCaseId(null);
    setNoteText('');
  };

  const toggleAgendaComplete = (id: string) => {
    setAgenda(prev =>
      prev.map(a => {
        if (a.id !== id) return a;
        const next = !a.completed;
        if (next) toast.success('Marcado como completado');
        else toast.message('Marcado como pendiente');
        return { ...a, completed: next };
      }),
    );
  };

  const statusStyle = (s: CaseStatus) => {
    switch (s) {
      case 'activo':
        return 'bg-emerald-50 dark:bg-emerald-900/25 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300';
      case 'en_espera':
        return 'bg-amber-50 dark:bg-amber-900/25 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300';
      case 'resuelto':
        return 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400';
      default:
        return 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600';
    }
  };

  const agendaTypeStyle = (t: AgendaType) => {
    switch (t) {
      case 'audiencia':
        return 'bg-violet-50 dark:bg-violet-900/25 border-violet-200 dark:border-violet-800 text-violet-800 dark:text-violet-300';
      case 'vencimiento':
        return 'bg-rose-50 dark:bg-rose-900/25 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300';
      default:
        return 'bg-sky-50 dark:bg-sky-900/25 border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300';
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/saas/worker')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 shrink-0" />
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/35 rounded-xl flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">Mi Puesto - Despacho</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{workerName}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-900/20 p-2.5 text-center">
            <p className="text-xl font-bold text-emerald-800 dark:text-emerald-300">{stats.activos}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-500">
              Expedientes activos
            </p>
          </div>
          <div className="rounded-2xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-900/20 p-2.5 text-center">
            <p className="text-xl font-bold text-blue-800 dark:text-blue-300">{stats.citasHoy}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-500">
              Citas hoy
            </p>
          </div>
          <div className="rounded-2xl border-2 border-rose-200 dark:border-rose-800 bg-rose-50/80 dark:bg-rose-900/20 p-2.5 text-center">
            <p className="text-xl font-bold text-rose-800 dark:text-rose-300">{stats.vencimientos}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-500">
              Vencimientos próx. (7d)
            </p>
          </div>
        </div>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('expedientes')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold transition-all border-2 ${
              activeTab === 'expedientes'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Expedientes
            <span
              className={`ml-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                activeTab === 'expedientes' ? 'bg-white/20 dark:bg-gray-900/15' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              {cases.filter(c => c.status !== 'resuelto').length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('agenda')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold transition-all border-2 ${
              activeTab === 'agenda'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Agenda
            <span
              className={`ml-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                activeTab === 'agenda' ? 'bg-white/20 dark:bg-gray-900/15' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              {agenda.filter(a => a.date === today).length}
            </span>
          </button>
        </div>
      </div>

      <div className="shrink-0 px-4 py-2 bg-gray-50 dark:bg-gray-950 border-b border-gray-200 dark:border-gray-700 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={activeTab === 'expedientes' ? 'Buscar ref., cliente, materia…' : 'Buscar ref., lugar, tipo…'}
            className="w-full pl-9 pr-8 py-2 rounded-2xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>

        {activeTab === 'expedientes' ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-gray-500">
              <Filter className="w-3 h-3" /> Estado
            </span>
            {(['all', 'activo', 'en_espera', 'resuelto'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold border-2 transition-all ${
                  statusFilter === s
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                }`}
              >
                {s === 'all' ? 'Todos' : CASE_STATUS_LABEL[s]}
              </button>
            ))}
            <span className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            <span className="text-[10px] font-bold uppercase text-gray-500">Tipo</span>
            {(['all', 'civil', 'penal', 'laboral', 'mercantil'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold border-2 transition-all ${
                  typeFilter === t
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                }`}
              >
                {t === 'all' ? 'Todos' : CASE_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(['all', 'reunion_cliente', 'audiencia', 'vencimiento'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAgendaTypeFilter(t)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold border-2 transition-all ${
                    agendaTypeFilter === t
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {t === 'all' ? 'Todos' : AGENDA_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={showCompletedAgenda}
                onChange={e => setShowCompletedAgenda(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Mostrar completados
            </label>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {activeTab === 'expedientes' ? (
          filteredCases.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
              <Gavel className="w-10 h-10 mb-2 opacity-60" />
              <p className="text-sm font-medium">No hay expedientes con estos filtros</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filteredCases.map(c => (
                <div
                  key={c.id}
                  className="rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900/80 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{c.ref}</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{c.client}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                        {CASE_TYPE_LABEL[c.caseType]}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg border-2 ${statusStyle(c.status)}`}
                      >
                        {CASE_STATUS_LABEL[c.status]}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-3">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>Próximo vencimiento: {formatDeadline(c.nextDeadline)}</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-400 mb-3 p-2 rounded-xl bg-indigo-50/80 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                    <Timer className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-semibold">{billableMinutes(c)} min facturables</span>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => openTimeModal(c)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      Registrar tiempo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNoteDraftCaseId(noteDraftCaseId === c.id ? null : c.id);
                        setNoteText('');
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Nota
                    </button>
                  </div>

                  {noteDraftCaseId === c.id && (
                    <div className="mb-3 p-3 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50">
                      <textarea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Escribe una nota interna…"
                        rows={3}
                        className="w-full text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setNoteDraftCaseId(null);
                            setNoteText('');
                          }}
                          className="px-3 py-1 text-xs font-medium text-gray-500"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => submitNote(c.id)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  )}

                  {c.notes.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-[10px] font-bold uppercase text-gray-500">Notas</p>
                      {c.notes.slice(-3).map(n => (
                        <p key={n.id} className="text-xs text-gray-600 dark:text-gray-400 pl-2 border-l-2 border-indigo-300 dark:border-indigo-700">
                          {n.text}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Hoy — {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            {agendaToday.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <Calendar className="w-10 h-10 mb-2 opacity-60" />
                <p className="text-sm font-medium">No hay eventos con estos filtros</p>
              </div>
            ) : (
              agendaToday.map(item => (
                <div
                  key={item.id}
                  className={`rounded-2xl border-2 p-4 transition-all ${
                    item.completed
                      ? 'border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/40 opacity-75'
                      : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900/80 shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="shrink-0 w-14 text-center">
                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{item.time}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">{item.caseRef}</p>
                        <span
                          className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg border-2 ${agendaTypeStyle(item.agendaType)}`}
                        >
                          {AGENDA_TYPE_LABEL[item.agendaType]}
                        </span>
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-600 dark:text-gray-400">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span className="break-words">{item.location}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleAgendaComplete(item.id)}
                      className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-semibold border-2 transition-all ${
                        item.completed
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
                          : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-emerald-400 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20'
                      }`}
                    >
                      {item.completed ? (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          Hecho
                        </>
                      ) : (
                        <>
                          <Circle className="w-4 h-4" />
                          Completar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {timeModalCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setTimeModalCase(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Tiempo facturable</h2>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{timeModalCase.ref}</p>
              </div>
              <button
                type="button"
                onClick={() => setTimeModalCase(null)}
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Minutos</label>
                <input
                  type="number"
                  min={1}
                  value={timeMinutes}
                  onChange={e => setTimeMinutes(e.target.value)}
                  placeholder="p. ej. 45"
                  className="w-full px-3 py-2 rounded-2xl border-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Descripción (opcional)
                </label>
                <input
                  type="text"
                  value={timeNote}
                  onChange={e => setTimeNote(e.target.value)}
                  placeholder="Actividad realizada…"
                  className="w-full px-3 py-2 rounded-2xl border-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={submitTimeLog}
                className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors"
              >
                Guardar registro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
