import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, LoaderCircle, X } from 'lucide-react';
import { useApp, type Vehicle } from '../../../context/AppContext';
import { useModalClose } from '../../../hooks/useModalClose';
import { parseLocaleNumber } from '../../../lib/numberFormat';
import { toast } from 'sonner';
import {
  checkVehicleDuplicatesRequest,
  VehicleDuplicateError,
  type DuplicateInfo,
} from '../../../lib/vehicleApi';
import { pickVehicleChanges } from './vehicleFormUtils';

type VehicleCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: (vehicleId: string) => void;
  onSaved?: () => void;
  editVehicle?: Vehicle | null;
};

type FormState = {
  brand: string;
  model: string;
  version: string;
  year: string;
  registrationPlate: string;
  vin: string;
  mileage: string;
  color: string;
  fuelType: string;
  transmission: string;
  power: string;
  purchasePrice: string;
  salePrice: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  brand: '',
  model: '',
  version: '',
  year: String(new Date().getFullYear()),
  registrationPlate: '',
  vin: '',
  mileage: '',
  color: '',
  fuelType: '',
  transmission: '',
  power: '',
  purchasePrice: '',
  salePrice: '',
  notes: '',
};

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

function DuplicateBanner({
  title,
  duplicate,
  tone,
}: {
  title: string;
  duplicate: DuplicateInfo;
  tone: 'amber' | 'red';
}) {
  const toneClasses =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'
      : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40';
  const textClasses =
    tone === 'amber'
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-red-700 dark:text-red-300';

  return (
    <div className={`mt-2 flex items-start gap-2 rounded-xl border p-3 ${toneClasses}`}>
      <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${tone === 'amber' ? 'text-amber-500' : 'text-red-500'}`} />
      <div className="text-sm">
        <p className={`font-medium ${textClasses}`}>{title}</p>
        <p className={`text-xs ${tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
          {duplicate.brand} {duplicate.model}
          {duplicate.registrationPlate ? ` · ${duplicate.registrationPlate}` : ''}
        </p>
      </div>
    </div>
  );
}

export function VehicleCreateModal({ open, onClose, onCreated, onSaved, editVehicle }: VehicleCreateModalProps) {
  const { addVehicle, updateVehicle, authUser } = useApp();
  const isEdit = Boolean(editVehicle);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<{ plate: DuplicateInfo | null; vin: DuplicateInfo | null }>({
    plate: null,
    vin: null,
  });

  useModalClose(open, onClose);

  useEffect(() => {
    if (!open) return;
    if (editVehicle) {
      setForm({
        brand: editVehicle.brand,
        model: editVehicle.model,
        version: editVehicle.version || '',
        year: String(editVehicle.year),
        registrationPlate: editVehicle.registrationPlate,
        vin: editVehicle.vin || '',
        mileage: editVehicle.mileage != null ? String(editVehicle.mileage) : '',
        color: editVehicle.color || '',
        fuelType: editVehicle.fuelType || '',
        transmission: editVehicle.transmission || '',
        power: editVehicle.power != null ? String(editVehicle.power) : '',
        purchasePrice: String(editVehicle.purchasePrice ?? ''),
        salePrice: editVehicle.salePrice != null ? String(editVehicle.salePrice) : '',
        notes: editVehicle.notes || '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setFieldErrors({});
    setSubmitError('');
    setSaving(false);
    setDuplicates({ plate: null, vin: null });
  }, [open, editVehicle]);

  const set = useCallback((key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
    setSubmitError('');
    if (key === 'registrationPlate' || key === 'vin') {
      setDuplicates((prev) => ({
        ...prev,
        [key === 'registrationPlate' ? 'plate' : 'vin']: null,
      }));
    }
  }, []);

  const checkDuplicates = useCallback(async (plate: string, vin: string) => {
    if (!authUser?.user_id) return { plate: null, vin: null };
    if (!plate.trim() && !vin.trim()) return { plate: null, vin: null };

    try {
      const result = await checkVehicleDuplicatesRequest(authUser.user_id, {
        registrationPlate: plate.trim() || undefined,
        vin: vin.trim() || undefined,
        excludeVehicleId: editVehicle?.id,
      });
      return { plate: result.plate, vin: result.vin };
    } catch {
      return { plate: null, vin: null };
    }
  }, [authUser?.user_id, editVehicle?.id]);

  useEffect(() => {
    if (!open || !authUser?.user_id) return;
    const plate = form.registrationPlate.trim();
    const vin = form.vin.trim();
    if (!plate && !vin) {
      setDuplicates({ plate: null, vin: null });
      return;
    }

    const timer = window.setTimeout(() => {
      checkDuplicates(plate, vin).then(setDuplicates);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [open, authUser?.user_id, form.registrationPlate, form.vin, checkDuplicates]);

  const validate = (): boolean => {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.brand.trim()) errors.brand = 'La marca es obligatoria';
    if (!form.model.trim()) errors.model = 'El modelo es obligatorio';
    if (!form.year.trim() || Number(form.year) < 1900) errors.year = 'Introduce un año válido';
    if (!form.registrationPlate.trim()) errors.registrationPlate = 'La matrícula es obligatoria';
    const purchase = parseLocaleNumber(form.purchasePrice);
    if (!form.purchasePrice.trim() || !Number.isFinite(purchase) || purchase <= 0) {
      errors.purchasePrice = 'El precio de compra es obligatorio';
    }
    if (form.salePrice.trim()) {
      const sale = parseLocaleNumber(form.salePrice);
      if (!Number.isFinite(sale) || sale < 0) errors.salePrice = 'Precio de venta no válido';
    }
    if (form.mileage.trim()) {
      const km = parseLocaleNumber(form.mileage);
      if (!Number.isFinite(km) || km < 0) errors.mileage = 'Kilómetros no válidos';
    }
    if (form.power.trim()) {
      const power = parseLocaleNumber(form.power);
      if (!Number.isFinite(power) || power < 0) errors.power = 'Potencia no válida';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error('Completa los campos obligatorios marcados en rojo');
    }
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError('');

    if (!validate()) return;

    const plateChanged = !isEdit || form.registrationPlate.trim().toUpperCase() !== editVehicle?.registrationPlate?.toUpperCase();
    const vinChanged = !isEdit || form.vin.trim().toUpperCase() !== (editVehicle?.vin || '').toUpperCase();

    if (plateChanged || vinChanged) {
      const latestDuplicates = await checkDuplicates(form.registrationPlate, form.vin);
      setDuplicates(latestDuplicates);
      if (latestDuplicates.plate || latestDuplicates.vin) {
        setSubmitError('No se puede guardar: matrícula o VIN duplicados.');
        toast.error('Matrícula o VIN ya registrados en otro vehículo');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        brand: form.brand.trim(),
        model: form.model.trim(),
        version: form.version.trim() || undefined,
        year: Number(form.year),
        registrationPlate: form.registrationPlate.trim().toUpperCase(),
        vin: form.vin.trim().toUpperCase() || undefined,
        mileage: form.mileage.trim() ? parseLocaleNumber(form.mileage) : undefined,
        color: form.color.trim(),
        fuelType: (form.fuelType || undefined) as Vehicle['fuelType'],
        transmission: (form.transmission || undefined) as Vehicle['transmission'],
        power: form.power.trim() ? parseLocaleNumber(form.power) : undefined,
        purchasePrice: parseLocaleNumber(form.purchasePrice),
        salePrice: form.salePrice.trim() ? parseLocaleNumber(form.salePrice) : undefined,
        notes: form.notes.trim() || undefined,
      };

      if (isEdit && editVehicle) {
        const changes = pickVehicleChanges(editVehicle, payload);
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        await updateVehicle(editVehicle.id, changes);
        toast.success('Vehículo actualizado correctamente');
        onSaved?.();
        onClose();
        return;
      }

      const created = await addVehicle({
        ...payload,
        status: 'listo',
        purchaseDate: new Date().toISOString().slice(0, 10),
      });

      if (!created?.id) {
        throw new Error('No se recibió el vehículo creado');
      }

      toast.success('Vehículo creado correctamente');
      onCreated?.(created.id);
      onClose();
    } catch (error) {
      if (error instanceof VehicleDuplicateError) {
        setDuplicates({
          plate: error.duplicates.plate ?? null,
          vin: error.duplicates.vin ?? null,
        });
        setSubmitError('No se puede guardar: matrícula o VIN duplicados.');
        toast.error('Matrícula o VIN ya registrados en otro vehículo');
        return;
      }
      setSubmitError(error instanceof Error ? error.message : 'Error al crear el vehículo');
      toast.error(error instanceof Error ? error.message : 'Error al guardar el vehículo');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {isEdit ? 'Editar vehículo' : 'Nuevo vehículo'}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {isEdit ? 'Modifica los datos del vehículo' : 'Alta manual en inventario'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Marca" required error={fieldErrors.brand}>
                <input
                  className={inputClass}
                  value={form.brand}
                  onChange={(e) => set('brand', e.target.value)}
                  placeholder="BMW"
                />
              </Field>
              <Field label="Modelo" required error={fieldErrors.model}>
                <input
                  className={inputClass}
                  value={form.model}
                  onChange={(e) => set('model', e.target.value)}
                  placeholder="Serie 3"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Versión">
                <input
                  className={inputClass}
                  value={form.version}
                  onChange={(e) => set('version', e.target.value)}
                  placeholder="320d M Sport"
                />
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
                <input
                  className={inputClass}
                  value={form.color}
                  onChange={(e) => set('color', e.target.value)}
                  placeholder="Negro"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Field label="Matrícula" required error={fieldErrors.registrationPlate}>
                  <input
                    className={`${inputClass} font-mono uppercase`}
                    value={form.registrationPlate}
                    onChange={(e) => set('registrationPlate', e.target.value.toUpperCase())}
                    placeholder="1234 ABC"
                  />
                </Field>
                {duplicates.plate ? (
                  <DuplicateBanner
                    title="Matrícula ya registrada"
                    duplicate={duplicates.plate}
                    tone="amber"
                  />
                ) : null}
              </div>
              <div>
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
                {duplicates.vin ? (
                  <DuplicateBanner
                    title="VIN ya registrado"
                    duplicate={duplicates.vin}
                    tone="red"
                  />
                ) : null}
              </div>
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
                <select
                  className={inputClass}
                  value={form.fuelType}
                  onChange={(e) => set('fuelType', e.target.value)}
                >
                  {FUEL_TYPES.map((item) => (
                    <option key={item.value || 'empty'} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cambio">
                <select
                  className={inputClass}
                  value={form.transmission}
                  onChange={(e) => set('transmission', e.target.value)}
                >
                  {TRANSMISSION_TYPES.map((item) => (
                    <option key={item.value || 'empty'} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
              <Field label="Precio compra" required error={fieldErrors.purchasePrice}>
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
              <Field label="Precio venta" error={fieldErrors.salePrice}>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    className={`${inputClass} pr-8`}
                    value={form.salePrice}
                    onChange={(e) => set('salePrice', e.target.value)}
                    placeholder="22.900"
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
                placeholder="Notas internas, estado general, extras..."
              />
            </Field>

            {submitError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                {submitError}
              </div>
            ) : null}
          </div>
          </div>

          <div className="flex shrink-0 gap-3 border-t border-gray-200 bg-white/95 px-6 py-4 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
            >
              {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
