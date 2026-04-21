import { X, Filter } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  locationFilter: string;
  onLocationChange: (value: string) => void;
  brandFilter: string;
  onBrandChange: (value: string) => void;
  daysInStockFilter: string;
  onDaysInStockChange: (value: string) => void;
  brands: string[];
  locations: string[];
}

export function SAAS__VehicleFiltersDrawer({
  isOpen,
  onClose,
  statusFilter,
  onStatusChange,
  locationFilter,
  onLocationChange,
  brandFilter,
  onBrandChange,
  daysInStockFilter,
  onDaysInStockChange,
  brands,
  locations,
}: Props) {
  useModalClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleClearAll = () => {
    onStatusChange('all');
    onLocationChange('all');
    onBrandChange('all');
    onDaysInStockChange('all');
  };

  const statusOptions = [
    { value: 'all', label: 'Todos los estados' },
    { value: 'entrada', label: 'Entrada' },
    { value: 'preparacion', label: 'En preparación' },
    { value: 'listo', label: 'Listo para vender' },
    { value: 'reservado', label: 'Reservado' },
    { value: 'vendido', label: 'Vendido' },
    { value: 'scrapped', label: 'Desguace' },
  ];

  const daysOptions = [
    { value: 'all', label: 'Cualquier tiempo' },
    { value: '0-30', label: '0-30 días' },
    { value: '31-60', label: '31-60 días' },
    { value: '61-90', label: '61-90 días' },
    { value: '90+', label: 'Más de 90 días' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      
      {/* Drawer */}
      <div className="w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Filtros</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Estado
            </label>
            <div className="space-y-2">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onStatusChange(option.value)}
                  className={`w-full p-3 border-2 rounded-xl transition-all text-left ${
                    statusFilter === option.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{option.label}</span>
                    {statusFilter === option.value && (
                      <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Location filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Ubicación
            </label>
            <select
              value={locationFilter}
              onChange={(e) => onLocationChange(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">Todas las ubicaciones</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>

          {/* Brand filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Marca
            </label>
            <select
              value={brandFilter}
              onChange={(e) => onBrandChange(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">Todas las marcas</option>
              {brands.map((brand) => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>

          {/* Days in stock filter */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Días en stock
            </label>
            <div className="space-y-2">
              {daysOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => onDaysInStockChange(option.value)}
                  className={`w-full p-3 border-2 rounded-xl transition-all text-left ${
                    daysInStockFilter === option.value
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-gray-100">{option.label}</span>
                    {daysInStockFilter === option.value && (
                      <div className="w-5 h-5 bg-green-600 rounded-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3">
          <button
            onClick={handleClearAll}
            className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors"
          >
            Limpiar todo
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-gray-900 hover:bg-black text-white font-medium rounded-xl transition-colors"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
