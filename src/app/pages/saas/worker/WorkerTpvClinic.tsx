import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../../context/AuthContext';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Play,
  Search,
  Stethoscope,
  User,
  X,
  AlertTriangle,
  ClipboardList,
  History,
} from 'lucide-react';

type AppointmentType = 'primera_visita' | 'seguimiento' | 'urgencia';
type AppointmentStatus = 'pendiente' | 'en_consulta' | 'completada';

interface ClinicAppointment {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  time: string;
  type: AppointmentType;
  status: AppointmentStatus;
  consultationNotes: string;
}

interface VisitHistoryEntry {
  id: string;
  date: string;
  summary: string;
  type: AppointmentType;
}

interface ClinicPatient {
  id: string;
  documentId: string;
  fullName: string;
  lastVisit: string;
  allergies: string;
  history: VisitHistoryEntry[];
}

const TYPE_CONFIG: Record<AppointmentType, { label: string; color: string; bg: string }> = {
  primera_visita: { label: 'Primera visita', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200 dark:bg-violet-950/40 dark:border-violet-800' },
  seguimiento:    { label: 'Seguimiento',     color: 'text-sky-700',    bg: 'bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:border-sky-800' },
  urgencia:       { label: 'Urgencia',        color: 'text-red-700',    bg: 'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800' },
};

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; color: string; bg: string }> = {
  pendiente:    { label: 'Pendiente',    color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800' },
  en_consulta:  { label: 'En consulta',  color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800' },
  completada:   { label: 'Completada',   color: 'text-green-700',  bg: 'bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-800' },
};

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function buildSeedAppointments(patientIds: { id: string; name: string }[]): ClinicAppointment[] {
  const day = todayISO();
  return [
    {
      id: uuidv4(),
      patientId: patientIds[0].id,
      patientName: patientIds[0].name,
      date: day,
      time: '09:00',
      type: 'primera_visita',
      status: 'pendiente',
      consultationNotes: '',
    },
    {
      id: uuidv4(),
      patientId: patientIds[1].id,
      patientName: patientIds[1].name,
      date: day,
      time: '09:30',
      type: 'seguimiento',
      status: 'pendiente',
      consultationNotes: '',
    },
    {
      id: uuidv4(),
      patientId: patientIds[2].id,
      patientName: patientIds[2].name,
      date: day,
      time: '10:15',
      type: 'urgencia',
      status: 'en_consulta',
      consultationNotes: '',
    },
    {
      id: uuidv4(),
      patientId: patientIds[0].id,
      patientName: patientIds[0].name,
      date: day,
      time: '11:00',
      type: 'seguimiento',
      status: 'completada',
      consultationNotes: 'Control de tensión dentro de rango. Próxima revisión en 3 meses.',
    },
  ];
}

function buildSeedPatients(): ClinicPatient[] {
  const p1 = uuidv4();
  const p2 = uuidv4();
  const p3 = uuidv4();
  return [
    {
      id: p1,
      documentId: '12345678A',
      fullName: 'María García López',
      lastVisit: new Date().toISOString(),
      allergies: 'Penicilina',
      history: [
        { id: uuidv4(), date: new Date(Date.now() - 86400000 * 14).toISOString(), summary: 'Revisión anual — analítica normal', type: 'seguimiento' },
        { id: uuidv4(), date: new Date(Date.now() - 86400000 * 90).toISOString(), summary: 'Primera visita — historia clínica abierta', type: 'primera_visita' },
      ],
    },
    {
      id: p2,
      documentId: '87654321B',
      fullName: 'Carlos Ruiz Martín',
      lastVisit: new Date(Date.now() - 86400000 * 2).toISOString(),
      allergies: 'Ninguna conocida',
      history: [
        { id: uuidv4(), date: new Date(Date.now() - 86400000 * 2).toISOString(), summary: 'Dolor lumbar — recomendación fisioterapia', type: 'seguimiento' },
      ],
    },
    {
      id: p3,
      documentId: '11223344C',
      fullName: 'Ana Fernández Soto',
      lastVisit: new Date(Date.now() - 86400000).toISOString(),
      allergies: 'Látex, ibuprofeno',
      history: [
        { id: uuidv4(), date: new Date().toISOString(), summary: 'Urgencia — fiebre; tratamiento sintomático', type: 'urgencia' },
      ],
    },
  ];
}

function AppointmentCard({
  apt,
  onSelect,
}: {
  apt: ClinicAppointment;
  onSelect: (a: ClinicAppointment) => void;
}) {
  const st = STATUS_CONFIG[apt.status];
  const tp = TYPE_CONFIG[apt.type];
  return (
    <button
      type="button"
      onClick={() => onSelect(apt)}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all hover:shadow-lg active:scale-[0.98] ${st.bg}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white/80 dark:bg-gray-900/60 flex items-center justify-center border border-gray-200 dark:border-gray-600 shrink-0">
            <Clock className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">{apt.time}</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{apt.patientName}</p>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border shrink-0 ${st.bg} ${st.color}`}>
          {st.label}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${tp.bg} ${tp.color}`}>
          {tp.label}
        </span>
        {apt.type === 'urgencia' && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-red-700 dark:text-red-400 uppercase">
            <AlertTriangle className="w-3 h-3" /> Prioridad
          </span>
        )}
      </div>
    </button>
  );
}

export function WorkerTpvClinic() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const workerName = user?.firstName ? `${user.firstName} ${user?.lastName || ''}`.trim() : 'Profesional';

  const seedPatients = useMemo(() => buildSeedPatients(), []);
  const seedAppointments = useMemo(() => {
    const map = seedPatients.map(p => ({ id: p.id, name: p.fullName }));
    return buildSeedAppointments(map);
  }, [seedPatients]);

  const [patients, setPatients] = useState<ClinicPatient[]>(seedPatients);
  const [appointments, setAppointments] = useState<ClinicAppointment[]>(seedAppointments);
  const [tab, setTab] = useState<'consultas' | 'pacientes'>('consultas');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all');
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [completeNotesDraft, setCompleteNotesDraft] = useState('');

  const today = todayISO();
  const todayAppointments = useMemo(
    () => appointments.filter(a => a.date === today).sort((a, b) => a.time.localeCompare(b.time)),
    [appointments, today],
  );

  const stats = useMemo(() => ({
    hoy: todayAppointments.length,
    pendientes: todayAppointments.filter(a => a.status === 'pendiente').length,
    completadas: todayAppointments.filter(a => a.status === 'completada').length,
  }), [todayAppointments]);

  const filteredAppointments = useMemo(() => {
    const q = search.toLowerCase().trim();
    return todayAppointments.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.patientName.toLowerCase().includes(q)
        || TYPE_CONFIG[a.type].label.toLowerCase().includes(q)
        || STATUS_CONFIG[a.status].label.toLowerCase().includes(q)
      );
    });
  }, [todayAppointments, search, statusFilter]);

  const filteredPatients = useMemo(() => {
    const q = search.toLowerCase().trim();
    return patients.filter(p => {
      if (!q) return true;
      return (
        p.fullName.toLowerCase().includes(q)
        || p.documentId.toLowerCase().includes(q)
        || p.allergies.toLowerCase().includes(q)
      );
    });
  }, [patients, search]);

  const selectedAppointment = selectedAppointmentId
    ? appointments.find(a => a.id === selectedAppointmentId) ?? null
    : null;
  const selectedPatient = selectedPatientId
    ? patients.find(p => p.id === selectedPatientId) ?? null
    : null;

  const openAppointment = (a: ClinicAppointment) => {
    setSelectedAppointmentId(a.id);
    setCompleteNotesDraft(a.consultationNotes || '');
  };

  const startConsultation = (id: string) => {
    setAppointments(prev => prev.map(a => (a.id === id ? { ...a, status: 'en_consulta' as const } : a)));
  };

  const completeConsultation = (id: string) => {
    const notes = completeNotesDraft.trim();
    if (!notes) return;
    const apt = appointments.find(x => x.id === id);
    if (!apt) return;
    setAppointments(prev => prev.map(a => (a.id === id
      ? { ...a, status: 'completada' as const, consultationNotes: notes }
      : a)));
    setPatients(prev => prev.map(p => {
      if (p.id !== apt.patientId) return p;
      const entry: VisitHistoryEntry = {
        id: uuidv4(),
        date: new Date().toISOString(),
        summary: notes.length > 120 ? `${notes.slice(0, 120)}…` : notes,
        type: apt.type,
      };
      return {
        ...p,
        lastVisit: new Date().toISOString(),
        history: [entry, ...p.history],
      };
    }));
    setSelectedAppointmentId(null);
    setCompleteNotesDraft('');
  };

  if (selectedAppointment) {
    const st = STATUS_CONFIG[selectedAppointment.status];
    const tp = TYPE_CONFIG[selectedAppointment.type];

    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { setSelectedAppointmentId(null); setCompleteNotesDraft(''); }}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedAppointment.time}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${st.bg} ${st.color}`}>{st.label}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{selectedAppointment.patientName}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span>{new Date(selectedAppointment.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-1 rounded-full font-semibold border ${tp.bg} ${tp.color}`}>{tp.label}</span>
            </div>
          </div>

          {selectedAppointment.status === 'pendiente' && (
            <button
              type="button"
              onClick={() => startConsultation(selectedAppointment.id)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-blue-300 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-md transition"
            >
              <Play className="w-4 h-4" /> Iniciar consulta
            </button>
          )}

          {(selectedAppointment.status === 'en_consulta' || selectedAppointment.status === 'completada') && (
            <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                <FileText className="w-4 h-4" /> Notas de la consulta
              </label>
              <textarea
                value={selectedAppointment.status === 'completada' ? selectedAppointment.consultationNotes : completeNotesDraft}
                onChange={e => setCompleteNotesDraft(e.target.value)}
                disabled={selectedAppointment.status === 'completada'}
                rows={5}
                placeholder="Evolución, diagnóstico, tratamiento, recomendaciones…"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:border-gray-900 dark:focus:border-gray-500 disabled:opacity-90 resize-y min-h-[120px]"
              />
            </div>
          )}

          {selectedAppointment.status === 'en_consulta' && (
            <button
              type="button"
              onClick={() => completeConsultation(selectedAppointment.id)}
              disabled={!completeNotesDraft.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-emerald-300 bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" /> Completar consulta
            </button>
          )}

          {selectedAppointment.status === 'completada' && selectedAppointment.consultationNotes && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 text-sm text-green-900 dark:text-green-200">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Consulta cerrada. Las notas quedan registradas en el historial del paciente.</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (selectedPatient) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedPatientId(null)}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">{selectedPatient.fullName}</h2>
              <p className="text-xs font-mono text-gray-500">{selectedPatient.documentId}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <Clock className="w-4 h-4 text-gray-400" />
              <span>Última visita: {new Date(selectedPatient.lastVisit).toLocaleString('es-ES')}</span>
            </div>
            <div className="text-sm">
              <span className="font-semibold text-gray-700 dark:text-gray-300">Alergias: </span>
              <span className="text-gray-900 dark:text-gray-100">{selectedPatient.allergies}</span>
            </div>
          </div>

          <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-3">
              <History className="w-4 h-4" /> Historial reciente
            </h3>
            {selectedPatient.history.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Sin entradas previas</p>
            ) : (
              <ul className="space-y-2">
                {selectedPatient.history.map(h => {
                  const tp = TYPE_CONFIG[h.type];
                  return (
                    <li
                      key={h.id}
                      className="p-3 rounded-xl border-2 border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs text-gray-500">{new Date(h.date).toLocaleString('es-ES')}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${tp.bg} ${tp.color}`}>{tp.label}</span>
                      </div>
                      <p className="text-sm text-gray-800 dark:text-gray-200">{h.summary}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/saas/worker/tasks')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 shrink-0" />
            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center shrink-0">
              <Stethoscope className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">Mi Puesto - Clínica</h1>
              <p className="text-xs text-gray-500 truncate">{workerName}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => { setTab('consultas'); setSearch(''); }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === 'consultas'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <ClipboardList className="w-4 h-4" /> Consultas
          </button>
          <button
            type="button"
            onClick={() => { setTab('pacientes'); setSearch(''); }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === 'pacientes'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <User className="w-4 h-4" /> Pacientes
          </button>
        </div>

        {tab === 'consultas' ? (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: 'Hoy', value: stats.hoy, color: 'bg-slate-50 text-slate-800 border-slate-200 dark:bg-slate-900/40 dark:text-slate-200 dark:border-slate-700' },
              { label: 'Pendientes', value: stats.pendientes, color: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800' },
              { label: 'Completadas', value: stats.completadas, color: 'bg-green-50 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-200 dark:border-green-800' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl border-2 p-2.5 text-center ${s.color}`}>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 mb-3">
            <div className="rounded-xl border-2 border-gray-200 dark:border-gray-700 p-2.5 text-center bg-gray-50 dark:bg-gray-800/50">
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{patients.length}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Pacientes en vista</p>
            </div>
          </div>
        )}

        {tab === 'consultas' && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {([
              { id: 'all' as const, label: 'Todas' },
              { id: 'pendiente' as const, label: 'Pendiente' },
              { id: 'en_consulta' as const, label: 'En consulta' },
              { id: 'completada' as const, label: 'Completada' },
            ]).map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  statusFilter === f.id
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'consultas' ? 'Buscar paciente, tipo o estado…' : 'Buscar nombre, documento o alergias…'}
            className="w-full pl-9 pr-8 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === 'consultas' ? (
          filteredAppointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Calendar className="w-10 h-10 mb-2" />
              <p className="text-sm font-medium">No hay consultas en esta vista</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredAppointments.map(a => (
                <AppointmentCard key={a.id} apt={a} onSelect={openAppointment} />
              ))}
            </div>
          )
        ) : (
          filteredPatients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <User className="w-10 h-10 mb-2" />
              <p className="text-sm font-medium">No hay pacientes que coincidan</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPatients.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPatientId(p.id)}
                  className="w-full text-left p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:shadow-lg transition-all active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/50 flex items-center justify-center border-2 border-teal-100 dark:border-teal-900 shrink-0">
                        <User className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{p.fullName}</p>
                        <p className="text-xs font-mono text-gray-500">{p.documentId}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 shrink-0" />
                      Última visita: {new Date(p.lastVisit).toLocaleDateString('es-ES')}
                    </span>
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0 text-amber-500" />
                      Alergias: {p.allergies}
                    </span>
                  </div>
                  <p className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold mt-2">Ver historial →</p>
                </button>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
