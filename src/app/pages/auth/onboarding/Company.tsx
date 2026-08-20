import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Building2, MapPin, Mail, Phone, FileText, Award } from 'lucide-react';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../../components/design-system/ACCESO__Input';
import { ACCESO__AddressAutocomplete } from '../../../components/design-system/ACCESO__AddressAutocomplete';
import { ACCESO__Checkbox } from '../../../components/design-system/ACCESO__Checkbox';
import { OnboardingCompanyVerification } from '../../../components/auth/onboarding/OnboardingCompanyVerification';
import {
  OnboardingStepHeading,
  OnboardingStepShell,
} from '../../../components/auth/onboarding/OnboardingStepShell';
import type { OnboardingVerificationDocument } from '../../../lib/onboardingCompanyVerification';
import { useOnboarding } from '../../../context/OnboardingContext';
import { useOnboardingStepGate } from '../../../hooks/useOnboardingStepGate';
import { getNifOrCifError, getNifOrCifErrorWhileTyping } from '../../../lib/dniCifValidator';

const STEP_INDEX = 1;

export function Company() {
  const navigate = useNavigate();
  const { data, updateData, advanceStep } = useOnboarding();
  useOnboardingStepGate(STEP_INDEX);
  const [formData, setFormData] = useState(data.companyProfile);
  const [taxIdError, setTaxIdError] = useState<string | null>(null);

  useEffect(() => {
    setFormData({
      ...data.companyProfile,
      verificationDocuments: data.companyProfile.verificationDocuments ?? [],
      verificationNote: data.companyProfile.verificationNote ?? '',
    });
  }, [data.companyProfile]);

  useEffect(() => {
    if (data.businessType === 'carDealership') return;
    setFormData((prev) => {
      if (!prev.isAncovePartner && !prev.ancoveMemberNumber) return prev;
      return { ...prev, isAncovePartner: false, ancoveMemberNumber: '' };
    });
  }, [data.businessType]);

  const handleTaxIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const upper = e.target.value.toUpperCase();
    setFormData({ ...formData, taxId: upper });
    setTaxIdError(upper ? getNifOrCifErrorWhileTyping(upper) : null);
  };

  const handleTaxIdBlur = () => {
    const v = formData.taxId.trim().toUpperCase();
    if (!v) {
      setTaxIdError(null);
      return;
    }
    if (v.length < 9) {
      setTaxIdError(null);
      return;
    }
    setTaxIdError(getNifOrCifError(v));
  };

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    // Validación blanda: el aviso de dígito de control se muestra de forma
    // visual pero no bloquea el avance del onboarding. El dato puede
    // corregirse después desde Ajustes; bloquear aquí frustra pruebas con
    // valores ficticios y typos sin aportar valor (el backend revalida).
    if (formData.taxId.trim().length >= 9) {
      setTaxIdError(getNifOrCifError(formData.taxId.trim().toUpperCase()));
    } else {
      setTaxIdError(null);
    }
    const payload =
      data.businessType === 'carDealership'
        ? formData
        : { ...formData, isAncovePartner: false, ancoveMemberNumber: '' };
    updateData('companyProfile', payload);
    advanceStep(STEP_INDEX);
    navigate('/auth/onboarding/structure');
  };

  const handleBack = () => {
    navigate('/auth/onboarding/business-type');
  };

  return (
    <OnboardingStepShell
      stepIndex={STEP_INDEX}
      footer={
        <div className="flex justify-between gap-3">
          <ACCESO__Button type="button" onClick={handleBack} variant="outline">
            ← Atrás
          </ACCESO__Button>
          <ACCESO__Button type="submit" form="company-form" variant="primary">
            Continuar →
          </ACCESO__Button>
        </div>
      }
    >
      <OnboardingStepHeading
        stepLabel="Paso 2 · Empresa"
        title="Datos de tu empresa"
        subtitle="Esta información nos ayudará a configurar tu espacio de trabajo"
      />

      <form
        id="company-form"
        onSubmit={handleContinue}
        autoComplete="off"
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 pb-6">
          <div className="grid grid-cols-1 gap-y-3 md:grid-cols-2 md:gap-x-4 md:gap-y-3.5">
            <div className="md:col-span-2">
              <ACCESO__Input
                label="Nombre comercial *"
                type="text"
                placeholder="Nombre comercial de tu negocio"
                icon={<Building2 className="w-5 h-5" />}
                value={formData.tradeName}
                onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
                autoComplete="off"
                required
              />
            </div>

            <div className="md:col-span-2">
              <ACCESO__Input
                label="Razón social"
                type="text"
                placeholder="Razón social (opcional)"
                icon={<FileText className="w-5 h-5" />}
                value={formData.legalName}
                onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
                autoComplete="off"
              />
            </div>

            <ACCESO__Input
              label="CIF/NIF *"
              type="text"
              placeholder="Ej: B12345674 o 12345678Z"
              value={formData.taxId}
              onChange={handleTaxIdChange}
              onBlur={handleTaxIdBlur}
              maxLength={14}
              inputMode="text"
              error={taxIdError ?? undefined}
              helperText={taxIdError ? undefined : 'DNI, NIE o CIF (9 caracteres)'}
              autoComplete="off"
              required
            />
            <ACCESO__Input
              label="Provincia *"
              type="text"
              placeholder="Provincia"
              icon={<MapPin className="w-5 h-5" />}
              value={formData.province}
              onChange={(e) => setFormData({ ...formData, province: e.target.value })}
              autoComplete="off"
              required
            />

            <div className="md:col-span-2 pt-1">
              <OnboardingCompanyVerification
                documents={formData.verificationDocuments ?? []}
                note={formData.verificationNote ?? ''}
                onDocumentsChange={(verificationDocuments: OnboardingVerificationDocument[]) =>
                  setFormData((prev) => ({ ...prev, verificationDocuments }))
                }
                onNoteChange={(verificationNote) =>
                  setFormData((prev) => ({ ...prev, verificationNote }))
                }
              />
            </div>

            <div className="md:col-span-2 space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Ubicación y contacto
                <span className="ml-1.5 font-normal normal-case tracking-normal text-gray-400 dark:text-gray-500">
                  (opcional)
                </span>
              </p>

              <ACCESO__AddressAutocomplete
                label="Dirección"
                placeholder="Empieza a escribir una dirección…"
                value={formData.address}
                onChange={(val) => setFormData((prev) => ({ ...prev, address: val }))}
                onPlaceSelect={(place) =>
                  setFormData((prev) => ({
                    ...prev,
                    address: place.address,
                    ...(place.province ? { province: place.province } : {}),
                    ...(place.city ? { city: place.city } : {}),
                  }))
                }
              />

              <div className="grid grid-cols-1 gap-y-3 md:grid-cols-2 md:gap-x-4 md:gap-y-0 md:items-start">
                <ACCESO__Input
                  label="Email empresa"
                  type="email"
                  placeholder="Email de contacto (opcional)"
                  icon={<Mail className="w-5 h-5" />}
                  value={formData.companyEmail}
                  onChange={(e) => setFormData({ ...formData, companyEmail: e.target.value })}
                  autoComplete="off"
                />
                <ACCESO__Input
                  label="Teléfono empresa"
                  type="tel"
                  placeholder="Teléfono de contacto (opcional)"
                  icon={<Phone className="w-5 h-5" />}
                  value={formData.companyPhone}
                  onChange={(e) => setFormData({ ...formData, companyPhone: e.target.value })}
                  autoComplete="off"
                />
              </div>
            </div>

            {data.businessType === 'carDealership' && (
              <div className="md:col-span-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <ACCESO__Checkbox
                  label="Soy socio ANCOVE"
                  checked={formData.isAncovePartner}
                  onChange={(e) => setFormData({ ...formData, isAncovePartner: e.target.checked })}
                />

                {formData.isAncovePartner && (
                  <div className="ml-8 mt-4 space-y-3">
                    <ACCESO__Input
                      label="Número de socio ANCOVE"
                      type="text"
                      placeholder="Número de socio"
                      icon={<Award className="w-5 h-5" />}
                      value={formData.ancoveMemberNumber}
                      onChange={(e) => setFormData({ ...formData, ancoveMemberNumber: e.target.value })}
                    />
                    <p className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-xs text-gray-600 dark:border-blue-900 dark:bg-blue-950/40 dark:text-gray-400">
                      Activaremos ventajas ANCOVE cuando esté validado.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </form>
    </OnboardingStepShell>
  );
}
