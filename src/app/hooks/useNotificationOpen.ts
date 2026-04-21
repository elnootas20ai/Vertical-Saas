import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

interface NotificationState {
  notificationEntityId?: string;
  notificationEntityType?: string;
}

/**
 * Reads `notificationEntityId` from navigation state and triggers a callback once.
 * Clears the state after consuming it so refreshes don't re-open the modal.
 */
export function useNotificationOpen(
  onOpen: (entityId: string, entityType?: string) => void,
  ready = true,
) {
  const location = useLocation();
  const navigate = useNavigate();
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current || !ready) return;
    const state = location.state as NotificationState | null;
    if (!state?.notificationEntityId) return;

    consumed.current = true;
    onOpen(state.notificationEntityId, state.notificationEntityType);

    navigate(location.pathname + location.search, { replace: true, state: {} });
  }, [location, navigate, onOpen, ready]);
}
