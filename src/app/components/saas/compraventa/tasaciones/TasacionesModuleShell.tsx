import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../../../context/AuthContext';
import { useBusiness } from '../../../../context/BusinessContext';
import {
  listTradeInsRequest,
  acceptTradeInRequest,
  rejectTradeInRequest,
  deleteTradeInRequest,
} from '../../../../lib/tradeInApi';
import { mapTradeInToTasacion } from '../../../../lib/compraventaMappers';
import { TasacionesListPanel } from './TasacionesListPanel';
import { TasacionesDetailPanel } from './TasacionesDetailPanel';
import { TasacionesNewButton } from './TasacionesDetailActionBar';
import { TasacionesNewWizard } from './TasacionesNewWizard';
import { CompraventaSplitModuleShell } from '../CompraventaSplitModuleShell';
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
  const [editingTasacion, setEditingTasacion] = useState<TasacionListItem | null>(null);

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

  const handleEdit = useCallback(() => {
    if (!selectedTasacion) return;
    if (selectedTasacion.status === 'aceptada') {
      toast.message('No se puede editar una tasación ya aceptada');
      return;
    }
    setEditingTasacion(selectedTasacion);
    setWizardOpen(true);
  }, [selectedTasacion]);

  const handleDelete = useCallback(async () => {
    if (!userId || !selectedTasacion) return;
    if (selectedTasacion.status === 'aceptada') {
      toast.error('No se puede eliminar una tasación aceptada (ya generó compra/vehículo)');
      return;
    }
    const ok = window.confirm(
      `¿Eliminar la tasación de ${selectedTasacion.vehicleLabel || 'este vehículo'}?`,
    );
    if (!ok) return;

    setActionLoading(true);
    try {
      await deleteTradeInRequest(userId, selectedTasacion.id);
      setTasaciones((prev) => prev.filter((t) => t.id !== selectedTasacion.id));
      setSelectedId(null);
      toast.success('Tasación eliminada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo eliminar la tasación');
    } finally {
      setActionLoading(false);
    }
  }, [userId, selectedTasacion]);

  return (
    <CompraventaSplitModuleShell
      title="Tasaciones"
      subtitle="Oportunidades de compra antes de entrar al inventario"
      headerAction={(
        <TasacionesNewButton
          disabled={loading || actionLoading}
          onClick={() => {
            setEditingTasacion(null);
            setWizardOpen(true);
          }}
        />
      )}
      listPanel={(
        <TasacionesListPanel
          tasaciones={tasaciones}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}
      detailPanel={(
        <TasacionesDetailPanel
          tasacion={selectedTasacion}
          onAccept={handleAccept}
          onReject={handleReject}
          onEdit={handleEdit}
          onDelete={handleDelete}
          actionsDisabled={actionLoading}
        />
      )}
      overlay={(
        <TasacionesNewWizard
          open={wizardOpen}
          editing={editingTasacion}
          onClose={() => {
            setWizardOpen(false);
            setEditingTasacion(null);
          }}
          onCreated={async (tasacionId) => {
            await loadTasaciones();
            setSelectedId(tasacionId);
            setEditingTasacion(null);
          }}
        />
      )}
    />
  );
}
