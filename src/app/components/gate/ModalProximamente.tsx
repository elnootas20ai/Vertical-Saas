import { Clock } from 'lucide-react';
import { ACCESO__Modal } from '../design-system/ACCESO__Modal';
import { ACCESO__Button } from '../design-system/ACCESO__Button';

interface ModalProximamenteProps {
  isOpen: boolean;
  onClose: () => void;
  verticalName?: string;
}

export function ModalProximamente({ isOpen, onClose, verticalName }: ModalProximamenteProps) {
  return (
    <ACCESO__Modal isOpen={isOpen} onClose={onClose} showCloseButton={false}>
      <div className="text-center py-6">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Próximamente</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {verticalName ? (
            <>
              La vertical <strong>{verticalName}</strong> estará disponible próximamente.
            </>
          ) : (
            'Esta funcionalidad estará disponible próximamente.'
          )}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Te notificaremos cuando esté lista para que puedas empezar a usarla.
        </p>
        <ACCESO__Button onClick={onClose} variant="primary">
          Entendido
        </ACCESO__Button>
      </div>
    </ACCESO__Modal>
  );
}
