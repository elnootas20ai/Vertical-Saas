import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  BookOpen,
  Users,
  Shield,
  Building2,
  Sparkles,
  Trophy,
  ArrowRight,
  Play,
  FileText,
} from 'lucide-react';
import { Layout } from '../../../components/saas/Layout';
import { useAuth } from '../../../context/AuthContext';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  completed: boolean;
  category: string;
}

export function WorkerOnboarding() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [steps, setSteps] = useState<OnboardingStep[]>([
    { id: '1', title: t('worker.onboarding.step1Title'), description: t('worker.onboarding.step1Desc'), icon: <Building2 className="w-5 h-5" />, completed: true, category: 'company' },
    { id: '2', title: t('worker.onboarding.step2Title'), description: t('worker.onboarding.step2Desc'), icon: <Users className="w-5 h-5" />, completed: true, category: 'team' },
    { id: '3', title: t('worker.onboarding.step3Title'), description: t('worker.onboarding.step3Desc'), icon: <Shield className="w-5 h-5" />, completed: true, category: 'security' },
    { id: '4', title: t('worker.onboarding.step4Title'), description: t('worker.onboarding.step4Desc'), icon: <FileText className="w-5 h-5" />, completed: false, category: 'docs' },
    { id: '5', title: t('worker.onboarding.step5Title'), description: t('worker.onboarding.step5Desc'), icon: <BookOpen className="w-5 h-5" />, completed: false, category: 'training' },
    { id: '6', title: t('worker.onboarding.step6Title'), description: t('worker.onboarding.step6Desc'), icon: <Play className="w-5 h-5" />, completed: false, category: 'tools' },
  ]);

  const completedCount = steps.filter((s) => s.completed).length;
  const progress = Math.round((completedCount / steps.length) * 100);

  const toggleStep = (id: string) => {
    setSteps((prev) => prev.map((s) => s.id === id ? { ...s, completed: !s.completed } : s));
  };

  return (
    <Layout title={t('worker.onboarding.title')} subtitle={t('worker.onboarding.subtitle')}>
      <div className="space-y-6">
        {/* PRO Badge */}
        <div className="bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t('worker.onboarding.proFeature')}</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">{t('worker.onboarding.proDesc')}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t('worker.onboarding.progress')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{completedCount} / {steps.length} {t('worker.onboarding.stepsCompleted')}</p>
            </div>
            <div className="flex items-center gap-2">
              {progress === 100 && <Trophy className="w-5 h-5 text-amber-500" />}
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{progress}%</span>
            </div>
          </div>

          <div className="w-full h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>

          {progress === 100 && (
            <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{t('worker.onboarding.allComplete')}</p>
            </div>
          )}
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`bg-white dark:bg-gray-800 rounded-xl border transition-all cursor-pointer hover:shadow-sm ${
                step.completed
                  ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
              onClick={() => toggleStep(step.id)}
            >
              <div className="flex items-center gap-4 p-4">
                <div className="relative shrink-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    step.completed
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                  }`}>
                    {step.icon}
                  </div>
                  {step.completed && (
                    <CheckCircle2 className="absolute -top-1 -right-1 w-4 h-4 text-emerald-500 bg-white dark:bg-gray-800 rounded-full" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 dark:text-gray-500">{t('worker.onboarding.step')} {index + 1}</span>
                  </div>
                  <p className={`text-sm font-semibold mt-0.5 ${step.completed ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-900 dark:text-gray-100'}`}>
                    {step.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{step.description}</p>
                </div>

                <div className="shrink-0">
                  {step.completed ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  ) : (
                    <Circle className="w-6 h-6 text-gray-300 dark:text-gray-600" />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
