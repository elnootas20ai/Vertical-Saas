import { useState, useMemo, useCallback } from 'react';
import { X, Upload, FileText, CalendarClock } from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';

interface CostCenter {
  id: string;
  name: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (data: any) => void;
  costCenters: CostCenter[];
}

const CATEGORY_OPTIONS = [
  { value: 'society',       label: 'Sociedad' },
  { value: 'contracts',     label: 'Contratos y alquileres' },
  { value: 'licenses',      label: 'Licencias' },
  { value: 'financial',     label: 'Impuestos' },
  { value: 'user-expenses', label: 'Gastos del usuario' },
  { value: 'other',         label: 'Otros documentos' },
];

const SUGGESTIONS: Record<string, string[]> = {
  society:        ['Estatutos', 'IAE', 'CIF', 'Constitución', 'Poderes Notariales', 'Escritura de Sociedad'],
  contracts:      ['Contrato Local Principal', 'Contrato Almacén', 'Contrato Alquiler', 'Contrato Leasing'],
  licenses:       ['Licencia de Apertura', 'Licencia de Actividad', 'Permiso Municipal', 'Certificado Sanitario'],
  financial:      ['Modelo 303', 'Modelo 390', 'Declaración IVA', 'Certificado Retenciones', 'Modelo 349'],
  'user-expenses': ['Factura Suministros', 'Factura Mantenimiento', 'Gastos Varios', 'Dietas', 'Transporte'],
  other:          ['Certificado Seguro', 'Informe Auditoría', 'Políticas Internas', 'Manual Empleado'],
};

export function SAAS__UploadDocumentModal({ isOpen, onClose, onUpload, costCenters }: Props) {
  const [formData, setFormData] = useState({
    name: '',
    category: 'society',
    costCenterId: '',
    file: null as File | null,
    notes: '',
    expiresAt: '',
  });
  const [dragOver, setDragOver] = useState(false);

  useModalClose(isOpen, onClose);

  const suggestions = useMemo(() => SUGGESTIONS[formData.category] || [], [formData.category]);

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    onUpload(formData);
  }, [formData, onUpload]);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileSelect = (file: File | null) => {
    if (!file) return;
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('El archivo supera el tamaño máximo de 10 MB');
      return;
    }
    setFormData(prev => ({
      ...prev,
      file,
      name: prev.name || file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files?.[0] || null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] || null;
    handleFileSelect(file);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            Subir documento
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* File Upload with drag & drop */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Archivo *</label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                dragOver ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : 'border-gray-300 dark:border-gray-600 hover:border-blue-500'
              }`}
            >
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" onChange={handleFileChange} className="hidden" id="file-upload" />
              <label htmlFor="file-upload" className="cursor-pointer">
                {formData.file ? (
                  <div>
                    <FileText className="w-12 h-12 text-blue-600 mx-auto mb-3" />
                    <div className="font-semibold text-gray-900 dark:text-gray-100">{formData.file.name}</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {(formData.file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                    <button type="button" onClick={(e) => { e.preventDefault(); setFormData(prev => ({ ...prev, file: null })); }} className="text-xs text-red-500 hover:underline mt-2">
                      Quitar archivo
                    </button>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
                    <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      Arrastra un archivo o haz clic para seleccionar
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      PDF, JPG, PNG o DOCX &middot; Máximo 10 MB
                    </div>
                  </div>
                )}
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Categoría */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Categoría *</label>
              <select
                required
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Vencimiento */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <span className="flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5" /> Vencimiento</span>
              </label>
              <input
                type="date"
                value={formData.expiresAt}
                onChange={(e) => handleChange('expiresAt', e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
              />
            </div>

            {/* Nombre con sugerencias */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre del documento *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Nombre del documento"
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
              />
              {suggestions.length > 0 && !formData.name && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleChange('name', s)}
                      className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-medium hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Centro de coste */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Centro de coste</label>
              <select
                value={formData.costCenterId}
                onChange={(e) => handleChange('costCenterId', e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
              >
                <option value="">Sin centro de coste</option>
                {costCenters.map((center) => (
                  <option key={center.id} value={center.id}>{center.name}</option>
                ))}
              </select>
            </div>

            {/* Notas */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notas</label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Información adicional..."
                rows={2}
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-blue-500 focus:outline-none resize-none text-sm"
              />
            </div>
          </div>
        </form>

        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3">
          <button onClick={onClose} className="flex-1 px-6 py-3 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-xl transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => handleSubmit()}
            disabled={!formData.file || !formData.name}
            className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Subir documento
          </button>
        </div>
      </div>
    </div>
  );
}
