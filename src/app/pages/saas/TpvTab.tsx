import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Plus, X, Edit3, Trash2, Search, Check, CreditCard, Banknote, Phone,
  User, Settings, LayoutGrid, Receipt, Coffee, Hash,
  Move, Eye, EyeOff, FileText, DollarSign, Printer, UserCheck,
  Calculator, Package, RefreshCw, AlertCircle, ZoomIn, ZoomOut,
  PenLine, MousePointer, History, LogOut, Users,
} from 'lucide-react';
import { listCatalogItemsRequest, createCatalogItemRequest, type CatalogItem } from '../../lib/deliveryApi';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { InviteUserModal } from '../../components/saas/InviteUserModal';
import { NuevoClienteModal } from '../../components/saas/NuevoClienteModal';
import type { AuthUser, RoleDefinition } from '../../lib/authApi';
import type { Client } from '../../context/AppContext';
import { getInvitePermissionsForUser, loadCustomRoles, mergeRoleCatalog } from '../../lib/roleCatalog';
import { isVertialNativeApp, printTicketDocument } from '../../lib/vertialPrint';
import { splitTicketVat, type TicketDocument } from '../../lib/vertialPrint/ticketDocument';

// ─── Types ──────────────────────────────────────────────────────────────────

type TableStatus = 'available' | 'occupied' | 'pending' | 'served' | 'unavailable' | 'hidden';
type OrderStatus = 'open' | 'billed' | 'paid';

interface TpvTable {
  id: string;
  number: number;
  gridW: number;
  gridH: number;
  x: number;
  y: number;
  zone: string;
  zoneResponsible: string;
  status: TableStatus;
}

interface TpvWall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  label: string;
}

interface TpvBar {
  id: string;
  name: string;
  icon: string;
}

interface TpvProduct {
  id: string;
  name: string;
  price: number;
  category: string;
}

interface TpvOrderItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
}

interface TpvOrder {
  id: string;
  tableId: string;
  tableNumber: number;
  section: string;
  items: TpvOrderItem[];
  total: number;
  status: OrderStatus;
  createdBy: string;
  billedBy: string;
  paidBy: string;
  paymentMethod: string;
  amountReceived: number;
  changeGiven: number;
  createdAt: string;
  billedAt: string;
  paidAt: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const GRID_CELL = 20;

const STATUS_COLORS: Record<TableStatus, string> = {
  available: 'bg-green-100 border-green-400 text-green-800',
  occupied: 'bg-orange-100 border-orange-400 text-orange-800',
  pending: 'bg-yellow-100 border-yellow-400 text-yellow-800',
  served: 'bg-blue-100 border-blue-400 text-blue-800',
  unavailable: 'bg-red-100 border-red-300 text-red-700',
  hidden: 'bg-gray-200 border-gray-300 text-gray-400 opacity-40',
};

const STATUS_LABELS: Record<TableStatus, string> = {
  available: 'Disponible',
  occupied: 'Ocupada',
  pending: 'Pendiente',
  served: 'Servida',
  unavailable: 'No disponible',
  hidden: 'Semi-oculta',
};

const STATUS_DOTS: Record<TableStatus, string> = {
  available: 'bg-green-400',
  occupied: 'bg-orange-400',
  pending: 'bg-yellow-400',
  served: 'bg-blue-400',
  unavailable: 'bg-red-400',
  hidden: 'bg-gray-300',
};

const SIZE_PRESETS = [
  { label: '2×2', w: 2, h: 2 },
  { label: '3×3', w: 3, h: 3 },
  { label: '4×4', w: 4, h: 4 },
  { label: '6×4', w: 6, h: 4 },
  { label: '6×6', w: 6, h: 6 },
];

const FLOOR_W = 2000;
const FLOOR_H = 1200;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.15;

const STORAGE_PREFIX = 'tpv_';

const DEFAULT_BARS: TpvBar[] = [
  { id: 'bar-1', name: 'Barra 1', icon: 'coffee' },
  { id: 'bar-2', name: 'Barra 2', icon: 'coffee' },
  { id: 'recepcion', name: 'Recepción', icon: 'receipt' },
  { id: 'shishero', name: 'Shishero', icon: 'coffee' },
];

// ─── Utilities ──────────────────────────────────────────────────────────────

function loadData<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function saveData(key: string, data: unknown) {
  localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data));
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function migrateTable(t: Record<string, unknown>): TpvTable {
  const table: Record<string, unknown> = { ...t };
  if (table.size && !table.gridW) {
    const m: Record<string, number> = { small: 2, medium: 4, large: 7 };
    const c = m[table.size as string] || 4;
    table.gridW = c;
    table.gridH = c;
    delete table.size;
  }
  if (!table.gridW) { table.gridW = 4; table.gridH = 4; }
  if (table.status === 'free') table.status = 'available';
  if (table.status === 'paid') table.status = 'available';
  if (table.status === 'billing') table.status = 'served';
  return table as unknown as TpvTable;
}

function migrateOrder(o: Record<string, unknown>): TpvOrder {
  return {
    ...(o as unknown as TpvOrder),
    section: (o.section as string) || (o.barName as string) || '',
    amountReceived: (o.amountReceived as number) ?? 0,
    changeGiven: (o.changeGiven as number) ?? 0,
    items: ((o.items as Record<string, unknown>[]) || []).map(i => ({
      ...(i as unknown as TpvOrderItem),
      category: (i.category as string) || '',
    })),
  };
}

function loadTables(): TpvTable[] {
  const raw = loadData<Record<string, unknown>[]>('tables', []);
  return raw.map(migrateTable);
}

function loadOrders(): TpvOrder[] {
  const raw = loadData<Record<string, unknown>[]>('orders', []);
  return raw.map(migrateOrder);
}

function catalogToProducts(items: CatalogItem[]): TpvProduct[] {
  return items
    .filter(i => i.active)
    .map(i => ({ id: i._id || i.id, name: i.name, price: i.unitPrice, category: i.category }));
}

function tpvOrderToTicketDoc(
  order: TpvOrder,
  billedBy: string,
  method: string,
  received: number,
  change: number,
): TicketDocument {
  const { base, vat } = splitTicketVat(order.total, 21);
  const date = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  return {
    variant: 'customer',
    title: 'TICKET',
    ticketNo: `MESA-${order.tableNumber}`,
    dateLabel: date,
    issuer: 'TPV',
    taxId: '',
    addressLine: '',
    phone: '',
    salesPointName: order.section || '',
    orderNumber: String(order.tableNumber),
    customerName: `Mesa ${order.tableNumber}`,
    customerPhone: '',
    customerAddress: '',
    emphasizeCustomerAddress: false,
    deliveryTypeLabel: '',
    cashierName: order.createdBy,
    lines: order.items.map((i) => ({
      qty: i.quantity,
      name: i.name,
      total: i.price * i.quantity,
    })),
    base,
    vat,
    vatRate: 21,
    total: order.total,
    paymentLabel: method,
    paymentStatusLabel: 'Cobrado',
    refundReason: '',
    orderNotes:
      received > 0
        ? `Cobrado por ${billedBy} · Recibido ${received.toFixed(2)} EUR · Cambio ${change.toFixed(2)} EUR`
        : `Cobrado por ${billedBy}`,
    footer: 'Gracias por su visita',
    isRefund: false,
  };
}

async function printReceipt(order: TpvOrder, billedBy: string, method: string, received: number, change: number) {
  if (isVertialNativeApp()) {
    try {
      const result = await printTicketDocument(
        tpvOrderToTicketDoc(order, billedBy, method, received, change),
      );
      if (result.ok) toast.success('Ticket enviado a la impresora');
    } catch {
      toast.error('No se pudo imprimir el ticket');
    }
    return;
  }
  const w = window.open('', '_blank', 'width=320,height=600');
  if (!w) { toast.error('No se pudo abrir la ventana de impresión'); return; }
  const date = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  const rows = order.items.map(i =>
    `<tr><td style="padding:2px 0">${i.quantity}x ${i.name}</td><td style="text-align:right;padding:2px 0">${(i.price * i.quantity).toFixed(2)}€</td></tr>`
  ).join('');
  w.document.write(`<!DOCTYPE html><html><head><title>Ticket #${order.tableNumber}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;width:280px;margin:0 auto;padding:12px;font-size:12px;color:#000}
.c{text-align:center}.hr{border-top:1px dashed #333;margin:8px 0}
table{width:100%;border-collapse:collapse}.b{font-weight:bold}
.t td{font-size:14px;font-weight:bold;padding-top:4px}
.f{margin-top:16px;font-size:10px;text-align:center;color:#666}
@media print{body{margin:0}}
</style></head><body>
<div class="c"><strong style="font-size:16px">TICKET</strong><br/>${date}</div>
<div class="hr"></div>
<p>Mesa: <strong>#${order.tableNumber}</strong></p>
<p>Atendido por: ${order.createdBy}</p>
${order.section ? `<p>Sección: ${order.section}</p>` : ''}
<div class="hr"></div>
<table>${rows}</table>
<div class="hr"></div>
<table class="t"><tr><td>TOTAL</td><td style="text-align:right">${order.total.toFixed(2)}€</td></tr></table>
<div class="hr"></div>
<p>Método: ${method}</p>
${received > 0 ? `<p>Recibido: ${received.toFixed(2)}€</p><p class="b">Cambio: ${change.toFixed(2)}€</p>` : ''}
<div class="hr"></div>
<p>Cobrado por: ${billedBy}</p>
<div class="f">Gracias por su visita</div>
</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

function printFloorPlan(tables: TpvTable[], walls: TpvWall[], orders: TpvOrder[]) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) { toast.error('No se pudo abrir la ventana de impresión'); return; }
  const date = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  const statusBg: Record<string, string> = { available: '#dcfce7', occupied: '#ffedd5', pending: '#fef9c3', served: '#dbeafe', unavailable: '#fee2e2', hidden: '#f3f4f6' };
  const statusBorder: Record<string, string> = { available: '#4ade80', occupied: '#fb923c', pending: '#facc15', served: '#60a5fa', unavailable: '#fca5a5', hidden: '#d1d5db' };
  const wallsHtml = walls.map(wall => {
    const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ang = Math.atan2(dy, dx) * (180 / Math.PI);
    return `<div style="position:absolute;left:${wall.x1}px;top:${wall.y1 - wall.thickness / 2}px;width:${len}px;height:${wall.thickness}px;background:#374151;border-radius:2px;transform:rotate(${ang}deg);transform-origin:0 50%;"></div>${wall.label ? `<div style="position:absolute;left:${(wall.x1 + wall.x2) / 2 - 20}px;top:${(wall.y1 + wall.y2) / 2 - 14}px;font-size:8px;color:#374151;text-align:center;width:40px">${wall.label}</div>` : ''}`;
  }).join('');
  const tablesHtml = tables.filter(t => t.status !== 'hidden').map(t => {
    const tw = t.gridW * GRID_CELL, th = t.gridH * GRID_CELL;
    const hasOrder = orders.some(o => o.tableId === t.id && o.status === 'open');
    const st = hasOrder ? 'occupied' : t.status;
    return `<div style="position:absolute;left:${t.x}px;top:${t.y}px;width:${tw}px;height:${th}px;background:${statusBg[st] || '#f3f4f6'};border:2px solid ${statusBorder[st] || '#d1d5db'};border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;"><span style="font-weight:bold;font-size:14px;">${t.number}</span>${t.zone ? `<span style="font-size:8px;opacity:0.7;">${t.zone}</span>` : ''}</div>`;
  }).join('');
  w.document.write(`<!DOCTYPE html><html><head><title>Plano de mesas</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;padding:20px}h1{font-size:18px;margin-bottom:4px}.date{font-size:12px;color:#666;margin-bottom:16px}.floor{position:relative;border:1px solid #e5e7eb;background:repeating-linear-gradient(0deg,transparent,transparent 19px,#f3f4f6 19px,#f3f4f6 20px),repeating-linear-gradient(90deg,transparent,transparent 19px,#f3f4f6 19px,#f3f4f6 20px)}.legend{display:flex;gap:16px;margin-top:12px;font-size:11px;flex-wrap:wrap}.li{display:flex;align-items:center;gap:4px}.dot{width:10px;height:10px;border-radius:50%}@media print{body{padding:10px}}</style></head><body>
<h1>Plano de mesas</h1><div class="date">${date}</div>
<div class="floor" style="width:800px;height:500px;overflow:hidden;">${wallsHtml}${tablesHtml}</div>
<div class="legend"><div class="li"><div class="dot" style="background:#4ade80"></div>Disponible</div><div class="li"><div class="dot" style="background:#fb923c"></div>Ocupada</div><div class="li"><div class="dot" style="background:#facc15"></div>Pendiente</div><div class="li"><div class="dot" style="background:#60a5fa"></div>Servida</div><div class="li"><div class="dot" style="background:#fca5a5"></div>No disponible</div><div class="li"><div class="dot" style="background:#374151;border-radius:2px;width:20px;height:6px"></div>Pared</div></div>
</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function BarManager({ bars, onSave }: { bars: TpvBar[]; onSave: (b: TpvBar[]) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const addBar = () => {
    const newBar: TpvBar = { id: uid(), name: `Barra ${bars.length + 1}`, icon: 'coffee' };
    onSave([...bars, newBar]);
    toast.success(`"${newBar.name}" creada`);
  };

  const startEdit = (bar: TpvBar) => { setEditing(bar.id); setEditName(bar.name); };

  const saveEdit = (id: string) => {
    if (!editName.trim()) return;
    onSave(bars.map(b => b.id === id ? { ...b, name: editName.trim() } : b));
    setEditing(null);
    toast.success('Nombre actualizado');
  };

  const remove = (id: string) => {
    if (bars.length <= 1) { toast.error('Debe haber al menos una barra'); return; }
    onSave(bars.filter(b => b.id !== id));
    toast.success('Sección eliminada');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Puntos de recepción / Barras</h4>
        <button onClick={addBar} className="px-3 py-1.5 bg-gray-900 hover:bg-black text-white text-xs font-medium rounded-lg flex items-center gap-1"><Plus className="w-3 h-3" /> Nueva</button>
      </div>
      {bars.map(bar => (
        <div key={bar.id} className="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
          <Coffee className="w-4 h-4 text-gray-500 shrink-0" />
          {editing === bar.id ? (
            <>
              <input autoFocus className="flex-1 px-2 py-1 border-2 border-gray-300 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none" value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEdit(bar.id)} />
              <button onClick={() => saveEdit(bar.id)} className="p-1 hover:bg-green-100 rounded-lg"><Check className="w-4 h-4 text-green-600" /></button>
              <button onClick={() => setEditing(null)} className="p-1 hover:bg-gray-200 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">{bar.name}</span>
              <button onClick={() => startEdit(bar)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"><Edit3 className="w-3.5 h-3.5 text-gray-500" /></button>
              <button onClick={() => remove(bar.id)} className="p-1 hover:bg-red-100 rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-500" /></button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function CreateTableModal({ isOpen, onClose, onCreate }: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (t: Omit<TpvTable, 'id' | 'status'>) => void;
}) {
  const [form, setForm] = useState({ number: 1, gridW: 4, gridH: 4, zone: '', zoneResponsible: '' });
  useModalClose(isOpen, onClose);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nueva mesa</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Número de mesa *</label>
            <input type="number" min={1} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" value={form.number} onChange={e => setForm(f => ({ ...f, number: Math.max(1, Number(e.target.value)) }))} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Tamaño en el mapa (celdas)</label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {SIZE_PRESETS.map(p => (
                <button key={p.label} onClick={() => setForm(f => ({ ...f, gridW: p.w, gridH: p.h }))} className={`px-3 py-1.5 rounded-lg border-2 text-xs font-medium transition-colors ${form.gridW === p.w && form.gridH === p.h ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Ancho (celdas)</label>
                <input type="number" min={1} max={15} className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" value={form.gridW} onChange={e => setForm(f => ({ ...f, gridW: Math.max(1, Math.min(15, Number(e.target.value))) }))} />
              </div>
              <div className="flex items-end pb-2 text-gray-400 font-bold">×</div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Alto (celdas)</label>
                <input type="number" min={1} max={15} className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" value={form.gridH} onChange={e => setForm(f => ({ ...f, gridH: Math.max(1, Math.min(15, Number(e.target.value))) }))} />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Tamaño visual: {form.gridW * GRID_CELL}×{form.gridH * GRID_CELL}px</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Zona</label>
            <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Ej: Terraza, Salón, VIP..." value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Responsable de zona</label>
            <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Nombre del responsable" value={form.zoneResponsible} onChange={e => setForm(f => ({ ...f, zoneResponsible: e.target.value }))} />
          </div>
          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex gap-3 rounded-b-2xl">
            <button onClick={onClose} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800">Cancelar</button>
            <button onClick={() => {
              onCreate({ number: form.number, gridW: form.gridW, gridH: form.gridH, x: 20, y: 20, zone: form.zone, zoneResponsible: form.zoneResponsible });
              setForm(f => ({ ...f, number: f.number + 1 }));
            }} className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold">Crear mesa</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BillModal({ isOpen, order, userName, initialReceived, onClose, onBill }: {
  isOpen: boolean;
  order: TpvOrder | null;
  userName: string;
  initialReceived?: number;
  onClose: () => void;
  onBill: (billedBy: string, method: string, received: number, change: number, shouldPrint: boolean) => void;
}) {
  const [billedBy, setBilledBy] = useState(userName);
  const [method, setMethod] = useState('efectivo');
  const [amountReceived, setAmountReceived] = useState<number>(0);

  useModalClose(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setBilledBy(userName);
      setAmountReceived(typeof initialReceived === 'number' && initialReceived > 0 ? initialReceived : 0);
    }
  }, [isOpen, userName, initialReceived]);

  if (!isOpen || !order) return null;

  const change = amountReceived > order.total ? +(amountReceived - order.total).toFixed(2) : 0;
  const isEnough = method !== 'efectivo' || amountReceived >= order.total;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Receipt className="w-5 h-5" /> Facturar mesa {order.tableNumber}</h2>
            <p className="text-sm text-gray-500 mt-0.5">Total: {order.total.toFixed(2)}€</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Items */}
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {order.items.map(item => (
              <div key={item.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm">
                <span className="text-gray-900 dark:text-gray-100">{item.quantity}x {item.name}</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{(item.price * item.quantity).toFixed(2)}€</span>
              </div>
            ))}
          </div>

          <div className="flex justify-between p-3 bg-gray-900 text-white rounded-xl">
            <span className="font-bold">Total</span>
            <span className="text-xl font-bold">{order.total.toFixed(2)}€</span>
          </div>

          {/* Who bills */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">¿Quién cobra?</label>
            <input className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" placeholder="Nombre" value={billedBy} onChange={e => setBilledBy(e.target.value)} />
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Método de pago</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'efectivo', label: 'Efectivo', icon: <Banknote className="w-4 h-4" /> },
                { id: 'tarjeta', label: 'Tarjeta', icon: <CreditCard className="w-4 h-4" /> },
                { id: 'bizum', label: 'Bizum', icon: <Phone className="w-4 h-4" /> },
                { id: 'otro', label: 'Otro', icon: <DollarSign className="w-4 h-4" /> },
              ].map(m => (
                <button key={m.id} onClick={() => setMethod(m.id)} className={`p-2.5 rounded-xl border-2 text-center text-xs font-medium transition-colors ${method === m.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 text-gray-700 dark:text-gray-300'}`}>
                  <div className="flex justify-center mb-1">{m.icon}</div>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Change calculator */}
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <Calculator className="w-4 h-4" />
              <span className="text-sm font-bold">Calculadora de cambio</span>
            </div>
            <div>
              <label className="block text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Importe recibido del cliente</label>
              <input
                type="number" step="0.01" min={0}
                className="w-full px-3 py-2.5 border-2 border-amber-300 dark:border-amber-700 rounded-xl text-lg font-bold focus:border-amber-500 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                placeholder="0.00€"
                value={amountReceived || ''}
                onChange={e => setAmountReceived(Number(e.target.value))}
              />
            </div>
            {amountReceived > 0 && (
              <div className={`flex items-center justify-between p-3 rounded-xl text-lg font-bold ${isEnough ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                <span>{isEnough ? 'Cambio a devolver:' : 'Falta:'}</span>
                <span>{isEnough ? change.toFixed(2) : (order.total - amountReceived).toFixed(2)}€</span>
              </div>
            )}
            {method === 'efectivo' && amountReceived > 0 && (
              <div className="flex gap-2 flex-wrap">
                {[5, 10, 20, 50, 100].map(v => (
                  <button key={v} onClick={() => setAmountReceived(v)} className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${amountReceived === v ? 'bg-amber-600 text-white border-amber-600' : 'bg-white dark:bg-gray-700 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100'}`}>
                    {v}€
                  </button>
                ))}
              </div>
            )}
            {method === 'efectivo' && amountReceived === 0 && (
              <div className="flex gap-2 flex-wrap">
                {[5, 10, 20, 50, 100].map(v => (
                  <button key={v} onClick={() => setAmountReceived(v)} className="px-3 py-1 rounded-lg text-xs font-medium border bg-white dark:bg-gray-700 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 transition-colors">
                    {v}€
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex gap-3 rounded-b-2xl">
            <button onClick={onClose} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50">Cancelar</button>
            <button onClick={() => {
              if (!billedBy.trim()) { toast.error('Indica quién cobra'); return; }
              if (method === 'efectivo' && amountReceived > 0 && amountReceived < order.total) { toast.error('El importe recibido es insuficiente'); return; }
              onBill(billedBy.trim(), method, amountReceived, change, false);
            }} className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2">
              <Receipt className="w-4 h-4" /> Cobrar
            </button>
            <button onClick={() => {
              if (!billedBy.trim()) { toast.error('Indica quién cobra'); return; }
              if (method === 'efectivo' && amountReceived > 0 && amountReceived < order.total) { toast.error('El importe recibido es insuficiente'); return; }
              onBill(billedBy.trim(), method, amountReceived, change, true);
            }} className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2">
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddProductModal({ isOpen, categories, onClose, onSave }: {
  isOpen: boolean;
  categories: string[];
  onClose: () => void;
  onSave: (data: { name: string; price: number; category: string }) => void;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [saving, setSaving] = useState(false);

  useModalClose(isOpen, onClose);

  useEffect(() => {
    if (isOpen) { setName(''); setPrice(''); setCategory(''); setCustomCategory(''); }
  }, [isOpen]);

  if (!isOpen) return null;

  const finalCategory = category === '__custom__' ? customCategory.trim() : category;
  const valid = name.trim() && parseFloat(price) > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), price: parseFloat(price), category: finalCategory });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Package className="w-5 h-5" /> Nuevo producto</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 outline-none"
              placeholder="Ej: Café con leche"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio (€) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={e => setPrice(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 outline-none"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoría</label>
            {categories.length > 0 ? (
              <>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 outline-none"
                >
                  <option value="">Sin categoría</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__custom__">+ Nueva categoría…</option>
                </select>
                {category === '__custom__' && (
                  <input
                    value={customCategory}
                    onChange={e => setCustomCategory(e.target.value)}
                    className="w-full mt-2 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 outline-none"
                    placeholder="Nombre de la categoría"
                  />
                )}
              </>
            ) : (
              <input
                value={customCategory}
                onChange={e => { setCustomCategory(e.target.value); setCategory('__custom__'); }}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-400 outline-none"
                placeholder="Ej: Bebidas, Tapas…"
              />
            )}
          </div>
          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex gap-3 rounded-b-2xl">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
            <button type="submit" disabled={!valid || saving} className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-black disabled:opacity-50 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-1.5">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Guardando…' : 'Crear producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface TpvTabProps {
  userName: string;
  userId: string;
  /** TPV (caja) o Locales (plano); la navegación principal va por el sidebar. */
  view: 'tpv' | 'locales';
}

export function TpvTab({ userName, userId, view }: TpvTabProps) {
  const navigate = useNavigate();
  const { listUsers, listRoles, inviteUser, user: authUser } = useAuth();
  const { currentBusiness, businesses, isLoading: businessLoading } = useBusiness();

  const [teamMembers, setTeamMembers] = useState<AuthUser[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);
  const [selectedOperator, setSelectedOperator] = useState<AuthUser | null>(null);
  const [operatorSearch, setOperatorSearch] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [baseRoles, setBaseRoles] = useState<RoleDefinition[]>([]);

  const operatorName = selectedOperator?.fullName || userName;
  const [showNuevoClienteModal, setShowNuevoClienteModal] = useState(false);
  const [tpvClient, setTpvClient] = useState<{ name: string; phone: string; id: string } | null>(null);

  const customRoles = useMemo(() => loadCustomRoles(authUser?.user_id || 'guest'), [authUser?.user_id]);
  const inviteRoles = useMemo(
    () => mergeRoleCatalog(baseRoles, customRoles, teamMembers),
    [baseRoles, customRoles, teamMembers],
  );

  useEffect(() => {
    listRoles()
      .then(setBaseRoles)
      .catch(() => {});
  }, [listRoles]);

  const reloadTeamMembers = useCallback(async () => {
    const businessId = currentBusiness?.business_id;
    if (!businessId) {
      setTeamMembers([]);
      setTeamLoading(false);
      return;
    }
    setTeamLoading(true);
    try {
      const users = await listUsers(businessId);
      setTeamMembers(users.filter(u => u.status !== 'inactive' && u.fullName));
    } catch {
      toast.error('No se pudieron cargar los miembros del equipo');
    } finally {
      setTeamLoading(false);
    }
  }, [listUsers, currentBusiness?.business_id]);

  useEffect(() => {
    if (businessLoading) {
      return;
    }
    void reloadTeamMembers();
  }, [businessLoading, reloadTeamMembers]);

  const handleInviteFromTpv = async ({ name, email, role, businessId }: { name: string; email: string; role: string; businessId?: string }) => {
    const permissions = getInvitePermissionsForUser(role, inviteRoles);
    const result = await inviteUser({
      name,
      email,
      role,
      permissions,
      businessId: businessId || currentBusiness?.business_id,
    });
    if (!result.success) {
      throw new Error(result.error || 'No se pudo invitar al usuario.');
    }
    if (result.generatedPassword) {
      try {
        await navigator.clipboard.writeText(result.generatedPassword);
        toast.success('Invitación enviada. Contraseña temporal copiada al portapapeles.');
      } catch {
        toast.success(`Invitación enviada. Contraseña temporal: ${result.generatedPassword}`);
      }
    } else {
      toast.success('Invitación enviada.');
    }
    setShowInviteModal(false);
    await reloadTeamMembers();
  };

  const [bars, setBars] = useState<TpvBar[]>(() => loadData('bars', DEFAULT_BARS));
  const [tables, setTables] = useState<TpvTable[]>(loadTables);
  const [orders, setOrders] = useState<TpvOrder[]>(loadOrders);

  const [catalogProducts, setCatalogProducts] = useState<TpvProduct[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');

  const [selectedBar, setSelectedBar] = useState<string>(bars[0]?.id || '');
  const [selectedTable, setSelectedTable] = useState<TpvTable | null>(null);
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [hiddenProductIds, setHiddenProductIds] = useState<string[]>(() => loadData('hiddenProducts', []));
  const [showHidden, setShowHidden] = useState(false);
  const [searchProduct, setSearchProduct] = useState('');
  const [productFilter, setProductFilter] = useState('all');
  const [walls, setWalls] = useState<TpvWall[]>(() => loadData('walls', []));
  const [wallMode, setWallMode] = useState(false);
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null);
  const [wallPreview, setWallPreview] = useState<{ x: number; y: number } | null>(null);
  const [selectedWall, setSelectedWall] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const floorRef = useRef<HTMLDivElement>(null);

  /** Importe recibido en la calculadora rápida del TPV (antes de abrir el modal de cobro) */
  const [tpvQuickReceived, setTpvQuickReceived] = useState(0);

  // Persist state
  useEffect(() => { saveData('bars', bars); }, [bars]);
  useEffect(() => { saveData('tables', tables); }, [tables]);
  useEffect(() => { saveData('orders', orders); }, [orders]);
  useEffect(() => { saveData('walls', walls); }, [walls]);
  useEffect(() => { saveData('hiddenProducts', hiddenProductIds); }, [hiddenProductIds]);

  // Fetch catalog products from delivery
  const fetchCatalog = useCallback(async () => {
    if (!userId) return;
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const items = await listCatalogItemsRequest(userId);
      setCatalogProducts(catalogToProducts(items));
    } catch (err) {
      setCatalogError('Error al cargar el catálogo');
      console.error('Catalog fetch error:', err);
    } finally {
      setCatalogLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  const activeOrder = useMemo(() => {
    if (!selectedTable) return null;
    return orders.find(o => o.tableId === selectedTable.id && o.status === 'open') || null;
  }, [selectedTable, orders]);

  const visibleProducts = useMemo(() => {
    return catalogProducts.filter(p => !hiddenProductIds.includes(p.id));
  }, [catalogProducts, hiddenProductIds]);

  const filteredProducts = useMemo(() => {
    let list = visibleProducts;
    if (searchProduct) {
      const q = searchProduct.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
    if (productFilter !== 'all') list = list.filter(p => p.category === productFilter);
    return list;
  }, [visibleProducts, searchProduct, productFilter]);

  const productCategories = useMemo(() => {
    return [...new Set(catalogProducts.map(p => p.category).filter(Boolean))];
  }, [catalogProducts]);

  const visibleProductCategories = useMemo(() => {
    return [...new Set(visibleProducts.map(p => p.category).filter(Boolean))];
  }, [visibleProducts]);

  const visibleTables = useMemo(() => {
    return showHidden ? tables : tables.filter(t => t.status !== 'hidden');
  }, [tables, showHidden]);

  const historyOrders = useMemo(() =>
    orders.filter(o => o.status === 'paid' || o.status === 'billed')
      .sort((a, b) => new Date(b.paidAt || b.billedAt || b.createdAt).getTime() - new Date(a.paidAt || a.billedAt || a.createdAt).getTime()),
    [orders]
  );

  const recentOrders = useMemo(() => historyOrders.slice(0, 12), [historyOrders]);

  useEffect(() => {
    setTpvQuickReceived(0);
  }, [selectedTable?.id, activeOrder?.id]);

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleCreateProduct = useCallback(async (data: { name: string; price: number; category: string }) => {
    try {
      const item = await createCatalogItemRequest(userId, {
        name: data.name,
        unitPrice: data.price,
        category: data.category,
        module: 'catalog',
        active: true,
        description: '',
        sku: '',
        costPrice: 0,
        stockQuantity: 0,
        minStock: 0,
        unit: 'ud',
        supplierId: '',
        supplierName: '',
        allergens: [],
        image: '',
        webVisible: false,
      });
      setCatalogProducts(prev => [...prev, { id: item._id || item.id, name: item.name, price: item.unitPrice, category: item.category }]);
      setShowAddProduct(false);
      toast.success(`Producto "${data.name}" creado`);
    } catch {
      toast.error('Error al crear el producto');
    }
  }, [userId]);

  const handleCreateTable = useCallback((data: Omit<TpvTable, 'id' | 'status'>) => {
    if (tables.some(t => t.number === data.number)) {
      toast.error(`Ya existe la mesa ${data.number}`);
      return;
    }
    const newTable: TpvTable = { ...data, id: uid(), status: 'available' };
    setTables(prev => [...prev, newTable]);
    toast.success(`Mesa ${data.number} creada`);
    setShowCreateTable(false);
  }, [tables]);

  const handleDeleteTable = useCallback((tableId: string) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) return;
    const hasOrder = orders.some(o => o.tableId === tableId && o.status === 'open');
    if (hasOrder) { toast.error('No puedes eliminar una mesa con pedido abierto'); return; }
    setTables(prev => prev.filter(t => t.id !== tableId));
    if (selectedTable?.id === tableId) setSelectedTable(null);
    toast.success(`Mesa ${table.number} eliminada`);
  }, [tables, orders, selectedTable]);

  const handleChangeTableStatus = useCallback((tableId: string, newStatus: TableStatus) => {
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, status: newStatus } : t));
    setSelectedTable(prev => prev?.id === tableId ? { ...prev, status: newStatus } : prev);
    toast.success(`Estado actualizado: ${STATUS_LABELS[newStatus]}`);
  }, []);

  const handleSelectTable = useCallback((table: TpvTable) => {
    setSelectedTable(table);
  }, []);

  const handleAddItem = useCallback((product: TpvProduct) => {
    if (!selectedTable) return;
    const barName = bars.find(b => b.id === selectedBar)?.name || '';
    setOrders(prev => {
      const existing = prev.find(o => o.tableId === selectedTable.id && o.status === 'open');
      if (existing) {
        const existingItem = existing.items.find(i => i.productId === product.id);
        let newItems: TpvOrderItem[];
        if (existingItem) {
          newItems = existing.items.map(i => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
        } else {
          newItems = [...existing.items, { id: uid(), productId: product.id, name: product.name, price: product.price, quantity: 1, category: product.category }];
        }
        const total = newItems.reduce((s, i) => s + i.price * i.quantity, 0);
        return prev.map(o => o.id === existing.id ? { ...o, items: newItems, total } : o);
      }
      const newOrder: TpvOrder = {
        id: uid(), tableId: selectedTable.id, tableNumber: selectedTable.number,
        section: barName, status: 'open',
        items: [{ id: uid(), productId: product.id, name: product.name, price: product.price, quantity: 1, category: product.category }],
        total: product.price, createdBy: operatorName, billedBy: '', paidBy: '', paymentMethod: '',
        amountReceived: 0, changeGiven: 0,
        createdAt: new Date().toISOString(), billedAt: '', paidAt: '',
      };
      return [...prev, newOrder];
    });
    setTables(prev => prev.map(t => t.id === selectedTable.id ? { ...t, status: 'occupied' } : t));
    if (selectedTable.status === 'available') setSelectedTable({ ...selectedTable, status: 'occupied' });
  }, [selectedTable, bars, selectedBar, operatorName]);

  const handleRemoveItem = useCallback((itemId: string) => {
    if (!selectedTable) return;
    setOrders(prev => {
      const existing = prev.find(o => o.tableId === selectedTable.id && o.status === 'open');
      if (!existing) return prev;
      const newItems = existing.items.filter(i => i.id !== itemId);
      if (newItems.length === 0) {
        setTables(p => p.map(t => t.id === selectedTable.id ? { ...t, status: 'available' } : t));
        setSelectedTable({ ...selectedTable, status: 'available' });
        return prev.filter(o => o.id !== existing.id);
      }
      const total = newItems.reduce((s, i) => s + i.price * i.quantity, 0);
      return prev.map(o => o.id === existing.id ? { ...o, items: newItems, total } : o);
    });
  }, [selectedTable]);

  const handleUpdateItemQty = useCallback((itemId: string, delta: number) => {
    if (!selectedTable) return;
    setOrders(prev => {
      const existing = prev.find(o => o.tableId === selectedTable.id && o.status === 'open');
      if (!existing) return prev;
      const newItems = existing.items.map(i => {
        if (i.id !== itemId) return i;
        return { ...i, quantity: Math.max(1, i.quantity + delta) };
      });
      const total = newItems.reduce((s, i) => s + i.price * i.quantity, 0);
      return prev.map(o => o.id === existing.id ? { ...o, items: newItems, total } : o);
    });
  }, [selectedTable]);

  const handleBill = useCallback((billedBy: string, method: string, received: number, change: number, shouldPrint: boolean) => {
    if (!activeOrder) return;
    const now = new Date().toISOString();
    const updatedOrder: TpvOrder = {
      ...activeOrder,
      status: 'paid',
      billedBy,
      paidBy: billedBy,
      paymentMethod: method,
      amountReceived: received,
      changeGiven: change,
      billedAt: now,
      paidAt: now,
    };
    setOrders(prev => prev.map(o => o.id === activeOrder.id ? updatedOrder : o));
    setTables(prev => prev.map(t => t.id === activeOrder.tableId ? { ...t, status: 'available' } : t));
    setSelectedTable(prev => prev ? { ...prev, status: 'available' } : null);
    setShowBillModal(false);
    toast.success(`Mesa ${activeOrder.tableNumber} cobrada — ${activeOrder.total.toFixed(2)}€ (${method})`);
    if (shouldPrint) {
      void printReceipt(updatedOrder, billedBy, method, received, change);
    }
  }, [activeOrder]);

  // Floor drag (coordinates adjusted for zoom)
  const handleFloorMouseDown = (e: React.MouseEvent, tableId: string) => {
    if (wallMode) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = floorRef.current?.getBoundingClientRect();
    const table = tables.find(t => t.id === tableId);
    if (!rect || !table) return;
    setDragging(tableId);
    setDragOffset({
      x: (e.clientX - rect.left) / zoom - table.x,
      y: (e.clientY - rect.top) / zoom - table.y,
    });
  };

  const handleFloorMouseMove = useCallback((e: React.MouseEvent) => {
    if (!floorRef.current) return;
    const rect = floorRef.current.getBoundingClientRect();

    if (dragging) {
      const x = Math.max(0, Math.min(FLOOR_W - 40, (e.clientX - rect.left) / zoom - dragOffset.x));
      const y = Math.max(0, Math.min(FLOOR_H - 40, (e.clientY - rect.top) / zoom - dragOffset.y));
      setTables(prev => prev.map(t => t.id === dragging ? { ...t, x, y } : t));
      return;
    }

    if (wallMode && wallStart) {
      setWallPreview({
        x: (e.clientX - rect.left) / zoom,
        y: (e.clientY - rect.top) / zoom,
      });
    }
  }, [dragging, dragOffset, zoom, wallMode, wallStart]);

  const handleFloorMouseUp = useCallback(() => { setDragging(null); }, []);

  const handleFloorClick = useCallback((e: React.MouseEvent) => {
    if (!floorRef.current || dragging) return;
    const rect = floorRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    if (wallMode) {
      if (!wallStart) {
        setWallStart({ x, y });
        setWallPreview(null);
      } else {
        const dx = x - wallStart.x, dy = y - wallStart.y;
        if (Math.sqrt(dx * dx + dy * dy) < 5) return;
        setWalls(prev => [...prev, { id: uid(), x1: wallStart.x, y1: wallStart.y, x2: x, y2: y, thickness: 6, label: '' }]);
        setWallStart(null);
        setWallPreview(null);
        toast.success('Pared añadida');
      }
      return;
    }

    setSelectedTable(null);
    setSelectedWall(null);
  }, [wallMode, wallStart, zoom, dragging]);

  const handleDeleteWall = useCallback((wallId: string) => {
    setWalls(prev => prev.filter(w => w.id !== wallId));
    setSelectedWall(null);
    toast.success('Pared eliminada');
  }, []);

  const handleFloorWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(prev => {
        const next = prev + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
        return Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next)) * 100) / 100;
      });
    }
  }, []);

  // ─── Settings View ──────────────────────────────────────────────────────

  if (showSettings) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center"><Settings className="w-5 h-5 text-gray-600" /></div>
            <div><h3 className="font-bold text-gray-900 dark:text-gray-100">Configuración TPV</h3><p className="text-sm text-gray-500 dark:text-gray-400">Secciones y zonas de trabajo</p></div>
          </div>
          <button onClick={() => setShowSettings(false)} className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium">Volver al TPV</button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <BarManager bars={bars} onSave={setBars} />
          </div>
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Package className="w-4 h-4" /> Productos</h4>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {visibleProducts.length} visible{visibleProducts.length !== 1 ? 's' : ''} / {catalogProducts.length} total
              </span>
            </div>
            {catalogProducts.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">Sin productos</p>
                <p className="text-xs mt-1">Crea productos desde el TPV o desde Delivery &gt; Catálogo</p>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={() => setHiddenProductIds([])}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors flex items-center gap-1"
                  >
                    <Eye className="w-3 h-3" /> Mostrar todos
                  </button>
                  <button
                    onClick={() => setHiddenProductIds(catalogProducts.map(p => p.id))}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center gap-1"
                  >
                    <EyeOff className="w-3 h-3" /> Ocultar todos
                  </button>
                </div>
                <div className="max-h-[400px] overflow-y-auto space-y-1 -mx-1 px-1">
                  {catalogProducts.map(product => {
                    const isHidden = hiddenProductIds.includes(product.id);
                    return (
                      <div
                        key={product.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${isHidden ? 'bg-gray-50 dark:bg-gray-700/30 opacity-60' : 'bg-white dark:bg-gray-800'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isHidden ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-900 dark:text-gray-100'}`}>{product.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {product.category && <span className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{product.category}</span>}
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{product.price.toFixed(2)}€</span>
                          </div>
                        </div>
                        <button
                          onClick={() => setHiddenProductIds(prev => isHidden ? prev.filter(id => id !== product.id) : [...prev, product.id])}
                          className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1 ${
                            isHidden
                              ? 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900/30 dark:hover:text-green-400'
                              : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-900/20 dark:hover:text-red-400 dark:hover:border-red-800'
                          }`}
                          title={isHidden ? 'Mostrar en TPV' : 'Ocultar del TPV'}
                        >
                          {isHidden ? <><EyeOff className="w-3 h-3" /> Oculto</> : <><Eye className="w-3 h-3" /> Visible</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── History View ───────────────────────────────────────────────────────

  if (showHistory) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center"><FileText className="w-5 h-5 text-gray-600" /></div>
            <div><h3 className="font-bold text-gray-900 dark:text-gray-100">Historial de pedidos TPV</h3><p className="text-sm text-gray-500 dark:text-gray-400">{historyOrders.length} pedidos facturados</p></div>
          </div>
          <button onClick={() => setShowHistory(false)} className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium">Volver al TPV</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl">
            <div className="text-2xl font-bold text-green-900">{historyOrders.length}</div>
            <div className="text-xs text-green-700 mt-0.5">Total pedidos</div>
          </div>
          <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl">
            <div className="text-2xl font-bold text-blue-900">{historyOrders.reduce((s, o) => s + o.total, 0).toFixed(2)}€</div>
            <div className="text-xs text-blue-700 mt-0.5">Facturado</div>
          </div>
          <div className="p-4 bg-purple-50 border-2 border-purple-200 rounded-xl">
            <div className="text-2xl font-bold text-purple-900">{historyOrders.filter(o => o.paymentMethod === 'efectivo').reduce((s, o) => s + o.total, 0).toFixed(2)}€</div>
            <div className="text-xs text-purple-700 mt-0.5">Efectivo</div>
          </div>
          <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-xl">
            <div className="text-2xl font-bold text-amber-900">{historyOrders.filter(o => o.paymentMethod === 'tarjeta').reduce((s, o) => s + o.total, 0).toFixed(2)}€</div>
            <div className="text-xs text-amber-700 mt-0.5">Tarjeta</div>
          </div>
        </div>
        {historyOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <FileText className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-semibold">Sin historial</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead><tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                {['Mesa', 'Sección', 'Productos', 'Total', 'Recibido', 'Cambio', 'Creado por', 'Cobrado por', 'Método', 'Fecha', 'Estado'].map(h => <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {historyOrders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-3 py-3"><span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">#{order.tableNumber}</span></td>
                    <td className="px-3 py-3 text-sm text-gray-700 dark:text-gray-300">{order.section || '—'}</td>
                    <td className="px-3 py-3 text-sm text-gray-700 dark:text-gray-300">{order.items.length} items</td>
                    <td className="px-3 py-3"><span className="font-bold text-gray-900 dark:text-gray-100 text-sm">{order.total.toFixed(2)}€</span></td>
                    <td className="px-3 py-3 text-sm text-gray-600 dark:text-gray-400">{order.amountReceived > 0 ? `${order.amountReceived.toFixed(2)}€` : '—'}</td>
                    <td className="px-3 py-3 text-sm text-gray-600 dark:text-gray-400">{order.changeGiven > 0 ? `${order.changeGiven.toFixed(2)}€` : '—'}</td>
                    <td className="px-3 py-3"><span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1"><User className="w-3 h-3" />{order.createdBy || '—'}</span></td>
                    <td className="px-3 py-3"><span className={`text-sm font-medium flex items-center gap-1 ${order.paidBy ? 'text-green-700' : 'text-red-600'}`}><UserCheck className="w-3 h-3" />{order.paidBy || 'Sin cobrar'}</span></td>
                    <td className="px-3 py-3"><span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg">{order.paymentMethod || '—'}</span></td>
                    <td className="px-3 py-3"><span className="text-xs text-gray-500">{order.paidAt ? new Date(order.paidAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</span></td>
                    <td className="px-3 py-3"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${order.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{order.status === 'paid' ? 'Cobrado' : 'Facturado'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ─── Operator Selection Screen ──────────────────────────────────────────

  if (!selectedOperator) {
    const filteredMembers = operatorSearch
      ? teamMembers.filter(m => m.fullName.toLowerCase().includes(operatorSearch.toLowerCase()) || m.email.toLowerCase().includes(operatorSearch.toLowerCase()))
      : teamMembers;

    return (
      <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 200px)' }}>
        <div className="w-full max-w-xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-900 dark:bg-white rounded-2xl mb-4">
              <Users className="w-8 h-8 text-white dark:text-gray-900" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">¿Quién eres?</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Selecciona tu usuario para empezar a operar en el TPV</p>
          </div>

          <div className="flex gap-2 mb-4 items-stretch">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nombre o email…"
                value={operatorSearch}
                onChange={e => setOperatorSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:border-gray-900 dark:focus:border-gray-400 outline-none transition-colors"
                autoFocus
              />
            </div>
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              disabled={!currentBusiness?.business_id || teamLoading}
              title="Invitar miembro al equipo"
              className="shrink-0 w-12 flex items-center justify-center rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:border-gray-900 dark:hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/80 disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {teamLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
              <span className="text-sm text-gray-500">Cargando equipo…</span>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="text-center py-12">
              <User className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">{operatorSearch ? 'Sin resultados' : 'No hay miembros en el equipo'}</p>
            </div>
          ) : (
            <div className="grid gap-2 max-h-[50vh] overflow-y-auto pr-1">
              {filteredMembers.map(member => (
                <button
                  key={member.id || member.user_id}
                  onClick={() => { setSelectedOperator(member); setOperatorSearch(''); toast.success(`Operando como ${member.fullName}`); }}
                  className="flex items-center gap-3 w-full px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-gray-900 dark:hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/80 transition-all text-left group"
                >
                  {member.avatar ? (
                    <img src={member.avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{member.fullName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{member.email}</p>
                  </div>
                  <span className="text-xs font-medium text-gray-400 group-hover:text-gray-900 dark:group-hover:text-gray-200 transition-colors capitalize">{member.role || 'Miembro'}</span>
                </button>
              ))}
            </div>
          )}

          {showInviteModal && (
            <InviteUserModal
              onClose={() => setShowInviteModal(false)}
              roles={inviteRoles}
              businesses={businesses}
              currentBusinessId={currentBusiness?.business_id}
              onInvite={handleInviteFromTpv}
            />
          )}
        </div>
      </div>
    );
  }

  // ─── Main TPV View ──────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Operador, barras (Locales) y acciones */}
      <div className="flex flex-wrap items-end justify-end gap-x-4 gap-y-3 border-b border-gray-200 dark:border-gray-700 w-full">
        <div className="flex flex-wrap items-center justify-end gap-3 min-w-0 pb-1 sm:pb-1.5">
          <button
            onClick={() => setSelectedOperator(null)}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/30 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl shrink-0 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors group"
            title="Cambiar operador"
          >
            <User className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div className="text-left">
              <span className="text-xs text-indigo-500 dark:text-indigo-400 font-medium">Operador</span>
              <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200 leading-tight">{operatorName}</p>
            </div>
            <LogOut className="w-3.5 h-3.5 text-indigo-400 dark:text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
          </button>

          {mainViewTab === 'locales' && (
            <div className="flex gap-1.5 flex-wrap justify-end">
              {bars.map(bar => (
                <button key={bar.id} onClick={() => setSelectedBar(bar.id)} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 shrink-0 ${selectedBar === bar.id ? 'bg-gray-900 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-2 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                  <Coffee className="w-3.5 h-3.5" />
                  {bar.name}
                </button>
              ))}
            </div>
          )}


          <div className="flex gap-2 flex-wrap justify-end">
            <button type="button" onClick={() => setShowHistory(true)} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1.5 shrink-0"><FileText className="w-4 h-4" /> Historial</button>
            <button type="button" onClick={() => setShowSettings(true)} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1.5 shrink-0"><Settings className="w-4 h-4" /> Configurar</button>
            {view === 'locales' && (
              <button type="button" onClick={() => setShowCreateTable(true)} className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-medium flex items-center gap-1.5 shrink-0"><Plus className="w-4 h-4" /> Nueva mesa</button>
            )}
          </div>
        </div>
      </div>

      {view === 'locales' ? (
      <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 300px)' }}>
        {/* Plano de mesas (canvas) — vista Locales */}
        <div className="flex-1 w-full bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Plano de mesas</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">({visibleTables.length} mesas)</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex gap-3 text-xs flex-wrap">
                {(Object.keys(STATUS_DOTS) as TableStatus[]).filter(s => s !== 'hidden').map(s => (
                  <span key={s} className="flex items-center gap-1">
                    <div className={`w-2.5 h-2.5 rounded-full ${STATUS_DOTS[s]}`} />
                    {STATUS_LABELS[s]}
                  </span>
                ))}
              </div>
              <button
                onClick={() => setShowHidden(!showHidden)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${showHidden ? 'bg-gray-900 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}
              >
                {showHidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {showHidden ? 'Ocultas visibles' : 'Ver ocultas'}
              </button>
              <div className="flex items-center gap-1 border-l border-gray-200 dark:border-gray-700 pl-3 ml-1">
                <button onClick={() => setZoom(z => Math.round(Math.max(MIN_ZOOM, z - ZOOM_STEP) * 100) / 100)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors" title="Alejar"><ZoomOut className="w-3.5 h-3.5 text-gray-500" /></button>
                <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-10 text-center select-none">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.round(Math.min(MAX_ZOOM, z + ZOOM_STEP) * 100) / 100)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors" title="Acercar"><ZoomIn className="w-3.5 h-3.5 text-gray-500" /></button>
                <button onClick={() => setZoom(1)} className="px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors" title="Restablecer zoom">Reset</button>
              </div>
              <div className="flex items-center gap-1 border-l border-gray-200 dark:border-gray-700 pl-3 ml-1">
                <button
                  onClick={() => { setWallMode(m => !m); setWallStart(null); setWallPreview(null); setSelectedWall(null); }}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${wallMode ? 'bg-amber-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}
                  title={wallMode ? 'Cancelar dibujo' : 'Dibujar pared'}
                >
                  {wallMode ? <MousePointer className="w-3 h-3" /> : <PenLine className="w-3 h-3" />}
                  {wallMode ? 'Salir' : 'Pared'}
                </button>
                {selectedWall && (
                  <button onClick={() => handleDeleteWall(selectedWall)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors" title="Eliminar pared seleccionada">
                    <Trash2 className="w-3 h-3" /> Eliminar
                  </button>
                )}
                <button
                  onClick={() => printFloorPlan(tables, walls, orders)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  title="Imprimir plano"
                >
                  <Printer className="w-3 h-3" /> Imprimir
                </button>
              </div>
            </div>
          </div>
          <div
            className="overflow-auto"
            style={{ height: 600 }}
            onWheel={handleFloorWheel}
          >
            <div style={{ width: FLOOR_W * zoom, height: FLOOR_H * zoom, position: 'relative' }}>
              <div
                ref={floorRef}
                className="absolute top-0 left-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_19px,#e5e7eb_19px,#e5e7eb_20px),repeating-linear-gradient(90deg,transparent,transparent_19px,#e5e7eb_19px,#e5e7eb_20px)] dark:bg-[repeating-linear-gradient(0deg,transparent,transparent_19px,#374151_19px,#374151_20px),repeating-linear-gradient(90deg,transparent,transparent_19px,#374151_19px,#374151_20px)]"
                style={{ width: FLOOR_W, height: FLOOR_H, transform: `scale(${zoom})`, transformOrigin: '0 0', cursor: wallMode ? 'crosshair' : dragging ? 'grabbing' : 'default' }}
                onMouseMove={handleFloorMouseMove}
                onMouseUp={handleFloorMouseUp}
                onMouseLeave={() => { handleFloorMouseUp(); setWallPreview(null); }}
                onClick={handleFloorClick}
              >
                {visibleTables.length === 0 && walls.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 pointer-events-none">
                    <LayoutGrid className="w-16 h-16 mb-3 opacity-30" />
                    <p className="font-semibold">Sin mesas</p>
                    <p className="text-sm mt-1">Pulsa "Nueva mesa" para empezar</p>
                  </div>
                )}

                {/* Walls */}
                {walls.map(wall => {
                  const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  const ang = Math.atan2(dy, dx) * (180 / Math.PI);
                  const isWallSelected = selectedWall === wall.id;
                  return (
                    <div
                      key={`wall-${wall.id}`}
                      className={`absolute ${isWallSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                      style={{
                        left: wall.x1, top: wall.y1 - wall.thickness / 2,
                        width: len, height: wall.thickness,
                        transform: `rotate(${ang}deg)`, transformOrigin: '0 50%',
                        backgroundColor: isWallSelected ? '#1e40af' : '#374151',
                        borderRadius: 2, cursor: wallMode ? 'crosshair' : 'pointer',
                        zIndex: isWallSelected ? 5 : 1,
                      }}
                      onClick={e => {
                        e.stopPropagation();
                        if (!wallMode) { setSelectedWall(isWallSelected ? null : wall.id); setSelectedTable(null); }
                      }}
                    >
                      {isWallSelected && (
                        <button
                          className="absolute -top-3 left-1/2 -translate-x-1/2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 z-10"
                          onClick={e => { e.stopPropagation(); handleDeleteWall(wall.id); }}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Wall preview while drawing */}
                {wallMode && wallStart && (
                  <>
                    <div className="absolute w-3 h-3 bg-amber-500 rounded-full border-2 border-white shadow-lg" style={{ left: wallStart.x - 6, top: wallStart.y - 6, zIndex: 20 }} />
                    {wallPreview && (() => {
                      const dx = wallPreview.x - wallStart.x, dy = wallPreview.y - wallStart.y;
                      const len = Math.sqrt(dx * dx + dy * dy);
                      const ang = Math.atan2(dy, dx) * (180 / Math.PI);
                      return (
                        <div
                          className="absolute pointer-events-none"
                          style={{
                            left: wallStart.x, top: wallStart.y - 3,
                            width: len, height: 6,
                            transform: `rotate(${ang}deg)`, transformOrigin: '0 50%',
                            background: 'repeating-linear-gradient(90deg, #f59e0b 0px, #f59e0b 8px, transparent 8px, transparent 14px)',
                            borderRadius: 2, opacity: 0.8, zIndex: 19,
                          }}
                        />
                      );
                    })()}
                  </>
                )}

                {/* Wall mode indicator */}
                {wallMode && !wallStart && (
                  <div className="absolute top-3 left-3 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg shadow-lg z-20 pointer-events-none flex items-center gap-1.5">
                    <PenLine className="w-3 h-3" /> Haz clic para iniciar la pared
                  </div>
                )}
                {wallMode && wallStart && (
                  <div className="absolute top-3 left-3 px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-lg shadow-lg z-20 pointer-events-none flex items-center gap-1.5">
                    <PenLine className="w-3 h-3" /> Haz clic en el punto final
                  </div>
                )}

                {/* Tables */}
                {visibleTables.map(table => {
                  const w = table.gridW * GRID_CELL;
                  const h = table.gridH * GRID_CELL;
                  const isSelected = selectedTable?.id === table.id;
                  const hasOpenOrder = orders.some(o => o.tableId === table.id && o.status === 'open');
                  const displayStatus = hasOpenOrder ? 'occupied' : table.status;
                  return (
                    <div
                      key={table.id}
                      className={`absolute rounded-xl border-2 flex flex-col items-center justify-center select-none transition-shadow ${STATUS_COLORS[displayStatus]} ${isSelected ? 'ring-2 ring-gray-900 dark:ring-gray-100 shadow-lg' : 'hover:shadow-md'}`}
                      style={{ left: table.x, top: table.y, width: w, height: h, minWidth: 36, minHeight: 36, cursor: wallMode ? 'crosshair' : 'pointer', zIndex: isSelected ? 10 : 2 }}
                      onMouseDown={e => handleFloorMouseDown(e, table.id)}
                      onClick={e => { e.stopPropagation(); if (!wallMode) { handleSelectTable(table); setSelectedWall(null); } }}
                    >
                      <span className="font-bold text-lg leading-none">{table.number}</span>
                      {w >= 60 && table.zone && <span className="text-[10px] leading-tight mt-0.5 opacity-70 truncate max-w-full px-1">{table.zone}</span>}
                      {w >= 80 && table.zoneResponsible && <span className="text-[9px] leading-tight opacity-50 truncate max-w-full px-1">{table.zoneResponsible}</span>}
                      {isSelected && !wallMode && (
                        <button
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 z-10"
                          onClick={e => { e.stopPropagation(); handleDeleteTable(table.id); }}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      ) : (
      <div className="flex flex-col gap-4" style={{ minHeight: 'calc(100vh - 300px)' }}>
        {/* Selector rápido de mesas (sin depender del canvas) */}
        <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Mesa activa</span>
            <button type="button" onClick={() => navigate('/saas/sala')} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1">
              <LayoutGrid className="w-3.5 h-3.5" /> Ver plano
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {visibleTables.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                No hay mesas. Créalas en <button type="button" className="font-semibold text-indigo-600 underline" onClick={() => navigate('/saas/sala')}>Sala</button>.
              </p>
            ) : (
              visibleTables.map(table => {
                const openOrder = orders.find(o => o.tableId === table.id && o.status === 'open');
                const isSel = selectedTable?.id === table.id;
                const displayStatus = openOrder ? 'occupied' : table.status;
                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => handleSelectTable(table)}
                    className={`shrink-0 px-4 py-2.5 rounded-xl border-2 min-w-[96px] text-left transition-all ${STATUS_COLORS[displayStatus]} ${isSel ? 'ring-2 ring-gray-900 dark:ring-white ring-offset-2 dark:ring-offset-gray-900' : ''}`}
                  >
                    <div className="font-bold text-lg leading-tight">#{table.number}</div>
                    {table.zone && <div className="text-[10px] opacity-80 truncate max-w-[88px]">{table.zone}</div>}
                    {openOrder && <div className="text-xs font-bold mt-0.5">{openOrder.total.toFixed(2)}€</div>}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-4 flex-1 min-h-0">
          {/* Productos: cuadrícula táctil */}
          <div className="flex-1 min-h-[360px] bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                <Package className="w-4 h-4" />
                Productos
              </h4>
              <div className="flex items-center gap-1">
                <button onClick={() => setShowAddProduct(true)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Añadir producto">
                  <Plus className="w-3.5 h-3.5 text-gray-500" />
                </button>
                <button onClick={fetchCatalog} disabled={catalogLoading} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Recargar catálogo">
                  <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${catalogLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {catalogError && (
              <div className="flex items-center gap-2 p-2 mb-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300 shrink-0">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{catalogError}</span>
                <button onClick={fetchCatalog} className="ml-auto text-red-600 hover:underline font-medium">Reintentar</button>
              </div>
            )}

            {catalogLoading && catalogProducts.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
            )}

            {!catalogLoading && catalogProducts.length === 0 && !catalogError && (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 py-8">
                <Package className="w-10 h-10 mb-2 opacity-40" />
                <p className="font-semibold text-sm">Sin productos</p>
                <p className="text-xs mt-1 text-center mb-3">Crea tu primer producto para empezar</p>
                <button onClick={() => setShowAddProduct(true)} className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-sm font-medium rounded-xl flex items-center gap-1.5"><Plus className="w-4 h-4" /> Añadir producto</button>
              </div>
            )}

            {!catalogLoading && catalogProducts.length > 0 && visibleProducts.length === 0 && !catalogError && (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 py-8">
                <EyeOff className="w-10 h-10 mb-2 opacity-40" />
                <p className="font-semibold text-sm">Todos los productos ocultos</p>
                <p className="text-xs mt-1 text-center mb-3">Ve a Configurar para hacer visibles los productos</p>
              </div>
            )}

            {visibleProducts.length > 0 && (
              <>
                <div className="relative mb-2 shrink-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input className="w-full pl-8 pr-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-900 outline-none" placeholder="Buscar producto..." value={searchProduct} onChange={e => setSearchProduct(e.target.value)} />
                </div>
                {visibleProductCategories.length > 0 && (
                  <div className="flex gap-1 flex-wrap mb-2 shrink-0 max-h-16 overflow-y-auto">
                    <button type="button" onClick={() => setProductFilter('all')} className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${productFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}>Todos</button>
                    {visibleProductCategories.map(cat => (
                      <button type="button" key={cat} onClick={() => setProductFilter(cat)} className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${productFilter === cat ? 'bg-gray-900 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}>{cat}</button>
                    ))}
                  </div>
                )}
                <div className="flex-1 overflow-y-auto min-h-0">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                    {filteredProducts.length === 0 ? (
                      <p className="text-sm text-gray-500 col-span-full text-center py-8">Sin resultados</p>
                    ) : filteredProducts.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleAddItem(p)}
                        disabled={!selectedTable}
                        className={`flex flex-col items-stretch p-3 rounded-xl border-2 text-left min-h-[92px] transition-all ${selectedTable ? 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/80 hover:border-gray-400 active:scale-[0.98]' : 'border-gray-100 dark:border-gray-800 opacity-50 cursor-not-allowed'}`}
                      >
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug">{p.name}</span>
                        {p.category && <span className="text-[10px] text-gray-500 mt-0.5 truncate">{p.category}</span>}
                        <span className="text-base font-bold text-gray-900 dark:text-gray-100 mt-auto pt-2">{p.price.toFixed(2)}€</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Panel: pedido + calculadora + últimos registros */}
          <div className="w-full xl:w-[420px] shrink-0 flex flex-col gap-4">
            {selectedTable ? (
              <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center">
                      <Hash className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-gray-100">Mesa {selectedTable.number}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {selectedTable.zone || 'Sin zona'} · {selectedTable.zoneResponsible || 'Sin responsable'}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${STATUS_COLORS[selectedTable.status].replace('border-2', '').replace(/border-\S+/g, '')}`}>
                    {STATUS_LABELS[selectedTable.status]}
                  </span>
                </div>

                <div className="flex gap-1 flex-wrap mb-3">
                  {(Object.keys(STATUS_LABELS) as TableStatus[]).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleChangeTableStatus(selectedTable.id, s)}
                      className={`px-2 py-1 text-[10px] font-medium rounded-lg border transition-colors ${selectedTable.status === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                    >
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOTS[s]} mr-1`} />
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>

                {activeOrder && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase">Pedido actual</span>
                      <span className="text-xs text-gray-500">por {activeOrder.createdBy}</span>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {activeOrder.items.map(item => (
                        <div key={item.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.name}</div>
                            <div className="text-[10px] text-gray-500">{item.category} · {item.price.toFixed(2)}€/u</div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button type="button" onClick={() => handleUpdateItemQty(item.id, -1)} className="w-6 h-6 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 text-xs font-bold">-</button>
                            <span className="w-7 text-center text-sm font-bold text-gray-900 dark:text-gray-100">{item.quantity}</span>
                            <button type="button" onClick={() => handleUpdateItemQty(item.id, 1)} className="w-6 h-6 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 text-xs font-bold">+</button>
                          </div>
                          <span className="text-sm font-bold text-gray-900 dark:text-gray-100 w-14 text-right shrink-0">{(item.price * item.quantity).toFixed(2)}€</span>
                          <button type="button" onClick={() => handleRemoveItem(item.id)} className="p-1 hover:bg-red-100 rounded shrink-0"><X className="w-3 h-3 text-red-500" /></button>
                        </div>
                      ))}
                    </div>
                    {/* Cliente vinculado */}
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl mt-2">
                      {tpvClient ? (
                        <>
                          <div className="flex items-center gap-2 min-w-0">
                            <User className="w-4 h-4 text-gray-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{tpvClient.name}</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">{tpvClient.phone}</p>
                            </div>
                          </div>
                          <button type="button" onClick={() => setTpvClient(null)} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowNuevoClienteModal(true)}
                          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Añadir cliente
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-900 text-white rounded-xl mt-2">
                      <span className="font-bold">Total</span>
                      <span className="text-xl font-bold">{activeOrder.total.toFixed(2)}€</span>
                    </div>

                    {/* Calculadora de cambio en vivo */}
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl space-y-2">
                      <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                        <Calculator className="w-4 h-4 shrink-0" />
                        <span className="text-sm font-bold">Calculadora de cambio</span>
                      </div>
                      <label className="block text-xs font-medium text-amber-700 dark:text-amber-400">Importe recibido</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        className="w-full px-3 py-2 border-2 border-amber-300 dark:border-amber-700 rounded-xl text-lg font-bold focus:border-amber-500 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        value={tpvQuickReceived || ''}
                        placeholder="0.00"
                        onChange={e => setTpvQuickReceived(Number(e.target.value))}
                      />
                      <div className="flex gap-2 flex-wrap">
                        {[5, 10, 20, 50, 100].map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setTpvQuickReceived(v)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${tpvQuickReceived === v ? 'bg-amber-600 text-white border-amber-600' : 'bg-white dark:bg-gray-700 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100'}`}
                          >
                            {v}€
                          </button>
                        ))}
                        <button type="button" onClick={() => setTpvQuickReceived(activeOrder.total)} className="px-3 py-1 rounded-lg text-xs font-medium border bg-emerald-50 dark:bg-emerald-900/30 border-emerald-400 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100">Exacto</button>
                      </div>
                      {tpvQuickReceived > 0 && (
                        <div className={`flex items-center justify-between p-2.5 rounded-xl text-base font-bold ${tpvQuickReceived >= activeOrder.total ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                          <span>{tpvQuickReceived >= activeOrder.total ? 'Cambio:' : 'Falta:'}</span>
                          <span>
                            {tpvQuickReceived >= activeOrder.total
                              ? `${(tpvQuickReceived - activeOrder.total).toFixed(2)}€`
                              : `${(activeOrder.total - tpvQuickReceived).toFixed(2)}€`}
                          </span>
                        </div>
                      )}
                    </div>

                    <button type="button" onClick={() => setShowBillModal(true)} className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2">
                      <Receipt className="w-5 h-5" /> Facturar / Cobrar
                    </button>
                  </div>
                )}
                {!activeOrder && selectedTable.status !== 'unavailable' && selectedTable.status !== 'hidden' && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Toca productos para añadir al pedido</p>
                )}
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-8 flex flex-col items-center justify-center text-gray-400">
                <Move className="w-10 h-10 mb-2 opacity-40" />
                <p className="font-semibold text-sm">Selecciona una mesa</p>
                <p className="text-xs mt-1 text-center">Usa las fichas de arriba o el plano en <button type="button" className="text-indigo-500 font-medium underline" onClick={() => setMainViewTab('locales')}>Locales</button></p>
              </div>
            )}

            {/* Últimos registros (cobros recientes) */}
            <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-3 flex flex-col flex-1 min-h-[160px] max-h-[280px]">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                  <History className="w-4 h-4" />
                  Últimos registros
                </h4>
                <button type="button" onClick={() => setShowHistory(true)} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">Historial completo</button>
              </div>
              <div className="overflow-y-auto flex-1 space-y-1.5 pr-0.5">
                {recentOrders.length === 0 ? (
                  <p className="text-xs text-gray-500 py-4 text-center">Aún no hay cobros registrados</p>
                ) : (
                  recentOrders.map(o => (
                    <div key={o.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-xs">
                      <span className="font-mono font-bold text-gray-900 dark:text-gray-100 w-10 shrink-0">#{o.tableNumber}</span>
                      <span className="font-bold text-green-700 dark:text-green-400 shrink-0">{o.total.toFixed(2)}€</span>
                      <span className="text-gray-500 dark:text-gray-400 truncate flex-1">{o.paymentMethod || '—'}</span>
                      <span className="text-gray-400 dark:text-gray-500 shrink-0 tabular-nums">
                        {o.paidAt ? new Date(o.paidAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      <CreateTableModal isOpen={showCreateTable} onClose={() => setShowCreateTable(false)} onCreate={handleCreateTable} />
      <BillModal isOpen={showBillModal} order={activeOrder} userName={operatorName} initialReceived={tpvQuickReceived} onClose={() => setShowBillModal(false)} onBill={handleBill} />
      <AddProductModal isOpen={showAddProduct} categories={productCategories} onClose={() => setShowAddProduct(false)} onSave={handleCreateProduct} />
      <NuevoClienteModal
        open={showNuevoClienteModal}
        onClose={() => setShowNuevoClienteModal(false)}
        onClientCreated={(client: Client) => {
          setTpvClient({ id: client.id, name: client.name, phone: client.phone });
          setShowNuevoClienteModal(false);
          toast.success(`Cliente "${client.name}" vinculado`);
        }}
        contexto="tpv"
        vincularA={{ tipo: 'venta', label: 'Ticket TPV actual' }}
      />
    </div>
  );
}
