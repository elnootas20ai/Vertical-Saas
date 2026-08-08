import { useState, useMemo, useCallback, useEffect } from 'react';
import { Layout } from '../../components/saas/Layout';
import { RealEstateNav } from '../../components/saas/RealEstateNav';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useRealEstateScope } from '../../lib/realEstateScope';
import { useBusiness } from '../../context/BusinessContext';
import { useAuth } from '../../context/AuthContext';
import {
  listTeamAgentOptions,
  resolveTeamAgent,
  visitBelongsToAgent,
} from '../../lib/realEstateTeamAgents';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, X, Edit3, Trash2, Clock, Loader2, Building2,
  MapPin, Calendar, ChevronRight, Plus, Phone, Home,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr } from '../../lib/bulkVerticalImport';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  RE_SITUACION_LABEL,
  RE_SIGUIENTE_ACCION_LABEL,
  RE_TIPO_VISITA_LABEL,
  situacionToResultado,
  type ReSituacion,
  type ReSiguienteAccion,
  type ReTipoVisita,
} from '../../verticals/realEstate';
import { listClientsRequest } from '../../lib/crmApi';
import { NuevoClienteModal } from '../../components/saas/NuevoClienteModal';
import type { Client } from '../../context/AppContext';
import { resolveBusinessDataUserId } from '../../lib/tenantUserId';
import { resolveBusinessScopeId } from '../../lib/deliverySetup';
import { formatMoneyEs } from '../../lib/formatNumberEs';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';

type Resultado = 'interesado' | 'oferta' | 'descartado' | 'pendiente';

interface Visit extends VerticalEntity {
  propiedad: string;
  propiedadId?: string;
  direccion?: string;
  cliente: string;
  clientId?: string;
  telefono?: string;
  email?: string;
  fecha: string;
  hora: string;
  agente: string;
  agenteUserId?: string;
  tipoVisita?: string;
  situacion?: string;
  resultado: Resultado;
  siguienteAccion?: string;
  fechaSeguimiento?: string;
  notas: string;
}

interface ReProperty extends VerticalEntity {
  referencia?: string;
  direccion?: string;
  operacion?: string;
  estado?: string;
  precio?: number;
  tipo?: string;
}

type VisitForm = {
  propiedadId: string;
  propiedad: string;
  direccion: string;
  cliente: string;
  clientId: string;
  telefono: string;
  email: string;
  fecha: string;
  hora: string;
  agente: string;
  agenteUserId: string;
  tipoVisita: ReTipoVisita;
  situacion: ReSituacion;
  resultado: Resultado;
  siguienteAccion: ReSiguienteAccion;
  fechaSeguimiento: string;
  notas: string;
};

const RES_CFG: Record<Resultado, { bg: string; text: string }> = {
  interesado: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  oferta:     { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  descartado: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300' },
  pendiente:  { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
};

const RESULTADOS: Resultado[] = ['interesado', 'oferta', 'descartado', 'pendiente'];
const TIPOS: ReTipoVisita[] = ['programada', 'captacion', 'seguimiento'];
const SITUACIONES_PUERTA: ReSituacion[] = [
  'nadie', 'hablo', 'interesado', 'no_interesado', 'segunda_visita', 'pendiente_doc',
];
const NEXT_ACTIONS: Exclude<ReSiguienteAccion, ''>[] = ['llamar', 'segunda_visita', 'descartar'];

const EMPTY: VisitForm = {
  propiedadId: '',
  propiedad: '',
  direccion: '',
  cliente: '',
  clientId: '',
  telefono: '',
  email: '',
  fecha: '',
  hora: '',
  agente: '',
  agenteUserId: '',
  tipoVisita: 'programada',
  situacion: 'pendiente',
  resultado: 'pendiente',
  siguienteAccion: '',
  fechaSeguimiento: '',
  notas: '',
};

function propertyLabel(p: ReProperty): string {
  const addr = String(p.direccion || '').trim();
  const ref = String(p.referencia || '').trim();
  if (addr && ref) return `${addr} · ${ref}`;
  return addr || ref || p._id;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function visitLabel(v: Visit): string {
  return String(v.direccion || v.propiedad || '').trim() || '—';
}

export function RealEstateVisits() {
  const { userId, listOptions, ready } = useRealEstateScope();
  const { currentBusiness } = useBusiness();
  const { user: authUser, listUsers } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const api = useMemo(() => createVerticalApi<Visit>('realestate', 'visits'), []);
  const propsApi = useMemo(() => createVerticalApi<ReProperty>('realestate', 'properties'), []);
  const crmDataUserId = useMemo(
    () => resolveBusinessDataUserId(authUser, currentBusiness),
    [authUser, currentBusiness],
  );
  const crmBusinessId = useMemo(
    () => resolveBusinessScopeId(currentBusiness),
    [currentBusiness],
  );

  const [data, setData] = useState<Visit[]>([]);
  const [properties, setProperties] = useState<ReProperty[]>([]);
  const [crmClients, setCrmClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRes, setFilterRes] = useState<Resultado | ''>('');
  const [filterPropId, setFilterPropId] = useState('');
  const [filterAgentId, setFilterAgentId] = useState('');
  const [onlyFollowUp, setOnlyFollowUp] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Visit | null>(null);
  const [form, setForm] = useState<VisitForm>(EMPTY);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  /** Tablero por inmueble (trabajo) vs historial de visitas. */
  const [listView, setListView] = useState<'board' | 'historial'>('board');
  const [accountDirectory, setAccountDirectory] = useState<
    { user_id?: string; fullName?: string; name?: string; email?: string }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    void listUsers()
      .then((users) => {
        if (!cancelled && Array.isArray(users)) setAccountDirectory(users as typeof accountDirectory);
      })
      .catch(() => {
        if (!cancelled) setAccountDirectory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [listUsers]);

  const agents = useMemo(
    () => listTeamAgentOptions(currentBusiness?.members, accountDirectory),
    [currentBusiness?.members, accountDirectory],
  );

  const selectAgent = (agenteUserId: string) => {
    const agent = resolveTeamAgent(agents, { userId: agenteUserId });
    setForm((f) => ({
      ...f,
      agenteUserId: agent?.userId || '',
      agente: agent?.name || '',
    }));
  };

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'property', label: 'Inmueble', example: '' },
    { key: 'client', label: 'Cliente', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'time', label: 'Hora', example: '' },
    { key: 'agent', label: 'Agente', example: '' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId || !ready) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
      const propiedad = entryStr(e, 'propiedad', 'property', 'direccion', 'address');
      if (!propiedad) return null;
      const agentName = entryStr(e, 'agente', 'agent') || '';
      const agent = resolveTeamAgent(agents, { name: agentName });
      return {
        propiedad,
        direccion: propiedad,
        cliente: entryStr(e, 'cliente', 'client') || '',
        fecha: entryStr(e, 'fecha', 'date') || todayISO(),
        hora: entryStr(e, 'hora', 'time') || '',
        agente: agent?.name || agentName,
        ...(agent?.userId ? { agenteUserId: agent.userId } : {}),
        tipoVisita: 'programada',
        situacion: 'pendiente',
        resultado: entryStr(e, 'resultado') || 'pendiente',
        notas: entryStr(e, 'notas', 'notes', 'description') || '',
      };
    }, listOptions);
    if (created > 0) {
      await loadData();
      toast.success(`${created} visita(s) creada(s)`);
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
      if (!ready) {
        toast.error('Empresa no lista: selecciona una inmobiliaria activa');
      }
      return;
    }
    setLoading(true);
    try {
      const [visitsRes, propsRes] = await Promise.allSettled([
        api.list(userId, listOptions),
        propsApi.list(userId, listOptions),
      ]);
      if (visitsRes.status === 'fulfilled') {
        setData(visitsRes.value);
      } else {
        setData([]);
        toast.error(visitsRes.reason instanceof Error ? visitsRes.reason.message : 'Error cargando visitas');
      }
      if (propsRes.status === 'fulfilled') {
        setProperties(propsRes.value);
      } else {
        setProperties([]);
        toast.error(propsRes.reason instanceof Error ? propsRes.reason.message : 'Error cargando propiedades');
      }
    } finally {
      setLoading(false);
    }
  }, [userId, ready, listOptions, api, propsApi]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const loadCrmClients = useCallback(async () => {
    if (!crmDataUserId || !crmBusinessId) {
      setCrmClients([]);
      return;
    }
    try {
      const list = await listClientsRequest(crmDataUserId, { businessId: crmBusinessId });
      setCrmClients(list);
    } catch {
      setCrmClients([]);
    }
  }, [crmDataUserId, crmBusinessId]);

  useEffect(() => {
    void loadCrmClients();
  }, [loadCrmClients]);

  const hoy = todayISO();

  const propertiesById = useMemo(() => {
    const map = new Map<string, ReProperty>();
    for (const p of properties) map.set(p._id, p);
    return map;
  }, [properties]);

  const filtered = useMemo(() => data.filter((v) => {
    const label = visitLabel(v).toLowerCase();
    const cliente = String(v.cliente || '').toLowerCase();
    const tel = String(v.telefono || '').toLowerCase();
    const q = search.toLowerCase();
    const prop = v.propiedadId ? propertiesById.get(v.propiedadId) : undefined;
    const propText = prop ? propertyLabel(prop).toLowerCase() : '';
    const ms = !q
      || label.includes(q)
      || cliente.includes(q)
      || tel.includes(q)
      || propText.includes(q)
      || String(v.agente || '').toLowerCase().includes(q);
    const mr = !filterRes || v.resultado === filterRes;
    const mp = !filterPropId || v.propiedadId === filterPropId;
    const fs = String(v.fechaSeguimiento || '').slice(0, 10);
    const follow = !onlyFollowUp || (Boolean(fs) && fs <= hoy && v.resultado !== 'descartado');
    const ma = !filterAgentId || visitBelongsToAgent(v, filterAgentId)
      || (!v.agenteUserId && String(v.agente || '').toLowerCase()
        === String(agents.find((a) => a.userId === filterAgentId)?.name || '').toLowerCase());
    return ms && mr && mp && follow && ma;
  }), [data, search, filterRes, filterPropId, filterAgentId, onlyFollowUp, hoy, propertiesById, agents]);

  const selectProperty = (propiedadId: string) => {
    if (!propiedadId) {
      setForm((f) => ({ ...f, propiedadId: '', propiedad: f.direccion, direccion: f.direccion }));
      return;
    }
    const p = propertiesById.get(propiedadId);
    const addr = String(p?.direccion || '').trim();
    setForm((f) => ({
      ...f,
      propiedadId,
      direccion: addr || f.direccion,
      propiedad: addr || f.propiedad,
    }));
  };

  const selectCrmClient = (clientId: string) => {
    if (!clientId) {
      setForm((f) => ({ ...f, clientId: '', cliente: '', telefono: '', email: '' }));
      return;
    }
    const c = crmClients.find((x) => x.id === clientId);
    if (!c) {
      setForm((f) => ({ ...f, clientId }));
      return;
    }
    setForm((f) => ({
      ...f,
      clientId: c.id,
      cliente: c.name || '',
      telefono: c.phone || '',
      email: c.email || '',
    }));
  };

  const selfAgent = useMemo(() => {
    const selfId = String(authUser?.user_id || '').trim().replace(/^account:/, '');
    return resolveTeamAgent(agents, { userId: selfId });
  }, [authUser?.user_id, agents]);

  const openCreate = (prefillClientId?: string) => {
    setEditing(null);
    const base: VisitForm = {
      ...EMPTY,
      fecha: hoy,
      hora: new Date().toTimeString().slice(0, 5),
      agenteUserId: selfAgent?.userId || '',
      agente: selfAgent?.name || '',
      tipoVisita: 'programada',
    };
    const cid = String(prefillClientId || '').trim();
    if (cid) {
      const c = crmClients.find((x) => x.id === cid);
      setForm({
        ...base,
        clientId: cid,
        cliente: c?.name || '',
        telefono: c?.phone || '',
        email: c?.email || '',
      });
    } else {
      setForm(base);
    }
    setModalOpen(true);
  };

  const openEdit = (v: Visit) => {
    setEditing(v);
    setForm({
      propiedadId: v.propiedadId || '',
      propiedad: v.propiedad || '',
      direccion: v.direccion || v.propiedad || '',
      cliente: v.cliente || '',
      clientId: v.clientId || '',
      telefono: v.telefono || '',
      email: v.email || '',
      fecha: v.fecha || '',
      hora: v.hora || '',
      agente: v.agente || '',
      agenteUserId: v.agenteUserId || '',
      tipoVisita: (v.tipoVisita as ReTipoVisita) || 'programada',
      situacion: (v.situacion as ReSituacion) || 'pendiente',
      resultado: v.resultado || 'pendiente',
      siguienteAccion: (v.siguienteAccion as ReSiguienteAccion) || '',
      fechaSeguimiento: String(v.fechaSeguimiento || '').slice(0, 10),
      notas: v.notas || '',
    });
    setModalOpen(true);
  };

  /** Visita / seguimiento desde un inmueble de cartera. */
  const openVisitForProperty = (p: ReProperty, existing?: Visit | null) => {
    if (existing) {
      openEdit(existing);
      return;
    }
    setEditing(null);
    setForm({
      ...EMPTY,
      fecha: hoy,
      hora: new Date().toTimeString().slice(0, 5),
      propiedadId: p._id,
      direccion: String(p.direccion || '').trim(),
      propiedad: String(p.direccion || '').trim(),
      agenteUserId: selfAgent?.userId || '',
      agente: selfAgent?.name || '',
      tipoVisita: 'programada',
      situacion: 'pendiente',
      resultado: 'pendiente',
      siguienteAccion: '',
    });
    setFilterPropId(p._id);
    setModalOpen(true);
  };

  // Deep-link: /saas/realestate-visits?clientId=…&nuevo=1
  useEffect(() => {
    const nuevo = searchParams.get('nuevo') === '1';
    const cid = String(searchParams.get('clientId') || '').trim();
    if (!nuevo || !ready || loading) return;
    openCreate(cid || undefined);
    const next = new URLSearchParams(searchParams);
    next.delete('nuevo');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, loading, searchParams]);

  // Si el CRM carga después del deep-link, rellena nombre/teléfono.
  useEffect(() => {
    if (!modalOpen || !form.clientId || form.cliente) return;
    const c = crmClients.find((x) => x.id === form.clientId);
    if (c) selectCrmClient(c.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crmClients, modalOpen, form.clientId, form.cliente]);

  const applySituacion = (sit: ReSituacion) => {
    setForm((f) => ({
      ...f,
      situacion: sit,
      resultado: (f.siguienteAccion === 'descartar' ? 'descartado' : situacionToResultado(sit)) as Resultado,
    }));
  };

  const applySiguienteAccion = (next: ReSiguienteAccion) => {
    setForm((f) => {
      let fechaSeguimiento = f.fechaSeguimiento;
      let resultado = f.resultado;
      if (next === 'descartar') {
        fechaSeguimiento = '';
        resultado = 'descartado';
      } else if (next === 'llamar' || next === 'segunda_visita') {
        resultado = situacionToResultado(f.situacion) as Resultado;
        if (!fechaSeguimiento) {
          const d = new Date();
          d.setDate(d.getDate() + (next === 'segunda_visita' ? 3 : 1));
          fechaSeguimiento = d.toISOString().slice(0, 10);
        }
      }
      return { ...f, siguienteAccion: next, fechaSeguimiento, resultado };
    });
  };

  const handleSave = async () => {
    if (!userId || !ready) return;
    const addr = String(form.direccion || form.propiedad || '').trim();
    if (!addr || !form.fecha) {
      toast.error('Dirección y fecha son obligatorias');
      return;
    }
    if (!form.agenteUserId) {
      toast.error('Elige un agente del Equipo');
      return;
    }
    const agent = resolveTeamAgent(agents, { userId: form.agenteUserId });
    const next = form.siguienteAccion;
    let fechaSeguimiento = String(form.fechaSeguimiento || '').slice(0, 10);
    let resultado = form.resultado;
    if (next === 'descartar') {
      fechaSeguimiento = '';
      resultado = 'descartado';
    } else if (form.situacion && form.situacion !== 'pendiente') {
      resultado = (next === 'descartar' ? 'descartado' : situacionToResultado(form.situacion)) as Resultado;
      if ((next === 'llamar' || next === 'segunda_visita') && !fechaSeguimiento) {
        const d = new Date();
        d.setDate(d.getDate() + (next === 'segunda_visita' ? 3 : 1));
        fechaSeguimiento = d.toISOString().slice(0, 10);
      }
    }
    const payload = {
      ...form,
      propiedad: addr,
      direccion: addr,
      propiedadId: form.propiedadId || undefined,
      clientId: form.clientId || undefined,
      cliente: String(form.cliente || '').trim(),
      agenteUserId: form.agenteUserId,
      agente: agent?.name || form.agente,
      resultado,
      fechaSeguimiento: fechaSeguimiento || undefined,
      tipoVisita: editing
        ? (form.tipoVisita === 'programada' ? 'seguimiento' : form.tipoVisita)
        : form.tipoVisita,
    };
    try {
      if (editing) {
        await api.update(userId, editing._id, payload, listOptions);
      } else {
        await api.create(userId, payload, listOptions);
      }
      await loadData();
      setModalOpen(false);
      setListView('board');
      toast.success(editing ? 'Seguimiento actualizado' : 'Visita registrada');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };

  type PropBoardRow = {
    property: ReProperty;
    visits: Visit[];
    last: Visit | null;
    needsFollowUp: boolean;
    neverVisited: boolean;
  };

  const propertyBoard = useMemo((): PropBoardRow[] => {
    const q = search.toLowerCase().trim();
    return properties
      .filter((p) => {
        if (filterPropId && p._id !== filterPropId) return false;
        if (!q) return true;
        return (
          String(p.direccion || '').toLowerCase().includes(q)
          || String(p.referencia || '').toLowerCase().includes(q)
          || String(p.operacion || '').toLowerCase().includes(q)
        );
      })
      .map((p) => {
        const visits = data
          .filter((v) => v.propiedadId === p._id)
          .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
        const last = visits[0] || null;
        const fs = String(last?.fechaSeguimiento || '').slice(0, 10);
        const needsFollowUp = Boolean(
          last
          && fs
          && fs <= hoy
          && last.resultado !== 'descartado'
          && last.siguienteAccion !== 'descartar',
        );
        return {
          property: p,
          visits,
          last,
          needsFollowUp,
          neverVisited: visits.length === 0,
        };
      })
      .sort((a, b) => {
        if (a.needsFollowUp !== b.needsFollowUp) return a.needsFollowUp ? -1 : 1;
        if (a.neverVisited !== b.neverVisited) return a.neverVisited ? -1 : 1;
        return String(a.property.direccion || '').localeCompare(String(b.property.direccion || ''), 'es');
      });
  }, [properties, data, search, filterPropId, hoy]);

  const followUpCount = useMemo(
    () => propertyBoard.filter((r) => r.needsFollowUp).length,
    [propertyBoard],
  );
  const neverVisitedCount = useMemo(
    () => propertyBoard.filter((r) => r.neverVisited).length,
    [propertyBoard],
  );

  const handleRemove = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar');
    }
  };

  const createPropertyFromVisit = async (v: Visit) => {
    if (!userId || !ready) return;
    const direccion = visitLabel(v);
    if (!direccion || direccion === '—') {
      toast.error('La visita no tiene dirección');
      return;
    }
    try {
      await propsApi.create(userId, {
        referencia: `REF-${Date.now().toString(36).toUpperCase()}`,
        tipo: 'piso',
        direccion,
        m2: 0,
        habitaciones: 0,
        precio: 0,
        operacion: 'venta',
        estado: 'disponible',
      }, listOptions);
      toast.success('Propiedad creada desde la visita');
      navigate('/saas/realestate-properties');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear la propiedad');
    }
  };

  return (
    <Layout title="Visitas">
      <div className="space-y-6">
        <RealEstateNav active="visits" />

        {!ready && !loading ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            No hay empresa inmobiliaria activa. Elige la empresa en el selector superior.
          </div>
        ) : null}

        {properties.length === 0 && ready && !loading ? (
          <div className="rounded-xl border border-dashed border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-4 py-3 text-sm text-stone-600 dark:text-stone-300 flex flex-wrap items-center justify-between gap-3">
            <span>No hay propiedades en cartera. Créalas para vincular visitas a inmuebles.</span>
            <button
              type="button"
              onClick={() => navigate('/saas/realestate-properties')}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-[var(--v-blue,#2563eb)] text-white text-sm font-medium"
            >
              <Building2 className="w-4 h-4" />
              Ir a Propiedades
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-stone-200 dark:border-stone-700 p-0.5 bg-white dark:bg-stone-900">
              <button
                type="button"
                onClick={() => setListView('board')}
                className={`px-3 py-2 text-xs font-semibold rounded-[10px] transition-colors ${
                  listView === 'board'
                    ? 'bg-[var(--v-blue,#2563eb)] text-white'
                    : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                Seguimiento inmuebles
              </button>
              <button
                type="button"
                onClick={() => setListView('historial')}
                className={`px-3 py-2 text-xs font-semibold rounded-[10px] transition-colors ${
                  listView === 'historial'
                    ? 'bg-[var(--v-blue,#2563eb)] text-white'
                    : 'text-stone-600 dark:text-stone-400'
                }`}
              >
                Historial visitas
              </button>
            </div>
            {properties.length > 0 ? (
              <p className="text-xs text-stone-500">
                {followUpCount > 0 ? `${followUpCount} con seguimiento pendiente · ` : ''}
                {neverVisitedCount > 0 ? `${neverVisitedCount} sin visitar · ` : ''}
                {properties.length} en cartera
              </p>
            ) : null}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <div className="relative flex-1 min-w-[12rem] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={listView === 'board' ? 'Buscar dirección o referencia…' : 'Buscar visita, cliente…'}
                disabled={loading}
                className="w-full h-10 pl-10 pr-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-gray-100"
              />
            </div>
            {listView === 'historial' ? (
              <>
                <select
                  value={filterAgentId}
                  onChange={(e) => setFilterAgentId(e.target.value)}
                  disabled={loading || agents.length === 0}
                  className="h-10 max-w-[12rem] px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100"
                >
                  <option value="">Todos los agentes</option>
                  {agents.map((a) => (
                    <option key={a.userId} value={a.userId}>{a.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setOnlyFollowUp((v) => !v)}
                  className={`h-10 px-3 rounded-xl border text-sm font-medium ${
                    onlyFollowUp
                      ? 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600'
                  }`}
                >
                  Pendientes seguimiento
                </button>
              </>
            ) : (
              <select
                value={filterPropId}
                onChange={(e) => setFilterPropId(e.target.value)}
                disabled={loading || properties.length === 0}
                className="h-10 max-w-[14rem] px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm dark:text-gray-100"
              >
                <option value="">Todos los inmuebles</option>
                {properties.map((p) => (
                  <option key={p._id} value={p._id}>{propertyLabel(p)}</option>
                ))}
              </select>
            )}
            <AddButtonDropdown
              label="Nueva Visita"
              onQuickAdd={() => openCreate()}
              onImport={() => setShowImportModal(true)}
              quickAddLabel="Alta rápida"
              quickAddDesc="Visita sin inmueble o captación"
            />
          </div>
        </div>

        {listView === 'board' ? (
          <section className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                  Cartera a visitar
                </h2>
                <p className="text-xs text-stone-500">
                  Toca un inmueble, registra qué pasó en la puerta y el siguiente paso.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/saas/realestate-properties')}
                className="text-xs font-semibold text-[var(--v-blue,#2563eb)] hover:underline shrink-0"
              >
                Gestionar propiedades
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-stone-500 text-sm">
                <Loader2 className="w-5 h-5 animate-spin" />
                Cargando cartera…
              </div>
            ) : propertyBoard.length === 0 ? (
              <div className="px-4 py-12 text-center space-y-3">
                <Home className="w-8 h-8 mx-auto text-stone-300" />
                <p className="text-sm text-stone-500">
                  {properties.length === 0
                    ? 'Aún no hay inmuebles. Crea propiedades para hacer el seguimiento aquí.'
                    : 'Ningún inmueble coincide con la búsqueda.'}
                </p>
                {properties.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => navigate('/saas/realestate-properties')}
                    className={VERTIAL_BTN_PRIMARY}
                  >
                    <Building2 className="w-4 h-4" />
                    Ir a Propiedades
                  </button>
                ) : null}
              </div>
            ) : (
              <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                {propertyBoard.map((row) => {
                  const p = row.property;
                  const last = row.last;
                  const sit = (last?.situacion || '') as ReSituacion;
                  const next = String(last?.siguienteAccion || '') as Exclude<ReSiguienteAccion, ''> | '';
                  return (
                    <li key={p._id} className="p-4 hover:bg-stone-50/80 dark:hover:bg-stone-800/40 transition-colors">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {row.needsFollowUp ? (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 px-2 py-0.5 text-[11px] font-bold">
                                <Phone className="w-3 h-3" />
                                Seguimiento hoy
                              </span>
                            ) : row.neverVisited ? (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200 px-2 py-0.5 text-[11px] font-bold">
                                Sin visita
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 px-2 py-0.5 text-[11px] font-semibold capitalize">
                                {last?.resultado || 'visitado'}
                              </span>
                            )}
                            <span className="text-[11px] text-stone-400 capitalize">
                              {p.operacion || '—'} · {p.estado || '—'}
                            </span>
                          </div>
                          <p className="text-base font-semibold text-stone-900 dark:text-stone-50 flex items-start gap-1.5 leading-snug">
                            <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-stone-400" />
                            <span>{String(p.direccion || p.referencia || 'Sin dirección')}</span>
                          </p>
                          <p className="text-xs text-stone-500 pl-5">
                            {p.referencia || 'Sin ref.'}
                            {p.precio ? ` · ${formatMoneyEs(p.precio)}` : ''}
                            {p.operacion === 'alquiler' && p.precio ? '/mes' : ''}
                            {' · '}
                            {row.visits.length} visita{row.visits.length === 1 ? '' : 's'}
                          </p>
                          {last ? (
                            <p className="text-xs text-stone-600 dark:text-stone-300 pl-5">
                              Última: {last.fecha}
                              {sit ? ` · ${RE_SITUACION_LABEL[sit] || sit}` : ''}
                              {last.cliente ? ` · ${last.cliente}` : ''}
                              {next ? ` · ${RE_SIGUIENTE_ACCION_LABEL[next] || next}` : ''}
                              {last.fechaSeguimiento
                                ? ` · seguir ${String(last.fechaSeguimiento).slice(0, 10)}`
                                : ''}
                              {last.notas ? (
                                <span className="block mt-0.5 text-stone-400 line-clamp-1">
                                  {last.notas}
                                </span>
                              ) : null}
                            </p>
                          ) : (
                            <p className="text-xs text-stone-400 pl-5">
                              Todavía no hay visita registrada en este inmueble.
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {row.needsFollowUp && last ? (
                            <button
                              type="button"
                              onClick={() => openVisitForProperty(p, last)}
                              className={VERTIAL_BTN_PRIMARY + ' !min-h-10 !text-sm'}
                            >
                              Continuar seguimiento
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openVisitForProperty(p)}
                              className={VERTIAL_BTN_PRIMARY + ' !min-h-10 !text-sm'}
                            >
                              <Plus className="w-4 h-4" />
                              Hacer visita
                            </button>
                          )}
                          {last && !row.needsFollowUp ? (
                            <button
                              type="button"
                              onClick={() => openVisitForProperty(p, last)}
                              className={VERTIAL_BTN_SECONDARY + ' !min-h-10 !text-sm'}
                            >
                              Ver última
                            </button>
                          ) : null}
                          {row.visits.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setFilterPropId(p._id);
                                setListView('historial');
                              }}
                              className="text-xs font-semibold text-stone-500 hover:text-[var(--v-blue,#2563eb)] px-2"
                            >
                              Historial
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3 font-medium">Propiedad / dirección</th>
                  <th className="px-4 py-3 font-medium">Cliente / contacto</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">Agente</th>
                  <th className="px-4 py-3 font-medium">Situación</th>
                  <th className="px-4 py-3 font-medium">Resultado</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Seguimiento</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Cargando visitas…
                      </span>
                    </td>
                  </tr>
                ) : filtered.map((v) => {
                  const sit = (v.situacion || 'pendiente') as ReSituacion;
                  const next = String(v.siguienteAccion || '') as Exclude<ReSiguienteAccion, ''> | '';
                  const linked = v.propiedadId ? propertiesById.get(v.propiedadId) : undefined;
                  return (
                    <tr key={v._id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                        <div>{linked ? String(linked.direccion || visitLabel(v)) : visitLabel(v)}</div>
                        <div className="text-[10px] text-gray-400">
                          {linked?.referencia ? `${linked.referencia} · ` : ''}
                          {RE_TIPO_VISITA_LABEL[(v.tipoVisita as ReTipoVisita) || 'programada'] || v.tipoVisita}
                          {linked?.operacion ? ` · ${linked.operacion}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        <div>{v.cliente || '—'}</div>
                        {v.telefono ? <div className="text-[11px] text-gray-400">{v.telefono}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {v.fecha}
                        {v.hora ? <span className="ml-1 inline-flex items-center gap-0.5 text-[11px]"><Clock className="w-3 h-3" />{v.hora}</span> : null}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">
                        {v.agente || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-gray-700 dark:text-gray-200">
                        {RE_SITUACION_LABEL[sit] || sit}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${RES_CFG[v.resultado]?.bg || ''} ${RES_CFG[v.resultado]?.text || ''}`}>
                          {v.resultado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell text-xs">
                        {v.fechaSeguimiento ? String(v.fechaSeguimiento).slice(0, 10) : '—'}
                        {next ? ` · ${RE_SIGUIENTE_ACCION_LABEL[next] || next}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {(v.situacion === 'interesado' || v.resultado === 'interesado') && !v.propiedadId ? (
                          <button
                            type="button"
                            title="Crear propiedad"
                            onClick={() => void createPropertyFromVisit(v)}
                            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600"
                          >
                            <Building2 className="w-4 h-4" />
                          </button>
                        ) : null}
                        <button type="button" onClick={() => openEdit(v)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => void handleRemove(v._id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center">
                      <p className="text-sm text-stone-500 mb-3">No hay visitas en este filtro.</p>
                      <button
                        type="button"
                        onClick={() => setListView('board')}
                        className={VERTIAL_BTN_PRIMARY + ' !min-h-10'}
                      >
                        <Home className="w-4 h-4" />
                        Ir al seguimiento de inmuebles
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editing ? 'Seguimiento de visita' : 'Registrar visita'}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Qué pasó en la puerta, contacto y siguiente paso.
                </p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <section className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Inmueble</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Propiedad (cartera)</label>
                  <select
                    value={form.propiedadId}
                    onChange={(e) => selectProperty(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Sin vincular / dirección libre</option>
                    {properties.map((p) => (
                      <option key={p._id} value={p._id}>{propertyLabel(p)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dirección *</label>
                  <input
                    value={form.direccion}
                    onChange={(e) => setForm({
                      ...form,
                      direccion: e.target.value,
                      propiedad: e.target.value,
                    })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha *</label>
                    <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Hora</label>
                    <input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agente *</label>
                  <select
                    value={form.agenteUserId}
                    onChange={(e) => selectAgent(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                  >
                    <option value="">Seleccionar del Equipo…</option>
                    {agents.map((a) => (
                      <option key={a.userId} value={a.userId}>
                        {a.name}{a.role ? ` · ${a.role}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">En la puerta</p>
                <div className="flex flex-wrap gap-2">
                  {SITUACIONES_PUERTA.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => applySituacion(s)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                        form.situacion === s
                          ? 'border-[var(--v-blue,#2563eb)] bg-blue-50 text-[var(--v-blue,#2563eb)] dark:bg-blue-950/40'
                          : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800'
                      }`}
                    >
                      {RE_SITUACION_LABEL[s]}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Detalles / notas
                  </label>
                  <textarea
                    value={form.notas}
                    onChange={(e) => setForm({ ...form, notas: e.target.value })}
                    rows={4}
                    placeholder="Quién abrió, interés, objeciones, documentos pendientes…"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 resize-none"
                  />
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Contacto</p>
                  <button
                    type="button"
                    onClick={() => setShowNewClientModal(true)}
                    className="text-xs font-semibold text-[var(--v-blue,#2563eb)] hover:underline"
                  >
                    + Nuevo cliente
                  </button>
                </div>
                <select
                  value={form.clientId}
                  onChange={(e) => selectCrmClient(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                >
                  <option value="">Cliente CRM (opcional)…</option>
                  {crmClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.phone ? ` · ${c.phone}` : ''}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre</label>
                    <input value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono</label>
                    <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100" />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Siguiente paso</p>
                <div className="flex flex-wrap gap-2">
                  {NEXT_ACTIONS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => applySiguienteAccion(a)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                        form.siguienteAccion === a
                          ? a === 'descartar'
                            ? 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950/40'
                            : 'border-[var(--v-blue,#2563eb)] bg-blue-50 text-[var(--v-blue,#2563eb)] dark:bg-blue-950/40'
                          : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-50'
                      }`}
                    >
                      {RE_SIGUIENTE_ACCION_LABEL[a]}
                    </button>
                  ))}
                </div>
                {form.siguienteAccion === 'llamar' || form.siguienteAccion === 'segunda_visita' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Fecha de seguimiento
                    </label>
                    <input
                      type="date"
                      value={form.fechaSeguimiento}
                      onChange={(e) => setForm({ ...form, fechaSeguimiento: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                    />
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                    <select value={form.tipoVisita} onChange={(e) => setForm({ ...form, tipoVisita: e.target.value as ReTipoVisita })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                      {TIPOS.map((t) => <option key={t} value={t}>{RE_TIPO_VISITA_LABEL[t]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Resultado</label>
                    <select value={form.resultado} onChange={(e) => setForm({ ...form, resultado: e.target.value as Resultado })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                      {RESULTADOS.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
              </section>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setModalOpen(false)} className={VERTIAL_BTN_SECONDARY + ' !min-h-10'}>Cancelar</button>
              <button type="button" onClick={() => void handleSave()} className={VERTIAL_BTN_PRIMARY + ' !min-h-10'}>
                {editing ? 'Guardar seguimiento' : 'Guardar visita'}
              </button>
            </div>
          </div>
        </div>
      )}

      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Visitas"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />

      <NuevoClienteModal
        open={showNewClientModal}
        onClose={() => setShowNewClientModal(false)}
        onClientCreated={(client) => {
          setShowNewClientModal(false);
          void loadCrmClients().then(() => {
            selectCrmClient(client.id);
          });
          toast.success(`Cliente "${client.name}" creado y asignado`);
        }}
        contexto="vertical"
        businessId={crmBusinessId}
        dataUserId={crmDataUserId}
      />
    </Layout>
  );
}
