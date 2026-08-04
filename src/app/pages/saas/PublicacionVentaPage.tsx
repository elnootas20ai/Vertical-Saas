import { useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { updateCommercialStatusRequest } from '../../lib/vehicleApi';
import { toast } from 'sonner';
import {
  Search, Filter, LayoutGrid, List, Columns3, Star, StarOff,
  Eye, ExternalLink, TrendingUp, TrendingDown, Minus, Camera,
  Tag, Megaphone, ShoppingCart, Clock, CheckCircle2, ChevronRight,
  AlertTriangle, ImageOff, ArrowRight, User, Globe, Copy, Check,
} from 'lucide-react';
import type { Vehicle, CommercialStatus, VehiclePublicationChannel } from '../../context/AppContext';

type ViewMode = 'table' | 'cards' | 'pipeline';

const COMMERCIAL_STATUS_CONFIG: Record<CommercialStatus, { label: string; dot: string; bg: string; text: string; icon: typeof Tag }> = {
  preparation: { label: 'En preparación', dot: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', icon: Clock },
  ready:       { label: 'Listo para vender', dot: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-400', icon: CheckCircle2 },
  published:   { label: 'Publicado', dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400', icon: Megaphone },
  reserved:    { label: 'Reservado', dot: 'bg-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30', text: 'text-violet-700 dark:text-violet-400', icon: ShoppingCart },
  sold:        { label: 'Vendido', dot: 'bg-slate-400', bg: 'bg-slate-100 dark:bg-slate-800/30', text: 'text-slate-600 dark:text-slate-400', icon: CheckCircle2 },
};

const PIPELINE_ORDER: CommercialStatus[] = ['preparation', 'ready', 'published', 'reserved', 'sold'];

const PUBLICATION_CHANNELS = [
  { id: 'coches_net', name: 'Coches.net', icon: '🚗', color: '#0066CC' },
  { id: 'milanuncios', name: 'Milanuncios', icon: '📢', color: '#FF6600' },
  { id: 'wallapop', name: 'Wallapop', icon: '🔄', color: '#13C1AC' },
  { id: 'autocasion', name: 'Autocasión', icon: '🏷️', color: '#003366' },
  { id: 'facebook', name: 'Facebook', icon: '📘', color: '#1877F2' },
  { id: 'instagram', name: 'Instagram', icon: '📸', color: '#E4405F' },
  { id: 'web_propia', name: 'Web propia', icon: '🌐', color: '#10B981' },
  { id: 'otro', name: 'Otro', icon: '📌', color: '#6B7280' },
] as const;

const PRICE_REASON_OPTIONS = [
  { value: 'market_adjustment', label: 'Ajuste de mercado' },
  { value: 'client_negotiation', label: 'Negociación con cliente' },
  { value: 'time_in_stock', label: 'Tiempo en stock' },
  { value: 'competitor_price', label: 'Precio de la competencia' },
  { value: 'manager_decision', label: 'Decisión de gerencia' },
  { value: 'error_correction', label: 'Corrección de error' },
  { value: 'other', label: 'Otro motivo' },
] as const;

function getMarginColor(pct: number | null | undefined) {
  if (pct == null) return 'text-slate-500';
  if (pct < 0) return 'text-red-600 dark:text-red-400';
  if (pct < 15) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

function getMarginIcon(pct: number | null | undefined) {
  if (pct == null) return Minus;
  if (pct < 0) return TrendingDown;
  if (pct < 15) return Minus;
  return TrendingUp;
}

function StatusBadge({ status }: { status: CommercialStatus }) {
  const cfg = COMMERCIAL_STATUS_CONFIG[status] || COMMERCIAL_STATUS_CONFIG.preparation;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function ChannelIcons({ channels }: { channels: VehiclePublicationChannel[] }) {
  const active = channels.filter(ch => ch.active);
  if (!active.length) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className="flex gap-0.5">
      {active.map(ch => {
        const def = PUBLICATION_CHANNELS.find(c => c.id === ch.channelId);
        return (
          <span key={ch.channelId} title={def?.name || ch.channelName} className="text-sm">
            {def?.icon || '📌'}
          </span>
        );
      })}
    </span>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: string }) {
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-1 ${accent ? 'border-l-4 ' + accent : ''}`}>
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-bold text-slate-900 dark:text-white">{value}</span>
      {sub && <span className="text-xs text-slate-500 dark:text-slate-400">{sub}</span>}
    </div>
  );
}

// ─── Pipeline Column ─────────────────────────────────────────────────────────

function PipelineColumn({
  status,
  vehicles,
  onSelect,
}: {
  status: CommercialStatus;
  vehicles: Vehicle[];
  onSelect: (v: Vehicle) => void;
}) {
  const cfg = COMMERCIAL_STATUS_CONFIG[status];
  return (
    <div className="flex-1 min-w-[220px] max-w-[300px]">
      <div className={`flex items-center gap-2 mb-3 px-2`}>
        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{cfg.label}</span>
        <span className="text-xs text-slate-400 ml-auto">{vehicles.length}</span>
      </div>
      <div className="space-y-2 max-h-[calc(100vh-340px)] overflow-y-auto pr-1">
        {vehicles.map(v => (
          <button
            key={v.id}
            onClick={() => onSelect(v)}
            className="w-full text-left bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3 hover:border-blue-300 dark:hover:border-blue-600 transition-all hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{v.brand} {v.model}</p>
                <p className="text-xs text-slate-500">{v.year} · {v.registrationPlate}</p>
              </div>
              {v.featured && <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" />}
            </div>
            {v.salePrice ? (
              <p className="text-sm font-bold text-slate-900 dark:text-white mt-2">
                {v.salePrice.toLocaleString('es-ES')} €
              </p>
            ) : null}
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
              {v.marginPercentage != null && (
                <span className={`font-medium ${getMarginColor(v.marginPercentage)}`}>
                  {v.marginPercentage > 0 ? '+' : ''}{v.marginPercentage}%
                </span>
              )}
              {v.images?.length ? (
                <span className="flex items-center gap-0.5"><Camera className="w-3 h-3" />{v.images.length}</span>
              ) : (
                <span className="flex items-center gap-0.5 text-amber-500"><ImageOff className="w-3 h-3" />Sin fotos</span>
              )}
              <ChannelIcons channels={v.publicationChannels || []} />
            </div>
            {v.assignedCommercialName && (
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <User className="w-3 h-3" />{v.assignedCommercialName}
              </p>
            )}
          </button>
        ))}
        {vehicles.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-8">Sin vehículos</p>
        )}
      </div>
    </div>
  );
}

// ─── Vehicle Commercial Detail Panel ─────────────────────────────────────────

function VehicleCommercialPanel({
  vehicle,
  onClose,
  onUpdate,
}: {
  vehicle: Vehicle;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Vehicle>) => Promise<void>;
}) {
  const { user } = useAuth();
  const cs = vehicle.commercialStatus || 'preparation';
  const csIdx = PIPELINE_ORDER.indexOf(cs);

  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(vehicle.commercialDescription || '');
  const [copied, setCopied] = useState(false);

  const handleSaveDescription = async () => {
    await onUpdate(vehicle.id, { commercialDescription: descDraft });
    setEditingDesc(false);
    toast.success('Descripción guardada');
  };

  const handleToggleFeatured = async () => {
    await onUpdate(vehicle.id, { featured: !vehicle.featured });
    toast.success(vehicle.featured ? 'Vehículo desmarcado como destacado' : 'Vehículo marcado como destacado');
  };

  const handleChangeStatus = async (newStatus: CommercialStatus) => {
    if (!user?.user_id) return;
    try {
      await updateCommercialStatusRequest(user.user_id, vehicle.id, newStatus, '');
      await onUpdate(vehicle.id, { commercialStatus: newStatus });
      toast.success(`Estado cambiado a "${COMMERCIAL_STATUS_CONFIG[newStatus].label}"`);
    } catch (err: any) {
      toast.error(err?.message || 'Error al cambiar el estado');
    }
  };

  const handleCopyMicrosite = () => {
    const url = `${window.location.origin}/v/${vehicle.id}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalInvestment = (vehicle.purchasePrice || 0) + (vehicle.totalPreparationCost || 0);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/30 dark:bg-black/50" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-2xl bg-white dark:bg-slate-900 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{vehicle.brand} {vehicle.model} {vehicle.version || ''}</h2>
              <p className="text-sm text-slate-500">{vehicle.year} · {vehicle.registrationPlate} · {vehicle.daysInStock} días en stock</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleToggleFeatured} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title={vehicle.featured ? 'Quitar destacado' : 'Marcar como destacado'}>
                {vehicle.featured ? <Star className="w-5 h-5 text-amber-500" fill="currentColor" /> : <StarOff className="w-5 h-5 text-slate-400" />}
              </button>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">✕</button>
            </div>
          </div>

          {/* Pipeline */}
          <div className="flex items-center gap-1 mt-4">
            {PIPELINE_ORDER.map((s, i) => {
              const cfg = COMMERCIAL_STATUS_CONFIG[s];
              const isCurrent = s === cs;
              const isPast = i < csIdx;
              return (
                <div key={s} className="flex items-center gap-1 flex-1">
                  <button
                    onClick={() => { if (!isCurrent) handleChangeStatus(s); }}
                    disabled={isCurrent}
                    className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium text-center transition-all ${
                      isCurrent ? `${cfg.bg} ${cfg.text} ring-2 ring-offset-1 ring-current` :
                      isPast ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 line-through' :
                      'bg-slate-50 dark:bg-slate-800/50 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {cfg.label}
                  </button>
                  {i < PIPELINE_ORDER.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300 flex-shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Commercial Description */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Descripción comercial</h3>
              {!editingDesc && <button onClick={() => setEditingDesc(true)} className="text-xs text-blue-600 hover:text-blue-700">Editar</button>}
            </div>
            {editingDesc ? (
              <div className="space-y-2">
                <textarea
                  value={descDraft}
                  onChange={e => setDescDraft(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Describe el vehículo para los anuncios..."
                />
                <div className="flex gap-2">
                  <button onClick={handleSaveDescription} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">Guardar</button>
                  <button onClick={() => { setEditingDesc(false); setDescDraft(vehicle.commercialDescription || ''); }} className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800">Cancelar</button>
                </div>
              </div>
            ) : (
              <p className={`text-sm ${vehicle.commercialDescription ? 'text-slate-600 dark:text-slate-400' : 'text-slate-400 italic'}`}>
                {vehicle.commercialDescription || 'Sin descripción comercial. Añade una para mejorar los anuncios.'}
              </p>
            )}
          </section>

          {/* Margin Analysis */}
          <section className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Análisis de margen</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <span className="text-slate-500">Precio compra</span>
              <span className="text-right font-medium text-slate-900 dark:text-white">{(vehicle.purchasePrice || 0).toLocaleString('es-ES')} €</span>

              <span className="text-slate-500">Costes preparación</span>
              <span className="text-right font-medium text-slate-900 dark:text-white">{(vehicle.totalPreparationCost || 0).toLocaleString('es-ES')} €</span>

              <span className="text-slate-500 font-medium">Inversión total</span>
              <span className="text-right font-bold text-slate-900 dark:text-white">{totalInvestment.toLocaleString('es-ES')} €</span>

              <div className="col-span-2 border-t border-slate-200 dark:border-slate-700 my-1" />

              <span className="text-slate-500">Precio venta</span>
              <span className="text-right font-bold text-slate-900 dark:text-white">{(vehicle.salePrice || 0).toLocaleString('es-ES')} €</span>

              <span className="text-slate-500">Margen estimado</span>
              <span className={`text-right font-bold ${getMarginColor(vehicle.marginPercentage)}`}>
                {vehicle.estimatedMargin != null ? `${vehicle.estimatedMargin.toLocaleString('es-ES')} € (${vehicle.marginPercentage}%)` : '—'}
              </span>

              {vehicle.minimumSalePrice != null && vehicle.minimumSalePrice > 0 && (
                <>
                  <span className="text-slate-500">Precio mínimo</span>
                  <span className={`text-right font-medium ${(vehicle.salePrice || 0) < vehicle.minimumSalePrice ? 'text-red-600' : 'text-emerald-600'}`}>
                    {vehicle.minimumSalePrice.toLocaleString('es-ES')} €
                    {(vehicle.salePrice || 0) < vehicle.minimumSalePrice ? ' ⚠️' : ' ✓'}
                  </span>
                </>
              )}
            </div>
          </section>

          {/* Publication Channels */}
          <section>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Canales de publicación</h3>
            <div className="space-y-2">
              {PUBLICATION_CHANNELS.map((def) => {
                const existing = (vehicle.publicationChannels || []).find((ch) => ch.channelId === def.id);
                const active = Boolean(existing?.active);
                return (
                  <div
                    key={def.id}
                    className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-lg">{def.icon}</span>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{def.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {existing?.url ? (
                        <a
                          href={existing.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-600"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date().toISOString();
                          const channels = [...(vehicle.publicationChannels || [])];
                          const idx = channels.findIndex((ch) => ch.channelId === def.id);
                          if (idx >= 0) {
                            channels[idx] = {
                              ...channels[idx],
                              active: !channels[idx].active,
                              publishedAt: !channels[idx].active ? now : channels[idx].publishedAt,
                              unpublishedAt: channels[idx].active ? now : null,
                            };
                          } else {
                            channels.push({
                              channelId: def.id,
                              channelName: def.name,
                              url: '',
                              publishedAt: now,
                              unpublishedAt: null,
                              active: true,
                              notes: '',
                            });
                          }
                          void onUpdate(vehicle.id, {
                            publicationChannels: channels,
                            published: channels.some((ch) => ch.active),
                          });
                          toast.success(
                            active ? `${def.name} desactivado` : `${def.name} activado`,
                          );
                        }}
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          active
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {active ? 'Activo' : 'Activar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Price History */}
          {vehicle.priceHistory && vehicle.priceHistory.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Historial de precios</h3>
              <div className="space-y-2">
                {[...vehicle.priceHistory].reverse().slice(0, 5).map(entry => {
                  const MarginIcon = entry.priceVariation != null && entry.priceVariation > 0 ? TrendingUp : TrendingDown;
                  return (
                    <div key={entry.id} className="flex items-center justify-between text-sm border-l-2 border-slate-200 dark:border-slate-700 pl-3 py-1">
                      <div>
                        <span className="text-slate-900 dark:text-white font-medium">{(entry.newPrice || 0).toLocaleString('es-ES')} €</span>
                        {entry.priceVariation != null && (
                          <span className={`ml-2 text-xs ${entry.priceVariation > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {entry.priceVariation > 0 ? '+' : ''}{entry.priceVariation}%
                          </span>
                        )}
                        <p className="text-xs text-slate-400">{entry.reason} · {entry.userName}</p>
                      </div>
                      <span className="text-xs text-slate-400">{new Date(entry.date).toLocaleDateString('es-ES')}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Quick info */}
          <section className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
              <span className="text-xs text-slate-500 block">Comercial asignado</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white">{vehicle.assignedCommercialName || 'Sin asignar'}</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
              <span className="text-xs text-slate-500 block">Fotos</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white">{vehicle.images?.length || 0} fotos</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 col-span-2">
              <span className="text-xs text-slate-500 block mb-1">Microsite público</span>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-slate-200 dark:bg-slate-700 rounded px-2 py-0.5 flex-1 truncate">{window.location.origin}/v/{vehicle.id}</code>
                <button onClick={handleCopyMicrosite} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700">
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-400" />}
                </button>
              </div>
            </div>
          </section>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <a
              href={`/saas/vehicles/${vehicle.id}`}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <Eye className="w-4 h-4" /> Ver ficha completa
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export function PublicacionVentaPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { vehicles, updateVehicle } = useApp();
  const { user } = useAuth();

  const [viewMode, setViewMode] = useState<ViewMode>('pipeline');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CommercialStatus | 'all'>('all');
  const [publishedFilter, setPublishedFilter] = useState<'all' | 'published' | 'unpublished'>('all');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(searchParams.get('vehicleId'));

  const activeVehicles = useMemo(() =>
    vehicles.filter(v => v.active !== false && v.status !== 'scrapped'),
  [vehicles]);

  const filtered = useMemo(() => {
    let result = activeVehicles;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(v =>
        `${v.brand} ${v.model} ${v.registrationPlate} ${v.version || ''} ${v.assignedCommercialName || ''}`.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(v => (v.commercialStatus || 'preparation') === statusFilter);
    }

    if (publishedFilter === 'published') result = result.filter(v => v.published);
    if (publishedFilter === 'unpublished') result = result.filter(v => !v.published);

    return result;
  }, [activeVehicles, search, statusFilter, publishedFilter]);

  // KPIs
  const kpis = useMemo(() => {
    const byStatus = PIPELINE_ORDER.reduce((acc, s) => {
      acc[s] = activeVehicles.filter(v => (v.commercialStatus || 'preparation') === s).length;
      return acc;
    }, {} as Record<CommercialStatus, number>);

    const now = new Date();
    const thisMonth = activeVehicles.filter(v =>
      (v.commercialStatus || 'preparation') === 'sold' && v.soldAt && new Date(v.soldAt).getMonth() === now.getMonth() && new Date(v.soldAt).getFullYear() === now.getFullYear()
    );

    const withAlerts = activeVehicles.filter(v => {
      const cs = v.commercialStatus || 'preparation';
      if (cs === 'ready' && !v.published) return true;
      if ((cs === 'ready' || cs === 'published') && (!v.images || v.images.length === 0)) return true;
      if (v.minimumSalePrice && v.salePrice && v.salePrice < v.minimumSalePrice) return true;
      return false;
    }).length;

    return { byStatus, soldThisMonth: thisMonth.length, totalStock: activeVehicles.filter(v => (v.commercialStatus || 'preparation') !== 'sold').length, alerts: withAlerts };
  }, [activeVehicles]);

  const selectedVehicle = useMemo(
    () => vehicles.find(v => v.id === selectedVehicleId) || null,
    [vehicles, selectedVehicleId]
  );

  const handleSelect = useCallback((v: Vehicle) => {
    setSelectedVehicleId(v.id);
    setSearchParams({ vehicleId: v.id });
  }, [setSearchParams]);

  const handleClosePanel = useCallback(() => {
    setSelectedVehicleId(null);
    setSearchParams({});
  }, [setSearchParams]);

  const handleUpdate = useCallback(async (id: string, updates: Partial<Vehicle>) => {
    await updateVehicle(id, updates);
  }, [updateVehicle]);

  return (
    <Layout title="Publicación y venta">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Publicación y venta</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Gestión comercial del inventario de vehículos</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Total stock" value={kpis.totalStock} accent="border-l-slate-400" />
          <KpiCard label="En preparación" value={kpis.byStatus.preparation} accent="border-l-amber-500" />
          <KpiCard label="Listos" value={kpis.byStatus.ready} accent="border-l-blue-500" sub={kpis.byStatus.ready > 0 ? `${activeVehicles.filter(v => v.commercialStatus === 'ready' && !v.published).length} sin publicar` : undefined} />
          <KpiCard label="Publicados" value={kpis.byStatus.published} accent="border-l-emerald-500" />
          <KpiCard label="Reservados" value={kpis.byStatus.reserved} accent="border-l-violet-500" />
          <KpiCard label="Vendidos (mes)" value={kpis.soldThisMonth} accent="border-l-slate-400" />
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar vehículo..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as CommercialStatus | 'all')}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
          >
            <option value="all">Todos los estados</option>
            {PIPELINE_ORDER.map(s => (
              <option key={s} value={s}>{COMMERCIAL_STATUS_CONFIG[s].label}</option>
            ))}
          </select>

          <select
            value={publishedFilter}
            onChange={e => setPublishedFilter(e.target.value as 'all' | 'published' | 'unpublished')}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
          >
            <option value="all">Publicación</option>
            <option value="published">Publicados</option>
            <option value="unpublished">Sin publicar</option>
          </select>

          <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden ml-auto">
            {([['pipeline', Columns3], ['table', List], ['cards', LayoutGrid]] as const).map(([mode, Icon]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`p-2 ${viewMode === mode ? 'bg-blue-50 dark:bg-blue-950 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {/* Pipeline View */}
        {viewMode === 'pipeline' && (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {PIPELINE_ORDER.filter(s => s !== 'sold').map(status => (
              <PipelineColumn
                key={status}
                status={status}
                vehicles={filtered.filter(v => (v.commercialStatus || 'preparation') === status)}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}

        {/* Table View */}
        {viewMode === 'table' && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Vehículo</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500">Precio</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500">Margen</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Estado</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Canales</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-500">Comercial</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-500">Días</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map(v => (
                    <tr
                      key={v.id}
                      onClick={() => handleSelect(v)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {v.featured && <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" />}
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">{v.brand} {v.model} {v.version || ''}</p>
                            <p className="text-xs text-slate-400">{v.year} · {v.registrationPlate}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white whitespace-nowrap">
                        {v.salePrice ? `${v.salePrice.toLocaleString('es-ES')} €` : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${getMarginColor(v.marginPercentage)}`}>
                        {v.marginPercentage != null ? `${v.marginPercentage}%` : '—'}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={(v.commercialStatus || 'preparation') as CommercialStatus} /></td>
                      <td className="px-4 py-3"><ChannelIcons channels={v.publicationChannels || []} /></td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{v.assignedCommercialName || '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-500">{v.daysInStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="text-center py-12 text-sm text-slate-400">No hay vehículos que coincidan con los filtros.</div>
              )}
            </div>
          </div>
        )}

        {/* Cards View */}
        {viewMode === 'cards' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(v => (
              <button
                key={v.id}
                onClick={() => handleSelect(v)}
                className="text-left bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all group"
              >
                {/* Image */}
                <div className="h-40 bg-slate-100 dark:bg-slate-700 relative overflow-hidden">
                  {v.images && v.images.length > 0 ? (
                    <img src={v.images[0]} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-300"><ImageOff className="w-10 h-10" /></div>
                  )}
                  {v.featured && (
                    <span className="absolute top-2 right-2 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <Star className="w-3 h-3" fill="currentColor" />Destacado
                    </span>
                  )}
                  <div className="absolute bottom-2 left-2">
                    <StatusBadge status={(v.commercialStatus || 'preparation') as CommercialStatus} />
                  </div>
                </div>
                {/* Content */}
                <div className="p-4">
                  <h3 className="font-semibold text-slate-900 dark:text-white">{v.brand} {v.model}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{v.year} · {v.registrationPlate} · {v.daysInStock}d stock</p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-lg font-bold text-slate-900 dark:text-white">
                      {v.salePrice ? `${v.salePrice.toLocaleString('es-ES')} €` : '—'}
                    </span>
                    <span className={`text-sm font-medium ${getMarginColor(v.marginPercentage)}`}>
                      {v.marginPercentage != null ? `${v.marginPercentage}%` : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" />{v.assignedCommercialName || 'Sin asignar'}</span>
                    <ChannelIcons channels={v.publicationChannels || []} />
                  </div>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-12 text-sm text-slate-400">No hay vehículos que coincidan con los filtros.</div>
            )}
          </div>
        )}

        {/* Detail Panel */}
        {selectedVehicle && (
          <VehicleCommercialPanel
            vehicle={selectedVehicle}
            onClose={handleClosePanel}
            onUpdate={handleUpdate}
          />
        )}
      </div>
    </Layout>
  );
}
