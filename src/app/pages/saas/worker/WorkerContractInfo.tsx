import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardCheck,
  Building2,
  Calendar,
  DollarSign,
  Clock,
  FileText,
  Save,
  Edit3,
  AlertCircle,
  Info,
  Briefcase,
  Shield,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';

export function WorkerContractInfo() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    ssNumber: '',
    ssAffiliation: '',
    contractType: 'indefinido',
    startDate: '2025-09-01',
    endDate: '',
    workday: 'completa',
    weeklyHours: '40',
    salary: '',
    payFrequency: 'monthly',
    iban: '',
    professionalCategory: '',
    contributionGroup: '',
    cnae: '',
    epigraph: '',
    trialPeriodEnd: '2025-11-01',
    collectiveAgreement: '',
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    setIsEditing(false);
  };

  const inputClass = (disabled?: boolean) => `w-full px-3 py-2.5 rounded-lg border text-sm transition-all ${
    isEditing && !disabled
      ? 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none'
      : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
  }`;

  return (
    <Layout title={t('worker.contractInfo.title')} subtitle={t('worker.contractInfo.subtitle')}>
      <div className="space-y-6">
        {/* Info banner */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">{t('worker.contractInfo.infoBanner')}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{t('worker.contractInfo.infoBannerDesc')}</p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => isEditing ? handleSave() : setIsEditing(true)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              isEditing
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {isEditing ? <Save className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
            {isEditing ? t('common.save') : t('common.edit')}
          </button>
        </div>

        {/* Seguridad Social */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" />
            {t('worker.contractInfo.socialSecurity')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.ssNumber')}</label>
              <input type="text" value={formData.ssNumber} onChange={(e) => handleChange('ssNumber', e.target.value)} disabled={!isEditing} className={inputClass()} placeholder="XX/12345678/90" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.ssAffiliation')}</label>
              <input type="text" value={formData.ssAffiliation} onChange={(e) => handleChange('ssAffiliation', e.target.value)} disabled={!isEditing} className={inputClass()} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.contributionGroup')}</label>
              <input type="text" value={formData.contributionGroup} onChange={(e) => handleChange('contributionGroup', e.target.value)} disabled={!isEditing} className={inputClass()} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.professionalCat')}</label>
              <input type="text" value={formData.professionalCategory} onChange={(e) => handleChange('professionalCategory', e.target.value)} disabled={!isEditing} className={inputClass()} />
            </div>
          </div>
        </div>

        {/* Datos del Contrato */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-500" />
            {t('worker.contractInfo.contractData')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.contractType')}</label>
              <select value={formData.contractType} onChange={(e) => handleChange('contractType', e.target.value)} disabled={!isEditing} className={inputClass()}>
                <option value="indefinido">{t('worker.contractInfo.indefinite')}</option>
                <option value="temporal">{t('worker.contractInfo.temporary')}</option>
                <option value="practicas">{t('worker.contractInfo.internship')}</option>
                <option value="formacion">{t('worker.contractInfo.training')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.workday')}</label>
              <select value={formData.workday} onChange={(e) => handleChange('workday', e.target.value)} disabled={!isEditing} className={inputClass()}>
                <option value="completa">{t('worker.contractInfo.fullTime')}</option>
                <option value="parcial">{t('worker.contractInfo.partTime')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.startDate')}</label>
              <input type="date" value={formData.startDate} onChange={(e) => handleChange('startDate', e.target.value)} disabled={!isEditing} className={inputClass()} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.endDate')}</label>
              <input type="date" value={formData.endDate} onChange={(e) => handleChange('endDate', e.target.value)} disabled={!isEditing} className={inputClass()} placeholder={t('worker.contractInfo.noEndDate')} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.weeklyHours')}</label>
              <input type="number" value={formData.weeklyHours} onChange={(e) => handleChange('weeklyHours', e.target.value)} disabled={!isEditing} className={inputClass()} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.trialPeriod')}</label>
              <input type="date" value={formData.trialPeriodEnd} onChange={(e) => handleChange('trialPeriodEnd', e.target.value)} disabled={!isEditing} className={inputClass()} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.collectiveAgreement')}</label>
              <input type="text" value={formData.collectiveAgreement} onChange={(e) => handleChange('collectiveAgreement', e.target.value)} disabled={!isEditing} className={inputClass()} />
            </div>
          </div>
        </div>

        {/* Datos Bancarios */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-amber-500" />
            {t('worker.contractInfo.bankData')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.iban')}</label>
              <input type="text" value={formData.iban} onChange={(e) => handleChange('iban', e.target.value)} disabled={!isEditing} className={inputClass()} placeholder="ES00 0000 0000 0000 0000 0000" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.contractInfo.payFrequency')}</label>
              <select value={formData.payFrequency} onChange={(e) => handleChange('payFrequency', e.target.value)} disabled={!isEditing} className={inputClass()}>
                <option value="monthly">{t('worker.contractInfo.monthly')}</option>
                <option value="biweekly">{t('worker.contractInfo.biweekly')}</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
