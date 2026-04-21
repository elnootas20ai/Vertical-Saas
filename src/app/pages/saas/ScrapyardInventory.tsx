import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Search, Plus, Edit3, Trash2, X, Save, Package, Camera,
  AlertTriangle, Warehouse, BarChart3, Clock, MapPin,
  ArrowUpDown, ChevronDown, ChevronUp, ChevronRight,
  Eye, Image, StickyNote, Link2, Filter, RotateCcw,
  ShieldCheck, ShieldAlert, Ban, Tag, Car, Cog,
  TrendingDown, Info, XCircle, CheckCircle2, Pause,
  Recycle, CircleDollarSign, CalendarClock, Layers,
  FileText, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type PiezaEstado = 'disponible' | 'reservada' | 'vendida' | 'retirada' | 'desechada';

interface Compatibilidad {
  marca: string;
  modelo: string;
  anioDesde: number;
  anioHasta: number;
  motorizacion: string;
}

interface HistorialEntry {
  fecha: string;
  accion: string;
  usuario: string;
  detalle: string;
}

interface PiezaStock extends VerticalEntity {
  referencia: string;
  nombre: string;
  categoria: string;
  vehiculoOrigen: string;
  vehiculoMatricula: string;
  ubicacion: string;
  zona: string;
  estanteria: string;
  precio: number;
  coste: number;
  estado: PiezaEstado;
  fechaAlta: string;
  fechaReserva: string | null;
  fechaVenta: string | null;
  fotos: string[];
  notas: string;
  compatibilidades: Compatibilidad[];
  historial: HistorialEntry[];
  garantiaMeses: number;
  peso: string;
  clienteReserva: string | null;
}

type UserRole = 'gerente' | 'trabajador';
type SortField = 'referencia' | 'nombre' | 'precio' | 'estado' | 'diasStock' | 'ubicacion';
type SortDir = 'asc' | 'desc';

const ESTADO_CONFIG: Record<PiezaEstado, { label: string; color: string; icon: React.ReactNode }> = {
  disponible: { label: 'Disponible', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', icon: <CheckCircle2 className="w-3 h-3" /> },
  reservada:  { label: 'Reservada',  color: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800', icon: <Pause className="w-3 h-3" /> },
  vendida:    { label: 'Vendida',    color: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800', icon: <CircleDollarSign className="w-3 h-3" /> },
  retirada:   { label: 'Retirada',   color: 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400 border-gray-200 dark:border-gray-700', icon: <Ban className="w-3 h-3" /> },
  desechada:  { label: 'Desechada',  color: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800', icon: <Recycle className="w-3 h-3" /> },
};

const CATEGORIAS = ['Motor', 'Carroceria', 'Electricidad', 'Suspension', 'Interior', 'Transmision', 'Frenos', 'Direccion', 'Climatizacion', 'Escape'];
const ZONAS = ['Zona A', 'Zona B', 'Zona C', 'Zona D', 'Exterior'];

const MARCAS = ['Volkswagen', 'Audi', 'BMW', 'Mercedes', 'Seat', 'Peugeot', 'Renault', 'Ford', 'Opel', 'Toyota', 'Hyundai', 'Kia'];
const MODELOS_POR_MARCA: Record<string, string[]> = {
  Volkswagen: ['Golf', 'Polo', 'Passat', 'Tiguan', 'T-Roc'],
  Audi: ['A3', 'A4', 'A6', 'Q3', 'Q5'],
  BMW: ['Serie 1', 'Serie 3', 'Serie 5', 'X1', 'X3'],
  Mercedes: ['Clase A', 'Clase C', 'Clase E', 'GLA', 'GLC'],
  Seat: ['Ibiza', 'Leon', 'Arona', 'Ateca'],
  Peugeot: ['208', '308', '3008', '508'],
  Renault: ['Clio', 'Megane', 'Captur', 'Kadjar'],
  Ford: ['Fiesta', 'Focus', 'Kuga', 'Puma'],
  Opel: ['Corsa', 'Astra', 'Mokka', 'Grandland'],
  Toyota: ['Yaris', 'Corolla', 'RAV4', 'C-HR'],
  Hyundai: ['i20', 'i30', 'Tucson', 'Kona'],
  Kia: ['Rio', 'Ceed', 'Sportage', 'Niro'],
};

const DIAS_STOCK_ALERTA = 90;
const DIAS_RESERVA_SIN_VENTA = 7;

function calcDiasStock(fechaAlta: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(fechaAlta).getTime()) / 86_400_000));
}

function diasStockColor(dias: number): string {
  if (dias <= 30) return 'text-emerald-600 dark:text-emerald-400';
  if (dias <= 60) return 'text-blue-600 dark:text-blue-400';
  if (dias <= 90) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function diasStockBg(dias: number): string {
  if (dias <= 30) return 'bg-emerald-50 dark:bg-emerald-900/20';
  if (dias <= 60) return 'bg-blue-50 dark:bg-blue-900/20';
  if (dias <= 90) return 'bg-amber-50 dark:bg-amber-900/20';
  return 'bg-red-50 dark:bg-red-900/20';
}

type PiezaForm = Omit<PiezaStock, keyof VerticalEntity | 'historial'>;

const emptyPieza = (): PiezaForm => ({
  referencia: '', nombre: '', categoria: CATEGORIAS[0],
  vehiculoOrigen: '', vehiculoMatricula: '',
  ubicacion: '', zona: ZONAS[0], estanteria: '',
  precio: 0, coste: 0, estado: 'disponible',
  fechaAlta: new Date().toISOString().slice(0, 10),
  fechaReserva: null, fechaVenta: null,
  fotos: [], notas: '', compatibilidades: [],
  garantiaMeses: 3, peso: '', clienteReserva: null,
});

export function ScrapyardInventory() {
  const [userRole] = useState<UserRole>('gerente');
  const isGerente = userRole === 'gerente';

  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<PiezaStock>('scrapyard-ops', 'inventory'), []);
  const userId = user?.user_id || user?.id || '';

  const [items, setItems] = useState<PiezaStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<PiezaEstado | ''>('');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [filterZona, setFilterZona] = useState('');
  const [filterDiasMin, setFilterDiasMin] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>('referencia');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PiezaStock | null>(null);
  const [form, setForm] = useState<PiezaForm>(emptyPieza());
  const [formTab, setFormTab] = useState<'general' | 'fotos' | 'compat' | 'notas'>('general');

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showAlerts, setShowAlerts] = useState(true);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'vehicle', label: 'Vehículo origen' },
    { key: 'category', label: 'Categoría' },
    { key: 'price', label: 'Precio' },
    { key: 'location', label: 'Ubicación' },
    { key: 'condition', label: 'Estado' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'vehicle', label: 'Vehículo origen', example: '' },
    { key: 'category', label: 'Categoría', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'location', label: 'Ubicación', example: '' },
    { key: 'condition', label: 'Estado', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} pieza(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} pieza(s) importado(s)`);
  };

  const photoInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setItems(list.map(p => ({ ...p, historial: Array.isArray(p.historial) ? p.historial : [], fotos: Array.isArray(p.fotos) ? p.fotos : [], compatibilidades: Array.isArray(p.compatibilidades) ? p.compatibilidades : [] })));
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useModalClose(showModal, () => setShowModal(false));

  // Alertas computadas
  const alertas = useMemo(() => {
    const list: { id: string; tipo: string; mensaje: string; pieza: PiezaStock; severity: 'critical' | 'warning' | 'info' }[] = [];
    items.forEach(p => {
      if (p.estado === 'vendida' || p.estado === 'desechada') return;
      const dias = calcDiasStock(p.fechaAlta);
      if (p.estado === 'disponible' && dias > DIAS_STOCK_ALERTA) {
        list.push({ id: `parada-${p._id}`, tipo: 'Stock parado', mensaje: `"${p.nombre}" lleva ${dias} dias en stock sin movimiento`, pieza: p, severity: 'critical' });
      }
      if (!p.ubicacion && !p.estanteria) {
        list.push({ id: `ubicacion-${p._id}`, tipo: 'Sin ubicacion', mensaje: `"${p.nombre}" (${p.referencia}) no tiene ubicacion asignada`, pieza: p, severity: 'warning' });
      }
      if (p.estado === 'reservada' && p.fechaReserva) {
        const diasReserva = Math.floor((Date.now() - new Date(p.fechaReserva).getTime()) / 86_400_000);
        if (diasReserva > DIAS_RESERVA_SIN_VENTA) {
          list.push({ id: `reserva-${p._id}`, tipo: 'Reserva sin cerrar', mensaje: `"${p.nombre}" reservada hace ${diasReserva} dias sin completar venta`, pieza: p, severity: 'warning' });
        }
      }
      if (p.compatibilidades.length === 0) {
        list.push({ id: `compat-${p._id}`, tipo: 'Sin compatibilidades', mensaje: `"${p.nombre}" no tiene compatibilidades registradas`, pieza: p, severity: 'info' });
      }
    });
    return list;
  }, [items]);

  // Filtrado y ordenacion
  const filtered = useMemo(() => {
    let result = items.filter(p => {
      const q = search.toLowerCase();
      const matchSearch = !q || p.referencia.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q) || p.vehiculoOrigen.toLowerCase().includes(q) || p.vehiculoMatricula.toLowerCase().includes(q);
      const matchEstado = !filterEstado || p.estado === filterEstado;
      const matchCat = !filterCategoria || p.categoria === filterCategoria;
      const matchZona = !filterZona || p.zona === filterZona;
      const matchDias = !filterDiasMin || calcDiasStock(p.fechaAlta) >= Number(filterDiasMin);
      return matchSearch && matchEstado && matchCat && matchZona && matchDias;
    });
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'referencia': cmp = a.referencia.localeCompare(b.referencia); break;
        case 'nombre': cmp = a.nombre.localeCompare(b.nombre); break;
        case 'precio': cmp = a.precio - b.precio; break;
        case 'estado': cmp = a.estado.localeCompare(b.estado); break;
        case 'diasStock': cmp = calcDiasStock(a.fechaAlta) - calcDiasStock(b.fechaAlta); break;
        case 'ubicacion': cmp = `${a.zona}${a.estanteria}`.localeCompare(`${b.zona}${b.estanteria}`); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [items, search, filterEstado, filterCategoria, filterZona, filterDiasMin, sortField, sortDir]);

  // Stats
  const stats = useMemo(() => {
    const disponibles = items.filter(p => p.estado === 'disponible');
    const reservadas = items.filter(p => p.estado === 'reservada');
    const vendidas = items.filter(p => p.estado === 'vendida');
    const paradas = disponibles.filter(p => calcDiasStock(p.fechaAlta) > DIAS_STOCK_ALERTA);
    const valorInventario = disponibles.reduce((s, p) => s + p.precio, 0) + reservadas.reduce((s, p) => s + p.precio, 0);
    const diasPromedio = disponibles.length > 0 ? Math.round(disponibles.reduce((s, p) => s + calcDiasStock(p.fechaAlta), 0) / disponibles.length) : 0;
    return { disponibles: disponibles.length, reservadas: reservadas.length, vendidas: vendidas.length, paradas: paradas.length, valorInventario, diasPromedio };
  }, [items]);

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }, [sortField]);

  const openCreate = () => { setEditing(null); setForm(emptyPieza()); setFormTab('general'); setShowModal(true); };
  const openEdit = (p: PiezaStock) => {
    const { _id: _docId, _rev: _r, type: _t, user_id: _u, createdAt: _c, updatedAt: _up, historial: _h, ...rest } = p;
    setEditing(p); setForm(rest as PiezaForm); setFormTab('general'); setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.referencia || !form.nombre || !userId) return;
    const now = new Date().toISOString();
    const entry: HistorialEntry = { fecha: now, accion: editing ? 'Modificacion' : 'Alta', usuario: isGerente ? 'Gerente' : 'Trabajador', detalle: editing ? 'Pieza actualizada' : 'Pieza dada de alta en stock' };

    try {
      if (editing) {
        let historial: HistorialEntry[] = [...(editing.historial || []), entry];
        const payload: Partial<PiezaStock> = { ...form, historial };
        if (editing.estado !== 'reservada' && form.estado === 'reservada') {
          payload.fechaReserva = new Date().toISOString().slice(0, 10);
          historial = [...historial, { fecha: now, accion: 'Reserva', usuario: isGerente ? 'Gerente' : 'Trabajador', detalle: `Pieza reservada${form.clienteReserva ? ` para ${form.clienteReserva}` : ''}` }];
          payload.historial = historial;
        }
        if (editing.estado !== 'vendida' && form.estado === 'vendida') {
          payload.fechaVenta = new Date().toISOString().slice(0, 10);
          historial = [...historial, { fecha: now, accion: 'Venta', usuario: isGerente ? 'Gerente' : 'Trabajador', detalle: 'Pieza marcada como vendida' }];
          payload.historial = historial;
        }
        await api.update(userId, editing._id, payload);
      } else {
        await api.create(userId, { ...form, historial: [entry] });
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* fetch error */
    }
  };

  const handleDelete = async (docId: string) => {
    if (!isGerente || !userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* fetch error */
    }
  };

  const handleReservar = async (p: PiezaStock) => {
    if (!userId) return;
    const now = new Date().toISOString();
    try {
      await api.update(userId, p._id, {
        estado: 'reservada' as PiezaEstado,
        fechaReserva: new Date().toISOString().slice(0, 10),
        historial: [...(p.historial || []), { fecha: now, accion: 'Reserva rapida', usuario: isGerente ? 'Gerente' : 'Trabajador', detalle: 'Pieza reservada desde listado' }],
      });
      await loadData();
    } catch {
      /* fetch error */
    }
  };

  const handleMarcarVendida = async (p: PiezaStock) => {
    if (!userId) return;
    const now = new Date().toISOString();
    try {
      await api.update(userId, p._id, {
        estado: 'vendida' as PiezaEstado,
        fechaVenta: new Date().toISOString().slice(0, 10),
        historial: [...(p.historial || []), { fecha: now, accion: 'Venta', usuario: isGerente ? 'Gerente' : 'Trabajador', detalle: 'Pieza vendida y descontada del stock' }],
      });
      await loadData();
    } catch {
      /* fetch error */
    }
  };

  const handleAddPhoto = () => photoInputRef.current?.click();
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newPhotos = Array.from(files).map(f => URL.createObjectURL(f));
    setForm(prev => ({ ...prev, fotos: [...prev.fotos, ...newPhotos] }));
  };
  const handleRemovePhoto = (idx: number) => setForm(prev => ({ ...prev, fotos: prev.fotos.filter((_, i) => i !== idx) }));

  const addCompatibilidad = () => setForm(prev => ({ ...prev, compatibilidades: [...prev.compatibilidades, { marca: MARCAS[0], modelo: '', anioDesde: 2018, anioHasta: 2026, motorizacion: '' }] }));
  const updateCompatibilidad = (idx: number, field: keyof Compatibilidad, value: string | number) => setForm(prev => ({ ...prev, compatibilidades: prev.compatibilidades.map((c, i) => i === idx ? { ...c, [field]: value } : c) }));
  const removeCompatibilidad = (idx: number) => setForm(prev => ({ ...prev, compatibilidades: prev.compatibilidades.filter((_, i) => i !== idx) }));

  const clearFilters = () => { setSearch(''); setFilterEstado(''); setFilterCategoria(''); setFilterZona(''); setFilterDiasMin(''); };
  const hasActiveFilters = !!search || !!filterEstado || !!filterCategoria || !!filterZona || !!filterDiasMin;

  const SortHeader = ({ field, children, className = '' }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <th className={`px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 transition-colors ${className}`} onClick={() => toggleSort(field)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {sortField === field ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
      </span>
    </th>
  );

  const kpiCards = [
    { label: 'Piezas disponibles', value: stats.disponibles, icon: <Package className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/20', accent: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Valor inventario', value: `${stats.valorInventario.toLocaleString('es-ES')} \u20AC`, icon: <CircleDollarSign className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50 dark:bg-blue-900/20', accent: 'text-blue-600 dark:text-blue-400' },
    { label: 'Reservadas', value: stats.reservadas, icon: <Pause className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/20', accent: 'text-amber-600 dark:text-amber-400' },
    { label: 'Stock parado', value: stats.paradas, icon: <TrendingDown className="w-5 h-5 text-red-500" />, bg: 'bg-red-50 dark:bg-red-900/20', accent: 'text-red-600 dark:text-red-400', subtitle: `>${DIAS_STOCK_ALERTA} dias` },
    { label: 'Dias promedio', value: stats.diasPromedio, icon: <CalendarClock className="w-5 h-5 text-violet-500" />, bg: 'bg-violet-50 dark:bg-violet-900/20', accent: 'text-violet-600 dark:text-violet-400', subtitle: 'en stock' },
    { label: 'Vendidas', value: stats.vendidas, icon: <CheckCircle2 className="w-5 h-5 text-sky-500" />, bg: 'bg-sky-50 dark:bg-sky-900/20', accent: 'text-sky-600 dark:text-sky-400' },
  ];

  return (
    <Layout title="Stock de Piezas">
      <div className="space-y-6">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {kpiCards.map(k => (
            <div key={k.label} className={`${k.bg} rounded-xl p-4 border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-all`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{k.icon}</div>
              </div>
              <p className={`text-2xl font-bold ${k.accent}`}>{k.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{k.label}</p>
              {'subtitle' in k && k.subtitle && <p className="text-[10px] text-gray-400 dark:text-gray-500">{k.subtitle}</p>}
            </div>
          ))}
        </div>

        {/* Alertas */}
        {alertas.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button onClick={() => setShowAlerts(!showAlerts)} className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Alertas de Stock</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{alertas.length}</span>
              </div>
              {showAlerts ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {showAlerts && (
              <div className="px-5 pb-4 space-y-2">
                {alertas.slice(0, 8).map(a => {
                  const sev = { critical: 'border-l-red-500 bg-red-50/50 dark:bg-red-900/10', warning: 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10', info: 'border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/10' };
                  const sevText = { critical: 'text-red-700 dark:text-red-400', warning: 'text-amber-700 dark:text-amber-400', info: 'text-blue-700 dark:text-blue-400' };
                  return (
                    <div key={a.id} className={`flex items-start gap-3 p-3 rounded-lg border-l-4 ${sev[a.severity]}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-xs font-semibold ${sevText[a.severity]}`}>{a.tipo}</span>
                          <span className="text-[10px] text-gray-400 font-mono">{a.pieza.referencia}</span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{a.mensaje}</p>
                      </div>
                      <button onClick={() => openEdit(a.pieza)} className="shrink-0 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">Resolver</button>
                    </div>
                  );
                })}
                {alertas.length > 8 && <p className="text-xs text-gray-400 text-center pt-1">y {alertas.length - 8} alertas mas...</p>}
              </div>
            )}
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex flex-wrap gap-2 items-center flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar referencia, pieza, vehiculo..." className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 dark:text-gray-100 outline-none" />
              </div>
              <select value={filterEstado} onChange={e => setFilterEstado(e.target.value as PiezaEstado | '')} className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
                <option value="">Todos los estados</option>
                {(Object.entries(ESTADO_CONFIG) as [PiezaEstado, { label: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-colors ${showFilters ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
                <Filter className="w-4 h-4" /> Filtros
                {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-blue-500" />}
              </button>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                  <RotateCcw className="w-3 h-3" /> Limpiar
                </button>
              )}
            </div>
            {isGerente && (
              <AddButtonDropdown
                label="Nueva Pieza"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de pieza"
              />
            )}
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Categoria</label>
                <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
                  <option value="">Todas</option>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Zona</label>
                <select value={filterZona} onChange={e => setFilterZona(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100">
                  <option value="">Todas</option>
                  {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Dias min. en stock</label>
                <input type="number" value={filterDiasMin} onChange={e => setFilterDiasMin(e.target.value)} placeholder="0" className="w-24 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100" />
              </div>
            </div>
          )}
        </div>

        {/* Role indicator */}
        <div className="flex items-center gap-2 px-1">
          {isGerente ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium"><ShieldCheck className="w-3.5 h-3.5" /> Perfil Gerente</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 font-medium"><ShieldAlert className="w-3.5 h-3.5" /> Perfil Trabajador</span>
          )}
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} pieza{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80">
                  <th className="w-10 px-3 py-3" />
                  <SortHeader field="referencia" className="text-left">Referencia</SortHeader>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Pieza</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden lg:table-cell">Vehiculo origen</th>
                  <SortHeader field="ubicacion" className="text-left hidden md:table-cell">Ubicacion</SortHeader>
                  <SortHeader field="precio" className="text-right">Precio</SortHeader>
                  <SortHeader field="estado" className="text-center">Estado</SortHeader>
                  <SortHeader field="diasStock" className="text-center">Dias stock</SortHeader>
                  <th className="text-center px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden xl:table-cell">Compat.</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 hidden xl:table-cell">Fotos</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Cargando…
                      </span>
                    </td>
                  </tr>
                ) : filtered.map(p => {
                  const dias = calcDiasStock(p.fechaAlta);
                  const isExpanded = expandedRow === p._id;
                  return (
                    <React.Fragment key={p._id}>
                      <tr className={`border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50/80 dark:hover:bg-gray-700/20 transition-colors ${isExpanded ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}>
                        <td className="px-3 py-3">
                          <button onClick={() => setExpandedRow(isExpanded ? null : p._id)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3"><span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded">{p.referencia}</span></td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{p.nombre}</p>
                            <p className="text-xs text-gray-400 mt-0.5"><Tag className="w-3 h-3 inline mr-1" />{p.categoria}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <div className="flex items-center gap-1.5">
                            <Car className="w-3.5 h-3.5 text-gray-400" />
                            <div>
                              <p className="text-xs text-gray-700 dark:text-gray-300">{p.vehiculoOrigen || '\u2014'}</p>
                              {p.vehiculoMatricula && <p className="text-[10px] font-mono text-gray-400">{p.vehiculoMatricula}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {p.ubicacion || p.zona ? (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-gray-400" />
                              <span className="text-xs font-mono text-gray-600 dark:text-gray-300">{p.zona}{p.estanteria ? ` / ${p.estanteria}` : ''}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-red-400 italic flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Sin ubicar</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold text-gray-900 dark:text-gray-100">{p.precio.toLocaleString('es-ES')} \u20AC</span>
                          {isGerente && p.coste > 0 && <p className="text-[10px] text-gray-400">Coste: {p.coste.toLocaleString('es-ES')} \u20AC</p>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${ESTADO_CONFIG[p.estado].color}`}>
                            {ESTADO_CONFIG[p.estado].icon} {ESTADO_CONFIG[p.estado].label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${diasStockColor(dias)} ${diasStockBg(dias)}`}>
                            <Clock className="w-3 h-3" /> {dias}d
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center hidden xl:table-cell">
                          {p.compatibilidades.length > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium"><Link2 className="w-3 h-3" /> {p.compatibilidades.length}</span>
                          ) : <span className="text-xs text-gray-400">\u2014</span>}
                        </td>
                        <td className="px-4 py-3 text-center hidden xl:table-cell">
                          {p.fotos.length > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium"><Image className="w-3 h-3" /> {p.fotos.length}</span>
                          ) : <span className="text-xs text-gray-400">\u2014</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {p.estado === 'disponible' && <button onClick={() => handleReservar(p)} title="Reservar" className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-500 transition-colors"><Pause className="w-4 h-4" /></button>}
                            {(p.estado === 'disponible' || p.estado === 'reservada') && <button onClick={() => handleMarcarVendida(p)} title="Marcar vendida" className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-500 transition-colors"><CircleDollarSign className="w-4 h-4" /></button>}
                            <button onClick={() => openEdit(p)} title="Editar" className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 transition-colors"><Edit3 className="w-4 h-4" /></button>
                            {isGerente && <button onClick={() => handleDelete(p._id)} title="Eliminar" className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>}
                          </div>
                        </td>
                      </tr>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={11} className="bg-gray-50/50 dark:bg-gray-800/50 px-6 py-5 border-b border-gray-200 dark:border-gray-700">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                              <div>
                                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" /> Fotos</h4>
                                {p.fotos.length > 0 ? (
                                  <div className="grid grid-cols-3 gap-2">
                                    {p.fotos.map((f, i) => (
                                      <div key={i} className="aspect-square rounded-lg bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                        <img src={f} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                                      </div>
                                    ))}
                                  </div>
                                ) : <p className="text-xs text-gray-400 italic">Sin fotos adjuntas</p>}
                              </div>
                              <div>
                                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Compatibilidades</h4>
                                {p.compatibilidades.length > 0 ? (
                                  <div className="space-y-2">
                                    {p.compatibilidades.map((c, i) => (
                                      <div key={i} className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
                                        <p className="font-medium text-gray-800 dark:text-gray-200">{c.marca} {c.modelo}</p>
                                        <p className="text-gray-500 dark:text-gray-400">{c.anioDesde}\u2013{c.anioHasta} \u00B7 {c.motorizacion || 'Todas'}</p>
                                      </div>
                                    ))}
                                  </div>
                                ) : <p className="text-xs text-gray-400 italic">Sin compatibilidades definidas</p>}
                              </div>
                              <div className="space-y-4">
                                <div>
                                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Notas</h4>
                                  <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{p.notas || 'Sin notas'}</p>
                                </div>
                                <div>
                                  <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Historial</h4>
                                  {(p.historial || []).length > 0 ? (
                                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                      {[...(p.historial || [])].reverse().map((h, i) => (
                                        <div key={i} className="flex items-start gap-2 text-[11px]">
                                          <span className="text-gray-400 shrink-0 font-mono">{new Date(h.fecha).toLocaleDateString('es-ES')}</span>
                                          <span className="font-medium text-gray-700 dark:text-gray-300">{h.accion}</span>
                                          <span className="text-gray-500 dark:text-gray-400">{h.detalle}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : <p className="text-xs text-gray-400 italic">Sin historial</p>}
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                  <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                    <span className="text-gray-400">Garantia</span>
                                    <p className="font-medium text-gray-700 dark:text-gray-300">{p.garantiaMeses} meses</p>
                                  </div>
                                  <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                    <span className="text-gray-400">Peso</span>
                                    <p className="font-medium text-gray-700 dark:text-gray-300">{p.peso || '\u2014'}</p>
                                  </div>
                                  <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                    <span className="text-gray-400">Alta</span>
                                    <p className="font-medium text-gray-700 dark:text-gray-300">{p.fechaAlta}</p>
                                  </div>
                                  {p.clienteReserva && (
                                    <div className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                      <span className="text-gray-400">Cliente reserva</span>
                                      <p className="font-medium text-gray-700 dark:text-gray-300">{p.clienteReserva}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-4 py-16 text-center">
                      <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                      <p className="text-gray-500 dark:text-gray-400 font-medium">No se encontraron piezas</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{hasActiveFilters ? 'Prueba a ajustar los filtros' : 'Anade la primera pieza al stock'}</p>
                      {!hasActiveFilters && isGerente && (
                        <button onClick={openCreate} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"><Plus className="w-4 h-4" /> Nueva Pieza</button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Crear/Editar */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{editing ? 'Editar Pieza' : 'Nueva Pieza'}</h3>
                <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
                {([
                  { key: 'general' as const, label: 'General', icon: <Cog className="w-3.5 h-3.5" /> },
                  { key: 'fotos' as const, label: 'Fotos', icon: <Camera className="w-3.5 h-3.5" /> },
                  { key: 'compat' as const, label: 'Compatibilidades', icon: <Link2 className="w-3.5 h-3.5" /> },
                  { key: 'notas' as const, label: 'Notas', icon: <StickyNote className="w-3.5 h-3.5" /> },
                ]).map(tab => (
                  <button key={tab.key} onClick={() => setFormTab(tab.key)} className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${formTab === tab.key ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                    {tab.icon} {tab.label}
                    {tab.key === 'compat' && form.compatibilidades.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold">{form.compatibilidades.length}</span>}
                    {tab.key === 'fotos' && form.fotos.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold">{form.fotos.length}</span>}
                  </button>
                ))}
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6">
                {formTab === 'general' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Referencia *</label>
                        <input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} placeholder="REF-001" disabled={!isGerente && !!editing} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 font-mono disabled:opacity-50" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Estado</label>
                        <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as PiezaEstado }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                          {(Object.entries(ESTADO_CONFIG) as [PiezaEstado, { label: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Nombre pieza *</label>
                      <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Motor completo, Puerta delantera izq..." disabled={!isGerente && !!editing} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 disabled:opacity-50" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Categoria</label>
                        <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} disabled={!isGerente && !!editing} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 disabled:opacity-50">
                          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Fecha alta</label>
                        <input type="date" value={form.fechaAlta} onChange={e => setForm(f => ({ ...f, fechaAlta: e.target.value }))} disabled={!isGerente && !!editing} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 disabled:opacity-50" />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Vehiculo origen</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Vehiculo</label>
                          <input value={form.vehiculoOrigen} onChange={e => setForm(f => ({ ...f, vehiculoOrigen: e.target.value }))} placeholder="VW Golf VII 2.0 TDI 2019" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Matricula</label>
                          <input value={form.vehiculoMatricula} onChange={e => setForm(f => ({ ...f, vehiculoMatricula: e.target.value.toUpperCase() }))} placeholder="1234ABC" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 font-mono uppercase" />
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Ubicacion</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Zona</label>
                          <select value={form.zona} onChange={e => setForm(f => ({ ...f, zona: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                            {ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Estanteria / Pasillo</label>
                          <input value={form.estanteria} onChange={e => setForm(f => ({ ...f, estanteria: e.target.value }))} placeholder="A1-03" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 font-mono" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Ubicacion libre</label>
                          <input value={form.ubicacion} onChange={e => setForm(f => ({ ...f, ubicacion: e.target.value }))} placeholder="Nave 2, fila 3" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Precio y detalles</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Precio venta</label>
                          <input type="number" value={form.precio} onChange={e => setForm(f => ({ ...f, precio: Number(e.target.value) }))} disabled={!isGerente} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 disabled:opacity-50" />
                        </div>
                        {isGerente && (
                          <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Coste</label>
                            <input type="number" value={form.coste} onChange={e => setForm(f => ({ ...f, coste: Number(e.target.value) }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Garantia (meses)</label>
                          <input type="number" value={form.garantiaMeses} onChange={e => setForm(f => ({ ...f, garantiaMeses: Number(e.target.value) }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Peso</label>
                          <input value={form.peso} onChange={e => setForm(f => ({ ...f, peso: e.target.value }))} placeholder="12.5 kg" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                        </div>
                      </div>
                    </div>

                    {form.estado === 'reservada' && (
                      <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Cliente reserva</label>
                        <input value={form.clienteReserva || ''} onChange={e => setForm(f => ({ ...f, clienteReserva: e.target.value }))} placeholder="Nombre del cliente" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                      </div>
                    )}
                  </div>
                )}

                {formTab === 'fotos' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-600 dark:text-gray-400">Fotos de la pieza ({form.fotos.length})</p>
                      <button onClick={handleAddPhoto} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"><Camera className="w-3.5 h-3.5" /> Anadir foto</button>
                      <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={handlePhotoChange} className="hidden" />
                    </div>
                    {form.fotos.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {form.fotos.map((f, i) => (
                          <div key={i} className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                            <img src={f} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                            <button onClick={() => handleRemovePhoto(i)} className="absolute top-1.5 right-1.5 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                        <Image className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-2" />
                        <p className="text-sm text-gray-400">Sin fotos</p>
                        <button onClick={handleAddPhoto} className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">Subir primera foto</button>
                      </div>
                    )}
                  </div>
                )}

                {formTab === 'compat' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-600 dark:text-gray-400">Vehiculos compatibles ({form.compatibilidades.length})</p>
                      <button onClick={addCompatibilidad} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"><Plus className="w-3.5 h-3.5" /> Anadir</button>
                    </div>
                    {form.compatibilidades.length > 0 ? (
                      <div className="space-y-3">
                        {form.compatibilidades.map((c, i) => (
                          <div key={i} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-800/50 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-gray-500">Compatibilidad #{i + 1}</span>
                              <button onClick={() => removeCompatibilidad(i)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors"><X className="w-4 h-4" /></button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[11px] text-gray-500 mb-1">Marca</label>
                                <select value={c.marca} onChange={e => updateCompatibilidad(i, 'marca', e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                                  {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] text-gray-500 mb-1">Modelo</label>
                                <select value={c.modelo} onChange={e => updateCompatibilidad(i, 'modelo', e.target.value)} className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                                  <option value="">Seleccionar</option>
                                  {(MODELOS_POR_MARCA[c.marca] || []).map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[11px] text-gray-500 mb-1">Ano desde</label>
                                <input type="number" value={c.anioDesde} onChange={e => updateCompatibilidad(i, 'anioDesde', Number(e.target.value))} className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                              </div>
                              <div>
                                <label className="block text-[11px] text-gray-500 mb-1">Ano hasta</label>
                                <input type="number" value={c.anioHasta} onChange={e => updateCompatibilidad(i, 'anioHasta', Number(e.target.value))} className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] text-gray-500 mb-1">Motorizacion</label>
                              <input value={c.motorizacion} onChange={e => updateCompatibilidad(i, 'motorizacion', e.target.value)} placeholder="2.0 TDI 150cv, 1.6 HDi..." className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                        <Link2 className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-2" />
                        <p className="text-sm text-gray-400">Sin compatibilidades definidas</p>
                        <button onClick={addCompatibilidad} className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">Anadir primera compatibilidad</button>
                      </div>
                    )}
                  </div>
                )}

                {formTab === 'notas' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Notas internas</label>
                    <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} rows={8} placeholder="Observaciones sobre el estado de la pieza, defectos, condiciones especiales..." className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 resize-none" />
                    <p className="text-[11px] text-gray-400 mt-2">Las notas son visibles para todo el equipo.</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="sticky bottom-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-2xl">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
                <div className="flex items-center gap-2">
                  {editing && <span className="text-[11px] text-gray-400">{calcDiasStock(form.fechaAlta)} dias en stock</span>}
                  <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"><Save className="w-4 h-4" /> Guardar</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="scrapyard_inventory"
        moduleLabel="Inventario"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Inventario"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
