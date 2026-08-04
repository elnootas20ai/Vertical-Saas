import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  Images,
  LoaderCircle,
  ScanLine,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApp, type Vehicle } from '../../../context/AppContext';
import { useModalClose } from '../../../hooks/useModalClose';
import { useCamera } from '../../../hooks/useCamera';
import { openNativeAppSettings } from '../../../lib/vertialPrint/localNetworkPermission';
import { scanDocument } from '../../../lib/ocrApi';
import {
  dataUrlToBlob,
  downscaleImageFileToBase64,
  downscaleImageSrcToBase64,
  estimateBase64Bytes,
  fileToRawBase64,
  forceWebViewRepaint,
  OCR_MAX_PAYLOAD_BYTES,
  OCR_MAX_PDF_BYTES,
} from '../../../lib/ocrImagePrepare';
import { parseLocaleNumber } from '../../../lib/numberFormat';
import {
  addVehicleDocumentRequest,
  checkVehicleDuplicatesRequest,
  VehicleDuplicateError,
  type DuplicateInfo,
} from '../../../lib/vehicleApi';
import {
  emptyVehicleOcrDraft,
  mapOcrResultToVehicleDraft,
  resolveOcrVehicleDocType,
  type VehicleOcrDraft,
} from '../../../lib/vehicleOcrDraft';
import {
  VERTIAL_ACCENT_TEXT,
  VERTIAL_BTN_PRIMARY,
  VERTIAL_BTN_SECONDARY,
  VERTIAL_FOCUS_RING,
} from '../../../lib/vertialUiTokens';
import { isAllowedVehicleImageFile } from './vehicleImageUtils';

type Step = 'upload' | 'preparing' | 'scanning' | 'review' | 'saving';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (vehicleId: string) => void;
};

const FUEL_TYPES = [
  { value: '', label: 'Sin especificar' },
  { value: 'gasolina', label: 'Gasolina' },
  { value: 'diesel', label: 'Diésel' },
  { value: 'hibrido', label: 'Híbrido' },
  { value: 'electrico', label: 'Eléctrico' },
  { value: 'glp', label: 'GLP' },
  { value: 'otro', label: 'Otro' },
];

const TRANSMISSION_TYPES = [
  { value: '', label: 'Sin especificar' },
  { value: 'manual', label: 'Manual' },
  { value: 'automatico', label: 'Automático' },
  { value: 'semiauto', label: 'Semiautomático' },
];

const inputClass =
  `w-full rounded-xl border-2 border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition-colors dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 ${VERTIAL_FOCUS_RING}`;

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}

export function VehicleOcrCreateModal({ open, onClose, onCreated }: Props) {
  const { addVehicle, syncVehicle, authUser } = useApp();
  const { takePhotoDetailed, isNative } = useCamera();
  const fileRef = useRef<HTMLInputElement>(null);

  // Payload OCR en refs (no en state) para no duplicar megas en el árbol React.
  const base64Ref = useRef('');
  const mimeRef = useRef('image/jpeg');
  const previewUrlRef = useRef<string | null>(null);
  const aliveRef = useRef(true);
  const scanGenRef = useRef(0);

  const [step, setStep] = useState<Step>('upload');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState('documento.jpg');
  const [draft, setDraft] = useState<VehicleOcrDraft>(emptyVehicleOcrDraft());
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof VehicleOcrDraft, string>>>({});
  const [duplicates, setDuplicates] = useState<{ plate: DuplicateInfo | null; vin: DuplicateInfo | null }>({
    plate: null,
    vin: null,
  });
  const [error, setError] = useState('');
  const [attachDoc, setAttachDoc] = useState(true);

  const setPreview = useCallback((url: string | null) => {
    if (previewUrlRef.current && previewUrlRef.current !== url) {
      try {
        URL.revokeObjectURL(previewUrlRef.current);
      } catch {
        /* noop */
      }
    }
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }, []);

  const clearPayload = useCallback(() => {
    base64Ref.current = '';
    mimeRef.current = 'image/jpeg';
    setPreview(null);
  }, [setPreview]);

  const reset = useCallback(() => {
    scanGenRef.current += 1;
    setStep('upload');
    clearPayload();
    setFileName('documento.jpg');
    setDraft(emptyVehicleOcrDraft());
    setFieldErrors({});
    setDuplicates({ plate: null, vin: null });
    setError('');
    setAttachDoc(true);
  }, [clearPayload]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (previewUrlRef.current) {
        try {
          URL.revokeObjectURL(previewUrlRef.current);
        } catch {
          /* noop */
        }
        previewUrlRef.current = null;
      }
      base64Ref.current = '';
    };
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  // Tras volver de la cámara Android, forzar repaint (pantalla negra / buffer colgado).
  useEffect(() => {
    if (!open) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') forceWebViewRepaint();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, [open]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  useModalClose(open, handleClose);

  const setField = useCallback((key: keyof VehicleOcrDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    setError('');
  }, []);

  const runScan = useCallback(async () => {
    const gen = ++scanGenRef.current;
    const base64 = base64Ref.current;
    const mime = mimeRef.current;
    if (!base64) {
      setError('No hay imagen para escanear');
      setStep('upload');
      return;
    }
    if (estimateBase64Bytes(base64) > OCR_MAX_PAYLOAD_BYTES * 1.2) {
      setError('La imagen sigue siendo demasiado grande. Prueba otra foto más cercana al documento.');
      setStep('upload');
      clearPayload();
      return;
    }

    setStep('scanning');
    setError('');
    try {
      const res = await scanDocument(base64, mime, { targetModule: 'vehicles' }, 'vehicle');
      if (!aliveRef.current || gen !== scanGenRef.current) return;
      if (res.data?.parseError) {
        throw new Error('No se pudo leer el documento. Prueba otra foto más nítida.');
      }
      const next = mapOcrResultToVehicleDraft(res.data);
      setDraft(next);
      setStep('review');
      if (!next.registrationPlate && !next.vin) {
        toast.warning('OCR incompleto: revisa matrícula y bastidor a mano');
      } else {
        toast.success('Documento leído. Revisa y confirma para crear el vehículo.');
      }
    } catch (err) {
      if (!aliveRef.current || gen !== scanGenRef.current) return;
      setError(err instanceof Error ? err.message : 'Error al escanear');
      setStep('upload');
      toast.error(err instanceof Error ? err.message : 'Error al escanear');
    }
  }, [clearPayload]);

  const ingestPrepared = useCallback(
    async (opts: { base64: string; mime: string; name: string; previewBlob?: Blob | null }) => {
      base64Ref.current = opts.base64;
      mimeRef.current = opts.mime;
      setFileName(opts.name);
      if (opts.previewBlob) {
        setPreview(URL.createObjectURL(opts.previewBlob));
      } else {
        setPreview(null);
      }
      setAttachDoc(estimateBase64Bytes(opts.base64) <= OCR_MAX_PAYLOAD_BYTES);
      await runScan();
    },
    [runScan, setPreview],
  );

  const handleFile = useCallback(
    async (file: File) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      setStep('preparing');
      setError('');
      try {
        if (isPdf) {
          if (file.size > OCR_MAX_PDF_BYTES) {
            throw new Error('PDF demasiado grande (máx. 8 MB). Usa una foto del documento.');
          }
          const base64 = await fileToRawBase64(file);
          await ingestPrepared({
            base64,
            mime: 'application/pdf',
            name: file.name || 'documento.pdf',
            previewBlob: null,
          });
          return;
        }
        if (!isAllowedVehicleImageFile(file)) {
          toast.error('Usa JPG, PNG, WebP o PDF');
          setStep('upload');
          return;
        }
        const { base64, mime, dataUrl } = await downscaleImageFileToBase64(file);
        const blob = dataUrlToBlob(dataUrl);
        await ingestPrepared({
          base64,
          mime,
          name: file.name || 'documento.jpg',
          previewBlob: blob,
        });
      } catch (err) {
        setStep('upload');
        clearPayload();
        toast.error(err instanceof Error ? err.message : 'No se pudo leer el archivo');
      }
    },
    [clearPayload, ingestPrepared],
  );

  const ingestNativePhoto = useCallback(
    async (source: 'camera' | 'photos') => {
      setStep('preparing');
      setError('');
      try {
        const result = await takePhotoDetailed({
          source,
          quality: 80,
          allowEditing: false,
          // Limitar en nativo ANTES del DataUrl (evita OOM / reinicios).
          maxWidth: 1600,
        });
        forceWebViewRepaint();

        if (!result.ok) {
          setStep('upload');
          if (result.reason === 'cancelled') return;
          setError(result.message);
          toast.error(result.message);
          if (result.reason === 'denied') {
            toast.message('Abre Ajustes de Vertial para activar Cámara y Fotos', {
              action: {
                label: 'Ajustes',
                onClick: () => {
                  void openNativeAppSettings();
                },
              },
            });
          }
          return;
        }

        // Segunda reducción en JS (calidad + lado máx.) — no enviar el DataUrl crudo.
        const rawDataUrl = result.photo.dataUrl;
        const { base64, mime, dataUrl } = await downscaleImageSrcToBase64(rawDataUrl);
        const blob = dataUrlToBlob(dataUrl);
        await ingestPrepared({
          base64,
          mime,
          name: `ocr-${source}-${Date.now()}.jpg`,
          previewBlob: blob,
        });
      } catch (err) {
        forceWebViewRepaint();
        setStep('upload');
        clearPayload();
        const msg = err instanceof Error ? err.message : 'No se pudo procesar la foto';
        setError(msg);
        toast.error(msg);
      }
    },
    [clearPayload, ingestPrepared, takePhotoDetailed],
  );

  const handleCamera = useCallback(async () => {
    if (isNative) {
      await ingestNativePhoto('camera');
      return;
    }
    await ingestNativePhoto('camera');
  }, [ingestNativePhoto, isNative]);

  const handleGallery = useCallback(async () => {
    if (isNative) {
      await ingestNativePhoto('photos');
      return;
    }
    fileRef.current?.click();
  }, [ingestNativePhoto, isNative]);

  useEffect(() => {
    if (!open || step !== 'review' || !authUser?.user_id) return;
    const plate = draft.registrationPlate.trim();
    const vin = draft.vin.trim();
    if (!plate && !vin) {
      setDuplicates({ plate: null, vin: null });
      return;
    }
    const timer = window.setTimeout(() => {
      checkVehicleDuplicatesRequest(authUser.user_id, {
        registrationPlate: plate || undefined,
        vin: vin || undefined,
      })
        .then((r) => {
          if (!aliveRef.current) return;
          setDuplicates({ plate: r.plate ?? null, vin: r.vin ?? null });
        })
        .catch(() => {
          if (!aliveRef.current) return;
          setDuplicates({ plate: null, vin: null });
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [open, step, authUser?.user_id, draft.registrationPlate, draft.vin]);

  const validate = (): boolean => {
    const errors: Partial<Record<keyof VehicleOcrDraft, string>> = {};
    if (!draft.brand.trim()) errors.brand = 'Obligatorio';
    if (!draft.model.trim()) errors.model = 'Obligatorio';
    if (!draft.year.trim() || Number(draft.year) < 1900) errors.year = 'Año no válido';
    if (!draft.registrationPlate.trim()) errors.registrationPlate = 'Obligatorio';
    const purchase = parseLocaleNumber(draft.purchasePrice);
    if (!draft.purchasePrice.trim() || !Number.isFinite(purchase) || purchase <= 0) {
      errors.purchasePrice = 'Indica el precio de compra';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    setError('');
    if (!validate()) {
      toast.error('Completa los campos obligatorios');
      return;
    }
    if (duplicates.plate || duplicates.vin) {
      setError('Matrícula o VIN ya registrados');
      toast.error('Ya existe un vehículo con esa matrícula o VIN');
      return;
    }

    setStep('saving');
    try {
      const created = await addVehicle({
        brand: draft.brand.trim(),
        model: draft.model.trim(),
        version: draft.version.trim() || undefined,
        year: Number(draft.year),
        registrationPlate: draft.registrationPlate.trim().toUpperCase(),
        vin: draft.vin.trim().toUpperCase() || undefined,
        mileage: draft.mileage.trim() ? parseLocaleNumber(draft.mileage) : undefined,
        color: draft.color.trim(),
        fuelType: (draft.fuelType || undefined) as Vehicle['fuelType'],
        transmission: (draft.transmission || undefined) as Vehicle['transmission'],
        power: draft.power.trim() ? parseLocaleNumber(draft.power) : undefined,
        purchasePrice: parseLocaleNumber(draft.purchasePrice),
        salePrice: draft.salePrice.trim() ? parseLocaleNumber(draft.salePrice) : undefined,
        notes: draft.notes.trim() || undefined,
        status: 'listo',
        purchaseDate: new Date().toISOString().slice(0, 10),
      });

      if (!created?.id) throw new Error('No se recibió el vehículo creado');

      const scanBase64 = base64Ref.current;
      const scanMime = mimeRef.current;
      if (
        attachDoc
        && authUser?.user_id
        && scanBase64
        && estimateBase64Bytes(scanBase64) <= OCR_MAX_PAYLOAD_BYTES
      ) {
        try {
          const dataUrl =
            scanMime === 'application/pdf'
              ? `data:application/pdf;base64,${scanBase64}`
              : `data:${scanMime};base64,${scanBase64}`;
          const docType = resolveOcrVehicleDocType(draft.documentType);
          const response = await addVehicleDocumentRequest(authUser.user_id, created.id, {
            name: draft.documentTypeLabel || 'Documento OCR',
            documentType: docType,
            fileUrl: dataUrl,
            fileName,
            mimeType: scanMime,
            fileSize: estimateBase64Bytes(scanBase64),
          });
          if (response.vehicle) syncVehicle(response.vehicle);
        } catch {
          toast.warning('Vehículo creado, pero no se pudo adjuntar el documento escaneado');
        }
      } else if (attachDoc === false && scanBase64) {
        toast.message('Vehículo creado. El documento no se adjuntó (archivo grande).');
      }

      // Liberar payload en memoria antes de cerrar.
      clearPayload();
      toast.success('Vehículo creado desde OCR');
      onCreated?.(created.id);
      onClose();
    } catch (err) {
      if (err instanceof VehicleDuplicateError) {
        setDuplicates({
          plate: err.duplicates.plate ?? null,
          vin: err.duplicates.vin ?? null,
        });
        setError('Matrícula o VIN duplicados');
        toast.error('Matrícula o VIN ya registrados');
      } else {
        setError(err instanceof Error ? err.message : 'Error al crear');
        toast.error(err instanceof Error ? err.message : 'Error al crear el vehículo');
      }
      setStep('review');
    }
  };

  if (!open) return null;

  const busy = step === 'preparing' || step === 'scanning' || step === 'saving';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={busy ? undefined : handleClose}
    >
      <div
        className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-gray-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800 sm:px-5 sm:py-4">
          <div className="min-w-0 pr-2">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
              Alta con OCR
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Foto del permiso / ficha → revisar → crear
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-950/40 sm:p-8">
                <ScanLine className={`mx-auto h-10 w-10 ${VERTIAL_ACCENT_TEXT}`} strokeWidth={1.5} />
                <p className="mt-3 text-sm font-medium text-stone-900 dark:text-stone-100">
                  Permiso de circulación o ficha técnica
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  En móvil comprimimos la foto automáticamente para no saturar la memoria
                </p>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
                  <button
                    type="button"
                    onClick={() => void handleCamera()}
                    className={VERTIAL_BTN_PRIMARY}
                  >
                    <Camera className="h-4 w-4" />
                    Hacer foto
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGallery()}
                    className={VERTIAL_BTN_SECONDARY}
                  >
                    {isNative ? <Images className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                    {isNative ? 'Galería' : 'Subir archivo'}
                  </button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void handleFile(f);
                  }}
                />
              </div>
              {error ? (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              ) : null}
            </div>
          )}

          {(step === 'preparing' || step === 'scanning') && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <LoaderCircle className={`h-10 w-10 animate-spin ${VERTIAL_ACCENT_TEXT}`} />
              <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
                {step === 'preparing' ? 'Preparando imagen…' : 'Leyendo documento…'}
              </p>
              <p className="text-xs text-stone-500">
                {step === 'preparing'
                  ? 'Comprimiendo para móvil'
                  : 'Suele tardar unos segundos'}
              </p>
            </div>
          )}

          {(step === 'review' || step === 'saving') && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900 dark:bg-emerald-950/30">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                  {draft.documentTypeLabel || 'Documento leído'}
                </span>
                {draft.confidenceScore != null ? (
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-black/20 dark:text-emerald-300">
                    {draft.confidenceScore}% confianza
                  </span>
                ) : null}
              </div>

              {(previewUrl || mimeRef.current === 'application/pdf') && (
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-950/40">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt=""
                      className="h-14 w-14 rounded-lg object-cover"
                      decoding="async"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white dark:bg-gray-900">
                      <FileText className="h-6 w-6 text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{fileName}</p>
                    <p className="text-xs text-gray-500">
                      {attachDoc
                        ? 'Se adjuntará al vehículo al crear'
                        : 'No se adjuntará (archivo grande); el vehículo sí se crea'}
                    </p>
                  </div>
                </div>
              )}

              {(duplicates.plate || duplicates.vin) && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                  <p className="font-medium">Posible duplicado</p>
                  {duplicates.plate ? (
                    <p className="text-xs">
                      Matrícula: {duplicates.plate.brand} {duplicates.plate.model}
                    </p>
                  ) : null}
                  {duplicates.vin ? (
                    <p className="text-xs">
                      VIN: {duplicates.vin.brand} {duplicates.vin.model}
                    </p>
                  ) : null}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Marca" required error={fieldErrors.brand}>
                  <input className={inputClass} value={draft.brand} onChange={(e) => setField('brand', e.target.value)} disabled={step === 'saving'} autoComplete="off" />
                </Field>
                <Field label="Modelo" required error={fieldErrors.model}>
                  <input className={inputClass} value={draft.model} onChange={(e) => setField('model', e.target.value)} disabled={step === 'saving'} autoComplete="off" />
                </Field>
                <Field label="Versión">
                  <input className={inputClass} value={draft.version} onChange={(e) => setField('version', e.target.value)} disabled={step === 'saving'} autoComplete="off" />
                </Field>
                <Field label="Año" required error={fieldErrors.year}>
                  <input className={inputClass} inputMode="numeric" value={draft.year} onChange={(e) => setField('year', e.target.value)} disabled={step === 'saving'} />
                </Field>
                <Field label="Matrícula" required error={fieldErrors.registrationPlate}>
                  <input
                    className={inputClass}
                    value={draft.registrationPlate}
                    onChange={(e) => setField('registrationPlate', e.target.value.toUpperCase())}
                    disabled={step === 'saving'}
                    autoCapitalize="characters"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Bastidor (VIN)">
                  <input
                    className={inputClass}
                    value={draft.vin}
                    onChange={(e) => setField('vin', e.target.value.toUpperCase())}
                    disabled={step === 'saving'}
                    autoCapitalize="characters"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Kilómetros">
                  <input className={inputClass} inputMode="numeric" value={draft.mileage} onChange={(e) => setField('mileage', e.target.value)} disabled={step === 'saving'} />
                </Field>
                <Field label="Color">
                  <input className={inputClass} value={draft.color} onChange={(e) => setField('color', e.target.value)} disabled={step === 'saving'} />
                </Field>
                <Field label="Combustible">
                  <select className={inputClass} value={draft.fuelType} onChange={(e) => setField('fuelType', e.target.value)} disabled={step === 'saving'}>
                    {FUEL_TYPES.map((f) => (
                      <option key={f.value || 'empty'} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Cambio">
                  <select className={inputClass} value={draft.transmission} onChange={(e) => setField('transmission', e.target.value)} disabled={step === 'saving'}>
                    {TRANSMISSION_TYPES.map((f) => (
                      <option key={f.value || 'empty'} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Potencia (CV)">
                  <input className={inputClass} inputMode="numeric" value={draft.power} onChange={(e) => setField('power', e.target.value)} disabled={step === 'saving'} />
                </Field>
                <Field label="Precio de compra (€)" required error={fieldErrors.purchasePrice}>
                  <input className={inputClass} inputMode="decimal" value={draft.purchasePrice} onChange={(e) => setField('purchasePrice', e.target.value)} disabled={step === 'saving'} placeholder="Obligatorio para el stock" />
                </Field>
                <Field label="Precio de venta (€)">
                  <input className={inputClass} inputMode="decimal" value={draft.salePrice} onChange={(e) => setField('salePrice', e.target.value)} disabled={step === 'saving'} />
                </Field>
              </div>

              <Field label="Notas">
                <textarea
                  className={`${inputClass} min-h-[72px] resize-y`}
                  value={draft.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  disabled={step === 'saving'}
                />
              </Field>

              {error ? (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-gray-800 sm:px-5 sm:py-4">
          {step === 'review' ? (
            <>
              <button
                type="button"
                onClick={reset}
                className={VERTIAL_BTN_SECONDARY}
              >
                Otro documento
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                className={VERTIAL_BTN_PRIMARY}
              >
                <CheckCircle2 className="h-4 w-4" />
                Crear vehículo
              </button>
            </>
          ) : step === 'saving' ? (
            <button
              type="button"
              disabled
              className={`${VERTIAL_BTN_PRIMARY} opacity-80`}
            >
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Creando…
            </button>
          ) : step === 'preparing' || step === 'scanning' ? (
            <button
              type="button"
              onClick={reset}
              className={VERTIAL_BTN_SECONDARY}
            >
              Cancelar
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className={VERTIAL_BTN_SECONDARY}
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
