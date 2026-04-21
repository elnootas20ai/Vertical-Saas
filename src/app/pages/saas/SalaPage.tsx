import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  Plus, X, Search, Users, LayoutGrid, List, Settings, ChefHat,
  Clock, Receipt, CreditCard, Banknote, Phone, User, Eye, EyeOff,
  ZoomIn, ZoomOut, PenLine, MousePointer, Trash2, Printer, RefreshCw,
  AlertCircle, Hash, Coffee, Check, Package, UtensilsCrossed, Send,
  FileText, Move, UserCheck, ArrowRight, Minus, MessageSquare,
} from 'lucide-react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import {
  listDiningTablesRequest,
  createDiningTableRequest,
  updateDiningTableRequest,
  bulkUpdateDiningTablesRequest,
  deleteDiningTableRequest,
  changeTableStatusRequest,
  listDiningWallsRequest,
  createDiningWallRequest,
  deleteDiningWallRequest,
  getFloorConfigRequest,
  saveFloorConfigRequest,
  listDiningOrdersRequest,
  createDiningOrderRequest,
  addComandaRequest,
  sendComandaToKitchenRequest,
  updateComandaRequest,
  payDiningOrderRequest,
  closeDiningOrderRequest,
  listPickupOrdersRequest,
  type DiningTable,
  type DiningTableStatus,
  type PickupOrder,
  type DiningWall,
  type DiningFloorConfig,
  type DiningOrder,
  type DiningComanda,
  type DiningOrderItem,
  type ComandaStatus,
} from '../../lib/salaApi';
import { listCatalogItemsRequest as loadCatalog, type CatalogItem } from '../../lib/deliveryApi';

import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
// ─── Constants ───────────────────────────────────────────────────────────────

const GRID_CELL = 20;
const FLOOR_W = 2000;
const FLOOR_H = 1200;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.15;

const STATUS_COLORS: Record<DiningTableStatus, string> = {
  available: 'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/30 dark:border-green-600 dark:text-green-300',
  occupied: 'bg-orange-100 border-orange-400 text-orange-800 dark:bg-orange-900/30 dark:border-orange-600 dark:text-orange-300',
  pending_order: 'bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-600 dark:text-yellow-300',
  served: 'bg-blue-100 border-blue-400 text-blue-800 dark:bg-blue-900/30 dark:border-blue-600 dark:text-blue-300',
  pending_payment: 'bg-purple-100 border-purple-400 text-purple-800 dark:bg-purple-900/30 dark:border-purple-600 dark:text-purple-300',
  unavailable: 'bg-red-100 border-red-300 text-red-700 dark:bg-red-900/30 dark:border-red-600 dark:text-red-300',
  reserved: 'bg-indigo-100 border-indigo-400 text-indigo-800 dark:bg-indigo-900/30 dark:border-indigo-600 dark:text-indigo-300',
  hidden: 'bg-gray-200 border-gray-300 text-gray-400 opacity-40 dark:bg-gray-700/30 dark:border-gray-600',
};

const STATUS_LABELS: Record<DiningTableStatus, string> = {
  available: 'Disponible',
  occupied: 'Ocupada',
  pending_order: 'Esperando',
  served: 'Servida',
  pending_payment: 'Pendiente cobro',
  unavailable: 'No disponible',
  reserved: 'Reservada',
  hidden: 'Oculta',
};

const STATUS_DOTS: Record<DiningTableStatus, string> = {
  available: 'bg-green-400',
  occupied: 'bg-orange-400',
  pending_order: 'bg-yellow-400',
  served: 'bg-blue-400',
  pending_payment: 'bg-purple-400',
  unavailable: 'bg-red-400',
  reserved: 'bg-indigo-400',
  hidden: 'bg-gray-300',
};

const COMANDA_STATUS_LABELS: Record<ComandaStatus, string> = {
  draft: 'Borrador',
  sent_to_kitchen: 'En cocina',
  in_preparation: 'Preparando',
  ready: 'Lista',
  served: 'Servida',
  cancelled: 'Cancelada',
};

const COMANDA_STATUS_COLORS: Record<ComandaStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  sent_to_kitchen: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  in_preparation: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  ready: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  served: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400',
};

interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  category: string;
}

function catalogToProducts(items: CatalogItem[]): CatalogProduct[] {
  return items
    .filter((i) => i.active)
    .map((i) => ({ id: i._id || i.id, name: i.name, price: i.unitPrice, category: i.category }));
}

function formatOccupiedTime(occupiedAt: string): string {
  if (!occupiedAt) return '';
  const diff = Date.now() - new Date(occupiedAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h${rem > 0 ? ` ${rem}m` : ''}`;
}

function getTimeColor(occupiedAt: string): string {
  if (!occupiedAt) return 'text-gray-400';
  const mins = (Date.now() - new Date(occupiedAt).getTime()) / 60000;
  if (mins > 120) return 'text-red-500';
  if (mins > 60) return 'text-amber-500';
  return 'text-gray-400';
}

// ─── SalaPage ────────────────────────────────────────────────────────────────

export function SalaPage() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const userId = user?.user_id || '';
  const userName = user?.fullName || 'Usuario';

  const [tables, setTables] = useState<DiningTable[]>([]);
  const [walls, setWalls] = useState<DiningWall[]>([]);
  const [orders, setOrders] = useState<DiningOrder[]>([]);
  const [floorConfig, setFloorConfig] = useState<DiningFloorConfig | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(null);
  const [showCreateTable, setShowCreateTable] = useState(false);
  const [filterZone, setFilterZone] = useState('all');
  const [filterStatus, setFilterStatus] = useState<DiningTableStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showHidden, setShowHidden] = useState(false);

  // Floor map state
  const [zoom, setZoom] = useState(1);
  const [wallMode, setWallMode] = useState(false);
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null);
  const [wallPreview, setWallPreview] = useState<{ x: number; y: number } | null>(null);
  const [selectedWall, setSelectedWall] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const floorRef = useRef<HTMLDivElement>(null);

  // Table detail panel
  const [showOpenTableModal, setShowOpenTableModal] = useState(false);
  const [showComandaBuilder, setShowComandaBuilder] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Comanda builder state
  const [comandaItems, setComandaItems] = useState<{ productId: string; name: string; price: number; quantity: number; category: string; notes: string }[]>([]);
  const [comandaNote, setComandaNote] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productFilter, setProductFilter] = useState('all');

  // Open table modal
  const [openGuests, setOpenGuests] = useState(2);

  // Payment
  const [payMethod, setPayMethod] = useState('efectivo');
  const [payReceived, setPayReceived] = useState('');
  const [payTip, setPayTip] = useState('');

  // Pickup
  const [pickups, setPickups] = useState<PickupOrder[]>([]);

  // Auto-refresh timer for occupied time display
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  // ─── Data loading ────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [tablesData, wallsData, configData, ordersData, catalogData, pickupsData] = await Promise.all([
        listDiningTablesRequest(userId),
        listDiningWallsRequest(userId),
        getFloorConfigRequest(userId),
        listDiningOrdersRequest(userId, { status: 'open,served,pending_payment,paid' }),
        loadCatalog(userId),
        listPickupOrdersRequest(userId).catch(() => []),
      ]);
      setTables(tablesData);
      setWalls(wallsData);
      setFloorConfig(configData);
      setOrders(ordersData);
      setProducts(catalogToProducts(catalogData));
      setPickups(pickupsData);
    } catch (err) {
      console.error('Error loading sala data:', err);
      toast.error('Error al cargar datos de sala');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Derived data ────────────────────────────────────────────────────────

  const activeOrder = useMemo(() => {
    if (!selectedTable) return null;
    return orders.find((o) => o.tableId === selectedTable._id && ['open', 'served', 'pending_payment'].includes(o.status)) || null;
  }, [selectedTable, orders]);

  const zones = useMemo(() => [...new Set(tables.map((t) => t.zone).filter(Boolean))], [tables]);
  const productCategories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))], [products]);

  const filteredTables = useMemo(() => {
    let list = showHidden ? tables : tables.filter((t) => t.status !== 'hidden');
    if (filterZone !== 'all') list = list.filter((t) => t.zone === filterZone);
    if (filterStatus !== 'all') list = list.filter((t) => t.status === filterStatus);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) => String(t.number).includes(q) || t.name.toLowerCase().includes(q) || t.zone.toLowerCase().includes(q));
    }
    return list;
  }, [tables, filterZone, filterStatus, searchQuery, showHidden]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (productSearch) {
      const q = productSearch.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
    if (productFilter !== 'all') list = list.filter((p) => p.category === productFilter);
    return list;
  }, [products, productSearch, productFilter]);

  // KPIs
  const occupiedCount = tables.filter((t) => !['available', 'unavailable', 'hidden', 'reserved'].includes(t.status)).length;
  const totalGuests = tables.reduce((s, t) => s + (t.currentGuests || 0), 0);
  const openOrders = orders.filter((o) => ['open', 'served', 'pending_payment'].includes(o.status)).length;
  const todayRevenue = orders
    .filter((o) => o.status === 'closed' || o.status === 'paid')
    .filter((o) => o.paidAt && new Date(o.paidAt).toDateString() === new Date().toDateString())
    .reduce((s, o) => s + o.total, 0);

  // ─── Table operations ────────────────────────────────────────────────────

  const handleCreateTable = useCallback(async (data: { number: number; zone: string; capacity: number; gridW: number; gridH: number; x: number; y: number }) => {
    try {
      const table = await createDiningTableRequest(userId, {
        ...data,
        businessId: currentBusiness?.business_id || '',
      } as Partial<DiningTable>);
      setTables((prev) => [...prev, table]);
      toast.success(`Mesa ${data.number} creada`);
      setShowCreateTable(false);
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Error al crear mesa');
    }
  }, [userId, currentBusiness?.business_id]);

  const handleDeleteTable = useCallback(async (tableId: string) => {
    const table = tables.find((t) => t._id === tableId);
    if (!table) return;
    const hasOrder = orders.some((o) => o.tableId === tableId && ['open', 'served', 'pending_payment'].includes(o.status));
    if (hasOrder) { toast.error('No puedes eliminar una mesa con pedido abierto'); return; }
    try {
      await deleteDiningTableRequest(userId, tableId);
      setTables((prev) => prev.filter((t) => t._id !== tableId));
      if (selectedTable?._id === tableId) setSelectedTable(null);
      toast.success(`Mesa ${table.number} eliminada`);
    } catch {
      toast.error('Error al eliminar mesa');
    }
  }, [userId, tables, orders, selectedTable]);

  const handleChangeStatus = useCallback(async (tableId: string, status: DiningTableStatus) => {
    try {
      const updated = await changeTableStatusRequest(userId, tableId, status);
      setTables((prev) => prev.map((t) => t._id === tableId ? updated : t));
      if (selectedTable?._id === tableId) setSelectedTable(updated);
      toast.success(`Estado: ${STATUS_LABELS[status]}`);
    } catch {
      toast.error('Error al cambiar estado');
    }
  }, [userId, selectedTable]);

  // Save position after drag
  const handleSavePosition = useCallback(async (tableId: string, x: number, y: number) => {
    try {
      const table = tables.find((t) => t._id === tableId);
      if (!table) return;
      await updateDiningTableRequest(userId, tableId, { x, y } as Partial<DiningTable>);
    } catch {
      // Silently fail — position will resync on reload
    }
  }, [userId, tables]);

  // ─── Open table ──────────────────────────────────────────────────────────

  const handleOpenTable = useCallback(async () => {
    if (!selectedTable) return;
    try {
      const order = await createDiningOrderRequest(userId, {
        tableId: selectedTable._id,
        tableNumber: selectedTable.number,
        tableName: selectedTable.name,
        zone: selectedTable.zone,
        guests: openGuests,
        createdBy: userId,
        createdByName: userName,
        businessId: currentBusiness?.business_id || '',
      } as Partial<DiningOrder>);
      setOrders((prev) => [...prev, order]);
      setTables((prev) => prev.map((t) => t._id === selectedTable._id ? { ...t, status: 'occupied' as DiningTableStatus, currentGuests: openGuests, occupiedAt: new Date().toISOString(), occupiedBy: userId } : t));
      setSelectedTable({ ...selectedTable, status: 'occupied', currentGuests: openGuests, occupiedAt: new Date().toISOString() });
      setShowOpenTableModal(false);
      toast.success(`Mesa ${selectedTable.number} abierta — ${openGuests} comensales`);
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Error al abrir mesa');
    }
  }, [userId, userName, selectedTable, openGuests, currentBusiness?.business_id]);

  // ─── Comanda ─────────────────────────────────────────────────────────────

  const handleAddToComanda = useCallback((product: CatalogProduct) => {
    setComandaItems((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { productId: product.id, name: product.name, price: product.price, quantity: 1, category: product.category, notes: '' }];
    });
  }, []);

  const handleSendComanda = useCallback(async () => {
    if (!activeOrder || comandaItems.length === 0) return;
    try {
      const items = comandaItems.map((i) => ({
        id: '',
        productId: i.productId,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        category: i.category,
        notes: i.notes,
        modifiers: [],
        status: 'pending' as const,
        cancelledReason: '',
        cancelledBy: '',
      }));
      const { order, comanda } = await addComandaRequest(userId, activeOrder._id, {
        items,
        createdBy: userId,
        createdByName: userName,
        notes: comandaNote,
      } as Partial<DiningComanda>);

      // Send to kitchen immediately
      const updated = await sendComandaToKitchenRequest(userId, order._id, comanda.id);
      setOrders((prev) => prev.map((o) => o._id === updated._id ? updated : o));
      setComandaItems([]);
      setComandaNote('');
      setShowComandaBuilder(false);
      toast.success(`Comanda #${comanda.orderNumber} enviada a cocina`);
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Error al enviar comanda');
    }
  }, [userId, userName, activeOrder, comandaItems, comandaNote]);

  // ─── Payment ─────────────────────────────────────────────────────────────

  const handlePay = useCallback(async () => {
    if (!activeOrder) return;
    const received = Number(payReceived) || activeOrder.total;
    const tip = Number(payTip) || 0;
    const change = payMethod === 'efectivo' ? Math.max(0, received - activeOrder.total) : 0;

    try {
      const { order, fullyPaid } = await payDiningOrderRequest(userId, activeOrder._id, {
        method: payMethod,
        amount: activeOrder.total,
        amountReceived: received,
        changeGiven: change,
        tip,
        paidBy: userId,
        paidByName: userName,
      });

      if (fullyPaid) {
        const closed = await closeDiningOrderRequest(userId, order._id);
        setOrders((prev) => prev.map((o) => o._id === closed._id ? closed : o));
        setTables((prev) => prev.map((t) => t._id === activeOrder.tableId ? { ...t, status: 'available' as DiningTableStatus, currentGuests: 0, occupiedAt: '', occupiedBy: '' } : t));
        if (selectedTable?._id === activeOrder.tableId) {
          setSelectedTable({ ...selectedTable, status: 'available', currentGuests: 0, occupiedAt: '', occupiedBy: '' });
        }
        toast.success(`Mesa ${activeOrder.tableNumber} cobrada — ${activeOrder.total.toFixed(2)}€`);
      } else {
        setOrders((prev) => prev.map((o) => o._id === order._id ? order : o));
        toast.success('Pago parcial registrado');
      }

      setShowPaymentModal(false);
      setPayReceived('');
      setPayTip('');
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Error al cobrar');
    }
  }, [userId, userName, activeOrder, payMethod, payReceived, payTip, selectedTable]);

  // ─── Floor map handlers ──────────────────────────────────────────────────

  const handleFloorMouseDown = (e: React.MouseEvent, tableId: string) => {
    if (wallMode) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = floorRef.current?.getBoundingClientRect();
    const table = tables.find((t) => t._id === tableId);
    if (!rect || !table) return;
    setDragging(tableId);
    setDragOffset({ x: (e.clientX - rect.left) / zoom - table.x, y: (e.clientY - rect.top) / zoom - table.y });
  };

  const handleFloorMouseMove = useCallback((e: React.MouseEvent) => {
    if (!floorRef.current) return;
    const rect = floorRef.current.getBoundingClientRect();
    if (dragging) {
      const x = Math.max(0, Math.min(FLOOR_W - 40, (e.clientX - rect.left) / zoom - dragOffset.x));
      const y = Math.max(0, Math.min(FLOOR_H - 40, (e.clientY - rect.top) / zoom - dragOffset.y));
      setTables((prev) => prev.map((t) => t._id === dragging ? { ...t, x, y } : t));
      return;
    }
    if (wallMode && wallStart) {
      setWallPreview({ x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom });
    }
  }, [dragging, dragOffset, zoom, wallMode, wallStart]);

  const handleFloorMouseUp = useCallback(() => {
    if (dragging) {
      const table = tables.find((t) => t._id === dragging);
      if (table) handleSavePosition(table._id, table.x, table.y);
    }
    setDragging(null);
  }, [dragging, tables, handleSavePosition]);

  const handleFloorClick = useCallback(async (e: React.MouseEvent) => {
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
        try {
          const wall = await createDiningWallRequest(userId, {
            x1: wallStart.x, y1: wallStart.y, x2: x, y2: y,
            thickness: 6, label: '',
            businessId: currentBusiness?.business_id || '',
          } as Partial<DiningWall>);
          setWalls((prev) => [...prev, wall]);
          toast.success('Pared añadida');
        } catch { toast.error('Error al crear pared'); }
        setWallStart(null);
        setWallPreview(null);
      }
      return;
    }

    setSelectedTable(null);
    setSelectedWall(null);
  }, [wallMode, wallStart, zoom, dragging, userId, currentBusiness?.business_id]);

  const handleDeleteWall = useCallback(async (wallId: string) => {
    try {
      await deleteDiningWallRequest(userId, wallId);
      setWalls((prev) => prev.filter((w) => w._id !== wallId));
      setSelectedWall(null);
      toast.success('Pared eliminada');
    } catch { toast.error('Error al eliminar pared'); }
  }, [userId]);

  const handleFloorWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((prev) => Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))) * 100) / 100);
    }
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Layout title="Sala" subtitle="Gestión de mesas y servicio">
        <div className="flex items-center justify-center py-32">
          <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
          <span className="ml-3 text-gray-500">Cargando sala…</span>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Sala" subtitle="Gestión de mesas y servicio">
      <div className="space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-xl">
            <div className="text-2xl font-bold text-orange-900 dark:text-orange-200">{occupiedCount}<span className="text-sm font-normal text-orange-600 dark:text-orange-400">/{tables.filter((t) => t.status !== 'hidden').length}</span></div>
            <div className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">Mesas ocupadas</div>
          </div>
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-200">{totalGuests}</div>
            <div className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">Comensales</div>
          </div>
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl">
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-200">{openOrders}</div>
            <div className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">Pedidos abiertos</div>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
            <div className="text-2xl font-bold text-green-900 dark:text-green-200">{todayRevenue.toFixed(2)}€</div>
            <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">Facturación hoy</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button onClick={() => setViewMode('map')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${viewMode === 'map' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}><LayoutGrid className="w-3.5 h-3.5" /> Mapa</button>
              <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${viewMode === 'list' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}><List className="w-3.5 h-3.5" /> Listado</button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input type="text" placeholder="Buscar mesa…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 pr-3 py-2 w-40 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-400 dark:focus:border-gray-500 outline-none" />
            </div>

            {zones.length > 0 && (
              <select value={filterZone} onChange={(e) => setFilterZone(e.target.value)} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none">
                <option value="all">Todas las zonas</option>
                {zones.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            )}

            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as DiningTableStatus | 'all')} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none">
              <option value="all">Todos los estados</option>
              {(Object.keys(STATUS_LABELS) as DiningTableStatus[]).filter((s) => s !== 'hidden').map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => loadData()} className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-1.5"><RefreshCw className="w-4 h-4" /> Refrescar</button>
            <AddButtonDropdown
                label="Nueva mesa"
                onQuickAdd={() => setShowCreateTable(true)}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de mesa"
              />
          </div>
        </div>

        {/* Main content */}
        <div className="flex gap-4" style={{ minHeight: 'calc(100vh - 340px)' }}>
          {/* Map or List view */}
          <div className={`${selectedTable ? 'flex-1' : 'w-full'} transition-all`}>
            {viewMode === 'map' ? (
              /* ── MAP VIEW ── */
              <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-800">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Plano de mesas</span>
                    <span className="text-xs text-gray-500">({filteredTables.length} mesas)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-3 text-xs flex-wrap">
                      {(Object.keys(STATUS_DOTS) as DiningTableStatus[]).filter((s) => !['hidden', 'reserved'].includes(s)).map((s) => (
                        <span key={s} className="flex items-center gap-1"><div className={`w-2.5 h-2.5 rounded-full ${STATUS_DOTS[s]}`} />{STATUS_LABELS[s]}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 border-l border-gray-200 dark:border-gray-700 pl-3">
                      <button onClick={() => setZoom((z) => Math.round(Math.max(MIN_ZOOM, z - ZOOM_STEP) * 100) / 100)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"><ZoomOut className="w-3.5 h-3.5 text-gray-500" /></button>
                      <span className="text-xs font-mono text-gray-500 w-10 text-center select-none">{Math.round(zoom * 100)}%</span>
                      <button onClick={() => setZoom((z) => Math.round(Math.min(MAX_ZOOM, z + ZOOM_STEP) * 100) / 100)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"><ZoomIn className="w-3.5 h-3.5 text-gray-500" /></button>
                      <button onClick={() => setZoom(1)} className="px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded">Reset</button>
                    </div>
                    <div className="flex items-center gap-1 border-l border-gray-200 dark:border-gray-700 pl-3">
                      <button onClick={() => { setWallMode((m) => !m); setWallStart(null); setWallPreview(null); setSelectedWall(null); }} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${wallMode ? 'bg-amber-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}>
                        {wallMode ? <MousePointer className="w-3 h-3" /> : <PenLine className="w-3 h-3" />}
                        {wallMode ? 'Salir' : 'Pared'}
                      </button>
                      {selectedWall && (
                        <button onClick={() => handleDeleteWall(selectedWall)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200"><Trash2 className="w-3 h-3" /> Eliminar</button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="overflow-auto" style={{ height: 600 }} onWheel={handleFloorWheel}>
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
                      {filteredTables.length === 0 && walls.length === 0 && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 pointer-events-none">
                          <UtensilsCrossed className="w-16 h-16 mb-3 opacity-30" />
                          <p className="font-semibold">Sin mesas</p>
                          <p className="text-sm mt-1">Pulsa "Nueva mesa" para empezar</p>
                        </div>
                      )}

                      {/* Walls */}
                      {walls.map((wall) => {
                        const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
                        const len = Math.sqrt(dx * dx + dy * dy);
                        const ang = Math.atan2(dy, dx) * (180 / Math.PI);
                        return (
                          <div key={wall._id}>
                            <div
                              className={`absolute cursor-pointer ${selectedWall === wall._id ? 'ring-2 ring-amber-400' : ''}`}
                              style={{ left: wall.x1, top: wall.y1 - wall.thickness / 2, width: len, height: wall.thickness, background: '#374151', borderRadius: 2, transform: `rotate(${ang}deg)`, transformOrigin: '0 50%' }}
                              onClick={(e) => { e.stopPropagation(); setSelectedWall(wall._id); }}
                            />
                            {wall.label && <div className="absolute text-[8px] text-gray-500 text-center" style={{ left: (wall.x1 + wall.x2) / 2 - 20, top: (wall.y1 + wall.y2) / 2 - 14, width: 40 }}>{wall.label}</div>}
                          </div>
                        );
                      })}

                      {/* Wall preview */}
                      {wallMode && wallStart && wallPreview && (() => {
                        const dx = wallPreview.x - wallStart.x, dy = wallPreview.y - wallStart.y;
                        const len = Math.sqrt(dx * dx + dy * dy);
                        const ang = Math.atan2(dy, dx) * (180 / Math.PI);
                        return <div className="absolute pointer-events-none" style={{ left: wallStart.x, top: wallStart.y - 3, width: len, height: 6, background: '#f59e0b', opacity: 0.6, borderRadius: 2, transform: `rotate(${ang}deg)`, transformOrigin: '0 50%' }} />;
                      })()}

                      {/* Tables */}
                      {filteredTables.map((table) => {
                        const tw = table.gridW * GRID_CELL, th = table.gridH * GRID_CELL;
                        const isSelected = selectedTable?._id === table._id;
                        const hasOrder = orders.some((o) => o.tableId === table._id && ['open', 'served', 'pending_payment'].includes(o.status));
                        const effectiveStatus = hasOrder && table.status === 'available' ? 'occupied' : table.status;

                        return (
                          <div
                            key={table._id}
                            className={`absolute rounded-xl border-2 flex flex-col items-center justify-center cursor-pointer select-none transition-shadow ${STATUS_COLORS[effectiveStatus as DiningTableStatus]} ${isSelected ? 'ring-2 ring-gray-900 dark:ring-white shadow-lg' : 'hover:shadow-md'}`}
                            style={{ left: table.x, top: table.y, width: tw, height: th }}
                            onMouseDown={(e) => handleFloorMouseDown(e, table._id)}
                            onClick={(e) => { e.stopPropagation(); setSelectedTable(table); }}
                          >
                            <span className="font-bold text-sm leading-none">{table.number}</span>
                            {table.currentGuests > 0 && (
                              <span className="text-[10px] flex items-center gap-0.5 mt-0.5 opacity-80"><Users className="w-2.5 h-2.5" />{table.currentGuests}</span>
                            )}
                            {table.occupiedAt && effectiveStatus !== 'available' && (
                              <span className={`text-[9px] mt-0.5 font-medium ${getTimeColor(table.occupiedAt)}`}>{formatOccupiedTime(table.occupiedAt)}</span>
                            )}
                            {table.zone && <span className="text-[8px] opacity-60 mt-0.5 truncate max-w-full px-1">{table.zone}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ── LIST VIEW ── */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredTables.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-500 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <UtensilsCrossed className="w-12 h-12 text-gray-300 mb-3" />
                    <p className="font-semibold">Sin mesas</p>
                    <p className="text-sm mt-1">Crea una mesa para empezar</p>
                  </div>
                ) : filteredTables.map((table) => {
                  const hasOrder = orders.some((o) => o.tableId === table._id && ['open', 'served', 'pending_payment'].includes(o.status));
                  const tableOrder = orders.find((o) => o.tableId === table._id && ['open', 'served', 'pending_payment'].includes(o.status));
                  const effectiveStatus = hasOrder && table.status === 'available' ? 'occupied' : table.status;
                  const isSelected = selectedTable?._id === table._id;

                  return (
                    <button
                      key={table._id}
                      onClick={() => setSelectedTable(table)}
                      className={`text-left p-4 rounded-xl border-2 transition-all ${isSelected ? 'border-gray-900 dark:border-white shadow-lg' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'} bg-white dark:bg-gray-800`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">#{table.number}</span>
                          {table.name && <span className="text-xs text-gray-500">{table.name}</span>}
                        </div>
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${STATUS_COLORS[effectiveStatus as DiningTableStatus]}`}>{STATUS_LABELS[effectiveStatus as DiningTableStatus]}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        {table.zone && <span className="flex items-center gap-1"><Coffee className="w-3 h-3" />{table.zone}</span>}
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{table.currentGuests || 0}/{table.capacity}</span>
                        {table.occupiedAt && effectiveStatus !== 'available' && (
                          <span className={`flex items-center gap-1 font-medium ${getTimeColor(table.occupiedAt)}`}><Clock className="w-3 h-3" />{formatOccupiedTime(table.occupiedAt)}</span>
                        )}
                      </div>
                      {tableOrder && (
                        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">{tableOrder.comandas.length} comanda{tableOrder.comandas.length !== 1 ? 's' : ''}</span>
                            <span className="font-bold text-gray-900 dark:text-gray-100">{tableOrder.total.toFixed(2)}€</span>
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Table detail panel (drawer) */}
          {selectedTable && (
            <div className="w-96 shrink-0 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 340px)' }}>
              {/* Panel header */}
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">Mesa #{selectedTable.number}</span>
                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${STATUS_COLORS[selectedTable.status]}`}>{STATUS_LABELS[selectedTable.status]}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                    {selectedTable.zone && <span>{selectedTable.zone}</span>}
                    <span><Users className="w-3 h-3 inline mr-0.5" />{selectedTable.currentGuests || 0}/{selectedTable.capacity}</span>
                    {selectedTable.occupiedAt && selectedTable.status !== 'available' && (
                      <span className={getTimeColor(selectedTable.occupiedAt)}><Clock className="w-3 h-3 inline mr-0.5" />{formatOccupiedTime(selectedTable.occupiedAt)}</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelectedTable(null)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"><X className="w-4 h-4 text-gray-500" /></button>
              </div>

              {/* Panel content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Available: open table */}
                {selectedTable.status === 'available' && !activeOrder && (
                  <div className="text-center py-6">
                    <UtensilsCrossed className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 mb-4">Mesa disponible</p>
                    <button
                      onClick={() => { setOpenGuests(2); setShowOpenTableModal(true); }}
                      className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2 mx-auto"
                    >
                      <Plus className="w-4 h-4" /> Abrir mesa
                    </button>
                  </div>
                )}

                {/* Active order: comandas */}
                {activeOrder && (
                  <>
                    {/* Comandas list */}
                    {activeOrder.comandas.length === 0 ? (
                      <div className="text-center py-4 text-gray-400">
                        <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">Sin comandas</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activeOrder.comandas.map((comanda) => (
                          <div key={comanda.id} className="border-2 border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden">
                            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Comanda #{comanda.orderNumber}</span>
                                <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full ${COMANDA_STATUS_COLORS[comanda.status]}`}>
                                  {COMANDA_STATUS_LABELS[comanda.status]}
                                </span>
                              </div>
                              <span className="text-[10px] text-gray-400">{comanda.createdAt ? new Date(comanda.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                            </div>
                            <div className="divide-y divide-gray-50 dark:divide-gray-700">
                              {comanda.items.map((item) => (
                                <div key={item.id} className="px-3 py-1.5 flex items-center justify-between text-sm">
                                  <div className="flex-1 min-w-0">
                                    <span className="text-gray-900 dark:text-gray-100">{item.quantity}x {item.name}</span>
                                    {item.notes && <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">{item.notes}</p>}
                                  </div>
                                  <span className="text-gray-600 dark:text-gray-400 font-medium shrink-0 ml-2">{(item.price * item.quantity).toFixed(2)}€</span>
                                </div>
                              ))}
                            </div>
                            {comanda.notes && <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 text-[10px] text-amber-700 dark:text-amber-400"><MessageSquare className="w-3 h-3 inline mr-1" />{comanda.notes}</div>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Order total */}
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="font-medium text-gray-900 dark:text-gray-100">{activeOrder.subtotal.toFixed(2)}€</span></div>
                      {activeOrder.discount > 0 && <div className="flex justify-between text-sm mt-1"><span className="text-red-500">Descuento</span><span className="font-medium text-red-600">-{activeOrder.discount.toFixed(2)}€</span></div>}
                      <div className="flex justify-between text-sm mt-1"><span className="text-gray-500">IVA</span><span className="font-medium text-gray-900 dark:text-gray-100">{activeOrder.tax.toFixed(2)}€</span></div>
                      <div className="flex justify-between text-base font-bold mt-2 pt-2 border-t border-gray-200 dark:border-gray-600"><span className="text-gray-900 dark:text-gray-100">Total</span><span className="text-gray-900 dark:text-gray-100">{activeOrder.total.toFixed(2)}€</span></div>
                    </div>
                  </>
                )}

                {/* Status change buttons */}
                {selectedTable.status !== 'available' && (
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs text-gray-400 mb-2 font-medium">Cambiar estado</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(STATUS_LABELS) as DiningTableStatus[]).filter((s) => s !== selectedTable.status && s !== 'hidden').map((s) => (
                        <button key={s} onClick={() => handleChangeStatus(selectedTable._id, s)} className={`px-2 py-1 text-[10px] font-medium rounded-lg border transition-colors ${STATUS_COLORS[s]}`}>{STATUS_LABELS[s]}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Delete table */}
                <button onClick={() => handleDeleteTable(selectedTable._id)} className="w-full px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 border-2 border-red-200 dark:border-red-800 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar mesa
                </button>
              </div>

              {/* Panel footer: actions */}
              {activeOrder && (
                <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex gap-2">
                  <button
                    onClick={() => { setComandaItems([]); setComandaNote(''); setProductSearch(''); setProductFilter('all'); setShowComandaBuilder(true); }}
                    className="flex-1 px-3 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-1.5"
                  >
                    <ChefHat className="w-4 h-4" /> Nueva comanda
                  </button>
                  <button
                    onClick={() => { setPayMethod('efectivo'); setPayReceived(''); setPayTip(''); setShowPaymentModal(true); }}
                    className="flex-1 px-3 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-1.5"
                  >
                    <CreditCard className="w-4 h-4" /> Cobrar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pickup orders section */}
        {pickups.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border-2 border-amber-200 dark:border-amber-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-semibold text-amber-900 dark:text-amber-300">Recogidas pendientes</span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded-full">{pickups.length}</span>
              </div>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-60 overflow-y-auto">
              {pickups.map((pickup) => (
                <div key={pickup._id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{pickup.orderNumber}</span>
                      <span className="text-xs text-gray-500">{pickup.customerName}</span>
                      {pickup.scheduledAt && (
                        <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">
                          <Clock className="w-3 h-3 inline mr-0.5" />{new Date(pickup.scheduledAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{pickup.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{pickup.totalAmount.toFixed(2)}€</span>
                    <span className={`block text-[10px] font-semibold ${pickup.status === 'listo' ? 'text-green-600' : 'text-amber-600'}`}>{pickup.status === 'listo' ? 'Listo' : 'En preparación'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── CREATE TABLE MODAL ── */}
      {showCreateTable && (
        <CreateTableModal onClose={() => setShowCreateTable(false)} onSave={handleCreateTable} existingNumbers={tables.map((t) => t.number)} />
      )}

      {/* ── OPEN TABLE MODAL ── */}
      {showOpenTableModal && selectedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowOpenTableModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Abrir Mesa #{selectedTable.number}</h3>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comensales</label>
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setOpenGuests(Math.max(1, openGuests - 1))} className="w-10 h-10 rounded-xl border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"><Minus className="w-4 h-4" /></button>
              <span className="text-3xl font-bold text-gray-900 dark:text-gray-100 w-12 text-center">{openGuests}</span>
              <button onClick={() => setOpenGuests(openGuests + 1)} className="w-10 h-10 rounded-xl border-2 border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"><Plus className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowOpenTableModal(false)} className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
              <button onClick={handleOpenTable} className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold">Abrir mesa</button>
            </div>
          </div>
        </div>
      )}

      {/* ── COMANDA BUILDER MODAL ── */}
      {showComandaBuilder && activeOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => setShowComandaBuilder(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nueva comanda — Mesa #{activeOrder.tableNumber}</h3>
                <p className="text-xs text-gray-500 mt-0.5">Selecciona productos y envía a cocina</p>
              </div>
              <button onClick={() => setShowComandaBuilder(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="flex-1 overflow-hidden flex">
              {/* Product catalog */}
              <div className="flex-1 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input type="text" placeholder="Buscar producto…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-gray-400 outline-none" />
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto">
                    <button onClick={() => setProductFilter('all')} className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 ${productFilter === 'all' ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>Todo</button>
                    {productCategories.map((c) => (
                      <button key={c} onClick={() => setProductFilter(c)} className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 ${productFilter === c ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>{c}</button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    {filteredProducts.map((product) => {
                      const inComanda = comandaItems.find((i) => i.productId === product.id);
                      return (
                        <button key={product.id} onClick={() => handleAddToComanda(product)} className={`text-left p-2.5 rounded-xl border-2 transition-colors ${inComanda ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-600' : 'border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'}`}>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{product.name}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-gray-500">{product.category}</span>
                            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{product.price.toFixed(2)}€</span>
                          </div>
                          {inComanda && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">x{inComanda.quantity}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Comanda items */}
              <div className="w-72 flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Comanda ({comandaItems.reduce((s, i) => s + i.quantity, 0)} items)</h4>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {comandaItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                      <Package className="w-8 h-8 mb-2 opacity-40" />
                      <p className="text-xs">Selecciona productos</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50 dark:divide-gray-700">
                      {comandaItems.map((item) => (
                        <div key={item.productId} className="px-4 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1">{item.name}</span>
                            <span className="text-sm font-bold text-gray-900 dark:text-gray-100 ml-2">{(item.price * item.quantity).toFixed(2)}€</span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-1">
                              <button onClick={() => setComandaItems((prev) => prev.map((i) => i.productId === item.productId ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i))} className="w-6 h-6 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Minus className="w-3 h-3" /></button>
                              <span className="text-sm font-semibold w-6 text-center text-gray-900 dark:text-gray-100">{item.quantity}</span>
                              <button onClick={() => setComandaItems((prev) => prev.map((i) => i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i))} className="w-6 h-6 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Plus className="w-3 h-3" /></button>
                            </div>
                            <button onClick={() => setComandaItems((prev) => prev.filter((i) => i.productId !== item.productId))} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                          <input
                            type="text"
                            placeholder="Notas (sin gluten, poco hecho…)"
                            value={item.notes}
                            onChange={(e) => setComandaItems((prev) => prev.map((i) => i.productId === item.productId ? { ...i, notes: e.target.value } : i))}
                            className="mt-1 w-full px-2 py-1 text-[11px] border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 placeholder-gray-400 outline-none focus:border-amber-400"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                  <input
                    type="text"
                    placeholder="Nota general (servir todo junto…)"
                    value={comandaNote}
                    onChange={(e) => setComandaNote(e.target.value)}
                    className="w-full px-3 py-2 text-xs border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-amber-400"
                  />
                  <div className="flex justify-between text-sm font-bold text-gray-900 dark:text-gray-100">
                    <span>Total</span>
                    <span>{comandaItems.reduce((s, i) => s + i.price * i.quantity, 0).toFixed(2)}€</span>
                  </div>
                  <button
                    onClick={handleSendComanda}
                    disabled={comandaItems.length === 0}
                    className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" /> Enviar a cocina
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PAYMENT MODAL ── */}
      {showPaymentModal && activeOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPaymentModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Cobrar Mesa #{activeOrder.tableNumber}</h3>
            <p className="text-sm text-gray-500 mb-4">{activeOrder.comandas.length} comanda{activeOrder.comandas.length !== 1 ? 's' : ''} · {activeOrder.comandas.reduce((s, c) => s + c.items.reduce((si, i) => si + i.quantity, 0), 0)} items</p>

            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl mb-4">
              <div className="flex justify-between font-bold text-lg text-gray-900 dark:text-gray-100">
                <span>Total</span><span>{activeOrder.total.toFixed(2)}€</span>
              </div>
            </div>

            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Método de pago</label>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { id: 'efectivo', label: 'Efectivo', icon: Banknote },
                { id: 'tarjeta', label: 'Tarjeta', icon: CreditCard },
                { id: 'bizum', label: 'Bizum', icon: Phone },
                { id: 'otro', label: 'Otro', icon: Receipt },
              ].map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setPayMethod(id)} className={`p-2.5 rounded-xl border-2 text-center transition-colors ${payMethod === id ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                  <Icon className={`w-5 h-5 mx-auto mb-1 ${payMethod === id ? 'text-green-600' : 'text-gray-400'}`} />
                  <span className={`text-xs font-medium ${payMethod === id ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>{label}</span>
                </button>
              ))}
            </div>

            {payMethod === 'efectivo' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Recibido</label>
                <input type="number" step="0.01" value={payReceived} onChange={(e) => setPayReceived(e.target.value)} placeholder={activeOrder.total.toFixed(2)} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-green-400" />
                {Number(payReceived) > activeOrder.total && (
                  <p className="text-sm font-semibold text-green-600 mt-1">Cambio: {(Number(payReceived) - activeOrder.total).toFixed(2)}€</p>
                )}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Propina (opcional)</label>
              <input type="number" step="0.01" value={payTip} onChange={(e) => setPayTip(e.target.value)} placeholder="0.00" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-green-400" />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowPaymentModal(false)} className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
              <button onClick={handlePay} className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4" /> Cobrar {activeOrder.total.toFixed(2)}€
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

// ─── Create Table Modal ──────────────────────────────────────────────────────

function CreateTableModal({ onClose, onSave, existingNumbers }: {
  onClose: () => void;
  onSave: (data: { number: number; zone: string; capacity: number; gridW: number; gridH: number; x: number; y: number }) => void;
  existingNumbers: number[];
}) {
  const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
  const [number, setNumber] = useState(nextNumber);
  const [zone, setZone] = useState('');
  const [capacity, setCapacity] = useState(4);
  const [gridW, setGridW] = useState(4);
  const [gridH, setGridH] = useState(4);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'number', label: 'Número' },
    { key: 'capacity', label: 'Capacidad' },
    { key: 'zone', label: 'Zona' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'number', label: 'Número', required: true, example: '' },
    { key: 'capacity', label: 'Capacidad', example: '' },
    { key: 'zone', label: 'Zona', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} mesa(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} mesa(s) importado(s)`);
  };


  const valid = number > 0 && !existingNumbers.includes(number);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Nueva mesa</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Número de mesa</label>
            <input type="number" value={number} onChange={(e) => setNumber(Number(e.target.value))} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-400" />
            {existingNumbers.includes(number) && <p className="text-xs text-red-500 mt-1">Ya existe la mesa {number}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Zona</label>
            <input type="text" value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Interior, Terraza…" className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Capacidad (comensales)</label>
            <input type="number" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} min={1} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ancho (celdas)</label>
              <input type="number" value={gridW} onChange={(e) => setGridW(Number(e.target.value))} min={2} max={10} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alto (celdas)</label>
              <input type="number" value={gridH} onChange={(e) => setGridH(Number(e.target.value))} min={2} max={10} className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-400" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
          <button onClick={() => onSave({ number, zone, capacity, gridW, gridH, x: 100, y: 100 })} disabled={!valid} className="flex-1 px-4 py-2.5 bg-gray-900 dark:bg-white hover:bg-black dark:hover:bg-gray-200 disabled:opacity-50 text-white dark:text-gray-900 rounded-xl text-sm font-semibold">
            Crear mesa
          </button>
        </div>
      </div>
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="sala_tables"
        moduleLabel="Mesas"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Mesas"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </div>
  );
}
