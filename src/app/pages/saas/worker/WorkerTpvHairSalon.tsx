import { useMemo, useState, useCallback, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../../context/AuthContext';
import {
  Scissors,
  Calendar,
  DollarSign,
  Users,
  ArrowLeft,
  Search,
  Clock,
  Play,
  CheckCircle,
  Package,
  CreditCard,
  Banknote,
  Smartphone,
  Plus,
  Trash2,
  Sparkles,
  X,
} from 'lucide-react';

type HairSalonServiceKind = 'corte' | 'color' | 'mechas' | 'tratamiento' | 'peinado';

type HairAppointmentStatus = 'pendiente' | 'en_curso' | 'completada';

interface HairSalonAppointment {
  id: string;
  date: string;
  time: string;
  clientName: string;
  service: HairSalonServiceKind;
  durationMin: number;
  status: HairAppointmentStatus;
  priceEur: number;
}

const SERVICE_LABELS: Record<HairSalonServiceKind, string> = {
  corte: 'Corte',
  color: 'Color',
  mechas: 'Mechas',
  tratamiento: 'Tratamiento',
  peinado: 'Peinado',
};

const STATUS_CONFIG: Record<
  HairAppointmentStatus,
  { label: string; color: string; bg: string }
> = {
  pendiente: {
    label: 'Pendiente',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 border-amber-200 dark:bg-amber-900/25 dark:border-amber-800',
  },
  en_curso: {
    label: 'En curso',
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-50 border-blue-200 dark:bg-blue-900/25 dark:border-blue-800',
  },
  completada: {
    label: 'Completada',
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/25 dark:border-emerald-800',
  },
};

const QUICK_SERVICES: { kind: HairSalonServiceKind; priceEur: number }[] = [
  { kind: 'corte', priceEur: 25 },
  { kind: 'color', priceEur: 55 },
  { kind: 'mechas', priceEur: 70 },
  { kind: 'tratamiento', priceEur: 35 },
  { kind: 'peinado', priceEur: 30 },
];

const QUICK_PRODUCTS: { label: string; priceEur: number }[] = [
  { label: 'Champú profesional', priceEur: 18 },
  { label: 'Mascarilla reparadora', priceEur: 22 },
  { label: 'Laca fijación', priceEur: 14 },
  { label: 'Sérum brillo', priceEur: 24 },
];

type PaymentMethod = 'efectivo' | 'tarjeta' | 'bizum';

interface CheckoutLine {
  id: string;
  label: string;
  type: 'servicio' | 'producto';
  qty: number;
  unitPriceEur: number;
}

function formatCurrency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function createSeedAppointments(today: string): HairSalonAppointment[] {
  return [
    {
      id: uuidv4(),
      date: today,
      time: '09:30',
      clientName: 'María López',
      service: 'corte',
      durationMin: 45,
      status: 'completada',
      priceEur: 28,
    },
    {
      id: uuidv4(),
      date: today,
      time: '11:00',
      clientName: 'Ana Ruiz',
      service: 'color',
      durationMin: 120,
      status: 'en_curso',
      priceEur: 65,
    },
    {
      id: uuidv4(),
      date: today,
      time: '14:15',
      clientName: 'Laura Gómez',
      service: 'mechas',
      durationMin: 150,
      status: 'pendiente',
      priceEur: 85,
    },
    {
      id: uuidv4(),
      date: today,
      time: '16:45',
      clientName: 'Carmen Vega',
      service: 'tratamiento',
      durationMin: 40,
      status: 'pendiente',
      priceEur: 38,
    },
    {
      id: uuidv4(),
      date: today,
      time: '18:00',
      clientName: 'Elena Martín',
      service: 'peinado',
      durationMin: 50,
      status: 'pendiente',
      priceEur: 35,
    },
  ];
}

export function WorkerTpvHairSalon() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [tab, setTab] = useState<'citas' | 'caja'>('citas');
  const [appointments, setAppointments] = useState<HairSalonAppointment[]>(() =>
    createSeedAppointments(today),
  );
  const [ingresosExtraCajaEur, setIngresosExtraCajaEur] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | HairAppointmentStatus>('all');

  const [checkoutLines, setCheckoutLines] = useState<CheckoutLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('tarjeta');

  const stylistName = user?.fullName || user?.firstName || 'Estilista';

  const ingresosCitasCompletadas = useMemo(() => {
    return appointments
      .filter((a) => a.date === today && a.status === 'completada')
      .reduce((s, a) => s + a.priceEur, 0);
  }, [appointments, today]);

  const ingresosDia = ingresosCitasCompletadas + ingresosExtraCajaEur;

  const citasHoy = useMemo(
    () => appointments.filter((a) => a.date === today).length,
    [appointments, today],
  );

  const completadasHoy = useMemo(
    () =>
      appointments.filter((a) => a.date === today && a.status === 'completada').length,
    [appointments, today],
  );

  const filteredAppointments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return appointments
      .filter((a) => a.date === today)
      .filter((a) => (statusFilter === 'all' ? true : a.status === statusFilter))
      .filter((a) => {
        if (!q) return true;
        return (
          a.clientName.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          SERVICE_LABELS[a.service].toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [appointments, today, search, statusFilter]);

  const checkoutTotal = useMemo(
    () => checkoutLines.reduce((s, l) => s + l.qty * l.unitPriceEur, 0),
    [checkoutLines],
  );

  const startAppointment = useCallback((id: string) => {
    setAppointments((prev) =>
      prev.map((a) =>
        a.id === id && a.status === 'pendiente' ? { ...a, status: 'en_curso' as const } : a,
      ),
    );
    toast.success('Servicio iniciado');
  }, []);

  const completeAppointment = useCallback((id: string) => {
    setAppointments((prev) =>
      prev.map((a) =>
        a.id === id && a.status === 'en_curso' ? { ...a, status: 'completada' as const } : a,
      ),
    );
    toast.success('Cita completada');
  }, []);

  const addCheckoutService = (kind: HairSalonServiceKind, priceEur: number) => {
    setCheckoutLines((lines) => [
      ...lines,
      {
        id: uuidv4(),
        label: SERVICE_LABELS[kind],
        type: 'servicio',
        qty: 1,
        unitPriceEur: priceEur,
      },
    ]);
  };

  const addCheckoutProduct = (label: string, priceEur: number) => {
    setCheckoutLines((lines) => [
      ...lines,
      {
        id: uuidv4(),
        label,
        type: 'producto',
        qty: 1,
        unitPriceEur: priceEur,
      },
    ]);
  };

  const removeLine = (id: string) => {
    setCheckoutLines((lines) => lines.filter((l) => l.id !== id));
  };

  const updateQty = (id: string, delta: number) => {
    setCheckoutLines((lines) =>
      lines
        .map((l) => {
          if (l.id !== id) return l;
          const next = Math.max(1, l.qty + delta);
          return { ...l, qty: next };
        })
        .filter((l) => l.qty > 0),
    );
  };

  const processPayment = () => {
    if (checkoutLines.length === 0) {
      toast.error('Añade servicios o productos');
      return;
    }
    const total = checkoutTotal;
    setIngresosExtraCajaEur((v) => v + total);
    setCheckoutLines([]);
    const metodo =
      paymentMethod === 'efectivo'
        ? 'Efectivo'
        : paymentMethod === 'bizum'
          ? 'Bizum'
          : 'Tarjeta';
    toast.success(`Cobro registrado (${metodo}): ${formatCurrency(total)}`);
  };

  const paymentIcons: Record<PaymentMethod, ReactNode> = {
    efectivo: <Banknote className="w-4 h-4" />,
    tarjeta: <CreditCard className="w-4 h-4" />,
    bizum: <Smartphone className="w-4 h-4" />,
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50 dark:bg-gray-950">
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b-2 border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/saas/worker')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-600"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 shrink-0" />
            <div className="w-10 h-10 bg-violet-100 dark:bg-violet-900/40 rounded-2xl border-2 border-violet-200 dark:border-violet-800 flex items-center justify-center shrink-0">
              <Scissors className="w-5 h-5 text-violet-600 dark:text-violet-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                Mi Puesto - Peluquería
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {stylistName} · {citasHoy} citas hoy
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            {
              label: 'Citas hoy',
              value: citasHoy,
              icon: <Calendar className="w-4 h-4" />,
              box: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-800 dark:text-violet-200',
            },
            {
              label: 'Completadas',
              value: completadasHoy,
              icon: <CheckCircle className="w-4 h-4" />,
              box: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200',
            },
            {
              label: 'Ingresos hoy',
              value: formatCurrency(ingresosDia),
              icon: <DollarSign className="w-4 h-4" />,
              box: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200',
            },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-2xl border-2 p-2.5 ${s.box} flex flex-col gap-1`}
            >
              <div className="flex items-center gap-1.5 opacity-80">
                {s.icon}
                <span className="text-[10px] font-bold uppercase tracking-wide truncate">
                  {s.label}
                </span>
              </div>
              <p className="text-lg font-bold font-mono leading-tight truncate">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-1 bg-gray-100 dark:bg-gray-800/80">
          {(
            [
              { id: 'citas' as const, label: 'Mis Citas', icon: Users },
              { id: 'caja' as const, label: 'Caja', icon: DollarSign },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
                tab === t.id
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-md border-2 border-gray-200 dark:border-gray-600'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {tab === 'citas' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all' as const, label: 'Todas' },
                  { id: 'pendiente' as const, label: 'Pendiente' },
                  { id: 'en_curso' as const, label: 'En curso' },
                  { id: 'completada' as const, label: 'Completada' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-3 py-1.5 rounded-2xl text-xs font-semibold border-2 transition-all ${
                    statusFilter === f.id
                      ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300'
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
                placeholder="Buscar cliente, servicio o UUID…"
                className="w-full pl-9 pr-9 py-2.5 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>

            {filteredAppointments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-400">
                <Calendar className="w-10 h-10 mb-2 opacity-60" />
                <p className="text-sm font-medium">No hay citas en esta vista</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredAppointments.map((a) => {
                  const cfg = STATUS_CONFIG[a.status];
                  return (
                    <div
                      key={a.id}
                      className={`rounded-2xl border-2 p-4 transition-all ${cfg.bg}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                          <Clock className="w-4 h-4 text-gray-500 shrink-0" />
                          <span className="text-lg font-bold font-mono">{a.time}</span>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${cfg.bg} ${cfg.color}`}
                        >
                          {cfg.label}
                        </span>
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                        {a.clientName}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300 mb-2">
                        <span className="inline-flex items-center gap-1">
                          <Scissors className="w-3.5 h-3.5" />
                          {SERVICE_LABELS[a.service]}
                        </span>
                        <span className="text-gray-400">·</span>
                        <span>{a.durationMin} min</span>
                        <span className="text-gray-400">·</span>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(a.priceEur)}
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 mb-3 break-all">
                        {a.id}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {a.status === 'pendiente' && (
                          <button
                            type="button"
                            onClick={() => startAppointment(a.id)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold border-2 border-blue-700 hover:bg-blue-700"
                          >
                            <Play className="w-3.5 h-3.5" />
                            Iniciar
                          </button>
                        )}
                        {a.status === 'en_curso' && (
                          <button
                            type="button"
                            onClick={() => completeAppointment(a.id)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold border-2 border-emerald-700 hover:bg-emerald-700"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Completar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'caja' && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" />
                Servicios realizados
              </h3>
              <div className="flex flex-wrap gap-2">
                {QUICK_SERVICES.map((s) => (
                  <button
                    key={s.kind}
                    type="button"
                    onClick={() => addCheckoutService(s.kind, s.priceEur)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-2xl border-2 border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 text-xs font-semibold text-violet-800 dark:text-violet-200 hover:bg-violet-100 dark:hover:bg-violet-900/40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {SERVICE_LABELS[s.kind]} ({formatCurrency(s.priceEur)})
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-500" />
                Productos vendidos
              </h3>
              <div className="flex flex-wrap gap-2">
                {QUICK_PRODUCTS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => addCheckoutProduct(p.label, p.priceEur)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-xs font-semibold text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {p.label} ({formatCurrency(p.priceEur)})
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3">
                Ticket
              </h3>
              {checkoutLines.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">
                  Añade líneas desde los botones de arriba
                </p>
              ) : (
                <ul className="space-y-2 mb-4">
                  {checkoutLines.map((line) => (
                    <li
                      key={line.id}
                      className="flex items-center gap-2 p-3 rounded-2xl border-2 border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {line.label}
                        </p>
                        <p className="text-[10px] font-mono text-gray-400 truncate">{line.id}</p>
                        <span className="text-[10px] uppercase font-bold text-gray-500">
                          {line.type === 'servicio' ? 'Servicio' : 'Producto'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQty(line.id, -1)}
                          className="w-8 h-8 rounded-xl border-2 border-gray-200 dark:border-gray-600 text-sm font-bold hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-mono font-bold">
                          {line.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(line.id, 1)}
                          className="w-8 h-8 rounded-xl border-2 border-gray-200 dark:border-gray-600 text-sm font-bold hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-sm font-bold font-mono w-24 text-right shrink-0">
                        {formatCurrency(line.qty * line.unitPriceEur)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="p-2 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border-2 border-transparent hover:border-red-200"
                        aria-label="Eliminar línea"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center justify-between py-3 border-t-2 border-gray-200 dark:border-gray-700 mb-4">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Total</span>
                <span className="text-xl font-bold font-mono text-gray-900 dark:text-gray-100">
                  {formatCurrency(checkoutTotal)}
                </span>
              </div>

              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                Método de pago
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {(['efectivo', 'tarjeta', 'bizum'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-bold border-2 transition-all ${
                      paymentMethod === m
                        ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                        : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    {paymentIcons[m]}
                    {m === 'efectivo' ? 'Efectivo' : m === 'tarjeta' ? 'Tarjeta' : 'Bizum'}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={processPayment}
                disabled={checkoutLines.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-600 text-white font-bold text-sm border-2 border-emerald-700 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <DollarSign className="w-5 h-5" />
                Cobrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
