import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../../../context/AuthContext';
import {
  ArrowLeft,
  Pill,
  FileText,
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  User,
  Stethoscope,
  Package,
  CheckCircle2,
  AlertTriangle,
  X,
  Banknote,
  CreditCard,
  Smartphone,
  ChevronRight,
} from 'lucide-react';

function formatCurrency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

type RxEstado = 'pendiente' | 'parcial' | 'dispensada';

interface RxLinea {
  id: string;
  medicamento: string;
  dosificacion: string;
  cantidadSolicitada: number;
  stock: number;
  cantidadDispensada: number;
}

interface Receta {
  id: string;
  paciente: string;
  medico: string;
  fecha: string;
  lineas: RxLinea[];
  estado: RxEstado;
}

interface OtcProducto {
  id: string;
  nombre: string;
  sku: string;
  precio: number;
  stock: number;
}

interface BasketLine {
  productoId: string;
  cantidad: number;
}

interface OtcVenta {
  id: string;
  total: number;
  hora: Date;
  metodo: 'efectivo' | 'tarjeta' | 'bizum';
}

const ESTADO_RX: Record<RxEstado, { label: string; color: string; bg: string }> = {
  pendiente: { label: 'Pendiente', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 border-amber-300 dark:bg-amber-900/30 dark:border-amber-700' },
  parcial: { label: 'Parcial', color: 'text-violet-700 dark:text-violet-400', bg: 'bg-violet-50 border-violet-300 dark:bg-violet-900/30 dark:border-violet-700' },
  dispensada: { label: 'Dispensada', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 border-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-700' },
};

function computeEstado(lineas: RxLinea[]): RxEstado {
  if (lineas.length === 0) return 'pendiente';
  const totalSol = lineas.reduce((s, l) => s + l.cantidadSolicitada, 0);
  const totalDisp = lineas.reduce((s, l) => s + l.cantidadDispensada, 0);
  if (totalDisp === 0) return 'pendiente';
  if (totalDisp >= totalSol) return 'dispensada';
  return 'parcial';
}

const OTC_CATALOGO_INICIAL: OtcProducto[] = [
  { id: 'p-ibuprofeno', nombre: 'Ibuprofeno 400 mg', sku: 'OTC-IBU400', precio: 4.25, stock: 80 },
  { id: 'p-paracetamol', nombre: 'Paracetamol 1 g', sku: 'OTC-PARA1G', precio: 3.5, stock: 120 },
  { id: 'p-agua', nombre: 'Agua oxigenada 250 ml', sku: 'OTC-AGOX', precio: 2.1, stock: 40 },
  { id: 'p-vendas', nombre: 'Vendas elásticas', sku: 'OTC-VEND', precio: 5.9, stock: 25 },
  { id: 'p-vitd', nombre: 'Vitamina D3 2000 UI', sku: 'OTC-VD3', precio: 12.4, stock: 30 },
];

function isTodayIsoDate(isoDate: string): boolean {
  const d = new Date(isoDate);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

type TabKey = 'dispensacion' | 'venta_libre';

export function WorkerTpvPharmacy() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const workerName = user?.firstName ? `${user.firstName} ${user?.lastName || ''}`.trim() : 'Farmacéutico';

  const [tab, setTab] = useState<TabKey>('dispensacion');
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [productosOtc, setProductosOtc] = useState<OtcProducto[]>(OTC_CATALOGO_INICIAL);
  const [cesta, setCesta] = useState<BasketLine[]>([]);
  const [ventasOtc, setVentasOtc] = useState<OtcVenta[]>([]);
  const [searchRx, setSearchRx] = useState('');
  const [filterEstado, setFilterEstado] = useState<RxEstado | 'todos'>('todos');
  const [searchOtc, setSearchOtc] = useState('');
  const [selectedRxId, setSelectedRxId] = useState<string | null>(null);
  const [showNuevaReceta, setShowNuevaReceta] = useState(false);
  const [showPagoOtc, setShowPagoOtc] = useState(false);
  const [metodoPago, setMetodoPago] = useState<OtcVenta['metodo']>('efectivo');

  const [formReceta, setFormReceta] = useState({ paciente: '', medico: '' });
  const [lineasNueva, setLineasNueva] = useState<{ medicamento: string; dosificacion: string; cantidad: number; stock: number }[]>([
    { medicamento: '', dosificacion: '', cantidad: 1, stock: 0 },
  ]);

  const recetasFiltradas = useMemo(() => {
    const q = searchRx.trim().toLowerCase();
    return recetas.filter((r) => {
      if (filterEstado !== 'todos' && r.estado !== filterEstado) return false;
      if (!q) return true;
      return (
        r.paciente.toLowerCase().includes(q) ||
        r.medico.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    });
  }, [recetas, searchRx, filterEstado]);

  const productosFiltrados = useMemo(() => {
    const q = searchOtc.trim().toLowerCase();
    if (!q) return productosOtc;
    return productosOtc.filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
  }, [productosOtc, searchOtc]);

  const stats = useMemo(() => {
    const recetasHoy = recetas.filter((r) => isTodayIsoDate(r.fecha)).length;
    const ventasHoy = ventasOtc.filter((v) => {
      const d = v.hora;
      const t = new Date();
      return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
    });
    const ingresos = ventasHoy.reduce((s, v) => s + v.total, 0);
    return {
      recetasHoy,
      ventasLibres: ventasHoy.length,
      ingresosDia: ingresos,
    };
  }, [recetas, ventasOtc]);

  const selectedRx = useMemo(
    () => (selectedRxId ? recetas.find((r) => r.id === selectedRxId) ?? null : null),
    [recetas, selectedRxId]
  );

  const totalCesta = useMemo(() => {
    return cesta.reduce((sum, line) => {
      const p = productosOtc.find((x) => x.id === line.productoId);
      return sum + (p ? p.precio * line.cantidad : 0);
    }, 0);
  }, [cesta, productosOtc]);

  const addToCesta = useCallback((productoId: string) => {
    setCesta((prev) => {
      const p = productosOtc.find((x) => x.id === productoId);
      if (!p || p.stock <= 0) return prev;
      const idx = prev.findIndex((l) => l.productoId === productoId);
      if (idx >= 0) {
        const next = [...prev];
        const maxAdd = p.stock - next[idx].cantidad;
        if (maxAdd <= 0) return prev;
        next[idx] = { ...next[idx], cantidad: next[idx].cantidad + 1 };
        return next;
      }
      return [...prev, { productoId, cantidad: 1 }];
    });
  }, [productosOtc]);

  const updateCestaQty = (productoId: string, delta: number) => {
    setCesta((prev) => {
      const p = productosOtc.find((x) => x.id === productoId);
      if (!p) return prev;
      return prev
        .map((l) => {
          if (l.productoId !== productoId) return l;
          const nextQty = Math.max(0, Math.min(p.stock, l.cantidad + delta));
          return { ...l, cantidad: nextQty };
        })
        .filter((l) => l.cantidad > 0);
    });
  };

  const removeFromCesta = (productoId: string) => {
    setCesta((prev) => prev.filter((l) => l.productoId !== productoId));
  };

  const confirmarVentaOtc = () => {
    if (cesta.length === 0) return;
    for (const line of cesta) {
      const p = productosOtc.find((x) => x.id === line.productoId);
      if (!p || p.stock < line.cantidad) return;
    }
    setProductosOtc((prev) =>
      prev.map((p) => {
        const line = cesta.find((l) => l.productoId === p.id);
        if (!line) return p;
        return { ...p, stock: p.stock - line.cantidad };
      })
    );
    setVentasOtc((prev) => [
      ...prev,
      { id: uuidv4(), total: totalCesta, hora: new Date(), metodo: metodoPago },
    ]);
    setCesta([]);
    setShowPagoOtc(false);
  };

  const guardarNuevaReceta = () => {
    if (!formReceta.paciente.trim() || !formReceta.medico.trim()) return;
    const validas = lineasNueva.filter((l) => l.medicamento.trim() && l.cantidad > 0);
    if (validas.length === 0) return;
    const lineas: RxLinea[] = validas.map((l) => ({
      id: uuidv4(),
      medicamento: l.medicamento.trim(),
      dosificacion: l.dosificacion.trim() || '—',
      cantidadSolicitada: l.cantidad,
      stock: Math.max(0, l.stock),
      cantidadDispensada: 0,
    }));
    const nueva: Receta = {
      id: uuidv4(),
      paciente: formReceta.paciente.trim(),
      medico: formReceta.medico.trim(),
      fecha: new Date().toISOString(),
      lineas,
      estado: computeEstado(lineas),
    };
    setRecetas((prev) => [nueva, ...prev]);
    setFormReceta({ paciente: '', medico: '' });
    setLineasNueva([{ medicamento: '', dosificacion: '', cantidad: 1, stock: 0 }]);
    setShowNuevaReceta(false);
  };

  const dispensarReceta = (rxId: string) => {
    setRecetas((prev) =>
      prev.map((r) => {
        if (r.id !== rxId) return r;
        const lineas = r.lineas.map((l) => {
          const falta = l.cantidadSolicitada - l.cantidadDispensada;
          if (falta <= 0) return l;
          const dar = Math.min(falta, l.stock);
          return {
            ...l,
            cantidadDispensada: l.cantidadDispensada + dar,
            stock: l.stock - dar,
          };
        });
        return { ...r, lineas, estado: computeEstado(lineas) };
      })
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50 dark:bg-gray-950">
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/saas/worker')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 shrink-0" />
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/40 rounded-xl flex items-center justify-center shrink-0">
              <Pill className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">Mi Puesto - Farmacia</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{workerName}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-teal-50 dark:bg-teal-900/20 border-2 border-teal-200 dark:border-teal-800 rounded-2xl p-2.5 text-center">
            <p className="text-lg font-bold text-teal-700 dark:text-teal-400">{stats.recetasHoy}</p>
            <p className="text-[10px] font-semibold uppercase text-teal-600 dark:text-teal-500">Recetas hoy</p>
          </div>
          <div className="bg-cyan-50 dark:bg-cyan-900/20 border-2 border-cyan-200 dark:border-cyan-800 rounded-2xl p-2.5 text-center">
            <p className="text-lg font-bold text-cyan-700 dark:text-cyan-400">{stats.ventasLibres}</p>
            <p className="text-[10px] font-semibold uppercase text-cyan-600 dark:text-cyan-500">Ventas libres</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-800 rounded-2xl p-2.5 text-center">
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(stats.ingresosDia)}</p>
            <p className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-500">Ingresos del día</p>
          </div>
        </div>

        <div className="flex rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-1 bg-gray-100 dark:bg-gray-800/80">
          <button
            type="button"
            onClick={() => setTab('dispensacion')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === 'dispensacion'
                ? 'bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-400 shadow-sm border border-gray-200 dark:border-gray-600'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            Dispensación
          </button>
          <button
            type="button"
            onClick={() => setTab('venta_libre')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === 'venta_libre'
                ? 'bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-400 shadow-sm border border-gray-200 dark:border-gray-600'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            Venta libre
          </button>
        </div>
      </div>

      {tab === 'dispensacion' && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <div className="flex-1 min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700">
            <div className="shrink-0 p-3 space-y-2 bg-white/80 dark:bg-gray-900/80">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchRx}
                    onChange={(e) => setSearchRx(e.target.value)}
                    placeholder="Buscar paciente, médico, UUID…"
                    className="w-full pl-9 pr-3 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowNuevaReceta(true)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-2xl border-2 border-emerald-500 bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Nueva receta</span>
                </button>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(['todos', 'pendiente', 'parcial', 'dispensada'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilterEstado(f)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border-2 transition-all ${
                      filterEstado === f
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {f === 'todos' ? 'Todos' : ESTADO_RX[f].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
              {recetasFiltradas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
                  <FileText className="w-10 h-10 mb-2" />
                  <p className="text-sm text-center px-4">No hay recetas. Crea una nueva o ajusta el filtro.</p>
                </div>
              ) : (
                recetasFiltradas.map((r) => {
                  const cfg = ESTADO_RX[r.estado];
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRxId(r.id)}
                      className={`w-full text-left p-4 rounded-2xl border-2 transition-all hover:shadow-lg active:scale-[0.99] ${cfg.bg}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <User className="w-4 h-4 shrink-0 text-gray-500" />
                            <span className="truncate">{r.paciente}</span>
                          </p>
                          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            <Stethoscope className="w-3 h-3" />
                            {r.medico}
                          </p>
                          <p className="font-mono text-[10px] text-gray-400 mt-1 truncate" title={r.id}>
                            {r.id}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        {r.lineas.length} medicamento{r.lineas.length !== 1 ? 's' : ''} ·{' '}
                        {new Date(r.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="lg:w-[min(100%,420px)] shrink-0 min-h-[280px] lg:min-h-0 bg-white dark:bg-gray-900 p-4 overflow-y-auto border-t lg:border-t-0 border-gray-200 dark:border-gray-700">
            {!selectedRx ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 py-8">
                <Pill className="w-12 h-12 mb-2 opacity-50" />
                <p className="text-sm text-center">Selecciona una receta para ver detalle y dispensar.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{selectedRx.paciente}</h2>
                    <p className="text-sm text-gray-500">{selectedRx.medico}</p>
                    <p className="font-mono text-[10px] text-gray-400 mt-1 break-all">{selectedRx.id}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedRxId(null)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                    aria-label="Cerrar detalle"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
                <span className={`inline-flex text-xs px-2 py-1 rounded-full font-semibold border-2 ${ESTADO_RX[selectedRx.estado].bg} ${ESTADO_RX[selectedRx.estado].color}`}>
                  {ESTADO_RX[selectedRx.estado].label}
                </span>
                <ul className="space-y-3">
                  {selectedRx.lineas.map((l) => {
                    const falta = l.cantidadSolicitada - l.cantidadDispensada;
                    const okStock = falta === 0 || l.stock >= falta;
                    return (
                      <li key={l.id} className="p-3 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <div className="flex justify-between gap-2">
                          <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{l.medicamento}</p>
                          <span className="font-mono text-[10px] text-gray-400 shrink-0">{l.id.slice(0, 8)}…</span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Dosificación: {l.dosificacion}</p>
                        <div className="flex flex-wrap gap-2 mt-2 text-xs">
                          <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600">
                            Solicitado: {l.cantidadSolicitada}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600">
                            Dispensado: {l.cantidadDispensada}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            Stock: {l.stock}
                          </span>
                        </div>
                        {falta > 0 && !okStock && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-2 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Stock insuficiente para completar ({falta} unidades faltan)
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {selectedRx.estado !== 'dispensada' && (
                  <button
                    type="button"
                    onClick={() => dispensarReceta(selectedRx.id)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-emerald-500 bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Dispensar según stock
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'venta_libre' && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 p-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchOtc}
                  onChange={(e) => setSearchOtc(e.target.value)}
                  placeholder="Buscar producto OTC, SKU, UUID…"
                  className="w-full pl-9 pr-3 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {productosFiltrados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addToCesta(p.id)}
                  disabled={p.stock <= 0}
                  className={`text-left p-4 rounded-2xl border-2 transition-all ${
                    p.stock <= 0
                      ? 'border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
                      : 'border-gray-200 dark:border-gray-600 hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-md active:scale-[0.99] bg-white dark:bg-gray-900'
                  }`}
                >
                  <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{p.nombre}</p>
                  <p className="text-xs text-gray-500 font-mono mt-1">{p.sku}</p>
                  <p className="font-mono text-[10px] text-gray-400 mt-0.5 truncate" title={p.id}>
                    {p.id}
                  </p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-emerald-700 dark:text-emerald-400 font-bold">{formatCurrency(p.precio)}</span>
                    <span className="text-xs text-gray-500">Stock {p.stock}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="lg:w-[min(100%,380px)] shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col max-h-[50vh] lg:max-h-none">
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-emerald-600" />
              <h2 className="font-bold text-gray-900 dark:text-gray-100">Cesta</h2>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
              {cesta.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Añade productos desde el catálogo.</p>
              ) : (
                cesta.map((line) => {
                  const p = productosOtc.find((x) => x.id === line.productoId);
                  if (!p) return null;
                  return (
                    <div key={line.productoId} className="flex items-center gap-2 p-3 rounded-2xl border-2 border-gray-200 dark:border-gray-700">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate text-gray-900 dark:text-gray-100">{p.nombre}</p>
                        <p className="text-xs text-gray-500">{formatCurrency(p.precio)} × {line.cantidad}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateCestaQty(line.productoId, -1)}
                          className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold">{line.cantidad}</span>
                        <button
                          type="button"
                          onClick={() => updateCestaQty(line.productoId, 1)}
                          className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromCesta(line.productoId)}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="p-4 border-t-2 border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">Total</span>
                <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(totalCesta)}</span>
              </div>
              <button
                type="button"
                disabled={cesta.length === 0}
                onClick={() => setShowPagoOtc(true)}
                className="w-full py-3 rounded-2xl border-2 border-emerald-500 bg-emerald-600 text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-700"
              >
                Cobrar venta
              </button>
            </div>
          </div>
        </div>
      )}

      {showNuevaReceta && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-label="Cerrar" onClick={() => setShowNuevaReceta(false)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col border-2 border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nueva receta</h2>
              <button type="button" onClick={() => setShowNuevaReceta(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500">Paciente</label>
                <input
                  className="mt-1 w-full px-3 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm"
                  value={formReceta.paciente}
                  onChange={(e) => setFormReceta((f) => ({ ...f, paciente: e.target.value }))}
                  placeholder="Nombre completo"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500">Médico</label>
                <input
                  className="mt-1 w-full px-3 py-2 rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm"
                  value={formReceta.medico}
                  onChange={(e) => setFormReceta((f) => ({ ...f, medico: e.target.value }))}
                  placeholder="Nombre o colegiado"
                />
              </div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 pt-2">Medicamentos</p>
              {lineasNueva.map((row, i) => (
                <div key={i} className="p-3 rounded-2xl border-2 border-gray-200 dark:border-gray-600 space-y-2">
                  <input
                    className="w-full px-2 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                    placeholder="Medicamento"
                    value={row.medicamento}
                    onChange={(e) => {
                      const next = [...lineasNueva];
                      next[i] = { ...next[i], medicamento: e.target.value };
                      setLineasNueva(next);
                    }}
                  />
                  <input
                    className="w-full px-2 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                    placeholder="Dosificación (ej. 1 comp. / 8 h)"
                    value={row.dosificacion}
                    onChange={(e) => {
                      const next = [...lineasNueva];
                      next[i] = { ...next[i], dosificacion: e.target.value };
                      setLineasNueva(next);
                    }}
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      className="w-24 px-2 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                      value={row.cantidad}
                      onChange={(e) => {
                        const next = [...lineasNueva];
                        next[i] = { ...next[i], cantidad: Math.max(1, Number(e.target.value) || 1) };
                        setLineasNueva(next);
                      }}
                    />
                    <input
                      type="number"
                      min={0}
                      className="flex-1 px-2 py-1.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                      placeholder="Stock disponible en botica"
                      value={row.stock || ''}
                      onChange={(e) => {
                        const next = [...lineasNueva];
                        next[i] = { ...next[i], stock: Math.max(0, Number(e.target.value) || 0) };
                        setLineasNueva(next);
                      }}
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setLineasNueva((prev) => [...prev, { medicamento: '', dosificacion: '', cantidad: 1, stock: 0 }])}
                className="flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400"
              >
                <Plus className="w-4 h-4" />
                Añadir línea
              </button>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
              <button
                type="button"
                onClick={() => setShowNuevaReceta(false)}
                className="flex-1 py-2.5 rounded-2xl border-2 border-gray-200 dark:border-gray-600 text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarNuevaReceta}
                className="flex-1 py-2.5 rounded-2xl border-2 border-emerald-500 bg-emerald-600 text-white text-sm font-semibold"
              >
                Guardar receta
              </button>
            </div>
          </div>
        </div>
      )}

      {showPagoOtc && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPagoOtc(false)} aria-label="Cerrar" />
          <div className="relative bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm border-2 border-gray-200 dark:border-gray-700 p-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Confirmar pago</h2>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-4">{formatCurrency(totalCesta)}</p>
            <p className="text-xs font-semibold text-gray-500 mb-2">Método</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {(
                [
                  { id: 'efectivo' as const, label: 'Efectivo', icon: Banknote },
                  { id: 'tarjeta' as const, label: 'Tarjeta', icon: CreditCard },
                  { id: 'bizum' as const, label: 'Bizum', icon: Smartphone },
                ]
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMetodoPago(id)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-2xl border-2 text-xs font-semibold ${
                    metodoPago === id
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={confirmarVentaOtc}
              className="w-full py-3 rounded-2xl border-2 border-emerald-500 bg-emerald-600 text-white font-semibold"
            >
              Registrar venta
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
