import { useState } from 'react';
import { X, Send, FileText, CheckCircle } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  documents: string[];
  onSend: (notes: string) => void;
}

export function SAAS__SendToGestoriaModal({ isOpen, onClose, documents, onSend }: Props) {
  const [notes, setNotes] = useState('');

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleSend = () => {
    onSend(notes);
    setNotes('');
    onClose();
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

        <div className="p-6 space-y-6">
          {/* Documentos a enviar */}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Documentos a incluir ({documents.length})
            </h3>
            <div className="space-y-2">
              {documents.map((doc, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg"
                >
                  <FileText className="w-5 h-5 text-blue-600" />
                  <span className="flex-1 font-medium text-gray-900 dark:text-gray-100">{doc}</span>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
              ))}
            </div>
          </div>

          {/* Información del proceso */}
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
            <div className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
              📦 Proceso de envío
            </div>
            <ul className="text-sm text-purple-800 space-y-1">
              <li>✓ Se generará un paquete PDF con todos los documentos</li>
              <li>✓ Los documentos se marcarán como "Enviado a gestoría"</li>
              <li>✓ Se creará un registro en el historial</li>
              <li>✓ Se notificará al responsable de gestoría</li>
            </ul>
          </div>

          {/* Notas adicionales */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Notas adicionales (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-purple-500 focus:outline-none resize-none"
              placeholder="Instrucciones especiales, observaciones..."
            />
          </div>

          {/* Preview del paquete */}
          <div className="p-6 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-500 rounded-xl text-center">
            <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <div className="text-lg font-bold text-purple-900 mb-1">Paquete_Gestoria.pdf</div>
            <div className="text-sm text-purple-700">
              {documents.length} documento{documents.length !== 1 ? 's' : ''} incluido{documents.length !== 1 ? 's' : ''}
            </div>
            <div className="text-xs text-purple-600 mt-2">
              {new Date().toLocaleDateString('es-ES')}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSend}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium rounded-xl transition-all"
          >
            Generar y enviar
          </button>
        </div>
      </div>
    </div>
  );
}
