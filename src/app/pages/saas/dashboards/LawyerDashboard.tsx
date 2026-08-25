import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../../components/saas/Layout';
import {
  Briefcase,
  Gavel,
  LayoutDashboard,
  Clock,
  FolderPlus,
  CalendarClock,
  Receipt,
  Loader2,
  Scale,
  Banknote,
  Users,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../../lib/verticalApiFactory';
import {
  buildLawyerDemoBundle,
  isLawyerDemoViewer,
  withLawyerDemoList,
} from '../../../lib/lawyerOpsDemo';
import { formatMoneyEs, formatNumberEs } from '../../../lib/formatNumberEs';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../../lib/vertialUiTokens';

type LawyerDashboardProps = {
  onSelectGeneral?: () => void;
};

interface Case extends VerticalEntity {
  expediente: string;
  cliente: string;
  estado: string;
  abogado?: string;
  tipo?: string;
  urgencia?: string;
}

interface Hearing extends VerticalEntity {
  caso: string;
  cliente: string;
  fecha: string;
  hora: string;
  estado: string;
  juzgado?: string;
}

interface Invoice extends VerticalEntity {
  numero?: string;
  cliente: string;
  caso: string;
  importe: number;
  estado: string;
  concepto?: string;
  horas?: number;
}

interface Client extends VerticalEntity {
  nombre: string;
}

type LawyerRow = {
  name: string;
  expedientesActivos: number;
  expedientesTotal: number;
  facturado: number;
  pendiente: number;
  horas: number;
};

function KpiCard({
  icon: Icon,
  iconClass,
  value,
  label,
  sub,
}: {
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
  value: string;
  label: string;
  sub?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${iconClass}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{label}</p>
      {sub ? <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p> : null}
    </div>
  );
}

const ACTIVE_CASE = new Set(['abierto', 'en_tramite', 'vista_oral']);
const PENDING_INV = new Set(['enviada', 'impagada']);

export function LawyerDashboard({ onSelectGeneral }: LawyerDashboardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';

  const casesApi = useMemo(() => createVerticalApi<Case>('lawyer', 'cases'), []);
  const hearingsApi = useMemo(() => createVerticalApi<Hearing>('lawyer', 'hearings'), []);
  const billingApi = useMemo(() => createVerticalApi<Invoice>('lawyer', 'billing'), []);
  const clientsApi = useMemo(() => createVerticalApi<Client>('lawyer', 'clients'), []);

  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<Case[]>([]);
  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [activityScope, setActivityScope] = useState<'todos' | 'hoy'>('todos');

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const demo = isLawyerDemoViewer(user?.email) ? buildLawyerDemoBundle(userId) : null;
      const [c, h, b, cl] = await Promise.all([
        casesApi.list(userId),
        hearingsApi.list(userId),
        billingApi.list(userId),
        clientsApi.list(userId),
      ]);
      const casesOut = withLawyerDemoList(c, (demo?.cases || []) as Case[], user?.email);
      const hearingsOut = withLawyerDemoList(h, (demo?.hearings || []) as Hearing[], user?.email);
      const invoicesOut = withLawyerDemoList(b, (demo?.invoices || []) as Invoice[], user?.email);
      const clientsOut = withLawyerDemoList(
        cl,
        demo
          ? (demo.cases
              .map((x) => x.cliente)
              .filter((name, i, arr) => name && arr.indexOf(name) === i)
              .map((nombre, i) => ({
                _id: `demo-law-client-${i + 1}`,
                type: 'law_client',
                user_id: userId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                nombre,
              })) as Client[])
          : [],
        user?.email,
      );
      setCases(casesOut);
      setHearings(hearingsOut);
      setInvoices(invoicesOut);
      setClients(clientsOut);
    } finally {
      setLoading(false);
    }
  }, [userId, user?.email, casesApi, hearingsApi, billingApi, clientsApi]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const caseByExp = useMemo(() => {
    const map = new Map<string, Case>();
    for (const c of cases) {
      if (c.expediente) map.set(c.expediente, c);
    }
    return map;
  }, [cases]);

  const lawyers = useMemo((): LawyerRow[] => {
    const byName = new Map<string, LawyerRow>();
    const ensure = (name: string) => {
      const key = name.trim() || 'Sin asignar';
      let row = byName.get(key);
      if (!row) {
        row = {
          name: key,
          expedientesActivos: 0,
          expedientesTotal: 0,
          facturado: 0,
          pendiente: 0,
          horas: 0,
        };
        byName.set(key, row);
      }
      return row;
    };

    for (const c of cases) {
      const row = ensure(c.abogado || 'Sin asignar');
      row.expedientesTotal += 1;
      if (ACTIVE_CASE.has(c.estado)) row.expedientesActivos += 1;
    }

    for (const inv of invoices) {
      const linked = caseByExp.get(inv.caso);
      const row = ensure(linked?.abogado || 'Sin asignar');
      const amount = Number(inv.importe) || 0;
      const hours = Number(inv.horas) || 0;
      row.horas += hours;
      if (inv.estado === 'cobrada') row.facturado += amount;
      else if (PENDING_INV.has(inv.estado)) row.pendiente += amount;
      else row.facturado += amount;
    }

    return Array.from(byName.values()).sort(
      (a, b) => b.expedientesActivos - a.expedientesActivos || b.facturado + b.pendiente - (a.facturado + a.pendiente),
    );
  }, [cases, invoices, caseByExp]);

  const kpis = useMemo(() => {
    const activos = cases.filter((c) => ACTIVE_CASE.has(c.estado)).length;
    const vistasProx = hearings.filter((h) => h.estado === 'programada' || h.estado === 'aplazada').length;
    const pendienteEuro = invoices
      .filter((i) => PENDING_INV.has(i.estado))
      .reduce((s, i) => s + (Number(i.importe) || 0), 0);
    const cobradoEuro = invoices
      .filter((i) => i.estado === 'cobrada')
      .reduce((s, i) => s + (Number(i.importe) || 0), 0);
    const facturadoEuro = invoices.reduce((s, i) => s + (Number(i.importe) || 0), 0);
    return {
      activos,
      vistasProx,
      pendienteEuro,
      cobradoEuro,
      facturadoEuro,
      clients: clients.length || new Set(cases.map((c) => c.cliente).filter(Boolean)).size,
      lawyers: lawyers.filter((l) => l.name !== 'Sin asignar').length,
    };
  }, [cases, hearings, invoices, clients, lawyers]);

  const activities = useMemo(() => {
    const items: Array<{ id: string; text: string; time: string; today: boolean; sort: number }> = [];
    for (const inv of invoices) {
      const t = Date.parse(inv.updatedAt || inv.createdAt || '') || 0;
      const d = new Date(t || Date.now());
      items.push({
        id: inv._id,
        text: `${inv.numero || 'Factura'} · ${inv.cliente} · ${formatMoneyEs(inv.importe)} (${inv.estado})`,
        time: d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }),
        today: d.toDateString() === new Date().toDateString(),
        sort: t,
      });
    }
    for (const h of hearings) {
      const t = Date.parse(`${h.fecha}T${h.hora || '12:00'}`) || 0;
      const d = new Date(t || Date.now());
      items.push({
        id: h._id,
        text: `Vista · ${h.caso} · ${h.cliente}${h.juzgado ? ` · ${h.juzgado}` : ''}`,
        time: `${h.fecha}${h.hora ? ` ${h.hora}` : ''}`,
        today: h.fecha === new Date().toISOString().slice(0, 10),
        sort: t,
      });
    }
    for (const c of cases.slice(0, 8)) {
      const t = Date.parse(c.updatedAt || c.createdAt || '') || 0;
      const d = new Date(t || Date.now());
      items.push({
        id: c._id,
        text: `Expediente ${c.expediente} · ${c.cliente}${c.abogado ? ` · ${c.abogado}` : ''}`,
        time: d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }),
        today: d.toDateString() === new Date().toDateString(),
        sort: t,
      });
    }
    items.sort((a, b) => b.sort - a.sort);
    const scoped = activityScope === 'hoy' ? items.filter((x) => x.today) : items;
    return scoped.slice(0, 10);
  }, [invoices, hearings, cases, activityScope]);

  return (
    <Layout title="Dashboard">
      <div className="pb-8 relative">
        {loading ? (
          <div className="flex justify-center items-center py-16 mb-6" aria-busy="true">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
          </div>
        ) : null}

        <div className="flex justify-end items-center gap-2 mb-6 flex-wrap">
          {onSelectGeneral ? (
            <button
              type="button"
              onClick={onSelectGeneral}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm font-semibold text-gray-800 dark:text-gray-100 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              Vista general
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard
            icon={Briefcase}
            iconClass="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
            value={formatNumberEs(kpis.activos, { maxFraction: 0 })}
            label="Expedientes activos"
            sub={`${formatNumberEs(cases.length, { maxFraction: 0 })} en total`}
          />
          <KpiCard
            icon={Scale}
            iconClass="bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200"
            value={formatNumberEs(kpis.lawyers, { maxFraction: 0 })}
            label="Abogados del despacho"
          />
          <KpiCard
            icon={Banknote}
            iconClass="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
            value={formatMoneyEs(kpis.pendienteEuro)}
            label="Honorarios por cobrar"
            sub={`Emitido ${formatMoneyEs(kpis.facturadoEuro)}`}
          />
          <KpiCard
            icon={Gavel}
            iconClass="bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
            value={formatNumberEs(kpis.vistasProx, { maxFraction: 0 })}
            label="Vistas programadas"
            sub={`${formatNumberEs(kpis.clients, { maxFraction: 0 })} clientes`}
          />
        </div>

        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            Acciones rápidas
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate('/saas/lawyer-cases')}
              className={`${VERTIAL_BTN_PRIMARY} inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5`}
            >
              <FolderPlus className="w-4 h-4" />
              Nuevo expediente
            </button>
            <button
              type="button"
              onClick={() => navigate('/saas/lawyer-gestion')}
              className={`${VERTIAL_BTN_SECONDARY} inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5`}
            >
              <CalendarClock className="w-4 h-4" />
              Ir a gestión
            </button>
            <button
              type="button"
              onClick={() => navigate('/saas/lawyer-billing')}
              className={`${VERTIAL_BTN_SECONDARY} inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5`}
            >
              <Receipt className="w-4 h-4" />
              Facturación
            </button>
            <button
              type="button"
              onClick={() => navigate('/saas/crm/clientes?tab=clients')}
              className={`${VERTIAL_BTN_SECONDARY} inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5`}
            >
              <Users className="w-4 h-4" />
              Clientes
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Abogados del despacho
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Carga de expedientes y honorarios por letrado
                </p>
              </div>
            </div>
            {lawyers.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">Sin abogados asignados en expedientes.</p>
            ) : (
              <ul className="space-y-2">
                {lawyers.map((row) => (
                  <li
                    key={row.name}
                    className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {row.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {formatNumberEs(row.expedientesActivos, { maxFraction: 0 })} activos
                          {' · '}
                          {formatNumberEs(row.expedientesTotal, { maxFraction: 0 })} expedientes
                          {row.horas > 0
                            ? ` · ${formatNumberEs(row.horas, { maxFraction: 0 })} h`
                            : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {formatMoneyEs(row.facturado)}
                        </p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 tabular-nums">
                          por cobrar {formatMoneyEs(row.pendiente)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Facturación del despacho
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Honorarios emitidos, cobrados y pendientes
            </p>
            <ul className="space-y-3 mb-4">
              <li className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-600 dark:text-gray-300">Total emitido</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                  {formatMoneyEs(kpis.facturadoEuro)}
                </span>
              </li>
              <li className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-600 dark:text-gray-300">Cobrado</span>
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {formatMoneyEs(kpis.cobradoEuro)}
                </span>
              </li>
              <li className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <span className="text-sm text-gray-600 dark:text-gray-300">Por cobrar</span>
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400 tabular-nums">
                  {formatMoneyEs(kpis.pendienteEuro)}
                </span>
              </li>
              <li className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-600 dark:text-gray-300">Facturas</span>
                <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                  {formatNumberEs(invoices.length, { maxFraction: 0 })}
                </span>
              </li>
            </ul>
            <button
              type="button"
              onClick={() => navigate('/saas/lawyer-billing')}
              className={`${VERTIAL_BTN_SECONDARY} w-full text-sm`}
            >
              Ver facturación
            </button>
          </section>
        </div>

        <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Actividad reciente</h2>
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 p-0.5 bg-gray-50 dark:bg-gray-900/50">
              <button
                type="button"
                onClick={() => setActivityScope('todos')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activityScope === 'todos'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setActivityScope('hoy')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activityScope === 'hoy'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                Hoy
              </button>
            </div>
          </div>
          <ul className="space-y-3">
            {activities.length === 0 ? (
              <li className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                Sin actividad reciente
              </li>
            ) : (
              activities.map((item) => (
                <li
                  key={item.id}
                  className="flex gap-3 rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 px-3 py-3"
                >
                  <Clock className="w-4 h-4 shrink-0 text-gray-400 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 dark:text-gray-200">{item.text}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{item.time}</p>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </Layout>
  );
}
