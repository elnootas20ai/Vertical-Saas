import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';
import { useAuth } from '../../../context/AuthContext';
import {
  ArrowLeft,
  Banknote,
  Cigarette,
  CreditCard,
  Plus,
  Receipt,
  Search,
  Ticket,
  Trash2,
  Trophy,
  Sparkles,
  Minus,
} from 'lucide-react';

function formatCurrency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

type SaleCategory = 'tabaco' | 'loteria' | 'timbre' | 'prensa' | 'otros';
type PaymentMethod = 'efectivo' | 'tarjeta';
type DrawType = 'loteria_nacional' | 'primitiva' | 'euromillones' | 'bonoloto';

const CATEGORY_LABELS: Record<SaleCategory, string> = {
  tabaco: 'Tabaco',
  loteria: 'Lotería',
  timbre: 'Timbre',
  prensa: 'Prensa',
  otros: 'Otros',
};

const DRAW_LABELS: Record<DrawType, string> = {
  loteria_nacional: 'Lotería Nacional',
  primitiva: 'La Primitiva',
  euromillones: 'Euromillones',
  bonoloto: 'Bonoloto',
};

/** Precios orientativos por boleto (demo local) */
const DRAW_PRICES: Record<DrawType, number> = {
  loteria_nacional: 3,
  primitiva: 1.5,
  euromillones: 2.5,
  bonoloto: 1,
};

/** Resultados de ejemplo para comprobación (estado local) */
const MOCK_WINNERS: Record<DrawType, { numbers: string; date: string }> = {
  loteria_nacional: { numbers: '45231', date: '2026-04-05' },
  primitiva: { numbers: '07, 14, 22, 31, 38, 45', date: '2026-04-08' },
  euromillones: { numbers: '05, 12, 23, 41, 48 — Estrellas: 03, 09', date: '2026-04-04' },
  bonoloto: { numbers: '02, 11, 19, 27, 33, 41', date: '2026-04-07' },
};

interface TicketLine {
  id: string;
  category: SaleCategory;
  name: string;
  qty: number;
  unitPrice: number;
}

interface CompletedSale {
  id: string;
  ticketNo: string;
  lines: TicketLine[];
  total: number;
  method: PaymentMethod;
  time: Date;
}

interface LotterySaleRecord {
  id: string;
  draw: DrawType;
  qty: number;
  total: number;
  time: Date;
}

function nextTicketNo(seq: number) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `EST-${y}${m}${day}-${String(seq).padStart(4, '0')}`;
}

function normalizeNumbers(s: string) {
  return s
    .split(/[\s,;]+/)
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => x.padStart(2, '0'))
    .sort()
    .join(',');
}

export function WorkerTpvTobacco() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const workerName = user?.firstName
    ? `${user.firstName} ${user?.lastName || ''}`.trim()
    : 'Dependiente';

  const [mainTab, setMainTab] = useState<'caja' | 'loteria'>('caja');

  /* —— Caja —— */
  const [lineCategory, setLineCategory] = useState<SaleCategory>('tabaco');
  const [itemName, setItemName] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [itemPrice, setItemPrice] = useState('');
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('efectivo');
  const [salesToday, setSalesToday] = useState<CompletedSale[]>([]);
  const [ticketSeq, setTicketSeq] = useState(1);
  const [cajaSearch, setCajaSearch] = useState('');

  /* —— Lotería —— */
  const [stock, setStock] = useState<Record<DrawType, number>>({
    loteria_nacional: 120,
    primitiva: 200,
    euromillones: 80,
    bonoloto: 150,
  });
  const [lotteryDraw, setLotteryDraw] = useState<DrawType>('loteria_nacional');
  const [lotteryQty, setLotteryQty] = useState(1);
  const [lotterySales, setLotterySales] = useState<LotterySaleRecord[]>([]);
  const [verifyDraw, setVerifyDraw] = useState<DrawType>('loteria_nacional');
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [lotteryFilter, setLotteryFilter] = useState('');

  const lineTotal = useMemo(
    () => lines.reduce((s, l) => s + l.qty * l.unitPrice, 0),
    [lines],
  );

  const ventasHoy = salesToday.length;
  const ingresosHoy = useMemo(
    () => salesToday.reduce((s, r) => s + r.total, 0) + lotterySales.reduce((s, r) => s + r.total, 0),
    [salesToday, lotterySales],
  );
  const boletosVendidos = useMemo(
    () => lotterySales.reduce((s, r) => s + r.qty, 0),
    [lotterySales],
  );

  const filteredLines = useMemo(() => {
    const q = cajaSearch.toLowerCase().trim();
    if (!q) return lines;
    return lines.filter(
      l =>
        l.name.toLowerCase().includes(q) ||
        CATEGORY_LABELS[l.category].toLowerCase().includes(q),
    );
  }, [lines, cajaSearch]);

  const addLine = useCallback(() => {
    const price = parseFloat(itemPrice.replace(',', '.'));
    if (!itemName.trim() || !Number.isFinite(price) || price < 0) {
      toast.error('Indica concepto y precio válido');
      return;
    }
    if (itemQty < 1) {
      toast.error('La cantidad debe ser al menos 1');
      return;
    }
    setLines(prev => [
      ...prev,
      {
        id: uuidv4(),
        category: lineCategory,
        name: itemName.trim(),
        qty: itemQty,
        unitPrice: price,
      },
    ]);
    setItemName('');
    setItemPrice('');
    setItemQty(1);
    toast.success('Línea añadida');
  }, [itemName, itemPrice, itemQty, lineCategory]);

  const updateLineQty = (id: string, delta: number) => {
    setLines(prev =>
      prev
        .map(l => (l.id === id ? { ...l, qty: Math.max(1, l.qty + delta) } : l))
        .filter(l => l.qty > 0),
    );
  };

  const removeLine = (id: string) => setLines(prev => prev.filter(l => l.id !== id));

  const processSale = () => {
    if (lines.length === 0) {
      toast.error('Añade líneas al ticket');
      return;
    }
    const ticketNo = nextTicketNo(ticketSeq);
    setTicketSeq(s => s + 1);
    const record: CompletedSale = {
      id: uuidv4(),
      ticketNo,
      lines: [...lines],
      total: lineTotal,
      method: paymentMethod,
      time: new Date(),
    };
    setSalesToday(prev => [record, ...prev]);
    setLines([]);
    toast.success(`Venta registrada — Ticket ${ticketNo}`);
  };

  const sellLottery = () => {
    const available = stock[lotteryDraw];
    if (lotteryQty < 1) {
      toast.error('Cantidad no válida');
      return;
    }
    if (lotteryQty > available) {
      toast.error('Stock insuficiente para este sorteo');
      return;
    }
    const unit = DRAW_PRICES[lotteryDraw];
    const total = unit * lotteryQty;
    setStock(s => ({ ...s, [lotteryDraw]: s[lotteryDraw] - lotteryQty }));
    setLotterySales(prev => [
      {
        id: uuidv4(),
        draw: lotteryDraw,
        qty: lotteryQty,
        total,
        time: new Date(),
      },
      ...prev,
    ]);
    toast.success(`${lotteryQty} boleto(s) ${DRAW_LABELS[lotteryDraw]} — ${formatCurrency(total)}`);
    setLotteryQty(1);
  };

  const checkNumbers = () => {
    const official = MOCK_WINNERS[verifyDraw];
    const userNorm =
      verifyDraw === 'loteria_nacional'
        ? verifyInput.replace(/\D/g, '').slice(0, 5)
        : normalizeNumbers(verifyInput);
    const winNorm =
      verifyDraw === 'loteria_nacional'
        ? official.numbers.replace(/\D/g, '')
        : normalizeNumbers(official.numbers.split('—')[0]);

    if (!verifyInput.trim()) {
      setVerifyResult(null);
      toast.error('Introduce los números del boleto');
      return;
    }

    if (verifyDraw === 'loteria_nacional') {
      if (userNorm === winNorm) {
        setVerifyResult('¡Premio! El número coincide con el último sorteo.');
        toast.success('Número premiado');
      } else {
        setVerifyResult('Sin premio con este número en el último sorteo de referencia.');
        toast.message('Sin premio');
      }
      return;
    }

    const uSet = new Set(userNorm.split(',').map(x => x.trim()));
    const wSet = new Set(winNorm.split(',').map(x => x.trim()));
    let matches = 0;
    wSet.forEach(n => {
      if (uSet.has(n)) matches += 1;
    });
    if (matches >= 4) {
      setVerifyResult(`¡Muy buena combinación! ${matches} aciertos con el sorteo del ${official.date}.`);
      toast.success('Combinación destacada');
    } else if (matches >= 1) {
      setVerifyResult(`${matches} número(s) coinciden con el sorteo del ${official.date}.`);
      toast.message('Algunos aciertos');
    } else {
      setVerifyResult('Sin aciertos con los números de referencia del último sorteo.');
      toast.message('Sin aciertos');
    }
  };

  const filteredLotteryHistory = useMemo(() => {
    const q = lotteryFilter.toLowerCase().trim();
    if (!q) return lotterySales;
    return lotterySales.filter(
      r =>
        DRAW_LABELS[r.draw].toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q),
    );
  }, [lotterySales, lotteryFilter]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/saas/worker')}
              className="flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Volver</span>
            </button>
            <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 shrink-0" />
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-2xl border-2 border-amber-200 dark:border-amber-800 flex items-center justify-center shrink-0">
              <Cigarette className="w-5 h-5 text-amber-700 dark:text-amber-400" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
                Mi Puesto - Estanco
              </h1>
              <p className="text-xs text-gray-500 truncate">{workerName}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-2xl p-2.5 text-center">
            <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{ventasHoy}</p>
            <p className="text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-500">
              Ventas hoy
            </p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-800 rounded-2xl p-2.5 text-center">
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
              {formatCurrency(ingresosHoy)}
            </p>
            <p className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-500">
              Ingresos hoy
            </p>
          </div>
          <div className="bg-violet-50 dark:bg-violet-900/20 border-2 border-violet-200 dark:border-violet-800 rounded-2xl p-2.5 text-center">
            <p className="text-lg font-bold text-violet-700 dark:text-violet-400">{boletosVendidos}</p>
            <p className="text-[10px] font-semibold uppercase text-violet-600 dark:text-violet-500">
              Boletos vendidos
            </p>
          </div>
        </div>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setMainTab('caja')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all ${
              mainTab === 'caja'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Caja
          </button>
          <button
            type="button"
            onClick={() => setMainTab('loteria')}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl text-sm font-semibold border-2 transition-all ${
              mainTab === 'loteria'
                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100 shadow-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <Ticket className="w-4 h-4" />
            Lotería
          </button>
        </div>
      </div>

      {mainTab === 'caja' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Plus className="w-4 h-4" /> Venta rápida
            </h2>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                Categoría
              </label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(CATEGORY_LABELS) as SaleCategory[]).map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setLineCategory(cat)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                      lineCategory === cat
                        ? 'bg-amber-100 dark:bg-amber-900/40 border-amber-400 text-amber-900 dark:text-amber-200'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Concepto
                </label>
                <input
                  value={itemName}
                  onChange={e => setItemName(e.target.value)}
                  placeholder="Ej. Marlboro, Gordo..."
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:border-gray-900 dark:focus:border-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Cant.
                </label>
                <input
                  type="number"
                  min={1}
                  value={itemQty}
                  onChange={e => setItemQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:border-gray-900 dark:focus:border-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  P. unit. (€)
                </label>
                <input
                  value={itemPrice}
                  onChange={e => setItemPrice(e.target.value)}
                  placeholder="0,00"
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:border-gray-900 dark:focus:border-gray-500"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={addLine}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-2 border-gray-900 dark:border-white hover:opacity-90"
            >
              <Plus className="w-4 h-4" /> Añadir al ticket
            </button>
          </div>

          <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  value={cajaSearch}
                  onChange={e => setCajaSearch(e.target.value)}
                  placeholder="Buscar en líneas del ticket..."
                  className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50 text-sm text-gray-900 dark:text-white outline-none focus:border-gray-900 dark:focus:border-gray-500"
                />
              </div>
            </div>
            {filteredLines.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                {lines.length === 0 ? 'Sin líneas. Añade productos arriba.' : 'Nada coincide con la búsqueda.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {filteredLines.map(l => (
                  <li
                    key={l.id}
                    className="flex items-center gap-2 p-3 rounded-2xl border-2 border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">
                        {l.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {CATEGORY_LABELS[l.category]} · {formatCurrency(l.unitPrice)} × {l.qty}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateLineQty(l.id, -1)}
                        className="p-1.5 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold">{l.qty}</span>
                      <button
                        type="button"
                        onClick={() => updateLineQty(l.id, 1)}
                        className="p-1.5 rounded-lg border-2 border-gray-200 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 w-20 text-right">
                      {formatCurrency(l.qty * l.unitPrice)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeLine(l.id)}
                      className="p-2 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border-2 border-transparent hover:border-red-200"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">Forma de pago</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('efectivo')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold border-2 ${
                  paymentMethod === 'efectivo'
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-500 text-emerald-900 dark:text-emerald-200'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600'
                }`}
              >
                <Banknote className="w-4 h-4" /> Efectivo
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('tarjeta')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold border-2 ${
                  paymentMethod === 'tarjeta'
                    ? 'bg-sky-100 dark:bg-sky-900/30 border-sky-500 text-sky-900 dark:text-sky-200'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600'
                }`}
              >
                <CreditCard className="w-4 h-4" /> Tarjeta
              </button>
            </div>
            <div className="flex items-center justify-between pt-2 border-t-2 border-gray-100 dark:border-gray-800">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total ticket</span>
              <span className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(lineTotal)}</span>
            </div>
            <button
              type="button"
              onClick={processSale}
              disabled={lines.length === 0}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white border-2 border-amber-700 disabled:opacity-40 disabled:pointer-events-none shadow-md"
            >
              <Receipt className="w-4 h-4" /> Cobrar y generar ticket
            </button>
          </div>

          {salesToday.length > 0 && (
            <div className="rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Últimos tickets hoy</h3>
              <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                {salesToday.slice(0, 8).map(s => (
                  <li
                    key={s.id}
                    className="flex justify-between text-xs font-mono text-gray-600 dark:text-gray-400"
                  >
                    <span>{s.ticketNo}</span>
                    <span>{formatCurrency(s.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {mainTab === 'loteria' && (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-600" /> Comprobar números premiados
            </h2>
            <p className="text-xs text-gray-500">
              Referencia local del último sorteo (demo): compara con el boleto del cliente.
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                Sorteo
              </label>
              <select
                value={verifyDraw}
                onChange={e => setVerifyDraw(e.target.value as DrawType)}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:border-gray-900 dark:focus:border-gray-500"
              >
                {(Object.keys(DRAW_LABELS) as DrawType[]).map(d => (
                  <option key={d} value={d}>
                    {DRAW_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-xl border-2 border-amber-100 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-900/10 p-3 text-xs">
              <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                Números oficiales ({MOCK_WINNERS[verifyDraw].date})
              </p>
              <p className="font-mono text-gray-700 dark:text-gray-300">{MOCK_WINNERS[verifyDraw].numbers}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                Números del boleto
              </label>
              <input
                value={verifyInput}
                onChange={e => setVerifyInput(e.target.value)}
                placeholder={
                  verifyDraw === 'loteria_nacional'
                    ? 'Ej. 45231'
                    : 'Ej. 7, 14, 22, 31, 38, 45'
                }
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-mono outline-none focus:border-gray-900 dark:focus:border-gray-500"
              />
            </div>
            <button
              type="button"
              onClick={checkNumbers}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-semibold border-2 border-gray-900 dark:border-gray-100 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:opacity-90"
            >
              <Sparkles className="w-4 h-4" /> Comprobar
            </button>
            {verifyResult && (
              <p className="text-sm text-gray-700 dark:text-gray-300 border-2 border-gray-200 dark:border-gray-700 rounded-xl p-3">
                {verifyResult}
              </p>
            )}
          </div>

          <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Ticket className="w-4 h-4" /> Venta de boletos
            </h2>
            <div className="grid gap-2">
              {(Object.keys(DRAW_LABELS) as DrawType[]).map(d => (
                <div
                  key={d}
                  className="flex items-center justify-between p-3 rounded-2xl border-2 border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{DRAW_LABELS[d]}</p>
                    <p className="text-xs text-gray-500">
                      {formatCurrency(DRAW_PRICES[d])}/ud. · Stock:{' '}
                      <span className="font-mono font-bold text-violet-600 dark:text-violet-400">{stock[d]}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLotteryDraw(d)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-lg border-2 ${
                      lotteryDraw === d
                        ? 'border-violet-500 bg-violet-100 dark:bg-violet-900/40 text-violet-900 dark:text-violet-200'
                        : 'border-gray-200 dark:border-gray-600 text-gray-600'
                    }`}
                  >
                    Elegir
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Cantidad
                </label>
                <input
                  type="number"
                  min={1}
                  value={lotteryQty}
                  onChange={e => setLotteryQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm outline-none focus:border-gray-900 dark:focus:border-gray-500"
                />
              </div>
              <button
                type="button"
                onClick={sellLottery}
                className="px-4 py-2.5 rounded-2xl text-sm font-bold bg-violet-600 hover:bg-violet-700 text-white border-2 border-violet-700 shadow-md"
              >
                Vender
              </button>
            </div>
          </div>

          <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={lotteryFilter}
                onChange={e => setLotteryFilter(e.target.value)}
                placeholder="Filtrar ventas por sorteo o id..."
                className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50 text-sm outline-none focus:border-gray-900 dark:focus:border-gray-500 text-gray-900 dark:text-white"
              />
            </div>
            <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Historial ventas lotería (hoy)</h3>
            {filteredLotteryHistory.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-6">Sin ventas o sin coincidencias.</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {filteredLotteryHistory.map(r => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between text-xs p-2 rounded-xl border-2 border-gray-100 dark:border-gray-800"
                  >
                    <span className="font-mono text-gray-400 truncate max-w-[40%]">{r.id.slice(0, 8)}…</span>
                    <span className="text-gray-700 dark:text-gray-300 font-medium">
                      {DRAW_LABELS[r.draw]} ×{r.qty}
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(r.total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
