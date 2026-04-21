import { useMemo } from 'react';
import { useSSE, type SSEEventMap } from './useSSE';

interface UseConstructionSSEOptions {
  userId: string | null;
  token: string | null;
  businessId?: string | null;
  enabled?: boolean;
  /** Se invoca ante cualquier evento construction:* conocido */
  onConstructionUpdate?: (eventName: string, payload: unknown) => void;
}

const CONSTRUCTION_EVENTS = ['construction:project_updated', 'construction:document_uploaded'] as const;

/**
 * Suscripción SSE a eventos del módulo construcción (mismo canal que el resto de la app).
 */
export function useConstructionSSE({
  userId,
  token,
  businessId,
  enabled = true,
  onConstructionUpdate,
}: UseConstructionSSEOptions) {
  const handlers: SSEEventMap = useMemo(() => {
    const h: SSEEventMap = {};
    for (const ev of CONSTRUCTION_EVENTS) {
      h[ev] = (data: unknown) => onConstructionUpdate?.(ev, data);
    }
    return h;
  }, [onConstructionUpdate]);

  useSSE({
    userId,
    token,
    businessId,
    handlers,
    enabled: enabled && !!onConstructionUpdate,
  });
}
