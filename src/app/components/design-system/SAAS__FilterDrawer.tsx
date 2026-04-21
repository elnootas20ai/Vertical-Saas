import { X } from 'lucide-react';
import { ReactNode } from 'react';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  onApply?: () => void;
  onReset?: () => void;
}

export function SAAS__FilterDrawer({ isOpen, onClose, title, children, onApply, onReset }: Props) {
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>

        {/* Footer */}
        {(onApply || onReset) && (
          <div className="border-t border-gray-200 dark:border-gray-700 p-6 space-y-3">
            {onApply && (
              <button
                onClick={() => {
                  onApply();
                  onClose();
                }}
                className="w-full px-6 py-3 bg-gray-900 hover:bg-black text-white font-medium rounded-xl transition-colors"
              >
                Aplicar filtros
              </button>
            )}
            {onReset && (
              <button
                onClick={onReset}
                className="w-full px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
              >
                Restablecer
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
