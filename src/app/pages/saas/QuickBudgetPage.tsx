import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, X, Plus, Trash2, Search,
  Users, Building2, Home, Store, Factory, Warehouse, Hotel, Landmark,
  Zap, FileText, Send, Save, XCircle, AlertTriangle, CreditCard, Banknote,
  ClipboardList, Eye, ChevronDown, Copy,
} from 'lucide-react';
import type {
  ConstructionBudget, BudgetPartida, ConstructionGuild, ConstructionClient,
  ConstructionProject, BudgetTemplate, DireccionFiscal,
} from '../../lib/constructionApi';
import {
  listConstructionBudgets, createConstructionBudget, updateConstructionBudget,
  sendConstructionBudget, rejectConstructionBudget,
  listConstructionGuilds, listConstructionClients, createConstructionClient,
  listConstructionProjects,
  listBudgetTemplates, createBudgetTemplate,
} from '../../lib/constructionApi';

const TIPOS_OBRA = [
  { value: 'casa', label: 'Casa', icon: Home },
  { value: 'piso', label: 'Piso', icon: Building2 },
  { value: 'local', label: 'Local', icon: Store },
  { value: 'oficina', label: 'Oficina', icon: Landmark },
  { value: 'nave', label: 'Nave', icon: Warehouse },
  { value: 'promoción', label: 'Promoción', icon: Factory },
  { value: 'otro', label: 'Otra', icon: Hotel },
];

const GREMIOS_LIST = [
  'carpintería', 'peletería', 'lampistería', 'pradurista', 'yesero',
  'pintor', 'herrero', 'electricista', 'fontanero', 'albañil', 'otro',
];

const STEPS = [
  { id: 'origen', title: 'Origen', icon: Zap },
  { id: 'cliente', title: 'Cliente', icon: Users },
  { id: 'obra', title: 'Obra', icon: Building2 },
  { id: 'partidas', title: 'Partidas', icon: ClipboardList },
  { id: 'resumen', title: 'Resumen', icon: Eye },
];

const emptyFiscal = (): DireccionFiscal => ({ calle: '', codigoPostal: '', ciudad: '', provincia: '', pais: 'España' });
const emptyPartida = (): BudgetPartida => ({ id: Date.now(), gremio: '', descripcion: '', materiales: 0, manoObra: 0, estructural: 0, subtotal: 0 });
const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });

export function QuickBudgetPage() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const userRole = (user as Record<string, unknown>)?.role as string || 'Gerente';
  const canEdit = ['Admin', 'Gerente', 'Comercial', 'Administración'].includes(userRole);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [clients, setClients] = useState<ConstructionClient[]>([]);
  const [projects, setProjects] = useState<ConstructionProject[]>([]);
  const [guilds, setGuilds] = useState<ConstructionGuild[]>([]);
  const [templates, setTemplates] = useState<BudgetTemplate[]>([]);

  // Step 1: Origen
  const [origen, setOrigen] = useState<'cliente' | 'obra' | ''>('');
  const [selectedProjectId, setSelectedProjectId] = useState('');

  // Step 2: Cliente
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<ConstructionClient | null>(null);
  const [isNewClient, setIsNewClient] = useState(false);
  const [newClientForm, setNewClientForm] = useState({ nombre: '', cif: '', telefono: '', email: '', direccion: '' });
  const [newClientFiscal, setNewClientFiscal] = useState(emptyFiscal());

  // Step 3: Obra
  const [tipoObra, setTipoObra] = useState('casa');
  const [direccionObra, setDireccionObra] = useState('');
  const [descripcionObra, setDescripcionObra] = useState('');
  const [proyectoNombre, setProyectoNombre] = useState('');

  // Step 4: Partidas
  const [partidas, setPartidas] = useState<BudgetPartida[]>([emptyPartida()]);
  const [margen, setMargen] = useState(15);
  const [margenMinimo] = useState(10);
  const [showTemplates, setShowTemplates] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  // Step 5: resumen
  const [formaPago, setFormaPago] = useState('');
  const [notas, setNotas] = useState('');

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [c, p, g, t] = await Promise.all([
        listConstructionClients(userId),
        listConstructionProjects(userId),
        listConstructionGuilds(userId),
        listBudgetTemplates(userId),
      ]);
      setClients(c); setProjects(p); setGuilds(g); setTemplates(t);

      const paramClienteId = params.get('clienteId');
      const paramObraId = params.get('obraId');
      if (paramObraId) {
        const proj = p.find(pr => pr._id === paramObraId);
        if (proj) {
          setOrigen('obra');
          setSelectedProjectId(proj._id);
          setProyectoNombre(proj.nombre);
          setTipoObra(proj.tipoObra || 'casa');
          setDireccionObra(proj.ubicacion || '');
          const cli = c.find(cl => cl._id === proj.clienteId);
          if (cli) setSelectedClient(cli);
          setStep(2);
        }
      } else if (paramClienteId) {
        const cli = c.find(cl => cl._id === paramClienteId);
        if (cli) { setOrigen('cliente'); setSelectedClient(cli); setStep(2); }
      }
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al cargar datos', 'error'); }
    setLoading(false);
  }, [userId, params]);

  useEffect(() => { load(); }, [load]);

  // Client search
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients.slice(0, 10);
    const q = clientSearch.toLowerCase();
    return clients.filter(c => `${c.nombre} ${c.cif} ${c.telefono} ${c.email}`.toLowerCase().includes(q)).slice(0, 10);
  }, [clients, clientSearch]);

  // Partidas calc
  const totalPartidas = partidas.reduce((s, p) => s + (Number(p.materiales) + Number(p.manoObra) + Number(p.estructural)), 0);
  const totalConMargen = totalPartidas * (1 + margen / 100);
  const margenBajo = margen < margenMinimo;

  // Client warnings
  const clientWarnings = useMemo(() => {
    const src = selectedClient || (isNewClient ? { nombre: newClientForm.nombre, cif: newClientForm.cif, telefono: newClientForm.telefono, email: newClientForm.email } : null);
    if (!src) return [];
    const w: string[] = [];
    if (!src.nombre) w.push('nombre');
    if (!src.cif) w.push('CIF/NIF');
    if (!src.telefono) w.push('teléfono');
    if (!src.email) w.push('email');
    return w;
  }, [selectedClient, isNewClient, newClientForm]);

  const selectClient = (c: ConstructionClient) => {
    setSelectedClient(c);
    setIsNewClient(false);
    setClientSearch('');
    if (c.formaPagoHabitual) setFormaPago(c.formaPagoHabitual);
  };

  const selectProject = (p: ConstructionProject) => {
    setSelectedProjectId(p._id);
    setProyectoNombre(p.nombre);
    setTipoObra(p.tipoObra || 'casa');
    setDireccionObra(p.ubicacion || '');
    const cli = clients.find(c => c._id === p.clienteId);
    if (cli) selectClient(cli);
  };

  const addPartida = () => setPartidas(prev => [...prev, emptyPartida()]);
  const removePartida = (id: number) => setPartidas(prev => prev.length > 1 ? prev.filter(p => p.id !== id) : prev);
  const updatePartida = (id: number, field: string, value: string | number) => {
    setPartidas(prev => prev.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: value };
      updated.subtotal = Number(updated.materiales) + Number(updated.manoObra) + Number(updated.estructural);
      return updated;
    }));
  };

  const autoFillFromGuild = (partidaId: number, gremioTipo: string) => {
    const guild = guilds.find(g => g.tipo === gremioTipo);
    if (!guild) { updatePartida(partidaId, 'gremio', gremioTipo); return; }
    setPartidas(prev => prev.map(p => {
      if (p.id !== partidaId) return p;
      return { ...p, gremio: gremioTipo, descripcion: guild.nombre, materiales: guild.precioMateriales, manoObra: guild.precioManoObra, estructural: guild.precioEstructural, subtotal: guild.precioTotal };
    }));
  };

  const loadTemplate = (tpl: BudgetTemplate) => {
    const newPartidas = tpl.partidas.map(p => ({ ...p, id: Date.now() + Math.random() * 1000 }));
    setPartidas(prev => [...prev.filter(p => p.gremio || p.descripcion), ...newPartidas]);
    if (!partidas.some(p => p.gremio || p.descripcion) && newPartidas.length) {
      setPartidas(newPartidas);
    }
    setShowTemplates(false);
    showToast(`Plantilla "${tpl.nombre}" cargada`);
  };

  const handleSaveTemplate = async () => {
    if (!saveTemplateName.trim() || !userId) return;
    try {
      const tpl = await createBudgetTemplate(userId, {
        nombre: saveTemplateName,
        gremio: partidas[0]?.gremio || '',
        partidas: partidas.filter(p => p.gremio || p.descripcion),
      });
      setTemplates(prev => [tpl, ...prev]);
      setShowSaveTemplate(false);
      setSaveTemplateName('');
      showToast('Plantilla guardada');
    } catch { showToast('Error al guardar plantilla', 'error'); }
  };

  const canAdvance = (s: number): boolean => {
    if (s === 0) return origen !== '';
    if (s === 1) return !!(selectedClient || (isNewClient && newClientForm.nombre.trim()));
    if (s === 2) return !!(tipoObra && proyectoNombre.trim());
    if (s === 3) return partidas.some(p => p.gremio && p.subtotal > 0);
    return true;
  };

  const handleCreateNewClient = async (): Promise<ConstructionClient | null> => {
    if (!isNewClient || !newClientForm.nombre.trim() || !userId) return selectedClient;
    try {
      const created = await createConstructionClient(userId, {
        ...newClientForm,
        direccionFiscal: newClientFiscal,
        direccionesPrevias: [],
        formaPagoHabitual: formaPago || '',
      } as Partial<ConstructionClient>);
      setClients(prev => [created, ...prev]);
      setSelectedClient(created);
      setIsNewClient(false);
      return created;
    } catch { showToast('Error al crear cliente', 'error'); return null; }
  };

  const buildPayload = (cli: ConstructionClient | null) => ({
    proyectoId: selectedProjectId,
    proyectoNombre,
    clienteId: cli?._id || '',
    clienteNombre: cli?.nombre || newClientForm.nombre,
    clienteCif: cli?.cif || newClientForm.cif,
    clienteTelefono: cli?.telefono || newClientForm.telefono,
    clienteEmail: cli?.email || newClientForm.email,
    clienteDireccionFiscal: cli?.direccionFiscal || newClientFiscal,
    clienteFormaPago: formaPago,
    tipoObra,
    direccionObra,
    descripcionObra,
    fecha: new Date().toISOString().slice(0, 10),
    partidas: partidas.filter(p => p.gremio || p.descripcion),
    margen,
    margenMinimo,
    metodoPago: formaPago,
    notas,
    creadoPor: userId,
    creadoPorNombre: (user as Record<string, unknown>)?.fullName as string || '',
  });

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const cli = isNewClient ? await handleCreateNewClient() : selectedClient;
      const payload = buildPayload(cli);
      await createConstructionBudget(userId, { ...payload, estado: 'borrador' });
      showToast('Borrador guardado correctamente');
      setTimeout(() => navigate('/saas/construction-budgets'), 800);
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al guardar', 'error'); }
    setSaving(false);
  };

  const handleSendBudget = async () => {
    setSaving(true);
    try {
      const cli = isNewClient ? await handleCreateNewClient() : selectedClient;
      const payload = buildPayload(cli);
      const created = await createConstructionBudget(userId, { ...payload, estado: 'borrador' });
      await sendConstructionBudget(userId, created._id);
      showToast('Presupuesto enviado correctamente');
      setTimeout(() => navigate('/saas/construction-budgets'), 800);
    } catch (err) { showToast(err instanceof Error ? err.message : 'Error al enviar', 'error'); }
    setSaving(false);
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-colors';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  if (!canEdit) {
    return (
      <Layout title="Presupuesto Rápido">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <AlertTriangle className="w-12 h-12 text-amber-500" />
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">No tienes permiso para crear presupuestos</p>
          <p className="text-sm text-gray-500">Contacta con tu gerente para solicitar acceso.</p>
        </div>
      </Layout>
    );
  }

  if (loading) return <Layout title="Presupuesto Rápido"><div className="flex items-center justify-center py-20 text-gray-400">Cargando...</div></Layout>;

  return (
    <Layout title="Presupuesto Rápido">
      {/* Stepper */}
      <div className="mb-8">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={s.id} className="flex items-center flex-1 last:flex-initial">
                <button
                  onClick={() => { if (isDone) setStep(i); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${isActive ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 shadow-lg scale-105' : isDone ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 cursor-pointer hover:bg-emerald-200 dark:hover:bg-emerald-900/50' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'}`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${isActive ? 'bg-white/20' : isDone ? 'bg-emerald-500 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                    {isDone ? <Check className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className="text-sm font-semibold hidden sm:block">{s.title}</span>
                </button>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-2 rounded ${i < step ? 'bg-emerald-400' : 'bg-gray-200 dark:bg-gray-700'}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content area */}
      <div className="max-w-4xl mx-auto">
        {/* STEP 0: Origen */}
        {step === 0 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">¿Cómo quieres empezar?</h2>
              <p className="text-gray-500 dark:text-gray-400 mt-2">Elige si partes de un cliente existente o de una obra ya creada</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
              <button
                onClick={() => setOrigen('cliente')}
                className={`p-8 rounded-2xl border-2 transition-all text-left ${origen === 'cliente' ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-800 shadow-lg scale-[1.02]' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'}`}
              >
                <Users className={`w-10 h-10 mb-4 ${origen === 'cliente' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`} />
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Desde un Cliente</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Selecciona o crea un cliente y luego define los datos de la obra</p>
              </button>
              <button
                onClick={() => setOrigen('obra')}
                className={`p-8 rounded-2xl border-2 transition-all text-left ${origen === 'obra' ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-800 shadow-lg scale-[1.02]' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'}`}
              >
                <Building2 className={`w-10 h-10 mb-4 ${origen === 'obra' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`} />
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Desde una Obra</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Selecciona una obra existente y se auto-rellenará el cliente vinculado</p>
              </button>
            </div>

            {origen === 'obra' && (
              <div className="max-w-2xl mx-auto mt-6">
                <label className={labelClass}>Selecciona una obra</label>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {projects.map(p => (
                    <button key={p._id} onClick={() => selectProject(p)}
                      className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${selectedProjectId === p._id ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-800' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">{p.nombre}</p>
                          <p className="text-sm text-gray-500">{p.tipoObra} — {p.ubicacion || 'Sin dirección'}</p>
                        </div>
                        {p.clienteNombre && <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-lg">{p.clienteNombre}</span>}
                      </div>
                    </button>
                  ))}
                  {projects.length === 0 && <p className="text-center py-6 text-gray-400">No hay obras creadas</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 1: Cliente */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Datos del cliente</h2>
              <p className="text-gray-500 dark:text-gray-400 mt-2">Busca un cliente existente o crea uno nuevo</p>
            </div>

            {!isNewClient && !selectedClient && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input type="text" placeholder="Buscar por nombre, CIF, teléfono..." value={clientSearch} onChange={e => setClientSearch(e.target.value)} className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400 text-lg" />
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {filteredClients.map(c => (
                    <button key={c._id} onClick={() => selectClient(c)} className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-gray-900 dark:hover:border-gray-400 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0"><Users className="w-5 h-5 text-blue-600 dark:text-blue-400" /></div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{c.nombre}</p>
                          <p className="text-sm text-gray-500 truncate">{[c.cif, c.telefono, c.email].filter(Boolean).join(' · ')}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                <button onClick={() => setIsNewClient(true)} className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-600 dark:text-gray-400 hover:border-gray-900 dark:hover:border-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-all font-semibold">
                  <Plus className="w-5 h-5" /> Crear nuevo cliente
                </button>
              </div>
            )}

            {selectedClient && !isNewClient && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"><CheckCircle2 className="w-6 h-6 text-emerald-600" /></div>
                    <div>
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedClient.nombre}</p>
                      <p className="text-sm text-gray-500">{selectedClient.cif || 'Sin CIF'}</p>
                    </div>
                  </div>
                  <button onClick={() => { setSelectedClient(null); setClientSearch(''); }} className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">Cambiar</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3"><span className="text-xs text-gray-500 block mb-1">Teléfono</span><span className="font-semibold text-gray-900 dark:text-gray-100">{selectedClient.telefono || '—'}</span></div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3"><span className="text-xs text-gray-500 block mb-1">Email</span><span className="font-semibold text-gray-900 dark:text-gray-100 truncate block">{selectedClient.email || '—'}</span></div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3"><span className="text-xs text-gray-500 block mb-1">Forma de pago</span><span className="font-semibold text-gray-900 dark:text-gray-100 capitalize">{selectedClient.formaPagoHabitual || '—'}</span></div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 col-span-2 sm:col-span-3">
                    <span className="text-xs text-gray-500 block mb-1">Dirección fiscal</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {selectedClient.direccionFiscal?.calle ? `${selectedClient.direccionFiscal.calle}, ${selectedClient.direccionFiscal.codigoPostal} ${selectedClient.direccionFiscal.ciudad}` : (selectedClient.direccion || '—')}
                    </span>
                  </div>
                </div>
                {selectedClient.direccionesPrevias?.length > 0 && (
                  <div>
                    <span className="text-xs text-gray-500 mb-2 block">Direcciones previas (clic para usar en obra)</span>
                    <div className="flex flex-wrap gap-2">
                      {selectedClient.direccionesPrevias.map((d, i) => (
                        <button key={i} onClick={() => setDireccionObra(`${d.calle}, ${d.codigoPostal} ${d.ciudad}`)} className="text-xs px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                          {d.etiqueta || `${d.calle}, ${d.ciudad}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {clientWarnings.length > 0 && (
                  <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-700 dark:text-amber-400">Faltan datos: <strong>{clientWarnings.join(', ')}</strong></p>
                  </div>
                )}
              </div>
            )}

            {isNewClient && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-gray-900 dark:text-gray-100">Nuevo cliente</h3>
                  <button onClick={() => { setIsNewClient(false); setNewClientForm({ nombre: '', cif: '', telefono: '', email: '', direccion: '' }); }} className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-100">Cancelar</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2"><label className={labelClass}>Nombre / Razón social *</label><input className={inputClass} value={newClientForm.nombre} onChange={e => setNewClientForm(f => ({ ...f, nombre: e.target.value }))} required /></div>
                  <div><label className={labelClass}>CIF / NIF</label><input className={inputClass} value={newClientForm.cif} onChange={e => setNewClientForm(f => ({ ...f, cif: e.target.value }))} /></div>
                  <div><label className={labelClass}>Teléfono</label><input className={inputClass} value={newClientForm.telefono} onChange={e => setNewClientForm(f => ({ ...f, telefono: e.target.value }))} /></div>
                  <div className="sm:col-span-2"><label className={labelClass}>Email</label><input type="email" className={inputClass} value={newClientForm.email} onChange={e => setNewClientForm(f => ({ ...f, email: e.target.value }))} /></div>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Dirección fiscal</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2"><label className={labelClass}>Calle</label><input className={inputClass} value={newClientFiscal.calle} onChange={e => setNewClientFiscal(f => ({ ...f, calle: e.target.value }))} /></div>
                    <div><label className={labelClass}>Código postal</label><input className={inputClass} value={newClientFiscal.codigoPostal} onChange={e => setNewClientFiscal(f => ({ ...f, codigoPostal: e.target.value }))} /></div>
                    <div><label className={labelClass}>Ciudad</label><input className={inputClass} value={newClientFiscal.ciudad} onChange={e => setNewClientFiscal(f => ({ ...f, ciudad: e.target.value }))} /></div>
                    <div><label className={labelClass}>Provincia</label><input className={inputClass} value={newClientFiscal.provincia} onChange={e => setNewClientFiscal(f => ({ ...f, provincia: e.target.value }))} /></div>
                    <div><label className={labelClass}>País</label><input className={inputClass} value={newClientFiscal.pais} onChange={e => setNewClientFiscal(f => ({ ...f, pais: e.target.value }))} /></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Obra */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Datos de la obra</h2>
              <p className="text-gray-500 dark:text-gray-400 mt-2">Define el tipo, dirección y descripción del proyecto</p>
            </div>

            <div><label className={labelClass}>Nombre del proyecto / obra *</label><input className={inputClass} value={proyectoNombre} onChange={e => setProyectoNombre(e.target.value)} placeholder="Ej: Reforma integral piso Barcelona" /></div>

            <div>
              <label className={labelClass}>Tipo de obra</label>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {TIPOS_OBRA.map(t => {
                  const Icon = t.icon;
                  return (
                    <button key={t.value} onClick={() => setTipoObra(t.value)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${tipoObra === t.value ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-800 shadow-md' : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}>
                      <Icon className={`w-6 h-6 ${tipoObra === t.value ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400'}`} />
                      <span className={`text-xs font-semibold ${tipoObra === t.value ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500'}`}>{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className={labelClass}>Dirección de la obra</label>
              <input className={inputClass} value={direccionObra} onChange={e => setDireccionObra(e.target.value)} placeholder="Calle, número, ciudad..." />
              {selectedClient?.direccionesPrevias?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className="text-xs text-gray-400">Usar dirección previa:</span>
                  {selectedClient.direccionesPrevias.map((d, i) => (
                    <button key={i} onClick={() => setDireccionObra(`${d.calle}, ${d.codigoPostal} ${d.ciudad}`)} className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100">
                      {d.etiqueta || d.calle}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div><label className={labelClass}>Descripción / alcance de la obra</label><textarea className={inputClass} rows={3} value={descripcionObra} onChange={e => setDescripcionObra(e.target.value)} placeholder="Describe el alcance del trabajo a presupuestar..." /></div>
          </div>
        )}

        {/* STEP 3: Partidas */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Partidas y presupuesto</h2>
              <p className="text-gray-500 dark:text-gray-400 mt-2">Añade las partidas por gremio con el desglose de costes</p>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={addPartida} className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl text-sm font-semibold hover:bg-black dark:hover:bg-white transition-colors"><Plus className="w-4 h-4" /> Añadir partida</button>
              <button onClick={() => setShowTemplates(!showTemplates)} className="flex items-center gap-1.5 px-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"><Copy className="w-4 h-4" /> Cargar plantilla</button>
              {partidas.some(p => p.gremio) && (
                <button onClick={() => setShowSaveTemplate(true)} className="flex items-center gap-1.5 px-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"><Save className="w-4 h-4" /> Guardar como plantilla</button>
              )}
            </div>

            {showTemplates && templates.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-blue-200 dark:border-blue-800 p-4 space-y-2">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Plantillas disponibles</h4>
                {templates.map(tpl => (
                  <button key={tpl._id} onClick={() => loadTemplate(tpl)} className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{tpl.nombre}</p>
                    <p className="text-xs text-gray-500">{tpl.partidas.length} partidas — {tpl.gremio || 'varios gremios'}</p>
                  </button>
                ))}
              </div>
            )}
            {showTemplates && templates.length === 0 && (
              <div className="text-center py-4 text-sm text-gray-400">No tienes plantillas guardadas aún</div>
            )}

            {showSaveTemplate && (
              <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-emerald-200 dark:border-emerald-800 p-4 flex gap-3 items-end">
                <div className="flex-1"><label className={labelClass}>Nombre de la plantilla</label><input className={inputClass} value={saveTemplateName} onChange={e => setSaveTemplateName(e.target.value)} placeholder="Ej: Fontanería vivienda completa" /></div>
                <button onClick={handleSaveTemplate} className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors">Guardar</button>
                <button onClick={() => { setShowSaveTemplate(false); setSaveTemplateName(''); }} className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50"><X className="w-4 h-4" /></button>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                    <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Gremio</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400">Descripción</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 w-28 text-right">Materiales</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 w-28 text-right">Mano obra</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 w-28 text-right">Estructural</th>
                    <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 w-28 text-right">Subtotal</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {partidas.map(p => (
                    <tr key={p.id} className="border-b border-gray-100 dark:border-gray-700/50">
                      <td className="px-4 py-2">
                        <select className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" value={p.gremio} onChange={e => autoFillFromGuild(p.id, e.target.value)}>
                          <option value="">— Gremio —</option>
                          {GREMIOS_LIST.map(g => <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2"><input className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" value={p.descripcion} onChange={e => updatePartida(p.id, 'descripcion', e.target.value)} placeholder="Descripción..." /></td>
                      <td className="px-4 py-2"><input type="number" step="0.01" className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-right" value={p.materiales || ''} onChange={e => updatePartida(p.id, 'materiales', Number(e.target.value))} /></td>
                      <td className="px-4 py-2"><input type="number" step="0.01" className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-right" value={p.manoObra || ''} onChange={e => updatePartida(p.id, 'manoObra', Number(e.target.value))} /></td>
                      <td className="px-4 py-2"><input type="number" step="0.01" className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm text-right" value={p.estructural || ''} onChange={e => updatePartida(p.id, 'estructural', Number(e.target.value))} /></td>
                      <td className="px-4 py-2 text-right font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">{fmt(Number(p.materiales) + Number(p.manoObra) + Number(p.estructural))}</td>
                      <td className="px-4 py-2"><button onClick={() => removePartida(p.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-red-500" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Margen (%)</label>
                <input type="number" className="w-24 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400 text-center font-bold" value={margen} onChange={e => setMargen(Number(e.target.value))} />
                {margenBajo && (
                  <span className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400 font-semibold"><AlertTriangle className="w-4 h-4" /> Por debajo del mínimo ({margenMinimo}%)</span>
                )}
              </div>
              <div className="flex flex-wrap gap-6 text-sm border-t border-gray-200 dark:border-gray-700 pt-4">
                <div><span className="text-gray-500">Subtotal partidas</span><p className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmt(totalPartidas)}</p></div>
                <div><span className="text-gray-500">Margen ({margen}%)</span><p className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmt(totalConMargen - totalPartidas)}</p></div>
                <div className="ml-auto"><span className="text-gray-500">Total presupuesto</span><p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{fmt(totalConMargen)}</p></div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Resumen */}
        {step === 4 && (
          <div className="space-y-6">
            <div className="text-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Resumen del presupuesto</h2>
              <p className="text-gray-500 dark:text-gray-400 mt-2">Revisa los datos antes de guardar o enviar</p>
            </div>

            {/* Preview card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="bg-gradient-to-r from-gray-900 to-gray-800 dark:from-gray-100 dark:to-gray-200 px-6 py-5">
                <div className="flex items-center justify-between">
                  <div><p className="text-xs text-gray-400 dark:text-gray-500">Presupuesto</p><p className="text-xl font-bold text-white dark:text-gray-900">{proyectoNombre}</p></div>
                  <div className="text-right"><p className="text-xs text-gray-400 dark:text-gray-500">Fecha</p><p className="text-sm font-semibold text-white dark:text-gray-900">{new Date().toLocaleDateString('es-ES')}</p></div>
                </div>
              </div>

              <div className="p-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Cliente</h4>
                    <p className="font-bold text-gray-900 dark:text-gray-100">{selectedClient?.nombre || newClientForm.nombre}</p>
                    <p className="text-sm text-gray-500">{selectedClient?.cif || newClientForm.cif}</p>
                    <p className="text-sm text-gray-500">{selectedClient?.telefono || newClientForm.telefono} · {selectedClient?.email || newClientForm.email}</p>
                    {(selectedClient?.direccionFiscal?.calle || newClientFiscal.calle) && (
                      <p className="text-sm text-gray-500 mt-1">
                        {selectedClient?.direccionFiscal?.calle || newClientFiscal.calle}, {selectedClient?.direccionFiscal?.codigoPostal || newClientFiscal.codigoPostal} {selectedClient?.direccionFiscal?.ciudad || newClientFiscal.ciudad}
                      </p>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Obra</h4>
                    <p className="font-bold text-gray-900 dark:text-gray-100 capitalize">{tipoObra}</p>
                    {direccionObra && <p className="text-sm text-gray-500">{direccionObra}</p>}
                    {descripcionObra && <p className="text-sm text-gray-500 mt-1">{descripcionObra}</p>}
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Desglose de partidas</h4>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500"><th className="pb-2">Gremio</th><th className="pb-2">Descripción</th><th className="pb-2 text-right">Mat.</th><th className="pb-2 text-right">M.O.</th><th className="pb-2 text-right">Estr.</th><th className="pb-2 text-right">Subtotal</th></tr>
                    </thead>
                    <tbody>
                      {partidas.filter(p => p.gremio || p.descripcion).map(p => (
                        <tr key={p.id} className="border-t border-gray-100 dark:border-gray-700/50">
                          <td className="py-2 capitalize text-gray-700 dark:text-gray-300">{p.gremio}</td>
                          <td className="py-2 text-gray-600 dark:text-gray-400">{p.descripcion}</td>
                          <td className="py-2 text-right text-gray-600 dark:text-gray-400">{fmt(p.materiales)}</td>
                          <td className="py-2 text-right text-gray-600 dark:text-gray-400">{fmt(p.manoObra)}</td>
                          <td className="py-2 text-right text-gray-600 dark:text-gray-400">{fmt(p.estructural)}</td>
                          <td className="py-2 text-right font-semibold text-gray-900 dark:text-gray-100">{fmt(Number(p.materiales) + Number(p.manoObra) + Number(p.estructural))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex flex-wrap justify-end gap-6 text-sm">
                  <div className="text-right"><span className="text-gray-500 block">Subtotal</span><span className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmt(totalPartidas)}</span></div>
                  <div className="text-right"><span className="text-gray-500 block">Margen {margen}%</span><span className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmt(totalConMargen - totalPartidas)}</span></div>
                  <div className="text-right"><span className="text-gray-500 block">Total</span><span className="text-2xl font-bold text-purple-600 dark:text-purple-400">{fmt(totalConMargen)}</span></div>
                </div>
              </div>
            </div>

            {/* Forma de pago + notas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className={labelClass}>Forma de pago</label>
                <div className="flex gap-3">
                  {[
                    { value: 'contado', label: 'Al contado', icon: Banknote },
                    { value: 'plazos', label: 'Por plazos', icon: CreditCard },
                    { value: 'transferencia', label: 'Transferencia', icon: Send },
                  ].map(m => (
                    <button key={m.value} onClick={() => setFormaPago(m.value)}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-colors ${formaPago === m.value ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100' : 'border-gray-200 dark:border-gray-700 text-gray-500'}`}>
                      <m.icon className="w-4 h-4" /> {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div><label className={labelClass}>Notas adicionales</label><textarea className={inputClass} rows={3} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Condiciones, observaciones..." /></div>
            </div>

            {/* Alertas */}
            {(margenBajo || clientWarnings.length > 0) && (
              <div className="space-y-2">
                {margenBajo && (
                  <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-sm text-red-700 dark:text-red-400">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" /> El margen ({margen}%) está por debajo del mínimo ({margenMinimo}%)
                  </div>
                )}
                {clientWarnings.length > 0 && (
                  <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Al cliente le faltan datos: {clientWarnings.join(', ')}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={handleSaveDraft} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50">
                <Save className="w-5 h-5" /> Guardar borrador
              </button>
              <button onClick={handleSendBudget} disabled={saving} className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50">
                <Send className="w-5 h-5" /> Enviar al cliente
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button onClick={() => step > 0 ? setStep(step - 1) : navigate('/saas/construction-budgets')} className="flex items-center gap-2 px-5 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {step === 0 ? 'Volver al listado' : 'Anterior'}
          </button>
          {step < STEPS.length - 1 && (
            <button onClick={() => { if (canAdvance(step)) setStep(step + 1); }} disabled={!canAdvance(step)} className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-xl font-semibold hover:bg-black dark:hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Siguiente <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </Layout>
  );
}
