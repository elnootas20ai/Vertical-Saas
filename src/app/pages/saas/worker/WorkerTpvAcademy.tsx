import { useMemo, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../../context/AuthContext';
import {
  GraduationCap,
  BookOpen,
  Users,
  Clock,
  ArrowLeft,
  Check,
  Search,
  X,
  Play,
  Square,
  MapPin,
  ClipboardList,
  Filter,
} from 'lucide-react';

type ClassStatus = 'programada' | 'en_curso' | 'finalizada';

interface AcademyStudentRow {
  id: string;
  name: string;
  /** true = presente, false = ausente */
  present: boolean;
}

interface AcademyClassSession {
  id: string;
  subject: string;
  startTime: string;
  endTime: string;
  room: string;
  studentCount: number;
  status: ClassStatus;
  students: AcademyStudentRow[];
}

const STATUS_CONFIG: Record<
  ClassStatus,
  { label: string; color: string; bg: string }
> = {
  programada: {
    label: 'Programada',
    color: 'text-amber-800 dark:text-amber-200',
    bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
  },
  en_curso: {
    label: 'En curso',
    color: 'text-blue-800 dark:text-blue-200',
    bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
  },
  finalizada: {
    label: 'Finalizada',
    color: 'text-emerald-800 dark:text-emerald-200',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
  },
};

function mkStudents(names: string[], presents: boolean[]): AcademyStudentRow[] {
  return names.map((name, i) => ({
    id: uuidv4(),
    name,
    present: presents[i] ?? false,
  }));
}

function initialClasses(): AcademyClassSession[] {
  return [
    {
      id: uuidv4(),
      subject: 'Matemáticas I',
      startTime: '09:00',
      endTime: '10:30',
      room: 'A-12',
      studentCount: 3,
      status: 'finalizada',
      students: mkStudents(['Ana García', 'Luis Pérez', 'María López'], [true, true, false]),
    },
    {
      id: uuidv4(),
      subject: 'Física aplicada',
      startTime: '11:00',
      endTime: '12:30',
      room: 'Lab-2',
      studentCount: 4,
      status: 'en_curso',
      students: mkStudents(
        ['Carlos Ruiz', 'Elena Soto', 'Jorge Núñez', 'Paula Vega'],
        [true, false, true, true],
      ),
    },
    {
      id: uuidv4(),
      subject: 'Inglés B2',
      startTime: '16:00',
      endTime: '17:30',
      room: 'B-04',
      studentCount: 5,
      status: 'programada',
      students: mkStudents(
        ['Diego Mora', 'Irene Castro', 'Natalia Gil', 'Óscar León', 'Sara Vidal'],
        [false, false, false, false, false],
      ),
    },
  ];
}

function syncStudentCount(c: AcademyClassSession): AcademyClassSession {
  return { ...c, studentCount: c.students.length };
}

const ACADEMY_SEED_LIST = initialClasses();
const ACADEMY_SEED_SELECTED_ID = ACADEMY_SEED_LIST[0]?.id ?? null;

export function WorkerTpvAcademy() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'clases' | 'asistencia'>('clases');
  const [classes, setClasses] = useState<AcademyClassSession[]>(() =>
    ACADEMY_SEED_LIST.map(c => ({ ...c, students: c.students.map(s => ({ ...s })) })),
  );
  const [selectedClassId, setSelectedClassId] = useState<string | null>(ACADEMY_SEED_SELECTED_ID);
  const [searchClases, setSearchClases] = useState('');
  const [searchAsistencia, setSearchAsistencia] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todas' | ClassStatus>('todas');

  const staffName = user?.firstName
    ? `${user.firstName} ${user?.lastName || ''}`.trim()
    : 'Profesorado';

  const stats = useMemo(() => {
    const totalStudents = classes.reduce((s, c) => s + c.students.length, 0);
    const allStudents = classes.flatMap(c => c.students);
    const present = allStudents.filter(st => st.present).length;
    const pct = totalStudents > 0 ? Math.round((present / totalStudents) * 100) : 0;
    return {
      clasesHoy: classes.length,
      alumnosTotales: totalStudents,
      asistenciaMedia: pct,
    };
  }, [classes]);

  const filteredClases = useMemo(() => {
    return classes
      .filter(c => {
        if (statusFilter === 'todas') return true;
        return c.status === statusFilter;
      })
      .filter(c => {
        if (!searchClases.trim()) return true;
        const q = searchClases.toLowerCase();
        return (
          c.subject.toLowerCase().includes(q) ||
          c.room.toLowerCase().includes(q) ||
          c.startTime.includes(q)
        );
      })
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [classes, searchClases, statusFilter]);

  const selectedClass = classes.find(c => c.id === selectedClassId) ?? null;

  const filteredStudents = useMemo(() => {
    if (!selectedClass) return [];
    if (!searchAsistencia.trim()) return selectedClass.students;
    const q = searchAsistencia.toLowerCase();
    return selectedClass.students.filter(s => s.name.toLowerCase().includes(q));
  }, [selectedClass, searchAsistencia]);

  const updateClass = useCallback((id: string, patch: Partial<AcademyClassSession>) => {
    setClasses(prev => prev.map(c => (c.id === id ? syncStudentCount({ ...c, ...patch }) : c)));
  }, []);

  const startClass = (id: string) => {
    const c = classes.find(x => x.id === id);
    if (!c || c.status !== 'programada') return;
    updateClass(id, { status: 'en_curso' });
    toast.success('Clase iniciada');
  };

  const endClass = (id: string) => {
    const c = classes.find(x => x.id === id);
    if (!c || c.status !== 'en_curso') return;
    updateClass(id, { status: 'finalizada' });
    toast.success('Clase finalizada');
  };

  const toggleAttendance = (classId: string, studentId: string) => {
    setClasses(prev =>
      prev.map(c => {
        if (c.id !== classId) return c;
        const students = c.students.map(s =>
          s.id === studentId ? { ...s, present: !s.present } : s,
        );
        return syncStudentCount({ ...c, students });
      }),
    );
  };

  const goToAttendance = (classId: string) => {
    setSelectedClassId(classId);
    setTab('asistencia');
    setSearchAsistencia('');
  };

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
            <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-xl flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                Mi Puesto - Academia
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{staffName}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            {
              label: 'Clases hoy',
              value: stats.clasesHoy,
              color:
                'bg-violet-50 dark:bg-violet-950/30 text-violet-800 dark:text-violet-200 border-violet-200 dark:border-violet-800',
              icon: BookOpen,
            },
            {
              label: 'Alumnos totales',
              value: stats.alumnosTotales,
              color:
                'bg-sky-50 dark:bg-sky-950/30 text-sky-800 dark:text-sky-200 border-sky-200 dark:border-sky-800',
              icon: Users,
            },
            {
              label: 'Asistencia media',
              value: `${stats.asistenciaMedia}%`,
              color:
                'bg-teal-50 dark:bg-teal-950/30 text-teal-800 dark:text-teal-200 border-teal-200 dark:border-teal-800',
              icon: ClipboardList,
            },
          ].map(s => (
            <div
              key={s.label}
              className={`rounded-2xl border-2 p-2.5 text-center ${s.color}`}
            >
              <s.icon className="w-4 h-4 mx-auto mb-1 opacity-80" />
              <p className="text-lg font-bold tabular-nums">{s.value}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 mb-3">
          {(
            [
              { id: 'clases' as const, label: 'Mis Clases', icon: BookOpen },
              { id: 'asistencia' as const, label: 'Asistencia', icon: Check },
            ] as const
          ).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all ${
                tab === t.id
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-md border-2 border-gray-200 dark:border-gray-600'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'clases' && (
          <>
            <div className="flex flex-wrap gap-1.5 mb-2 items-center">
              <span className="text-[10px] font-bold uppercase text-gray-400 flex items-center gap-1 mr-1">
                <Filter className="w-3 h-3" /> Estado
              </span>
              {(
                [
                  { id: 'todas' as const, label: 'Todas' },
                  { id: 'programada' as const, label: 'Programada' },
                  { id: 'en_curso' as const, label: 'En curso' },
                  { id: 'finalizada' as const, label: 'Finalizada' },
                ] as const
              ).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border-2 ${
                    statusFilter === f.id
                      ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-md'
                      : 'bg-gray-50 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchClases}
                onChange={e => setSearchClases(e.target.value)}
                placeholder="Buscar asignatura, aula, hora..."
                className="w-full pl-9 pr-8 py-2 rounded-2xl border-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
              />
              {searchClases && (
                <button
                  type="button"
                  onClick={() => setSearchClases('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
          </>
        )}

        {tab === 'asistencia' && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchAsistencia}
              onChange={e => setSearchAsistencia(e.target.value)}
              placeholder="Buscar alumno por nombre..."
              className="w-full pl-9 pr-8 py-2 rounded-2xl border-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
            />
            {searchAsistencia && (
              <button
                type="button"
                onClick={() => setSearchAsistencia('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === 'clases' && (
          <div className="space-y-3">
            {filteredClases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <BookOpen className="w-10 h-10 mb-2" />
                <p className="text-sm font-medium">No hay clases en esta vista</p>
              </div>
            ) : (
              filteredClases.map(c => {
                const cfg = STATUS_CONFIG[c.status];
                return (
                  <div
                    key={c.id}
                    className={`rounded-2xl border-2 p-4 transition-all ${cfg.bg}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-bold text-gray-900 dark:text-gray-100">{c.subject}</h2>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${cfg.bg} ${cfg.color}`}
                          >
                            {cfg.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-600 dark:text-gray-300">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {c.startTime} – {c.endTime}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {c.room}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {c.studentCount} alumnos
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {c.status === 'programada' && (
                        <button
                          type="button"
                          onClick={() => startClass(c.id)}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-md border-2 border-blue-700/30"
                        >
                          <Play className="w-4 h-4" />
                          Iniciar clase
                        </button>
                      )}
                      {c.status === 'en_curso' && (
                        <button
                          type="button"
                          onClick={() => endClass(c.id)}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-md border-2 border-emerald-700/30"
                        >
                          <Square className="w-4 h-4" />
                          Finalizar clase
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => goToAttendance(c.id)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-gray-900/60 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-900"
                      >
                        <Check className="w-4 h-4" />
                        Asistencia
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'asistencia' && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                Clase seleccionada
              </p>
              <div className="flex flex-wrap gap-2">
                {classes
                  .slice()
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map(c => {
                    const active = c.id === selectedClassId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedClassId(c.id)}
                        className={`px-3 py-2 rounded-2xl border-2 text-left text-sm font-medium transition-all max-w-full ${
                          active
                            ? 'bg-violet-600 text-white border-violet-700 shadow-md'
                            : 'bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:border-violet-300'
                        }`}
                      >
                        <span className="block truncate">{c.subject}</span>
                        <span
                          className={`block text-[10px] mt-0.5 ${active ? 'text-violet-100' : 'text-gray-500'}`}
                        >
                          {c.startTime} · {c.room}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>

            {!selectedClass ? (
              <p className="text-sm text-gray-500 text-center py-12">Selecciona una clase.</p>
            ) : (
              <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <h3 className="font-bold text-gray-900 dark:text-gray-100">{selectedClass.subject}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {selectedClass.startTime} – {selectedClass.endTime} · {selectedClass.room}
                  </p>
                </div>
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredStudents.length === 0 ? (
                    <li className="px-4 py-8 text-center text-sm text-gray-500">
                      Ningún alumno coincide con la búsqueda.
                    </li>
                  ) : (
                    filteredStudents.map(s => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                      >
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {s.name}
                        </span>
                        <label className="flex items-center gap-3 shrink-0 cursor-pointer select-none">
                          <span className="text-xs text-gray-500 dark:text-gray-400 w-16 text-right">
                            {s.present ? 'Presente' : 'Ausente'}
                          </span>
                          <input
                            type="checkbox"
                            checked={s.present}
                            onChange={() => toggleAttendance(selectedClass.id, s.id)}
                            className="w-6 h-6 shrink-0 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-emerald-600 focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 cursor-pointer accent-emerald-600"
                            aria-label={`Presente: ${s.name}`}
                          />
                        </label>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
