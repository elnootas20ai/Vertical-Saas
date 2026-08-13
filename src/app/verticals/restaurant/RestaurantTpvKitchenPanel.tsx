/**
 * Cocina KDS dentro del TPV sala (sin navegar a `/saas/cocina` CEO).
 * Mismo tablero que la página Cocina; Volver cierra el panel y vuelve al plano.
 */
import { createPortal } from 'react-dom';
import { RestaurantKitchenBoard } from './RestaurantKitchenBoard';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function RestaurantTpvKitchenPanel({ open, onClose }: Props) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[180] flex min-h-0 flex-col bg-stone-100 dark:bg-stone-950">
      <RestaurantKitchenBoard
        className="h-full min-h-0 flex-1"
        onBack={onClose}
      />
    </div>,
    document.body,
  );
}
