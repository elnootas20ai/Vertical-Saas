import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '../../components/saas/Layout';
import { useAuth } from '../../context/AuthContext';
import { createVerticalApi, type VerticalEntity } from '../../lib/verticalApiFactory';
import { toast } from 'sonner';
import { Scissors, Plus, Trash2, Play, Loader2 } from 'lucide-react';
import { getApiBase } from '../../lib/apiBase';

interface CutLine {
  productId: string;
  productName: string;
  yieldPct: number;
}

interface CuttingRecipe extends VerticalEntity {
  nombre: string;
  origenProductId: string;
  origenNombre: string;
  cortes: CutLine[];
  mermaEsperadaPct: number;
}

interface CatalogProduct extends VerticalEntity {
  nombre: string;
  stock: number;
  precioKg: number;
  costePorKg?: number;
}

const emptyRecipe = (): Omit<CuttingRecipe, keyof VerticalEntity> => ({
  nombre: '',
  origenProductId: '',
  origenNombre: '',
  cortes: [{ productId: '', productName: '', yieldPct: 0 }],
  mermaEsperadaPct: 0,
});

export function ButcherDespiece() {
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || '';
  const recipesApi = useMemo(() => createVerticalApi<CuttingRecipe>('butcher-ops', 'cuttingRecipes'), []);
  const catalogApi = useMemo(() => createVerticalApi<CatalogProduct>('butcher-ops', 'catalog'), []);

  const [recipes, setRecipes] = useState<CuttingRecipe[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyRecipe());
  const [kgInput, setKgInput] = useState('10');
  const [runningId, setRunningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        recipesApi.list(userId).catch(() => [] as CuttingRecipe[]),
        catalogApi.list(userId).catch(() => [] as CatalogProduct[]),
      ]);
      setRecipes(r);
      setCatalog(c);
    } finally {
      setLoading(false);
    }
  }, [userId, recipesApi, catalogApi]);

  useEffect(() => { void load(); }, [load]);

  const yieldSum = form.cortes.reduce((s, c) => s + Number(c.yieldPct || 0), 0);
  const impliedMerma = Math.max(0, Math.round((100 - yieldSum) * 10) / 10);

  const saveRecipe = async () => {
    if (!userId || !form.nombre.trim() || !form.origenProductId) {
      toast.error('Nombre y producto origen obligatorios');
      return;
    }
    if (yieldSum <= 0 || yieldSum > 100) {
      toast.error('La suma de rendimientos debe estar entre 0 y 100%');
      return;
    }
    try {
      await recipesApi.create(userId, {
        ...form,
        mermaEsperadaPct: impliedMerma,
        cortes: form.cortes.filter((c) => c.productId && c.yieldPct > 0),
      } as Partial<CuttingRecipe>);
      toast.success('Receta de despiece guardada');
      setForm(emptyRecipe());
      await load();
    } catch {
      toast.error('No se pudo guardar');
    }
  };

  const runDespiece = async (recipe: CuttingRecipe) => {
    if (!userId) return;
    const kg = Number(kgInput.replace(',', '.'));
    if (!(kg > 0)) {
      toast.error('Indica kg a despiezar');
      return;
    }
    setRunningId(recipe._id);
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`${getApiBase()}/api/butcher/${userId}/despiece`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          recipeId: recipe._id,
          origenProductId: recipe.origenProductId,
          kg,
          cortes: recipe.cortes,
          mermaPct: recipe.mermaEsperadaPct,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Error');
      toast.success(`Despiece OK: ${kg} kg → cortes + merma ${data.mermaKg?.toFixed?.(2) ?? ''} kg`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al despiezar');
    } finally {
      setRunningId(null);
    }
  };

  const setOrigen = (id: string) => {
    const p = catalog.find((c) => c._id === id);
    setForm((f) => ({
      ...f,
      origenProductId: id,
      origenNombre: p?.nombre || '',
    }));
  };

  return (
    <Layout title="Despiece / rendimientos">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-2xl">
        Define cómo se reparte un canal o pieza en cortes (% rendimiento). Al despiezar se baja el stock del origen,
        suben los destinos y se registra la merma implícita.
      </p>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
          <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nueva receta
          </h3>
          <input
            className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-transparent"
            placeholder="Nombre (ej. Canal vacuno)"
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          />
          <select
            className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
            value={form.origenProductId}
            onChange={(e) => setOrigen(e.target.value)}
          >
            <option value="">Producto origen…</option>
            {catalog.map((p) => (
              <option key={p._id} value={p._id}>{p.nombre} ({Number(p.stock || 0).toFixed(1)} kg)</option>
            ))}
          </select>

          {form.cortes.map((c, i) => (
            <div key={i} className="flex gap-2 items-center">
              <select
                className="flex-1 px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm"
                value={c.productId}
                onChange={(e) => {
                  const p = catalog.find((x) => x._id === e.target.value);
                  setForm((f) => ({
                    ...f,
                    cortes: f.cortes.map((row, idx) =>
                      idx === i
                        ? { ...row, productId: e.target.value, productName: p?.nombre || '' }
                        : row,
                    ),
                  }));
                }}
              >
                <option value="">Corte destino…</option>
                {catalog.map((p) => (
                  <option key={p._id} value={p._id}>{p.nombre}</option>
                ))}
              </select>
              <input
                type="number"
                className="w-20 px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-center"
                placeholder="%"
                value={c.yieldPct || ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    cortes: f.cortes.map((row, idx) =>
                      idx === i ? { ...row, yieldPct: Number(e.target.value) } : row,
                    ),
                  }))
                }
              />
              <button
                type="button"
                className="p-2 text-gray-400 hover:text-red-500"
                onClick={() => setForm((f) => ({ ...f, cortes: f.cortes.filter((_, idx) => idx !== i) }))}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          <button
            type="button"
            className="text-sm text-blue-600 font-medium"
            onClick={() => setForm((f) => ({ ...f, cortes: [...f.cortes, { productId: '', productName: '', yieldPct: 0 }] }))}
          >
            + Añadir corte
          </button>

          <p className="text-sm text-gray-500">
            Rendimiento cortes: <strong>{yieldSum.toFixed(1)}%</strong> · Merma implícita:{' '}
            <strong>{impliedMerma.toFixed(1)}%</strong>
          </p>

          <button
            type="button"
            onClick={() => { void saveRecipe(); }}
            className="w-full py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold"
          >
            Guardar receta
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold">Kg a despiezar</label>
            <input
              className="w-28 px-3 py-2 rounded-lg border-2 border-gray-200 dark:border-gray-700"
              value={kgInput}
              onChange={(e) => setKgInput(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : recipes.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Scissors className="w-10 h-10 mx-auto mb-2 opacity-40" />
              Sin recetas todavía
            </div>
          ) : (
            recipes.map((r) => (
              <div key={r._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold">{r.nombre}</h4>
                    <p className="text-sm text-gray-500">Origen: {r.origenNombre}</p>
                    <ul className="text-xs text-gray-600 dark:text-gray-400 mt-2 space-y-0.5">
                      {(r.cortes || []).map((c, i) => (
                        <li key={i}>{c.productName}: {c.yieldPct}%</li>
                      ))}
                      <li>Merma: {r.mermaEsperadaPct}%</li>
                    </ul>
                  </div>
                  <button
                    type="button"
                    disabled={runningId === r._id}
                    onClick={() => { void runDespiece(r); }}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {runningId === r._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Despiezar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
