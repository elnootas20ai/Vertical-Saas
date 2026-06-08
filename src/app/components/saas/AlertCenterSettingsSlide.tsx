import type { ReactNode } from 'react';
import { useModalClose } from '../../hooks/useModalClose';
import { AlertCenterSettingsPanel } from './AlertCenterSettingsPanel';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  businessId: string;
  onSaved?: () => void;
}

/** Panel lateral de preferencias — mismo patrón que SAAS__FilterDrawer */
export function AlertCenterSettingsSlide({ isOpen, onClose, businessId, onSaved }: Props) {
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl z-[70] flex flex-col animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Personalizar alertas"
      >
        {!businessId ? (
          <div className="p-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">No se pudo identificar el negocio.</p>
            <button type="button" onClick={onClose} className="mt-4 text-sm font-medium text-gray-900 dark:text-white underline">
              Cerrar
            </button>
          </div>
        ) : (
          <AlertCenterSettingsPanel
            businessId={businessId}
            compact
            onBack={onClose}
            onSaved={() => {
              onSaved?.();
            }}
          />
        )}
      </div>
    </>
  );
}

/** Botón secundario Vertial (borde gris) */
export function VertialSecondaryButton({
  children,
  onClick,
  active,
  className = '',
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border-2 transition-colors ${
        active
          ? 'border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function VertialPrimaryButton({
  children,
  onClick,
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white transition-colors disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}
