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
import { useOnboarding, ONBOARDING_ROUTES } from '../../../context/OnboardingContext';
import { getNifOrCifError, getNifOrCifErrorWhileTyping } from '../../../lib/dniCifValidator';

const STEP_INDEX = 1;

export function Company() {
  const navigate = useNavigate();
  const { data, updateData, advanceStep } = useOnboarding();
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
    if (data.completedStep < STEP_INDEX - 1) {
      navigate(ONBOARDING_ROUTES[data.completedStep + 1], { replace: true });
    }
  }, [data.completedStep, navigate]);

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
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 pb-2 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 content-start [&_.acceso-field]:!mb-0"
      >
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

            <div className="md:col-span-2">
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

            <div className="md:col-span-2">
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
            </div>

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

            {data.businessType === 'carDealership' && (
              <div className="md:col-span-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <ACCESO__Checkbox
                  label="Soy socio ANCOVE"
                  checked={formData.isAncovePartner}
                  onChange={(e) => setFormData({ ...formData, isAncovePartner: e.target.checked })}
                />

                {formData.isAncovePartner && (
                  <div className="mt-4 ml-8 space-y-3">
                    <ACCESO__Input
                      label="Número de socio ANCOVE"
                      type="text"
                      placeholder="Número de socio"
                      icon={<Award className="w-5 h-5" />}
                      value={formData.ancoveMemberNumber}
                      onChange={(e) => setFormData({ ...formData, ancoveMemberNumber: e.target.value })}
                    />
                    <p className="text-xs text-gray-600 dark:text-gray-400 bg-blue-50 border border-blue-200 rounded-lg p-2">
                      Activaremos ventajas ANCOVE cuando esté validado.
                    </p>
                  </div>
                )}
              </div>
            )}
          </form>
    </OnboardingStepShell>
  );
}
