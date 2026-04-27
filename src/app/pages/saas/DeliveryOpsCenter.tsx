import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useSSE } from '../../hooks/useSSE';
import { getAuthHeaders } from '../../lib/authApi';
import {
  getOpsCenterRequest,
  updateDeliveryOrderRequest,
  type OpsCenterData,
  type OpsCenterFilters,
  type OpsAlert,
  type DeliveryOrder,
  type DeliveryOrderStatus,
  type DeliveryConfig,
  type PointOfSale,
} from '../../lib/deliveryApi';
import {
  Activity, ChefHat, Package, Truck, CheckCircle2, Clock, AlertTriangle,
  ShoppingBag, Wallet, AlertCircle, Monitor, Euro, Receipt,
  Timer, Users, Bell, ChevronDown, ChevronUp,
  Filter, X, Armchair, Boxes, BookOpen, Hash,
  RefreshCw,
} from 'lucide-react';

const STATUS_CFG: Record<string, { label: string; bg: string; border: string; text: string; icon: typeof Clock }> = {
  nuevo:     { label: 'Nuevos',      bg: 'bg-amber-50 dark:bg-amber-950/30',   border: 'border-amber-200 dark:border-amber-800',   text: 'text-amber-700 dark:text-amber-400',   icon: Clock },
  cocina:    { label: 'En cocina',   bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-400', icon: ChefHat },
  listo:     { label: 'Listos',      bg: 'bg-indigo-50 dark:bg-indigo-950/30', border: 'border-indigo-200 dark:border-indigo-800', text: 'text-indigo-700 dark:text-indigo-400', icon: Package },
  entregado: { label: 'Entregados',  bg: 'bg-green-50 dark:bg-green-950/30',   border: 'border-green-200 dark:border-green-800',   text: 'text-green-700 dark:text-green-400',   icon: CheckCircle2 },
  incident:  { label: 'Incidencias', bg: 'bg-red-50 dark:bg-red-950/30',       border: 'border-red-200 dark:border-red-800',       text: 'text-red-700 dark:text-red-400',       icon: AlertTriangle },
};

const CH_LABELS: Record<string, string> = {
  direct: 'Directo', phone: 'Teléfono', web: 'Web', app: 'App', tpv: 'TPV',
  glovo: 'Glovo', justeat: 'Just Eat', ubereats: 'Uber Eats',
};

function ago(d: string) {
  if (!d) return '—';
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function eur(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── Filters Bar ─────────────────────────────────────────────────────────── */

function FiltersBar({ filters, onChange, config, pdvs }: {
  filters: OpsCenterFilters; onChange: (f: OpsCenterFilters) => void;
  config: DeliveryConfig | null; pdvs: PointOfSale[];
}) {
  const [open, setOpen] = useState(false);
  const ac = [filters.salesPointId, filters.channel, filters.timeSlot].filter(Boolean).length;
  const sel = 'px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 outline-none';

  const inner = (
    <div className="flex flex-wrap gap-3 items-center">
      {pdvs.length > 1 && (
        <select className={sel} value={filters.salesPointId || ''} onChange={e => onChange({ ...filters, salesPointId: e.target.value || undefined })}>
          <option value="">Todos los PDV</option>
          {pdvs.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>
      )}
      <select className={sel} value={filters.channel || ''} onChange={e => onChange({ ...filters, channel: e.target.value || undefined })}>
        <option value="">Todos los canales</option>
        {(config?.activeChannels || []).map(ch => <option key={ch} value={ch}>{CH_LABELS[ch] || ch}</option>)}
      </select>
      {config?.activeTimeSlots && config.activeTimeSlots.length > 0 && (
        <select className={sel} value={filters.timeSlot || ''} onChange={e => onChange({ ...filters, timeSlot: e.target.value || undefined })}>
          <option value="">Todo el día</option>
          {config.activeTimeSlots.map(s => <option key={s.id} value={s.id}>{s.label} ({s.start}–{s.end})</option>)}
        </select>
      )}
      <input type="date" className={sel} value={filters.date || new Date().toISOString().slice(0, 10)}
        onChange={e => onChange({ ...filters, date: e.target.value || undefined })} />
      {ac > 0 && (
        <button onClick={() => onChange({})} className="px-3 py-2 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1">
          <X className="w-3.5 h-3.5" /> Limpiar
        </button>
      )}
    </div>
  );

  return (
    <>
      <div className="hidden md:block">{inner}</div>
      <div className="md:hidden">
        <button onClick={() => setOpen(!open)} className="px-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium flex items-center gap-2 bg-white dark:bg-gray-800">
          <Filter className="w-4 h-4" /> Filtros {ac > 0 && <span className="px-1.5 py-0.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-full text-xs font-bold">{ac}</span>}
        </button>
        {open && <div className="mt-3">{inner}</div>}
      </div>
    </>
  );
}

/* ── Status Pipeline ─────────────────────────────────────────────────────── */

function Pipeline({ byStatus, active, onFilter }: {
  byStatus: Record<string, number>; active: string | null; onFilter: (s: string | null) => void;
}) {
  const phases = ['nuevo', 'cocina', 'listo', 'entregado', 'incident'] as const;
  return (
    <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
      {phases.map(s => {
        const c = STATUS_CFG[s]; if (!c) return null;
        const Icon = c.icon; const on = active === s;
        return (
          <button key={s} onClick={() => onFilter(on ? null : s)}
            className={`p-4 rounded-xl border-2 transition-all ${c.bg} ${c.border} ${on ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-gray-100 dark:ring-offset-gray-900 scale-[1.02]' : 'hover:scale-[1.01]'}`}>
            <div className={`${c.text} mb-1.5`}><Icon className="w-5 h-5" /></div>
            <div className={`text-2xl font-bold ${c.text}`}>{byStatus[s] || 0}</div>
            <div className={`text-xs font-medium ${c.text} mt-0.5`}>{c.label}</div>
          </button>
        );
      })}
    </div>
  );
}

/* ── Alerts ───────────────────────────────────────────────────────────────── */

function Alerts({ alerts }: { alerts: OpsAlert[] }) {
  const [exp, setExp] = useState(true);
  const [hide, setHide] = useState<Set<string>>(new Set());
  const nav = useNavigate();
  const vis = alerts.filter(a => !hide.has(a.id));
  if (!vis.length) return null;
  const crit = vis.some(a => a.severity === 'critical');
  const bg = crit ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';
  const ICONS: Record<string, typeof AlertTriangle> = { delayed_order: Timer, kitchen_saturated: ChefHat, cash_pending_close: Wallet, critical_stock: Boxes, open_incident: AlertCircle };

  return (
    <div className={`rounded-xl border-2 ${bg} overflow-hidden`}>
      <button onClick={() => setExp(!exp)} className="w-full px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className={`w-4 h-4 ${crit ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`} />
          <span className={`text-sm font-bold ${crit ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>{vis.length} alerta{vis.length !== 1 ? 's' : ''}</span>
        </div>
        {exp ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>
      {exp && (
        <div className="px-4 pb-3 space-y-2">
          {vis.map(a => { const I = ICONS[a.type] || AlertTriangle; return (
            <div key={a.id} className="flex items-start gap-3 bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
              <I className={`w-4 h-4 mt-0.5 shrink-0 ${a.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{a.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{a.message}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => nav(a.route)} className="px-2 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">Ver</button>
                <button onClick={() => setHide(p => new Set(p).add(a.id))} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ); })}
        </div>
      )}
    </div>
  );
}

/* ── Quick Access ─────────────────────────────────────────────────────────── */

function QuickAccess({ cfg, kpis, cashPend, incidents }: {
  cfg: DeliveryConfig | null; kpis: OpsCenterData['kpis'] | null; cashPend: number; incidents: number;
}) {
  const nav = useNavigate();
  type QItem = { l: string; i: typeof Monitor; r: string; b: number | null; bc?: string; v: boolean };
  const items: QItem[] = [
    { l: 'TPV', i: Monitor, r: '/saas/vertical/delivery/tpv', b: null, v: true },
    { l: 'Pedidos', i: ShoppingBag, r: '/saas/delivery', b: kpis ? kpis.byStatus.nuevo + kpis.byStatus.cocina + kpis.byStatus.listo : null, v: true },
    { l: 'Cocina', i: ChefHat, r: '/saas/delivery', b: kpis?.byStatus.cocina ?? null, v: cfg?.hasKitchen !== false },
    { l: 'Montaje', i: Package, r: '/saas/delivery', b: null, v: cfg?.hasAssemblyStation !== false },
    { l: 'Sala', i: Armchair, r: '/saas/delivery', b: null, v: cfg?.hasPhysicalTables === true },
    { l: 'Reparto', i: Truck, r: '/saas/delivery', b: null, v: cfg?.hasOwnDelivery !== false },
    { l: 'Caja', i: Wallet, r: '/saas/delivery', b: cashPend > 0 ? cashPend : null, bc: 'bg-red-500', v: true },
    { l: 'Incidencias', i: AlertTriangle, r: '/saas/delivery', b: incidents > 0 ? incidents : null, bc: 'bg-red-500', v: true },
    { l: 'Catálogo', i: BookOpen, r: '/saas/catalog', b: null, v: true },
    { l: 'Stock', i: Boxes, r: '/saas/articles', b: null, v: true },
    { l: 'Clientes', i: Users, r: '/saas/delivery-crm', b: null, v: true },
    { l: 'Finanzas', i: Euro, r: '/saas/finance', b: null, v: true },
  ];
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
      {items.filter(x => x.v).map(x => (
        <button key={x.l} onClick={() => nav(x.r)}
          className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-all min-w-[72px] shrink-0 relative">
          <x.i className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-400">{x.l}</span>
          {x.b != null && x.b > 0 && (
            <span className={`absolute -top-1.5 -right-1.5 px-1.5 py-0.5 ${x.bc || 'bg-gray-900 dark:bg-gray-100'} text-white dark:text-gray-900 rounded-full text-[9px] font-bold leading-none`}>{x.b}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── Metrics ──────────────────────────────────────────────────────────────── */

function Metrics({ kpis }: { kpis: OpsCenterData['kpis'] | null }) {
  if (!kpis) return null;
  const cards = [
    { l: 'Facturación', v: `${eur(kpis.revenue)} €`, i: Euro, c: 'text-emerald-600 dark:text-emerald-400' },
    { l: 'Pedidos', v: String(kpis.totalOrders), i: ShoppingBag, c: 'text-blue-600 dark:text-blue-400' },
    { l: 'Ticket medio', v: `${eur(kpis.averageTicket)} €`, i: Receipt, c: 'text-violet-600 dark:text-violet-400' },
    { l: 'Prep. media', v: `${kpis.avgPrepTimeMinutes} min`, i: Timer, c: 'text-orange-600 dark:text-orange-400' },
    { l: 'Entrega media', v: `${kpis.avgDeliveryTimeMinutes} min`, i: Truck, c: 'text-cyan-600 dark:text-cyan-400' },
    { l: 'Puntualidad', v: `${kpis.onTimePercentage}%`, i: CheckCircle2, c: kpis.onTimePercentage >= 80 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400' },
  ];
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-gray-500" /> Métricas del día</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map(c => (
          <div key={c.l} className="text-center">
            <c.i className={`w-5 h-5 mx-auto mb-1 ${c.c}`} />
            <p className={`text-lg font-bold ${c.c}`}>{c.v}</p>
            <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mt-0.5">{c.l}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Kitchen Widget ──────────────────────────────────────────────────────── */

function KitchenW({ ks, orders, onAdv }: {
  ks: OpsCenterData['kitchenStatus'] | null; orders: DeliveryOrder[];
  onAdv: (o: DeliveryOrder, s: DeliveryOrderStatus) => void;
}) {
  if (!ks) return null;
  const list = orders.filter(o => o.status === 'cocina').slice(0, 5);
  const col = ks.saturationPercent < 50 ? 'bg-green-500' : ks.saturationPercent < 80 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChefHat className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Cocina</h3>
          <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full text-xs font-bold">{ks.ordersInKitchen}/{ks.capacity}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>Mayor: {Math.round(ks.oldestOrderMinutes)}m</span>
          <span>Media: {Math.round(ks.avgWaitMinutes)}m</span>
        </div>
      </div>
      <div className="px-4 pt-3 pb-1">
        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className={`h-full ${col} rounded-full transition-all`} style={{ width: `${Math.min(100, ks.saturationPercent)}%` }} />
        </div>
        <p className="text-[10px] text-gray-400 mt-1 text-right">{ks.saturationPercent}% capacidad</p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {!list.length && <div className="px-4 py-6 text-center text-gray-400 text-sm">Sin pedidos en cocina</div>}
        {list.map(o => (
          <div key={o._id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{o.orderNumber} <span className="text-xs text-gray-500 font-normal">{o.items?.slice(0, 2).map(i => i.name).join(', ')}</span></p>
              <p className={`text-xs mt-0.5 ${(Date.now() - new Date(o.createdAt).getTime()) / 60000 > 25 ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>{ago(o.createdAt)}</p>
            </div>
            <button onClick={() => onAdv(o, 'listo')} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-semibold shrink-0">Listo</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Assembly Widget ─────────────────────────────────────────────────────── */

function AssemblyW({ orders, onAdv }: { orders: DeliveryOrder[]; onAdv: (o: DeliveryOrder, s: DeliveryOrderStatus) => void }) {
  const list = orders.filter(o => o.status === 'listo' && !o.assignedDriver && o.deliveryType !== 'sala').slice(0, 5);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <Package className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Montaje</h3>
        <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-bold">{list.length}</span>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {!list.length && <div className="px-4 py-6 text-center text-gray-400 text-sm">Sin pedidos en montaje</div>}
        {list.map(o => (
          <div key={o._id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{o.orderNumber}</p>
              <p className="text-xs text-gray-400 mt-0.5">{o.deliveryType === 'recogida' ? 'Recogida' : 'Domicilio'} — {ago(o.createdAt)}</p>
            </div>
            <button onClick={() => onAdv(o, 'entregado')} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shrink-0">Completado</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Delivery/Reparto Widget ─────────────────────────────────────────────── */

function RepartoW({ ds, orders, cfg, onAdv }: {
  ds: OpsCenterData['deliveryStatus'] | null; orders: DeliveryOrder[];
  cfg: DeliveryConfig | null; onAdv: (o: DeliveryOrder, s: DeliveryOrderStatus) => void;
}) {
  if (!cfg?.hasOwnDelivery && !cfg?.hasPlatformDelivery) return null;
  const list = orders.filter(o => o.status === 'listo' && o.assignedDriver).slice(0, 5);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Reparto</h3>
          <span className="px-2 py-0.5 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded-full text-xs font-bold">{ds?.ordersInDelivery || 0}</span>
        </div>
        {ds && <div className="flex items-center gap-3 text-xs text-gray-500">
          <span><Users className="w-3 h-3 inline mr-0.5" />{ds.driversActive}</span>
          {ds.delayedCount > 0 && <span className="text-red-500 font-semibold">{ds.delayedCount} retrasado(s)</span>}
        </div>}
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {!list.length && <div className="px-4 py-6 text-center text-gray-400 text-sm">{cfg?.hasOwnDelivery ? 'Sin pedidos en reparto' : 'Pedidos en plataformas'}</div>}
        {list.map(o => (
          <div key={o._id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{o.orderNumber}</p>
              <p className="text-xs text-gray-400 mt-0.5">{o.assignedDriver} — {(o.customerAddress || '').slice(0, 30)}</p>
            </div>
            <button onClick={() => onAdv(o, 'entregado')} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-semibold shrink-0">Entregado</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Cash Widget ─────────────────────────────────────────────────────────── */

function CashW({ cs }: { cs: OpsCenterData['cashStatus'] | null }) {
  if (!cs) return null;
  const tot = cs.openTpvSessions.length + cs.openDriverSessions.length;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Caja</h3>
          <span className="px-2 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-full text-xs font-bold">{tot}</span>
        </div>
        {cs.pendingClose > 0 && <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full text-xs font-bold animate-pulse">{cs.pendingClose} cierre pend.</span>}
      </div>
      <div className="p-4">
        <div className="text-center mb-3">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{eur(cs.totalCashInRegisters)} €</p>
          <p className="text-xs text-gray-500 mt-0.5">Efectivo en cajas</p>
        </div>
        {cs.openTpvSessions.slice(0, 3).map(s => (
          <div key={s._id} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-900/50 rounded-lg px-3 py-2 mb-1.5">
            <span className="font-semibold text-gray-700 dark:text-gray-300">{s.terminalName || 'Terminal'} — {s.pointOfSaleName || 'PDV'}</span>
            <span className="text-gray-500">{s.workerName || '—'} · {ago(s.openedAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Incidents Widget ────────────────────────────────────────────────────── */

function IncidentsW({ orders }: { orders: DeliveryOrder[] }) {
  const list = orders.filter(o => o.status === 'incident');
  const nav = useNavigate();
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Incidencias</h3>
        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${list.length ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'}`}>{list.length}</span>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {!list.length && <div className="px-4 py-6 text-center"><CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" /><p className="text-sm text-green-600 dark:text-green-400 font-semibold">Sin incidencias</p></div>}
        {list.slice(0, 4).map(o => (
          <div key={o._id} className="px-4 py-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{o.orderNumber} — {o.customerName}</p>
              <p className="text-xs text-gray-500 mt-0.5">{o.incidentType || 'General'}: {(o.incidentNotes || '').slice(0, 50)}</p>
            </div>
            <button onClick={() => nav('/saas/delivery')} className="px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg shrink-0">Resolver</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Tables Widget ───────────────────────────────────────────────────────── */

function TablesW({ cfg, orders }: { cfg: DeliveryConfig; orders: DeliveryOrder[] }) {
  if (!cfg.hasPhysicalTables || !cfg.tableCount) return null;
  const used = new Set(
    orders.filter(o => o.deliveryType === 'sala' && o.tableNumber && !['entregado', 'cancelled'].includes(o.status)).map(o => o.tableNumber)
  );
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <Armchair className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Sala</h3>
        <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-bold">{used.size}/{cfg.tableCount}</span>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
          {Array.from({ length: cfg.tableCount }, (_, i) => i + 1).map(n => (
            <div key={n} className={`aspect-square rounded-lg flex items-center justify-center text-xs font-bold border-2 ${
              used.has(n)
                ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                : 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-700 text-gray-400'
            }`}>{n}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Revenue by Channel ──────────────────────────────────────────────────── */

function ChannelsW({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const mx = Math.max(...entries.map(e => e[1]), 1);
  if (!entries.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2"><Hash className="w-4 h-4 text-gray-500" /> Facturación por canal</h3>
      <div className="space-y-2.5">
        {entries.map(([ch, val]) => (
          <div key={ch} className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400 w-20 shrink-0">{CH_LABELS[ch] || ch}</span>
            <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all" style={{ width: `${(val / mx) * 100}%` }} /></div>
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300 w-20 text-right">{eur(val)} €</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ MAIN PAGE ══════════════════════════════════════════════════════════════ */

export function DeliveryOpsCenter() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const sessionUserId = useMemo(() => {
    try {
      const raw = localStorage.getItem('udar_session_user');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { user_id?: string; id?: string; userId?: string; _id?: string };
      return parsed.user_id || parsed.id || parsed.userId || parsed._id || null;
    } catch {
      return null;
    }
  }, []);
  const authUserId = user?.user_id || user?.id || user?.userId || user?._id || sessionUserId || null;
  const sseToken = useMemo(() => {
    const headers = getAuthHeaders();
    const authHeader = headers.Authorization || headers.authorization;
    if (!authHeader) return null;
    return authHeader.replace(/^Bearer\s+/i, '').trim() || null;
  }, [user?.user_id]);
  const [data, setData] = useState<OpsCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<OpsCenterFilters>({});
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sseOk, setSseOk] = useState(false);
  const [lastUp, setLastUp] = useState<Date | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!authUserId) return;
    try {
      const r = await getOpsCenterRequest(authUserId, filters);
      setData(r); setLastUp(new Date());
    } catch (e) { console.error('ops-center error', e); } finally { setLoading(false); }
  }, [authUserId, filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    poll.current = setInterval(load, 30000);
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [load]);

  const handlers = useMemo(() => ({
    'delivery:order_created': () => load(),
    'delivery:order_status_changed': () => load(),
    'delivery:incident_reported': () => load(),
    'delivery:incident_resolved': () => load(),
    connected: () => setSseOk(true),
    disconnected: () => setSseOk(false),
    reconnecting: () => setSseOk(false),
  }), [load]);

  useSSE({
    userId: authUserId,
    token: sseToken,
    businessId: currentBusiness?.business_id || currentBusiness?.id || null,
    handlers,
    enabled: !!authUserId && !!sseToken,
  });

  const advance = useCallback(async (order: DeliveryOrder, s: DeliveryOrderStatus) => {
    if (!authUserId) return;
    try {
      await updateDeliveryOrderRequest(authUserId, {
        ...order, status: s,
        stageHistory: [...(order.stageHistory || []), { status: s, date: new Date().toISOString(), user: user.fullName || 'Sistema' }],
      });
      toast.success(`${order.orderNumber} → ${STATUS_CFG[s]?.label || s}`);
      load();
    } catch { toast.error('Error al actualizar'); }
  }, [authUserId, user, load]);

  const cfg = data?.config || null;

  const active = useMemo(() => {
    if (!data?.activeOrders) return [];
    return statusFilter ? data.activeOrders.filter(o => o.status === statusFilter) : data.activeOrders;
  }, [data?.activeOrders, statusFilter]);

  const subtitle = data?.date
    ? `Operativa del ${new Date(data.date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`
    : 'Cargando...';
  const dataAgeMs = lastUp ? Date.now() - lastUp.getTime() : Number.POSITIVE_INFINITY;
  const isPollingFresh = dataAgeMs < 45_000;
  const connectionText = sseOk
    ? 'En vivo'
    : isPollingFresh
      ? 'Conexion inestable (actualizando cada 30s)'
      : 'Sin conexion (reintentando)';
  const connectionDotClass = sseOk
    ? 'bg-green-500'
    : isPollingFresh
      ? 'bg-amber-500 animate-pulse'
      : 'bg-red-500 animate-pulse';

  return (
    <Layout title="Centro Operativo" subtitle={subtitle}>
      <div className="space-y-5">
        {/* Connection indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connectionDotClass}`} />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {connectionText}
              {lastUp && ` · ${lastUp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`}
            </span>
          </div>
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <FiltersBar filters={filters} onChange={setFilters} config={cfg} pdvs={data?.pointsOfSale || []} />

        {data?.alerts && data.alerts.length > 0 && <Alerts alerts={data.alerts} />}

        {data?.kpis && <Pipeline byStatus={data.kpis.byStatus} active={statusFilter} onFilter={setStatusFilter} />}

        <QuickAccess cfg={cfg} kpis={data?.kpis || null} cashPend={data?.cashStatus?.pendingClose || 0} incidents={data?.kpis?.byStatus?.incident || 0} />

        <Metrics kpis={data?.kpis || null} />

        {loading && !data ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-gray-100 rounded-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {cfg?.hasKitchen !== false && <KitchenW ks={data?.kitchenStatus || null} orders={active} onAdv={advance} />}
            {cfg?.hasAssemblyStation !== false && <AssemblyW orders={active} onAdv={advance} />}
            {(cfg?.hasOwnDelivery || cfg?.hasPlatformDelivery) && <RepartoW ds={data?.deliveryStatus || null} orders={active} cfg={cfg} onAdv={advance} />}
            <CashW cs={data?.cashStatus || null} />
            <IncidentsW orders={active} />
            {cfg?.hasPhysicalTables && cfg.tableCount > 0 && <TablesW cfg={cfg} orders={active} />}
          </div>
        )}

        {data?.revenueByChannel && Object.keys(data.revenueByChannel).length > 0 && <ChannelsW data={data.revenueByChannel} />}
      </div>
    </Layout>
  );
}
