import { useCallback, useRef, useState } from 'react';
import { ImagePlus, LoaderCircle, Trash2, Upload } from 'lucide-react';
import {
  VEHICLE_IMAGE_ACCEPT,
  compressVehicleImage,
  isAllowedVehicleImageFile,
} from './vehicleImageUtils';
import { VehicleConfirmDialog } from './VehicleConfirmDialog';

type VehiclePhotoGalleryProps = {
  images: string[];
  onUpdate: (images: string[]) => Promise<void>;
  disabled?: boolean;
};

export function VehiclePhotoGallery({ images, onUpdate, disabled = false }: VehiclePhotoGalleryProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const safeIdx = Math.min(activeIdx, Math.max(0, images.length - 1));
  const activeImage = images[safeIdx];

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const allowed = Array.from(files).filter(isAllowedVehicleImageFile);
    if (!allowed.length) return;

    setUploading(true);
    try {
      const compressed = await Promise.all(allowed.map((f) => compressVehicleImage(f)));
      await onUpdate([...images, ...compressed]);
      setActiveIdx(images.length + compressed.length - 1);
    } finally {
      setUploading(false);
    }
  }, [images, onUpdate]);

  const confirmDelete = async () => {
    if (deleteIdx === null) return;
    setDeleting(true);
    try {
      const next = images.filter((_, i) => i !== deleteIdx);
      await onUpdate(next);
      setActiveIdx(Math.min(deleteIdx, Math.max(0, next.length - 1)));
      setDeleteIdx(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-900">
        {activeImage ? (
          <img src={activeImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
            <ImagePlus className="h-10 w-10" strokeWidth={1.5} />
            <span className="text-xs font-medium">Sin fotografías</span>
          </div>
        )}
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <LoaderCircle className="h-8 w-8 animate-spin text-white" />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {images.map((url, index) => (
          <button
            key={`${index}-${url.slice(-12)}`}
            type="button"
            disabled={disabled}
            onClick={() => setActiveIdx(index)}
            className={`relative h-16 w-20 overflow-hidden rounded-xl border-2 transition-colors ${
              safeIdx === index
                ? 'border-amber-500'
                : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <img src={url} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
        {!disabled ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-16 w-20 flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-500 dark:border-gray-700"
          >
            <Upload className="h-4 w-4" />
            <span className="mt-1 text-[10px] font-medium">Subir</span>
          </button>
        ) : null}
      </div>

      {activeImage && !disabled ? (
        <button
          type="button"
          onClick={() => setDeleteIdx(safeIdx)}
          className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30"
        >
          <Trash2 className="h-4 w-4" />
          Eliminar fotografía
        </button>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={VEHICLE_IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <VehicleConfirmDialog
        open={deleteIdx !== null}
        title="Eliminar fotografía"
        message="¿Seguro que quieres eliminar esta fotografía del vehículo?"
        confirmLabel="Eliminar"
        tone="danger"
        loading={deleting}
        onCancel={() => setDeleteIdx(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
