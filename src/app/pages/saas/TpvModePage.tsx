import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useModalClose } from '../../hooks/useModalClose';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  UserCheck,
  Receipt,
  X,
  Package,
  UtensilsCrossed,
  Scissors,
  Dumbbell,
  Stethoscope,
  Pill,
  PawPrint,
  Sparkles,
  Clock,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { listCatalogItemsRequest, type CatalogItem } from '../../lib/deliveryApi';
import { listClockins, type ClockinRecord } from '../../lib/clockinsApi';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { useTpv, type TpvWorker } from '../../context/TpvContext';
import type { BusinessType } from '../../lib/businessApi';
import { DealershipCatalogPage } from './DealershipCatalogPage';
import { EventsWorkstationPage } from './EventsWorkstationPage';
import { HairSalonWorkstationPage } from './HairSalonWorkstationPage';

const VERTICAL_CATALOG_LABELS: Partial<Record<BusinessType, { title: string; icon: React.ReactNode; emptyLabel: string }>> = {
  delivery:    { title: 'Platos y Bebidas', icon: <UtensilsCrossed className="w-5 h-5" />, emptyLabel: 'platos' },
  hairSalon:   { title: 'Servicios',        icon: <Scissors className="w-5 h-5" />,        emptyLabel: 'servicios' },
  gym:         { title: 'Productos y Planes', icon: <Dumbbell className="w-5 h-5" />,      emptyLabel: 'productos' },
  clinic:      { title: 'Tratamientos',      icon: <Stethoscope className="w-5 h-5" />,    emptyLabel: 'tratamientos' },
  pharmacy:    { title: 'Medicamentos',      icon: <Pill className="w-5 h-5" />,            emptyLabel: 'medicamentos' },
  vet:         { title: 'Servicios y Productos', icon: <PawPrint className="w-5 h-5" />,   emptyLabel: 'servicios' },
  nightclub:   { title: 'Bebidas y Botellas', icon: <Sparkles className="w-5 h-5" />,      emptyLabel: 'productos' },
};

const DEFAULT_CATALOG_LABEL = { title: 'Productos', icon: <Package className="w-5 h-5" />, emptyLabel: 'productos' };

function getVerticalLabel(bt?: BusinessType | null) {
  if (!bt) return DEFAULT_CATALOG_LABEL;
  return VERTICAL_CATALOG_LABELS[bt] ?? DEFAULT_CATALOG_LABEL;
}

function formatCurrency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

interface TpvModePageProps {
  salesPoint?: { _id: string; id: string; name: string } | null;
}

export function TpvModePage({ salesPoint }: TpvModePageProps = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const {
    lines,
    activeWorker,
    ticketTotal,
    ticketCount,
    addItem,
    removeItem,
    updateQuantity,
    clearTicket,
    setActiveWorker,
  } = useTpv();

  const vertical = currentBusiness?.businessType as BusinessType | undefined;
  const vLabel = getVerticalLabel(vertical);

  if (vertical === 'carDealership') {
    return (
      <DealershipCatalogPage
        salesPoint={salesPoint}
        onBack={() => navigate(-1)}
      />
    );
  }

  if (vertical === 'events') {
    return (
      <EventsWorkstationPage
        salesPoint={salesPoint}
        onBack={() => navigate(-1)}
      />
    );
  }

  if (vertical === 'hairSalon') {
    return (
      <HairSalonWorkstationPage
        salesPoint={salesPoint}
        onBack={() => navigate(-1)}
      />
    );
  }

  // ── Catalog ──
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // ── Workers ──
  const [clockedInWorkers, setClockedInWorkers] = useState<TpvWorker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(true);

  // ── Mobile ticket panel ──
  const [showMobileTicket, setShowMobileTicket] = useState(false);

  useModalClose(showMobileTicket, () => setShowMobileTicket(false));

  const userId = user?.user_id || '';
  const businessId = currentBusiness?.business_id || '';

  useEffect(() => {
    if (!userId) return;
    setCatalogLoading(true);
    listCatalogItemsRequest(userId)
      .then(items => setCatalog(items.filter(i => i.active)))
      .catch(() => toast.error('Error al cargar catálogo'))
      .finally(() => setCatalogLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!businessId) return;
    setWorkersLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    listClockins(businessId, { date: today })
      .then(records => {
        const active = records.filter((r: ClockinRecord) => r.status === 'active' || r.status === 'break');
        const workers: TpvWorker[] = active.map(r => ({
          id: r.member_id,
          name: r.member_name,
        }));
        const uniqueById = Array.from(new Map(workers.map(w => [w.id, w])).values());
        setClockedInWorkers(uniqueById);
        if (!activeWorker && uniqueById.length > 0) {
          setActiveWorker(uniqueById[0]);
        }
      })
      .catch(() => toast.error('Error al cargar trabajadores'))
      .finally(() => setWorkersLoading(false));
  }, [businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(() => {
    const cats = new Set(catalog.map(i => i.category).filter(Boolean));
    return ['Todos', ...Array.from(cats).sort()];
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    let items = catalog;
    if (activeCategory && activeCategory !== 'Todos') {
      items = items.filter(i => i.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q));
    }
    return items;
  }, [catalog, activeCategory, searchQuery]);

  const handleAddItem = useCallback((item: CatalogItem) => {
    addItem(item);
  }, [addItem]);

  const handleFinalizeSale = useCallback(() => {
    if (lines.length === 0) {
      toast.error('Añade productos al ticket');
      return;
    }
    if (!activeWorker) {
      toast.error('Selecciona un trabajador');
      return;
    }
    toast.success(`Venta de ${formatCurrency(ticketTotal)} registrada por ${activeWorker.name}`);
    clearTicket();
    setShowMobileTicket(false);
  }, [lines, activeWorker, ticketTotal, clearTicket]);

  // ── Worker initials helper ──
  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (parts[0]?.[0] || '?').toUpperCase();
  };

  // ── Ticket panel (shared between desktop and mobile) ──
  const ticketPanel = (
    <div className="flex flex-col h-full">
      {/* Active worker indicator */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 mb-2">
          <UserCheck className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Atendido por
          </span>
        </div>
        {workersLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            Cargando...
          </div>
        ) : clockedInWorkers.length === 0 ? (
          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
            No hay trabajadores fichados hoy
          </p>
        ) : (
          <div className="flex gap-1.5 flex-wrap">
            {clockedInWorkers.map(w => {
              const isActive = activeWorker?.id === w.id;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setActiveWorker(w)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-gray-900'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                  title={w.name}
                >
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                    isActive
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                  }`}>
                    {getInitials(w.name)}
                  </span>
                  <span className="truncate max-w-[80px]">{w.name.split(' ')[0]}</span>
                  {isActive && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Ticket lines */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
            <ShoppingCart className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">Ticket vacío</p>
            <p className="text-xs">Añade productos desde el catálogo</p>
          </div>
        ) : (
          lines.map(line => (
            <div
              key={line.id}
              className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/60 rounded-lg group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {line.catalogItem.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatCurrency(line.unitPrice)} x {line.quantity}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => updateQuantity(line.id, line.quantity - 1)}
                  className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-600 dark:text-gray-400 hover:text-red-600 transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-7 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {line.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => updateQuantity(line.id, line.quantity + 1)}
                  className="w-7 h-7 flex items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-gray-600 dark:text-gray-400 hover:text-emerald-600 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 w-16 text-right">
                {formatCurrency(line.total)}
              </span>
              <button
                type="button"
                onClick={() => removeItem(line.id)}
                className="w-7 h-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Total + Actions */}
      <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {ticketCount} artículo{ticketCount !== 1 ? 's' : ''}
          </span>
          <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {formatCurrency(ticketTotal)}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={clearTicket}
            disabled={lines.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <X className="w-4 h-4" />
            Vaciar
          </button>
          <button
            type="button"
            onClick={handleFinalizeSale}
            disabled={lines.length === 0}
            className="flex-[2] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-emerald-600/20"
          >
            <Receipt className="w-4 h-4" />
            Cobrar {ticketTotal > 0 ? formatCurrency(ticketTotal) : ''}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-100 dark:bg-gray-950">
      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-between px-4 py-2.5 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Salir</span>
          </button>
          <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Receipt className="w-4.5 h-4.5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {salesPoint ? `TPV — ${salesPoint.name}` : 'Modo TPV'}
              </h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
                {salesPoint ? currentBusiness?.name : (currentBusiness?.name || 'Punto de Venta')}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeWorker && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/20 rounded-full border border-emerald-200 dark:border-emerald-800">
              <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px] font-bold">
                {getInitials(activeWorker.name)}
              </span>
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                {activeWorker.name.split(' ')[0]}
              </span>
            </div>
          )}
          {/* Mobile ticket toggle */}
          <button
            type="button"
            onClick={() => setShowMobileTicket(true)}
            className="lg:hidden relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold shadow-md"
          >
            <ShoppingCart className="w-4 h-4" />
            {ticketCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {ticketCount}
              </span>
            )}
            <span className="hidden sm:inline">{formatCurrency(ticketTotal)}</span>
          </button>
        </div>
      </header>

      {/* Main area */}
      <div className="flex-1 min-h-0 flex">
        {/* Catalog panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Search + category filters */}
          <div className="shrink-0 p-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={`Buscar ${vLabel.emptyLabel}...`}
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              {categories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat === 'Todos' ? null : cat)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    (cat === 'Todos' && !activeCategory) || activeCategory === cat
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product grid */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3">
            {catalogLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
                {vLabel.icon}
                <p className="mt-2 text-sm">No se encontraron {vLabel.emptyLabel}</p>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="mt-1 text-xs text-emerald-600 hover:underline"
                  >
                    Limpiar búsqueda
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5">
                {filteredCatalog.map(item => {
                  const inTicket = lines.find(l => l.catalogItem._id === item._id);
                  return (
                    <button
                      key={item._id}
                      type="button"
                      onClick={() => handleAddItem(item)}
                      className={`relative flex flex-col items-center p-3 rounded-xl border-2 transition-all active:scale-95 ${
                        inTicket
                          ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 shadow-md'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-md'
                      }`}
                    >
                      {inTicket && (
                        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                          {inTicket.quantity}
                        </span>
                      )}
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-14 h-14 md:w-16 md:h-16 rounded-lg object-cover mb-2"
                        />
                      ) : (
                        <div className="w-14 h-14 md:w-16 md:h-16 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-2">
                          <Package className="w-6 h-6 text-gray-300 dark:text-gray-600" />
                        </div>
                      )}
                      <span className="text-xs font-medium text-gray-900 dark:text-gray-100 text-center leading-tight line-clamp-2 w-full">
                        {item.name}
                      </span>
                      <span className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(item.unitPrice)}
                      </span>
                      {item.category && (
                        <span className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-full">
                          {item.category}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Desktop ticket panel */}
        <div className="hidden lg:flex w-80 xl:w-96 flex-col border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          {ticketPanel}
        </div>
      </div>

      {/* Mobile ticket drawer */}
      {showMobileTicket && (
        <div className="lg:hidden fixed inset-0 z-[60] flex flex-col">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowMobileTicket(false)}
          />
          <div className="relative mt-auto bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                Ticket actual
              </h2>
              <button
                type="button"
                onClick={() => setShowMobileTicket(false)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {ticketPanel}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
