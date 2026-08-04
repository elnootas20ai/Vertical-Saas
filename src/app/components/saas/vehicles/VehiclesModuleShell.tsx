import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { useApp, type Vehicle } from '../../../context/AppContext';
import { useBusinessOptional } from '../../../context/BusinessContext';
import { resolveVehicleListBusinessId } from '../../../lib/vehicleVertical';
import {
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_SURFACE,
} from '../../../lib/vertialUiTokens';
import type { VehicleStatus } from '../DesignTokens';
import {
  addVehicleDocumentRequest,
  getVehicleRelationsRequest,
  listVehiclesRequest,
  removeVehicleDocumentRequest,
  VehicleRelationsError,
  type VehicleDocType,
} from '../../../lib/vehicleApi';
import { VehiclesListPanel } from './VehiclesListPanel';
import { VehicleDetailPanel } from './VehicleDetailPanel';
import { VehicleCreateModal } from './VehicleCreateModal';
import { VehicleOcrCreateModal } from './VehicleOcrCreateModal';
import { VehicleConfirmDialog } from './VehicleConfirmDialog';
import { mapAppVehicleToListItem } from './vehiclesListData';
import { uiStatusToBackend } from './vehicleStatusMap';

const VEHICLE_RELATIONS_BLOCK_MESSAGE =
  'Este vehículo tiene operaciones asociadas y no puede eliminarse.';

type ListViewMode = 'active' | 'archived';

export function VehiclesModuleShell() {
  const {
    vehicles: appVehicles,
    updateVehicle,
    syncVehicle,
    mergeVehicles,
    archiveVehicle,
    restoreVehicle,
    deleteVehicle,
    authUser,
  } = useApp();
  const businessContext = useBusinessOptional();
  const currentBusiness = businessContext?.currentBusiness ?? null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listView, setListView] = useState<ListViewMode>('active');
  const [createOpen, setCreateOpen] = useState(false);
  const [ocrCreateOpen, setOcrCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);

  const activeVehicles = useMemo(
    () => (appVehicles ?? []).filter((v) => !v.archived),
    [appVehicles],
  );

  const archivedVehicles = useMemo(
    () => (appVehicles ?? []).filter((v) => v.archived),
    [appVehicles],
  );

  const listSource = listView === 'archived' ? archivedVehicles : activeVehicles;

  const vehicles = useMemo(
    () => listSource.map(mapAppVehicleToListItem),
    [listSource],
  );

  const selectedAppVehicle = useMemo(
    () => listSource.find((v) => v.id === selectedId) ?? null,
    [listSource, selectedId],
  );

  const selectedVehicle = useMemo(
    () => (selectedAppVehicle ? mapAppVehicleToListItem(selectedAppVehicle) : null),
    [selectedAppVehicle],
  );

  useEffect(() => {
    if (!authUser?.user_id) return;
    let cancelled = false;

    listVehiclesRequest(
      authUser.user_id,
      resolveVehicleListBusinessId(currentBusiness),
      { includeArchived: true },
    )
      .then((response) => {
        if (cancelled) return;
        const archived = (response.vehicles ?? []).filter((v) => v.archived);
        if (archived.length > 0) mergeVehicles(archived as Vehicle[]);
      })
      .catch(() => {
        // Los archivados en memoria siguen disponibles tras archivar en la misma sesión
      });

    return () => {
      cancelled = true;
    };
  }, [authUser?.user_id, currentBusiness?.business_id, mergeVehicles]);

  useEffect(() => {
    if (selectedId && !vehicles.some((v) => v.id === selectedId)) {
      setSelectedId(null);
    }
  }, [vehicles, selectedId]);

  const handleViewModeChange = useCallback((mode: ListViewMode) => {
    setListView(mode);
    setSelectedId(null);
  }, []);

  const handleStatusChange = useCallback(async (status: VehicleStatus) => {
    if (!selectedAppVehicle || selectedVehicle?.status === status) return;
    setStatusChanging(true);
    try {
      await updateVehicle(selectedAppVehicle.id, {
        status: uiStatusToBackend(status) as Vehicle['status'],
      });
      toast.success('Estado actualizado correctamente');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo cambiar el estado');
    } finally {
      setStatusChanging(false);
    }
  }, [selectedAppVehicle, selectedVehicle?.status, updateVehicle]);

  const handleUpdateImages = useCallback(async (images: string[]) => {
    if (!selectedAppVehicle) return;
    await updateVehicle(selectedAppVehicle.id, { images });
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
      toast.success('Vehículo archivado correctamente.');
      setSelectedId(null);
      setArchiveOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo archivar el vehículo');
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = async () => {
    if (!selectedAppVehicle) return;
    const restoredId = selectedAppVehicle.id;
    setBusy(true);
    try {
      await restoreVehicle(restoredId);
      toast.success('Vehículo restaurado correctamente.');
      setRestoreOpen(false);
      setListView('active');
      setSelectedId(restoredId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo restaurar el vehículo');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedAppVehicle || !authUser?.user_id) return;
    setBusy(true);
    try {
      const relations = await getVehicleRelationsRequest(authUser.user_id, selectedAppVehicle.id);
      if (relations.hasRelations) {
        toast.error(VEHICLE_RELATIONS_BLOCK_MESSAGE);
        setDeleteOpen(false);
        return;
      }

      await deleteVehicle(selectedAppVehicle.id);
      toast.success('Vehículo eliminado correctamente.');
      setSelectedId(null);
      setDeleteOpen(false);
    } catch (error) {
      if (error instanceof VehicleRelationsError) {
        toast.error(VEHICLE_RELATIONS_BLOCK_MESSAGE);
        setDeleteOpen(false);
      } else {
        toast.error(error instanceof Error ? error.message : 'No se pudo eliminar el vehículo');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex min-h-[calc(100dvh-7.5rem)] flex-col overflow-hidden md:min-h-[calc(100dvh-6.5rem)] ${VERTIAL_SURFACE}`}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3 dark:border-slate-800 md:px-5">
        <div className="min-w-0">
          <h1 className="vsaas-title text-base">
            Vehículos
          </h1>
          <p className="vsaas-subtitle text-xs">
            Lista, ficha e información rápida
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOcrCreateOpen(true)}
            className={VERTIAL_BTN_SECONDARY}
          >
            <ScanLine className="h-4 w-4" />
            Escanear documento
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className={VERTIAL_BTN_PRIMARY}
          >
            <Plus className="h-4 w-4" />
            Nuevo vehículo
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <VehiclesListPanel
          vehicles={vehicles}
          selectedId={selectedId}
          onSelect={setSelectedId}
          viewMode={listView}
          onViewModeChange={handleViewModeChange}
          archivedCount={archivedVehicles.length}
        />
        <VehicleDetailPanel
          vehicle={selectedVehicle}
          busy={busy}
          statusChanging={statusChanging}
          onEdit={() => {
            if (selectedAppVehicle) setEditOpen(true);
          }}
          onArchive={() => setArchiveOpen(true)}
          onDelete={() => setDeleteOpen(true)}
          onRestore={() => setRestoreOpen(true)}
          onStatusChange={handleStatusChange}
          onUpdateImages={handleUpdateImages}
          onAddDocument={handleAddDocument}
          onRemoveDocument={handleRemoveDocument}
        />
      </div>

      <VehicleCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(vehicleId) => {
          setListView('active');
          setSelectedId(vehicleId);
        }}
      />

      <VehicleOcrCreateModal
        open={ocrCreateOpen}
        onClose={() => setOcrCreateOpen(false)}
        onCreated={(vehicleId) => {
          setListView('active');
          setSelectedId(vehicleId);
        }}
      />

      <VehicleCreateModal
        open={editOpen && Boolean(selectedAppVehicle) && !selectedAppVehicle?.archived}
        editVehicle={selectedAppVehicle}
        onClose={() => setEditOpen(false)}
      />

      <VehicleConfirmDialog
        open={archiveOpen}
        title="Archivar vehículo"
        message="¿Deseas archivar este vehículo? Permanecerá disponible para consulta y podrá restaurarse más adelante."
        confirmLabel="Archivar"
        loading={busy}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={confirmArchive}
      />

      <VehicleConfirmDialog
        open={restoreOpen}
        title="Restaurar vehículo"
        message="El vehículo volverá al listado principal con estado Disponible. ¿Continuar?"
        confirmLabel="Restaurar"
        loading={busy}
        onCancel={() => setRestoreOpen(false)}
        onConfirm={confirmRestore}
      />

      <VehicleConfirmDialog
        open={deleteOpen}
        title="Eliminar vehículo"
        message="Esta acción no se puede deshacer. ¿Deseas eliminar este vehículo?"
        confirmLabel="Eliminar"
        tone="danger"
        loading={busy}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
