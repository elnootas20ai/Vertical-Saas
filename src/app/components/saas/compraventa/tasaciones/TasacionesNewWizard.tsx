import { useCallback, useEffect, useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../../context/AuthContext';
import { useBusiness } from '../../../../context/BusinessContext';
import { parseLocaleNumber } from '../../../../lib/numberFormat';
import { createTradeInRequest, updateTradeInRequest } from '../../../../lib/tradeInApi';
import { tasacionToTradeInPayload } from '../../../../lib/compraventaMappers';
import type { TasacionListItem } from './tasacionesListData';
import {
  SettingsWizardFooter,
  SettingsWizardShell,
  type SettingsWizardStep,
} from '../../settings/SettingsWizardShell';

export type TasacionWizardFormState = {
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  brand: string;
  model: string;
  year: string;
  mileage: string;
  licensePlate: string;
  vin: string;
  color: string;
  fuelType: string;
  transmission: string;
  requestedPrice: string;
  recommendedPrice: string;
  observations: string;
};

const STEPS = [
  { id: 'propietario', title: 'Propietario', hint: 'Datos de contacto' },
  { id: 'vehiculo', title: 'Vehículo', hint: 'Identificación y ficha' },
  { id: 'valor', title: 'Valoración', hint: 'Importes y notas' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

const inputClass =
  'w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-emerald-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';

function emptyForm(): TasacionWizardFormState {
  return {
    ownerName: '',
    ownerPhone: '',
    ownerEmail: '',
    brand: '',
    model: '',
    year: String(new Date().getFullYear()),
    mileage: '',
    licensePlate: '',
    vin: '',
    color: '',
    fuelType: '',
    transmission: '',
    requestedPrice: '',
    recommendedPrice: '',
    observations: '',
  };
}

function formFromTasacion(item: TasacionListItem): TasacionWizardFormState {
  return {
    ownerName: item.ownerName || '',
    ownerPhone: item.ownerPhone || '',
    ownerEmail: item.ownerEmail || '',
    brand: item.make || '',
    model: item.model || '',
    year: item.year ? String(item.year) : String(new Date().getFullYear()),
    mileage: item.mileage != null ? String(item.mileage) : '',
    licensePlate: item.licensePlate || '',
    vin: item.vin || '',
    color: item.color || '',
    fuelType: item.fuel || '',
    transmission: item.transmission || '',
    requestedPrice: item.requestedPrice != null ? String(item.requestedPrice) : '',
    recommendedPrice: item.recommendedPrice != null ? String(item.recommendedPrice) : '',
    observations: item.observations || '',
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (tasacionId: string) => void;
  editing?: TasacionListItem | null;
};

export function TasacionesNewWizard({ open, onClose, onCreated, editing = null }: Props) {
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();
  const userId = user?.user_id || user?.userId || user?._id || '';
  const businessId = currentBusiness?.business_id || null;

  const [step, setStep] = useState<StepId>('propietario');
  const [form, setForm] = useState<TasacionWizardFormState>(() => emptyForm());
  const [saving, setSaving] = useState(false);

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const isLastStep = stepIndex === STEPS.length - 1;

  useEffect(() => {
    if (!open) return;
    setStep('propietario');
    setForm(editing ? formFromTasacion(editing) : emptyForm());
    setSaving(false);
  }, [open, editing]);

  const patch = useCallback((partial: Partial<TasacionWizardFormState>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  }, []);

  const wizardSteps: SettingsWizardStep[] = useMemo(
    () =>
      STEPS.map((item, index) => ({
        id: item.id,
        title: item.title,
        hint: item.hint,
        completed: index < stepIndex,
      })),
    [stepIndex],
  );

  const validateStep = (current: StepId): boolean => {
    if (current === 'propietario') {
      if (!form.ownerName.trim()) {
        toast.error('Indica el nombre del propietario');
        return false;
      }
      return true;
    }
    if (current === 'vehiculo') {
      if (!form.brand.trim() || !form.model.trim()) {
        toast.error('Marca y modelo son obligatorios');
        return false;
      }
      return true;
    }
    if (parseLocaleNumber(form.requestedPrice) <= 0) {
      toast.error('Indica un valor solicitado válido');
      return false;
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    if (stepIndex < STEPS.length - 1) {
      setStep(STEPS[stepIndex + 1].id);
    }
  };

  const goBack = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1].id);
  };

  const handleSave = async () => {
    if (!validateStep('propietario') || !validateStep('vehiculo') || !validateStep('valor')) return;
    if (!userId) {
      toast.error('Sesión no válida');
      return;
    }

    setSaving(true);
    try {
      const draft: Partial<TasacionListItem> = {
        ownerName: form.ownerName.trim(),
        ownerPhone: form.ownerPhone.trim(),
        ownerEmail: form.ownerEmail.trim(),
        make: form.brand.trim(),
        model: form.model.trim(),
        year: Number(form.year) || new Date().getFullYear(),
        mileage: form.mileage ? Number(form.mileage) : undefined,
        licensePlate: form.licensePlate.trim(),
        vin: form.vin.trim(),
        color: form.color.trim(),
        fuel: form.fuelType.trim(),
        transmission: form.transmission.trim(),
        requestedPrice: parseLocaleNumber(form.requestedPrice),
        recommendedPrice: form.recommendedPrice
          ? parseLocaleNumber(form.recommendedPrice)
          : undefined,
        observations: form.observations.trim(),
        status: 'pendiente',
        appraisalDate: new Date().toISOString().slice(0, 10),
      };

      const payload = tasacionToTradeInPayload(draft);

      if (editing?.id) {
        const response = await updateTradeInRequest(userId, editing.id, {
          ...payload,
          color: payload.color || '',
        });
        const id = response.tradeIn?.id || editing.id;
        toast.success('Tasación actualizada');
        onCreated(id);
        onClose();
        return;
      }

      const response = await createTradeInRequest(
        userId,
        {
          ...payload,
          condition: 'bueno',
          color: payload.color || '',
        },
        businessId,
      );

      const id = response.tradeIn?.id || response.id || '';
      if (!id) throw new Error('No se recibió el identificador de la tasación');

      toast.success('Tasación registrada');
      onCreated(id);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la tasación');
    } finally {
      setSaving(false);
    }
  };

  const isEditing = Boolean(editing?.id);

  return (
    <SettingsWizardShell
      isOpen={open}
      onClose={onClose}
      title={isEditing ? 'Editar tasación' : 'Nueva tasación'}
      subtitle={`Paso ${stepIndex + 1} de ${STEPS.length} · ${STEPS[stepIndex].title}`}
      icon={<Scale className="h-5 w-5 text-emerald-600" strokeWidth={2} />}
      steps={wizardSteps}
      activeStepId={step}
      onStepChange={(id) => setStep(id as StepId)}
      footer={
        <SettingsWizardFooter
          onCancel={onClose}
          showBack={stepIndex > 0}
          onBack={goBack}
          onNext={!isLastStep ? goNext : undefined}
          onSave={handleSave}
          isLastStep={isLastStep}
          saving={saving}
          saveLabel={isEditing ? 'Guardar cambios' : 'Registrar tasación'}
          disableNext={saving}
          disableSave={saving}
        />
      }
    >
      {step === 'propietario' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2 block space-y-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Nombre del propietario *</span>
            <input className={inputClass} value={form.ownerName} onChange={(e) => patch({ ownerName: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Teléfono</span>
            <input className={inputClass} value={form.ownerPhone} onChange={(e) => patch({ ownerPhone: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Email</span>
            <input type="email" className={inputClass} value={form.ownerEmail} onChange={(e) => patch({ ownerEmail: e.target.value })} />
          </label>
        </div>
      ) : null}

      {step === 'vehiculo' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Marca *</span>
            <input className={inputClass} value={form.brand} onChange={(e) => patch({ brand: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Modelo *</span>
            <input className={inputClass} value={form.model} onChange={(e) => patch({ model: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Año</span>
            <input className={inputClass} value={form.year} onChange={(e) => patch({ year: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Kilometraje</span>
            <input className={inputClass} value={form.mileage} onChange={(e) => patch({ mileage: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Matrícula</span>
            <input className={inputClass} value={form.licensePlate} onChange={(e) => patch({ licensePlate: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Bastidor (VIN)</span>
            <input className={inputClass} value={form.vin} onChange={(e) => patch({ vin: e.target.value })} />
          </label>
        </div>
      ) : null}

      {step === 'valor' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Valor solicitado (€) *</span>
            <input className={inputClass} value={form.requestedPrice} onChange={(e) => patch({ requestedPrice: e.target.value })} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Valor recomendado (€)</span>
            <input className={inputClass} value={form.recommendedPrice} onChange={(e) => patch({ recommendedPrice: e.target.value })} />
          </label>
          <label className="sm:col-span-2 block space-y-1.5">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Observaciones</span>
            <textarea
              rows={3}
              className={inputClass}
              value={form.observations}
              onChange={(e) => patch({ observations: e.target.value })}
            />
          </label>
        </div>
      ) : null}
    </SettingsWizardShell>
  );
}
