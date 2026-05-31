import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../../context/AuthContext';
import {
  ArrowLeft,
  Calendar,
  Heart,
  PawPrint,
  Search,
  Stethoscope,
  User,
  Syringe,
  Play,
  CheckCircle,
  X,
  RefreshCw,
  FileText,
  Loader2,
} from 'lucide-react';

type VetSpecies = 'perro' | 'gato' | 'ave' | 'exotico';
type ConsultStatus = 'pendiente' | 'en_consulta' | 'completada';

interface VaccineDose {
  id: string;
  name: string;
  dueDate: string;
  administered: boolean;
}

interface VetPatient {
  id: string;
  name: string;
  species: VetSpecies;
  breed: string;
  ownerName: string;
  lastVisit: string;
  vaccinations: VaccineDose[];
}

interface VetAppointment {
  id: string;
  date: string;
  time: string;
  petId: string;
  petName: string;
  species: VetSpecies;
  ownerName: string;
  reason: string;
  status: ConsultStatus;
  diagnosisNotes: string;
}

const SPECIES_LABEL: Record<VetSpecies, string> = {
  perro: 'Perro',
  gato: 'Gato',
  ave: 'Ave',
  exotico: 'Exótico',
};

const STATUS_CONFIG: Record<
  ConsultStatus,
  { label: string; color: string; bg: string }
> = {
  pendiente: {
    label: 'Pendiente',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800',
  },
  en_consulta: {
    label: 'En consulta',
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
  },
  completada: {
    label: 'Completada',
    color: 'text-green-700 dark:text-green-300',
    bg: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
  },
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function seedPatients(): VetPatient[] {
  const p1 = uuidv4();
  const p2 = uuidv4();
  const p3 = uuidv4();
  return [
    {
      id: p1,
      name: 'Luna',
      species: 'perro',
      breed: 'Border Collie',
      ownerName: 'María García',
      lastVisit: todayIso(),
      vaccinations: [
        {
          id: uuidv4(),
          name: 'Rabia',
          dueDate: todayIso(),
          administered: false,
        },
        {
          id: uuidv4(),
          name: 'Polivalente',
          dueDate: '2026-05-15',
          administered: false,
        },
        {
          id: uuidv4(),
          name: 'Leishmania',
          dueDate: '2025-11-01',
          administered: true,
        },
      ],
    },
    {
      id: p2,
      name: 'Mishi',
      species: 'gato',
      breed: 'Europeo',
      ownerName: 'Carlos Ruiz',
      lastVisit: '2026-04-02',
      vaccinations: [
        {
          id: uuidv4(),
          name: 'Triple felina',
          dueDate: '2026-04-20',
          administered: false,
        },
      ],
    },
    {
      id: p3,
      name: 'Kiwi',
      species: 'ave',
      breed: 'Agaporni',
      ownerName: 'Ana López',
      lastVisit: '2026-03-10',
      vaccinations: [
        {
          id: uuidv4(),
          name: 'Psitacosis (control)',
          dueDate: '2026-06-01',
          administered: false,
        },
      ],
    },
    {
      id: uuidv4(),
      name: 'Draco',
      species: 'exotico',
      breed: 'Dragón barbudo',
      ownerName: 'Luis Méndez',
      lastVisit: '2026-01-20',
      vaccinations: [
        {
          id: uuidv4(),
          name: 'Desparasitación externa',
          dueDate: todayIso(),
          administered: false,
        },
      ],
    },
  ];
}

function seedAppointments(patients: VetPatient[]): VetAppointment[] {
  const [a, b, c] = patients;
  const d = todayIso();
  return [
    {
      id: uuidv4(),
      date: d,
      time: '09:00',
      petId: a.id,
      petName: a.name,
      species: a.species,
      ownerName: a.ownerName,
      reason: 'Revisión anual y vacunas',
      status: 'pendiente',
      diagnosisNotes: '',
    },
    {
      id: uuidv4(),
      date: d,
      time: '10:30',
      petId: b.id,
      petName: b.name,
      species: b.species,
      ownerName: b.ownerName,
      reason: 'Vómitos ocasionales',
      status: 'en_consulta',
      diagnosisNotes: '',
    },
    {
      id: uuidv4(),
      date: d,
      time: '11:45',
      petId: c.id,
      petName: c.name,
      species: c.species,
      ownerName: c.ownerName,
      reason: 'Corte de uñas y revisión',
      status: 'completada',
      diagnosisNotes: 'Estado general bueno. Uñas recortadas.',
    },
  ];
}

function pendingVaccineCount(p: VetPatient) {
  return p.vaccinations.filter(v => !v.administered).length;
}

function ConsultationCard({
  apt,
  onSelect,
}: {
  apt: VetAppointment;
  onSelect: (a: VetAppointment) => void;
}) {
  const cfg = STATUS_CONFIG[apt.status];
  return (
    <button
      type="button"
      onClick={() => onSelect(apt)}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all hover:shadow-lg active:scale-[0.98] dark:border-opacity-80 ${cfg.bg}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100 shrink-0">
            {apt.time}
          </span>
          <PawPrint className="w-4 h-4 text-rose-500 shrink-0" />
          <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
            {apt.petName}
          </span>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 border ${cfg.bg} ${cfg.color}`}
        >
          {cfg.label}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
        {SPECIES_LABEL[apt.species]} · {apt.ownerName}
      </p>
      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
        {apt.reason}
      </p>
    </button>
  );
}

function ConsultationDetailPanel({
  appointment,
  patients,
  onBack,
  onUpdate,
}: {
  appointment: VetAppointment;
  patients: VetPatient[];
  onBack: () => void;
  onUpdate: (a: VetAppointment) => void;
}) {
  const [notes, setNotes] = useState(appointment.diagnosisNotes);
  const [saving, setSaving] = useState(false);
  const cfg = STATUS_CONFIG[appointment.status];
  const pet = patients.find(p => p.id === appointment.petId);

  const persist = useCallback(
    async (next: VetAppointment) => {
      setSaving(true);
      await new Promise(r => setTimeout(r, 280));
      onUpdate(next);
      setSaving(false);
      toast.success('Consulta actualizada');
    },
    [onUpdate],
  );

  const startConsultation = () => {
    if (appointment.status !== 'pendiente') return;
    void persist({ ...appointment, status: 'en_consulta' });
  };

  const completeConsultation = async () => {
    if (appointment.status !== 'en_consulta') return;
    await persist({
      ...appointment,
      status: 'completada',
      diagnosisNotes: notes.trim(),
    });
    onBack();
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Stethoscope className="w-4 h-4 text-rose-500" />
              <span className="font-bold text-gray-900 dark:text-gray-100">
                {appointment.petName}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${cfg.bg} ${cfg.color}`}
              >
                {cfg.label}
              </span>
            </div>
            <p className="text-xs text-gray-500 truncate">
              {appointment.time} · {SPECIES_LABEL[appointment.species]} ·{' '}
              {appointment.ownerName}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        <div className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Motivo
          </p>
          <p className="text-sm text-gray-800 dark:text-gray-200">
            {appointment.reason}
          </p>
        </div>

        {pet && (
          <div className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <Syringe className="w-4 h-4 text-emerald-600" />
              Calendario de vacunación
            </h3>
            <ul className="space-y-2">
              {pet.vaccinations.map(v => (
                <li
                  key={v.id}
                  className={`flex items-center justify-between gap-2 text-sm rounded-xl border-2 px-3 py-2 ${
                    v.administered
                      ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20'
                      : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20'
                  }`}
                >
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {v.name}
                  </span>
                  <span className="text-xs text-gray-600 dark:text-gray-400 shrink-0">
                    {v.administered
                      ? 'Administrada'
                      : `Próx.: ${new Date(v.dueDate + 'T12:00:00').toLocaleDateString('es-ES')}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Notas de diagnóstico
          </h3>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={4}
            disabled={appointment.status === 'completada'}
            className="w-full rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm p-2 resize-none focus:ring-2 focus:ring-rose-500 outline-none disabled:opacity-60"
            placeholder="Hallazgos, tratamiento, recomendaciones..."
          />
        </div>
      </div>

      <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex gap-2">
        {appointment.status === 'pendiente' && (
          <button
            type="button"
            onClick={startConsultation}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-blue-600 bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 shadow-lg disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Iniciar consulta
          </button>
        )}
        {appointment.status === 'en_consulta' && (
          <button
            type="button"
            onClick={completeConsultation}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border-2 border-green-600 bg-green-600 text-white font-semibold text-sm hover:bg-green-700 shadow-lg disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            Finalizar consulta
          </button>
        )}
        {appointment.status === 'completada' && (
          <p className="text-xs text-center text-gray-500 w-full py-2">
            Esta consulta está cerrada. Las notas quedan registradas en el historial
            local.
          </p>
        )}
      </div>
    </div>
  );
}

function PatientCard({
  patient,
  onSelect,
}: {
  patient: VetPatient;
  onSelect: (p: VetPatient) => void;
}) {
  const pending = pendingVaccineCount(patient);
  return (
    <button
      type="button"
      onClick={() => onSelect(patient)}
      className="w-full text-left p-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:shadow-lg transition-all active:scale-[0.98]"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <PawPrint className="w-5 h-5 text-rose-500 shrink-0" />
          <span className="font-bold text-gray-900 dark:text-gray-100 truncate">
            {patient.name}
          </span>
        </div>
        {pending > 0 && (
          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border border-amber-200 dark:border-amber-800 shrink-0">
            {pending} vac. pend.
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-1">
        {SPECIES_LABEL[patient.species]}
        {patient.breed ? ` · ${patient.breed}` : ''}
      </p>
      <div className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
        <User className="w-3.5 h-3.5 text-gray-400" />
        <span className="truncate">{patient.ownerName}</span>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Última visita:{' '}
        {new Date(patient.lastVisit + 'T12:00:00').toLocaleDateString('es-ES')}
      </p>
    </button>
  );
}

function PatientQuickView({
  patient,
  onBack,
}: {
  patient: VetPatient;
  onBack: () => void;
}) {
  const pending = patient.vaccinations.filter(v => !v.administered);
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <Heart className="w-5 h-5 text-rose-500 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900 dark:text-gray-100 truncate">
                {patient.name}
              </h2>
              <p className="text-xs text-gray-500 truncate">
                {SPECIES_LABEL[patient.species]} · {patient.breed}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-gray-400" />
            <span className="font-medium">{patient.ownerName}</span>
          </div>
          <p className="text-xs text-gray-500">
            Última visita:{' '}
            {new Date(patient.lastVisit + 'T12:00:00').toLocaleDateString('es-ES')}
          </p>
          <p className="text-xs text-gray-500 font-mono">ID: {patient.id}</p>
        </div>
        <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Vacunación
          </h3>
          <p className="text-xs text-gray-500 mb-2">
            Pendientes:{' '}
            <span className="font-bold text-amber-700 dark:text-amber-400">
              {pending.length}
            </span>
          </p>
          <ul className="space-y-2">
            {patient.vaccinations.map(v => (
              <li
                key={v.id}
                className={`rounded-xl border-2 px-3 py-2 text-sm ${
                  v.administered
                    ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800'
                }`}
              >
                <div className="font-medium text-gray-800 dark:text-gray-200">
                  {v.name}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {v.administered
                    ? 'Completada'
                    : `Programada: ${new Date(v.dueDate + 'T12:00:00').toLocaleDateString('es-ES')}`}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function WorkerTpvVet() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'consultas' | 'pacientes'>('consultas');
  const [refreshKey, setRefreshKey] = useState(0);

  const initial = useMemo(() => {
    const patients = seedPatients();
    return {
      patients,
      appointments: seedAppointments(patients),
    };
  }, []);

  const [patients, setPatients] = useState<VetPatient[]>(initial.patients);
  const [appointments, setAppointments] = useState<VetAppointment[]>(
    initial.appointments,
  );

  const [searchConsultas, setSearchConsultas] = useState('');
  const [searchPacientes, setSearchPacientes] = useState('');
  const [selectedApt, setSelectedApt] = useState<VetAppointment | null>(null);
  const [selectedPet, setSelectedPet] = useState<VetPatient | null>(null);

  const today = todayIso();

  const stats = useMemo(() => {
    const todayApts = appointments.filter(a => a.date === today);
    return {
      consultasHoy: todayApts.length,
      pendientes: todayApts.filter(a => a.status === 'pendiente').length,
      vacunasPendientes: patients.reduce(
        (sum, p) => sum + pendingVaccineCount(p),
        0,
      ),
    };
  }, [appointments, patients, today]);

  const filteredConsultas = useMemo(() => {
    const list = appointments
      .filter(a => a.date === today)
      .sort((a, b) => a.time.localeCompare(b.time));
    if (!searchConsultas.trim()) return list;
    const q = searchConsultas.toLowerCase();
    return list.filter(
      a =>
        a.petName.toLowerCase().includes(q) ||
        a.ownerName.toLowerCase().includes(q) ||
        a.reason.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q),
    );
  }, [appointments, today, searchConsultas]);

  const filteredPacientes = useMemo(() => {
    if (!searchPacientes.trim()) return patients;
    const q = searchPacientes.toLowerCase();
    return patients.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.ownerName.toLowerCase().includes(q) ||
        p.breed.toLowerCase().includes(q) ||
        SPECIES_LABEL[p.species].toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q),
    );
  }, [patients, searchPacientes]);

  const updateAppointment = useCallback((updated: VetAppointment) => {
    setAppointments(prev => prev.map(a => (a.id === updated.id ? updated : a)));
    setSelectedApt(cur => (cur?.id === updated.id ? updated : cur));
    if (updated.status === 'completada') {
      setPatients(prev =>
        prev.map(p =>
          p.id === updated.petId ? { ...p, lastVisit: updated.date } : p,
        ),
      );
    }
  }, []);

  const reloadDemo = useCallback(() => {
    const p = seedPatients();
    setPatients(p);
    setAppointments(seedAppointments(p));
    setSelectedApt(null);
    setSelectedPet(null);
    setRefreshKey(k => k + 1);
    toast.message('Datos de demostración recargados');
  }, []);

  if (selectedApt) {
    return (
      <ConsultationDetailPanel
        key={selectedApt.id}
        appointment={selectedApt}
        patients={patients}
        onBack={() => setSelectedApt(null)}
        onUpdate={updateAppointment}
      />
    );
  }

  if (selectedPet) {
    return (
      <PatientQuickView
        key={selectedPet.id}
        patient={selectedPet}
        onBack={() => setSelectedPet(null)}
      />
    );
  }

  const staffLabel = user?.fullName || 'Veterinario';

  return (
    <div
      key={refreshKey}
      className="flex flex-col h-full min-h-0"
    >
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/saas/worker/tasks')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-700"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 shrink-0" />
            <div className="w-10 h-10 bg-rose-100 dark:bg-rose-900/30 rounded-2xl border-2 border-rose-200 dark:border-rose-800 flex items-center justify-center shrink-0">
              <PawPrint className="w-5 h-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                Mi Puesto - Veterinario
              </h1>
              <p className="text-xs text-gray-500 truncate">{staffLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={reloadDemo}
            className="p-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
            title="Recargar demo"
          >
            <RefreshCw className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            {
              label: 'Consultas hoy',
              value: stats.consultasHoy,
              color:
                'bg-gray-50 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600',
            },
            {
              label: 'Pendientes',
              value: stats.pendientes,
              color:
                'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800',
            },
            {
              label: 'Vacunas pend.',
              value: stats.vacunasPendientes,
              color:
                'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800',
            },
          ].map(s => (
            <div
              key={s.label}
              className={`rounded-2xl border-2 p-2 text-center ${s.color}`}
            >
              <p className="text-lg font-bold">{s.value}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider leading-tight">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        <div className="flex gap-1.5 mb-3">
          {(
            [
              { id: 'consultas' as const, label: 'Consultas', icon: Calendar },
              { id: 'pacientes' as const, label: 'Pacientes', icon: Heart },
            ] as const
          ).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-xs font-semibold border-2 transition-all ${
                tab === t.id
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-md'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'consultas' && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchConsultas}
              onChange={e => setSearchConsultas(e.target.value)}
              placeholder="Buscar mascota, tutor, motivo o UUID..."
              className="w-full pl-9 pr-9 py-2 rounded-2xl border-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none"
            />
            {searchConsultas && (
              <button
                type="button"
                onClick={() => setSearchConsultas('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
        )}

        {tab === 'pacientes' && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchPacientes}
              onChange={e => setSearchPacientes(e.target.value)}
              placeholder="Buscar paciente, raza, tutor o UUID..."
              className="w-full pl-9 pr-9 py-2 rounded-2xl border-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-rose-500 focus:border-transparent outline-none"
            />
            {searchPacientes && (
              <button
                type="button"
                onClick={() => setSearchPacientes('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === 'consultas' &&
          (filteredConsultas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Stethoscope className="w-10 h-10 mb-2 opacity-60" />
              <p className="text-sm font-medium text-center">
                No hay consultas para mostrar
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredConsultas.map(apt => (
                <ConsultationCard
                  key={apt.id}
                  apt={apt}
                  onSelect={setSelectedApt}
                />
              ))}
            </div>
          ))}

        {tab === 'pacientes' &&
          (filteredPacientes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <PawPrint className="w-10 h-10 mb-2 opacity-60" />
              <p className="text-sm font-medium text-center">
                No hay pacientes que coincidan
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredPacientes.map(p => (
                <PatientCard
                  key={p.id}
                  patient={p}
                  onSelect={setSelectedPet}
                />
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}
