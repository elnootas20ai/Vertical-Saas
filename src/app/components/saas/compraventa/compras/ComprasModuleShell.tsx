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
    <div className="flex min-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950 md:min-h-[calc(100dvh-6.5rem)]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200/80 px-4 py-3 dark:border-gray-800 md:px-5">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Compras
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Registro y seguimiento de compras de vehículos
          </p>
        </div>
        <ComprasNewPurchaseButton disabled={loading} onClick={() => setWizardOpen(true)} />
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <ComprasListPanel
          purchases={purchases}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <ComprasDetailPanel purchase={selectedPurchase} onAction={handlePurchaseAction} />
      </div>

      <ComprasNewPurchaseWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={async (acquisitionId) => {
          await loadPurchases();
          setSelectedId(acquisitionId);
        }}
      />
    </div>
  );
}
