import { useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  Heart,
  Loader2,
  Building2,
  AlertCircle,
  CheckCircle2,
  Wallet,
  User,
  Phone,
  MapPin,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import {
  buildDefaultPersonalData,
  hasMinimumWorkerIdentity,
  markWorkerPayrollBypass,
  mergePersonalData,
  skipWorkerProfileGates,
  WORKER_DEFAULT_LANDING_PATH,
} from '../../../lib/workerProfileCompletion';
import { normalizeBirthDateIso } from '../../../lib/birthDateIso';
import { BirthDateEsField, type BirthDateEsFieldHandle } from '../../../components/saas/BirthDateEsField';
import {
  formatIbanInput,
  IBAN_DISPLAY_MAX_LENGTH,
  IBAN_INPUT_CLASS,
  isValidEsIban,
  normalizeBankName,
  normalizeEmergencyContact,
  normalizeEmergencyPhone,
  normalizeIbanInput,
} from '../../../lib/employmentBankUtils';
import { VertialLogo } from '../../../components/VertialLogo';
import { toast } from 'sonner';

type PayrollFieldKey =
  | 'nationality'
  | 'socialSecurityNumber'
  | 'bankAccount'
  | 'bankName'
  | 'emergencyContact'
  | 'emergencyPhone';

type IdentityFieldKey = 'dni' | 'birthDate' | 'phone' | 'address' | 'city';

type FieldKey = PayrollFieldKey | IdentityFieldKey;

type FieldErrors = Partial<Record<FieldKey, string>>;

function RequiredMark() {
  return <span className="text-red-500" aria-hidden="true"> *</span>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-red-500">
      <AlertCircle className="h-3 w-3 shrink-0" />
      {message}
    </p>
  );
}

function FormField({
  label,
  htmlFor,
  required,
  error,
  children,
  icon,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300"
      >
        {icon}
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

function validatePayrollForm(form: {
  nationality: string;
  socialSecurityNumber: string;
  bankAccount: string;
  bankName: string;
  emergencyContact: string;
  emergencyPhone: string;
}): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.nationality.trim()) {
    errors.nationality = 'La nacionalidad es obligatoria';
  }
  if (!form.socialSecurityNumber.trim()) {
    errors.socialSecurityNumber = 'El número de la Seguridad Social es obligatorio';
  }
  if (!form.bankAccount.trim()) {
    errors.bankAccount = 'El IBAN es obligatorio para la nómina';
  } else if (!isValidEsIban(form.bankAccount)) {
    errors.bankAccount = 'IBAN incompleto o incorrecto (ES + 22 dígitos)';
  }
  if (!form.bankName.trim()) {
    errors.bankName = 'Indica el nombre del banco';
  }
  if (!form.emergencyContact.trim()) {
    errors.emergencyContact = 'Indica un contacto de emergencia';
  }
  if (!form.emergencyPhone.trim()) {
    errors.emergencyPhone = 'Indica un teléfono de emergencia';
  }

  return errors;
}

function validateIdentityFields(
  form: { dni: string; phone: string; address: string; city: string },
  birthDateIso: string,
  birthDisplay: string,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.dni.trim()) errors.dni = 'El DNI / NIE es obligatorio';
  if (!birthDateIso) {
    errors.birthDate = birthDisplay.trim()
      ? 'Fecha incompleta: escribe día, mes y año (4 dígitos)'
      : 'La fecha de nacimiento es obligatoria';
  }
  if (!form.phone.trim()) errors.phone = 'El teléfono es obligatorio';
  if (!form.address.trim()) errors.address = 'La dirección es obligatoria';
  if (!form.city.trim()) errors.city = 'La ciudad es obligatoria';
  return errors;
}

export function WorkerPayrollSetup() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const needsIdentity = !hasMinimumWorkerIdentity(user);
  const birthDateRef = useRef<BirthDateEsFieldHandle>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({
    dni: user?.personalData?.dni || '',
    birthDate: normalizeBirthDateIso(user?.personalData?.birthDate || ''),
    phone: user?.phone || '',
    address: user?.personalData?.address || '',
    city: user?.personalData?.city || '',
    nationality: user?.personalData?.nationality || 'España',
    postalCode: user?.personalData?.postalCode || '',
    socialSecurityNumber: user?.personalData?.socialSecurityNumber || '',
    bankAccount: formatIbanInput(user?.employment?.bankAccount || ''),
    bankName: user?.employment?.bankName || '',
    emergencyContact: user?.employment?.emergencyContact || '',
    emergencyPhone: user?.employment?.emergencyPhone || '',
  });

  const inputClass = 'w-full min-h-[44px] rounded-xl border-2 border-gray-200 bg-white px-3.5 py-2.5 text-base outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';
  const inputErrorClass = `${inputClass} border-red-400 focus:border-red-500 dark:border-red-500`;
  const inputClassFor = (field: FieldKey) => (fieldErrors[field] ? inputErrorClass : inputClass);

  const clearFieldError = (field: FieldKey) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setSaveError(null);
  };

  const setField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key in fieldErrors) {
      clearFieldError(key as FieldKey);
    }
  };

  const showValidationErrors = (errors: FieldErrors, message: string) => {
    setFieldErrors(errors);
    setSaveError(message);
    toast.error(message);
    requestAnimationFrame(() => {
      errorBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const userId = String(user?.user_id || user?.id || '').trim();
    if (!userId) {
      setSaveError('No hay sesión activa. Vuelve a iniciar sesión.');
      toast.error('No hay sesión activa. Vuelve a iniciar sesión.');
      return;
    }

    const birthDateIso = birthDateRef.current?.commit()
      || normalizeBirthDateIso(form.birthDate);
    const birthDisplay = birthDateRef.current?.getDisplay() || '';

    const identityErrors = needsIdentity
      ? validateIdentityFields(form, birthDateIso, birthDisplay)
      : {};
    const payrollErrors = validatePayrollForm(form);
    const errors = { ...identityErrors, ...payrollErrors };
    if (Object.keys(errors).length > 0) {
      showValidationErrors(
        errors,
        needsIdentity
          ? 'Completa tus datos de identidad y nómina marcados con *.'
          : 'Completa todos los campos obligatorios de nómina.',
      );
      return;
    }

    setFieldErrors({});
    setSaveError(null);
    setIsSaving(true);

    try {
      const payrollPersonal = buildDefaultPersonalData({
        ...(needsIdentity
          ? {
              dni: form.dni.trim(),
              birthDate: birthDateIso,
              address: form.address.trim(),
              city: form.city.trim(),
            }
          : {}),
        nationality: form.nationality.trim(),
        postalCode: form.postalCode.trim(),
        socialSecurityNumber: form.socialSecurityNumber.trim(),
      });

      const result = await updateUser(userId, {
        ...(needsIdentity ? { phone: form.phone.trim() } : {}),
        personalData: mergePersonalData(user?.personalData, payrollPersonal),
        employment: {
          bankAccount: normalizeIbanInput(form.bankAccount),
          bankName: normalizeBankName(form.bankName),
          emergencyContact: normalizeEmergencyContact(form.emergencyContact),
          emergencyPhone: normalizeEmergencyPhone(form.emergencyPhone),
        },
      });

      if (!result.success || !result.user) {
        const message = result.error || 'No se pudo guardar tus datos de nómina.';
        setSaveError(message);
        toast.error(message);
        return;
      }

      toast.success('Datos de nómina guardados');
      markWorkerPayrollBypass(userId);

      navigate(WORKER_DEFAULT_LANDING_PATH, { replace: true, state: { payrollCompleted: true } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error inesperado al guardar';
      setSaveError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 dark:bg-gray-950">
      <div className="mx-auto max-w-xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <VertialLogo className="mb-4 h-8" />
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
            <Wallet className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            Paso 2 de 2
          </p>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {needsIdentity ? 'Alta en la empresa' : 'Datos de nómina'}
          </h1>
          {user?.fullName ? (
            <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200">{user.fullName}</p>
          ) : null}
          <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
            Ya formas parte de una empresa. Completa esta ficha para el alta laboral y la nómina.
            Los campos con <span className="text-red-500">*</span> son obligatorios.
          </p>
          {user?.companyName ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <Building2 className="h-3.5 w-3.5" />
              {user.companyName}
            </p>
          ) : null}
        </div>

        <form
          noValidate
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-6 rounded-3xl border-2 border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          {saveError ? (
            <div
              ref={errorBannerRef}
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">No se pudo continuar</p>
                <p className="mt-0.5 text-xs opacity-90">{saveError}</p>
              </div>
            </div>
          ) : null}

          {needsIdentity ? (
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Identidad
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <FormField label="DNI / NIE" htmlFor="payroll-dni" required error={fieldErrors.dni} icon={<User className="h-3.5 w-3.5" />}>
                    <input
                      id="payroll-dni"
                      className={inputClassFor('dni')}
                      value={form.dni}
                      onChange={(e) => setField('dni', e.target.value)}
                      placeholder="12345678A"
                      autoCapitalize="characters"
                    />
                  </FormField>
                </div>
                <FormField label="Fecha de nacimiento" htmlFor="payroll-birthDate" required error={fieldErrors.birthDate} icon={<Calendar className="h-3.5 w-3.5" />}>
                  <BirthDateEsField
                    ref={birthDateRef}
                    id="payroll-birthDate"
                    value={form.birthDate}
                    onChange={(iso) => setField('birthDate', iso)}
                    className={inputClassFor('birthDate')}
                    error={fieldErrors.birthDate}
                  />
                </FormField>
                <FormField label="Teléfono" htmlFor="payroll-phone" required error={fieldErrors.phone} icon={<Phone className="h-3.5 w-3.5" />}>
                  <input
                    id="payroll-phone"
                    className={inputClassFor('phone')}
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    type="tel"
                    autoComplete="tel"
                  />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Dirección" htmlFor="payroll-address" required error={fieldErrors.address} icon={<MapPin className="h-3.5 w-3.5" />}>
                    <input
                      id="payroll-address"
                      className={inputClassFor('address')}
                      value={form.address}
                      onChange={(e) => setField('address', e.target.value)}
                      autoComplete="street-address"
                    />
                  </FormField>
                </div>
                <FormField label="Ciudad" htmlFor="payroll-city" required error={fieldErrors.city}>
                  <input
                    id="payroll-city"
                    className={inputClassFor('city')}
                    value={form.city}
                    onChange={(e) => setField('city', e.target.value)}
                    autoComplete="address-level2"
                  />
                </FormField>
              </div>
            </div>
          ) : null}

          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Nómina
            </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Nacionalidad" htmlFor="payroll-nationality" required error={fieldErrors.nationality}>
              <input
                id="payroll-nationality"
                className={inputClassFor('nationality')}
                value={form.nationality}
                onChange={(e) => setField('nationality', e.target.value)}
                autoComplete="country-name"
              />
            </FormField>

            <FormField label="C.P." htmlFor="payroll-postalCode">
              <input
                id="payroll-postalCode"
                className={inputClass}
                value={form.postalCode}
                onChange={(e) => setField('postalCode', e.target.value)}
                autoComplete="postal-code"
                inputMode="numeric"
              />
            </FormField>

            <div className="sm:col-span-2">
              <FormField
                label="Nº Seguridad Social"
                htmlFor="payroll-ss"
                required
                error={fieldErrors.socialSecurityNumber}
              >
                <input
                  id="payroll-ss"
                  className={inputClassFor('socialSecurityNumber')}
                  value={form.socialSecurityNumber}
                  onChange={(e) => setField('socialSecurityNumber', e.target.value)}
                  inputMode="numeric"
                  placeholder="12 dígitos"
                />
              </FormField>
            </div>

            <div className="sm:col-span-2">
              <FormField
                label="IBAN"
                htmlFor="payroll-iban"
                required
                error={fieldErrors.bankAccount}
                icon={<CreditCard className="h-3.5 w-3.5" />}
              >
                <input
                  id="payroll-iban"
                  className={`${inputClassFor('bankAccount')} ${IBAN_INPUT_CLASS}`}
                  value={form.bankAccount}
                  onChange={(e) => setField('bankAccount', formatIbanInput(e.target.value))}
                  maxLength={IBAN_DISPLAY_MAX_LENGTH}
                  placeholder="ES00 0000 0000 0000 0000 0000"
                  autoCapitalize="characters"
                />
              </FormField>
            </div>

            <div className="sm:col-span-2">
              <FormField label="Banco" htmlFor="payroll-bank" required error={fieldErrors.bankName}>
                <input
                  id="payroll-bank"
                  className={inputClassFor('bankName')}
                  value={form.bankName}
                  onChange={(e) => setField('bankName', normalizeBankName(e.target.value))}
                  maxLength={60}
                  placeholder="Ej: CaixaBank, BBVA…"
                />
              </FormField>
            </div>

            <FormField
              label="Contacto emergencia"
              htmlFor="payroll-emergency"
              required
              error={fieldErrors.emergencyContact}
              icon={<Heart className="h-3.5 w-3.5" />}
            >
              <input
                id="payroll-emergency"
                className={inputClassFor('emergencyContact')}
                value={form.emergencyContact}
                onChange={(e) => setField('emergencyContact', normalizeEmergencyContact(e.target.value))}
                maxLength={80}
                placeholder="Nombre y parentesco"
              />
            </FormField>

            <FormField
              label="Tel. emergencia"
              htmlFor="payroll-emergency-phone"
              required
              error={fieldErrors.emergencyPhone}
            >
              <input
                id="payroll-emergency-phone"
                className={inputClassFor('emergencyPhone')}
                value={form.emergencyPhone}
                onChange={(e) => setField('emergencyPhone', normalizeEmergencyPhone(e.target.value))}
                maxLength={20}
                placeholder="+34 600 000 000"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
              />
            </FormField>
          </div>
          </div>

          <div className="space-y-2">
            <button
              type="submit"
              disabled={isSaving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white hover:bg-black disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {isSaving ? 'Guardando…' : 'Guardar y entrar al trabajo'}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                const uid = String(user?.user_id || user?.id || '').trim();
                if (uid) skipWorkerProfileGates(uid);
                markWorkerPayrollBypass(uid);
                navigate(WORKER_DEFAULT_LANDING_PATH, { replace: true, state: { payrollCompleted: true } });
              }}
              className="flex w-full items-center justify-center rounded-xl border-2 border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Ir al back office
            </button>
            <p className="text-center text-[10px] text-gray-400">
              Los datos de contrato y alta los completará RRHH / gestoría.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
