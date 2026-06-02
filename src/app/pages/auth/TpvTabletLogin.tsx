import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, KeyRound, Monitor, Store } from 'lucide-react';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../components/design-system/ACCESO__Input';
import { VertialLogo } from '../../components/VertialLogo';
import { useAuth } from '../../context/AuthContext';
import { useBusiness } from '../../context/BusinessContext';
import { AUTH_PATHS } from '../../lib/authEntryPaths';
import { clockIn } from '../../lib/clockinsApi';
import { writeDeliveryOpsSelectedPdvId } from '../../lib/deliveryOpsPdvSelection';
import { enqueueTpvOfflineItem, isBrowserOnline } from '../../lib/tpvTabletOffline';
import { readTpvTabletBinding, writeTpvTabletBinding, clearTpvTabletBinding } from '../../lib/tpvTabletSession';

type Step = 'terminal' | 'pin';

export function TpvTabletLogin() {
  const navigate = useNavigate();
  const { tpvTabletLogin } = useAuth();
  const { switchBusiness, reloadBusinesses } = useBusiness();
  const binding = readTpvTabletBinding();

  const [step, setStep] = useState<Step>(binding ? 'pin' : 'terminal');
  const [terminalCode, setTerminalCode] = useState(binding?.terminalCode || '');
  const [pin, setPin] = useState('');
  const [errors, setErrors] = useState<{ terminalCode?: string; pin?: string; general?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [storeLabel, setStoreLabel] = useState(binding?.pdvName || binding?.businessName || '');

  const pinRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'pin') {
      setTimeout(() => pinRef.current?.focus(), 80);
    } else {
      setTimeout(() => terminalRef.current?.focus(), 80);
    }
  }, [step]);

  const handleTerminalNext = () => {
    if (!terminalCode.trim()) {
      setErrors({ terminalCode: 'Introduce el código de la tienda' });
      return;
    }
    setErrors({});
    setStep('pin');
  };

  const handleTerminalKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTerminalNext();
    }
  };

  const performLogin = async (e: FormEvent) => {
    e.preventDefault();
    const code = terminalCode.trim().toUpperCase();
    const nextErrors: typeof errors = {};
    if (!code) nextErrors.terminalCode = 'Código de tienda obligatorio';
    if (!/^\d{4,6}$/.test(pin.trim())) nextErrors.pin = 'PIN de 4–6 dígitos';

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    if (!isBrowserOnline() && !binding) {
      setErrors({ general: 'La primera activación requiere conexión a internet.' });
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    const result = await tpvTabletLogin(code, pin.trim(), Boolean(binding));
    setIsSubmitting(false);

    if (!result.success) {
      setErrors({ general: result.error || 'No se pudo iniciar sesión' });
      return;
    }

    const user = result.user;
    const business = result.business;
    const terminalBinding = result.terminalBinding;
    const pdv = result.pointOfSale;

    if (terminalBinding) {
      writeTpvTabletBinding({
        terminalCode: terminalBinding.terminalCode,
        pdvId: terminalBinding.pdvId,
        workCenterId: terminalBinding.workCenterId,
        businessId: terminalBinding.businessId,
        dataUserId: terminalBinding.dataUserId,
        pdvName: pdv?.name,
        businessName: business?.name,
      });
      setStoreLabel(pdv?.name || business?.name || '');
    }

    if (user?.user_id && business?.business_id) {
      try {
        localStorage.setItem(`vertial_current_business:${user.user_id}`, business.business_id);
      } catch {
        // ignore
      }
      switchBusiness(business.business_id);
      void reloadBusinesses();
    }

    if (business?.business_id && terminalBinding?.dataUserId && terminalBinding.pdvId) {
      writeDeliveryOpsSelectedPdvId(
        business.business_id,
        terminalBinding.dataUserId,
        terminalBinding.pdvId,
      );
    }

    if (user && business?.business_id && result.needsClockIn !== false) {
      try {
        if (isBrowserOnline()) {
          await clockIn(business.business_id, user.user_id, user.fullName || user.email || '', {
            device_type: 'tablet',
          });
        } else {
          enqueueTpvOfflineItem('clock_in', {
            businessId: business.business_id,
            memberId: user.user_id,
            memberName: user.fullName || user.email || '',
          });
        }
      } catch {
        /* fichaje activo u offline: continuar al TPV */
      }
    }

    navigate(result.redirectTo || '/saas/worker/tpv');
  };

  const resetTerminal = () => {
    clearTpvTabletBinding();
    setStep('terminal');
    setTerminalCode('');
    setPin('');
    setStoreLabel('');
    setErrors({});
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <VertialLogo className="h-10 brightness-0 invert" />
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 border border-white/10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <Monitor className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">TPV Tablet</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {step === 'pin' && storeLabel
                  ? storeLabel
                  : binding
                    ? 'Cambio de trabajador — introduce tu PIN'
                    : 'Activa la tablet de esta tienda (solo la primera vez pide el código)'}
              </p>
            </div>
          </div>

          {errors.general && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm">
              {errors.general}
            </div>
          )}

          <form onSubmit={performLogin} className="space-y-5">
            {step === 'terminal' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Código de tienda
                  </label>
                  <ACCESO__Input
                    ref={terminalRef}
                    value={terminalCode}
                    onChange={(e) => {
                      setTerminalCode(e.target.value.toUpperCase());
                      setErrors((prev) => ({ ...prev, terminalCode: undefined, general: undefined }));
                    }}
                    onKeyDown={handleTerminalKeyDown}
                    placeholder="Ej. ABC123"
                    autoComplete="off"
                    autoCapitalize="characters"
                    className="font-mono uppercase tracking-widest text-center text-lg"
                    icon={<Store className="w-4 h-4" />}
                  />
                  {errors.terminalCode && (
                    <p className="mt-1 text-xs text-red-600">{errors.terminalCode}</p>
                  )}
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Lo encuentras en Ajustes → Tiendas, en la tienda que quieres activar.
                  </p>
                </div>
                <ACCESO__Button
                  type="button"
                  onClick={handleTerminalNext}
                  className="w-full"
                  icon="next"
                >
                  Continuar
                </ACCESO__Button>
              </>
            ) : (
              <>
                {!binding && (
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
                    <span className="font-mono tracking-wider">{terminalCode}</span>
                    <button type="button" onClick={resetTerminal} className="text-indigo-600 hover:underline">
                      Cambiar tienda
                    </button>
                  </div>
                )}
                {binding && (
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
                    <span className="font-mono tracking-wider">{binding.terminalCode}</span>
                    <button type="button" onClick={resetTerminal} className="text-indigo-600 hover:underline">
                      Otra tienda
                    </button>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    PIN del trabajador
                  </label>
                  <ACCESO__Input
                    ref={pinRef}
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={pin}
                    onChange={(e) => {
                      setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                      setErrors((prev) => ({ ...prev, pin: undefined, general: undefined }));
                    }}
                    placeholder="••••"
                    autoComplete="off"
                    className="font-mono text-center text-2xl tracking-[0.4em]"
                    icon={<KeyRound className="w-4 h-4" />}
                  />
                  {errors.pin && <p className="mt-1 text-xs text-red-600">{errors.pin}</p>}
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Al entrar se registra tu fichaje de entrada y se abre el TPV de este local.
                  </p>
                </div>
                <ACCESO__Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Entrando…' : binding ? 'Cambiar trabajador' : 'Activar TPV'}
                </ACCESO__Button>
              </>
            )}
          </form>
        </div>

        <button
          type="button"
          onClick={() => navigate(AUTH_PATHS.entry)}
          className="mt-6 mx-auto flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al acceso
        </button>
      </div>
    </div>
  );
}
