import { LogOut, Smartphone } from 'lucide-react';
import { IOS_SUPPORT_EMAIL, IOS_SUPPORT_URL } from '../../lib/appStoreCompliance';

type Props = {
  title?: string;
  onLogout?: () => void;
};

/**
 * Pantalla App Store: la app iOS no vende suscripciones.
 * Alta y cobro solo en la web; aquí solo login de clientes con plan.
 */
export function IosCustomerAccessOnlyScreen({
  title = 'App para clientes Vertial',
  onLogout,
}: Props) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 text-center space-y-5">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/20 flex items-center justify-center">
          <Smartphone className="w-7 h-7 text-emerald-300" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          <p className="mt-3 text-sm text-white/75 leading-relaxed">
            Esta app es para <span className="text-white font-medium">clientes con cuenta activa</span>.
            El alta de empresa y la suscripción se gestionan primero en la web
            ({' '}
            <span className="text-emerald-200">vertialapp.com</span>
            ), desde un ordenador o el navegador.
          </p>
          <p className="mt-3 text-sm text-white/65 leading-relaxed">
            Si ya tienes plan activo, cierra esta pantalla e inicia sesión con tu email.
            Si tu acceso está pendiente, tu administrador o el equipo Vertial lo activan en la web.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left text-xs text-white/70 space-y-1">
          <p>
            Soporte:{' '}
            <a className="text-emerald-300 underline underline-offset-2" href={`mailto:${IOS_SUPPORT_EMAIL}`}>
              {IOS_SUPPORT_EMAIL}
            </a>
          </p>
          <p>
            Web:{' '}
            <a
              className="text-emerald-300 underline underline-offset-2"
              href={IOS_SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              vertialapp.com
            </a>
            {' '}(información general, no checkout en la app)
          </p>
        </div>
        {onLogout ? (
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-white text-slate-900 font-semibold text-sm hover:bg-white/90"
          >
            <LogOut className="w-4 h-4" />
            Cerrar sesión / volver al login
          </button>
        ) : null}
      </div>
    </div>
  );
}
