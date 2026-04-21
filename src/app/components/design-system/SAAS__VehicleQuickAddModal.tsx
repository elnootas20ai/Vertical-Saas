import { useEffect, useState } from 'react';
import { X, LoaderCircle, Zap } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useApp } from '../../context/AppContext';
import { parseLocaleNumber } from '../../lib/numberFormat';
import { useModalClose } from '../../hooks/useModalClose';
import { useWorkCenters } from '../../hooks/useWorkCenters';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  locations: string[];
}

export function SAAS__VehicleQuickAddModal({ isOpen, onClose, onSave, locations }: Props) {
  const navigate = useNavigate();
  const { addVehicle } = useApp();
  const { activeWorkCenters, hasWorkCenters } = useWorkCenters();
  const [formData, setFormData] = useState({
    registrationPlate: '',
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    mileage: '',
    purchasePrice: '',
    salePrice: '',
    status: 'listo',
    location: '',
    workCenterId: '',
    workCenterName: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setFormData({
      registrationPlate: '',
      brand: '',
      model: '',
      year: new Date().getFullYear(),
      mileage: '',
      purchasePrice: '',
      salePrice: '',
      status: 'listo',
      location: '',
      workCenterId: '',
      workCenterName: ''
    });
    setSaving(false);
    setError('');
  }, [isOpen]);

  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    try {
      setSaving(true);
      setError('');

      const createdVehicle = await addVehicle({
        registrationPlate: formData.registrationPlate,
        brand: formData.brand,
        model: formData.model,
        year: Number(formData.year),
        color: '',
        mileage: parseLocaleNumber(formData.mileage),
        purchasePrice: parseLocaleNumber(formData.purchasePrice),
        salePrice: formData.salePrice ? parseLocaleNumber(formData.salePrice) : undefined,
        status: formData.status as 'listo' | 'reservado' | 'preparacion',
        location: formData.location || undefined,
        purchaseDate: new Date().toISOString().split('T')[0],
        workCenterId: formData.workCenterId || undefined,
        workCenterName: activeWorkCenters.find(wc => wc.id === formData.workCenterId)?.name || undefined
      });

      onSave(formData);
      onClose();

      if (createdVehicle?.id) {
        navigate(`/saas/vehicles/${createdVehicle.id}`);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo guardar el vehículo');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const parsedPurchasePrice = parseLocaleNumber(formData.purchasePrice);
  const parsedSalePrice = parseLocaleNumber(formData.salePrice);
  const hasValidMargin =
    Number.isFinite(parsedPurchasePrice) &&
    Number.isFinite(parsedSalePrice) &&
    parsedPurchasePrice > 0 &&
    parsedSalePrice > 0;
  const margin = hasValidMargin ? parsedSalePrice - parsedPurchasePrice : 0;
  const marginPct = hasValidMargin ? (margin / parsedPurchasePrice) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-600" />
            Alta rápida de vehículo
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 pb-28">
          {/* Registration plate */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Matrícula *
            </label>
            <input
              type="text"
              required
              value={formData.registrationPlate}
              onChange={(e) => handleChange('registrationPlate', e.target.value.toUpperCase())}
              placeholder="1234-ABC"
              className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none font-mono font-bold"
            />
          </div>

          {/* Brand and Model */}
          <div className="grid grid-cols-2 gap-4 !mt-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Marca *
              </label>
              <input
                type="text"
                required
                value={formData.brand}
                onChange={(e) => handleChange('brand', e.target.value)}
                placeholder="BMW"
                className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Modelo *
              </label>
              <input
                type="text"
                required
                value={formData.model}
                onChange={(e) => handleChange('model', e.target.value)}
                placeholder="X3"
                className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Year and Mileage */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Año *
              </label>
              <input
                type="number"
                required
                value={formData.year}
                onChange={(e) => handleChange('year', parseInt(e.target.value))}
                min="1900"
                max={new Date().getFullYear() + 1}
                className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Kilómetros *
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={formData.mileage}
                onChange={(e) => handleChange('mileage', e.target.value)}
                placeholder="50000"
                className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Precio compra *
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={formData.purchasePrice}
                  onChange={(e) => handleChange('purchasePrice', e.target.value)}
                  placeholder="25000"
                  className="w-full px-4 py-2.5 pr-8 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">€</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Precio venta *
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={formData.salePrice}
                  onChange={(e) => handleChange('salePrice', e.target.value)}
                  placeholder="28000"
                  className="w-full px-4 py-2.5 pr-8 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">€</span>
              </div>
            </div>
          </div>

          {/* Status and Location */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Estado inicial *
              </label>
              <select
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
              >
                <option value="listo">Listo para vender</option>
                <option value="reservado">Reservado</option>
                <option value="preparacion">En preparación</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Ubicación inicial
              </label>
              <select
                value={formData.location}
                onChange={(e) => handleChange('location', e.target.value)}
                className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
              >
                <option value="">Sin asignar</option>
                {locations.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
          </div>

          {hasWorkCenters && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Centro de trabajo</label>
              <select
                value={formData.workCenterId}
                onChange={e => {
                  const workCenterId = e.target.value;
                  setFormData(prev => ({
                    ...prev,
                    workCenterId,
                    workCenterName: activeWorkCenters.find(wc => wc.id === workCenterId)?.name || ''
                  }));
                }}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 outline-none transition-all"
              >
                <option value="">Sin centro de trabajo</option>
                {activeWorkCenters.map((wc) => (
                  <option key={wc.id} value={wc.id}>{wc.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Preview margin */}
          {hasValidMargin && (
            <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl">
              <div className="text-sm text-green-700 mb-1">Margen estimado</div>
              <div className="text-2xl font-bold text-green-900">
                {margin.toLocaleString('es-ES')}€
              </div>
              <div className="text-sm text-green-600 mt-1">
                {marginPct.toFixed(1)}% de beneficio
              </div>
            </div>
          )}

          {error && (
            <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
              {error}
            </div>
          )}
        </form>

        <div className="sticky bottom-0 z-20 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-6 py-3 bg-gray-900 hover:bg-black text-white font-medium rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving && <LoaderCircle className="w-4 h-4 animate-spin" />}
            {saving ? 'Guardando...' : 'Guardar y abrir ficha'}
          </button>
        </div>
      </div>
    </div>
  );
}
