import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../../context/AuthContext';
import {
  CarTaxiFront,
  Navigation,
  Clock,
  DollarSign,
  ArrowLeft,
  Play,
  Square,
  Search,
  X,
  MapPin,
  CreditCard,
  Smartphone,
  Banknote,
  Coffee,
  Route,
  Hash,
} from 'lucide-react';

type TripStatus = 'en_curso' | 'completada';
type PaymentMethod = 'efectivo' | 'tarjeta' | 'app';

interface TaxiTrip {
  id: string;
  origen: string;
  destino: string;
  inicio: string;
  fin: string | null;
  km: number;
  tarifa: number | null;
  pago: PaymentMethod;
  estado: TripStatus;
}

interface BreakSegment {
  id: string;
  inicio: string;
  fin: string | null;
}

type MainTab = 'carreras' | 'turno';

const STATUS_CFG: Record<TripStatus, { label: string; color: string; bg: string }> = {
  en_curso: { label: 'En curso', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800' },
  completada: { label: 'Completada', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800' },
};

const PAGO_CFG: Record<PaymentMethod, { label: string; icon: React.ReactNode }> = {
  efectivo: { label: 'Efectivo', icon: <Banknote className="w-3.5 h-3.5" /> },
  tarjeta: { label: 'Tarjeta', icon: <CreditCard className="w-3.5 h-3.5" /> },
  app: { label: 'App', icon: <Smartphone className="w-3.5 h-3.5" /> },
};

function formatCurrency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function isSameLocalDay(iso: string, ref = new Date()) {
  const d = new Date(iso);
  return d.getDate() === ref.getDate() && d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
}

function shortUuid(id: string) {
  return id.slice(0, 8);
}

function computeBreakMs(segments: BreakSegment[], now: number): number {
  let ms = 0;
  for (const s of segments) {
    const start = new Date(s.inicio).getTime();
    const end = s.fin ? new Date(s.fin).getTime() : now;
    ms += Math.max(0, end - start);
  }
  return ms;
}

function formatDurationMs(ms: number) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m} min`;
  return `${h}h ${m}m`;
}

export function WorkerTpvTaxi() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const workerName = user?.firstName ? `${user.firstName} ${user?.lastName || ''}`.trim() : 'Conductor';

  const [mainTab, setMainTab] = useState<MainTab>('carreras');
  const [trips, setTrips] = useState<TaxiTrip[]>([]);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<TripStatus | 'all'>('all');
  const [filterPago, setFilterPago] = useState<PaymentMethod | 'all'>('all');

  const [shiftStartedAt, setShiftStartedAt] = useState<string | null>(null);
  const [shiftEndedAt, setShiftEndedAt] = useState<string | null>(null);
  const [breakSegments, setBreakSegments] = useState<BreakSegment[]>([]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30000);
    return () => window.clearInterval(id);
  }, []);

  const now = Date.now();

  const shiftActive = shiftStartedAt !== null && shiftEndedAt === null;
  const onBreak = shiftActive && breakSegments.length > 0 && breakSegments[breakSegments.length - 1].fin === null;

  const activeTrip = useMemo(() => trips.find((t) => t.estado === 'en_curso') ?? null, [trips]);

  const tripsToday = useMemo(
    () => trips.filter((t) => t.estado === 'completada' && t.fin && isSameLocalDay(t.fin)),
    [trips],
  );

  const carrerasHoy = tripsToday.length;
  const kmHoy = useMemo(() => tripsToday.reduce((s, t) => s + t.km, 0), [tripsToday]);

  const shiftTripsCompleted = useMemo(() => {
    if (!shiftStartedAt) return [];
    const start = new Date(shiftStartedAt).getTime();
    return trips.filter(
      (t) => t.estado === 'completada' && t.fin && new Date(t.fin).getTime() >= start,
    );
  }, [trips, shiftStartedAt]);

  const ingresosTurno = useMemo(
    () => shiftTripsCompleted.reduce((s, t) => s + (t.tarifa ?? 0), 0),
    [shiftTripsCompleted],
  );
  const kmTurno = useMemo(() => shiftTripsCompleted.reduce((s, t) => s + t.km, 0), [shiftTripsCompleted]);
  const totalCarrerasTurno = shiftTripsCompleted.length + (activeTrip ? 1 : 0);

  const breakMsTotal = useMemo(() => computeBreakMs(breakSegments, now), [breakSegments, tick, now]);

  const filteredTrips = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trips.filter((t) => {
      if (filterEstado !== 'all' && t.estado !== filterEstado) return false;
      if (filterPago !== 'all' && t.pago !== filterPago) return false;
      if (!q) return true;
      return (
        t.origen.toLowerCase().includes(q) ||
        t.destino.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        shortUuid(t.id).includes(q)
      );
    });
  }, [trips, search, filterEstado, filterPago]);

  const [showNuevaCarrera, setShowNuevaCarrera] = useState(false);
  const [nuevaOrigen, setNuevaOrigen] = useState('');
  const [nuevaDestino, setNuevaDestino] = useState('');

  const [endFareStr, setEndFareStr] = useState('');
  const [endKmStr, setEndKmStr] = useState('');
  const [endDestino, setEndDestino] = useState('');
  const [endPago, setEndPago] = useState<PaymentMethod>('efectivo');

  useEffect(() => {
    if (!activeTrip) return;
    setEndDestino(activeTrip.destino);
    setEndKmStr(activeTrip.km > 0 ? String(activeTrip.km) : '');
    setEndFareStr('');
    setEndPago(activeTrip.pago);
  }, [activeTrip?.id]);

  const startShift = () => {
    if (shiftActive) return;
    setShiftStartedAt(new Date().toISOString());
    setShiftEndedAt(null);
    setBreakSegments([]);
  };

  const resetShiftLocal = () => {
    setShiftStartedAt(null);
    setShiftEndedAt(null);
    setBreakSegments([]);
  };

  const endShift = () => {
    if (!shiftActive) return;
    if (activeTrip) return;
    if (onBreak) return;
    setShiftEndedAt(new Date().toISOString());
  };

  const startBreak = () => {
    if (!shiftActive || onBreak || activeTrip) return;
    setBreakSegments((prev) => [...prev, { id: uuidv4(), inicio: new Date().toISOString(), fin: null }]);
  };

  const endBreak = () => {
    if (!onBreak) return;
    setBreakSegments((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.fin === null) {
        next[next.length - 1] = { ...last, fin: new Date().toISOString() };
      }
      return next;
    });
  };

  const startTrip = () => {
    if (activeTrip || !nuevaOrigen.trim()) return;
    setTrips((prev) => [
      {
        id: uuidv4(),
        origen: nuevaOrigen.trim(),
        destino: nuevaDestino.trim(),
        inicio: new Date().toISOString(),
        fin: null,
        km: 0,
        tarifa: null,
        pago: 'efectivo',
        estado: 'en_curso',
      },
      ...prev,
    ]);
    setNuevaOrigen('');
    setNuevaDestino('');
    setShowNuevaCarrera(false);
  };

  const completeTrip = () => {
    if (!activeTrip) return;
    const fare = parseFloat(endFareStr.replace(',', '.'));
    const km = parseFloat(endKmStr.replace(',', '.'));
    if (Number.isNaN(fare) || fare < 0 || Number.isNaN(km) || km < 0) return;
    setTrips((prev) =>
      prev.map((t) =>
        t.id === activeTrip.id
          ? {
              ...t,
              destino: endDestino.trim() || t.destino,
              fin: new Date().toISOString(),
              km,
              tarifa: fare,
              pago: endPago,
              estado: 'completada' as const,
            }
          : t,
      ),
    );
  };

  if (showNuevaCarrera) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowNuevaCarrera(false)}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </button>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nueva carrera</h1>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Origen *</label>
            <input
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm"
              value={nuevaOrigen}
              onChange={(e) => setNuevaOrigen(e.target.value)}
              placeholder="Ej. Aeropuerto T4"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Destino (opcional)</label>
            <input
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500 text-sm"
              value={nuevaDestino}
              onChange={(e) => setNuevaDestino(e.target.value)}
              placeholder="Se puede completar al finalizar"
            />
          </div>
        </div>
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 flex gap-2">
          <button
            type="button"
            onClick={() => setShowNuevaCarrera(false)}
            className="flex-1 px-3 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={startTrip}
            disabled={!nuevaOrigen.trim() || !!activeTrip || onBreak}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 shadow-md disabled:opacity-40"
          >
            <Play className="w-4 h-4" /> Iniciar carrera
          </button>
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
            <div className="w-10 h-10 bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-200 dark:border-amber-800 rounded-xl flex items-center justify-center shrink-0">
              <CarTaxiFront className="w-5 h-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">Mi Puesto - Taxi</h1>
              <p className="text-xs text-gray-500 truncate">{workerName}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => {
              setMainTab('carreras');
              setSearch('');
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              mainTab === 'carreras'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Navigation className="w-4 h-4" /> Carreras
          </button>
          <button
            type="button"
            onClick={() => {
              setMainTab('turno');
              setSearch('');
            }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
              mainTab === 'turno'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            <Clock className="w-4 h-4" /> Mi turno
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: 'Carreras hoy', value: String(carrerasHoy), color: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-800' },
            { label: 'Km recorridos', value: kmHoy.toFixed(1), color: 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-200 dark:border-violet-800' },
            {
              label: 'Ingresos turno',
              value: shiftActive ? formatCurrency(ingresosTurno) : '—',
              color: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800',
            },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border-2 p-2.5 text-center ${s.color}`}>
              <p className="text-lg font-bold leading-tight truncate">{s.value}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {mainTab === 'carreras' && (
          <>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(
                [
                  { id: 'all' as const, label: 'Todos' },
                  { id: 'en_curso' as const, label: 'En curso' },
                  { id: 'completada' as const, label: 'Completadas' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterEstado(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    filterEstado === f.id
                      ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-md'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(
                [
                  { id: 'all' as const, label: 'Pago: todos' },
                  { id: 'efectivo' as const, label: 'Efectivo' },
                  { id: 'tarjeta' as const, label: 'Tarjeta' },
                  { id: 'app' as const, label: 'App' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterPago(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    filterPago === f.id
                      ? 'bg-amber-600 text-white shadow-md'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar origen, destino, UUID…"
                className="w-full pl-9 pr-8 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-gray-900 dark:text-gray-100"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {mainTab === 'carreras' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
          {activeTrip && (
            <div className="rounded-2xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-950/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                  <Play className="w-4 h-4" /> Carrera en curso
                </span>
                <span className="font-mono text-xs text-amber-800 dark:text-amber-300">{shortUuid(activeTrip.id)}</span>
              </div>
              <div className="space-y-1 text-sm text-gray-800 dark:text-gray-200">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 shrink-0 text-gray-500 mt-0.5" />
                  <span>
                    <span className="text-gray-500 text-xs">Origen · </span>
                    {activeTrip.origen}
                  </span>
                </div>
                {activeTrip.destino && (
                  <div className="flex items-start gap-2">
                    <Navigation className="w-4 h-4 shrink-0 text-gray-500 mt-0.5" />
                    <span>
                      <span className="text-gray-500 text-xs">Destino · </span>
                      {activeTrip.destino}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <Clock className="w-3.5 h-3.5" />
                  Inicio {formatDateTime(activeTrip.inicio)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Km</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={endKmStr}
                    onChange={(e) => setEndKmStr(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Tarifa (€)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={endFareStr}
                    onChange={(e) => setEndFareStr(e.target.value)}
                    placeholder="12,50"
                    className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Destino</label>
                <input
                  type="text"
                  value={endDestino}
                  onChange={(e) => setEndDestino(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-sm"
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Cobro</p>
                <div className="flex gap-2">
                  {(['efectivo', 'tarjeta', 'app'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setEndPago(p)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                        endPago === p
                          ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                          : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {PAGO_CFG[p].icon}
                      {PAGO_CFG[p].label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={completeTrip}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-md"
              >
                <Square className="w-4 h-4" /> Finalizar carrera
              </button>
            </div>
          )}

          {filteredTrips.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <CarTaxiFront className="w-10 h-10 mb-2 opacity-60" />
              <p className="text-sm font-medium text-center">No hay carreras en esta vista</p>
            </div>
          ) : (
            filteredTrips.map((t) => {
              const st = STATUS_CFG[t.estado];
              return (
                <div
                  key={t.id}
                  className={`rounded-2xl border-2 p-4 transition-all hover:shadow-lg ${st.bg}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Hash className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="font-mono text-xs font-bold text-gray-700 dark:text-gray-200 truncate">{t.id}</span>
                    </div>
                    <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full border ${st.color}`}>{st.label}</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2 text-gray-800 dark:text-gray-200">
                      <MapPin className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                      <div>
                        <p>
                          <span className="text-xs text-gray-500">Origen · </span>
                          {t.origen}
                        </p>
                        {(t.destino || t.estado === 'completada') && (
                          <p className="mt-0.5">
                            <span className="text-xs text-gray-500">Destino · </span>
                            {t.destino || '—'}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDateTime(t.inicio)}
                        {t.fin && <> → {formatDateTime(t.fin)}</>}
                      </span>
                      {t.estado === 'completada' && (
                        <>
                          <span className="flex items-center gap-1">
                            <Route className="w-3.5 h-3.5" />
                            {t.km} km
                          </span>
                          <span className="flex items-center gap-1 font-semibold text-gray-900 dark:text-gray-100">
                            <DollarSign className="w-3.5 h-3.5" />
                            {t.tarifa != null ? formatCurrency(t.tarifa) : '—'}
                          </span>
                          <span className="flex items-center gap-1">
                            {PAGO_CFG[t.pago].icon}
                            {PAGO_CFG[t.pago].label}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {mainTab === 'turno' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Clock className="w-4 h-4" /> Estado del turno
            </h2>
            {!shiftStartedAt && (
              <p className="text-sm text-gray-500">Inicia tu turno para registrar carreras y pausas.</p>
            )}
            {shiftStartedAt && (
              <div className="space-y-2 text-sm">
                <p className="text-gray-700 dark:text-gray-300">
                  <span className="text-gray-500">Inicio · </span>
                  {formatDateTime(shiftStartedAt)}
                </p>
                {shiftEndedAt && (
                  <p className="text-gray-700 dark:text-gray-300">
                    <span className="text-gray-500">Fin · </span>
                    {formatDateTime(shiftEndedAt)}
                  </p>
                )}
                {shiftActive && (
                  <p className={`text-sm font-semibold ${onBreak ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                    {onBreak ? 'En pausa' : 'Turno activo'}
                  </p>
                )}
                {shiftEndedAt && (
                  <p className="text-sm text-gray-500">Turno cerrado. Puedes iniciar uno nuevo o limpiar el estado local.</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border-2 border-gray-100 dark:border-gray-800 p-3 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{shiftActive ? totalCarrerasTurno : '—'}</p>
                <p className="text-[10px] font-semibold uppercase text-gray-500">Carreras (turno)</p>
              </div>
              <div className="rounded-xl border-2 border-gray-100 dark:border-gray-800 p-3 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{shiftActive ? kmTurno.toFixed(1) : '—'}</p>
                <p className="text-[10px] font-semibold uppercase text-gray-500">Km turno</p>
              </div>
              <div className="rounded-xl border-2 border-gray-100 dark:border-gray-800 p-3 text-center col-span-2">
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {shiftActive ? formatCurrency(ingresosTurno) : '—'}
                </p>
                <p className="text-[10px] font-semibold uppercase text-gray-500">Ingresos del turno</p>
              </div>
              <div className="rounded-xl border-2 border-gray-100 dark:border-gray-800 p-3 text-center col-span-2 flex items-center justify-center gap-2">
                <Coffee className="w-5 h-5 text-amber-600" />
                <div>
                  <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatDurationMs(breakMsTotal)}</p>
                  <p className="text-[10px] font-semibold uppercase text-gray-500">Tiempo de pausa</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {!shiftActive && (
                <button
                  type="button"
                  onClick={startShift}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold shadow-md hover:opacity-90"
                >
                  <Play className="w-4 h-4" /> {shiftEndedAt ? 'Nuevo turno' : 'Iniciar turno'}
                </button>
              )}
              {shiftActive && (
                <>
                  {!onBreak ? (
                    <button
                      type="button"
                      onClick={startBreak}
                      disabled={!!activeTrip}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-amber-300 text-amber-900 dark:text-amber-200 text-sm font-semibold hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-40"
                    >
                      <Coffee className="w-4 h-4" /> Iniciar pausa
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={endBreak}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold shadow-md"
                    >
                      <Play className="w-4 h-4" /> Finalizar pausa
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={endShift}
                    disabled={!!activeTrip || onBreak}
                    title={
                      activeTrip
                        ? 'Termina la carrera en curso antes de cerrar el turno'
                        : onBreak
                          ? 'Finaliza la pausa antes de cerrar el turno'
                          : undefined
                    }
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"
                  >
                    <Square className="w-4 h-4" /> Finalizar turno
                  </button>
                </>
              )}
              {shiftEndedAt && (
                <button
                  type="button"
                  onClick={resetShiftLocal}
                  className="w-full py-2 rounded-xl text-xs font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  Limpiar vista del turno (solo local)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {mainTab === 'carreras' && (
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
          <button
            type="button"
            onClick={() => setShowNuevaCarrera(true)}
            disabled={!!activeTrip || onBreak || !shiftActive}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:opacity-90 shadow-md transition disabled:opacity-40"
          >
            <Play className="w-4 h-4" /> Nueva carrera
          </button>
          {(!shiftActive || onBreak) && (
            <p className="text-[11px] text-center text-gray-500 mt-2">
              {!shiftActive ? 'Inicia el turno en «Mi turno» para registrar carreras.' : 'No puedes iniciar carrera durante la pausa.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
