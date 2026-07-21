import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useActiveStoreScope } from '../../context/ActiveStoreScopeContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import {
  filterDeliveryOrdersRequest,
  updateDeliveryOrderRequest, listDriversRequest,
  createDriverRequest, updateDriverRequest, getDriversStatsRequest,
  getRepartoConfigRequest,
  type DeliveryOrder, type Driver, type DriverStats, type RepartoConfig, type PointOfSale,
} from '../../lib/deliveryApi';
import { useSyncDeliveryPdvFilter } from '../../hooks/useSyncDeliveryPdvFilter';
import { useDeliveryOrdersLive } from '../../hooks/useDeliveryOrdersLive';
import {
  deliveryOrderMatchesPdvFilter,
  pickDefaultActivePdvId,
  DELIVERY_ACTIVE_STORE_CHANGED,
} from '../../lib/deliveryOpsPdvSelection';
import {
  Truck, Package, CheckCircle2, Search, X, Phone, MapPin, User,
  Timer, MessageSquare, ChevronDown, ChevronRight, Users, Navigation,
  Plus, Banknote, AlertTriangle, RefreshCw, LayoutDashboard, ClipboardCheck, Receipt, Contact2, ArrowRight,
} from 'lucide-react';
import { printDeliveryTicket } from '../../lib/deliveryTicketPrint';
import { businessTicketInfoFrom, shouldPrintCustomerTicketOnDispatch } from '../../lib/deliveryTicketHelpers';

function timeSince(d: string): string {
  if (!d) return '';
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d`;
}

function waUrl(phone: string): string {
  const c = phone.replace(/[\s\-()]/g, '');
  const n = c.startsWith('+') ? c.slice(1) : c.startsWith('34') ? c : `34${c}`;
  return `https://wa.me/${n}`;
}

function mapsUrl(addr: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}`;
}

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

const SC: Record<string, string> = { active: 'bg-green-500', offline: 'bg-gray-400', on_break: 'bg-yellow-500', unavailable: 'bg-red-400' };

export function DeliveryReparto() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const activeStoreScope = useActiveStoreScope();
  const nav = useNavigate();
  const uid = resolveBusinessDataUserId(user, currentBusiness);
  const authUserId = user?.user_id || user?.id || user?.userId || user?._id || null;
  const isMgr = user?.role === 'Admin' || user?.role === 'Gerente';

  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [filterPdv, setFilterPdv] = useState('');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [stats, setStats] = useState<DriverStats[]>([]);
  const [cfg, setCfg] = useState<RepartoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [actAsDriver, setActAsDriver] = useState(false);
  const [view, setView] = useState<'orders' | 'drivers'>('orders');
  const [wTab, setWTab] = useState<'pending' | 'route' | 'done'>('pending');
  const [search, setSearch] = useState('');
  const [fSt, setFSt] = useState('all');
  const [fDr, setFDr] = useState('all');
  const [fPay, setFPay] = useState('all');
  const [assignOrder, setAssignOrder] = useState<DeliveryOrder | null>(null);
  const [expDrv, setExpDrv] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [nName, setNName] = useState('');
  const [nPhone, setNPhone] = useState('');
  const [nVeh, setNVeh] = useState('moto');

  const load = useCallback(async () => {
    if (!uid) return;
    const pdvForApi =
      filterPdv?.trim() ||
      activeStoreScope.activeSalesPointId?.trim() ||
      undefined;
    const businessId = String(currentBusiness?.business_id || currentBusiness?.id || '')
      .replace(/^business:/, '')
      .trim();
    const today = new Date().toISOString().slice(0, 10);
    try {
      const [o, d, s, c] = await Promise.all([
        filterDeliveryOrdersRequest(uid, {
          ...(pdvForApi ? { salesPointId: pdvForApi } : {}),
          ...(businessId ? { businessId } : {}),
          dateFrom: `${today}T00:00:00.000Z`,
          dateTo: `${today}T23:59:59.999Z`,
          limit: 500,
        }).then((r) => r.orders),
        listDriversRequest(uid),
        getDriversStatsRequest(uid),
        getRepartoConfigRequest(uid),
      ]);
      setOrders(o); setDrivers(d); setStats(s); setCfg(c);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [uid, filterPdv, activeStoreScope.activeSalesPointId, currentBusiness?.business_id, currentBusiness?.id]);

  useEffect(() => { load(); }, [load]);

  useDeliveryOrdersLive({
    authUserId,
    businessId: currentBusiness?.business_id || currentBusiness?.id || null,
    onRefresh: load,
    enabled: !!authUserId && !!uid,
    fallbackPollMs: 30_000,
  });

  useEffect(() => {
    const onStore = () => { load(); };
    window.addEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStore);
    return () => window.removeEventListener(DELIVERY_ACTIVE_STORE_CHANGED, onStore);
  }, [load]);

  const pointsOfSale = activeStoreScope.pointsOfSale;
  const primaryPdvId = useMemo(
    () => pickDefaultActivePdvId(pointsOfSale.filter((p) => p.active !== false)),
    [pointsOfSale],
  );

  const applyGlobalPdvFilter = useCallback((pdvId: string | undefined) => {
    setFilterPdv(pdvId || '');
  }, []);

  useSyncDeliveryPdvFilter(pointsOfSale, applyGlobalPdvFilter);

  const storeOrders = useMemo(() => {
    if (!filterPdv) return orders;
    return orders.filter((o) => deliveryOrderMatchesPdvFilter(o, filterPdv, { primaryPdvId }));
  }, [orders, filterPdv, primaryPdvId]);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  // "Listos para salir": status 'listo' sin departedAt todavía. Mantengo el
  // fallback de !departedAt para no romper pedidos antiguos en los que la
  // transición 'en_reparto' aún no existía.
  const ready = useMemo(() => storeOrders.filter(o => o.status === 'listo' && !o.departedAt), [storeOrders]);
  // "En ruta": el repartidor ya salió. Aceptamos tanto el nuevo estado
  // 'en_reparto' como pedidos antiguos en 'listo' con departedAt.
  const route = useMemo(() => storeOrders.filter(o => (o.status === 'en_reparto' || (o.status === 'listo' && !!o.departedAt)) && !o.deliveredAt), [storeOrders]);
  const done = useMemo(() => storeOrders.filter(o => o.status === 'entregado' && o.deliveredAt && new Date(o.deliveredAt) >= today), [storeOrders, today]);
  const cash = useMemo(() => done.filter(o => !o.paymentCollected && (o.paymentMethod === 'efectivo' || !o.paymentMethod)).reduce((s, o) => s + (o.totalAmount || 0), 0), [done]);
  const actDrv = useMemo(() => drivers.filter(d => d.active && d.status === 'active'), [drivers]);

  const myDrvId = useMemo(() => {
    const match = drivers.find(d => d.teamMemberId === user?.id || d.name === user?.fullName)?._id || null;
    if (isMgr && !actAsDriver) return null;
    return match;
  }, [drivers, user, isMgr, actAsDriver]);

  const mgrDriverProfile = useMemo(() => {
    if (!isMgr) return null;
    return drivers.find(d => (d.teamMemberId === user?.id || d.name === user?.fullName) && d.isManager) || null;
  }, [drivers, user, isMgr]);

  const showMgrView = isMgr && !actAsDriver;

  const alerts = useMemo(() => {
    if (!cfg) return [];
    const a: { id: string; sev: string; msg: string }[] = [];
    const now = Date.now();
    ready.forEach(o => {
      const w = now - new Date(o.assemblyCompletedAt || o.updatedAt).getTime();
      if (w > (cfg.alertDelayMinutes || 10) * 60000)
        a.push({ id: `r${o._id}`, sev: 'w', msg: `#${o.orderNumber} listo hace ${Math.round(w / 60000)}min sin repartidor` });
    });
    route.forEach(o => {
      const e = now - new Date(o.departedAt!).getTime();
      if (e > (cfg.alertDeliveryDelayMinutes || 45) * 60000)
        a.push({ id: `d${o._id}`, sev: 'e', msg: `#${o.orderNumber} en ruta hace ${Math.round(e / 60000)}min` });
    });
    stats.forEach(s => {
      if (s.assignedCount >= (cfg.maxOrdersPerDriver || 3))
        a.push({ id: `o${s.driverId}`, sev: 'w', msg: `${s.driverName} tiene ${s.assignedCount} pedidos (máx ${cfg.maxOrdersPerDriver || 3})` });
    });
    done.forEach(o => {
      if (!o.paymentCollected && (o.paymentMethod === 'efectivo' || !o.paymentMethod) && (now - new Date(o.deliveredAt).getTime()) > 30 * 60000)
        a.push({ id: `u${o._id}`, sev: 'w', msg: `#${o.orderNumber} entregado sin cobrar` });
    });
    return a;
  }, [ready, route, done, stats, cfg]);

  const filtered = useMemo(() => {
    let l = fSt === 'ready' ? [...ready] : fSt === 'route' ? [...route] : fSt === 'done' ? [...done] : [...ready, ...route];
    if (fDr === 'none') l = l.filter(o => !o.driverId);
    else if (fDr !== 'all') l = l.filter(o => o.driverId === fDr);
    if (fPay === 'cash') l = l.filter(o => !o.paymentCollected && (o.paymentMethod === 'efectivo' || !o.paymentMethod));
    else if (fPay === 'paid') l = l.filter(o => o.paymentCollected);
    if (search) { const q = search.toLowerCase(); l = l.filter(o => o.orderNumber?.toLowerCase().includes(q) || o.customerName?.toLowerCase().includes(q) || o.customerAddress?.toLowerCase().includes(q) || o.assignedDriver?.toLowerCase().includes(q)); }
    return l.sort((a, b) => ({ urgent: 0, high: 1, normal: 2 }[a.priority] ?? 2) - ({ urgent: 0, high: 1, normal: 2 }[b.priority] ?? 2));
  }, [ready, route, done, fSt, fDr, fPay, search]);

  const wOrders = useMemo(() => {
    if (!myDrvId) return [];
    const m = storeOrders.filter(o => o.driverId === myDrvId);
    if (wTab === 'pending') return m.filter(o => o.status === 'listo' && !o.departedAt);
    if (wTab === 'route') return m.filter(o => (o.status === 'en_reparto' || (o.status === 'listo' && !!o.departedAt)) && !o.deliveredAt);
    return m.filter(o => o.status === 'entregado' && o.deliveredAt && new Date(o.deliveredAt) >= today);
  }, [storeOrders, myDrvId, wTab, today]);

  const startRoute = async (o: DeliveryOrder) => {
    try {
      const now = new Date().toISOString();
      // Pasamos formalmente el estado a 'en_reparto'. El backend además fijará
      // departedAt automáticamente, pero lo enviamos también para que la UI
      // refleje el cambio sin esperar al refresh.
      const u = await updateDeliveryOrderRequest(uid, { ...o, status: 'en_reparto', departedAt: now, stageHistory: [...(o.stageHistory || []), { status: 'en_reparto', date: now, user: user?.fullName || '', notes: 'Inició ruta' }] } as DeliveryOrder);
      setOrders(p => p.map(x => x._id === u._id ? u : x));
      toast.success('Ruta iniciada');
      if (currentBusiness && shouldPrintCustomerTicketOnDispatch(u)) {
        void printDeliveryTicket({
          order: u,
          business: businessTicketInfoFrom(currentBusiness),
          salesPointName: u.salesPointName,
          cashierName: user?.fullName,
          variant: 'customer',
        });
      }
    } catch { toast.error('Error al iniciar ruta'); }
  };

  const markDone = async (o: DeliveryOrder) => {
    try {
      const now = new Date().toISOString();
      const u = await updateDeliveryOrderRequest(uid, { ...o, status: 'entregado', deliveredAt: now, stageHistory: [...(o.stageHistory || []), { status: 'entregado', date: now, user: user?.fullName || '', notes: 'Entregado' }] } as DeliveryOrder);
      setOrders(p => p.map(x => x._id === u._id ? u : x)); toast.success('Pedido entregado');
    } catch { toast.error('Error al marcar entrega'); }
  };

  const markPaid = async (o: DeliveryOrder) => {
    try {
      const now = new Date().toISOString();
      const u = await updateDeliveryOrderRequest(uid, { ...o, paymentCollected: true, paymentCollectedAt: now, paymentCollectedBy: myDrvId || uid } as DeliveryOrder);
      setOrders(p => p.map(x => x._id === u._id ? u : x)); toast.success('Cobro registrado');
    } catch { toast.error('Error al registrar cobro'); }
  };

  const assign = async (o: DeliveryOrder, d: Driver) => {
    try {
      const now = new Date().toISOString();
      const u = await updateDeliveryOrderRequest(uid, { ...o, driverId: d._id, assignedDriver: d.name, stageHistory: [...(o.stageHistory || []), { status: o.status, date: now, user: user?.fullName || '', notes: `Asignado a ${d.name}` }] } as DeliveryOrder);
      setOrders(p => p.map(x => x._id === u._id ? u : x)); setAssignOrder(null); toast.success(`Asignado a ${d.name}`);
    } catch { toast.error('Error al asignar'); }
  };

  const createDrv = async () => {
    if (!nName.trim()) return;
    try {
      const c = await createDriverRequest(uid, { name: nName.trim(), phone: nPhone.trim(), vehicleType: nVeh });
      setDrivers(p => [...p, c]); setNName(''); setNPhone(''); setShowNew(false); toast.success(`Repartidor ${c.name} creado`);
    } catch { toast.error('Error al crear repartidor'); }
  };

  const toggleDrv = async (d: Driver) => {
    try {
      const u = await updateDriverRequest(uid, { ...d, status: d.status === 'active' ? 'offline' : 'active' });
      setDrivers(p => p.map(x => x._id === u._id ? u : x));
    } catch { toast.error('Error al cambiar estado'); }
  };

  const getSt = (id: string) => stats.find(s => s.driverId === id);

  const kpis = [
    { l: 'Listos para salir', v: ready.length, i: <Package className="w-5 h-5" />, bg: 'bg-amber-50 dark:bg-amber-900/20', bd: 'border-amber-200 dark:border-amber-800', tx: 'text-amber-700 dark:text-amber-400', n: 'text-amber-900 dark:text-amber-300' },
    { l: 'En ruta', v: route.length, i: <Truck className="w-5 h-5" />, bg: 'bg-cyan-50 dark:bg-cyan-900/20', bd: 'border-cyan-200 dark:border-cyan-800', tx: 'text-cyan-700 dark:text-cyan-400', n: 'text-cyan-900 dark:text-cyan-300', pulse: route.length > 0 },
    { l: 'Entregados hoy', v: done.length, i: <CheckCircle2 className="w-5 h-5" />, bg: 'bg-green-50 dark:bg-green-900/20', bd: 'border-green-200 dark:border-green-800', tx: 'text-green-700 dark:text-green-400', n: 'text-green-900 dark:text-green-300' },
    { l: 'A cobrar', v: `${cash.toFixed(2)}€`, i: <Banknote className="w-5 h-5" />, bg: 'bg-red-50 dark:bg-red-900/20', bd: 'border-red-200 dark:border-red-800', tx: 'text-red-700 dark:text-red-400', n: 'text-red-900 dark:text-red-300' },
    { l: 'Repartidores', v: actDrv.length, i: <Users className="w-5 h-5" />, bg: 'bg-blue-50 dark:bg-blue-900/20', bd: 'border-blue-200 dark:border-blue-800', tx: 'text-blue-700 dark:text-blue-400', n: 'text-blue-900 dark:text-blue-300' },
  ];

  if (loading) return (
    <Layout title="Reparto propio" subtitle="Gestión de entregas con repartidores propios">
      <div className="flex items-center justify-center py-24 text-gray-500 dark:text-gray-400"><div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />Cargando...</div>
    </Layout>
  );

  return (
    <Layout title="Reparto propio" subtitle="Gestión de entregas con repartidores propios">
      <div className="space-y-5">
        {showMgrView && alerts.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-4 h-4 text-amber-600" /><span className="text-sm font-bold text-amber-800 dark:text-amber-300">{alerts.length} alerta{alerts.length > 1 ? 's' : ''}</span></div>
            <div className="space-y-1">{alerts.slice(0, 5).map(a => (
              <div key={a.id} className={`flex items-center gap-2 text-xs ${a.sev === 'e' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                <div className={`w-2 h-2 rounded-full shrink-0 ${a.sev === 'e' ? 'bg-red-500' : 'bg-amber-500'}`} /><span>{a.msg}</span>
              </div>
            ))}</div>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map(k => (
            <div key={k.l} className={`p-4 ${k.bg} border-2 ${k.bd} rounded-xl`}>
              <div className={`${k.tx} mb-1.5 flex items-center gap-1.5`}>{k.i}{(k as any).pulse && <span className="relative flex h-2 w-2"><span className="animate-ping absolute h-full w-full rounded-full bg-cyan-400 opacity-75" /><span className="relative rounded-full h-2 w-2 bg-cyan-500" /></span>}</div>
              <div className={`text-2xl font-bold ${k.n}`}>{k.v}</div>
              <div className={`text-xs ${k.tx} mt-0.5`}>{k.l}</div>
            </div>
          ))}
        </div>

        {showMgrView ? (<>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button onClick={() => setView('orders')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'orders' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}><Package className="w-4 h-4 inline mr-1.5" />Por pedidos</button>
              <button onClick={() => setView('drivers')} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${view === 'drivers' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}><Users className="w-4 h-4 inline mr-1.5" />Por repartidores</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowNew(true)} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1.5"><Plus className="w-4 h-4" />Repartidor</button>
              {mgrDriverProfile && (
                <button onClick={() => setActAsDriver(true)} className="px-3 py-2 border-2 border-cyan-200 dark:border-cyan-800 rounded-xl text-sm font-medium text-cyan-700 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 flex items-center gap-1.5">
                  <Truck className="w-4 h-4" />Modo repartidor
                </button>
              )}
              <button onClick={load} className="p-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700"><RefreshCw className="w-4 h-4" /></button>
            </div>
          </div>

          {view === 'orders' ? (<div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Buscar pedido, cliente..." value={search} onChange={e => setSearch(e.target.value)} /></div>
              <select value={fSt} onChange={e => setFSt(e.target.value)} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"><option value="all">Todos</option><option value="ready">Listos ({ready.length})</option><option value="route">En ruta ({route.length})</option><option value="done">Entregados ({done.length})</option></select>
              <select value={fDr} onChange={e => setFDr(e.target.value)} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"><option value="all">Repartidores</option><option value="none">Sin asignar</option>{drivers.filter(d => d.active).map(d => <option key={d._id} value={d._id}>{d.name}</option>)}</select>
              <select value={fPay} onChange={e => setFPay(e.target.value)} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"><option value="all">Pago</option><option value="cash">Efectivo pend.</option><option value="paid">Cobrado</option></select>
              {(search || fSt !== 'all' || fDr !== 'all' || fPay !== 'all') && <button onClick={() => { setSearch(''); setFSt('all'); setFDr('all'); setFPay('all'); }} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1"><X className="w-4 h-4" />Limpiar</button>}
            </div>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700"><Truck className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" /><p className="font-semibold">Sin pedidos de reparto</p></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{filtered.map(o => <OCard key={o._id} o={o} drivers={drivers} onAssign={() => setAssignOrder(o)} onRoute={() => startRoute(o)} onDone={() => markDone(o)} onPaid={() => markPaid(o)} mgr />)}</div>
            )}
          </div>) : (<div className="space-y-4">
            {ready.filter(o => !o.driverId).length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center"><Package className="w-5 h-5 text-amber-700 dark:text-amber-300" /></div><div><div className="font-bold text-amber-900 dark:text-amber-200">Sin asignar</div><div className="text-xs text-amber-700 dark:text-amber-400">{ready.filter(o => !o.driverId).length} pedido(s)</div></div></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{ready.filter(o => !o.driverId).map(o => (
                  <div key={o._id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl border border-amber-200 dark:border-amber-800">
                    <div className="min-w-0"><span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">#{o.orderNumber}</span><span className="text-xs text-gray-500 ml-2">{o.customerName}</span><div className="text-xs text-gray-500 truncate mt-0.5">{o.customerAddress}</div></div>
                    <button onClick={() => setAssignOrder(o)} className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg">Asignar</button>
                  </div>
                ))}</div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{drivers.filter(d => d.active).map(d => {
              const st = getSt(d._id); const dOrd = orders.filter(o => o.driverId === d._id && (o.status === 'listo' || o.status === 'en_reparto')); const exp = expDrv === d._id;
              return (<div key={d._id} className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="p-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50" onClick={() => setExpDrv(exp ? null : d._id)}>
                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm font-bold text-gray-700 dark:text-gray-300 shrink-0">{initials(d.name)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><span className="font-bold text-gray-900 dark:text-gray-100 truncate">{d.name}</span><div className={`w-2.5 h-2.5 rounded-full ${SC[d.status]}`} /></div>
                    <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400 mt-0.5"><span>Asign: {st?.assignedCount ?? 0}</span><span>Ruta: {st?.inRouteCount ?? 0}</span><span>Hoy: {st?.deliveredTodayCount ?? 0}</span>{(st?.pendingCashAmount ?? 0) > 0 && <span className="text-red-600 font-semibold">{st!.pendingCashAmount.toFixed(2)}€</span>}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={e => { e.stopPropagation(); toggleDrv(d); }} className={`px-2 py-1 text-xs font-medium rounded-lg ${d.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>{d.status === 'active' ? 'Activo' : 'Offline'}</button>
                    {exp ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </div>
                </div>
                {exp && (<div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-2 bg-gray-50 dark:bg-gray-900/50 max-h-64 overflow-y-auto">
                  {dOrd.length === 0 ? <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">Sin pedidos</p> : dOrd.map(o => (
                    <div key={o._id} className="flex items-center gap-3 p-2.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-xs font-bold text-gray-900 dark:text-gray-100">#{o.orderNumber}</span><span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${o.departedAt ? 'bg-cyan-100 text-cyan-700' : 'bg-amber-100 text-amber-700'}`}>{o.departedAt ? 'En ruta' : 'Pendiente'}</span></div><div className="text-xs text-gray-500 truncate">{o.customerAddress}</div></div>
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100 shrink-0">{o.totalAmount?.toFixed(2)}€</span>
                    </div>
                  ))}
                </div>)}
              </div>);
            })}</div>
          </div>)}
        </>) : (<div className="space-y-4">
          {isMgr && actAsDriver && (
            <button onClick={() => setActAsDriver(false)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
              <Users className="w-4 h-4" />Volver al panel de gerente
            </button>
          )}
          {!myDrvId ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700"><User className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" /><p className="font-semibold">Sin perfil de repartidor</p><p className="text-sm mt-1">Contacta con tu gerente</p></div>
          ) : (<>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              {([['pending', 'Pendientes', orders.filter(o => o.driverId === myDrvId && o.status === 'listo' && !o.departedAt).length], ['route', 'En ruta', orders.filter(o => o.driverId === myDrvId && (o.status === 'en_reparto' || (o.status === 'listo' && !!o.departedAt)) && !o.deliveredAt).length], ['done', 'Entregados', orders.filter(o => o.driverId === myDrvId && o.status === 'entregado' && o.deliveredAt && new Date(o.deliveredAt) >= today).length]] as [string, string, number][]).map(([k, lb, ct]) => (
                <button key={k} onClick={() => setWTab(k as any)} className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${wTab === k ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>{lb}{ct > 0 && <span className="ml-1 px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 rounded-full text-xs">{ct}</span>}</button>
              ))}
            </div>
            {wOrders.length === 0 ? <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700"><Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" /><p className="font-semibold">Sin pedidos</p></div> : (
              <div className="space-y-3">{wOrders.map(o => <OCard key={o._id} o={o} drivers={drivers} onRoute={() => startRoute(o)} onDone={() => markDone(o)} onPaid={() => markPaid(o)} mgr={false} />)}</div>
            )}
          </>)}
        </div>)}

        {/* Quick links to connected modules */}
        {showMgrView && (
          <div className="flex flex-wrap gap-2 pt-2">
            {[
              { label: 'Pedidos', path: '/saas/delivery-ops', icon: <Package className="w-3.5 h-3.5" /> },
              { label: 'Montaje', path: '/saas/delivery-montaje', icon: <ClipboardCheck className="w-3.5 h-3.5" /> },
              { label: 'Caja repartidor', path: '/saas/vertical/delivery/caja', icon: <Receipt className="w-3.5 h-3.5" /> },
              { label: 'Dashboard', path: '/saas/dashboard', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
            ].map(lnk => (
              <button key={lnk.path} onClick={() => nav(lnk.path)}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                {lnk.icon}{lnk.label}<ArrowRight className="w-3 h-3 opacity-40" />
              </button>
            ))}
          </div>
        )}

        {assignOrder && <AModal o={assignOrder} drivers={drivers} stats={stats} cfg={cfg} onAssign={d => assign(assignOrder, d)} onClose={() => setAssignOrder(null)} />}

        {showNew && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex items-center justify-between"><h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nuevo repartidor</h3><button onClick={() => setShowNew(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button></div>
              <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Nombre *</label><input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none" placeholder="Nombre" value={nName} onChange={e => setNName(e.target.value)} autoFocus /></div>
              <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Teléfono</label><input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none" placeholder="+34 6XX" value={nPhone} onChange={e => setNPhone(e.target.value)} /></div>
              <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Vehículo</label><div className="flex gap-2">{['moto', 'coche', 'bicicleta', 'a_pie'].map(v => <button key={v} onClick={() => setNVeh(v)} className={`flex-1 px-3 py-2 rounded-xl border-2 text-xs font-semibold capitalize ${nVeh === v ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}>{v === 'a_pie' ? 'A pie' : v}</button>)}</div></div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowNew(false)} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium">Cancelar</button>
                <button onClick={createDrv} disabled={!nName.trim()} className={`flex-1 px-4 py-3 rounded-xl font-semibold text-sm ${nName.trim() ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>Crear</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function OCard({ o, drivers, onAssign, onRoute, onDone, onPaid, mgr }: {
  o: DeliveryOrder; drivers: Driver[]; onAssign?: () => void; onRoute: () => void; onDone: () => void; onPaid: () => void; mgr: boolean;
}) {
  const isR = o.status === 'listo' && !o.departedAt;
  // En ruta = estado 'en_reparto' o, por compatibilidad, 'listo' con departedAt
  // y sin deliveredAt (pedidos creados antes de añadir el estado intermedio).
  const isRt = (o.status === 'en_reparto' || (o.status === 'listo' && !!o.departedAt)) && !o.deliveredAt;
  const isD = o.status === 'entregado';
  const np = isD && !o.paymentCollected && (o.paymentMethod === 'efectivo' || !o.paymentMethod);
  const drv = drivers.find(d => d._id === o.driverId);
  const tr = isRt ? o.departedAt : (o.assemblyCompletedAt || o.updatedAt);

  return (
    <div className={`bg-white dark:bg-gray-800 border-2 rounded-xl overflow-hidden ${isRt ? 'border-cyan-300 dark:border-cyan-700' : isD ? 'border-green-200 dark:border-green-800' : 'border-gray-200 dark:border-gray-700'}`}>
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">#{o.orderNumber}</span>
              {o.priority === 'urgent' && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded-full">URGENTE</span>}
              {o.priority === 'high' && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 rounded-full">ALTA</span>}
            </div>
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">{o.customerName || 'Cliente'}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isR && <span className="px-2 py-1 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full">Listo</span>}
            {isRt && <span className="px-2 py-1 text-xs font-semibold bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 rounded-full flex items-center gap-1"><span className="relative flex h-1.5 w-1.5"><span className="animate-ping absolute h-full w-full rounded-full bg-cyan-400 opacity-75" /><span className="relative rounded-full h-1.5 w-1.5 bg-cyan-500" /></span>En ruta</span>}
            {isD && <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">Entregado</span>}
            {tr && <span className="text-xs text-gray-500 flex items-center gap-0.5"><Timer className="w-3 h-3" />{timeSince(tr)}</span>}
          </div>
        </div>
        <div className="flex items-start gap-2 p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm text-gray-800 dark:text-gray-200 leading-snug">{o.customerAddress || 'Sin dirección'}</div>
            {o.notes && <div className="text-xs text-gray-500 mt-1 flex items-start gap-1"><MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />{o.notes}</div>}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">{drv ? (<><div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-400">{initials(drv.name)}</div><span className="text-xs font-medium text-gray-700 dark:text-gray-300">{drv.name}</span></>) : <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">Sin repartidor</span>}</div>
          <div className="flex items-center gap-1.5">{o.paymentMethod && <span className="text-xs text-gray-500 capitalize">{o.paymentMethod}</span>}<span className="text-sm font-bold text-gray-900 dark:text-gray-100">{o.totalAmount?.toFixed(2)}€</span>{o.paymentCollected && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}</div>
        </div>
        <div className="flex gap-1.5">
          {o.customerPhone && (<><a href={`tel:${o.customerPhone}`} className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"><Phone className="w-3.5 h-3.5" />Llamar</a><a href={waUrl(o.customerPhone)} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-green-200 dark:border-green-800 rounded-lg text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"><MessageSquare className="w-3.5 h-3.5" />WhatsApp</a></>)}
          {o.customerAddress && <a href={mapsUrl(o.customerAddress)} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-blue-200 dark:border-blue-800 rounded-lg text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"><Navigation className="w-3.5 h-3.5" />Maps</a>}
        </div>
        <div className="flex gap-2">
          {mgr && isR && !o.driverId && onAssign && <button onClick={onAssign} className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2"><User className="w-4 h-4" />Asignar</button>}
          {isR && o.driverId && <button onClick={onRoute} className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2"><Truck className="w-4 h-4" />Iniciar ruta</button>}
          {isRt && <button onClick={onDone} className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" />Entregado</button>}
          {np && <button onClick={onPaid} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2"><Banknote className="w-4 h-4" />Cobrado</button>}
          {mgr && isR && o.driverId && onAssign && <button onClick={onAssign} className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl text-sm hover:bg-gray-50 dark:hover:bg-gray-700" title="Reasignar"><Users className="w-4 h-4" /></button>}
        </div>
      </div>
    </div>
  );
}

function AModal({ o, drivers, stats, cfg, onAssign, onClose }: {
  o: DeliveryOrder; drivers: Driver[]; stats: DriverStats[]; cfg: RepartoConfig | null; onAssign: (d: Driver) => void; onClose: () => void;
}) {
  const [s, setS] = useState('');
  const mx = cfg?.maxOrdersPerDriver || 3;
  const sorted = useMemo(() => {
    let l = drivers.filter(d => d.active);
    if (s) { const q = s.toLowerCase(); l = l.filter(d => d.name.toLowerCase().includes(q)); }
    return l.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      const aL = stats.find(x => x.driverId === a._id)?.assignedCount ?? 0;
      const bL = stats.find(x => x.driverId === b._id)?.assignedCount ?? 0;
      return aL - bL;
    });
  }, [drivers, s, stats]);
  const rec = sorted.find(d => d.status === 'active');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3"><div><h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Asignar repartidor</h3><p className="text-xs text-gray-500 mt-0.5">#{o.orderNumber} — {o.customerName} · {o.totalAmount?.toFixed(2)}€</p></div><button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button></div>
          {o.customerAddress && <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3"><MapPin className="w-3 h-3" />{o.customerAddress}</div>}
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input className="w-full pl-9 pr-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none" placeholder="Buscar..." value={s} onChange={e => setS(e.target.value)} autoFocus /></div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {sorted.length === 0 ? <p className="text-center text-sm text-gray-500 py-8">Sin repartidores</p> : sorted.map(d => {
            const st = stats.find(x => x.driverId === d._id); const ld = st?.assignedCount ?? 0; const sat = ld >= mx; const isRec = d._id === rec?._id; const dis = d.status !== 'active';
            return (
              <div key={d._id} className={`flex items-center gap-3 p-3 rounded-xl border-2 ${dis ? 'opacity-50 border-gray-200 dark:border-gray-700' : isRec ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-400 shrink-0">{initials(d.name)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{d.name}</span><div className={`w-2 h-2 rounded-full ${SC[d.status]}`} />{isRec && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 rounded-full">Recomendado</span>}{sat && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 rounded-full">Saturado</span>}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{ld} asignados{d.vehicleType ? ` · ${d.vehicleType === 'a_pie' ? 'A pie' : d.vehicleType}` : ''}</div>
                </div>
                <button onClick={() => !dis && onAssign(d)} disabled={dis} className={`px-3 py-2 rounded-lg text-xs font-semibold shrink-0 ${dis ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-black'}`}>Asignar</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
