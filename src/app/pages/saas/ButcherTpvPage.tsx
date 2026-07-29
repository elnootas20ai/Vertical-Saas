import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { createButcherSaleRequest, searchButcherClientsRequest, listButcherClientsRequest, type ButcherClient } from '../../lib/butcherApi';
import { DecimalNumpadField } from '../../components/saas/DecimalNumpadField';
import { parseDecimalPadValue } from '../../lib/decimalNumpadInput';
import { isVertialNativeApp, printTicketDocument } from '../../lib/vertialPrint';
import { splitTicketVat, type TicketDocument } from '../../lib/vertialPrint/ticketDocument';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  ArrowLeft,
  Beef,
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  Banknote,
  CreditCard,
  Smartphone,
  Scale,
  Package,
  Printer,
  AlertTriangle,
  X,
  User,
  Percent,
  PauseCircle,
  PlayCircle,
  Bell,
  Wifi,
  WifiOff,
  Weight,
  ChevronRight,
  Lock,
  ShieldAlert,
  BadgeCheck,
  ReceiptText,
  Timer,
  TrendingUp,
  Tags,
  CircleDollarSign,
  Loader2,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────

type CutCategory = 'vacuno' | 'cerdo' | 'pollo' | 'cordero' | 'elaborados' | 'otros';
type PaymentMethod = 'efectivo' | 'tarjeta' | 'bizum';
type UnitMode = 'kg' | 'gramos' | 'unidades';

const CAT_LABEL: Record<CutCategory, string> = {
  vacuno: 'Vacuno',
  cerdo: 'Cerdo',
  pollo: 'Pollo',
  cordero: 'Cordero',
  elaborados: 'Elaborados',
  otros: 'Otros',
};

const CAT_ICON_COLOR: Record<CutCategory, { bg: string; text: string; border: string; badge: string }> = {
  vacuno: {
    bg: 'bg-red-50 dark:bg-red-950/40',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
    badge: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  },
  cerdo: {
    bg: 'bg-pink-50 dark:bg-pink-950/40',
    text: 'text-pink-700 dark:text-pink-300',
    border: 'border-pink-200 dark:border-pink-800',
    badge: 'bg-pink-100 dark:bg-pink-900/50 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800',
  },
  pollo: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
    badge: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  cordero: {
    bg: 'bg-orange-50 dark:bg-orange-950/40',
    text: 'text-orange-700 dark:text-orange-300',
    border: 'border-orange-200 dark:border-orange-800',
    badge: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  },
  elaborados: {
    bg: 'bg-violet-50 dark:bg-violet-950/40',
    text: 'text-violet-700 dark:text-violet-300',
    border: 'border-violet-200 dark:border-violet-800',
    badge: 'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800',
  },
  otros: {
    bg: 'bg-slate-50 dark:bg-slate-950/40',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-800',
    badge: 'bg-slate-100 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800',
  },
};

interface CatalogProduct extends VerticalEntity {
  nombre: string;
  categoria: CutCategory;
  precioKg: number;
  precioUnidad: number | null;
  stock: number;
  stockMinimo: number;
  unidadVenta: 'peso' | 'unidad';
  bloqueado: boolean;
  motivoBloqueo: string | null;
  fechaCaducidad: string | null;
  lote: string | null;
  precioActualizado: boolean;
}

interface TicketLine {
  id: string;
  productoId: string;
  nombre: string;
  categoria: CutCategory;
  cantidad: number;
  unidad: UnitMode;
  cantidadKg: number;
  precioUnitario: number;
  subtotal: number;
  descuento: number;
  total: number;
}

interface TicketDoc extends VerticalEntity {
  ticketNo: string;
  lines: TicketLine[];
  subtotal: number;
  descuentoTotal: number;
  total: number;
  method: PaymentMethod;
  entregado: number;
  cambio: number;
  clienteId: string | null;
  clienteNombre: string | null;
  workerId: string;
  workerName: string;
  timeIso: string;
}

interface CompletedSale {
  id: string;
  ticketNo: string;
  lines: TicketLine[];
  subtotal: number;
  descuentoTotal: number;
  total: number;
  method: PaymentMethod;
  entregado: number;
  cambio: number;
  clienteId: string | null;
  clienteNombre: string | null;
  workerId: string;
  workerName: string;
  time: Date;
}

interface ParkedTicket {
  id: string;
  lines: TicketLine[];
  total: number;
  clienteId: string | null;
  clienteNombre: string | null;
  parkedAt: Date;
  nota: string;
}

interface TpvAlert {
  id: string;
  type: 'stock' | 'price' | 'weight' | 'pending' | 'blocked';
  severity: 'error' | 'warning' | 'info';
  message: string;
  time: Date;
  productId?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatCurrency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function newLocalId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function nextTicketNoFromStored(tickets: { ticketNo: string }[]) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const prefix = `CARN-${y}${m}${day}-`;
  let max = 0;
  for (const t of tickets) {
    if (t.ticketNo?.startsWith(prefix)) {
      const n = parseInt(t.ticketNo.slice(prefix.length), 10);
      if (!isNaN(n)) max = Math.max(max, n);
    }
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

function convertToKg(cantidad: number, unidad: UnitMode): number {
  if (unidad === 'gramos') return cantidad / 1000;
  return cantidad;
}

// ─── Component ───────────────────────────────────────────────────

export function ButcherTpvPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const catalogApi = useMemo(() => createVerticalApi<CatalogProduct>('butcher-ops', 'catalog'), []);
  const ticketsApi = useMemo(() => createVerticalApi<TicketDoc>('butcher-ops', 'tickets'), []);
  const workerName = user?.firstName ? `${user.firstName} ${user?.lastName || ''}`.trim() : 'Trabajador';
  const workerId = user?.user_id || user?.id || 'worker-default';

  // ─── State ─────────────────────────────────────────────────────
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [salesHistory, setSalesHistory] = useState<CompletedSale[]>([]);
  const [filterCat, setFilterCat] = useState<CutCategory | 'all'>('all');
  const [searchProduct, setSearchProduct] = useState('');
  const [unitMode, setUnitMode] = useState<UnitMode>('kg');
  const [quantityInput, setQuantityInput] = useState('1');
  const [scaleConnected, setScaleConnected] = useState(false);
  const [scaleReading, setScaleReading] = useState<number | null>(null);

  const [clienteNombre, setClienteNombre] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState<string | null>(null);

  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [entregado, setEntregado] = useState('');

  const [showDiscount, setShowDiscount] = useState(false);
  const [discountLineId, setDiscountLineId] = useState<string | null>(null);
  const [discountValue, setDiscountValue] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountPin, setDiscountPin] = useState('');

  const [showClient, setShowClient] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<ButcherClient[]>([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ButcherClient | null>(null);

  const [parkedTickets, setParkedTickets] = useState<ParkedTicket[]>([]);
  const [showParked, setShowParked] = useState(false);
  const [parkNote, setParkNote] = useState('');
  const [showParkDialog, setShowParkDialog] = useState(false);

  const [alerts, setAlerts] = useState<TpvAlert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);

  const [showTicketPreview, setShowTicketPreview] = useState(false);
  const [lastSale, setLastSale] = useState<CompletedSale | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const quantityRef = useRef<HTMLInputElement>(null);

  const loadCatalog = useCallback(async () => {
    if (!userId) {
      setCatalogLoading(false);
      return;
    }
    setCatalogLoading(true);
    try {
      const list = await catalogApi.list(userId);
      setCatalog(list);
    } catch {
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [userId, catalogApi]);

  const docToSale = useCallback((doc: TicketDoc): CompletedSale => ({
    id: doc._id,
    ticketNo: doc.ticketNo,
    lines: doc.lines,
    subtotal: doc.subtotal,
    descuentoTotal: doc.descuentoTotal,
    total: doc.total,
    method: doc.method,
    entregado: doc.entregado,
    cambio: doc.cambio,
    clienteId: doc.clienteId,
    clienteNombre: doc.clienteNombre,
    workerId: doc.workerId,
    workerName: doc.workerName,
    time: new Date(doc.timeIso || doc.createdAt),
  }), []);

  const loadTickets = useCallback(async () => {
    if (!userId) return;
    try {
      const list = await ticketsApi.list(userId);
      setSalesHistory(list.map(docToSale));
    } catch {
      /* ignore */
    }
  }, [userId, ticketsApi, docToSale]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (!showClient || !userId) return;
    const q = clientSearch.trim();
    const timer = window.setTimeout(async () => {
      setClientSearchLoading(true);
      try {
        const res = q.length >= 2
          ? await searchButcherClientsRequest(userId, q)
          : await listButcherClientsRequest(userId);
        if (res.ok) {
          const list = (res.clients || []) as ButcherClient[];
          setClientResults(q.length >= 2 ? list : list.slice(0, 12));
        } else {
          setClientResults([]);
        }
      } catch {
        setClientResults([]);
      } finally {
        setClientSearchLoading(false);
      }
    }, q.length >= 2 ? 280 : 0);
    return () => window.clearTimeout(timer);
  }, [showClient, clientSearch, userId]);

  // ─── Computed ──────────────────────────────────────────────────

  const filteredCatalog = useMemo(() => {
    const q = searchProduct.toLowerCase().trim();
    return catalog.filter(p => {
      if (filterCat !== 'all' && p.categoria !== filterCat) return false;
      if (q && !p.nombre.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalog, filterCat, searchProduct]);

  const ticketSubtotal = useMemo(() => lines.reduce((s, l) => s + l.subtotal, 0), [lines]);
  const ticketDiscount = useMemo(() => lines.reduce((s, l) => s + l.descuento, 0), [lines]);
  const ticketTotal = useMemo(() => lines.reduce((s, l) => s + l.total, 0), [lines]);
  const ticketWeight = useMemo(() => lines.reduce((s, l) => s + l.cantidadKg, 0), [lines]);

  const cambio = useMemo(() => {
    const e = parseDecimalPadValue(entregado);
    if (!Number.isFinite(e)) return 0;
    return Math.max(0, e - ticketTotal);
  }, [entregado, ticketTotal]);

  const todayStats = useMemo(() => {
    const today = new Date().toDateString();
    const todaySales = salesHistory.filter(s => s.time.toDateString() === today);
    return {
      ventas: todaySales.length,
      ingresos: todaySales.reduce((s, r) => s + r.total, 0),
      ticketMedio: todaySales.length > 0 ? todaySales.reduce((s, r) => s + r.total, 0) / todaySales.length : 0,
    };
  }, [salesHistory]);

  const activeAlerts = useMemo(() => alerts.filter(a => {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    return a.time.getTime() > fiveMinAgo;
  }), [alerts]);

  // ─── Alert generation ─────────────────────────────────────────

  const addAlert = useCallback((type: TpvAlert['type'], severity: TpvAlert['severity'], message: string, productId?: string) => {
    setAlerts(prev => [{
      id: newLocalId(),
      type,
      severity,
      message,
      time: new Date(),
      productId,
    }, ...prev.slice(0, 49)]);
  }, []);

  useEffect(() => {
    catalog.forEach(p => {
      if (p.stock <= 0 && !p.bloqueado) {
        const existing = alerts.find(a => a.productId === p._id && a.type === 'stock' && Date.now() - a.time.getTime() < 60000);
        if (!existing) addAlert('stock', 'error', `${p.nombre}: sin stock`, p._id);
      }
      if (p.stock > 0 && p.stock <= p.stockMinimo) {
        const existing = alerts.find(a => a.productId === p._id && a.type === 'stock' && a.severity === 'warning' && Date.now() - a.time.getTime() < 60000);
        if (!existing) addAlert('stock', 'warning', `${p.nombre}: stock bajo (${p.stock} kg)`, p._id);
      }
      if (!p.precioActualizado) {
        const existing = alerts.find(a => a.productId === p._id && a.type === 'price' && Date.now() - a.time.getTime() < 60000);
        if (!existing) addAlert('price', 'warning', `${p.nombre}: precio sin actualizar`, p._id);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  useEffect(() => {
    if (parkedTickets.length > 0) {
      const oldest = parkedTickets[parkedTickets.length - 1];
      const minAgo = Math.floor((Date.now() - oldest.parkedAt.getTime()) / 60000);
      if (minAgo >= 5) {
        const existing = alerts.find(a => a.type === 'pending' && Date.now() - a.time.getTime() < 120000);
        if (!existing) addAlert('pending', 'info', `${parkedTickets.length} ticket(s) pendiente(s) de cobro`);
      }
    }
  }, [parkedTickets, addAlert, alerts]);

  // ─── Scale simulation ─────────────────────────────────────────

  const toggleScale = () => {
    setScaleConnected(prev => {
      const next = !prev;
      toast[next ? 'success' : 'info'](next ? 'Báscula conectada' : 'Báscula desconectada');
      if (!next) setScaleReading(null);
      return next;
    });
  };

  const readScale = () => {
    if (!scaleConnected) {
      toast.error('Báscula no conectada');
      addAlert('weight', 'error', 'Lectura de báscula fallida: no conectada');
      return;
    }
    const simulated = +(Math.random() * 3 + 0.1).toFixed(3);
    setScaleReading(simulated);
    setQuantityInput(String(simulated));
    setUnitMode('kg');
    toast.success(`Peso leído: ${simulated} kg`);
  };

  // ─── Product actions ──────────────────────────────────────────

  const addToTicket = useCallback((product: CatalogProduct) => {
    if (product.bloqueado) {
      toast.error(`Producto bloqueado: ${product.motivoBloqueo || 'motivo desconocido'}`);
      addAlert('blocked', 'error', `${product.nombre}: bloqueado — ${product.motivoBloqueo}`, product._id);
      return;
    }

    const raw = parseDecimalPadValue(quantityInput);
    if (!Number.isFinite(raw) || raw <= 0) {
      toast.error('Indica una cantidad válida');
      addAlert('weight', 'error', 'Cantidad introducida no válida');
      return;
    }

    const isUnidad = product.unidadVenta === 'unidad';
    const effectiveUnit: UnitMode = isUnidad ? 'unidades' : unitMode;
    const cantidadKg = isUnidad ? 0 : convertToKg(raw, unitMode);
    const cantidad = isUnidad ? Math.round(raw) : raw;

    if (!isUnidad && cantidadKg > product.stock) {
      toast.error(`Stock insuficiente (${product.stock} kg disponibles)`);
      addAlert('stock', 'error', `${product.nombre}: intento de vender ${cantidadKg.toFixed(2)} kg, stock: ${product.stock} kg`, product._id);
      return;
    }
    if (isUnidad && cantidad > product.stock) {
      toast.error(`Stock insuficiente (${product.stock} unidades disponibles)`);
      addAlert('stock', 'error', `${product.nombre}: intento de vender ${cantidad} ud, stock: ${product.stock} ud`, product._id);
      return;
    }

    if (!product.precioActualizado) {
      toast.warning('Atención: el precio de este producto puede no estar actualizado');
    }

    const precioUnitario = isUnidad ? (product.precioUnidad ?? 0) : product.precioKg;
    const multiplier = isUnidad ? cantidad : cantidadKg;
    const subtotal = +(multiplier * precioUnitario).toFixed(2);

    setLines(prev => [...prev, {
      id: newLocalId(),
      productoId: product._id,
      nombre: product.nombre,
      categoria: product.categoria,
      cantidad,
      unidad: effectiveUnit,
      cantidadKg,
      precioUnitario,
      subtotal,
      descuento: 0,
      total: subtotal,
    }]);

    const stockDecrement = isUnidad ? cantidad : cantidadKg;
    setCatalog(prev => prev.map(p =>
      p._id === product._id ? { ...p, stock: +(p.stock - stockDecrement).toFixed(3) } : p,
    ));

    const label = isUnidad
      ? `${product.nombre} × ${cantidad} ud`
      : `${product.nombre} — ${effectiveUnit === 'gramos' ? `${cantidad} g` : `${cantidadKg.toFixed(2)} kg`}`;
    toast.success(label);

    setQuantityInput('1');
    if (scaleReading !== null) setScaleReading(null);
  }, [quantityInput, unitMode, scaleReading, addAlert]);

  const updateLineQuantity = (lineId: string, delta: number) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      const isUnidad = l.unidad === 'unidades';
      const step = isUnidad ? 1 : (l.unidad === 'gramos' ? 50 : 0.1);
      const newCant = Math.max(isUnidad ? 1 : 0.1, +(l.cantidad + delta * step).toFixed(3));
      const newKg = isUnidad ? 0 : convertToKg(newCant, l.unidad);
      const subtotal = +(((isUnidad ? newCant : newKg) * l.precioUnitario).toFixed(2));
      const total = +(subtotal - l.descuento).toFixed(2);
      return { ...l, cantidad: newCant, cantidadKg: newKg, subtotal, total: Math.max(0, total) };
    }));
  };

  const removeLine = (lineId: string) => {
    const line = lines.find(l => l.id === lineId);
    if (line) {
      const product = catalog.find(p => p._id === line.productoId);
      if (product) {
        const restore = line.unidad === 'unidades' ? line.cantidad : line.cantidadKg;
        setCatalog(prev => prev.map(p =>
          p._id === line.productoId ? { ...p, stock: +(p.stock + restore).toFixed(3) } : p,
        ));
      }
    }
    setLines(prev => prev.filter(l => l.id !== lineId));
  };

  // ─── Discounts ─────────────────────────────────────────────────

  const openDiscount = (lineId: string) => {
    setDiscountLineId(lineId);
    setDiscountValue('');
    setDiscountType('percent');
    setDiscountPin('');
    setShowDiscount(true);
  };

  const applyDiscount = () => {
    if (discountPin !== '1234') {
      toast.error('PIN de autorización incorrecto');
      return;
    }
    const val = parseDecimalPadValue(discountValue);
    if (!Number.isFinite(val) || val <= 0) {
      toast.error('Indica un descuento válido');
      return;
    }
    setLines(prev => prev.map(l => {
      if (l.id !== discountLineId) return l;
      const desc = discountType === 'percent'
        ? +(l.subtotal * Math.min(val, 100) / 100).toFixed(2)
        : Math.min(val, l.subtotal);
      return { ...l, descuento: desc, total: +(l.subtotal - desc).toFixed(2) };
    }));
    setShowDiscount(false);
    toast.success('Descuento aplicado');
  };

  // ─── Client ────────────────────────────────────────────────────

  const selectClient = (client: ButcherClient) => {
    setClienteId(client._id);
    setClienteNombre(client.name);
    setSelectedClient(client);
    setShowClient(false);
    setClientSearch('');
    toast.success(`Cliente: ${client.name}`);
  };

  const clearClient = () => {
    setClienteId(null);
    setClienteNombre(null);
    setSelectedClient(null);
  };

  // ─── Park / Resume ticket ─────────────────────────────────────

  const parkTicket = () => {
    if (lines.length === 0) return;
    setParkedTickets(prev => [...prev, {
      id: newLocalId(),
      lines: [...lines],
      total: ticketTotal,
      clienteId,
      clienteNombre,
      parkedAt: new Date(),
      nota: parkNote,
    }]);
    setLines([]);
    setClienteNombre(null);
    setClienteId(null);
    setSelectedClient(null);
    setParkNote('');
    setShowParkDialog(false);
    addAlert('pending', 'info', 'Ticket aparcado pendiente de cobro');
    toast.info('Ticket aparcado');
  };

  const resumeTicket = (parkedId: string) => {
    const parked = parkedTickets.find(p => p.id === parkedId);
    if (!parked) return;
    if (lines.length > 0) {
      toast.error('Cobra o aparca el ticket actual antes de recuperar otro');
      return;
    }
    setLines(parked.lines);
    if (parked.clienteNombre) setClienteNombre(parked.clienteNombre);
    if (parked.clienteId) setClienteId(parked.clienteId);
    setSelectedClient(null);
    setParkedTickets(prev => prev.filter(p => p.id !== parkedId));
    setShowParked(false);
    toast.success('Ticket recuperado');
  };

  const deleteParked = (parkedId: string) => {
    const parked = parkedTickets.find(p => p.id === parkedId);
    if (parked) {
      parked.lines.forEach(l => {
        const restore = l.unidad === 'unidades' ? l.cantidad : l.cantidadKg;
        setCatalog(prev => prev.map(p =>
          p._id === l.productoId ? { ...p, stock: +(p.stock + restore).toFixed(3) } : p,
        ));
      });
    }
    setParkedTickets(prev => prev.filter(p => p.id !== parkedId));
    toast.info('Ticket descartado');
  };

  // ─── Payment ───────────────────────────────────────────────────

  const processPayment = async () => {
    if (lines.length === 0) return;
    if (paymentMethod === 'efectivo') {
      const e = parseDecimalPadValue(entregado);
      if (!Number.isFinite(e) || e < ticketTotal) {
        toast.error('El importe entregado es insuficiente');
        return;
      }
    }

    if (!userId) {
      toast.error('Sesión no disponible');
      return;
    }

    const ticketNo = nextTicketNoFromStored(salesHistory);
    const ent = paymentMethod === 'efectivo' ? parseDecimalPadValue(entregado) || ticketTotal : ticketTotal;
    const cambioVal = paymentMethod === 'efectivo' ? Math.max(0, ent - ticketTotal) : 0;
    const linesSnapshot = [...lines];
    const catalogSnapshot = [...catalog];
    const timeIso = new Date().toISOString();

    try {
      const created = await ticketsApi.create(userId, {
        ticketNo,
        lines: linesSnapshot,
        subtotal: ticketSubtotal,
        descuentoTotal: ticketDiscount,
        total: ticketTotal,
        method: paymentMethod,
        entregado: ent,
        cambio: cambioVal,
        clienteId,
        clienteNombre,
        workerId,
        workerName,
        timeIso,
      });
      for (const line of linesSnapshot) {
        const p = catalogSnapshot.find(c => c._id === line.productoId);
        if (p) {
          await catalogApi.update(userId, p._id, { stock: p.stock });
        }
      }
      await loadCatalog();
      await loadTickets();
      const sale = docToSale(created);
      setLastSale(sale);
      setLines([]);
      setShowPayment(false);
      setEntregado('');
      setClienteNombre(null);
      setClienteId(null);
      setSelectedClient(null);
      toast.success(`Venta registrada — ${ticketNo}`);
      setShowTicketPreview(true);
      const pmMap: Record<string, string> = { efectivo: 'cash', tarjeta: 'card', bizum: 'bizum' };
      createButcherSaleRequest(userId, {
        clientId: sale.clienteId || undefined,
        clientName: sale.clienteNombre || '',
        items: sale.lines.map((l: { nombre: string; cantidad: number; unit?: string; precioUnitario: number; subtotal: number }) => ({
          productName: l.nombre, quantity: l.cantidad, unit: l.unit || 'kg',
          pricePerUnit: l.precioUnitario, subtotal: l.subtotal,
        })),
        total: sale.total,
        totalWeight: sale.lines.reduce((s: number, l: { unit?: string; cantidad: number }) => s + (l.unit === 'kg' ? Number(l.cantidad) : 0), 0),
        paymentMethod: pmMap[sale.method] || 'cash',
        soldBy: workerName,
      } as Record<string, unknown>).catch(() => {});
    } catch {
      toast.error('No se pudo registrar la venta en el servidor');
    }
  };

  // ─── Print ─────────────────────────────────────────────────────

function butcherSaleToTicketDoc(sale: CompletedSale): TicketDocument {
  const { base, vat } = splitTicketVat(sale.total, 21);
  const pm: Record<PaymentMethod, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', bizum: 'Bizum' };
  return {
    variant: 'customer',
    title: 'CARNICERIA',
    ticketNo: sale.ticketNo,
    dateLabel: sale.time.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }),
    issuer: 'Carniceria',
    taxId: '',
    addressLine: '',
    phone: '',
    salesPointName: '',
    orderNumber: sale.ticketNo,
    customerName: sale.clienteNombre || 'Cliente',
    customerPhone: '',
    customerAddress: '',
    emphasizeCustomerAddress: false,
    deliveryTypeLabel: '',
    cashierName: sale.workerName,
    lines: sale.lines.map((l) => ({
      qty: l.unidad === 'unidades' ? l.cantidad : Number(l.cantidadKg.toFixed(3)),
      name: l.nombre,
      total: l.total,
      note: l.descuento > 0 ? `Dto -${l.descuento.toFixed(2)} EUR` : undefined,
    })),
    base,
    vat,
    vatRate: 21,
    total: sale.total,
    paymentLabel: pm[sale.method] || sale.method,
    paymentStatusLabel: 'Cobrado',
    refundReason: '',
    orderNotes:
      sale.method === 'efectivo'
        ? `Entregado ${sale.entregado.toFixed(2)} EUR · Cambio ${sale.cambio.toFixed(2)} EUR`
        : '',
    footer: 'Gracias por su compra',
    isRefund: false,
  };
}

  const printTicket = async (sale: CompletedSale) => {
    if (isVertialNativeApp()) {
      try {
        const result = await printTicketDocument(butcherSaleToTicketDoc(sale));
        if (result.ok) toast.success('Ticket enviado a la impresora');
      } catch {
        toast.error('No se pudo imprimir el ticket');
      }
      return;
    }

    const w = window.open('', '_blank', 'width=320,height=600');
    if (!w) {
      toast.error('No se pudo abrir la ventana de impresión');
      return;
    }

    const linesHtml = sale.lines.map(l => {
      const cantLabel = l.unidad === 'unidades' ? `${l.cantidad} ud` : `${l.cantidadKg.toFixed(2)} kg`;
      const priceLabel = l.unidad === 'unidades' ? `${formatCurrency(l.precioUnitario)}/ud` : `${formatCurrency(l.precioUnitario)}/kg`;
      const descHtml = l.descuento > 0 ? `<div style="color:#999;font-size:11px">  Dto: -${formatCurrency(l.descuento)}</div>` : '';
      return `
        <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dotted #ddd">
          <div style="flex:1">
            <div style="font-weight:600">${l.nombre}</div>
            <div style="color:#666;font-size:11px">${cantLabel} × ${priceLabel}</div>
            ${descHtml}
          </div>
          <div style="font-weight:700;white-space:nowrap;padding-left:8px">${formatCurrency(l.total)}</div>
        </div>`;
    }).join('');

    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket ${sale.ticketNo}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Courier New',monospace;width:280px;margin:0 auto;padding:16px 8px;font-size:13px;color:#222}
        .center{text-align:center}
        .divider{border-top:2px dashed #aaa;margin:10px 0}
        .bold{font-weight:700}
        .total-line{display:flex;justify-content:space-between;padding:2px 0}
        .big-total{font-size:20px;font-weight:900;text-align:center;margin:8px 0}
        @media print{body{width:auto}}
      </style></head><body>
      <div class="center">
        <div style="font-size:16px;font-weight:800">🥩 CARNICERÍA</div>
        <div style="font-size:11px;color:#666;margin:4px 0">Tu carnicería de confianza</div>
        <div class="divider"></div>
        <div style="font-size:11px;color:#888">
          ${sale.time.toLocaleDateString('es-ES')} ${sale.time.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div style="font-weight:700;font-size:14px;margin:4px 0">${sale.ticketNo}</div>
        <div style="font-size:11px;color:#888">Atendido por: ${sale.workerName}</div>
        ${sale.clienteNombre ? `<div style="font-size:11px;color:#888">Cliente: ${sale.clienteNombre}</div>` : ''}
      </div>
      <div class="divider"></div>
      ${linesHtml}
      <div class="divider"></div>
      <div class="total-line"><span>Subtotal</span><span>${formatCurrency(sale.subtotal)}</span></div>
      ${sale.descuentoTotal > 0 ? `<div class="total-line" style="color:#e11d48"><span>Descuento</span><span>-${formatCurrency(sale.descuentoTotal)}</span></div>` : ''}
      <div class="big-total">${formatCurrency(sale.total)}</div>
      <div class="divider"></div>
      <div class="total-line"><span>Pago</span><span class="bold">${sale.method === 'efectivo' ? 'Efectivo' : sale.method === 'tarjeta' ? 'Tarjeta' : 'Bizum'}</span></div>
      ${sale.method === 'efectivo' ? `
        <div class="total-line"><span>Entregado</span><span>${formatCurrency(sale.entregado)}</span></div>
        <div class="total-line bold"><span>Cambio</span><span>${formatCurrency(sale.cambio)}</span></div>
      ` : ''}
      <div class="divider"></div>
      <div class="center" style="font-size:11px;color:#888;margin-top:8px">
        ¡Gracias por su compra!<br>Conserve este ticket para devoluciones.
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 250);
  };

  // ─── Quick weight buttons ─────────────────────────────────────

  const quickWeights = [
    { label: '100g', value: 100, unit: 'gramos' as UnitMode },
    { label: '250g', value: 250, unit: 'gramos' as UnitMode },
    { label: '500g', value: 500, unit: 'gramos' as UnitMode },
    { label: '1 kg', value: 1, unit: 'kg' as UnitMode },
    { label: '2 kg', value: 2, unit: 'kg' as UnitMode },
    { label: '1 ud', value: 1, unit: 'unidades' as UnitMode },
  ];

  // ─── Keyboard shortcut ─────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'F3') { e.preventDefault(); quantityRef.current?.focus(); }
      if (e.key === 'F4') { e.preventDefault(); readScale(); }
      if (e.key === 'F8' && lines.length > 0) { e.preventDefault(); setShowPayment(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length, scaleConnected]);

  // ─── Product status helpers ────────────────────────────────────

  function getProductStatus(p: CatalogProduct) {
    if (p.bloqueado) return { label: 'Bloqueado', color: 'bg-gray-500', blocked: true };
    if (p.stock <= 0) return { label: 'Agotado', color: 'bg-red-500', blocked: true };
    if (p.stock <= p.stockMinimo) return { label: 'Bajo stock', color: 'bg-amber-500', blocked: false };
    return { label: 'Disponible', color: 'bg-emerald-500', blocked: false };
  }

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50 dark:bg-gray-950">
      {/* ══════ HEADER ══════ */}
      <header className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex shrink-0 items-center gap-1 px-2 py-1.5 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-9 h-9 bg-gradient-to-br from-red-500 to-red-700 rounded-xl flex items-center justify-center shadow-sm shrink-0">
              <Beef className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate leading-tight">
                TPV Carnicería
              </h1>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <BadgeCheck className="w-3 h-3" />
                  {workerName}
                </span>
                <span className="text-gray-300 dark:text-gray-700">|</span>
                <span>{new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Stats pills */}
            <div className="hidden md:flex items-center gap-1.5">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(todayStats.ingresos)}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                <ReceiptText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{todayStats.ventas}</span>
              </div>
            </div>

            {/* Scale toggle */}
            <button
              type="button"
              onClick={toggleScale}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                scaleConnected
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
              }`}
              title={scaleConnected ? 'Báscula conectada' : 'Báscula desconectada'}
            >
              {scaleConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <Scale className="w-3.5 h-3.5" />
            </button>

            {/* Parked tickets */}
            {parkedTickets.length > 0 && (
              <button
                type="button"
                onClick={() => setShowParked(true)}
                className="relative flex items-center gap-1 px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-semibold"
              >
                <PauseCircle className="w-3.5 h-3.5" />
                <span>{parkedTickets.length}</span>
              </button>
            )}

            {/* Alerts */}
            <button
              type="button"
              onClick={() => setShowAlerts(true)}
              className="relative p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Bell className="w-4.5 h-4.5 text-gray-500 dark:text-gray-400" />
              {activeAlerts.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {activeAlerts.length > 9 ? '9+' : activeAlerts.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ══════ MAIN BODY ══════ */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">

        {/* ── LEFT: Products ── */}
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Search + filters */}
          <div className="shrink-0 px-3 pt-3 pb-2 space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={searchRef}
                  value={searchProduct}
                  onChange={e => setSearchProduct(e.target.value)}
                  placeholder="Buscar producto... (F2)"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-red-500/30 focus:border-red-400 outline-none transition-shadow"
                />
              </div>
            </div>

            {/* Category pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
              <button
                type="button"
                onClick={() => setFilterCat('all')}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  filterCat === 'all'
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                }`}
              >
                Todos
              </button>
              {(Object.keys(CAT_LABEL) as CutCategory[]).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCat(cat)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    filterCat === cat
                      ? `${CAT_ICON_COLOR[cat].bg} ${CAT_ICON_COLOR[cat].text} ${CAT_ICON_COLOR[cat].border}`
                      : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  {CAT_LABEL[cat]}
                </button>
              ))}
            </div>
          </div>

          {/* Product grid */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
              {catalogLoading ? (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-400">
                  <Loader2 className="w-10 h-10 mb-2 animate-spin opacity-60" />
                  <p className="text-sm">Cargando catálogo…</p>
                </div>
              ) : filteredCatalog.map(p => {
                const status = getProductStatus(p);
                const cat = CAT_ICON_COLOR[p.categoria] ?? CAT_ICON_COLOR.otros;
                return (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => addToTicket(p)}
                    disabled={status.blocked}
                    className={`relative text-left p-3 rounded-xl border transition-all group ${
                      status.blocked
                        ? 'border-gray-200 dark:border-gray-800 opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-900'
                        : `border-gray-200 dark:border-gray-700 hover:border-red-400 dark:hover:border-red-600 hover:shadow-lg hover:shadow-red-500/5 active:scale-[0.98] bg-white dark:bg-gray-900`
                    }`}
                  >
                    {/* Status dot */}
                    <span className={`absolute top-2.5 right-2.5 w-2 h-2 rounded-full ${status.color}`} />

                    {/* Blocked overlay */}
                    {status.blocked && p.bloqueado && (
                      <span className="absolute top-2 left-2">
                        <Lock className="w-3.5 h-3.5 text-gray-400" />
                      </span>
                    )}

                    <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight pr-4 line-clamp-2">
                      {p.nombre}
                    </p>
                    <span className={`inline-flex mt-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${cat.badge}`}>
                      {CAT_LABEL[p.categoria] ?? String(p.categoria)}
                    </span>
                    <div className="flex justify-between items-end mt-2 gap-1">
                      <span className="text-red-600 dark:text-red-400 font-bold text-sm">
                        {p.unidadVenta === 'unidad'
                          ? `${formatCurrency(p.precioUnidad ?? 0)}/ud`
                          : `${formatCurrency(p.precioKg)}/kg`
                        }
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {p.stock} {p.unidadVenta === 'unidad' ? 'ud' : 'kg'}
                      </span>
                    </div>

                    {!p.precioActualizado && !status.blocked && (
                      <div className="absolute bottom-2 right-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      </div>
                    )}
                  </button>
                );
              })}
              {!catalogLoading && filteredCatalog.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-400">
                  <Package className="w-10 h-10 mb-2 opacity-40" />
                  <p className="text-sm">Sin productos para este filtro</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Scale + Ticket ── */}
        <div className="lg:w-[420px] xl:w-[460px] shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col max-h-[60vh] lg:max-h-none">

          {/* Scale / Quantity input zone */}
          <div className="shrink-0 p-3 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-900">
            <div className="flex items-center gap-2 mb-2">
              <Scale className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cantidad / Peso</span>
              {scaleConnected && scaleReading !== null && (
                <span className="ml-auto text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Wifi className="w-3 h-3" />
                  Báscula: {scaleReading} kg
                </span>
              )}
            </div>

            <div className="flex gap-2 items-stretch">
              {/* Unit selector */}
              <div className="flex flex-col gap-0.5 shrink-0">
                {(['kg', 'gramos', 'unidades'] as UnitMode[]).map(u => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnitMode(u)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                      unitMode === u
                        ? 'bg-red-600 border-red-600 text-white shadow-sm'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400'
                    }`}
                  >
                    {u === 'kg' ? 'KG' : u === 'gramos' ? 'GRAMOS' : 'UNID.'}
                  </button>
                ))}
              </div>

              {/* Quantity input */}
              <div className="flex-1 relative">
                <DecimalNumpadField
                  inputRef={quantityRef}
                  value={quantityInput}
                  onChange={setQuantityInput}
                  placeholder="0"
                  showNumpad
                  maxDecimals={unitMode === 'kg' ? 3 : unitMode === 'gramos' ? 0 : 0}
                  inputClassName="w-full h-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-2xl font-black text-center text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400 transition-shadow"
                  suffix={
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">
                      {unitMode === 'kg' ? 'kg' : unitMode === 'gramos' ? 'g' : 'ud'}
                    </span>
                  }
                />
              </div>

              {/* Read scale button */}
              <button
                type="button"
                onClick={readScale}
                disabled={!scaleConnected}
                className={`shrink-0 flex flex-col items-center justify-center gap-1 px-3 rounded-xl border-2 text-xs font-semibold transition-all ${
                  scaleConnected
                    ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
                }`}
                title="Leer báscula (F4)"
              >
                <Weight className="w-5 h-5" />
                <span className="text-[10px]">LEER</span>
              </button>
            </div>

            {/* Quick weight buttons */}
            <div className="flex gap-1 mt-2 flex-wrap">
              {quickWeights.map(qw => (
                <button
                  key={qw.label}
                  type="button"
                  onClick={() => { setQuantityInput(String(qw.value)); setUnitMode(qw.unit); }}
                  className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[11px] font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  {qw.label}
                </button>
              ))}
            </div>
          </div>

          {/* Client bar */}
          <div className="shrink-0 px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowClient(true)}
              className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                clienteNombre
                  ? 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-400'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              {clienteNombre || 'Identificar cliente (opcional)'}
            </button>
            {clienteNombre && (
              <button
                type="button"
                onClick={clearClient}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {selectedClient?.preferences?.usualProducts?.length ? (
            <div className="shrink-0 px-3 pb-2 flex flex-wrap gap-1">
              {selectedClient.preferences.usualProducts.slice(0, 4).map((p) => (
                <span
                  key={`${p.productName}-${p.quantity}`}
                  className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[10px] font-medium text-amber-800 dark:text-amber-300"
                >
                  {p.productName} · {p.quantity}{p.unit}
                </span>
              ))}
            </div>
          ) : null}

          {/* Ticket lines */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
            {lines.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600 py-12">
                <ShoppingCart className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm font-medium">Ticket vacío</p>
                <p className="text-xs mt-1">Pulsa un producto para añadirlo</p>
              </div>
            ) : (
              lines.map((l, i) => (
                <div
                  key={l.id}
                  className="flex items-center gap-2 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 hover:bg-gray-100/80 dark:hover:bg-gray-800/50 transition-colors group"
                >
                  <div className="w-5 text-center text-[10px] font-bold text-gray-400">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{l.nombre}</p>
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-0.5">
                      <span>
                        {l.unidad === 'unidades'
                          ? `${l.cantidad} ud × ${formatCurrency(l.precioUnitario)}`
                          : `${l.cantidadKg.toFixed(2)} kg × ${formatCurrency(l.precioUnitario)}/kg`
                        }
                      </span>
                      {l.descuento > 0 && (
                        <span className="text-red-500 font-semibold">-{formatCurrency(l.descuento)}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-900 dark:text-white whitespace-nowrap">
                    {formatCurrency(l.total)}
                  </span>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => updateLineQuantity(l.id, -1)} className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700">
                      <Minus className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button type="button" onClick={() => updateLineQuantity(l.id, 1)} className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700">
                      <Plus className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button type="button" onClick={() => openDiscount(l.id)} className="p-1 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/30">
                      <Percent className="w-3.5 h-3.5 text-amber-600" />
                    </button>
                    <button type="button" onClick={() => removeLine(l.id)} className="p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30">
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Ticket footer / totals */}
          <div className="shrink-0 border-t-2 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            {lines.length > 0 && (
              <div className="px-4 pt-3 space-y-1 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>{lines.length} línea{lines.length > 1 ? 's' : ''} · {ticketWeight.toFixed(2)} kg</span>
                  <span>Subtotal: {formatCurrency(ticketSubtotal)}</span>
                </div>
                {ticketDiscount > 0 && (
                  <div className="flex justify-between text-red-500 font-medium">
                    <span>Descuento</span>
                    <span>-{formatCurrency(ticketDiscount)}</span>
                  </div>
                )}
              </div>
            )}
            <div className="px-4 py-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">TOTAL</span>
              <span className="text-2xl font-black text-red-600 dark:text-red-400">{formatCurrency(ticketTotal)}</span>
            </div>
            <div className="px-3 pb-3 flex gap-2">
              <button
                type="button"
                disabled={lines.length === 0}
                onClick={() => setShowParkDialog(true)}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Aparcar ticket"
              >
                <PauseCircle className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={lines.length === 0}
                onClick={() => { setShowPayment(true); setEntregado(''); }}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:from-red-700 hover:to-red-600 shadow-lg shadow-red-500/20 transition-all active:scale-[0.98]"
              >
                <CircleDollarSign className="w-5 h-5" />
                Cobrar (F8)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══════ MODALS ══════ */}

      {/* Payment Modal */}
      {showPayment && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPayment(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Confirmar cobro</h2>
              <p className="text-3xl font-black text-red-600 dark:text-red-400 mt-1">{formatCurrency(ticketTotal)}</p>
              {clienteNombre && (
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <User className="w-3 h-3" /> {clienteNombre}
                </p>
              )}
            </div>

            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Método de pago</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'efectivo' as const, label: 'Efectivo', icon: Banknote },
                    { id: 'tarjeta' as const, label: 'Tarjeta', icon: CreditCard },
                  ]).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPaymentMethod(id)}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-semibold transition-all ${
                        paymentMethod === id
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 shadow-sm'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400'
                      }`}
                    >
                      <Icon className="w-6 h-6" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === 'efectivo' && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wider">Importe entregado</label>
                  <DecimalNumpadField
                    value={entregado}
                    onChange={setEntregado}
                    placeholder={ticketTotal.toFixed(2)}
                    showNumpad
                    autoFocus
                    inputClassName="w-full px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xl font-bold text-center outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
                  />
                  {cambio > 0 && (
                    <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                      <span className="text-xs font-semibold text-emerald-600">Cambio</span>
                      <span className="text-lg font-black text-emerald-700 dark:text-emerald-300">{formatCurrency(cambio)}</span>
                    </div>
                  )}
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {[5, 10, 20, 50].map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setEntregado(String(v))}
                        className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-200"
                      >
                        {v} €
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEntregado(ticketTotal.toFixed(2))}
                      className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-200"
                    >
                      Justo
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 pb-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowPayment(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-400"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={processPayment}
                className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white font-bold text-sm shadow-lg shadow-red-500/20 hover:from-red-700 hover:to-red-600 transition-all"
              >
                Confirmar cobro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {showDiscount && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDiscount(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm border border-gray-200 dark:border-gray-800 p-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
              <Tags className="w-5 h-5 text-amber-500" />
              Aplicar descuento
            </h2>
            <p className="text-xs text-gray-500 mb-4">Requiere autorización del gerente</p>

            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDiscountType('percent')}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 ${
                    discountType === 'percent' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700' : 'border-gray-200 dark:border-gray-700 text-gray-500'
                  }`}
                >
                  Porcentaje %
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType('amount')}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border-2 ${
                    discountType === 'amount' ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-700' : 'border-gray-200 dark:border-gray-700 text-gray-500'
                  }`}
                >
                  Importe €
                </button>
              </div>
              <DecimalNumpadField
                value={discountValue}
                onChange={setDiscountValue}
                placeholder={discountType === 'percent' ? 'Ej: 10' : 'Ej: 2.50'}
                showNumpad
                inputClassName="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-center font-bold outline-none focus:border-amber-400"
              />
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">PIN gerente</label>
                <input
                  type="password"
                  maxLength={6}
                  value={discountPin}
                  onChange={e => setDiscountPin(e.target.value)}
                  placeholder="····"
                  className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-center text-lg tracking-[0.3em] font-bold outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => setShowDiscount(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600">Cancelar</button>
              <button type="button" onClick={applyDiscount} className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold">Aplicar</button>
            </div>
          </div>
        </div>
      )}

      {/* Client Search Modal */}
      {showClient && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowClient(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md border border-gray-200 dark:border-gray-800 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-500" />
                Identificar cliente
              </h2>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  placeholder="Buscar por nombre o teléfono..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm outline-none focus:border-blue-400"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
              {clientSearchLoading && (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Buscando...
                </div>
              )}
              {!clientSearchLoading && clientResults.map(c => (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => selectClient(c)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:border-blue-300 dark:hover:border-blue-800 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 text-sm font-bold shrink-0">
                    {c.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.phone || 'Sin teléfono'}</p>
                    {c.preferences?.usualProducts?.length ? (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5 truncate">
                        Habitual: {c.preferences.usualProducts.slice(0, 2).map((p) => p.productName).join(', ')}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 ml-auto shrink-0" />
                </button>
              ))}
              {!clientSearchLoading && clientResults.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">
                  {clientSearch.trim().length >= 2 ? 'Sin resultados' : 'Sin clientes habituales todavía'}
                </p>
              )}
            </div>
            <div className="p-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
              <button
                type="button"
                onClick={() => { clearClient(); setShowClient(false); toast.info('Venta anónima'); }}
                className="w-full py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Continuar sin cliente
              </button>
              <button
                type="button"
                onClick={() => setShowClient(false)}
                className="w-full py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-400"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Park Ticket Dialog */}
      {showParkDialog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowParkDialog(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm border border-gray-200 dark:border-gray-800 p-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <PauseCircle className="w-5 h-5 text-amber-500" />
              Aparcar ticket
            </h2>
            <p className="text-xs text-gray-500 mt-1 mb-3">{lines.length} línea(s) · {formatCurrency(ticketTotal)}</p>
            <input
              value={parkNote}
              onChange={e => setParkNote(e.target.value)}
              placeholder="Nota (opcional): ej. Cliente esperando, va a buscar dinero..."
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm outline-none focus:border-amber-400 mb-4"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowParkDialog(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600">Cancelar</button>
              <button type="button" onClick={parkTicket} className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold">Aparcar</button>
            </div>
          </div>
        </div>
      )}

      {/* Parked Tickets Modal */}
      {showParked && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowParked(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md border border-gray-200 dark:border-gray-800 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <PauseCircle className="w-5 h-5 text-amber-500" />
                Tickets aparcados ({parkedTickets.length})
              </h2>
              <button type="button" onClick={() => setShowParked(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
              {parkedTickets.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Sin tickets aparcados</p>
              ) : parkedTickets.map(pt => (
                <div key={pt.id} className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                        {pt.lines.length} línea{pt.lines.length > 1 ? 's' : ''} · {formatCurrency(pt.total)}
                      </p>
                      {pt.clienteNombre && <p className="text-xs text-gray-500">{pt.clienteNombre}</p>}
                      {pt.nota && <p className="text-xs text-gray-400 italic mt-0.5">{pt.nota}</p>}
                      <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                        <Timer className="w-3 h-3" />
                        {pt.parkedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}
                        hace {Math.floor((Date.now() - pt.parkedAt.getTime()) / 60000)} min
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => resumeTicket(pt.id)}
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-emerald-500 text-white text-xs font-bold"
                    >
                      <PlayCircle className="w-3.5 h-3.5" /> Recuperar
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteParked(pt.id)}
                      className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Alerts Panel */}
      {showAlerts && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAlerts(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md border border-gray-200 dark:border-gray-800 max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-500" />
                Alertas
              </h2>
              <button type="button" onClick={() => setShowAlerts(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
              {alerts.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Sin alertas recientes</p>
              ) : alerts.slice(0, 30).map(a => {
                const severityStyles = {
                  error: 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30',
                  warning: 'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30',
                  info: 'border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30',
                };
                const severityIcon = {
                  error: <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />,
                  warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />,
                  info: <Bell className="w-3.5 h-3.5 text-blue-500 shrink-0" />,
                };
                const typeLabels: Record<string, string> = {
                  stock: 'Stock', price: 'Precio', weight: 'Peso', pending: 'Pendiente', blocked: 'Bloqueado',
                };
                return (
                  <div key={a.id} className={`flex items-start gap-2 p-2.5 rounded-lg border ${severityStyles[a.severity]}`}>
                    {severityIcon[a.severity]}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase text-gray-500">{typeLabels[a.type] || a.type}</span>
                        <span className="text-[10px] text-gray-400">
                          {a.time.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">{a.message}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Ticket Preview / Print after sale */}
      {showTicketPreview && lastSale && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowTicketPreview(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm border border-gray-200 dark:border-gray-800 p-5 text-center">
            <div className="w-16 h-16 mx-auto bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center mb-3">
              <BadgeCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Venta completada</h2>
            <p className="text-sm text-gray-500 mt-1">{lastSale.ticketNo}</p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{formatCurrency(lastSale.total)}</p>
            {lastSale.method === 'efectivo' && lastSale.cambio > 0 && (
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 mt-1">
                Cambio: {formatCurrency(lastSale.cambio)}
              </p>
            )}

            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowTicketPreview(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-400"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => { void printTicket(lastSale); setShowTicketPreview(false); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-bold"
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
