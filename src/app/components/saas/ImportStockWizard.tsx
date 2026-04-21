import { useState } from 'react';
import { Upload, CheckCircle, AlertCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface ImportStockWizardProps {
  onClose: () => void;
}

export function ImportStockWizard({ onClose }: ImportStockWizardProps) {
  useModalClose(true, onClose);
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [columnMapping, setColumnMapping] = useState({
    plate: '',
    brand: '',
    model: '',
    year: '',
    km: '',
    price: '',
    cost: ''
  });

  const csvColumns = ['Matrícula', 'Marca', 'Modelo', 'Año', 'Kilómetros', 'Precio', 'Coste', 'Color', 'Combustible'];
  const systemFields = [
    { id: 'plate', label: 'Matrícula', required: true },
    { id: 'brand', label: 'Marca', required: true },
    { id: 'model', label: 'Modelo', required: true },
    { id: 'year', label: 'Año', required: true },
    { id: 'km', label: 'Kilómetros', required: true },
    { id: 'price', label: 'Precio venta', required: true },
    { id: 'cost', label: 'Coste compra', required: true }
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile && uploadedFile.type === 'text/csv') {
      setFile(uploadedFile);
    }
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleConfirm = () => {
    alert('Importación completada: 12 vehículos añadidos al stock');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Importar stock desde CSV</h2>
            <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600">✕</button>
          </div>
          
          {/* Stepper */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 ${step >= 1 ? 'text-blue-600' : 'text-gray-400 dark:text-gray-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                {step > 1 ? <CheckCircle className="w-5 h-5" /> : '1'}
              </div>
              <span className="text-sm font-medium">Subir archivo</span>
            </div>
            <div className="flex-1 h-0.5 bg-gray-200" />
            <div className={`flex items-center gap-2 ${step >= 2 ? 'text-blue-600' : 'text-gray-400 dark:text-gray-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                {step > 2 ? <CheckCircle className="w-5 h-5" /> : '2'}
              </div>
              <span className="text-sm font-medium">Mapear columnas</span>
            </div>
            <div className="flex-1 h-0.5 bg-gray-200" />
            <div className={`flex items-center gap-2 ${step >= 3 ? 'text-blue-600' : 'text-gray-400 dark:text-gray-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 3 ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                3
              </div>
              <span className="text-sm font-medium">Confirmar</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Paso 1: Subir archivo CSV</h3>
              
              {!file ? (
                <label className="border-2 border-dashed border-gray-300 rounded-lg p-12 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 transition-colors">
                  <Upload className="w-12 h-12 text-gray-400 dark:text-gray-500 mb-4" />
                  <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">Arrastra tu archivo CSV aquí</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">o haz clic para seleccionar</p>
                  <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                  <span className="px-4 py-2 bg-[#0f1419] text-white rounded-lg text-sm">Seleccionar archivo</span>
                </label>
              ) : (
                <div className="border border-green-200 bg-green-50 rounded-lg p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <CheckCircle className="w-6 h-6 text-green-600" />
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{file.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{(file.size / 1024).toFixed(2)} KB</p>
                    </div>
                    <button onClick={() => setFile(null)} className="text-sm text-red-600 hover:text-red-700">
                      Eliminar
                    </button>
                  </div>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-900">
                      ✓ Archivo cargado correctamente. Se detectaron <strong>12 vehículos</strong> en el CSV.
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">📋 Formato requerido:</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  El CSV debe contener las columnas: Matrícula, Marca, Modelo, Año, Kilómetros, Precio, Coste
                </p>
                <button className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
                  Descargar plantilla de ejemplo
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Paso 2: Mapear columnas</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Relaciona las columnas de tu CSV con los campos del sistema
              </p>

              <div className="space-y-4">
                {systemFields.map((field) => (
                  <div key={field.id} className="grid grid-cols-2 gap-4 items-center">
                    <div>
                      <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {field.label}
                        {field.required && <span className="text-red-600 ml-1">*</span>}
                      </label>
                    </div>
                    <select
                      value={columnMapping[field.id as keyof typeof columnMapping]}
                      onChange={(e) => setColumnMapping({ ...columnMapping, [field.id]: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Seleccionar columna CSV --</option>
                      {csvColumns.map((col) => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Mapeo automático detectado</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Hemos pre-mapeado las columnas basándonos en los nombres. Revísalas antes de continuar.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Paso 3: Confirmar importación</h3>
              
              <div className="p-6 bg-green-50 border border-green-200 rounded-lg mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">Todo listo para importar</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">12 vehículos serán añadidos al stock</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900 dark:text-gray-100">Vista previa (3 primeros vehículos):</h4>
                {[
                  { plate: '1234ABC', brand: 'BMW', model: 'Serie 3', year: 2020, km: 45000, price: 28500 },
                  { plate: '5678DEF', brand: 'Mercedes', model: 'Clase A', year: 2019, km: 52000, price: 24900 },
                  { plate: '9012GHI', brand: 'Audi', model: 'A4', year: 2018, km: 68000, price: 22500 }
                ].map((vehicle, index) => (
                  <div key={index} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{vehicle.brand} {vehicle.model} {vehicle.year}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Matrícula: {vehicle.plate} · {vehicle.km.toLocaleString()} km
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">€{vehicle.price.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">... y 9 vehículos más</p>
              </div>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Los vehículos se añadirán con estado <strong>"En stock"</strong> y sin ubicación asignada. 
                  Podrás asignar ubicaciones después desde el módulo de Vehículos.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <button
            onClick={step === 1 ? onClose : handleBack}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {step === 1 ? 'Cancelar' : 'Atrás'}
          </button>
          
          <div className="flex gap-2">
            {step < 3 ? (
              <button
                onClick={handleNext}
                disabled={step === 1 && !file}
                className="flex items-center gap-2 px-6 py-2 bg-[#0f1419] text-white rounded-lg hover:bg-[#1a1f26] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Confirmar importación
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
