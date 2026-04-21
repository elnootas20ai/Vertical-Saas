import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { updateVehicleRequest } from '../../lib/vehicleApi';
import { toast } from 'sonner';
import { VEHICLE_STATUS_TOKEN, type VehicleStatus, daysColor } from '../../components/saas/DesignTokens';
import { usePagination } from '../../hooks/usePagination';
import { Pagination } from '../../components/saas/Pagination';
import {
  Search, X, SlidersHorizontal, ChevronDown, ChevronRight, ChevronLeft,
  Car, Fuel, Gauge, Calendar, Euro, MapPin, LayoutGrid, List,
  ArrowUpDown, ArrowUp, ArrowDown, Share2, BookmarkPlus, Eye,
  Copy, Check, ExternalLink, Phone, Mail,
  Bookmark, Tag, Palette, Zap, DoorOpen, ToggleLeft, Clock,
  ArrowLeft, Star, Heart, GitCompare, Loader2, ImageOff,
  Filter, RotateCcw, AlertCircle,
} from 'lucide-react';
import type { Vehicle } from '../../context/AppContext';

const FUEL_LABELS: Record<string, string> = {
  gasolina: 'Gasolina', diesel: 'Diésel', hibrido: 'Híbrido',
  electrico: 'Eléctrico', glp: 'GLP', otro: 'Otro',
};
const TRANS_LABELS: Record<string, string> = {
  manual: 'Manual', automatico: 'Automático', semiauto: 'Semiautomático',
};
const BODY_LABELS: Record<string, string> = {
  sedan: 'Sedán', suv: 'SUV', familiar: 'Familiar', coupe: 'Coupé',
  cabrio: 'Cabrio', furgon: 'Furgón', pickup: 'Pick-up', otro: 'Otro',
};
const ORIGIN_LABELS: Record<string, string> = {
  particular: 'Particular', empresa: 'Empresa', subasta: 'Subasta',
  permuta: 'Permuta', otro: 'Otro',
};

type SortOption = 'newest' | 'price-asc' | 'price-desc' | 'year-desc' | 'year-asc' | 'km-asc' | 'km-desc' | 'days-asc' | 'days-desc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Más recientes' },
  { value: 'price-asc', label: 'Precio: menor a mayor' },
  { value: 'price-desc', label: 'Precio: mayor a menor' },
  { value: 'year-desc', label: 'Año: más nuevos' },
  { value: 'year-asc', label: 'Año: más antiguos' },
  { value: 'km-asc', label: 'Km: menos kilómetros' },
  { value: 'km-desc', label: 'Km: más kilómetros' },
  { value: 'days-asc', label: 'Menos días en stock' },
  { value: 'days-desc', label: 'Más días en stock' },
];

function formatPrice(n?: number | null) {
  if (!n) return '—';
  return n.toLocaleString('es-ES') + ' €';
}

function formatKm(n?: number | null) {
  if (!n) return '—';
  return n.toLocaleString('es-ES') + ' km';
}

function getVehicleDays(v: Vehicle) {
  const d = v.purchaseDate ?? v.createdAt;
  if (!d) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
}

function StatusBadge({ status }: { status: string }) {
  const t = VEHICLE_STATUS_TOKEN[status as VehicleStatus];
  if (!t) return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">{status}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${t.badgeBg} ${t.badgeText}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
      {t.label}
    </span>
  );
}

function SpecChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400">
      {icon}{label}
    </span>
  );
}

// ─── Filter Section ──────────────────────────────────────────────────────────

interface FiltersState {
  brands: string[];
  fuelTypes: string[];
  transmissions: string[];
  bodyTypes: string[];
  colors: string[];
  statuses: string[];
  yearMin: string;
  yearMax: string;
  priceMin: string;
  priceMax: string;
  kmMin: string;
  kmMax: string;
}

const EMPTY_FILTERS: FiltersState = {
  brands: [], fuelTypes: [], transmissions: [], bodyTypes: [],
  colors: [], statuses: [], yearMin: '', yearMax: '',
  priceMin: '', priceMax: '', kmMin: '', kmMax: '',
};

function FilterCheckboxGroup({ title, icon, options, selected, onChange }: {
  title: string;
  icon: React.ReactNode;
  options: { value: string; label: string; count?: number }[];
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(selected.length > 0);
  const [search, setSearch] = useState('');
  const filtered = search ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())) : options;

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(s => s !== val) : [...selected, val]);
  };

  return (
    <div className="border-b border-gray-100 dark:border-gray-800">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className="text-gray-400 dark:text-gray-500">{icon}</span>
        <span className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</span>
        {selected.length > 0 && (
          <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
            {selected.length}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-1.5">
          {options.length > 6 && (
            <div className="relative mb-1">
              <Search className="w-3 h-3 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:border-blue-400 focus:outline-none"
              />
            </div>
          )}
          <div className="max-h-44 overflow-y-auto space-y-0.5">
            {filtered.map(opt => {
              const checked = selected.includes(opt.value);
              return (
                <button
                  key={opt.value} onClick={() => toggle(opt.value)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${checked ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                >
                  <span className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600'}`}>
                    {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </span>
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">{opt.label}</span>
                  {opt.count != null && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">{opt.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterRange({ title, icon, minVal, maxVal, onMinChange, onMaxChange, placeholder }: {
  title: string;
  icon: React.ReactNode;
  minVal: string;
  maxVal: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  placeholder?: [string, string];
}) {
  const [expanded, setExpanded] = useState(!!minVal || !!maxVal);
  return (
    <div className="border-b border-gray-100 dark:border-gray-800">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className="text-gray-400 dark:text-gray-500">{icon}</span>
        <span className="flex-1 text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</span>
        {(minVal || maxVal) && <span className="w-2 h-2 rounded-full bg-blue-600" />}
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-4 pb-3 flex gap-2">
          <input
            type="number" value={minVal} onChange={e => onMinChange(e.target.value)}
            placeholder={placeholder?.[0] ?? 'Desde'}
            className="flex-1 px-2.5 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:border-blue-400 focus:outline-none"
          />
          <span className="self-center text-gray-400 text-xs">—</span>
          <input
            type="number" value={maxVal} onChange={e => onMaxChange(e.target.value)}
            placeholder={placeholder?.[1] ?? 'Hasta'}
            className="flex-1 px-2.5 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 focus:border-blue-400 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

// ─── Share Dropdown ──────────────────────────────────────────────────────────

function ShareDropdown({ vehicle, onClose }: { vehicle: Vehicle & { daysInStock: number }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const publicUrl = `${window.location.origin}/v/${vehicle.id}`;
  const text = `${vehicle.brand} ${vehicle.model} ${vehicle.year} — ${formatPrice(vehicle.salePrice)} — ${formatKm(vehicle.mileage)}`;

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Enlace copiado');
  };

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text + '\n' + publicUrl)}`, '_blank');
    onClose();
  };

  const shareEmail = () => {
    window.open(`mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(text + '\n\n' + publicUrl)}`, '_blank');
    onClose();
  };

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
      <button onClick={copyLink} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
        {copied ? 'Copiado' : 'Copiar enlace'}
      </button>
      <button onClick={shareWhatsApp} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
        <Phone className="w-4 h-4 text-green-600" />WhatsApp
      </button>
      <button onClick={shareEmail} className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
        <Mail className="w-4 h-4 text-blue-500" />Email
      </button>
      <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
        <ExternalLink className="w-4 h-4 text-gray-400" />Ver ficha pública
      </a>
    </div>
  );
}

// ─── Vehicle Quick-View Slide-Over ───────────────────────────────────────────

function VehicleQuickView({ vehicle, onClose, onReserve, onNavigate, reserving }: {
  vehicle: (Vehicle & { daysInStock: number }) | null;
  onClose: () => void;
  onReserve: (v: Vehicle & { daysInStock: number }) => void;
  onNavigate: (id: string) => void;
  reserving: boolean;
}) {
  const [imgIdx, setImgIdx] = useState(0);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => { setImgIdx(0); setShowShare(false); }, [vehicle?.id]);

  if (!vehicle) return null;

  const images = vehicle.images?.length ? vehicle.images : [];
  const margin = vehicle.salePrice && vehicle.purchasePrice ? vehicle.salePrice - vehicle.purchasePrice : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-white dark:bg-gray-900 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {vehicle.brand} {vehicle.model}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {vehicle.version && `${vehicle.version} · `}{vehicle.year}{vehicle.registrationPlate && ` · ${vehicle.registrationPlate}`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Gallery */}
          {images.length > 0 ? (
            <div className="relative bg-gray-100 dark:bg-gray-800">
              <img src={images[imgIdx]} alt="" className="w-full h-64 object-cover" />
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setImgIdx(i => (i - 1 + images.length) % images.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setImgIdx(i => (i + 1) % images.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setImgIdx(i)}
                        className={`w-2 h-2 rounded-full transition-all ${i === imgIdx ? 'bg-white scale-125' : 'bg-white/50'}`}
                      />
                    ))}
                  </div>
                </>
              )}
              <div className="absolute top-3 left-3">
                <StatusBadge status={vehicle.status} />
              </div>
              <div className="absolute top-3 right-3 bg-black/60 text-white px-2.5 py-1 rounded-lg text-xs font-semibold">
                {imgIdx + 1} / {images.length}
              </div>
            </div>
          ) : (
            <div className="h-48 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <ImageOff className="w-12 h-12 text-gray-300 dark:text-gray-600" />
            </div>
          )}

          {/* Price */}
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-end gap-3">
              <span className="text-3xl font-black text-gray-900 dark:text-gray-100">
                {formatPrice(vehicle.salePrice)}
              </span>
              {margin != null && margin > 0 && (
                <span className="text-sm font-semibold text-emerald-600 mb-1">
                  +{formatPrice(margin)} margen
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              P. compra: {formatPrice(vehicle.purchasePrice)}
              {vehicle.daysInStock > 0 && (
                <span className={`ml-2 font-semibold ${daysColor(vehicle.daysInStock)}`}>
                  · {vehicle.daysInStock} días en stock
                </span>
              )}
            </p>
          </div>

          {/* Specs grid */}
          <div className="px-5 py-4 grid grid-cols-2 gap-3 border-b border-gray-100 dark:border-gray-800">
            {[
              { icon: <Calendar className="w-4 h-4" />, label: 'Año', value: vehicle.year },
              { icon: <Gauge className="w-4 h-4" />, label: 'Kilómetros', value: formatKm(vehicle.mileage) },
              { icon: <Fuel className="w-4 h-4" />, label: 'Combustible', value: vehicle.fuelType ? FUEL_LABELS[vehicle.fuelType] ?? vehicle.fuelType : '—' },
              { icon: <ToggleLeft className="w-4 h-4" />, label: 'Cambio', value: vehicle.transmission ? TRANS_LABELS[vehicle.transmission] ?? vehicle.transmission : '—' },
              { icon: <Zap className="w-4 h-4" />, label: 'Potencia', value: vehicle.power ? `${vehicle.power} CV` : '—' },
              { icon: <DoorOpen className="w-4 h-4" />, label: 'Puertas', value: vehicle.doors ?? '—' },
              { icon: <Car className="w-4 h-4" />, label: 'Carrocería', value: vehicle.bodyType ? BODY_LABELS[vehicle.bodyType] ?? vehicle.bodyType : '—' },
              { icon: <Palette className="w-4 h-4" />, label: 'Color', value: vehicle.color || '—' },
              { icon: <MapPin className="w-4 h-4" />, label: 'Ubicación', value: vehicle.location || '—' },
              { icon: <Tag className="w-4 h-4" />, label: 'Origen', value: vehicle.origin ? ORIGIN_LABELS[vehicle.origin] ?? vehicle.origin : '—' },
            ].map((spec, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60">
                <span className="text-gray-400 dark:text-gray-500">{spec.icon}</span>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">{spec.label}</p>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{spec.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* VIN and Plate */}
          {(vehicle.vin || vehicle.registrationPlate) && (
            <div className="px-5 py-3 flex gap-4 border-b border-gray-100 dark:border-gray-800">
              {vehicle.registrationPlate && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Matrícula</p>
                  <p className="font-mono text-sm font-bold text-blue-600">{vehicle.registrationPlate}</p>
                </div>
              )}
              {vehicle.vin && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">VIN</p>
                  <p className="font-mono text-xs text-gray-600 dark:text-gray-400">{vehicle.vin}</p>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          {vehicle.notes && (
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Notas</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">{vehicle.notes}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 px-5 py-4 bg-white dark:bg-gray-900 space-y-2">
          <div className="flex gap-2">
            {vehicle.status === 'available' && (
              <button
                onClick={() => onReserve(vehicle)}
                disabled={reserving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50 shadow-lg shadow-amber-500/20"
              >
                {reserving ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />}
                Reservar
              </button>
            )}
            {vehicle.status === 'reserved' && (
              <div className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold bg-amber-100 text-amber-700 border-2 border-amber-300">
                <Bookmark className="w-4 h-4" />
                Reservado
              </div>
            )}
            <button
              onClick={() => onNavigate(vehicle.id)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
            >
              <Eye className="w-4 h-4" />
              Ficha completa
            </button>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <button
                onClick={() => setShowShare(v => !v)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Share2 className="w-4 h-4" />
                Compartir
              </button>
              {showShare && <ShareDropdown vehicle={vehicle} onClose={() => setShowShare(false)} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CatalogCard ─────────────────────────────────────────────────────────────

function CatalogCard({ vehicle, onQuickView, onReserve, onShare, reserving, favorites, onToggleFavorite }: {
  vehicle: Vehicle & { daysInStock: number };
  onQuickView: (v: Vehicle & { daysInStock: number }) => void;
  onReserve: (v: Vehicle & { daysInStock: number }) => void;
  onShare: (v: Vehicle & { daysInStock: number }) => void;
  reserving: string | null;
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
}) {
  const isFav = favorites.has(vehicle.id);
  const images = vehicle.images?.length ? vehicle.images : [];
  const isReserving = reserving === vehicle.id;

  return (
    <div className="group bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-xl hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200">
      {/* Image */}
      <div className="relative aspect-[16/10] bg-gray-100 dark:bg-gray-800 overflow-hidden">
        {images.length > 0 ? (
          <img
            src={images[0]}
            alt={`${vehicle.brand} ${vehicle.model}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Car className="w-16 h-16 text-gray-300 dark:text-gray-600" />
          </div>
        )}
        {/* Overlays */}
        <div className="absolute top-2.5 left-2.5">
          <StatusBadge status={vehicle.status} />
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(vehicle.id); }}
          className={`absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
            isFav ? 'bg-red-500 text-white' : 'bg-black/30 text-white hover:bg-black/50'
          }`}
        >
          <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
        </button>
        {images.length > 1 && (
          <span className="absolute bottom-2 right-2 bg-black/60 text-white px-2 py-0.5 rounded text-[10px] font-semibold">
            {images.length} fotos
          </span>
        )}
        <span className={`absolute bottom-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded ${daysColor(vehicle.daysInStock)} bg-white/90 dark:bg-gray-900/90`}>
          {vehicle.daysInStock}d stock
        </span>
      </div>

      {/* Body */}
      <div className="p-4 cursor-pointer" onClick={() => onQuickView(vehicle)}>
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight truncate">
              {vehicle.brand} {vehicle.model}
            </h3>
            {vehicle.version && (
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{vehicle.version}</p>
            )}
          </div>
          <span className="font-mono bg-blue-600 text-white px-2 py-0.5 rounded text-[10px] font-bold shrink-0 mt-0.5">
            {vehicle.registrationPlate}
          </span>
        </div>

        {/* Specs */}
        <div className="flex flex-wrap gap-1.5 mt-2.5 mb-3">
          {vehicle.year && <SpecChip icon={<Calendar className="w-3 h-3" />} label={String(vehicle.year)} />}
          {vehicle.mileage != null && <SpecChip icon={<Gauge className="w-3 h-3" />} label={formatKm(vehicle.mileage)} />}
          {vehicle.fuelType && <SpecChip icon={<Fuel className="w-3 h-3" />} label={FUEL_LABELS[vehicle.fuelType] ?? vehicle.fuelType} />}
          {vehicle.transmission && <SpecChip icon={<ToggleLeft className="w-3 h-3" />} label={TRANS_LABELS[vehicle.transmission] ?? vehicle.transmission} />}
          {vehicle.power && <SpecChip icon={<Zap className="w-3 h-3" />} label={`${vehicle.power} CV`} />}
        </div>

        {/* Price */}
        <div className="flex items-end justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
          <div>
            <span className="text-xl font-black text-gray-900 dark:text-gray-100">
              {formatPrice(vehicle.salePrice)}
            </span>
            {vehicle.purchasePrice && vehicle.salePrice && vehicle.salePrice > vehicle.purchasePrice && (
              <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                +{formatPrice(vehicle.salePrice - vehicle.purchasePrice)} margen
              </p>
            )}
          </div>
          {vehicle.location && (
            <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
              <MapPin className="w-3 h-3" />{vehicle.location}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 flex gap-2">
        {vehicle.status === 'available' ? (
          <button
            onClick={(e) => { e.stopPropagation(); onReserve(vehicle); }}
            disabled={isReserving}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50"
          >
            {isReserving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
            Reservar
          </button>
        ) : vehicle.status === 'reserved' ? (
          <span className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Bookmark className="w-3.5 h-3.5" />Reservado
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onShare(vehicle); }}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onQuickView(vehicle); }}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── CatalogListRow ──────────────────────────────────────────────────────────

function CatalogListRow({ vehicle, onQuickView, onReserve, reserving }: {
  vehicle: Vehicle & { daysInStock: number };
  onQuickView: (v: Vehicle & { daysInStock: number }) => void;
  onReserve: (v: Vehicle & { daysInStock: number }) => void;
  reserving: string | null;
}) {
  const images = vehicle.images?.length ? vehicle.images : [];
  const isReserving = reserving === vehicle.id;

  return (
    <div
      onClick={() => onQuickView(vehicle)}
      className="flex gap-4 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer transition-all"
    >
      {/* Thumbnail */}
      <div className="w-40 h-28 shrink-0 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 relative">
        {images.length > 0 ? (
          <img src={images[0]} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Car className="w-8 h-8 text-gray-300 dark:text-gray-600" />
          </div>
        )}
        <div className="absolute top-1.5 left-1.5">
          <StatusBadge status={vehicle.status} />
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
              {vehicle.brand} {vehicle.model}
            </h3>
            <span className="font-mono bg-blue-600 text-white px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0">
              {vehicle.registrationPlate}
            </span>
          </div>
          {vehicle.version && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{vehicle.version}</p>}
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {vehicle.year && <SpecChip icon={<Calendar className="w-3 h-3" />} label={String(vehicle.year)} />}
            {vehicle.mileage != null && <SpecChip icon={<Gauge className="w-3 h-3" />} label={formatKm(vehicle.mileage)} />}
            {vehicle.fuelType && <SpecChip icon={<Fuel className="w-3 h-3" />} label={FUEL_LABELS[vehicle.fuelType] ?? vehicle.fuelType} />}
            {vehicle.transmission && <SpecChip icon={<ToggleLeft className="w-3 h-3" />} label={TRANS_LABELS[vehicle.transmission] ?? vehicle.transmission} />}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[10px] font-bold ${daysColor(vehicle.daysInStock)}`}>{vehicle.daysInStock}d</span>
          {vehicle.location && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400"><MapPin className="w-2.5 h-2.5" />{vehicle.location}</span>
          )}
        </div>
      </div>

      {/* Price + action */}
      <div className="shrink-0 flex flex-col items-end justify-between">
        <span className="text-lg font-black text-gray-900 dark:text-gray-100">{formatPrice(vehicle.salePrice)}</span>
        {vehicle.status === 'available' && (
          <button
            onClick={(e) => { e.stopPropagation(); onReserve(vehicle); }}
            disabled={isReserving}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50"
          >
            {isReserving ? <Loader2 className="w-3 h-3 animate-spin" /> : <BookmarkPlus className="w-3 h-3" />}
            Reservar
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Reserve Confirmation Modal ──────────────────────────────────────────────

function ReserveModal({ vehicle, onConfirm, onCancel, loading }: {
  vehicle: (Vehicle & { daysInStock: number }) | null;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  if (!vehicle) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
            <BookmarkPlus className="w-7 h-7 text-amber-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Reservar vehículo</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            ¿Confirmas la reserva de <strong>{vehicle.brand} {vehicle.model}</strong> ({vehicle.registrationPlate})?
          </p>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 mb-4 text-left">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Precio venta</span>
              <span className="font-bold text-gray-900 dark:text-gray-100">{formatPrice(vehicle.salePrice)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl mb-4">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              El vehículo se marcará como <strong>reservado</strong> y no estará disponible para otros clientes.
            </p>
          </div>
        </div>
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={loading} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookmarkPlus className="w-4 h-4" />}
            Confirmar reserva
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface DealershipCatalogPageProps {
  salesPoint?: { _id: string; id: string; name: string } | null;
  onBack?: () => void;
}

export function DealershipCatalogPage({ salesPoint, onBack }: DealershipCatalogPageProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const { vehicles, updateVehicle, isLoadingVehicles } = useApp();

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [quickView, setQuickView] = useState<(Vehicle & { daysInStock: number }) | null>(null);
  const [reserveTarget, setReserveTarget] = useState<(Vehicle & { daysInStock: number }) | null>(null);
  const [reserving, setReserving] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('dealership_favorites');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [shareTarget, setShareTarget] = useState<(Vehicle & { daysInStock: number }) | null>(null);
  const shareRef = useRef<HTMLDivElement>(null);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('dealership_favorites', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const allWithDays = useMemo(() =>
    vehicles.map(v => ({ ...v, daysInStock: getVehicleDays(v) })),
    [vehicles],
  );

  const activeCount = (f: FiltersState) =>
    f.brands.length + f.fuelTypes.length + f.transmissions.length +
    f.bodyTypes.length + f.colors.length + f.statuses.length +
    (f.yearMin ? 1 : 0) + (f.yearMax ? 1 : 0) +
    (f.priceMin ? 1 : 0) + (f.priceMax ? 1 : 0) +
    (f.kmMin ? 1 : 0) + (f.kmMax ? 1 : 0);

  const filtersActive = activeCount(filters);

  // Compute unique values for filter options
  const filterOptions = useMemo(() => {
    const count = (key: keyof Vehicle) => {
      const map = new Map<string, number>();
      allWithDays.forEach(v => {
        const val = v[key];
        if (val != null && val !== '') {
          const s = String(val);
          map.set(s, (map.get(s) ?? 0) + 1);
        }
      });
      return map;
    };
    return {
      brands: count('brand'),
      fuelTypes: count('fuelType'),
      transmissions: count('transmission'),
      bodyTypes: count('bodyType'),
      colors: count('color'),
      statuses: count('status'),
    };
  }, [allWithDays]);

  const filteredAndSorted = useMemo(() => {
    let items = allWithDays;

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(v =>
        v.registrationPlate.toLowerCase().includes(q) ||
        v.brand.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        (v.version ?? '').toLowerCase().includes(q) ||
        (v.color ?? '').toLowerCase().includes(q),
      );
    }

    // Filters
    if (filters.brands.length) items = items.filter(v => filters.brands.includes(v.brand));
    if (filters.fuelTypes.length) items = items.filter(v => v.fuelType && filters.fuelTypes.includes(v.fuelType));
    if (filters.transmissions.length) items = items.filter(v => v.transmission && filters.transmissions.includes(v.transmission));
    if (filters.bodyTypes.length) items = items.filter(v => v.bodyType && filters.bodyTypes.includes(v.bodyType));
    if (filters.colors.length) items = items.filter(v => filters.colors.includes(v.color));
    if (filters.statuses.length) items = items.filter(v => filters.statuses.includes(v.status));
    if (filters.yearMin) items = items.filter(v => v.year >= Number(filters.yearMin));
    if (filters.yearMax) items = items.filter(v => v.year <= Number(filters.yearMax));
    if (filters.priceMin) items = items.filter(v => (v.salePrice ?? 0) >= Number(filters.priceMin));
    if (filters.priceMax) items = items.filter(v => (v.salePrice ?? 0) <= Number(filters.priceMax));
    if (filters.kmMin) items = items.filter(v => (v.mileage ?? 0) >= Number(filters.kmMin));
    if (filters.kmMax) items = items.filter(v => (v.mileage ?? 0) <= Number(filters.kmMax));

    // Sort
    items = [...items].sort((a, b) => {
      switch (sortBy) {
        case 'price-asc': return (a.salePrice ?? 0) - (b.salePrice ?? 0);
        case 'price-desc': return (b.salePrice ?? 0) - (a.salePrice ?? 0);
        case 'year-desc': return (b.year ?? 0) - (a.year ?? 0);
        case 'year-asc': return (a.year ?? 0) - (b.year ?? 0);
        case 'km-asc': return (a.mileage ?? 0) - (b.mileage ?? 0);
        case 'km-desc': return (b.mileage ?? 0) - (a.mileage ?? 0);
        case 'days-asc': return a.daysInStock - b.daysInStock;
        case 'days-desc': return b.daysInStock - a.daysInStock;
        default: return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return items;
  }, [allWithDays, search, filters, sortBy]);

  const { paginated, pagination } = usePagination(filteredAndSorted, 24);

  // KPIs
  const kpis = useMemo(() => {
    const available = allWithDays.filter(v => v.status === 'available');
    const reserved = allWithDays.filter(v => v.status === 'reserved');
    const avgPrice = available.length
      ? Math.round(available.reduce((s, v) => s + (v.salePrice ?? 0), 0) / available.length)
      : 0;
    return {
      total: allWithDays.length,
      available: available.length,
      reserved: reserved.length,
      sold: allWithDays.filter(v => v.status === 'sold').length,
      avgPrice,
    };
  }, [allWithDays]);

  const handleReserve = useCallback(async () => {
    if (!reserveTarget || !user?.user_id) return;
    setReserving(reserveTarget.id);
    try {
      await updateVehicle(reserveTarget.id, { status: 'reserved' });
      toast.success(`${reserveTarget.brand} ${reserveTarget.model} reservado correctamente`);
      setReserveTarget(null);
      if (quickView?.id === reserveTarget.id) {
        setQuickView(prev => prev ? { ...prev, status: 'reserved' } : null);
      }
    } catch {
      toast.error('Error al reservar el vehículo');
    } finally {
      setReserving(null);
    }
  }, [reserveTarget, user, updateVehicle, quickView]);

  const handleShare = useCallback((v: Vehicle & { daysInStock: number }) => {
    setShareTarget(v);
  }, []);

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearch('');
  };

  const makeFilterOptions = (map: Map<string, number>, labelMap?: Record<string, string>) =>
    [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([value, count]) => ({ value, label: labelMap?.[value] ?? value, count }));

  // Filter sidebar content
  const filterContent = (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-bold text-gray-800 dark:text-gray-200">Filtros</span>
          {filtersActive > 0 && (
            <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
              {filtersActive}
            </span>
          )}
        </div>
        {filtersActive > 0 && (
          <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 font-semibold">
            <RotateCcw className="w-3 h-3" />Limpiar
          </button>
        )}
        <button onClick={() => setShowFilters(false)} className="lg:hidden p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <FilterCheckboxGroup
          title="Estado" icon={<Tag className="w-4 h-4" />}
          options={makeFilterOptions(filterOptions.statuses, { available: 'En stock', reserved: 'Reservado', sold: 'Vendido', workshop: 'En taller', scrapped: 'Desguace' })}
          selected={filters.statuses} onChange={v => setFilters(f => ({ ...f, statuses: v }))}
        />
        <FilterCheckboxGroup
          title="Marca" icon={<Car className="w-4 h-4" />}
          options={makeFilterOptions(filterOptions.brands)}
          selected={filters.brands} onChange={v => setFilters(f => ({ ...f, brands: v }))}
        />
        <FilterRange
          title="Precio" icon={<Euro className="w-4 h-4" />}
          minVal={filters.priceMin} maxVal={filters.priceMax}
          onMinChange={v => setFilters(f => ({ ...f, priceMin: v }))}
          onMaxChange={v => setFilters(f => ({ ...f, priceMax: v }))}
          placeholder={['Mín €', 'Máx €']}
        />
        <FilterRange
          title="Año" icon={<Calendar className="w-4 h-4" />}
          minVal={filters.yearMin} maxVal={filters.yearMax}
          onMinChange={v => setFilters(f => ({ ...f, yearMin: v }))}
          onMaxChange={v => setFilters(f => ({ ...f, yearMax: v }))}
          placeholder={['Desde', 'Hasta']}
        />
        <FilterRange
          title="Kilómetros" icon={<Gauge className="w-4 h-4" />}
          minVal={filters.kmMin} maxVal={filters.kmMax}
          onMinChange={v => setFilters(f => ({ ...f, kmMin: v }))}
          onMaxChange={v => setFilters(f => ({ ...f, kmMax: v }))}
          placeholder={['Mín km', 'Máx km']}
        />
        <FilterCheckboxGroup
          title="Combustible" icon={<Fuel className="w-4 h-4" />}
          options={makeFilterOptions(filterOptions.fuelTypes, FUEL_LABELS)}
          selected={filters.fuelTypes} onChange={v => setFilters(f => ({ ...f, fuelTypes: v }))}
        />
        <FilterCheckboxGroup
          title="Cambio" icon={<ToggleLeft className="w-4 h-4" />}
          options={makeFilterOptions(filterOptions.transmissions, TRANS_LABELS)}
          selected={filters.transmissions} onChange={v => setFilters(f => ({ ...f, transmissions: v }))}
        />
        <FilterCheckboxGroup
          title="Carrocería" icon={<Car className="w-4 h-4" />}
          options={makeFilterOptions(filterOptions.bodyTypes, BODY_LABELS)}
          selected={filters.bodyTypes} onChange={v => setFilters(f => ({ ...f, bodyTypes: v }))}
        />
        <FilterCheckboxGroup
          title="Color" icon={<Palette className="w-4 h-4" />}
          options={makeFilterOptions(filterOptions.colors)}
          selected={filters.colors} onChange={v => setFilters(f => ({ ...f, colors: v }))}
        />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Top bar */}
      <header className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack ?? (() => navigate(-1))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                <Car className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-tight">
                  {salesPoint ? `Catálogo — ${salesPoint.name}` : 'Catálogo de Vehículos'}
                </h1>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
                  {currentBusiness?.name ?? 'Compraventa'}
                </p>
              </div>
            </div>
          </div>

          {/* KPIs mini */}
          <div className="hidden md:flex items-center gap-4">
            {[
              { label: 'Total', value: kpis.total, color: 'text-gray-900 dark:text-gray-100' },
              { label: 'En stock', value: kpis.available, color: 'text-emerald-600' },
              { label: 'Reservados', value: kpis.reserved, color: 'text-amber-600' },
              { label: 'Vendidos', value: kpis.sold, color: 'text-blue-600' },
              { label: 'Precio medio', value: formatPrice(kpis.avgPrice), color: 'text-gray-900 dark:text-gray-100' },
            ].map(kpi => (
              <div key={kpi.label} className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold">{kpi.label}</p>
                <p className={`text-sm font-bold ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Search bar */}
        <div className="px-4 pb-3 flex gap-2">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por marca, modelo, matrícula, color..."
              className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`lg:hidden flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
              filtersActive > 0 ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100'
            }`}
          >
            <Filter className="w-4 h-4" />
            {filtersActive > 0 && <span className="text-xs">{filtersActive}</span>}
          </button>
        </div>

        {/* Sort + view controls */}
        <div className="px-4 pb-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              <strong className="text-gray-700 dark:text-gray-300">{filteredAndSorted.length}</strong> vehículo{filteredAndSorted.length !== 1 ? 's' : ''}
            </span>
            {filtersActive > 0 && (
              <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 font-medium">
                <X className="w-3 h-3" />Limpiar filtros
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Sort */}
            <div className="relative">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortOption)}
                className="appearance-none pl-8 pr-7 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium cursor-pointer focus:outline-none focus:border-blue-500"
              >
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <ChevronDown className="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {/* View toggle */}
            <div className="hidden sm:flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              {([['grid', LayoutGrid], ['list', List]] as const).map(([mode, Icon]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`p-1.5 rounded-md transition-colors ${viewMode === mode ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600'}`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 min-h-0 flex">
        {/* Sidebar filters — desktop */}
        <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
          {filterContent}
        </aside>

        {/* Mobile filters drawer */}
        {showFilters && (
          <div className="lg:hidden fixed inset-0 z-[55] flex">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowFilters(false)} />
            <div className="relative w-80 max-w-[85vw] bg-white dark:bg-gray-900 shadow-2xl flex flex-col">
              {filterContent}
            </div>
          </div>
        )}

        {/* Vehicle grid/list */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4">
          {isLoadingVehicles ? (
            <div className="flex items-center justify-center py-32">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : filteredAndSorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Car className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
              <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-1">
                {search || filtersActive > 0 ? 'Sin resultados' : 'Sin vehículos'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-4">
                {search || filtersActive > 0
                  ? 'Prueba a cambiar los filtros o la búsqueda para encontrar vehículos.'
                  : 'Aún no hay vehículos en el inventario.'}
              </p>
              {(search || filtersActive > 0) && (
                <button onClick={clearFilters} className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-colors">
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {paginated.map(v => (
                  <CatalogCard
                    key={v.id}
                    vehicle={v}
                    onQuickView={setQuickView}
                    onReserve={setReserveTarget}
                    onShare={handleShare}
                    reserving={reserving}
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700">
                <Pagination pagination={pagination} />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                {paginated.map(v => (
                  <CatalogListRow
                    key={v.id}
                    vehicle={v}
                    onQuickView={setQuickView}
                    onReserve={setReserveTarget}
                    reserving={reserving}
                  />
                ))}
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700">
                <Pagination pagination={pagination} />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Quick view */}
      <VehicleQuickView
        vehicle={quickView}
        onClose={() => setQuickView(null)}
        onReserve={setReserveTarget}
        onNavigate={(id) => { setQuickView(null); navigate(`/saas/vehicles/${id}`); }}
        reserving={!!reserving}
      />

      {/* Reserve modal */}
      <ReserveModal
        vehicle={reserveTarget}
        onConfirm={handleReserve}
        onCancel={() => setReserveTarget(null)}
        loading={!!reserving}
      />

      {/* Share floating dropdown */}
      {shareTarget && (
        <div className="fixed inset-0 z-[55]" onClick={() => setShareTarget(null)}>
          <div className="absolute inset-0" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" onClick={e => e.stopPropagation()}>
            <ShareDropdown vehicle={shareTarget} onClose={() => setShareTarget(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
