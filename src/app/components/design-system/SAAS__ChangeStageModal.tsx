import { useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { SAAS__StageBadge, OperationStage } from './SAAS__StageBadge';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentStage: OperationStage;
  onConfirm: (newStage: OperationStage) => void;
}

const allStages: OperationStage[] = [
  'captacion',
  'revision',
  'puesta_punto',
  'publicacion',
  'negociacion',
  'reserva',
  'financiacion',
  'documentacion',
  'entrega',
  'postventa',
  'desguace',
];

export function SAAS__ChangeStageModal({ isOpen, onClose, currentStage, onConfirm }: Props) {
  const [selectedStage, setSelectedStage] = useState<OperationStage>(currentStage);
  const [notes, setNotes] = useState('');
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = () => {
    onConfirm(selectedStage);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Cambiar etapa</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Current stage */}
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Etapa actual</div>
            <SAAS__StageBadge stage={currentStage} />
          </div>

          {/* New stage selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Nueva etapa *
            </label>
            <div className="grid grid-cols-2 gap-3">
              {allStages.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => setSelectedStage(stage)}
                  disabled={stage === currentStage}
                  className={`p-3 border-2 rounded-xl transition-all ${
                    stage === currentStage
                      ? 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 opacity-50 cursor-not-allowed'
                      : selectedStage === stage
                      ? 'border-amber-500 bg-amber-50'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <SAAS__StageBadge stage={stage} />
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          {selectedStage !== currentStage && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-3 justify-center">
                <SAAS__StageBadge stage={currentStage} />
                <ArrowRight className="w-5 h-5 text-blue-600" />
                <SAAS__StageBadge stage={selectedStage} />
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Notas (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-amber-500 focus:outline-none resize-none"
              placeholder="Añade un comentario sobre el cambio de etapa..."
            />
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={selectedStage === currentStage}
            className="flex-1 px-6 py-3 bg-gray-900 hover:bg-black text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cambiar etapa
          </button>
        </div>
      </div>
    </div>
  );
}