import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Camera,
  Save,
  Edit3,
  Briefcase,
  Building2,
  Clock,
  Banknote,
  Heart,
  CreditCard,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';

export function WorkerProfile() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: '',
    city: '',
    postalCode: '',
    birthDate: '',
    dni: '',
    ssNumber: '',
    emergencyContact: user?.employment?.emergencyContact || '',
    emergencyPhone: user?.employment?.emergencyPhone || '',
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    setIsEditing(false);
  };

  const initials = `${formData.firstName?.[0] || ''}${formData.lastName?.[0] || ''}`.toUpperCase() || 'UU';

  const employment = user?.employment;

  return (
    <Layout title={t('worker.profile.title')} subtitle={t('worker.profile.subtitle')}>
      <div className="space-y-6">
        {/* Avatar & Name Header */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative group">
              <div className="w-24 h-24 bg-gray-200 dark:bg-gray-700 rounded-2xl flex items-center justify-center overflow-hidden">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.fullName} className="w-24 h-24 object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-gray-500 dark:text-gray-400">{initials}</span>
                )}
              </div>
              <button className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Camera className="w-6 h-6 text-white" />
              </button>
            </div>
            <div className="text-center sm:text-left flex-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {formData.firstName} {formData.lastName}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-400 dark:text-gray-500">{user?.role || t('worker.profile.employee')}</span>
                {employment?.department && (
                  <>
                    <span className="text-xs text-gray-300 dark:text-gray-600">·</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{employment.department}</span>
                  </>
                )}
              </div>
            </div>
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
        </div>

        {/* Employment Summary */}
        {employment && (employment.position || employment.contractType || employment.schedule) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {employment.position && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <Briefcase className="w-4 h-4 text-blue-500 mb-2" />
                <p className="text-xs text-gray-400 dark:text-gray-500">{t('worker.profile.positionLabel')}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{employment.position}</p>
              </div>
            )}
            {employment.schedule && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <Clock className="w-4 h-4 text-emerald-500 mb-2" />
                <p className="text-xs text-gray-400 dark:text-gray-500">{t('worker.profile.scheduleLabel')}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{employment.schedule}</p>
              </div>
            )}
            {employment.contractType && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <Building2 className="w-4 h-4 text-purple-500 mb-2" />
                <p className="text-xs text-gray-400 dark:text-gray-500">{t('worker.profile.contractLabel')}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5 capitalize">{employment.contractType}</p>
              </div>
            )}
            {employment.startDate && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <Calendar className="w-4 h-4 text-amber-500 mb-2" />
                <p className="text-xs text-gray-400 dark:text-gray-500">{t('worker.profile.startDateLabel')}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{employment.startDate}</p>
              </div>
            )}
          </div>
        )}

        {/* Personal Data */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-500" />
            {t('worker.profile.personalData')}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { key: 'firstName', label: t('worker.profile.firstName'), icon: <User className="w-4 h-4" /> },
              { key: 'lastName', label: t('worker.profile.lastName'), icon: <User className="w-4 h-4" /> },
              { key: 'email', label: t('worker.profile.email'), icon: <Mail className="w-4 h-4" />, disabled: true },
              { key: 'phone', label: t('worker.profile.phone'), icon: <Phone className="w-4 h-4" /> },
              { key: 'dni', label: t('worker.profile.dni'), icon: <User className="w-4 h-4" /> },
              { key: 'birthDate', label: t('worker.profile.birthDate'), icon: <Calendar className="w-4 h-4" />, type: 'date' },
            ].map((field) => (
              <div key={field.key}>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  {field.icon}
                  {field.label}
                </label>
                <input
                  type={field.type || 'text'}
                  value={(formData as any)[field.key]}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  disabled={!isEditing || field.disabled}
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm transition-all ${
                    isEditing && !field.disabled
                      ? 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none'
                      : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  }`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Address */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-500" />
            {t('worker.profile.address')}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { key: 'address', label: t('worker.profile.streetAddress'), full: true },
              { key: 'city', label: t('worker.profile.city') },
              { key: 'postalCode', label: t('worker.profile.postalCode') },
            ].map((field) => (
              <div key={field.key} className={field.full ? 'sm:col-span-2' : ''}>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{field.label}</label>
                <input
                  type="text"
                  value={(formData as any)[field.key]}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  disabled={!isEditing}
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm transition-all ${
                    isEditing
                      ? 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none'
                      : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  }`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Heart className="w-4 h-4 text-red-500" />
            {t('worker.profile.emergencyContact')}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.profile.emergencyName')}</label>
              <input
                type="text"
                value={formData.emergencyContact}
                onChange={(e) => handleChange('emergencyContact', e.target.value)}
                disabled={!isEditing}
                className={`w-full px-3 py-2.5 rounded-lg border text-sm transition-all ${
                  isEditing
                    ? 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none'
                    : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 cursor-not-allowed'
                }`}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{t('worker.profile.emergencyPhone')}</label>
              <input
                type="tel"
                value={formData.emergencyPhone}
                onChange={(e) => handleChange('emergencyPhone', e.target.value)}
                disabled={!isEditing}
                className={`w-full px-3 py-2.5 rounded-lg border text-sm transition-all ${
                  isEditing
                    ? 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 outline-none'
                    : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 cursor-not-allowed'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Banking Info (read-only) */}
        {employment?.bankAccount && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-500" />
              {t('worker.profile.bankInfo')}
            </h3>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">IBAN</label>
              <div className="w-full px-3 py-2.5 rounded-lg border bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 font-mono">
                {employment.bankAccount.replace(/(.{4})/g, '$1 ').trim()}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
