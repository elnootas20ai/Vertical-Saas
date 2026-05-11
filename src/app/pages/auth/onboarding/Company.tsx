import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Building2, MapPin, Mail, Phone, FileText, Award } from 'lucide-react';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../../components/design-system/ACCESO__Input';
import { ACCESO__AddressAutocomplete } from '../../../components/design-system/ACCESO__AddressAutocomplete';
import { ACCESO__Checkbox } from '../../../components/design-system/ACCESO__Checkbox';
import { ACCESO__Stepper } from '../../../components/design-system/ACCESO__Stepper';
import { useOnboarding, ONBOARDING_STEPS, ONBOARDING_ROUTES } from '../../../context/OnboardingContext';
import { getNifOrCifError } from '../../../lib/dniCifValidator';

const STEP_INDEX = 1;

export function Company() {
  const navigate = useNavigate();
  const { data, updateData, advanceStep } = useOnboarding();
  const [formData, setFormData] = useState(data.companyProfile);
  const [taxIdError, setTaxIdError] = useState<string | null>(null);

  useEffect(() => {
    if (data.completedStep < STEP_INDEX - 1) {
      navigate(ONBOARDING_ROUTES[data.completedStep + 1], { replace: true });
    }
  }, [data.completedStep, navigate]);

  const handleTaxIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const upper = e.target.value.toUpperCase();
    setFormData({ ...formData, taxId: upper });
    setTaxIdError(upper ? getNifOrCifError(upper) : null);
  };

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    // Validación blanda: el aviso de dígito de control se muestra de forma
    // visual pero no bloquea el avance del onboarding. El dato puede
    // corregirse después desde Ajustes; bloquear aquí frustra pruebas con
    // valores ficticios y typos sin aportar valor (el backend revalida).
    if (formData.taxId) {
      setTaxIdError(getNifOrCifError(formData.taxId));
    }
    const payload = data.businessType === 'delivery'
      ? { ...formData, isAncovePartner: false, ancoveMemberNumber: '' }
      : formData;
    updateData('companyProfile', payload);
    advanceStep(STEP_INDEX);
    navigate('/auth/onboarding/structure');
  };

  const handleBack = () => {
    navigate('/auth/onboarding/business-type');
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-800 flex flex-col overflow-hidden">
      {/* Stepper sticky arriba */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 pt-6 pb-2 shrink-0">
        <div className="w-full max-w-3xl mx-auto">
          <ACCESO__Stepper
            steps={[...ONBOARDING_STEPS]}
            currentStep={STEP_INDEX}
            onStepClick={(i) => {
              if (i !== STEP_INDEX) navigate(ONBOARDING_ROUTES[i]);
            }}
          />
        </div>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="w-full max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              Datos de tu empresa
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Esta información nos ayudará a configurar tu espacio de trabajo
            </p>
          </div>

          <form id="company-form" onSubmit={handleContinue} autoComplete="off" className="space-y-5">
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

            <ACCESO__Input
              label="Razón social"
              type="text"
              placeholder="Razón social (opcional)"
              icon={<FileText className="w-5 h-5" />}
              value={formData.legalName}
              onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
              autoComplete="off"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ACCESO__Input
                label="CIF/NIF *"
                type="text"
                placeholder="Ej: B12345674 o 12345678Z"
                value={formData.taxId}
                onChange={handleTaxIdChange}
                error={taxIdError ?? undefined}
                helperText={taxIdError ? undefined : 'Si no coincide el dígito de control podrás corregirlo más tarde en Ajustes.'}
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
            </div>

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
                }))
              }
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            {data.businessType !== 'delivery' && (
              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
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
                    <p className="text-sm text-gray-600 dark:text-gray-400 bg-blue-50 border border-blue-200 rounded-lg p-3">
                      ✨ Activaremos configuración y ventajas ANCOVE cuando esté validado.
                    </p>
                  </div>
                )}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Botones sticky abajo */}
      <div className="sticky bottom-0 z-20 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 shrink-0">
        <div className="w-full max-w-3xl mx-auto flex justify-between">
          <ACCESO__Button
            type="button"
            onClick={handleBack}
            variant="outline"
          >
            ← Atrás
          </ACCESO__Button>
          <ACCESO__Button
            type="submit"
            form="company-form"
            variant="primary"
          >
            Continuar →
          </ACCESO__Button>
        </div>
      </div>
    </div>
  );
}
