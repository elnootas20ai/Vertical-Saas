import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { CreditCard, Lock, Shield, AlertCircle } from 'lucide-react';
import { ACCESO__Button } from '../../../components/design-system/ACCESO__Button';
import { ACCESO__Stepper } from '../../../components/design-system/ACCESO__Stepper';
import { useAuth } from '../../../context/AuthContext';
import { useOnboarding, ONBOARDING_STEPS, ONBOARDING_ROUTES } from '../../../context/OnboardingContext';

const STEP_INDEX = 5;

export function PaymentInfo() {
  const navigate = useNavigate();
  const { saveBillingCard } = useAuth();
  const { data, updateData, initializeTrial, advanceStep } = useOnboarding();

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

  const [errors, setErrors] = useState<Record<string, string>>({});
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

    if (validateForm()) {
      setIsSubmitting(true);

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
        setErrors((prev) => ({
          ...prev,
          cardNumber: result.error || 'No se pudo guardar la tarjeta',
        }));
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
    <div className="h-screen bg-gray-50 dark:bg-gray-800 flex flex-col overflow-hidden">
      {/* Stepper sticky arriba */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 pt-6 pb-2 shrink-0">
        <div className="w-full max-w-2xl mx-auto">
          <ACCESO__Stepper
            steps={[...ONBOARDING_STEPS]}
            currentStep={STEP_INDEX}
            onStepClick={(i) => {
              if (i !== STEP_INDEX) navigate(ONBOARDING_ROUTES[i]);
            }}
          />
        </div>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="w-full max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              Información de pago
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Introduce los datos de la tarjeta. El trámite se realiza de forma segura.
            </p>
          </div>

          <form id="payment-form" onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Número de tarjeta *
              </label>
              <div className="relative">
                <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="0000 0000 0000 0000"
                  value={formData.cardNumber}
                  onChange={handleCardNumberChange}
                  className={`w-full pl-12 pr-4 py-3 border-2 rounded-xl outline-none transition-colors ${
                    errors.cardNumber
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 dark:border-gray-700 focus:border-blue-500'
                  }`}
                />
              </div>
              {errors.cardNumber && (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.cardNumber}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Titular de la tarjeta *
              </label>
              <input
                type="text"
                placeholder="Nombre del titular"
                  value={formData.cardHolderName}
                onChange={(e) => {
                  setFormData({ ...formData, cardHolderName: e.target.value.toUpperCase() });
                  setErrors({ ...errors, cardHolderName: '' });
                }}
                className={`w-full px-4 py-3 border-2 rounded-xl outline-none transition-colors ${
                  errors.cardHolderName
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-gray-200 dark:border-gray-700 focus:border-blue-500'
                }`}
              />
              {errors.cardHolderName && (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.cardHolderName}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Fecha de expiración *
                </label>
                <input
                  type="text"
                  placeholder="MM/AA"
                  value={formData.expiryDate}
                  onChange={handleExpiryDateChange}
                  className={`w-full px-4 py-3 border-2 rounded-xl outline-none transition-colors ${
                    errors.expiryDate
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 dark:border-gray-700 focus:border-blue-500'
                  }`}
                />
                {errors.expiryDate && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.expiryDate}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  CVV *
                </label>
                <input
                  type="text"
                  placeholder="CVV"
                  value={formData.cvv}
                  onChange={handleCvvChange}
                  className={`w-full px-4 py-3 border-2 rounded-xl outline-none transition-colors ${
                    errors.cvv
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-gray-200 dark:border-gray-700 focus:border-blue-500'
                  }`}
                />
                {errors.cvv && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.cvv}
                  </p>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={formData.acceptTerms}
                  onChange={(e) => {
                    setFormData({ ...formData, acceptTerms: e.target.checked });
                    setErrors({ ...errors, acceptTerms: '' });
                  }}
                  className="mt-1 w-4 h-4 border-2 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Confirmo que los datos son correctos y autorizo guardar este método de pago conforme a los términos aplicables.
                </span>
              </label>
              {errors.acceptTerms && (
                <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.acceptTerms}
                </p>
              )}
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" />
                  Pago seguro
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Tus datos están protegidos con encriptación de nivel bancario
                </p>
              </div>
            </div>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Al continuar, aceptas nuestros{' '}
              <a href="#" className="text-blue-600 hover:underline">Términos de Servicio</a>
              {' '}y{' '}
              <a href="#" className="text-blue-600 hover:underline">Política de Privacidad</a>
            </p>
          </div>
        </div>
      </div>

      {/* Botones sticky abajo */}
      <div className="sticky bottom-0 z-20 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-4 shrink-0">
        <div className="w-full max-w-2xl mx-auto flex gap-3">
          <ACCESO__Button
            type="button"
            onClick={handleBack}
            variant="outline"
            fullWidth
          >
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
      </div>
    </div>
  );
}
