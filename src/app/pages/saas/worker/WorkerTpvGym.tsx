import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../../context/AuthContext';
import {
  ArrowLeft,
  Dumbbell,
  Users,
  CalendarDays,
  Search,
  X,
  Plus,
  CheckCircle2,
  Clock,
  UserCheck,
  ChevronRight,
  DoorOpen,
} from 'lucide-react';

type MemberStatus = 'activo' | 'inactivo' | 'prueba';

interface GymMember {
  id: string;
  nombre: string;
  email: string;
  estado: MemberStatus;
  tipoMembresia: string;
  ultimoAcceso: string | null;
}

interface AccessLog {
  id: string;
  memberId: string;
  timestamp: string;
}

interface ClassAttendance {
  memberId: string;
  hora: string;
}

interface GymClass {
  id: string;
  nombre: string;
  horaInicio: string;
  horaFin: string;
  instructor: string;
  capacidad: number;
  inscritos: number;
  asistentes: ClassAttendance[];
}

const MEMBER_STATUS_CFG: Record<MemberStatus, { label: string; color: string; bg: string }> = {
  activo: { label: 'Activo', color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700' },
  inactivo: { label: 'Inactivo', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800/80 border-gray-200 dark:border-gray-600' },
  prueba: { label: 'Prueba', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700' },
};

type ActiveTab = 'socios' | 'clases';
type MemberFilter = MemberStatus | 'all';
type ClassFilter = 'all' | 'hueco' | 'completo';

function isSameCalendarDay(iso: string, ref = new Date()) {
  const d = new Date(iso);
  return d.toDateString() === ref.toDateString();
}

function MemberCard({
  m,
  onCheckIn,
}: {
  m: GymMember;
  onCheckIn: (id: string) => void;
}) {
  const cfg = MEMBER_STATUS_CFG[m.estado];
  const canCheckIn = m.estado === 'activo' || m.estado === 'prueba';

  return (
    <div
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all hover:shadow-lg ${cfg.bg}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{m.nombre}</p>
          <p className="text-xs text-gray-500 truncate">{m.email}</p>
        </div>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold border ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-2">
        <Dumbbell className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">{m.tipoMembresia}</span>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <Clock className="w-3.5 h-3.5" />
          <span>
            Último acceso:{' '}
            {m.ultimoAcceso
              ? new Date(m.ultimoAcceso).toLocaleString('es-ES', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—'}
          </span>
        </div>
        <button
          type="button"
          disabled={!canCheckIn}
          onClick={() => onCheckIn(m.id)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
            canCheckIn
              ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 shadow-md active:scale-[0.98]'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
          }`}
        >
          <DoorOpen className="w-3.5 h-3.5" />
          Fichar entrada
        </button>
      </div>
    </div>
  );
}

export function WorkerTpvGym() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const workerName = user?.firstName ? `${user.firstName} ${user?.lastName || ''}`.trim() : 'Operario';

  const [tab, setTab] = useState<ActiveTab>('socios');
  const [search, setSearch] = useState('');
  const [filterMember, setFilterMember] = useState<MemberFilter>('all');
  const [filterClass, setFilterClass] = useState<ClassFilter>('all');

  const [members, setMembers] = useState<GymMember[]>(() => [
    {
      id: uuidv4(),
      nombre: 'Laura Méndez',
      email: 'laura.m@email.com',
      estado: 'activo',
      tipoMembresia: 'Mensual premium',
      ultimoAcceso: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      id: uuidv4(),
      nombre: 'Carlos Ruiz',
      email: 'carlos.ruiz@email.com',
      estado: 'activo',
      tipoMembresia: 'Anual',
      ultimoAcceso: new Date().toISOString(),
    },
    {
      id: uuidv4(),
      nombre: 'Ana Torres',
      email: 'ana.t@email.com',
      estado: 'prueba',
      tipoMembresia: 'Prueba 7 días',
      ultimoAcceso: null,
    },
    {
      id: uuidv4(),
      nombre: 'Pedro Sánchez',
      email: 'pedro.s@email.com',
      estado: 'inactivo',
      tipoMembresia: 'Mensual (vencido)',
      ultimoAcceso: new Date(Date.now() - 86400000 * 40).toISOString(),
    },
  ]);

  const [classes, setClasses] = useState<GymClass[]>(() => [
    {
      id: uuidv4(),
      nombre: 'Spinning',
      horaInicio: '08:00',
      horaFin: '08:45',
      instructor: 'Marta López',
      capacidad: 20,
      inscritos: 14,
      asistentes: [],
    },
    {
      id: uuidv4(),
      nombre: 'Yoga',
      horaInicio: '10:30',
      horaFin: '11:30',
      instructor: 'Javier Ortega',
      capacidad: 15,
      inscritos: 15,
      asistentes: [],
    },
    {
      id: uuidv4(),
      nombre: 'HIIT',
      horaInicio: '18:00',
      horaFin: '18:45',
      instructor: 'Marta López',
      capacidad: 12,
      inscritos: 9,
      asistentes: [],
    },
    {
      id: uuidv4(),
      nombre: 'Pilates',
      horaInicio: '19:30',
      horaFin: '20:30',
      instructor: 'Elena Vidal',
      capacidad: 10,
      inscritos: 6,
      asistentes: [],
    },
  ]);

  const [accessLogs, setAccessLogs] = useState<AccessLog[]>(() => []);

  const [attendanceClassId, setAttendanceClassId] = useState<string | null>(null);
  const [attendanceSearch, setAttendanceSearch] = useState('');

  const accessLogsToday = useMemo(
    () => accessLogs.filter(l => l.memberId && isSameCalendarDay(l.timestamp)),
    [accessLogs],
  );

  const stats = useMemo(
    () => ({
      sociosActivos: members.filter(m => m.estado === 'activo').length,
      clasesHoy: classes.length,
      accesosHoy: accessLogsToday.length,
    }),
    [members, classes, accessLogsToday],
  );

  const filteredMembers = useMemo(
    () =>
      members.filter(m => {
        const q = search.toLowerCase();
        if (
          search &&
          !m.nombre.toLowerCase().includes(q) &&
          !m.email.toLowerCase().includes(q) &&
          !m.tipoMembresia.toLowerCase().includes(q)
        ) {
          return false;
        }
        if (filterMember !== 'all' && m.estado !== filterMember) return false;
        return true;
      }),
    [members, search, filterMember],
  );

  const filteredClasses = useMemo(
    () =>
      classes.filter(c => {
        const q = search.toLowerCase();
        if (
          search &&
          !c.nombre.toLowerCase().includes(q) &&
          !c.instructor.toLowerCase().includes(q) &&
          !c.horaInicio.includes(q)
        ) {
          return false;
        }
        if (filterClass === 'hueco' && c.inscritos >= c.capacidad) return false;
        if (filterClass === 'completo' && c.inscritos < c.capacidad) return false;
        return true;
      }),
    [classes, search, filterClass],
  );

  const attendanceClass = attendanceClassId ? classes.find(c => c.id === attendanceClassId) : null;

  const membersForAttendance = useMemo(() => {
    if (!attendanceClass) return [];
    const taken = new Set(attendanceClass.asistentes.map(a => a.memberId));
    const q = attendanceSearch.toLowerCase();
    return members.filter(m => {
      if (taken.has(m.id)) return false;
      if (m.estado === 'inactivo') return false;
      if (q && !m.nombre.toLowerCase().includes(q) && !m.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [members, attendanceClass, attendanceSearch]);

  const checkInMember = (memberId: string) => {
    const now = new Date().toISOString();
    setMembers(prev => prev.map(m => (m.id === memberId ? { ...m, ultimoAcceso: now } : m)));
    setAccessLogs(prev => [...prev, { id: uuidv4(), memberId, timestamp: now }]);
  };

  const addClassAttendance = (classId: string, memberId: string) => {
    const now = new Date().toISOString();
    setClasses(prev =>
      prev.map(c => {
        if (c.id !== classId) return c;
        if (c.asistentes.some(a => a.memberId === memberId)) return c;
        return { ...c, asistentes: [...c.asistentes, { memberId, hora: now }] };
      }),
    );
    setAttendanceSearch('');
  };

  const removeClassAttendance = (classId: string, memberId: string) => {
    setClasses(prev =>
      prev.map(c =>
        c.id === classId ? { ...c, asistentes: c.asistentes.filter(a => a.memberId !== memberId) } : c,
      ),
    );
  };

  if (attendanceClass) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setAttendanceClassId(null);
                setAttendanceSearch('');
              }}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">Asistencia a clase</h1>
              <p className="text-xs text-gray-500 truncate">
                {attendanceClass.nombre} · {attendanceClass.horaInicio}–{attendanceClass.horaFin} ·{' '}
                {attendanceClass.instructor}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <UserCheck className="w-4 h-4" />
                Asistentes registrados ({attendanceClass.asistentes.length})
              </h3>
            </div>
            {attendanceClass.asistentes.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Aún no hay asistencias marcadas</p>
            ) : (
              <div className="space-y-1.5">
                {attendanceClass.asistentes.map(a => {
                  const m = members.find(x => x.id === a.memberId);
                  return (
                    <div
                      key={`${a.memberId}-${a.hora}`}
                      className="flex items-center justify-between gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    >
                      <div className="min-w-0">
                        <span className="text-sm text-gray-900 dark:text-gray-100">{m?.nombre ?? 'Socio'}</span>
                        <p className="text-[10px] text-gray-500">
                          {new Date(a.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeClassAttendance(attendanceClass.id, a.memberId)}
                        className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600"
                        aria-label="Quitar asistencia"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Añadir asistente
            </label>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={attendanceSearch}
                onChange={e => setAttendanceSearch(e.target.value)}
                placeholder="Buscar socio por nombre o email..."
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              {attendanceSearch && (
                <button
                  type="button"
                  onClick={() => setAttendanceSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
            <div className="space-y-2">
              {membersForAttendance.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No hay socios que coincidan</p>
              ) : (
                membersForAttendance.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => addClassAttendance(attendanceClass.id, m.id)}
                    className="w-full flex items-center justify-between p-3 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-900 dark:hover:border-gray-500 transition-all text-left active:scale-[0.99]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{m.nombre}</p>
                      <p className="text-xs text-gray-500">{m.tipoMembresia}</p>
                    </div>
                    <Plus className="w-5 h-5 text-gray-400" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/saas/worker')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
              <Dumbbell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Mi Puesto - Gimnasio</h1>
              <p className="text-xs text-gray-500">{workerName}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => {
              setTab('socios');
              setSearch('');
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === 'socios'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Users className="w-4 h-4" /> Socios
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('clases');
              setSearch('');
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              tab === 'clases'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <CalendarDays className="w-4 h-4" /> Clases
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            {
              label: 'Socios activos',
              value: stats.sociosActivos,
              color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
            },
            {
              label: 'Clases hoy',
              value: stats.clasesHoy,
              color: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800',
            },
            {
              label: 'Accesos hoy',
              value: stats.accesosHoy,
              color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
            },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border p-2.5 text-center ${s.color}`}>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {tab === 'socios' && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {(
              [
                { id: 'all' as const, label: 'Todos' },
                { id: 'activo' as const, label: 'Activos' },
                { id: 'prueba' as const, label: 'Prueba' },
                { id: 'inactivo' as const, label: 'Inactivos' },
              ] as const
            ).map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterMember(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filterMember === f.id
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'clases' && (
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {(
              [
                { id: 'all' as const, label: 'Todas' },
                { id: 'hueco' as const, label: 'Con plazas' },
                { id: 'completo' as const, label: 'Llenas' },
              ] as const
            ).map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterClass(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filterClass === f.id
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
            placeholder={
              tab === 'socios'
                ? 'Buscar nombre, email, tipo de membresía...'
                : 'Buscar clase, instructor, hora...'
            }
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === 'socios' ? (
          filteredMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Users className="w-10 h-10 mb-2" />
              <p className="text-sm font-medium">No hay socios en esta vista</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredMembers.map(m => (
                <MemberCard key={m.id} m={m} onCheckIn={checkInMember} />
              ))}
            </div>
          )
        ) : filteredClasses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <CalendarDays className="w-10 h-10 mb-2" />
            <p className="text-sm font-medium">No hay clases en esta vista</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredClasses.map(c => {
              const pct = Math.min(100, Math.round((c.inscritos / c.capacidad) * 100));
              return (
                <div
                  key={c.id}
                  className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-4 transition-all hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-gray-100">{c.nombre}</h3>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>
                          {c.horaInicio} – {c.horaFin}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {c.instructor}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttendanceClassId(c.id)}
                      className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90"
                    >
                      Asistencia
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="mb-1 flex justify-between text-xs font-medium text-gray-600 dark:text-gray-400">
                    <span>
                      Inscritos: {c.inscritos} / {c.capacidad}
                    </span>
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      Asistencia: {c.asistentes.length}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500 dark:bg-violet-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
