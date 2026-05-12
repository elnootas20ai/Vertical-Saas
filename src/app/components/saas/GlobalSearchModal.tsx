import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDebounce } from '../../hooks/useDebounce';
import {
  Search, X, Sparkles, UserRound, Car, FileText, MapPin, Users, TrendingUp, Command, Truck, Package,
  LayoutDashboard, ClipboardList, CalendarDays, Clock, BookmarkCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import type { BusinessType } from '../../lib/businessApi';
import { hydrateParkingZonesWithVehicles } from '../../lib/parkingZones';
import { SALE_STAGE_TOKEN } from './DesignTokens';
import { listDocumentsRequest, type DocumentRecord } from '../../lib/documentsApi';
import { listDeliveryOrdersRequest, type DeliveryOrder } from '../../lib/deliveryApi';

// ─── Types ────────────────────────────────────────────────────────────────────

type SearchCategory = 'lead' | 'client' | 'vehicle' | 'sale' | 'document' | 'zone' | 'team' | 'order';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  category: SearchCategory;
  route: string;
  searchText: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_ORDER_DEFAULT: SearchCategory[] = ['vehicle', 'client', 'lead', 'sale', 'document', 'zone', 'team'];
const CATEGORY_ORDER_DELIVERY: SearchCategory[] = ['order', 'client', 'lead', 'document', 'team'];
const CATEGORY_ORDER_WORKER: SearchCategory[] = ['document', 'team'];

const CATEGORY_ICONS: Record<SearchCategory, React.ReactNode> = {
  lead: <Sparkles className="w-3.5 h-3.5" />,
  client: <UserRound className="w-3.5 h-3.5" />,
  vehicle: <Car className="w-3.5 h-3.5" />,
  sale: <TrendingUp className="w-3.5 h-3.5" />,
  document: <FileText className="w-3.5 h-3.5" />,
  zone: <MapPin className="w-3.5 h-3.5" />,
  team: <Users className="w-3.5 h-3.5" />,
  order: <Package className="w-3.5 h-3.5" />,
};

const CATEGORY_COLORS: Record<SearchCategory, string> = {
  lead: 'text-violet-600 bg-violet-50 dark:text-violet-300 dark:bg-violet-950',
  client: 'text-blue-600 bg-blue-50 dark:text-blue-300 dark:bg-blue-950',
  vehicle: 'text-emerald-600 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950',
  sale: 'text-orange-600 bg-orange-50 dark:text-orange-300 dark:bg-orange-950',
  document: 'text-amber-600 bg-amber-50 dark:text-amber-300 dark:bg-amber-950',
  zone: 'text-rose-600 bg-rose-50 dark:text-rose-300 dark:bg-rose-950',
  team: 'text-slate-600 bg-slate-100 dark:text-slate-300 dark:bg-slate-800',
  order: 'text-cyan-600 bg-cyan-50 dark:text-cyan-300 dark:bg-cyan-950',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// ─── Quick actions shown before typing ────────────────────────────────────────

const QUICK_ACTIONS_DEFAULT = [
  { label: 'Ir a Vehículos', shortcut: 'G V', route: '/saas/vehicles', icon: <Car className="w-4 h-4" /> },
  { label: 'Ir a Clientes', shortcut: 'G C', route: '/saas/clients', icon: <UserRound className="w-4 h-4" /> },
  { label: 'Ir a Reservas', shortcut: 'G R', route: '/saas/reservations', icon: <BookmarkCheck className="w-4 h-4" /> },
  { label: 'Ir a Ventas', shortcut: 'G S', route: '/saas/sales', icon: <TrendingUp className="w-4 h-4" /> },
  { label: 'Ir a Pipeline', shortcut: 'G P', route: '/saas/pipeline', icon: <Sparkles className="w-4 h-4" /> },
];

const QUICK_ACTIONS_DELIVERY = [
  { label: 'Ir a Pedidos', shortcut: 'G D', route: '/saas/delivery', icon: <Truck className="w-4 h-4" /> },
  { label: 'Ir a Clientes', shortcut: 'G C', route: '/saas/clients', icon: <UserRound className="w-4 h-4" /> },
  { label: 'Ir a Catálogo', shortcut: 'G A', route: '/saas/catalog', icon: <Package className="w-4 h-4" /> },
  { label: 'Ir a Finanzas', shortcut: 'G F', route: '/saas/finance', icon: <TrendingUp className="w-4 h-4" /> },
];

const QUICK_ACTIONS_WORKER = [
  { label: 'Ir a Inicio', shortcut: 'G H', route: '/saas/worker', icon: <LayoutDashboard className="w-4 h-4" /> },
  { label: 'Ir a Mi trabajo', shortcut: 'G T', route: '/saas/worker/tasks', icon: <ClipboardList className="w-4 h-4" /> },
  { label: 'Ir a Calendario', shortcut: 'G C', route: '/saas/worker/calendar', icon: <CalendarDays className="w-4 h-4" /> },
  { label: 'Ir a Fichaje', shortcut: 'G F', route: '/saas/worker/clock', icon: <Clock className="w-4 h-4" /> },
  { label: 'Ir a Documentos', shortcut: 'G D', route: '/saas/worker/documents', icon: <FileText className="w-4 h-4" /> },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalSearchModal({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentBusiness } = useBusiness();
  const vertical: BusinessType = (currentBusiness?.businessType as BusinessType) || 'carDealership';
  const isDelivery = vertical === 'delivery';
  const [workerMode, setWorkerMode] = useState(false);

  const CATEGORY_LABEL: Record<SearchCategory, string> = {
    lead: 'Leads',
    client: t('nav.clients'),
    vehicle: t('nav.vehicles'),
    sale: t('nav.sales'),
    document: t('nav.documents'),
    zone: t('locations.zones', { defaultValue: 'Zonas' }),
    team: t('nav.team'),
    order: 'Pedidos',
  };
  const CATEGORY_ORDER = workerMode ? CATEGORY_ORDER_WORKER : isDelivery ? CATEGORY_ORDER_DELIVERY : CATEGORY_ORDER_DEFAULT;
  const QUICK_ACTIONS = workerMode ? QUICK_ACTIONS_WORKER : isDelivery ? QUICK_ACTIONS_DELIVERY : QUICK_ACTIONS_DEFAULT;

  const { leads, clients, vehicles, parkingZones, sales } = useApp();
  const { listUsers, user: authUser } = useAuth();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 200);
  const [activeIndex, setActiveIndex] = useState(0);
  const [teamMembers, setTeamMembers] = useState<
    Array<{ user_id: string; fullName: string; email: string; role?: string }>
  >([]);
  const [realDocuments, setRealDocuments] = useState<DocumentRecord[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);

  useEffect(() => {
    void listUsers()
      .then(setTeamMembers)
      .catch(() => setTeamMembers([]));
  }, [listUsers]);

  // Load real documents from backend
  useEffect(() => {
    if (!authUser?.user_id) return;
    void listDocumentsRequest(authUser.user_id)
      .then(setRealDocuments)
      .catch(() => setRealDocuments([]));
  }, [authUser?.user_id]);

  useEffect(() => {
    if (!authUser?.user_id || !isDelivery) return;
    void listDeliveryOrdersRequest(authUser.user_id)
      .then(setDeliveryOrders)
      .catch(() => setDeliveryOrders([]));
  }, [authUser?.user_id, isDelivery]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setWorkerMode(window.localStorage.getItem('saas-worker-mode') === 'true');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const zones = useMemo(() => hydrateParkingZonesWithVehicles(parkingZones, vehicles), [parkingZones, vehicles]);

  const STATUS_LABELS: Record<string, string> = {
    pending: 'Pendiente', preparing: 'Preparando', kitchen: 'En cocina',
    assembly: 'En montaje', delivery: 'En reparto', delivered: 'Entregado',
    cancelled: 'Cancelado', incident: 'Incidencia',
  };

  const allResults = useMemo<SearchResult[]>(() => {
    const results: SearchResult[] = [];

    if (workerMode) {
      results.push(
        ...realDocuments.map(d => ({
          id: `document-${d.id}`,
          title: d.name,
          subtitle: [d.relatedTo || '', d.docType || '', d.status].filter(Boolean).join(' · '),
          category: 'document' as const,
          route: `/saas/worker/documents`,
          searchText: `${d.name} ${d.relatedTo || ''} ${d.docType || ''} ${d.status}`,
        })),
        ...teamMembers.map(m => ({
          id: `team-${m.user_id}`,
          title: m.fullName,
          subtitle: [m.email, m.role || 'Usuario'].filter(Boolean).join(' · '),
          category: 'team' as const,
          route: `/saas/worker`,
          searchText: `${m.fullName} ${m.email} ${m.role || ''}`,
        })),
      );
      return results;
    }

    if (!isDelivery) {
      results.push(
        ...vehicles.map(v => ({
          id: `vehicle-${v.id}`,
          title: `${v.brand} ${v.model}`,
          subtitle: [v.registrationPlate, String(v.year || ''), v.location || 'Sin ubicación'].filter(Boolean).join(' · '),
          category: 'vehicle' as const,
          route: `/saas/vehicles/${encodeURIComponent(v.id)}`,
          searchText: `${v.brand} ${v.model} ${v.registrationPlate} ${v.location || ''} ${v.vin || ''}`,
        })),
        ...sales.map(s => ({
          id: `sale-${s.id}`,
          title: `${s.vehicleName} — ${s.clientName}`,
          subtitle: [SALE_STAGE_TOKEN[s.stage]?.label || s.stage, `${s.totalPrice?.toLocaleString('es-ES')}€`, s.responsible].filter(Boolean).join(' · '),
          category: 'sale' as const,
          route: `/saas/sales/${encodeURIComponent(s.id)}`,
          searchText: `${s.vehicleName} ${s.clientName} ${s.vehiclePlate || ''} ${s.responsible}`,
        })),
        ...zones.map(z => ({
          id: `zone-${z.id}`,
          title: z.name,
          subtitle: `${z.description} · ${z.spots.filter((sp: any) => sp.vehicleId).length}/${z.capacity} ocupadas`,
          category: 'zone' as const,
          route: `/saas/locations/${encodeURIComponent(z.id)}`,
          searchText: `${z.name} ${z.description}`,
        })),
      );
    } else {
      results.push(
        ...deliveryOrders.map(o => ({
          id: `order-${o.id}`,
          title: `#${o.orderNumber} · ${o.customerName}`,
          subtitle: [STATUS_LABELS[o.status] || o.status, `${(o.totalAmount || 0).toLocaleString('es-ES')}€`, o.customerPhone].filter(Boolean).join(' · '),
          category: 'order' as const,
          route: '/saas/delivery',
          searchText: `${o.orderNumber} ${o.customerName} ${o.customerPhone} ${o.customerAddress} ${o.status}`,
        })),
      );
    }

    results.push(
      ...clients.map(c => ({
        id: `client-${c.id}`,
        title: c.name,
        subtitle: [c.email, c.phone, c.city || ''].filter(Boolean).join(' · '),
        category: 'client' as const,
        route: `/saas/clients/${encodeURIComponent(c.id)}`,
        searchText: `${c.name} ${c.email} ${c.phone} ${c.city || ''} ${c.dni || ''}`,
      })),
      ...leads.map(l => ({
        id: `lead-${l.id}`,
        title: l.name,
        subtitle: [l.vehicleInterest || l.interestedVehicle || (isDelivery ? '' : 'Sin vehículo'), l.phone, l.email || ''].filter(Boolean).join(' · '),
        category: 'lead' as const,
        route: `/saas/clients?tab=leads&leadId=${encodeURIComponent(l.id)}`,
        searchText: `${l.name} ${l.phone} ${l.email || ''} ${l.vehicleInterest || ''}`,
      })),
      ...realDocuments.map(d => ({
        id: `document-${d.id}`,
        title: d.name,
        subtitle: [d.relatedTo || '', d.docType || '', d.status].filter(Boolean).join(' · '),
        category: 'document' as const,
        route: `/saas/documents/${encodeURIComponent(d.id)}`,
        searchText: `${d.name} ${d.relatedTo || ''} ${d.docType || ''} ${d.status}`,
      })),
      ...teamMembers.map(m => ({
        id: `team-${m.user_id}`,
        title: m.fullName,
        subtitle: [m.email, m.role || 'Usuario'].filter(Boolean).join(' · '),
        category: 'team' as const,
        route: `/saas/team?memberId=${encodeURIComponent(m.user_id)}`,
        searchText: `${m.fullName} ${m.email} ${m.role || ''}`,
      })),
    );

    return results;
  }, [clients, realDocuments, leads, sales, teamMembers, vehicles, zones, deliveryOrders, isDelivery, workerMode]);

  const normalizedQuery = useMemo(() => normalize(debouncedQuery), [debouncedQuery]);

  const filteredResults = useMemo(() => {
    if (!normalizedQuery) return [];

    return allResults
      .map(result => {
        const normTitle = normalize(result.title);
        const normSub = normalize(result.subtitle);
        const normSearch = normalize(result.searchText);
        if (!normTitle.includes(normalizedQuery) && !normSub.includes(normalizedQuery) && !normSearch.includes(normalizedQuery)) {
          return null;
        }
        let score = 0;
        if (normTitle.startsWith(normalizedQuery)) score += 6;
        else if (normTitle.includes(normalizedQuery)) score += 4;
        if (normSub.includes(normalizedQuery)) score += 2;
        return { ...result, score };
      })
      .filter((r): r is SearchResult & { score: number } => Boolean(r))
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'es'))
      .slice(0, 15);
  }, [allResults, normalizedQuery]);

  const groupedResults = useMemo(() => {
    const groups: Partial<Record<SearchCategory, (SearchResult & { score: number })[]>> = {};
    for (const r of filteredResults) {
      if (!groups[r.category]) groups[r.category] = [];
      groups[r.category]!.push(r);
    }
    return groups;
  }, [filteredResults]);

  // Flat list for keyboard navigation
  const flatResults = useMemo(() =>
    CATEGORY_ORDER.flatMap(cat => groupedResults[cat] ?? []),
    [groupedResults]
  );

  const handleSelect = useCallback((result: SearchResult) => {
    navigate(result.route);
    onClose();
  }, [navigate, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, (normalizedQuery ? flatResults.length : QUICK_ACTIONS.length) - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (normalizedQuery && flatResults[activeIndex]) {
        handleSelect(flatResults[activeIndex]);
      } else if (!normalizedQuery && QUICK_ACTIONS[activeIndex]) {
        navigate(QUICK_ACTIONS[activeIndex].route);
        onClose();
      }
    }
  }, [normalizedQuery, flatResults, activeIndex, handleSelect, navigate, onClose]);

  // Reset active index on query change
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl dark:shadow-black/40 border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
          <Search className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={workerMode ? t('topbar.searchWorker', { defaultValue: 'Buscar documentos, compañeros…' }) : isDelivery ? 'Buscar pedidos, clientes, documentos…' : t('topbar.search', { defaultValue: 'Buscar vehículos, clientes, leads, ventas…' })}
            className="flex-1 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-base outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </button>
          )}
          <button
            onClick={onClose}
            className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Esc
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {!normalizedQuery ? (
            // Quick actions
            <div className="p-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 px-2 mb-2">{t('globalSearch.quickActions', { defaultValue: 'Acciones rápidas' })}</p>
              {QUICK_ACTIONS.map((action, idx) => (
                <button
                  key={action.route}
                  data-index={idx}
                  onClick={() => { navigate(action.route); onClose(); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${activeIndex === idx ? 'bg-blue-50 dark:bg-blue-950' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                >
                  <span className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {action.icon}
                  </span>
                  <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300">{action.label}</span>
                  <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 px-2 py-0.5 rounded-lg">{action.shortcut}</span>
                </button>
              ))}
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Search className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('globalSearch.noResults', { query, defaultValue: `Sin resultados para "${query}"` })}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('globalSearch.tryOther', { defaultValue: 'Prueba con otros términos' })}</p>
            </div>
          ) : (
            (() => {
              let flatIdx = 0;
              return CATEGORY_ORDER.filter(cat => groupedResults[cat]?.length).map((category, groupIdx) => (
                <div key={category} className={groupIdx > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}>
                  <div className={`flex items-center gap-2 px-4 py-2 ${CATEGORY_COLORS[category]}`}>
                    {CATEGORY_ICONS[category]}
                    <span className="text-[11px] font-bold uppercase tracking-widest">{CATEGORY_LABEL[category]}</span>
                    <span className="ml-auto text-[11px] font-semibold opacity-60">{groupedResults[category]!.length}</span>
                  </div>
                  {groupedResults[category]!.map((result) => {
                    const myIdx = flatIdx++;
                    return (
                      <button
                        key={result.id}
                        data-index={myIdx}
                        onMouseEnter={() => setActiveIndex(myIdx)}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => handleSelect(result)}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${activeIndex === myIdx ? 'bg-blue-50 dark:bg-blue-950' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{result.title}</span>
                          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{result.subtitle}</span>
                        </span>
                        <span className="text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 px-2 py-0.5 rounded flex-shrink-0 opacity-0 group-hover:opacity-100">
                          ↵
                        </span>
                      </button>
                    );
                  })}
                </div>
              ));
            })()
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-2.5 flex items-center gap-4 bg-gray-50 dark:bg-gray-950">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-[10px] font-mono">↑↓</kbd>
            <span>navegar</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-[10px] font-mono">↵</kbd>
            <span>seleccionar</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500">
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-[10px] font-mono">Esc</kbd>
            <span>cerrar</span>
          </div>
          <div className="ml-auto flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
            <Command className="w-3 h-3" />
            <span className="font-mono">K</span>
            <span>para buscar</span>
          </div>
        </div>
      </div>
    </div>
  );
}
