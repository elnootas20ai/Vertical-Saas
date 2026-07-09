import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Monitor, Store } from 'lucide-react';
import { ACCESO__Button } from '../../components/design-system/ACCESO__Button';
import { ACCESO__Input } from '../../components/design-system/ACCESO__Input';
import { VertialLogo } from '../../components/VertialLogo';
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

    navigate(resolveTpvTabletWorkerPath(), { replace: true });
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
                {storeLabel
                  ? storeLabel
                  : binding
                    ? 'Introduce el código para entrar al TPV'
                    : `Activa la tablet con el código de tu ${tabletCopy.storeCountLabel}`}
              </p>
            </div>
          </div>

          {errors.general && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm">
              {errors.general}
            </div>
          )}

          <form onSubmit={performLogin} className="space-y-5">
            {binding && (
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
                <span>Tablet vinculada a esta tienda</span>
                <button type="button" onClick={resetTerminal} className="text-indigo-600 hover:underline">
                  Otra tienda
                </button>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
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
                className="font-mono uppercase tracking-widest text-center text-lg"
                icon={<Store className="w-4 h-4" />}
              />
              {errors.terminalCode && (
                <p className="mt-1 text-xs text-red-600">{errors.terminalCode}</p>
              )}
            </div>
            <ACCESO__Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Entrando…' : 'Entrar al TPV'}
            </ACCESO__Button>
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
