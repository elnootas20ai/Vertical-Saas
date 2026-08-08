import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { RealEstateNav } from '../../components/saas/RealEstateNav';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useRealEstateScope } from '../../lib/realEstateScope';
import { useBusiness } from '../../context/BusinessContext';
import { ensureRealEstateContractFinance } from '../../lib/realEstateFinanceSync';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, X, Edit3, Trash2, FileText, DollarSign,
  AlertCircle, Loader2, Building2, ExternalLink, Plus, Camera, Home,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AuthImage } from '../../components/saas/AuthImage';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import { formatMoneyEs, formatNumberEs } from '../../lib/formatNumberEs';

type TipoContrato = 'alquiler' | 'venta';
type EstadoContrato = 'activo' | 'vencido' | 'rescindido' | 'borrador';

interface ReProperty extends VerticalEntity {
  referencia?: string;
  direccion?: string;
  tipo?: string;
  operacion?: string;
  precio?: number;
  estado?: string;
  fotos?: string[];
}

function normalizeFotos(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
}

interface Contract extends VerticalEntity {
  referencia: string;
  propiedad: string;
  /** Enlace al inmueble de cartera (`re_property`). */
  propiedadId?: string;
  cliente: string;
  clienteNif?: string;
  tipo: TipoContrato;
  fechaInicio: string;
  fechaFin: string;
  importeMensual: number;
  importeTotal: number;
  /** Honorarios agencia (IVA incl.). Vacío = renta mensual o importe total. */
  honorarios?: number;
  estado: EstadoContrato;
}

type ContractForm = Omit<Contract, keyof VerticalEntity>;

const STATUS_CFG: Record<EstadoContrato, { bg: string; text: string }> = {
  activo:     { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  vencido:    { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300' },
  rescindido: { bg: 'bg-gray-100 dark:bg-gray-700/40', text: 'text-gray-700 dark:text-gray-300' },
  borrador:   { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
};

const TIPOS: TipoContrato[] = ['alquiler', 'venta'];
const ESTADOS: EstadoContrato[] = ['activo', 'vencido', 'rescindido', 'borrador'];

const EMPTY: ContractForm = {
  referencia: '', propiedad: '', propiedadId: '', cliente: '', clienteNif: '', tipo: 'alquiler',
  fechaInicio: '', fechaFin: '', importeMensual: 0, importeTotal: 0, honorarios: 0, estado: 'borrador',
};

function propertyLabel(p: ReProperty): string {
  const ref = String(p.referencia || '').trim();
  const addr = String(p.direccion || '').trim();
  if (ref && addr) return `${ref} · ${addr}`;
  return addr || ref || p._id;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addMonthsFromTodayISO(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function newContractRef(): string {
  return `CTR-${Date.now().toString(36).toUpperCase()}`;
}

export function RealEstateContracts() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { userId, businessId, listOptions, ready } = useRealEstateScope();
  const { currentBusiness } = useBusiness();
  const api = useMemo(() => createVerticalApi<Contract>('realestate', 'contracts'), []);
  const propsApi = useMemo(() => createVerticalApi<ReProperty>('realestate', 'properties'), []);
  const financeScope = useMemo(
    () => ({
      businessId: businessId || currentBusiness?.business_id || '',
      businessName: String(currentBusiness?.name || '').trim(),
      salesPointId: listOptions.salesPointId,
    }),
    [businessId, currentBusiness, listOptions.salesPointId],
  );

  const [data, setData] = useState<Contract[]>([]);
  const [properties, setProperties] = useState<ReProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<EstadoContrato | ''>('');
  const [filterTipo, setFilterTipo] = useState<TipoContrato | ''>('');
  const [filterPropId, setFilterPropId] = useState(() => String(searchParams.get('propiedadId') || '').trim());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [form, setForm] = useState<ContractForm>(EMPTY);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'property', label: 'Inmueble', example: '' },
    { key: 'tenant', label: 'Inquilino', example: '' },
    { key: 'startDate', label: 'Fecha inicio', example: '' },
    { key: 'endDate', label: 'Fecha fin', example: '' },
    { key: 'rent', label: 'Renta', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId || !ready) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const referencia = entryStr(e, 'referencia', 'reference', 'sku');
    if (!referencia) return null;
    return {
      referencia,
      propiedad: entryStr(e, 'propiedad', 'property') || '',
      propiedadId: entryStr(e, 'propiedadId', 'propertyId') || undefined,
      cliente: entryStr(e, 'cliente', 'client', 'tenant') || '',
      tipo: entryStr(e, 'tipo', 'type') || 'alquiler',
      fechaInicio: entryStr(e, 'fechaInicio', 'startDate') || '',
      fechaFin: entryStr(e, 'fechaFin', 'endDate') || '',
      importeMensual: entryNum(e, 'importeMensual', 'rent'),
      importeTotal: entryNum(e, 'importeTotal'),
      estado: entryStr(e, 'estado', 'status') || 'borrador',
    };
    }, listOptions);
    if (created > 0) {
      await loadData();
      toast.success(`${created} contrato creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(modalOpen, () => setModalOpen(false));

  const loadData = useCallback(async () => {
    if (!userId || !ready) {
      setData([]);
      setProperties([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [contractsRes, propsRes] = await Promise.allSettled([
        api.list(userId, listOptions),
        propsApi.list(userId, listOptions),
      ]);
      const list = contractsRes.status === 'fulfilled' ? contractsRes.value : [];
      const props = propsRes.status === 'fulfilled' ? propsRes.value : [];
      if (contractsRes.status === 'rejected') {
        toast.error(contractsRes.reason instanceof Error ? contractsRes.reason.message : 'Error cargando contratos');
      }
      if (propsRes.status === 'rejected') {
        toast.error(propsRes.reason instanceof Error ? propsRes.reason.message : 'Error cargando propiedades');
      }
      setData(list);
      setProperties(props);
      // Contratos ya activos → Empuja cobro del mes a Finanzas (idempotente).
      void Promise.all(
        list
          .filter((c) => c.estado === 'activo')
          .map((c) => ensureRealEstateContractFinance(userId, c, financeScope)),
      );
    } finally {
      setLoading(false);
    }
  }, [userId, ready, listOptions, api, propsApi, financeScope]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /** Contratos agrupados por inmueble (también los sin vínculo). */
  const contractsByPropId = useMemo(() => {
    const map = new Map<string, Contract[]>();
    for (const c of data) {
      const key = String(c.propiedadId || '').trim() || '__sin_inmueble__';
      const arr = map.get(key) || [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [data]);

  const propertiesById = useMemo(() => {
    const map = new Map<string, ReProperty>();
    for (const p of properties) map.set(p._id, p);
    return map;
  }, [properties]);

  const propertiesForBoard = useMemo(() => {
    const q = search.toLowerCase().trim();
    return properties.filter((p) => {
      if (filterPropId && p._id !== filterPropId) return false;
      if (!q) return true;
      const onProp = propertyLabel(p).toLowerCase().includes(q)
        || String(p.direccion || '').toLowerCase().includes(q)
        || String(p.referencia || '').toLowerCase().includes(q);
      if (onProp) return true;
      return (contractsByPropId.get(p._id) || []).some(
        (c) => c.referencia.toLowerCase().includes(q) || c.cliente.toLowerCase().includes(q),
      );
    });
  }, [properties, filterPropId, search, contractsByPropId]);

  const orphanContracts = useMemo(
    () => (contractsByPropId.get('__sin_inmueble__') || []).filter((c) => {
      const me = !filterEstado || c.estado === filterEstado;
      const mt = !filterTipo || c.tipo === filterTipo;
      const q = search.toLowerCase().trim();
      const ms = !q
        || c.referencia.toLowerCase().includes(q)
        || c.cliente.toLowerCase().includes(q)
        || String(c.propiedad || '').toLowerCase().includes(q);
      return me && mt && ms;
    }),
    [contractsByPropId, filterEstado, filterTipo, search],
  );

  const activos = useMemo(() => data.filter(c => c.estado === 'activo').length, [data]);
  const ingresosMensuales = useMemo(() => data.filter(c => c.estado === 'activo' && c.tipo === 'alquiler').reduce((s, c) => s + c.importeMensual, 0), [data]);
  const limiteVenc = addMonthsFromTodayISO(3);
  const hoy = todayISO();
  const proxVencimientos = useMemo(
    () => data.filter(c => c.estado === 'activo' && c.fechaFin && c.fechaFin >= hoy && c.fechaFin <= limiteVenc).length,
    [data, hoy, limiteVenc],
  );

  const selectProperty = (propiedadId: string, opts?: { seedAmounts?: boolean }) => {
    if (!propiedadId) {
      setForm((f) => ({ ...f, propiedadId: '', propiedad: '' }));
      return;
    }
    const p = propertiesById.get(propiedadId);
    if (!p) {
      setForm((f) => ({ ...f, propiedadId, propiedad: f.propiedad }));
      return;
    }
    const label = propertyLabel(p);
    const op = String(p.operacion || '').toLowerCase() === 'venta' ? 'venta' as const : 'alquiler' as const;
    const precio = Number(p.precio) || 0;
    setForm((f) => ({
      ...f,
      propiedadId,
      propiedad: label,
      tipo: op,
      ...(opts?.seedAmounts
        ? op === 'alquiler'
          ? { importeMensual: precio || f.importeMensual, importeTotal: f.importeTotal }
          : { importeTotal: precio || f.importeTotal, importeMensual: f.importeMensual }
        : {}),
    }));
  };

  const buildFormForProperty = (propiedadId: string): ContractForm => {
    const base: ContractForm = {
      ...EMPTY,
      referencia: newContractRef(),
      fechaInicio: todayISO(),
      estado: 'borrador',
    };
    const p = propertiesById.get(propiedadId);
    if (!p) return { ...base, propiedadId };
    const op = String(p.operacion || '').toLowerCase() === 'venta' ? 'venta' as const : 'alquiler' as const;
    const precio = Number(p.precio) || 0;
    return {
      ...base,
      propiedadId,
      propiedad: propertyLabel(p),
      tipo: op,
      ...(op === 'alquiler' ? { importeMensual: precio } : { importeTotal: precio }),
    };
  };

  const openCreate = (prefillPropiedadId?: string) => {
    setEditing(null);
    const seedId = String(prefillPropiedadId || filterPropId || searchParams.get('propiedadId') || '').trim();
    setForm(seedId ? buildFormForProperty(seedId) : {
      ...EMPTY,
      referencia: newContractRef(),
      fechaInicio: todayISO(),
      estado: 'borrador',
    });
    setModalOpen(true);
  };

  const openEdit = (c: Contract) => {
    setEditing(c);
    setForm({
      referencia: c.referencia,
      propiedad: c.propiedad,
      propiedadId: c.propiedadId || '',
      cliente: c.cliente,
      clienteNif: c.clienteNif || '',
      tipo: c.tipo,
      fechaInicio: c.fechaInicio,
      fechaFin: c.fechaFin,
      importeMensual: c.importeMensual,
      importeTotal: c.importeTotal,
      honorarios: Number(c.honorarios) || 0,
      estado: c.estado,
    });
    setModalOpen(true);
  };

  // Deep-link: /saas/realestate-contracts?propiedadId=…&nuevo=1
  useEffect(() => {
    const pid = String(searchParams.get('propiedadId') || '').trim();
    const nuevo = searchParams.get('nuevo') === '1';
    if (pid && pid !== filterPropId) setFilterPropId(pid);
    if (!nuevo || !ready || loading) return;
    setEditing(null);
    setForm(pid ? buildFormForProperty(pid) : {
      ...EMPTY,
      referencia: newContractRef(),
      fechaInicio: todayISO(),
      estado: 'borrador',
    });
    setModalOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('nuevo');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, loading, searchParams]);

  const handleSave = async () => {
    if (!userId || !ready) return;
    const propiedadId = String(form.propiedadId || '').trim();
    const propiedad = String(form.propiedad || '').trim()
      || (propiedadId && propertiesById.has(propiedadId) ? propertyLabel(propertiesById.get(propiedadId)!) : '');
    const cliente = String(form.cliente || '').trim();
    if (!propiedad || !cliente) {
      toast.error('Elige un inmueble y el cliente');
      return;
    }
    if (!propiedadId && properties.length > 0) {
      toast.error('Selecciona el inmueble de la cartera');
      return;
    }
    const payload = {
      ...form,
      propiedad,
      propiedadId: propiedadId || undefined,
      cliente,
      clienteNif: String(form.clienteNif || '').trim() || undefined,
      honorarios: Number(form.honorarios) || 0,
      referencia: String(form.referencia || '').trim() || newContractRef(),
      estado: form.estado || 'borrador',
    };
    try {
      let saved: Contract;
      if (editing) {
        saved = await api.update(userId, editing._id, payload, listOptions);
      } else {
        saved = await api.create(userId, payload, listOptions);
      }
      if (payload.estado === 'activo') {
        const { synced, verifactu } = await ensureRealEstateContractFinance(userId, saved, financeScope);
        if (synced) {
          toast.success(
            verifactu
              ? 'Contrato guardado · cobro en Finanzas · Verifactu emitido'
              : 'Contrato guardado · cobro registrado en Finanzas',
          );
        } else {
          toast.success(editing ? 'Contrato actualizado' : 'Contrato creado');
        }
      } else {
        toast.success(editing ? 'Contrato actualizado' : 'Contrato creado');
      }
      await loadData();
      setModalOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };

  const handleRemove = async (docId: string) => {
    if (!userId || !ready) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error shown by fetch layer */
    }
  };

  const stats = [
    { label: 'Contratos activos', value: formatNumberEs(activos, { maxFraction: 0 }), icon: <FileText className="w-5 h-5" />, color: 'text-[var(--v-blue,#2563eb)]', bg: 'bg-blue-50 dark:bg-blue-950/40' },
    { label: 'Ingresos mensuales', value: formatMoneyEs(ingresosMensuales), icon: <DollarSign className="w-5 h-5" />, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-950/40' },
    { label: 'Próx. vencimientos', value: formatNumberEs(proxVencimientos, { maxFraction: 0 }), icon: <AlertCircle className="w-5 h-5" />, color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/40' },
    { label: 'Inmuebles en cartera', value: formatNumberEs(properties.length, { maxFraction: 0 }), icon: <Home className="w-5 h-5" />, color: 'text-stone-700 dark:text-stone-200', bg: 'bg-stone-100 dark:bg-stone-800' },
  ];

  const renderContractChip = (c: Contract) => (
    <div
      key={c._id}
      className="flex items-start justify-between gap-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-800/50 px-3 py-2.5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          <span className="text-sm font-semibold text-stone-900 dark:text-stone-100 truncate">{c.referencia}</span>
          <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold capitalize ${STATUS_CFG[c.estado].bg} ${STATUS_CFG[c.estado].text}`}>
            {c.estado}
          </span>
          <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold capitalize ${
            c.tipo === 'alquiler'
              ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
              : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
          }`}>
            {c.tipo}
          </span>
        </div>
        <p className="text-xs text-stone-600 dark:text-stone-300 truncate">{c.cliente || 'Sin cliente'}</p>
        <p className="text-[11px] text-stone-400 tabular-nums mt-0.5">
          {c.fechaInicio || '—'} → {c.fechaFin || '—'}
          {' · '}
          {c.tipo === 'alquiler' && c.importeMensual
            ? `${formatMoneyEs(c.importeMensual)}/mes`
            : formatMoneyEs(c.importeTotal)}
        </p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => openEdit(c)}
          className="p-2 rounded-lg hover:bg-white dark:hover:bg-stone-700 text-stone-500"
          title="Editar"
        >
          <Edit3 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => void handleRemove(c._id)}
          className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-500"
          title="Eliminar"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <Layout title="Contratos">
      <div className="space-y-6">
        <RealEstateNav active="contracts" />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className={`${s.bg} rounded-2xl p-4 flex items-center gap-3 min-h-[4.5rem] border border-transparent dark:border-stone-700/40`}>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 dark:bg-black/20 ${s.color}`}>{s.icon}</div>
              <div className="min-w-0">
                <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">{s.label}</p>
                <p className={`text-lg font-bold tabular-nums leading-tight ${s.color}`}>{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar inmueble, cliente o referencia…"
              disabled={loading}
              className="w-full h-10 pl-10 pr-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-stone-100"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value as TipoContrato | '')}
              disabled={loading}
              className="h-10 px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm dark:text-stone-100"
            >
              <option value="">Tipo</option>
              {TIPOS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value as EstadoContrato | '')}
              disabled={loading}
              className="h-10 px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm dark:text-stone-100"
            >
              <option value="">Estado</option>
              {ESTADOS.map((e) => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
            </select>
            <AddButtonDropdown
              label="Nuevo contrato"
              onQuickAdd={() => openCreate()}
              onImport={() => setShowImportModal(true)}
              quickAddLabel="Alta rápida"
              quickAddDesc="Formulario de contrato"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-stone-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            Cargando inmuebles y contratos…
          </div>
        ) : properties.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-6 py-12 text-center space-y-3">
            <Building2 className="w-8 h-8 mx-auto text-stone-400" />
            <p className="text-sm text-stone-600 dark:text-stone-300">
              Primero crea inmuebles en cartera para vincular contratos.
            </p>
            <button
              type="button"
              onClick={() => navigate('/saas/realestate-properties')}
              className={`${VERTIAL_BTN_PRIMARY} !min-h-10 !px-4 mx-auto`}
            >
              Ir a Propiedades
            </button>
          </div>
        ) : (
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-stone-900 dark:text-stone-50">Por inmueble</h2>
                <p className="text-xs text-stone-500">
                  {formatNumberEs(propertiesForBoard.length, { maxFraction: 0 })} inmueble
                  {propertiesForBoard.length === 1 ? '' : 's'} · contratos de cada uno o ninguno
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {propertiesForBoard.map((p) => {
                const cover = normalizeFotos(p.fotos)[0];
                const linked = (contractsByPropId.get(p._id) || []).filter((c) => {
                  const me = !filterEstado || c.estado === filterEstado;
                  const mt = !filterTipo || c.tipo === filterTipo;
                  const q = search.toLowerCase().trim();
                  const ms = !q
                    || c.referencia.toLowerCase().includes(q)
                    || c.cliente.toLowerCase().includes(q)
                    || propertyLabel(p).toLowerCase().includes(q);
                  return me && mt && ms;
                });
                return (
                  <article
                    key={p._id}
                    className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row">
                      <button
                        type="button"
                        onClick={() => navigate(`/saas/realestate-properties?propiedadId=${encodeURIComponent(p._id)}`)}
                        className="relative sm:w-44 shrink-0 aspect-[5/4] sm:aspect-auto sm:min-h-[9rem] bg-stone-100 dark:bg-stone-800 overflow-hidden text-left"
                      >
                        {cover ? (
                          <AuthImage src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full min-h-[9rem] flex flex-col items-center justify-center gap-1 text-stone-400">
                            <Camera className="w-6 h-6" />
                            <span className="text-[10px] font-medium">Sin foto</span>
                          </div>
                        )}
                      </button>

                      <div className="flex-1 min-w-0 p-4 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-stone-900 dark:text-stone-50 line-clamp-2">
                              {p.direccion || p.referencia || 'Sin dirección'}
                            </p>
                            <p className="text-[11px] text-stone-500 mt-0.5 truncate">
                              {p.referencia || 'Sin ref.'}
                              {p.operacion ? ` · ${p.operacion}` : ''}
                              {p.estado ? ` · ${p.estado}` : ''}
                              {p.precio ? ` · ${formatMoneyEs(p.precio)}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => navigate(`/saas/realestate-properties?propiedadId=${encodeURIComponent(p._id)}`)}
                              className={`${VERTIAL_BTN_SECONDARY} !min-h-9 !px-3 !text-xs`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Ver ficha
                            </button>
                            <button
                              type="button"
                              onClick={() => openCreate(p._id)}
                              className={`${VERTIAL_BTN_PRIMARY} !min-h-9 !px-3 !text-xs`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Contrato
                            </button>
                          </div>
                        </div>

                        {linked.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-stone-200 dark:border-stone-700 px-3 py-4 text-center">
                            <p className="text-sm text-stone-400 italic">Ningún contrato</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                              {formatNumberEs(linked.length, { maxFraction: 0 })} contrato
                              {linked.length === 1 ? '' : 's'}
                            </p>
                            {linked.map(renderContractChip)}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}

              {orphanContracts.length > 0 ? (
                <article className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-600 bg-stone-50 dark:bg-stone-900/60 p-4 space-y-3">
                  <div>
                    <p className="text-sm font-bold text-stone-800 dark:text-stone-100">Sin inmueble vinculado</p>
                    <p className="text-xs text-stone-500">Contratos antiguos o sin cartera</p>
                  </div>
                  <div className="space-y-2">
                    {orphanContracts.map(renderContractChip)}
                  </div>
                </article>
              ) : null}

              {propertiesForBoard.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-600 px-6 py-10 text-center text-sm text-stone-400">
                  Ningún inmueble coincide con la búsqueda
                </div>
              ) : null}
            </div>
          </section>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Contrato' : 'Nuevo Contrato'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Inmueble <span className="text-red-400">*</span>
                </label>
                <select
                  value={form.propiedadId || ''}
                  onChange={(e) => selectProperty(e.target.value, { seedAmounts: !editing })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Selecciona inmueble de cartera…</option>
                  {properties.map((p) => (
                    <option key={p._id} value={p._id}>{propertyLabel(p)}</option>
                  ))}
                </select>
                {properties.length === 0 ? (
                  <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
                    No hay inmuebles.{' '}
                    <button type="button" className="underline font-semibold" onClick={() => navigate('/saas/realestate-properties')}>
                      Crear inmueble
                    </button>
                  </p>
                ) : null}
              </div>
              {([
                { key: 'referencia', label: 'Referencia', type: 'text' },
                { key: 'cliente', label: 'Cliente', type: 'text' },
                { key: 'clienteNif', label: 'NIF cliente (Verifactu)', type: 'text' },
                { key: 'fechaInicio', label: 'Fecha inicio', type: 'date' },
                { key: 'fechaFin', label: 'Fecha fin', type: 'date' },
                { key: 'importeMensual', label: 'Importe mensual (€)', type: 'number' },
                { key: 'importeTotal', label: 'Importe total (€)', type: 'number' },
                { key: 'honorarios', label: 'Honorarios agencia (€, IVA incl.)', type: 'number' },
              ] as const).map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                  <input type={f.type} value={(form as Record<string, string | number>)[f.key]} onChange={e => setForm((prev) => ({ ...prev, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ))}
              <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
                Al elegir inmueble se rellenan tipo e importe desde la ficha. Honorarios = 0: alquiler → renta mensual; venta → total. Activo → Finanzas.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                <select value={form.tipo} onChange={e => setForm((f) => ({ ...f, tipo: e.target.value as TipoContrato }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                  {TIPOS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                <select value={form.estado} onChange={e => setForm((f) => ({ ...f, estado: e.target.value as EstadoContrato }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                  {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Contratos"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
