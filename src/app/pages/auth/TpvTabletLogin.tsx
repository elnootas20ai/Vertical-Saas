import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useSearchParams } from 'react-router-dom';
import { Monitor, Store } from 'lucide-react';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../components/design-system/ACCESO__Input';
import { VertialLogo } from '../../components/VertialLogo';
import { AccesoSplitLayout } from '../../components/auth/AccesoSplitLayout';
import { useAuth } from '../../context/AuthContext';
import { useBusinessOptional } from '../../context/BusinessContext';
import { AUTH_PATHS } from '../../lib/authEntryPaths';
import { normalizeTpvTabletCode } from '../../lib/tpvTabletLoginUrl';
import { getRetailOpsUiCopy } from '../../lib/retailUiCopy';
import { writeDeliveryOpsSelectedPdvId } from '../../lib/deliveryOpsPdvSelection';
import { isBrowserOnline } from '../../lib/tpvTabletOffline';
import {
  readTpvTabletBinding,
  writeTpvTabletBinding,
  clearTpvTabletBinding,
  resolveTpvTabletWorkerPath,
} from '../../lib/tpvTabletSession';

export function TpvTabletLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { tpvTabletLogin } = useAuth();
  const businessCtx = useBusinessOptional();
  const binding = readTpvTabletBinding();
  const tabletCopy = getRetailOpsUiCopy(
    binding?.tpvVertical === 'restaurant' ? 'restaurant' : null,
  );

  const [terminalCode, setTerminalCode] = useState(() => {
    const fromQuery = searchParams.get('code') || searchParams.get('terminalCode');
    if (fromQuery) return normalizeTpvTabletCode(fromQuery);
    const fromState = (location.state as { terminalCode?: string } | null)?.terminalCode;
    if (fromState) return normalizeTpvTabletCode(fromState);
    return binding?.terminalCode || '';
  });
  const [errors, setErrors] = useState<{ terminalCode?: string; general?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [storeLabel, setStoreLabel] = useState(binding?.pdvName || binding?.businessName || '');

  const terminalRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => terminalRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, []);

  const performLogin = async (e?: FormEvent) => {
    e?.preventDefault();
    const code = terminalCode.trim().toUpperCase();
    const nextErrors: typeof errors = {};
    if (!code) nextErrors.terminalCode = `Introduce el ${tabletCopy.tabletCodeLabel.toLowerCase()}`;

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

    const result = await tpvTabletLogin(code, Boolean(binding));
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
        authUserId: String(user?.user_id || '').trim() || undefined,
        tpvVertical: terminalBinding.tpvVertical || 'delivery',
        salaTerminalId: terminalBinding.salaTerminalId,
        pdvName: pdv?.name,
        businessName: business?.name,
      });
      setStoreLabel(pdv?.name || business?.name || '');
    }

    if (business?.business_id && pdv) {
      const { seedRetailScopeCacheFromTabletLogin } = await import('../../lib/tabletLoginStoreSeed');
      seedRetailScopeCacheFromTabletLogin({
        businessId: business.business_id,
        pointOfSale: pdv,
        workCenterId: terminalBinding?.workCenterId,
        business,
        businesses: businessCtx?.businesses?.length
          ? businessCtx.businesses
          : business
            ? [business]
            : [],
      });
    }

    if (user?.user_id && business?.business_id) {
      try {
        localStorage.setItem(`vertial_current_business:${user.user_id}`, business.business_id);
      } catch {
        // ignore
      }
    }

    if (business?.business_id && terminalBinding?.dataUserId && terminalBinding.pdvId) {
      writeDeliveryOpsSelectedPdvId(
        business.business_id,
        terminalBinding.dataUserId,
        terminalBinding.pdvId,
      );
    }

    try {
      await businessCtx?.reloadBusinesses();
      if (business?.business_id) businessCtx?.switchBusiness(business.business_id);
    } catch {
      // El binding tablet ya fija empresa; seguir al TPV aunque falle el refresco global.
    }

    const dest =
      (typeof result.redirectTo === 'string' && result.redirectTo.startsWith('/saas/worker/tpv')
        ? result.redirectTo
        : null)
      || resolveTpvTabletWorkerPath();
    navigate(dest, { replace: true });
  };

  const handleTerminalKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void performLogin();
    }
  };

  const resetTerminal = () => {
    clearTpvTabletBinding();
    setTerminalCode('');
    setStoreLabel('');
    setErrors({});
  };

  const goBack = () => {
    clearTpvTabletBinding();
    navigate(AUTH_PATHS.entry, { replace: true });
  };

  return (
    <AccesoSplitLayout visualKey="login-company" scrollable onBack={goBack} backLabel="Volver">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-start px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:justify-center sm:p-6 sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:min-h-dvh lg:px-8">
        <div className="w-full max-w-md shrink-0">
          <div className="rounded-2xl border-2 border-gray-200 bg-white p-4 pb-3.5 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6 sm:pb-5">
            <div className="mb-4 text-center sm:mb-5">
              <div className="mb-3 hidden items-center justify-center sm:flex">
                <VertialLogo size="md" />
              </div>
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30">
                <Monitor className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="mb-2 inline-block rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                TPV tablet
              </span>
              <h1 className="mb-1 text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">
                Código de tienda
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {storeLabel
                  ? storeLabel
                  : binding
                    ? 'Introduce el código para entrar al TPV'
                    : `Activa la tablet con el código de tu ${tabletCopy.storeCountLabel}`}
              </p>
            </div>

            {errors.general ? (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {errors.general}
              </div>
            ) : null}

            <form onSubmit={performLogin} className="space-y-5">
              {binding ? (
                <div className="flex items-center justify-between px-1 text-xs text-gray-500 dark:text-gray-400">
                  <span>Tablet vinculada a esta tienda</span>
                  <button
                    type="button"
                    onClick={resetTerminal}
                    className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Otra tienda
                  </button>
                </div>
              ) : null}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {tabletCopy.tabletCodeLabel}
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
                  className="text-center font-mono text-lg uppercase tracking-widest"
                  icon={<Store className="h-4 w-4" />}
                />
                {errors.terminalCode ? (
                  <p className="mt-1 text-xs text-red-600">{errors.terminalCode}</p>
                ) : null}
              </div>
              <ACCESO__Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Entrando…' : 'Entrar al TPV'}
              </ACCESO__Button>
            </form>
          </div>

          <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
            ¿Eres trabajador?{' '}
            <button
              type="button"
              onClick={() => navigate(AUTH_PATHS.workerLogin)}
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Iniciar sesión
            </button>
          </p>
        </div>
      </div>
    </AccesoSplitLayout>
  );
}
