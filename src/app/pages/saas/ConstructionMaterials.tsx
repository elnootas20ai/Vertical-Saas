import { useState, useMemo } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useModalClose } from '../../hooks/useModalClose';
import {
  Search, Plus, X, Edit3, Filter, Package, Boxes,
  TrendingUp, ShoppingCart, AlertTriangle,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { toast } from 'sonner';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

type Categoria = 'cemento' | 'acero' | 'madera' | 'cerámica' | 'electricidad' | 'fontanería';

interface Material {
  id: number;
  nombre: string;
  categoria: Categoria;
  stock: number;
  unidad: string;
  precioUnitario: number;
  proveedor: string;
  proyectoDestino: string;
  stockMinimo: number;
}

const mockMaterials: Material[] = [];

const categorias: Categoria[] = ['cemento', 'acero', 'madera', 'cerámica', 'electricidad', 'fontanería'];

const emptyMaterial: Omit<Material, 'id'> = { nombre: '', categoria: 'cemento', stock: 0, unidad: 'ud', precioUnitario: 0, proveedor: '', proyectoDestino: '', stockMinimo: 0 };

export function ConstructionMaterials() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [search, setSearch] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('todos');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState(emptyMaterial);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const MODULE_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'category', label: 'Categoría' },
    { key: 'unit', label: 'Unidad' },
    { key: 'price', label: 'Precio' },
    { key: 'supplier', label: 'Proveedor' },
    { key: 'stock', label: 'Stock' },
  ];

  const MODULE_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre', required: true, example: '' },
    { key: 'category', label: 'Categoría', example: '' },
    { key: 'unit', label: 'Unidad', example: '' },
    { key: 'price', label: 'Precio', example: '' },
    { key: 'supplier', label: 'Proveedor', example: '' },
    { key: 'stock', label: 'Stock', example: '' },
  ];

  const handleAIEntries = async (entries: Record<string, unknown>[]) => {
    toast.success(`${entries.length} material(s) parseado(s) con IA`);
  };

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    toast.success(`${entries.length} material(s) importado(s)`);
  };

  useModalClose(modalOpen, () => setModalOpen(false));

  const filtered = useMemo(() => materials.filter(m => {
    const matchSearch = `${m.nombre} ${m.proveedor} ${m.proyectoDestino}`.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategoria === 'todos' || m.categoria === filterCategoria;
    return matchSearch && matchCat;
  }), [materials, search, filterCategoria]);

  const stats = useMemo(() => ({
    enStock: materials.length,
    valorInventario: materials.reduce((s, m) => s + m.stock * m.precioUnitario, 0),
    bajoMinimo: materials.filter(m => m.stock <= m.stockMinimo).length,
  }), [materials]);

  const openCreate = () => { setEditing(null); setForm(emptyMaterial); setModalOpen(true); };
  const openEdit = (m: Material) => { setEditing(m); setForm({ nombre: m.nombre, categoria: m.categoria, stock: m.stock, unidad: m.unidad, precioUnitario: m.precioUnitario, proveedor: m.proveedor, proyectoDestino: m.proyectoDestino, stockMinimo: m.stockMinimo }); setModalOpen(true); };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    if (editing) {
      setMaterials(prev => prev.map(m => m.id === editing.id ? { ...m, ...form } : m));
    } else {
      setMaterials(prev => [...prev, { ...form, id: Math.max(...prev.map(m => m.id)) + 1 }]);
    }
    setModalOpen(false);
  };

  const fmt = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <Layout title="Materiales">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Materiales en stock', value: stats.enStock, icon: Package, color: 'text-blue-600' },
          { label: 'Valor inventario', value: fmt(stats.valorInventario), icon: TrendingUp, color: 'text-purple-600' },
          { label: 'Bajo stock mínimo', value: stats.bajoMinimo, icon: AlertTriangle, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2"><s.icon className={`w-5 h-5 ${s.color}`} /><span className="text-sm text-gray-500 dark:text-gray-400">{s.label}</span></div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" placeholder="Buscar materiales..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-900 dark:focus:border-gray-400" />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)} className="pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none appearance-none cursor-pointer">
              <option value="todos">Todas las categorías</option>
              {categorias.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <AddButtonDropdown
                label="Nuevo material"
                onQuickAdd={openCreate}
                onAIAdd={() => setShowAIModal(true)}
                onImport={() => setShowImportModal(true)}
                quickAddLabel="Alta rápida"
                quickAddDesc="Formulario de material"
              />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
              {['Material', 'Categoría', 'Stock', 'Unidad', 'Precio ud.', 'Proveedor', 'Proyecto destino', ''].map(h => (
                <th key={h} className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => {
              const lowStock = m.stock <= m.stockMinimo;
              return (
                <tr key={m.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-gray-400 shrink-0" />{m.nombre}
                    {lowStock && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                  </td>
                  <td className="px-4 py-3"><span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 capitalize">{m.categoria}</span></td>
                  <td className={`px-4 py-3 font-semibold ${lowStock ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>{m.stock.toLocaleString('es-ES')}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{m.unidad}</td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-200 whitespace-nowrap">{fmt(m.precioUnitario)}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{m.proveedor}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{m.proyectoDestino || <span className="text-gray-400 italic">—</span>}</td>
                  <td className="px-4 py-3"><button onClick={() => openEdit(m)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Edit3 className="w-4 h-4 text-gray-500" /></button></td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">No se encontraron materiales</td></tr>}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <form onSubmit={handleSave} onClick={e => e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{editing ? 'Editar material' : 'Nuevo material'}</h2>
              <button type="button" onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label className={labelClass}>Nombre</label><input className={inputClass} value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required /></div>
              <div>
                <label className={labelClass}>Categoría</label>
                <select className={inputClass} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value as Categoria })}>
                  {categorias.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <div><label className={labelClass}>Unidad</label><input className={inputClass} value={form.unidad} onChange={e => setForm({ ...form, unidad: e.target.value })} /></div>
              <div><label className={labelClass}>Stock</label><input type="number" className={inputClass} value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} /></div>
              <div><label className={labelClass}>Stock mínimo</label><input type="number" className={inputClass} value={form.stockMinimo} onChange={e => setForm({ ...form, stockMinimo: Number(e.target.value) })} /></div>
              <div><label className={labelClass}>Precio unitario (€)</label><input type="number" step="0.01" className={inputClass} value={form.precioUnitario} onChange={e => setForm({ ...form, precioUnitario: Number(e.target.value) })} /></div>
              <div><label className={labelClass}>Proveedor</label><input className={inputClass} value={form.proveedor} onChange={e => setForm({ ...form, proveedor: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className={labelClass}>Proyecto destino</label><input className={inputClass} value={form.proyectoDestino} onChange={e => setForm({ ...form, proyectoDestino: e.target.value })} /></div>
            </div>
            <div className="sticky bottom-0 bg-white dark:bg-gray-800 flex gap-3 p-6 border-t border-gray-200 dark:border-gray-700 rounded-b-2xl">
              <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancelar</button>
              <button type="submit" className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 rounded-xl font-semibold transition-colors">Guardar</button>
            </div>
          </form>
        </div>
      )}
    
      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="construction_materials"
        moduleLabel="Materiales"
        fields={MODULE_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
      />
      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Materiales"
        fields={MODULE_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
