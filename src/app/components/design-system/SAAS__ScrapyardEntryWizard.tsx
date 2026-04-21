import { useEffect, useState, useRef } from 'react';
import {
  X, ChevronRight, ChevronLeft, Check, LoaderCircle, Upload,
  Camera, Car, User, FileText, MapPin, ClipboardCheck, AlertTriangle,
  Fuel, Gauge,
} from 'lucide-react';
import { useModalClose } from '../../hooks/useModalClose';
import {
  SCRAPYARD_COMBUSTIBLES, SCRAPYARD_PROCEDENCIAS, MARCAS_COMUNES,
  type ScrapyardFuelType, type ScrapyardOriginType, type ScrapyardAcquisitionType,
  type ScrapyardBajaStatus, type ScrapyardPaymentMethod,
} from '../../lib/scrapyardTypes';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: WizardFormData) => Promise<void>;
  locations: string[];
  existingMatriculas: string[];
  existingBastidores: string[];
}

export interface WizardFormData {
  matricula: string;
  bastidor: string;
  marca: string;
  modelo: string;
  version: string;
  anio: number;
  km: string;
  combustible: ScrapyardFuelType;
  color: string;
  puertas: string;
  potencia: string;
  transmision: string;
  tipoCarroceria: string;
  tipoProcedencia: ScrapyardOriginType;
  tipoAdquisicion: ScrapyardAcquisitionType;
  propietarioNombre: string;
  propietarioDocumento: string;
  propietarioTelefono: string;
  propietarioEmail: string;
  fechaEntrada: string;
  costeCompra: string;
  costeTransporte: string;
  formaPago: ScrapyardPaymentMethod;
  fichaTecnica: boolean;
  permisoCirculacion: boolean;
  contratoCompraventa: boolean;
  certificadoBaja: boolean;
  documentFiles: File[];
  fotos: string[];
  ubicacion: string;
  estadoBaja: ScrapyardBajaStatus;
  observaciones: string;
}

const INITIAL_FORM = (): WizardFormData => ({
  matricula: '', bastidor: '', marca: '', modelo: '', version: '',
  anio: new Date().getFullYear(), km: '', combustible: 'diesel',
  color: '', puertas: '', potencia: '', transmision: '', tipoCarroceria: '',
  tipoProcedencia: 'particular', tipoAdquisicion: 'compra',
  propietarioNombre: '', propietarioDocumento: '', propietarioTelefono: '', propietarioEmail: '',
  fechaEntrada: new Date().toISOString().split('T')[0],
  costeCompra: '', costeTransporte: '', formaPago: 'transferencia',
  fichaTecnica: false, permisoCirculacion: false, contratoCompraventa: false, certificadoBaja: false,
  documentFiles: [], fotos: [], ubicacion: '', estadoBaja: 'pendiente', observaciones: '',
});

const STEPS = [
  { number: 1, title: 'Identificacion', icon: Car },
  { number: 2, title: 'Propietario', icon: User },
  { number: 3, title: 'Coste', icon: ClipboardCheck },
  { number: 4, title: 'Documentos', icon: FileText },
  { number: 5, title: 'Fotos y ubicacion', icon: MapPin },
  { number: 6, title: 'Confirmacion', icon: Check },
];

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function InputField({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none transition-colors text-sm ${className || ''}`}
    />
  );
}

function SelectField({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none transition-colors text-sm ${className || ''}`}
    >
      {children}
    </select>
  );
}

export function SAAS__ScrapyardEntryWizard({ isOpen, onClose, onComplete, locations, existingMatriculas, existingBastidores }: Props) {
  useModalClose(isOpen, onClose);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<WizardFormData>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [showBrandList, setShowBrandList] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setForm(INITIAL_FORM());
    setSaving(false);
    setError('');
  }, [isOpen]);

  if (!isOpen) return null;

  const set = (field: keyof WizardFormData, value: unknown) => setForm(prev => ({ ...prev, [field]: value }));

  const normalizedMat = form.matricula.toUpperCase().replace(/[\s-]/g, '');
  const normalizedVin = form.bastidor.toUpperCase().replace(/[\s-]/g, '');
  const dupMatricula = normalizedMat.length > 3 && existingMatriculas.some(m => m.toUpperCase().replace(/[\s-]/g, '') === normalizedMat);
  const dupBastidor = normalizedVin.length > 5 && existingBastidores.some(b => b.toUpperCase().replace(/[\s-]/g, '') === normalizedVin);

  const handleBrandInput = (val: string) => {
    set('marca', val);
    if (val.length >= 1) {
      const filtered = MARCAS_COMUNES.filter(m => m.toLowerCase().startsWith(val.toLowerCase()));
      setBrandSuggestions(filtered.slice(0, 8));
      setShowBrandList(filtered.length > 0);
    } else {
      setShowBrandList(false);
    }
  };

  const handlePhotoUpload = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setForm(prev => ({ ...prev, fotos: [...prev.fotos, reader.result as string] }));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (idx: number) => {
    setForm(prev => ({ ...prev, fotos: prev.fotos.filter((_, i) => i !== idx) }));
  };

  const isStepValid = (): boolean => {
    switch (step) {
      case 1: return !!(form.matricula && form.bastidor && form.marca && form.modelo && form.anio && form.km && !dupMatricula && !dupBastidor);
      case 2: return !!(form.propietarioNombre);
      case 3: return !!(form.costeCompra || form.costeCompra === '0');
      case 4: return true;
      case 5: return true;
      case 6: return true;
      default: return false;
    }
  };

  const handleNext = () => { if (step < 6) setStep(s => s + 1); };
  const handleBack = () => { if (step > 1) setStep(s => s - 1); };

  const handleComplete = async () => {
    try {
      setSaving(true);
      setError('');
      await onComplete(form);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrar la entrada');
    } finally {
      setSaving(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <Car className="w-5 h-5 text-blue-500" /> Datos del vehiculo
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel required>Matricula</FieldLabel>
          <InputField
            value={form.matricula}
            onChange={e => set('matricula', e.target.value.toUpperCase())}
            placeholder="1234-ABC"
            className={`font-mono font-bold ${dupMatricula ? 'border-red-500 dark:border-red-500' : ''}`}
          />
          {dupMatricula && (
            <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Matricula ya registrada
            </p>
          )}
        </div>
        <div>
          <FieldLabel required>Bastidor (VIN)</FieldLabel>
          <InputField
            value={form.bastidor}
            onChange={e => set('bastidor', e.target.value.toUpperCase())}
            placeholder="WBADT43452G123456"
            maxLength={17}
            className={`font-mono ${dupBastidor ? 'border-red-500 dark:border-red-500' : ''}`}
          />
          {dupBastidor && (
            <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Bastidor ya registrado
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="relative">
          <FieldLabel required>Marca</FieldLabel>
          <InputField
            value={form.marca}
            onChange={e => handleBrandInput(e.target.value)}
            onFocus={() => form.marca && handleBrandInput(form.marca)}
            onBlur={() => setTimeout(() => setShowBrandList(false), 200)}
            placeholder="Volkswagen"
          />
          {showBrandList && brandSuggestions.length > 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
              {brandSuggestions.map(b => (
                <button
                  key={b}
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-900 dark:text-gray-100"
                  onMouseDown={() => { set('marca', b); setShowBrandList(false); }}
                >
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <FieldLabel required>Modelo</FieldLabel>
          <InputField value={form.modelo} onChange={e => set('modelo', e.target.value)} placeholder="Golf" />
        </div>
      </div>

      <div>
        <FieldLabel>Version</FieldLabel>
        <InputField value={form.version} onChange={e => set('version', e.target.value)} placeholder="GTI 2.0 TSI" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <FieldLabel required>Anio</FieldLabel>
          <InputField type="number" value={form.anio} onChange={e => set('anio', parseInt(e.target.value) || 0)} min={1960} max={new Date().getFullYear() + 1} />
        </div>
        <div>
          <FieldLabel required>Kilometros</FieldLabel>
          <div className="relative">
            <InputField type="text" inputMode="decimal" value={form.km} onChange={e => set('km', e.target.value)} placeholder="120000" />
            <Gauge className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
        </div>
        <div>
          <FieldLabel required>Combustible</FieldLabel>
          <SelectField value={form.combustible} onChange={e => set('combustible', e.target.value)}>
            {SCRAPYARD_COMBUSTIBLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </SelectField>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <FieldLabel>Color</FieldLabel>
          <InputField value={form.color} onChange={e => set('color', e.target.value)} placeholder="Negro" />
        </div>
        <div>
          <FieldLabel>Puertas</FieldLabel>
          <InputField type="number" value={form.puertas} onChange={e => set('puertas', e.target.value)} min={2} max={5} />
        </div>
        <div>
          <FieldLabel>Potencia (CV)</FieldLabel>
          <InputField type="number" value={form.potencia} onChange={e => set('potencia', e.target.value)} placeholder="150" />
        </div>
        <div>
          <FieldLabel>Transmision</FieldLabel>
          <SelectField value={form.transmision} onChange={e => set('transmision', e.target.value)}>
            <option value="">-</option>
            <option value="manual">Manual</option>
            <option value="automatico">Automatico</option>
            <option value="semiauto">Semiautomatico</option>
          </SelectField>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <User className="w-5 h-5 text-blue-500" /> Propietario / Proveedor
      </h3>

      <div>
        <FieldLabel required>Origen del vehiculo</FieldLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
          {SCRAPYARD_PROCEDENCIAS.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => set('tipoProcedencia', o.value)}
              className={`p-3 border-2 rounded-xl transition-all text-left ${
                form.tipoProcedencia === o.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="text-2xl mb-1">{o.emoji}</div>
              <div className="font-semibold text-xs text-gray-900 dark:text-gray-100">{o.label}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel required>Tipo de adquisicion</FieldLabel>
        <div className="flex gap-2 flex-wrap mt-1">
          {[
            { value: 'compra' as const, label: 'Compra' },
            { value: 'retirada' as const, label: 'Retirada' },
            { value: 'donacion' as const, label: 'Donacion' },
            { value: 'abandono' as const, label: 'Abandono' },
          ].map(a => (
            <button
              key={a.value}
              type="button"
              onClick={() => set('tipoAdquisicion', a.value)}
              className={`px-4 py-2 text-sm font-medium rounded-lg border-2 transition-all ${
                form.tipoAdquisicion === a.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel required>Nombre propietario / proveedor</FieldLabel>
          <InputField value={form.propietarioNombre} onChange={e => set('propietarioNombre', e.target.value)} placeholder="Juan Garcia Lopez" />
        </div>
        <div>
          <FieldLabel>DNI / CIF</FieldLabel>
          <InputField value={form.propietarioDocumento} onChange={e => set('propietarioDocumento', e.target.value)} placeholder="12345678A" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel>Telefono</FieldLabel>
          <InputField type="tel" value={form.propietarioTelefono} onChange={e => set('propietarioTelefono', e.target.value)} placeholder="600 123 456" />
        </div>
        <div>
          <FieldLabel>Email</FieldLabel>
          <InputField type="email" value={form.propietarioEmail} onChange={e => set('propietarioEmail', e.target.value)} placeholder="correo@ejemplo.com" />
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <ClipboardCheck className="w-5 h-5 text-blue-500" /> Coste y fecha de entrada
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel required>Fecha de entrada</FieldLabel>
          <InputField type="date" value={form.fechaEntrada} onChange={e => set('fechaEntrada', e.target.value)} />
        </div>
        <div>
          <FieldLabel>Forma de pago</FieldLabel>
          <SelectField value={form.formaPago} onChange={e => set('formaPago', e.target.value)}>
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="compensacion">Compensacion</option>
          </SelectField>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel required>Coste de compra / retirada</FieldLabel>
          <div className="relative">
            <InputField
              type="text"
              inputMode="decimal"
              value={form.costeCompra}
              onChange={e => set('costeCompra', e.target.value)}
              placeholder="500"
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">EUR</span>
          </div>
        </div>
        <div>
          <FieldLabel>Coste transporte / grua</FieldLabel>
          <div className="relative">
            <InputField
              type="text"
              inputMode="decimal"
              value={form.costeTransporte}
              onChange={e => set('costeTransporte', e.target.value)}
              placeholder="80"
              className="pr-8"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">EUR</span>
          </div>
        </div>
      </div>

      {(form.costeCompra || form.costeTransporte) && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
          <div className="flex justify-between text-sm">
            <span className="text-blue-700 dark:text-blue-300">Coste total</span>
            <span className="font-bold text-blue-900 dark:text-blue-100">
              {(parseFloat(form.costeCompra || '0') + parseFloat(form.costeTransporte || '0')).toLocaleString('es-ES')} EUR
            </span>
          </div>
        </div>
      )}
    </div>
  );

  const renderStep4 = () => {
    const docs = [
      { key: 'fichaTecnica' as const, label: 'Ficha tecnica' },
      { key: 'permisoCirculacion' as const, label: 'Permiso de circulacion' },
      { key: 'contratoCompraventa' as const, label: 'Contrato de compraventa' },
      { key: 'certificadoBaja' as const, label: 'Certificado de baja' },
    ];
    const completados = docs.filter(d => form[d.key]).length;

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-500" /> Documentacion recibida
        </h3>

        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Marca los documentos recibidos con el vehiculo. Puedes subir los archivos ahora o desde la ficha.
          </p>
        </div>

        <div className="space-y-3">
          {docs.map(d => (
            <label
              key={d.key}
              className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                form[d.key]
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <input
                type="checkbox"
                checked={form[d.key]}
                onChange={e => set(d.key, e.target.checked)}
                className="sr-only"
              />
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                form[d.key]
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'border-gray-300 dark:border-gray-600'
              }`}>
                {form[d.key] && <Check className="w-4 h-4" />}
              </div>
              <span className={`text-sm font-medium ${form[d.key] ? 'text-emerald-900 dark:text-emerald-200' : 'text-gray-700 dark:text-gray-300'}`}>
                {d.label}
              </span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <div className={`w-2 h-2 rounded-full ${completados === docs.length ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {completados}/{docs.length} documentos registrados
        </div>

        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center hover:border-gray-400 dark:hover:border-gray-500 transition-colors cursor-pointer">
          <Upload className="w-10 h-10 text-gray-400 mx-auto mb-2" />
          <p className="font-medium text-sm text-gray-700 dark:text-gray-300">Arrastra archivos o haz clic para subir</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">PDF, JPG, PNG hasta 10MB</p>
        </div>
      </div>
    );
  };

  const renderStep5 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <Camera className="w-5 h-5 text-blue-500" /> Fotos y ubicacion
      </h3>

      <div className="space-y-3">
        <FieldLabel>Fotos del vehiculo</FieldLabel>
        <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
          Recomendado: frontal, trasera, laterales, interior y motor
        </p>

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {form.fotos.map((foto, idx) => (
            <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border-2 border-gray-200 dark:border-gray-700 group">
              <img src={foto} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(idx)}
                className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-1 hover:border-blue-400 dark:hover:border-blue-500 transition-colors text-gray-400"
          >
            <Camera className="w-6 h-6" />
            <span className="text-xs">Subir</span>
          </button>
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={e => handlePhotoUpload(e.target.files)}
        />
      </div>

      <div className="mt-6">
        <FieldLabel>Ubicacion inicial</FieldLabel>
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl mb-3">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            Selecciona la zona donde se ubicara el vehiculo tras la recepcion
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => set('ubicacion', '')}
            className={`p-3 border-2 rounded-xl transition-all text-left ${
              form.ubicacion === ''
                ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">Sin asignar</div>
          </button>
          {locations.map(loc => (
            <button
              key={loc}
              type="button"
              onClick={() => set('ubicacion', loc)}
              className={`p-3 border-2 rounded-xl transition-all text-left ${
                form.ubicacion === loc
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-blue-500" /> {loc}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderStep6 = () => {
    const totalCoste = parseFloat(form.costeCompra || '0') + parseFloat(form.costeTransporte || '0');
    const docCount = [form.fichaTecnica, form.permisoCirculacion, form.contratoCompraventa, form.certificadoBaja].filter(Boolean).length;
    const combustibleLabel = SCRAPYARD_COMBUSTIBLES.find(c => c.value === form.combustible)?.label || form.combustible;
    const procedenciaLabel = SCRAPYARD_PROCEDENCIAS.find(p => p.value === form.tipoProcedencia)?.label || form.tipoProcedencia;

    return (
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-emerald-500" /> Resumen de entrada
        </h3>

        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 space-y-2">
            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">Vehiculo</h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Matricula</span>
              <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{form.matricula || '-'}</span>
              <span className="text-gray-500 dark:text-gray-400">Bastidor</span>
              <span className="font-mono text-gray-900 dark:text-gray-100 text-xs">{form.bastidor || '-'}</span>
              <span className="text-gray-500 dark:text-gray-400">Vehiculo</span>
              <span className="text-gray-900 dark:text-gray-100">{form.marca} {form.modelo} {form.version}</span>
              <span className="text-gray-500 dark:text-gray-400">Anio / Km</span>
              <span className="text-gray-900 dark:text-gray-100">{form.anio} / {parseInt(form.km || '0').toLocaleString('es-ES')} km</span>
              <span className="text-gray-500 dark:text-gray-400">Combustible</span>
              <span className="text-gray-900 dark:text-gray-100">{combustibleLabel}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 space-y-2">
            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">Propietario</h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Nombre</span>
              <span className="text-gray-900 dark:text-gray-100">{form.propietarioNombre || '-'}</span>
              <span className="text-gray-500 dark:text-gray-400">Procedencia</span>
              <span className="text-gray-900 dark:text-gray-100">{procedenciaLabel}</span>
              <span className="text-gray-500 dark:text-gray-400">Adquisicion</span>
              <span className="text-gray-900 dark:text-gray-100 capitalize">{form.tipoAdquisicion}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 space-y-2">
            <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">Economia</h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Fecha entrada</span>
              <span className="text-gray-900 dark:text-gray-100">{form.fechaEntrada}</span>
              <span className="text-gray-500 dark:text-gray-400">Coste total</span>
              <span className="font-bold text-gray-900 dark:text-gray-100">{totalCoste.toLocaleString('es-ES')} EUR</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{docCount}/4</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Documentos</p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{form.fotos.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Fotos</p>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 text-center">
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{form.ubicacion || 'N/A'}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Ubicacion</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel>Estado de baja</FieldLabel>
            <SelectField value={form.estadoBaja} onChange={e => set('estadoBaja', e.target.value)}>
              <option value="pendiente">Pendiente</option>
              <option value="no_aplica">No aplica</option>
            </SelectField>
          </div>
        </div>

        <div>
          <FieldLabel>Observaciones</FieldLabel>
          <textarea
            value={form.observaciones}
            onChange={e => set('observaciones', e.target.value)}
            rows={3}
            placeholder="Notas adicionales sobre el vehiculo..."
            className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none transition-colors text-sm resize-none"
          />
        </div>

        {!form.ubicacion && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200">Sin ubicacion asignada. Se generara una alerta.</p>
          </div>
        )}

        {docCount < 4 && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-800 dark:text-amber-200">Documentacion incompleta ({docCount}/4). Puedes completarla despues.</p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
      </div>
    );
  };

  const stepRenderers = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Entrada de vehiculo</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center justify-between">
            {STEPS.map((s, idx) => (
              <div key={s.number} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    step > s.number
                      ? 'bg-emerald-500 text-white'
                      : step === s.number
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                  }`}>
                    {step > s.number ? <Check className="w-4 h-4" /> : s.number}
                  </div>
                  <span className={`text-[10px] mt-1 font-medium hidden sm:block ${
                    step === s.number ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {s.title}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1.5 rounded transition-colors ${
                    step > s.number ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {stepRenderers[step - 1]()}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex gap-3 shrink-0">
          {step > 1 && (
            <button
              onClick={handleBack}
              className="px-5 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
          )}
          <div className="flex-1" />
          {step < 6 ? (
            <button
              onClick={handleNext}
              disabled={!isStepValid()}
              className="px-5 py-2.5 bg-gray-900 dark:bg-gray-100 hover:bg-black dark:hover:bg-white text-white dark:text-gray-900 font-medium rounded-xl transition-colors flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleComplete}
              disabled={saving}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-colors flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? 'Registrando...' : 'Registrar entrada'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
