import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  listWorkOrdersRequest,
  updateWorkOrderRequest,
  createLaborItem,
  createMaterialItem,
  createTimeEntry,
  type WorkOrder,
  type WorkOrderStatus,
  type LaborItem,
  type MaterialItem,
  type TimeEntry,
} from '../../lib/workshopApi';
import { generateWorkshopInvoicePdf } from '../../lib/workshopPdfGenerator';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Clock,
  Wrench,
  Package,
  Timer,
  FileText,
  Camera,
  PenLine,
  Play,
  Square,
  CheckCircle2,
  AlertTriangle,
  Car,
  User,
  Phone,
  ReceiptText,
  History,
  QrCode,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; badgeClass: string }> = {
  pending: { label: 'Pendiente', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200' },
  in_progress: { label: 'En curso', badgeClass: 'bg-blue-100 text-blue-700 border-blue-200' },
  completed: { label: 'Completada', badgeClass: 'bg-green-100 text-green-700 border-green-200' },
  invoiced: { label: 'Facturada', badgeClass: 'bg-purple-100 text-purple-700 border-purple-200' },
  cancelled: { label: 'Cancelada', badgeClass: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700' },
};

const STATUS_FLOW: WorkOrderStatus[] = ['pending', 'in_progress', 'completed', 'invoiced'];

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function calcDuration(start: string, end?: string): number {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  return Math.round((e - s) / 60000);
}

// ─── Signature Canvas ─────────────────────────────────────────────────────────

function SignatureCanvas({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (sig: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(!!value);

  useEffect(() => {
    if (value && canvasRef.current) {
      const img = new Image();
      img.onload = () => {
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0);
      };
      img.src = value;
      setHasSig(true);
    }
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1f2937';
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSig(true);
  };

  const stopDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && hasSig) {
      onChange(canvas.toDataURL());
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
    onChange('');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <PenLine className="w-4 h-4" />
          {label}
        </label>
        {hasSig && (
          <button onClick={clear} className="text-xs text-red-500 hover:text-red-700">
            Borrar firma
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={400}
        height={120}
        className="w-full border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 dark:bg-gray-800 cursor-crosshair touch-none"
        style={{ maxHeight: 120 }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      {!hasSig && (
        <p className="text-xs text-center text-gray-400 dark:text-gray-500">Firma aquí con el ratón o táctil</p>
      )}
    </div>
  );
}

// ─── Section: Labor Items ─────────────────────────────────────────────────────

function LaborSection({
  items,
  onChange,
}: {
  items: LaborItem[];
  onChange: (items: LaborItem[]) => void;
}) {
  const update = (id: string, field: keyof LaborItem, value: string | number) => {
    onChange(
      items.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        if (field === 'hours' || field === 'ratePerHour') {
          updated.total = Number(updated.hours || 0) * Number(updated.ratePerHour || 0);
        }
        return updated;
      }),
    );
  };

  const remove = (id: string) => onChange(items.filter(i => i.id !== id));
  const add = () => onChange([...items, createLaborItem()]);

  const totalCost = items.reduce((s, i) => s + (i.total || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Wrench className="w-4 h-4 text-blue-600" />
          Mano de obra
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
            Total: {totalCost.toLocaleString('es-ES')}€
          </span>
          <button
            onClick={add}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Añadir línea
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div
          className="border-2 border-dashed border-blue-200 rounded-xl p-6 text-center text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          onClick={add}
        >
          <Wrench className="w-8 h-8 text-blue-300 mx-auto mb-2" />
          Haz clic para añadir líneas de mano de obra
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 px-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            <div className="col-span-4">Descripción</div>
            <div className="col-span-2">Mecánico</div>
            <div className="col-span-2">Horas</div>
            <div className="col-span-2">€/hora</div>
            <div className="col-span-1">Total</div>
            <div className="col-span-1" />
          </div>
          {items.map(item => (
            <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4">
                <input
                  className="w-full px-2.5 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-blue-500 outline-none"
                  placeholder="Descripción del trabajo..."
                  value={item.description}
                  onChange={e => update(item.id, 'description', e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <input
                  className="w-full px-2.5 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-blue-500 outline-none"
                  placeholder="Mecánico"
                  value={item.mechanicName}
                  onChange={e => update(item.id, 'mechanicName', e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="w-full px-2.5 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-blue-500 outline-none"
                  placeholder="0"
                  value={item.hours}
                  onChange={e => update(item.id, 'hours', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  min="0"
                  className="w-full px-2.5 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-blue-500 outline-none"
                  placeholder="0"
                  value={item.ratePerHour}
                  onChange={e => update(item.id, 'ratePerHour', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="col-span-1">
                <div className="px-2 py-2 text-sm font-bold text-gray-900 dark:text-gray-100">
                  {(item.total || 0).toLocaleString('es-ES')}€
                </div>
              </div>
              <div className="col-span-1">
                <button
                  onClick={() => remove(item.id)}
                  className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section: Material Items ──────────────────────────────────────────────────

function MaterialsSection({
  items,
  onChange,
}: {
  items: MaterialItem[];
  onChange: (items: MaterialItem[]) => void;
}) {
  const update = (id: string, field: keyof MaterialItem, value: string | number) => {
    onChange(
      items.map(item => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unitCost') {
          updated.total = Number(updated.quantity || 0) * Number(updated.unitCost || 0);
        }
        return updated;
      }),
    );
  };

  const remove = (id: string) => onChange(items.filter(i => i.id !== id));
  const add = () => onChange([...items, createMaterialItem()]);

  const totalCost = items.reduce((s, i) => s + (i.total || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Package className="w-4 h-4 text-orange-600" />
          Materiales y recambios
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
            Total: {totalCost.toLocaleString('es-ES')}€
          </span>
          <button
            onClick={add}
            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Añadir material
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div
          className="border-2 border-dashed border-orange-200 rounded-xl p-6 text-center text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-colors"
          onClick={add}
        >
          <Package className="w-8 h-8 text-orange-300 mx-auto mb-2" />
          Haz clic para añadir piezas y materiales usados
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 px-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            <div className="col-span-4">Pieza / Material</div>
            <div className="col-span-2">Referencia</div>
            <div className="col-span-2">Cantidad</div>
            <div className="col-span-2">€/ud</div>
            <div className="col-span-1">Total</div>
            <div className="col-span-1" />
          </div>
          {items.map(item => (
            <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4">
                <input
                  className="w-full px-2.5 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-orange-500 outline-none"
                  placeholder="Nombre de la pieza..."
                  value={item.partName}
                  onChange={e => update(item.id, 'partName', e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <input
                  className="w-full px-2.5 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm font-mono focus:border-orange-500 outline-none"
                  placeholder="REF-001"
                  value={item.reference || ''}
                  onChange={e => update(item.id, 'reference', e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className="w-full px-2.5 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-orange-500 outline-none"
                  value={item.quantity}
                  onChange={e => update(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  min="0"
                  className="w-full px-2.5 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-orange-500 outline-none"
                  value={item.unitCost}
                  onChange={e => update(item.id, 'unitCost', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="col-span-1">
                <div className="px-2 py-2 text-sm font-bold text-gray-900 dark:text-gray-100">
                  {(item.total || 0).toLocaleString('es-ES')}€
                </div>
              </div>
              <div className="col-span-1">
                <button
                  onClick={() => remove(item.id)}
                  className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section: Time Tracking ───────────────────────────────────────────────────

function TimeTrackingSection({
  entries,
  onChange,
}: {
  entries: TimeEntry[];
  onChange: (entries: TimeEntry[]) => void;
}) {
  const [mechanicName, setMechanicName] = useState('');
  const [note, setNote] = useState('');
  const [ticking, setTicking] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Live timer tick
  useEffect(() => {
    const active = entries.find(e => !e.endTime);
    if (!active) { setTicking(null); return; }
    setTicking(active.id);
    const interval = setInterval(() => {
      setElapsed(calcDuration(active.startTime));
    }, 10000);
    setElapsed(calcDuration(active.startTime));
    return () => clearInterval(interval);
  }, [entries]);

  const startTimer = () => {
    if (entries.some(e => !e.endTime)) {
      toast.error('Ya hay un temporizador activo. Para el actual primero.');
      return;
    }
    const entry = createTimeEntry({ mechanicName, notes: note });
    onChange([...entries, entry]);
    setMechanicName('');
    setNote('');
    toast.success('Temporizador iniciado');
  };

  const stopTimer = (id: string) => {
    const endTime = new Date().toISOString();
    onChange(
      entries.map(e => {
        if (e.id !== id) return e;
        const duration = calcDuration(e.startTime, endTime);
        return { ...e, endTime, duration };
      }),
    );
    toast.success('Temporizador parado');
  };

  const remove = (id: string) => onChange(entries.filter(e => e.id !== id));

  const totalMinutes = entries
    .filter(e => e.duration)
    .reduce((s, e) => s + (e.duration || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Timer className="w-4 h-4 text-purple-600" />
          Control de tiempos
        </h3>
        {totalMinutes > 0 && (
          <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
            Total: {formatDuration(totalMinutes)}
          </span>
        )}
      </div>

      {/* Active timer display */}
      {ticking && entries.find(e => e.id === ticking && !e.endTime) && (
        <div className="p-4 bg-blue-50 border-2 border-blue-300 rounded-xl flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse" />
              <span className="font-semibold text-blue-900">
                Temporizador activo — {entries.find(e => e.id === ticking)?.mechanicName || 'Sin nombre'}
              </span>
            </div>
            <div className="text-3xl font-mono font-bold text-blue-800">
              {formatDuration(elapsed)}
            </div>
          </div>
          <button
            onClick={() => stopTimer(ticking)}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-colors flex items-center gap-2"
          >
            <Square className="w-4 h-4" /> Parar
          </button>
        </div>
      )}

      {/* Start timer form */}
      {!ticking && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl space-y-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Iniciar temporizador</p>
          <div className="grid grid-cols-2 gap-3">
            <input
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-purple-500 outline-none"
              placeholder="Nombre del mecánico"
              value={mechanicName}
              onChange={e => setMechanicName(e.target.value)}
            />
            <input
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:border-purple-500 outline-none"
              placeholder="Nota (opcional)"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>
          <button
            onClick={startTimer}
            className="w-full px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" /> Iniciar temporizador
          </button>
        </div>
      )}

      {/* History */}
      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map(entry => (
            <div key={entry.id} className={`flex items-center justify-between p-3 rounded-xl border-2 ${!entry.endTime ? 'border-blue-200 bg-blue-50' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
              <div>
                <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{entry.mechanicName || 'Sin asignar'}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Inicio: {new Date(entry.startTime).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                  {entry.endTime && ` → Fin: ${new Date(entry.endTime).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`}
                </div>
                {entry.notes && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{entry.notes}</div>}
              </div>
              <div className="flex items-center gap-2">
                {entry.endTime ? (
                  <span className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                    {entry.duration ? formatDuration(entry.duration) : '—'}
                  </span>
                ) : (
                  <button
                    onClick={() => stopTimer(entry.id)}
                    className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Square className="w-3 h-3" /> Parar
                  </button>
                )}
                <button onClick={() => remove(entry.id)} className="p-1 hover:bg-red-100 rounded-lg">
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Photos Section ───────────────────────────────────────────────────────────

function PhotosSection({ photos, onChange }: { photos: string[]; onChange: (p: string[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        if (ev.target?.result) {
          onChange([...photos, ev.target.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Camera className="w-4 h-4 text-teal-600" />
          Fotos del vehículo
        </h3>
        <button
          onClick={() => inputRef.current?.click()}
          className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
        >
          <Camera className="w-3.5 h-3.5" /> Subir foto
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      {photos.length === 0 ? (
        <div
          className="border-2 border-dashed border-teal-200 rounded-xl p-6 text-center text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <Camera className="w-8 h-8 text-teal-300 mx-auto mb-2" />
          Haz clic para subir fotos del vehículo
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {photos.map((photo, idx) => (
            <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden border-2 border-gray-200 dark:border-gray-700">
              <img src={photo} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
              <button
                onClick={() => onChange(photos.filter((_, i) => i !== idx))}
                className="absolute top-1 right-1 p-1 bg-red-600 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <div
            className="aspect-square rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <Plus className="w-6 h-6 text-gray-400 dark:text-gray-500" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function WorkOrderDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, listUsers } = useAuth();
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'info' | 'labor' | 'materials' | 'time' | 'photos' | 'signatures' | 'history'>('info');

  // Editable state
  const [laborItems, setLaborItems] = useState<LaborItem[]>([]);
  const [materialItems, setMaterialItems] = useState<MaterialItem[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [mechanicSig, setMechanicSig] = useState('');
  const [clientSig, setClientSig] = useState('');
  const [notes, setNotes] = useState('');
  const [responsible, setResponsible] = useState('');
  const [mechanics, setMechanics] = useState<string[]>([]);

  const loadMechanics = useCallback(async () => {
    const stripAccents = (value: string) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normalizeRole = (role: string) => stripAccents(role).toLowerCase();
    const isWorkshopRole = (role: string) => {
      const normalized = normalizeRole(role);
      return normalized.includes('taller') || normalized.includes('mecanic') || normalized.includes('tecnic');
    };

    try {
      const users = await listUsers();
      const options = [...new Set(
        users
          .filter((member) => isWorkshopRole(String(member.role || '')))
          .map((member) => String(member.fullName || member.email || '').trim())
          .filter(Boolean),
      )].sort((a, b) => a.localeCompare(b, 'es'));
      setMechanics(options);
    } catch {
      setMechanics([]);
    }
  }, [listUsers]);

  const load = useCallback(async () => {
    if (!user?.id || !id) return;
    try {
      const all = await listWorkOrdersRequest(user.id);
      const found = all.find(w => w._id === id || w.id === id);
      if (!found) {
        toast.error('Orden de trabajo no encontrada');
        navigate('/saas/workshop');
        return;
      }
      setWorkOrder(found);
      setLaborItems(found.laborItems || []);
      setMaterialItems(found.materialItems || []);
      setTimeEntries(found.timeEntries || []);
      setPhotos(found.photos || []);
      setMechanicSig(found.mechanicSignature || '');
      setClientSig(found.clientSignature || '');
      setNotes(found.notes || '');
      setResponsible(found.responsible || '');
    } catch {
      toast.error('Error al cargar la orden de trabajo');
    } finally {
      setLoading(false);
    }
  }, [user?.id, id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMechanics(); }, [loadMechanics]);

  const save = async () => {
    if (!user?.id || !workOrder) return;
    setSaving(true);
    try {
      const totalLaborCost = laborItems.reduce((s, i) => s + (i.total || 0), 0);
      const totalMaterialsCost = materialItems.reduce((s, i) => s + (i.total || 0), 0);
      const updated = await updateWorkOrderRequest(user.id, {
        ...workOrder,
        laborItems,
        materialItems,
        timeEntries,
        photos,
        mechanicSignature: mechanicSig,
        clientSignature: clientSig,
        notes,
        responsible,
        totalLaborCost,
        totalMaterialsCost,
        totalCost: totalLaborCost + totalMaterialsCost,
      });
      setWorkOrder(updated);
      toast.success('Orden de trabajo guardada');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: WorkOrderStatus) => {
    if (!user?.id || !workOrder) return;
    try {
      const updated = await updateWorkOrderRequest(user.id, {
        ...workOrder,
        laborItems,
        materialItems,
        timeEntries,
        photos,
        mechanicSignature: mechanicSig,
        clientSignature: clientSig,
        notes,
        responsible,
        status,
        stageHistory: [
          ...(workOrder.stageHistory || []),
          { status, date: new Date().toISOString(), user: user.fullName || 'Sistema' },
        ],
      });
      setWorkOrder(updated);
      toast.success(`Estado: ${STATUS_CONFIG[status].label}`);
    } catch {
      toast.error('Error al cambiar el estado');
    }
  };

  const handleGenerateInvoice = async () => {
    if (!workOrder) return;
    await save();
    try {
      generateWorkshopInvoicePdf({
        workOrder: {
          ...workOrder,
          laborItems,
          materialItems,
          timeEntries,
          mechanicSignature: mechanicSig,
          clientSignature: clientSig,
          notes,
          responsible,
          totalLaborCost: laborItems.reduce((s, i) => s + (i.total || 0), 0),
          totalMaterialsCost: materialItems.reduce((s, i) => s + (i.total || 0), 0),
          totalCost: laborItems.reduce((s, i) => s + (i.total || 0), 0) + materialItems.reduce((s, i) => s + (i.total || 0), 0),
        },
      });
      await changeStatus('invoiced');
      toast.success('Factura generada y OT marcada como facturada');
    } catch {
      toast.error('Error al generar la factura');
    }
  };

  if (loading) {
    return (
      <Layout title="Cargando..." subtitle="Orden de trabajo">
        <div className="flex items-center justify-center py-20 text-gray-500 dark:text-gray-400">
          <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />
          Cargando...
        </div>
      </Layout>
    );
  }

  if (!workOrder) return null;

  const sections = [
    { id: 'info', label: 'Información', icon: <Car className="w-4 h-4" /> },
    { id: 'labor', label: 'Mano de obra', icon: <Wrench className="w-4 h-4" />, count: laborItems.length },
    { id: 'materials', label: 'Materiales', icon: <Package className="w-4 h-4" />, count: materialItems.length },
    { id: 'time', label: 'Tiempos', icon: <Timer className="w-4 h-4" />, count: timeEntries.filter(e => !e.endTime).length || undefined },
    { id: 'photos', label: 'Fotos', icon: <Camera className="w-4 h-4" />, count: photos.length || undefined },
    { id: 'signatures', label: 'Firmas', icon: <PenLine className="w-4 h-4" /> },
    { id: 'history', label: 'Historial', icon: <History className="w-4 h-4" /> },
  ] as const;

  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(workOrder.status) + 1];

  return (
    <Layout
      title={workOrder.woNumber}
      subtitle={`${workOrder.vehicleBrand} ${workOrder.vehicleModel} — ${workOrder.vehiclePlate}`}
    >
      <div className="space-y-5">
        {/* Back + header actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/saas/workshop')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al taller
          </button>
          <div className="flex items-center gap-2">
            {workOrder.status !== 'invoiced' && workOrder.status !== 'cancelled' && (
              <button
                onClick={handleGenerateInvoice}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
              >
                <ReceiptText className="w-4 h-4" />
                Generar factura
              </button>
            )}
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>

        {/* Summary header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{workOrder.woNumber}</h1>
                <span className={`px-3 py-1 text-sm font-semibold rounded-full border ${STATUS_CONFIG[workOrder.status].badgeClass}`}>
                  {STATUS_CONFIG[workOrder.status].label}
                </span>
                {workOrder.priority === 'urgent' && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
                    <AlertTriangle className="w-3 h-3" /> URGENTE
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Car className="w-4 h-4" />
                  {workOrder.vehicleBrand} {workOrder.vehicleModel}
                  {workOrder.vehiclePlate && ` (${workOrder.vehiclePlate})`}
                </span>
                {workOrder.clientName && (
                  <span className="flex items-center gap-1.5">
                    <User className="w-4 h-4" />
                    {workOrder.clientName}
                  </span>
                )}
                {workOrder.clientPhone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-4 h-4" />
                    {workOrder.clientPhone}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Coste total</div>
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {(laborItems.reduce((s, i) => s + (i.total || 0), 0) +
                  materialItems.reduce((s, i) => s + (i.total || 0), 0)).toLocaleString('es-ES')}€
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-blue-50 rounded-xl">
              <div className="text-xs text-blue-600 mb-0.5">M. de obra</div>
              <div className="font-bold text-blue-900">{laborItems.reduce((s, i) => s + (i.total || 0), 0).toLocaleString('es-ES')}€</div>
            </div>
            <div className="p-3 bg-orange-50 rounded-xl">
              <div className="text-xs text-orange-600 mb-0.5">Materiales</div>
              <div className="font-bold text-orange-900">{materialItems.reduce((s, i) => s + (i.total || 0), 0).toLocaleString('es-ES')}€</div>
            </div>
            <div className="p-3 bg-purple-50 rounded-xl">
              <div className="text-xs text-purple-600 mb-0.5">Horas registradas</div>
              <div className="font-bold text-purple-900">
                {formatDuration(timeEntries.filter(e => e.duration).reduce((s, e) => s + (e.duration || 0), 0))}
              </div>
            </div>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Responsable</div>
              <div className="font-bold text-gray-900 dark:text-gray-100">{responsible || workOrder.responsible || '—'}</div>
            </div>
          </div>

          {/* Status flow */}
          {nextStatus && workOrder.status !== 'cancelled' && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">Siguiente acción:</span>
              <button
                onClick={() => changeStatus(nextStatus)}
                className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Pasar a: {STATUS_CONFIG[nextStatus].label}
              </button>
              {workOrder.status !== 'cancelled' && (
                <button
                  onClick={() => changeStatus('cancelled')}
                  className="px-4 py-2 border-2 border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-xl transition-colors"
                >
                  Cancelar OT
                </button>
              )}
            </div>
          )}
        </div>

        {/* Section nav */}
        <div className="flex gap-1 flex-wrap">
          {sections.map(sec => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id as typeof activeSection)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                activeSection === sec.id
                  ? 'bg-gray-900 text-white'
                  : 'bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400'
              }`}
            >
              {sec.icon}
              {sec.label}
              {'count' in sec && sec.count ? (
                <span className={`ml-0.5 px-1.5 py-0.5 text-xs rounded-full font-bold ${activeSection === sec.id ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100' : 'bg-gray-900 text-white'}`}>
                  {sec.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Section content */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-6">
          {activeSection === 'info' && (
            <div className="space-y-4 max-w-2xl">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Datos de la orden</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Mecánico responsable</label>
                  {mechanics.length > 0 ? (
                    <select
                      className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none"
                      value={responsible}
                      onChange={e => setResponsible(e.target.value)}
                    >
                      <option value="">Sin asignar</option>
                      {mechanics.map((mechanic) => (
                        <option key={mechanic} value={mechanic}>
                          {mechanic}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none"
                      value={responsible}
                      onChange={e => setResponsible(e.target.value)}
                      placeholder="Nombre del mecánico"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Kilómetros entrada</label>
                  <div className="px-3 py-2.5 border-2 border-gray-100 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                    {workOrder.vehicleMileage ? `${workOrder.vehicleMileage.toLocaleString('es-ES')} km` : '—'}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Descripción del trabajo</label>
                <div className="px-3 py-2.5 border-2 border-gray-100 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm">
                  {workOrder.description || 'Sin descripción'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Notas internas</label>
                <textarea
                  rows={4}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none resize-none text-sm"
                  placeholder="Notas internas del mecánico..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
              {workOrder.estimatedCompletion && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm">
                  <span className="font-semibold text-amber-900">Entrega estimada: </span>
                  <span className="text-amber-800">
                    {new Date(workOrder.estimatedCompletion).toLocaleDateString('es-ES')}
                  </span>
                </div>
              )}

              {/* QR de seguimiento */}
              {(() => {
                const publicUrl = `${window.location.origin}/wo/${workOrder._id}`;
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(publicUrl)}&format=svg&margin=2`;
                return (
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <QrCode className="w-4 h-4 text-gray-700 dark:text-gray-300" />
                      <h4 className="font-bold text-gray-900 dark:text-gray-100 text-sm">QR de seguimiento para el cliente</h4>
                    </div>
                    <div className="flex items-start gap-5">
                      <div className="shrink-0">
                        <img
                          src={qrUrl}
                          alt={`QR ${workOrder.woNumber}`}
                          className="w-[120px] h-[120px] border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-1"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                          El cliente puede escanear este QR para ver el estado de su vehículo en tiempo real, sin necesidad de iniciar sesión.
                        </p>
                        <div className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg mb-2">
                          <span className="text-xs text-gray-600 dark:text-gray-400 truncate flex-1 font-mono">{publicUrl}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('Enlace copiado'); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-black text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            <Copy className="w-3 h-3" /> Copiar enlace
                          </button>
                          <a
                            href={publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" /> Ver página
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {activeSection === 'labor' && (
            <LaborSection items={laborItems} onChange={setLaborItems} />
          )}

          {activeSection === 'materials' && (
            <MaterialsSection items={materialItems} onChange={setMaterialItems} />
          )}

          {activeSection === 'time' && (
            <TimeTrackingSection entries={timeEntries} onChange={setTimeEntries} />
          )}

          {activeSection === 'photos' && (
            <PhotosSection photos={photos} onChange={setPhotos} />
          )}

          {activeSection === 'signatures' && (
            <div className="space-y-6 max-w-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Las firmas se guardan junto con la orden de trabajo y aparecen en la factura generada.
              </p>
              <SignatureCanvas
                label="Firma del mecánico"
                value={mechanicSig}
                onChange={setMechanicSig}
              />
              <SignatureCanvas
                label="Firma del cliente (conformidad)"
                value={clientSig}
                onChange={setClientSig}
              />
            </div>
          )}

          {activeSection === 'history' && (
            <div className="space-y-4">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Historial de cambios</h3>
              {workOrder.stageHistory.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Sin historial</p>
              ) : (
                <div className="relative">
                  <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200" />
                  <div className="space-y-4">
                    {[...workOrder.stageHistory].reverse().map((event, idx) => (
                      <div key={idx} className="relative pl-12">
                        <div className={`absolute left-3 top-2 w-4 h-4 rounded-full border-4 border-white ${idx === 0 ? 'bg-gray-900' : 'bg-gray-300'}`} />
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                          <div className="flex items-center justify-between mb-1">
                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${STATUS_CONFIG[event.status].badgeClass}`}>
                              {STATUS_CONFIG[event.status].label}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(event.date).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">Por: {event.user}</div>
                          {event.notes && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{event.notes}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom save */}
        <div className="flex justify-end gap-3 pb-4">
          {workOrder.status !== 'invoiced' && workOrder.status !== 'cancelled' && (
            <button
              onClick={handleGenerateInvoice}
              className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors flex items-center gap-2"
            >
              <ReceiptText className="w-4 h-4" />
              Generar factura PDF
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-colors flex items-center gap-2 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
