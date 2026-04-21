import { useState, useRef, useEffect } from 'react';
import {
  X, TrendingUp, AlertCircle, Check, Search, Plus,
  ChevronDown, User, Mail, Phone, UserPlus, ArrowLeft,
} from 'lucide-react';
import type { Vehicle as AppVehicle } from '../../context/AppContext';
import type { SaleRecord, SaleStage } from '../../lib/salesTypes';
import { isVehicleAvailableForSale } from '../../lib/vehicleSaleSync';
import { useModalClose } from '../../hooks/useModalClose';
import { useWorkCenters } from '../../hooks/useWorkCenters';

// ─── Currency mask helpers ────────────────────────────────────────────────────

function formatCurrencyDisplay(raw: string): string {
  if (!raw) return '';
  const parts = raw.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts.length > 1 ? `${intPart},${parts[1]}` : intPart;
}


interface CurrencyInputProps {
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

function CurrencyInput({ value, onChange, placeholder, required, className }: CurrencyInputProps) {
  const [display, setDisplay] = useState(() => formatCurrencyDisplay(value));

  useEffect(() => {
    setDisplay(formatCurrencyDisplay(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const stripped = input.replace(/[^\d,]/g, '');
    const parts = stripped.split(',');
    const intStr = parts[0];
    const decStr = parts.length > 1 ? parts[1].slice(0, 2) : undefined;
    const formattedInt = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const displayValue = decStr !== undefined ? `${formattedInt},${decStr}` : formattedInt;
    const rawValue = decStr !== undefined ? `${intStr}.${decStr}` : intStr;
    setDisplay(displayValue);
    onChange(rawValue);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      placeholder={placeholder}
      required={required}
      className={className}
    />
  );
}

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  registrationPlate?: string;
  salePrice?: number;
  /** Estado de stock (compraventa) — necesario para validar doble venta */
  status?: string;
}

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    vehicleId: string;
    clientId: string;
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    stage: SaleStage;
    totalPrice: string;
    depositPaid: string;
    expectedDelivery: string;
    responsible: string;
    paymentMethod: string;
    operationType: string;
    notes: string;
    workCenterId?: string;
    workCenterName?: string;
  }) => Promise<void> | void;
  onCreateClient?: (client: Omit<Client, 'id'>) => Promise<Client> | Client;
  /** Navegar a alta de vehículo (p. ej. /saas/vehicles?quickAdd=1) */
  onAddVehicle?: () => void;
  vehicles: Vehicle[];
  clients: Client[];
  teamMembers?: string[];
  /** Ventas ya registradas — evita asignar un vehículo con operación activa */
  existingSales?: SaleRecord[];
}

const STAGE_OPTIONS = [
  { value: 'interested',    label: 'Interesado',    dot: 'bg-slate-400' },
  { value: 'reserved',      label: 'Reserva',       dot: 'bg-blue-500' },
  { value: 'documentation', label: 'Documentación', dot: 'bg-amber-500' },
  { value: 'sold',          label: 'Vendido',        dot: 'bg-violet-500' },
  { value: 'delivered',     label: 'Entregado',      dot: 'bg-emerald-500' },
];

const PAYMENT_OPTIONS = ['Contado', 'Financiación', 'Leasing', 'Renting', 'Transferencia', 'Efectivo'];
const OPERATION_TYPES = ['Venta directa', 'Permuta', 'Permuta + financiación', 'Empresa', 'Exportación'];
const RESPONSABLES = ['Juan García', 'María López', 'Carlos Ruiz'];

// ─── Client Picker ────────────────────────────────────────────────────────────
// Dropdown custom con búsqueda + opción de añadir cliente nuevo inline

interface ClientPickerProps {
  clients: Client[];
  value: string;
  onChange: (id: string) => void;
  onNewClient: (client: Omit<Client, 'id'>) => Promise<void> | void;
  required?: boolean;
}

function ClientPicker({ clients, value, onChange, onNewClient, required }: ClientPickerProps) {
  const [open, setOpen]         = useState(false);
  const [search, setSearch]     = useState('');
  const [mode, setMode]         = useState<'list' | 'new'>('list');
  const [newForm, setNewForm]   = useState({ name: '', email: '', phone: '' });
  const [newSaved, setNewSaved] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setMode('list');
        setSearch('');
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const selected = clients.find(c => c.id === value);
  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleSaveNew = async () => {
    if (!newForm.name) return;
    await onNewClient(newForm);
    setNewSaved(true);
    setTimeout(() => {
      setNewSaved(false);
      setMode('list');
      setOpen(false);
      setNewForm({ name: '', email: '', phone: '' });
    }, 900);
  };

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setMode('list'); setSearch(''); }}
        className={`w-full flex items-center gap-3 px-3.5 py-2.5 border-2 rounded-xl text-left transition-colors ${
          open ? 'border-blue-500 ring-2 ring-blue-50 dark:ring-blue-900/30' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
        } bg-white dark:bg-gray-800`}
      >
        {selected ? (
          <>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-white">{selected.name.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{selected.name}</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{selected.email}</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
              <User className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            </div>
            <span className={`text-sm flex-1 ${required && !selected ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}`}>
              Seleccionar cliente…
            </span>
          </>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">

          {mode === 'list' && (
            <>
              {/* Search */}
              <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2">
                  <Search className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                  <input
                    autoFocus
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar por nombre o email…"
                    className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} type="button">
                      <X className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    </button>
                  )}
                </div>
              </div>

              {/* List */}
              <div className="max-h-52 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-sm text-gray-400 dark:text-gray-500">Sin clientes que coincidan</p>
                  </div>
                ) : filtered.map(c => {
                  const active = c.id === value;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { onChange(c.id); setOpen(false); setSearch(''); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 text-left transition-colors ${active ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] font-bold text-white">{c.name.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${active ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>{c.name}</p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{c.email} · {c.phone}</p>
                      </div>
                      {active && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Add new CTA */}
              <div className="border-t border-gray-100 dark:border-gray-800 p-2">
                <button
                  type="button"
                  onClick={() => setMode('new')}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white text-sm font-semibold transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  Añadir cliente nuevo
                </button>
              </div>
            </>
          )}

          {mode === 'new' && (
            <div className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-center gap-2 mb-1">
                <button
                  type="button"
                  onClick={() => setMode('list')}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </button>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Nuevo cliente</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">Se añadirá a tu base de clientes</p>
                </div>
              </div>

              {/* Form fields */}
              <div className="space-y-2.5">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                    Nombre completo <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Carlos López"
                      value={newForm.name}
                      onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full border-2 border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    <input
                      type="email"
                      placeholder="carlos@email.com"
                      value={newForm.email}
                      onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full border-2 border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Teléfono</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                    <input
                      type="tel"
                      placeholder="+34 600 000 000"
                      value={newForm.phone}
                      onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full border-2 border-gray-200 dark:border-gray-700 rounded-xl pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* CTA */}
              <button
                type="button"
                onClick={handleSaveNew}
                disabled={!newForm.name}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                  newSaved
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-900 hover:bg-black text-white disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
              >
                {newSaved ? (
                  <><Check className="w-4 h-4" strokeWidth={3} /> ¡Cliente añadido!</>
                ) : (
                  <><Plus className="w-4 h-4" /> Crear y seleccionar cliente</>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

const buildInitialForm = (firstResponsable: string) => ({
  vehicleId: '',
  clientId: '',
  stage: 'interested' as SaleStage,
  totalPrice: '',
  depositPaid: '',
  expectedDelivery: '',
  responsible: firstResponsable,
  paymentMethod: '',
  operationType: 'Venta directa',
  notes: '',
});

export function SAAS__CreateSaleModal({
  isOpen,
  onClose,
  onCreate,
  onCreateClient,
  onAddVehicle,
  vehicles,
  clients: initialClients,
  teamMembers,
  existingSales = [],
}: Props) {
  const responsableList = teamMembers && teamMembers.length > 0
    ? teamMembers
    : RESPONSABLES;

  const [formData, setFormData] = useState(() => buildInitialForm(responsableList[0]));
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientError, setClientError] = useState('');
  const [submitError, setSubmitError] = useState('');

  const [clientList, setClientList] = useState<Client[]>(initialClients);
  const { activeWorkCenters, hasWorkCenters } = useWorkCenters();
  const [workCenterId, setWorkCenterId] = useState('');

  useEffect(() => {
    setClientList(initialClients);
  }, [initialClients]);

  useEffect(() => {
    if (isOpen) {
      setFormData(buildInitialForm(responsableList[0]));
      setWorkCenterId('');
      setClientError('');
      setSubmitError('');
      setIsCreatingClient(false);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const resetAndClose = () => {
    setFormData(buildInitialForm(responsableList[0]));
    setWorkCenterId('');
    setClientError('');
    setSubmitError('');
    setIsCreatingClient(false);
    setIsSubmitting(false);
    onClose();
  };

  useModalClose(isOpen, resetAndClose);

  if (!isOpen) return null;

  const selectedVehicle = vehicles.find(v => v.id === formData.vehicleId);

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'vehicleId') {
        const vehicle = vehicles.find(v => v.id === value);
        if (vehicle?.salePrice) next.totalPrice = vehicle.salePrice.toString();
      }
      return next;
    });
  };

  const handleNewClient = async (data: Omit<Client, 'id'>) => {
    setClientError('');
    setIsCreatingClient(true);
    try {
      const createdClient = onCreateClient
        ? await onCreateClient(data)
        : { id: `new-${Date.now()}`, ...data };

      setClientList(prev => [...prev, createdClient]);
      setFormData(prev => ({ ...prev, clientId: createdClient.id }));
    } catch (error) {
      setClientError(error instanceof Error ? error.message : 'No se pudo crear el cliente');
    } finally {
      setIsCreatingClient(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    setIsSubmitting(true);
    try {
      if (formData.vehicleId && existingSales.length > 0) {
        const v = vehicles.find((x) => x.id === formData.vehicleId);
        if (v?.status) {
          const { available, reason } = isVehicleAvailableForSale(
            { id: v.id, status: v.status as AppVehicle['status'] },
            existingSales,
          );
          if (!available) {
            setSubmitError(reason || 'Este vehículo no está disponible para una nueva operación.');
            setIsSubmitting(false);
            return;
          }
        }
      }
      const selectedClient = clientList.find((client) => client.id === formData.clientId);
      await onCreate({
        ...formData,
        clientName: selectedClient?.name || '',
        clientEmail: selectedClient?.email || '',
        clientPhone: selectedClient?.phone || '',
        workCenterId: workCenterId || undefined,
        workCenterName: activeWorkCenters.find(wc => wc.id === workCenterId)?.name || undefined,
      });
      resetAndClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'No se pudo crear la venta');
    } finally {
      setIsSubmitting(false);
    }
  };

  const lc = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5';
  const ic = 'w-full border-2 border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-800 transition-colors';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={resetAndClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b-2 border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-900 dark:text-gray-100 text-xl flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              Nueva venta
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Registra una operación de venta</p>
          </div>
          <button onClick={resetAndClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <form id="create-sale-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">

            {/* Vehículo */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className={`${lc} mb-0`}>Vehículo *</label>
                {onAddVehicle && (
                  <button
                    type="button"
                    onClick={onAddVehicle}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 shrink-0"
                  >
                    + Añadir
                  </button>
                )}
              </div>
              <select required value={formData.vehicleId} onChange={e => handleChange('vehicleId', e.target.value)} className={ic}>
                <option value="">Seleccionar vehículo…</option>
                {vehicles.slice(0, 30).map(v => (
                  <option key={v.id} value={v.id}>
                    {v.brand} {v.model} {v.year}{v.registrationPlate ? ` · ${v.registrationPlate}` : ''}{v.salePrice ? ` · ${v.salePrice.toLocaleString('es-ES')}€` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Cliente — custom picker */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={`${lc} mb-0`}>Cliente <span className="text-red-400">*</span></label>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">{clientList.length} clientes</span>
              </div>
              <ClientPicker
                clients={clientList}
                value={formData.clientId}
                onChange={id => handleChange('clientId', id)}
                onNewClient={handleNewClient}
                required
              />
              {clientError && <p className="mt-2 text-xs text-red-500">{clientError}</p>}
              {isCreatingClient && <p className="mt-2 text-xs text-blue-600">Creando cliente...</p>}
              {submitError && <p className="mt-2 text-xs text-red-500">{submitError}</p>}
            </div>

            {hasWorkCenters && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Centro de trabajo</label>
                <select
                  value={workCenterId}
                  onChange={e => setWorkCenterId(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all"
                >
                  <option value="">Sin centro de trabajo</option>
                  {activeWorkCenters.map((wc) => (
                    <option key={wc.id} value={wc.id}>{wc.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Estado inicial */}
            <div>
              <label className={lc}>Estado inicial</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {STAGE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleChange('stage', opt.value)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                      formData.stage === opt.value
                        ? 'border-gray-900 bg-gray-50 dark:bg-gray-800'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${opt.dot}`} />
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-tight">{opt.label}</span>
                    {formData.stage === opt.value && <Check className="w-3 h-3 text-gray-700 dark:text-gray-300 ml-auto flex-shrink-0" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Precios */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lc}>Precio total *</label>
                <div className="relative">
                  <CurrencyInput
                    required
                    value={formData.totalPrice}
                    onChange={v => handleChange('totalPrice', v)}
                    placeholder="25.000"
                    className={`${ic} pr-8`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm">€</span>
                </div>
              </div>
              <div>
                <label className={lc}>Señal / Importe pagado</label>
                <div className="relative">
                  <CurrencyInput
                    value={formData.depositPaid}
                    onChange={v => handleChange('depositPaid', v)}
                    placeholder="3.000"
                    className={`${ic} pr-8`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm">€</span>
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Importe recibido hasta ahora</p>
              </div>
            </div>

            {/* Forma de pago + tipo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lc}>Forma de pago</label>
                <select value={formData.paymentMethod} onChange={e => handleChange('paymentMethod', e.target.value)} className={ic}>
                  <option value="">Seleccionar…</option>
                  {PAYMENT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className={lc}>Tipo de operación</label>
                <select value={formData.operationType} onChange={e => handleChange('operationType', e.target.value)} className={ic}>
                  {OPERATION_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            {/* Entrega + responsable */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={lc}>Fecha entrega estimada</label>
                <input type="date" value={formData.expectedDelivery}
                  onChange={e => handleChange('expectedDelivery', e.target.value)} className={ic} />
              </div>
              <div>
                <label className={lc}>Responsable</label>
                <select value={formData.responsible} onChange={e => handleChange('responsible', e.target.value)} className={ic}>
                  {responsableList.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            {/* Notas */}
            <div>
              <label className={lc}>Notas</label>
              <textarea value={formData.notes} onChange={e => handleChange('notes', e.target.value)}
                placeholder="Condiciones especiales, observaciones de la operación…"
                rows={3}
                className="w-full border-2 border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none resize-none transition-colors" />
            </div>

            {/* Preview vehículo seleccionado */}
            {selectedVehicle && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-emerald-800">
                  <span className="font-semibold">{selectedVehicle.brand} {selectedVehicle.model} {selectedVehicle.year}</span>
                  {selectedVehicle.salePrice && <span className="text-emerald-600 ml-2">PVP: {selectedVehicle.salePrice.toLocaleString('es-ES')}€</span>}
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t-2 border-gray-100 dark:border-gray-800 flex-shrink-0">
          <button onClick={resetAndClose}
            className="flex-1 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm">
            Cancelar
          </button>
          <button
            type="submit"
            form="create-sale-form"
            disabled={!formData.vehicleId || !formData.clientId || !formData.totalPrice || isSubmitting}
            className="flex-1 py-3 bg-gray-900 hover:bg-black text-white font-semibold rounded-xl transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed">
            {isSubmitting ? 'Guardando...' : 'Crear venta'}
          </button>
        </div>
      </div>
    </div>
  );
}
