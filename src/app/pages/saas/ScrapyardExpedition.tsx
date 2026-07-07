import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import {
  Truck, Plus, Search, Edit3, Trash2, X, Package,
  Clock, AlertTriangle, CheckCircle2, PackageCheck,
  Send, User, Eye, Bell, Info, Loader2,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface Expedition extends VerticalEntity {
  numPedido: string;
  cliente: string;
  telefono: string;
  piezas: string;
  cantidadPiezas: number;
  fechaVenta: string;
  fechaPreparacion: string;
  fechaExpedicion: string;
  responsable: string;
  metodoEnvio: string;
  numSeguimiento: string;
  direccionEnvio: string;
  estadoExpedicion: string;
  estadoCobro: string;
  incidencia: string;
  notas: string;
}

const ESTADOS_EXPEDICION = [
  'Pendiente preparaci\u00f3n',
  'En preparaci\u00f3n',
  'Embalada',
  'Lista para env\u00edo',
  'Enviada',
  'Entregada',
];

const ESTADOS_COBRO = ['Pendiente', 'Cobrada', 'Parcial'];

const METODOS_ENVIO = [
  'Recogida en tienda',
  'Mensajer\u00eda',
  'Agencia de transporte',
  'Env\u00edo propio',
];

const INCIDENCIAS = [
  '',
  'Da\u00f1o en transporte',
  'Pieza incorrecta',
  'Direcci\u00f3n err\u00f3nea',
  'Cliente ausente',
  'Retraso transportista',
  'Embalaje deficiente',
  'Otra',
];

const estadoExpColor: Record<string, string> = {
  'Pendiente preparaci\u00f3n': 'bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300',
  'En preparaci\u00f3n': 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  'Embalada': 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'Lista para env\u00edo': 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  'Enviada': 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  'Entregada': 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
};

const estadoCobroColor: Record<string, string> = {
  'Pendiente': 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  'Cobrada': 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  'Parcial': 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
};

type ExpeditionForm = Omit<Expedition, keyof VerticalEntity>;

const emptyForm = (): ExpeditionForm => ({
  numPedido: '',
  cliente: '',
  telefono: '',
  piezas: '',
  cantidadPiezas: 1,
  fechaVenta: new Date().toISOString().slice(0, 10),
  fechaPreparacion: '',
  fechaExpedicion: '',
  responsable: '',
  metodoEnvio: 'Mensajer\u00eda',
  numSeguimiento: '',
  direccionEnvio: '',
  estadoExpedicion: 'Pendiente preparaci\u00f3n',
  estadoCobro: 'Pendiente',
  incidencia: '',
  notas: '',
});

function diffDays(dateStr: string) {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

type Alert = { type: 'warning' | 'danger' | 'info'; message: string; pedido: string };

function computeAlerts(items: Expedition[]): Alert[] {
  const alerts: Alert[] = [];
  for (const e of items) {
    if (
      (e.estadoExpedicion === 'Lista para env\u00edo' || e.estadoExpedicion === 'Embalada') &&
      diffDays(e.fechaPreparacion || e.fechaVenta) >= 1
    ) {
      alerts.push({ type: 'warning', message: `Pedido listo sin enviar (+${diffDays(e.fechaPreparacion || e.fechaVenta)}d)`, pedido: e.numPedido });
    }
    if (e.estadoExpedicion === 'Enviada' && diffDays(e.fechaExpedicion) >= 5) {
      alerts.push({ type: 'danger', message: 'Expedici\u00f3n posiblemente retrasada', pedido: e.numPedido });
    }
    if (
      ['Embalada', 'Lista para env\u00edo', 'Enviada'].includes(e.estadoExpedicion) &&
      e.estadoCobro !== 'Cobrada'
    ) {
      alerts.push({ type: 'info', message: 'Pieza preparada pero no cobrada', pedido: e.numPedido });
    }
    if (e.incidencia) {
      alerts.push({ type: 'danger', message: `Incidencia: ${e.incidencia}`, pedido: e.numPedido });
    }
  }
  return alerts;
}

function InfoField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</p>
      {children || <p className="text-gray-900 dark:text-gray-100 font-medium">{value}</p>}
    </div>
  );
}

function DetailModal({ exp, onClose }: { exp: Expedition; onClose: () => void }) {
  useModalClose(true, onClose);
  const steps = ESTADOS_EXPEDICION;
  const currentIdx = steps.indexOf(exp.estadoExpedicion);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={ev => ev.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Pedido {exp.numPedido}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{exp.cliente}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
        </div>

        {/* Progress tracker */}
        <div className="px-5 pt-5">
          <div className="flex items-center justify-between mb-1">
            {steps.map((s, i) => (
              <div key={s} className="flex flex-col items-center flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${i <= currentIdx ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-400'}`}>
                  {i < currentIdx ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-[10px] mt-1 text-center leading-tight max-w-[70px] ${i <= currentIdx ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-400'}`}>{s}</span>
              </div>
            ))}
          </div>
          <div className="flex mt-1 mb-4 mx-3">
            {steps.slice(1).map((_, i) => (
              <div key={i} className={`flex-1 h-0.5 mx-0.5 rounded ${i < currentIdx ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`} />
            ))}
          </div>
        </div>

        <div className="p-5 grid grid-cols-2 gap-4 text-sm">
          <InfoField label="Piezas" value={exp.piezas} />
          <InfoField label="Cantidad" value={String(exp.cantidadPiezas)} />
          <InfoField label="Fecha venta" value={exp.fechaVenta} />
          <InfoField label="Responsable" value={exp.responsable || '\u2014'} />
          <InfoField label="M\u00e9todo env\u00edo" value={exp.metodoEnvio} />
          <InfoField label="N\u00ba Seguimiento" value={exp.numSeguimiento || '\u2014'} />
          <InfoField label="Direcci\u00f3n" value={exp.direccionEnvio || '\u2014'} />
          <InfoField label="Tel\u00e9fono" value={exp.telefono || '\u2014'} />
          <div className="col-span-2">
            <InfoField label="Estado cobro">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${estadoCobroColor[exp.estadoCobro]}`}>{exp.estadoCobro}</span>
            </InfoField>
          </div>
          {exp.incidencia && (
            <div className="col-span-2 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-red-700 dark:text-red-300">Incidencia</p>
                <p className="text-red-600 dark:text-red-400">{exp.incidencia}</p>
              </div>
            </div>
          )}
          {exp.notas && (
            <div className="col-span-2">
              <InfoField label="Notas" value={exp.notas} />
            </div>
          )}
          {exp.fechaPreparacion && <InfoField label="Fecha preparaci\u00f3n" value={exp.fechaPreparacion} />}
          {exp.fechaExpedicion && <InfoField label="Fecha expedici\u00f3n" value={exp.fechaExpedicion} />}
        </div>
      </div>
    </div>
  );
}

/* ================================================================ */

export function ScrapyardExpedition() {
  const [items, setItems] = useState<Expedition[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterCobro, setFilterCobro] = useState('');
  const [filterEnvio, setFilterEnvio] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Expedition | null>(null);
  const [form, setForm] = useState<ExpeditionForm>(emptyForm());
  const [viewing, setViewing] = useState<Expedition | null>(null);
  const [showAlerts, setShowAlerts] = useState(true);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const { user } = useAuth();
  const api = useMemo(() => createVerticalApi<Expedition>('scrapyard-ops', 'expeditions'), []);
  const userId = user?.user_id || user?.id || '';

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.list(userId);
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [userId, api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'destination', label: 'Destino' },
    { key: 'date', label: 'Fecha' },
    { key: 'weight', label: 'Peso' },
    { key: 'items', label: 'Piezas' },
    { key: 'notes', label: 'Notas' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'destination', label: 'Destino', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'weight', label: 'Peso', example: '' },
    { key: 'items', label: 'Piezas', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const numPedido = entryStr(e, 'numPedido');
    if (!numPedido) return null;
    return {
      numPedido,
      cliente: entryStr(e, 'cliente', 'client') || '',
      telefono: entryStr(e, 'telefono', 'phone', 'tel') || '',
      piezas: entryStr(e, 'piezas') || '',
      cantidadPiezas: entryNum(e, 'cantidadPiezas'),
      fechaVenta: entryStr(e, 'fechaVenta') || new Date().toISOString().slice(0, 10),
      fechaPreparacion: entryStr(e, 'fechaPreparacion') || '',
      fechaExpedicion: entryStr(e, 'fechaExpedicion') || '',
      responsable: entryStr(e, 'responsable') || '',
      metodoEnvio: entryStr(e, 'metodoEnvio') || 'Mensajer\u00eda',
      numSeguimiento: entryStr(e, 'numSeguimiento') || '',
      direccionEnvio: entryStr(e, 'direccionEnvio') || '',
      estadoExpedicion: entryStr(e, 'estadoExpedicion') || 'Pendiente preparaci\u00f3n',
      estadoCobro: entryStr(e, 'estadoCobro') || 'Pendiente',
      incidencia: entryStr(e, 'incidencia') || '',
      notas: entryStr(e, 'notas', 'notes', 'description') || '',
    };
    });
    if (created > 0) {
      await loadData();
      toast.success(`${created} expedición creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleAIEntries = persistEntries;
  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(showModal, () => setShowModal(false));

  const filtered = useMemo(() => items.filter(e => {
    const q = search.toLowerCase();
    const matchSearch =
      e.numPedido.toLowerCase().includes(q) ||
      e.cliente.toLowerCase().includes(q) ||
      e.piezas.toLowerCase().includes(q) ||
      e.responsable.toLowerCase().includes(q);
    const matchEstado = !filterEstado || e.estadoExpedicion === filterEstado;
    const matchCobro = !filterCobro || e.estadoCobro === filterCobro;
    const matchEnvio = !filterEnvio || e.metodoEnvio === filterEnvio;
    return matchSearch && matchEstado && matchCobro && matchEnvio;
  }), [items, search, filterEstado, filterCobro, filterEnvio]);

  const alerts = useMemo(() => computeAlerts(items), [items]);

  const today = new Date().toISOString().slice(0, 10);
  const pendientesPreparar = items.filter(e => e.estadoExpedicion === 'Pendiente preparaci\u00f3n').length;
  const preparadasSinEnviar = items.filter(e => ['Embalada', 'Lista para env\u00edo'].includes(e.estadoExpedicion)).length;
  const enviadasHoy = items.filter(e => e.estadoExpedicion === 'Enviada' && e.fechaExpedicion === today).length;
  const incidenciasAbiertas = items.filter(e => e.incidencia).length;

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setShowModal(true); };
  const openEdit = (exp: Expedition) => {
    setEditing(exp);
    const { _id: _docId, _rev: _r, type: _t, user_id: _u, createdAt: _c, updatedAt: _up, ...rest } = exp;
    setForm(rest as ExpeditionForm);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.numPedido || !form.cliente || !userId) return;
    const now = new Date().toISOString().slice(0, 10);
    let payload: Partial<Expedition> = { ...form };
    if ((form.estadoExpedicion === 'Enviada' || form.estadoExpedicion === 'Entregada') && !form.fechaExpedicion) {
      payload = { ...payload, fechaExpedicion: now };
    }
    if (form.estadoExpedicion === 'En preparaci\u00f3n' && !form.fechaPreparacion) {
      payload = { ...payload, fechaPreparacion: now };
    }
    try {
      if (editing) {
        await api.update(userId, editing._id, payload);
      } else {
        await api.create(userId, payload);
      }
      await loadData();
      setShowModal(false);
    } catch {
      /* fetch error */
    }
  };

  const handleDelete = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* fetch error */
    }
  };

  const handleQuickStatus = async (exp: Expedition, newStatus: string) => {
    if (!userId) return;
    const now = new Date().toISOString().slice(0, 10);
    const updates: Partial<Expedition> = { estadoExpedicion: newStatus };
    if (newStatus === 'En preparaci\u00f3n' && !exp.fechaPreparacion) updates.fechaPreparacion = now;
    if ((newStatus === 'Enviada' || newStatus === 'Entregada') && !exp.fechaExpedicion) updates.fechaExpedicion = now;
    try {
      await api.update(userId, exp._id, updates);
      await loadData();
    } catch {
      /* fetch error */
    }
  };

  const stats = [
    { label: 'Pendientes preparar', value: pendientesPreparar, icon: <Clock className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Preparadas sin enviar', value: preparadasSinEnviar, icon: <PackageCheck className="w-5 h-5 text-indigo-500" />, bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
    { label: 'Enviadas hoy', value: enviadasHoy, icon: <Send className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'Incidencias abiertas', value: incidenciasAbiertas, icon: <AlertTriangle className="w-5 h-5 text-red-500" />, bg: 'bg-red-50 dark:bg-red-900/30' },
  ];

  const nextStepLabel = (estado: string) => {
    const idx = ESTADOS_EXPEDICION.indexOf(estado);
    return idx < ESTADOS_EXPEDICION.length - 1 ? ESTADOS_EXPEDICION[idx + 1] : null;
  };

  return (
    <Layout title="Preparaci\u00f3n y Expedici\u00f3n">
      <div className="space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-4`}>
              <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{s.icon}</div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Alertas */}
        {alerts.length > 0 && showAlerts && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Alertas de expedici\u00f3n</h3>
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">{alerts.length}</span>
              </div>
              <button onClick={() => setShowAlerts(false)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">Ocultar</button>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {alerts.map((a, i) => (
                <div key={i} className={`flex items-start gap-2 rounded-lg p-2.5 text-sm ${
                  a.type === 'danger' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' :
                  a.type === 'warning' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' :
                  'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                }`}>
                  {a.type === 'danger' ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> :
                   a.type === 'warning' ? <Clock className="w-4 h-4 mt-0.5 shrink-0" /> :
                   <Info className="w-4 h-4 mt-0.5 shrink-0" />}
                  <span><strong>{a.pedido}</strong> &mdash; {a.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {alerts.length > 0 && !showAlerts && (
          <button onClick={() => setShowAlerts(true)} className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 hover:underline">
            <Bell className="w-4 h-4" /> Mostrar {alerts.length} alertas
          </button>
        )}

        {/* Barra de b\u00fasqueda y filtros */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por pedido, cliente, pieza o responsable..." className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Estado expedici\u00f3n</option>
              {ESTADOS_EXPEDICION.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <select value={filterCobro} onChange={e => setFilterCobro(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">Cobro</option>
              {ESTADOS_COBRO.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterEnvio} onChange={e => setFilterEnvio(e.target.value)} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <option value="">M\u00e9todo env\u00edo</option>
              {METODOS_ENVIO.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <AddButtonDropdown
                label="Nueva Expedición"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de expedición"
              />
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Pedido</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Piezas</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Estado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Cobro</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">Env\u00edo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden xl:table-cell">Responsable</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden xl:table-cell">Seguimiento</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 hidden xl:table-cell">F. Salida</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cargando…
                    </span>
                  </td>
                </tr>
              ) : filtered.map(exp => {
                const next = nextStepLabel(exp.estadoExpedicion);
                return (
                  <tr key={exp._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{exp.numPedido}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 dark:text-gray-100">{exp.cliente}</p>
                      {exp.telefono && <p className="text-xs text-gray-400">{exp.telefono}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell max-w-[180px]">
                      <span className="truncate block">{exp.piezas}</span>
                      <span className="text-xs text-gray-400">x{exp.cantidadPiezas}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${estadoExpColor[exp.estadoExpedicion]}`}>
                        {exp.estadoExpedicion}
                      </span>
                      {exp.incidencia && (
                        <span className="ml-1 inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300">
                          <AlertTriangle className="w-3 h-3" />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${estadoCobroColor[exp.estadoCobro]}`}>
                        {exp.estadoCobro}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell">
                      <span className="inline-flex items-center gap-1 text-xs"><Truck className="w-3 h-3" />{exp.metodoEnvio}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden xl:table-cell">
                      <span className="inline-flex items-center gap-1 text-xs"><User className="w-3 h-3" />{exp.responsable || '\u2014'}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden xl:table-cell font-mono text-xs">{exp.numSeguimiento || '\u2014'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden xl:table-cell text-xs">{exp.fechaExpedicion || '\u2014'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {next && (
                          <button
                            onClick={() => handleQuickStatus(exp, next)}
                            title={`Avanzar a: ${next}`}
                            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-500 dark:text-blue-400 transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => setViewing(exp)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Eye className="w-4 h-4" /></button>
                        <button onClick={() => openEdit(exp)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(exp._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-500 dark:text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <Package className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400 dark:text-gray-500 font-medium">No se encontraron expediciones</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Crea una nueva expedici\u00f3n para empezar</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Crear / Editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={ev => ev.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Expedici\u00f3n' : 'Nueva Expedici\u00f3n'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([
                  { key: 'numPedido', label: 'N\u00ba Pedido', type: 'text' },
                  { key: 'cliente', label: 'Cliente', type: 'text' },
                  { key: 'telefono', label: 'Tel\u00e9fono', type: 'text' },
                  { key: 'piezas', label: 'Piezas (descripci\u00f3n)', type: 'text' },
                  { key: 'cantidadPiezas', label: 'Cantidad piezas', type: 'number' },
                  { key: 'fechaVenta', label: 'Fecha venta', type: 'date' },
                  { key: 'fechaPreparacion', label: 'Fecha preparaci\u00f3n', type: 'date' },
                  { key: 'fechaExpedicion', label: 'Fecha expedici\u00f3n', type: 'date' },
                  { key: 'responsable', label: 'Responsable', type: 'text' },
                  { key: 'numSeguimiento', label: 'N\u00ba Seguimiento', type: 'text' },
                ] as const).map(f => (
                  <div key={f.key}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                    <input
                      type={f.type}
                      value={(form as any)[f.key]}
                      onChange={ev => setForm(prev => ({ ...prev, [f.key]: f.type === 'number' ? Number(ev.target.value) : ev.target.value }))}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Direcci\u00f3n de env\u00edo</label>
                <input
                  type="text"
                  value={form.direccionEnvio}
                  onChange={ev => setForm(prev => ({ ...prev, direccionEnvio: ev.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Calle, n\u00famero, CP, ciudad..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">M\u00e9todo de env\u00edo</label>
                  <select value={form.metodoEnvio} onChange={ev => setForm(prev => ({ ...prev, metodoEnvio: ev.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {METODOS_ENVIO.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado expedici\u00f3n</label>
                  <select value={form.estadoExpedicion} onChange={ev => setForm(prev => ({ ...prev, estadoExpedicion: ev.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {ESTADOS_EXPEDICION.map(est => <option key={est} value={est}>{est}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado cobro</label>
                  <select value={form.estadoCobro} onChange={ev => setForm(prev => ({ ...prev, estadoCobro: ev.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {ESTADOS_COBRO.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Incidencia</label>
                <select value={form.incidencia} onChange={ev => setForm(prev => ({ ...prev, incidencia: ev.target.value }))} className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                  {INCIDENCIAS.map(inc => <option key={inc} value={inc}>{inc || 'Sin incidencia'}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas</label>
                <textarea
                  value={form.notas}
                  onChange={ev => setForm(prev => ({ ...prev, notas: ev.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  placeholder="Instrucciones especiales de embalaje, observaciones..."
                />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detalle */}
      {viewing && <DetailModal exp={viewing} onClose={() => setViewing(null)} />}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="scrapyard_expedition"
        moduleLabel="Expediciones"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Expediciones"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
