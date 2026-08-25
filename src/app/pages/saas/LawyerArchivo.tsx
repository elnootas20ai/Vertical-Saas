import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Archive, FolderOpen, Loader2, Search, ShieldCheck, ArrowRight,
  Filter, Clock, AlertTriangle, CheckCircle2, Scale,
} from 'lucide-react';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import {
  buildLawyerDemoBundle,
  isLawyerDemoId,
  isLawyerDemoViewer,
} from '../../lib/lawyerOpsDemo';

type CaseStatus = 'abierto' | 'en_tramite' | 'vista_oral' | 'cerrado' | 'archivado';

interface Case extends VerticalEntity {
  expediente: string;
  tipo: string;
  cliente: string;
  fechaApertura: string;
  estado: CaseStatus;
  abogado: string;
  juzgado: string;
  fechaCierre?: string;
  resultado?: string;
  retencionAnios?: number;
  revisionRgpd?: string;
  notas?: string;
}

const TYPE_LABELS: Record<string, string> = {
  civil: 'Civil',
  penal: 'Penal',
  laboral: 'Laboral',
  mercantil: 'Mercantil',
  administrativo: 'Administrativo',
  familia: 'Familia',
};

const RETENTION_BY_TYPE: Record<string, number> = {
  civil: 5,
  laboral: 5,
  familia: 5,
  mercantil: 6,
  administrativo: 10,
  penal: 10,
};

function todayIso() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function retentionYears(c: Case): number {
  return c.retencionAnios || RETENTION_BY_TYPE[c.tipo] || 5;
}

function rgpdStatus(c: Case): 'ok' | 'proxima' | 'vencida' {
  const rev = c.revisionRgpd;
  if (!rev) return 'ok';
  const today = todayIso();
  if (rev < today) return 'vencida';
  const in90 = new Date();
  in90.setDate(in90.getDate() + 90);
  const y = in90.getFullYear();
  const m = String(in90.getMonth() + 1).padStart(2, '0');
  const day = String(in90.getDate()).padStart(2, '0');
  if (rev <= `${y}-${m}-${day}`) return 'proxima';
  return 'ok';
}

export function LawyerArchivo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const api = useMemo(() => createVerticalApi<Case>('lawyer', 'cases'), []);
  const userId = user?.user_id || user?.id || '';
  const demoMode = isLawyerDemoViewer(user?.email);

  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<'cerrado' | 'archivado' | ''>('');
  const [filterTipo, setFilterTipo] = useState('');

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      let merged: Case[];
      if (demoMode) {
        const demo = buildLawyerDemoBundle(userId).cases as Case[];
        const byId = new Map<string, Case>();
        for (const c of demo) byId.set(c._id, c);
        for (const c of list) {
          if (!isLawyerDemoId(c._id)) byId.set(c._id, c);
        }
        merged = [...byId.values()];
      } else {
        merged = list;
      }
      setCases(merged.filter((c) => c.estado === 'cerrado' || c.estado === 'archivado'));
    } finally {
      setLoading(false);
    }
  }, [userId, demoMode, api]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return cases.filter((c) => {
      const matchSearch =
        !q ||
        c.expediente.toLowerCase().includes(q) ||
        c.cliente.toLowerCase().includes(q) ||
        (c.abogado || '').toLowerCase().includes(q) ||
        (c.resultado || '').toLowerCase().includes(q);
      const matchEstado = !filterEstado || c.estado === filterEstado;
      const matchTipo = !filterTipo || c.tipo === filterTipo;
      return matchSearch && matchEstado && matchTipo;
    });
  }, [cases, search, filterEstado, filterTipo]);

  const stats = useMemo(() => {
    const cerrados = cases.filter((c) => c.estado === 'cerrado').length;
    const archivados = cases.filter((c) => c.estado === 'archivado').length;
    const rgpdVencida = cases.filter((c) => rgpdStatus(c) === 'vencida').length;
    const rgpdProxima = cases.filter((c) => rgpdStatus(c) === 'proxima').length;
    return { total: cases.length, cerrados, archivados, rgpdVencida, rgpdProxima };
  }, [cases]);

  const retentionPolicies = useMemo(
    () => [
      { tipo: 'Civil / Familia / Laboral', anios: 5 },
      { tipo: 'Mercantil', anios: 6 },
      { tipo: 'Penal / Administrativo', anios: 10 },
    ],
    [],
  );

  return (
    <Layout title="Archivo" subtitle="Expedientes cerrados · conservación y RGPD">
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-2xl p-4 mb-6 flex gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-sm text-stone-700 dark:text-stone-300">
          <p className="font-semibold text-stone-900 dark:text-stone-100">Conservación legal</p>
          <p className="mt-1">
            Los expedientes cerrados se mantienen aquí para cumplir plazos de conservación.
            La revisión RGPD marca cuándo valorar borrado o anonimización.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'En archivo', value: stats.total, icon: Archive, color: 'text-stone-600' },
          { label: 'Cerrados', value: stats.cerrados, icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Archivados', value: stats.archivados, icon: FolderOpen, color: 'text-cyan-600' },
          {
            label: 'RGPD a revisar',
            value: stats.rgpdVencida + stats.rgpdProxima,
            icon: AlertTriangle,
            color: 'text-amber-600',
          },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-stone-900 rounded-2xl p-5 border border-stone-200 dark:border-stone-800">
            <div className="flex items-center gap-3 mb-2">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <span className="text-sm text-stone-500 dark:text-stone-400">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-stone-900 dark:text-stone-100">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
          <p className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2 mb-3">
            <Scale className="w-5 h-5 text-blue-600" />
            Política de retención (orientativa)
          </p>
          <ul className="space-y-2">
            {retentionPolicies.map((p) => (
              <li
                key={p.tipo}
                className="flex items-center justify-between gap-3 text-sm border border-stone-100 dark:border-stone-800 rounded-xl px-3 py-2"
              >
                <span className="text-stone-700 dark:text-stone-300">{p.tipo}</span>
                <span className="font-semibold text-stone-900 dark:text-stone-100">{p.anios} años</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-stone-500 mt-3">
            Ajusta los plazos según tu despacho y normativa aplicable.
          </p>
        </div>
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 p-5">
          <p className="font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-amber-600" />
            Alertas RGPD
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between gap-2 border border-stone-100 dark:border-stone-800 rounded-xl px-3 py-2">
              <span className="text-stone-600">Retención vencida</span>
              <span className="font-bold text-rose-600">{stats.rgpdVencida}</span>
            </li>
            <li className="flex justify-between gap-2 border border-stone-100 dark:border-stone-800 rounded-xl px-3 py-2">
              <span className="text-stone-600">Revisión en 90 días</span>
              <span className="font-bold text-amber-600">{stats.rgpdProxima}</span>
            </li>
            <li className="flex justify-between gap-2 border border-stone-100 dark:border-stone-800 rounded-xl px-3 py-2">
              <span className="text-stone-600">En plazo</span>
              <span className="font-bold text-emerald-600">
                {Math.max(0, stats.total - stats.rgpdVencida - stats.rgpdProxima)}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
          <input
            type="text"
            placeholder="Buscar expediente, cliente, resultado..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-stone-200 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value as 'cerrado' | 'archivado' | '')}
              className="pl-9 pr-4 py-2.5 border border-stone-200 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none appearance-none cursor-pointer"
            >
              <option value="">Cerrados y archivados</option>
              <option value="cerrado">Solo cerrados</option>
              <option value="archivado">Solo archivados</option>
            </select>
          </div>
          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value)}
            className="px-4 py-2.5 border border-stone-200 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 outline-none appearance-none cursor-pointer"
          >
            <option value="">Todos los tipos</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button type="button" className={VERTIAL_BTN_SECONDARY} onClick={() => navigate('/saas/lawyer-cases')}>
            Ir a Expedientes
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr className="border-b border-stone-200 dark:border-stone-800 text-left">
              {['Nº Expediente', 'Tipo', 'Cliente', 'Cierre', 'Resultado', 'Retención', 'RGPD', 'Estado', ''].map((h) => (
                <th key={h || 'a'} className="px-4 py-3 font-semibold text-stone-500 dark:text-stone-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-stone-500">
                  <span className="inline-flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Cargando…</span>
                </td>
              </tr>
            ) : filtered.map((c) => {
              const rgpd = rgpdStatus(c);
              return (
                <tr key={c._id} className="border-b border-stone-100 dark:border-stone-800/60 hover:bg-stone-50 dark:hover:bg-stone-800/40">
                  <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100">
                    <span className="inline-flex items-center gap-2">
                      <Archive className="w-4 h-4 text-stone-400" />
                      {c.expediente}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-300">{TYPE_LABELS[c.tipo] || c.tipo}</td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-300">{c.cliente}</td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-300 whitespace-nowrap">{c.fechaCierre || c.fechaApertura}</td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-300 max-w-[180px] truncate">{c.resultado || '—'}</td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-300 whitespace-nowrap">{retentionYears(c)} años</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        rgpd === 'vencida'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                          : rgpd === 'proxima'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                      }`}
                    >
                      {rgpd === 'vencida' ? 'Vencida' : rgpd === 'proxima' ? 'Próxima' : 'En plazo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-300 capitalize">{c.estado}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className={`${VERTIAL_BTN_PRIMARY} !min-h-9 !px-3 !py-1.5 text-xs`}
                      onClick={() => navigate(`/saas/lawyer-cases?open=${encodeURIComponent(c._id)}`)}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Abrir
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-stone-400">
                  Aún no hay expedientes cerrados o archivados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
