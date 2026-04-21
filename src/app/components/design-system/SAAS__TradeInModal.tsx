import React, { useState } from 'react';
import { X, Car, RefreshCw, ChevronDown } from 'lucide-react';
import type { TradeIn, TradeInCondition } from '../../context/AppContext';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tradeIn: Partial<TradeIn>) => Promise<void>;
  linkedVehicleId?: string;
  linkedVehicleName?: string;
}

const CONDITION_OPTIONS: { value: TradeInCondition; label: string; description: string; badge: string }[] = [
  { value: 'excelente', label: 'Excelente', description: 'Sin golpes ni arañazos visibles, mecánica perfecta', badge: 'bg-green-100 text-green-700' },
  { value: 'bueno',     label: 'Bueno',     description: 'Desgaste normal, algún arañazo menor',              badge: 'bg-blue-100 text-blue-700' },
  { value: 'regular',   label: 'Regular',   description: 'Golpes o defectos visibles, revisión recomendada',  badge: 'bg-amber-100 text-amber-700' },
  { value: 'malo',      label: 'Malo',      description: 'Daños graves, mecánica con problemas',              badge: 'bg-red-100 text-red-700' },
];

const DEPRECIATION: Record<TradeInCondition, number> = {
  excelente: 0.03,
  bueno: 0.08,
  regular: 0.15,
  malo: 0.25,
};

export function SAAS__TradeInModal({ isOpen, onClose, onSave, linkedVehicleId, linkedVehicleName }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<Partial<TradeIn>>({
    brand: '',
    model: '',
    version: '',
    year: new Date().getFullYear(),
    mileage: undefined,
    color: '',
    fuelType: '',
    registrationPlate: '',
    vin: '',
    condition: 'bueno',
    estimatedValue: 0,
    acceptedValue: undefined,
    notes: '',
    status: 'pending',
    linkedVehicleId: linkedVehicleId || undefined,
  });

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const fv = (f: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [f]: f === 'year' || f === 'mileage' || f === 'estimatedValue' || f === 'acceptedValue' ? Number(e.target.value) || undefined : e.target.value }));

  // Suggested value = estimatedValue * (1 - depreciation)
  const suggestedOffer = form.estimatedValue && form.condition
    ? Math.round(form.estimatedValue * (1 - DEPRECIATION[form.condition as TradeInCondition]) / 100) * 100
    : null;

  const inputCls = 'w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:border-blue-500 focus:outline-none transition-colors';
  const labelCls = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5';
  const selectCls = inputCls + ' bg-white dark:bg-gray-800';

  const handleSubmit = async () => {
    if (!form.brand?.trim() || !form.model?.trim() || !form.year) return;
    setLoading(true);
    try {
      await onSave({ ...form, acceptedValue: form.acceptedValue || suggestedOffer || undefined });
      onClose();
    } catch (_) { /* noop */ }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Car className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100 text-base">Tasación — Vehículo de entrada</h2>
              {linkedVehicleName && <p className="text-xs text-gray-500 dark:text-gray-400">Part-payment para: {linkedVehicleName}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
        </div>

        {/* Step indicator */}
        <div className="px-5 pt-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            {[1, 2].map(n => (
              <React.Fragment key={n}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= n ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'}`}>{n}</div>
                <span className={`text-xs font-medium ${step >= n ? 'text-indigo-700' : 'text-gray-400 dark:text-gray-500'}`}>{n === 1 ? 'Datos del vehículo' : 'Valoración'}</span>
                {n < 2 && <div className="flex-1 h-px bg-gray-200 mx-1" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {step === 1 ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Marca *</label>
                  <input value={form.brand || ''} onChange={fv('brand')} placeholder="Volkswagen" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Modelo *</label>
                  <input value={form.model || ''} onChange={fv('model')} placeholder="Golf" className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Año *</label>
                  <input type="number" value={form.year || ''} onChange={fv('year')} placeholder="2019" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Km</label>
                  <input type="number" value={form.mileage || ''} onChange={fv('mileage')} placeholder="85000" className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Versión</label>
                  <input value={form.version || ''} onChange={fv('version')} placeholder="1.4 TSI 125 CV" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Color</label>
                  <input value={form.color || ''} onChange={fv('color')} placeholder="Blanco perlado" className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Combustible</label>
                  <select value={form.fuelType || ''} onChange={fv('fuelType')} className={selectCls}>
                    <option value="">—</option>
                    <option value="gasolina">Gasolina</option>
                    <option value="diesel">Diésel</option>
                    <option value="hibrido">Híbrido</option>
                    <option value="electrico">Eléctrico</option>
                    <option value="glp">GLP</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Matrícula</label>
                  <input value={form.registrationPlate || ''} onChange={fv('registrationPlate')} placeholder="1234 ABC" className={inputCls + ' uppercase'} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Bastidor (VIN)</label>
                <input value={form.vin || ''} onChange={fv('vin')} placeholder="WVWZZZ1KZ..." className={inputCls + ' font-mono'} />
              </div>
            </>
          ) : (
            <>
              {/* Condition */}
              <div>
                <label className={labelCls}>Estado del vehículo</label>
                <div className="grid grid-cols-2 gap-2">
                  {CONDITION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setForm(p => ({ ...p, condition: opt.value }))}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${form.condition === opt.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                    >
                      <div className={`text-xs font-bold px-2 py-0.5 rounded-full inline-flex mb-1 ${opt.badge}`}>{opt.label}</div>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">{opt.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Estimated market value */}
              <div>
                <label className={labelCls}>Valor de mercado estimado (€)</label>
                <input type="number" min="0" value={form.estimatedValue || ''} onChange={fv('estimatedValue')} placeholder="15000" className={inputCls} />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Consulta Eurotax, AutoScout24 o similar para estimar el valor.</p>
              </div>

              {/* Suggested offer */}
              {suggestedOffer && (
                <div className="p-4 bg-indigo-50 border-2 border-indigo-200 rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Oferta sugerida</span>
                    <span className="text-[10px] text-indigo-500">Depreciación: -{(DEPRECIATION[form.condition as TradeInCondition] * 100).toFixed(0)}%</span>
                  </div>
                  <div className="text-2xl font-bold text-indigo-900">{suggestedOffer.toLocaleString('es-ES')}€</div>
                  <button
                    onClick={() => setForm(p => ({ ...p, acceptedValue: suggestedOffer }))}
                    className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    Usar como oferta final →
                  </button>
                </div>
              )}

              {/* Accepted value */}
              <div>
                <label className={labelCls}>Oferta final aceptada (€)</label>
                <input type="number" min="0" value={form.acceptedValue || ''} onChange={fv('acceptedValue')} placeholder={suggestedOffer ? String(suggestedOffer) : '0'} className={inputCls} />
              </div>

              {/* Notes */}
              <div>
                <label className={labelCls}>Notas del tasador</label>
                <textarea value={form.notes || ''} onChange={fv('notes')} rows={3} placeholder="Observaciones, daños, historial de mantenimiento..." className={inputCls + ' resize-none'} />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-5 py-4 flex gap-3 flex-shrink-0">
          {step === 2 && (
            <button onClick={() => setStep(1)} className="px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
              ← Anterior
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
            Cancelar
          </button>
          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              disabled={!form.brand?.trim() || !form.model?.trim() || !form.year}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
            >
              Siguiente →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading || !form.estimatedValue}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              Guardar tasación
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
