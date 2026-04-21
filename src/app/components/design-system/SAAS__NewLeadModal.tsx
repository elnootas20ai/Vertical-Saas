import { useState, useEffect, useRef } from 'react';
import {
  X, User, Phone, Mail, Car, Wallet, Globe, StickyNote,
  ChevronRight, Check, AlertTriangle, ExternalLink, Store,
} from 'lucide-react';
import { useBusiness } from '../../context/BusinessContext';
import { useModalClose } from '../../hooks/useModalClose';

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  registrationPlate?: string;
}

interface DuplicateLead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: any) => void;
  vehicles: Vehicle[];
  onCheckDuplicates?: (phone: string, email: string) => Promise<DuplicateLead[]>;
  onViewLead?: (id: string) => void;
}

type Step = 1 | 2 | 3;

const STEPS = [
  { id: 1 as Step, label: 'Contacto' },
  { id: 2 as Step, label: 'Vehículo' },
  { id: 3 as Step, label: 'Detalle' },
];

const SOURCES = [
  { id: 'web',    label: 'Sitio web',   icon: '🌐' },
  { id: 'phone',  label: 'Teléfono',    icon: '📞' },
  { id: 'email',  label: 'Email',       icon: '✉️' },
  { id: 'social', label: 'Redes',       icon: '📱' },
  { id: 'ref',    label: 'Referido',    icon: '👥' },
  { id: 'walk',   label: 'Presencial',  icon: '🏠' },
];

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
      {children}
      {required && <span className="ml-0.5 text-red-400">*</span>}
    </label>
  );
}

function InputField({
  icon: Icon, type = 'text', placeholder, value, onChange, required,
}: {
  icon: React.ElementType; type?: string; placeholder: string;
  value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <div className="relative">
      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
      <input
        type={type}
        required={required}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-800 rounded-2xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-500 focus:border-gray-900 dark:focus:border-gray-500 focus:bg-white dark:focus:bg-gray-700 focus:outline-none transition-all"
      />
    </div>
  );
}

export function SAAS__NewLeadModal({ isOpen, onClose, onCreate, vehicles, onCheckDuplicates, onViewLead }: Props) {
  const { currentBusiness } = useBusiness();
  const branches = currentBusiness?.branches ?? [];
  const [step, setStep] = useState<Step>(1);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    vehicleInterestId: '',
    vehicleInterest: '',
    budget: '',
    source: 'web',
    notes: '',
    responsible: 'Juan García',
    branch_id: '',
  });
  const [duplicates, setDuplicates] = useState<DuplicateLead[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicatesDismissed, setDuplicatesDismissed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!onCheckDuplicates || duplicatesDismissed) return;
    const phone = formData.phone.trim();
    const email = formData.email.trim();
    if (!phone && !email) { setDuplicates([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setCheckingDuplicates(true);
      try {
        const found = await onCheckDuplicates(phone, email);
        setDuplicates(found);
      } catch {
        setDuplicates([]);
      } finally {
        setCheckingDuplicates(false);
      }
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [formData.phone, formData.email, onCheckDuplicates, duplicatesDismissed]);

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const set = (field: string, value: string) => {
    if (field === 'phone' || field === 'email') setDuplicatesDismissed(false);
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleVehicleSelect = (id: string) => {
    const v = vehicles.find(v => v.id === id);
    if (v) {
      set('vehicleInterestId', id);
      set('vehicleInterest', `${v.brand} ${v.model} ${v.year}`);
    } else {
      set('vehicleInterestId', '');
    }
  };

  const handleSubmit = () => {
    const sourceLabel = SOURCES.find(s => s.id === formData.source)?.label ?? formData.source;
    onCreate({ ...formData, source: sourceLabel, branch_id: formData.branch_id || undefined });
    onClose();
    setStep(1);
    setDuplicates([]);
    setDuplicatesDismissed(false);
    setFormData({ name: '', phone: '', email: '', vehicleInterestId: '', vehicleInterest: '', budget: '', source: 'web', notes: '', responsible: 'Juan García', branch_id: '' });
  };

  const canNext1 = formData.name.trim() && formData.phone.trim() && formData.email.trim();
  const canNext2 = formData.vehicleInterest.trim();
  const hasDuplicates = duplicates.length > 0 && !duplicatesDismissed;

  const progressW = step === 1 ? 'w-1/3' : step === 2 ? 'w-2/3' : 'w-full';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="px-6 pt-6 pb-4 flex-shrink-0">
          {/* Drag handle (mobile) */}
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5 sm:hidden" />

          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Nuevo lead</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Paso {step} de 3 · {STEPS[step - 1].label}</p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-2xl transition-colors"
            >
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-2 mb-4">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 flex-1 last:flex-none">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${
                  step > s.id
                    ? 'bg-gray-900 text-white'
                    : step === s.id
                    ? 'bg-gray-900 text-white ring-4 ring-gray-200'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                }`}>
                  {step > s.id ? <Check className="w-3.5 h-3.5" /> : s.id}
                </div>
                <span className={`text-xs font-semibold hidden sm:block ${step >= s.id ? 'text-gray-900 dark:text-gray-100' : 'text-gray-300'}`}>{s.label}</span>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 rounded-full transition-all ${step > s.id ? 'bg-gray-900' : 'bg-gray-100 dark:bg-gray-700'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className={`h-full bg-gray-900 rounded-full transition-all duration-500 ${progressW}`} />
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-2">

          {/* Step 1 – Contacto */}
          {step === 1 && (
            <div className="space-y-4 py-2">
              <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                <p className="text-xs font-semibold text-blue-600 mb-3 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Información de contacto
                </p>
                <div className="space-y-3">
                  <div>
                    <Label required>Nombre completo</Label>
                    <InputField icon={User} placeholder="Carlos Martínez Ruiz" value={formData.name} onChange={v => set('name', v)} required />
                  </div>
                  <div>
                    <Label required>Teléfono</Label>
                    <InputField icon={Phone} type="tel" placeholder="654 321 789" value={formData.phone} onChange={v => set('phone', v)} required />
                  </div>
                  <div>
                    <Label required>Email</Label>
                    <InputField icon={Mail} type="email" placeholder="carlos@email.com" value={formData.email} onChange={v => set('email', v)} required />
                  </div>
                </div>
              </div>

              {/* Duplicate warning */}
              {checkingDuplicates && (
                <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 px-1">
                  <div className="w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  Verificando duplicados...
                </div>
              )}
              {hasDuplicates && (
                <div className="p-4 bg-amber-50 rounded-2xl border-2 border-amber-200">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <p className="text-xs font-bold text-amber-700">
                        {duplicates.length === 1 ? 'Lead duplicado detectado' : `${duplicates.length} leads duplicados detectados`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDuplicatesDismissed(true)}
                      className="text-xs text-amber-600 hover:text-amber-800 underline flex-shrink-0"
                    >
                      Ignorar
                    </button>
                  </div>
                  <div className="space-y-2">
                    {duplicates.slice(0, 3).map(d => (
                      <div key={d.id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl px-3 py-2 border border-amber-100">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{d.name}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{d.phone}{d.email ? ` · ${d.email}` : ''}</p>
                        </div>
                        {onViewLead && (
                          <button
                            type="button"
                            onClick={() => { onClose(); onViewLead(d.id); }}
                            className="ml-2 flex-shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold"
                          >
                            Ver <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-amber-600 mt-2">¿Seguro que quieres crear un lead nuevo?</p>
                </div>
              )}

              <div>
                <Label>Responsable</Label>
                <select
                  value={formData.responsible}
                  onChange={e => set('responsible', e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-800 rounded-2xl text-sm text-gray-900 dark:text-gray-100 focus:border-gray-900 focus:bg-white focus:outline-none transition-all"
                >
                  <option>Juan García</option>
                  <option>María López</option>
                  <option>Carlos Ruiz</option>
                </select>
              </div>

              {branches.length > 0 && (
                <div>
                  <Label>Punto de Venta</Label>
                  <div className="relative">
                    <Store className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                    <select
                      value={formData.branch_id}
                      onChange={e => set('branch_id', e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-800 rounded-2xl text-sm text-gray-900 dark:text-gray-100 focus:border-gray-900 focus:bg-white focus:outline-none transition-all"
                    >
                      <option value="">Sin punto de venta</option>
                      {branches.map(b => (
                        <option key={b.branch_id} value={b.branch_id}>{b.name}{b.city ? ` — ${b.city}` : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2 – Vehículo */}
          {step === 2 && (
            <div className="space-y-4 py-2">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                <p className="text-xs font-semibold text-emerald-600 mb-3 flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5" /> Vehículo de interés
                </p>
                <div className="space-y-3">
                  {vehicles.length > 0 && (
                    <div>
                      <Label>Seleccionar del stock</Label>
                      <select
                        value={formData.vehicleInterestId}
                        onChange={e => handleVehicleSelect(e.target.value)}
                        className="w-full px-4 py-3 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-800 rounded-2xl text-sm text-gray-900 dark:text-gray-100 focus:border-gray-900 focus:outline-none transition-all"
                      >
                        <option value="">— Seleccionar vehículo —</option>
                        {vehicles.slice(0, 10).map(v => (
                          <option key={v.id} value={v.id}>
                            {v.brand} {v.model} {v.year}{v.registrationPlate ? ` · ${v.registrationPlate}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <Label required>O describe el vehículo</Label>
                    <InputField
                      icon={Car}
                      placeholder="BMW Serie 3 2020"
                      value={formData.vehicleInterest}
                      onChange={v => { set('vehicleInterest', v); if (v) set('vehicleInterestId', ''); }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>Presupuesto aproximado</Label>
                <InputField icon={Wallet} placeholder="25.000€" value={formData.budget} onChange={v => set('budget', v)} />
              </div>
            </div>
          )}

          {/* Step 3 – Detalle */}
          {step === 3 && (
            <div className="space-y-4 py-2">
              {/* Source selector */}
              <div>
                <Label>Origen del lead</Label>
                <div className="grid grid-cols-3 gap-2">
                  {SOURCES.map(src => (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => set('source', src.id)}
                      className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl border-2 text-xs font-semibold transition-all ${
                        formData.source === src.id
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <span className="text-lg leading-none">{src.icon}</span>
                      {src.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Notas internas</Label>
                <div className="relative">
                  <StickyNote className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400 dark:text-gray-500" />
                  <textarea
                    value={formData.notes}
                    onChange={e => set('notes', e.target.value)}
                    placeholder="Información adicional sobre el lead..."
                    rows={4}
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-800 rounded-2xl text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-300 focus:border-gray-900 focus:bg-white focus:outline-none transition-all resize-none"
                  />
                </div>
              </div>

              {/* Summary card */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-2">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Resumen</p>
                {[
                  { label: 'Nombre',   value: formData.name || '—' },
                  { label: 'Teléfono', value: formData.phone || '—' },
                  { label: 'Email',    value: formData.email || '—' },
                  { label: 'Vehículo', value: formData.vehicleInterest || '—' },
                  { label: 'Presup.',  value: formData.budget || '—' },
                  ...(branches.length > 0 ? [{ label: 'PDV', value: branches.find(b => b.branch_id === formData.branch_id)?.name || '—' }] : []),
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 dark:text-gray-500">{row.label}</span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[60%] text-right">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex gap-3 flex-shrink-0">
          {step > 1 ? (
            <button
              onClick={() => setStep((step - 1) as Step)}
              className="flex-1 py-3.5 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 text-gray-700 dark:text-gray-300 font-semibold rounded-2xl transition-colors text-sm"
            >
              Atrás
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 py-3.5 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-400 text-gray-700 dark:text-gray-300 font-semibold rounded-2xl transition-colors text-sm"
            >
              Cancelar
            </button>
          )}

          {step < 3 ? (
            <button
              onClick={() => setStep((step + 1) as Step)}
              disabled={step === 1 ? !canNext1 : !canNext2}
              className="flex-1 py-3.5 bg-gray-900 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2"
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="flex-1 py-3.5 bg-gray-900 hover:bg-black text-white font-semibold rounded-2xl transition-colors text-sm flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Crear lead
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
