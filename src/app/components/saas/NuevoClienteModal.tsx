import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, User, Phone, Mail, MapPin, FileText, CreditCard, Plus,
  Trash2, AlertTriangle, Check, ChevronDown, Building2, Merge,
  Info, Trophy,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModalClose } from '../../hooks/useModalClose';
import { useClientDuplicateSearch } from '../../hooks/useClientDuplicateSearch';
import { createClientRequest } from '../../lib/crmApi';
import { getDniOrNieError, getCifError } from '../../lib/dniCifValidator';
import type { Client, ClientAddress, PaymentMethod, ClientCreatedFrom } from '../../context/AppContext';

// ─── Types ──────────────────────────────────────────────────────────────────

type Contexto = 'crm' | 'tpv' | 'pedido' | 'presupuesto' | 'factura' | 'vertical';
type Perfil = 'gerente' | 'trabajador';

interface NuevoClienteModalProps {
  open: boolean;
  onClose: () => void;
  onClientCreated: (client: Client) => void;
  contexto?: Contexto;
  initialData?: Partial<Client>;
  vincularA?: { tipo: 'presupuesto' | 'pedido' | 'venta' | 'factura'; id?: string; label?: string };
  perfil?: Perfil;
}

interface AddressForm {
  id: string;
  label: string;
  street: string;
  city: string;
  postalCode: string;
}

const MANAGER_ROLES = ['Admin', 'Gerente', 'Comercial', 'Administración'];

const PAYMENT_OPTIONS: { value: PaymentMethod | ''; label: string }[] = [
  { value: '', label: 'Sin definir' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'domiciliacion', label: 'Domiciliación' },
  { value: 'bizum', label: 'Bizum' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'pagare', label: 'Pagaré' },
  { value: 'confirming', label: 'Confirming' },
  { value: 'otro', label: 'Otro' },
];

const CONTEXT_LABELS: Record<Contexto, { title: string; primaryBtn: string }> = {
  crm:          { title: 'Nuevo Cliente',                    primaryBtn: 'Guardar cliente' },
  tpv:          { title: 'Nuevo Cliente — TPV',              primaryBtn: 'Guardar y volver a la venta' },
  pedido:       { title: 'Nuevo Cliente — Pedido',           primaryBtn: 'Guardar y asignar al pedido' },
  presupuesto:  { title: 'Nuevo Cliente — Presupuesto',      primaryBtn: 'Guardar y continuar' },
  factura:      { title: 'Nuevo Cliente — Factura',          primaryBtn: 'Guardar y asignar a factura' },
  vertical:     { title: 'Nuevo Cliente',                    primaryBtn: 'Guardar y continuar' },
};

function emptyAddress(): AddressForm {
  return { id: `addr-${Date.now()}`, label: '', street: '', city: '', postalCode: '' };
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
      {children}
      {required && <span className="ml-0.5 text-red-400">*</span>}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-500 dark:text-red-400">{message}</p>;
}

function FieldWarning({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{message}</p>;
}

function InputWithIcon({
  icon: Icon, type = 'text', placeholder, value, onChange, error, suffix, disabled,
}: {
  icon: React.ElementType; type?: string; placeholder: string;
  value: string; onChange: (v: string) => void; error?: string;
  suffix?: React.ReactNode; disabled?: boolean;
}) {
  return (
    <div>
      <div className="relative">
        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full pl-10 ${suffix ? 'pr-10' : 'pr-4'} py-3 bg-gray-50 dark:bg-gray-800 border-2 ${
            error ? 'border-red-300 dark:border-red-700' : 'border-gray-100 dark:border-gray-800'
          } rounded-2xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-500 focus:border-gray-900 dark:focus:border-gray-500 focus:bg-white dark:focus:bg-gray-700 focus:outline-none transition-all disabled:opacity-50`}
        />
        {suffix && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2">{suffix}</span>
        )}
      </div>
      <FieldError message={error} />
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function NuevoClienteModal({
  open, onClose, onClientCreated, contexto = 'crm',
  initialData, vincularA, perfil: perfilProp,
}: NuevoClienteModalProps) {
  const { user } = useAuth();
  const userId = user?.user_id || '';
  const effectivePerfil: Perfil = perfilProp || (MANAGER_ROLES.includes(user?.role || '') ? 'gerente' : 'trabajador');
  const isGerente = effectivePerfil === 'gerente';

  // ─── Form state ─────────────────────────────────────────────────────────
  const [clientType, setClientType] = useState<'particular' | 'empresa'>('particular');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [dni, setDni] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [notes, setNotes] = useState('');
  const [addresses, setAddresses] = useState<AddressForm[]>([emptyAddress()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showExtraAddresses, setShowExtraAddresses] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  // ─── DNI validation ─────────────────────────────────────────────────────
  const dniValidation = (() => {
    if (!dni.trim()) return null;
    const err = clientType === 'empresa' ? getCifError(dni) : getDniOrNieError(dni);
    return err ? { valid: false, message: err } : { valid: true, message: '' };
  })();

  // ─── Duplicate search ───────────────────────────────────────────────────
  const { duplicates, isSearching, matchedField, dismissed, clearDuplicates, dismissDuplicates } =
    useClientDuplicateSearch({ userId, phone, email, dni, enabled: open });

  const showDuplicateBanner = duplicates.length > 0 && !dismissed;

  // ─── Populate initial data ──────────────────────────────────────────────
  useEffect(() => {
    if (open && initialData) {
      if (initialData.clientType) setClientType(initialData.clientType);
      if (initialData.name) setName(initialData.name);
      if (initialData.phone) setPhone(initialData.phone);
      if (initialData.email) setEmail(initialData.email);
      if (initialData.dni) setDni(initialData.dni);
      if (initialData.defaultPaymentMethod) setPaymentMethod(initialData.defaultPaymentMethod);
      if (initialData.notes) setNotes(initialData.notes);
      if (initialData.addresses?.length) {
        setAddresses(initialData.addresses.map(a => ({
          id: a.id || `addr-${Date.now()}`,
          label: a.label || '',
          street: a.street || '',
          city: a.city || '',
          postalCode: a.postalCode || '',
        })));
      }
    }
  }, [open, initialData]);

  // ─── Reset on close ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setClientType('particular');
      setName('');
      setPhone('');
      setEmail('');
      setDni('');
      setPaymentMethod('');
      setNotes('');
      setAddresses([emptyAddress()]);
      setErrors({});
      setSaving(false);
      setShowExtraAddresses(false);
      clearDuplicates();
    }
  }, [open, clearDuplicates]);

  // ─── Focus name on open ────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setTimeout(() => nameRef.current?.focus(), 150);
    }
  }, [open]);

  useModalClose(open, onClose);

  // ─── Address helpers ────────────────────────────────────────────────────
  const updateAddress = (index: number, field: keyof AddressForm, value: string) => {
    setAddresses(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a));
  };

  const addAddress = () => {
    setAddresses(prev => [...prev, emptyAddress()]);
    setShowExtraAddresses(true);
  };

  const removeAddress = (index: number) => {
    if (addresses.length <= 1) return;
    setAddresses(prev => prev.filter((_, i) => i !== index));
  };

  // ─── Validate ──────────────────────────────────────────────────────────
  const validate = useCallback((): boolean => {
    const e: Record<string, string> = {};

    if (!name.trim()) e.name = 'El nombre es obligatorio';

    if (!phone.trim()) {
      e.phone = 'El teléfono es obligatorio';
    } else {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 9) e.phone = 'El teléfono debe tener al menos 9 dígitos';
      else if (!/^[\d\s+\-().]+$/.test(phone.trim())) e.phone = 'El teléfono contiene caracteres no válidos';
    }

    if (!addresses[0]?.street.trim()) e['address.0.street'] = 'La calle es obligatoria';

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      e.email = 'Email no válido';
    }

    addresses.forEach((addr, i) => {
      if (i > 0 && !addr.street.trim()) {
        e[`address.${i}.street`] = 'La calle es obligatoria';
      }
    });

    setErrors(e);
    return Object.keys(e).length === 0;
  }, [name, phone, email, addresses]);

  // ─── Use existing client ───────────────────────────────────────────────
  const handleUseExisting = (existingClient: Client) => {
    onClientCreated(existingClient);
    onClose();
  };

  // ─── Save ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    try {
      const clientAddresses: ClientAddress[] = addresses
        .filter(a => a.street.trim())
        .map((a, i) => ({
          id: a.id,
          label: a.label || (i === 0 ? 'Principal' : `Dirección ${i + 1}`),
          street: a.street.trim(),
          city: a.city.trim(),
          postalCode: a.postalCode.trim(),
          isPrimary: i === 0,
          usageCount: 0,
          lastUsedAt: null,
        }));

      const clientData: Partial<Client> = {
        clientType: isGerente ? clientType : 'particular',
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        address: clientAddresses[0]?.street || '',
        city: clientAddresses[0]?.city || '',
        postalCode: clientAddresses[0]?.postalCode || '',
        addresses: clientAddresses,
        notes: notes.trim(),
        status: 'active',
        tags: [],
      };

      if (isGerente) {
        clientData.dni = dni.trim();
        clientData.defaultPaymentMethod = paymentMethod;
      }

      (clientData as Record<string, unknown>).stats = {
        totalOrders: 0,
        lastOrderDate: null,
        orderFrequencyDays: 0,
        favoriteAddressId: null,
        totalSpent: 0,
        createdFrom: contexto as ClientCreatedFrom,
      };

      const result = await createClientRequest(userId, clientData as Client);

      if (result.client) {
        onClientCreated(result.client);
        onClose();
      }
    } catch {
      setErrors({ _form: 'Error al guardar el cliente. Inténtalo de nuevo.' });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const ctx = CONTEXT_LABELS[contexto] || CONTEXT_LABELS.crm;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ctx.title}
    >
      <div
        className="bg-white dark:bg-gray-900 w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4 flex-shrink-0 border-b border-gray-100 dark:border-gray-800">
          <div className="w-10 h-1 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto mb-4 sm:hidden" />
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{ctx.title}</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                Rellena los datos para dar de alta un nuevo cliente
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-2xl transition-colors"
            >
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* ── Body (scrollable) ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Error global */}
          {errors._form && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{errors._form}</p>
            </div>
          )}

          {/* ── Client type toggle (gerente only) ── */}
          {isGerente && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setClientType('particular')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-medium transition-all ${
                  clientType === 'particular'
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 shadow-sm'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <User className="w-4 h-4" />
                Particular
              </button>
              <button
                type="button"
                onClick={() => setClientType('empresa')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-medium transition-all ${
                  clientType === 'empresa'
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 shadow-sm'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Building2 className="w-4 h-4" />
                Empresa
              </button>
            </div>
          )}

          {/* ── Basic data ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Datos básicos
            </p>

            {/* Name */}
            <div>
              <Label required>{clientType === 'empresa' ? 'Razón social' : 'Nombre completo'}</Label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                  ref={nameRef}
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={clientType === 'empresa' ? 'Empresa S.L.' : 'Juan Pérez García'}
                  className={`w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 ${
                    errors.name ? 'border-red-300 dark:border-red-700' : 'border-gray-100 dark:border-gray-800'
                  } rounded-2xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-500 focus:border-gray-900 dark:focus:border-gray-500 focus:bg-white dark:focus:bg-gray-700 focus:outline-none transition-all`}
                />
              </div>
              <FieldError message={errors.name} />
            </div>

            {/* Phone + Email row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label required>Teléfono</Label>
                <InputWithIcon
                  icon={Phone}
                  type="tel"
                  placeholder="+34 600 000 000"
                  value={phone}
                  onChange={setPhone}
                  error={errors.phone}
                  suffix={isSearching ? (
                    <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin block" />
                  ) : null}
                />
              </div>
              <div>
                <Label>Email</Label>
                <InputWithIcon
                  icon={Mail}
                  type="email"
                  placeholder="email@ejemplo.com"
                  value={email}
                  onChange={setEmail}
                  error={errors.email}
                />
              </div>
            </div>

            {/* Duplicate banner */}
            {showDuplicateBanner && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-2xl space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                      Posible duplicado por {matchedField === 'phone' ? 'teléfono' : matchedField === 'email' ? 'email' : 'DNI/CIF'}
                    </p>
                    {duplicates.map(dup => (
                      <div key={dup.id} className="mt-2 p-3 bg-white dark:bg-gray-800 rounded-xl">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{dup.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {dup.phone}{dup.email ? ` — ${dup.email}` : ''}
                        </p>
                        {dup.stats && dup.stats.totalOrders > 0 && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            {dup.stats.totalOrders} pedidos · Último: {dup.stats.lastOrderDate
                              ? new Date(dup.stats.lastOrderDate).toLocaleDateString('es-ES')
                              : '—'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleUseExisting(duplicates[0])}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-xl hover:bg-amber-700 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Usar este cliente
                  </button>
                  <button
                    type="button"
                    onClick={dismissDuplicates}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Crear nuevo igualmente
                  </button>
                  {isGerente && (
                    <button
                      type="button"
                      onClick={() => {
                        // TODO: Open DuplicatesMergeModal
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium rounded-xl border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                    >
                      <Merge className="w-3.5 h-3.5" />
                      Fusionar
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* DNI + Payment (gerente only) */}
            {isGerente && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>{clientType === 'empresa' ? 'CIF' : 'DNI / NIE'}</Label>
                  <InputWithIcon
                    icon={FileText}
                    placeholder={clientType === 'empresa' ? 'B12345678' : '12345678Z'}
                    value={dni}
                    onChange={setDni}
                    suffix={dniValidation ? (
                      dniValidation.valid
                        ? <Check className="w-4 h-4 text-emerald-500" />
                        : <X className="w-4 h-4 text-red-400" />
                    ) : null}
                  />
                  {dniValidation && !dniValidation.valid && (
                    <FieldError message={dniValidation.message} />
                  )}
                </div>
                <div>
                  <Label>Forma de pago habitual</Label>
                  <div className="relative">
                    <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <select
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value as PaymentMethod | '')}
                      className="w-full pl-10 pr-10 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-800 rounded-2xl text-sm text-gray-900 dark:text-gray-100 focus:border-gray-900 dark:focus:border-gray-500 focus:bg-white dark:focus:bg-gray-700 focus:outline-none appearance-none transition-all"
                    >
                      {PAYMENT_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Address ── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Dirección principal
            </p>

            {/* Primary address */}
            <div>
              <Label required>Calle</Label>
              <InputWithIcon
                icon={MapPin}
                placeholder="Calle Mayor 15, 3ºB"
                value={addresses[0]?.street || ''}
                onChange={v => updateAddress(0, 'street', v)}
                error={errors['address.0.street']}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Ciudad</Label>
                <input
                  type="text"
                  value={addresses[0]?.city || ''}
                  onChange={e => updateAddress(0, 'city', e.target.value)}
                  placeholder="Madrid"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-800 rounded-2xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-500 focus:border-gray-900 dark:focus:border-gray-500 focus:bg-white dark:focus:bg-gray-700 focus:outline-none transition-all"
                />
                {addresses[0]?.street && !addresses[0]?.city && (
                  <FieldWarning message="Recomendado: añadir ciudad" />
                )}
              </div>
              <div>
                <Label>Código postal</Label>
                <input
                  type="text"
                  value={addresses[0]?.postalCode || ''}
                  onChange={e => updateAddress(0, 'postalCode', e.target.value)}
                  placeholder="28001"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-800 rounded-2xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-500 focus:border-gray-900 dark:focus:border-gray-500 focus:bg-white dark:focus:bg-gray-700 focus:outline-none transition-all"
                />
                {addresses[0]?.street && !addresses[0]?.postalCode && (
                  <FieldWarning message="Recomendado: añadir CP" />
                )}
              </div>
            </div>

            <div>
              <Label>Etiqueta</Label>
              <input
                type="text"
                value={addresses[0]?.label || ''}
                onChange={e => updateAddress(0, 'label', e.target.value)}
                placeholder="Casa, Trabajo, Oficina..."
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-800 rounded-2xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-500 focus:border-gray-900 dark:focus:border-gray-500 focus:bg-white dark:focus:bg-gray-700 focus:outline-none transition-all"
              />
            </div>

            {/* Extra addresses (gerente only) */}
            {isGerente && (
              <>
                {showExtraAddresses && addresses.slice(1).map((addr, rawIdx) => {
                  const idx = rawIdx + 1;
                  return (
                    <div key={addr.id} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl space-y-3 relative">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                          Dirección {idx + 1}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeAddress(idx)}
                          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <InputWithIcon
                        icon={MapPin}
                        placeholder="Calle..."
                        value={addr.street}
                        onChange={v => updateAddress(idx, 'street', v)}
                        error={errors[`address.${idx}.street`]}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={addr.city}
                          onChange={e => updateAddress(idx, 'city', e.target.value)}
                          placeholder="Ciudad"
                          className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-500 focus:border-gray-900 dark:focus:border-gray-500 focus:outline-none transition-all"
                        />
                        <input
                          type="text"
                          value={addr.postalCode}
                          onChange={e => updateAddress(idx, 'postalCode', e.target.value)}
                          placeholder="CP"
                          className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-500 focus:border-gray-900 dark:focus:border-gray-500 focus:outline-none transition-all"
                        />
                      </div>
                      <input
                        type="text"
                        value={addr.label}
                        onChange={e => updateAddress(idx, 'label', e.target.value)}
                        placeholder="Etiqueta (ej: Oficina)"
                        className="w-full px-3 py-2.5 bg-white dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-500 focus:border-gray-900 dark:focus:border-gray-500 focus:outline-none transition-all"
                      />
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={addAddress}
                  className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Añadir otra dirección
                </button>
              </>
            )}
          </div>

          {/* ── Notes ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Observaciones
            </p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notas internas sobre el cliente..."
              rows={3}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-800 rounded-2xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-500 focus:border-gray-900 dark:focus:border-gray-500 focus:bg-white dark:focus:bg-gray-700 focus:outline-none transition-all resize-y"
            />
            <p className="text-xs text-gray-300 dark:text-gray-600">El cliente no verá estas observaciones.</p>
          </div>

          {/* ── Info banners ── */}
          {vincularA && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-2xl">
              <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Se vinculará automáticamente {vincularA.label ? `al ${vincularA.label}` : `al ${vincularA.tipo}`}
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 flex-shrink-0 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
          >
            Cancelar
          </button>
          {contexto !== 'crm' && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-2xl transition-colors disabled:opacity-50"
            >
              Guardar cliente
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-gray-900 dark:bg-gray-100 dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 rounded-2xl transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {ctx.primaryBtn}
          </button>
        </div>
      </div>
    </div>
  );
}
