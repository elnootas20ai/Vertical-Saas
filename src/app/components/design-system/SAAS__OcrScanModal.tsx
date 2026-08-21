import { useState, useRef, useCallback, useEffect } from 'react';
import { X, ScanLine, Upload, FileText, CheckCircle, Loader2, AlertCircle, Eye, Receipt, ArrowRight, AlertTriangle, Copy, RotateCcw, Send, Shield, Zap, Target, PackagePlus, Factory, Camera, Images } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';
import { useCamera } from '../../hooks/useCamera';
import {
  scanDocument, processOcr, approveProposal,
  DOC_TYPE_LABELS, DOC_TYPE_ICONS, DOC_TYPE_COLORS, MODULE_LABELS,
  type OcrResult, type OcrProposal, type OcrEntityMatch, type OcrScanMeta,
  type OcrRouteResult,
} from '../../lib/ocrApi';
import { createSupplierRequest, listCatalogItemsRequest, type CatalogItem } from '../../lib/deliveryApi';
import { openNativeAppSettings } from '../../lib/vertialPrint/localNetworkPermission';
import { matchVehicleByPlateOrVin } from '../../lib/ocrDocumentSave';
import { toast } from 'sonner';

const MAX_IMAGE_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

type Step = 'upload' | 'scanning' | 'processing' | 'result' | 'saving' | 'done' | 'duplicate' | 'error';

type ProposalLine = {
  description?: string;
  itemName?: string;
  quantity?: number;
  total?: number;
  catalogItemId?: string;
  catalogItemName?: string;
  matchConfidence?: number;
  matchMethod?: string;
};

function readProposalField<T>(proposal: OcrProposal | null, key: string): T | null {
  if (!proposal?.fields) return null;
  const raw = proposal.fields[key as keyof typeof proposal.fields];
  if (raw == null) return null;
  if (typeof raw === 'object' && raw !== null && 'value' in raw) {
    return (raw as { value: T }).value;
  }
  return raw as T;
}

function isComprasPurchaseDoc(ocrResult: OcrResult | null, targetModule?: string): boolean {
  if (!ocrResult) return targetModule === 'compras';
  return ['factura_proveedor', 'albaran'].includes(ocrResult.documentType || '') || targetModule === 'compras';
}

function countUnmatchedStockLines(lines: Array<ProposalLine | Record<string, unknown>>): number {
  return lines.filter((line) => {
    const pl = line as ProposalLine;
    const hasQty = Number(pl.quantity || 0) > 0;
    const hasLabel = Boolean(String(pl.description || pl.itemName || '').trim());
    if (!hasQty && !hasLabel) return false;
    return !String(pl.catalogItemId || '').trim();
  }).length;
}

function sideEffectsSummary(sideEffects: OcrRouteResult['sideEffects']) {
  if (!sideEffects) return null;
  const parts: string[] = [];
  if (sideEffects.stockUpdated && sideEffects.stockUpdated > 0) {
    parts.push(`${sideEffects.stockUpdated} artículo(s) en inventario (+${sideEffects.stockUnits ?? 0} ud)`);
  }
  if (sideEffects.financeMovementId && !sideEffects.financeSkipped) {
    parts.push('Pago registrado en Finanzas');
  }
  if (sideEffects.matchedLines != null && sideEffects.totalLines != null) {
    parts.push(`${sideEffects.matchedLines}/${sideEffects.totalLines} líneas vinculadas al catálogo`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onDocumentCreated?: (payload: Record<string, unknown>) => Promise<void>;
  userId?: string;
  targetModule?: string;
  context?: Record<string, unknown>;
  vehicles?: Array<{ id: string; brand?: string; model?: string; registrationPlate?: string; vin?: string }>;
  clients?: Array<{ id: string; name?: string; nif?: string }>;
  defaultOcrMode?: 'financial' | 'vehicle';
  /** Si true, al abrir intenta lanzar cámara (mobile capture). */
  autoOpenCamera?: boolean;
  /** Oculta el toggle financiero/vehículo (flujo compraventa fijado). */
  lockOcrMode?: boolean;
}

function formatCurrency(amount: number | null | undefined, currency?: string | null) {
  if (amount == null) return '\u2014';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'EUR' }).format(amount);
}

function ConfidenceBadge({ score }: { score: number | null | undefined }) {
  const s = score ?? 0;
  const color = s >= 85 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    : s >= 60 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}><Shield className="w-3 h-3" />{s}%</span>;
}

function WarningsList({ warnings }: { warnings: Array<{ code: string; field: string; message: string; severity: string }> }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {warnings.map((w, i) => (
        <div key={i} className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg ${
          w.severity === 'error' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
          : w.severity === 'warning' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
          : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
        }`}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{w.message}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Reduce y recomprime una imagen para evitar picos de memoria en móvil.
 * Las fotos de móvil son 4-12 MB JPEG; sin esto la WebView puede quedarse
 * en negro / congelarse al pasarlas a base64.
 * Devuelve { base64, mime } listos para enviar al OCR.
 */
async function downscaleImageSrcToBase64(src: string): Promise<{ base64: string; mime: string }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('No se pudo decodificar la imagen'));
    el.src = src;
  });

  const maxSide = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = maxSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / maxSide : 1;
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear canvas');
  // Fondo blanco por si la imagen es PNG con transparencia (OpenAI Vision prefiere JPEG).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  const base64 = dataUrl.split(',')[1] || '';
  return { base64, mime: 'image/jpeg' };
}

async function downscaleImageToBase64(file: File): Promise<{ base64: string; mime: string }> {
  const url = URL.createObjectURL(file);
  try {
    return await downscaleImageSrcToBase64(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, raw] = dataUrl.split(',');
  const mime = /data:([^;]+);/.exec(header || '')?.[1] || 'image/jpeg';
  const binary = atob(raw || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Lectura simple a base64 sin procesar (para PDFs ya convertidos o casos donde
 * el downscaling no aplique). Asíncrono para no bloquear el hilo principal.
 */
function fileToRawBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

async function pdfFileToPngBase64(file: File): Promise<string> {
  // Usar el build "legacy" en navegador para evitar errores de bundling/transpilación.
  // @ts-expect-error pdfjs-dist exports differ by build
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Necesario para evitar: "No 'GlobalWorkerOptions.workerSrc' specified."
  // @ts-expect-error pdfjs-dist types vary by build
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  // @ts-expect-error pdfjs-dist types vary by build
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear canvas para renderizar el PDF');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1] || '';
}

export function SAAS__OcrScanModal({
  isOpen,
  onClose,
  onDocumentCreated,
  userId,
  targetModule,
  context,
  vehicles = [],
  clients = [],
  defaultOcrMode,
  autoOpenCamera,
  lockOcrMode = false,
}: Props) {
  const { takePhotoDetailed, isNative } = useCamera();
  const [ocrMode, setOcrMode] = useState<'financial' | 'vehicle'>(defaultOcrMode || 'financial');
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [scanMeta, setScanMeta] = useState<OcrScanMeta | null>(null);
  const [proposal, setProposal] = useState<OcrProposal | null>(null);
  const [entityMatches, setEntityMatches] = useState<OcrEntityMatch[]>([]);
  const [validation, setValidation] = useState<{ warnings: Array<{ code: string; field: string; message: string; severity: string }>; errors: unknown[]; isValid: boolean } | null>(null);
  const [destinationInfo, setDestinationInfo] = useState<Record<string, unknown> | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<string>('');
  const [duplicateInfo, setDuplicateInfo] = useState<Record<string, unknown> | null>(null);
  const [routeResult, setRouteResult] = useState<OcrRouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [supplierDecision, setSupplierDecision] = useState<'pending' | 'created' | 'skipped'>('pending');
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [linkedSupplier, setLinkedSupplier] = useState<{ _id: string; name: string } | null>(null);
  const [stockMatchDecision, setStockMatchDecision] = useState<'pending' | 'confirmed'>('pending');
  /** Líneas editables (vínculo manual inventario ↔ texto proveedor). */
  const [editableLines, setEditableLines] = useState<ProposalLine[] | null>(null);
  const [stockItems, setStockItems] = useState<CatalogItem[]>([]);
  /** Opción explícita: cargar líneas al almacén al aprobar factura/albarán. */
  const [loadToWarehouse, setLoadToWarehouse] = useState(true);
  const contextVehicleId = String(context?.vehicleId || '').trim();
  const [selectedVehicleId, setSelectedVehicleId] = useState(contextVehicleId);
  const hideModeToggle = lockOcrMode || (defaultOcrMode === 'vehicle' && Boolean(contextVehicleId));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const base64Ref = useRef<string>('');
  const mimeRef = useRef<string>('');
  const applyEntityMatches = useCallback((matches: OcrEntityMatch[]) => {
    setEntityMatches(matches);
    const sm = matches.find((m) => m.matchType === 'supplier');
    if (sm?.matchedEntity && !sm.suggestNew) {
      setLinkedSupplier({ _id: sm.matchedEntity._id, name: sm.matchedEntity.name });
      setSupplierDecision('created');
    } else {
      setLinkedSupplier(null);
      setSupplierDecision('pending');
    }
  }, []);

  // Limpia el objectURL anterior cuando cambia (o al desmontar) para no
  // dejar bitmaps colgando en memoria en móvil.
  const setPreview = useCallback((url: string | null) => {
    if (previewUrlRef.current && previewUrlRef.current !== url) {
      try { URL.revokeObjectURL(previewUrlRef.current); } catch { /* noop */ }
    }
    previewUrlRef.current = url;
    setPreviewUrl(url);
  }, []);

  const reset = useCallback(() => {
    setStep('upload'); setFile(null); setPreview(null);
    setIsPreparing(false);
    setOcrResult(null); setScanMeta(null); setProposal(null);
    setEntityMatches([]); setValidation(null); setDestinationInfo(null);
    setPipelineStatus(''); setDuplicateInfo(null); setRouteResult(null);
    setError(null); setShowPreview(false);
    setSupplierDecision('pending'); setCreatingSupplier(false); setLinkedSupplier(null);
    setStockMatchDecision('pending');
    setEditableLines(null);
    setStockItems([]);
    setOcrMode(defaultOcrMode || 'financial');
    setSelectedVehicleId(String(context?.vehicleId || '').trim());
    base64Ref.current = ''; mimeRef.current = '';
  }, [defaultOcrMode, context?.vehicleId, setPreview]);

  const resolveVehicleId = useCallback(
    (data: OcrResult | null | undefined) => {
      if (selectedVehicleId) return selectedVehicleId;
      if (contextVehicleId) return contextVehicleId;
      const matched = matchVehicleByPlateOrVin(
        vehicles,
        data?.registrationPlate,
        data?.vin,
      );
      return matched?.id || '';
    },
    [selectedVehicleId, contextVehicleId, vehicles],
  );

  const buildCreatedPayload = useCallback(
    (data: OcrResult, extra: Record<string, unknown> = {}) => {
      const vehicleId = resolveVehicleId(data);
      const clientMatch = clients.find((c) => {
        const nif = String(c.nif || '').replace(/[\s.-]/g, '').toUpperCase();
        const hints = [data.ownerNif, data.buyerNif, data.sellerNif]
          .map((x) => String(x || '').replace(/[\s.-]/g, '').toUpperCase())
          .filter(Boolean);
        return Boolean(nif && hints.includes(nif));
      });
      return {
        name: data.documentTypeLabel || file?.name || 'Documento OCR',
        ocrData: data,
        vehicleId: vehicleId || undefined,
        clientId: clientMatch?.id,
        ...extra,
      };
    },
    [resolveVehicleId, clients, file?.name],
  );

  const handleClose = () => { reset(); onClose(); };

  // Cleanup definitivo al desmontar.
  useEffect(() => () => {
    if (previewUrlRef.current) {
      try { URL.revokeObjectURL(previewUrlRef.current); } catch { /* noop */ }
      previewUrlRef.current = null;
    }
  }, []);

  // Bug de WebView Android Chrome: tras volver del intent de cámara la app
  // puede quedarse con un buffer en negro hasta que algo fuerce un repaint.
  // Forzamos un reflow ligero al recuperar visibilidad.
  useEffect(() => {
    if (!isOpen) return;
    const forceRepaint = () => {
      if (document.visibilityState !== 'visible') return;
      // Toggle de transform en el body para forzar composición/repaint.
      const b = document.body;
      const prev = b.style.transform;
      b.style.transform = 'translateZ(0)';
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      b.offsetHeight;
      b.style.transform = prev;
    };
    document.addEventListener('visibilitychange', forceRepaint);
    window.addEventListener('pageshow', forceRepaint);
    return () => {
      document.removeEventListener('visibilitychange', forceRepaint);
      window.removeEventListener('pageshow', forceRepaint);
    };
  }, [isOpen]);

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    setError(null);
    setFile(selectedFile);
    setIsPreparing(true);
    base64Ref.current = '';

    const name = (selectedFile.name || '').toLowerCase();
    const inferred =
      name.endsWith('.pdf') ? 'application/pdf'
      : name.endsWith('.jpg') || name.endsWith('.jpeg') ? 'image/jpeg'
      : name.endsWith('.png') ? 'image/png'
      : name.endsWith('.webp') ? 'image/webp'
      : name.endsWith('.gif') ? 'image/gif'
      : '';
    const rawMime = (selectedFile.type || inferred || 'application/octet-stream');
    mimeRef.current = rawMime;

    try {
      if (rawMime.startsWith('image/')) {
        // Downscale ANTES de pasar a base64 para evitar picos de memoria.
        const { base64, mime } = await downscaleImageToBase64(selectedFile);
        base64Ref.current = base64;
        mimeRef.current = mime;
        // Preview con objectURL (revocable) en vez de la dataURL de 8-16 MB.
        setPreview(URL.createObjectURL(selectedFile));
      } else if (rawMime === 'application/pdf') {
        // El PDF se convierte a PNG justo antes de escanear (lazy).
        base64Ref.current = await fileToRawBase64(selectedFile);
        setPreview(null);
      } else {
        base64Ref.current = await fileToRawBase64(selectedFile);
        setPreview(null);
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'No se pudo preparar el archivo');
    } finally {
      setIsPreparing(false);
    }
  }, [setPreview]);

  const ingestNativePhoto = useCallback(
    async (source: 'camera' | 'photos') => {
      setError(null);
      setIsPreparing(true);
      try {
        const result = await takePhotoDetailed({
          source,
          // Calidad alta suficiente para OCR sin saturar memoria en iOS.
          quality: 80,
          allowEditing: false,
          maxWidth: 1600,
        });

        if (!result.ok) {
          if (result.reason !== 'cancelled') {
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
          }
          return;
        }

        // Downscale directo desde dataUrl (evita File/fetch frágil en WebView).
        const { base64, mime } = await downscaleImageSrcToBase64(result.photo.dataUrl);
        base64Ref.current = base64;
        mimeRef.current = mime;
        const blob = dataUrlToBlob(`data:${mime};base64,${base64}`);
        const f = new File([blob], `ocr-${source}-${Date.now()}.jpg`, { type: mime });
        setFile(f);
        setPreview(URL.createObjectURL(blob));
      } catch (err: unknown) {
        const msg = (err as Error).message || 'No se pudo procesar la foto';
        setError(msg);
        toast.error(msg);
      } finally {
        setIsPreparing(false);
      }
    },
    [takePhotoDetailed, setPreview],
  );

  /**
   * Cámara nativa (Capacitor) o input file en web.
   */
  const handleOpenCamera = useCallback(async () => {
    if (isNative) {
      await ingestNativePhoto('camera');
      return;
    }
    cameraInputRef.current?.click();
  }, [isNative, ingestNativePhoto]);

  const handleOpenGallery = useCallback(async () => {
    if (isNative) {
      await ingestNativePhoto('photos');
      return;
    }
    fileInputRef.current?.click();
  }, [isNative, ingestNativePhoto]);

  // Auto-open camera input on open when requested.
  // (Only when no file selected yet.)
  useEffect(() => {
    if (!isOpen) return;
    if (!autoOpenCamera) return;
    if (step !== 'upload') return;
    if (file) return;
    const t = setTimeout(() => { void handleOpenCamera(); }, 50);
    return () => clearTimeout(t);
  }, [isOpen, autoOpenCamera, step, file, handleOpenCamera]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) void handleFileSelect(dropped);
  };

  const startScan = async () => {
    if (!file || !base64Ref.current || isPreparing) return;
    setStep('scanning');
    setError(null);

    try {
      const mt = (mimeRef.current || '').toLowerCase().trim();
      const name = (file.name || '').toLowerCase();
      const looksLikePdf = mt === 'application/pdf' || name.endsWith('.pdf');
      const looksLikeImage = mt.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/.test(name);
      const isSupported = looksLikePdf || looksLikeImage;
      if (!isSupported) {
        throw new Error('Formato no soportado. Sube una imagen (jpg/png/webp/gif) o un PDF.');
      }

      // En local (Windows) la conversión de PDF en backend puede fallar.
      // Convertimos aquí el PDF a PNG para que el OCR siempre reciba imagen.
      // (Las imágenes ya vienen downscaleadas desde handleFileSelect.)
      if (looksLikePdf) {
        base64Ref.current = await pdfFileToPngBase64(file);
        mimeRef.current = 'image/png';
      }

      const scanRes = await scanDocument(base64Ref.current, mimeRef.current, { targetModule, ...(context || {}) }, ocrMode);

      if (scanRes.data?.parseError) throw new Error('No se pudo interpretar el documento. Intenta con una imagen mas clara.');

      setOcrResult(scanRes.data);
      setScanMeta(scanRes.meta);
      if (!selectedVehicleId && !contextVehicleId) {
        const autoVehicle = matchVehicleByPlateOrVin(
          vehicles,
          scanRes.data?.registrationPlate,
          scanRes.data?.vin,
        );
        if (autoVehicle) setSelectedVehicleId(autoVehicle.id);
      }
      setStep('processing');

      const processRes = await processOcr({
        ocrData: scanRes.data,
        sourceFileName: file.name,
        sourceMimeType: mimeRef.current,
        sourceSize: file.size,
        sourceHash: scanRes.meta.sourceHash,
        // No enviamos la imagen completa de nuevo (ya se escaneó); evita payloads enormes.
        sourceImageBase64: undefined,
        processingTimeMs: scanRes.meta.processingTimeMs,
        tokensUsed: scanRes.meta.tokensUsed,
        model: scanRes.meta.model,
      });

      setPipelineStatus(processRes.status);

      if (processRes.status === 'duplicate') {
        setDuplicateInfo(processRes.duplicate as Record<string, unknown>);
        setStep('duplicate');
        return;
      }

      if (processRes.proposal) setProposal(processRes.proposal);
      if (processRes.entityMatches) applyEntityMatches(processRes.entityMatches);
      if (processRes.validation) setValidation(processRes.validation as typeof validation);
      if (processRes.destination) setDestinationInfo(processRes.destination as Record<string, unknown>);
      if (processRes.routeResult) setRouteResult(processRes.routeResult);

      if (processRes.status === 'auto_approved' && processRes.routeResult) {
        setStep('done');
        if (onDocumentCreated && scanRes.data && file) {
          void onDocumentCreated(
            buildCreatedPayload(scanRes.data, {
              file,
              fileBase64: base64Ref.current,
              fileMimeType: mimeRef.current,
              proposalId: processRes.proposal?._id,
              documentId: processRes.routeResult.documentId,
              database: processRes.routeResult.database,
              sideEffects: processRes.routeResult.sideEffects,
            }),
          ).catch(() => {});
        }
      } else {
        setStep('result');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Error inesperado');
      setStep('error');
    }
  };

  const handleCreateSupplier = async () => {
    const name = String(ocrResult?.emitter || readProposalField<string>(proposal, 'supplierName') || '').trim();
    if (!userId || !proposal || !name) {
      toast.error('Faltan datos para crear el proveedor');
      return;
    }
    setCreatingSupplier(true);
    try {
      const created = await createSupplierRequest(userId, {
        name,
        cif: String(ocrResult?.emitterCIF || '').trim(),
        notes: 'Creado automáticamente desde OCR',
        active: true,
      });
      const editRes = await editProposal(proposal._id, {
        fields: {
          supplierId: { value: created._id, confidence: 100, source: 'created' },
          supplierName: { value: created.name, confidence: 100, source: 'created' },
        },
      });
      setProposal(editRes.proposal);
      setLinkedSupplier({ _id: created._id, name: created.name });
      setEntityMatches((prev) =>
        prev.map((m) =>
          m.matchType === 'supplier'
            ? {
                ...m,
                matchedEntity: {
                  _id: created._id,
                  name: created.name,
                  cif: created.cif || '',
                  email: created.email || '',
                },
                confidence: 100,
                suggestNew: false,
              }
            : m,
        ),
      );
      setSupplierDecision('created');
      toast.success(`Proveedor «${created.name}» creado y vinculado`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear proveedor');
    } finally {
      setCreatingSupplier(false);
    }
  };

  const handleApprove = async () => {
    if (!proposal) return;
    const sm = entityMatches.find((m) => m.matchType === 'supplier');
    const supplierNameCheck = String(ocrResult?.emitter || readProposalField<string>(proposal, 'supplierName') || '').trim();
    const comprasDoc =
      ocrResult &&
      (['factura_proveedor', 'albaran'].includes(ocrResult.documentType || '') || targetModule === 'compras');
    const pendingSupplier =
      comprasDoc &&
      Boolean(supplierNameCheck) &&
      (!sm?.matchedEntity || sm.suggestNew) &&
      !linkedSupplier &&
      supplierDecision === 'pending';
    if (pendingSupplier) {
      toast.error('Indica si quieres crear el proveedor o continuar sin vincularlo');
      return;
    }
    const linesForCheck =
      editableLines ||
      readProposalField<ProposalLine[]>(proposal, 'lines') ||
      ocrResult?.lines ||
      [];
    const unmatchedStockLines = isComprasPurchaseDoc(ocrResult, targetModule) ? countUnmatchedStockLines(linesForCheck) : 0;
    if (unmatchedStockLines > 0 && stockMatchDecision === 'pending') {
      toast.error('Confirma si quieres continuar sin subir stock en las líneas sin vínculo');
      return;
    }
    setStep('saving');
    try {
      const matchedCount = linesForCheck.filter((l) => String((l as ProposalLine).catalogItemId || '').trim()).length;
      const approveFields = {
        ...(linkedSupplier
          ? {
              supplierId: { value: linkedSupplier._id, confidence: 100, source: 'created' },
              supplierName: { value: linkedSupplier.name, confidence: 100, source: 'created' },
            }
          : {}),
        ...(isComprasPurchaseDoc(ocrResult, targetModule)
          ? {
              loadToWarehouse: { value: loadToWarehouse, confidence: 100, source: 'user' },
              lines: { value: linesForCheck, confidence: 100, source: editableLines ? 'user' : 'auto' },
              catalogMatchSummary: {
                value: {
                  totalLines: linesForCheck.length,
                  matchedLines: matchedCount,
                  unmatchedLines: linesForCheck.length - matchedCount,
                },
                confidence: 100,
                source: 'user',
              },
              ...(String(context?.workCenterId || context?.costCenterId || '').trim()
                ? {
                    workCenterId: {
                      value: String(context?.workCenterId || context?.costCenterId || '').trim(),
                      confidence: 100,
                      source: 'user',
                    },
                    workCenterName: {
                      value: String(context?.workCenterName || context?.costCenterName || '').trim(),
                      confidence: 100,
                      source: 'user',
                    },
                    costCenterId: {
                      value: String(context?.workCenterId || context?.costCenterId || '').trim(),
                      confidence: 100,
                      source: 'user',
                    },
                    costCenterName: {
                      value: String(context?.workCenterName || context?.costCenterName || '').trim(),
                      confidence: 100,
                      source: 'user',
                    },
                  }
                : {}),
              ...(String(context?.businessId || '').trim()
                ? {
                    businessId: {
                      value: String(context?.businessId || '').trim(),
                      confidence: 100,
                      source: 'user',
                    },
                    businessName: {
                      value: String(context?.businessName || '').trim(),
                      confidence: 100,
                      source: 'user',
                    },
                  }
                : {}),
            }
          : {}),
      };
      const res = await approveProposal(
        proposal._id,
        Object.keys(approveFields).length > 0 ? approveFields : undefined,
      );
      setRouteResult(res.routeResult);
      setProposal(res.proposal);
      setStep('done');

      if (onDocumentCreated && ocrResult && file) {
        await onDocumentCreated(
          buildCreatedPayload(ocrResult, {
            file,
            fileBase64: base64Ref.current,
            fileMimeType: mimeRef.current,
            proposalId: proposal._id,
            documentId: res.routeResult.documentId,
            database: res.routeResult.database,
            sideEffects: res.routeResult.sideEffects,
          }),
        ).catch(() => {});
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Error aprobando');
      setStep('error');
    }
  };

  const handleForceDuplicate = async () => {
    if (!ocrResult || !file || !scanMeta) return;
    setStep('processing');
    try {
      const processRes = await processOcr({
        ocrData: ocrResult, sourceFileName: file.name,
        sourceMimeType: mimeRef.current, sourceSize: file.size,
        sourceHash: scanMeta.sourceHash, processingTimeMs: scanMeta.processingTimeMs,
        tokensUsed: scanMeta.tokensUsed, model: scanMeta.model,
        forceDuplicate: true,
      });
      setPipelineStatus(processRes.status);
      if (processRes.proposal) setProposal(processRes.proposal);
      if (processRes.entityMatches) applyEntityMatches(processRes.entityMatches);
      if (processRes.validation) setValidation(processRes.validation as typeof validation);
      if (processRes.destination) setDestinationInfo(processRes.destination as Record<string, unknown>);
      setStep('result');
    } catch (err: unknown) {
      setError((err as Error).message || 'Error procesando');
      setStep('error');
    }
  };

  useEffect(() => {
    if (!isOpen || step !== 'result' || !userId) return;
    if (!isComprasPurchaseDoc(ocrResult, targetModule)) return;
    let cancelled = false;
    void listCatalogItemsRequest(userId, 'stock')
      .then((items) => {
        if (!cancelled) setStockItems(items.filter((i) => i.active !== false && !i.deletedAt));
      })
      .catch(() => {
        if (!cancelled) setStockItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, step, userId, ocrResult?.documentType, targetModule]);

  useEffect(() => {
    if (!proposal) {
      setEditableLines(null);
      return;
    }
    const lines = readProposalField<ProposalLine[]>(proposal, 'lines');
    if (Array.isArray(lines) && lines.length > 0) {
      setEditableLines(lines.map((l) => ({ ...l })));
    }
  }, [proposal?._id]);

  const linkLineToStock = useCallback((lineIndex: number, catalogItemId: string) => {
    setEditableLines((prev) => {
      const base =
        prev ||
        readProposalField<ProposalLine[]>(proposal, 'lines') ||
        (ocrResult?.lines as ProposalLine[]) ||
        [];
      const item = stockItems.find((s) => s._id === catalogItemId);
      return base.map((line, idx) => {
        if (idx !== lineIndex) return line;
        if (!catalogItemId) {
          return {
            ...line,
            catalogItemId: '',
            catalogItemName: '',
            matchConfidence: 0,
            matchMethod: 'none',
          };
        }
        return {
          ...line,
          catalogItemId,
          catalogItemName: item?.name || '',
          matchConfidence: 1,
          matchMethod: 'manual',
        };
      });
    });
    setStockMatchDecision('pending');
  }, [proposal, ocrResult?.lines, stockItems]);

  useModalClose(isOpen, handleClose);
  if (!isOpen) return null;

  const docType = ocrResult?.documentType || 'otro';
  const moduleLabel = destinationInfo ? MODULE_LABELS[(destinationInfo as Record<string, string>).module] || (destinationInfo as Record<string, string>).module : '';
  const proposalLines = readProposalField<ProposalLine[]>(proposal, 'lines');
  const displayLines = (editableLines
    || (proposalLines && proposalLines.length > 0 ? proposalLines : null)
    || ocrResult?.lines
    || []) as ProposalLine[];
  const catalogMatchSummary = (() => {
    const base = readProposalField<{ matchedLines: number; totalLines: number }>(proposal, 'catalogMatchSummary');
    if (!editableLines) return base;
    const matched = editableLines.filter((l) => String(l.catalogItemId || '').trim()).length;
    return { matchedLines: matched, totalLines: editableLines.length };
  })();
  const isComprasDoc = isComprasPurchaseDoc(ocrResult, targetModule);
  const supplierMatch = entityMatches.find((m) => m.matchType === 'supplier');
  const ocrSupplierName = String(ocrResult?.emitter || readProposalField<string>(proposal, 'supplierName') || '').trim();
  const needsNewSupplier = isComprasDoc && Boolean(ocrSupplierName) && (!supplierMatch?.matchedEntity || supplierMatch.suggestNew) && !linkedSupplier;
  const unmatchedStockLineCount = isComprasDoc ? countUnmatchedStockLines(displayLines) : 0;
  const needsStockMatchConfirm = isComprasDoc && unmatchedStockLineCount > 0 && stockMatchDecision === 'pending';
  const canApprove = (!needsNewSupplier || supplierDecision !== 'pending') && !needsStockMatchConfirm;

  const stepIndicators = [
    { key: 'upload', label: 'Subir', icon: Upload },
    { key: 'scanning', label: 'Escanear', icon: ScanLine },
    { key: 'processing', label: 'Clasificar', icon: Target },
    { key: 'result', label: 'Propuesta', icon: FileText },
    { key: 'done', label: 'Completado', icon: CheckCircle },
  ];
  const stepKeys = ['upload', 'scanning', 'processing', 'result', 'done'];
  const currentStepIndex = step === 'error' || step === 'duplicate' ? -1
    : step === 'saving' ? 4
    : stepKeys.indexOf(step);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/60 sm:backdrop-blur-sm overflow-y-auto"
      onClick={handleClose}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div
        className="bg-white dark:bg-gray-800 sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl sm:mx-4 sm:max-h-[92vh] sm:overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >

        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-violet-600" />
            OCR Transversal
          </h2>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="px-6 pt-4">
          <div className="flex items-center justify-between mb-6">
            {stepIndicators.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === currentStepIndex;
              const isDone = i < currentStepIndex;
              return (
                <div key={s.key} className="flex items-center gap-2 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                    isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-violet-600 text-white ring-4 ring-violet-100' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                  }`}>
                    {isDone ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span className={`text-xs font-semibold whitespace-nowrap ${isActive ? 'text-violet-600' : isDone ? 'text-emerald-600' : 'text-gray-400'}`}>{s.label}</span>
                  {i < stepIndicators.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 rounded ${isDone ? 'bg-emerald-400' : 'bg-gray-200 dark:bg-gray-700'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 pb-6">

          {step === 'upload' && (
            <div className="space-y-5">
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-violet-500 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef} type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,application/pdf"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { void handleFileSelect(f); } e.target.value = ''; }}
                  className="hidden"
                />
                <input
                  ref={cameraInputRef} type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={e => { const f = e.target.files?.[0]; if (f) { void handleFileSelect(f); } e.target.value = ''; }}
                  className="hidden"
                />
                {file ? (
                  <div>
                    {previewUrl && file.type.startsWith('image/') ? (
                      <img src={previewUrl} alt="Preview" className="max-h-48 mx-auto rounded-lg mb-3 shadow-md" />
                    ) : (
                      <FileText className="w-16 h-16 text-violet-600 mx-auto mb-3" />
                    )}
                    <div className="font-semibold text-gray-900 dark:text-gray-100">{file.name}</div>
                    <div className="text-sm text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                  </div>
                ) : (
                  <div>
                    <ScanLine className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Arrastra cualquier documento</div>
                    <div className="text-sm text-gray-500">Facturas, tickets, contratos, nominas, albaranes, certificados...</div>
                    <div className="text-xs text-gray-400 mt-2">JPG, PNG, WebP o PDF &bull; La IA lo clasificara automaticamente</div>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void handleOpenCamera(); }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
                      >
                        <Camera className="w-4 h-4" /> Usar cámara
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void handleOpenGallery(); }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-sm font-semibold transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <Images className="w-4 h-4" /> Galería
                      </button>
                    </div>
                    {error && step === 'upload' && (
                      <p className="mt-3 text-sm text-red-600 dark:text-red-400 flex items-center justify-center gap-1.5">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {file && (
                <div className="space-y-3">
                  {!hideModeToggle ? (
                    <div className="flex items-center gap-2 p-1 bg-gray-100 dark:bg-gray-700 rounded-xl">
                      <button
                        onClick={() => setOcrMode('financial')}
                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${ocrMode === 'financial' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                      >
                        Financiero / General
                      </button>
                      <button
                        onClick={() => setOcrMode('vehicle')}
                        className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${ocrMode === 'vehicle' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                      >
                        Vehículo / Compraventa
                      </button>
                    </div>
                  ) : (
                    <p className="text-center text-xs font-medium text-violet-600 dark:text-violet-400">
                      Modo vehículo · el documento irá al expediente del coche
                    </p>
                  )}
                  <button
                    onClick={startScan}
                    disabled={isPreparing || !base64Ref.current}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors"
                  >
                    {isPreparing ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Preparando imagen…</>
                    ) : (
                      <><ScanLine className="w-5 h-5" /> Escanear con IA <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {(step === 'scanning' || step === 'processing') && (
            <div className="py-12 text-center space-y-6">
              <div className="relative mx-auto w-20 h-20">
                <div className="absolute inset-0 rounded-full border-4 border-violet-200 dark:border-violet-900" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-600 animate-spin" />
                {step === 'scanning'
                  ? <ScanLine className="absolute inset-0 m-auto w-8 h-8 text-violet-600 animate-pulse" />
                  : <Target className="absolute inset-0 m-auto w-8 h-8 text-violet-600 animate-pulse" />
                }
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                  {step === 'scanning' ? 'Analizando documento...' : 'Clasificando y enrutando...'}
                </h3>
                <p className="text-sm text-gray-500">
                  {step === 'scanning' ? 'La IA esta leyendo y extrayendo datos' : 'Detectando entidades, validando y generando propuesta'}
                </p>
              </div>
              <div className="max-w-xs mx-auto space-y-2">
                {(step === 'scanning'
                  ? ['Procesando imagen', 'Detectando tipo de documento', 'Extrayendo datos']
                  : ['Clasificando documento', 'Buscando entidades', 'Validando datos', 'Generando propuesta']
                ).map((text, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin text-violet-500 flex-shrink-0" /> {text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'result' && ocrResult && proposal && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 p-4 rounded-xl" style={{ backgroundColor: (DOC_TYPE_COLORS[docType] || '#94a3b8') + '15' }}>
                <span className="text-3xl">{DOC_TYPE_ICONS[docType] || '📄'}</span>
                <div className="flex-1">
                  <div className="text-sm font-medium" style={{ color: DOC_TYPE_COLORS[docType] || '#94a3b8' }}>
                    {DOC_TYPE_LABELS[docType] || 'Documento'}
                  </div>
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{ocrResult.documentTypeLabel || docType}</div>
                </div>
                <div className="text-right space-y-1">
                  <ConfidenceBadge score={ocrResult.confidenceScore} />
                  {ocrResult.documentNumber && <div className="font-mono text-xs text-gray-500">#{ocrResult.documentNumber}</div>}
                </div>
              </div>

              {needsNewSupplier && (
                <div className="p-4 rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 space-y-3">
                  <div className="flex items-start gap-3">
                    <Factory className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-amber-900 dark:text-amber-100">
                        Este proveedor no existe en tu lista
                      </p>
                      <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                        <strong>{ocrSupplierName}</strong>
                        {ocrResult?.emitterCIF ? ` · CIF ${ocrResult.emitterCIF}` : ''}
                      </p>
                      <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1">
                        ¿Quieres crearlo automáticamente y vincularlo a esta factura?
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCreateSupplier()}
                      disabled={creatingSupplier || !userId}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                    >
                      {creatingSupplier ? <Loader2 className="w-4 h-4 animate-spin" /> : <Factory className="w-4 h-4" />}
                      Sí, crear proveedor
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSupplierDecision('skipped');
                        toast.message('Continuarás sin proveedor vinculado');
                      }}
                      disabled={creatingSupplier}
                      className="px-4 py-2 rounded-xl border border-amber-300 dark:border-amber-600 text-amber-800 dark:text-amber-200 text-sm font-semibold hover:bg-amber-100/60 dark:hover:bg-amber-900/20 transition-colors"
                    >
                      No, continuar sin proveedor
                    </button>
                  </div>
                </div>
              )}

              {unmatchedStockLineCount > 0 && isComprasDoc && (
                <div className="p-4 rounded-xl border-2 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-orange-900 dark:text-orange-100">
                        {unmatchedStockLineCount} línea{unmatchedStockLineCount === 1 ? '' : 's'} sin vínculo al inventario
                      </p>
                      <p className="text-xs text-orange-800 dark:text-orange-200 mt-1">
                        Vincula cada línea al artículo de inventario (se recordará para este proveedor).
                        Sin vínculo, esas líneas <strong>no subirán stock</strong>.
                      </p>
                    </div>
                  </div>
                  {needsStockMatchConfirm ? (
                    <button
                      type="button"
                      onClick={() => {
                        setStockMatchDecision('confirmed');
                        toast.message('Continuarás sin subir stock en las líneas sin vínculo');
                      }}
                      className="px-4 py-2 rounded-xl border border-orange-300 dark:border-orange-600 text-orange-800 dark:text-orange-200 text-sm font-semibold hover:bg-orange-100/60 dark:hover:bg-orange-900/20 transition-colors"
                    >
                      Entiendo, continuar sin subir esas líneas
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      Confirmado: solo subirán stock las líneas vinculadas
                    </div>
                  )}
                </div>
              )}

              {supplierDecision === 'created' && linkedSupplier && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-sm text-emerald-800 dark:text-emerald-200">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  Proveedor vinculado: <strong>{linkedSupplier.name}</strong>
                </div>
              )}

              {isComprasDoc && (
                <div className="space-y-2">
                  <label className="flex items-start gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 rounded border-emerald-400"
                      checked={loadToWarehouse}
                      onChange={(e) => setLoadToWarehouse(e.target.checked)}
                    />
                    <span className="text-sm text-emerald-900 dark:text-emerald-100">
                      <span className="font-semibold flex items-center gap-1.5">
                        <PackagePlus className="w-4 h-4" />
                        Cargar al almacén
                      </span>
                      <span className="block text-xs text-emerald-800/80 dark:text-emerald-200/80 mt-0.5">
                        Suma las líneas vinculadas al inventario. Si lo dejas apagado, la factura/albarán se guarda y podrás cargar el stock después.
                        {catalogMatchSummary ? ` ${catalogMatchSummary.matchedLines}/${catalogMatchSummary.totalLines} líneas emparejadas.` : ''}
                      </span>
                    </span>
                  </label>
                  <div className="flex items-start gap-2 px-3 text-xs text-gray-600 dark:text-gray-400">
                    <Send className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Al aprobar también se registra en Compras y el pago en Finanzas.
                  </div>
                </div>
              )}

              {moduleLabel && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-sm">
                  <Send className="w-4 h-4 text-blue-500" />
                  <span className="text-blue-700 dark:text-blue-400">Destino: <strong>{moduleLabel}</strong></span>
                  {pipelineStatus === 'auto_approved' && (
                    <span className="ml-auto flex items-center gap-1 text-emerald-600"><Zap className="w-3.5 h-3.5" /> Auto-aprobado</span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <div className="text-xs text-gray-500 mb-1">Emisor</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{ocrResult.emitter || '\u2014'}</div>
                  {ocrResult.emitterCIF && <div className="text-xs text-gray-400 mt-0.5">{ocrResult.emitterCIF}</div>}
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <div className="text-xs text-gray-500 mb-1">Receptor</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{ocrResult.receiver || '\u2014'}</div>
                  {ocrResult.receiverCIF && <div className="text-xs text-gray-400 mt-0.5">{ocrResult.receiverCIF}</div>}
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                  <div className="text-xs text-gray-500 mb-1">Fecha</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{ocrResult.date || '\u2014'}</div>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-3">
                  <div className="text-xs text-emerald-600 mb-1">Total</div>
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(ocrResult.total, ocrResult.currency)}</div>
                </div>
              </div>

              {ocrResult.workerName && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3">
                    <div className="text-xs text-purple-500 mb-1">Trabajador</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{ocrResult.workerName}</div>
                    {ocrResult.workerDNI && <div className="text-xs text-gray-400 mt-0.5">{ocrResult.workerDNI}</div>}
                  </div>
                  {(ocrResult.periodStart || ocrResult.periodEnd) && (
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3">
                      <div className="text-xs text-purple-500 mb-1">Periodo</div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {ocrResult.periodStart}{ocrResult.periodEnd ? ` \u2192 ${ocrResult.periodEnd}` : ''}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(ocrMode === 'vehicle' || vehicles.length > 0) && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/30">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                      Expediente del vehículo
                    </span>
                    {(ocrResult.registrationPlate || ocrResult.vin) && (
                      <span className="text-[11px] font-mono text-gray-500">
                        {[ocrResult.registrationPlate, ocrResult.vin].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                  {contextVehicleId ? (
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {(() => {
                        const v = vehicles.find((x) => x.id === contextVehicleId);
                        return v
                          ? `${v.brand || ''} ${v.model || ''}`.trim() + (v.registrationPlate ? ` · ${v.registrationPlate}` : '')
                          : 'Vehículo del expediente actual';
                      })()}
                    </p>
                  ) : (
                    <select
                      value={selectedVehicleId}
                      onChange={(e) => setSelectedVehicleId(e.target.value)}
                      className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm dark:border-violet-800 dark:bg-gray-900"
                    >
                      <option value="">Seleccionar vehículo…</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {[v.brand, v.model, v.registrationPlate].filter(Boolean).join(' · ')}
                        </option>
                      ))}
                    </select>
                  )}
                  {!selectedVehicleId && !contextVehicleId && (
                    <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                      Si no eliges coche, se intentará vincular por matrícula/VIN al guardar.
                    </p>
                  )}
                </div>
              )}

              {entityMatches.length > 0 && (
                <div className="space-y-2">
                  {entityMatches.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-xl text-sm">
                      <span className="text-lg">{m.matchType === 'supplier' ? '🏭' : m.matchType === 'client' ? '👤' : '👷'}</span>
                      <div className="flex-1">
                        <span className="text-xs text-gray-500">{m.matchType === 'supplier' ? 'Proveedor' : m.matchType === 'client' ? 'Cliente' : 'Trabajador'}</span>
                        <div className="font-semibold text-gray-900 dark:text-gray-100">
                          {m.matchedEntity?.name || 'No identificado'}
                        </div>
                      </div>
                      <ConfidenceBadge score={m.confidence} />
                    </div>
                  ))}
                </div>
              )}

              {displayLines.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Lineas ({displayLines.length})</span>
                    {catalogMatchSummary ? (
                      <span className="ml-auto text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        {catalogMatchSummary.matchedLines}/{catalogMatchSummary.totalLines} en inventario
                      </span>
                    ) : null}
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-700/50 max-h-48 overflow-y-auto">
                    {displayLines.map((line, i) => {
                      const pl = line as ProposalLine;
                      const label = pl.description || pl.itemName || '';
                      return (
                        <div key={i} className="px-4 py-2.5 flex flex-col gap-1.5 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <span className="text-gray-900 dark:text-gray-100">{label}</span>
                              {pl.catalogItemName ? (
                                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
                                  → {pl.catalogItemName}
                                  {pl.matchMethod === 'manual'
                                    ? ' (manual)'
                                    : pl.matchMethod?.startsWith('supplier_alias')
                                      ? ' (recordado)'
                                      : pl.matchConfidence
                                        ? ` (${Math.round(pl.matchConfidence * 100)}%)`
                                        : ''}
                                </div>
                              ) : (
                                <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">Sin vínculo inventario</div>
                              )}
                              {line.quantity != null && <span className="text-gray-400 ml-2">&times;{line.quantity}</span>}
                            </div>
                            <span className="font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">{formatCurrency(line.total, ocrResult?.currency)}</span>
                          </div>
                          {isComprasDoc && stockItems.length > 0 ? (
                            <select
                              className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100"
                              value={String(pl.catalogItemId || '')}
                              onChange={(e) => linkLineToStock(i, e.target.value)}
                            >
                              <option value="">Vincular a inventario…</option>
                              {stockItems.map((item) => (
                                <option key={item._id} value={item._id}>
                                  {item.name}{item.sku ? ` (${item.sku})` : ''}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  {(ocrResult.subtotal != null || ocrResult.taxAmount != null) && (
                    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 space-y-1 bg-gray-50 dark:bg-gray-700/30">
                      {ocrResult.subtotal != null && (
                        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400"><span>Subtotal</span><span>{formatCurrency(ocrResult.subtotal, ocrResult.currency)}</span></div>
                      )}
                      {ocrResult.taxAmount != null && (
                        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400"><span>IVA ({ocrResult.taxRate ?? '\u2014'}%)</span><span>{formatCurrency(ocrResult.taxAmount, ocrResult.currency)}</span></div>
                      )}
                      <div className="flex justify-between text-sm font-bold text-gray-900 dark:text-gray-100 pt-1 border-t border-gray-200 dark:border-gray-600"><span>Total</span><span>{formatCurrency(ocrResult.total, ocrResult.currency)}</span></div>
                    </div>
                  )}
                </div>
              )}

              {validation && <WarningsList warnings={validation.warnings as Array<{ code: string; field: string; message: string; severity: string }>} />}

              {ocrResult.notes && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-sm text-amber-800 dark:text-amber-300">
                  <strong>Notas:</strong> {ocrResult.notes}
                </div>
              )}

              {previewUrl && file?.type.startsWith('image/') && (
                <button onClick={() => setShowPreview(!showPreview)} className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-700 font-medium">
                  <Eye className="w-4 h-4" /> {showPreview ? 'Ocultar imagen original' : 'Ver imagen original'}
                </button>
              )}
              {showPreview && previewUrl && <img src={previewUrl} alt="Original" className="max-h-64 rounded-xl shadow-md mx-auto" />}

              <div className="flex gap-3 pt-2">
                <button onClick={reset} className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors">Escanear otro</button>
                <button
                  onClick={handleApprove}
                  disabled={!canApprove}
                  className="flex-1 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" /> Aprobar y guardar
                </button>
              </div>
            </div>
          )}

          {step === 'duplicate' && (
            <div className="py-10 text-center space-y-5">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto">
                <Copy className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {(duplicateInfo as { duplicateType?: string } | null)?.duplicateType === 'invoice_number'
                  ? 'Código de factura ya registrado'
                  : 'Documento duplicado'}
              </h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                {(duplicateInfo as { duplicateType?: string; original?: { invoiceNumber?: string } } | null)?.duplicateType === 'invoice_number'
                  ? `Ya existe una factura/albarán con el código ${(duplicateInfo as { original?: { invoiceNumber?: string } })?.original?.invoiceNumber || 'indicado'}. No se mete otra igual.`
                  : 'Este documento ya fue procesado anteriormente. Puedes cancelar o forzar un nuevo registro.'}
              </p>
              <div className="flex gap-3 justify-center pt-2">
                <button onClick={reset} className="px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors">Cancelar</button>
                {(duplicateInfo as { duplicateType?: string } | null)?.duplicateType !== 'invoice_number' && (
                  <button onClick={handleForceDuplicate} className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" /> Procesar igualmente
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 'saving' && (
            <div className="py-12 text-center space-y-4">
              <Loader2 className="w-12 h-12 text-emerald-600 mx-auto animate-spin" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Guardando documento...</h3>
              <p className="text-sm text-gray-500">Creando registro en el modulo destino</p>
            </div>
          )}

          {step === 'done' && (
            <div className="py-10 text-center space-y-5">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Documento procesado</h3>
              <p className="text-sm text-gray-500">
                {pipelineStatus === 'auto_approved' ? 'Auto-aprobado y guardado automaticamente' : 'El documento ha sido registrado correctamente'}
                {moduleLabel && <><br />Destino: <strong>{moduleLabel}</strong></>}
              </p>
              {routeResult?.sideEffects && isComprasDoc && (
                <div className="text-sm max-w-md mx-auto space-y-1">
                  {routeResult.sideEffects.stockUpdated && routeResult.sideEffects.stockUpdated > 0 ? (
                    <p className="text-emerald-700 dark:text-emerald-400">
                      Stock actualizado en {routeResult.sideEffects.stockUpdated} artículo(s).
                    </p>
                  ) : (
                    <p className="text-orange-700 dark:text-orange-400">
                      Ninguna línea subió stock. Revisa el inventario y vincula los artículos.
                    </p>
                  )}
                  {routeResult.sideEffects.matchedLines != null &&
                    routeResult.sideEffects.totalLines != null &&
                    routeResult.sideEffects.matchedLines < routeResult.sideEffects.totalLines && (
                      <p className="text-orange-600 dark:text-orange-400 text-xs">
                        {routeResult.sideEffects.totalLines - routeResult.sideEffects.matchedLines} línea(s) sin vínculo al inventario.
                      </p>
                    )}
                </div>
              )}
              {routeResult && (
                <div className="text-xs text-gray-500 space-y-1">
                  <div className="font-mono">ID: {routeResult.documentId}</div>
                  {sideEffectsSummary(routeResult.sideEffects) ? (
                    <div className="text-emerald-700 dark:text-emerald-400 font-medium">{sideEffectsSummary(routeResult.sideEffects)}</div>
                  ) : null}
                </div>
              )}
              <div className="flex gap-3 justify-center pt-2">
                <button onClick={reset} className="px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors">Escanear otro</button>
                <button onClick={handleClose} className="px-6 py-3 bg-gray-900 hover:bg-black text-white font-semibold rounded-xl transition-colors">Cerrar</button>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="py-12 text-center space-y-4">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Error</h3>
              <p className="text-sm text-red-600 dark:text-red-400 max-w-md mx-auto">{error}</p>
              <div className="flex gap-3 justify-center pt-2">
                <button onClick={reset} className="px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors">Intentar de nuevo</button>
                <button onClick={handleClose} className="px-6 py-3 bg-gray-900 hover:bg-black text-white font-semibold rounded-xl transition-colors">Cerrar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
