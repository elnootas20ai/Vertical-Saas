import { useState, useRef, useCallback, useEffect } from 'react';
import { X, ScanLine, Upload, FileText, CheckCircle, Loader2, AlertCircle, Eye, Receipt, ArrowRight, AlertTriangle, Copy, RotateCcw, Send, Shield, Zap, Target } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';
import {
  scanDocument, processOcr, approveProposal,
  DOC_TYPE_LABELS, DOC_TYPE_ICONS, DOC_TYPE_COLORS, MODULE_LABELS,
  type OcrResult, type OcrProposal, type OcrEntityMatch, type OcrScanMeta,
} from '../../lib/ocrApi';

type Step = 'upload' | 'scanning' | 'processing' | 'result' | 'saving' | 'done' | 'duplicate' | 'error';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onDocumentCreated?: (payload: Record<string, unknown>) => Promise<void>;
  targetModule?: string;
  context?: Record<string, unknown>;
  vehicles?: Array<{ id: string; brand?: string; model?: string; registrationPlate?: string }>;
  clients?: Array<{ id: string; name?: string; nif?: string }>;
  defaultOcrMode?: 'financial' | 'vehicle';
  /** Si true, al abrir intenta lanzar cámara (mobile capture). */
  autoOpenCamera?: boolean;
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

export function SAAS__OcrScanModal({ isOpen, onClose, onDocumentCreated, targetModule, context, vehicles, clients, defaultOcrMode, autoOpenCamera }: Props) {
  const [ocrMode, setOcrMode] = useState<'financial' | 'vehicle'>(defaultOcrMode || 'financial');
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [scanMeta, setScanMeta] = useState<OcrScanMeta | null>(null);
  const [proposal, setProposal] = useState<OcrProposal | null>(null);
  const [entityMatches, setEntityMatches] = useState<OcrEntityMatch[]>([]);
  const [validation, setValidation] = useState<{ warnings: Array<{ code: string; field: string; message: string; severity: string }>; errors: unknown[]; isValid: boolean } | null>(null);
  const [destinationInfo, setDestinationInfo] = useState<Record<string, unknown> | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<string>('');
  const [duplicateInfo, setDuplicateInfo] = useState<Record<string, unknown> | null>(null);
  const [routeResult, setRouteResult] = useState<{ documentId: string; database: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const base64Ref = useRef<string>('');
  const mimeRef = useRef<string>('');

  const reset = useCallback(() => {
    setStep('upload'); setFile(null); setPreviewUrl(null);
    setOcrResult(null); setScanMeta(null); setProposal(null);
    setEntityMatches([]); setValidation(null); setDestinationInfo(null);
    setPipelineStatus(''); setDuplicateInfo(null); setRouteResult(null);
    setError(null); setShowPreview(false);
    setOcrMode(defaultOcrMode || 'financial');
    base64Ref.current = ''; mimeRef.current = '';
  }, [defaultOcrMode]);

  const handleClose = () => { reset(); onClose(); };

  // Auto-open camera input on open when requested.
  // (Only when no file selected yet.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isOpen) return;
    if (!autoOpenCamera) return;
    if (step !== 'upload') return;
    if (file) return;
    const t = setTimeout(() => cameraInputRef.current?.click(), 50);
    return () => clearTimeout(t);
  }, [isOpen, autoOpenCamera, step, file]);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    const name = (selectedFile.name || '').toLowerCase();
    // Algunos navegadores/devices suben PDFs/fotos sin type. Inferimos por extensión.
    const inferred =
      name.endsWith('.pdf') ? 'application/pdf'
      : name.endsWith('.jpg') || name.endsWith('.jpeg') ? 'image/jpeg'
      : name.endsWith('.png') ? 'image/png'
      : name.endsWith('.webp') ? 'image/webp'
      : name.endsWith('.gif') ? 'image/gif'
      : '';
    mimeRef.current = (selectedFile.type || inferred || 'application/octet-stream');
    if (selectedFile.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(selectedFile));
    } else {
      setPreviewUrl(null);
    }
    const reader = new FileReader();
    reader.onload = () => { base64Ref.current = (reader.result as string).split(',')[1] || ''; };
    reader.readAsDataURL(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  };

  const startScan = async () => {
    if (!file || !base64Ref.current) return;
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
      if (looksLikePdf) {
        base64Ref.current = await pdfFileToPngBase64(file);
        mimeRef.current = 'image/png';
      }

      const scanRes = await scanDocument(base64Ref.current, mimeRef.current, { targetModule, ...(context || {}) }, ocrMode);

      if (scanRes.data?.parseError) throw new Error('No se pudo interpretar el documento. Intenta con una imagen mas clara.');

      setOcrResult(scanRes.data);
      setScanMeta(scanRes.meta);
      setStep('processing');

      const processRes = await processOcr({
        ocrData: scanRes.data,
        sourceFileName: file.name,
        sourceMimeType: mimeRef.current,
        sourceSize: file.size,
        sourceHash: scanRes.meta.sourceHash,
        sourceImageBase64: base64Ref.current.substring(0, 500),
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
      if (processRes.entityMatches) setEntityMatches(processRes.entityMatches);
      if (processRes.validation) setValidation(processRes.validation as typeof validation);
      if (processRes.destination) setDestinationInfo(processRes.destination as Record<string, unknown>);
      if (processRes.routeResult) setRouteResult(processRes.routeResult);

      if (processRes.status === 'auto_approved' && processRes.routeResult) {
        setStep('done');
      } else {
        setStep('result');
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Error inesperado');
      setStep('error');
    }
  };

  const handleApprove = async () => {
    if (!proposal) return;
    setStep('saving');
    try {
      const res = await approveProposal(proposal._id);
      setRouteResult(res.routeResult);
      setProposal(res.proposal);
      setStep('done');

      if (onDocumentCreated && ocrResult && file) {
        await onDocumentCreated({
          name: ocrResult.documentTypeLabel || file.name,
          ocrData: ocrResult,
          file, fileBase64: base64Ref.current, fileMimeType: mimeRef.current,
          proposalId: proposal._id, documentId: res.routeResult.documentId,
          database: res.routeResult.database,
        }).catch(() => {});
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
      if (processRes.entityMatches) setEntityMatches(processRes.entityMatches);
      if (processRes.validation) setValidation(processRes.validation as typeof validation);
      if (processRes.destination) setDestinationInfo(processRes.destination as Record<string, unknown>);
      setStep('result');
    } catch (err: unknown) {
      setError((err as Error).message || 'Error procesando');
      setStep('error');
    }
  };

  useModalClose(isOpen, handleClose);
  if (!isOpen) return null;

  const docType = ocrResult?.documentType || 'otro';
  const moduleLabel = destinationInfo ? MODULE_LABELS[(destinationInfo as Record<string, string>).module] || (destinationInfo as Record<string, string>).module : '';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

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
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                  className="hidden"
                />
                <input
                  ref={cameraInputRef} type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
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
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors"
                    >
                      <ScanLine className="w-4 h-4" /> Usar cámara
                    </button>
                  </div>
                )}
              </div>
              {file && (
                <div className="space-y-3">
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
                  <button onClick={startScan} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition-colors">
                    <ScanLine className="w-5 h-5" /> Escanear con IA <ArrowRight className="w-4 h-4" />
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

              {ocrResult.lines && ocrResult.lines.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Lineas ({ocrResult.lines.length})</span>
                  </div>
                  <div className="divide-y divide-gray-50 dark:divide-gray-700/50 max-h-48 overflow-y-auto">
                    {ocrResult.lines.map((line, i) => (
                      <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-900 dark:text-gray-100">{line.description}</span>
                          {line.quantity != null && <span className="text-gray-400 ml-2">&times;{line.quantity}</span>}
                        </div>
                        <span className="font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">{formatCurrency(line.total, ocrResult.currency)}</span>
                      </div>
                    ))}
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
                <button onClick={handleApprove} className="flex-1 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
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
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Documento duplicado</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">Este documento ya fue procesado anteriormente. Puedes ignorar el duplicado o forzar un nuevo procesamiento.</p>
              <div className="flex gap-3 justify-center pt-2">
                <button onClick={reset} className="px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors">Cancelar</button>
                <button onClick={handleForceDuplicate} className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl transition-colors flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" /> Procesar igualmente
                </button>
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
              {routeResult && (
                <div className="text-xs text-gray-400 font-mono">ID: {routeResult.documentId}</div>
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
