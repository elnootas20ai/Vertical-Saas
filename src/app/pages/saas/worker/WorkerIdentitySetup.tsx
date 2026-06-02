import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Phone,
  MapPin,
  Calendar,
  Loader2,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import {
  buildDefaultPersonalData,
  markWorkerIdentityBypass,
  mergePersonalData,
  resolveLandingAfterWorkerSetup,
  resolveWorkerSessionEntryPath,
  skipWorkerProfileGates,
  WORKER_DEFAULT_LANDING_PATH,
} from '../../../lib/workerProfileCompletion';
import { normalizeBirthDateIso } from '../../../lib/birthDateIso';
import { BirthDateEsField, type BirthDateEsFieldHandle } from '../../../components/saas/BirthDateEsField';
import { VertialLogo } from '../../../components/VertialLogo';
import { toast } from 'sonner';

type FieldKey = 'dni' | 'birthDate' | 'phone' | 'address' | 'city';
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

function validateForm(
  form: {
    dni: string;
    phone: string;
    address: string;
    city: string;
  },
  birthDateIso: string,
  birthDisplay: string,
): FieldErrors {
  const errors: FieldErrors = {};

  if (!form.dni.trim()) {
    errors.dni = 'El DNI / NIE es obligatorio';
  }
  if (!birthDateIso) {
    errors.birthDate = birthDisplay.trim()
      ? 'Fecha incompleta: escribe día, mes y año (4 dígitos). Ej. 15/06/1995'
      : 'La fecha de nacimiento es obligatoria';
  }
  if (!form.phone.trim()) {
    errors.phone = 'El teléfono es obligatorio';
  }
  if (!form.address.trim()) {
    errors.address = 'La dirección es obligatoria';
  }
  if (!form.city.trim()) {
    errors.city = 'La ciudad es obligatoria';
  }

  return errors;
}

export function WorkerIdentitySetup() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();

  /** Paso 1 obsoleto: redirigir al destino correcto (ya no se usa tras login). */
  useEffect(() => {
    if (!user) return;
    navigate(resolveWorkerSessionEntryPath(user), { replace: true });
  }, [user, navigate]);

  const birthDateRef = useRef<BirthDateEsFieldHandle>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({
    phone: user?.phone || '',
    dni: user?.personalData?.dni || '',
    birthDate: normalizeBirthDateIso(user?.personalData?.birthDate || ''),
    address: user?.personalData?.address || '',
    city: user?.personalData?.city || '',
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

    if (birthDateIso && birthDateIso !== form.birthDate) {
      setForm((prev) => ({ ...prev, birthDate: birthDateIso }));
    }

    const errors = validateForm(form, birthDateIso, birthDisplay);
    if (Object.keys(errors).length > 0) {
      showValidationErrors(errors, 'Revisa los campos obligatorios marcados con *.');
      return;
    }

    setFieldErrors({});
    setSaveError(null);
    setIsSaving(true);

    try {
      const identityPersonal = buildDefaultPersonalData({
        dni: form.dni.trim(),
        birthDate: birthDateIso,
        address: form.address.trim(),
        city: form.city.trim(),
      });

      const result = await updateUser(userId, {
        phone: form.phone.trim(),
        personalData: mergePersonalData(user?.personalData, identityPersonal),
      });

      if (!result.success || !result.user) {
        const message = result.error || 'No se pudo guardar tu ficha. Inténtalo de nuevo.';
        setSaveError(message);
        toast.error(message);
        return;
      }

      toast.success('Identidad guardada correctamente');
      markWorkerIdentityBypass();

      const landing = resolveLandingAfterWorkerSetup(result.user);
      navigate(landing, { replace: true, state: { identityCompleted: true } });
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
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-900/30">
            <ShieldCheck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            Paso 1 de 2
          </p>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Quién eres</h1>
          <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
            Antes de unirte a una empresa, necesitamos tus datos de identidad.
            Los campos con <span className="text-red-500">*</span> son obligatorios.
          </p>
          <p className="mt-3 max-w-sm rounded-xl bg-blue-50 px-3 py-2 text-[11px] text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
            IBAN, Seguridad Social y contacto de emergencia los pediremos en el
            <strong> paso 2</strong>, cuando aceptes una invitación de empresa.
          </p>
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
            <div className="sm:col-span-2">
              <FormField
                label="DNI / NIE"
                htmlFor="worker-dni"
                required
                error={fieldErrors.dni}
                icon={<User className="h-3.5 w-3.5" />}
              >
                <input
                  id="worker-dni"
                  className={inputClassFor('dni')}
                  value={form.dni}
                  onChange={(e) => setField('dni', e.target.value)}
                  placeholder="12345678A"
                  autoComplete="off"
                  autoCapitalize="characters"
                  enterKeyHint="next"
                  aria-invalid={Boolean(fieldErrors.dni)}
                />
              </FormField>
            </div>

            <FormField
              label="Fecha de nacimiento"
              htmlFor="worker-birthDate"
              required
              error={fieldErrors.birthDate}
              icon={<Calendar className="h-3.5 w-3.5" />}
            >
              <BirthDateEsField
                ref={birthDateRef}
                id="worker-birthDate"
                value={form.birthDate}
                onChange={(iso) => setField('birthDate', iso)}
                onEdit={() => clearFieldError('birthDate')}
                className={inputClassFor('birthDate')}
                error={fieldErrors.birthDate}
              />
            </FormField>

            <FormField
              label="Teléfono"
              htmlFor="worker-phone"
              required
              error={fieldErrors.phone}
              icon={<Phone className="h-3.5 w-3.5" />}
            >
              <input
                id="worker-phone"
                type="tel"
                className={inputClassFor('phone')}
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="+34 600 000 000"
                autoComplete="tel"
                inputMode="tel"
                enterKeyHint="next"
                aria-invalid={Boolean(fieldErrors.phone)}
              />
            </FormField>

            <div className="sm:col-span-2">
              <FormField
                label="Dirección"
                htmlFor="worker-address"
                required
                error={fieldErrors.address}
                icon={<MapPin className="h-3.5 w-3.5" />}
              >
                <input
                  id="worker-address"
                  className={inputClassFor('address')}
                  value={form.address}
                  onChange={(e) => setField('address', e.target.value)}
                  placeholder="Calle, número, piso…"
                  autoComplete="street-address"
                  enterKeyHint="next"
                  aria-invalid={Boolean(fieldErrors.address)}
                />
              </FormField>
            </div>

            <div className="sm:col-span-2">
              <FormField
                label="Ciudad"
                htmlFor="worker-city"
                required
                error={fieldErrors.city}
              >
                <input
                  id="worker-city"
                  className={inputClassFor('city')}
                  value={form.city}
                  onChange={(e) => setField('city', e.target.value)}
                  autoComplete="address-level2"
                  enterKeyHint="done"
                  aria-invalid={Boolean(fieldErrors.city)}
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
              {isSaving ? 'Guardando…' : 'Guardar y continuar'}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                const uid = String(user?.user_id || user?.id || '').trim();
                if (uid) skipWorkerProfileGates(uid);
                markWorkerIdentityBypass();
                navigate(
                  user?.linkedBusinessId ? WORKER_DEFAULT_LANDING_PATH : '/saas/user-dashboard',
                  { replace: true },
                );
              }}
              className="flex w-full items-center justify-center rounded-xl border-2 border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Ir al panel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
