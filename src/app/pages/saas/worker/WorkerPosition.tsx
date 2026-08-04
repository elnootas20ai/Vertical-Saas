import { useTranslation } from 'react-i18next';
import {
  Briefcase,
  Building2,
  Users,
  MapPin,
  Clock,
  Star,
  Target,
  BookOpen,
  Shield,
  CheckCircle2,
  Calendar,
  Banknote,
  Heart,
  GraduationCap,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';
import { useBusiness } from '../../../context/BusinessContext';
import type { EmploymentSkill } from '../../../lib/authApi';
import { formatDateEs } from '../../../lib/formatDateEs';

const CONTRACT_LABELS: Record<string, string> = {
  indefinido: 'Indefinido',
  temporal: 'Temporal',
  practicas: 'Prácticas',
  formacion: 'Formación',
  autonomo: 'Autónomo',
};

const WORKDAY_LABELS: Record<string, string> = {
  completa: 'Completa',
  parcial: 'Parcial',
  media: 'Media jornada',
  flexible: 'Flexible',
};

export function WorkerPosition() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { currentBusiness } = useBusiness();

  const employment = user?.employment;
  const members = currentBusiness?.members || [];
  const currentMember = members.find((m) => m.user_id === user?.user_id);
  const teammates = members.filter((m) => m.user_id !== user?.user_id);

  const skills: EmploymentSkill[] = employment?.skills && employment.skills.length > 0
    ? employment.skills
    : [];

  const permissions = [
    { name: t('worker.position.permDashboard'), granted: true },
    { name: t('worker.position.permCalendar'), granted: true },
    { name: t('worker.position.permChat'), granted: true },
    { name: t('worker.position.permDocs'), granted: true },
    { name: t('worker.position.permClock'), granted: true },
    { name: t('worker.position.permClients'), granted: currentMember?.permissions?.clients?.view ?? false },
    { name: t('worker.position.permFinance'), granted: currentMember?.permissions?.finance?.view ?? false },
    { name: t('worker.position.permSettings'), granted: user?.role === 'Admin' || user?.role === 'Gerente' },
  ];

  return (
    <Layout title={t('worker.position.title')} subtitle={t('worker.position.subtitle')}>
      <div className="space-y-6">
        {/* Position Header */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-24 translate-x-24" />
          <div className="relative">
            <div className="flex items-center gap-2 text-blue-200 text-sm mb-1">
              <Building2 className="w-4 h-4" />
              {employment?.department || t('worker.position.notAssigned')}
            </div>
            <h2 className="text-2xl font-bold">{employment?.position || t('worker.position.notAssigned')}</h2>
            <div className="flex flex-wrap items-center gap-4 mt-4 text-blue-100 text-sm">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {employment?.schedule || '09:00 - 18:00'}
              </span>
              {employment?.contractType && (
                <span className="flex items-center gap-1.5">
                  <Briefcase className="w-4 h-4" />
                  {CONTRACT_LABELS[employment.contractType] || employment.contractType}
                </span>
              )}
              {employment?.workday && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  {WORKDAY_LABELS[employment.workday] || employment.workday}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {members.length} {t('worker.position.members')}
              </span>
            </div>
          </div>
        </div>

        {/* Info cards */}
        {(employment?.startDate || employment?.salary || employment?.emergencyContact) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {employment?.startDate && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center gap-2 text-gray-400 mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-xs font-medium uppercase">{t('worker.position.startDate')}</span>
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatDateEs(employment.startDate)}</p>
              </div>
            )}
            {employment?.salary && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center gap-2 text-gray-400 mb-1">
                  <Banknote className="w-4 h-4" />
                  <span className="text-xs font-medium uppercase">{t('worker.position.salaryLabel')}</span>
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{employment.salary}</p>
              </div>
            )}
            {employment?.emergencyContact && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-red-200 dark:border-red-800 p-4">
                <div className="flex items-center gap-2 text-red-400 mb-1">
                  <Heart className="w-4 h-4" />
                  <span className="text-xs font-medium uppercase">{t('worker.position.emergency')}</span>
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{employment.emergencyContact}</p>
                {employment?.emergencyPhone && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{employment.emergencyPhone}</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              {t('worker.position.myTeam')}
            </h3>
            <div className="space-y-3">
              {teammates.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">{t('worker.position.noTeammates')}</p>
              ) : (
                teammates.map((member) => {
                  const initials = member.fullName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  const isManager = member.role === 'Admin' || member.role === 'Gerente';
                  return (
                    <div
                      key={member.user_id}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        isManager
                          ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isManager ? 'bg-blue-200 dark:bg-blue-800' : 'bg-gray-200 dark:bg-gray-700'}`}>
                        <span className={`text-xs font-bold ${isManager ? 'text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-gray-300'}`}>{initials}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{member.fullName}</p>
                        <p className={`text-xs ${isManager ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
                          {isManager ? t('worker.position.manager') : member.role || t('worker.position.colleague')}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Skills */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-amber-500" />
              {t('worker.position.skills')}
            </h3>
            {skills.length === 0 ? (
              <div className="text-center py-6">
                <Star className="w-8 h-8 mx-auto text-gray-200 dark:text-gray-700 mb-2" />
                <p className="text-sm text-gray-400 dark:text-gray-500">{t('worker.position.noSkills')}</p>
                <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">{t('worker.position.noSkillsHint')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {skills.map((skill) => (
                  <div key={skill.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{skill.name}</span>
                      <div className="flex gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3.5 h-3.5 ${i < skill.level ? 'text-amber-400 fill-amber-400' : 'text-gray-200 dark:text-gray-700'}`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full">
                      <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${(skill.level / 5) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Permissions */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-500" />
            {t('worker.position.accessPermissions')}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {permissions.map((perm) => (
              <div key={perm.name} className={`flex items-center gap-2.5 p-2.5 rounded-lg ${perm.granted ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'bg-gray-50 dark:bg-gray-700/30'}`}>
                <div className={`w-2 h-2 rounded-full ${perm.granted ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                <span className={`text-sm ${perm.granted ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
                  {perm.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
