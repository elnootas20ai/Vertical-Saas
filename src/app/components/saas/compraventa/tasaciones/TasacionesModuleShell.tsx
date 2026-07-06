import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../../context/AuthContext';
import { useBusiness } from '../../../../context/BusinessContext';
import { listTradeInsRequest, acceptTradeInRequest, rejectTradeInRequest } from '../../../../lib/tradeInApi';
import { mapTradeInToTasacion } from '../../../../lib/compraventaMappers';
import { TasacionesListPanel } from './TasacionesListPanel';
import { TasacionesDetailPanel } from './TasacionesDetailPanel';
import { TasacionesNewButton } from './TasacionesDetailActionBar';
import { TasacionesNewWizard } from './TasacionesNewWizard';
import type { TasacionListItem } from './tasacionesListData';

export function TasacionesModuleShell() {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const userId = user?.userId || user?._id || '';
  const businessId = currentBusiness?.business_id || null;

  const [tasaciones, setTasaciones] = useState<TasacionListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const selectedTasacion = useMemo(
    () => tasaciones.find((t) => t.id === selectedId) ?? null,
    [tasaciones, selectedId],
  );

  const loadTasaciones = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const response = await listTradeInsRequest(userId, businessId);
      setTasaciones((response.tradeIns || []).map(mapTradeInToTasacion));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las tasaciones');
    } finally {
      setLoading(false);
    }
  }, [userId, businessId]);

  useEffect(() => {
    loadTasaciones();
  }, [loadTasaciones]);

  const handleAccept = useCallback(async () => {
    if (!userId || !selectedTasacion) return;
    if (selectedTasacion.status === 'aceptada') {
      toast.message('Esta tasación ya está aceptada');
      return;
    }

    setActionLoading(true);
    try {
      const acceptedValue = selectedTasacion.recommendedPrice ?? selectedTasacion.requestedPrice;
      const response = await acceptTradeInRequest(userId, selectedTasacion.id, {
        acceptedValue,
        businessId,
        note: 'Aceptada desde módulo Tasaciones',
      });

      if (response.tradeIn) {
        const mapped = mapTradeInToTasacion(response.tradeIn);
        setTasaciones((prev) => prev.map((t) => (t.id === mapped.id ? mapped : t)));
      } else {
        await loadTasaciones();
      }

      toast.success('Tasación aceptada. Compra y vehículo creados automáticamente.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo aceptar la tasación');
    } finally {
      setActionLoading(false);
    }
  }, [userId, selectedTasacion, businessId, loadTasaciones]);

  const handleReject = useCallback(async () => {
    if (!userId || !selectedTasacion) return;

    setActionLoading(true);
    try {
      const response = await rejectTradeInRequest(userId, selectedTasacion.id, {
        note: 'Rechazada desde módulo Tasaciones',
      });

      if (response.tradeIn) {
        const mapped = mapTradeInToTasacion(response.tradeIn);
        setTasaciones((prev) => prev.map((t) => (t.id === mapped.id ? mapped : t)));
      } else {
        await loadTasaciones();
      }

      toast.success('Tasación rechazada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo rechazar la tasación');
    } finally {
      setActionLoading(false);
    }
  }, [userId, selectedTasacion, loadTasaciones]);

  return (
    <div className="flex min-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950 md:min-h-[calc(100dvh-6.5rem)]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200/80 px-4 py-3 dark:border-gray-800 md:px-5">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Tasaciones
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Oportunidades de compra antes de entrar al inventario
          </p>
        </div>
        <TasacionesNewButton disabled={loading || actionLoading} onClick={() => setWizardOpen(true)} />
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <TasacionesListPanel
          tasaciones={tasaciones}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <TasacionesDetailPanel
          tasacion={selectedTasacion}
          onAccept={handleAccept}
          onReject={handleReject}
          actionsDisabled={actionLoading}
        />
      </div>

      <TasacionesNewWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={async (tasacionId) => {
          await loadTasaciones();
          setSelectedId(tasacionId);
        }}
      />
    </div>
  );
}
