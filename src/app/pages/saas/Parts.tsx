import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { useModalClose } from '../../hooks/useModalClose';
import {
  listPartsRequest,
  createPartRequest,
  updatePartRequest,
  deletePartRequest,
  isLowStock,
  isCriticalStock,
  type Part,
  type PartCategory,
  type CreatePartPayload,
  type StockMovement,
  type StockMovementType,
} from '../../lib/partsApi';
import { v4 as uuidv4 } from 'uuid';
import {
  Plus,
  Search,
  Package,
  AlertTriangle,
  Trash2,
  Edit2,
  X,
  Save,
  AlertCircle,
  TrendingDown,
  BarChart3,
  ArrowDown,
  ArrowUp,
  History,
  ShoppingCart,
  FileDown,
  ArrowLeftRight,
} from 'lucide-react';

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<PartCategory, { label: string; color: string }> = {
  motor: { label: 'Motor', color: 'bg-red-100 text-red-700' },
  frenos: { label: 'Frenos', color: 'bg-orange-100 text-orange-700' },
  suspension: { label: 'Suspensión', color: 'bg-yellow-100 text-yellow-700' },
  electricidad: { label: 'Electricidad', color: 'bg-blue-100 text-blue-700' },
  carroceria: { label: 'Carrocería', color: 'bg-slate-100 text-slate-700' },
  filtros: { label: 'Filtros', color: 'bg-green-100 text-green-700' },
  aceites: { label: 'Aceites', color: 'bg-amber-100 text-amber-700' },
  neumaticos: { label: 'Neumáticos', color: 'bg-gray-200 text-gray-700 dark:text-gray-300' },
  otro: { label: 'Otro', color: 'bg-purple-100 text-purple-700' },
};

// ─── Part Form ────────────────────────────────────────────────────────────────

interface PartFormProps {
  part?: Part;
  onSave: (data: CreatePartPayload) => void;
  onCancel: () => void;
}

function PartForm({ part, onSave, onCancel }: PartFormProps) {
  const [form, setForm] = useState<CreatePartPayload>({
    user_id: '',
    name: part?.name || '',
    reference: part?.reference || '',
    category: part?.category || 'otro',
    brand: part?.brand || '',
    unitCost: part?.unitCost || 0,
    salePrice: part?.salePrice || 0,
    stockQuantity: part?.stockQuantity || 0,
    minStock: part?.minStock || 0,
    location: part?.location || '',
    notes: part?.notes || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return; }
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Nombre de la pieza *</label>
          <input
            required
            className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none"
            placeholder="Filtro de aceite, Pastillas de freno..."
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Referencia</label>
          <input
            className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none font-mono"
            placeholder="REF-001"
            value={form.reference}
            onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Marca</label>
          <input
            className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none"
            placeholder="Bosch, Mann, NGK..."
            value={form.brand || ''}
            onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Categoría</label>
          <select
            className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none bg-white dark:bg-gray-800"
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value as PartCategory }))}
          >
            {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Ubicación en almacén</label>
          <input
            className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none"
            placeholder="Estante A-3"
            value={form.location || ''}
            onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Coste unitario (€)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none"
            value={form.unitCost}
            onChange={e => setForm(f => ({ ...f, unitCost: parseFloat(e.target.value) || 0 }))}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Precio de venta (€)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none"
            value={form.salePrice}
            onChange={e => setForm(f => ({ ...f, salePrice: parseFloat(e.target.value) || 0 }))}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Stock actual (uds)</label>
          <input
            type="number"
            min="0"
            className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none"
            value={form.stockQuantity}
            onChange={e => setForm(f => ({ ...f, stockQuantity: parseInt(e.target.value) || 0 }))}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Stock mínimo (alerta)
          </label>
          <input
            type="number"
            min="0"
            className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none"
            value={form.minStock}
            onChange={e => setForm(f => ({ ...f, minStock: parseInt(e.target.value) || 0 }))}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Notas</label>
          <textarea
            rows={2}
            className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none resize-none text-sm"
            placeholder="Notas adicionales..."
            value={form.notes || ''}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </div>
      <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex gap-3 rounded-b-2xl">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          {part ? 'Guardar cambios' : 'Añadir recambio'}
        </button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── Stock Movement Modal ─────────────────────────────────────────────────────

interface StockMovementModalProps {
  part: Part;
  onClose: () => void;
  onSave: (part: Part, movement: StockMovement) => void;
  currentUser: string;
}

function StockMovementModal({ part, onClose, onSave, currentUser }: StockMovementModalProps) {
  const [type, setType] = useState<StockMovementType>('entrada');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  const newStock =
    type === 'entrada' ? part.stockQuantity + quantity :
    type === 'salida' ? Math.max(0, part.stockQuantity - quantity) :
    quantity;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0) { toast.error('La cantidad debe ser mayor que 0'); return; }
    const movement: StockMovement = {
      id: uuidv4(),
      type,
      quantity,
      previousStock: part.stockQuantity,
      newStock,
      notes: notes.trim() || undefined,
      date: new Date().toISOString(),
      user: currentUser || 'Sistema',
    };
    onSave({ ...part, stockQuantity: newStock, movements: [...(part.movements || []), movement] }, movement);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Movimiento de stock</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{part.name} · {part.stockQuantity} uds actuales</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Tipo de movimiento</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'entrada', label: 'Entrada', icon: <ArrowDown className="w-4 h-4" />, color: 'bg-green-50 border-green-300 text-green-700' },
                { value: 'salida', label: 'Salida', icon: <ArrowUp className="w-4 h-4" />, color: 'bg-red-50 border-red-300 text-red-700' },
                { value: 'ajuste', label: 'Ajuste', icon: <ArrowLeftRight className="w-4 h-4" />, color: 'bg-blue-50 border-blue-300 text-blue-700' },
              ] as { value: StockMovementType; label: string; icon: React.ReactNode; color: string }[]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-sm font-semibold ${
                    type === opt.value ? opt.color : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {opt.icon}{opt.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              {type === 'ajuste' ? 'Nuevo stock total' : 'Cantidad'}
            </label>
            <input
              type="number"
              min={type === 'salida' ? 1 : 0}
              max={type === 'salida' ? part.stockQuantity : undefined}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none text-lg font-bold text-center"
              value={quantity}
              onChange={e => setQuantity(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Stock resultante</div>
            <div className={`text-3xl font-bold ${newStock <= part.minStock ? 'text-red-700' : 'text-gray-900 dark:text-gray-100'}`}>
              {newStock} uds
            </div>
            {newStock <= part.minStock && part.minStock > 0 && (
              <div className="text-xs text-red-600 mt-1 flex items-center justify-center gap-1">
                <AlertCircle className="w-3 h-3" /> Por debajo del mínimo ({part.minStock})
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Notas (opcional)</label>
            <input
              className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 outline-none text-sm"
              placeholder="Pedido #123, OT-456..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl font-medium text-gray-700 dark:text-gray-300">
              Cancelar
            </button>
            <button type="submit" className="flex-1 px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold flex items-center justify-center gap-2">
              <Save className="w-4 h-4" /> Registrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Stock History Modal ──────────────────────────────────────────────────────

function StockHistoryModal({ part, onClose }: { part: Part; onClose: () => void }) {
  const movements = [...(part.movements || [])].sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const MOVEMENT_CONFIG: Record<StockMovementType, { label: string; icon: React.ReactNode; color: string }> = {
    entrada: { label: 'Entrada', icon: <ArrowDown className="w-4 h-4" />, color: 'text-green-600 bg-green-50' },
    salida: { label: 'Salida', icon: <ArrowUp className="w-4 h-4" />, color: 'text-red-600 bg-red-50' },
    ajuste: { label: 'Ajuste', icon: <ArrowLeftRight className="w-4 h-4" />, color: 'text-blue-600 bg-blue-50' },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">Historial de movimientos</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{part.name} · {part.reference}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {movements.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <History className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm">Sin movimientos registrados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {movements.map(m => {
                const cfg = MOVEMENT_CONFIG[m.type];
                const delta = m.type === 'entrada' ? `+${m.quantity}` :
                  m.type === 'salida' ? `-${m.quantity}` :
                  `→ ${m.newStock}`;
                return (
                  <div key={m.id} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-xl">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${cfg.color}`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{cfg.label}</span>
                        <span className="font-bold text-sm">{delta}</span>
                        {m.workOrderNumber && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{m.workOrderNumber}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {m.previousStock} → {m.newStock} uds · {m.user} · {new Date(m.date).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                      {m.notes && <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{m.notes}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Auto Purchase Order ──────────────────────────────────────────────────────

function generatePurchaseOrderText(lowParts: Part[]): string {
  const now = new Date().toLocaleDateString('es-ES', { dateStyle: 'long' });
  let text = `PEDIDO DE REPOSICIÓN — ${now}\n${'='.repeat(50)}\n\n`;
  lowParts.forEach((p, i) => {
    const needed = Math.max(p.minStock * 2, 1) - p.stockQuantity;
    text += `${i + 1}. ${p.name}\n`;
    text += `   Ref: ${p.reference || p.partNumber}\n`;
    if (p.brand) text += `   Marca: ${p.brand}\n`;
    text += `   Stock actual: ${p.stockQuantity} uds (mínimo: ${p.minStock})\n`;
    text += `   Cantidad a pedir: ${needed} uds\n\n`;
  });
  return text;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Parts() {
  const { user } = useAuth();
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<PartCategory | 'all'>('all');
  const [filterStock, setFilterStock] = useState<'all' | 'low' | 'critical'>('all');
  const [movementPart, setMovementPart] = useState<Part | null>(null);
  const [historyPart, setHistoryPart] = useState<Part | null>(null);

  useModalClose(!!movementPart, () => setMovementPart(null));
  useModalClose(!!historyPart, () => setHistoryPart(null));

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await listPartsRequest(user.id);
      setParts(data);
    } catch {
      toast.error('Error al cargar el inventario');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data: CreatePartPayload) => {
    if (!user?.id) return;
    try {
      const created = await createPartRequest(user.id, data);
      setParts(prev => [created, ...prev]);
      setShowCreate(false);
      toast.success(`Recambio ${created.partNumber} añadido`);
    } catch {
      toast.error('Error al añadir el recambio');
    }
  };

  const handleUpdate = async (data: CreatePartPayload) => {
    if (!user?.id || !editingPart) return;
    try {
      const updated = await updatePartRequest(user.id, { ...editingPart, ...data });
      setParts(prev => prev.map(p => p._id === updated._id ? updated : p));
      setEditingPart(null);
      toast.success('Recambio actualizado');
    } catch {
      toast.error('Error al actualizar el recambio');
    }
  };

  const handleDelete = async (part: Part) => {
    if (!user?.id) return;
    if (!confirm(`¿Eliminar "${part.name}"?`)) return;
    try {
      await deletePartRequest(user.id, part._id);
      setParts(prev => prev.filter(p => p._id !== part._id));
      toast.success('Recambio eliminado');
    } catch {
      toast.error('Error al eliminar el recambio');
    }
  };

  const handleStockAdjust = async (part: Part, delta: number) => {
    if (!user?.id) return;
    const previousStock = part.stockQuantity;
    const newStock = Math.max(0, previousStock + delta);
    const movement: StockMovement = {
      id: uuidv4(),
      type: delta > 0 ? 'entrada' : 'salida',
      quantity: Math.abs(delta),
      previousStock,
      newStock,
      date: new Date().toISOString(),
      user: user.fullName || 'Sistema',
    };
    try {
      const updated = await updatePartRequest(user.id, {
        ...part,
        stockQuantity: newStock,
        movements: [...(part.movements || []), movement],
      });
      setParts(prev => prev.map(p => p._id === updated._id ? updated : p));
    } catch {
      toast.error('Error al ajustar el stock');
    }
  };

  const handleMovementSave = async (updatedPart: Part, _movement: StockMovement) => {
    if (!user?.id) return;
    try {
      const saved = await updatePartRequest(user.id, updatedPart);
      setParts(prev => prev.map(p => p._id === saved._id ? saved : p));
      setMovementPart(null);
      toast.success('Movimiento registrado');
    } catch {
      toast.error('Error al registrar el movimiento');
    }
  };

  const handleGeneratePurchaseOrder = () => {
    const lowParts = parts.filter(p => isLowStock(p) || isCriticalStock(p));
    if (lowParts.length === 0) { toast.info('No hay piezas con stock bajo'); return; }
    const text = generatePurchaseOrderText(lowParts);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedido-reposicion-${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Pedido generado con ${lowParts.length} referencias`);
  };

  const filtered = useMemo(() => {
    return parts.filter(p => {
      if (filterCategory !== 'all' && p.category !== filterCategory) return false;
      if (filterStock === 'low' && !isLowStock(p)) return false;
      if (filterStock === 'critical' && !isCriticalStock(p)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.reference.toLowerCase().includes(q) ||
          (p.brand || '').toLowerCase().includes(q) ||
          p.partNumber.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [parts, search, filterCategory, filterStock]);

  const kpis = useMemo(() => ({
    total: parts.length,
    low: parts.filter(isLowStock).length,
    critical: parts.filter(isCriticalStock).length,
    stockValue: parts.reduce((s, p) => s + p.stockQuantity * p.unitCost, 0),
  }), [parts]);

  return (
    <Layout title="Inventario de recambios" subtitle="Gestión de piezas y stock del taller">
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="text-gray-500 dark:text-gray-400 mb-2"><Package className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{kpis.total}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Referencias en stock</div>
          </div>
          <div className="p-4 bg-amber-50 border-2 border-amber-200 rounded-xl">
            <div className="text-amber-600 mb-2"><TrendingDown className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-amber-900">{kpis.low}</div>
            <div className="text-xs text-amber-700 mt-0.5">Stock bajo</div>
          </div>
          <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl">
            <div className="text-red-600 mb-2"><AlertCircle className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-red-900">{kpis.critical}</div>
            <div className="text-xs text-red-700 mt-0.5">Sin stock</div>
          </div>
          <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl">
            <div className="text-green-600 mb-2"><BarChart3 className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-green-900">{kpis.stockValue.toLocaleString('es-ES')}€</div>
            <div className="text-xs text-green-700 mt-0.5">Valor del inventario</div>
          </div>
        </div>

        {/* Alerts */}
        {(kpis.critical > 0 || kpis.low > 0) && (
          <div className={`p-4 border-2 rounded-xl flex items-start gap-3 ${kpis.critical > 0 ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
            <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${kpis.critical > 0 ? 'text-red-600' : 'text-amber-600'}`} />
            <div className="flex-1">
              <p className={`font-semibold ${kpis.critical > 0 ? 'text-red-900' : 'text-amber-900'}`}>
                {kpis.critical > 0
                  ? `${kpis.critical} ${kpis.critical === 1 ? 'pieza sin stock' : 'piezas sin stock'}`
                  : `${kpis.low} ${kpis.low === 1 ? 'pieza con stock bajo' : 'piezas con stock bajo'}`
                }
              </p>
              <p className={`text-sm mt-0.5 ${kpis.critical > 0 ? 'text-red-700' : 'text-amber-700'}`}>
                El stock está por debajo del mínimo configurado.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setFilterStock(kpis.critical > 0 ? 'critical' : 'low')}
                className={`px-3 py-1.5 text-white text-xs font-semibold rounded-lg ${kpis.critical > 0 ? 'bg-red-600' : 'bg-amber-600'}`}
              >
                Ver
              </button>
              <button
                onClick={handleGeneratePurchaseOrder}
                className="px-3 py-1.5 bg-gray-900 text-white text-xs font-semibold rounded-lg flex items-center gap-1"
              >
                <ShoppingCart className="w-3.5 h-3.5" /> Generar pedido
              </button>
            </div>
          </div>
        )}

        {/* Filters + Actions */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                className="pl-9 pr-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 outline-none w-56"
                placeholder="Buscar referencia, nombre..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:border-gray-900 outline-none"
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value as PartCategory | 'all')}
            >
              <option value="all">Todas las categorías</option>
              {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 focus:border-gray-900 outline-none"
              value={filterStock}
              onChange={e => setFilterStock(e.target.value as 'all' | 'low' | 'critical')}
            >
              <option value="all">Todo el stock</option>
              <option value="low">Stock bajo</option>
              <option value="critical">Sin stock</option>
            </select>
            {(search || filterCategory !== 'all' || filterStock !== 'all') && (
              <button
                onClick={() => { setSearch(''); setFilterCategory('all'); setFilterStock('all'); }}
                className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-1"
              >
                <X className="w-4 h-4" /> Limpiar
              </button>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleGeneratePurchaseOrder}
              className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl flex items-center gap-2 font-medium transition-colors"
            >
              <FileDown className="w-4 h-4" />
              Pedido automático
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2.5 bg-gray-900 hover:bg-black text-white rounded-xl flex items-center gap-2 font-medium transition-colors"
            >
              <Plus className="w-5 h-5" />
              Añadir recambio
            </button>
          </div>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-900 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Nuevo recambio</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <PartForm onSave={handleCreate} onCancel={() => setShowCreate(false)} />
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />
            Cargando inventario...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <Package className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-semibold">No hay recambios en el inventario</p>
            <p className="text-sm mt-1">Añade las piezas que usas habitualmente en el taller</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-medium"
            >
              + Añadir recambio
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Edit inline panel */}
            {editingPart && (
              <div className="p-5 border-b-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900 dark:text-gray-100">Editando: {editingPart.name}</h3>
                  <button onClick={() => setEditingPart(null)} className="p-1 hover:bg-gray-200 rounded-lg">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <PartForm part={editingPart} onSave={handleUpdate} onCancel={() => setEditingPart(null)} />
              </div>
            )}

            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Ref / Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Categoría</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Ubicación</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Coste</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">P. Venta</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Stock</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Mínimo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(part => {
                  const critical = isCriticalStock(part);
                  const low = isLowStock(part);
                  return (
                    <tr
                      key={part._id}
                      onClick={e => e.stopPropagation()}
                      className={`hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${critical ? 'bg-red-50' : low ? 'bg-amber-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{part.name}</div>
                        <div className="font-mono text-xs text-gray-500 dark:text-gray-400">{part.reference || part.partNumber}</div>
                        {part.brand && <div className="text-xs text-gray-400 dark:text-gray-500">{part.brand}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${CATEGORY_CONFIG[part.category].color}`}>
                          {CATEGORY_CONFIG[part.category].label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{part.location || '—'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {part.unitCost > 0 ? `${part.unitCost.toLocaleString('es-ES')}€` : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {part.salePrice > 0 ? `${part.salePrice.toLocaleString('es-ES')}€` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleStockAdjust(part, -1)}
                            disabled={part.stockQuantity === 0}
                            className="w-7 h-7 flex items-center justify-center border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-400 text-gray-600 dark:text-gray-400 font-bold transition-colors disabled:opacity-30"
                          >
                            −
                          </button>
                          <div className="flex flex-col items-center">
                            <span className={`text-lg font-bold ${critical ? 'text-red-700' : low ? 'text-amber-700' : 'text-gray-900 dark:text-gray-100'}`}>
                              {part.stockQuantity}
                            </span>
                            {critical && <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5" />}
                            {!critical && low && <TrendingDown className="w-3.5 h-3.5 text-amber-500 mt-0.5" />}
                          </div>
                          <button
                            onClick={() => handleStockAdjust(part, 1)}
                            className="w-7 h-7 flex items-center justify-center border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-gray-400 text-gray-600 dark:text-gray-400 font-bold transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {part.minStock > 0 ? part.minStock : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setMovementPart(part)}
                            className="p-1.5 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Movimiento de stock"
                          >
                            <ArrowLeftRight className="w-4 h-4 text-blue-600" />
                          </button>
                          <button
                            onClick={() => setHistoryPart(part)}
                            className="p-1.5 hover:bg-purple-100 rounded-lg transition-colors"
                            title="Historial"
                          >
                            <History className="w-4 h-4 text-purple-600" />
                          </button>
                          <button
                            onClick={() => setEditingPart(part)}
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                          </button>
                          <button
                            onClick={() => handleDelete(part)}
                            className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {movementPart && (
        <StockMovementModal
          part={movementPart}
          onClose={() => setMovementPart(null)}
          onSave={handleMovementSave}
          currentUser={user?.fullName || 'Sistema'}
        />
      )}

      {historyPart && (
        <StockHistoryModal
          part={historyPart}
          onClose={() => setHistoryPart(null)}
        />
      )}
    </Layout>
  );
}
