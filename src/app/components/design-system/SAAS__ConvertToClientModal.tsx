import { useState } from 'react';
import { X, UserCheck, ArrowRight, User } from 'lucide-react';
import { getDniOrNieError } from '../../lib/dniCifValidator';
import { useModalClose } from '../../hooks/useModalClose';

interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  vehicleInterest?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead;
  onConvert: (data: any) => void;
}

export function SAAS__ConvertToClientModal({ isOpen, onClose, lead, onConvert }: Props) {
  const [formData, setFormData] = useState({
    dni: '',
    address: '',
    city: '',
    postalCode: '',
    consentDataProcessing: true,
    consentCommercial: false,
    consentThirdParty: false,
    notes: '',
  });
  const [dniError, setDniError] = useState<string | null>(null);

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleDniChange = (value: string) => {
    const upper = value.toUpperCase();
    handleChange('dni', upper);
    setDniError(upper ? getDniOrNieError(upper) : null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = getDniOrNieError(formData.dni);
    if (err) { setDniError(err); return; }
    onConvert({ 
      ...lead, 
      ...formData,
      status: 'active',
    });
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-green-600" />
            Convertir lead a cliente
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Lead Data Preview */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
              <User className="w-4 h-4" />
              Datos del lead
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-blue-700">Nombre:</span>
                <div className="font-semibold text-blue-900">{lead.name}</div>
              </div>
              <div>
                <span className="text-blue-700">Teléfono:</span>
                <div className="font-semibold text-blue-900">{lead.phone}</div>
              </div>
              <div className="col-span-2">
                <span className="text-blue-700">Email:</span>
                <div className="font-semibold text-blue-900">{lead.email}</div>
              </div>
              {lead.vehicleInterest && (
                <div className="col-span-2">
                  <span className="text-blue-700">Interés:</span>
                  <div className="font-semibold text-blue-900">{lead.vehicleInterest}</div>
                </div>
              )}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="p-3 bg-green-100 rounded-full">
              <ArrowRight className="w-6 h-6 text-green-600" />
            </div>
          </div>

          {/* Additional Client Data */}
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
            <h3 className="font-semibold text-green-900 mb-4">Información adicional del cliente</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  DNI/NIE *
                </label>
                <input
                  type="text"
                  required
                  value={formData.dni}
                  onChange={(e) => handleDniChange(e.target.value)}
                  placeholder="12345678A"
                  className={`w-full px-4 py-2.5 border-2 rounded-xl focus:outline-none font-mono font-bold transition-colors ${
                    dniError
                      ? 'border-red-300 focus:border-red-400'
                      : formData.dni && !dniError
                        ? 'border-green-400 focus:border-green-500'
                        : 'border-gray-200 dark:border-gray-700 focus:border-green-500'
                  }`}
                />
                {dniError && (
                  <p className="text-xs text-red-500 mt-1">{dniError}</p>
                )}
                {formData.dni && !dniError && (
                  <p className="text-xs text-green-600 mt-1">✓ DNI/NIE válido</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Dirección
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  placeholder="Calle Mayor 123, 2º A"
                  className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-green-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Ciudad
                </label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  placeholder="Madrid"
                  className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-green-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Código postal
                </label>
                <input
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) => handleChange('postalCode', e.target.value)}
                  placeholder="28001"
                  className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-green-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Notas
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  placeholder="Información adicional sobre el cliente..."
                  rows={3}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-green-500 focus:outline-none resize-none"
                />
              </div>
            </div>
          </div>

          {/* Consents */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <h3 className="font-semibold text-amber-900 mb-4">Consentimientos (RGPD)</h3>
            
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.consentDataProcessing}
                  onChange={(e) => handleChange('consentDataProcessing', e.target.checked)}
                  className="mt-1 w-5 h-5 border-2 border-gray-300 rounded focus:ring-2 focus:ring-green-500"
                />
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Tratamiento de datos *</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Consentimiento para procesar información personal (obligatorio)
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.consentCommercial}
                  onChange={(e) => handleChange('consentCommercial', e.target.checked)}
                  className="mt-1 w-5 h-5 border-2 border-gray-300 rounded focus:ring-2 focus:ring-green-500"
                />
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Comunicaciones comerciales</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Autoriza el envío de ofertas y novedades
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.consentThirdParty}
                  onChange={(e) => handleChange('consentThirdParty', e.target.checked)}
                  className="mt-1 w-5 h-5 border-2 border-gray-300 rounded focus:ring-2 focus:ring-green-500"
                />
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Cesión a terceros</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Autoriza compartir datos con partners colaboradores
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Info */}
          <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl">
            <p className="text-sm text-green-800">
              ✅ Al convertir este lead en cliente, se creará una nueva ficha de cliente con todos los datos y se marcará el lead como convertido.
            </p>
          </div>
        </form>

        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.consentDataProcessing || !formData.dni || Boolean(dniError)}
            className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Convertir a cliente
          </button>
        </div>
      </div>
    </div>
  );
}
