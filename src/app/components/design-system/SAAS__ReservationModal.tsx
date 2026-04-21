import { useState, useRef, useEffect, useMemo } from 'react';
import {
  X, Search, ChevronDown, User, Car, CalendarDays,
  DollarSign, UserPlus, Plus, Check, ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { useModalClose } from '../../hooks/useModalClose';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import {
  createReservation,
  updateReservation,
} from '../../lib/reservationApi';
import {
  PAYMENT_METHODS,
  type ReservationRecord,
  type CreateReservationPayload,
} from '../../lib/reservationTypes';

// ─── Currency helpers ─────────────────────────────────────────────────────────

function formatCurrencyDisplay(raw: string): string {
  if (!raw) return '';
  const parts = raw.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts.length > 1 ? `${intPart},${parts[1]}` : intPart;
}

function CurrencyInput({ value, onChange, placeholder, className }: {
  value: string; onChange: (raw: string) => void; placeholder?: string; className?: string;
}) {
  const [display, setDisplay] = useState(() => formatCurrencyDisplay(value));
  useEffect(() => { setDisplay(formatCurrencyDisplay(value)); }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const stripped = e.target.value.replace(/[^\d,]/g, '');
    const parts = stripped.split(',');
    const intStr = parts[0];
    const decStr = parts.length > 1 ? parts[1].slice(0, 2) : undefined;
    const formattedInt = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setDisplay(decStr !== undefined ? `${formattedInt},${decStr}` : formattedInt);
    onChange(decStr !== undefined ? `${intStr}.${decStr}` : intStr);
  };

  return (
    <input type="text" inputMode="decimal" value={display} onChange={handleChange}
      placeholder={placeholder} className={className} />
  );
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Vehicle {
  _id: string;
  brand?: string;
  model?: string;
  year?: number;
  registrationPlate?: string;
  salePrice?: number;
  status?: string;
  fuel?: string;
  mileage?: number;
  mainImage?: string;
}

interface Client {
  _id: string;
  name?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  dni?: string;
}

interface Props {
  open: boolean;
  editing: ReservationRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

// ─── Searchable Picker ────────────────────────────────────────────────────────

function SearchPicker<T extends { _id: string }>({ items, value, onChange, renderItem, renderSelected, placeholder, icon }: {
  items: T[]; value: string; onChange: (id: string, item: T | null) => void;
  renderItem: (item: T) => React.ReactNode; renderSelected: (item: T) => React.ReactNode;
  placeholder: string; icon: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const selected = items.find(i => i._id === value);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => { setOpen(v => !v); setSearch(''); }}
        className={`w-full flex items-center gap-3 px-3.5 py-2.5 border-2 rounded-xl text-left transition-colors ${
          open ? 'border-blue-500 ring-2 ring-blue-50 dark:ring-blue-900/30' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
        } bg-white dark:bg-gray-800`}>
        {selected ? renderSelected(selected) : (
          <>
            <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">{icon}</div>
            <span className="text-sm text-gray-400 dark:text-gray-500 flex-1">{placeholder}</span>
          </>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
                autoFocus
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {items.filter(i => {
              if (!search) return true;
              const q = search.toLowerCase();
              return JSON.stringify(i).toLowerCase().includes(q);
            }).map(item => (
              <button key={item._id} type="button"
                onClick={() => { onChange(item._id, item); setOpen(false); setSearch(''); }}
                className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2">
                {renderItem(item)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function SAAS__ReservationModal({ open, editing, onClose, onSaved }: Props) {
  const { vehicles: rawVehicles = [], clients: rawClients = [], currentBusiness } = useApp();
  const { user } = useAuth();

  const vehicles = useMemo(() => (rawVehicles as Vehicle[]), [rawVehicles]);
  const clients = useMemo(() => (rawClients as Client[]), [rawClients]);

  const teamMembers = useMemo(() => {
    const members = (currentBusiness as { members?: { fullName?: string; user_id?: string }[] })?.members || [];
    return members.map(m => ({ name: m.fullName || '', id: m.user_id || '' })).filter(m => m.name);
  }, [currentBusiness]);

  const today = new Date().toISOString().slice(0, 10);
  const defaultExpiration = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [vehicleId, setVehicleId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientDni, setClientDni] = useState('');
  const [vehicleName, setVehicleName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleYear, setVehicleYear] = useState<number | undefined>();
  const [depositAmount, setDepositAmount] = useState('');
  const [depositPaid, setDepositPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [reservationDate, setReservationDate] = useState(today);
  const [expirationDate, setExpirationDate] = useState(defaultExpiration);
  const [commercial, setCommercial] = useState(user?.fullName || '');
  const [commercialId, setCommercialId] = useState(user?.userId || '');
  const [observations, setObservations] = useState('');
  const [saving, setSaving] = useState(false);

  useModalClose(open, onClose);

  useEffect(() => {
    if (editing) {
      setVehicleId(editing.vehicleId);
      setClientId(editing.clientId);
      setClientName(editing.clientName);
      setClientPhone(editing.clientPhone);
      setClientEmail(editing.clientEmail);
      setClientDni(editing.clientDni);
      setVehicleName(editing.vehicleName);
      setVehiclePlate(editing.vehiclePlate);
      setVehicleYear(editing.vehicleYear);
      setDepositAmount(String(editing.depositAmount || ''));
      setDepositPaid(editing.depositPaid);
      setPaymentMethod(editing.paymentMethod);
      setReservationDate(editing.reservationDate || today);
      setExpirationDate(editing.expirationDate || defaultExpiration);
      setCommercial(editing.commercial);
      setCommercialId(editing.commercialId);
      setObservations(editing.observations);
    } else {
      setVehicleId('');
      setClientId('');
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setClientDni('');
      setVehicleName('');
      setVehiclePlate('');
      setVehicleYear(undefined);
      setDepositAmount('');
      setDepositPaid(false);
      setPaymentMethod('');
      setReservationDate(today);
      setExpirationDate(defaultExpiration);
      setCommercial(user?.fullName || '');
      setCommercialId(user?.userId || '');
      setObservations('');
    }
  }, [editing, open]);

  const availableVehicles = useMemo(() =>
    editing
      ? vehicles
      : vehicles.filter(v => !v.status || v.status === 'listo'),
    [vehicles, editing]
  );

  const handleVehicleSelect = (id: string, v: Vehicle | null) => {
    setVehicleId(id);
    if (v) {
      const name = [v.brand, v.model, v.year].filter(Boolean).join(' ');
      setVehicleName(name);
      setVehiclePlate(v.registrationPlate || '');
      setVehicleYear(v.year);
    }
  };

  const handleClientSelect = (id: string, c: Client | null) => {
    setClientId(id);
    if (c) {
      setClientName(c.fullName || c.name || '');
      setClientPhone(c.phone || '');
      setClientEmail(c.email || '');
      setClientDni(c.dni || '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId) { toast.error('Selecciona un vehículo'); return; }
    if (!clientId) { toast.error('Selecciona un cliente'); return; }
    const amount = parseFloat(depositAmount) || 0;
    if (amount <= 0) { toast.error('El importe de la señal debe ser mayor que 0'); return; }
    if (!expirationDate) { toast.error('La fecha de vencimiento es obligatoria'); return; }
    if (new Date(expirationDate) <= new Date(reservationDate)) { toast.error('El vencimiento debe ser posterior a la fecha de reserva'); return; }
    if (depositPaid && !paymentMethod) { toast.error('Si la señal está cobrada, indica la forma de pago'); return; }

    setSaving(true);
    try {
      if (editing) {
        await updateReservation({
          ...editing,
          vehicleId, vehicleName, vehiclePlate, vehicleYear,
          clientId, clientName, clientPhone, clientEmail, clientDni,
          depositAmount: amount, depositPaid, paymentMethod,
          reservationDate, expirationDate, commercial, commercialId,
          observations,
        });
        toast.success('Reserva actualizada');
      } else {
        const payload: CreateReservationPayload = {
          vehicleId, vehicleName, vehiclePlate, vehicleYear,
          clientId, clientName, clientPhone, clientEmail, clientDni,
          depositAmount: amount, depositPaid, paymentMethod,
          reservationDate, expirationDate, commercial, commercialId,
          observations,
        };
        await createReservation(payload);
        toast.success('Reserva creada correctamente');
      }
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-lg my-8">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {editing ? 'Editar reserva' : 'Nueva reserva'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Vehículo */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Vehículo *</label>
            <SearchPicker
              items={availableVehicles}
              value={vehicleId}
              onChange={handleVehicleSelect}
              placeholder="Seleccionar vehículo…"
              icon={<Car className="w-3.5 h-3.5 text-gray-400" />}
              renderSelected={(v) => (
                <>
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                    <Car className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{[v.brand, v.model, v.year].filter(Boolean).join(' ')}</p>
                    <p className="text-[11px] text-gray-400 truncate">{v.registrationPlate} {v.salePrice ? `· ${Number(v.salePrice).toLocaleString('es-ES')} €` : ''}</p>
                  </div>
                </>
              )}
              renderItem={(v) => (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{[v.brand, v.model, v.year].filter(Boolean).join(' ')}</p>
                  <p className="text-xs text-gray-400 truncate">{v.registrationPlate} {v.fuel ? `· ${v.fuel}` : ''} {v.mileage ? `· ${v.mileage.toLocaleString()} km` : ''}</p>
                </div>
              )}
            />
          </div>

          {/* Cliente */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Cliente *</label>
            <SearchPicker
              items={clients}
              value={clientId}
              onChange={handleClientSelect}
              placeholder="Seleccionar cliente…"
              icon={<User className="w-3.5 h-3.5 text-gray-400" />}
              renderSelected={(c) => (
                <>
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-white">{(c.fullName || c.name || '?').charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{c.fullName || c.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{c.phone} {c.email ? `· ${c.email}` : ''}</p>
                  </div>
                </>
              )}
              renderItem={(c) => (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{c.fullName || c.name}</p>
                  <p className="text-xs text-gray-400 truncate">{c.phone} {c.email ? `· ${c.email}` : ''}</p>
                </div>
              )}
            />
          </div>

          {/* Importe señal + switch cobrada */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Importe señal *</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <CurrencyInput value={depositAmount} onChange={setDepositAmount} placeholder="0"
                  className="w-full pl-9 pr-8 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm dark:text-gray-100 focus:border-blue-500 focus:ring-2 focus:ring-blue-50 dark:focus:ring-blue-900/30 outline-none" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">€</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Señal cobrada</label>
              <button type="button" onClick={() => setDepositPaid(v => !v)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 border-2 rounded-xl transition-colors ${
                  depositPaid
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}>
                <div className={`w-5 h-5 rounded-md flex items-center justify-center border-2 transition-colors ${
                  depositPaid ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                }`}>
                  {depositPaid && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </div>
                <span className="text-sm font-medium">{depositPaid ? 'Sí, cobrada' : 'No cobrada'}</span>
              </button>
            </div>
          </div>

          {/* Forma de pago */}
          {depositPaid && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Forma de pago *</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
                className="w-full px-3.5 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm dark:text-gray-100 focus:border-blue-500 outline-none">
                <option value="">Seleccionar…</option>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Fecha reserva *</label>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="date" value={reservationDate} onChange={e => setReservationDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm dark:text-gray-100 focus:border-blue-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Vencimiento *</label>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="date" value={expirationDate} onChange={e => setExpirationDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm dark:text-gray-100 focus:border-blue-500 outline-none" />
              </div>
            </div>
          </div>

          {/* Comercial */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Comercial *</label>
            <select value={commercialId} onChange={e => {
              setCommercialId(e.target.value);
              const m = teamMembers.find(t => t.id === e.target.value);
              setCommercial(m?.name || '');
            }}
              className="w-full px-3.5 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm dark:text-gray-100 focus:border-blue-500 outline-none">
              <option value="">Seleccionar…</option>
              {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              {!teamMembers.some(m => m.id === (user?.userId || '')) && user?.fullName && (
                <option value={user.userId || ''}>{user.fullName} (yo)</option>
              )}
            </select>
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Observaciones</label>
            <textarea value={observations} onChange={e => setObservations(e.target.value)} rows={3}
              placeholder="Notas o comentarios sobre la reserva…"
              className="w-full px-3.5 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-sm dark:text-gray-100 focus:border-blue-500 outline-none resize-none" />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-xl transition-colors flex items-center gap-2">
              {saving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {editing ? 'Guardar cambios' : 'Crear reserva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SAAS__ReservationModal;
