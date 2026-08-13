import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Camera,
  Save,
  Briefcase,
  Building2,
  Clock,
  Heart,
  CreditCard,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import {
  buildDefaultPersonalData,
  resolveWorkerProfileCompletion,
} from '../../../lib/workerProfileCompletion';
import { normalizeBirthDateIso } from '../../../lib/birthDateIso';
import { BirthDateEsField } from '../../../components/saas/BirthDateEsField';
import {
  formatIbanInput,
  IBAN_DISPLAY_MAX_LENGTH,
  IBAN_INPUT_CLASS,
  normalizeBankName,
  normalizeEmergencyContact,
  normalizeEmergencyPhone,
  normalizeIbanInput,
} from '../../../lib/employmentBankUtils';
import { formatDateEs } from '../../../lib/formatDateEs';
import { toast } from 'sonner';
import { VERTIAL_BTN_PRIMARY } from '../../../lib/vertialUiTokens';
import { WORKER_CARD, WORKER_INPUT, WORKER_PAGE, WORKER_SECTION_TITLE } from '../../../lib/workerUi';
import { DeleteAccountSection } from '../../../components/saas/DeleteAccountSection';

const inputClass = WORKER_INPUT;
const inputDisabledClass =
  'w-full min-h-11 cursor-not-allowed rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-900/50 dark:text-stone-400';

export function WorkerProfile() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();

  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: user?.personalData?.address || '',
    city: user?.personalData?.city || '',
    postalCode: user?.personalData?.postalCode || '',
    birthDate: normalizeBirthDateIso(user?.personalData?.birthDate || ''),
    dni: user?.personalData?.dni || '',
    nationality: user?.personalData?.nationality || '',
    socialSecurityNumber: user?.personalData?.socialSecurityNumber || '',
    emergencyContact: user?.employment?.emergencyContact || '',
    emergencyPhone: user?.employment?.emergencyPhone || '',
    bankAccount: formatIbanInput(user?.employment?.bankAccount || ''),
    bankName: user?.employment?.bankName || '',
  });

  useEffect(() => {
    if (!user) return;
    setFormData({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      phone: user.phone || '',
      address: user.personalData?.address || '',
      city: user.personalData?.city || '',
      postalCode: user.personalData?.postalCode || '',
      birthDate: normalizeBirthDateIso(user.personalData?.birthDate || ''),
      dni: user.personalData?.dni || '',
      nationality: user.personalData?.nationality || '',
      socialSecurityNumber: user.personalData?.socialSecurityNumber || '',
      emergencyContact: user.employment?.emergencyContact || '',
      emergencyPhone: user.employment?.emergencyPhone || '',
      bankAccount: formatIbanInput(user.employment?.bankAccount || ''),
      bankName: user.employment?.bankName || '',
    });
  }, [user]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!user?.user_id) return;
    setIsSaving(true);
    const result = await updateUser(user.user_id, {
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      phone: formData.phone.trim(),
      personalData: buildDefaultPersonalData({
        dni: formData.dni,
        birthDate: normalizeBirthDateIso(formData.birthDate),
        nationality: formData.nationality,
        address: formData.address,
        city: formData.city,
        postalCode: formData.postalCode,
        socialSecurityNumber: formData.socialSecurityNumber,
      }),
      employment: {
        ...(user.employment || {}),
        emergencyContact: normalizeEmergencyContact(formData.emergencyContact),
        emergencyPhone: normalizeEmergencyPhone(formData.emergencyPhone),
        bankAccount: normalizeIbanInput(formData.bankAccount),
        bankName: normalizeBankName(formData.bankName),
      },
    });
    setIsSaving(false);
    if (!result.success) {
      toast.error(result.error || 'No se pudo guardar el perfil');
      return;
    }
    toast.success('Perfil guardado');
  };

  const initials = `${formData.firstName?.[0] || ''}${formData.lastName?.[0] || ''}`.toUpperCase() || 'UU';
  const employment = user?.employment;
  const completion = user ? resolveWorkerProfileCompletion(user) : null;

  return (
    <Layout title={t('worker.profile.title')} subtitle={t('worker.profile.subtitle')}>
      <div className={WORKER_PAGE}>
        {completion && !completion.workerCompleted && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/20">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Ficha incompleta</p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                Rellena tus datos y pulsa Guardar.
              </p>
            </div>
          </div>
        )}

        {completion?.workerCompleted && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/20">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
              {completion.fullyCompleted
                ? 'Ficha completa'
                : 'Tu parte está lista. RRHH puede completar el alta.'}
            </p>
          </div>
        )}

        <div className={`${WORKER_CARD} p-4 sm:p-5`}>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
            <div className="relative group">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-stone-100 dark:bg-stone-800 sm:h-24 sm:w-24">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.fullName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-stone-400">{initials}</span>
                )}
              </div>
              <button type="button" className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Camera className="h-6 w-6 text-white" />
              </button>
            </div>
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100 sm:text-xl">
                {formData.firstName} {formData.lastName}
              </h2>
              <p className="truncate text-sm text-stone-500">{user?.email}</p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <span className="text-xs text-stone-400">{user?.role || t('worker.profile.employee')}</span>
                {employment?.department ? (
                  <>
                    <span className="text-xs text-stone-300">·</span>
                    <span className="text-xs text-stone-400">{employment.department}</span>
                  </>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className={`${VERTIAL_BTN_PRIMARY} w-full sm:w-auto`}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? t('common.saving', 'Guardando…') : t('common.save')}
            </button>
          </div>
        </div>

        {employment && (employment.position || employment.contractType || employment.schedule) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {employment.position && (
              <div className={`${WORKER_CARD} p-3.5`}>
                <Briefcase className="mb-2 h-4 w-4 text-[var(--v-blue,#2563eb)]" />
                <p className="text-xs text-stone-400">{t('worker.profile.positionLabel')}</p>
                <p className="mt-0.5 text-sm font-semibold text-stone-900 dark:text-stone-100">{employment.position}</p>
              </div>
            )}
            {employment.schedule && (
              <div className={`${WORKER_CARD} p-3.5`}>
                <Clock className="mb-2 h-4 w-4 text-emerald-500" />
                <p className="text-xs text-stone-400">{t('worker.profile.scheduleLabel')}</p>
                <p className="mt-0.5 text-sm font-semibold text-stone-900 dark:text-stone-100">{employment.schedule}</p>
              </div>
            )}
            {employment.contractType && (
              <div className={`${WORKER_CARD} p-3.5`}>
                <Building2 className="mb-2 h-4 w-4 text-stone-500" />
                <p className="text-xs text-stone-400">{t('worker.profile.contractLabel')}</p>
                <p className="mt-0.5 text-sm font-semibold capitalize text-stone-900 dark:text-stone-100">{employment.contractType}</p>
              </div>
            )}
            {employment.startDate && (
              <div className={`${WORKER_CARD} p-3.5`}>
                <Calendar className="mb-2 h-4 w-4 text-amber-500" />
                <p className="text-xs text-stone-400">{t('worker.profile.startDateLabel')}</p>
                <p className="mt-0.5 text-sm font-semibold text-stone-900 dark:text-stone-100">{formatDateEs(employment.startDate)}</p>
              </div>
            )}
          </div>
        )}

        <div className={`${WORKER_CARD} p-4 sm:p-5`}>
          <h3 className={`${WORKER_SECTION_TITLE} mb-4 flex items-center gap-2`}>
            <User className="h-4 w-4 text-[var(--v-blue,#2563eb)]" />
            {t('worker.profile.personalData')}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { key: 'firstName', label: t('worker.profile.firstName'), icon: <User className="w-4 h-4" /> },
              { key: 'lastName', label: t('worker.profile.lastName'), icon: <User className="w-4 h-4" /> },
              { key: 'email', label: t('worker.profile.email'), icon: <Mail className="w-4 h-4" />, disabled: true },
              { key: 'phone', label: t('worker.profile.phone'), icon: <Phone className="w-4 h-4" /> },
              { key: 'dni', label: t('worker.profile.dni'), icon: <User className="w-4 h-4" /> },
              { key: 'nationality', label: 'Nacionalidad', icon: <User className="w-4 h-4" /> },
              { key: 'socialSecurityNumber', label: 'Nº Seguridad Social', icon: <User className="w-4 h-4" /> },
            ].map((field) => (
              <div key={field.key}>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-500">
                  {field.icon}
                  {field.label}
                </label>
                <input
                  type="text"
                  value={(formData as Record<string, string>)[field.key]}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  disabled={Boolean(field.disabled)}
                  className={field.disabled ? inputDisabledClass : inputClass}
                />
              </div>
            ))}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-500">
                <Calendar className="h-4 w-4" />
                {t('worker.profile.birthDate')}
              </label>
              <BirthDateEsField
                value={formData.birthDate}
                onChange={(iso) => handleChange('birthDate', iso)}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div className={`${WORKER_CARD} p-4 sm:p-5`}>
          <h3 className={`${WORKER_SECTION_TITLE} mb-4 flex items-center gap-2`}>
            <MapPin className="h-4 w-4 text-emerald-500" />
            {t('worker.profile.address')}
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { key: 'address', label: t('worker.profile.streetAddress'), full: true },
              { key: 'city', label: t('worker.profile.city') },
              { key: 'postalCode', label: t('worker.profile.postalCode') },
            ].map((field) => (
              <div key={field.key} className={field.full ? 'sm:col-span-2' : ''}>
                <label className="mb-1.5 block text-xs font-medium text-stone-500">{field.label}</label>
                <input
                  type="text"
                  value={(formData as Record<string, string>)[field.key]}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        </div>

        <div className={`${WORKER_CARD} p-4 sm:p-5`}>
          <h3 className={`${WORKER_SECTION_TITLE} mb-4 flex items-center gap-2`}>
            <Heart className="h-4 w-4 text-rose-500" />
            {t('worker.profile.emergencyContact')}
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-stone-500">{t('worker.profile.emergencyName')}</label>
              <input
                type="text"
                value={formData.emergencyContact}
                onChange={(e) => handleChange('emergencyContact', normalizeEmergencyContact(e.target.value))}
                maxLength={80}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-stone-500">{t('worker.profile.emergencyPhone')}</label>
              <input
                type="tel"
                value={formData.emergencyPhone}
                onChange={(e) => handleChange('emergencyPhone', normalizeEmergencyPhone(e.target.value))}
                maxLength={20}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div className={`${WORKER_CARD} p-4 sm:p-5`}>
          <h3 className={`${WORKER_SECTION_TITLE} mb-4 flex items-center gap-2`}>
            <CreditCard className="h-4 w-4 text-[var(--v-blue,#2563eb)]" />
            {t('worker.profile.bankInfo')}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-stone-500">IBAN</label>
              <input
                type="text"
                value={formData.bankAccount}
                onChange={(e) => handleChange('bankAccount', formatIbanInput(e.target.value))}
                maxLength={IBAN_DISPLAY_MAX_LENGTH}
                placeholder="ES00 0000 0000 0000 0000 0000"
                className={`${WORKER_INPUT} ${IBAN_INPUT_CLASS}`}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-stone-500">{t('worker.profile.bankName')}</label>
              <input
                type="text"
                value={formData.bankName}
                onChange={(e) => handleChange('bankName', normalizeBankName(e.target.value))}
                maxLength={60}
                placeholder="Ej: CaixaBank, BBVA…"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end pb-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className={`${VERTIAL_BTN_PRIMARY} w-full sm:w-auto`}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? t('common.saving', 'Guardando…') : t('common.save')}
          </button>
        </div>

        <DeleteAccountSection compact />
      </div>
    </Layout>
  );
}
