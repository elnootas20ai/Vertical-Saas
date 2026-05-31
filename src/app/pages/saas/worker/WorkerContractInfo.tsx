import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Shield,
  FileText,
  DollarSign,
  Save,
  Edit3,
  Info,
  Loader2,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { buildDefaultPersonalData } from '../../../lib/workerProfileCompletion';
import {
  formatIbanInput,
  IBAN_DISPLAY_MAX_LENGTH,
  IBAN_INPUT_CLASS,
  normalizeBankName,
  normalizeIbanInput,
} from '../../../lib/employmentBankUtils';
import { toast } from 'sonner';

export function WorkerContractInfo() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    socialSecurityNumber: user?.personalData?.socialSecurityNumber || '',
    iban: formatIbanInput(user?.employment?.bankAccount || ''),
    bankName: user?.employment?.bankName || '',
  });

  useEffect(() => {
    if (!user) return;
    setFormData({
      socialSecurityNumber: user.personalData?.socialSecurityNumber || '',
      iban: formatIbanInput(user.employment?.bankAccount || ''),
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
      personalData: buildDefaultPersonalData({
        ...(user.personalData || {}),
        socialSecurityNumber: formData.socialSecurityNumber.trim(),
      }),
      employment: {
        ...(user.employment || {}),
        bankAccount: normalizeIbanInput(formData.iban),
        bankName: normalizeBankName(formData.bankName),
      },
    });
    setIsSaving(false);
    if (!result.success) {
      toast.error(result.error || 'No se pudieron guardar los datos');
      return;
    }
    toast.success('Datos guardados');
    setIsEditing(false);
  };

  const inputClass = (disabled?: boolean) => `w-full px-3 py-2.5 rounded-lg border text-sm transition-all ${
    isEditing && !disabled
      ? 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none'
      : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
  }`;

  const employment = user?.employment;

  return (
    <Layout title={t('worker.contractInfo.title')} subtitle={t('worker.contractInfo.subtitle')}>
      <div className="space-y-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">{t('worker.contractInfo.infoBanner')}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{t('worker.contractInfo.infoBannerDesc')}</p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => (isEditing ? void handleSave() : setIsEditing(true))}
            disabled={isSaving}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              isEditing
                ? 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : isEditing ? <Save className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
            {isSaving ? t('common.saving', 'Guardando…') : isEditing ? t('common.save') : t('common.edit')}
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" />
            {t('worker.contractInfo.socialSecurity')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.ssNumber')}</label>
              <input
                type="text"
                value={formData.socialSecurityNumber}
                onChange={(e) => handleChange('socialSecurityNumber', e.target.value)}
                disabled={!isEditing}
                className={inputClass()}
                placeholder="XX/12345678/90"
              />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-500" />
            {t('worker.contractInfo.contractData')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.contractType')}</label>
              <div className={inputClass(true)}>{employment?.contractType || '—'}</div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.startDate')}</label>
              <div className={inputClass(true)}>{employment?.startDate || 'Pendiente (RRHH)'}</div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Grupo de cotización</label>
              <div className={inputClass(true)}>{employment?.contributionGroup || 'Pendiente (RRHH)'}</div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">Mutua</label>
              <div className={inputClass(true)}>{employment?.mutualInsurance || 'Pendiente (RRHH)'}</div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-amber-500" />
            {t('worker.contractInfo.bankData')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.iban')}</label>
              <input
                type="text"
                value={formData.iban}
                onChange={(e) => handleChange('iban', formatIbanInput(e.target.value))}
                disabled={!isEditing}
                maxLength={IBAN_DISPLAY_MAX_LENGTH}
                className={`${inputClass()} ${IBAN_INPUT_CLASS}`}
                placeholder="ES00 0000 0000 0000 0000 0000"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.bankName')}</label>
              <input
                type="text"
                value={formData.bankName}
                onChange={(e) => handleChange('bankName', normalizeBankName(e.target.value))}
                disabled={!isEditing}
                maxLength={60}
                className={inputClass()}
                placeholder="Ej: CaixaBank, BBVA…"
              />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
