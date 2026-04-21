import { useState } from 'react';
import { X, FileText, CheckCircle } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Sale {
  id: string;
  vehicleName: string;
  clientName: string;
  totalPrice: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale;
  onGenerate: (data: any) => void;
}

export function SAAS__GenerateDocumentsModal({ isOpen, onClose, sale, onGenerate }: Props) {
  const [selectedTemplates, setSelectedTemplates] = useState({
    contract: true,
    invoice: true,
    worksheet: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    if (isSubmitting) return;
    setError('');
    setIsSubmitting(true);
    try {
      await Promise.resolve(onGenerate({
        saleId: sale.id,
        templates: selectedTemplates,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No se pudieron generar los documentos';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTemplate = (template: keyof typeof selectedTemplates) => {
    setSelectedTemplates(prev => ({ ...prev, [template]: !prev[template] }));
  };

  const templates = [
    { id: 'contract' as const, name: 'Contrato de compraventa', icon: '📄', required: true },
    { id: 'invoice' as const, name: 'Factura de venta', icon: '🧾', required: true },
    { id: 'worksheet' as const, name: 'Hoja de encargo - Transferencia', icon: '📋', required: false },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Generar documentos de venta
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Sale Info */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <h3 className="font-semibold text-blue-900 mb-3">Venta seleccionada</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-blue-700">Vehículo:</span>
                <div className="font-semibold text-blue-900">{sale.vehicleName}</div>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">Cliente:</span>
                <div className="font-semibold text-blue-900">{sale.clientName}</div>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700">Precio:</span>
                <div className="font-semibold text-blue-900">{sale.totalPrice.toLocaleString()}€</div>
              </div>
            </div>
          </div>

          {/* Templates Selection */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Documentos a generar</h3>
            <div className="space-y-3">
              {templates.map((template) => (
                <label
                  key={template.id}
                  className={`flex items-start gap-3 cursor-pointer p-4 rounded-xl border-2 transition-all ${
                    selectedTemplates[template.id]
                      ? 'bg-green-50 border-green-500'
                      : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTemplates[template.id]}
                    onChange={() => toggleTemplate(template.id)}
                    disabled={template.required}
                    className="mt-1 w-5 h-5 border-2 border-gray-300 rounded focus:ring-2 focus:ring-green-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{template.icon}</span>
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{template.name}</div>
                      {template.required && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-800 text-xs font-semibold rounded-full">
                          Requerido
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {template.id === 'contract' && 'Contrato oficial de compraventa de vehículo'}
                      {template.id === 'invoice' && 'Factura oficial para el cliente'}
                      {template.id === 'worksheet' && 'Para gestionar el cambio de titularidad'}
                    </div>
                  </div>
                  {selectedTemplates[template.id] && (
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
            <h3 className="font-bold text-green-900 mb-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Los documentos se generarán automáticamente
            </h3>
            <div className="text-sm text-green-800 space-y-1">
              <p>• Todos los datos se auto-rellenarán desde la venta</p>
              <p>• Se crearán en la sección Documentos</p>
              <p>• Podrás descargarlos, firmarlos y enviarlos</p>
            </div>
          </div>
        </form>

        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 space-y-3">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <FileText className="w-5 h-5" />
            {isSubmitting ? 'Generando...' : 'Generar y abrir Documentos'}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
