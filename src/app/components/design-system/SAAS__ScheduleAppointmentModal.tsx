import { X, Calendar, Clock, MapPin, User, Car, FileText, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useModalClose } from '../../hooks/useModalClose';

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  registrationPlate: string;
  year?: number;
  color?: string;
  status: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  leadName: string;
  leadPhone: string;
  vehicleInterest?: string;
  vehicles?: Vehicle[];
  onSchedule: (appointment: AppointmentData) => void;
}

export interface AppointmentData {
  date: string;
  time: string;
  location: string;
  type: 'visit' | 'test_drive' | 'paperwork' | 'delivery';
  notes: string;
  vehicleId?: string;
  vehicleName?: string;
  vehiclePlate?: string;
}

const appointmentTypes = {
  visit: {
    label: 'Visita en concesionario',
    color: 'bg-blue-100 text-blue-800 border-blue-300',
    icon: '🏢',
  },
  test_drive: {
    label: 'Prueba de conducción',
    color: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: '🚗',
  },
  paperwork: {
    label: 'Firmar documentos',
    color: 'bg-purple-100 text-purple-800 border-purple-300',
    icon: '📄',
  },
  delivery: {
    label: 'Entrega del vehículo',
    color: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: '🎉',
  },
};

export function SAAS__ScheduleAppointmentModal({
  isOpen,
  onClose,
  leadName,
  leadPhone,
  vehicleInterest,
  vehicles = [],
  onSchedule,
}: Props) {
  const [formData, setFormData] = useState<AppointmentData>({
    date: '',
    time: '',
    location: 'Concesionario Principal',
    type: 'visit',
    notes: '',
    vehicleId: '',
    vehicleName: '',
    vehiclePlate: '',
  });

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const availableVehicles = vehicles.filter(
    (v) => v.status === 'available' || v.status === 'reserved',
  );

  const isTestDrive = formData.type === 'test_drive';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isTestDrive && !formData.vehicleId) return;
    onSchedule(formData);
    onClose();
    setFormData({
      date: '',
      time: '',
      location: 'Concesionario Principal',
      type: 'visit',
      notes: '',
      vehicleId: '',
      vehicleName: '',
      vehiclePlate: '',
    });
  };

  const handleVehicleChange = (vehicleId: string) => {
    const v = availableVehicles.find((x) => x.id === vehicleId);
    setFormData({
      ...formData,
      vehicleId,
      vehicleName: v ? `${v.brand} ${v.model}` : '',
      vehiclePlate: v?.registrationPlate || '',
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className={`sticky top-0 px-6 py-6 rounded-t-2xl ${
            isTestDrive
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600'
              : 'bg-gradient-to-r from-amber-600 to-orange-600'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">Programar cita</h2>
                <p className="text-white/80 text-sm">{leadName} · {leadPhone}</p>
                {vehicleInterest && !isTestDrive && (
                  <p className="text-white/80 text-sm font-medium mt-1 flex items-center gap-1">
                    <Car className="w-3.5 h-3.5" />
                    Interés: {vehicleInterest}
                  </p>
                )}
                {isTestDrive && formData.vehicleName && (
                  <p className="text-white font-semibold text-sm mt-1 flex items-center gap-1">
                    <Car className="w-3.5 h-3.5" />
                    Prueba: {formData.vehicleName}
                    {formData.vehiclePlate && <span className="opacity-80 ml-1">({formData.vehiclePlate})</span>}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Appointment Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Tipo de cita
              </label>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(appointmentTypes).map(([key, { label, color, icon }]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: key as AppointmentData['type'] })}
                    className={`px-4 py-3 rounded-xl border-2 font-medium transition-all text-sm flex items-center gap-2 ${
                      formData.type === key
                        ? color + ' border-current'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <span>{icon}</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Vehicle Selection (test drive only) */}
            {isTestDrive && (
              <div className="border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Car className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <h4 className="font-semibold text-emerald-800 dark:text-emerald-200 text-sm">Vehículo para la prueba</h4>
                  <span className="text-xs text-red-500 font-medium">* obligatorio</span>
                </div>

                {availableVehicles.length === 0 ? (
                  <div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                    ⚠️ No hay vehículos disponibles en este momento.
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      required
                      value={formData.vehicleId}
                      onChange={(e) => handleVehicleChange(e.target.value)}
                      className="w-full px-4 py-3 pr-10 border-2 border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors text-sm appearance-none"
                    >
                      <option value="">Seleccionar vehículo a probar...</option>
                      {availableVehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.brand} {v.model} {v.year ? `(${v.year})` : ''} · {v.registrationPlate}
                          {v.color ? ` · ${v.color}` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                  </div>
                )}

                {formData.vehicleId && (
                  <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                    {formData.vehicleName}
                    {formData.vehiclePlate && (
                      <span className="text-xs bg-emerald-200 dark:bg-emerald-800 px-2 py-0.5 rounded-full font-mono">
                        {formData.vehiclePlate}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Date and Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Fecha
                </label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Hora
                </label>
                <input
                  type="time"
                  required
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <MapPin className="w-4 h-4 inline mr-1" />
                Ubicación
              </label>
              <select
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="Concesionario Principal">Concesionario Principal</option>
                <option value="Concesionario Norte">Concesionario Norte</option>
                <option value="Concesionario Sur">Concesionario Sur</option>
                <option value="Taller Central">Taller Central</option>
                <option value="A domicilio">A domicilio</option>
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <FileText className="w-4 h-4 inline mr-1" />
                Notas adicionales
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                placeholder={
                  isTestDrive
                    ? 'Ruta de prueba, documentos necesarios, preferencias del cliente...'
                    : 'Recordatorios, preparación necesaria, documentos a traer...'
                }
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:border-blue-500 transition-colors resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isTestDrive && !formData.vehicleId}
                className={`flex-1 px-6 py-3 text-white rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isTestDrive
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-gray-900 hover:bg-black'
                }`}
              >
                Programar cita
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
