import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useModalClose } from '../../hooks/useModalClose';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  listCatalogItemsRequest,
  listSuppliersRequest,
  type CatalogItem,
  type Supplier,
} from '../../lib/deliveryApi';
import {
  Plus,
  Search,
  X,
  Trash2,
  Edit3,
  Calculator,
  ShoppingBag,
  Minus,
  Copy,
  ChevronDown,
  ChevronUp,
  PieChart,
  Utensils,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { AddButtonDropdown } from '../../components/saas/AddButtonDropdown';
import { AIAddModal, type AIFieldDef } from '../../components/saas/AIAddModal';
import { GenericImportModal, type ImportFieldDef } from '../../components/saas/GenericImportModal';

interface RecipeIngredient {
  id: string;
  catalogItemId: string;
  name: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  totalCost: number;
  waste: number;
}

interface Recipe {
  id: string;
  name: string;
  category: string;
  portions: number;
  salePrice: number;
  ingredients: RecipeIngredient[];
  notes: string;
  createdAt: string;
  active: boolean;
}

const RECIPE_STORAGE_KEY = 'saas-costing-recipes';

function loadRecipes(): Recipe[] {
  try {
    const raw = localStorage.getItem(RECIPE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Recipe[];
    return parsed.map(r => ({ ...r, active: r.active ?? true }));
  } catch {
    return [];
  }
}

function saveRecipes(recipes: Recipe[]) {
  localStorage.setItem(RECIPE_STORAGE_KEY, JSON.stringify(recipes));
}

interface RecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (recipe: Recipe) => void;
  catalogItems: CatalogItem[];
  editItem?: Recipe | null;
}

function RecipeModal({ isOpen, onClose, onSave, catalogItems, editItem }: RecipeModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [portions, setPortions] = useState('1');
  const [salePrice, setSalePrice] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [ingredients, setIngredients] = useState<{
    catalogItemId: string; name: string; quantity: string; unit: string; costPerUnit: string; waste: string;
  }[]>([{ catalogItemId: '', name: '', quantity: '', unit: 'kg', costPerUnit: '', waste: '0' }]);

  useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setCategory(editItem.category);
      setPortions(String(editItem.portions));
      setSalePrice(String(editItem.salePrice || ''));
      setNotes(editItem.notes);
      setIsActive(editItem.active ?? true);
      setIngredients(
        editItem.ingredients.map(i => ({
          catalogItemId: i.catalogItemId,
          name: i.name,
          quantity: String(i.quantity),
          unit: i.unit,
          costPerUnit: String(i.costPerUnit),
          waste: String(i.waste || 0),
        })),
      );
    } else {
      setName('');
      setCategory('');
      setPortions('1');
      setSalePrice('');
      setNotes('');
      setIsActive(true);
      setIngredients([{ catalogItemId: '', name: '', quantity: '', unit: 'kg', costPerUnit: '', waste: '0' }]);
    }
  }, [editItem, isOpen]);

  if (!isOpen) return null;

  const addIngredient = () => setIngredients(prev => [...prev, { catalogItemId: '', name: '', quantity: '', unit: 'kg', costPerUnit: '', waste: '0' }]);
  const removeIngredient = (idx: number) => { if (ingredients.length <= 1) return; setIngredients(prev => prev.filter((_, i) => i !== idx)); };
  const updateIngredient = (idx: number, field: string, value: string) => setIngredients(prev => prev.map((ing, i) => (i === idx ? { ...ing, [field]: value } : ing)));

  const handleSelectCatalogItem = (idx: number, itemId: string) => {
    const item = catalogItems.find(i => i._id === itemId);
    if (item) {
      setIngredients(prev => prev.map((ing, i) =>
        i === idx ? { ...ing, catalogItemId: item._id, name: item.name, costPerUnit: String(item.costPrice || 0), unit: item.unit || 'kg' } : ing,
      ));
    }
  };

  const computedIngredients: RecipeIngredient[] = ingredients.filter(i => i.name.trim()).map((i, idx) => {
    const qty = Number(i.quantity) || 0;
    const cost = Number(i.costPerUnit) || 0;
    const waste = Number(i.waste) || 0;
    const effectiveQty = qty * (1 + waste / 100);
    return {
      id: editItem?.ingredients[idx]?.id || `ing-${Date.now()}-${idx}`,
      catalogItemId: i.catalogItemId,
      name: i.name,
      quantity: qty,
      unit: i.unit,
      costPerUnit: cost,
      totalCost: effectiveQty * cost,
      waste,
    };
  });

  const totalCost = computedIngredients.reduce((s, i) => s + i.totalCost, 0);
  const portionsNum = Number(portions) || 1;
  const costPerPortion = totalCost / portionsNum;
  const salePriceNum = Number(salePrice) || 0;
  const margin = salePriceNum > 0 ? ((salePriceNum - costPerPortion) / salePriceNum) * 100 : 0;
  const foodCostPct = salePriceNum > 0 ? (costPerPortion / salePriceNum) * 100 : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (computedIngredients.length === 0) { toast.error('Añade al menos un ingrediente'); return; }
    onSave({
      id: editItem?.id || `recipe-${Date.now()}`,
      name,
      category,
      portions: portionsNum,
      salePrice: salePriceNum,
      ingredients: computedIngredients,
      notes,
      createdAt: editItem?.createdAt || new Date().toISOString(),
      active: isActive,
    });
  };

  const inputClass = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {editItem ? 'Editar escandallo' : 'Nuevo escandallo'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {editItem ? 'Modifica la receta y sus ingredientes' : 'Calcula el coste de producción de una receta'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div><label className={labelClass}>Nombre de la receta *</label><input className={inputClass} placeholder="Ej: Pizza Margarita" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
            <div><label className={labelClass}>Categoría</label><input className={inputClass} placeholder="Ej: Entrantes, Principales..." value={category} onChange={e => setCategory(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className={labelClass}>Nº Raciones</label><input type="number" min="1" className={inputClass} value={portions} onChange={e => setPortions(e.target.value)} /></div>
            <div><label className={labelClass}>PVP por ración (€)</label><input type="number" step="0.01" className={inputClass} placeholder="0.00" value={salePrice} onChange={e => setSalePrice(e.target.value)} /></div>
            <div className="flex items-end pb-1">
              <div className="w-full p-3 bg-gray-50 dark:bg-gray-900 rounded-xl text-center">
                <div className="text-xs text-gray-500 dark:text-gray-400">Food Cost</div>
                <div className={`text-lg font-bold ${foodCostPct > 35 ? 'text-red-600' : foodCostPct > 25 ? 'text-amber-600' : 'text-green-600'}`}>
                  {salePriceNum > 0 ? `${foodCostPct.toFixed(1)}%` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ingredientes</label>
              <button type="button" onClick={addIngredient} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Añadir
              </button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_80px_70px_90px_70px_90px_36px] gap-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase px-1">
                <span>Ingrediente</span><span>Cantidad</span><span>Unidad</span><span>€/unidad</span><span>Merma %</span><span className="text-right">Coste</span><span />
              </div>
              {ingredients.map((ing, idx) => {
                const qty = Number(ing.quantity) || 0;
                const cost = Number(ing.costPerUnit) || 0;
                const waste = Number(ing.waste) || 0;
                const lineCost = qty * (1 + waste / 100) * cost;
                return (
                  <div key={idx} className="grid grid-cols-[1fr_80px_70px_90px_70px_90px_36px] gap-2 items-center">
                    <div className="relative">
                      <input className="w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" placeholder="Ingrediente" value={ing.name} onChange={e => updateIngredient(idx, 'name', e.target.value)} />
                      {catalogItems.length > 0 && !ing.name && (
                        <select className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => { if (e.target.value) handleSelectCatalogItem(idx, e.target.value); }}>
                          <option value="">Del catálogo...</option>
                          {catalogItems.map(item => <option key={item._id} value={item._id}>{item.name} ({item.costPrice.toFixed(2)}€/{item.unit})</option>)}
                        </select>
                      )}
                    </div>
                    <input type="number" step="0.001" className="w-full px-2 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" placeholder="0" value={ing.quantity} onChange={e => updateIngredient(idx, 'quantity', e.target.value)} />
                    <select className="w-full px-1 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm outline-none" value={ing.unit} onChange={e => updateIngredient(idx, 'unit', e.target.value)}>
                      <option value="kg">kg</option><option value="g">g</option><option value="l">l</option><option value="ml">ml</option><option value="ud">ud</option><option value="caja">caja</option>
                    </select>
                    <input type="number" step="0.01" className="w-full px-2 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" placeholder="0.00" value={ing.costPerUnit} onChange={e => updateIngredient(idx, 'costPerUnit', e.target.value)} />
                    <input type="number" step="1" min="0" max="100" className="w-full px-2 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" placeholder="0" value={ing.waste} onChange={e => updateIngredient(idx, 'waste', e.target.value)} />
                    <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 text-right pr-1">{lineCost.toFixed(2)}€</div>
                    <button type="button" onClick={() => removeIngredient(idx)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors" disabled={ingredients.length <= 1}>
                      <Minus className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl space-y-2">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>Coste total ingredientes</span><span className="font-bold">{totalCost.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>Raciones: {portionsNum}</span><span className="font-bold">{costPerPortion.toFixed(2)}€/ración</span>
              </div>
              {salePriceNum > 0 && (
                <>
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">PVP por ración</span><span className="font-bold text-gray-900 dark:text-gray-100">{salePriceNum.toFixed(2)}€</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Margen bruto</span>
                    <span className={`font-bold ${margin >= 65 ? 'text-green-600' : margin >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                      {margin.toFixed(1)}% ({(salePriceNum - costPerPortion).toFixed(2)}€)
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Food Cost</span>
                    <span className={`font-bold ${foodCostPct > 35 ? 'text-red-600' : foodCostPct > 25 ? 'text-amber-600' : 'text-green-600'}`}>
                      {foodCostPct.toFixed(1)}%
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
            <div>
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">Estado del escandallo</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {isActive ? 'Vinculado a producto activo' : 'Cálculo independiente, no vinculado a producto'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
              }`}
            >
              {isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
              {isActive ? 'Activo' : 'No activo'}
            </button>
          </div>

          <div><label className={labelClass}>Notas</label><textarea rows={2} className={`${inputClass} resize-none`} placeholder="Instrucciones, notas..." value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 -mx-6 px-6 -mb-6 pb-6 pt-4 flex gap-3 rounded-b-2xl">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancelar</button>
            <button type="submit" className="flex-1 px-4 py-3 bg-gray-900 hover:bg-black dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-white rounded-xl font-semibold transition-colors">
              {editItem ? 'Guardar cambios' : 'Crear escandallo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CostingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState<Recipe[]>(loadRecipes);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [search, setSearch] = useState('');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  useModalClose(showModal, () => { setShowModal(false); setEditingRecipe(null); });

  const COSTING_IMPORT_FIELDS: ImportFieldDef[] = [
    { key: 'name', label: 'Nombre receta', required: true, example: 'Hamburguesa clásica' },
    { key: 'category', label: 'Categoría', example: 'Entrantes' },
    { key: 'portions', label: 'Raciones', example: '4' },
    { key: 'salePrice', label: 'Precio venta', required: true, example: '12.00' },
    { key: 'notes', label: 'Notas', example: '' },
  ];

  const handleImportEntries = async (entries: Record<string, string>[]) => {
    let created = 0;
    for (const entry of entries) {
      const recipe: Recipe = {
        id: `recipe-${Date.now()}-${created}`,
        name: entry.name || '',
        category: entry.category || '',
        portions: Number(entry.portions) || 1,
        salePrice: Number(entry.salePrice) || 0,
        ingredients: [],
        notes: entry.notes || '',
        createdAt: new Date().toISOString(),
        active: entry.active !== undefined ? entry.active === 'true' || entry.active === '1' : true,
      };
      const updated = [...recipes, recipe];
      setRecipes(updated);
      saveRecipes(updated);
      created++;
    }
    toast.success(`${created} escandallo(s) importado(s)`);
  };

  const COSTING_AI_FIELDS: AIFieldDef[] = [
    { key: 'name', label: 'Nombre receta' },
    { key: 'category', label: 'Categoría' },
    { key: 'portions', label: 'Raciones', type: 'number' },
    { key: 'salePrice', label: 'Precio venta', type: 'number' },
    { key: 'ingredients', label: 'Ingredientes (nombre, cantidad, unidad, coste)' },
    { key: 'notes', label: 'Notas' },
  ];

  const handleAIEntries = (entries: Record<string, unknown>[]) => {
    let created = 0;
    for (const entry of entries) {
      const ingredients = Array.isArray(entry.ingredients) ? entry.ingredients.map((ing: any, i: number) => ({
        id: `ing-${Date.now()}-${i}`,
        catalogItemId: '',
        name: ing.name || '',
        quantity: Number(ing.quantity) || 0,
        unit: ing.unit || 'ud',
        costPerUnit: Number(ing.costPerUnit) || 0,
        totalCost: (Number(ing.quantity) || 0) * (Number(ing.costPerUnit) || 0),
        waste: Number(ing.waste) || 0,
      })) : [];
      const recipe: Recipe = {
        id: `recipe-${Date.now()}-${created}`,
        name: String(entry.name || ''),
        category: String(entry.category || ''),
        portions: Number(entry.portions) || 1,
        salePrice: Number(entry.salePrice) || 0,
        ingredients,
        notes: String(entry.notes || ''),
        createdAt: new Date().toISOString(),
        active: true,
      };
      const updated = [...recipes, recipe];
      setRecipes(updated);
      saveRecipes(updated);
      created++;
    }
    toast.success(`${created} escandallo(s) creado(s) con IA`);
  };
  const [expandedRecipe, setExpandedRecipe] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');

  useEffect(() => { saveRecipes(recipes); }, [recipes]);

  const loadCatalog = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const items = await listCatalogItemsRequest(user.id);
      setCatalogItems(items);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const handleSaveRecipe = (recipe: Recipe) => {
    if (editingRecipe) {
      setRecipes(prev => prev.map(r => (r.id === recipe.id ? recipe : r)));
      toast.success('Escandallo actualizado');
    } else {
      setRecipes(prev => [recipe, ...prev]);
      toast.success('Escandallo creado');
    }
    setShowModal(false);
    setEditingRecipe(null);
  };

  const handleDelete = (recipe: Recipe) => {
    if (!confirm(`¿Eliminar "${recipe.name}"?`)) return;
    setRecipes(prev => prev.filter(r => r.id !== recipe.id));
    if (expandedRecipe === recipe.id) setExpandedRecipe(null);
    toast.success('Escandallo eliminado');
  };

  const handleDuplicate = (recipe: Recipe) => {
    const dup: Recipe = {
      ...recipe,
      id: `recipe-${Date.now()}`,
      name: `${recipe.name} (copia)`,
      createdAt: new Date().toISOString(),
    };
    setRecipes(prev => [dup, ...prev]);
    toast.success('Escandallo duplicado');
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) { if (r.category) set.add(r.category); }
    return [...set].sort();
  }, [recipes]);

  const filteredRecipes = useMemo(() => {
    let items = recipes;
    if (categoryFilter) items = items.filter(r => r.category === categoryFilter);
    if (activeFilter === 'active') items = items.filter(r => r.active);
    if (activeFilter === 'inactive') items = items.filter(r => !r.active);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(r => r.name.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q));
    }
    return items;
  }, [recipes, categoryFilter, activeFilter, search]);

  const kpis = useMemo(() => {
    if (recipes.length === 0) return { count: 0, activeCount: 0, inactiveCount: 0, avgFoodCost: 0, avgMargin: 0, highCostCount: 0 };
    const activeRecipes = recipes.filter(r => r.active);
    const withPrice = recipes.filter(r => r.salePrice > 0);
    const foodCosts = withPrice.map(r => {
      const totalCost = r.ingredients.reduce((s, i) => s + i.totalCost, 0);
      return (totalCost / r.portions) / r.salePrice * 100;
    });
    const avgFC = foodCosts.length > 0 ? foodCosts.reduce((s, v) => s + v, 0) / foodCosts.length : 0;
    const margins = withPrice.map(r => {
      const totalCost = r.ingredients.reduce((s, i) => s + i.totalCost, 0);
      const costPer = totalCost / r.portions;
      return ((r.salePrice - costPer) / r.salePrice) * 100;
    });
    const avgMargin = margins.length > 0 ? margins.reduce((s, v) => s + v, 0) / margins.length : 0;
    return {
      count: recipes.length,
      activeCount: activeRecipes.length,
      inactiveCount: recipes.length - activeRecipes.length,
      avgFoodCost: avgFC,
      avgMargin,
      highCostCount: foodCosts.filter(fc => fc > 35).length,
    };
  }, [recipes]);

  return (
    <Layout title="Escandallo" subtitle="Cálculo de coste de producción y food cost por receta">
      <div className="space-y-6">
        {/* Filters & Actions */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                className="pl-9 pr-4 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-gray-900 dark:focus:border-gray-400 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-56"
                placeholder="Buscar receta..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {categories.length > 0 && (
              <select
                className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none"
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
              >
                <option value="">Todas las categorías</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <select
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none"
              value={activeFilter}
              onChange={e => setActiveFilter(e.target.value as 'all' | 'active' | 'inactive')}
            >
              <option value="all">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">No activos</option>
            </select>
          </div>
          <AddButtonDropdown
            label="Nuevo escandallo"
            onQuickAdd={() => { setEditingRecipe(null); setShowModal(true); }}
            onAIAdd={() => setShowAIModal(true)}
            onImport={() => setShowImportModal(true)}
            quickAddLabel="Alta rápida"
            quickAddDesc="Formulario de escandallo"
          />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
            <div className="text-blue-600 mb-2"><Utensils className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-200">{kpis.count}</div>
            <div className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
              Escandallos
              <span className="ml-1 opacity-70">({kpis.activeCount} activos · {kpis.inactiveCount} no activos)</span>
            </div>
          </div>
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 rounded-xl">
            <div className="text-amber-600 mb-2"><PieChart className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-200">{kpis.avgFoodCost > 0 ? `${kpis.avgFoodCost.toFixed(1)}%` : '—'}</div>
            <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Food Cost medio</div>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800 rounded-xl">
            <div className="text-green-600 mb-2"><TrendingDown className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-green-900 dark:text-green-200">{kpis.avgMargin > 0 ? `${kpis.avgMargin.toFixed(1)}%` : '—'}</div>
            <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">Margen medio</div>
          </div>
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-xl">
            <div className="text-red-600 mb-2"><AlertTriangle className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-red-900 dark:text-red-200">{kpis.highCostCount}</div>
            <div className="text-xs text-red-700 dark:text-red-400 mt-0.5">Food Cost {'>'}35%</div>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-900/20 border-2 border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="text-gray-500 mb-2"><XCircle className="w-5 h-5" /></div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-200">{kpis.inactiveCount}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">No vinculados</div>
          </div>
        </div>

        {/* Recipe list */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full mr-3" />
            Cargando...
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <Calculator className="w-12 h-12 text-gray-300 mb-3" />
            <p className="font-semibold">Sin escandallos creados</p>
            <p className="text-sm mt-1">Crea tu primer escandallo para calcular costes de producción</p>
            <button onClick={() => { setEditingRecipe(null); setShowModal(true); }} className="mt-4 px-4 py-2 bg-gray-900 dark:bg-gray-100 dark:text-gray-900 text-white rounded-xl text-sm font-medium">
              + Nuevo escandallo
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[1fr_100px_100px_80px_80px_90px_36px] gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <span>Producto / Escandallo</span>
              <span className="text-right">PVC (coste)</span>
              <span className="text-right">PVP</span>
              <span className="text-right">Margen %</span>
              <span className="text-center">Estado</span>
              <span className="text-right">Food Cost</span>
              <span />
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredRecipes.map(recipe => {
                const totalCost = recipe.ingredients.reduce((s, i) => s + i.totalCost, 0);
                const costPerPortion = totalCost / (recipe.portions || 1);
                const foodCostPct = recipe.salePrice > 0 ? (costPerPortion / recipe.salePrice) * 100 : 0;
                const margin = recipe.salePrice > 0 ? ((recipe.salePrice - costPerPortion) / recipe.salePrice) * 100 : 0;
                const isExpanded = expandedRecipe === recipe.id;

                return (
                  <div key={recipe.id} className={`transition-all ${!recipe.active ? 'opacity-60' : ''}`}>
                    {/* Row */}
                    <button
                      type="button"
                      onClick={() => setExpandedRecipe(isExpanded ? null : recipe.id)}
                      className="w-full px-4 py-3 flex items-center md:grid md:grid-cols-[1fr_100px_100px_80px_80px_90px_36px] gap-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      {/* Name + category */}
                      <div className="flex-1 min-w-0 md:flex-none">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${recipe.active ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
                            <Calculator className={`w-4 h-4 ${recipe.active ? 'text-amber-600' : 'text-gray-400'}`} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{recipe.name}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              {recipe.category && (
                                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">{recipe.category}</span>
                              )}
                              <span className="text-[10px] text-gray-400 dark:text-gray-500">{recipe.ingredients.length} ingr. · {recipe.portions} rac.</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* PVC (coste/ración) */}
                      <div className="hidden md:block text-right">
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{costPerPortion.toFixed(2)}€</div>
                        <div className="text-[10px] text-gray-400 dark:text-gray-500">por ración</div>
                      </div>

                      {/* PVP */}
                      <div className="hidden md:block text-right">
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {recipe.salePrice > 0 ? `${recipe.salePrice.toFixed(2)}€` : '—'}
                        </div>
                        <div className="text-[10px] text-gray-400 dark:text-gray-500">por ración</div>
                      </div>

                      {/* Margen % */}
                      <div className="hidden md:block text-right">
                        {recipe.salePrice > 0 ? (
                          <div className={`text-sm font-bold ${margin >= 65 ? 'text-green-600' : margin >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                            {margin.toFixed(1)}%
                          </div>
                        ) : (
                          <div className="text-sm text-gray-400">—</div>
                        )}
                      </div>

                      {/* Estado activo */}
                      <div className="hidden md:flex justify-center">
                        {recipe.active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
                            <CheckCircle2 className="w-3 h-3" /> Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                            <XCircle className="w-3 h-3" /> No activo
                          </span>
                        )}
                      </div>

                      {/* Food Cost */}
                      <div className="hidden md:block text-right">
                        {recipe.salePrice > 0 ? (
                          <div className={`text-sm font-bold ${foodCostPct > 35 ? 'text-red-600' : foodCostPct > 25 ? 'text-amber-600' : 'text-green-600'}`}>
                            {foodCostPct.toFixed(1)}%
                          </div>
                        ) : (
                          <div className="text-sm text-gray-400">—</div>
                        )}
                      </div>

                      {/* Expand icon */}
                      <div className="flex justify-end">
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>

                      {/* Mobile summary */}
                      <div className="flex md:hidden items-center gap-3 shrink-0">
                        {recipe.active ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-gray-400" />
                        )}
                        {recipe.salePrice > 0 && (
                          <div className="text-right">
                            <div className={`text-xs font-bold ${foodCostPct > 35 ? 'text-red-600' : foodCostPct > 25 ? 'text-amber-600' : 'text-green-600'}`}>
                              FC {foodCostPct.toFixed(1)}%
                            </div>
                            <div className="text-[10px] text-gray-400">{margin.toFixed(1)}% margen</div>
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4 bg-gray-50/50 dark:bg-gray-900/30">
                        {/* Mobile PVC/PVP cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:hidden">
                          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl text-center border border-gray-200 dark:border-gray-700">
                            <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">PVC (coste)</div>
                            <div className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">{costPerPortion.toFixed(2)}€</div>
                          </div>
                          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl text-center border border-gray-200 dark:border-gray-700">
                            <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">PVP</div>
                            <div className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">{recipe.salePrice > 0 ? `${recipe.salePrice.toFixed(2)}€` : '—'}</div>
                          </div>
                          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl text-center border border-gray-200 dark:border-gray-700">
                            <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Margen</div>
                            <div className={`text-sm font-bold mt-0.5 ${margin >= 65 ? 'text-green-600' : margin >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                              {recipe.salePrice > 0 ? `${margin.toFixed(1)}%` : '—'}
                            </div>
                          </div>
                          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl text-center border border-gray-200 dark:border-gray-700">
                            <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">Estado</div>
                            <div className="mt-0.5">
                              {recipe.active ? (
                                <span className="text-xs font-bold text-green-600">Activo</span>
                              ) : (
                                <span className="text-xs font-bold text-gray-400">No activo</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[700px] text-sm">
                            <thead>
                              <tr className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                                <th className="text-left py-2 px-2">Ingrediente</th>
                                <th className="text-right py-2 px-2">Cantidad</th>
                                <th className="text-left py-2 px-2">Ud.</th>
                                <th className="text-right py-2 px-2">€/ud</th>
                                <th className="text-right py-2 px-2">Merma</th>
                                <th className="text-right py-2 px-2">Coste</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                              {recipe.ingredients.map(ing => (
                                <tr key={ing.id}>
                                  <td className="py-2 px-2 font-medium text-gray-900 dark:text-gray-100">{ing.name}</td>
                                  <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">{ing.quantity}</td>
                                  <td className="py-2 px-2 text-gray-500 dark:text-gray-400">{ing.unit}</td>
                                  <td className="py-2 px-2 text-right text-gray-700 dark:text-gray-300">{ing.costPerUnit.toFixed(2)}€</td>
                                  <td className="py-2 px-2 text-right text-gray-500 dark:text-gray-400">{ing.waste > 0 ? `${ing.waste}%` : '—'}</td>
                                  <td className="py-2 px-2 text-right font-bold text-gray-900 dark:text-gray-100">{ing.totalCost.toFixed(2)}€</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-gray-200 dark:border-gray-700">
                                <td colSpan={5} className="py-2 px-2 font-bold text-gray-700 dark:text-gray-300">Total</td>
                                <td className="py-2 px-2 text-right font-bold text-gray-900 dark:text-gray-100">{totalCost.toFixed(2)}€</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl text-center border border-gray-200 dark:border-gray-700">
                            <div className="text-xs text-gray-500 dark:text-gray-400">Coste total</div>
                            <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{totalCost.toFixed(2)}€</div>
                          </div>
                          <div className="p-3 bg-white dark:bg-gray-800 rounded-xl text-center border border-gray-200 dark:border-gray-700">
                            <div className="text-xs text-gray-500 dark:text-gray-400">Coste/ración</div>
                            <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{costPerPortion.toFixed(2)}€</div>
                          </div>
                          {recipe.salePrice > 0 && (
                            <>
                              <div className="p-3 bg-white dark:bg-gray-800 rounded-xl text-center border border-gray-200 dark:border-gray-700">
                                <div className="text-xs text-gray-500 dark:text-gray-400">Food Cost</div>
                                <div className={`text-sm font-bold ${foodCostPct > 35 ? 'text-red-600' : foodCostPct > 25 ? 'text-amber-600' : 'text-green-600'}`}>
                                  {foodCostPct.toFixed(1)}%
                                </div>
                              </div>
                              <div className="p-3 bg-white dark:bg-gray-800 rounded-xl text-center border border-gray-200 dark:border-gray-700">
                                <div className="text-xs text-gray-500 dark:text-gray-400">Beneficio/ración</div>
                                <div className={`text-sm font-bold ${margin >= 65 ? 'text-green-600' : margin >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                  {(recipe.salePrice - costPerPortion).toFixed(2)}€
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        {recipe.notes && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 italic">{recipe.notes}</p>
                        )}

                        <div className="flex gap-2 pt-1">
                          <button onClick={() => { setEditingRecipe(recipe); setShowModal(true); }} className="px-3 py-2 text-xs font-medium bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5 border border-gray-200 dark:border-gray-600">
                            <Edit3 className="w-3.5 h-3.5" /> Editar
                          </button>
                          <button onClick={() => handleDuplicate(recipe)} className="px-3 py-2 text-xs font-medium bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5 border border-gray-200 dark:border-gray-600">
                            <Copy className="w-3.5 h-3.5" /> Duplicar
                          </button>
                          <button onClick={() => handleDelete(recipe)} className="px-3 py-2 text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors flex items-center gap-1.5 border border-red-200 dark:border-red-800">
                            <Trash2 className="w-3.5 h-3.5" /> Eliminar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <RecipeModal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingRecipe(null); }}
        onSave={handleSaveRecipe}
        catalogItems={catalogItems}
        editItem={editingRecipe}
      />

      <AIAddModal
        isOpen={showAIModal}
        onClose={() => setShowAIModal(false)}
        module="costing"
        moduleLabel="Escandallos"
        fields={COSTING_AI_FIELDS}
        onEntriesParsed={handleAIEntries}
        placeholder="Describe las recetas/escandallos. Ejemplo:\n\n'Hamburguesa clásica: 1 pan de hamburguesa (0.30€), 180g carne vacuno (2.50€/kg), 30g queso cheddar (8€/kg), 20g lechuga (1.50€/kg), 30g tomate (2€/kg). 4 raciones, PVP 12€.'"
      />

      <GenericImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        moduleLabel="Escandallos"
        fields={COSTING_IMPORT_FIELDS}
        onImport={handleImportEntries}
      />
    </Layout>
  );
}
