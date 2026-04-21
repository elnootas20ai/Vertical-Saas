import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import { useModalClose } from '../../../hooks/useModalClose';
import {
  Building2,
  MapPin,
  Users,
  Calendar,
  ArrowLeft,
  Search,
  Eye,
  X,
  CheckCircle2,
  Home,
  KeyRound,
  Ban,
  Clock,
} from 'lucide-react';

type VisitDealType = 'compra' | 'alquiler';
type VisitStatus = 'programada' | 'realizada' | 'cancelada';
type PropertyKind = 'piso' | 'casa' | 'local' | 'oficina';
type PropertyStatus = 'disponible' | 'reservado' | 'vendido';

interface PropertyVisit {
  id: string;
  date: string;
  time: string;
  propertyAddress: string;
  clientName: string;
  dealType: VisitDealType;
  status: VisitStatus;
  feedbackNotes: string;
}

interface ListedProperty {
  id: string;
  address: string;
  kind: PropertyKind;
  price: number;
  status: PropertyStatus;
}

const DEAL_LABEL: Record<VisitDealType, string> = {
  compra: 'Compra',
  alquiler: 'Alquiler',
};

const VISIT_STATUS_CFG: Record<VisitStatus, { label: string; color: string; bg: string }> = {
  programada: { label: 'Programada', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800' },
  realizada: { label: 'Realizada', color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800' },
  cancelada: { label: 'Cancelada', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700' },
};

const PROPERTY_KIND_LABEL: Record<PropertyKind, string> = {
  piso: 'Piso',
  casa: 'Casa',
  local: 'Local',
  oficina: 'Oficina',
};

const PROPERTY_STATUS_CFG: Record<PropertyStatus, { label: string; color: string; bg: string }> = {
  disponible: { label: 'Disponible', color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800' },
  reservado: { label: 'Reservado', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800' },
  vendido: { label: 'Vendido', color: 'text-violet-700 dark:text-violet-300', bg: 'bg-violet-50 dark:bg-violet-900/30 border-violet-200 dark:border-violet-800' },
};

function formatCurrency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function seedVisits(): PropertyVisit[] {
  const d = todayStr();
  return [
    {
      id: uuidv4(),
      date: d,
      time: '10:00',
      propertyAddress: 'Calle Mayor 12, 3º B, Madrid',
      clientName: 'Ana García',
      dealType: 'compra',
      status: 'programada',
      feedbackNotes: '',
    },
    {
      id: uuidv4(),
      date: d,
      time: '12:30',
      propertyAddress: 'Av. Diagonal 440, Barcelona',
      clientName: 'Luis Fernández',
      dealType: 'alquiler',
      status: 'programada',
      feedbackNotes: '',
    },
    {
      id: uuidv4(),
      date: d,
      time: '09:00',
      propertyAddress: 'Plaza España 2, Valencia',
      clientName: 'María López',
      dealType: 'compra',
      status: 'realizada',
      feedbackNotes: 'Interesada, pide segunda visita con pareja.',
    },
  ];
}

function seedProperties(): ListedProperty[] {
  return [
    { id: uuidv4(), address: 'Calle Mayor 12, 3º B, Madrid', kind: 'piso', price: 285000, status: 'disponible' },
    { id: uuidv4(), address: 'C/ Rosalía 8, Sevilla', kind: 'casa', price: 420000, status: 'reservado' },
    { id: uuidv4(), address: 'Gran Vía 45, local 2, Bilbao', kind: 'local', price: 195000, status: 'disponible' },
    { id: uuidv4(), address: 'Paseo de la Castellana 200, Madrid', kind: 'oficina', price: 890000, status: 'vendido' },
  ];
}

export function WorkerTpvRealEstate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const agentLabel = user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Agente';

  const [activeTab, setActiveTab] = useState<'visitas' | 'propiedades'>('visitas');
  const [visits, setVisits] = useState<PropertyVisit[]>(seedVisits);
  const [properties, setProperties] = useState<ListedProperty[]>(seedProperties);
  const [search, setSearch] = useState('');
  const [visitStatusFilter, setVisitStatusFilter] = useState<VisitStatus | 'todas'>('todas');
  const [propertyStatusFilter, setPropertyStatusFilter] = useState<PropertyStatus | 'todas'>('todas');
  const [propertyKindFilter, setPropertyKindFilter] = useState<PropertyKind | 'todas'>('todas');

  const [completeModalVisit, setCompleteModalVisit] = useState<PropertyVisit | null>(null);
  const [completeNotes, setCompleteNotes] = useState('');

  useModalClose(!!completeModalVisit, () => {
    setCompleteModalVisit(null);
    setCompleteNotes('');
  });

  const today = todayStr();

  const stats = useMemo(() => {
    const visitasHoy = visits.filter((v) => v.date === today).length;
    const propiedadesActivas = properties.filter((p) => p.status === 'disponible' || p.status === 'reservado').length;
    const operacionesCerradas =
      properties.filter((p) => p.status === 'vendido').length + visits.filter((v) => v.status === 'realizada').length;
    return { visitasHoy, propiedadesActivas, operacionesCerradas };
  }, [visits, properties, today]);

  const filteredVisits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visits
      .filter((v) => v.date === today)
      .filter((v) => (visitStatusFilter === 'todas' ? true : v.status === visitStatusFilter))
      .filter((v) => {
        if (!q) return true;
        return (
          v.propertyAddress.toLowerCase().includes(q) ||
          v.clientName.toLowerCase().includes(q) ||
          v.id.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [visits, search, visitStatusFilter, today]);

  const filteredProperties = useMemo(() => {
    const q = search.trim().toLowerCase();
    return properties
      .filter((p) => (propertyStatusFilter === 'todas' ? true : p.status === propertyStatusFilter))
      .filter((p) => (propertyKindFilter === 'todas' ? true : p.kind === propertyKindFilter))
      .filter((p) => {
        if (!q) return true;
        return p.address.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
      });
  }, [properties, search, propertyStatusFilter, propertyKindFilter]);

  const openCompleteModal = useCallback((v: PropertyVisit) => {
    setCompleteModalVisit(v);
    setCompleteNotes(v.feedbackNotes || '');
  }, []);

  const confirmCompleteVisit = useCallback(() => {
    if (!completeModalVisit) return;
    setVisits((prev) =>
      prev.map((x) =>
        x.id === completeModalVisit.id
          ? { ...x, status: 'realizada' as const, feedbackNotes: completeNotes.trim() }
          : x,
      ),
    );
    toast.success('Visita marcada como realizada');
    setCompleteModalVisit(null);
    setCompleteNotes('');
  }, [completeModalVisit, completeNotes]);

  const cancelVisit = useCallback((id: string) => {
    setVisits((prev) => prev.map((v) => (v.id === id ? { ...v, status: 'cancelada' as const } : v)));
    toast.message('Visita cancelada');
  }, []);

  const updatePropertyStatus = useCallback((id: string, status: PropertyStatus) => {
    setProperties((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    toast.success(`Estado: ${PROPERTY_STATUS_CFG[status].label}`);
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/saas/worker')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 shrink-0" />
            <div className="w-10 h-10 bg-teal-100 dark:bg-teal-900/30 rounded-xl flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">Mi Puesto - Inmobiliaria</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{agentLabel}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-2xl border-2 border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 p-2.5 text-center">
            <p className="text-lg font-bold text-teal-800 dark:text-teal-300">{stats.visitasHoy}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400">Visitas hoy</p>
          </div>
          <div className="rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-2.5 text-center">
            <p className="text-lg font-bold text-emerald-800 dark:text-emerald-300">{stats.propiedadesActivas}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Prop. activas</p>
          </div>
          <div className="rounded-2xl border-2 border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 p-2.5 text-center">
            <p className="text-lg font-bold text-violet-800 dark:text-violet-300">{stats.operacionesCerradas}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400">Op. cerradas</p>
          </div>
        </div>

        <div className="flex gap-1.5 mb-2">
          <button
            type="button"
            onClick={() => setActiveTab('visitas')}
            className={`flex-1 px-3 py-2 rounded-2xl text-xs font-semibold border-2 transition-all ${
              activeTab === 'visitas'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Visitas
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('propiedades')}
            className={`flex-1 px-3 py-2 rounded-2xl text-xs font-semibold border-2 transition-all ${
              activeTab === 'propiedades'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <span className="inline-flex items-center justify-center gap-1.5">
              <Home className="w-3.5 h-3.5" />
              Propiedades
            </span>
          </button>
        </div>

        {activeTab === 'visitas' && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {(['todas', 'programada', 'realizada', 'cancelada'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setVisitStatusFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                  visitStatusFilter === f
                    ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}
              >
                {f === 'todas' ? 'Todas' : VISIT_STATUS_CFG[f].label}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'propiedades' && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] font-bold uppercase text-gray-400 self-center mr-1">Estado</span>
              {(['todas', 'disponible', 'reservado', 'vendido'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setPropertyStatusFilter(f)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold border-2 transition-all ${
                    propertyStatusFilter === f
                      ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {f === 'todas' ? 'Todos' : PROPERTY_STATUS_CFG[f].label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 w-full sm:w-auto">
              <span className="text-[10px] font-bold uppercase text-gray-400 self-center mr-1">Tipo</span>
              {(['todas', 'piso', 'casa', 'local', 'oficina'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setPropertyKindFilter(f)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold border-2 transition-all ${
                    propertyKindFilter === f
                      ? 'border-teal-600 dark:border-teal-400 bg-teal-50 dark:bg-teal-900/30 text-teal-900 dark:text-teal-200'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {f === 'todas' ? 'Todos' : PROPERTY_KIND_LABEL[f]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={activeTab === 'visitas' ? 'Buscar dirección, cliente o UUID…' : 'Buscar dirección o UUID…'}
            className="w-full pl-9 pr-9 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {activeTab === 'visitas' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredVisits.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-400 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <Eye className="w-10 h-10 mb-2 opacity-60" />
                <p className="text-sm font-medium">No hay visitas que coincidan</p>
              </div>
            ) : (
              filteredVisits.map((v) => {
                const st = VISIT_STATUS_CFG[v.status];
                return (
                  <div
                    key={v.id}
                    className={`rounded-2xl border-2 p-4 transition-all hover:shadow-lg ${st.bg}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] text-gray-500 dark:text-gray-400 truncate" title={v.id}>
                          {v.id}
                        </p>
                        <p className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <Clock className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />
                          {v.time}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 border ${st.color} ${st.bg}`}>
                        {st.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 mb-1">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{v.propertyAddress}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 mb-2">
                      <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{v.clientName}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-lg font-semibold border-2 ${
                          v.dealType === 'compra'
                            ? 'border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-700'
                            : 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700'
                        }`}
                      >
                        {v.dealType === 'compra' ? <KeyRound className="w-3 h-3 inline mr-1" /> : null}
                        {DEAL_LABEL[v.dealType]}
                      </span>
                    </div>
                    {v.feedbackNotes && v.status === 'realizada' && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600 pt-2 mt-1 line-clamp-3">
                        {v.feedbackNotes}
                      </p>
                    )}
                    {v.status === 'programada' && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => openCompleteModal(v)}
                          className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 border-2 border-emerald-700"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Completar visita
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelVisit(v.id)}
                          className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-semibold border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'propiedades' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredProperties.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-400 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <Building2 className="w-10 h-10 mb-2 opacity-60" />
                <p className="text-sm font-medium">No hay propiedades que coincidan</p>
              </div>
            ) : (
              filteredProperties.map((p) => {
                const st = PROPERTY_STATUS_CFG[p.status];
                return (
                  <div key={p.id} className={`rounded-2xl border-2 p-4 transition-all hover:shadow-lg ${st.bg}`}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="font-mono text-[10px] text-gray-500 dark:text-gray-400 truncate flex-1" title={p.id}>
                        {p.id}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold shrink-0 border ${st.color}`}>
                        {st.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      <Home className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                      <span className="truncate">{PROPERTY_KIND_LABEL[p.kind]}</span>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 mb-3">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                      <span>{p.address}</span>
                    </div>
                    <p className="text-base font-bold text-gray-900 dark:text-gray-100 mb-3">{formatCurrency(p.price)}</p>
                    <label className="block text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 mb-1">
                      Cambio rápido de estado
                    </label>
                    <select
                      value={p.status}
                      onChange={(e) => updatePropertyStatus(p.id, e.target.value as PropertyStatus)}
                      className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm py-2 px-3 font-medium text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 outline-none"
                    >
                      {(Object.keys(PROPERTY_STATUS_CFG) as PropertyStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {PROPERTY_STATUS_CFG[s].label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {completeModalVisit && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="visit-complete-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setCompleteModalVisit(null);
              setCompleteNotes('');
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 id="visit-complete-title" className="text-lg font-bold text-gray-900 dark:text-gray-100">
                Completar visita
              </h2>
              <button
                type="button"
                onClick={() => {
                  setCompleteModalVisit(null);
                  setCompleteNotes('');
                }}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              {completeModalVisit.time} · {completeModalVisit.clientName}
            </p>
            <p className="text-xs text-gray-500 mb-3 truncate">{completeModalVisit.propertyAddress}</p>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Notas de feedback
            </label>
            <textarea
              value={completeNotes}
              onChange={(e) => setCompleteNotes(e.target.value)}
              rows={4}
              placeholder="Impresiones del cliente, próximos pasos…"
              className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm p-3 resize-none focus:ring-2 focus:ring-teal-500 outline-none mb-4"
            />
            <button
              type="button"
              onClick={confirmCompleteVisit}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 border-2 border-emerald-700"
            >
              <CheckCircle2 className="w-4 h-4" />
              Guardar y marcar realizada
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
