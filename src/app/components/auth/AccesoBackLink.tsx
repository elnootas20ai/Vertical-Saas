import { ArrowLeft } from 'lucide-react';
import { VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';

type Props = {
  onClick: () => void;
  /** Texto del botón. Por defecto «Volver». */
  label?: string;
  /**
   * Esquina superior izquierda fija (páginas sin AccesoSplitLayout).
   * En el layout de acceso usa la barra sticky del shell.
   */
  fixed?: boolean;
};

/**
 * Retroceso acceso / landing: siempre a la izquierda, visible, mismo gesto Vertial.
 */
export function AccesoBackLink({ onClick, label = 'Volver', fixed = false }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`${VERTIAL_BTN_SECONDARY} !min-h-10 !gap-1.5 !px-3 !text-sm ${
        fixed
          ? 'fixed left-4 top-[max(1rem,env(safe-area-inset-top))] z-50 shadow-sm'
          : 'shrink-0'
      }`}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
      <span>{label}</span>
    </button>
  );
}
