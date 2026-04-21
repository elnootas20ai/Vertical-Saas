import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../../context/AuthContext';
import {
  Droplets,
  Car,
  Clock,
  CheckCircle2,
  ArrowLeft,
  Plus,
  Search,
  X,
  ChevronRight,
  User,
  CreditCard,
  Banknote,
  ListOrdered,
  ClipboardList,
} from 'lucide-react';

type WashServiceType = 'basico' | 'completo' | 'premium' | 'interior';
type WashQueueStatus = 'en_cola' | 'en_lavado' | 'secado' | 'listo';
type PaymentStatus = 'pendiente' | 'pagado';

interface WashQueueItem {
  id: string;
  matricula: string;
  servicio: WashServiceType;
  estado: WashQueueStatus;
  entrada: string;
}

interface WashServiceLogEntry {
  id: string;
  matricula: string;
  servicio: WashServiceType;
  hora: string;
  operador: string;
  pago: PaymentStatus;
}

const SERVICIO_CFG: Record<WashServiceType, { label: string; color: string; bg: string }> = {
  basico:   { label: 'Básico',   color: 'text-sky-700',   bg: 'bg-sky-50 border-sky-200' },
  completo: { label: 'Completo', color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' },
  premium:  { label: 'Premium',  color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
  interior: { label: 'Interior', color: 'text-teal-700',   bg: 'bg-teal-50 border-teal-200' },
};

const ESTADO_COLA_CFG: Record<WashQueueStatus, { label: string; color: string; bg: string }> = {
  en_cola:   { label: 'En cola',   color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200' },
  en_lavado: { label: 'En lavado', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  secado:    { label: 'Secado',    color: 'text-cyan-700',   bg: 'bg-cyan-50 border-cyan-200' },
  listo:     { label: 'Listo',     color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
};

const PAGO_CFG: Record<PaymentStatus, { label: string; dot: string }> = {
  pendiente: { label: 'Pendiente', dot: 'bg-amber-500' },
  pagado:    { label: 'Pagado',    dot: 'bg-emerald-500' },
};

const FLOW: WashQueueStatus[] = ['en_cola', 'en_lavado', 'secado', 'listo'];

type MainTab = 'cola' | 'servicios';

function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function QueueCard({
  item,
  onSelect,
}: {
  item: WashQueueItem;
  onSelect: (i: WashQueueItem) => void;
}) {
  const st = ESTADO_COLA_CFG[item.estado];
  const sv = SERVICIO_CFG[item.servicio];
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`w-full text-left p-4 rounded-2xl border-2 transition-all hover:shadow-lg active:scale-[0.98] ${st.bg}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{item.matricula}</span>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5 truncate max-w-[200px]">{item.id}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${st.bg} ${st.color}`}>{st.label}</span>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </div>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <Car className="w-4 h-4 text-gray-500" />
        <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold border ${sv.bg} ${sv.color}`}>{sv.label}</span>
      </div>
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <Clock className="w-3 h-3" />
        {new Date(item.entrada).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
      </div>
    </button>
  );
}

export function WorkerTpvCarWash() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const operadorNombre = user?.firstName
    ? `${user.firstName} ${user?.lastName || ''}`.trim()
    : (user?.email ?? 'Operario');

  const [tab, setTab] = useState<MainTab>('cola');
  const [cola, setCola] = useState<WashQueueItem[]>([]);
  const [log, setLog] = useState<WashServiceLogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<WashQueueStatus | 'all'>('all');
  const [filterPago, setFilterPago] = useState<PaymentStatus | 'all'>('all');
  const [selected, setSelected] = useState<WashQueueItem | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [nuevaMatricula, setNuevaMatricula] = useState('');
  const [nuevoServicio, setNuevoServicio] = useState<WashServiceType>('basico');

  const stats = useMemo(() => {
    const hoy = startOfTodayMs();
    const completadosHoy = log.filter(e => new Date(e.hora).getTime() >= hoy).length;
    return {
      enCola: cola.filter(v => v.estado === 'en_cola').length,
      enProceso: cola.filter(v => v.estado === 'en_lavado' || v.estado === 'secado').length,
      completadosHoy,
    };
  }, [cola, log]);

  const colaFiltrada = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cola.filter(v => {
      if (q && !v.matricula.toLowerCase().includes(q) && !v.id.toLowerCase().includes(q)) return false;
      if (filterEstado !== 'all' && v.estado !== filterEstado) return false;
      return true;
    });
  }, [cola, search, filterEstado]);

  const logFiltrado = useMemo(() => {
    const q = search.trim().toLowerCase();
    return log.filter(e => {
      if (q && !e.matricula.toLowerCase().includes(q) && !e.id.toLowerCase().includes(q) && !e.operador.toLowerCase().includes(q)) return false;
      if (filterPago !== 'all' && e.pago !== filterPago) return false;
      return true;
    });
  }, [log, search, filterPago]);

  const addToQueue = useCallback(() => {
    const m = nuevaMatricula.trim().toUpperCase();
    if (!m) return;
    setCola(prev => [
      ...prev,
      {
        id: uuidv4(),
        matricula: m,
        servicio: nuevoServicio,
        estado: 'en_cola',
        entrada: new Date().toISOString(),
      },
    ]);
    setNuevaMatricula('');
    setNuevoServicio('basico');
    setShowAdd(false);
  }, [nuevaMatricula, nuevoServicio]);

  const advanceEstado = useCallback((id: string) => {
    setCola(prev =>
      prev.map(v => {
        if (v.id !== id) return v;
        const i = FLOW.indexOf(v.estado);
        if (i < FLOW.length - 1) return { ...v, estado: FLOW[i + 1] };
        return v;
      }),
    );
    setSelected(prev => {
      if (!prev || prev.id !== id) return prev;
      const i = FLOW.indexOf(prev.estado);
      if (i < FLOW.length - 1) return { ...prev, estado: FLOW[i + 1] };
      return prev;
    });
  }, []);

  const completeToLog = useCallback(
    (item: WashQueueItem) => {
      setCola(prev => prev.filter(v => v.id !== item.id));
      setLog(prev => [
        {
          id: uuidv4(),
          matricula: item.matricula,
          servicio: item.servicio,
          hora: new Date().toISOString(),
          operador: operadorNombre,
          pago: 'pendiente',
        },
        ...prev,
      ]);
      setSelected(null);
    },
    [operadorNombre],
  );

  const markPaid = useCallback((id: string) => {
    setLog(prev => prev.map(e => (e.id === id ? { ...e, pago: 'pagado' } : e)));
  }, []);

  if (showAdd) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Añadir vehículo a la cola</h1>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Matrícula *</label>
            <input
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm font-mono"
              value={nuevaMatricula}
              onChange={e => setNuevaMatricula(e.target.value.toUpperCase())}
              placeholder="1234 ABC"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Tipo de servicio</label>
            <select
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm"
              value={nuevoServicio}
              onChange={e => setNuevoServicio(e.target.value as WashServiceType)}
            >
              {(Object.keys(SERVICIO_CFG) as WashServiceType[]).map(k => (
                <option key={k} value={k}>
                  {SERVICIO_CFG[k].label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex gap-2">
          <button
            type="button"
            onClick={() => setShowAdd(false)}
            className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={addToQueue}
            className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 shadow-md"
          >
            Añadir a cola
          </button>
        </div>
      </div>
    );
  }

  if (selected) {
    const st = ESTADO_COLA_CFG[selected.estado];
    const sv = SERVICIO_CFG[selected.servicio];
    const idx = FLOW.indexOf(selected.estado);
    const canAdvance = idx < FLOW.length - 1;
    const nextLabel = canAdvance ? ESTADO_COLA_CFG[FLOW[idx + 1]].label : '';
    const enListo = selected.estado === 'listo';

    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{selected.matricula}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${st.bg} ${st.color}`}>{st.label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold border ${sv.bg} ${sv.color}`}>{sv.label}</span>
              </div>
              <p className="text-[10px] text-gray-400 font-mono truncate">{selected.id}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Etapas del lavado</h3>
            <div className="flex gap-1">
              {FLOW.map((s, i) => {
                const done = i <= idx;
                return <div key={s} className={`flex-1 h-2 rounded-full ${done ? 'bg-sky-500' : 'bg-gray-200 dark:bg-gray-700'}`} />;
              })}
            </div>
            <div className="flex justify-between mt-2 gap-1">
              {FLOW.map(s => (
                <span key={s} className="text-[9px] text-gray-500 dark:text-gray-400 text-center flex-1 leading-tight">
                  {ESTADO_COLA_CFG[s].label}
                </span>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Clock className="w-4 h-4 text-gray-400" />
              Entrada: {new Date(selected.entrada).toLocaleString('es-ES')}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex flex-col gap-2">
          {canAdvance && (
            <button
              type="button"
              onClick={() => advanceEstado(selected.id)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-sky-600 text-white hover:bg-sky-700 shadow-md"
            >
              <ChevronRight className="w-4 h-4" /> Avanzar a: {nextLabel}
            </button>
          )}
          {enListo && (
            <button
              type="button"
              onClick={() => completeToLog(selected)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-md"
            >
              <CheckCircle2 className="w-4 h-4" /> Completar y registrar servicio
            </button>
          )}
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
              onClick={() => navigate('/saas/worker')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 shrink-0" />
            <div className="w-10 h-10 bg-sky-100 dark:bg-sky-900/40 rounded-2xl border-2 border-sky-200 dark:border-sky-800 flex items-center justify-center shrink-0">
              <Droplets className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">Mi Puesto - Lavadero</h1>
              <p className="text-xs text-gray-500 truncate">{operadorNombre}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => { setTab('cola'); setSearch(''); }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-semibold transition-all border-2 ${
              tab === 'cola'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <ListOrdered className="w-4 h-4" /> Cola
          </button>
          <button
            type="button"
            onClick={() => { setTab('servicios'); setSearch(''); }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-2xl text-sm font-semibold transition-all border-2 ${
              tab === 'servicios'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <ClipboardList className="w-4 h-4" /> Servicios
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: 'En cola', value: stats.enCola, color: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-700' },
            { label: 'En proceso', value: stats.enProceso, color: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800' },
            { label: 'Completados hoy', value: stats.completadosHoy, color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800' },
          ].map(s => (
            <div key={s.label} className={`rounded-2xl border-2 p-2.5 text-center ${s.color}`}>
              <p className="text-xl font-bold">{s.value}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>

        {tab === 'cola' && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(
              [
                { id: 'all' as const, label: 'Todos' },
                { id: 'en_cola', label: 'En cola' },
                { id: 'en_lavado', label: 'Lavado' },
                { id: 'secado', label: 'Secado' },
                { id: 'listo', label: 'Listo' },
              ] as const
            ).map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterEstado(f.id)}
                className={`px-3 py-1.5 rounded-2xl text-xs font-semibold border-2 transition-all ${
                  filterEstado === f.id
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'servicios' && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(
              [
                { id: 'all' as const, label: 'Todos' },
                { id: 'pendiente', label: 'Pendiente pago' },
                { id: 'pagado', label: 'Pagado' },
              ] as const
            ).map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilterPago(f.id)}
                className={`px-3 py-1.5 rounded-2xl text-xs font-semibold border-2 transition-all ${
                  filterPago === f.id
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-200'
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
              tab === 'cola'
                ? 'Buscar matrícula o UUID…'
                : 'Buscar matrícula, operador o UUID…'
            }
            className="w-full pl-9 pr-8 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === 'cola' ? (
          colaFiltrada.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Droplets className="w-10 h-10 mb-2" />
              <p className="text-sm font-medium">No hay vehículos en esta vista</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {colaFiltrada.map(v => (
                <QueueCard key={v.id} item={v} onSelect={setSelected} />
              ))}
            </div>
          )
        ) : logFiltrado.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <ClipboardList className="w-10 h-10 mb-2" />
            <p className="text-sm font-medium">No hay servicios en el registro</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logFiltrado.map(e => {
              const sv = SERVICIO_CFG[e.servicio];
              const pg = PAGO_CFG[e.pago];
              return (
                <div
                  key={e.id}
                  className="bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{e.matricula}</span>
                      <p className="text-[10px] text-gray-400 font-mono truncate">{e.id}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold border shrink-0 ${sv.bg} ${sv.color}`}>{sv.label}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-3">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(e.hora).toLocaleString('es-ES')}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {e.operador}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${pg.dot}`} />
                      {pg.label}
                    </span>
                  </div>
                  {e.pago === 'pendiente' && (
                    <button
                      type="button"
                      onClick={() => markPaid(e.id)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 border-2 border-emerald-700"
                    >
                      <Banknote className="w-4 h-4" /> Marcar como pagado
                    </button>
                  )}
                  {e.pago === 'pagado' && (
                    <div className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400 py-1">
                      <CreditCard className="w-4 h-4" /> Cobro registrado
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {tab === 'cola' && (
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl text-sm font-semibold hover:opacity-90 border-2 border-gray-900 dark:border-white shadow-md transition"
          >
            <Plus className="w-4 h-4" /> Añadir vehículo
          </button>
        </div>
      )}
    </div>
  );
}
