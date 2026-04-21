import { useState, useMemo } from 'react';
import {
  X, Calculator, TrendingUp, BarChart2, Sparkles, Check,
  Plus, Trash2, Euro, Target, ArrowRight, Info,
} from 'lucide-react';
import type { Vehicle } from '../../context/AppContext';
import { useModalClose } from '../../hooks/useModalClose';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExtraCost {
  id: string;
  label: string;
  amount: string;
}

interface MarketVehicle {
  label: string;
  price: number;
  diff: number; // days in market
  mileage: number;
  highlight?: boolean;
}

interface Props {
  isOpen: boolean;
  vehicle: Vehicle;
  workshopCosts: number;
  onClose: () => void;
  onApplyPrice: (price: number) => void;
}

// ─── Market simulation ────────────────────────────────────────────────────────

function generateMarketData(vehicle: Vehicle, baseSuggestedPrice: number): MarketVehicle[] {
  const base = baseSuggestedPrice;
  const seed = vehicle.brand.charCodeAt(0) + (vehicle.year % 10);

  const variance = (idx: number) => {
    const factors = [0.94, 1.02, 0.97, 1.06, 0.91, 1.08];
    return factors[(seed + idx) % factors.length];
  };

  return [
    {
      label: `${vehicle.brand} ${vehicle.model} ${vehicle.year}`,
      price: Math.round(base * variance(0) / 100) * 100,
      diff: 12,
      mileage: Math.round((vehicle.mileage ?? 80000) * 0.9 / 1000) * 1000,
    },
    {
      label: `${vehicle.brand} ${vehicle.model} ${vehicle.year}`,
      price: Math.round(base * variance(1) / 100) * 100,
      diff: 7,
      mileage: Math.round((vehicle.mileage ?? 80000) * 1.1 / 1000) * 1000,
    },
    {
      label: `${vehicle.brand} ${vehicle.model} ${vehicle.year - 1}`,
      price: Math.round(base * variance(2) / 100) * 100,
      diff: 23,
      mileage: Math.round((vehicle.mileage ?? 80000) * 1.2 / 1000) * 1000,
    },
    {
      label: `${vehicle.brand} ${vehicle.model} ${vehicle.year}`,
      price: Math.round(base * variance(3) / 100) * 100,
      diff: 5,
      mileage: Math.round((vehicle.mileage ?? 80000) * 0.85 / 1000) * 1000,
      highlight: true,
    },
    {
      label: `${vehicle.brand} ${vehicle.model} ${vehicle.year + 1}`,
      price: Math.round(base * variance(4) / 100) * 100,
      diff: 31,
      mileage: Math.round((vehicle.mileage ?? 80000) * 0.7 / 1000) * 1000,
    },
  ].sort((a, b) => a.price - b.price);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SAAS__PriceCalculatorModal({
  isOpen,
  vehicle,
  workshopCosts,
  onClose,
  onApplyPrice,
}: Props) {
  const [extraCosts, setExtraCosts] = useState<ExtraCost[]>([
    { id: 'publicidad', label: 'Publicidad / Marketing', amount: '200' },
    { id: 'limpieza',   label: 'Limpieza y detailing',   amount: '150' },
    { id: 'gestion',    label: 'Gestión administrativa',  amount: '80'  },
  ]);
  const [newCostLabel, setNewCostLabel] = useState('');
  const [showAddCost, setShowAddCost]   = useState(false);

  const [marginType,  setMarginType]  = useState<'pct' | 'fixed'>('pct');
  const [marginValue, setMarginValue] = useState('18');

  const [applied, setApplied] = useState(false);
  const [activeSection, setActiveSection] = useState<'costes' | 'mercado'>('costes');

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const totalExtraCosts = extraCosts.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const totalCost       = vehicle.purchasePrice + workshopCosts + totalExtraCosts;

  const rawMarginValue = parseFloat(marginValue) || 0;
  const suggestedPrice = marginType === 'pct'
    ? Math.round(totalCost * (1 + rawMarginValue / 100) / 100) * 100
    : Math.round((totalCost + rawMarginValue) / 100) * 100;

  const margin     = suggestedPrice - totalCost;
  const marginPct  = totalCost > 0 ? (margin / totalCost * 100) : 0;
  const isPositive = margin >= 0;

  const marketData = useMemo(
    () => generateMarketData(vehicle, suggestedPrice),
    [vehicle, suggestedPrice],
  );
  const marketMin = Math.min(...marketData.map(m => m.price));
  const marketMax = Math.max(...marketData.map(m => m.price));
  const marketAvg = Math.round(marketData.reduce((s, m) => s + m.price, 0) / marketData.length / 100) * 100;

  const pricePosition = marketMax > marketMin
    ? Math.max(0, Math.min(100, ((suggestedPrice - marketMin) / (marketMax - marketMin)) * 100))
    : 50;

  const updateExtraCost = (id: string, amount: string) =>
    setExtraCosts(prev => prev.map(c => c.id === id ? { ...c, amount } : c));
  const deleteExtraCost = (id: string) =>
    setExtraCosts(prev => prev.filter(c => c.id !== id));
  const addExtraCost = () => {
    if (!newCostLabel.trim()) return;
    setExtraCosts(prev => [...prev, { id: `custom-${Date.now()}`, label: newCostLabel.trim(), amount: '0' }]);
    setNewCostLabel('');
    setShowAddCost(false);
  };

  const handleApply = () => {
    onApplyPrice(suggestedPrice);
    setApplied(true);
    setTimeout(() => { setApplied(false); onClose(); }, 1000);
  };

  // ── Styles ──
  const inputCls  = 'w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-colors bg-white dark:bg-gray-800';
  const sectionBtn = (active: boolean) =>
    `flex-1 py-2 text-xs font-semibold rounded-xl transition-all ${
      active ? 'bg-gray-900 text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
    }`;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4">
        <div className="bg-white dark:bg-gray-800 w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl flex flex-col max-h-[94dvh] sm:max-h-[92vh]">

          {/* Handle (mobile) */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <Calculator className="w-4.5 h-4.5 text-indigo-700" style={{ width: 18, height: 18 }} />
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Calculadora de precio</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                  {vehicle.brand} {vehicle.model} · {vehicle.registrationPlate}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Section tabs */}
          <div className="px-5 pt-3 pb-2 flex-shrink-0">
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-xl">
              <button onClick={() => setActiveSection('costes')}  className={sectionBtn(activeSection === 'costes')}>
                Costes y margen
              </button>
              <button onClick={() => setActiveSection('mercado')} className={sectionBtn(activeSection === 'mercado')}>
                Comparativa mercado
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-5 pb-2">

            {/* ── Suggested price — always visible ── */}
            <div className={`mb-4 p-4 rounded-2xl border-2 ${isPositive ? 'bg-indigo-50 border-indigo-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className={`w-3.5 h-3.5 ${isPositive ? 'text-indigo-500' : 'text-red-500'}`} />
                <span className={`text-[10px] font-bold uppercase tracking-widest ${isPositive ? 'text-indigo-500' : 'text-red-500'}`}>
                  Precio sugerido
                </span>
              </div>
              <div className={`text-4xl font-black tracking-tight ${isPositive ? 'text-indigo-900' : 'text-red-800'}`}>
                {suggestedPrice.toLocaleString('es-ES')}€
              </div>
              <div className={`flex items-center gap-2 mt-1 text-xs font-semibold ${isPositive ? 'text-indigo-600' : 'text-red-600'}`}>
                <span>Margen: {isPositive ? '+' : ''}{margin.toLocaleString('es-ES')}€</span>
                <span className="opacity-50">·</span>
                <span>{isPositive ? '+' : ''}{marginPct.toFixed(1)}% sobre coste</span>
              </div>
              {vehicle.salePrice && (
                <div className="mt-2 pt-2 border-t border-indigo-200 flex items-center gap-1.5 text-xs text-indigo-600">
                  <Info className="w-3 h-3 flex-shrink-0" />
                  <span>Precio actual: <strong>{vehicle.salePrice.toLocaleString('es-ES')}€</strong></span>
                  {suggestedPrice !== vehicle.salePrice && (
                    <span className={`ml-auto font-semibold ${suggestedPrice > vehicle.salePrice ? 'text-green-600' : 'text-red-500'}`}>
                      {suggestedPrice > vehicle.salePrice ? '+' : ''}
                      {(suggestedPrice - vehicle.salePrice).toLocaleString('es-ES')}€
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ── Section: Costes y margen ── */}
            {activeSection === 'costes' && (
              <div className="space-y-4">

                {/* Cost breakdown */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Euro className="w-3.5 h-3.5 text-blue-600" />Desglose de costes
                    </p>
                  </div>
                  <div className="divide-y divide-gray-50">

                    {/* Purchase price */}
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Precio de compra</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                        {vehicle.purchasePrice.toLocaleString('es-ES')}€
                      </span>
                    </div>

                    {/* Workshop costs */}
                    <div className="flex items-center justify-between px-4 py-3">
                      <div>
                        <span className="text-sm text-gray-600 dark:text-gray-400">Gastos de taller</span>
                        <div className="text-[10px] text-gray-400 dark:text-gray-500">De reparaciones registradas</div>
                      </div>
                      <span className="font-semibold text-purple-700 text-sm">
                        {workshopCosts.toLocaleString('es-ES')}€
                      </span>
                    </div>

                    {/* Extra costs */}
                    {extraCosts.map(cost => (
                      <div key={cost.id} className="flex items-center gap-3 px-4 py-2.5 group">
                        <span className="flex-1 text-sm text-gray-600 dark:text-gray-400 truncate">{cost.label}</span>
                        <div className="flex items-center gap-1">
                          <div className="relative w-24">
                            <input
                              type="number"
                              value={cost.amount}
                              onChange={e => updateExtraCost(cost.id, e.target.value)}
                              className="w-full px-2 py-1 pr-5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-right focus:border-blue-400 focus:outline-none"
                            />
                            <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500">€</span>
                          </div>
                          <button
                            onClick={() => deleteExtraCost(cost.id)}
                            className="w-6 h-6 flex items-center justify-center hover:bg-red-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3 h-3 text-red-400" />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Add cost */}
                    {showAddCost ? (
                      <div className="flex items-center gap-2 px-4 py-2.5">
                        <input
                          autoFocus
                          value={newCostLabel}
                          onChange={e => setNewCostLabel(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addExtraCost(); if (e.key === 'Escape') setShowAddCost(false); }}
                          placeholder="Concepto del gasto"
                          className={inputCls + ' flex-1'}
                        />
                        <button onClick={addExtraCost} className="px-3 py-2 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-black transition-colors flex-shrink-0">
                          Añadir
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAddCost(true)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />Añadir otro gasto
                      </button>
                    )}

                    {/* Total */}
                    <div className="flex items-center justify-between px-4 py-3 bg-blue-50">
                      <span className="font-bold text-blue-900 text-sm">Coste total</span>
                      <span className="font-bold text-blue-900">{totalCost.toLocaleString('es-ES')}€</span>
                    </div>
                  </div>
                </div>

                {/* Margin objective */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-indigo-600" />Margen objetivo
                    </p>
                  </div>
                  <div className="px-4 py-3 space-y-3">
                    {/* Type toggle */}
                    <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-xl">
                      <button
                        onClick={() => setMarginType('pct')}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${marginType === 'pct' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                      >
                        Porcentaje (%)
                      </button>
                      <button
                        onClick={() => setMarginType('fixed')}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${marginType === 'fixed' ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                      >
                        Importe fijo (€)
                      </button>
                    </div>

                    {/* Input + quick presets */}
                    <div>
                      <div className="relative mb-2">
                        <input
                          type="number"
                          value={marginValue}
                          onChange={e => setMarginValue(e.target.value)}
                          min={0}
                          placeholder="0"
                          className={inputCls + ' pr-10 text-lg font-bold'}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 dark:text-gray-500">
                          {marginType === 'pct' ? '%' : '€'}
                        </span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {marginType === 'pct'
                          ? [10, 15, 18, 20, 25, 30].map(v => (
                              <button
                                key={v}
                                onClick={() => setMarginValue(String(v))}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
                                  marginValue === String(v)
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600'
                                }`}
                              >
                                {v}%
                              </button>
                            ))
                          : [500, 1000, 1500, 2000, 3000, 5000].map(v => (
                              <button
                                key={v}
                                onClick={() => setMarginValue(String(v))}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
                                  marginValue === String(v)
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600'
                                }`}
                              >
                                {v.toLocaleString('es-ES')}€
                              </button>
                            ))
                        }
                      </div>
                    </div>

                    {/* Result breakdown */}
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-gray-500 dark:text-gray-400">Coste total</span>
                        <span className="font-semibold text-gray-700 dark:text-gray-300">{totalCost.toLocaleString('es-ES')}€</span>
                      </div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-gray-500 dark:text-gray-400">+ Margen ({marginType === 'pct' ? `${rawMarginValue}%` : `fijo`})</span>
                        <span className="font-semibold text-indigo-600">+{margin.toLocaleString('es-ES')}€</span>
                      </div>
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-1.5 flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-900 dark:text-gray-100">= Precio sugerido</span>
                        <span className="font-bold text-indigo-700">{suggestedPrice.toLocaleString('es-ES')}€</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Section: Comparativa de mercado ── */}
            {activeSection === 'mercado' && (
              <div className="space-y-4">

                {/* Market summary KPIs */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Mín. mercado', value: marketMin, color: 'bg-green-50 text-green-900' },
                    { label: 'Media',         value: marketAvg, color: 'bg-blue-50 text-blue-900'  },
                    { label: 'Máx. mercado', value: marketMax, color: 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100'  },
                  ].map(kpi => (
                    <div key={kpi.label} className={`p-3 rounded-xl ${kpi.color}`}>
                      <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{kpi.label}</div>
                      <div className="font-bold text-sm">{kpi.value.toLocaleString('es-ES')}€</div>
                    </div>
                  ))}
                </div>

                {/* Tu precio en el rango */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <BarChart2 className="w-3.5 h-3.5 text-indigo-600" />Posición de tu precio
                    </p>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      pricePosition < 35 ? 'bg-green-100 text-green-700'
                      : pricePosition < 65 ? 'bg-blue-100 text-blue-700'
                      : 'bg-amber-100 text-amber-700'
                    }`}>
                      {pricePosition < 35 ? 'Competitivo' : pricePosition < 65 ? 'Mercado medio' : 'Premium'}
                    </span>
                  </div>
                  {/* Range bar */}
                  <div className="relative h-3 bg-gradient-to-r from-green-200 via-blue-200 to-amber-200 rounded-full mb-2">
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-indigo-600 border-2 border-white rounded-full shadow-lg transition-all duration-300"
                      style={{ left: `${pricePosition}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                    <span>{marketMin.toLocaleString('es-ES')}€</span>
                    <span className="font-semibold text-indigo-700">{suggestedPrice.toLocaleString('es-ES')}€</span>
                    <span>{marketMax.toLocaleString('es-ES')}€</span>
                  </div>
                </div>

                {/* Vehicles list */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800">
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-blue-600" />Vehículos similares en mercado
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Datos simulados para orientación</p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {marketData.map((mv, idx) => {
                      const diff = mv.price - suggestedPrice;
                      const isOurPrice = idx === Math.floor(marketData.length / 2);
                      return (
                        <div
                          key={idx}
                          className={`flex items-center gap-3 px-4 py-3 ${mv.highlight ? 'bg-indigo-50/60' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{mv.label}</span>
                              {mv.highlight && (
                                <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                  Referencia
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                              {mv.mileage.toLocaleString('es-ES')} km · Publicado hace {mv.diff} días
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">{mv.price.toLocaleString('es-ES')}€</div>
                            <div className={`text-[10px] font-semibold ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
                              {diff === 0 ? '— Igual' : diff > 0 ? `+${diff.toLocaleString('es-ES')}€ más caro` : `${diff.toLocaleString('es-ES')}€ más barato`}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Vs media */}
                <div className={`p-4 rounded-2xl border-2 ${suggestedPrice < marketAvg ? 'bg-green-50 border-green-200' : suggestedPrice > marketAvg ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${suggestedPrice < marketAvg ? 'bg-green-200' : 'bg-amber-200'}`}>
                      <TrendingUp className={`w-5 h-5 ${suggestedPrice < marketAvg ? 'text-green-700' : 'text-amber-700'}`} />
                    </div>
                    <div>
                      <div className={`font-bold text-sm ${suggestedPrice < marketAvg ? 'text-green-900' : 'text-amber-900'}`}>
                        {suggestedPrice < marketAvg
                          ? `${(marketAvg - suggestedPrice).toLocaleString('es-ES')}€ por debajo de la media`
                          : suggestedPrice > marketAvg
                            ? `${(suggestedPrice - marketAvg).toLocaleString('es-ES')}€ por encima de la media`
                            : 'Precio en la media del mercado'}
                      </div>
                      <div className={`text-xs mt-0.5 ${suggestedPrice < marketAvg ? 'text-green-700' : 'text-amber-700'}`}>
                        Media de mercado: {marketAvg.toLocaleString('es-ES')}€
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-5 pt-3 pb-5 sm:pb-4 flex-shrink-0 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={onClose}
              className="flex-1 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-2xl transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleApply}
              disabled={applied}
              className={`flex-[2] py-3 font-semibold rounded-2xl transition-all text-sm flex items-center justify-center gap-2 ${
                applied
                  ? 'bg-green-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {applied ? (
                <>
                  <Check className="w-4 h-4" />Precio aplicado
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4" />Aplicar {suggestedPrice.toLocaleString('es-ES')}€
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
