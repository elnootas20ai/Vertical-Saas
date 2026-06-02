import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { CreditCard, Lock, Shield, AlertCircle } from 'lucide-react';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import { useAuth } from '../../../context/AuthContext';
import {
  OnboardingStepHeading,
  OnboardingStepShell,
} from '../../../components/auth/onboarding/OnboardingStepShell';
import { useOnboarding, ONBOARDING_ROUTES } from '../../../context/OnboardingContext';

const inputClass = (hasError: boolean) =>
  `w-full px-3 py-2 text-sm border-2 rounded-xl outline-none transition-colors ${
    hasError
      ? 'border-red-500 focus:border-red-500'
      : 'border-gray-200 dark:border-gray-700 focus:border-blue-500 bg-white dark:bg-gray-800'
  }`;

const STEP_INDEX = 5;

export function PaymentInfo() {
  const navigate = useNavigate();
  const { user, isInitializing, refreshCurrentUser, saveBillingCard } = useAuth();
  const { data, updateData, initializeTrial, advanceStep } = useOnboarding();

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

  // Formatear número de tarjeta (espacios cada 4 dígitos)
  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\s/g, '');
    const chunks = cleaned.match(/.{1,4}/g);
    return chunks ? chunks.join(' ') : cleaned;
  };

  // Formatear fecha de expiración (MM/YY)
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
      setSubmitError('Tu sesión ha caducado. Inicia sesión de nuevo para guardar la tarjeta.');
      navigate('/auth/login', { replace: true, state: { from: '/auth/onboarding/payment-info' } });
      return;
    }

    if (validateForm()) {
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
        if (/verificar tu email/i.test(msg)) {
          setSubmitError(msg);
        } else {
          setErrors((prev) => ({ ...prev, cardNumber: msg }));
        }
        return;
      }

      initializeTrial();
      advanceStep(STEP_INDEX);
      navigate('/auth/onboarding/confirmation');
    }
  };

  const handleBack = () => {
    navigate('/auth/onboarding/recommendation');
  };

  return (
    <OnboardingStepShell
      stepIndex={STEP_INDEX}
      maxWidth="max-w-2xl"
      footer={
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
            {isSubmitting ? 'Guardando...' : 'Continuar'}
          </ACCESO__Button>
        </div>
      }
    >
      <OnboardingStepHeading
        title="Información de pago"
        subtitle="Datos de tarjeta. Trámite seguro y cifrado."
      />

      <form
        id="payment-form"
        onSubmit={handleSubmit}
        className="flex-1 min-h-0 flex flex-col justify-center gap-2.5 overflow-hidden"
      >
        {submitError && (
          <div
            className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 flex gap-2"
            role="alert"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}
        <div className="shrink-0">
          <label className="block text-xs font-medium text-gray-900 dark:text-gray-100 mb-1">
            Número de tarjeta *
          </label>
          <div className="relative">
            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="0000 0000 0000 0000"
              value={formData.cardNumber}
              onChange={handleCardNumberChange}
              className={`${inputClass(Boolean(errors.cardNumber))} pl-10`}
            />
          </div>
              {errors.cardNumber && (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.cardNumber}
                </p>
              )}
        </div>

        <div className="shrink-0">
          <label className="block text-xs font-medium text-gray-900 dark:text-gray-100 mb-1">
            Titular *
          </label>
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
              {errors.cardHolderName && (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.cardHolderName}
                </p>
              )}
        </div>

        <div className="shrink-0 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-900 dark:text-gray-100 mb-1">
              Caducidad *
            </label>
            <input
              type="text"
              placeholder="MM/AA"
              value={formData.expiryDate}
              onChange={handleExpiryDateChange}
              className={inputClass(Boolean(errors.expiryDate))}
            />
                {errors.expiryDate && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.expiryDate}
                  </p>
                )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-900 dark:text-gray-100 mb-1">
              CVV *
            </label>
            <input
              type="text"
              placeholder="CVV"
              value={formData.cvv}
              onChange={handleCvvChange}
              className={inputClass(Boolean(errors.cvv))}
            />
                {errors.cvv && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.cvv}
                  </p>
                )}
          </div>
        </div>

        <div className="shrink-0 pt-1 border-t border-gray-200 dark:border-gray-700">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.acceptTerms}
              onChange={(e) => {
                setFormData({ ...formData, acceptTerms: e.target.checked });
                setErrors({ ...errors, acceptTerms: '' });
              }}
              className="mt-0.5 w-4 h-4 border-2 border-gray-300 rounded shrink-0"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300 leading-snug">
              Confirmo los datos y autorizo guardar este método de pago según los términos aplicables.
            </span>
          </label>
              {errors.acceptTerms && (
                <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.acceptTerms}
                </p>
              )}
        </div>

        <div className="shrink-0 flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
          <Shield className="w-4 h-4 text-green-600 shrink-0" />
          <span className="flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Pago seguro · cifrado de nivel bancario
          </span>
        </div>
      </form>
    </OnboardingStepShell>
  );
}
