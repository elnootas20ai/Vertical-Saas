import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../../../context/AuthContext';
import { useApp } from '../../../../context/AppContext';
import {
  approveAcquisitionRequest,
  changeStatusRequest,
  listAcquisitionsRequest,
  type VehicleAcquisition,
} from '../../../../lib/vehicleAcquisitionApi';
import { mapAcquisitionToCompra, buildVehicleLabel } from '../../../../lib/compraventaMappers';
import { SAAS__OcrScanModal } from '../../../design-system/SAAS__OcrScanModal';
import { createDocumentViaApi } from '../../../../lib/documentsApi';
import { buildOcrDocumentFields } from '../../../../lib/ocrDocumentSave';
import type { OcrData } from '../../../../lib/documentsApi';
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
  const [acquisitionsById, setAcquisitionsById] = useState<Record<string, VehicleAcquisition>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingAcquisition, setEditingAcquisition] = useState<VehicleAcquisition | null>(null);
  const [ocrOpen, setOcrOpen] = useState(false);

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

  const selectedVehicle = useMemo(() => {
    if (!selectedPurchase?.vehicleId) return null;
    return (vehicles ?? []).find((v) => v.id === selectedPurchase.vehicleId) ?? null;
  }, [selectedPurchase, vehicles]);

  const hiddenActions = useMemo((): CompraActionId[] => {
    const hidden: CompraActionId[] = [];
    const status = selectedPurchase?.acquisitionStatus || '';
    if (status !== 'borrador' && status !== 'pendiente_aprobacion') {
      hidden.push('approve');
    }
    if (!selectedPurchase?.vehicleId) {
      hidden.push('ocr');
    }
    if (selectedPurchase?.status === 'cancelada' || selectedPurchase?.status === 'completada') {
      hidden.push('edit', 'cancel', 'approve');
    }
    return hidden;
  }, [selectedPurchase]);

  const loadPurchases = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const response = await listAcquisitionsRequest(userId);
      const items = response.items || [];
      const byId: Record<string, VehicleAcquisition> = {};
      for (const item of items) byId[item.id] = item;
      setAcquisitionsById(byId);
      setPurchases(items.map((item) => mapAcquisitionToCompra(item, vehicleLabelById)));
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
    async (actionId: CompraActionId) => {
      if (!selectedPurchase) return;
      if (actionId === 'fiscal') {
        const qs = new URLSearchParams();
        if (selectedPurchase.vehicleId) qs.set('vehicleId', selectedPurchase.vehicleId);
        qs.set('acquisitionId', selectedPurchase.id);
        navigate(`/saas/vertical/compraventa/calculadora-fiscal?${qs.toString()}`);
        return;
      }
      if (actionId === 'edit') {
        const acq = acquisitionsById[selectedPurchase.id];
        if (!acq) {
          toast.error('No se encontró la compra para editar');
          return;
        }
        setEditingAcquisition(acq);
        setWizardOpen(true);
        return;
      }
      if (actionId === 'ocr') {
        if (!selectedPurchase.vehicleId) {
          toast.error('Esta compra no tiene vehículo vinculado');
          return;
        }
        setOcrOpen(true);
        return;
      }
      if (actionId === 'approve') {
        if (!userId) return;
        setActionLoading(true);
        try {
          const response = await approveAcquisitionRequest(userId, selectedPurchase.id, 'Aprobada desde Compras');
          const mapped = mapAcquisitionToCompra(response.item, vehicleLabelById);
          setPurchases((prev) => prev.map((p) => (p.id === mapped.id ? mapped : p)));
          setAcquisitionsById((prev) => ({ ...prev, [response.item.id]: response.item }));
          toast.success('Compra aprobada');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'No se pudo aprobar');
        } finally {
          setActionLoading(false);
        }
        return;
      }
      if (actionId === 'expense') {
        const qs = selectedPurchase.vehicleId
          ? `?vehicleId=${encodeURIComponent(selectedPurchase.vehicleId)}`
          : '';
        navigate(`/saas/vertical/compraventa/gastos-preparacion${qs}`);
        return;
      }
      if (actionId === 'document') {
        const qs = new URLSearchParams({ tab: 'vehiculo' });
        if (selectedPurchase.vehicleId) qs.set('vehicleId', selectedPurchase.vehicleId);
        navigate(`/saas/documents?${qs.toString()}`);
        return;
      }
      if (actionId === 'cancel') {
        if (selectedPurchase.status === 'cancelada') {
          toast.message('Esta compra ya está cancelada');
          return;
        }
        if (selectedPurchase.status === 'completada') {
          toast.error('No se puede cancelar una compra ya completada o cerrada');
          return;
        }
        const ok = window.confirm(
          `¿Cancelar la compra de ${selectedPurchase.vehicleLabel}? Esta acción no se puede deshacer desde aquí.`,
        );
        if (!ok || !userId) return;
        setActionLoading(true);
        try {
          const response = await changeStatusRequest(
            userId,
            selectedPurchase.id,
            'cancelada',
            'Cancelada desde módulo Compras',
          );
          const mapped = mapAcquisitionToCompra(response.item, vehicleLabelById);
          setPurchases((prev) => prev.map((p) => (p.id === mapped.id ? mapped : p)));
          setAcquisitionsById((prev) => ({ ...prev, [response.item.id]: response.item }));
          toast.success('Compra cancelada');
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'No se pudo cancelar la compra');
        } finally {
          setActionLoading(false);
        }
      }
    },
    [selectedPurchase, navigate, userId, vehicleLabelById, acquisitionsById],
  );

  return (
    <CompraventaSplitModuleShell
      title="Compras"
      subtitle="Registro y seguimiento de compras de vehículos"
      headerAction={(
        <ComprasNewPurchaseButton
          disabled={loading || actionLoading}
          onClick={() => {
            setEditingAcquisition(null);
            setWizardOpen(true);
          }}
        />
      )}
      listPanel={(
        <ComprasListPanel
          purchases={purchases}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}
      detailPanel={(
        <ComprasDetailPanel
          purchase={selectedPurchase}
          onAction={handlePurchaseAction}
          actionsDisabled={actionLoading}
          hiddenActions={hiddenActions}
        />
      )}
      overlay={(
        <>
          <ComprasNewPurchaseWizard
            open={wizardOpen}
            editing={editingAcquisition}
            onClose={() => {
              setWizardOpen(false);
              setEditingAcquisition(null);
            }}
            onCreated={async (acquisitionId) => {
              await loadPurchases();
              setSelectedId(acquisitionId);
            }}
            onUpdated={async (acquisitionId) => {
              await loadPurchases();
              setSelectedId(acquisitionId);
            }}
          />
          {selectedVehicle ? (
            <SAAS__OcrScanModal
              isOpen={ocrOpen}
              onClose={() => setOcrOpen(false)}
              userId={userId}
              targetModule="documentacion"
              defaultOcrMode="vehicle"
              lockOcrMode
              autoOpenCamera={false}
              context={{ vehicleId: selectedVehicle.id }}
              vehicles={[
                {
                  id: selectedVehicle.id,
                  brand: selectedVehicle.brand,
                  model: selectedVehicle.model,
                  registrationPlate: selectedVehicle.registrationPlate,
                  vin: selectedVehicle.vin,
                },
              ]}
              onDocumentCreated={async (payload) => {
                if (!userId) throw new Error('Sesión no válida');
                const fileName = payload.file
                  ? String((payload.file as File).name || 'scan').replace(/[^a-zA-Z0-9._-]/g, '-')
                  : 'scan';
                const ocrData = (payload.ocrData || null) as OcrData | null;
                const fields = buildOcrDocumentFields({
                  name: String(payload.name || ocrData?.documentTypeLabel || fileName),
                  ocrData,
                  vehicleId: selectedVehicle.id,
                  vehicles: [
                    {
                      id: selectedVehicle.id,
                      brand: selectedVehicle.brand,
                      model: selectedVehicle.model,
                      registrationPlate: selectedVehicle.registrationPlate,
                      vin: selectedVehicle.vin,
                    },
                  ],
                });
                await createDocumentViaApi(userId, {
                  ...fields,
                  name: fields.name || fileName,
                  vehicleId: selectedVehicle.id,
                  mimeType: (payload.fileMimeType as string) || undefined,
                  fileName,
                });
                toast.success('Documento OCR guardado en el expediente');
                setOcrOpen(false);
              }}
            />
          ) : null}
        </>
      )}
    />
  );
}
