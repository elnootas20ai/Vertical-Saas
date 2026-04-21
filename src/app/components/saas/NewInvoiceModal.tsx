import { useState } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import {
  X, Receipt, Plus, Check, Search, ChevronDown,
  User, Trash2, Package, BadgePercent,
} from 'lucide-react';
import { getDniOrNieError, getCifError } from '../../lib/dniCifValidator';
import { NuevoClienteModal } from './NuevoClienteModal';

// ─── Types (exported) ─────────────────────────────────────────────────────────

export interface InvoiceClient {
  id: string;
  name: string;
  dni?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  status?: 'active' | 'inactive';
  responsible?: string;
  createdAt?: string;
  notes?: string;
  consents?: { dataProcessing: boolean; commercial: boolean; thirdParty: boolean };
  documentsCount?: number;
  vehiclesPurchased?: string[];
  vehiclesSold?: string[];
}

export interface Invoice {
  id: string;
  number: string;
  clientName: string;
  vehicleName: string;
  vehiclePlate: string;
  date: string;
  dueDate: string;
  total: number;
  paid: number;
  status: 'paid' | 'pending' | 'overdue' | 'draft';
}

export interface InvoiceLine {
  id: string;
  description: string;
  qty: number;
  price: number;
  tax: number;
}

// ─── Constants (exported) ─────────────────────────────────────────────────────

export const INV_PAY_METHODS = ['Transferencia', 'Efectivo', 'Tarjeta', 'Financiación', 'Bizum', 'PayPal', 'Otros'];
export const TAX_OPTIONS = [0, 4, 10, 21];

export const PREDEFINED_SERVICES: { category: string; items: { label: string; price: number; tax: number }[] }[] = [
  {
    category: 'Vehículo',
    items: [
      { label: 'Venta de vehículo',           price: 0,    tax: 21 },
      { label: 'Preparación y limpieza',       price: 150,  tax: 21 },
      { label: 'Transporte / entrega',         price: 200,  tax: 21 },
      { label: 'Inspección técnica (ITV)',      price: 75,   tax: 21 },
      { label: 'Reparación / taller',          price: 0,    tax: 21 },
    ],
  },
  {
    category: 'Garantía y seguros',
    items: [
      { label: 'Garantía adicional 1 año',     price: 399,  tax: 21 },
      { label: 'Garantía adicional 2 años',    price: 699,  tax: 21 },
      { label: 'Seguro todo riesgo (mensual)',  price: 89,   tax: 0  },
      { label: 'Seguro a terceros (mensual)',   price: 49,   tax: 0  },
    ],
  },
  {
    category: 'Trámites',
    items: [
      { label: 'Gestión de transferencia',     price: 120,  tax: 21 },
      { label: 'Cambio de titularidad',        price: 80,   tax: 21 },
      { label: 'Informe DGT',                  price: 25,   tax: 21 },
      { label: 'Trámites de documentación',    price: 60,   tax: 21 },
    ],
  },
  {
    category: 'Financiación',
    items: [
      { label: 'Comisión de apertura',         price: 0,    tax: 21 },
      { label: 'Gastos de estudio financiero', price: 50,   tax: 21 },
    ],
  },
];

// ─── Inline AddClientModal ────────────────────────────────────────────────────

export function AddClientModal({
  onClose,
  onAdd,
  zIndex = 'z-[70]',
}: {
  onClose: () => void;
  onAdd: (c: InvoiceClient) => void;
  zIndex?: string;
}) {
  const [clientType, setClientType] = useState<'particular' | 'empresa'>('particular');
  const [sendInvite, setSendInvite] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [form, setForm] = useState({
    name: '', phone: '', email: '',
    dni: '',
    razonSocial: '', cif: '', contactName: '',
    fiscalName: '', fiscalNif: '', fiscalAddress: '', fiscalCity: '', fiscalPostalCode: '', fiscalCountry: 'España',
    sameAsContact: false,
    address: '', city: '', postalCode: '',
    responsible: 'Juan García', notes: '',
    dataProcessing: false, commercial: false, thirdParty: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  const handleSameAsContact = (checked: boolean) => {
    if (checked) {
      setForm(f => ({
        ...f,
        sameAsContact: true,
        fiscalName: clientType === 'empresa' ? f.razonSocial : f.name,
        fiscalNif: clientType === 'empresa' ? f.cif : f.dni,
        fiscalAddress: f.address,
        fiscalCity: f.city,
        fiscalPostalCode: f.postalCode,
      }));
    } else {
      set('sameAsContact', false);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim())  e.name  = 'Obligatorio';
    if (!form.phone.trim()) e.phone = 'Obligatorio';
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Email no válido';
    if (sendInvite && !form.email.trim()) e.email = 'Requerido para enviar invitación';
    if (clientType === 'empresa') {
      if (!form.cif.trim()) {
        e.cif = 'Obligatorio';
      } else {
        const cifErr = getCifError(form.cif);
        if (cifErr) e.cif = cifErr;
      }
    } else if (form.dni.trim()) {
      const dniErr = getDniOrNieError(form.dni);
      if (dniErr) e.dni = dniErr;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const newClient: InvoiceClient = {
      id: `client-${Date.now()}`,
      name: form.name.trim(),
      dni: clientType === 'empresa' ? form.cif.trim() : form.dni.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address, city: form.city, postalCode: form.postalCode,
      status: 'active', responsible: form.responsible,
      createdAt: new Date().toISOString().split('T')[0], notes: form.notes,
      consents: { dataProcessing: form.dataProcessing, commercial: form.commercial, thirdParty: form.thirdParty },
      documentsCount: 0,
    };
    onAdd(newClient);
    if (sendInvite && form.email) { setInviteSent(true); return; }
    onClose();
  };

  const inp = (err?: string, disabled?: boolean) =>
    `w-full px-3.5 py-2.5 text-sm border-2 rounded-xl focus:outline-none transition-all ${
      disabled ? 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed border-gray-100 dark:border-gray-800'
      : err ? 'border-red-300 focus:border-red-400'
      : 'border-gray-200 dark:border-gray-700 focus:border-blue-500'
    }`;

  const Lbl = ({ label, id, req, err, children }: { label: string; id: string; req?: boolean; err?: string; children: React.ReactNode }) => (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
        {label}{req && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
    </div>
  );

  const Sec = ({ title }: { title: string }) => (
    <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">{title}</p>
  );

  if (inviteSent) return (
    <div className={`fixed inset-0 ${zIndex} flex items-end sm:items-center justify-center p-0 sm:p-4`}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl p-8 text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">¡Cliente creado!</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Invitación enviada a</p>
        <p className="text-sm font-semibold text-blue-600 mb-5">{form.email}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded-xl p-3 mb-6">
          El cliente recibirá un enlace seguro para completar sus datos personales, fiscales y firmar los consentimientos RGPD desde su dispositivo.
        </p>
        <button onClick={onClose} className="w-full py-3 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-semibold transition-colors">
          Entendido
        </button>
      </div>
    </div>
  );

  return (
    <div className={`fixed inset-0 ${zIndex} flex items-end sm:items-center justify-center p-0 sm:p-4`}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94dvh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Nuevo cliente</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500">Crear ficha de cliente</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
          <div className="px-6 py-5 space-y-5">

            {/* Tipo */}
            <div>
              <Sec title="Tipo de cliente" />
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: 'particular', label: 'Particular', icon: '👤', desc: 'Persona física' },
                  { id: 'empresa',    label: 'Empresa',    icon: '🏢', desc: 'Persona jurídica' },
                ] as const).map(opt => (
                  <button key={opt.id} type="button" onClick={() => setClientType(opt.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                      clientType === opt.id ? 'border-gray-900 bg-gray-900' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}>
                    <span className="text-xl">{opt.icon}</span>
                    <div className="flex-1">
                      <p className={`text-sm font-semibold ${clientType === opt.id ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>{opt.label}</p>
                      <p className={`text-xs ${clientType === opt.id ? 'text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>{opt.desc}</p>
                    </div>
                    {clientType === opt.id && <Check className="w-4 h-4 text-white flex-shrink-0" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Datos personales */}
            <div>
              <Sec title={clientType === 'empresa' ? 'Datos de la empresa' : 'Datos personales'} />
              <div className="space-y-3">
                {clientType === 'empresa' && (
                  <Lbl label="Razón social" id="razonSocial" req>
                    <input id="razonSocial" value={form.razonSocial} onChange={e => set('razonSocial', e.target.value)}
                      placeholder="Coches García S.L." className={inp()} />
                  </Lbl>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {clientType === 'empresa' ? (
                    <Lbl label="CIF" id="cif" req err={errors.cif}>
                      <input id="cif" value={form.cif} onChange={e => set('cif', e.target.value.toUpperCase())}
                        placeholder="B12345678" className={inp(errors.cif)} />
                    </Lbl>
                  ) : (
                    <Lbl label="DNI / NIE" id="dni" err={errors.dni}>
                      <input id="dni" value={form.dni} onChange={e => set('dni', e.target.value.toUpperCase())}
                        placeholder="12345678A" className={inp(errors.dni)} />
                    </Lbl>
                  )}
                  <Lbl label="Teléfono" id="phone" req err={errors.phone}>
                    <input id="phone" value={form.phone} onChange={e => set('phone', e.target.value)}
                      placeholder="666 000 000" className={inp(errors.phone)} />
                  </Lbl>
                </div>
                <Lbl label={clientType === 'empresa' ? 'Nombre del contacto principal' : 'Nombre completo'} id="name" req err={errors.name}>
                  <input id="name" value={form.name} onChange={e => set('name', e.target.value)}
                    placeholder={clientType === 'empresa' ? 'Nombre y apellidos' : 'Ej. Roberto Jiménez García'}
                    className={inp(errors.name)} />
                </Lbl>
                <Lbl label="Email" id="email" req={sendInvite} err={errors.email}>
                  <input id="email" type="email" value={form.email} onChange={e => set('email', e.target.value)}
                    placeholder="cliente@email.com" className={inp(errors.email)} />
                </Lbl>
              </div>
            </div>

            {/* Dirección */}
            <div>
              <Sec title="Dirección postal" />
              <div className="space-y-3">
                <Lbl label="Dirección" id="address">
                  <input id="address" value={form.address} onChange={e => set('address', e.target.value)}
                    placeholder="Calle, número, piso…" className={inp()} />
                </Lbl>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Lbl label="Ciudad" id="city">
                      <input id="city" value={form.city} onChange={e => set('city', e.target.value)}
                        placeholder="Madrid" className={inp()} />
                    </Lbl>
                  </div>
                  <Lbl label="C.P." id="postalCode">
                    <input id="postalCode" value={form.postalCode} onChange={e => set('postalCode', e.target.value)}
                      placeholder="28001" className={inp()} />
                  </Lbl>
                </div>
              </div>
            </div>

            {/* Datos fiscales */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <Sec title="Datos fiscales" />
                <label className="flex items-center gap-2 cursor-pointer -mt-3">
                  <button type="button" onClick={() => handleSameAsContact(!form.sameAsContact)}
                    className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-all flex-shrink-0 ${
                      form.sameAsContact ? 'bg-gray-900 border-gray-900' : 'border-gray-300'
                    }`}>
                    {form.sameAsContact && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                  </button>
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Mismos que contacto</span>
                </label>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Lbl label={clientType === 'empresa' ? 'Razón social fiscal' : 'Nombre fiscal'} id="fiscalName">
                    <input id="fiscalName" value={form.fiscalName} onChange={e => set('fiscalName', e.target.value)}
                      disabled={form.sameAsContact}
                      placeholder={clientType === 'empresa' ? 'Empresa S.L.' : 'Nombre completo'}
                      className={inp(undefined, form.sameAsContact)} />
                  </Lbl>
                  <Lbl label={clientType === 'empresa' ? 'CIF fiscal' : 'NIF'} id="fiscalNif">
                    <input id="fiscalNif" value={form.fiscalNif} onChange={e => set('fiscalNif', e.target.value)}
                      disabled={form.sameAsContact}
                      placeholder={clientType === 'empresa' ? 'B12345678' : '12345678A'}
                      className={inp(undefined, form.sameAsContact)} />
                  </Lbl>
                </div>
                <Lbl label="Dirección fiscal" id="fiscalAddress">
                  <input id="fiscalAddress" value={form.fiscalAddress} onChange={e => set('fiscalAddress', e.target.value)}
                    disabled={form.sameAsContact} placeholder="Dirección completa"
                    className={inp(undefined, form.sameAsContact)} />
                </Lbl>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Lbl label="Ciudad fiscal" id="fiscalCity">
                      <input id="fiscalCity" value={form.fiscalCity} onChange={e => set('fiscalCity', e.target.value)}
                        disabled={form.sameAsContact} placeholder="Madrid"
                        className={inp(undefined, form.sameAsContact)} />
                    </Lbl>
                  </div>
                  <Lbl label="C.P. fiscal" id="fiscalPostalCode">
                    <input id="fiscalPostalCode" value={form.fiscalPostalCode} onChange={e => set('fiscalPostalCode', e.target.value)}
                      disabled={form.sameAsContact} placeholder="28001"
                      className={inp(undefined, form.sameAsContact)} />
                  </Lbl>
                </div>
                <Lbl label="País" id="fiscalCountry">
                  <select id="fiscalCountry" value={form.fiscalCountry} onChange={e => set('fiscalCountry', e.target.value)}
                    disabled={form.sameAsContact} className={inp(undefined, form.sameAsContact) + ' bg-white dark:bg-gray-800'}>
                    {['España', 'Portugal', 'Francia', 'Alemania', 'Italia', 'Reino Unido', 'Otro'].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </Lbl>
              </div>
            </div>

            {/* Asignación */}
            <div>
              <Sec title="Asignación" />
              <div className="space-y-3">
                <Lbl label="Responsable" id="responsible">
                  <select id="responsible" value={form.responsible} onChange={e => set('responsible', e.target.value)}
                    className={inp() + ' bg-white dark:bg-gray-800'}>
                    {['Juan García', 'María López', 'Carlos Ruiz', 'Ana Torres'].map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </Lbl>
                <Lbl label="Notas" id="notes">
                  <textarea id="notes" value={form.notes} onChange={e => set('notes', e.target.value)}
                    placeholder="Observaciones sobre el cliente…" rows={2}
                    className={inp() + ' resize-none'} />
                </Lbl>
              </div>
            </div>

            {/* RGPD */}
            <div>
              <Sec title="Consentimientos RGPD" />
              <div className="space-y-2.5">
                {([
                  { key: 'dataProcessing', label: 'Tratamiento de datos personales', req: true },
                  { key: 'commercial',     label: 'Comunicaciones comerciales' },
                  { key: 'thirdParty',     label: 'Cesión a terceros' },
                ] as const).map(({ key, label, req }) => (
                  <label key={key} className="flex items-start gap-3 cursor-pointer group">
                    <button type="button" onClick={() => set(key, !form[key])}
                      className={`mt-0.5 w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center border-2 transition-all ${
                        form[key] ? 'bg-gray-900 border-gray-900' : 'border-gray-300 group-hover:border-gray-400'
                      }`}>
                      {form[key] && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </button>
                    <span className="text-sm text-gray-700 dark:text-gray-300 leading-tight">
                      {label}{req && <span className="text-red-500 ml-0.5">*</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Invitación portal */}
            <div className={`rounded-2xl border-2 transition-all overflow-hidden ${sendInvite ? 'border-blue-300 bg-blue-50' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'}`}>
              <button type="button" onClick={() => setSendInvite(v => !v)}
                className="w-full flex items-start gap-4 p-4 text-left">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                  sendInvite ? 'bg-blue-500' : 'bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700'
                }`}>
                  {sendInvite ? <Check className="w-5 h-5 text-white" strokeWidth={3} /> : <span className="text-lg">✉️</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${sendInvite ? 'text-blue-900' : 'text-gray-900 dark:text-gray-100'}`}>
                    Enviar invitación al portal del cliente
                  </p>
                  <p className={`text-xs mt-0.5 leading-relaxed ${sendInvite ? 'text-blue-700' : 'text-gray-400 dark:text-gray-500'}`}>
                    El cliente podrá completar sus datos, subir documentos y firmar consentimientos desde su móvil
                  </p>
                </div>
              </button>
              {sendInvite && (
                <div className="px-4 pb-4">
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-blue-200 p-3">
                    <p className="text-xs font-semibold text-blue-800 mb-2">El cliente podrá desde el portal:</p>
                    <ul className="space-y-1.5">
                      {[
                        'Completar sus datos personales y fiscales',
                        'Subir su DNI / documentación requerida',
                        'Firmar consentimientos RGPD digitalmente',
                        'Consultar el estado de sus vehículos y contratos',
                      ].map(item => (
                        <li key={item} className="flex items-start gap-2 text-xs text-blue-700">
                          <span className="text-blue-400 mt-0.5 flex-shrink-0">✓</span>{item}
                        </li>
                      ))}
                    </ul>
                    {!form.email && (
                      <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        ⚠️ Introduce el email del cliente para enviar la invitación
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 flex items-center gap-3 flex-shrink-0">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl transition-colors">
              Cancelar
            </button>
            <button type="submit"
              className={`flex-1 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors flex items-center justify-center gap-2 ${
                sendInvite ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-900 hover:bg-black'
              }`}>
              {sendInvite ? '✉️ Crear y enviar invitación' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── NewInvoiceModal ──────────────────────────────────────────────────────────

interface NewInvoiceModalProps {
  onClose: () => void;
  onAdd: (inv: Invoice) => void;
  clients: InvoiceClient[];
  /** Optional pre-fill values */
  initialClientId?: string;
  initialVehicleName?: string;
  initialVehiclePlate?: string;
  /** z-index class (default z-50) */
  zIndex?: string;
}

export function NewInvoiceModal({
  onClose,
  onAdd,
  clients: initialClients,
  initialClientId = '',
  initialVehicleName = '',
  initialVehiclePlate = '',
  zIndex = 'z-50',
}: NewInvoiceModalProps) {
  useModalClose(true, onClose);

  const [mode,         setMode]         = useState<'concepts' | 'services'>('concepts');
  const [clientId,     setClientId]     = useState(initialClientId);
  const [invoiceNum,   setInvoiceNum]   = useState(`FAC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`);
  const [issueDate,    setIssueDate]    = useState(new Date().toISOString().split('T')[0]);
  const [dueDate,      setDueDate]      = useState('');
  const [vehicleName,  setVehicleName]  = useState(initialVehicleName);
  const [vehiclePlate, setVehiclePlate] = useState(initialVehiclePlate);
  const [payMethod,    setPayMethod]    = useState('Transferencia');
  const [notes,        setNotes]        = useState('');
  const [lines,        setLines]        = useState<InvoiceLine[]>([
    { id: '1', description: '', qty: 1, price: 0, tax: 21 },
  ]);
  const [errors,        setErrors]        = useState<Record<string, string>>({});
  const [serviceSearch, setServiceSearch] = useState('');
  const [openCategory,  setOpenCategory]  = useState<string | null>(PREDEFINED_SERVICES[0].category);
  const [showAddClient, setShowAddClient] = useState(false);
  const [localClients,  setLocalClients]  = useState<InvoiceClient[]>([]);

  const clients = [...initialClients, ...localClients];

  const handleNewClient = (c: InvoiceClient) => {
    setLocalClients(prev => [...prev, c]);
    setClientId(c.id);
    setShowAddClient(false);
  };

  const addLine    = () => setLines(l => [...l, { id: Date.now().toString(), description: '', qty: 1, price: 0, tax: 21 }]);
  const removeLine = (id: string) => setLines(l => l.filter(x => x.id !== id));
  const updateLine = (id: string, key: keyof InvoiceLine, val: string | number) =>
    setLines(l => l.map(x => x.id === id ? { ...x, [key]: val } : x));
  const addService = (item: { label: string; price: number; tax: number }) =>
    setLines(l => [...l, { id: Date.now().toString(), description: item.label, qty: 1, price: item.price, tax: item.tax }]);

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const taxTotal = lines.reduce((s, l) => s + l.qty * l.price * (l.tax / 100), 0);
  const total    = subtotal + taxTotal;

  const filteredServices = PREDEFINED_SERVICES.map(cat => ({
    ...cat,
    items: serviceSearch ? cat.items.filter(i => i.label.toLowerCase().includes(serviceSearch.toLowerCase())) : cat.items,
  })).filter(cat => !serviceSearch || cat.items.length > 0);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!clientId)       e.client = 'Selecciona un cliente';
    if (total <= 0)      e.total  = 'Añade al menos un concepto con precio';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const client = clients.find(c => c.id === clientId);
    const inv: Invoice = {
      id: `inv-${Date.now()}`,
      number: invoiceNum,
      clientName: client?.name || '',
      vehicleName, vehiclePlate,
      date: issueDate,
      dueDate: dueDate || issueDate,
      total: Math.round(total),
      paid: 0,
      status: 'pending',
    };
    onAdd(inv);
    onClose();
  };

  const inp = (err?: string) =>
    `w-full px-3 py-2 text-sm border-2 rounded-xl focus:outline-none transition-all ${err ? 'border-red-300 focus:border-red-400' : 'border-gray-200 dark:border-gray-700 focus:border-blue-500'}`;

  return (
    <>
      <div className={`fixed inset-0 ${zIndex} flex items-end sm:items-center justify-center p-0 sm:p-4`}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white dark:bg-gray-800 w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[94dvh] overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
                <Receipt className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Nueva factura</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">{invoiceNum}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500 dark:text-gray-400" /></button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* ── Cabecera factura ── */}
              <div>
                <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Datos de la factura</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Nº Factura</label>
                    <input value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} className={inp()} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Método de pago</label>
                    <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className={inp() + ' bg-white dark:bg-gray-800'}>
                      {INV_PAY_METHODS.map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Fecha emisión</label>
                    <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inp()} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Fecha vencimiento</label>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inp()} />
                  </div>
                </div>
              </div>

              {/* ── Cliente ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Cliente</p>
                  <button type="button" onClick={() => setShowAddClient(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors">
                    <Plus className="w-3 h-3" /> Añadir cliente
                  </button>
                </div>

                {clientId ? (
                  <div className={`flex items-center gap-3 p-3 rounded-xl border-2 ${errors.client ? 'border-red-300' : 'border-emerald-400 bg-emerald-50'}`}>
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{clients.find(c => c.id === clientId)?.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{clients.find(c => c.id === clientId)?.dni}</p>
                    </div>
                    <button type="button" onClick={() => setClientId('')}
                      className="p-1.5 hover:bg-emerald-200 rounded-lg transition-colors flex-shrink-0">
                      <X className="w-3.5 h-3.5 text-emerald-700" />
                    </button>
                  </div>
                ) : (
                  <select value={clientId} onChange={e => setClientId(e.target.value)} className={inp(errors.client) + ' bg-white dark:bg-gray-800'}>
                    <option value="">— Seleccionar cliente —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name} · {c.dni}</option>)}
                  </select>
                )}
                {errors.client && <p className="text-xs text-red-500 mt-1">{errors.client}</p>}
              </div>

              {/* ── Vehículo ── */}
              <div>
                <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Vehículo <span className="text-gray-300 normal-case font-normal">(opcional)</span></p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Descripción</label>
                    <input value={vehicleName} onChange={e => setVehicleName(e.target.value)}
                      placeholder="BMW Serie 3 2022" className={inp()} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Matrícula</label>
                    <input value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)}
                      placeholder="1234-ABC" className={inp() + ' uppercase font-mono'} />
                  </div>
                </div>
              </div>

              {/* ── Modo de conceptos ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Conceptos</p>
                  <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-0.5 gap-0.5">
                    {([
                      { id: 'concepts' as const, icon: Package,      label: 'Manual' },
                      { id: 'services' as const, icon: BadgePercent, label: 'Servicios' },
                    ]).map(({ id, icon: Icon, label }) => (
                      <button key={id} type="button" onClick={() => setMode(id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                          mode === id ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm dark:shadow-gray-900/30' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}>
                        <Icon className="w-3.5 h-3.5" />{label}
                      </button>
                    ))}
                  </div>
                </div>

                {mode === 'services' && (
                  <div className="mb-3 space-y-2">
                    <div className="relative">
                      <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input value={serviceSearch} onChange={e => setServiceSearch(e.target.value)}
                        placeholder="Buscar servicio…"
                        className="w-full pl-9 pr-3 py-2 text-sm border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none" />
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto">
                      {filteredServices.map(cat => (
                        <div key={cat.category} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                          <button type="button" onClick={() => setOpenCategory(openCategory === cat.category ? null : cat.category)}
                            className="w-full flex items-center justify-between px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{cat.category}</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 dark:text-gray-500 transition-transform ${openCategory === cat.category ? 'rotate-180' : ''}`} />
                          </button>
                          {openCategory === cat.category && (
                            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                              {cat.items.map(item => (
                                <button key={item.label} type="button" onClick={() => addService(item)}
                                  className="w-full flex items-center justify-between px-3.5 py-2 hover:bg-emerald-50 transition-colors text-left">
                                  <span className="text-sm text-gray-800 dark:text-gray-200">{item.label}</span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {item.price > 0 && <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{item.price.toLocaleString('es-ES')}€</span>}
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500">IVA {item.tax}%</span>
                                    <Plus className="w-3.5 h-3.5 text-emerald-500" />
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tabla de líneas */}
                <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-12 gap-0 bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                    <div className="col-span-5 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Descripción</div>
                    <div className="col-span-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-center">Cant.</div>
                    <div className="col-span-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-right">Precio</div>
                    <div className="col-span-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-center">IVA</div>
                    <div className="col-span-1" />
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {lines.map(line => (
                      <div key={line.id} className="grid grid-cols-12 gap-1 px-3 py-2 items-center">
                        <div className="col-span-5">
                          <input value={line.description} onChange={e => updateLine(line.id, 'description', e.target.value)}
                            placeholder="Descripción del concepto"
                            className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-400" />
                        </div>
                        <div className="col-span-2">
                          <input type="number" min={1} value={line.qty} onChange={e => updateLine(line.id, 'qty', Number(e.target.value))}
                            className="w-full text-sm text-center border border-gray-200 dark:border-gray-700 rounded-lg px-1.5 py-1 focus:outline-none focus:border-blue-400" />
                        </div>
                        <div className="col-span-2">
                          <div className="relative">
                            <input type="number" min={0} step={0.01} value={line.price} onChange={e => updateLine(line.id, 'price', Number(e.target.value))}
                              className="w-full text-sm text-right border border-gray-200 dark:border-gray-700 rounded-lg pr-4 pl-1.5 py-1 focus:outline-none focus:border-blue-400" />
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500">€</span>
                          </div>
                        </div>
                        <div className="col-span-2">
                          <select value={line.tax} onChange={e => updateLine(line.id, 'tax', Number(e.target.value))}
                            className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-1 py-1 focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-800 text-right">
                            {TAX_OPTIONS.map(t => <option key={t} value={t}>{t}%</option>)}
                          </select>
                        </div>
                        <div className="col-span-1 flex justify-center">
                          {lines.length > 1 && (
                            <button type="button" onClick={() => removeLine(line.id)} className="p-1 hover:bg-red-50 rounded-lg">
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-800">
                    <button type="button" onClick={addLine}
                      className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Añadir línea
                    </button>
                    <div className="text-right space-y-0.5">
                      <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                        <span>Base: <strong>{subtotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</strong></span>
                        <span>IVA: <strong>{taxTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</strong></span>
                      </div>
                      <p className={`text-sm font-bold ${errors.total ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                        Total: {total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                      </p>
                    </div>
                  </div>
                </div>
                {errors.total && <p className="text-xs text-red-500 mt-1">{errors.total}</p>}
              </div>

              {/* Notas */}
              <div>
                <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Notas / condiciones</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Condiciones de pago, observaciones…"
                  className={inp() + ' resize-none'} />
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 flex gap-3 flex-shrink-0">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl transition-colors">
                Cancelar
              </button>
              <button type="submit"
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors flex items-center justify-center gap-2">
                <Receipt className="w-4 h-4" /> Crear factura
              </button>
            </div>
          </form>
        </div>
      </div>

      <NuevoClienteModal
        open={showAddClient}
        onClose={() => setShowAddClient(false)}
        onClientCreated={(client) => {
          handleNewClient(client as any);
          setShowAddClient(false);
        }}
        contexto="factura"
        vincularA={{ tipo: 'factura' }}
      />
    </>
  );
}
