import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useSearchParams } from 'react-router-dom';
import { Store } from 'lucide-react';
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
import { VERTIAL_BTN_PRIMARY, VERTIAL_BTN_SECONDARY } from '../../lib/vertialUiTokens';

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
  const [errors, setErrors] = useState<{ terminalCode?: string; general?: string; code?: string }>({});
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
      const code = String(result.code || '');
      let msg = result.error || 'No se pudo iniciar sesión';
      if (code === 'ACCOUNT_LOCKED') {
        msg = result.error || msg;
      }
      setErrors({ general: msg, code });
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
      <div className="flex min-h-0 flex-1 flex-col items-center justify-start px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:justify-center sm:p-6 sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:min-h-dvh lg:px-8">
        <div className="w-full max-w-md shrink-0">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-7">
            <div className="mb-6 text-center">
              <div className="mb-4 hidden items-center justify-center sm:flex">
                <VertialLogo size="md" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
                Tablet TPV
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-500 dark:text-stone-400">
                {storeLabel
                  ? storeLabel
                  : binding
                    ? 'Introduce el código para entrar al TPV'
                    : `Código de tu ${tabletCopy.storeCountLabel} (Ajustes → Tienda)`}
              </p>
            </div>

            {errors.general ? (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                {errors.general}
              </div>
            ) : null}

            <form onSubmit={performLogin} className="space-y-4">
              {binding ? (
                <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-950/50 dark:text-stone-300">
                  <span>Tablet vinculada</span>
                  <button
                    type="button"
                    onClick={resetTerminal}
                    className="font-semibold text-[var(--v-blue,#2563eb)] hover:underline"
                  >
                    Otra tienda
                  </button>
                </div>
              ) : null}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
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
                  className="text-center font-mono text-xl uppercase tracking-[0.28em]"
                  icon={<Store className="h-4 w-4" />}
                />
                {errors.terminalCode ? (
                  <p className="mt-1.5 text-xs text-rose-600">{errors.terminalCode}</p>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`${VERTIAL_BTN_PRIMARY} w-full`}
              >
                {isSubmitting ? 'Entrando…' : 'Entrar al TPV'}
              </button>

              <button
                type="button"
                onClick={() => navigate(AUTH_PATHS.workerLogin)}
                className={`${VERTIAL_BTN_SECONDARY} w-full !min-h-10 !text-sm`}
              >
                Soy trabajador — iniciar sesión
              </button>
            </form>
          </div>
        </div>
      </div>
    </AccesoSplitLayout>
  );
}
