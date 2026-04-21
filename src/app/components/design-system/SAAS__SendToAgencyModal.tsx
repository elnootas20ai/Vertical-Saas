import { useState } from 'react';
import { X, Send, Package, CheckCircle, AlertCircle } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Document {
  id: string;
  name: string;
  vehicleName?: string;
  clientName?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  document: Document;
  onSend: (data: any) => void;
}

const agencies = [
  { id: 'auto-tramites', name: 'Autotrámites SL', email: 'info@autotramites.es' },
  { id: 'gestoria-motor', name: 'Gestoría Motor Plus', email: 'contacto@gestoriamotor.com' },
  { id: 'rapid-car', name: 'Rapid Car Trámites', email: 'tramites@rapidcar.es' },
];

export function SAAS__SendToAgencyModal({ isOpen, onClose, document, onSend }: Props) {
  const [formData, setFormData] = useState({
    agencyId: 'auto-tramites',
    tramite: 'transferencia',
    urgent: false,
    includeDocuments: true,
    notes: '',
  });

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const selectedAgency = agencies.find(a => a.id === formData.agencyId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend({
      documentId: document.id,
      ...formData,
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
            <Send className="w-5 h-5 text-purple-600" />
            Enviar a gestoría
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Document Info */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <h3 className="font-semibold text-blue-900 mb-3">Documento a enviar</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-blue-700">Nombre:</span>
                <div className="font-semibold text-blue-900">{document.name}</div>
              </div>
              {document.vehicleName && (
                <div>
                  <span className="text-blue-700">Vehículo:</span>
                  <div className="font-semibold text-blue-900">{document.vehicleName}</div>
                </div>
              )}
              {document.clientName && (
                <div>
                  <span className="text-blue-700">Cliente:</span>
                  <div className="font-semibold text-blue-900">{document.clientName}</div>
                </div>
              )}
            </div>
          </div>

          {/* Info Banner */}
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
            <div className="flex items-start gap-3">
              <Package className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-purple-800">
                <div className="font-semibold mb-1">Generación de paquete PDF</div>
                <p>
                  Se generará un paquete PDF con todos los documentos necesarios y se 
                  marcará como <strong>"Enviado a gestoría"</strong> en el sistema.
                </p>
              </div>
            </div>
          </div>

          {/* Agency Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Gestoría destino *
            </label>
            <select
              value={formData.agencyId}
              onChange={(e) => handleChange('agencyId', e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-purple-500 focus:outline-none"
            >
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name} - {agency.email}
                </option>
              ))}
            </select>
          </div>

          {/* Tramite Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tipo de trámite *
            </label>
            <select
              value={formData.tramite}
              onChange={(e) => handleChange('tramite', e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-purple-500 focus:outline-none"
            >
              <option value="transferencia">Cambio de titularidad / Transferencia</option>
              <option value="matriculacion">Matriculación</option>
              <option value="baja-temporal">Baja temporal</option>
              <option value="baja-definitiva">Baja definitiva</option>
              <option value="duplicado">Duplicado de documentación</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          {/* Options */}
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-purple-300 transition-colors">
              <input
                type="checkbox"
                checked={formData.urgent}
                onChange={(e) => handleChange('urgent', e.target.checked)}
                className="mt-1 w-5 h-5 border-2 border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
              />
              <div>
                <div className="font-semibold text-gray-900 dark:text-gray-100">Trámite urgente</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Procesar con prioridad (puede tener coste adicional)
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-purple-300 transition-colors">
              <input
                type="checkbox"
                checked={formData.includeDocuments}
                onChange={(e) => handleChange('includeDocuments', e.target.checked)}
                className="mt-1 w-5 h-5 border-2 border-gray-300 rounded focus:ring-2 focus:ring-purple-500"
              />
              <div>
                <div className="font-semibold text-gray-900 dark:text-gray-100">Incluir todos los documentos relacionados</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Añadir al paquete todos los documentos del vehículo y cliente
                </div>
              </div>
            </label>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Instrucciones para la gestoría
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Información adicional o instrucciones especiales..."
              rows={3}
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-purple-500 focus:outline-none resize-none"
            />
          </div>

          {/* Preview */}
          <div className="p-5 bg-gradient-to-br from-purple-50 to-violet-50 border-2 border-purple-200 rounded-xl">
            <h3 className="font-bold text-purple-900 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5" />
              Paquete a generar
            </h3>

            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-purple-900">Documento principal</div>
                  <div className="text-sm text-purple-700">{document.name}</div>
                </div>
              </div>

              {formData.includeDocuments && (
                <>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold text-purple-900">Documentos del vehículo</div>
                      <div className="text-sm text-purple-700">Permiso de circulación, Ficha técnica</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold text-purple-900">Documentos del cliente</div>
                      <div className="text-sm text-purple-700">DNI/NIE, Justificante de domicilio</div>
                    </div>
                  </div>
                </>
              )}

              <div className="pt-3 mt-3 border-t border-purple-200">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-purple-700">Destino:</span>
                  <span className="font-semibold text-purple-900">{selectedAgency?.name}</span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-purple-700">Trámite:</span>
                  <span className="font-semibold text-purple-900">
                    {formData.tramite === 'transferencia' && 'Cambio de titularidad'}
                    {formData.tramite === 'matriculacion' && 'Matriculación'}
                    {formData.tramite === 'baja-temporal' && 'Baja temporal'}
                    {formData.tramite === 'baja-definitiva' && 'Baja definitiva'}
                    {formData.tramite === 'duplicado' && 'Duplicado de documentación'}
                    {formData.tramite === 'otro' && 'Otro'}
                  </span>
                </div>
                {formData.urgent && (
                  <div className="flex items-center gap-2 mt-2">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-semibold text-amber-700">Urgente</span>
                  </div>
                )}
              </div>
            </div>
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
            className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl transition-colors"
          >
            Generar paquete y enviar
          </button>
        </div>
      </div>
    </div>
  );
}
