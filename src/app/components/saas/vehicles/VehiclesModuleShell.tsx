import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useApp, type Vehicle } from '../../../context/AppContext';
import type { VehicleStatus } from '../DesignTokens';
import {
  addVehicleDocumentRequest,
  removeVehicleDocumentRequest,
  VehicleRelationsError,
  type VehicleDocType,
} from '../../../lib/vehicleApi';
import { VehiclesListPanel } from './VehiclesListPanel';
import { VehicleDetailPanel } from './VehicleDetailPanel';
import { VehicleCreateModal } from './VehicleCreateModal';
import { VehicleConfirmDialog } from './VehicleConfirmDialog';
import { mapAppVehicleToListItem } from './vehiclesListData';
import { uiStatusToBackend } from './vehicleStatusMap';

export function VehiclesModuleShell() {
  const {
    vehicles: appVehicles,
    updateVehicle,
    syncVehicle,
    archiveVehicle,
    deleteVehicle,
    authUser,
  } = useApp();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);

  const activeVehicles = useMemo(
    () => (appVehicles ?? []).filter((v) => !v.archived),
    [appVehicles],
  );

  const vehicles = useMemo(
    () => activeVehicles.map(mapAppVehicleToListItem),
    [activeVehicles],
  );

  const selectedAppVehicle = useMemo(
    () => activeVehicles.find((v) => v.id === selectedId) ?? null,
    [activeVehicles, selectedId],
  );

  const selectedVehicle = useMemo(
    () => (selectedAppVehicle ? mapAppVehicleToListItem(selectedAppVehicle) : null),
    [selectedAppVehicle],
  );

  useEffect(() => {
    if (selectedId && !vehicles.some((v) => v.id === selectedId)) {
      setSelectedId(null);
    }
  }, [vehicles, selectedId]);

  const handleStatusChange = useCallback(async (status: VehicleStatus) => {
    if (!selectedAppVehicle || selectedVehicle?.status === status) return;
    setStatusChanging(true);
    try {
      await updateVehicle(selectedAppVehicle.id, {
        status: uiStatusToBackend(status) as Vehicle['status'],
      });
      toast.success('Estado actualizado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cambiar el estado');
    } finally {
      setStatusChanging(false);
    }
  }, [selectedAppVehicle, selectedVehicle?.status, updateVehicle]);

  const handleUpdateImages = useCallback(async (images: string[]) => {
    if (!selectedAppVehicle) return;
    await updateVehicle(selectedAppVehicle.id, { images });
    toast.success('Galería actualizada');
  }, [selectedAppVehicle, updateVehicle]);

  const handleAddDocument = useCallback(async (document: {
    name: string;
    documentType: VehicleDocType;
    fileUrl: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }) => {
    if (!authUser?.user_id || !selectedAppVehicle) return;
    const response = await addVehicleDocumentRequest(authUser.user_id, selectedAppVehicle.id, document);
    if (response.vehicle) {
      syncVehicle(response.vehicle);
    }
    toast.success('Documento añadido');
  }, [authUser?.user_id, selectedAppVehicle, syncVehicle]);

  const handleRemoveDocument = useCallback(async (documentId: string) => {
    if (!authUser?.user_id || !selectedAppVehicle) return;
    const response = await removeVehicleDocumentRequest(authUser.user_id, selectedAppVehicle.id, documentId);
    if (response.vehicle) {
      syncVehicle(response.vehicle);
    }
    toast.success('Documento eliminado');
  }, [authUser?.user_id, selectedAppVehicle, syncVehicle]);

  const confirmArchive = async () => {
    if (!selectedAppVehicle) return;
    setBusy(true);
    try {
      await archiveVehicle(selectedAppVehicle.id);
      toast.success('Vehículo archivado correctamente');
      setSelectedId(null);
      setArchiveOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo archivar el vehículo');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedAppVehicle) return;
    setBusy(true);
    try {
      await deleteVehicle(selectedAppVehicle.id);
      toast.success('Vehículo eliminado correctamente');
      setSelectedId(null);
      setDeleteOpen(false);
    } catch (error) {
      if (error instanceof VehicleRelationsError) {
        const parts = [];
        if (error.relations.compras) parts.push(`${error.relations.compras} compra(s)`);
        if (error.relations.ventas) parts.push(`${error.relations.ventas} venta(s)`);
        if (error.relations.entregas) parts.push(`${error.relations.entregas} entrega(s)`);
        toast.error(`No se puede eliminar: ${parts.join(', ')} asociadas.`);
      } else {
        toast.error(error instanceof Error ? error.message : 'No se pudo eliminar el vehículo');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950 md:min-h-[calc(100dvh-6.5rem)]">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200/80 px-4 py-3 dark:border-gray-800 md:px-5">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Vehículos
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Lista, ficha e información rápida
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gray-900 px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 dark:bg-gray-100 dark:text-gray-900"
        >
          <Plus className="h-4 w-4" />
          Nuevo vehículo
        </button>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <VehiclesListPanel
          vehicles={vehicles}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <VehicleDetailPanel
          vehicle={selectedVehicle}
          busy={busy}
          statusChanging={statusChanging}
          onEdit={() => setEditOpen(true)}
          onArchive={() => setArchiveOpen(true)}
          onDelete={() => setDeleteOpen(true)}
          onStatusChange={handleStatusChange}
          onUpdateImages={handleUpdateImages}
          onAddDocument={handleAddDocument}
          onRemoveDocument={handleRemoveDocument}
        />
      </div>

      <VehicleCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(vehicleId) => setSelectedId(vehicleId)}
      />

      <VehicleCreateModal
        open={editOpen}
        editVehicle={selectedAppVehicle}
        onClose={() => setEditOpen(false)}
      />

      <VehicleConfirmDialog
        open={archiveOpen}
        title="Archivar vehículo"
        message="El vehículo se ocultará del listado principal pero conservará toda su información. ¿Continuar?"
        confirmLabel="Archivar"
        loading={busy}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={confirmArchive}
      />

      <VehicleConfirmDialog
        open={deleteOpen}
        title="Eliminar vehículo"
        message="Esta acción eliminará definitivamente el vehículo si no tiene operaciones asociadas. ¿Continuar?"
        confirmLabel="Eliminar"
        tone="danger"
        loading={busy}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
