import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { useApp, type Vehicle } from '../../../../context/AppContext';
import { useAuth } from '../../../../context/AuthContext';
import { parseLocaleNumber } from '../../../../lib/numberFormat';
import {
  checkVehicleDuplicatesRequest,
  VehicleDuplicateError,
} from '../../../../lib/vehicleApi';
import { createAcquisitionRequest, updateAcquisitionRequest, type VehicleAcquisition } from '../../../../lib/vehicleAcquisitionApi';
import {
  SettingsWizardFooter,
  SettingsWizardShell,
  type SettingsWizardStep,
} from '../../settings/SettingsWizardShell';

export type CompraWizardFormState = {
  supplierType: 'particular' | 'proveedor';
  supplierName: string;
  purchaseDate: string;
  purchasePrice: string;
  notes: string;
  registrationPlate: string;
  vin: string;
  brand: string;
  model: string;
  version: string;
  year: string;
  mileage: string;
  color: string;
  fuelType: string;
  transmission: string;
  power: string;
};

const STEPS = [
  { id: 'compra', title: 'Datos de la compra', hint: 'Proveedor y precio' },
  { id: 'vehiculo', title: 'Datos del vehículo', hint: 'Identificación y ficha' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

const FUEL_TYPES = [
  { value: '', label: 'Sin especificar' },
  { value: 'gasolina', label: 'Gasolina' },
  { value: 'diesel', label: 'Diésel' },
  { value: 'hibrido', label: 'Híbrido' },
  { value: 'electrico', label: 'Eléctrico' },
  { value: 'glp', label: 'GLP' },
  { value: 'otro', label: 'Otro' },
];

const TRANSMISSION_TYPES = [
  { value: '', label: 'Sin especificar' },
  { value: 'manual', label: 'Manual' },
  { value: 'automatico', label: 'Automático' },
  { value: 'semiauto', label: 'Semiautomático' },
];

const inputClass =
  'w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-amber-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

function emptyForm(): CompraWizardFormState {
  return {
    supplierType: 'particular',
    supplierName: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    purchasePrice: '',
    notes: '',
    registrationPlate: '',
    vin: '',
    brand: '',
    model: '',
    version: '',
    year: String(new Date().getFullYear()),
    mileage: '',
    color: '',
    fuelType: '',
    transmission: '',
    power: '',
  };
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}

function validateStep1(form: CompraWizardFormState): Partial<Record<keyof CompraWizardFormState, string>> {
  const errors: Partial<Record<keyof CompraWizardFormState, string>> = {};
  if (!form.supplierName.trim()) errors.supplierName = 'Indica el nombre del vendedor o proveedor';
  if (!form.purchaseDate.trim()) errors.purchaseDate = 'La fecha es obligatoria';
  const price = parseLocaleNumber(form.purchasePrice);
  if (!form.purchasePrice.trim() || !Number.isFinite(price) || price <= 0) {
    errors.purchasePrice = 'El precio de compra es obligatorio';
  }
  return errors;
}

function validateStep2(form: CompraWizardFormState): Partial<Record<keyof CompraWizardFormState, string>> {
  const errors: Partial<Record<keyof CompraWizardFormState, string>> = {};
  if (!form.registrationPlate.trim()) errors.registrationPlate = 'La matrícula es obligatoria';
  if (!form.brand.trim()) errors.brand = 'La marca es obligatoria';
  if (!form.model.trim()) errors.model = 'El modelo es obligatorio';
  if (!form.year.trim() || Number(form.year) < 1900) errors.year = 'Introduce un año válido';
  if (form.mileage.trim()) {
    const km = parseLocaleNumber(form.mileage);
    if (!Number.isFinite(km) || km < 0) errors.mileage = 'Kilómetros no válidos';
  }
  if (form.power.trim()) {
    const power = parseLocaleNumber(form.power);
    if (!Number.isFinite(power) || power < 0) errors.power = 'Potencia no válida';
  }
  return errors;
}

type ComprasNewPurchaseWizardProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (acquisitionId: string) => void;
  onUpdated?: (acquisitionId: string) => void;
  editing?: VehicleAcquisition | null;
};

function formFromAcquisition(
  acquisition: VehicleAcquisition,
  vehicle?: Vehicle | null,
): CompraWizardFormState {
  return {
    supplierType: acquisition.sellerType === 'empresa' ? 'proveedor' : 'particular',
    supplierName: acquisition.sellerName || '',
    purchaseDate: (acquisition.acquisitionDate || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    purchasePrice: acquisition.costCompra > 0 ? String(acquisition.costCompra) : '',
    notes: acquisition.notes || '',
    registrationPlate: acquisition.registrationPlate || vehicle?.registrationPlate || '',
    vin: vehicle?.vin || '',
    brand: vehicle?.brand || '',
    model: vehicle?.model || '',
    version: vehicle?.version || '',
    year: vehicle?.year ? String(vehicle.year) : String(new Date().getFullYear()),
    mileage: vehicle?.mileage != null ? String(vehicle.mileage) : '',
    color: vehicle?.color || '',
    fuelType: vehicle?.fuelType || '',
    transmission: vehicle?.transmission || '',
    power: vehicle?.power != null ? String(vehicle.power) : '',
  };
}

export function ComprasNewPurchaseWizard({
  open,
  onClose,
  onCreated,
  onUpdated,
  editing = null,
}: ComprasNewPurchaseWizardProps) {
  const { user } = useAuth();
  const { addVehicle, vehicles, updateVehicle } = useApp();
  const userId = user?.userId || user?._id || '';
  const isEdit = Boolean(editing?.id);

  const [step, setStep] = useState<StepId>('compra');
  const [form, setForm] = useState<CompraWizardFormState>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CompraWizardFormState, string>>>({});
  const [saving, setSaving] = useState(false);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const isLastStep = stepIndex === STEPS.length - 1;

  const linkedVehicle = useMemo(() => {
    if (!editing?.vehicleId) return null;
    return (vehicles ?? []).find((v) => v.id === editing.vehicleId) ?? null;
  }, [editing, vehicles]);

  useEffect(() => {
    if (!open) return;
    setStep('compra');
    setForm(editing ? formFromAcquisition(editing, linkedVehicle) : emptyForm());
    setFieldErrors({});
    setSaving(false);
  }, [open, editing, linkedVehicle]);

  const set = useCallback((key: keyof CompraWizardFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  const wizardSteps: SettingsWizardStep[] = useMemo(
    () => STEPS.map((item, index) => ({
      id: item.id,
      title: item.title,
      hint: item.hint,
      completed: index < stepIndex,
      hasError: index === 0 && step === 'vehiculo' && Object.keys(validateStep1(form)).length > 0
        ? false
        : undefined,
    })),
    [form, step, stepIndex],
  );

  const goNext = () => {
    const errors = validateStep1(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error('Completa los campos obligatorios del paso 1');
      return;
    }
    setStep('vehiculo');
  };

  const goBack = () => setStep('compra');

  const handleSave = async () => {
    const step1Errors = validateStep1(form);
    const step2Errors = validateStep2(form);
    const allErrors = { ...step1Errors, ...step2Errors };
    setFieldErrors(allErrors);
    if (Object.keys(step1Errors).length > 0) {
      setStep('compra');
      toast.error('Revisa los datos de la compra');
      return;
    }
    if (Object.keys(step2Errors).length > 0) {
      toast.error('Completa los campos obligatorios del vehículo');
      return;
    }
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }

    setSaving(true);
    try {
      const plate = form.registrationPlate.trim().toUpperCase();
      const vin = form.vin.trim().toUpperCase();
      const purchasePrice = parseLocaleNumber(form.purchasePrice);

      if (isEdit && editing) {
        await updateAcquisitionRequest(userId, editing.id, {
          sellerType: form.supplierType === 'proveedor' ? 'empresa' : 'particular',
          acquisitionType: form.supplierType === 'proveedor' ? 'compra_empresa' : 'compra_particular',
          sellerName: form.supplierName.trim(),
          costCompra: purchasePrice,
          acquisitionDate: form.purchaseDate,
          notes: form.notes.trim() || undefined,
          registrationPlate: plate,
        });
        if (editing.vehicleId) {
          await updateVehicle(editing.vehicleId, {
            brand: form.brand.trim(),
            model: form.model.trim(),
            version: form.version.trim() || undefined,
            year: Number(form.year),
            registrationPlate: plate,
            vin: vin || undefined,
            mileage: form.mileage.trim() ? parseLocaleNumber(form.mileage) : undefined,
            color: form.color.trim() || undefined,
            fuelType: (form.fuelType || undefined) as Vehicle['fuelType'],
            transmission: (form.transmission || undefined) as Vehicle['transmission'],
            power: form.power.trim() ? parseLocaleNumber(form.power) : undefined,
            purchasePrice,
            purchaseDate: form.purchaseDate,
            notes: form.notes.trim() || undefined,
          });
        }
        toast.success('Compra actualizada');
        onUpdated?.(editing.id);
        onClose();
        return;
      }

      const duplicates = await checkVehicleDuplicatesRequest(userId, {
        registrationPlate: plate,
        vin: vin || undefined,
      });
      if (duplicates.plate || duplicates.vin) {
        toast.error('Matrícula o VIN ya registrados en otro vehículo');
        setStep('vehiculo');
        return;
      }

      const vehiclePayload = {
        brand: form.brand.trim(),
        model: form.model.trim(),
        version: form.version.trim() || undefined,
        year: Number(form.year),
        registrationPlate: plate,
        vin: vin || undefined,
        mileage: form.mileage.trim() ? parseLocaleNumber(form.mileage) : undefined,
        color: form.color.trim() || undefined,
        fuelType: (form.fuelType || undefined) as Vehicle['fuelType'],
        transmission: (form.transmission || undefined) as Vehicle['transmission'],
        power: form.power.trim() ? parseLocaleNumber(form.power) : undefined,
        purchasePrice,
        purchaseDate: form.purchaseDate,
        notes: form.notes.trim() || undefined,
        status: 'available' as Vehicle['status'],
        origin: (form.supplierType === 'particular' ? 'particular' : 'empresa') as Vehicle['origin'],
      };

      const createdVehicle = await addVehicle(vehiclePayload);
      if (!createdVehicle?.id) throw new Error('No se pudo crear el vehículo');

      const acquisition = await createAcquisitionRequest(userId, {
        vehicleId: createdVehicle.id,
        registrationPlate: plate,
        acquisitionType: form.supplierType === 'proveedor' ? 'compra_empresa' : 'compra_particular',
        sellerType: form.supplierType === 'proveedor' ? 'empresa' : 'particular',
        sellerName: form.supplierName.trim(),
        costCompra: purchasePrice,
        acquisitionDate: form.purchaseDate,
        notes: form.notes.trim() || undefined,
        paymentStatus: 'pendiente',
      });

      toast.success('Compra y vehículo registrados correctamente');
      onCreated?.(acquisition.item.id);
      onClose();
    } catch (error) {
      if (error instanceof VehicleDuplicateError) {
        toast.error('Matrícula o VIN ya registrados en otro vehículo');
        setStep('vehiculo');
        return;
      }
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la compra');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <SettingsWizardShell
      isOpen={open}
      onClose={onClose}
      title={isEdit ? 'Editar compra' : 'Nueva compra'}
      subtitle={`Paso ${stepIndex + 1} de ${STEPS.length} · ${STEPS[stepIndex].title}`}
      icon={<ShoppingCart className="h-5 w-5 text-amber-600" strokeWidth={2} />}
      steps={wizardSteps}
      activeStepId={step}
      onStepChange={(id) => {
        if (id === 'vehiculo') goNext();
        else setStep('compra');
      }}
      size="medium"
      footer={
        <SettingsWizardFooter
          onCancel={onClose}
          showBack={!isLastStep ? false : true}
          onBack={isLastStep ? goBack : undefined}
          onNext={!isLastStep ? goNext : undefined}
          onSave={handleSave}
          isLastStep={isLastStep}
          saving={saving}
          saveLabel={isEdit ? 'Guardar cambios' : 'Guardar'}
          disableNext={saving}
          disableSave={saving}
        />
      }
    >
      {step === 'compra' ? (
        <div className="space-y-4">
          <Field label="Proveedor o Particular" required error={fieldErrors.supplierName}>
            <div className="mb-3 flex rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900">
              {(['particular', 'proveedor'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => set('supplierType', type)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                    form.supplierType === type
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-gray-100'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                  }`}
                >
                  {type === 'particular' ? 'Particular' : 'Proveedor'}
                </button>
              ))}
            </div>
            <input
              className={inputClass}
              value={form.supplierName}
              onChange={(e) => set('supplierName', e.target.value)}
              placeholder={form.supplierType === 'particular' ? 'Nombre del particular' : 'Nombre del proveedor'}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Fecha de compra" required error={fieldErrors.purchaseDate}>
              <input
                type="date"
                className={inputClass}
                value={form.purchaseDate}
                onChange={(e) => set('purchaseDate', e.target.value)}
              />
            </Field>
            <Field label="Precio de compra" required error={fieldErrors.purchasePrice}>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  className={`${inputClass} pr-8`}
                  value={form.purchasePrice}
                  onChange={(e) => set('purchasePrice', e.target.value)}
                  placeholder="18.500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">€</span>
              </div>
            </Field>
          </div>

          <Field label="Observaciones">
            <textarea
              rows={3}
              className={`${inputClass} resize-none`}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="Notas internas sobre la operación de compra…"
            />
          </Field>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Matrícula" required error={fieldErrors.registrationPlate}>
              <input
                className={`${inputClass} font-mono uppercase`}
                value={form.registrationPlate}
                onChange={(e) => set('registrationPlate', e.target.value.toUpperCase())}
                placeholder="1234 ABC"
              />
            </Field>
            <Field label="VIN / Bastidor">
              <input
                className={`${inputClass} font-mono uppercase tracking-wide`}
                value={form.vin}
                maxLength={17}
                onChange={(e) =>
                  set('vin', e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''))
                }
                placeholder="WBAPH5C55BA123456"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Marca" required error={fieldErrors.brand}>
              <input className={inputClass} value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder="BMW" />
            </Field>
            <Field label="Modelo" required error={fieldErrors.model}>
              <input className={inputClass} value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="Serie 3" />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Versión">
              <input className={inputClass} value={form.version} onChange={(e) => set('version', e.target.value)} placeholder="320d" />
            </Field>
            <Field label="Año" required error={fieldErrors.year}>
              <input
                type="number"
                min={1900}
                max={new Date().getFullYear() + 1}
                className={inputClass}
                value={form.year}
                onChange={(e) => set('year', e.target.value)}
              />
            </Field>
            <Field label="Color">
              <input className={inputClass} value={form.color} onChange={(e) => set('color', e.target.value)} placeholder="Negro" />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Kilómetros" error={fieldErrors.mileage}>
              <input
                type="text"
                inputMode="numeric"
                className={inputClass}
                value={form.mileage}
                onChange={(e) => set('mileage', e.target.value)}
                placeholder="85.000"
              />
            </Field>
            <Field label="Combustible">
              <select className={inputClass} value={form.fuelType} onChange={(e) => set('fuelType', e.target.value)}>
                {FUEL_TYPES.map((item) => (
                  <option key={item.value || 'empty'} value={item.value}>{item.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Cambio">
              <select className={inputClass} value={form.transmission} onChange={(e) => set('transmission', e.target.value)}>
                {TRANSMISSION_TYPES.map((item) => (
                  <option key={item.value || 'empty'} value={item.value}>{item.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Potencia (CV)" error={fieldErrors.power}>
            <input
              type="text"
              inputMode="numeric"
              className={inputClass}
              value={form.power}
              onChange={(e) => set('power', e.target.value)}
              placeholder="150"
            />
          </Field>
        </div>
      )}
    </SettingsWizardShell>
  );
}
