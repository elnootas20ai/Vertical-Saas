import { ReactNode, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AlertTriangle } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';
import { isIosCustomerAccessOnlyApp } from '../../lib/appStoreCompliance';

interface CriticalActionButtonProps {
  children: ReactNode;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  actionName?: string;
}

export function CriticalActionButton({
  children,
  onClick,
  className = '',
  disabled = false,
  actionName = 'esta acción',
}: CriticalActionButtonProps) {
  const { canPerformCriticalAction, getAccessRestrictionMessage, subscription } = useApp();
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  useModalClose(showBlockedModal, () => setShowBlockedModal(false));
  const iosAccessOnly = isIosCustomerAccessOnlyApp();

  const handleClick = () => {
    if (!canPerformCriticalAction()) {
      setShowBlockedModal(true);
      return;
    }
    onClick();
  };

  const isBlocked = !canPerformCriticalAction();

  return (
    <>
      <button
        onClick={handleClick}
        className={`${className} ${isBlocked ? 'opacity-50 cursor-not-allowed' : ''}`}
        disabled={disabled}
        type="button"
      >
        {children}
      </button>

      {showBlockedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowBlockedModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-center mb-2">
              Acción bloqueada
            </h2>

            <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
              No puedes realizar {actionName} debido al estado de tu suscripción.
            </p>

            <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl mb-6">
              <div className="text-sm text-red-900">
                <strong>Estado actual:</strong> {subscription.status}
              </div>
              <div className="text-sm text-red-800 mt-2">
                {getAccessRestrictionMessage()}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowBlockedModal(false)}
                className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl font-medium transition-colors"
              >
                Cancelar
              </button>
              {!iosAccessOnly ? (
                <a
                  href="/saas/billing"
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium text-center transition-colors"
                >
                  Ir a facturación
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowBlockedModal(false)}
                  className="flex-1 px-4 py-3 bg-gray-900 text-white rounded-xl font-medium"
                >
                  Entendido
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
