import { useState } from 'react';
import {
  Clock,
  FileText,
  Globe,
  Info,
  LayoutGrid,
  Receipt,
} from 'lucide-react';
import { VehicleShellBlock } from './VehicleShellBlock';
import { VehiclePhotoGallery } from './VehiclePhotoGallery';
import { VehicleDocumentsSection } from './VehicleDocumentsSection';
import type { VehicleDocType } from '../../../lib/vehicleApi';
import {
  formatVehicleKm,
  formatVehicleHistoryDate,
  type VehicleListItem,
} from './vehiclesListData';

export type VehicleDetailTabId =
  | 'resumen'
  | 'informacion'
  | 'gastos'
  | 'publicaciones'
  | 'documentacion'
  | 'historial';

const TABS: { id: VehicleDetailTabId; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutGrid },
  { id: 'informacion', label: 'Información', icon: Info },
  { id: 'gastos', label: 'Gastos', icon: Receipt },
  { id: 'publicaciones', label: 'Publicaciones', icon: Globe },
  { id: 'documentacion', label: 'Documentación', icon: FileText },
  { id: 'historial', label: 'Historial', icon: Clock },
];

const TECHNICAL_FIELDS = [
  'Matrícula',
  'Año',
  'Kilómetros',
  'Combustible',
  'Transmisión',
  'Ubicación',
  'Color',
  'VIN',
] as const;

function TabEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof LayoutGrid;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
        <Icon className="h-7 w-7 text-gray-400" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}

const FUEL_LABELS: Record<string, string> = {
  gasolina: 'Gasolina',
  diesel: 'Diésel',
  hibrido: 'Híbrido',
  electrico: 'Eléctrico',
  glp: 'GLP',
  otro: 'Otro',
};

const TRANSMISSION_LABELS: Record<string, string> = {
  manual: 'Manual',
  automatico: 'Automático',
  semiauto: 'Semiautomático',
};

function ResumenTab({
  vehicle,
  onUpdateImages,
}: {
  vehicle: VehicleListItem;
  onUpdateImages: (images: string[]) => Promise<void>;
}) {
  const technicalValues: Partial<Record<(typeof TECHNICAL_FIELDS)[number], string>> = {
    Matrícula: vehicle.plate || '—',
    Año: vehicle.year ? String(vehicle.year) : '—',
    Kilómetros: vehicle.km ? formatVehicleKm(vehicle.km) : '—',
    Combustible: vehicle.fuelType ? (FUEL_LABELS[vehicle.fuelType] || vehicle.fuelType) : '—',
    Transmisión: vehicle.transmission ? (TRANSMISSION_LABELS[vehicle.transmission] || vehicle.transmission) : '—',
    Ubicación: vehicle.location || '—',
    Color: vehicle.color || '—',
    VIN: vehicle.vin || '—',
  };

  return (
    <div className="space-y-5">
      <VehicleShellBlock className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Fotografías</h3>
        <VehiclePhotoGallery images={vehicle.images} onUpdate={onUpdateImages} />
      </VehicleShellBlock>

      <VehicleShellBlock className="p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">
          Datos técnicos
        </h3>
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {TECHNICAL_FIELDS.map((label) => (
            <div key={label} className="flex items-center justify-between gap-4 border-b border-gray-100 py-2 dark:border-gray-800">
              <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {technicalValues[label] ?? '—'}
              </span>
            </div>
          ))}
        </div>
      </VehicleShellBlock>
    </div>
  );
}

function InformacionTab({ vehicle }: { vehicle: VehicleListItem }) {
  const rows = [
    ['Marca', vehicle.brand],
    ['Modelo', vehicle.model],
    ['Versión', vehicle.version || '—'],
    ['Matrícula', vehicle.plate || '—'],
    ['VIN', vehicle.vin || '—'],
    ['Potencia', vehicle.power ? `${vehicle.power} CV` : '—'],
    ['Precio compra', vehicle.purchasePrice ? `${vehicle.purchasePrice.toLocaleString('es-ES')} €` : '—'],
    ['Precio venta', vehicle.price ? `${vehicle.price.toLocaleString('es-ES')} €` : '—'],
    ['Observaciones', vehicle.notes || '—'],
  ];

  return (
    <VehicleShellBlock className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Información del vehículo</h3>
      <div className="space-y-0">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 border-b border-gray-100 py-3 sm:flex-row sm:items-start sm:justify-between dark:border-gray-800">
            <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 sm:max-w-[60%] sm:text-right">{value}</span>
          </div>
        ))}
      </div>
    </VehicleShellBlock>
  );
}

function HistorialTab({ vehicle }: { vehicle: VehicleListItem }) {
  const entries = vehicle.historyEntries ?? [];

  if (entries.length === 0) {
    return (
      <TabEmpty
        icon={Clock}
        title="Historial"
        description="Línea temporal de cambios, acciones y eventos del vehículo."
      />
    );
  }

  return (
    <VehicleShellBlock className="p-5">
      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Historial</h3>
      <div className="space-y-4">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="relative border-l-2 border-gray-200 pl-4 dark:border-gray-700"
          >
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{entry.label}</p>
            <p className="text-xs text-gray-500">{formatVehicleHistoryDate(entry.date)}</p>
            {entry.note ? (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{entry.note}</p>
            ) : null}
          </div>
        ))}
      </div>
    </VehicleShellBlock>
  );
}

function VehicleDetailTabPanels({
  activeTab,
  vehicle,
  onUpdateImages,
  onAddDocument,
  onRemoveDocument,
}: {
  activeTab: VehicleDetailTabId;
  vehicle: VehicleListItem;
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
}) {
  switch (activeTab) {
    case 'resumen':
      return <ResumenTab vehicle={vehicle} onUpdateImages={onUpdateImages} />;
    case 'informacion':
      return <InformacionTab vehicle={vehicle} />;
    case 'gastos':
      return (
        <TabEmpty
          icon={Receipt}
          title="Gastos de preparación"
          description="Desglose de costes, proveedores e historial de reparaciones."
        />
      );
    case 'publicaciones':
      return (
        <TabEmpty
          icon={Globe}
          title="Publicaciones"
          description="Portales activos, anuncios publicados y estado de sincronización."
        />
      );
    case 'documentacion':
      return (
        <VehicleShellBlock className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">Documentación</h3>
          <VehicleDocumentsSection
            documents={vehicle.documents}
            onAdd={onAddDocument}
            onRemove={onRemoveDocument}
          />
        </VehicleShellBlock>
      );
    case 'historial':
      return <HistorialTab vehicle={vehicle} />;
    default:
      return null;
  }
}

type VehicleDetailTabsProps = {
  vehicle: VehicleListItem;
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
};

export function VehicleDetailTabs({
  vehicle,
  onUpdateImages,
  onAddDocument,
  onRemoveDocument,
}: VehicleDetailTabsProps) {
  const [activeTab, setActiveTab] = useState<VehicleDetailTabId>('resumen');

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-gray-200/80 bg-white px-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-amber-500 text-gray-900 dark:text-gray-100'
                    : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={active ? 2.25 : 2} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/50 px-6 py-5 dark:bg-gray-950/50">
        <VehicleDetailTabPanels
          activeTab={activeTab}
          vehicle={vehicle}
          onUpdateImages={onUpdateImages}
          onAddDocument={onAddDocument}
          onRemoveDocument={onRemoveDocument}
        />
      </div>
    </div>
  );
}
