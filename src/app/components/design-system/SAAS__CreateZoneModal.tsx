import { useState } from 'react';
import { X, MapPin, Check, Grid3x3, ChevronUp, ChevronDown } from 'lucide-react';
import { ZONE_COLOR_OPTIONS, type CreateParkingZoneInput } from '../../lib/parkingZones';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: CreateParkingZoneInput) => void;
}

// Preview: muestra hasta 20 plazas ficticias
function ZonePreview({ color, capacity, name, description }: {
  color: string; capacity: number; name: string; description: string;
}) {
  const col = ZONE_COLOR_OPTIONS.find(c => c.value === color) ?? ZONE_COLOR_OPTIONS[0];
  const displayCap = Math.min(capacity, 20);
  // Simula ~40% ocupación para el preview
  const occupiedCount = Math.round(displayCap * 0.4);

  return (
    <div className={`rounded-2xl border-2 ${col.border} overflow-hidden h-full flex flex-col`}>
      {/* Header zona */}
      <div className={`${col.preview} border-b ${col.border} px-5 py-4`}>
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-3 h-3 rounded-full ${col.bg}`} />
          <span className="font-bold text-gray-900 dark:text-gray-100 text-base">{name || 'Nombre de la zona'}</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{description || 'Descripción de la zona'}</p>
      </div>

      {/* Stats */}
      <div className={`${col.preview} grid grid-cols-3 divide-x divide-current/10 border-b ${col.border}`}>
        {[
          { label: 'Total',    val: capacity,                              cls: 'text-gray-800 dark:text-gray-200' },
          { label: 'Libres',   val: capacity - occupiedCount,              cls: 'text-emerald-600' },
          { label: 'Ocupadas', val: occupiedCount,                         cls: 'text-blue-600' },
        ].map(s => (
          <div key={s.label} className="text-center py-3">
            <p className={`text-xl font-bold ${s.cls}`}>{s.val}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Grid de plazas */}
      <div className="flex-1 p-4 bg-white dark:bg-gray-800 overflow-hidden">
        <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
          Vista previa de plazas {capacity > 20 && `(mostrando 20 de ${capacity})`}
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: displayCap }, (_, i) => {
            const isOccupied = i < occupiedCount;
            return (
              <div
                key={i}
                className={`aspect-square rounded-lg flex items-center justify-center text-[9px] font-bold border transition-all ${
                  isOccupied
                    ? `${col.spotOccupied} text-white border-transparent`
                    : `${col.spotFree} text-gray-400 dark:text-gray-500 border-transparent`
                }`}
              >
                {String(i + 1).padStart(2, '0')}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${col.spotOccupied}`} />
            <span className="text-[10px] text-gray-500 dark:text-gray-400">Ocupada</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${col.spotFree}`} />
            <span className="text-[10px] text-gray-500 dark:text-gray-400">Libre</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SAAS__CreateZoneModal({ isOpen, onClose, onCreate }: Props) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: 'blue',
    capacity: 10,
  });

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const submitZone = () => {
    if (!formData.name.trim()) return;
    onCreate({
      name: formData.name.trim(),
      description: formData.description.trim(),
      color: formData.color,
      capacity: formData.capacity,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitZone();
  };

  const selectedColor = ZONE_COLOR_OPTIONS.find(c => c.value === formData.color) ?? ZONE_COLOR_OPTIONS[0];

  const adjustCapacity = (delta: number) => {
    setFormData(prev => ({ ...prev, capacity: Math.max(1, Math.min(200, prev.capacity + delta)) }));
  };

  const lc = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2';
  const ic = 'w-full border-2 border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none transition-colors';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 ${selectedColor.bg} rounded-xl flex items-center justify-center flex-shrink-0 transition-colors`}>
              <MapPin className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">Nueva zona de aparcamiento</h2>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Configura la zona y se generarán las plazas automáticamente</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* ── Body: 2 columnas desktop ── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 h-full">

            {/* Columna izquierda — formulario */}
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 border-r border-gray-100 dark:border-gray-800">

              {/* Nombre */}
              <div>
                <label className={lc}>Nombre de la zona <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={formData.name}
                  onChange={e => handleChange('name', e.target.value)}
                  placeholder="Ej: Zona A, Exterior, Taller…"
                  className={ic}
                />
              </div>

              {/* Descripción */}
              <div>
                <label className={lc}>Descripción <span className="text-gray-400 dark:text-gray-500 font-normal">(opcional)</span></label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={e => handleChange('description', e.target.value)}
                  placeholder="Interior – Planta baja"
                  className={ic}
                />
              </div>

              {/* Color */}
              <div>
                <label className={lc}>Color identificativo <span className="text-red-400">*</span></label>
                <div className="grid grid-cols-3 gap-2">
                  {ZONE_COLOR_OPTIONS.map(opt => {
                    const active = formData.color === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleChange('color', opt.value)}
                        className={`relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 transition-all ${
                          active
                            ? 'border-gray-900 bg-gray-50 dark:bg-gray-800 shadow-sm'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-lg ${opt.bg} flex-shrink-0`} />
                        <span className={`text-sm font-medium ${active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'}`}>
                          {opt.label}
                        </span>
                        {active && (
                          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-gray-900 rounded-full flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Número de plazas */}
              <div>
                <label className={lc}>Número de plazas <span className="text-red-400">*</span></label>
                <div className="flex items-center gap-3">
                  {/* Spinner manual */}
                  <div className="flex items-center border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => adjustCapacity(-1)}
                      className="px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-r border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      required
                      min={1}
                      max={200}
                      value={formData.capacity}
                      onChange={e => handleChange('capacity', Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 text-center py-2.5 text-sm font-bold text-gray-900 dark:text-gray-100 focus:outline-none bg-white dark:bg-gray-800"
                    />
                    <button
                      type="button"
                      onClick={() => adjustCapacity(1)}
                      className="px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-l border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-snug">
                    Se crearán <span className="font-semibold text-gray-800 dark:text-gray-200">{formData.capacity}</span> plazas numeradas automáticamente
                  </p>
                </div>

                {/* Presets rápidos */}
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">Rápido:</span>
                  {[5, 10, 15, 20, 30, 50].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleChange('capacity', n)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border ${
                        formData.capacity === n
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Info box */}
              <div className={`flex items-start gap-3 p-3.5 rounded-xl border ${selectedColor.preview} ${selectedColor.border}`}>
                <Grid3x3 className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-600 dark:text-gray-400" />
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  Las plazas se nombrarán secuencialmente según el prefijo del nombre de zona.
                  Podrás renombrar y editar cada plaza individualmente después de crearla.
                </p>
              </div>
            </form>

            {/* Columna derecha — preview */}
            <div className="px-6 py-5 bg-gray-50/50 flex flex-col gap-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Vista previa</span>
                <span className="text-[10px] text-gray-300">Simulación con ~40% ocupación</span>
              </div>
              <div className="flex-1 min-h-[380px]">
                <ZonePreview
                  color={formData.color}
                  capacity={formData.capacity}
                  name={formData.name}
                  description={formData.description}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submitZone}
            disabled={!formData.name.trim()}
            className="flex-1 py-2.5 bg-gray-900 hover:bg-black text-white font-semibold rounded-xl transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <MapPin className="w-4 h-4" />
            Crear zona · {formData.capacity} plazas
          </button>
        </div>
      </div>
    </div>
  );
}
