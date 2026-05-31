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
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import {
  buildDefaultPersonalData,
  markWorkerPayrollBypass,
  mergePersonalData,
  skipWorkerProfileGates,
  WORKER_DEFAULT_LANDING_PATH,
} from '../../../lib/workerProfileCompletion';
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

type FieldKey =
  | 'nationality'
  | 'socialSecurityNumber'
  | 'bankAccount'
  | 'bankName'
  | 'emergencyContact'
  | 'emergencyPhone';

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

export function WorkerPayrollSetup() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const errorBannerRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({
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

    const errors = validatePayrollForm(form);
    if (Object.keys(errors).length > 0) {
      showValidationErrors(errors, 'Completa todos los campos obligatorios de nómina.');
      return;
    }

    setFieldErrors({});
    setSaveError(null);
    setIsSaving(true);

    try {
      const payrollPersonal = buildDefaultPersonalData({
        nationality: form.nationality.trim(),
        postalCode: form.postalCode.trim(),
        socialSecurityNumber: form.socialSecurityNumber.trim(),
      });

      const result = await updateUser(userId, {
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Datos de nómina</h1>
          <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
            Ya formas parte de una empresa. Para darte de alta y pagarte la nómina necesitamos
            estos datos. Todos los campos con
            <span className="text-red-500"> *</span> son obligatorios.
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
