import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import {
  Gavel,
  Timer,
  ArrowRight,
  AlertTriangle,
  Receipt,
  Archive,
  Briefcase,
} from 'lucide-react';

/** Fechas relativas al día de hoy (solo UI mock). */
function dayOffset(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type DeadlineRow = {
  id: string;
  caso: string;
  titulo: string;
  responsable: string;
  fechaLimite: string;
  prioridad: 'alta' | 'media' | 'baja';
  estado: string;
};

type HearingRow = {
  id: string;
  caso: string;
  cliente: string;
  juzgado: string;
  sala: string;
  tipo: string;
  fecha: string;
  hora: string;
};

const MOCK_DEADLINES: DeadlineRow[] = [
  {
    id: 'mock-dead-1',
    caso: 'EXP-2026/0142',
    titulo: 'Escrito de conclusiones',
    responsable: 'Lcda. Ana Beltrán',
    fechaLimite: dayOffset(-2),
    prioridad: 'alta',
    estado: 'vencido',
  },
  {
    id: 'mock-dead-2',
    caso: 'EXP-2026/0110',
    titulo: 'Demanda de reclamación de cantidad',
    responsable: 'Lcdo. Javier Ramos',
    fechaLimite: dayOffset(0),
    prioridad: 'alta',
    estado: 'pendiente',
  },
  {
    id: 'mock-dead-3',
    caso: 'EXP-2026/0098',
    titulo: 'Recurso de reposición',
    responsable: 'Lcdo. Carlos Mendoza',
    fechaLimite: dayOffset(3),
    prioridad: 'alta',
    estado: 'pendiente',
  },
  {
    id: 'mock-dead-4',
    caso: 'EXP-2025/0881',
    titulo: 'Aportación de prueba documental',
    responsable: 'Lcda. Patricia Solís',
    fechaLimite: dayOffset(9),
    prioridad: 'media',
    estado: 'pendiente',
  },
  {
    id: 'mock-dead-5',
    caso: 'EXP-2026/0142',
    titulo: 'Control de caducidad',
    responsable: 'Lcda. Ana Beltrán',
    fechaLimite: dayOffset(21),
    prioridad: 'baja',
    estado: 'pendiente',
  },
];

const MOCK_HEARINGS: HearingRow[] = [
  {
    id: 'mock-hear-1',
    caso: 'EXP-2026/0142',
    cliente: 'Marina López',
    juzgado: 'Juzgado de lo Social nº5',
    sala: 'Sala 2',
    tipo: 'Vista oral',
    fecha: dayOffset(0),
    hora: '10:30',
  },
  {
    id: 'mock-hear-2',
    caso: 'EXP-2026/0098',
    cliente: 'Grupo Norte SL',
    juzgado: 'Juzgado Mercantil nº1',
    sala: 'Mediación A',
    tipo: 'Conciliación',
    fecha: dayOffset(2),
    hora: '12:00',
  },
  {
    id: 'mock-hear-3',
    caso: 'EXP-2025/0881',
    cliente: 'Andrés Molina',
    juzgado: 'Juzgado Penal nº2',
    sala: 'Sala 1',
    tipo: 'Declaración',
    fecha: dayOffset(8),
    hora: '09:15',
  },
  {
    id: 'mock-hear-4',
    caso: 'EXP-2026/0110',
    cliente: 'Elena Vargas',
    juzgado: 'Juzgado 1ª Instancia nº3',
    sala: 'Mediación B',
    tipo: 'Mediación',
    fecha: dayOffset(12),
    hora: '11:45',
  },
];

const PRIORIDAD_CLS: Record<string, string> = {
  alta: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  media: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  baja: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
};

const BTN_PRIMARY =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--v-blue,#2563eb)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1d4ed8] disabled:opacity-50 shadow-sm shadow-blue-600/20';

const BTN_SECONDARY =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-blue-50/60 hover:border-blue-200 hover:text-[var(--v-blue,#2563eb)] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-blue-950/40';

/**
 * Hub Gestión (abogados): mock estático, sin fetch ni estado loading.
 * Así no puede quedarse en «Cargando…».
 */
export function LawyerGestion() {
  const navigate = useNavigate();

  return (
    <Layout title="Gestión" subtitle="Plazos y vistas del despacho">
      <div
        data-testid="lawyer-gestion-mock"
        className="mb-4 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300"
      >
        Mock listo · 5 plazos y 4 vistas de ejemplo (sin cargar API)
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <section className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Timer className="w-5 h-5 text-rose-600" />
                Plazos
                <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                  ejemplo
                </span>
              </p>
              <p className="text-sm text-stone-500 mt-1">Control estricto de vencimientos procesales.</p>
            </div>
            <button
              type="button"
              className={BTN_PRIMARY}
              onClick={() => navigate('/saas/lawyer-deadlines')}
            >
              Abrir
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <ul className="space-y-2">
            {MOCK_DEADLINES.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => navigate('/saas/lawyer-deadlines')}
                  className="w-full text-left rounded-xl border border-stone-100 dark:border-stone-800 px-3 py-2.5 hover:border-rose-200 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
                        {d.caso} · {d.titulo}
                      </p>
                      <p className="text-xs text-stone-500 mt-0.5 truncate">{d.responsable}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-rose-600 shrink-0 text-sm font-medium">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {d.fechaLimite}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${
                        PRIORIDAD_CLS[d.prioridad]
                      }`}
                    >
                      {d.prioridad}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                      {d.estado}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <Gavel className="w-5 h-5 text-blue-600" />
                Vistas
                <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                  ejemplo
                </span>
              </p>
              <p className="text-sm text-stone-500 mt-1">Audiencias y señalamientos del despacho.</p>
            </div>
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => navigate('/saas/lawyer-hearings')}
            >
              Abrir
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <ul className="space-y-2">
            {MOCK_HEARINGS.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => navigate('/saas/lawyer-hearings')}
                  className="w-full text-left rounded-xl border border-stone-100 dark:border-stone-800 px-3 py-2.5 hover:border-blue-200 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-800 dark:text-stone-200 truncate">
                        {h.caso} · {h.cliente}
                      </p>
                      <p className="text-xs text-stone-500 mt-0.5 truncate">
                        {[h.juzgado, h.sala, h.tipo].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="text-stone-600 dark:text-stone-300 shrink-0 text-sm font-medium tabular-nums">
                      {h.fecha} {h.hora}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          className={`${BTN_SECONDARY} text-sm`}
          onClick={() => navigate('/saas/lawyer-billing')}
        >
          <Receipt className="w-4 h-4" />
          Facturación
        </button>
        <button
          type="button"
          className={`${BTN_SECONDARY} text-sm`}
          onClick={() => navigate('/saas/lawyer-archivo')}
        >
          <Archive className="w-4 h-4" />
          Archivo
        </button>
        <button
          type="button"
          className={`${BTN_SECONDARY} text-sm`}
          onClick={() => navigate('/saas/lawyer-cases')}
        >
          <Briefcase className="w-4 h-4" />
          Expedientes
        </button>
      </div>

      <p className="text-sm text-stone-500 dark:text-stone-400">
        Siguiente etapa: cuando el expediente avance a cobro, usa <strong>Facturación</strong>. Al cerrar el caso, pasa a{' '}
        <strong>Archivo</strong>.
      </p>
    </Layout>
  );
}
