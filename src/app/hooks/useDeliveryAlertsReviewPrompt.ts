import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuthOptional } from '../context/AuthContext';
import { isWorkerAccount } from '../lib/authApi';
import { getAlertsConfig, saveAlertsConfig, type AlertsConfig } from '../lib/settingsApi';
import {
  DELIVERY_ALERTS_REVIEW_ENTITY_TYPE,
  DELIVERY_ALERTS_REVIEW_ROUTE,
  countDeliveryPendingActivation,
  deliveryAlertsReviewEntityId,
  isDeliveryAlertsReviewPending,
} from '../lib/deliveryAlertsReview';
import { useAlertCenterBusinessId } from './useAlertCenterBusinessId';
import { useAlertDepartments } from './useAlertDepartments';

type Options = {
  /** Solo un sitio (p. ej. Topbar) debe crear la notificación in-app. */
  sendNotif?: boolean;
};

/**
 * Estado de primera revisión de alertas Delivery.
 * Con `sendNotif: true` crea una notificación in-app una sola vez.
 */
export function useDeliveryAlertsReviewPrompt(options: Options = {}) {
  const { sendNotif = false } = options;
  const auth = useAuthOptional();
  const { createNotification, notifications } = useApp();
  const businessId = useAlertCenterBusinessId();
  const { vertical } = useAlertDepartments();
  // Solo Delivery: bar/restaurante no debe ver «Revisa tus alertas de Delivery».
  const isDeliveryLike = vertical === 'delivery';
  const isOwner = Boolean(auth?.user && !isWorkerAccount(auth.user));

  const [config, setConfig] = useState<AlertsConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const sentRef = useRef(false);

  const reload = useCallback(async () => {
    if (!businessId || !isDeliveryLike || !isOwner) {
      setConfig(null);
      return;
    }
    setLoading(true);
    try {
      const data = await getAlertsConfig(businessId);
      setConfig(data);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [businessId, isDeliveryLike, isOwner]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pending = Boolean(
    isDeliveryLike && isOwner && config && isDeliveryAlertsReviewPending(config.deliveryAlertsReview),
  );
  const pendingCount = config ? countDeliveryPendingActivation(config.rules) : 0;
  const entityId = businessId ? deliveryAlertsReviewEntityId(businessId) : '';

  useEffect(() => {
    if (!sendNotif || !pending || !businessId || !entityId || !config || sentRef.current) return;

    const already =
      notifications.some(
        (n) => n.entityType === DELIVERY_ALERTS_REVIEW_ENTITY_TYPE && n.entityId === entityId,
      )
      || Boolean(config.deliveryAlertsReview?.notifSentAt);

    if (already) {
      sentRef.current = true;
      return;
    }

    sentRef.current = true;
    void (async () => {
      await createNotification({
        level: 'info',
        category: 'system',
        title: 'Revisa tus alertas de Delivery',
        message: pendingCount > 0
          ? `Tienes ${pendingCount} avisos apagados listos para activar. El pack esencial ya está activo.`
          : 'Confirma qué avisos quieres recibir. El pack esencial ya está activo.',
        entityType: DELIVERY_ALERTS_REVIEW_ENTITY_TYPE,
        entityId,
        route: DELIVERY_ALERTS_REVIEW_ROUTE,
        metadata: { businessId },
      });

      try {
        const next: AlertsConfig = {
          ...config,
          deliveryAlertsReview: {
            ...(config.deliveryAlertsReview || {}),
            notifSentAt: new Date().toISOString(),
          },
        };
        await saveAlertsConfig(businessId, next);
        setConfig(next);
      } catch {
        /* best-effort */
      }
    })();
  }, [
    sendNotif,
    pending,
    businessId,
    entityId,
    notifications,
    config,
    pendingCount,
    createNotification,
  ]);

  const markReviewed = useCallback(async () => {
    if (!businessId || !config) return;
    const next: AlertsConfig = {
      ...config,
      deliveryAlertsReview: {
        ...(config.deliveryAlertsReview || {}),
        completedAt: new Date().toISOString(),
      },
    };
    await saveAlertsConfig(businessId, next);
    setConfig(next);
  }, [businessId, config]);

  return {
    pending,
    pendingCount,
    loading,
    businessId,
    config,
    reload,
    markReviewed,
    reviewRoute: DELIVERY_ALERTS_REVIEW_ROUTE,
  };
}
