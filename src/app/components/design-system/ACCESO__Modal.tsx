import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

export interface ACCESO__ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl';
  showCloseButton?: boolean;
  /** Barra inferior fija (no hace scroll con el contenido). Útil para CTAs en modales altos. */
  footer?: ReactNode;
  /** Más altura vertical (p. ej. formularios largos). */
  tall?: boolean;
  /** Más aire en el cuerpo del modal. */
  spaciousBody?: boolean;
}

export function ACCESO__Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  maxWidth = 'md',
  showCloseButton = true,
  footer,
  tall = false,
  spaciousBody = false,
}: ACCESO__ModalProps) {
  useModalClose(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
  };

  const maxHeightClass = tall ? 'max-h-[min(98vh,58rem)]' : 'max-h-[90vh]';
  const bodyPadding = spaciousBody
    ? footer
      ? 'px-6 sm:px-8 pt-4 pb-3'
      : 'px-6 sm:px-8 py-5'
    : footer
      ? 'p-6 pb-4'
      : 'p-6';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal: cabecera fija, cuerpo con scroll, pie fijo opcional */}
      <div
        className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full ${maxWidthClasses[maxWidth]} flex flex-col ${maxHeightClass} overflow-hidden`}
      >
        {showCloseButton && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        )}
        
        {title && (
          <div className={`shrink-0 border-b border-gray-200 dark:border-gray-700 pr-14 ${spaciousBody ? 'px-6 sm:px-8 pt-5 pb-3' : 'px-6 pt-6 pb-4'}`}>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>
          </div>
        )}
        
        <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${bodyPadding}`}>
          {children}
        </div>

        {footer ? (
          <div className={`shrink-0 border-t border-gray-200 dark:border-gray-700 py-4 bg-gray-50 dark:bg-gray-900/50 ${spaciousBody ? 'px-6 sm:px-8' : 'px-6'}`}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
