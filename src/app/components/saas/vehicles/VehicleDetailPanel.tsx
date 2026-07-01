import { Car } from 'lucide-react';
import type { VehicleStatus } from '../DesignTokens';
import type { VehicleDocType } from '../../../lib/vehicleApi';
import { VehicleDetailHeader } from './VehicleDetailHeader';
import { VehicleDetailActionBar } from './VehicleDetailActionBar';
import { VehicleDetailTabs } from './VehicleDetailTabs';
import type { VehicleListItem } from './vehiclesListData';

type VehicleDetailPanelProps = {
  vehicle: VehicleListItem | null;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onStatusChange: (status: VehicleStatus) => void;
  onUpdateImages: (images: string[]) => Promise<void>;
  onAddDocument: (document: {
    name: string;
    documentType: VehicleDocType;
    fileUrl: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }) => Promise<void>;
  onRemoveDocument: (documentId: string) => Promise<void>;
  busy?: boolean;
  statusChanging?: boolean;
};

export function VehicleDetailPanel({
  vehicle,
  onEdit,
  onArchive,
  onDelete,
  onRestore,
  onStatusChange,
  onUpdateImages,
  onAddDocument,
  onRemoveDocument,
  busy = false,
  statusChanging = false,
}: VehicleDetailPanelProps) {
  if (!vehicle) {
    return (
      <section className="flex h-full min-h-0 flex-col items-center justify-center bg-gray-50/50 px-8 text-center dark:bg-gray-950/50">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-gray-900">
          <Car className="h-8 w-8 text-gray-300 dark:text-gray-600" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Selecciona un vehículo
        </h2>
        <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
          Elige un vehículo de la lista para ver su ficha, acciones y detalle.
        </p>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-gray-950">
      <VehicleDetailHeader
        vehicle={vehicle}
        onStatusChange={vehicle.archived ? undefined : onStatusChange}
        statusChanging={statusChanging}
      />
      <VehicleDetailActionBar
        archived={vehicle.archived}
        onEdit={onEdit}
        onArchive={onArchive}
        onDelete={onDelete}
        onRestore={onRestore}
        disabled={busy}
      />
      <VehicleDetailTabs
        vehicle={vehicle}
        readOnly={vehicle.archived}
        onUpdateImages={onUpdateImages}
        onAddDocument={onAddDocument}
        onRemoveDocument={onRemoveDocument}
      />
    </section>
  );
}
