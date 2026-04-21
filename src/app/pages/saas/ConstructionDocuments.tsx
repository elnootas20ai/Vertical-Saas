import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  FileText, Upload, Search, Filter, X, Eye, Edit3, Trash2, Download,
  AlertTriangle, ShieldAlert, PenTool, CheckCircle2, Clock, ScanLine,
  ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Plus, History,
  FileCheck, Ban, XCircle,
} from 'lucide-react';
import type {
  ConstructionObraDocument, ObraDocCategoria, ObraDocEstado, ObraDocStats,
  ObraDocTimelineEvent, ConstructionProject, ConstructionClient, OcrResult,
} from '../../lib/constructionApi';
import {
  listObraDocuments, createObraDocument, updateObraDocument, deleteObraDocument,
  validateObraDocument as apiValidateDoc, getObraDocumentStats, getObraDocumentTimeline,
  checkObraDocumentDuplicate, requestObraDocumentSignature, processObraDocumentOcr,
  scanDocumentOcr, listConstructionProjects, listConstructionClients,
} from '../../lib/constructionApi';

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIA_CONFIG: Record<string, { label: string; color: string }> = {
  presupuesto:          { label: 'Presupuesto',          color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  aceptacion:           { label: 'Aceptación',           color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  contrato:             { label: 'Contrato',             color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  licencia:             { label: 'Licencia',             color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  plano:                { label: 'Plano',                color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
  foto:                 { label: 'Fotografía',           color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300' },
  factura:              { label: 'Factura',              color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  justificante:         { label: 'Justificante',         color: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300' },
  doc_cliente:          { label: 'Doc. Cliente',         color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
  doc_gerencia:         { label: 'Doc. Gerencia',        color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  instruccion:          { label: 'Instrucción',          color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
  seguro:               { label: 'Seguro',               color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  certificado:          { label: 'Certificado',          color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  licencia_obra:        { label: 'Licencia de obra',     color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  permiso_municipal:    { label: 'Permiso municipal',    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  seguro_rc:            { label: 'Seguro RC',            color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  seguro_todo_riesgo:   { label: 'Seguro todo riesgo',   color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
  plan_seguridad_salud: { label: 'Plan seg. y salud',    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  evaluacion_riesgos:   { label: 'Evaluación riesgos',   color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  certificado_tecnico:  { label: 'Certificado técnico',  color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  acta_replanteo:       { label: 'Acta replanteo',       color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  contrato_obra:        { label: 'Contrato de obra',     color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  certificacion_obra:   { label: 'Certificación obra',   color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  albaran:              { label: 'Albarán',              color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  memoria_tecnica:      { label: 'Memoria técnica',      color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  otro:                 { label: 'Otro',                 color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
};

const ESTADO_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  borrador:        { label: 'Borrador',         color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', icon: Edit3 },
  pendiente:       { label: 'Pendiente',        color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', icon: Clock },
  pendiente_firma: { label: 'Pend. firma',      color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', icon: PenTool },
  firmado:         { label: 'Firmado',          color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', icon: FileCheck },
  validado:        { label: 'Validado',         color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle2 },
  vigente:         { label: 'Vigente',          color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle2 },
  archivado:       { label: 'Archivado',        color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', icon: FileText },
  caducado:        { label: 'Caducado',         color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: ShieldAlert },
  rechazado:       { label: 'Rechazado',        color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: XCircle },
};

const TIMELINE_ICONS: Record<string, { icon: typeof Clock; color: string }> = {
  creado:           { icon: Plus, color: 'text-blue-500' },
  editado:          { icon: Edit3, color: 'text-gray-500' },
  firmado:          { icon: PenTool, color: 'text-green-600' },
  firma_solicitada: { icon: PenTool, color: 'text-orange-500' },
  rechazado:        { icon: Ban, color: 'text-red-500' },
  validado:         { icon: CheckCircle2, color: 'text-green-600' },
  caducado:         { icon: ShieldAlert, color: 'text-red-500' },
  ocr_procesado:    { icon: ScanLine, color: 'text-purple-500' },
  auto_generado:    { icon: FileCheck, color: 'text-indigo-500' },
};

type SortField = 'nombre' | 'createdAt' | 'estado';
type SortDir = 'asc' | 'desc';

function catLabel(c: string) { return CATEGORIA_CONFIG[c]?.label || c; }
function catColor(c: string) { return CATEGORIA_CONFIG[c]?.color || CATEGORIA_CONFIG.otro.color; }
function estLabel(e: string) { return ESTADO_CONFIG[e]?.label || e; }
function estColor(e: string) { return ESTADO_CONFIG[e]?.color || ESTADO_CONFIG.borrador.color; }

function relTime(iso: string) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days}d`;
  return new Date(iso).toLocaleDateString('es-ES');
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ConstructionDocuments() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const userRole = (user as Record<string, unknown>)?.role as string || 'Gerente';
  const isAdmin = ['Admin', 'Gerente'].includes(userRole);
  const [searchParams, setSearchParams] = useSearchParams();

  const [documents, setDocuments] = useState<ConstructionObraDocument[]>([]);
  const [projects, setProjects] = useState<ConstructionProject[]>([]);
  const [clients, setClients] = useState<ConstructionClient[]>([]);
  const [stats, setStats] = useState<ObraDocStats | null>(null);
  const [timeline, setTimeline] = useState<ObraDocTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterObra, setFilterObra] = useState(searchParams.get('obraId') || '');
  const [filterCliente, setFilterCliente] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [sigOpen, setSigOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<ConstructionObraDocument | null>(null);
  const [editDoc, setEditDoc] = useState<ConstructionObraDocument | null>(null);
  const [sigDoc, setSigDoc] = useState<ConstructionObraDocument | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const filters: Record<string, string> = {};
      if (filterObra) filters.obraId = filterObra;
      if (filterCliente) filters.clienteId = filterCliente;
      if (filterCategoria) filters.categoria = filterCategoria;
      if (filterEstado) filters.estado = filterEstado;
      if (search) filters.search = search;
      const [docs, p, c, s] = await Promise.all([
        listObraDocuments(userId, filters),
        listConstructionProjects(userId),
        listConstructionClients(userId),
        getObraDocumentStats(userId, filterObra || undefined),
      ]);
      setDocuments(docs);
      setProjects(p);
      setClients(c);
      setStats(s);
      if (filterObra) {
        const tl = await getObraDocumentTimeline(userId, filterObra);
        setTimeline(tl.events);
      } else {
        setTimeline([]);
      }
    } catch { /* */ }
    setLoading(false);
  }, [userId, filterObra, filterCliente, filterCategoria, filterEstado, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (filterObra) p.set('obraId', filterObra);
    setSearchParams(p, { replace: true });
  }, [filterObra, setSearchParams]);

  const sorted = useMemo(() => {
    const arr = [...documents];
    arr.sort((a, b) => {
      const va = a[sortField] || '';
      const vb = b[sortField] || '';
      const cmp = String(va).localeCompare(String(vb));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [documents, sortField, sortDir]);

  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />;
  };

  const handleDelete = async (d: ConstructionObraDocument) => {
    if (!confirm(`¿Eliminar "${d.nombre}"?`)) return;
    try { await deleteObraDocument(userId, d._id); load(); } catch { /* */ }
  };

  const handleValidate = async (d: ConstructionObraDocument) => {
    try { await apiValidateDoc(userId, d._id); load(); } catch { /* */ }
  };

  const clearFilters = () => { setSearch(''); setFilterObra(''); setFilterCliente(''); setFilterCategoria(''); setFilterEstado(''); };

  // ─── Upload Modal ──────────────────────────────────────────────────────────

  function UploadModal() {
    const [form, setForm] = useState({
      obraId: filterObra, categoria: 'otro' as ObraDocCategoria, nombre: '', descripcion: '',
      fechaCaducidad: '', visibleTrabajador: false, tags: '',
    });
    const [file, setFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [dupWarning, setDupWarning] = useState<ConstructionObraDocument[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    const obraName = projects.find(p => p._id === form.obraId)?.nombre || '';
    const clienteId = projects.find(p => p._id === form.obraId)?.clienteId || '';
    const clienteNombre = projects.find(p => p._id === form.obraId)?.clienteNombre || '';

    const handleFile = (f: File) => {
      setFile(f);
      if (!form.nombre) setForm(prev => ({ ...prev, nombre: f.name.replace(/\.[^.]+$/, '') }));
    };

    const checkDups = async () => {
      if (!form.obraId || !form.nombre) return;
      try {
        const dups = await checkObraDocumentDuplicate(userId, { obraId: form.obraId, nombre: form.nombre, categoria: form.categoria, archivoSize: file?.size || 0 });
        setDupWarning(dups);
      } catch { /* */ }
    };

    const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.obraId || !form.nombre || !file) return;
      setSaving(true);
      try {
        const base64 = await fileToBase64(file);
        await createObraDocument(userId, {
          obraId: form.obraId, obraNombre: obraName,
          clienteId, clienteNombre,
          categoria: form.categoria, nombre: form.nombre, descripcion: form.descripcion,
          fechaCaducidad: form.fechaCaducidad, visibleTrabajador: form.visibleTrabajador,
          tags: form.tags ? form.tags.split(',').map(t => t.trim()) : [],
          archivoBase64: base64, archivoMimeType: file.type, archivoNombre: file.name,
          archivoSize: file.size, estado: 'pendiente',
        } as Partial<ConstructionObraDocument>);
        setUploadOpen(false); load();
      } catch { /* */ }
      setSaving(false);
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setUploadOpen(false)}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-5 border-b dark:border-gray-700">
            <h2 className="text-lg font-bold dark:text-white flex items-center gap-2"><Upload className="w-5 h-5 text-blue-600" /> Subir documento</h2>
            <button onClick={() => setUploadOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={handleSave} className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">Obra *</label>
              <select value={form.obraId} onChange={e => setForm(p => ({ ...p, obraId: e.target.value }))} className="w-full rounded-lg border dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-white" required>
                <option value="">Seleccionar obra...</option>
                {projects.map(p => <option key={p._id} value={p._id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">Categoría *</label>
              <select value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value as ObraDocCategoria }))} className="w-full rounded-lg border dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-white">
                {Object.entries(CATEGORIA_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">Nombre *</label>
              <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} onBlur={checkDups}
                className="w-full rounded-lg border dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-white" required />
            </div>
            {dupWarning.length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Ya existe un documento similar: {dupWarning.map(d => d.nombre).join(', ')}. ¿Deseas continuar?</span>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">Descripción</label>
              <textarea value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} rows={2}
                className="w-full rounded-lg border dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-white" />
            </div>
            {(form.categoria === 'licencia' || form.categoria === 'seguro' || form.categoria === 'licencia_obra' || form.categoria === 'seguro_rc' || form.categoria === 'seguro_todo_riesgo') && (
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">Fecha caducidad</label>
                <input type="date" value={form.fechaCaducidad} onChange={e => setForm(p => ({ ...p, fechaCaducidad: e.target.value }))}
                  className="w-full rounded-lg border dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-white" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">Tags (separados por coma)</label>
              <input value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
                className="w-full rounded-lg border dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-white" placeholder="factura, marzo, electricidad" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.visibleTrabajador} onChange={e => setForm(p => ({ ...p, visibleTrabajador: e.target.checked }))} className="rounded" />
              <span className="text-sm dark:text-gray-300">Visible para trabajadores</span>
            </label>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">Archivo *</label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition dark:border-gray-600"
                onClick={() => inputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}>
                {file ? <span className="text-sm dark:text-gray-300">{file.name} ({(file.size / 1024).toFixed(0)} KB)</span>
                  : <span className="text-sm text-gray-400">Arrastra un archivo o haz clic para seleccionar</span>}
                <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setUploadOpen(false)} className="px-4 py-2 text-sm rounded-lg border dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">Cancelar</button>
              <button type="submit" disabled={saving || !file || !form.obraId || !form.nombre}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Subiendo...' : 'Subir documento'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ─── OCR Modal ─────────────────────────────────────────────────────────────

  function OcrModal() {
    const [file, setFile] = useState<File | null>(null);
    const [scanning, setScanning] = useState(false);
    const [result, setResult] = useState<OcrResult | null>(null);
    const [sugCat, setSugCat] = useState('');
    const [obraId, setObraId] = useState(filterObra);
    const [nombre, setNombre] = useState('');
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleScan = async () => {
      if (!file) return;
      setScanning(true);
      try {
        const base64 = await fileToBase64(file);
        const r = await scanDocumentOcr(base64, file.type);
        setResult(r);
        const catMap: Record<string, string> = {
          factura_proveedor: 'factura', factura_cliente: 'factura', presupuesto: 'presupuesto',
          contrato: 'contrato', licencia: 'licencia', certificado: 'certificado', seguro: 'seguro',
          nomina: 'doc_gerencia', ticket: 'justificante', albaran: 'albaran',
        };
        setSugCat(catMap[r.documentType || ''] || 'otro');
        if (!nombre && (r.documentNumber || r.emitter)) setNombre(`${r.documentTypeLabel || r.documentType || 'Documento'} ${r.documentNumber || ''} ${r.emitter || ''}`.trim());
      } catch { /* */ }
      setScanning(false);
    };

    const handleSaveOcr = async () => {
      if (!obraId || !nombre || !file) return;
      setSaving(true);
      try {
        const base64 = await fileToBase64(file);
        const obraName = projects.find(p => p._id === obraId)?.nombre || '';
        const doc = await createObraDocument(userId, {
          obraId, obraNombre: obraName,
          categoria: (sugCat || 'otro') as ObraDocCategoria, nombre,
          archivoBase64: base64, archivoMimeType: file.type, archivoNombre: file.name,
          archivoSize: file.size, estado: 'pendiente',
        } as Partial<ConstructionObraDocument>);
        if (result) await processObraDocumentOcr(userId, doc._id, result);
        setOcrOpen(false); load();
      } catch { /* */ }
      setSaving(false);
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOcrOpen(false)}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-5 border-b dark:border-gray-700">
            <h2 className="text-lg font-bold dark:text-white flex items-center gap-2"><ScanLine className="w-5 h-5 text-purple-600" /> Escanear con OCR</h2>
            <button onClick={() => setOcrOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-5 space-y-4">
            <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-purple-400 transition dark:border-gray-600"
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); }} onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}>
              {file ? <span className="text-sm dark:text-gray-300">{file.name}</span> : <span className="text-sm text-gray-400">Arrastra una imagen o PDF</span>}
              <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); }} />
            </div>
            {!result && (
              <button onClick={handleScan} disabled={!file || scanning}
                className="w-full py-2.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 text-sm font-medium">
                {scanning ? 'Escaneando...' : 'Escanear documento'}
              </button>
            )}
            {result && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-sm space-y-1">
                  <p className="font-medium dark:text-white">Tipo detectado: <span className="text-purple-600">{result.documentTypeLabel || result.documentType || '—'}</span></p>
                  {result.emitter && <p className="dark:text-gray-300">Emisor: {result.emitter}</p>}
                  {result.total != null && <p className="dark:text-gray-300">Total: {result.total?.toFixed(2)}€</p>}
                  {result.date && <p className="dark:text-gray-300">Fecha: {result.date}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">Categoría sugerida</label>
                  <select value={sugCat} onChange={e => setSugCat(e.target.value)} className="w-full rounded-lg border dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-white">
                    {Object.entries(CATEGORIA_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">Obra</label>
                  <select value={obraId} onChange={e => setObraId(e.target.value)} className="w-full rounded-lg border dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-white" required>
                    <option value="">Seleccionar...</option>
                    {projects.map(p => <option key={p._id} value={p._id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">Nombre</label>
                  <input value={nombre} onChange={e => setNombre(e.target.value)} className="w-full rounded-lg border dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-white" required />
                </div>
                <button onClick={handleSaveOcr} disabled={saving || !obraId || !nombre}
                  className="w-full py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
                  {saving ? 'Guardando...' : 'Guardar como documento de obra'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Signature Modal ───────────────────────────────────────────────────────

  function SignatureModal() {
    const doc = sigDoc;
    const [signers, setSigners] = useState([{ name: '', email: '', role: 'cliente' }]);
    const [message, setMessage] = useState('');
    const [expiresAt, setExpiresAt] = useState('');
    const [saving, setSaving] = useState(false);

    if (!doc) return null;

    const addSigner = () => setSigners(p => [...p, { name: '', email: '', role: 'firmante' }]);
    const updateSigner = (i: number, k: string, v: string) => setSigners(p => p.map((s, idx) => idx === i ? { ...s, [k]: v } : s));
    const removeSigner = (i: number) => setSigners(p => p.filter((_, idx) => idx !== i));

    const handleSend = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!signers[0]?.email) return;
      setSaving(true);
      try {
        await requestObraDocumentSignature(userId, doc._id, { signers, message, expiresAt });
        setSigOpen(false); setSigDoc(null); load();
      } catch { /* */ }
      setSaving(false);
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setSigOpen(false); setSigDoc(null); }}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-5 border-b dark:border-gray-700">
            <h2 className="text-lg font-bold dark:text-white flex items-center gap-2"><PenTool className="w-5 h-5 text-orange-600" /> Solicitar firma</h2>
            <button onClick={() => { setSigOpen(false); setSigDoc(null); }} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
          </div>
          <form onSubmit={handleSend} className="p-5 space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Documento: <span className="font-medium dark:text-white">{doc.nombre}</span></p>
            {signers.map((s, i) => (
              <div key={i} className="flex gap-2">
                <input value={s.name} onChange={e => updateSigner(i, 'name', e.target.value)} placeholder="Nombre" className="flex-1 rounded-lg border dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-white" />
                <input value={s.email} onChange={e => updateSigner(i, 'email', e.target.value)} placeholder="Email *" type="email" required
                  className="flex-1 rounded-lg border dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-white" />
                {signers.length > 1 && <button type="button" onClick={() => removeSigner(i)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg dark:hover:bg-red-900/20"><X className="w-4 h-4" /></button>}
              </div>
            ))}
            <button type="button" onClick={addSigner} className="text-sm text-blue-600 hover:underline">+ Añadir firmante</button>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">Mensaje</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={2} className="w-full rounded-lg border dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 dark:text-gray-300">Fecha límite</label>
              <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="w-full rounded-lg border dark:border-gray-600 px-3 py-2 dark:bg-gray-700 dark:text-white" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => { setSigOpen(false); setSigDoc(null); }} className="px-4 py-2 text-sm rounded-lg border dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300">Cancelar</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50">
                {saving ? 'Enviando...' : 'Enviar solicitud'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // ─── Preview Modal ─────────────────────────────────────────────────────────

  function PreviewModal() {
    const doc = previewDoc;
    if (!doc) return null;
    const isImage = doc.archivoMimeType?.startsWith('image/');
    const isPdf = doc.archivoMimeType === 'application/pdf';
    const dataUrl = doc.archivoBase64 ? `data:${doc.archivoMimeType};base64,${doc.archivoBase64}` : '';

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewDoc(null)}>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-5 border-b dark:border-gray-700">
            <h2 className="text-lg font-bold dark:text-white flex items-center gap-2"><Eye className="w-5 h-5 text-blue-600" /> {doc.nombre}</h2>
            <button onClick={() => setPreviewDoc(null)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
          </div>
          <div className="p-5 grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              {isImage && dataUrl && <img src={dataUrl} alt={doc.nombre} className="rounded-lg max-h-96 w-full object-contain bg-gray-50 dark:bg-gray-900" />}
              {isPdf && dataUrl && <iframe src={dataUrl} className="w-full h-96 rounded-lg border dark:border-gray-700" />}
              {!isImage && !isPdf && <div className="flex items-center justify-center h-48 bg-gray-50 dark:bg-gray-900 rounded-lg"><FileText className="w-12 h-12 text-gray-300" /></div>}
              {dataUrl && (
                <a href={dataUrl} download={doc.archivoNombre || doc.nombre} className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline">
                  <Download className="w-4 h-4" /> Descargar archivo
                </a>
              )}
            </div>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-gray-500 dark:text-gray-400">Categoría</span><p><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${catColor(doc.categoria)}`}>{catLabel(doc.categoria)}</span></p></div>
                <div><span className="text-gray-500 dark:text-gray-400">Estado</span><p><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${estColor(doc.estado)}`}>{estLabel(doc.estado)}</span></p></div>
                <div><span className="text-gray-500 dark:text-gray-400">Obra</span><p className="font-medium dark:text-white">{doc.obraNombre || '—'}</p></div>
                <div><span className="text-gray-500 dark:text-gray-400">Cliente</span><p className="font-medium dark:text-white">{doc.clienteNombre || '—'}</p></div>
                {doc.fechaCaducidad && <div><span className="text-gray-500 dark:text-gray-400">Caducidad</span><p className="dark:text-white">{doc.fechaCaducidad}</p></div>}
                {doc.firmaEstado && <div><span className="text-gray-500 dark:text-gray-400">Firma</span><p className="dark:text-white">{doc.firmaEstado}{doc.firmadoPor ? ` — ${doc.firmadoPor}` : ''}</p></div>}
                <div><span className="text-gray-500 dark:text-gray-400">Subido por</span><p className="dark:text-white">{doc.subidoPor || '—'}</p></div>
                <div><span className="text-gray-500 dark:text-gray-400">Fecha</span><p className="dark:text-white">{doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('es-ES') : '—'}</p></div>
              </div>
              {doc.ocrData && (
                <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 space-y-1">
                  <p className="font-medium text-purple-700 dark:text-purple-300">Datos OCR</p>
                  {doc.ocrData.emitter && <p className="dark:text-gray-300">Emisor: {doc.ocrData.emitter}</p>}
                  {doc.ocrData.total != null && <p className="dark:text-gray-300">Total: {doc.ocrData.total.toFixed(2)}€</p>}
                  {doc.ocrData.date && <p className="dark:text-gray-300">Fecha: {doc.ocrData.date}</p>}
                  {doc.ocrData.documentNumber && <p className="dark:text-gray-300">Nº: {doc.ocrData.documentNumber}</p>}
                </div>
              )}
              {doc.descripcion && <div><span className="text-gray-500 dark:text-gray-400">Descripción</span><p className="dark:text-white mt-1">{doc.descripcion}</p></div>}
              {doc.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {doc.tags.map((t, i) => <span key={i} className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 dark:text-gray-300">{t}</span>)}
                </div>
              )}
              {doc.historial?.length > 0 && (
                <div>
                  <p className="font-medium mb-2 dark:text-white">Historial</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {doc.historial.slice().reverse().map((h, i) => {
                      const cfg = TIMELINE_ICONS[h.accion] || { icon: Clock, color: 'text-gray-400' };
                      const Icon = cfg.icon;
                      return (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                          <div>
                            <span className="font-medium dark:text-gray-300">{h.usuario}</span>
                            <span className="text-gray-400 dark:text-gray-500"> · {relTime(h.fecha)}</span>
                            <p className="text-gray-500 dark:text-gray-400">{h.detalle}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Timeline Panel ────────────────────────────────────────────────────────

  function TimelinePanel() {
    if (!timelineOpen || !filterObra || !timeline.length) return null;
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold dark:text-white flex items-center gap-2"><History className="w-4 h-4" /> Histórico documental</h3>
          <button onClick={() => setTimelineOpen(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-4 h-4" /></button>
        </div>
        <div className="relative pl-6 space-y-4 max-h-96 overflow-y-auto">
          <div className="absolute left-2.5 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
          {timeline.map((ev, i) => {
            const cfg = TIMELINE_ICONS[ev.tipo] || { icon: Clock, color: 'text-gray-400' };
            const Icon = cfg.icon;
            return (
              <div key={i} className="relative flex items-start gap-3">
                <div className={`absolute -left-3.5 mt-1 w-5 h-5 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center ring-2 ring-gray-200 dark:ring-gray-700`}>
                  <Icon className={`w-3 h-3 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium dark:text-white truncate">{ev.documentoNombre}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{ev.usuario} · {relTime(ev.fecha)}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{ev.detalle}</p>
                </div>
                <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${catColor(ev.categoria)}`}>{catLabel(ev.categoria)}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout title="Documentación de Obra">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold dark:text-white flex items-center gap-3">
              <FileText className="w-7 h-7 text-blue-600" /> Documentación de Obra
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Centraliza y gestiona todos los documentos de cada obra</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setOcrOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border dark:border-gray-600 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300 transition">
              <ScanLine className="w-4 h-4 text-purple-600" /> Escanear OCR
            </button>
            <button onClick={() => setUploadOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition shadow-sm">
              <Upload className="w-4 h-4" /> Subir documento
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"><FileText className="w-5 h-5 text-blue-600" /></div>
                <div><p className="text-2xl font-bold dark:text-white">{stats.total}</p><p className="text-xs text-gray-500 dark:text-gray-400">Total documentos</p></div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stats.obligatoriosFaltantes > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                  <AlertTriangle className={`w-5 h-5 ${stats.obligatoriosFaltantes > 0 ? 'text-red-600' : 'text-green-600'}`} />
                </div>
                <div><p className="text-2xl font-bold dark:text-white">{stats.obligatoriosFaltantes}</p><p className="text-xs text-gray-500 dark:text-gray-400">Obligatorios faltantes</p></div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stats.firmasPendientes > 0 ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                  <PenTool className={`w-5 h-5 ${stats.firmasPendientes > 0 ? 'text-orange-600' : 'text-green-600'}`} />
                </div>
                <div><p className="text-2xl font-bold dark:text-white">{stats.firmasPendientes}</p><p className="text-xs text-gray-500 dark:text-gray-400">Firmas pendientes</p></div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stats.licenciasCaducadas > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                  <ShieldAlert className={`w-5 h-5 ${stats.licenciasCaducadas > 0 ? 'text-red-600' : 'text-green-600'}`} />
                </div>
                <div><p className="text-2xl font-bold dark:text-white">{stats.licenciasCaducadas}</p><p className="text-xs text-gray-500 dark:text-gray-400">Licencias caducadas</p></div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, descripción o tags..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border dark:border-gray-600 text-sm dark:bg-gray-700 dark:text-white" />
            </div>
            <select value={filterObra} onChange={e => setFilterObra(e.target.value)}
              className="rounded-lg border dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-white min-w-[150px]">
              <option value="">Todas las obras</option>
              {projects.map(p => <option key={p._id} value={p._id}>{p.nombre}</option>)}
            </select>
            <select value={filterCliente} onChange={e => setFilterCliente(e.target.value)}
              className="rounded-lg border dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-white min-w-[150px]">
              <option value="">Todos los clientes</option>
              {clients.map(c => <option key={c._id} value={c._id}>{c.nombre}</option>)}
            </select>
            <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)}
              className="rounded-lg border dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-white min-w-[140px]">
              <option value="">Todas categorías</option>
              {Object.entries(CATEGORIA_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
              className="rounded-lg border dark:border-gray-600 px-3 py-2 text-sm dark:bg-gray-700 dark:text-white min-w-[120px]">
              <option value="">Todos estados</option>
              {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {(search || filterObra || filterCliente || filterCategoria || filterEstado) && (
              <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-red-500 hover:underline"><X className="w-3.5 h-3.5" /> Limpiar</button>
            )}
            {filterObra && (
              <button onClick={() => setTimelineOpen(!timelineOpen)} className={`flex items-center gap-1 text-sm px-3 py-2 rounded-lg border dark:border-gray-600 transition ${timelineOpen ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300'}`}>
                <History className="w-4 h-4" /> Histórico
              </button>
            )}
          </div>
        </div>

        {/* Timeline */}
        <TimelinePanel />

        {/* Documents Table */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center"><div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" /></div>
          ) : sorted.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-16 h-16 text-gray-200 dark:text-gray-600 mx-auto mb-4" />
              <p className="text-lg font-medium dark:text-white mb-1">No hay documentos</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Sube el primer documento de esta obra</p>
              <button onClick={() => setUploadOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                <Upload className="w-4 h-4" /> Subir documento
              </button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                      <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 cursor-pointer select-none" onClick={() => toggleSort('nombre')}>
                        <span className="flex items-center gap-1">Nombre <SortIcon field="nombre" /></span>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Categoría</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Obra</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 cursor-pointer select-none" onClick={() => toggleSort('estado')}>
                        <span className="flex items-center gap-1">Estado <SortIcon field="estado" /></span>
                      </th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Firma</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400 cursor-pointer select-none" onClick={() => toggleSort('createdAt')}>
                        <span className="flex items-center gap-1">Fecha <SortIcon field="createdAt" /></span>
                      </th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(d => (
                      <tr key={d._id} className="border-b dark:border-gray-700/50 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium dark:text-white truncate max-w-[200px]">{d.nombre}</p>
                              {d.obligatorio && <span className="text-[10px] text-amber-600 font-medium">OBLIGATORIO</span>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${catColor(d.categoria)}`}>{catLabel(d.categoria)}</span></td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 truncate max-w-[140px]">{d.obraNombre || '—'}</td>
                        <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${estColor(d.estado)}`}>{estLabel(d.estado)}</span></td>
                        <td className="px-4 py-3">
                          {d.firmaEstado === 'pendiente' && <span className="text-xs text-orange-600 font-medium">Pendiente</span>}
                          {d.firmaEstado === 'firmado' && <span className="text-xs text-green-600 font-medium">Firmado</span>}
                          {d.firmaEstado === 'rechazado' && <span className="text-xs text-red-600 font-medium">Rechazado</span>}
                          {!d.firmaEstado && <span className="text-xs text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{relTime(d.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => setPreviewDoc(d)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500" title="Ver"><Eye className="w-4 h-4" /></button>
                            {isAdmin && d.estado !== 'validado' && (
                              <button onClick={() => handleValidate(d)} className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600" title="Validar"><CheckCircle2 className="w-4 h-4" /></button>
                            )}
                            {isAdmin && !d.firmaEstado && (
                              <button onClick={() => { setSigDoc(d); setSigOpen(true); }} className="p-1.5 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-600" title="Solicitar firma"><PenTool className="w-4 h-4" /></button>
                            )}
                            {isAdmin && (
                              <button onClick={() => handleDelete(d)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y dark:divide-gray-700">
                {sorted.map(d => (
                  <div key={d._id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                        <p className="font-medium dark:text-white truncate">{d.nombre}</p>
                      </div>
                      <span className={`shrink-0 ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${estColor(d.estado)}`}>{estLabel(d.estado)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full font-medium ${catColor(d.categoria)}`}>{catLabel(d.categoria)}</span>
                      {d.obraNombre && <span className="text-gray-500 dark:text-gray-400">{d.obraNombre}</span>}
                      <span className="text-gray-400">{relTime(d.createdAt)}</span>
                    </div>
                    <div className="flex gap-1 pt-1">
                      <button onClick={() => setPreviewDoc(d)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><Eye className="w-4 h-4" /></button>
                      {isAdmin && <button onClick={() => handleValidate(d)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600"><CheckCircle2 className="w-4 h-4" /></button>}
                      {isAdmin && !d.firmaEstado && <button onClick={() => { setSigDoc(d); setSigOpen(true); }} className="p-1.5 rounded-lg hover:bg-orange-50 text-orange-600"><PenTool className="w-4 h-4" /></button>}
                      {isAdmin && <button onClick={() => handleDelete(d)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {uploadOpen && <UploadModal />}
      {ocrOpen && <OcrModal />}
      {sigOpen && sigDoc && <SignatureModal />}
      {previewDoc && <PreviewModal />}
    </Layout>
  );
}
