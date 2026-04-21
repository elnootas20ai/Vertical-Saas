import { useState } from 'react';
import { X, CheckCircle, AlertCircle } from 'lucide-react';
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
  onSign: (data: any) => void;
}

export function SAAS__SignDocumentModal({ isOpen, onClose, document, onSign }: Props) {
  const [formData, setFormData] = useState({
    signedBy: document.clientName || '',
    signedAt: new Date().toISOString().split('T')[0],
    notes: '',
    confirmPhysical: false,
  });

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSign({
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
            <CheckCircle className="w-5 h-5 text-green-600" />
            Marcar documento como firmado
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form id="saas-sign-document-modal-form" onSubmit={handleSubmit} className="p-6 space-y-6 pb-28">
          {/* Document Info */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <h3 className="font-semibold text-blue-900 mb-3">Documento a firmar</h3>
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
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <div className="font-semibold mb-1">Información importante</div>
                <p>
                  Esta acción marcará el documento como <strong>"Firmado"</strong> en el sistema. 
                  En esta versión MVP, no se utiliza firma electrónica. El documento quedará 
                  registrado con un sello de "Firmado" y los datos que introduzcas a continuación.
                </p>
              </div>
            </div>
          </div>

          {/* Signature Data */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Firmado por *
              </label>
              <input
                type="text"
                required
                value={formData.signedBy}
                onChange={(e) => handleChange('signedBy', e.target.value)}
                placeholder="Nombre del firmante"
                className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-green-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Fecha de firma *
              </label>
              <input
                type="date"
                required
                value={formData.signedAt}
                onChange={(e) => handleChange('signedAt', e.target.value)}
                className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-green-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Notas adicionales
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Ej: Firmado en presencia del vendedor, copia escaneada adjunta..."
                rows={3}
                className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-green-500 focus:outline-none resize-none"
              />
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.confirmPhysical}
                  onChange={(e) => handleChange('confirmPhysical', e.target.checked)}
                  className="mt-1 w-5 h-5 border-2 border-gray-300 rounded focus:ring-2 focus:ring-green-500"
                />
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">Confirmo que tengo el documento físico firmado *</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Es necesario conservar el documento original firmado para validez legal
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Preview of signature stamp */}
          <div className="p-5 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
            <h3 className="font-bold text-green-900 mb-3">Vista previa del sello</h3>
            <div className="p-4 bg-white dark:bg-gray-800 border-2 border-green-500 rounded-xl text-center">
              <div className="text-4xl mb-2">✅</div>
              <div className="text-2xl font-bold text-green-800 mb-2">FIRMADO</div>
              <div className="text-sm text-green-700 space-y-1">
                <div>Por: <strong>{formData.signedBy || '—'}</strong></div>
                <div>Fecha: <strong>{formData.signedAt ? new Date(formData.signedAt).toLocaleDateString('es-ES') : '—'}</strong></div>
              </div>
            </div>
          </div>
        </form>

        <div className="sticky bottom-0 z-20 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="saas-sign-document-modal-form"
            disabled={!formData.signedBy || !formData.signedAt || !formData.confirmPhysical}
            className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Marcar como firmado
          </button>
        </div>
      </div>
    </div>
  );
}
