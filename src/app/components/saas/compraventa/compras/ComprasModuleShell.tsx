import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../../../context/AuthContext';
import { useApp } from '../../../../context/AppContext';
import { listAcquisitionsRequest } from '../../../../lib/vehicleAcquisitionApi';
import { mapAcquisitionToCompra, buildVehicleLabel } from '../../../../lib/compraventaMappers';
import { ComprasListPanel } from './ComprasListPanel';
import { ComprasDetailPanel } from './ComprasDetailPanel';
import { ComprasNewPurchaseButton } from './ComprasDetailActionBar';
import { ComprasNewPurchaseWizard } from './ComprasNewPurchaseWizard';
import { CompraventaSplitModuleShell } from '../CompraventaSplitModuleShell';
import type { CompraListItem } from './comprasListData';
import type { CompraActionId } from './ComprasDetailActionBar';

export function ComprasModuleShell() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { vehicles } = useApp();
  const userId = user?.userId || user?._id || '';

  const [purchases, setPurchases] = useState<CompraListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const vehicleLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const vehicle of vehicles ?? []) {
      map[vehicle.id] = buildVehicleLabel(vehicle);
    }
    return map;
  }, [vehicles]);

  const selectedPurchase = useMemo(
    () => purchases.find((p) => p.id === selectedId) ?? null,
    [purchases, selectedId],
  );

  const loadPurchases = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const response = await listAcquisitionsRequest(userId);
      setPurchases((response.items || []).map((item) => mapAcquisitionToCompra(item, vehicleLabelById)));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar las compras');
    } finally {
      setLoading(false);
    }
  }, [userId, vehicleLabelById]);

  useEffect(() => {
    loadPurchases();
  }, [loadPurchases]);

  const handlePurchaseAction = useCallback(
    (actionId: CompraActionId) => {
      if (!selectedPurchase) return;
      if (actionId === 'fiscal') {
        const qs = new URLSearchParams();
        if (selectedPurchase.vehicleId) qs.set('vehicleId', selectedPurchase.vehicleId);
        qs.set('acquisitionId', selectedPurchase.id);
        navigate(`/saas/vertical/compraventa/calculadora-fiscal?${qs.toString()}`);
        return;
      }
      if (actionId === 'edit' && selectedPurchase.vehicleId) {
        navigate(`/saas/vehicles/${selectedPurchase.vehicleId}`);
        return;
      }
      if (actionId === 'expense') {
        navigate('/saas/vertical/compraventa/gastos-preparacion');
        return;
      }
      if (actionId === 'document') {
        navigate('/saas/documents');
        return;
      }
      if (actionId === 'cancel') {
        toast.message('Gestiona la cancelación desde el detalle del vehículo o adquisición');
      }
    },
    [selectedPurchase, navigate],
  );

  return (
    <CompraventaSplitModuleShell
      title="Compras"
      subtitle="Registro y seguimiento de compras de vehículos"
      headerAction={(
        <ComprasNewPurchaseButton disabled={loading} onClick={() => setWizardOpen(true)} />
      )}
      listPanel={(
        <ComprasListPanel
          purchases={purchases}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}
      detailPanel={(
        <ComprasDetailPanel purchase={selectedPurchase} onAction={handlePurchaseAction} />
      )}
      overlay={(
        <ComprasNewPurchaseWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onCreated={async (acquisitionId) => {
            await loadPurchases();
            setSelectedId(acquisitionId);
          }}
        />
      )}
    />
  );
}
