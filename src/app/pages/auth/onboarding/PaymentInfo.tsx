import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { CreditCard, Lock, Shield, AlertCircle } from 'lucide-react';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import { useAuth } from '../../../context/AuthContext';
import {
  OnboardingStepHeading,
  OnboardingStepShell,
  OnboardingContentCard,
} from '../../../components/auth/onboarding/OnboardingStepShell';
import { useOnboarding, ONBOARDING_ROUTES } from '../../../context/OnboardingContext';
import {
  calculateOnboardingPricing,
  getPlansForBusinessType,
  clampOnboardingPlanId,
} from '../../../lib/onboardingPlanRecommendation';
import { getBillingCapabilities } from '../../../lib/subscriptionApi';

const inputClass = (hasError: boolean) =>
  `w-full px-3 py-2 text-sm border-2 rounded-xl outline-none transition-colors ${
    hasError
      ? 'border-red-500 focus:border-red-500'
      : 'border-gray-200 dark:border-gray-700 focus:border-blue-500 bg-white dark:bg-gray-800'
  }`;

const STEP_INDEX = 5;

export function PaymentInfo() {
  const navigate = useNavigate();
  const { user, isInitializing, refreshCurrentUser, saveBillingCard, activateOnboardingTrialWithoutCard } =
    useAuth();
  const { data, updateData, initializeTrial, advanceStep } = useOnboarding();
  const [skipMonei, setSkipMonei] = useState(false);

  useEffect(() => {
    getBillingCapabilities()
      .then((res) => setSkipMonei(Boolean(res.skipMonei)))
      .catch(() => setSkipMonei(false));
  }, []);

  useEffect(() => {
    if (isInitializing) return;
    if (user?.user_id) return;
    void refreshCurrentUser().then((result) => {
      if (!result.ok) {
        navigate('/auth/login', { replace: true, state: { from: '/auth/onboarding/payment-info' } });
      }
    });
  }, [isInitializing, user?.user_id, refreshCurrentUser, navigate]);

  useEffect(() => {
    if (data.completedStep < STEP_INDEX - 1) {
      navigate(ONBOARDING_ROUTES[data.completedStep + 1], { replace: true });
    }
  }, [data.completedStep, navigate]);
  const [formData, setFormData] = useState({
    cardNumber: data.paymentDetails.cardNumber,
    cardHolderName: data.paymentDetails.cardHolderName,
    expiryDate: data.paymentDetails.expiryDate,
    cvv: data.paymentDetails.cvv,
    acceptTerms: data.paymentDetails.acceptTerms,
  });

  useEffect(() => {
    setFormData({
      cardNumber: data.paymentDetails.cardNumber,
      cardHolderName: data.paymentDetails.cardHolderName,
      expiryDate: data.paymentDetails.expiryDate,
      cvv: data.paymentDetails.cvv,
      acceptTerms: data.paymentDetails.acceptTerms,
    });
  }, [data.paymentDetails]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const finishPaymentStep = useCallback(() => {
    initializeTrial();
    advanceStep(STEP_INDEX);
    navigate('/auth/onboarding/confirmation');
  }, [advanceStep, initializeTrial, navigate]);

  const orderSummary = useMemo(() => {
    const billingMode = data.subscriptionSelection.billingMode;
    const selectedPlanId = clampOnboardingPlanId(
      data.subscriptionSelection.recommendedPlanId,
      {
        businessType: data.businessType,
        userCount: data.businessMetrics.userCount,
        locationCount: data.businessMetrics.locationCount,
        businessCount: data.businessMetrics.businessCount,
        commercialBrandCount: data.businessMetrics.commercialBrandCount,
        modules: data.requestedModules,
        deliveryNeeds: data.deliveryNeeds,
      },
    );
    const plans = getPlansForBusinessType(data.businessType);
    const plan = plans.find((p) => p.id === selectedPlanId) ?? plans[0];
    const pricing = calculateOnboardingPricing({
      plan,
      billingMode,
      userCount: data.businessMetrics.userCount,
      locationCount: data.businessMetrics.locationCount,
      businessCount: data.businessMetrics.businessCount,
      commercialBrandCount: data.businessMetrics.commercialBrandCount,
    });
    return { plan, selectedPlanId, billingMode, pricing };
  }, [data]);

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\s/g, '');
    const chunks = cleaned.match(/.{1,4}/g);
    return chunks ? chunks.join(' ') : cleaned;
  };

  const formatExpiryDate = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4);
    }
    return cleaned;
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 16) {
      setFormData({ ...formData, cardNumber: formatCardNumber(value) });
      setErrors({ ...errors, cardNumber: '' });
    }
  };

  const handleExpiryDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 4) {
      setFormData({ ...formData, expiryDate: formatExpiryDate(value) });
      setErrors({ ...errors, expiryDate: '' });
    }
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 3) {
      setFormData({ ...formData, cvv: value });
      setErrors({ ...errors, cvv: '' });
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (formData.cardNumber.replace(/\s/g, '').length !== 16) {
      newErrors.cardNumber = 'Número de tarjeta inválido';
    }

    if (!formData.cardHolderName.trim()) {
      newErrors.cardHolderName = 'Nombre requerido';
    }

    if (formData.expiryDate.length !== 5) {
      newErrors.expiryDate = 'Fecha inválida (MM/YY)';
    } else {
      const [month, year] = formData.expiryDate.split('/').map(Number);
      const currentYear = new Date().getFullYear() % 100;
      const currentMonth = new Date().getMonth() + 1;

      if (month < 1 || month > 12) {
        newErrors.expiryDate = 'Mes inválido';
      } else if (year < currentYear || (year === currentYear && month < currentMonth)) {
        newErrors.expiryDate = 'Tarjeta expirada';
      }
    }

    if (formData.cvv.length !== 3) {
      newErrors.cvv = 'CVV inválido';
    }

    if (!formData.acceptTerms) {
      newErrors.acceptTerms = 'Debes aceptar los términos';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.user_id) {
      setSubmitError('Tu sesión ha caducado. Inicia sesión de nuevo para continuar.');
      navigate('/auth/login', { replace: true, state: { from: '/auth/onboarding/payment-info' } });
      return;
    }

    if (skipMonei) {
      setIsSubmitting(true);
      setSubmitError('');
      const result = await activateOnboardingTrialWithoutCard({
        billingMode: data.subscriptionSelection.billingMode,
        selectedPlanId: orderSummary.selectedPlanId,
      });
      setIsSubmitting(false);
      if (!result.success) {
        setSubmitError(result.error || 'No se pudo iniciar la prueba. Inténtalo de nuevo.');
        return;
      }
      finishPaymentStep();
      return;
    }

    if (!validateForm()) return;

    setIsSubmitting(true);
    setSubmitError('');

    updateData('paymentDetails', formData);
    const result = await saveBillingCard({
      cardNumber: formData.cardNumber,
      cardHolderName: formData.cardHolderName,
      expiryDate: formData.expiryDate,
      cvv: formData.cvv,
      billingMode: data.subscriptionSelection.billingMode,
      selectedPlanId: data.subscriptionSelection.recommendedPlanId,
    });

    setIsSubmitting(false);

    if (!result.success) {
      const msg = result.error || 'No se pudo guardar la tarjeta';
      if (/verificar tu email/i.test(msg) || /sesión|session|token/i.test(msg)) {
        setSubmitError(msg);
      } else {
        setErrors((prev) => ({ ...prev, cardNumber: msg }));
      }
      return;
    }

    finishPaymentStep();
  };

  const handleBack = () => {
    navigate('/auth/onboarding/recommendation');
  };

  const summaryLines = [
    `Plan ${orderSummary.plan.name}: ${orderSummary.pricing.baseCost}€`,
    orderSummary.pricing.extraPdv > 0
      ? `+${orderSummary.pricing.extraPdv} PDV: ${orderSummary.pricing.extraPdvCost}€`
      : null,
    orderSummary.pricing.extraBusinesses > 0
      ? `+${orderSummary.pricing.extraBusinesses} empresa(s): ${orderSummary.pricing.extraBusinessesCost}€`
      : null,
    orderSummary.pricing.extraBrands > 0
      ? `+${orderSummary.pricing.extraBrands} marca(s): ${orderSummary.pricing.extraBrandsCost}€`
      : null,
    orderSummary.pricing.extraUsers > 0
      ? `+${orderSummary.pricing.extraUsers} trabajador(es): ${orderSummary.pricing.extraUsersCost}€`
      : null,
  ].filter(Boolean);

  return (
    <OnboardingStepShell
      stepIndex={STEP_INDEX}
      maxWidth="max-w-2xl"
      footer={
        <div className="space-y-2.5">
          {!skipMonei ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
            <Shield className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="flex items-center gap-1.5">
              <Lock className="h-3 w-3" />
              Pago seguro · cifrado de nivel bancario
            </span>
          </div>
          ) : null}
          <div className="flex gap-3">
            <ACCESO__Button type="button" onClick={handleBack} variant="outline" fullWidth>
              ← Atrás
            </ACCESO__Button>
            <ACCESO__Button
              type="submit"
              form="payment-form"
              variant="primary"
              fullWidth
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Procesando...' : 'Continuar'}
            </ACCESO__Button>
          </div>
        </div>
      }
    >
      <OnboardingStepHeading
        compact
        stepLabel="Paso 6 · Pago"
        title={skipMonei ? 'Inicia tu prueba gratuita' : 'Información de pago'}
        subtitle={
          skipMonei
            ? 'Revisa tu plan y continúa para activar los 14 días de prueba.'
            : 'Datos de tarjeta. Trámite seguro y cifrado.'
        }
      />

      <form id="payment-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
        {submitError ? (
          <div
            className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100 flex gap-2"
            role="alert"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{submitError}</span>
          </div>
        ) : null}

        <div className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-[11px] leading-snug text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
          <p className="font-semibold">14 días de prueba gratuita</p>
          <p className="mt-0.5 text-blue-800/90 dark:text-blue-200/90">
            {skipMonei
              ? 'Empieza hoy sin coste. Al terminar la prueba podrás activar el cobro del plan.'
              : 'Guardamos tu tarjeta para el cobro automático al terminar la prueba. Hoy no se realiza ningún cargo.'}
          </p>
        </div>

        <OnboardingContentCard className="!p-3 sm:!p-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Resumen de tu suscripción</p>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                Plan {orderSummary.plan.name} ·{' '}
                {orderSummary.billingMode === 'monthly' ? 'cobro mensual' : 'cobro anual (−20%)'}
              </p>
            </div>
            <div className="shrink-0 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-left sm:text-right dark:border-gray-700 dark:bg-gray-900/50">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Cuota estimada
              </p>
              <p className="mt-0.5 flex items-baseline gap-1 tabular-nums">
                <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {orderSummary.pricing.total}
                </span>
                <span className="text-base font-bold text-gray-900 dark:text-gray-100">€</span>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">/mes</span>
              </p>
              {orderSummary.billingMode === 'annual' ? (
                <p className="mt-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                  {orderSummary.pricing.total * 12}€ al año
                </p>
              ) : null}
            </div>
          </div>
          {summaryLines.length > 0 ? (
            <ul className="space-y-1 text-[11px] leading-snug text-gray-600 dark:text-gray-400">
              {summaryLines.map((line) => (
                <li key={line} className="flex items-start gap-1.5">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400 dark:bg-gray-500" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-[10px] text-gray-500 dark:text-gray-500 leading-snug">
            {data.businessMetrics.businessCount ?? 1} empresa · {data.businessMetrics.locationCount} PDV ·{' '}
            {data.businessMetrics.userCount} trabajadores
            {(data.businessMetrics.commercialBrandCount ?? 0) > 0
              ? ` · ${data.businessMetrics.commercialBrandCount} marca(s) extra`
              : ''}
          </p>
        </OnboardingContentCard>

        {!skipMonei ? (
        <OnboardingContentCard className="!p-3 sm:!p-4 space-y-2.5">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-2 dark:border-gray-700">
            <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Tarjeta de crédito o débito</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-900 dark:text-gray-100">
              Número de tarjeta *
            </label>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="0000 0000 0000 0000"
                value={formData.cardNumber}
                onChange={handleCardNumberChange}
                className={`${inputClass(Boolean(errors.cardNumber))} pl-10`}
              />
            </div>
            {errors.cardNumber ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3 w-3" />
                {errors.cardNumber}
              </p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-900 dark:text-gray-100">Titular *</label>
            <input
              type="text"
              placeholder="Nombre del titular"
              value={formData.cardHolderName}
              onChange={(e) => {
                setFormData({ ...formData, cardHolderName: e.target.value.toUpperCase() });
                setErrors({ ...errors, cardHolderName: '' });
              }}
              className={inputClass(Boolean(errors.cardHolderName))}
            />
            {errors.cardHolderName ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3 w-3" />
                {errors.cardHolderName}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-900 dark:text-gray-100">Caducidad *</label>
              <input
                type="text"
                placeholder="MM/AA"
                value={formData.expiryDate}
                onChange={handleExpiryDateChange}
                className={inputClass(Boolean(errors.expiryDate))}
              />
              {errors.expiryDate ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="h-3 w-3" />
                  {errors.expiryDate}
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-900 dark:text-gray-100">CVV *</label>
              <input
                type="text"
                placeholder="CVV"
                value={formData.cvv}
                onChange={handleCvvChange}
                className={inputClass(Boolean(errors.cvv))}
              />
              {errors.cvv ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                  <AlertCircle className="h-3 w-3" />
                  {errors.cvv}
                </p>
              ) : null}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-2 dark:border-gray-700">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={formData.acceptTerms}
                onChange={(e) => {
                  setFormData({ ...formData, acceptTerms: e.target.checked });
                  setErrors({ ...errors, acceptTerms: '' });
                }}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-gray-300"
              />
              <span className="text-[11px] leading-snug text-gray-700 dark:text-gray-300">
                Confirmo los datos y autorizo guardar este método de pago. Entiendo que empiezo con 14 días de prueba
                gratuita y que el cobro del plan se hará al finalizar la prueba.
              </span>
            </label>
            {errors.acceptTerms ? (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3 w-3" />
                {errors.acceptTerms}
              </p>
            ) : null}
          </div>
        </OnboardingContentCard>
        ) : null}
      </form>
    </OnboardingStepShell>
  );
}
