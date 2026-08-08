import { useState, useMemo, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Layout } from '../../components/saas/Layout';
import { RealEstateNav } from '../../components/saas/RealEstateNav';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { useRealEstateScope } from '../../lib/realEstateScope';
import { useBusiness } from '../../context/BusinessContext';
import { useAuth } from '../../context/AuthContext';
import { listTeamAgentOptions, resolveTeamAgent } from '../../lib/realEstateTeamAgents';
import { useModalClose } from '../../hooks/useModalClose';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, X, Edit3, Trash2, Building2, Home, DollarSign,
  TrendingUp, MapPin, Loader2, Plus, Upload, Camera, FileText,
  ChevronLeft, ChevronRight, KeyRound, BedDouble, Bath, Ruler,
  LayoutGrid, List as ListIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { bulkCreateVerticalEntries, entryStr, entryNum } from '../../lib/bulkVerticalImport';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';
import { formatMoneyEs, formatNumberEs } from '../../lib/formatNumberEs';
import { formatDateEs } from '../../lib/formatDateEs';
import {
  formatMoneyAsYouType,
  moneyNumberToDisplay,
  parseSpanishMoneyInput,
} from '../../lib/workCenterMoneyInput';
import { downscaleImageFileToBase64 } from '../../lib/ocrImagePrepare';
import { AuthImage } from '../../components/saas/AuthImage';
import { withErrorBoundary } from '../../components/ErrorBoundary';

function newPropertyRef(): string {
  return `REF-${Date.now().toString(36).toUpperCase()}`;
}

const MAX_PROPERTY_PHOTOS = 8;
/** Más agresivo: caben varias fotos vía /foto sin hinchar el PUT del inmueble. */
const PHOTO_MAX_DIM = 960;
const PHOTO_JPEG_QUALITY = 0.68;

function normalizeFotos(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
}

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function fileLabel(file: File): string {
  return String(file.name || 'foto').trim() || 'foto';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string' && result.startsWith('data:')) resolve(result);
      else reject(new Error('Lectura inválida'));
    };
    reader.onerror = () => reject(new Error('Error al leer archivo'));
    reader.readAsDataURL(file);
  });
}

function bitmapToJpegDataUrl(bitmap: ImageBitmap): string {
  const maxSide = Math.max(bitmap.width, bitmap.height) || 1;
  const scale = maxSide > PHOTO_MAX_DIM ? PHOTO_MAX_DIM / maxSide : 1;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY);
  canvas.width = 0;
  canvas.height = 0;
  if (!dataUrl.startsWith('data:image/')) throw new Error('Canvas no generó JPEG');
  return dataUrl;
}

/** WhatsApp / Windows: a menudo sin MIME o octet-stream. Probamos TODO. */
async function fileToPropertyPhotoDataUrl(file: File): Promise<string> {
  if (!file || file.size <= 0) throw new Error('Archivo vacío');
  if (file.size > MAX_FILE_BYTES) throw new Error('Demasiado grande (máx. 25 MB)');

  const name = fileLabel(file);
  if (/\.hei[cf]$/i.test(name) || /image\/hei[cf]/i.test(file.type || '')) {
    // Intentar igual (Safari a veces decodifica); si no, error claro.
  }

  // 1) createImageBitmap — mejor con WhatsApp / octet-stream
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        return bitmapToJpegDataUrl(bitmap);
      } finally {
        bitmap.close?.();
      }
    } catch {
      /* 2 */
    }
  }

  // 2) downscale helper (object URL + Image)
  try {
    const { dataUrl } = await downscaleImageFileToBase64(file, PHOTO_MAX_DIM, PHOTO_JPEG_QUALITY);
    if (dataUrl?.startsWith('data:image/')) return dataUrl;
  } catch {
    /* 3 */
  }

  // 3) FileReader + re-decode
  const raw = await readFileAsDataUrl(file);
  if (/^data:image\/hei[cf]/i.test(raw) || /\.hei[cf]$/i.test(name)) {
    throw new Error('HEIC (iPhone): guárdala como JPG en WhatsApp y súbela otra vez');
  }
  let candidate = raw;
  if (raw.startsWith('data:application/octet-stream') || raw.startsWith('data:;')) {
    candidate = `data:image/jpeg;base64,${raw.split(',')[1] || ''}`;
  }
  if (!candidate.startsWith('data:image/')) {
    throw new Error('No parece una imagen');
  }
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('El navegador no pudo abrir la imagen'));
    img.src = candidate;
  });
  // Recomprimir vía canvas desde el data URL
  try {
    const { dataUrl } = await downscaleImageFileToBase64(
      new File([await (await fetch(candidate)).blob()], name, { type: 'image/jpeg' }),
      PHOTO_MAX_DIM,
      PHOTO_JPEG_QUALITY,
    );
    if (dataUrl?.startsWith('data:image/')) return dataUrl;
  } catch {
    /* devolver candidate */
  }
  return candidate;
}

async function readImageFilesAsDataUrls(files: FileList | File[] | Blob[]): Promise<{
  urls: string[];
  errors: string[];
}> {
  const all = Array.from(files || []).map((f, i) => (
    f instanceof File ? f : new File([f], `whatsapp-${i + 1}.jpg`, { type: f.type || 'image/jpeg' })
  ));
  const urls: string[] = [];
  const errors: string[] = [];
  for (const file of all) {
    try {
      urls.push(await fileToPropertyPhotoDataUrl(file));
    } catch (e) {
      const why = e instanceof Error ? e.message : 'error desconocido';
      errors.push(`${fileLabel(file)}: ${why}`);
    }
  }
  return { urls, errors };
}

type TipoInmueble = 'piso' | 'casa' | 'chalet' | 'local' | 'oficina' | 'terreno' | 'nave';
type Operacion = 'venta' | 'alquiler';
type EstadoProp = 'disponible' | 'reservado' | 'vendido' | 'alquilado';

type SiNo = '' | 'si' | 'no' | 'parcial';
type CertEnergetico = '' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'en_tramite' | 'exento';
type LlavesUbicacion = '' | 'oficina' | 'propietario' | 'caja_seguridad' | 'portero' | 'otro';

interface Property extends VerticalEntity {
  referencia: string;
  tipo: TipoInmueble;
  direccion: string;
  ciudad?: string;
  zona?: string;
  codigoPostal?: string;
  m2: number;
  habitaciones: number;
  banos?: number;
  planta?: string;
  anioConstruccion?: number;
  certificadoEnergetico?: CertEnergetico | string;
  amueblado?: SiNo | string;
  plazaGaraje?: SiNo | string;
  ascensor?: SiNo | string;
  terraza?: SiNo | string;
  precio: number;
  operacion: Operacion;
  estado: EstadoProp;
  /** Fecha en que la agencia captó el encargo (ISO yyyy-mm-dd). */
  fechaCaptacion?: string;
  exclusividad?: SiNo | string;
  llavesUbicacion?: LlavesUbicacion | string;
  propietarioNombre?: string;
  propietarioTelefono?: string;
  comisionPct?: number;
  descripcion?: string;
  /** Comercial responsable (Equipo / RRHH). */
  agente?: string;
  agenteUserId?: string;
  /** Data URLs o URLs guardadas */
  fotos: string[];
}

type PropertyForm = Omit<Property, keyof VerticalEntity>;

const STATUS_CFG: Record<EstadoProp, { bg: string; text: string; dot: string }> = {
  disponible: { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  reservado:  { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  vendido:    { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  alquilado:  { bg: 'bg-teal-100 dark:bg-teal-900/40', text: 'text-teal-700 dark:text-teal-300', dot: 'bg-teal-500' },
};

type CatalogSort = 'recientes' | 'precio_desc' | 'precio_asc' | 'm2_desc';

const TIPOS: TipoInmueble[] = ['piso', 'casa', 'chalet', 'local', 'oficina', 'terreno', 'nave'];
const OPERACIONES: Operacion[] = ['venta', 'alquiler'];
const ESTADOS: EstadoProp[] = ['disponible', 'reservado', 'vendido', 'alquilado'];
const CERTS: CertEnergetico[] = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'en_tramite', 'exento'];
const SI_NO: SiNo[] = ['', 'si', 'no'];
const SI_NO_PARCIAL: SiNo[] = ['', 'si', 'no', 'parcial'];
const LLAVES: { value: LlavesUbicacion; label: string }[] = [
  { value: '', label: 'Sin indicar' },
  { value: 'oficina', label: 'En oficina' },
  { value: 'propietario', label: 'Con el propietario' },
  { value: 'caja_seguridad', label: 'Caja de seguridad' },
  { value: 'portero', label: 'Portero / conserje' },
  { value: 'otro', label: 'Otro' },
];

const EMPTY: PropertyForm = {
  referencia: '', tipo: 'piso', direccion: '', ciudad: '', zona: '', codigoPostal: '',
  m2: 0, habitaciones: 0, banos: 0, planta: '', anioConstruccion: 0,
  certificadoEnergetico: '', amueblado: '', plazaGaraje: '', ascensor: '', terraza: '',
  precio: 0, operacion: 'venta', estado: 'disponible',
  fechaCaptacion: '', exclusividad: '', llavesUbicacion: '',
  propietarioNombre: '', propietarioTelefono: '', comisionPct: 0, descripcion: '',
  agente: '', agenteUserId: '', fotos: [],
};

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formFromProperty(p: Property): PropertyForm {
  return {
    referencia: p.referencia,
    tipo: p.tipo,
    direccion: p.direccion,
    ciudad: p.ciudad || '',
    zona: p.zona || '',
    codigoPostal: p.codigoPostal || '',
    m2: p.m2,
    habitaciones: p.habitaciones,
    banos: Number(p.banos) || 0,
    planta: p.planta || '',
    anioConstruccion: Number(p.anioConstruccion) || 0,
    certificadoEnergetico: (p.certificadoEnergetico as CertEnergetico) || '',
    amueblado: (p.amueblado as SiNo) || '',
    plazaGaraje: (p.plazaGaraje as SiNo) || '',
    ascensor: (p.ascensor as SiNo) || '',
    terraza: (p.terraza as SiNo) || '',
    precio: p.precio,
    operacion: p.operacion,
    estado: p.estado,
    fechaCaptacion: String(p.fechaCaptacion || '').slice(0, 10),
    exclusividad: (p.exclusividad as SiNo) || '',
    llavesUbicacion: (p.llavesUbicacion as LlavesUbicacion) || '',
    propietarioNombre: p.propietarioNombre || '',
    propietarioTelefono: p.propietarioTelefono || '',
    comisionPct: Number(p.comisionPct) || 0,
    descripcion: p.descripcion || '',
    agente: p.agente || '',
    agenteUserId: p.agenteUserId || '',
    fotos: normalizeFotos(p.fotos),
  };
}

/** Línea de lugar: ciudad · zona · CP (omite vacíos). */
function formatLugarLine(p: Pick<Property, 'ciudad' | 'zona' | 'codigoPostal'>): string {
  const parts = [
    String(p.ciudad || '').trim(),
    String(p.zona || '').trim(),
    String(p.codigoPostal || '').trim() ? `CP ${String(p.codigoPostal).trim()}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function agentInitials(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '·';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] || '' : '';
  return `${first}${last}`.toUpperCase();
}

/** Días desde una fecha ISO (yyyy-mm-dd); null si no hay fecha válida. */
function daysSinceIso(iso: string | undefined): number | null {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = new Date(`${s}T00:00:00`).getTime();
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((Date.now() - t) / 86400000);
  return days >= 0 ? days : null;
}

function labelSiNo(v: string | undefined): string {
  const s = String(v || '').trim().toLowerCase();
  if (s === 'si') return 'Sí';
  if (s === 'no') return 'No';
  if (s === 'parcial') return 'Parcial';
  return '—';
}

function labelCert(v: string | undefined): string {
  const s = String(v || '').trim();
  if (!s) return '—';
  if (s === 'en_tramite') return 'En trámite';
  if (s === 'exento') return 'Exento';
  return s;
}

function labelLlaves(v: string | undefined): string {
  const found = LLAVES.find((x) => x.value === v);
  return found?.label || (v ? String(v) : '—');
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === '' || value === '—') {
    return (
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
        <p className="text-sm text-stone-400 italic">Sin indicar</p>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      <p className="text-sm font-medium text-stone-800 dark:text-stone-100 break-words">{value}</p>
    </div>
  );
}

type LinkedContract = VerticalEntity & {
  referencia?: string;
  propiedadId?: string;
  propiedad?: string;
  estado?: string;
  tipo?: string;
};

function RealEstatePropertiesPage() {
  const { userId, listOptions, ready } = useRealEstateScope();
  const { currentBusiness } = useBusiness();
  const { listUsers } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const api = useMemo(() => createVerticalApi<Property>('realestate', 'properties'), []);
  const contractsApi = useMemo(() => createVerticalApi<LinkedContract>('realestate', 'contracts'), []);
  const [accountDirectory, setAccountDirectory] = useState<
    { user_id?: string; fullName?: string; name?: string; email?: string }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    void listUsers()
      .then((users) => {
        if (!cancelled && Array.isArray(users)) setAccountDirectory(users as typeof accountDirectory);
      })
      .catch(() => {
        if (!cancelled) setAccountDirectory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [listUsers]);

  const agents = useMemo(
    () => listTeamAgentOptions(currentBusiness?.members, accountDirectory),
    [currentBusiness?.members, accountDirectory],
  );

  const [data, setData] = useState<Property[]>([]);
  const [contracts, setContracts] = useState<LinkedContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterOp, setFilterOp] = useState<Operacion | ''>('');
  const [filterEstado, setFilterEstado] = useState<EstadoProp | ''>('');
  const [filterTipo, setFilterTipo] = useState<TipoInmueble | ''>('');
  const [sortBy, setSortBy] = useState<CatalogSort>('recientes');
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try {
      return window.localStorage.getItem('vertial.re.catalogView') === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem('vertial.re.catalogView', view);
    } catch {
      /* almacenamiento no disponible */
    }
  }, [view]);
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<Property | null>(null);
  const [detailFotoIdx, setDetailFotoIdx] = useState(0);
  const [editing, setEditing] = useState<Property | null>(null);
  const [form, setForm] = useState<PropertyForm>(EMPTY);
  const [showImportModal, setShowImportModal] = useState(false);
  /** Drafts es-ES (miles con .) para los inputs numéricos del modal. */
  const [precioDraft, setPrecioDraft] = useState('');
  const [m2Draft, setM2Draft] = useState('');
  const [habDraft, setHabDraft] = useState('');
  const [photosBusy, setPhotosBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'address', label: 'Dirección', example: '' },
    { key: 'ciudad', label: 'Ciudad', example: '' },
    { key: 'zona', label: 'Zona', example: '' },
    { key: 'codigoPostal', label: 'C.P.', example: '' },
    { key: 'type', label: 'Tipo', example: '' },
    { key: 'area', label: 'Superficie', example: '' },
    { key: 'rooms', label: 'Habitaciones', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'status', label: 'Estado', example: '' },
    { key: 'agent', label: 'Agente', example: '' },
  ];

  const persistEntries = async (entries: Record<string, unknown>[]) => {
    if (!userId || !ready) {
      toast.error('Sesión no válida');
      return;
    }
    const created = await bulkCreateVerticalEntries(userId, api, entries, (e) => {
    const direccion = entryStr(e, 'direccion', 'address');
    if (!direccion) return null;
    const agentName = entryStr(e, 'agente', 'agent') || '';
    const agent = resolveTeamAgent(agents, { name: agentName });
    return {
      referencia: entryStr(e, 'referencia', 'reference', 'sku') || newPropertyRef(),
      tipo: entryStr(e, 'tipo', 'type') || 'piso',
      direccion,
      ciudad: entryStr(e, 'ciudad', 'city') || '',
      zona: entryStr(e, 'zona', 'zone', 'barrio') || '',
      codigoPostal: entryStr(e, 'codigoPostal', 'cp', 'postal') || '',
      m2: entryNum(e, 'm2', 'area'),
      habitaciones: entryNum(e, 'habitaciones', 'rooms'),
      precio: entryNum(e, 'precio', 'price'),
      operacion: entryStr(e, 'operacion') || 'venta',
      estado: entryStr(e, 'estado', 'status') || 'disponible',
      agente: agent?.name || agentName,
      ...(agent?.userId ? { agenteUserId: agent.userId } : {}),
      fotos: [],
    };
    }, listOptions);
    if (created > 0) {
      await loadData();
      toast.success(`${created} inmueble creado(s)`);
    } else {
      toast.error('No se pudo crear ningún registro');
    }
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => persistEntries(entries);

  useModalClose(modalOpen, () => setModalOpen(false));
  useModalClose(Boolean(detail), () => setDetail(null));

  const detailId = detail?._id;
  useEffect(() => {
    if (!detailId) return;
    const fresh = data.find((p) => p._id === detailId);
    if (fresh) setDetail(fresh);
  }, [data, detailId]);

  const loadData = useCallback(async () => {
    if (!userId || !ready) {
      setData([]);
      setContracts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [list, contractList] = await Promise.all([
        api.list(userId, listOptions),
        contractsApi.list(userId, listOptions).catch(() => [] as LinkedContract[]),
      ]);
      setData(list);
      setContracts(contractList);
    } catch (e) {
      setData([]);
      setContracts([]);
      toast.error(e instanceof Error ? e.message : 'No se pudieron cargar las propiedades');
    } finally {
      setLoading(false);
    }
  }, [userId, ready, listOptions, api, contractsApi]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const contractsByPropId = useMemo(() => {
    const map = new Map<string, LinkedContract[]>();
    for (const c of contracts) {
      const pid = String(c.propiedadId || '').trim();
      if (!pid) continue;
      const arr = map.get(pid) || [];
      arr.push(c);
      map.set(pid, arr);
    }
    return map;
  }, [contracts]);

  const filtered = useMemo(() => data.filter(p => {
    const q = search.toLowerCase();
    const ms = !q
      || String(p.referencia || '').toLowerCase().includes(q)
      || String(p.direccion || '').toLowerCase().includes(q)
      || String(p.ciudad || '').toLowerCase().includes(q)
      || String(p.zona || '').toLowerCase().includes(q)
      || String(p.codigoPostal || '').toLowerCase().includes(q)
      || String(p.agente || '').toLowerCase().includes(q);
    const mo = !filterOp || p.operacion === filterOp;
    const me = !filterEstado || p.estado === filterEstado;
    const mt = !filterTipo || p.tipo === filterTipo;
    return ms && mo && me && mt;
  }), [data, search, filterOp, filterEstado, filterTipo]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    switch (sortBy) {
      case 'precio_desc': arr.sort((a, b) => (Number(b.precio) || 0) - (Number(a.precio) || 0)); break;
      case 'precio_asc': arr.sort((a, b) => (Number(a.precio) || 0) - (Number(b.precio) || 0)); break;
      case 'm2_desc': arr.sort((a, b) => (Number(b.m2) || 0) - (Number(a.m2) || 0)); break;
      default: arr.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    }
    return arr;
  }, [filtered, sortBy]);

  const estadoCounts = useMemo(() => {
    const counts: Record<EstadoProp, number> = { disponible: 0, reservado: 0, vendido: 0, alquilado: 0 };
    for (const p of data) {
      if (counts[p.estado] !== undefined) counts[p.estado] += 1;
    }
    return counts;
  }, [data]);

  const hasActiveFilters = Boolean(search || filterOp || filterEstado || filterTipo);
  const clearFilters = () => {
    setSearch('');
    setFilterOp('');
    setFilterEstado('');
    setFilterTipo('');
  };

  const enVenta = useMemo(() => data.filter(p => p.operacion === 'venta' && p.estado === 'disponible').length, [data]);
  const enAlquiler = useMemo(() => data.filter(p => p.operacion === 'alquiler' && p.estado === 'disponible').length, [data]);
  const valorCartera = useMemo(() => data.filter(p => p.operacion === 'venta').reduce((s, p) => s + p.precio, 0), [data]);

  const openCreate = () => {
    setDetail(null);
    setEditing(null);
    setForm({
      ...EMPTY,
      referencia: newPropertyRef(),
      fechaCaptacion: todayIsoDate(),
      fotos: [],
    });
    setPrecioDraft('');
    setM2Draft('');
    setHabDraft('');
    setModalOpen(true);
  };
  const openDetail = (p: Property) => {
    setDetail(p);
    setDetailFotoIdx(0);
  };
  const openEdit = (p: Property) => {
    setDetail(null);
    setEditing(p);
    setForm(formFromProperty(p));
    setPrecioDraft(moneyNumberToDisplay(p.precio, true));
    setM2Draft(moneyNumberToDisplay(p.m2, false));
    setHabDraft(moneyNumberToDisplay(p.habitaciones, false));
    setModalOpen(true);
  };

  // Deep-link: /saas/realestate-properties?propiedadId=… → ficha grande
  useEffect(() => {
    if (loading || !data.length) return;
    const pid = String(searchParams.get('propiedadId') || '').trim();
    if (!pid) return;
    const prop = data.find((p) => p._id === pid);
    if (!prop) return;
    openDetail(prop);
    const next = new URLSearchParams(searchParams);
    next.delete('propiedadId');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep-link once per propiedadId
  }, [loading, data, searchParams, setSearchParams]);

  const triggerPhotoPicker = useCallback(() => {
    const input = photoInputRef.current;
    if (!input) {
      toast.error('No se pudo abrir el selector de fotos');
      return;
    }
    input.value = '';
    input.click();
  }, []);

  const handlePhotoUpload = async (files: FileList | File[] | Blob[] | null) => {
    if (!files?.length) {
      toast.error('No se recibió ningún archivo');
      return;
    }
    setPhotosBusy(true);
    try {
      const { urls, errors } = await readImageFilesAsDataUrls(files);
      if (urls.length === 0) {
        toast.error(errors[0] || 'No se pudo leer la imagen. Prueba JPG/PNG (no HEIC).');
        if (errors.length > 1) toast.message(errors.slice(0, 3).join(' · '));
        return;
      }
      let added = 0;
      let capped = false;
      setForm((f) => {
        const room = MAX_PROPERTY_PHOTOS - (f.fotos?.length || 0);
        if (room <= 0) {
          capped = true;
          return f;
        }
        const toAdd = urls.slice(0, room);
        added = toAdd.length;
        if (urls.length > room) capped = true;
        return { ...f, fotos: [...(f.fotos || []), ...toAdd] };
      });
      if (capped && added === 0) {
        toast.info(`Máximo ${MAX_PROPERTY_PHOTOS} fotos por inmueble`);
      } else if (added > 0) {
        toast.success(added === 1 ? 'Foto añadida — pulsa Guardar' : `${added} fotos añadidas — pulsa Guardar`);
      }
      if (errors.length > 0) {
        toast.error(`${errors.length} no se pudieron leer — ${errors[0]}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron leer las fotos');
    } finally {
      setPhotosBusy(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  // Pegar foto (Ctrl+V) con el modal abierto — WhatsApp / capturas.
  useEffect(() => {
    if (!modalOpen) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items?.length) return;
      const blobs: Blob[] = [];
      for (const item of Array.from(items)) {
        if (String(item.type || '').startsWith('image/')) {
          const f = item.getAsFile();
          if (f) blobs.push(f);
        }
      }
      if (!blobs.length) return;
      e.preventDefault();
      void handlePhotoUpload(blobs);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [modalOpen]);

  const removePhotoAt = (index: number) => {
    setForm((f) => ({
      ...f,
      fotos: (f.fotos || []).filter((_, i) => i !== index),
    }));
  };

  const onPrecioDraft = (raw: string) => {
    const next = formatMoneyAsYouType(raw, true);
    setPrecioDraft(next);
    const n = parseSpanishMoneyInput(next);
    setForm((f) => ({ ...f, precio: Number.isFinite(n) ? n : 0 }));
  };
  const onM2Draft = (raw: string) => {
    const next = formatMoneyAsYouType(raw, false);
    setM2Draft(next);
    const n = parseSpanishMoneyInput(next);
    setForm((f) => ({ ...f, m2: Number.isFinite(n) ? n : 0 }));
  };
  const onHabDraft = (raw: string) => {
    const next = formatMoneyAsYouType(raw, false);
    setHabDraft(next);
    const n = parseSpanishMoneyInput(next);
    setForm((f) => ({ ...f, habitaciones: Number.isFinite(n) ? n : 0 }));
  };

  const handleSave = async () => {
    if (!userId || !ready) return;
    const direccion = String(form.direccion || '').trim();
    if (!direccion) {
      toast.error('La dirección es obligatoria');
      return;
    }
    const fotos = normalizeFotos(form.fotos);
    const pendingDataUrls = fotos.filter((f) => /^data:image\//i.test(f));
    const existingFotoRefs = fotos.filter((f) => !/^data:image\//i.test(f));
    const agent = resolveTeamAgent(agents, { userId: form.agenteUserId });
    // Metadatos SIN data URLs (las fotos nuevas van 1 a 1 al endpoint /foto).
    const payload = {
      ...form,
      direccion,
      referencia: String(form.referencia || '').trim() || newPropertyRef(),
      fotos: existingFotoRefs,
      m2: Number(form.m2) || 0,
      habitaciones: Number(form.habitaciones) || 0,
      banos: Number(form.banos) || 0,
      anioConstruccion: Number(form.anioConstruccion) || 0,
      comisionPct: Number(form.comisionPct) || 0,
      precio: Number(form.precio) || 0,
      fechaCaptacion: String(form.fechaCaptacion || '').slice(0, 10) || undefined,
      agenteUserId: form.agenteUserId || undefined,
      agente: agent?.name || form.agente || undefined,
    };
    try {
      setPhotosBusy(true);
      let saved: Property;
      if (editing) {
        saved = await api.update(userId, editing._id, payload, listOptions);
      } else {
        saved = await api.create(userId, payload, listOptions);
      }
      if (!saved?._id) {
        throw new Error('El servidor no devolvió el inmueble guardado');
      }

      let uploaded = 0;
      const failedMsgs: string[] = [];
      const stillPending: string[] = [];
      for (let i = 0; i < pendingDataUrls.length; i += 1) {
        try {
          saved = await api.uploadFoto(userId, saved._id, pendingDataUrls[i]);
          uploaded += 1;
        } catch (photoErr) {
          const why = photoErr instanceof Error ? photoErr.message : 'error';
          console.error('[RealEstateProperties] uploadFoto failed', photoErr);
          failedMsgs.push(`Foto ${i + 1}: ${why}`);
          stillPending.push(pendingDataUrls[i]);
        }
      }

      await loadData();
      if (failedMsgs.length) {
        const serverFotos = normalizeFotos(saved.fotos);
        setEditing(saved);
        setForm((f) => ({
          ...f,
          ...saved,
          fotos: [...serverFotos, ...stillPending],
        }));
        toast.error(
          uploaded
            ? `Inmueble guardado, pero ${failedMsgs.length} foto(s) fallaron: ${failedMsgs[0]}`
            : `Inmueble guardado sin fotos: ${failedMsgs[0]}`,
        );
        return;
      }

      setModalOpen(false);
      setDetail(saved);
      setDetailFotoIdx(0);
      toast.success(
        pendingDataUrls.length
          ? (editing ? `Inmueble actualizado · ${uploaded} foto(s)` : `Inmueble creado · ${uploaded} foto(s)`)
          : (editing ? 'Inmueble actualizado' : 'Inmueble creado'),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar';
      console.error('[RealEstateProperties] save failed', e);
      if (/too large|document_too_large|request entity|413|payload/i.test(msg)) {
        toast.error('Las fotos pesan demasiado. Quita alguna o comprime (WhatsApp a veces manda archivos enormes).');
        return;
      }
      toast.error(msg || 'No se pudo guardar el inmueble');
    } finally {
      setPhotosBusy(false);
    }
  };

  const handleRemove = async (docId: string) => {
    if (!userId) return;
    try {
      await api.remove(userId, docId);
      await loadData();
    } catch {
      /* error shown by fetch layer */
    }
  };

  const stats = [
    { label: 'Inmuebles en cartera', value: formatNumberEs(data.length, { maxFraction: 0 }), icon: <Building2 className="w-5 h-5" />, chip: 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300' },
    { label: 'Disponibles en venta', value: formatNumberEs(enVenta, { maxFraction: 0 }), icon: <DollarSign className="w-5 h-5" />, chip: 'bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300' },
    { label: 'Disponibles en alquiler', value: formatNumberEs(enAlquiler, { maxFraction: 0 }), icon: <KeyRound className="w-5 h-5" />, chip: 'bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-300' },
    { label: 'Valor en venta', value: formatMoneyEs(valorCartera), icon: <TrendingUp className="w-5 h-5" />, chip: 'bg-gradient-to-br from-emerald-500 via-teal-500 to-blue-600 text-white' },
  ];

  const chipBase = 'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors';
  const chipOn = 'border-transparent bg-[var(--v-blue,#2563eb)] text-white';
  const chipOff = 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-600';

  return (
    <Layout title="Propiedades">
      <div className="space-y-5">
        <RealEstateNav active="properties" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map(s => (
            <div
              key={s.label}
              className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 flex items-center gap-3 min-h-[4.5rem]"
            >
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.chip}`}>{s.icon}</div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-stone-500 dark:text-stone-400 truncate">{s.label}</p>
                <p className="text-lg font-bold tabular-nums leading-tight text-stone-900 dark:text-stone-50 truncate">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 space-y-3">
          <div className="flex flex-col lg:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por referencia, dirección, zona o comercial…"
                disabled={loading}
                className="w-full h-10 pl-10 pr-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-stone-100"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterTipo}
                onChange={e => setFilterTipo(e.target.value as TipoInmueble | '')}
                disabled={loading}
                className="h-10 px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm dark:text-stone-100 capitalize"
              >
                <option value="">Todos los tipos</option>
                {TIPOS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as CatalogSort)}
                disabled={loading}
                className="h-10 px-3 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-sm dark:text-stone-100"
              >
                <option value="recientes">Más recientes</option>
                <option value="precio_desc">Precio: mayor a menor</option>
                <option value="precio_asc">Precio: menor a mayor</option>
                <option value="m2_desc">Más superficie</option>
              </select>
              <div className="flex h-10 items-center gap-0.5 rounded-xl border border-stone-200 dark:border-stone-700 p-0.5">
                <button
                  type="button"
                  onClick={() => setView('grid')}
                  className={`flex h-8 w-9 items-center justify-center rounded-lg transition-colors ${
                    view === 'grid'
                      ? 'bg-[var(--v-blue,#2563eb)] text-white'
                      : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                  aria-label="Vista cuadrícula"
                  title="Cuadrícula"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className={`flex h-8 w-9 items-center justify-center rounded-lg transition-colors ${
                    view === 'list'
                      ? 'bg-[var(--v-blue,#2563eb)] text-white'
                      : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                  aria-label="Vista lista"
                  title="Lista"
                >
                  <ListIcon className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                disabled={loading}
                className={`${VERTIAL_BTN_SECONDARY} !min-h-10 !h-10 !px-3.5 !py-0`}
              >
                <Upload className="h-4 w-4" />
                Importar
              </button>
              <button
                type="button"
                onClick={openCreate}
                disabled={loading}
                className={`${VERTIAL_BTN_PRIMARY} !min-h-10 !h-10 !px-3.5 !py-0`}
              >
                <Plus className="h-4 w-4" />
                Nuevo inmueble
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {([['', 'Todo'], ['venta', 'Venta'], ['alquiler', 'Alquiler']] as [Operacion | '', string][]).map(([op, label]) => (
              <button
                key={op || 'todo'}
                type="button"
                onClick={() => setFilterOp(op)}
                className={`${chipBase} ${filterOp === op ? chipOn : chipOff}`}
              >
                {label}
              </button>
            ))}
            <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" aria-hidden />
            {ESTADOS.map((es) => {
              const cfg = STATUS_CFG[es];
              const active = filterEstado === es;
              return (
                <button
                  key={es}
                  type="button"
                  onClick={() => setFilterEstado(active ? '' : es)}
                  className={`${chipBase} capitalize ${active ? chipOn : chipOff}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : cfg.dot}`} aria-hidden />
                  {es}
                  <span className={`tabular-nums font-bold ${active ? 'text-white/80' : 'text-stone-400'}`}>
                    {formatNumberEs(estadoCounts[es], { maxFraction: 0 })}
                  </span>
                </button>
              );
            })}
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[var(--v-blue,#2563eb)] hover:underline"
              >
                <X className="w-3.5 h-3.5" />
                Quitar filtros
              </button>
            ) : null}
          </div>
        </div>

        {!loading && ready && data.length > 0 ? (
          <p className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
            {formatNumberEs(sorted.length, { maxFraction: 0 })} inmueble{sorted.length === 1 ? '' : 's'}
            {hasActiveFilters ? ` de ${formatNumberEs(data.length, { maxFraction: 0 })} en cartera` : ' en el catálogo'}
          </p>
        ) : null}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={`skeleton-${i}`}
                className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden"
              >
                <div className="aspect-[4/3] bg-stone-100 dark:bg-stone-800 animate-pulse" />
                <div className="p-3.5 space-y-2.5">
                  <div className="h-5 w-28 rounded-lg bg-stone-100 dark:bg-stone-800 animate-pulse" />
                  <div className="h-3.5 w-full rounded-lg bg-stone-100 dark:bg-stone-800 animate-pulse" />
                  <div className="h-3.5 w-2/3 rounded-lg bg-stone-100 dark:bg-stone-800 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : !ready ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-6 py-10 text-center text-amber-900 dark:text-amber-200 text-sm">
            Selecciona una empresa inmobiliaria activa para ver la cartera.
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-6 py-16 text-center space-y-4">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-blue-600 text-white">
              <Building2 className="h-7 w-7" />
            </span>
            <div className="space-y-1">
              <p className="text-base font-bold text-stone-800 dark:text-stone-100">
                {data.length === 0 ? 'Tu catálogo está vacío' : 'Ningún inmueble coincide'}
              </p>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                {data.length === 0
                  ? 'Sube el primer inmueble con fotos y empieza a enseñar cartera.'
                  : 'Prueba a quitar filtros o cambiar la búsqueda.'}
              </p>
            </div>
            {data.length === 0 ? (
              <button
                type="button"
                onClick={openCreate}
                className={`${VERTIAL_BTN_PRIMARY} !min-h-10 !px-4 mx-auto`}
              >
                <Plus className="h-4 w-4" />
                Nuevo inmueble
              </button>
            ) : (
              <button
                type="button"
                onClick={clearFilters}
                className={`${VERTIAL_BTN_SECONDARY} !min-h-10 !px-4 mx-auto`}
              >
                <X className="h-4 w-4" />
                Quitar filtros
              </button>
            )}
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {sorted.map((p) => {
              const fotos = normalizeFotos(p.fotos);
              const cover = fotos[0];
              const st = STATUS_CFG[p.estado] || STATUS_CFG.disponible;
              const lugar = formatLugarLine(p);
              const nContracts = (contractsByPropId.get(p._id) || []).length;
              const dias = daysSinceIso(p.fechaCaptacion || p.createdAt);
              const ppm2 = p.operacion === 'venta' && Number(p.precio) > 0 && Number(p.m2) > 0
                ? Number(p.precio) / Number(p.m2)
                : 0;
              const esExclusiva = String(p.exclusividad || '').toLowerCase() === 'si';
              return (
                <article
                  key={p._id}
                  className="group flex flex-col rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden shadow-sm hover:shadow-lg hover:border-stone-300 dark:hover:border-stone-600 transition-all"
                >
                  <button
                    type="button"
                    onClick={() => openDetail(p)}
                    className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100 dark:bg-stone-800 text-left"
                  >
                    {cover ? (
                      <AuthImage
                        src={cover}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-stone-400">
                        <Camera className="w-7 h-7" />
                        <span className="text-[11px] font-semibold">Sin fotos aún</span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1.5 p-2.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-lg bg-white/95 dark:bg-stone-900/90 px-2 py-1 text-[10px] font-bold capitalize ${st.text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} aria-hidden />
                        {p.estado}
                      </span>
                      <span className={`rounded-lg px-2 py-1 text-[10px] font-bold capitalize text-white ${
                        p.operacion === 'venta' ? 'bg-[var(--v-blue,#2563eb)]' : 'bg-teal-600'
                      }`}>
                        {p.operacion}
                      </span>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-1.5 p-2.5">
                      {esExclusiva ? (
                        <span className="rounded-lg bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 px-2 py-1 text-[10px] font-bold text-white">
                          Exclusiva
                        </span>
                      ) : <span aria-hidden />}
                      {fotos.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-black/60 px-1.5 py-1 text-[10px] font-semibold text-white tabular-nums">
                          <Camera className="w-3 h-3" />
                          {formatNumberEs(fotos.length, { maxFraction: 0 })}
                        </span>
                      ) : null}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => openDetail(p)}
                    className="flex flex-1 flex-col gap-2 px-3.5 pt-3 pb-2.5 text-left"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-lg font-extrabold tabular-nums leading-tight text-stone-900 dark:text-stone-50">
                        {formatMoneyEs(p.precio)}
                        {p.operacion === 'alquiler' ? (
                          <span className="text-xs font-semibold text-stone-500">/mes</span>
                        ) : null}
                      </p>
                      {ppm2 > 0 ? (
                        <p className="shrink-0 text-[11px] font-medium text-stone-400 tabular-nums">
                          {formatMoneyEs(ppm2)}/m²
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-stone-800 dark:text-stone-100 line-clamp-1">
                        {p.direccion || 'Sin dirección'}
                      </p>
                      <p className="inline-flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
                        <MapPin className="w-3 h-3 shrink-0 text-stone-400" />
                        <span className="line-clamp-1">{lugar || 'Sin ciudad / zona'}</span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600 dark:text-stone-300 tabular-nums">
                      <span className="inline-flex items-center gap-1 capitalize">
                        <Home className="w-3.5 h-3.5 text-stone-400" />
                        {p.tipo}
                      </span>
                      {p.m2 ? (
                        <span className="inline-flex items-center gap-1">
                          <Ruler className="w-3.5 h-3.5 text-stone-400" />
                          {formatNumberEs(p.m2, { maxFraction: 0 })} m²
                        </span>
                      ) : null}
                      {p.habitaciones ? (
                        <span className="inline-flex items-center gap-1">
                          <BedDouble className="w-3.5 h-3.5 text-stone-400" />
                          {formatNumberEs(p.habitaciones, { maxFraction: 0 })}
                        </span>
                      ) : null}
                      {p.banos ? (
                        <span className="inline-flex items-center gap-1">
                          <Bath className="w-3.5 h-3.5 text-stone-400" />
                          {formatNumberEs(p.banos, { maxFraction: 0 })}
                        </span>
                      ) : null}
                    </div>

                    <p className="text-[10px] text-stone-400 truncate tabular-nums">
                      {p.referencia || 'Sin ref.'}
                      {nContracts > 0
                        ? ` · ${formatNumberEs(nContracts, { maxFraction: 0 })} contrato${nContracts === 1 ? '' : 's'}`
                        : ''}
                    </p>
                  </button>

                  <div className="mt-auto flex items-center gap-1.5 border-t border-stone-100 dark:border-stone-800 px-3 py-1.5">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400">
                      {p.agente ? (
                        <>
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 via-teal-500 to-blue-600 text-[8px] font-bold text-white">
                            {agentInitials(p.agente)}
                          </span>
                          <span className="truncate tabular-nums">
                            {p.agente}
                            {dias === null ? '' : dias === 0 ? ' · hoy' : ` · ${formatNumberEs(dias, { maxFraction: 0 })} d`}
                          </span>
                        </>
                      ) : (
                        <span className="truncate italic text-stone-400">Sin comercial</span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                        aria-label="Editar"
                        title="Editar"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/saas/realestate-contracts?propiedadId=${encodeURIComponent(p._id)}&nuevo=1`)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--v-blue,#2563eb)] hover:bg-blue-50 dark:hover:bg-blue-950/40"
                        aria-label="Crear contrato"
                        title="Crear contrato"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`¿Eliminar «${p.referencia || p.direccion}» del catálogo?`)) {
                            void handleRemove(p._id);
                          }
                        }}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        aria-label="Eliminar"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((p) => {
              const fotos = normalizeFotos(p.fotos);
              const cover = fotos[0];
              const st = STATUS_CFG[p.estado] || STATUS_CFG.disponible;
              const lugar = formatLugarLine(p);
              const ppm2 = p.operacion === 'venta' && Number(p.precio) > 0 && Number(p.m2) > 0
                ? Number(p.precio) / Number(p.m2)
                : 0;
              const esExclusiva = String(p.exclusividad || '').toLowerCase() === 'si';
              return (
                <article
                  key={p._id}
                  onClick={() => openDetail(p)}
                  className="group flex cursor-pointer items-stretch gap-3 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-2.5 shadow-sm hover:shadow-md hover:border-stone-300 dark:hover:border-stone-600 transition-all"
                >
                  <div className="relative h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-800">
                    {cover ? (
                      <AuthImage src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-stone-400">
                        <Camera className="w-5 h-5" />
                      </div>
                    )}
                    <span className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold capitalize text-white ${
                      p.operacion === 'venta' ? 'bg-[var(--v-blue,#2563eb)]' : 'bg-teal-600'
                    }`}>
                      {p.operacion}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-stone-800 dark:text-stone-100 line-clamp-1">
                        {p.direccion || 'Sin dirección'}
                      </p>
                      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold capitalize ${st.bg} ${st.text}`}>
                        {p.estado}
                      </span>
                      {esExclusiva ? (
                        <span className="rounded-md bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          Exclusiva
                        </span>
                      ) : null}
                    </div>
                    <p className="inline-flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
                      <MapPin className="w-3 h-3 shrink-0 text-stone-400" />
                      <span className="line-clamp-1">{lugar || 'Sin ciudad / zona'}</span>
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400 tabular-nums line-clamp-1">
                      <span className="capitalize">{p.tipo}</span>
                      {p.m2 ? ` · ${formatNumberEs(p.m2, { maxFraction: 0 })} m²` : ''}
                      {p.habitaciones ? ` · ${formatNumberEs(p.habitaciones, { maxFraction: 0 })} hab.` : ''}
                      {p.banos ? ` · ${formatNumberEs(p.banos, { maxFraction: 0 })} baños` : ''}
                      {p.agente ? ` · ${p.agente}` : ''}
                    </p>
                  </div>
                  <div
                    className="flex shrink-0 flex-col items-end justify-center gap-1 pr-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-base font-extrabold tabular-nums text-stone-900 dark:text-stone-50">
                      {formatMoneyEs(p.precio)}
                      {p.operacion === 'alquiler' ? (
                        <span className="text-[11px] font-semibold text-stone-500">/mes</span>
                      ) : null}
                    </p>
                    {ppm2 > 0 ? (
                      <p className="text-[10px] text-stone-400 tabular-nums">{formatMoneyEs(ppm2)}/m²</p>
                    ) : null}
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                        aria-label="Editar"
                        title="Editar"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/saas/realestate-contracts?propiedadId=${encodeURIComponent(p._id)}&nuevo=1`)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--v-blue,#2563eb)] hover:bg-blue-50 dark:hover:bg-blue-950/40"
                        aria-label="Crear contrato"
                        title="Crear contrato"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`¿Eliminar «${p.referencia || p.direccion}» del catálogo?`)) {
                            void handleRemove(p._id);
                          }
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        aria-label="Eliminar"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {detail && (() => {
        const fotos = normalizeFotos(detail.fotos);
        const safeIdx = fotos.length ? Math.min(detailFotoIdx, fotos.length - 1) : 0;
        const current = fotos[safeIdx];
        const lugar = formatLugarLine(detail);
        const linked = contractsByPropId.get(detail._id) || [];
        const st = STATUS_CFG[detail.estado] || STATUS_CFG.disponible;
        const captadoLabel = detail.fechaCaptacion
          ? formatDateEs(detail.fechaCaptacion)
          : (detail.createdAt ? formatDateEs(detail.createdAt) : '');
        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 p-0 sm:p-4"
            onClick={() => setDetail(null)}
          >
            <div
              className="bg-white dark:bg-stone-900 rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-5xl max-h-[94vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-stone-200 dark:border-stone-700">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-stone-400 truncate">{detail.referencia || 'Sin ref.'}</p>
                  <h3 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-50 truncate">
                    Ficha del inmueble
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500"
                  aria-label="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-y-auto flex-1">
                <div className="bg-stone-100 dark:bg-stone-950/50">
                  <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] bg-stone-200 dark:bg-stone-800">
                    {current ? (
                      <AuthImage src={current} alt="" className="w-full h-full object-cover" loading="eager" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-stone-400">
                        <Camera className="w-8 h-8" />
                        <p className="text-sm font-medium">Sin fotos</p>
                        <p className="text-xs text-stone-400">Pulsa Editar para subirlas</p>
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold capitalize ${st.bg} ${st.text}`}>
                        {detail.estado}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold capitalize bg-black/55 text-white">
                        {detail.operacion}
                      </span>
                    </div>
                    {fotos.length > 1 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setDetailFotoIdx((i) => (i - 1 + fotos.length) % fotos.length)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                          aria-label="Foto anterior"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailFotoIdx((i) => (i + 1) % fotos.length)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                          aria-label="Foto siguiente"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                        <span className="absolute bottom-3 right-3 bg-black/60 text-white text-xs font-semibold px-2 py-0.5 rounded-md tabular-nums">
                          {formatNumberEs(safeIdx + 1, { maxFraction: 0 })} / {formatNumberEs(fotos.length, { maxFraction: 0 })}
                        </span>
                      </>
                    ) : null}
                  </div>
                  {fotos.length > 1 ? (
                    <div className="flex gap-1.5 overflow-x-auto px-3 py-2.5">
                      {fotos.map((src, i) => (
                        <button
                          key={`detail-thumb-${i}`}
                          type="button"
                          onClick={() => setDetailFotoIdx(i)}
                          className={`relative shrink-0 w-16 h-14 rounded-lg overflow-hidden border-2 ${
                            i === safeIdx
                              ? 'border-[var(--v-blue,#2563eb)]'
                              : 'border-transparent opacity-80 hover:opacity-100'
                          }`}
                        >
                          <AuthImage src={src} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="p-4 sm:p-6 space-y-6">
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-stone-900 dark:text-stone-50">
                      {formatMoneyEs(detail.precio)}
                      {detail.operacion === 'alquiler' ? (
                        <span className="text-sm font-semibold text-stone-500"> /mes</span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-sm text-stone-600 dark:text-stone-300 flex items-start gap-1.5">
                      <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-stone-400" />
                      <span>
                        {detail.direccion || 'Sin dirección'}
                        {lugar ? <span className="text-stone-400"> · {lugar}</span> : null}
                      </span>
                    </p>
                  </div>

                  <section className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-stone-400">Inmueble</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <DetailRow label="Tipo" value={detail.tipo ? String(detail.tipo) : ''} />
                      <DetailRow
                        label="Superficie"
                        value={detail.m2 ? `${formatNumberEs(detail.m2, { maxFraction: 0 })} m²` : ''}
                      />
                      <DetailRow
                        label="Habitaciones"
                        value={detail.habitaciones ? formatNumberEs(detail.habitaciones, { maxFraction: 0 }) : ''}
                      />
                      <DetailRow
                        label="Baños"
                        value={detail.banos ? formatNumberEs(detail.banos, { maxFraction: 0 }) : ''}
                      />
                      <DetailRow label="Planta" value={detail.planta || ''} />
                      <DetailRow
                        label="Año construcción"
                        value={detail.anioConstruccion ? formatNumberEs(detail.anioConstruccion, { maxFraction: 0 }) : ''}
                      />
                      <DetailRow label="Cert. energético" value={labelCert(detail.certificadoEnergetico)} />
                      <DetailRow label="Amueblado" value={labelSiNo(detail.amueblado)} />
                      <DetailRow label="Garaje" value={labelSiNo(detail.plazaGaraje)} />
                      <DetailRow label="Ascensor" value={labelSiNo(detail.ascensor)} />
                      <DetailRow label="Terraza" value={labelSiNo(detail.terraza)} />
                      <DetailRow label="Exclusiva" value={labelSiNo(detail.exclusividad)} />
                    </div>
                  </section>

                  <section className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-stone-400">Gestión</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <DetailRow label="Captado el" value={captadoLabel || '—'} />
                      <DetailRow label="Lo lleva" value={detail.agente || 'Sin comercial asignado'} />
                      <DetailRow
                        label="Llaves"
                        value={(
                          <span className="inline-flex items-center gap-1.5">
                            <KeyRound className="w-3.5 h-3.5 text-stone-400" />
                            {labelLlaves(detail.llavesUbicacion)}
                          </span>
                        )}
                      />
                      <DetailRow
                        label="Comisión agencia"
                        value={detail.comisionPct ? `${formatNumberEs(detail.comisionPct, { maxFraction: 2 })} %` : ''}
                      />
                      <DetailRow label="Propietario" value={detail.propietarioNombre || ''} />
                      <DetailRow label="Tel. propietario" value={detail.propietarioTelefono || ''} />
                    </div>
                  </section>

                  {detail.descripcion ? (
                    <section className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-stone-400">Descripción</h4>
                      <p className="text-sm text-stone-700 dark:text-stone-200 whitespace-pre-wrap leading-relaxed">
                        {detail.descripcion}
                      </p>
                    </section>
                  ) : null}

                  <section className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-stone-400">Contratos</h4>
                    {linked.length === 0 ? (
                      <p className="text-sm text-stone-400 italic">Ningún contrato vinculado.</p>
                    ) : (
                      <ul className="space-y-1">
                        {linked.map((c) => (
                          <li key={c._id}>
                            <button
                              type="button"
                              onClick={() => {
                                setDetail(null);
                                navigate(`/saas/realestate-contracts?propiedadId=${encodeURIComponent(detail._id)}`);
                              }}
                              className="w-full text-left text-sm rounded-lg px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200"
                            >
                              <span className="font-semibold">{c.referencia || 'Sin ref.'}</span>
                              {c.tipo ? <span className="capitalize text-stone-500"> · {c.tipo}</span> : null}
                              {c.estado ? <span className="capitalize text-stone-400"> · {c.estado}</span> : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              </div>

              <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 p-4 border-t border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
                <button type="button" onClick={() => setDetail(null)} className={`${VERTIAL_BTN_SECONDARY} !min-h-10`}>
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigate(`/saas/realestate-contracts?propiedadId=${encodeURIComponent(detail._id)}&nuevo=1`);
                    setDetail(null);
                  }}
                  className={`${VERTIAL_BTN_SECONDARY} !min-h-10`}
                >
                  <FileText className="w-4 h-4" />
                  Contrato
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(detail)}
                  className={`${VERTIAL_BTN_PRIMARY} !min-h-10`}
                >
                  <Edit3 className="w-4 h-4" />
                  Editar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar inmueble' : 'Nuevo inmueble'}</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {!editing ? (
                <p className="text-xs text-stone-500 dark:text-stone-400 rounded-xl bg-stone-50 dark:bg-stone-950/40 border border-stone-200 dark:border-stone-700 px-3 py-2">
                  Rellena ubicación, captación y comercial primero. Las fotos van al final.
                </p>
              ) : null}

              <div>
                <p className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-2">1. Ubicación</p>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dirección *</label>
                <input
                  value={form.direccion}
                  onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
                  placeholder="Calle, número, piso…"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">C.P.</label>
                  <input
                    value={form.codigoPostal || ''}
                    onChange={(e) => setForm((f) => ({ ...f, codigoPostal: e.target.value }))}
                    placeholder="08001"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ciudad</label>
                  <input
                    value={form.ciudad || ''}
                    onChange={(e) => setForm((f) => ({ ...f, ciudad: e.target.value }))}
                    placeholder="Barcelona"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Zona / barrio</label>
                  <input
                    value={form.zona || ''}
                    onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))}
                    placeholder="Eixample"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-stone-200 dark:border-stone-700 p-3 space-y-3">
                <p className="text-sm font-semibold text-stone-800 dark:text-stone-100">2. Captación y quién lo lleva</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Fecha captación</label>
                    <input
                      type="date"
                      value={form.fechaCaptacion || ''}
                      onChange={(e) => setForm((f) => ({ ...f, fechaCaptacion: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comercial (Equipo)</label>
                    <select
                      value={form.agenteUserId || ''}
                      onChange={(e) => {
                        const agent = resolveTeamAgent(agents, { userId: e.target.value });
                        setForm((f) => ({
                          ...f,
                          agenteUserId: agent?.userId || '',
                          agente: agent?.name || '',
                        }));
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                    >
                      <option value="">Sin asignar</option>
                      {agents.map((a) => (
                        <option key={a.userId} value={a.userId}>
                          {a.name}{a.role ? ` · ${a.role}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Propietario</label>
                    <input
                      value={form.propietarioNombre || ''}
                      onChange={(e) => setForm((f) => ({ ...f, propietarioNombre: e.target.value }))}
                      placeholder="Nombre del propietario"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tel. propietario</label>
                    <input
                      value={form.propietarioTelefono || ''}
                      onChange={(e) => setForm((f) => ({ ...f, propietarioTelefono: e.target.value }))}
                      placeholder="600…"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Exclusiva</label>
                    <select
                      value={form.exclusividad || ''}
                      onChange={(e) => setForm((f) => ({ ...f, exclusividad: e.target.value as SiNo }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                    >
                      {SI_NO.map((v) => (
                        <option key={v || 'none'} value={v}>{v === '' ? 'Sin indicar' : labelSiNo(v)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Llaves</label>
                    <select
                      value={form.llavesUbicacion || ''}
                      onChange={(e) => setForm((f) => ({ ...f, llavesUbicacion: e.target.value as LlavesUbicacion }))}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                    >
                      {LLAVES.map((o) => (
                        <option key={o.value || 'none'} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comisión %</label>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={form.comisionPct || ''}
                      onChange={(e) => setForm((f) => ({ ...f, comisionPct: Number(e.target.value) || 0 }))}
                      placeholder="3"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-2">3. Precio y operación</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
                    <select value={form.tipo} onChange={e => setForm((f) => ({ ...f, tipo: e.target.value as TipoInmueble }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                      {TIPOS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Operación</label>
                    <select value={form.operacion} onChange={e => setForm((f) => ({ ...f, operacion: e.target.value as Operacion }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                      {OPERACIONES.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Precio (€)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={precioDraft}
                    onChange={(e) => onPrecioDraft(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm((f) => ({ ...f, estado: e.target.value as EstadoProp }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100">
                    {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-2">4. Características</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Habitaciones</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={habDraft}
                      onChange={(e) => onHabDraft(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">m²</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={m2Draft}
                      onChange={(e) => onM2Draft(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none tabular-nums"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Baños</label>
                  <input
                    type="number"
                    min={0}
                    value={form.banos || ''}
                    onChange={(e) => setForm((f) => ({ ...f, banos: Number(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Planta</label>
                  <input
                    value={form.planta || ''}
                    onChange={(e) => setForm((f) => ({ ...f, planta: e.target.value }))}
                    placeholder="3º · Ático"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Año</label>
                  <input
                    type="number"
                    min={1800}
                    max={2100}
                    value={form.anioConstruccion || ''}
                    onChange={(e) => setForm((f) => ({ ...f, anioConstruccion: Number(e.target.value) || 0 }))}
                    placeholder="1998"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cert. energético</label>
                  <select
                    value={form.certificadoEnergetico || ''}
                    onChange={(e) => setForm((f) => ({ ...f, certificadoEnergetico: e.target.value as CertEnergetico }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                  >
                    {CERTS.map((c) => (
                      <option key={c || 'none'} value={c}>
                        {c === '' ? 'Sin indicar' : c === 'en_tramite' ? 'En trámite' : c === 'exento' ? 'Exento' : c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amueblado</label>
                  <select
                    value={form.amueblado || ''}
                    onChange={(e) => setForm((f) => ({ ...f, amueblado: e.target.value as SiNo }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                  >
                    {SI_NO_PARCIAL.map((v) => (
                      <option key={v || 'none'} value={v}>{v === '' ? 'Sin indicar' : labelSiNo(v)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Garaje</label>
                  <select
                    value={form.plazaGaraje || ''}
                    onChange={(e) => setForm((f) => ({ ...f, plazaGaraje: e.target.value as SiNo }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                  >
                    {SI_NO.map((v) => (
                      <option key={v || 'none'} value={v}>{v === '' ? '—' : labelSiNo(v)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ascensor</label>
                  <select
                    value={form.ascensor || ''}
                    onChange={(e) => setForm((f) => ({ ...f, ascensor: e.target.value as SiNo }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                  >
                    {SI_NO.map((v) => (
                      <option key={v || 'none'} value={v}>{v === '' ? '—' : labelSiNo(v)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Terraza</label>
                  <select
                    value={form.terraza || ''}
                    onChange={(e) => setForm((f) => ({ ...f, terraza: e.target.value as SiNo }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100"
                  >
                    {SI_NO.map((v) => (
                      <option key={v || 'none'} value={v}>{v === '' ? '—' : labelSiNo(v)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción / notas</label>
                <textarea
                  value={form.descripcion || ''}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  rows={3}
                  placeholder="Orientación, reformas, vecinos, puntos fuertes para la visita…"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    5. Fotos
                    <span className="ml-1.5 font-normal text-stone-400 tabular-nums">
                      {(form.fotos?.length || 0)}/{MAX_PROPERTY_PHOTOS}
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={photosBusy || (form.fotos?.length || 0) >= MAX_PROPERTY_PHOTOS}
                    onClick={triggerPhotoPicker}
                    className={`${VERTIAL_BTN_SECONDARY} !min-h-9 !px-3 !py-1.5 !text-xs`}
                  >
                    {photosBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Camera className="h-3.5 w-3.5" />
                    )}
                    Subir fotos
                  </button>
                </div>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mb-2">
                  WhatsApp OK (JPG/PNG). También puedes pegar (Ctrl+V) o arrastrar aquí. HEIC de iPhone → pasar a JPG. Luego Guardar.
                </p>
                <div
                  className="grid grid-cols-3 gap-2 rounded-xl border border-dashed border-stone-200 dark:border-stone-600 p-2"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const list = e.dataTransfer?.files;
                    if (list?.length) void handlePhotoUpload(list);
                  }}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (!items?.length) return;
                    const blobs: Blob[] = [];
                    for (const item of Array.from(items)) {
                      if (item.type.startsWith('image/')) {
                        const b = item.getAsFile();
                        if (b) blobs.push(b);
                      }
                    }
                    if (blobs.length) {
                      e.preventDefault();
                      void handlePhotoUpload(blobs);
                    }
                  }}
                >
                  {(form.fotos || []).map((src, idx) => (
                    <div
                      key={`foto-${idx}-${src.startsWith('data:') ? 'local' : src.slice(-40)}`}
                      className="relative aspect-square rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800"
                    >
                      <AuthImage src={src} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhotoAt(idx)}
                        className="absolute top-1 right-1 p-1 rounded-lg bg-black/55 text-white hover:bg-rose-600 transition-colors"
                        aria-label="Quitar foto"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      {idx === 0 ? (
                        <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                          Portada
                        </span>
                      ) : null}
                    </div>
                  ))}
                  {(form.fotos?.length || 0) < MAX_PROPERTY_PHOTOS ? (
                    <button
                      type="button"
                      disabled={photosBusy}
                      onClick={triggerPhotoPicker}
                      className="aspect-square rounded-xl border border-dashed border-stone-300 dark:border-stone-600 bg-stone-50 dark:bg-stone-900/60 flex flex-col items-center justify-center gap-1 text-stone-500 hover:border-blue-400 hover:text-[var(--v-blue,#2563eb)] hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors"
                    >
                      {photosBusy ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <Camera className="w-6 h-6" />
                      )}
                      <span className="text-[10px] font-semibold">Añadir</span>
                    </button>
                  ) : null}
                </div>
              </div>

              {editing ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Referencia</label>
                  <input value={form.referencia} onChange={e => setForm((f) => ({ ...f, referencia: e.target.value }))} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm dark:text-gray-100 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              ) : (
                <p className="text-xs text-gray-500">Referencia automática: {form.referencia}</p>
              )}

              {editing ? (
                <div className="rounded-xl border border-stone-200 dark:border-stone-700 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 inline-flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-stone-400" />
                      Contratos
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setModalOpen(false);
                        navigate(`/saas/realestate-contracts?propiedadId=${encodeURIComponent(editing._id)}&nuevo=1`);
                      }}
                      className="text-xs font-semibold text-[var(--v-blue,#2563eb)] hover:underline"
                    >
                      + Nuevo
                    </button>
                  </div>
                  {(contractsByPropId.get(editing._id) || []).length === 0 ? (
                    <p className="text-xs text-stone-500">Sin contratos vinculados a este inmueble.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {(contractsByPropId.get(editing._id) || []).map((c) => (
                        <li key={c._id}>
                          <button
                            type="button"
                            onClick={() => {
                              setModalOpen(false);
                              navigate(`/saas/realestate-contracts?propiedadId=${encodeURIComponent(editing._id)}`);
                            }}
                            className="w-full text-left text-xs rounded-lg px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200"
                          >
                            <span className="font-semibold">{c.referencia || 'Sin ref.'}</span>
                            {c.tipo ? <span className="capitalize text-stone-500"> · {c.tipo}</span> : null}
                            {c.estado ? <span className="capitalize text-stone-400"> · {c.estado}</span> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setModalOpen(false)} className={`${VERTIAL_BTN_SECONDARY} !min-h-10`}>Cancelar</button>
              <button type="button" onClick={() => void handleSave()} disabled={photosBusy} className={`${VERTIAL_BTN_PRIMARY} !min-h-10`}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Input siempre montado (fuera del modal) para que el selector de archivos abra bien. */}
      <input
        ref={photoInputRef}
        type="file"
        accept="*/*"
        multiple
        className="fixed left-0 top-0 h-px w-px opacity-0"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const selected = e.target.files;
          if (!selected?.length) {
            toast.message('No se seleccionó ningún archivo');
            return;
          }
          void handlePhotoUpload(selected);
        }}
      />

      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Inmuebles"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}

export const RealEstateProperties = withErrorBoundary(
  RealEstatePropertiesPage,
  'Propiedades inmobiliaria',
);
