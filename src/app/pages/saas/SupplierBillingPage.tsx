import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationOpen } from '../../hooks/useNotificationOpen';
import { toast } from 'sonner';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import { Tabs } from '../../components/saas/Tabs';
import { useAuth } from '../../context/AuthContext';
import {
  listPurchaseInvoicesRequest,
  createPurchaseInvoiceRequest,
  updatePurchaseInvoiceRequest,
  deletePurchaseInvoiceRequest,
  validateInvoiceRequest,
  rejectInvoiceRequest,
  uploadInvoicePdfRequest,
  getInvoicePdfUrl,
  listSuppliersRequest,
  listCatalogItemsRequest,
  type PurchaseInvoice,
  type PurchaseInvoiceLine,
  type InvoiceValidationStatus,
  type OcrData,
  type Supplier,
  type CatalogItem,
} from '../../lib/deliveryApi';
import {
  listPurchaseOrdersRequest,
  type PurchaseOrder,
  type PurchaseOrderItem,
} from '../../lib/purchaseOrderApi';
import {
  listWorkCenters,
  createWorkCenter,
  type WorkCenter,
  type WorkCenterType,
  WORK_CENTER_TYPE_SHORT,
} from '../../lib/workCentersApi';
import { authFetch, getAuthHeaders } from '../../lib/authApi';
import {
  Plus, Search, X, Trash2, Edit3, Receipt, CheckCircle2, Clock, DollarSign,
  BarChart3, AlertTriangle, Minus, Download, Filter, TrendingUp, Calendar,
  FileText, ScanLine, Upload, Eye, EyeOff, Link2, Unlink, Building2, PlusCircle,
  ArrowRight, ArrowLeft, Loader2, AlertCircle, PackageCheck, ChevronDown,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env || {};

function getApiBase() {
  if (env.VITE_API_URL) return env.VITE_API_URL;
  const browserHost = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
  const protocol = env.VITE_API_PROTOCOL || (typeof window !== 'undefined' && window.location.protocol ? window.location.protocol.replace(':', '') : 'http');
  const host = env.VITE_API_HOST || browserHost;
  const port = env.VITE_API_PORT || '3001';
  return `${protocol}://${host}:${port}`;
}

function getCouchHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.VITE_COUCHDB_URL) headers['x-couch-url'] = env.VITE_COUCHDB_URL;
  if (env.VITE_COUCHDB_USER) headers['x-couch-user'] = env.VITE_COUCHDB_USER;
  if (env.VITE_COUCHDB_PASSWORD) headers['x-couch-password'] = env.VITE_COUCHDB_PASSWORD;
  return headers;
}

const API = getApiBase();

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  pending_validation: { label: 'Pte. validar', badgeClass: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' },
  pending: { label: 'Pte. validar', badgeClass: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800' },
  validated: { label: 'Validada', badgeClass: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800' },
  pending_payment: { label: 'Pte. pago', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' },
  paid: { label: 'Pagada', badgeClass: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' },
  overdue: { label: 'Vencida', badgeClass: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' },
};

// ─── Method Selection Step ───────────────────────────────────────────────────

type EntryMethod = 'ocr' | 'manual';
type ModalStep = 'method' | 'ocr-upload' | 'ocr-scanning' | 'form';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<PurchaseInvoice>) => void;
  suppliers: Supplier[];
  catalogItems: CatalogItem[];
  purchaseOrders: PurchaseOrder[];
  workCenters: WorkCenter[];
  userId: string;
  onWorkCenterCreated: (wc: WorkCenter) => void;
  editItem?: PurchaseInvoice | null;
}

function InvoiceModal({
  isOpen, onClose, onSave, suppliers, catalogItems,
  purchaseOrders, workCenters, userId, onWorkCenterCreated, editItem,
}: InvoiceModalProps) {
  const [step, setStep] = useState<ModalStep>('method');
  const [entryMethod, setEntryMethod] = useState<EntryMethod | null>(null);

  // OCR state
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrData | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [showOcrPreview, setShowOcrPreview] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const base64Ref = useRef<string>('');
  const mimeRef = useRef<string>('');

  // Form state
  const [form, setForm] = useState({
    invoiceNumber: '', supplierName: '', supplierId: '',
    date: '', dueDate: '', taxRate: '21', notes: '',
  });
  const [lines, setLines] = useState<{ itemName: string; quantity: string; unitPrice: string }[]>([
    { itemName: '', quantity: '', unitPrice: '' },
  ]);

  // Purchase order matching
  const [linkedOrderId, setLinkedOrderId] = useState<string>('');
  const [showOrderMatcher, setShowOrderMatcher] = useState(false);

  // Cost center
  const [costCenterId, setCostCenterId] = useState<string>('');
  const [showNewCostCenter, setShowNewCostCenter] = useState(false);
  const [newCcName, setNewCcName] = useState('');
  const [newCcType, setNewCcType] = useState<WorkCenterType>('punto_de_venta');
  const [creatingCc, setCreatingCc] = useState(false);

  useEffect(() => {
    if (editItem) {
      setStep('form');
      setEntryMethod(editItem.entryMethod || 'manual');
      setForm({
        invoiceNumber: editItem.invoiceNumber || '',
        supplierName: editItem.supplierName || '',
        supplierId: editItem.supplierId || '',
        date: editItem.date ? editItem.date.slice(0, 10) : '',
        dueDate: editItem.dueDate ? editItem.dueDate.slice(0, 10) : '',
        taxRate: String(editItem.taxRate ?? 21),
        notes: editItem.notes || '',
      });
      setLines(
        editItem.lines.length > 0
          ? editItem.lines.map(l => ({ itemName: l.itemName, quantity: String(l.quantity), unitPrice: String(l.unitPrice) }))
          : [{ itemName: '', quantity: '', unitPrice: '' }],
      );
      setLinkedOrderId(editItem.linkedPurchaseOrderId || '');
      setCostCenterId(editItem.costCenterId || '');
      if (editItem.ocrData) setOcrResult(editItem.ocrData);
    } else {
      setStep('method');
      setEntryMethod(null);
      setForm({ invoiceNumber: '', supplierName: '', supplierId: '', date: '', dueDate: '', taxRate: '21', notes: '' });
      setLines([{ itemName: '', quantity: '', unitPrice: '' }]);
      setLinkedOrderId('');
      setCostCenterId('');
      setOcrFile(null);
      setOcrPreviewUrl(null);
      setOcrResult(null);
      setOcrError(null);
      setShowOcrPreview(true);
      setShowOrderMatcher(false);
      setShowNewCostCenter(false);
      base64Ref.current = '';
      mimeRef.current = '';
    }
  }, [editItem, isOpen]);

  const supplierOrders = useMemo(() => {
    if (!form.supplierId) return purchaseOrders;
    return purchaseOrders.filter(o => o.supplierId === form.supplierId);
  }, [purchaseOrders, form.supplierId]);

  if (!isOpen) return null;

  // ── OCR handlers ──────────────────────────────────────────────────────────

  const handleFileSelect = (selectedFile: File) => {
    setOcrFile(selectedFile);
    mimeRef.current = selectedFile.type || 'image/jpeg';
    if (selectedFile.type.startsWith('image/')) {
      setOcrPreviewUrl(URL.createObjectURL(selectedFile));
    } else {
      setOcrPreviewUrl(null);
    }
    const reader = new FileReader();
    reader.onload = () => { base64Ref.current = (reader.result as string).split(',')[1] || ''; };
    reader.readAsDataURL(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped && /^(image\/(jpeg|jpg|png|webp|gif)|application\/pdf)$/.test(dropped.type)) {
      handleFileSelect(dropped);
    }
  };

  const startOcrScan = async () => {
    if (!ocrFile || !base64Ref.current) return;
    setStep('ocr-scanning');
    setOcrError(null);
    try {
      const res = await authFetch(`${API}/api/ocr/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...getCouchHeaders() },
        body: JSON.stringify({ imageBase64: base64Ref.current, mimeType: mimeRef.current }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Error en el escaneo OCR');
      if (payload.data?.parseError) throw new Error('No se pudo interpretar el documento. Intenta con una imagen más clara.');

      const data = payload.data as OcrData;
      setOcrResult(data);

      const normName = (s: string) => s.toLowerCase().replace(/\b(s\.?l\.?u?\.?|s\.?a\.?|s\.?c\.?|sociedad|limitada|anonima|anónima)\b/gi, '').replace(/[.,\-_]/g, ' ').replace(/\s+/g, ' ').trim();
      const emitterCif = data.emitterCIF?.toUpperCase().trim();
      const matchByCif = emitterCif ? suppliers.find(s => s.cif && s.cif.toUpperCase().trim() === emitterCif) : null;
      const matchByName = !matchByCif && data.emitter
        ? suppliers.find(s => {
            const a = normName(s.name);
            const b = normName(data.emitter!);
            return a === b || a.includes(b) || b.includes(a);
          })
        : null;
      const matchedSupplier = matchByCif || matchByName;

      const parsedDate = data.date ? parseOcrDate(data.date) : '';

      setForm(f => ({
        ...f,
        invoiceNumber: data.documentNumber || f.invoiceNumber,
        supplierName: matchedSupplier?.name || data.emitter || f.supplierName,
        supplierId: matchedSupplier?._id || f.supplierId,
        date: parsedDate || f.date,
        taxRate: data.taxRate != null ? String(data.taxRate) : f.taxRate,
        notes: data.notes || f.notes,
      }));

      if (data.lines && data.lines.length > 0) {
        setLines(data.lines.map(l => ({
          itemName: l.description || '',
          quantity: l.quantity != null ? String(l.quantity) : '1',
          unitPrice: l.unitPrice != null ? String(l.unitPrice) : (l.total != null ? String(l.total) : ''),
        })));
      }

      if (matchedSupplier) {
        const openOrders = purchaseOrders.filter(o => o.supplierId === matchedSupplier._id && (o.status === 'sent' || o.status === 'partial'));
        if (openOrders.length > 0) {
          const invoiceTotal = Number(data.total) || 0;
          const bestMatch = openOrders.find(o => invoiceTotal > 0 && Math.abs(o.total - invoiceTotal) / Math.max(o.total, 1) < 0.05);
          if (bestMatch) {
            setLinkedOrderId(bestMatch._id);
            setShowOrderMatcher(true);
          }
        }
      }

      setStep('form');
    } catch (err: any) {
      setOcrError(err.message || 'Error inesperado');
      setStep('ocr-upload');
    }
  };

  function parseOcrDate(dateStr: string): string {
    const parts = dateStr.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
    if (!parts) return '';
    const day = parts[1].padStart(2, '0');
    const month = parts[2].padStart(2, '0');
    const year = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
    return `${year}-${month}-${day}`;
  }

  // ── Form handlers ─────────────────────────────────────────────────────────

  const addLine = () => setLines(prev => [...prev, { itemName: '', quantity: '', unitPrice: '' }]);
  const removeLine = (idx: number) => { if (lines.length <= 1) return; setLines(prev => prev.filter((_, i) => i !== idx)); };
  const updateLine = (idx: number, field: string, value: string) =>
    setLines(prev => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));

  const handleSelectCatalogItem = (idx: number, itemId: string) => {
    const item = catalogItems.find(i => i._id === itemId);
    if (item) {
      updateLine(idx, 'itemName', item.name);
      updateLine(idx, 'unitPrice', String(item.costPrice || ''));
    }
  };

  const handleSelectSupplier = (supplierId: string) => {
    const supplier = suppliers.find(s => s._id === supplierId);
    setForm(f => ({ ...f, supplierId, supplierName: supplier?.name || '' }));
  };

  const computedLines: PurchaseInvoiceLine[] = lines
    .filter(l => l.itemName.trim())
    .map((l, i) => ({
      id: editItem?.lines[i]?.id || `line-${Date.now()}-${i}`,
      itemName: l.itemName,
      quantity: Number(l.quantity) || 0,
      unitPrice: Number(l.unitPrice) || 0,
      total: (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
    }));

  const subtotal = computedLines.reduce((s, l) => s + l.total, 0);
  const taxRate = Number(form.taxRate) || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const linkedOrder = purchaseOrders.find(o => o._id === linkedOrderId);
  const selectedCostCenter = workCenters.find(wc => wc._id === costCenterId);

  const handleCreateCostCenter = async () => {
    if (!newCcName.trim()) return;
    setCreatingCc(true);
    try {
      const wc = await createWorkCenter(userId, {
        name: newCcName.trim(),
        centerType: newCcType,
        ownership: 'propiedad',
        active: true,
      });
      onWorkCenterCreated(wc);
      setCostCenterId(wc._id);
      setShowNewCostCenter(false);
      setNewCcName('');
      toast.success('Centro de coste creado');
    } catch {
      toast.error('Error al crear centro de coste');
    } finally {
      setCreatingCc(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierName.trim()) { toast.error('Selecciona un proveedor'); return; }
    if (computedLines.length === 0) { toast.error('Añade al menos una línea'); return; }

    onSave({
      ...editItem,
      invoiceNumber: form.invoiceNumber,
      supplierName: form.supplierName,
      supplierId: form.supplierId,
      date: form.date || new Date().toISOString().slice(0, 10),
      dueDate: form.dueDate,
      lines: computedLines,
      subtotal,
      taxRate,
      taxAmount,
      total,
      notes: form.notes,
      status: editItem?.status || 'pending',
      linkedPurchaseOrderId: linkedOrderId || undefined,
      linkedPurchaseOrderNumber: linkedOrder?.orderNumber || undefined,
      costCenterId: costCenterId || undefined,
      costCenterName: selectedCostCenter?.name || undefined,
      ocrData: ocrResult || undefined,
      ocrImageBase64: base64Ref.current || undefined,
      entryMethod: entryMethod || 'manual',
    });
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {editItem ? 'Editar factura' : 'Nueva factura de proveedor'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {step === 'method' && 'Elige cómo registrar la factura'}
              {step === 'ocr-upload' && 'Sube la imagen o PDF de la factura'}
              {step === 'ocr-scanning' && 'Analizando documento...'}
              {step === 'form' && (entryMethod === 'ocr' ? 'Revisa los datos extraídos por OCR' : 'Rellena los datos de la factura')}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* ── STEP: Method Selection ─────────────────────────────────────── */}
        {step === 'method' && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => { setEntryMethod('ocr'); setStep('ocr-upload'); }}
                className="group p-6 border-2 border-gray-200 dark:border-gray-700 rounded-2xl hover:border-violet-400 dark:hover:border-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-all text-left"
              >
                <div className="w-12 h-12 bg-violet-100 dark:bg-violet-900/30 rounded-xl flex items-center justify-center mb-4 group-hover:bg-violet-200 dark:group-hover:bg-violet-900/50 transition-colors">
                  <ScanLine className="w-6 h-6 text-violet-600" />
                </div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-1">Escanear con OCR</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Sube una foto o PDF y la IA extraerá los datos automáticamente para tu revisión
                </p>
              </button>
              <button
                onClick={() => { setEntryMethod('manual'); setStep('form'); }}
                className="group p-6 border-2 border-gray-200 dark:border-gray-700 rounded-2xl hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-all text-left"
              >
                <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center mb-4 group-hover:bg-gray-200 dark:group-hover:bg-gray-600 transition-colors">
                  <Edit3 className="w-6 h-6 text-gray-600 dark:text-gray-300" />
                </div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-1">Entrada manual</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Introduce los datos de la factura manualmente con el formulario
                </p>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: OCR Upload ───────────────────────────────────────────── */}
        {step === 'ocr-upload' && (
          <div className="p-6 space-y-4">
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-violet-500 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,application/pdf"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                className="hidden"
              />
              {ocrFile ? (
                <div>
                  {ocrPreviewUrl && ocrFile.type.startsWith('image/') ? (
                    <img src={ocrPreviewUrl} alt="Preview" className="max-h-48 mx-auto rounded-lg mb-3 shadow-md" />
                  ) : (
                    <FileText className="w-16 h-16 text-violet-600 mx-auto mb-3" />
                  )}
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{ocrFile.name}</div>
                  <div className="text-sm text-gray-500 mt-1">{(ocrFile.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
              ) : (
                <div>
                  <Upload className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    Arrastra la factura aquí
                  </div>
                  <div className="text-sm text-gray-500">JPG, PNG, WebP o PDF</div>
                </div>
              )}
            </div>

            {ocrError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-sm text-red-700 dark:text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {ocrError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setStep('method'); setOcrFile(null); setOcrPreviewUrl(null); setOcrError(null); }}
                className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Atrás
              </button>
              <button
                onClick={startOcrScan}
                disabled={!ocrFile}
                className="flex-1 px-4 py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <ScanLine className="w-5 h-5" /> Escanear con IA <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: OCR Scanning ─────────────────────────────────────────── */}
        {step === 'ocr-scanning' && (
          <div className="p-6 py-16 text-center space-y-6">
            <div className="relative mx-auto w-20 h-20">
              <div className="absolute inset-0 rounded-full border-4 border-violet-200 dark:border-violet-900" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-600 animate-spin" />
              <ScanLine className="absolute inset-0 m-auto w-8 h-8 text-violet-600 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">Analizando factura...</h3>
              <p className="text-sm text-gray-500">La IA está leyendo y extrayendo los datos del documento</p>
            </div>
            <div className="max-w-xs mx-auto space-y-2">
              {['Procesando imagen', 'Detectando proveedor y datos', 'Extrayendo importes y líneas'].map((text, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-500 shrink-0" />
                  {text}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: Invoice Form ─────────────────────────────────────────── */}
        {step === 'form' && (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">

            {/* OCR Preview Panel */}
            {entryMethod === 'ocr' && ocrPreviewUrl && (
              <div className="border-2 border-violet-200 dark:border-violet-800 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowOcrPreview(!showOcrPreview)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-violet-50 dark:bg-violet-900/20 text-sm font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <ScanLine className="w-4 h-4" />
                    Documento escaneado (OCR) — Revisión
                  </span>
                  <span className="flex items-center gap-1">
                    {showOcrPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {showOcrPreview ? 'Ocultar' : 'Mostrar'}
                  </span>
                </button>
                {showOcrPreview && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-900 flex justify-center">
                    <img src={ocrPreviewUrl} alt="Factura escaneada" className="max-h-72 rounded-lg shadow-md" />
                  </div>
                )}
              </div>
            )}

            {entryMethod === 'ocr' && ocrResult && !ocrPreviewUrl && (
              <div className="p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl text-sm text-violet-700 dark:text-violet-300 flex items-center gap-2">
                <ScanLine className="w-4 h-4 shrink-0" />
                Datos extraídos por OCR — Revisa y corrige si es necesario
              </div>
            )}

            {/* Basic invoice fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nº Factura</label>
                <input className={`${inputClass} font-mono`} placeholder="FAC-2025-001" value={form.invoiceNumber} onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className={labelClass}>Proveedor *</label>
                {suppliers.length > 0 ? (
                  <select className={inputClass} value={form.supplierId} onChange={e => handleSelectSupplier(e.target.value)}>
                    <option value="">Seleccionar proveedor</option>
                    {suppliers.filter(s => s.active).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                ) : (
                  <input className={inputClass} placeholder="Nombre del proveedor" value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} />
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div><label className={labelClass}>Fecha factura</label><input type="date" className={inputClass} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div><label className={labelClass}>Fecha vencimiento</label><input type="date" className={inputClass} value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
              <div><label className={labelClass}>% IVA</label><input type="number" className={inputClass} placeholder="21" value={form.taxRate} onChange={e => setForm(f => ({ ...f, taxRate: e.target.value }))} /></div>
            </div>

            {/* Invoice lines */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Líneas de factura</label>
                <AddButtonDropdown
                label="Nueva factura"
                onQuickAdd={addLine}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de factura"
              />
              </div>
              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1 relative">
                      <input className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" placeholder="Concepto / Artículo" value={line.itemName} onChange={e => updateLine(idx, 'itemName', e.target.value)} />
                      {catalogItems.length > 0 && !line.itemName && (
                        <select className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => { if (e.target.value) handleSelectCatalogItem(idx, e.target.value); }}>
                          <option value="">Seleccionar del catálogo...</option>
                          {catalogItems.map(item => <option key={item._id} value={item._id}>{item.name} — {item.costPrice.toFixed(2)}€</option>)}
                        </select>
                      )}
                    </div>
                    <input type="number" className="w-24 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" placeholder="Cant." value={line.quantity} onChange={e => updateLine(idx, 'quantity', e.target.value)} />
                    <input type="number" step="0.01" className="w-28 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" placeholder="€/ud" value={line.unitPrice} onChange={e => updateLine(idx, 'unitPrice', e.target.value)} />
                    <div className="w-24 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 text-right">
                      {((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)).toFixed(2)}€
                    </div>
                    <button type="button" onClick={() => removeLine(idx)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors shrink-0" disabled={lines.length <= 1}>
                      <Minus className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-sm space-y-1">
                <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>Subtotal</span><span>{subtotal.toFixed(2)}€</span></div>
                <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>IVA ({taxRate}%)</span><span>{taxAmount.toFixed(2)}€</span></div>
                <div className="flex justify-between font-bold text-gray-900 dark:text-gray-100 pt-1 border-t border-gray-200 dark:border-gray-700"><span>Total</span><span>{total.toFixed(2)}€</span></div>
              </div>
            </div>

            {/* ── Purchase Order Matching ─────────────────────────────────── */}
            <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowOrderMatcher(!showOrderMatcher)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <PackageCheck className="w-4 h-4" />
                  Casar con pedido de compra
                  {linkedOrder && (
                    <span className="text-xs font-normal text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                      Vinculado: {linkedOrder.orderNumber}
                    </span>
                  )}
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showOrderMatcher ? 'rotate-180' : ''}`} />
              </button>

              {showOrderMatcher && (
                <div className="p-4 space-y-3 border-t border-gray-200 dark:border-gray-700">
                  {supplierOrders.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No hay pedidos de compra{form.supplierId ? ' para este proveedor' : ''}. Crea un pedido primero en la sección de pedidos de compra.
                    </p>
                  ) : (
                    <>
                      <select
                        className={inputClass}
                        value={linkedOrderId}
                        onChange={e => setLinkedOrderId(e.target.value)}
                      >
                        <option value="">Sin vincular a pedido</option>
                        {supplierOrders.map(o => (
                          <option key={o._id} value={o._id}>
                            {o.orderNumber} — {o.supplierName} — {o.total.toFixed(2)}€ ({o.status})
                          </option>
                        ))}
                      </select>

                      {/* Comparison table: ordered vs invoiced */}
                      {linkedOrder && (
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                          <div className="px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 text-sm font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-2">
                            <Link2 className="w-4 h-4" />
                            Comparativa: Pedido vs Factura
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 dark:bg-gray-900 text-xs uppercase text-gray-500 dark:text-gray-400">
                                  <th className="px-3 py-2 text-left">Artículo</th>
                                  <th className="px-3 py-2 text-right">Pedido</th>
                                  <th className="px-3 py-2 text-right">Recibido</th>
                                  <th className="px-3 py-2 text-right">Facturado</th>
                                  <th className="px-3 py-2 text-right">Diferencia</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {linkedOrder.items.map((orderItem: PurchaseOrderItem) => {
                                  const invoicedLine = computedLines.find(l =>
                                    l.itemName.toLowerCase().trim() === orderItem.name.toLowerCase().trim()
                                  );
                                  const invoicedQty = invoicedLine?.quantity ?? 0;
                                  const diff = invoicedQty - orderItem.quantity;
                                  return (
                                    <tr key={orderItem.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">{orderItem.name}</td>
                                      <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{orderItem.quantity}</td>
                                      <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">{orderItem.received ?? '—'}</td>
                                      <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-gray-100">{invoicedQty || '—'}</td>
                                      <td className={`px-3 py-2 text-right font-bold ${diff === 0 ? 'text-green-600' : diff > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                                        {invoicedQty ? (diff > 0 ? `+${diff}` : String(diff)) : '—'}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="bg-gray-50 dark:bg-gray-900 border-t-2 border-gray-200 dark:border-gray-700">
                                  <td className="px-3 py-2 font-bold text-gray-700 dark:text-gray-300">Totales</td>
                                  <td className="px-3 py-2 text-right font-bold text-gray-700 dark:text-gray-300">{linkedOrder.total.toFixed(2)}€</td>
                                  <td className="px-3 py-2 text-right text-gray-500">—</td>
                                  <td className="px-3 py-2 text-right font-bold text-gray-900 dark:text-gray-100">{total.toFixed(2)}€</td>
                                  <td className={`px-3 py-2 text-right font-bold ${Math.abs(total - linkedOrder.total) < 0.01 ? 'text-green-600' : 'text-amber-600'}`}>
                                    {(total - linkedOrder.total) > 0 ? '+' : ''}{(total - linkedOrder.total).toFixed(2)}€
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}

                      {linkedOrderId && (
                        <button
                          type="button"
                          onClick={() => setLinkedOrderId('')}
                          className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1 font-medium"
                        >
                          <Unlink className="w-3.5 h-3.5" /> Desvincular pedido
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Cost Center Selection ───────────────────────────────────── */}
            <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Centro de coste <span className="text-xs font-normal text-gray-400">(opcional)</span>
              </label>

              <div className="flex gap-2">
                <select
                  className={`${inputClass} flex-1`}
                  value={costCenterId}
                  onChange={e => setCostCenterId(e.target.value)}
                >
                  <option value="">Sin centro de coste</option>
                  {workCenters.filter(wc => wc.active).map(wc => (
                    <option key={wc._id} value={wc._id}>
                      {wc.name} ({WORK_CENTER_TYPE_SHORT[wc.centerType] || wc.centerType})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewCostCenter(!showNewCostCenter)}
                  className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-1 text-sm shrink-0"
                  title="Añadir nuevo centro de coste"
                >
                  <PlusCircle className="w-4 h-4" />
                </button>
              </div>

              {showNewCostCenter && (
                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl space-y-3">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nuevo centro de coste</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                      placeholder="Nombre del centro"
                      value={newCcName}
                      onChange={e => setNewCcName(e.target.value)}
                    />
                    <select
                      className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                      value={newCcType}
                      onChange={e => setNewCcType(e.target.value as WorkCenterType)}
                    >
                      <option value="oficina">Centro de trabajo (Oficina)</option>
                      <option value="punto_de_venta">Punto de venta</option>
                      <option value="almacen">Almacén</option>
                      <option value="custom">Otro</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setShowNewCostCenter(false); setNewCcName(''); }}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleCreateCostCenter}
                      disabled={!newCcName.trim() || creatingCc}
                      className="px-3 py-1.5 text-xs font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg disabled:opacity-50 flex items-center gap-1"
                    >
                      {creatingCc ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Crear centro
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div><label className={labelClass}>Notas</label><textarea rows={2} className={`${inputClass} resize-none`} placeholder="Notas adicionales..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>

            {/* Actions */}
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex gap-3 rounded-b-2xl">
              {!editItem && (
                <button
                  type="button"
                  onClick={() => { setStep('method'); setEntryMethod(null); }}
                  className="px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" /> Atrás
                </button>
              )}
              <button type="button" onClick={onClose} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
              <button type="submit" className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl font-semibold transition-colors">
                {editItem ? 'Guardar cambios' : 'Registrar factura'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export function SupplierBillingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [filterWorkCenter, setFilterWorkCenter] = useState<string>('all');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'supplier', label: 'Proveedor' },
    { key: 'amount', label: 'Importe' },
    { key: 'date', label: 'Fecha' },
    { key: 'number', label: 'Nº factura' },
    { key: 'concept', label: 'Concepto' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'supplier', label: 'Proveedor', example: '' },
    { key: 'amount', label: 'Importe', example: '' },
    { key: 'date', label: 'Fecha', example: '' },
    { key: 'number', label: 'Nº factura', required: true, example: '' },
    { key: 'concept', label: 'Concepto', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} factura(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} factura(s) importado(s)`);
  };

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [invs, sups, items, orders, centers] = await Promise.all([
        listPurchaseInvoicesRequest(user.id),
        listSuppliersRequest(user.id),
        listCatalogItemsRequest(user.id),
        listPurchaseOrdersRequest(user.id),
        listWorkCenters(user.id),
      ]);
      setInvoices(invs);
      setSuppliers(sups);
      setCatalogItems(items);
      setPurchaseOrders(orders);
      setWorkCenters(centers);
    } catch {
      toast.error('Error al cargar las facturas');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);
  useModalClose(showModal, () => { setShowModal(false); setEditingInvoice(null); });

  useNotificationOpen(
    useCallback((entityId: string) => {
      const inv = invoices.find((i) => i._id === entityId);
      if (inv) { setEditingInvoice(inv); setShowModal(true); }
    }, [invoices]),
    !loading,
  );

  const handleSaveInvoice = async (data: Partial<PurchaseInvoice>) => {
    if (!user?.id) return;
    try {
      if (editingInvoice) {
        const updated = await updatePurchaseInvoiceRequest(user.id, { ...editingInvoice, ...data } as PurchaseInvoice);
        setInvoices(prev => prev.map(i => (i._id === updated._id ? updated : i)));
        toast.success('Factura actualizada');
      } else {
        try {
          const created = await createPurchaseInvoiceRequest(user.id, data);
          setInvoices(prev => [created, ...prev]);
          toast.success('Factura registrada');
        } catch (err: any) {
          if (err?.message?.includes('409') || err?.status === 409) {
            const doForce = confirm(
              `Ya existe una factura con el mismo n\u00famero y proveedor. \u00bfDeseas crearla igualmente como posible duplicado?`,
            );
            if (doForce) {
              const created = await createPurchaseInvoiceRequest(user.id, { ...data, forceDuplicate: true } as any);
              setInvoices(prev => [created, ...prev]);
              toast.success('Factura registrada (marcada como posible duplicado)');
            } else {
              return;
            }
          } else {
            throw err;
          }
        }
      }
      setShowModal(false);
      setEditingInvoice(null);
    } catch {
      toast.error('Error al guardar la factura');
    }
  };

  const handleDelete = async (invoice: PurchaseInvoice) => {
    if (!user?.id) return;
    if (!confirm(`¿Eliminar factura ${invoice.invoiceNumber || 'sin número'}?`)) return;
    try {
      await deletePurchaseInvoiceRequest(user.id, invoice._id);
      setInvoices(prev => prev.filter(i => i._id !== invoice._id));
      toast.success('Factura eliminada');
    } catch {
      toast.error('Error al eliminar la factura');
    }
  };

  const handleValidate = async (invoice: PurchaseInvoice) => {
    if (!user?.id) return;
    try {
      const updated = await validateInvoiceRequest(user.id, invoice._id);
      setInvoices(prev => prev.map(i => (i._id === updated._id ? updated : i)));
      toast.success('Factura validada. Se ha generado el gasto y el IVA soportado.');
    } catch (err: any) {
      toast.error(err?.message || 'Error al validar la factura');
    }
  };

  const handleReject = async (invoice: PurchaseInvoice) => {
    if (!user?.id) return;
    if (!confirm('Rechazar la factura la devuelve a "Pendiente validar". \u00bfContinuar?')) return;
    try {
      const updated = await rejectInvoiceRequest(user.id, invoice._id);
      setInvoices(prev => prev.map(i => (i._id === updated._id ? updated : i)));
      toast.success('Factura devuelta a pendiente de validar');
    } catch (err: any) {
      toast.error(err?.message || 'Error al rechazar la factura');
    }
  };

  const handleMarkPaid = async (invoice: PurchaseInvoice) => {
    if (!user?.id) return;
    try {
      const updated = await updatePurchaseInvoiceRequest(user.id, {
        ...invoice,
        status: 'paid',
        validationStatus: 'paid' as any,
        paidAt: new Date().toISOString(),
      });
      setInvoices(prev => prev.map(i => (i._id === updated._id ? updated : i)));
      toast.success('Factura marcada como pagada');
    } catch {
      toast.error('Error al actualizar la factura');
    }
  };

  const handleMarkUnpaid = async (invoice: PurchaseInvoice) => {
    if (!user?.id) return;
    try {
      const updated = await updatePurchaseInvoiceRequest(user.id, {
        ...invoice,
        status: 'validated',
        validationStatus: 'validated' as any,
        paidAt: '',
      });
      setInvoices(prev => prev.map(i => (i._id === updated._id ? updated : i)));
      toast.success('Factura marcada como pendiente de pago');
    } catch {
      toast.error('Error al actualizar la factura');
    }
  };

  const handleUploadPdf = async (invoice: PurchaseInvoice, file: File) => {
    if (!user?.id) return;
    try {
      const updated = await uploadInvoicePdfRequest(user.id, invoice._id, file);
      setInvoices(prev => prev.map(i => (i._id === updated._id ? updated : i)));
      toast.success('PDF adjuntado correctamente');
    } catch {
      toast.error('Error al subir el PDF');
    }
  };

  const handleReviewDuplicate = async (invoice: PurchaseInvoice) => {
    if (!user?.id) return;
    try {
      const updated = await updatePurchaseInvoiceRequest(user.id, {
        ...invoice,
        duplicateReviewed: true,
      } as any);
      setInvoices(prev => prev.map(i => (i._id === updated._id ? updated : i)));
      toast.success('Duplicado marcado como revisado');
    } catch {
      toast.error('Error al actualizar');
    }
  };

  const invoicesEnriched = useMemo(() => {
    return invoices.map(inv => {
      const vs = inv.validationStatus || (inv.status === 'paid' ? 'paid' : 'pending_validation');
      if ((vs === 'validated' || vs === 'pending_payment') && inv.dueDate && new Date(inv.dueDate) < new Date()) {
        return { ...inv, displayStatus: 'overdue' as const, normalizedStatus: vs };
      }
      return { ...inv, displayStatus: vs, normalizedStatus: vs };
    });
  }, [invoices]);

  const kpis = useMemo(() => {
    const pendingValidation = invoicesEnriched.filter(i => i.normalizedStatus === 'pending_validation' || i.normalizedStatus === 'pending');
    const validated = invoicesEnriched.filter(i => i.normalizedStatus === 'validated');
    const paid = invoicesEnriched.filter(i => i.normalizedStatus === 'paid');
    const pendingPayment = invoicesEnriched.filter(i => i.normalizedStatus === 'pending_payment');
    const overdue = invoicesEnriched.filter(i => i.displayStatus === 'overdue');
    const duplicates = invoices.filter(i => i.duplicateWarning && !i.duplicateReviewed);
    return {
      total: invoices.length,
      pendingValidationCount: pendingValidation.length,
      validatedCount: validated.length,
      paidCount: paid.length,
      pendingPaymentCount: pendingPayment.length,
      overdueCount: overdue.length,
      duplicateCount: duplicates.length,
      totalAmount: invoices.reduce((s, i) => s + (i.total || 0), 0),
      pendingValidationAmount: pendingValidation.reduce((s, i) => s + (i.total || 0), 0),
      paidAmount: paid.reduce((s, i) => s + (i.total || 0), 0),
      overdueAmount: overdue.reduce((s, i) => s + (i.total || 0), 0),
    };
  }, [invoices, invoicesEnriched]);

  const bySupplier = useMemo(() => {
    const map = new Map<string, { name: string; total: number; pending: number; count: number }>();
    for (const inv of invoices) {
      const key = inv.supplierId || inv.supplierName;
      const existing = map.get(key) || { name: inv.supplierName, total: 0, pending: 0, count: 0 };
      existing.total += inv.total || 0;
      if (inv.status === 'pending') existing.pending += inv.total || 0;
      existing.count += 1;
      map.set(key, existing);
    }
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    let items = invoicesEnriched;
    if (activeTab === 'pending_validation') items = items.filter(i => i.normalizedStatus === 'pending_validation' || i.normalizedStatus === 'pending');
    else if (activeTab === 'validated') items = items.filter(i => i.normalizedStatus === 'validated');
    else if (activeTab === 'paid') items = items.filter(i => i.normalizedStatus === 'paid');
    else if (activeTab === 'pending_payment') items = items.filter(i => i.normalizedStatus === 'pending_payment');
    else if (activeTab === 'overdue') items = items.filter(i => i.displayStatus === 'overdue');
    if (supplierFilter) items = items.filter(i => (i.supplierId || i.supplierName) === supplierFilter);
    if (monthFilter) items = items.filter(i => i.date?.startsWith(monthFilter));
    if (filterWorkCenter !== 'all') items = items.filter(i => (i as any).costCenterId === filterWorkCenter || (i as any).workCenterId === filterWorkCenter);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(i =>
        i.supplierName?.toLowerCase().includes(q) ||
        i.invoiceNumber?.toLowerCase().includes(q) ||
        i.notes?.toLowerCase().includes(q) ||
        i.costCenterName?.toLowerCase().includes(q) ||
        i.linkedPurchaseOrderNumber?.toLowerCase().includes(q),
      );
    }
    return items;
  }, [invoicesEnriched, activeTab, supplierFilter, monthFilter, filterWorkCenter, search]);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const inv of invoices) {
      if (inv.date) set.add(inv.date.slice(0, 7));
    }
    return [...set].sort().reverse();
  }, [invoices]);

  const handleExportCSV = () => {
    const header = 'Nº Factura;Proveedor;Fecha;Vencimiento;Estado;Subtotal;IVA;Total;Pedido vinculado;Centro de coste;Método\n';
    const rows = filteredInvoices.map(i =>
      `${i.invoiceNumber || ''};${i.supplierName};${i.date || ''};${i.dueDate || ''};${STATUS_CONFIG[i.displayStatus]?.label || i.status};${(i.subtotal || 0).toFixed(2)};${(i.taxAmount || 0).toFixed(2)};${(i.total || 0).toFixed(2)};${i.linkedPurchaseOrderNumber || ''};${i.costCenterName || ''};${i.entryMethod || 'manual'}`,
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facturas-proveedores-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado');
  };

  const tabs = [
    { id: 'all', label: 'Todas', count: kpis.total || undefined },
    { id: 'pending_validation', label: 'Pte. validar', count: kpis.pendingValidationCount || undefined },
    { id: 'validated', label: 'Validadas', count: kpis.validatedCount || undefined },
    { id: 'paid', label: 'Pagadas', count: kpis.paidCount || undefined },
    { id: 'pending_payment', label: 'Pte. pago', count: kpis.pendingPaymentCount || undefined },
    { id: 'overdue', label: 'Vencidas', count: kpis.overdueCount || undefined },
  ];

  return (
    <Layout title="Facturación Proveedores" subtitle="Control de facturas recibidas de proveedores">
      <div className="space-y-6">
        {/* Search & Actions */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
            <input
              className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              placeholder="Buscar factura, proveedor, pedido, centro de coste..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={handleExportCSV} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl flex items-center gap-2 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm">
              <Download className="w-4 h-4" /> CSV
            </button>
            <button onClick={() => { setEditingInvoice(null); setShowModal(true); }} className="px-4 py-2.5 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl flex items-center gap-2 font-medium transition-colors">
              <Plus className="w-5 h-5" /> Nueva factura
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          {months.length > 0 && (
            <select
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none"
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
            >
              <option value="">Todos los meses</option>
              {months.map(m => {
                const [y, mo] = m.split('-');
                const label = new Date(Number(y), Number(mo) - 1).toLocaleString('es-ES', { month: 'long', year: 'numeric' });
                return <option key={m} value={m}>{label}</option>;
              })}
            </select>
          )}
          {workCenters.length > 0 && (
            <select
              value={filterWorkCenter}
              onChange={e => setFilterWorkCenter(e.target.value)}
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none"
            >
              <option value="all">Todos los centros</option>
              {workCenters.filter(wc => wc.active).map(wc => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
            </select>
          )}
          {(supplierFilter || monthFilter || filterWorkCenter !== 'all') && (
            <button onClick={() => { setSupplierFilter(''); setMonthFilter(''); setFilterWorkCenter('all'); }} className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1">
              <X className="w-3 h-3" /> Limpiar filtros
            </button>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl">
            <div className="text-yellow-600 mb-2"><Clock className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-200">{kpis.pendingValidationAmount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
            <div className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">{kpis.pendingValidationCount} pte. validar</div>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
            <div className="text-green-600 mb-2"><CheckCircle2 className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-green-900 dark:text-green-200">{kpis.paidAmount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
            <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">{kpis.paidCount} pagadas</div>
          </div>
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
            <div className="text-red-600 mb-2"><AlertTriangle className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-red-900 dark:text-red-200">{kpis.overdueAmount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
            <div className="text-xs text-red-700 dark:text-red-400 mt-0.5">{kpis.overdueCount} vencidas</div>
          </div>
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl">
            <div className="text-purple-600 mb-2"><TrendingUp className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-200">{kpis.totalAmount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
            <div className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">{kpis.total} facturas total</div>
          </div>
        </div>

        {/* Alerts */}
        {kpis.overdueCount > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <p className="font-bold text-red-900 dark:text-red-300">
                {kpis.overdueCount} factura{kpis.overdueCount > 1 ? 's' : ''} vencida{kpis.overdueCount > 1 ? 's' : ''} ({kpis.overdueAmount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€)
              </p>
              <p className="text-sm text-red-700 dark:text-red-400">Revisa los pagos que han superado la fecha de vencimiento.</p>
            </div>
            <button onClick={() => setActiveTab('overdue')} className="ml-auto px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors shrink-0">
              Ver vencidas
            </button>
          </div>
        )}
        {kpis.duplicateCount > 0 && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-bold text-amber-900 dark:text-amber-300">
                {kpis.duplicateCount} posible{kpis.duplicateCount > 1 ? 's' : ''} duplicado{kpis.duplicateCount > 1 ? 's' : ''} sin revisar
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-400">Hay facturas que coinciden en n&uacute;mero y proveedor con otras existentes.</p>
            </div>
          </div>
        )}

        {/* Orphan invoices alert */}
        {(() => {
          const orphanCount = invoices.filter(i => !i.supplierId).length;
          if (orphanCount === 0) return null;
          return (
            <div className="bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-xl p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 shrink-0" />
              <div>
                <p className="font-bold text-orange-900 dark:text-orange-300">
                  {orphanCount} factura{orphanCount > 1 ? 's' : ''} sin proveedor asociado
                </p>
                <p className="text-sm text-orange-700 dark:text-orange-400">Vincula estas facturas a un proveedor de tu lista para un mejor seguimiento.</p>
              </div>
              <button onClick={() => navigate('/saas/suppliers')} className="ml-auto px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded-lg transition-colors shrink-0">
                Ver proveedores
              </button>
            </div>
          );
        })()}

        {/* Breakdown by supplier */}
        {bySupplier.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Desglose por proveedor
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {bySupplier.slice(0, 6).map(([key, data]) => (
                <button
                  key={key}
                  onClick={() => setSupplierFilter(supplierFilter === key ? '' : key)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    supplierFilter === key
                      ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{data.name}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{data.count} fact.</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{data.total.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</span>
                    {data.pending > 0 && (
                      <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">{data.pending.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€ pend.</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />
            Cargando facturas...
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <Receipt className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-semibold">Sin facturas registradas</p>
            <p className="text-sm mt-1">Registra la primera factura de un proveedor</p>
            <button onClick={() => { setEditingInvoice(null); setShowModal(true); }} className="mt-4 px-4 py-2 bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white rounded-xl text-sm font-medium">
              + Nueva factura
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Factura</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Proveedor</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Fecha</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Base</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">IVA</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Total</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">PDF</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Vínculos</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredInvoices.map(invoice => {
                    const statusCfg = STATUS_CONFIG[invoice.displayStatus] || STATUS_CONFIG.pending_validation;
                    const original = invoices.find(i => i._id === invoice._id)!;
                    const vs = (invoice as any).normalizedStatus || invoice.validationStatus || 'pending_validation';
                    const pdfInputId = `pdf-upload-${invoice._id}`;
                    return (
                      <tr key={invoice._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{invoice.invoiceNumber || '—'}</span>
                            {invoice.duplicateWarning && !invoice.duplicateReviewed && (
                              <button onClick={() => handleReviewDuplicate(original)} title="Posible duplicado — clic para marcar revisado">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                              </button>
                            )}
                          </div>
                          {invoice.entryMethod === 'ocr' && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400 mt-0.5">
                              <ScanLine className="w-3 h-3" /> OCR
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <button onClick={() => navigate('/saas/suppliers')} className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[140px] block">
                            {invoice.supplierName}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{invoice.date ? new Date(invoice.date).toLocaleDateString('es-ES') : '—'}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${statusCfg.badgeClass}`}>{statusCfg.label}</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-sm text-gray-600 dark:text-gray-400">{(invoice.subtotal || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="text-sm text-gray-600 dark:text-gray-400">{(invoice.taxAmount || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                          <span className="text-[10px] text-gray-400 ml-0.5">({invoice.taxRate || 0}%)</span>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="font-bold text-sm text-gray-900 dark:text-gray-100">{(invoice.total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {invoice.pdfUrl ? (
                            <a href={getInvoicePdfUrl(user?.id || '', invoice._id)} target="_blank" rel="noopener noreferrer" className="p-1.5 inline-flex hover:bg-violet-100 dark:hover:bg-violet-900/30 rounded-lg transition-colors" title="Ver PDF">
                              <FileText className="w-4 h-4 text-violet-600" />
                            </a>
                          ) : (
                            <>
                              <input type="file" id={pdfInputId} accept=".pdf,image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadPdf(original, f); }} />
                              <button onClick={() => document.getElementById(pdfInputId)?.click()} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Adjuntar PDF">
                                <Upload className="w-4 h-4 text-gray-400" />
                              </button>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {invoice.linkedPurchaseOrderNumber && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                                <Link2 className="w-2.5 h-2.5" /> {invoice.linkedPurchaseOrderNumber}
                              </span>
                            )}
                            {invoice.linkedExpenseId && (
                              <button onClick={() => navigate('/saas/income-expenses')} className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded hover:bg-green-100 transition-colors">
                                <DollarSign className="w-2.5 h-2.5" /> Gasto
                              </button>
                            )}
                            {invoice.linkedTaxEntryId && (
                              <button onClick={() => navigate('/saas/taxes')} className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded hover:bg-red-100 transition-colors">
                                <Receipt className="w-2.5 h-2.5" /> IVA
                              </button>
                            )}
                            {invoice.linkedDocumentId && (
                              <button onClick={() => navigate(`/saas/documents/${invoice.linkedDocumentId}`)} className="inline-flex items-center gap-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-1.5 py-0.5 rounded hover:bg-purple-100 transition-colors">
                                <FileText className="w-2.5 h-2.5" /> Doc
                              </button>
                            )}
                            {invoice.costCenterName && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                                <Building2 className="w-2.5 h-2.5" /> {invoice.costCenterName}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-0.5">
                            {(vs === 'pending_validation' || vs === 'pending') && (
                              <button onClick={() => handleValidate(original)} className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="Validar factura">
                                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                              </button>
                            )}
                            {vs === 'validated' && (
                              <>
                                <button onClick={() => handleMarkPaid(original)} className="p-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors" title="Marcar como pagada">
                                  <DollarSign className="w-4 h-4 text-green-600" />
                                </button>
                                <button onClick={() => handleReject(original)} className="p-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-colors" title="Rechazar">
                                  <ArrowLeft className="w-4 h-4 text-amber-600" />
                                </button>
                              </>
                            )}
                            {vs === 'paid' && (
                              <button onClick={() => handleMarkUnpaid(original)} className="p-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-colors" title="Desmarcar pago">
                                <Clock className="w-4 h-4 text-amber-600" />
                              </button>
                            )}
                            <button onClick={() => { setEditingInvoice(original); setShowModal(true); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Editar">
                              <Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button onClick={() => handleDelete(original)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Eliminar">
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-gray-900 border-t-2 border-gray-200 dark:border-gray-700">
                    <td colSpan={4} className="px-3 py-3 text-sm font-bold text-gray-700 dark:text-gray-300">
                      Total ({filteredInvoices.length} factura{filteredInvoices.length !== 1 ? 's' : ''})
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-gray-700 dark:text-gray-300">
                      {filteredInvoices.reduce((s, i) => s + (i.subtotal || 0), 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-gray-700 dark:text-gray-300">
                      {filteredInvoices.reduce((s, i) => s + (i.taxAmount || 0), 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                    </td>
                    <td className="px-3 py-3 text-right text-sm font-bold text-gray-900 dark:text-gray-100">
                      {filteredInvoices.reduce((s, i) => s + (i.total || 0), 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>

      <InvoiceModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingInvoice(null); }}
        onSave={handleSaveInvoice}
        suppliers={suppliers}
        catalogItems={catalogItems}
        purchaseOrders={purchaseOrders}
        workCenters={workCenters}
        userId={user?.id || ''}
        onWorkCenterCreated={wc => setWorkCenters(prev => [...prev, wc])}
        editItem={editingInvoice}
      />
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="supplier_billing"
        moduleLabel="Facturación"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Facturación"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
