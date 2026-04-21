import { useEffect, useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, LoaderCircle, Upload } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { parseLocaleNumber } from '../../lib/numberFormat';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: any) => void;
  locations: string[];
}

const INITIAL_FORM = () => ({
  registrationPlate: '',
  brand: '',
  model: '',
  year: new Date().getFullYear(),
  mileage: '',
  vin: '',
  color: '',
  fuelType: 'diesel',
  origin: 'particular',
  supplierName: '',
  purchasePrice: '',
  purchaseDate: new Date().toISOString().split('T')[0],
  location: '',
  documents: [] as string[],
});

export function SAAS__VehicleReceptionWizard({ isOpen, onClose, onComplete, locations }: Props) {
  useModalClose(isOpen, onClose);
  const { addVehicle } = useApp();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCurrentStep(1);
    setFormData(INITIAL_FORM());
    setSaving(false);
    setError('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (currentStep < 4) setCurrentStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  const handleComplete = async () => {
    try {
      setSaving(true);
      setError('');

      await addVehicle({
        registrationPlate: formData.registrationPlate,
        brand: formData.brand,
        model: formData.model,
        year: Number(formData.year),
        color: formData.color || '',
        fuelType: formData.fuelType as 'gasolina' | 'diesel' | 'hibrido' | 'electrico',
        mileage: parseLocaleNumber(formData.mileage),
        vin: formData.vin || undefined,
        purchasePrice: parseLocaleNumber(formData.purchasePrice),
        purchaseDate: formData.purchaseDate || undefined,
        origin: formData.origin as 'particular' | 'empresa' | 'subasta' | 'otro',
        supplierName: formData.supplierName || undefined,
        status: 'entrada',
        location: formData.location || undefined,
      });

      onComplete(formData);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo registrar la entrada');
    } finally {
      setSaving(false);
    }
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return formData.registrationPlate && formData.brand && formData.model && formData.year && formData.mileage;
      case 2:
        return formData.purchasePrice && (formData.origin === 'particular' || formData.supplierName);
      case 3:
        return true;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const renderStep1 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Datos del vehículo</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Matrícula *</label>
        <input
          type="text"
          required
          value={formData.registrationPlate}
          onChange={(e) => handleChange('registrationPlate', e.target.value.toUpperCase())}
          placeholder="1234-ABC"
          className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none font-mono font-bold"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Marca *</label>
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
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Modelo *</label>
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Año *</label>
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
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kilómetros *</label>
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

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Bastidor (VIN)</label>
        <input
          type="text"
          value={formData.vin}
          onChange={(e) => handleChange('vin', e.target.value.toUpperCase())}
          placeholder="WBADT43452G123456"
          className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none font-mono"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Color</label>
          <input
            type="text"
            value={formData.color}
            onChange={(e) => handleChange('color', e.target.value)}
            placeholder="Negro"
            className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Combustible</label>
          <select
            value={formData.fuelType}
            onChange={(e) => handleChange('fuelType', e.target.value)}
            className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
          >
            <option value="diesel">Diésel</option>
            <option value="gasolina">Gasolina</option>
            <option value="electrico">Eléctrico</option>
            <option value="hibrido">Híbrido</option>
          </select>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Origen y coste de compra</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Origen del vehículo *</label>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: 'particular', label: 'Particular', emoji: '👤' },
            { value: 'empresa', label: 'Proveedor', emoji: '🏢' },
            { value: 'subasta', label: 'Subasta', emoji: '⚖️' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleChange('origin', option.value)}
              className={`p-4 border-2 rounded-xl transition-all ${
                formData.origin === option.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="text-3xl mb-2">{option.emoji}</div>
              <div className="font-semibold text-sm">{option.label}</div>
            </button>
          ))}
        </div>
      </div>

      {formData.origin !== 'particular' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Nombre {formData.origin === 'empresa' ? 'del proveedor' : 'de la subasta'} *
          </label>
          <input
            type="text"
            required
            value={formData.supplierName}
            onChange={(e) => handleChange('supplierName', e.target.value)}
            placeholder={formData.origin === 'empresa' ? 'Automoción García S.L.' : 'BCA España'}
            className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Precio de compra *</label>
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
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha de compra</label>
          <input
            type="date"
            value={formData.purchaseDate}
            onChange={(e) => handleChange('purchaseDate', e.target.value)}
            className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Ubicación inicial</h3>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl mb-4">
        <p className="text-sm text-blue-800">
          Selecciona la plaza de aparcamiento donde se ubicará el vehículo tras la recepción
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Plaza de aparcamiento</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleChange('location', '')}
            className={`p-4 border-2 rounded-xl transition-all text-left ${
              formData.location === ''
                ? 'border-amber-500 bg-amber-50'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="font-semibold text-gray-900 dark:text-gray-100">Sin asignar</div>
            {formData.location === '' && (
              <div className="mt-2 text-xs text-amber-700">✓ Seleccionado</div>
            )}
          </button>
          {locations.map((loc) => (
            <button
              key={loc}
              type="button"
              onClick={() => handleChange('location', loc)}
              className={`p-4 border-2 rounded-xl transition-all text-left ${
                formData.location === loc
                  ? 'border-amber-500 bg-amber-50'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="font-semibold text-gray-900 dark:text-gray-100">{loc}</div>
              {formData.location === loc && (
                <div className="mt-2 text-xs text-amber-700">✓ Seleccionado</div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Documentos de recepción</h3>

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
        <p className="text-sm text-amber-800">
          Sube los documentos recibidos con el vehículo (ficha técnica, permiso circulación, etc.)
        </p>
      </div>

      <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-gray-400 transition-colors cursor-pointer">
        <Upload className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
        <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Arrastra archivos o haz clic para subir</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">PDF, JPG, PNG hasta 10MB</p>
      </div>

      {formData.documents.length > 0 && (
        <div className="space-y-2">
          {formData.documents.map((doc, idx) => (
            <div key={idx} className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
              <Check className="w-5 h-5 text-green-600" />
              <span className="flex-1 text-sm font-medium text-green-900">{doc}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
        Puedes añadir más documentos desde la ficha del vehículo
      </p>

      {error && (
        <div className="px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );

  const steps = [
    { number: 1, title: 'Datos vehículo', component: renderStep1 },
    { number: 2, title: 'Origen y coste', component: renderStep2 },
    { number: 3, title: 'Ubicación', component: renderStep3 },
    { number: 4, title: 'Documentos', component: renderStep4 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Entrada de recepción</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            {steps.map((step, idx) => (
              <div key={step.number} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                    currentStep > step.number
                      ? 'bg-green-600 text-white'
                      : currentStep === step.number
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-600 dark:text-gray-400'
                  }`}>
                    {currentStep > step.number ? <Check className="w-5 h-5" /> : step.number}
                  </div>
                  <div className={`text-xs mt-1 font-medium ${
                    currentStep === step.number ? 'text-blue-900' : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    {step.title}
                  </div>
                </div>
                {idx < steps.length - 1 && (
                  <div className={`flex-1 h-1 mx-2 rounded ${
                    currentStep > step.number ? 'bg-green-600' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {steps[currentStep - 1].component()}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3">
          {currentStep > 1 && (
            <button
              onClick={handleBack}
              className="px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors flex items-center gap-2"
            >
              <ChevronLeft className="w-5 h-5" />
              Anterior
            </button>
          )}
          <div className="flex-1" />
          {currentStep < 4 ? (
            <button
              onClick={handleNext}
              disabled={!isStepValid()}
              className="px-6 py-3 bg-gray-900 hover:bg-black text-white font-medium rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Siguiente
              <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              disabled={!isStepValid() || saving}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <LoaderCircle className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              {saving ? 'Guardando...' : 'Crear vehículo'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
