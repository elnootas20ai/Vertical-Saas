import { useState, useEffect, useMemo, useCallback } from 'react';
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
  listSuppliersRequest,
  listCatalogItemsRequest,
  type PurchaseInvoice,
  type PurchaseInvoiceLine,
  type Supplier,
  type CatalogItem,
} from '../../lib/deliveryApi';
import {
  Plus,
  Search,
  X,
  Trash2,
  Edit3,
  FileText,
  CheckCircle2,
  Clock,
  DollarSign,
  BarChart3,
  AlertTriangle,
  Minus,
  BookOpen,
  Boxes,
  Factory,
  ExternalLink,
  ShoppingBag,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

const INVOICE_STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  pending: { label: 'Pendiente', badgeClass: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800' },
  paid: { label: 'Pagada', badgeClass: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' },
  overdue: { label: 'Vencida', badgeClass: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' },
};

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: Partial<PurchaseInvoice>) => void;
  suppliers: Supplier[];
  catalogItems: CatalogItem[];
  editItem?: PurchaseInvoice | null;
}

function CreateInvoiceModal({ isOpen, onClose, onCreate, suppliers, catalogItems, editItem }: CreateInvoiceModalProps) {
  const [form, setForm] = useState({ supplierName: '', supplierId: '', date: '', dueDate: '', taxRate: '21', notes: '' });
  const [lines, setLines] = useState<{ itemName: string; quantity: string; unitPrice: string }[]>([{ itemName: '', quantity: '', unitPrice: '' }]);

  useEffect(() => {
    if (editItem) {
      setForm({
        supplierName: editItem.supplierName || '', supplierId: editItem.supplierId || '',
        date: editItem.date ? editItem.date.slice(0, 10) : '', dueDate: editItem.dueDate ? editItem.dueDate.slice(0, 10) : '',
        taxRate: String(editItem.taxRate ?? 21), notes: editItem.notes || '',
      });
      setLines(editItem.lines.length > 0 ? editItem.lines.map(l => ({ itemName: l.itemName, quantity: String(l.quantity), unitPrice: String(l.unitPrice) })) : [{ itemName: '', quantity: '', unitPrice: '' }]);
    } else {
      setForm({ supplierName: '', supplierId: '', date: '', dueDate: '', taxRate: '21', notes: '' });
      setLines([{ itemName: '', quantity: '', unitPrice: '' }]);
    }
  }, [editItem, isOpen]);

  if (!isOpen) return null;

  const addLine = () => setLines(prev => [...prev, { itemName: '', quantity: '', unitPrice: '' }]);
  const removeLine = (idx: number) => { if (lines.length <= 1) return; setLines(prev => prev.filter((_, i) => i !== idx)); };
  const updateLine = (idx: number, field: string, value: string) => { setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l)); };

  const handleSelectCatalogItem = (idx: number, itemId: string) => {
    const item = catalogItems.find(i => i._id === itemId);
    if (item) {
      updateLine(idx, 'itemName', item.name);
      updateLine(idx, 'unitPrice', String(item.costPrice || ''));
    }
  };

  const computedLines: PurchaseInvoiceLine[] = lines.filter(l => l.itemName.trim()).map((l, i) => ({
    id: editItem?.lines[i]?.id || `line-${Date.now()}-${i}`,
    itemName: l.itemName, quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0,
    total: (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
  }));

  const subtotal = computedLines.reduce((s, l) => s + l.total, 0);
  const taxRate = Number(form.taxRate) || 0;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const handleSelectSupplier = (supplierId: string) => {
    const supplier = suppliers.find(s => s._id === supplierId);
    setForm(f => ({ ...f, supplierId, supplierName: supplier?.name || '' }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplierName.trim()) { toast.error('Selecciona un proveedor'); return; }
    if (computedLines.length === 0) { toast.error('Añade al menos una línea'); return; }
    onCreate({
      ...editItem, supplierName: form.supplierName, supplierId: form.supplierId,
      date: form.date || new Date().toISOString().slice(0, 10), dueDate: form.dueDate,
      lines: computedLines, subtotal, taxRate, taxAmount, total, notes: form.notes,
      status: editItem?.status || 'pending',
    });
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{editItem ? 'Editar pedido' : 'Nuevo pedido de compra'}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{editItem ? 'Modifica los datos del pedido' : 'Registra un nuevo pedido a proveedor'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"><X className="w-5 h-5 text-gray-500 dark:text-gray-400" /></button>
        </div>
        <form id="create-invoice-form" onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Proveedor *</label>
              {suppliers.length > 0 ? (
                <select className={inputClass} value={form.supplierId} onChange={e => handleSelectSupplier(e.target.value)}>
                  <option value="">Seleccionar proveedor</option>
                  {suppliers.filter(s => s.active).map(s => (<option key={s._id} value={s._id}>{s.name}</option>))}
                </select>
              ) : (
                <input className={inputClass} placeholder="Nombre del proveedor" value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} />
              )}
            </div>
            <div><label className={labelClass}>% IVA</label><input type="number" className={inputClass} placeholder="21" value={form.taxRate} onChange={e => setForm(f => ({ ...f, taxRate: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Fecha pedido</label><input type="date" className={inputClass} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div><label className={labelClass}>Fecha vencimiento</label><input type="date" className={inputClass} value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Líneas del pedido</label>
              <button type="button" onClick={addLine} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Añadir línea
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 relative">
                    <input className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" placeholder="Artículo" value={line.itemName} onChange={e => updateLine(idx, 'itemName', e.target.value)} />
                    {catalogItems.length > 0 && !line.itemName && (
                      <select className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => { if (e.target.value) handleSelectCatalogItem(idx, e.target.value); }}>
                        <option value="">Seleccionar del catálogo...</option>
                        {catalogItems.map(item => (<option key={item._id} value={item._id}>{item.name} — {item.costPrice.toFixed(2)}€</option>))}
                      </select>
                    )}
                  </div>
                  <input type="number" className="w-24 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" placeholder="Cant." value={line.quantity} onChange={e => updateLine(idx, 'quantity', e.target.value)} />
                  <input type="number" step="0.01" className="w-28 px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" placeholder="Precio €" value={line.unitPrice} onChange={e => updateLine(idx, 'unitPrice', e.target.value)} />
                  <div className="w-24 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 text-right">{((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)).toFixed(2)}€</div>
                  <button type="button" onClick={() => removeLine(idx)} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors shrink-0" disabled={lines.length <= 1}><Minus className="w-4 h-4 text-red-500" /></button>
                </div>
              ))}
            </div>
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-sm space-y-1">
              <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>Subtotal</span><span>{subtotal.toFixed(2)}€</span></div>
              <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>IVA ({taxRate}%)</span><span>{taxAmount.toFixed(2)}€</span></div>
              <div className="flex justify-between font-bold text-gray-900 dark:text-gray-100 pt-1 border-t border-gray-200 dark:border-gray-700"><span>Total</span><span>{total.toFixed(2)}€</span></div>
            </div>
          </div>

          <div><label className={`block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5`}>Notas</label><textarea rows={2} className={`${inputClass} resize-none`} placeholder="Notas adicionales..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
        </form>

        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3 rounded-b-2xl">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
          <button type="submit" form="create-invoice-form" className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl font-semibold transition-colors">{editItem ? 'Guardar cambios' : 'Crear pedido'}</button>
        </div>
      </div>
    </div>
  );
}

export function OrdersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<PurchaseInvoice | null>(null);
  const [searchInvoice, setSearchInvoice] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  useModalClose(showCreateInvoice, () => { setShowCreateInvoice(false); setEditingInvoice(null); });

  useNotificationOpen(
    useCallback((entityId: string) => {
      const inv = invoices.find((i) => i._id === entityId);
      if (inv) { setEditingInvoice(inv); setShowCreateInvoice(true); }
    }, [invoices]),
    !loading,
  );

  const ORDER_AI_FIELDS: AIFieldDef[] = [
    { key: 'supplierName', label: 'Proveedor' },
    { key: 'date', label: 'Fecha pedido' },
    { key: 'dueDate', label: 'Fecha vencimiento' },
    { key: 'taxRate', label: '% IVA', type: 'number' },
    { key: 'lines', label: 'Líneas (artículo, cantidad, precio)' },
    { key: 'notes', label: 'Notas' },
  ];

  const ORDER_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'supplierName', label: 'Proveedor', required: true, example: 'Proveedor SL' },
    { key: 'date', label: 'Fecha pedido', example: '2024-01-15' },
    { key: 'dueDate', label: 'Fecha vencimiento', example: '2024-02-15' },
    { key: 'itemName', label: 'Artículo', required: true, example: 'Producto A' },
    { key: 'quantity', label: 'Cantidad', required: true, example: '10' },
    { key: 'unitPrice', label: 'Precio unitario', required: true, example: '5.50' },
    { key: 'taxRate', label: '% IVA', example: '21' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    if (!user?.id) return;
    let created = 0;
    for (const entry of entries) {
      try {
        const lines = Array.isArray(entry.lines) ? entry.lines.map((l: any, i: number) => ({
          id: `line-${Date.now()}-${i}`,
          itemName: l.itemName || l.name || '',
          quantity: Number(l.quantity) || 0,
          unitPrice: Number(l.unitPrice) || 0,
          total: (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
        })) : [];
        const subtotal = lines.reduce((s: number, l: any) => s + l.total, 0);
        const taxRate = Number(entry.taxRate) || 21;
        const taxAmount = subtotal * (taxRate / 100);
        const inv = await createPurchaseInvoiceRequest(user.id, {
          supplierName: String(entry.supplierName || ''),
          date: String(entry.date || new Date().toISOString().slice(0, 10)),
          dueDate: String(entry.dueDate || ''),
          lines, subtotal, taxRate, taxAmount, total: subtotal + taxAmount,
          notes: String(entry.notes || ''), status: 'pending',
        } as any);
        setInvoices(prev => [inv, ...prev]);
        created++;
      } catch { /* skip */ }
    }
    toast.success(`${created} pedido(s) creado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    if (!user?.id) return;
    let created = 0;
    for (const entry of entries) {
      try {
        const lines = [{
          id: `line-${Date.now()}-0`,
          itemName: entry.itemName || '',
          quantity: Number(entry.quantity) || 0,
          unitPrice: Number(entry.unitPrice) || 0,
          total: (Number(entry.quantity) || 0) * (Number(entry.unitPrice) || 0),
        }];
        const subtotal = lines[0].total;
        const taxRate = Number(entry.taxRate) || 21;
        const taxAmount = subtotal * (taxRate / 100);
        const inv = await createPurchaseInvoiceRequest(user.id, {
          supplierName: entry.supplierName || '',
          date: entry.date || new Date().toISOString().slice(0, 10),
          dueDate: entry.dueDate || '',
          lines, subtotal, taxRate, taxAmount, total: subtotal + taxAmount,
          notes: entry.notes || '', status: 'pending',
        } as any);
        setInvoices(prev => [inv, ...prev]);
        created++;
      } catch { /* skip */ }
    }
    toast.success(`${created} pedido(s) importado(s)`);
  };

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [invs, sups, items] = await Promise.all([
        listPurchaseInvoicesRequest(user.id),
        listSuppliersRequest(user.id),
        listCatalogItemsRequest(user.id),
      ]);
      setInvoices(invs);
      setSuppliers(sups);
      setCatalogItems(items);
    } catch {
      toast.error('Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreateInvoice = async (data: Partial<PurchaseInvoice>) => {
    if (!user?.id) return;
    try {
      if (editingInvoice) {
        const updated = await updatePurchaseInvoiceRequest(user.id, { ...editingInvoice, ...data } as PurchaseInvoice);
        setInvoices(prev => prev.map(i => i._id === updated._id ? updated : i));
        toast.success('Pedido actualizado');
      } else {
        const created = await createPurchaseInvoiceRequest(user.id, data);
        setInvoices(prev => [created, ...prev]);
        toast.success('Pedido creado');
      }
      setShowCreateInvoice(false);
      setEditingInvoice(null);
    } catch {
      toast.error('Error al guardar el pedido');
    }
  };

  const handleDeleteInvoice = async (invoice: PurchaseInvoice) => {
    if (!user?.id) return;
    if (!confirm(`¿Eliminar pedido ${invoice.invoiceNumber || 'sin número'}?`)) return;
    try {
      await deletePurchaseInvoiceRequest(user.id, invoice._id);
      setInvoices(prev => prev.filter(i => i._id !== invoice._id));
      toast.success('Pedido eliminado');
    } catch {
      toast.error('Error al eliminar el pedido');
    }
  };

  const handleToggleInvoiceStatus = async (invoice: PurchaseInvoice) => {
    if (!user?.id) return;
    const newStatus = invoice.status === 'paid' ? 'pending' : 'paid';
    try {
      const updated = await updatePurchaseInvoiceRequest(user.id, {
        ...invoice, status: newStatus,
        paidAt: newStatus === 'paid' ? new Date().toISOString() : '',
      });
      setInvoices(prev => prev.map(i => i._id === updated._id ? updated : i));
      toast.success(`Pedido marcado como ${INVOICE_STATUS_CONFIG[newStatus].label.toLowerCase()}`);
    } catch {
      toast.error('Error al actualizar el pedido');
    }
  };

  const kpis = useMemo(() => ({
    total: invoices.length,
    pending: invoices.filter(i => i.status === 'pending').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    totalAmount: invoices.reduce((s, i) => s + (i.total || 0), 0),
    pendingAmount: invoices.filter(i => i.status === 'pending').reduce((s, i) => s + (i.total || 0), 0),
  }), [invoices]);

  const invoicesWithOverdue = useMemo(() => {
    return invoices.map(inv => {
      if (inv.status === 'pending' && inv.dueDate && new Date(inv.dueDate) < new Date()) {
        return { ...inv, displayStatus: 'overdue' as const };
      }
      return { ...inv, displayStatus: inv.status as string };
    });
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    let items = invoicesWithOverdue;
    if (activeTab === 'pending') items = items.filter(i => i.status === 'pending');
    else if (activeTab === 'paid') items = items.filter(i => i.status === 'paid');
    else if (activeTab === 'overdue') items = items.filter(i => i.displayStatus === 'overdue');
    if (searchInvoice) {
      const q = searchInvoice.toLowerCase();
      items = items.filter(i => i.supplierName?.toLowerCase().includes(q) || i.invoiceNumber?.toLowerCase().includes(q));
    }
    return items;
  }, [invoicesWithOverdue, activeTab, searchInvoice]);

  const overdueCount = invoicesWithOverdue.filter(i => i.displayStatus === 'overdue').length;

  const tabsConfig = [
    { id: 'all', label: 'Todos', count: invoices.length || undefined },
    { id: 'pending', label: 'Pendientes', count: kpis.pending || undefined },
    { id: 'paid', label: 'Pagados', count: kpis.paid || undefined },
    { id: 'overdue', label: 'Vencidos', count: overdueCount || undefined },
  ];

  return (
    <Layout title="Pedidos" subtitle="Gestión de pedidos de compra y facturas de proveedores">
      <div className="space-y-6">
        {/* Quick nav */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/saas/catalog')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> Catálogo <ExternalLink className="w-3 h-3" />
          </button>
          <button onClick={() => navigate('/saas/articles')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
            <Boxes className="w-3.5 h-3.5" /> Artículos <ExternalLink className="w-3 h-3" />
          </button>
          <button onClick={() => navigate('/saas/suppliers')} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5">
            <Factory className="w-3.5 h-3.5" /> Proveedores <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        {/* Filters & Actions */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input className="pl-9 pr-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-64" placeholder="Buscar por proveedor o nº factura..." value={searchInvoice} onChange={e => setSearchInvoice(e.target.value)} />
          </div>
          <AddButtonDropdown
            label="Nuevo pedido"
            onQuickAdd={() => { setEditingInvoice(null); setShowCreateInvoice(true); }}
            onAIAdd={() => setShowAIModal(true)}
            onImport={() => setShowImportModal(true)}
            quickAddLabel="Alta rápida"
            quickAddDesc="Formulario de nuevo pedido"
          />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="text-blue-600 mb-2"><ShoppingBag className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-200">{kpis.total}</div>
            <div className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">Total pedidos</div>
          </div>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
            <div className="text-amber-600 mb-2"><Clock className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-200">{kpis.pendingAmount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
            <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{kpis.pending} pendientes</div>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
            <div className="text-green-600 mb-2"><CheckCircle2 className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-green-900 dark:text-green-200">{kpis.paid}</div>
            <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">Pagados</div>
          </div>
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-200 dark:border-purple-800 rounded-xl">
            <div className="text-purple-600 mb-2"><BarChart3 className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-200">{kpis.totalAmount.toLocaleString('es-ES', { maximumFractionDigits: 0 })}€</div>
            <div className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">Total importe</div>
          </div>
        </div>

        {/* Overdue alert */}
        {overdueCount > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <p className="font-bold text-red-900 dark:text-red-300">Tienes {overdueCount} pedido{overdueCount > 1 ? 's' : ''} vencido{overdueCount > 1 ? 's' : ''}</p>
              <p className="text-sm text-red-700 dark:text-red-400">Revisa los pagos pendientes que han superado la fecha de vencimiento.</p>
            </div>
            <button onClick={() => setActiveTab('overdue')} className="ml-auto px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors shrink-0">Ver vencidos</button>
          </div>
        )}

        {/* Tabs */}
        <Tabs tabs={tabsConfig} activeTab={activeTab} onChange={setActiveTab} />

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />
            Cargando pedidos...
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <FileText className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-semibold">Sin pedidos de compra</p>
            <p className="text-sm mt-1">Registra el primer pedido a un proveedor</p>
            <button onClick={() => { setEditingInvoice(null); setShowCreateInvoice(true); }} className="mt-4 px-4 py-2 bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white rounded-xl text-sm font-medium">+ Nuevo pedido</button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Nº Pedido</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Proveedor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Vencimiento</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Líneas</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredInvoices.map(invoice => {
                    const statusCfg = INVOICE_STATUS_CONFIG[invoice.displayStatus] || INVOICE_STATUS_CONFIG.pending;
                    const originalInvoice = invoices.find(i => i._id === invoice._id)!;
                    return (
                      <tr key={invoice._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-3"><div className="font-mono text-sm font-bold text-gray-900 dark:text-gray-100">{invoice.invoiceNumber || '—'}</div></td>
                        <td className="px-4 py-3">
                          <button onClick={() => invoice.supplierId ? navigate(`/saas/suppliers/${invoice.supplierId}`) : navigate('/saas/suppliers')} className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">{invoice.supplierName}</button>
                        </td>
                        <td className="px-4 py-3"><span className="text-sm text-gray-700 dark:text-gray-300">{invoice.date ? new Date(invoice.date).toLocaleDateString('es-ES') : '—'}</span></td>
                        <td className="px-4 py-3"><span className={`text-sm ${invoice.displayStatus === 'overdue' ? 'text-red-600 font-semibold' : 'text-gray-700 dark:text-gray-300'}`}>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('es-ES') : '—'}</span></td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 text-xs font-semibold rounded-full border ${statusCfg.badgeClass}`}>{statusCfg.label}</span></td>
                        <td className="px-4 py-3"><span className="text-sm text-gray-700 dark:text-gray-300">{invoice.lines.length} línea{invoice.lines.length !== 1 ? 's' : ''}</span></td>
                        <td className="px-4 py-3"><div className="font-bold text-gray-900 dark:text-gray-100 text-sm">{(invoice.total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</div></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {originalInvoice.status !== 'paid' && (
                              <button onClick={() => handleToggleInvoiceStatus(originalInvoice)} className="p-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors" title="Marcar como pagado"><CheckCircle2 className="w-4 h-4 text-green-600" /></button>
                            )}
                            {originalInvoice.status === 'paid' && (
                              <button onClick={() => handleToggleInvoiceStatus(originalInvoice)} className="p-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-colors" title="Marcar como pendiente"><Clock className="w-4 h-4 text-amber-600" /></button>
                            )}
                            <button onClick={() => { setEditingInvoice(originalInvoice); setShowCreateInvoice(true); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" title="Editar"><Edit3 className="w-4 h-4 text-gray-600 dark:text-gray-400" /></button>
                            <button onClick={() => handleDeleteInvoice(originalInvoice)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Eliminar"><Trash2 className="w-4 h-4 text-red-500" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <CreateInvoiceModal
        isOpen={showCreateInvoice}
        onClose={() => { setShowCreateInvoice(false); setEditingInvoice(null); }}
        onCreate={handleCreateInvoice}
        suppliers={suppliers}
        catalogItems={catalogItems}
        editItem={editingInvoice}
      />

      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="orders"
        moduleLabel="Pedidos"
        fields={ORDER_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />

      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Pedidos"
        fields={ORDER_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
